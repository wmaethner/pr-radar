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
src-tauri/src/lib.rs   Rust commands: gh_graphql, gh_accounts, az_rest, load_config, save_config
src/github/accounts.ts Lists logged-in gh accounts (gh_accounts command)
src/providers/         Provider interface + registry: fetchAll(), parseAnyRepo(), repoDisplay(); one runner for fan-out/errors
src/github/provider.ts GitHub Provider (key "owner/name"); client.ts has the GraphQL query + fetchRepo()
src/github/types.ts    PullRequest, Classified, Bucket and related types (shared by GitHub and ADO)
src/ado/repo.ts        ADO repo keys ("ado:org/project/repo"), parseAdoRepo() for URLs
src/ado/provider.ts    Azure DevOps Provider (key "ado:org/project/repo")
src/ado/client.ts      Azure DevOps REST via az_rest; maps votes/threads/iterations to PullRequest
src/state/classify.ts  Pure logic: classify(pr, me) -> Classified | null
src/state/snooze.ts    Pure snooze helpers (expiry, pruning, time left)
src/store/config.ts    Config (repos, pollMinutes, tab, snoozed, collapsed, account) load/save
src/App.tsx            UI, polling, repo filter, status tabs with per-repo collapsible groups, repo management
```

Data flow: `App` polls -> `fetchAll` (`src/providers`) looks up each repo key's `Provider` and runs `provider.fetchRepo` for all repos in parallel (GitHub: one GraphQL query; ADO: `az` REST calls), turning a throw into `RepoResult.error` and calling `onResult` as each repo finishes so `App` shows that repo's PRs immediately while the others load (header shows progress and the repos still pending) -> `classify` each PR for that repo's `RepoResult.me` -> render grouped by bucket, newest-updated first.

To add a code host, implement `Provider` (`src/providers/types.ts`) in its own folder and add it to `providers` in `src/providers/index.ts`. Keys must be owned by exactly one provider; `providers.test.ts` checks the contract.

### Key decisions

- **Auth goes through the `gh` CLI**, not tokens. Rust spawns `gh api graphql --input -` and returns the raw JSON. The app never stores credentials.
- **Multiple `gh` accounts**: the header dropdown picks which logged-in account to use (`Config.account`, null = gh's active account). Rust fetches that account's token with `gh auth token --user` and passes it as `GH_TOKEN` for that request only; it never runs `gh auth switch`, so the user's CLI state is untouched.
- **Azure DevOps goes through the `az` CLI**, same idea as `gh`: repos are stored as `ado:org/project/repo` in `Config.repos`, and Rust's `az_rest` runs `az rest --resource <ADO> --url ...` (dev.azure.com URLs only). Needs `az login`; the account picker is GitHub-only. ADO votes have no timestamps, so reviews are dated from the "voted" system threads. Only PRs the user authored or is a listed reviewer on are fetched in detail (threads, iterations, CI) to keep `az` process counts down. Written without access to a live ADO org: verify against a real one.
- **`gh` and `az` lookup is per platform** (see `docs/architecture.md`): on macOS fixed paths (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`) because GUI apps don't inherit the shell PATH; on Windows PATH plus the default install dirs, `az` run via the Azure CLI's bundled Python (the `.cmd` wrapper can't take arbitrary args), and every child process started with `CREATE_NO_WINDOW`. Windows support has only been compiled in CI, not run on a real machine.
- **Config** is JSON in the Tauri app config dir (`config.json`), read and written via Rust commands.
- **`classify.ts` is pure** (no I/O) and is where the product behavior lives. Authored PRs: draft, CI failing, unresolved threads (cleared only by a reply or resolving; pushes don't clear them), changes requested (cleared by a newer commit), both ignored for a reviewer who already reviewed and has been re-requested, new top-level comments from others (cleared by any later activity of mine: comment, review, thread reply or push), approved. Reviewed PRs: review or re-review requested, replies to your threads, new commits since your review, else waiting. Once your latest verdict is an approval none of the last two apply: only a re-request, a dismissed approval or a later changes-requested review brings the PR back. PRs the user isn't involved in return `null`. Change it together with tests.
- **Snooze**: a display layer over `classify`, which is unaware of it. `Config.snoozed` maps PR url -> end time; only `action` PRs can be snoozed (24h fixed). A snoozed PR shows in the Snoozed tab and is not counted in the badge; when the time passes it is simply classified normally again. A snooze never ends early because of new activity.
- **Dock badge**: `App.tsx` sets the badge (via `src/badge.ts`: Dock badge count on macOS, a drawn taskbar overlay icon on Windows) to the number of non-snoozed `action` PRs across all repos (ignores the repo filter). On macOS it needs the `core:window:allow-set-badge-count` permission in `src-tauri/capabilities/default.json`; capability changes need a full app restart, not just hot reload.
- Links open in the system browser via `@tauri-apps/plugin-opener`.

## Known gaps

- Review requests to **teams** are ignored (GitHub: only `User` reviewers; ADO: group reviewers skipped).
- ADO: reviewers are only detected from the PR's reviewer list (not ad-hoc commenters), no paging beyond 50 PRs per repo, and each PR costs 2-4 `az` calls.
- Query limits with no paging: 50 PRs per repo, 50 threads, last 30 comments, last 50 reviews.
- One `gh` process per repo per refresh.
- No UI for `pollMinutes` (edit the config file).
- No desktop notifications, tray icon or badge count.
- No tests for `client.ts`, `config.ts` or the UI.
- Missing or unauthenticated `gh` (or a saved account that has since been logged out) surfaces as a raw error string per repo.

## Conventions

- Match the existing style: small modules, plain functions, no state library, no CSS framework (`App.css`).
- Keep GitHub response shaping in `src/github/`, and decision logic in `src/state/`.
- Don't add token handling or direct HTTP calls to GitHub without discussing it; the `gh` approach is deliberate.
- Use Conventional Commit PR titles (`feat:`, `fix:`, `docs:`, ...): release-please builds the version and changelog from them. Don't bump versions by hand; see `docs/releasing.md`.
