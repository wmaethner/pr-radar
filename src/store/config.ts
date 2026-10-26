import { invoke } from "@tauri-apps/api/core";
import type { Bucket } from "../github/types";
import type { Snoozed } from "../state/snooze";

export type Tab = Bucket | "snoozed";

export interface Config {
  repos: string[]; // "owner/name" (GitHub) or "ado:org/project/repo" (Azure DevOps)
  pollMinutes: number;
  tab: Tab; // selected status tab
  snoozed: Snoozed; // PR url -> ISO time the snooze ends
  collapsed: string[]; // collapsed repo sub-group keys, e.g. "status:action/owner/name"
  account: string | null; // gh login to use; null = gh's active account
}

const DEFAULT: Config = { repos: [], pollMinutes: 5, tab: "action", snoozed: {}, collapsed: [], account: null };

export async function loadConfig(): Promise<Config> {
  const raw = await invoke<string>("load_config");
  if (!raw) return DEFAULT;
  try {
    const { groupBy: _legacy, ...saved } = JSON.parse(raw); // groupBy was replaced by tabs
    return { ...DEFAULT, ...saved };
  } catch {
    return DEFAULT;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await invoke("save_config", { json: JSON.stringify(config, null, 2) });
}
