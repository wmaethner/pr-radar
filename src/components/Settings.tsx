import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { HealthPanel, isProblem, useHealth } from "./Health";
import type { GhAccount } from "../github/accounts";
import { repoListers } from "../providers";
import { RepoPicker } from "./RepoPicker";
import type { Config } from "../store/config";
import { useAppVersion } from "../hooks/useAppVersion";
import { useClones } from "../hooks/useClones";
import { labelOf } from "./ui";

const POLL_CHOICES = [1, 2, 5, 10, 15, 30];

/** Asks the settings dialog to open and focus a field. The id makes a second request for the same field count. */
export interface SettingsRequest {
  field: "codeRoot";
  id: number;
}

type SettingsTab = "accounts" | "general" | "repos" | "editor";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "accounts", label: "Accounts" },
  { key: "general", label: "General" },
  { key: "repos", label: "Repos" },
  { key: "editor", label: "Editor" },
];

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** A clean sign-in check younger than this is reused when the dialog opens. */
const RECHECK_AFTER_MS = 60_000;

/** Gear button that opens a modal dialog with account, repo management and polling. */
export function Settings({
  config,
  accounts,
  onChange,
  onAddRepo,
  onAddRepos,
  onSignedIn,
  lastRefresh,
  request,
}: {
  config: Config;
  accounts: GhAccount[];
  onChange: (next: Config) => void;
  /** Returns an error message, or null when the repo was added. */
  onAddRepo: (input: string) => Promise<string | null>;
  /** Adds several repo keys at once (from the picker), skipping ones already added. */
  onAddRepos: (keys: string[]) => Promise<void>;
  /** A check just went from a problem to all green: refresh so the repos' errors clear too. */
  onSignedIn: () => void;
  /** When the last full refresh finished, and whether any repo failed in it. */
  lastRefresh: { at: number; failed: boolean } | null;
  /** Open the dialog at a field, e.g. when "Open in VS Code" needs the code folder. */
  request?: SettingsRequest | null;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("accounts");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const version = useAppVersion();
  const [browsing, setBrowsing] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const focusFolder = useRef(false);
  const [folderDraft, setFolderDraft] = useState(config.codeRoot ?? "");
  const clones = useClones(config.codeRoot, config.repos, open);
  const { health, checking, checkedAt, checkedFor, recheck } = useHealth(config.repos, config.account);
  const problem = health?.some(isProblem) ?? false;
  // null means the first check is still running, which is as good as a fresh, clean one here.
  const allOk = health?.every((h) => h.ok) ?? true;

  useEffect(() => setFolderDraft(config.codeRoot ?? ""), [config.codeRoot]);

  // Opened on request: show the dialog, then focus the field once it has rendered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a new request arrives (request.id), not on every render of the request object
  useEffect(() => {
    if (!request) return;
    focusFolder.current = true;
    setTab("editor");
    setOpen(true);
  }, [request?.id]);
  useEffect(() => {
    if (!open || tab !== "editor" || !focusFolder.current) return;
    focusFolder.current = false;
    folderInput.current?.focus();
  }, [open, tab]);

  const commitFolder = (value: string) => {
    const next = value.trim() || null;
    if (next !== config.codeRoot) onChange({ ...config, codeRoot: next });
  };
  const browseFolder = async () => {
    const picked = await pickFolder({
      directory: true,
      multiple: false,
      defaultPath: config.codeRoot ?? undefined,
      title: "Folder that holds your clones",
    });
    if (typeof picked === "string") commitFolder(picked);
  };

  // Going green means the fix worked, but the repo errors on screen are from the last refresh,
  // made with the broken login. Refresh now rather than leaving them until the next poll. Only
  // for the same account and hosts: a switch or a removed host isn't a fix, and App already
  // refreshes on an account change.
  const was = useRef<{ key: string; ok: boolean } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the check result changes; the other values are read as of that check
  useEffect(() => {
    if (!health) return;
    if (was.current && was.current.key === checkedFor && !was.current.ok && allOk) onSignedIn();
    was.current = { key: checkedFor, ok: allOk };
  }, [health]);

  // Refreshes starting to fail is how a token that dies mid-session first shows up, and starting
  // to succeed again is how a fix does: re-check on those changes, so the red dot follows without
  // opening settings. Not on every failed poll, since a repo can fail for reasons unrelated to sign-in.
  const lastFailed = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per finished refresh (lastRefresh.at); recheck() is recreated every render
  useEffect(() => {
    if (!lastRefresh) return;
    if (lastRefresh.failed !== lastFailed.current) recheck();
    lastFailed.current = lastRefresh.failed;
  }, [lastRefresh?.at]);

  // Opening settings is when the user looks at sign-in, so re-check then unless the last check
  // was recent and clean: it also clears "couldn't reach GitHub" once the network is back.
  const toggle = () => {
    if (!open) setTab("accounts");
    if (!open && health && (!allOk || Date.now() - checkedAt > RECHECK_AFTER_MS)) recheck();
    setOpen(!open);
  };

  // Close on Escape. A click on the backdrop closes it too (see the overlay below).
  useEffect(() => {
    if (!open) return;
    // The picker handles its own Escape; closing the dialog under it too would lose it with it.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !browsing && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, browsing]);

  const submit = async () => {
    const err = await onAddRepo(input);
    setError(err);
    if (!err) setInput("");
  };

  return (
    <div className="settings">
      <button
        className={problem ? "icon-btn has-problem" : "icon-btn"}
        title={problem ? "Settings — a sign-in needs attention" : "Settings"}
        aria-label={problem ? "Settings, a sign-in needs attention" : "Settings"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <GearIcon />
      </button>
      {open && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Settings">
            <div className="modal-head">
              <strong>Settings</strong>
              <button type="button" className="icon-btn" aria-label="Close" title="Close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div className="modal-main">
              <nav className="modal-nav" role="tablist" aria-orientation="vertical">
                {TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    className={`nav-item${tab === key ? " selected" : ""}`}
                    onClick={() => setTab(key)}
                  >
                    {label}
                    {key === "accounts" && problem && <span className="nav-dot" title="A sign-in needs attention" />}
                    {key === "repos" && <span className="count">{config.repos.length}</span>}
                  </button>
                ))}
              </nav>
              <div className="modal-body" role="tabpanel">
                {tab === "accounts" && (
                  <>
                    <HealthPanel health={health} checking={checking} onRecheck={recheck} />
                    {accounts.length > 0 && (
                      <>
                        <div className="section-title">GitHub account</div>
                        <label className="field">
                          <span>Account to use</span>
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
                      </>
                    )}
                  </>
                )}

                {tab === "general" && (
                  <>
                    <div className="section-title">Refresh</div>
                    <label className="field">
                      <span>Refresh every</span>
                      <select
                        value={config.pollMinutes}
                        onChange={(e) => onChange({ ...config, pollMinutes: Number(e.target.value) })}
                      >
                        {[...new Set([...POLL_CHOICES, config.pollMinutes])]
                          .sort((a, b) => a - b)
                          .map((m) => (
                            <option key={m} value={m}>
                              {m} min
                            </option>
                          ))}
                      </select>
                    </label>
                    {version && <div className="muted version">PR Radar {version}</div>}
                  </>
                )}

                {tab === "repos" && (
                  <>
                    <div className="section-title">Add a repo</div>
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
                    {repoListers().length > 0 && (
                      <button type="button" className="link-btn browse-btn" onClick={() => setBrowsing(true)}>
                        Browse your repos…
                      </button>
                    )}
                    {browsing && (
                      <RepoPicker
                        account={config.account}
                        added={config.repos}
                        onAdd={onAddRepos}
                        onClose={() => setBrowsing(false)}
                      />
                    )}
                    <div className="section-title">
                      Added repos <span className="count">{config.repos.length}</span>
                    </div>
                    <ul className="repo-list">
                      {config.repos.map((r) => (
                        <li key={r}>
                          <span className="repo-label" title={labelOf(r)}>
                            {labelOf(r)}
                          </span>
                          {clones.status === "ok" && !clones.matched[r] && (
                            <span className="badge" title="No clone of this repo found under the code folder">
                              no clone
                            </span>
                          )}
                          <button
                            type="button"
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
                  </>
                )}

                {tab === "editor" && (
                  <>
                    <div className="section-title">Open in VS Code</div>
                    <label className="field stack">
                      <span>Code folder: where your clones live</span>
                      <div className="folder-row">
                        <input
                          ref={folderInput}
                          value={folderDraft}
                          placeholder="~/Documents/GitHub"
                          onChange={(e) => setFolderDraft(e.target.value)}
                          onBlur={() => commitFolder(folderDraft)}
                          onKeyDown={(e) => e.key === "Enter" && commitFolder(folderDraft)}
                        />
                        <button type="button" onClick={browseFolder}>
                          Browse…
                        </button>
                      </div>
                    </label>
                    {clones.status === "scanning" && <p className="muted clone-summary">Looking for clones…</p>}
                    {clones.status === "error" && <p className="error clone-summary">{clones.message}</p>}
                    {clones.status === "ok" && (
                      <p className="muted clone-summary">
                        Found {clones.total} {clones.total === 1 ? "clone" : "clones"}
                        {config.repos.length > 0 &&
                          `; ${Object.keys(clones.matched).length} of your ${config.repos.length} repos matched`}
                        .
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
