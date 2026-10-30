# PR Radar

Desktop app (Tauri v2 + React 19 + TypeScript, Vite) that shows which GitHub PRs need the user's attention. It reads open PRs from a user-chosen list of repos and sorts each into a bucket:

- **action** – "Needs your action"
- **ready** – "Ready to merge"
- **waiting** – "Waiting on others"

The goal is a single glanceable view of "what do I need to do on PRs right now", for PRs the user authored or is reviewing.

## Commands

- `npm run tauri dev` – run the full app (needs Rust toolchain and `gh` logged in)
- `npm run dev` – frontend only (Tauri `invoke` calls will fail outside the Tauri shell)
- `npm test` – vitest (currently only `src/state/classify.test.ts`)
- `npm run build` – `tsc` + `vite build`

## Architecture

```
src-tauri/src/lib.rs   Rust commands: gh_graphql, gh_auth_status, az_rest, az_health, load_config, save_config, config_path
src/github/accounts.ts Lists logged-in gh accounts; ghAuthStatus() shares one gh_auth_status run between the picker and the Sign-in panel, and onAccounts() keeps the picker current
src/github/health.ts   Pure parseGhHealth(): gh install + per-account token state -> Health
src/ado/health.ts      Pure parseAzHealth(): az install + login state -> Health
src/Health.tsx         Sign-in panel in the settings popover; useHealth() runs each provider check
src/providers/         Provider interface + registry: fetchAll(), parseAnyRepo(), repoDisplay(); one runner for fan-out/errors
src/github/provider.ts GitHub Provider (key "owner/name"); client.ts has the GraphQL query + fetchRepo()
src/github/types.ts    PullRequest, Classified, Bucket and related types (shared by GitHub and ADO)
src/ado/repo.ts        ADO repo keys ("ado:org/project/repo"), parseAdoRepo() for URLs
src/ado/provider.ts    Azure DevOps Provider (key "ado:org/project/repo")
src/ado/client.ts      Azure DevOps REST via az_rest; maps votes/threads/iterations to PullRequest
src/state/classify.ts  Pure logic: classify(pr, me) -> Classified | null
src/state/backlog.ts   Pure backlog logic: PRs needing a reviewer, issue assignment (separate from classify)
src/state/snooze.ts    Pure snooze helpers (expiry, pruning, time left)
src/store/config.ts    Config (repos, pollMinutes, tab, snoozed, collapsed, account) load/save
src/Backlog.tsx        Backlog view: PRs needing review (with assigned reviewers) and open issues, grouped by repo
src/Settings.tsx       Gear popover in the header: account, refresh interval, add/remove repos, version
src/ui.tsx             Small shared UI helpers (ago, RepoName, labelOf)
src/App.tsx            UI, polling, repo filter, status tabs with per-repo collapsible groups, repo management
```

Data flow: `App` polls -> `fetchAll` (`src/providers`) looks up each repo key's `Provider` and runs `provider.fetchRepo` for all repos in parallel (GitHub: one GraphQL query; ADO: `az` REST calls), turning a throw into `RepoResult.error` and calling `onResult` as each repo finishes so `App` shows that repo's PRs immediately while the others load (header shows progress and the repos still pending) -> `classify` each PR for that repo's `RepoResult.me` -> render grouped by bucket, newest-updated first.

To add a code host, implement `Provider` (`src/providers/types.ts`) in its own folder and add it to `providers` in `src/providers/index.ts`. Keys must be owned by exactly one provider; `providers.test.ts` checks the contract.

### Key decisions

- **Auth goes through the `gh` CLI**, not tokens. Rust spawns `gh api graphql --input -` and returns the raw JSON. The app never stores credentials.
- **Multiple `gh` accounts**: the header dropdown picks which logged-in account to use (`Config.account`, null = gh's active account). Rust fetches that account's token with `gh auth token --user` and passes it as `GH_TOKEN` for that request only; it never runs `gh auth switch`, so the user's CLI state is untouched.
- **Azure DevOps goes through the `az` CLI**, same idea as `gh`: repos are stored as `ado:org/project/repo` in `Config.repos`, and Rust's `az_rest` runs `az rest --resource <ADO> --url ...` (dev.azure.com URLs only). Needs `az login`; the account picker is GitHub-only. ADO votes have no timestamps, so reviews are dated from the "voted" system threads. Only PRs the user authored or is a listed reviewer on are fetched in detail (threads, iterations, CI) to keep `az` process counts down. Written without access to a live ADO org: verify against a real one.
- **`gh` and `az` lookup is per platform** (see `docs/architecture.md`): on macOS fixed paths (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`) because GUI apps don't inherit the shell PATH; on Windows PATH plus the default install dirs, `az` run via the Azure CLI's bundled Python (the `.cmd` wrapper can't take arbitrary args), and every child process started with `CREATE_NO_WINDOW`. Windows support has only been compiled in CI, not run on a real machine.
- **Config** is JSON in the Tauri app config dir (`config.json`; `config.dev.json` in debug builds so `tauri dev` is isolated from an installed app), read and written via Rust commands.
- **`classify.ts` is pure** (no I/O) and is where the product behavior lives. Authored PRs: draft, CI failing, unresolved threads (cleared only by a reply or resolving; pushes don't clear them), changes requested (cleared by a newer commit), both ignored for a reviewer who already reviewed and has been re-requested, new top-level comments from others, except from bots such as Copilot (cleared by any later activity of mine: comment, review, thread reply or push), approved. Reviewed PRs: review or re-review requested, replies to your threads, new commits since your review, else waiting. Once your latest verdict is an approval none of the last two apply: only a re-request, a dismissed approval or a later changes-requested review brings the PR back. PRs the user isn't involved in return `null`. Change it together with tests.
- **Backlog view** (`Config.view`, top-level toggle "My PRs" / "Backlog"): shows what the user *could* pick up, beyond PRs they are on. PRs: open, non-draft, not the user's, not approved, and not already in My PRs (`classify` returns null); ones with no reviewer first, each showing assigned reviewers (✓ = already reviewed). Issues: all open issues, unassigned first, then assigned to you, then to others (shown with their assignees); open linked PRs are noted. It never affects the badge or snoozes. GitHub only for now (`Provider.fetchRepo` returns `issues` optionally); ADO is tracked in issue #19.
- **Snooze**: a display layer over `classify`, which is unaware of it. `Config.snoozed` maps PR url -> end time; only `action` PRs can be snoozed (24h fixed). A snoozed PR shows in the Snoozed tab and is not counted in the badge; when the time passes it is simply classified normally again. A snooze never ends early because of new activity.
- **Sign-in panel**: the settings popover opens with one row per code host saying whether its CLI is installed and signed in, and the gear grows a red dot when something is wrong - otherwise a dead `gh` token is invisible until you have repos, and then only as a per-repo error string. `Provider.health?(account)` is optional; `healthProviders()` checks GitHub always (first run has no repos, which is exactly when this matters) and other hosts only once a repo on them is configured. The verdict comes from `gh auth status --json hosts`, which validates each token against the API and is the same call the account picker uses (`ghAuthStatus()` shares one run between them): with `--json` gh always exits 0, so the per-account `state` and `error` fields are the real signal. gh reports "couldn't reach GitHub" with the same `state` as a bad token, so an `HTTP 4xx` (GitHub answered and refused it) or no reason counts as a broken token; a timeout, a 5xx or a connection error is `unverified`, shown but without the red dot. The fix for a broken token is `gh auth refresh` only for gh's active account (it has no `--user`), otherwise `gh auth login`. ADO is checked with `az account get-access-token` (its `--query` keeps the token out of the output), since `az account show` only reads the local profile. ADO is `unverified` only when `az` clearly couldn't connect and didn't ask for a login. A token from `GH_TOKEN`/`GITHUB_TOKEN` gets no gh command, since gh can't refresh it. Checks run on startup, when the account or the set of hosts changes, when refreshes start or stop failing (not on every failed poll: a repo can fail for unrelated reasons), and on opening the popover unless the last check was clean and under a minute old; every finished `gh auth status` run also updates the account picker (`onAccounts`). Going from a problem to all green for the same account and hosts refreshes the PRs if the last refresh failed, so the stale repo errors clear. One check runs at a time (`serialRunner`): asking mid-run queues one fresh run, so a stale result never publishes. It judges the account in `Config.account`, not gh's active one, since that is the token the app actually uses. Parsing is pure and tested; the panel also has a "Show config file" button for settings with no UI.
- **Dock badge**: `App.tsx` sets the badge (via `src/badge.ts`: Dock badge count on macOS, a drawn taskbar overlay icon on Windows) to the number of non-snoozed `action` PRs across all repos (ignores the repo filter). On macOS it needs the `core:window:allow-set-badge-count` permission in `src-tauri/capabilities/default.json`; capability changes need a full app restart, not just hot reload.
- Links open in the system browser via `@tauri-apps/plugin-opener`.

## Known gaps

- Review requests to **teams** are ignored (GitHub: only `User` reviewers; ADO: group reviewers skipped).
- ADO: reviewers are only detected from the PR's reviewer list (not ad-hoc commenters), no paging beyond 50 PRs per repo, and each PR costs 2-4 `az` calls.
- Query limits with no paging: 50 PRs and 50 issues per repo, 50 threads, last 30 comments, last 50 reviews.
- One `gh` process per repo per refresh.
- No desktop notifications, tray icon or badge count.
- No tests for `client.ts`, `config.ts` or the UI.
- A repo whose fetch fails still surfaces as a raw error string for that repo; only the CLI/sign-in causes behind it get explained (see the Sign-in panel).

## Conventions

- Match the existing style: small modules, plain functions, no state library, no CSS framework (`App.css`).
- Keep GitHub response shaping in `src/github/`, and decision logic in `src/state/`.
- Don't add token handling or direct HTTP calls to GitHub without discussing it; the `gh` approach is deliberate.
- Use Conventional Commit PR titles (`feat:`, `fix:`, `docs:`, ...): release-please builds the version and changelog from them. Don't bump versions by hand; see `docs/releasing.md`.
