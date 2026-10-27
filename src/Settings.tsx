import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useRef, useState } from "react";
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

/** Gear button that opens a popover with account, repo management and polling. */
export function Settings({
  config,
  accounts,
  onChange,
  onAddRepo,
}: {
  config: Config;
  accounts: GhAccount[];
  onChange: (next: Config) => void;
  /** Returns an error message, or null when the repo was added. */
  onAddRepo: (input: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

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
      <button className="icon-btn" title="Settings" aria-label="Settings" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <GearIcon />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Settings">
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
