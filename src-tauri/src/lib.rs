use std::{
    ffi::OsStr,
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
};
use tauri::Manager;

/// A command that doesn't flash a console window when started from the GUI on Windows.
fn command(program: impl AsRef<OsStr>) -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new(program);
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        cmd
    }
    #[cfg(not(windows))]
    Command::new(program)
}

/// GUI apps on macOS do not inherit the shell PATH, so look in common install dirs.
#[cfg(not(windows))]
fn bin_path(name: &str) -> PathBuf {
    for dir in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        let p = PathBuf::from(dir).join(name);
        if p.exists() {
            return p;
        }
    }
    PathBuf::from(name)
}

/// Windows GUI apps do inherit PATH, so the bare name usually resolves. The default install
/// dirs are checked first for installs whose PATH change hasn't reached this process yet.
#[cfg(windows)]
fn bin_path(name: &str) -> PathBuf {
    let candidates = [
        ("ProgramFiles", r"GitHub CLI"),
        ("LOCALAPPDATA", r"Programs\GitHub CLI"),
    ];
    for (var, dir) in candidates {
        if let Some(root) = std::env::var_os(var) {
            let p = PathBuf::from(root).join(dir).join(format!("{name}.exe"));
            if p.exists() {
                return p;
            }
        }
    }
    PathBuf::from(name)
}

/// The base `az` invocation. macOS: the binary from `bin_path`. Windows: `az` is a `.cmd`
/// wrapper, which can't be spawned reliably with arbitrary arguments (cmd.exe quoting of `&`,
/// `%` and so on), so run the Azure CLI's bundled Python the way the wrapper does.
#[cfg(not(windows))]
fn az_command() -> Command {
    command(bin_path("az"))
}

#[cfg(windows)]
fn az_command() -> Command {
    for var in ["ProgramFiles", "ProgramFiles(x86)"] {
        if let Some(root) = std::env::var_os(var) {
            let python = PathBuf::from(root).join(r"Microsoft SDKs\Azure\CLI2\python.exe");
            if python.exists() {
                let mut cmd = command(python);
                cmd.args(["-IBm", "azure.cli"]);
                return cmd;
            }
        }
    }
    command("az.cmd") // e.g. a pip install of the Azure CLI
}

fn gh_path() -> PathBuf {
    bin_path("gh")
}

/// Token for a specific logged-in account, so we can act as that account
/// without changing which account is active for the user's own `gh` CLI.
fn token_for(user: &str) -> Result<String, String> {
    let out = command(gh_path())
        .args(["auth", "token", "--hostname", "github.com", "--user", user])
        .output()
        .map_err(|e| format!("could not run gh: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Run a GraphQL request through the `gh` CLI, reusing its login. `body` is the
/// JSON `{ "query": ..., "variables": ... }`. When `account` is set, the request
/// is made as that account instead of the active one. Returns the raw JSON response.
#[tauri::command]
fn gh_graphql(body: String, account: Option<String>) -> Result<String, String> {
    let mut cmd = command(gh_path());
    cmd.args(["api", "graphql", "--input", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(user) = account.filter(|u| !u.is_empty()) {
        cmd.env("GH_TOKEN", token_for(&user)?);
    }
    let mut child = cmd.spawn().map_err(|e| format!("could not run gh: {e}"))?;
    child
        .stdin
        .take()
        .ok_or("no stdin")?
        .write_all(body.as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Audience of Azure DevOps tokens: the well-known, public Microsoft Entra application ID of
/// the Azure DevOps service. It is the same for every organization and tenant, not a secret.
/// `az rest` needs it via `--resource` because it doesn't recognize dev.azure.com on its own.
/// See https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/service-principal-managed-identity
const ADO_RESOURCE: &str = "499b84ac-1321-427f-aa17-267ca6975798";

/// GET an Azure DevOps REST URL through the `az` CLI, reusing its login. Returns the
/// raw response body. Only dev.azure.com URLs are accepted so the token can't be sent elsewhere.
#[tauri::command(async)]
fn az_rest(url: String) -> Result<String, String> {
    if !url.starts_with("https://dev.azure.com/") {
        return Err("refusing to call a non-Azure DevOps URL".into());
    }
    let out = az_command()
        .args(["rest", "--method", "get", "--resource", ADO_RESOURCE, "--url", &url, "--output", "json"])
        .output()
        .map_err(|e| format!("could not run az (is the Azure CLI installed?): {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Raw JSON from `gh auth status --json hosts`. `gh` exits non-zero when any
/// account has problems but still prints the JSON, so stdout is used regardless.
#[tauri::command]
fn gh_accounts() -> Result<String, String> {
    let out = command(gh_path())
        .args(["auth", "status", "--json", "hosts"])
        .output()
        .map_err(|e| format!("could not run gh: {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if stdout.is_empty() {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    } else {
        Ok(stdout)
    }
}

/// Debug builds (`tauri dev`) use their own file so development never touches the installed app's settings.
const CONFIG_NAME: &str = if cfg!(debug_assertions) { "config.dev.json" } else { "config.json" };

fn config_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(CONFIG_NAME))
}

/// Returns the stored config JSON, or "" when none exists yet.
#[tauri::command]
fn load_config(app: tauri::AppHandle) -> Result<String, String> {
    let path = config_file(&app)?;
    if !path.exists() {
        return Ok(String::new());
    }
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, json: String) -> Result<(), String> {
    fs::write(config_file(&app)?, json).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![gh_graphql, gh_accounts, az_rest, load_config, save_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
