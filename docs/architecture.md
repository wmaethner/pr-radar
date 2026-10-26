# Architecture and platform notes

For the module map, classification rules and known gaps, see [CLAUDE.md](../CLAUDE.md). This doc covers how the app runs, how it is built, and what is platform-specific.

## How it runs

The app is a Tauri v2 desktop app: two halves in one process tree.

- **Frontend**: React and TypeScript, bundled by Vite into static files (`dist/`). It runs in the OS's native webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux), not a bundled Chromium.
- **Backend**: a small Rust program (`src-tauri/src/lib.rs`) that owns the window and exposes commands the frontend calls with `invoke`: `gh_graphql`, `gh_accounts`, `az_rest`, `load_config`, `save_config`. It contains no GitHub or ADO logic. It spawns the `gh` and `az` CLIs and returns their output.

All product logic (fetching, classifying, polling, rendering) is TypeScript. `npm run tauri dev` serves the frontend from Vite on port 1420 with hot reload and compiles the Rust side.

## Authentication

Nothing in the app stores credentials.

- **GitHub** uses the `gh` CLI's login. For a non-default account, Rust reads that account's token with `gh auth token --user` and passes it as `GH_TOKEN` for a single request.
- **Azure DevOps** uses the `az` CLI's login via `az rest --resource <ADO_RESOURCE>`. `ADO_RESOURCE` is the public, well-known Entra application ID of the Azure DevOps service, identical for every organization and tenant. `az rest` needs it because it doesn't recognize `dev.azure.com` on its own. Only `dev.azure.com` URLs are accepted, so the token can't be sent elsewhere.

## ADO URL forms

`parseAdoRepo` (`src/ado/repo.ts`) accepts `https://dev.azure.com/{org}/{project}/_git/{repo}` and the legacy `https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}`. `DefaultCollection` is a leftover from on-premises TFS, where a collection grouped many projects. Cloud organizations are effectively one collection, so the segment is redundant and is dropped. On-premises Azure DevOps Server hosts and SSH remotes are not supported.

## Building a release

`npm run tauri build` runs `npm run build`, compiles Rust in release mode and produces an installer for the platform it runs on. With `"targets": "all"` that is a `.app` and `.dmg` on macOS and `.msi` and NSIS `.exe` installers on Windows. The built app needs no Node or dev server. Config lives in the Tauri app config dir as `config.json`.

Releases are built by CI on a version tag and installed copies self-update; see [releasing.md](./releasing.md). Windows builds, and Apple code signing and notarization, are not set up yet.

Each machine needs `gh` (and `az` for ADO) installed and logged in. Neither is bundled, by design.

## Platform support

Developed and used on macOS. Windows support is implemented but has only been compiled in CI, not run on a Windows machine yet. Linux is not supported.

Portable as-is: the React UI, `classify.ts`, the GitHub and ADO clients, config storage (Tauri resolves the right directory per OS) and the link opener.

Platform-specific code (all in `src-tauri/src/lib.rs` and `src/badge.ts`):

- **Finding `gh` and `az`.** macOS GUI apps don't inherit the shell PATH, so `bin_path` searches `/opt/homebrew/bin`, `/usr/local/bin` and `/usr/bin`. Windows GUI apps do inherit PATH, so `gh.exe` resolves by name, with `%ProgramFiles%\GitHub CLI` and `%LOCALAPPDATA%\Programs\GitHub CLI` checked first.
- **Running `az` on Windows.** `az` is a `.cmd` wrapper, which Rust can't spawn reliably with arbitrary arguments (cmd.exe quoting of `&`, `%` and so on, and our URLs contain `&`). `az_command` runs the Azure CLI's bundled `python.exe -IBm azure.cli` from `%ProgramFiles%\Microsoft SDKs\Azure\CLI2` instead, the same thing the wrapper does, and falls back to `az.cmd` on PATH (for example a pip install).
- **No console flash.** Every child process starts with `CREATE_NO_WINDOW` on Windows (`command()`), otherwise a console window would pop up on every `gh` or `az` call.
- **Badge.** macOS shows the Dock badge count. Windows has no equivalent, so `setActionBadge` draws the count on a canvas and sets it as the taskbar overlay icon. This needs the `image-png` Tauri feature and the `core:window:allow-set-overlay-icon` permission.

On Windows each machine needs `gh` and optionally `az` installed and logged in, for example `winget install GitHub.cli` and `winget install Microsoft.AzureCLI`. Build prerequisites are the MSVC build tools and WebView2 (preinstalled on Windows 11, bootstrapped by the installer on Windows 10).

Not verified on a real Windows machine: the `az` Python path, the overlay icon rendering and the updater's install flow. CI's `build` job (macOS and Windows) only checks that it compiles.
