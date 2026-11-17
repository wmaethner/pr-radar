import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { providerOf } from "../providers";
import { findClone, type LocalRepo } from "../state/localRepos";

/** Git clones under `root` with their remote URLs, from the Rust `scan_repos` command. */
export function scanRepos(root: string): Promise<LocalRepo[]> {
  return invoke<LocalRepo[]>("scan_repos", { root });
}

/** Local clone folder for a repo key, found by matching clone remotes under `root`; null if there isn't one. */
export async function findLocalRepo(root: string, key: string): Promise<string | null> {
  const provider = providerOf(key);
  if (!provider) return null;
  return findClone(await scanRepos(root), key, (k, r) => provider.matchesRemote(k, r));
}

/** The `vscode://file/` link for a folder. `encodeURI` leaves `#` and `?`, which would cut the path short. */
export function vscodeUrl(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\//, "");
  return `vscode://file/${encodeURI(normalized).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

/** Opens the folder in VS Code, which focuses the window if that folder is already open there. */
export async function openInVscode(path: string): Promise<void> {
  await openUrl(vscodeUrl(path));
}

/** Resolve and open a repo; returns an error message to show, or null on success. */
export async function openRepoInVscode(root: string | null, key: string): Promise<string | null> {
  if (!root) return "Set the code folder in settings first.";
  try {
    const path = await findLocalRepo(root, key);
    if (!path) return `No local clone found under ${root}.`;
    await openInVscode(path);
    return null;
  } catch (e) {
    return String(e);
  }
}
