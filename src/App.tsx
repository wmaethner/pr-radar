import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listAccounts, onAccounts, type GhAccount } from "./github/accounts";
import { fetchAll, parseAnyRepo, type RepoResult } from "./providers";
import type { Classified } from "./github/types";
import { classify } from "./state/classify";
import { setActionBadge } from "./badge";
import { checkForUpdate, installUpdate } from "./update";
import type { Update } from "@tauri-apps/plugin-updater";
import { isSnoozed, pruneSnoozed, snoozeUntil, timeLeft } from "./state/snooze";
import { loadConfig, saveConfig, type Config, type Tab, type View } from "./store/config";
import { Backlog } from "./Backlog";
import { Settings } from "./Settings";
import { labelOf, RepoName, ago } from "./ui";
import "./App.css";

const TABS: { key: Tab; label: string }[] = [
  { key: "action", label: "Needs action" },
  { key: "ready", label: "Ready to merge" },
  { key: "waiting", label: "Waiting" },
  { key: "snoozed", label: "Snoozed" },
];

const VIEWS: { key: View; label: string }[] = [
  { key: "mine", label: "My PRs" },
  { key: "backlog", label: "Backlog" },
];

const EMPTY: Record<Tab, string> = {
  snoozed: "Nothing is snoozed.",
  action: "All caught up. Nothing needs your action.",
  ready: "No PRs are ready to merge.",
  waiting: "Nothing is waiting on others.",
};

const byNumber = (a: Classified, b: Classified) => b.pr.number - a.pr.number;

interface RowAction {
  note?: string;
  label: string;
  title: string;
  run: () => void;
}

function PrRow({ item, showRepo, action }: { item: Classified; showRepo: boolean; action?: RowAction }) {
  const { pr, role, reason, bucket } = item;
  return (
    <a className={`pr ${bucket}`} href={pr.url} onClick={(e) => (e.preventDefault(), openUrl(pr.url))}>
      <div className="pr-main">
        <span className="title">
          {pr.title} <span className="muted">#{pr.number}</span>
        </span>
        <span className="meta">
          {showRepo && <RepoName repo={pr.repo} />}
          {showRepo && " · "}
          {role === "author" ? "Your PR" : `Reviewing · by ${pr.author?.name ?? pr.author?.login ?? "unknown"}`} · updated {ago(pr.updatedAt)}
        </span>
      </div>
      <span className={`tag ${bucket}`}>{reason}</span>
      {action?.note && <span className="meta note">{action.note}</span>}
      {action && (
        <button
          className="row-action"
          title={action.title}
          aria-label={action.title}
          onClick={(e) => (e.preventDefault(), e.stopPropagation(), action.run())}
        >
          {action.label}
        </button>
      )}
    </a>
  );
}

/** Split items into [repo, items] groups, keeping first-seen order. */
function groupByRepo(items: Classified[]): [string, Classified[]][] {
  const map = new Map<string, Classified[]>();
  for (const i of items) map.set(i.pr.repo, [...(map.get(i.pr.repo) ?? []), i]);
  return [...map];
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  // Latest result per repo; repos land here one by one while a refresh is running.
  const [results, setResults] = useState<Record<string, RepoResult>>({});
  const [pending, setPending] = useState<string[]>([]);
  const loading = pending.length > 0;
  const runId = useRef(0);
  const [repoFilter, setRepoFilter] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [lastRefresh, setLastRefresh] = useState<{ at: number; failed: boolean } | null>(null);
  const [accounts, setAccounts] = useState<GhAccount[]>([]);
  const [newVersion, setNewVersion] = useState<Update | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
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
    checkForUpdate().then(setNewVersion);
    return off;
  }, []);

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
  useEffect(() => {
    if (!config) return;
    refresh(config.repos, config.account);
    const id = setInterval(() => refresh(config.repos, config.account), config.pollMinutes * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoKey, config?.pollMinutes, config?.account, refresh]);

  const update = async (next: Config) => {
    setConfig(next);
    await saveConfig(next);
  };

  const isCollapsed = (key: string) => config?.collapsed.includes(key) ?? false;
  const toggle = (key: string) => {
    if (!config) return;
    const collapsed = config.collapsed.includes(key)
      ? config.collapsed.filter((k) => k !== key)
      : [...config.collapsed, key];
    update({ ...config, collapsed });
  };
  /** Heading props that make a section title a keyboard-accessible collapse toggle. */
  const toggler = (key: string) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": !isCollapsed(key),
    onClick: () => toggle(key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") (e.preventDefault(), toggle(key));
    },
  });
  const chevron = (key: string) => <span className="chevron">{isCollapsed(key) ? "▸" : "▾"}</span>;

  const addRepo = async (input: string): Promise<string | null> => {
    if (!config) return null;
    const repo = parseAnyRepo(input);
    if (!repo) return "Not a recognised repo. Use owner/name, a github.com URL or an Azure DevOps repo URL.";
    if (config.repos.includes(repo)) return `${labelOf(repo)} is already added.`;
    await update({ ...config, repos: [...config.repos, repo] });
    return null;
  };

  const visible = useMemo(
    () => items.filter((i) => !repoFilter || i.pr.repo === repoFilter),
    [items, repoFilter],
  );

  // Only PRs that need action can be snoozed; a snooze lapses on its own once the time is up.
  const snoozed = config?.snoozed;
  const tabOf = useCallback(
    (i: Classified): Tab => (i.bucket === "action" && isSnoozed(snoozed ?? {}, i.pr.url, now) ? "snoozed" : i.bucket),
    [snoozed, now],
  );

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { action: 0, ready: 0, waiting: 0, snoozed: 0 };
    for (const i of visible) c[tabOf(i)]++;
    return c;
  }, [visible, tabOf]);

  // Drop expired snoozes from the saved config.
  useEffect(() => {
    if (!config) return;
    const live = pruneSnoozed(config.snoozed, now);
    if (live !== config.snoozed) update({ ...config, snoozed: live });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  // Dock badge (macOS) / taskbar overlay (Windows): PRs needing action across all repos, ignoring the view filter. Snoozed ones don't count.
  const actionCount = useMemo(() => items.filter((i) => tabOf(i) === "action").length, [items, tabOf]);
  useEffect(() => {
    setActionBadge(actionCount);
  }, [actionCount]);

  if (!config) return <main className="app">Loading…</main>;

  const rows = visible.filter((i) => tabOf(i) === config.tab).sort(byNumber);
  const snoozeAction = (item: Classified): RowAction | undefined => {
    const url = item.pr.url;
    if (config.tab === "action")
      return {
        label: "💤",
        title: "Snooze for 1 day",
        run: () => update({ ...config, snoozed: { ...config.snoozed, [url]: snoozeUntil(new Date()) } }),
      };
    if (config.tab === "snoozed")
      return {
        note: `wakes in ${timeLeft(config.snoozed[url], now)}`,
        label: "Unsnooze",
        title: "Move back to Needs action",
        run: () => {
          const { [url]: _removed, ...rest } = config.snoozed;
          update({ ...config, snoozed: rest });
        },
      };
  };
  const groups = groupByRepo(rows.sort((a, b) => a.pr.repo.localeCompare(b.pr.repo)));

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
            onSignedIn={() => lastRefresh?.failed && refresh(config.repos, config.account)}
            lastRefresh={lastRefresh}
          />
        </div>
      </header>

      {newVersion && (
        <div className="update-banner">
          <span>Version {newVersion.version} is available.</span>
          <button
            disabled={installing}
            onClick={async () => {
              setInstalling(true);
              setUpdateError(null);
              try {
                await installUpdate(newVersion);
              } catch (e) {
                setUpdateError(String(e));
                setInstalling(false);
              }
            }}
          >
            {installing ? "Installing…" : "Update and restart"}
          </button>
          {updateError && <span className="error">{updateError}</span>}
        </div>
      )}

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
          collapse={{ isCollapsed, toggler, chevron }}
        />
      ) : (
        <section className="panel">
        <nav className="tabs panel-head" role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={config.tab === key}
              className={`tab ${key}${config.tab === key ? " selected" : ""}`}
              onClick={() => update({ ...config, tab: key })}
            >
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </nav>

        <div className="panel-body">
        {rows.length === 0 && config.repos.length > 0 && !loading && (
          <p className="muted empty">{EMPTY[config.tab]}</p>
        )}
        <section className={`bucket ${config.tab}`}>
          {groups.map(([repo, items]) => {
            const subKey = `status:${config.tab}/${repo}`;
            return (
              <div key={repo} className="repo-sub">
                {groups.length > 1 && (
                  <h3 {...toggler(subKey)}>
                    {chevron(subKey)}
                    <RepoName repo={repo} /> <span className="count">{items.length}</span>
                  </h3>
                )}
                {(groups.length === 1 || !isCollapsed(subKey)) &&
                  items.map((item) => (
                    <PrRow key={item.pr.url} item={item} showRepo={groups.length === 1} action={snoozeAction(item)} />
                  ))}
              </div>
            );
          })}
        </section>
        </div>
        </section>
      )}
    </main>
  );
}
