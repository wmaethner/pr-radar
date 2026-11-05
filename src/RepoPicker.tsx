import { useEffect, useMemo, useRef, useState } from "react";
import { repoListers } from "./providers";
import type { RepoChoice } from "./providers/types";
import { filterChoices, MAX_LOADED, mergeChoices, ownersOf } from "./state/repoPicker";
import { RepoName } from "./ui";

/**
 * Overlay that lists the repos the signed-in account can access, with search, so repos can be
 * ticked instead of typed. `added` are the repo keys already in the config (shown, not selectable).
 */
export function RepoPicker({
  account,
  added,
  onAdd,
  onClose,
}: {
  account: string | null;
  added: string[];
  onAdd: (keys: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const lister = repoListers()[0];
  const [choices, setChoices] = useState<RepoChoice[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [owner, setOwner] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const alive = useRef(true);

  const load = async (cursor: string | null) => {
    if (!lister?.listRepos) return;
    setLoading(true);
    setError(null);
    try {
      const page = await lister.listRepos({ account }, cursor);
      if (!alive.current) return;
      setChoices((have) => mergeChoices(have, page.choices));
      setNext(page.next);
      setTotal(page.total);
      setWarning((w) => w ?? page.warning ?? null);
    } catch (e) {
      if (alive.current) setError(String(e).replace(/^Error: /, ""));
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  useEffect(() => {
    alive.current = true;
    load(null);
    return () => {
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addedLower = useMemo(() => new Set(added.map((k) => k.toLowerCase())), [added]);
  const owners = useMemo(() => ownersOf(choices, showArchived), [choices, showArchived]);
  const visible = useMemo(
    () => filterChoices(choices, { query, showArchived, owner }),
    [choices, query, showArchived, owner],
  );
  const capped = next !== null && choices.length >= MAX_LOADED;

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (!n.delete(key)) n.add(key);
      return n;
    });

  const submit = async () => {
    setAdding(true);
    try {
      await onAdd(choices.filter((c) => selected.has(c.key)).map((c) => c.key));
      onClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="picker"
        role="dialog"
        aria-modal="true"
        aria-label="Browse repos"
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="picker-head">
          <strong>Browse repos</strong>
          <button className="icon-btn" aria-label="Close" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="picker-filters">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search loaded repos"
            aria-label="Search repos"
          />
          {owners.length > 1 && (
            <select value={owner ?? ""} onChange={(e) => setOwner(e.target.value || null)} aria-label="Owner">
              <option value="">All owners</option>
              {owners.map((o) => (
                <option key={o.owner} value={o.owner}>
                  {o.owner} ({o.count})
                </option>
              ))}
            </select>
          )}
        </div>
        <label className="picker-check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>

        {warning && <p className="error">Some repos may be missing: {warning}</p>}
        {error && (
          <p className="error">
            {error}{" "}
            <button className="link-btn" onClick={() => load(next)}>
              Retry
            </button>
          </p>
        )}

        <ul className="picker-list">
          {visible.map((c) => {
            const isAdded = addedLower.has(c.key.toLowerCase());
            return (
              <li key={c.key}>
                <label className={isAdded ? "pick-row added" : "pick-row"}>
                  <input
                    type="checkbox"
                    checked={isAdded || selected.has(c.key)}
                    disabled={isAdded}
                    onChange={() => toggle(c.key)}
                  />
                  <span className="pick-text">
                    <span className="pick-name">
                      <RepoName repo={c.key} />
                      {c.isPrivate && <span className="badge">private</span>}
                      {c.isFork && <span className="badge">fork</span>}
                      {c.isArchived && <span className="badge">archived</span>}
                      {isAdded && <span className="badge">added</span>}
                    </span>
                    {c.description && <span className="muted pick-desc">{c.description}</span>}
                  </span>
                </label>
              </li>
            );
          })}
          {!loading && !error && visible.length === 0 && (
            <li className="muted">{choices.length === 0 ? "No repos found." : "No loaded repos match."}</li>
          )}
          {loading && <li className="muted">Loading…</li>}
        </ul>

        <div className="picker-foot">
          <span className="muted">
            {choices.length} of {total} loaded
            {next && !capped && (
              <>
                {" · "}
                <button className="link-btn" disabled={loading} onClick={() => load(next)}>
                  Load more
                </button>
              </>
            )}
            {capped && " · narrow it down, or type the repo in settings"}
          </span>
          <span className="picker-actions">
            <button onClick={onClose}>Cancel</button>
            <button className="primary" disabled={selected.size === 0 || adding} onClick={submit}>
              {selected.size > 0 ? `Add ${selected.size}` : "Add"}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
