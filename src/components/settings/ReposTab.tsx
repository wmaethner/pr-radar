import { useState } from "react";
import type { ClonesState } from "../../hooks/useClones";
import { repoListers } from "../../providers";
import type { Config } from "../../store/config";
import { RepoPicker } from "../RepoPicker";
import { labelOf } from "../ui";

/** Add repos by name or from the account's list, and remove the ones already added. */
export function ReposTab({
  config,
  onChange,
  onAddRepo,
  onAddRepos,
  clones,
}: {
  config: Config;
  onChange: (next: Config) => void;
  /** Returns an error message, or null when the repo was added. */
  onAddRepo: (input: string) => Promise<string | null>;
  /** Adds several repo keys at once (from the picker), skipping ones already added. */
  onAddRepos: (keys: string[]) => Promise<void>;
  clones: ClonesState;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);

  const submit = async () => {
    const err = await onAddRepo(input);
    setError(err);
    if (!err) setInput("");
  };

  return (
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
  );
}
