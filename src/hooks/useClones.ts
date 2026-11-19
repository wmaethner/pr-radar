import { useEffect, useMemo, useState } from "react";
import { providerOf } from "../providers";
import { scanRepos } from "../platform/editor";
import { matchClones, type LocalRepo } from "../state/localRepos";

export type ClonesState =
  | { status: "idle" }
  | { status: "scanning" }
  | { status: "error"; message: string }
  | { status: "ok"; total: number; matched: Record<string, string> };

const matches = (key: string, remote: string) => providerOf(key)?.matchesRemote(key, remote) ?? false;

/**
 * Scans `root` for clones and says which of `repos` have one. Only scans while `enabled` (the
 * settings dialog is open), so nothing walks the disk in the background.
 */
export function useClones(root: string | null, repos: string[], enabled: boolean): ClonesState {
  const [scan, setScan] = useState<{ root: string; clones: LocalRepo[] } | { root: string; error: string } | null>(null);

  useEffect(() => {
    if (!root || !enabled) return;
    let current = true;
    setScan(null);
    scanRepos(root).then(
      (clones) => current && setScan({ root, clones }),
      (e) => current && setScan({ root, error: String(e) }),
    );
    return () => {
      current = false;
    };
  }, [root, enabled]);

  const key = repos.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: key stands in for repos, so a new array with the same repos does not rematch
  return useMemo((): ClonesState => {
    if (!root || !enabled) return { status: "idle" };
    if (!scan || scan.root !== root) return { status: "scanning" };
    if ("error" in scan) return { status: "error", message: scan.error };
    return { status: "ok", total: scan.clones.length, matched: matchClones(scan.clones, repos, matches) };
  }, [root, enabled, scan, key]);
}
