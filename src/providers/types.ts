import type { Issue, PullRequest } from "../github/types";

/** What one repo's fetch produced. `me` is the viewer's identity on that host; "" when the fetch failed. */
export interface RepoResult {
  repo: string;
  me: string;
  prs: PullRequest[];
  issues: Issue[];
  error?: string;
}

/** Per-refresh inputs shared by every repo fetch. */
export interface FetchContext {
  account: string | null; // gh login; providers other than GitHub ignore it
  cache: Map<string, Promise<unknown>>; // lives for one refresh, e.g. to look up an identity once per org
}

/** Whether this host's CLI is installed and signed in, and what to do when it isn't. */
export interface Health {
  ok: boolean;
  /** One line: who you are signed in as, or what is wrong. */
  summary: string;
  /** The CLI's own words about the problem, shown only when `ok` is false. */
  detail?: string;
  /** A command the user can run to fix it, offered with a copy button. */
  fix?: string;
  /** Where to go when there is nothing to run, e.g. an install page. */
  url?: string;
  /**
   * The check itself couldn't finish (offline, host down), so this says nothing about the login.
   * Shown, but not counted as a sign-in problem.
   */
  unverified?: boolean;
}

/** A code host. Repos are stored in `Config.repos` as opaque keys that exactly one provider owns. */
export interface Provider {
  id: string;
  /** Display name, e.g. in the sign-in panel. */
  label: string;
  owns(key: string): boolean;
  /** Turn a URL or shorthand the user typed into a repo key, or null if it isn't this host's. */
  parse(input: string): string | null;
  /** Split a key for display: `owner` is the muted prefix, `name` the repo. */
  display(key: string): { owner: string; name: string };
  /** Fetch one repo's open PRs. May throw: `fetchAll` turns that into `RepoResult.error`. */
  fetchRepo(key: string, ctx: FetchContext): Promise<{ me: string; prs: PullRequest[]; issues?: Issue[] }>;
  /** CLI and sign-in state for this host. `account` is the gh login in use; other hosts ignore it. */
  health?(account: string | null): Promise<Health>;
  /** Check health even with no repo on this host yet, e.g. the primary host on first run. */
  alwaysCheckHealth?: boolean;
}
