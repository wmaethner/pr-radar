import { useEffect, useMemo, useState } from "react";
import { listAccounts, onAccounts, type GhAccount } from "./github/accounts";
import { parseAnyRepo } from "./providers";
import { setActionBadge } from "./badge";
import { newKeys } from "./state/repoPicker";
import { pruneSnoozed, tabOf } from "./state/snooze";
import { loadConfig, saveConfig, type Config, type View } from "./store/config";
import { Backlog } from "./Backlog";
import { MyPrs } from "./MyPrs";
import { Settings } from "./Settings";
import { UpdateBanner } from "./UpdateBanner";
import { useCollapse } from "./useCollapse";
import { useRepoData } from "./useRepoData";
import { labelOf } from "./ui";
import "./App.css";

const VIEWS: { key: View; label: string }[] = [
  { key: "mine", label: "My PRs" },
  { key: "backlog", label: "Backlog" },
];

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const { results, pending, loading, updated, lastRefresh, items, errors, refresh } = useRepoData(config);
  const [repoFilter, setRepoFilter] = useState("");
  const [accounts, setAccounts] = useState<GhAccount[]>([]);
  const [now, setNow] = useState(() => new Date());

  // Tick so snoozes expire (and "wakes in" labels stay fresh) without waiting for a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    loadConfig().then(setConfig);
    // Later sign-in checks re-run `gh auth status`; each one keeps the picker current.
    const off = onAccounts(setAccounts);
    listAccounts().catch(() => setAccounts([]));
    return off;
  }, []);

  const update = async (next: Config) => {
    setConfig(next);
    await saveConfig(next);
  };

  const collapse = useCollapse(config, update);

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

  const visible = useMemo(
    () => items.filter((i) => !repoFilter || i.pr.repo === repoFilter),
    [items, repoFilter],
  );

  // Drop expired snoozes from the saved config.
  useEffect(() => {
    if (!config) return;
    const live = pruneSnoozed(config.snoozed, now);
    if (live !== config.snoozed) update({ ...config, snoozed: live });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // Dock badge (macOS) / taskbar overlay (Windows): PRs needing action across all repos, ignoring the view filter. Snoozed ones don't count.
  const snoozed = config?.snoozed;
  const actionCount = useMemo(
    () => items.filter((i) => tabOf(i, snoozed ?? {}, now) === "action").length,
    [items, snoozed, now],
  );
  useEffect(() => {
    setActionBadge(actionCount);
  }, [actionCount]);

  if (!config) return <main className="app">Loading…</main>;

  return (
    <main className="app">
      <header>
        <div className="brand">
          <h1>PR Radar</h1>
          {updated && (
            <span className="muted updated">
              Updated {updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        <nav className="views" aria-label="View">
          {VIEWS.map(({ key, label }) => (
            <button
              key={key}
              aria-pressed={config.view === key}
              className={config.view === key ? "selected" : ""}
              onClick={() => update({ ...config, view: key })}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="header-end">
          <select title="Repo filter" value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
            <option value="">All repos</option>
            {config.repos.map((r) => (
              <option key={r} value={r}>
                {labelOf(r)}
              </option>
            ))}
          </select>
          <button
            className={`icon-btn${loading ? " spinning" : ""}`}
            onClick={() => refresh(config.repos, config.account)}
            disabled={loading}
            title={loading ? `Refreshing… ${config.repos.length - pending.length}/${config.repos.length}` : "Refresh"}
            aria-label="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <Settings
            config={config}
            accounts={accounts}
            onChange={update}
            onAddRepo={addRepo}
            onAddRepos={addRepos}
            onSignedIn={() => lastRefresh?.failed && refresh(config.repos, config.account)}
            lastRefresh={lastRefresh}
          />
        </div>
      </header>

      <UpdateBanner />

      {loading && (
        <p className="muted refreshing">
          Refreshing {pending.map(labelOf).join(", ")}…
        </p>
      )}
      {config.repos.length === 0 && <p className="muted">No repos yet. Open settings (⚙) to add one.</p>}
      {errors.map((e) => (
        <p key={e.repo} className="error">
          {labelOf(e.repo)}: {e.error}
        </p>
      ))}

      {config.view === "backlog" ? (
        <Backlog
          repos={config.repos}
          results={results}
          repoFilter={repoFilter}
          loading={loading}
          collapse={collapse}
        />
      ) : (
        <MyPrs config={config} update={update} items={visible} now={now} loading={loading} collapse={collapse} />
      )}
    </main>
  );
}
