import type { Health } from "../providers/types";
import { ghAuthStatus, ghHostEntries, type GhAuthRaw } from "./accounts";

const INSTALL_URL = "https://cli.github.com";
const LOGIN = "gh auth login -h github.com";
// `gh auth refresh` has no --user flag: it only re-authorizes gh's active account.
const REFRESH = "gh auth refresh -h github.com";

/**
 * Turn gh's own report into something actionable. `account` is `Config.account`: the login
 * the app will actually use, so a token that is broken for *that* account is the failure the
 * user would otherwise only see as a per-repo error string (or, with no repos, not at all).
 */
export function parseGhHealth(raw: GhAuthRaw, account: string | null): Health {
  if (!raw.found) {
    return {
      ok: false,
      summary: "GitHub CLI not found",
      detail: "PR Radar signs in to GitHub through the `gh` CLI. It isn't installed, or isn't on this app's PATH.",
      url: INSTALL_URL,
    };
  }

  const list = ghHostEntries(raw);
  if (!list) {
    return {
      ok: false,
      summary: "Could not read gh's sign-in state",
      detail: raw.detail || "`gh auth status` returned nothing we could parse.",
      fix: "gh auth status",
    };
  }
  if (list.length === 0) {
    return { ok: false, summary: "Not signed in to GitHub", detail: "`gh` has no github.com account logged in.", fix: LOGIN };
  }

  // null means "whatever gh's active account is", which is how gh_graphql behaves.
  const inUse = account ? list.find((a) => a.login === account) : (list.find((a) => a.active) ?? list[0]);
  if (!inUse) {
    return {
      ok: false,
      summary: `@${account} is no longer signed in`,
      detail: `Settings is set to use @${account}, but \`gh\` has no such github.com account. Pick another account below, or log it back in.`,
      fix: LOGIN,
    };
  }

  // Older gh builds omit `state`; treat only an explicit non-success as broken.
  if (inUse.state !== undefined && inUse.state !== "success") {
    // gh reports "couldn't reach GitHub" with the same state as a bad token. An HTTP 4xx means
    // GitHub answered and refused the token (401 bad credentials, 403 SSO or scopes), as does an
    // error with no reason at all; a timeout, a 5xx or a connection error says nothing about it.
    const error = inUse.error ?? "";
    if (inUse.state === "timeout" || (error && !/^HTTP 4\d\d\b/.test(error))) {
      return {
        ok: false,
        unverified: true,
        summary: `Couldn't reach GitHub to check @${inUse.login}`,
        detail: error || undefined,
      };
    }
    const summary = `@${inUse.login}'s token is not working`;
    const lead = error ? `${error}\n` : "";
    // gh won't refresh or replace a token it was handed through the environment.
    const envVar = inUse.tokenSource?.match(/^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN)$/)?.[0];
    if (envVar) {
      return {
        ok: false,
        summary,
        detail: `${lead}The token comes from the ${envVar} environment variable, which gh can't refresh. Update or unset it, then restart PR Radar.`,
      };
    }
    return {
      ok: false,
      summary,
      detail: inUse.active
        ? error || undefined
        : `${lead}@${inUse.login} isn't gh's active account, so \`gh auth refresh\` won't reach it. Log in again and pick @${inUse.login} in the browser.`,
      fix: inUse.active ? REFRESH : LOGIN,
    };
  }

  const others = list.length - 1;
  return {
    ok: true,
    summary: `Signed in as @${inUse.login}${others > 0 ? ` (${others} other account${others > 1 ? "s" : ""})` : ""}`,
  };
}

/** A failure to even ask (not a bad login) is reported by `useHealth`, the same for every host. */
export async function ghHealth(account: string | null): Promise<Health> {
  return parseGhHealth(await ghAuthStatus(), account);
}
