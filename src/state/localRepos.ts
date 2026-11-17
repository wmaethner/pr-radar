/** A git clone found on disk: its folder and the remote URLs in its config. */
export interface LocalRepo {
  path: string;
  remotes: string[];
}

/** Whether a remote URL points at the repo with this key. Each provider supplies its own. */
export type RemoteMatcher = (key: string, remote: string) => boolean;

/** The folder of the first clone with a remote for `key`, or null. */
export function findClone(clones: LocalRepo[], key: string, matches: RemoteMatcher): string | null {
  return clones.find((c) => c.remotes.some((r) => matches(key, r)))?.path ?? null;
}

/** Repo key -> clone folder, for the keys that have a clone. */
export function matchClones(clones: LocalRepo[], keys: string[], matches: RemoteMatcher): Record<string, string> {
  const found: Record<string, string> = {};
  for (const key of keys) {
    const path = findClone(clones, key, matches);
    if (path) found[key] = path;
  }
  return found;
}
