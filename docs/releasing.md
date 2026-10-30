# Releasing

Releases are automated with [release-please](https://github.com/googleapis/release-please) and `.github/workflows/release.yml`, and published as GitHub Releases. Installed copies check the latest release for updates at startup (`src/update.ts`) and show an "Update and restart" banner.

## One-time setup

1. **Generate the update signing key** (this is separate from OS code signing; the updater uses it to verify downloads):
   ```sh
   npm run tauri signer generate -- -w ~/.tauri/pr-radar.key
   ```
   Keep the private key (`pr-radar.key`) and its password out of the repo.
2. Put the **public** key (the contents of `~/.tauri/pr-radar.key.pub`) in `src-tauri/tauri.conf.json` as `plugins.updater.pubkey`.
3. In the GitHub repo settings, add the secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of the private key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (if you set a password).
4. The repo must be **public**: installed apps fetch `latest.json` and the installers over plain HTTPS with no login.
5. In Settings, Actions, General, enable **Allow GitHub Actions to create and approve pull requests**. release-please can't open its release PR without it.
6. Recommended, in Settings, General, Pull Requests: allow squash merging, set "Default commit message" to **Pull request title and description** (so the PR title becomes the commit message), and turn off merge commits.

If the private key is lost, installed copies can no longer verify updates and everyone has to reinstall by hand.

## Commit messages

release-please decides the next version from [Conventional Commits](https://www.conventionalcommits.org/). PRs are squash-merged, so the **PR title** is what counts, and `.github/workflows/pr-title.yml` fails a PR whose title isn't in this form:

| Title prefix | Effect (while below 1.0) | Appears in changelog |
| --- | --- | --- |
| `feat: ...` | minor bump (0.1.2 to 0.2.0) | yes |
| `fix: ...` | patch bump (0.1.2 to 0.1.3) | yes |
| `feat!: ...` or a `BREAKING CHANGE:` footer | minor bump (major after 1.0) | yes |
| `docs:`, `chore:`, `ci:`, `refactor:`, `test:` | no release on their own | no |

## Cutting a release

1. Merge PRs to `main` as usual. After each push, release-please opens or updates a PR titled "chore(main): release X.Y.Z" containing the version bump (`package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`) and the `CHANGELOG.md` entry.
2. When you want to ship, review and **merge that release PR**. That is the whole manual step.
3. The same workflow then tags the commit, creates the GitHub Release (with the changelog as its notes), and the build job attaches the macOS (Apple Silicon and Intel) installers, the updater archives and `latest.json`.
4. Installed copies pick it up on their next start.

If the build job fails, the tag and (empty) release already exist. Fix the problem, then re-run the failed workflow run from the Actions tab. Don't retag.

The CI workflow (`.github/workflows/ci.yml`) runs `tsc` and the tests on every PR. Note that the release PR itself is opened by a bot token, so GitHub doesn't start CI on it. The build job runs the tests again before building.

## Installing

- Download the `.dmg` from the Releases page and drag the app to Applications.
- Builds aren't Apple-signed or notarized, so the first launch shows a Gatekeeper warning. Right-click the app, choose Open, and confirm. (Or run `xattr -cr "/Applications/PR Radar.app"` once.) Later updates installed by the app itself should not prompt again.
- **Windows:** download the `.exe` (NSIS) or `.msi` installer from the Releases page and run it. SmartScreen will warn because the installer isn't signed; click More info, then Run anyway.
- Each machine still needs `gh` (and `az` for Azure DevOps) installed and logged in.

## Not set up yet

- Windows code signing. Unsigned installers trigger a SmartScreen warning ("Windows protected your PC": click More info, then Run anyway).
- Apple code signing and notarization (steps below).

## Apple signing and notarization (to do)

Without this, a fresh browser download shows "PR Radar is damaged and can't be opened". The workaround is `xattr -cr "/Applications/PR Radar.app"`. Signing and notarizing removes the need for it. Requires a paid Apple Developer account (the Account Holder role is needed to create the certificate).

1. **Create a Developer ID Application certificate.** The Apple Development and Apple Distribution certificates do not work: they are for running on your own devices and for the App Store. In Xcode: Settings, Accounts, select the team, Manage Certificates, **+**, Developer ID Application. Or create it at developer.apple.com under Certificates.
2. **Export it** from Keychain Access (right-click, Export) as a `.p12` with a password.
3. **Encode it:** `base64 -i cert.p12 | pbcopy`
4. **Create an app-specific password** at appleid.apple.com (Sign-In and Security, App-Specific Passwords). Notarization uses this, not the Apple ID password.
5. **Add GitHub secrets** (Settings, Secrets and variables, Actions):
   - `APPLE_CERTIFICATE`: the base64 text from step 3
   - `APPLE_CERTIFICATE_PASSWORD`: the `.p12` password
   - `APPLE_SIGNING_IDENTITY`: the full certificate name, e.g. `Developer ID Application: Your Name (TEAMID)`. List it with `security find-identity -v -p codesigning`.
   - `APPLE_ID`: the Apple ID email
   - `APPLE_PASSWORD`: the app-specific password
   - `APPLE_TEAM_ID`: the 10-character Team ID
6. **Pass them to the build:** add the six variables to the `env:` block of the `tauri-apps/tauri-action` step in `.github/workflows/release.yml`, each as `${{ secrets.NAME }}`. Add them only after the secrets exist, since empty values can make the build fail. `tauri-action` then imports the certificate, signs the app and submits it for notarization.
7. Tag a new version and check the build log for the notarization step. Notarization adds a few minutes. Then download the `.dmg` and confirm it opens without the `xattr` workaround.

The update signing key is separate and unaffected: updates keep verifying with `TAURI_SIGNING_PRIVATE_KEY`.
