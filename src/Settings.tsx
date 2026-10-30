import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useRef, useState } from "react";
import { HealthPanel, isProblem, useHealth } from "./Health";
import type { GhAccount } from "./github/accounts";
import type { Config } from "./store/config";
import { labelOf } from "./ui";

const POLL_CHOICES = [1, 2, 5, 10, 15, 30];

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** A clean sign-in check younger than this is reused when the popover opens. */
const RECHECK_AFTER_MS = 60_000;

/** Gear button that opens a popover with account, repo management and polling. */
export function Settings({
  config,
  accounts,
  onChange,
  onAddRepo,
  onSignedIn,
  lastRefresh,
}: {
  config: Config;
  accounts: GhAccount[];
  onChange: (next: Config) => void;
  /** Returns an error message, or null when the repo was added. */
  onAddRepo: (input: string) => Promise<string | null>;
  /** A check just went from a problem to all green: refresh so the repos' errors clear too. */
  onSignedIn: () => void;
  /** When the last full refresh finished, and whether any repo failed in it. */
  lastRefresh: { at: number; failed: boolean } | null;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const { health, checking, checkedAt, checkedFor, recheck } = useHealth(config.repos, config.account);
  const problem = health?.some(isProblem) ?? false;
  // null means the first check is still running, which is as good as a fresh, clean one here.
  const allOk = health?.every((h) => h.ok) ?? true;

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

  // Going green means the fix worked, but the repo errors on screen are from the last refresh,
  // made with the broken login. Refresh now rather than leaving them until the next poll. Only
  // for the same account and hosts: a switch or a removed host isn't a fix, and App already
  // refreshes on an account change.
  const was = useRef<{ key: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!health) return;
    if (was.current && was.current.key === checkedFor && !was.current.ok && allOk) onSignedIn();
    was.current = { key: checkedFor, ok: allOk };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health]);

  // Refreshes starting to fail is how a token that dies mid-session first shows up, and starting
  // to succeed again is how a fix does: re-check on those changes, so the red dot follows without
  // opening settings. Not on every failed poll, since a repo can fail for reasons unrelated to sign-in.
  const lastFailed = useRef(false);
  useEffect(() => {
    if (!lastRefresh) return;
    if (lastRefresh.failed !== lastFailed.current) recheck();
    lastFailed.current = lastRefresh.failed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRefresh?.at]);

  // Opening settings is when the user looks at sign-in, so re-check then unless the last check
  // was recent and clean: it also clears "couldn't reach GitHub" once the network is back.
  const toggle = () => {
    if (!open && health && (!allOk || Date.now() - checkedAt > RECHECK_AFTER_MS)) recheck();
    setOpen(!open);
  };

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = async () => {
    const err = await onAddRepo(input);
    setError(err);
    if (!err) setInput("");
  };

  return (
    <div className="settings" ref={root}>
      <button
        className={problem ? "icon-btn has-problem" : "icon-btn"}
        title={problem ? "Settings — a sign-in needs attention" : "Settings"}
        aria-label={problem ? "Settings, a sign-in needs attention" : "Settings"}
        aria-expanded={open}
        onClick={toggle}
      >
        <GearIcon />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Settings">
          <HealthPanel health={health} checking={checking} onRecheck={recheck} />
          {accounts.length > 0 && (
            <label className="field">
              <span>GitHub account</span>
              <select
                value={config.account ?? accounts.find((a) => a.active)?.login ?? ""}
                onChange={(e) => onChange({ ...config, account: e.target.value })}
              >
                {accounts.map((a) => (
                  <option key={a.login} value={a.login}>
                    @{a.login}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span>Refresh every</span>
            <select value={config.pollMinutes} onChange={(e) => onChange({ ...config, pollMinutes: Number(e.target.value) })}>
              {[...new Set([...POLL_CHOICES, config.pollMinutes])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </label>

          <div className="section-title">
            Repos <span className="count">{config.repos.length}</span>
          </div>
          <form
            className="add-repo"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={input}
              onChange={(e) => (setInput(e.target.value), setError(null))}
              placeholder="owner/name or repo URL"
              aria-label="Add a repo"
            />
            <button type="submit">Add</button>
          </form>
          {error && <p className="error">{error}</p>}
          <ul className="repo-list">
            {config.repos.map((r) => (
              <li key={r}>
                <span title={labelOf(r)}>{labelOf(r)}</span>
                <button
                  className="icon-btn"
                  title={`Remove ${labelOf(r)}`}
                  aria-label={`Remove ${labelOf(r)}`}
                  onClick={() => onChange({ ...config, repos: config.repos.filter((x) => x !== r) })}
                >
                  ✕
                </button>
              </li>
            ))}
            {config.repos.length === 0 && <li className="muted">No repos yet.</li>}
          </ul>
          {version && <div className="muted version">PR Radar {version}</div>}
        </div>
      )}
    </div>
  );
}
