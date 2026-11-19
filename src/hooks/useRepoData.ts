import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAll, type RepoResult } from "../providers";
import type { Classified } from "../github/types";
import { classify } from "../state/classify";
import type { Config } from "../store/config";

export interface RefreshStatus {
  at: number;
  failed: boolean;
}

/** Fetches every configured repo on a timer and classifies the PRs; repos land one by one during a refresh. */
export function useRepoData(config: Config | null) {
  // Latest result per repo; repos land here one by one while a refresh is running.
  const [results, setResults] = useState<Record<string, RepoResult>>({});
  const [pending, setPending] = useState<string[]>([]);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState<RefreshStatus | null>(null);
  const runId = useRef(0);

  const refresh = useCallback(async (repos: string[], account: string | null) => {
    const run = ++runId.current;
    // Drop repos that were removed; keep the rest on screen until their fresh result arrives.
    setResults((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => repos.includes(k))));
    setPending(repos);
    if (repos.length === 0) return;
    const onResult = (r: RepoResult) => {
      if (run !== runId.current) return; // a newer refresh superseded this one
      setResults((prev) => ({ ...prev, [r.repo]: r }));
      setPending((prev) => prev.filter((k) => k !== r.repo));
    };
    const all = await fetchAll(repos, account, onResult);
    if (run === runId.current) {
      setUpdated(new Date());
      setLastRefresh({ at: Date.now(), failed: all.some((r) => r.error) });
    }
  }, []);

  const items = useMemo(
    () =>
      Object.values(results)
        .flatMap((r) => r.prs.map((pr) => classify(pr, r.me)))
        .filter((c): c is Classified => c !== null),
    [results],
  );
  const errors = useMemo(() => Object.values(results).filter((r) => r.error), [results]);

  const repoKey = config?.repos.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: repoKey stands in for config.repos so an equal list does not restart polling
  useEffect(() => {
    if (!config) return;
    refresh(config.repos, config.account);
    const id = setInterval(() => refresh(config.repos, config.account), config.pollMinutes * 60_000);
    return () => clearInterval(id);
  }, [repoKey, config?.pollMinutes, config?.account, refresh]);

  return { results, pending, loading: pending.length > 0, updated, lastRefresh, items, errors, refresh };
}
