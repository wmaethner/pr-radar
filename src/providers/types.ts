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

/** A code host. Repos are stored in `Config.repos` as opaque keys that exactly one provider owns. */
export interface Provider {
  id: string;
  owns(key: string): boolean;
  /** Turn a URL or shorthand the user typed into a repo key, or null if it isn't this host's. */
  parse(input: string): string | null;
  /** Split a key for display: `owner` is the muted prefix, `name` the repo. */
  display(key: string): { owner: string; name: string };
  /** Fetch one repo's open PRs. May throw: `fetchAll` turns that into `RepoResult.error`. */
  fetchRepo(key: string, ctx: FetchContext): Promise<{ me: string; prs: PullRequest[]; issues?: Issue[] }>;
}
