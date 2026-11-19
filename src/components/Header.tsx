import { useEffect, useState } from "react";
import { listAccounts, onAccounts, type GhAccount } from "../github/accounts";
import type { Config, View } from "../store/config";
import type { RefreshStatus } from "../hooks/useRepoData";
import { Settings, type SettingsRequest } from "./Settings";
import { labelOf } from "./ui";

const VIEWS: { key: View; label: string }[] = [
  { key: "mine", label: "My PRs" },
  { key: "backlog", label: "Backlog" },
];

/** Brand, view switch, repo filter, refresh button and the settings button. */
export function Header({
  config,
  update,
  updated,
  loading,
  pending,
  lastRefresh,
  repoFilter,
  onRepoFilter,
  onRefresh,
  onAddRepo,
  onAddRepos,
  settingsRequest,
}: {
  config: Config;
  update: (next: Config) => Promise<void>;
  updated: Date | null;
  loading: boolean;
  pending: string[];
  lastRefresh: RefreshStatus | null;
  repoFilter: string;
  onRepoFilter: (repo: string) => void;
  onRefresh: () => void;
  onAddRepo: (input: string) => Promise<string | null>;
  onAddRepos: (keys: string[]) => Promise<void>;
  settingsRequest: SettingsRequest | null;
}) {
  const [accounts, setAccounts] = useState<GhAccount[]>([]);

  useEffect(() => {
    // Later sign-in checks re-run `gh auth status`; each one keeps the picker current.
    const off = onAccounts(setAccounts);
    listAccounts().catch(() => setAccounts([]));
    return off;
  }, []);

  return (
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
      <select title="Repo filter" value={repoFilter} onChange={(e) => onRepoFilter(e.target.value)}>
        <option value="">All repos</option>
        {config.repos.map((r) => (
          <option key={r} value={r}>
            {labelOf(r)}
          </option>
        ))}
      </select>
      <button
        className={`icon-btn${loading ? " spinning" : ""}`}
        onClick={onRefresh}
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
        onAddRepo={onAddRepo}
        onAddRepos={onAddRepos}
        request={settingsRequest}
        onSignedIn={() => lastRefresh?.failed && onRefresh()}
        lastRefresh={lastRefresh}
      />
    </div>
  </header>
  );
}
