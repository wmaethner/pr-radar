import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { providerOf } from "../providers";

interface LocalRepo {
  path: string;
  remotes: string[];
}

/** Local clone folder for a repo key, found by matching clone remotes under `root`; null if there isn't one. */
export async function findLocalRepo(root: string, key: string): Promise<string | null> {
  const provider = providerOf(key);
  if (!provider) return null;
  const clones = await invoke<LocalRepo[]>("scan_repos", { root });
  return clones.find((c) => c.remotes.some((r) => provider.matchesRemote(key, r)))?.path ?? null;
}

/** Opens the folder in VS Code, which focuses the window if that folder is already open there. */
export async function openInVscode(path: string): Promise<void> {
  const normalized = path.replace(/\\/g, "/");
  await openUrl(`vscode://file/${encodeURI(normalized.replace(/^\//, ""))}`);
}

/** Resolve and open a repo; returns an error message to show, or null on success. */
export async function openRepoInVscode(root: string | null, key: string): Promise<string | null> {
  if (!root) return "Set the code folder in settings first.";
  try {
    const path = await findLocalRepo(root, key);
    if (!path) return `No local clone of this repo found under ${root}.`;
    await openInVscode(path);
    return null;
  } catch (e) {
    return String(e);
  }
}
