# PR Radar

A desktop app that shows which GitHub pull requests need your attention. Add the repos you care about and PR Radar sorts every open PR you're involved in, as author or reviewer, into three groups:

- **Needs your action** – CI failing, unresolved review threads, changes requested, new comments, a review or re-review requested, replies to your comments, new commits since your review
- **Ready to merge** – your PRs that are approved
- **Waiting on others** – drafts, PRs waiting on reviewers, or PRs where the author has the next move

Built with [Tauri](https://tauri.app/) v2, React and TypeScript.

## Install

Download the installer for your system from the [latest release](https://github.com/wmaethner/pr-radar/releases/latest). Either way, you also need the GitHub CLI signed in (see [Sign in](#sign-in)).

### macOS

1. Download the `.dmg` that matches your Mac: `pr-radar_<version>_aarch64.dmg` for Apple Silicon (M1 and later) or `pr-radar_<version>_x64.dmg` for Intel. If you're not sure, choose Apple menu, About This Mac: "Chip" shows Apple M-something or Intel.
2. Open the `.dmg` and drag **pr-radar** into **Applications**.
3. The app isn't signed with an Apple Developer ID yet, so macOS will refuse to open a browser download and say **"pr-radar is damaged and can't be opened"**. The file is fine. Clear the download quarantine flag once in Terminal, then open it normally:
   ```sh
   xattr -cr /Applications/pr-radar.app
   ```
   If that prints "Operation not permitted", go to System Settings, Privacy & Security, App Management, allow Terminal, and run it again.

### Windows

1. Download `pr-radar_<version>_x64-setup.exe` (or the `.msi` if you prefer an MSI) and run it.
2. The installer isn't code-signed yet, so Windows SmartScreen may show **"Windows protected your PC"**. Click **More info**, then **Run anyway**.
3. The app needs Microsoft Edge WebView2. It's already part of Windows 11, and the installer sets it up on Windows 10.

Windows support is new and has had less testing than macOS. If something doesn't work, please [open an issue](https://github.com/wmaethner/pr-radar/issues).

### Sign in

PR Radar uses the command-line tools you're already signed in with, so it never stores a token.

- **GitHub:** install the [GitHub CLI](https://cli.github.com/) (`brew install gh` on macOS, `winget install GitHub.cli` on Windows) and run `gh auth login`. If you're signed in to several accounts, pick one from the account dropdown in the header; this doesn't change the active account in your terminal.
- **Azure DevOps (optional):** see [Azure DevOps](#azure-devops).

### Updates

Installed copies check for a new release when the app starts. If one exists, a banner at the top shows **Update and restart**. You don't need to download anything again.

## Using the app

Switch between the **Needs action**, **Ready to merge**, **Waiting** and **Snoozed** tabs (each shows a count). Hover a PR in *Needs action* and click the 💤 button to move it to *Snoozed* for 24 hours; it returns to whichever tab it belongs in when the time is up, or sooner with **Unsnooze**, and click a repo heading within a tab to collapse it. Click **Repos**, add repos as `owner/name` or a GitHub URL, and the app fetches your PRs. It refreshes every 5 minutes, or on demand with **Refresh**.

## Building from source

Only needed if you want to develop PR Radar. You need:

- [Node.js](https://nodejs.org/) and npm
- [Rust toolchain](https://www.rust-lang.org/tools/install) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
- The GitHub CLI, signed in (see above)

```sh
npm install
npm run tauri dev
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run tauri dev` | Run the full desktop app with hot reload |
| `npm run tauri build` | Build a release bundle |
| `npm run dev` | Frontend only (GitHub and config calls need the Tauri shell) |
| `npm test` | Run the unit tests |
| `npm run build` | Type-check and build the frontend |

## Configuration

Settings are stored as `config.json` in the app's config directory:

```json
{ "repos": ["owner/name"], "pollMinutes": 5, "tab": "action", "snoozed": {}, "collapsed": [], "account": null }
```

`tab` is the selected tab (`"action"`, `"ready"`, `"waiting"` or `"snoozed"`), `snoozed` maps PR URLs to the time their snooze ends, and `collapsed` lists the repo groups you've collapsed; all three are set from the UI. `account` is the `gh` login to use (`null` means the active one) and is set from the header dropdown. `pollMinutes` has no UI yet, so edit the file to change the refresh interval.

## Azure DevOps

PR Radar can also track Azure DevOps repos. Install the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/) (`az`; on Windows `winget install Microsoft.AzureCLI`), run `az login`, then add a repo from its URL, for example `https://dev.azure.com/{org}/{project}/_git/{repo}` or the older `https://{org}.visualstudio.com/{project}/_git/{repo}`. The account dropdown only applies to GitHub.

## Project layout

See [CLAUDE.md](./CLAUDE.md) for the module map, design decisions and known gaps, and [docs/architecture.md](./docs/architecture.md) for how the app runs, how to build a release, and what is macOS-specific.
