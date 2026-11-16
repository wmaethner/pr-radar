import { useEffect, useState } from "react";
import { parseAnyRepo } from "./providers";
import { newKeys } from "./state/repoPicker";
import { pruneSnoozed } from "./state/snooze";
import { loadConfig, saveConfig, type Config } from "./store/config";
import { labelOf } from "./ui";

/** Loads the config, saves every change, and owns the edits that add repos or drop expired snoozes. */
export function useConfig(now: Date) {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    loadConfig().then(setConfig);
  }, []);

  const update = async (next: Config) => {
    setConfig(next);
    await saveConfig(next);
  };

  const addRepo = async (input: string): Promise<string | null> => {
    if (!config) return null;
    const repo = parseAnyRepo(input);
    if (!repo) return "Not a recognised repo. Use owner/name, a github.com URL or an Azure DevOps repo URL.";
    if (config.repos.includes(repo)) return `${labelOf(repo)} is already added.`;
    await update({ ...config, repos: [...config.repos, repo] });
    return null;
  };

  // One update for the whole batch: adding them one by one would save the config once per repo.
  const addRepos = async (keys: string[]) => {
    if (!config) return;
    const fresh = newKeys(config.repos, keys);
    if (fresh.length) await update({ ...config, repos: [...config.repos, ...fresh] });
  };

  // Drop expired snoozes from the saved config.
  useEffect(() => {
    if (!config) return;
    const live = pruneSnoozed(config.snoozed, now);
    if (live !== config.snoozed) update({ ...config, snoozed: live });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  return { config, update, addRepo, addRepos };
}
