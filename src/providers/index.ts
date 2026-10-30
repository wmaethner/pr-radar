import { ado } from "../ado/provider";
import { github } from "../github/provider";
import type { FetchContext, Provider, RepoResult } from "./types";

export type { FetchContext, Provider, RepoResult } from "./types";

/** Order matters for `parseAnyRepo`: the first provider to recognise the input wins. */
export const providers: Provider[] = [ado, github];

export const providerOf = (key: string): Provider | undefined => providers.find((p) => p.owns(key));

/**
 * Providers worth showing a sign-in status for: those that ask to always be checked (GitHub, for
 * first run), others only once the user has a repo there, so an unused CLI never reports a problem.
 */
export function healthProviders(repos: string[]): Provider[] {
  return providers.filter((p) => p.health && (p.alwaysCheckHealth || repos.some((r) => p.owns(r))));
}

/** Accepts anything a provider recognises; returns the repo key or null. */
export function parseAnyRepo(input: string): string | null {
  for (const p of providers) {
    const key = p.parse(input);
    if (key) return key;
  }
  return null;
}

export function repoDisplay(key: string): { owner: string; name: string } {
  return providerOf(key)?.display(key) ?? { owner: "", name: key };
}

/** Fetch every repo in parallel; `onResult` fires as each one finishes, so callers can render early. */
export async function fetchAll(
  keys: string[],
  account: string | null,
  onResult?: (r: RepoResult) => void,
): Promise<RepoResult[]> {
  const ctx: FetchContext = { account, cache: new Map() };
  return Promise.all(
    keys.map(async (repo): Promise<RepoResult> => {
      const provider = providerOf(repo);
      let result: RepoResult;
      try {
        if (!provider) throw new Error("Unrecognised repo");
        result = { repo, issues: [], ...(await provider.fetchRepo(repo, ctx)) };
      } catch (e) {
        result = { repo, me: "", prs: [], issues: [], error: String(e) };
      }
      onResult?.(result);
      return result;
    }),
  );
}
