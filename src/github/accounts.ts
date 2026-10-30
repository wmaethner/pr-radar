import { invoke } from "@tauri-apps/api/core";

export interface GhAccount {
  login: string;
  active: boolean;
}

/** Raw result of the `gh_auth_status` command. `hosts` is the stdout of `gh auth status --json hosts`. */
export interface GhAuthRaw {
  found: boolean;
  hosts: string;
  detail: string;
}

/**
 * One entry of `hosts["github.com"]`. `state` is "success" when gh could validate the token;
 * otherwise `error` holds the reason, e.g. "HTTP 401: Bad credentials (https://api.github.com/)".
 */
export interface HostEntry {
  login: string;
  active: boolean;
  state?: string;
  error?: string;
  /** "keyring", a hosts.yml path, or the env var it came from, e.g. "GH_TOKEN". */
  tokenSource?: string;
}

/** The github.com logins in gh's report, or null when there's nothing we could parse. */
export function ghHostEntries(raw: GhAuthRaw): HostEntry[] | null {
  // Current gh prints {"hosts":{}} with no login; older builds may print nothing but this.
  if (!raw.hosts) return /not logged in/i.test(raw.detail) ? [] : null;
  try {
    const list = JSON.parse(raw.hosts).hosts?.["github.com"] ?? [];
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

function accountsOf(raw: GhAuthRaw): GhAccount[] {
  const list = ghHostEntries(raw);
  if (!list) throw new Error(raw.detail || "could not read gh's sign-in state");
  return list.map((a) => ({ login: a.login, active: a.active }));
}

let inFlight: Promise<GhAuthRaw> | null = null;
const listeners = new Set<(accounts: GhAccount[]) => void>();

/**
 * Runs `gh auth status`, which validates every token over the network. Callers that ask while a
 * run is in flight share it, so the account picker and the sign-in panel cost one `gh` at startup.
 * Every run that finishes also updates `onAccounts` listeners, so the picker always shows what the
 * latest check saw, whoever started it.
 */
export function ghAuthStatus(): Promise<GhAuthRaw> {
  inFlight ??= invoke<string>("gh_auth_status")
    .then((s) => {
      const raw = JSON.parse(s) as GhAuthRaw;
      let accounts: GhAccount[] = [];
      try {
        accounts = accountsOf(raw);
      } catch {
        // Unreadable output means no accounts to offer; the sign-in panel explains why.
      }
      listeners.forEach((l) => l(accounts));
      return raw;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Calls `listener` with the github.com accounts each time a `gh auth status` run finishes. */
export function onAccounts(listener: (accounts: GhAccount[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Logged-in github.com accounts known to the `gh` CLI. */
export async function listAccounts(): Promise<GhAccount[]> {
  return accountsOf(await ghAuthStatus());
}
