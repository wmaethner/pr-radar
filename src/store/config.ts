import { invoke } from "@tauri-apps/api/core";
import type { Bucket } from "../github/types";
import type { Snoozed } from "../state/snooze";

export type Tab = Bucket | "snoozed";
export type View = "mine" | "backlog";

export interface Config {
  repos: string[]; // "owner/name" (GitHub) or "ado:org/project/repo" (Azure DevOps)
  pollMinutes: number;
  view: View; // "mine": PRs you are involved in (status tabs); "backlog": other PRs needing review and open issues
  tab: Tab; // selected status tab
  snoozed: Snoozed; // PR url -> ISO time the snooze ends
  collapsed: string[]; // collapsed repo sub-group keys, e.g. "status:action/owner/name"
  codeRoot: string | null; // folder holding local clones, used to open repos in VS Code
  account: string | null; // gh login to use; null = gh's active account
}

const DEFAULT: Config = { repos: [], pollMinutes: 5, view: "mine", tab: "action", snoozed: {}, collapsed: [], codeRoot: null, account: null };

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const isStringOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";
const isSnoozed = (v: unknown): v is Snoozed =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === "string");

/**
 * Turns the saved JSON into a Config. Each field that is missing or has the wrong type falls back
 * to its default, so a hand-edited or older file can't put the app in a state it can't render.
 * (An old `groupBy` key is simply ignored: tabs replaced it.)
 */
export function parseConfig(raw: string): Config {
  let saved: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return DEFAULT;
    saved = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT;
  }
  const tabs: Tab[] = ["action", "ready", "waiting", "snoozed"];
  return {
    repos: isStringArray(saved.repos) ? saved.repos : DEFAULT.repos,
    pollMinutes:
      typeof saved.pollMinutes === "number" && saved.pollMinutes > 0 ? saved.pollMinutes : DEFAULT.pollMinutes,
    view: saved.view === "mine" || saved.view === "backlog" ? saved.view : DEFAULT.view,
    tab: tabs.includes(saved.tab as Tab) ? (saved.tab as Tab) : DEFAULT.tab,
    snoozed: isSnoozed(saved.snoozed) ? saved.snoozed : DEFAULT.snoozed,
    collapsed: isStringArray(saved.collapsed) ? saved.collapsed : DEFAULT.collapsed,
    codeRoot: isStringOrNull(saved.codeRoot) ? saved.codeRoot : DEFAULT.codeRoot,
    account: isStringOrNull(saved.account) ? saved.account : DEFAULT.account,
  };
}

export async function loadConfig(): Promise<Config> {
  const raw = await invoke<string>("load_config");
  return raw ? parseConfig(raw) : DEFAULT;
}

export async function saveConfig(config: Config): Promise<void> {
  await invoke("save_config", { json: JSON.stringify(config, null, 2) });
}

/** Full path of the config file, for revealing it in the file manager. */
export function configPath(): Promise<string> {
  return invoke<string>("config_path");
}
