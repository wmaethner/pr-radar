import { useEffect, useState } from "react";
import type { GhAccount } from "../github/accounts";
import { useClones } from "../hooks/useClones";
import { useSignInWatch } from "../hooks/useSignInWatch";
import type { Config } from "../store/config";
import { AccountsTab } from "./settings/AccountsTab";
import { EditorTab } from "./settings/EditorTab";
import { GeneralTab } from "./settings/GeneralTab";
import { ReposTab } from "./settings/ReposTab";

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

/** Gear button that opens a modal dialog with tabs for accounts, general settings, repos and the editor. */
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
  const [browsing, setBrowsing] = useState(false);
  const [focusFolder, setFocusFolder] = useState(false);
  const clones = useClones(config.codeRoot, config.repos, open);
  const { health, checking, recheck, problem, recheckOnOpen } = useSignInWatch({
    repos: config.repos,
    account: config.account,
    lastRefresh,
    onSignedIn,
  });

  // Opened on request: show the dialog on the Editor tab, which focuses the field once it renders.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when a new request arrives (request.id), not on every render of the request object
  useEffect(() => {
    if (!request) return;
    setFocusFolder(true);
    setTab("editor");
    setOpen(true);
  }, [request?.id]);

  const toggle = () => {
    if (!open) {
      setTab("accounts");
      recheckOnOpen();
    }
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
                  <AccountsTab
                    health={health}
                    checking={checking}
                    onRecheck={recheck}
                    accounts={accounts}
                    account={config.account}
                    onAccount={(login) => onChange({ ...config, account: login })}
                  />
                )}
                {tab === "general" && (
                  <GeneralTab
                    pollMinutes={config.pollMinutes}
                    onPollMinutes={(m) => onChange({ ...config, pollMinutes: m })}
                  />
                )}
                {tab === "repos" && (
                  <ReposTab
                    config={config}
                    onChange={onChange}
                    onAddRepo={onAddRepo}
                    onAddRepos={onAddRepos}
                    clones={clones}
                    browsing={browsing}
                    onBrowsing={setBrowsing}
                  />
                )}
                {tab === "editor" && (
                  <EditorTab
                    codeRoot={config.codeRoot}
                    onCodeRoot={(codeRoot) => onChange({ ...config, codeRoot })}
                    repoCount={config.repos.length}
                    clones={clones}
                    autoFocus={focusFolder}
                    onFocused={() => setFocusFolder(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
