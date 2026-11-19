import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import type { ClonesState } from "../../hooks/useClones";

/** The folder holding the user's clones, which "Open in VS Code" searches. */
export function EditorTab({
  codeRoot,
  onCodeRoot,
  repoCount,
  clones,
  autoFocus,
  onFocused,
}: {
  codeRoot: string | null;
  onCodeRoot: (next: string | null) => void;
  repoCount: number;
  clones: ClonesState;
  /** Focus the folder field once, e.g. when "Open in VS Code" needs it. Call `onFocused` when done. */
  autoFocus: boolean;
  onFocused: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(codeRoot ?? "");

  useEffect(() => setDraft(codeRoot ?? ""), [codeRoot]);
  useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    onFocused();
  }, [autoFocus, onFocused]);

  const commit = (value: string) => {
    const next = value.trim() || null;
    if (next !== codeRoot) onCodeRoot(next);
  };
  const browse = async () => {
    const picked = await pickFolder({
      directory: true,
      multiple: false,
      defaultPath: codeRoot ?? undefined,
      title: "Folder that holds your clones",
    });
    if (typeof picked === "string") commit(picked);
  };

  return (
    <>
      <div className="section-title">Open in VS Code</div>
      <label className="field stack">
        <span>Code folder: where your clones live</span>
        <div className="folder-row">
          <input
            ref={input}
            value={draft}
            placeholder="~/Documents/GitHub"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => e.key === "Enter" && commit(draft)}
          />
          <button type="button" onClick={browse}>
            Browse…
          </button>
        </div>
      </label>
      {clones.status === "scanning" && <p className="muted clone-summary">Looking for clones…</p>}
      {clones.status === "error" && <p className="error clone-summary">{clones.message}</p>}
      {clones.status === "ok" && (
        <p className="muted clone-summary">
          Found {clones.total} {clones.total === 1 ? "clone" : "clones"}
          {repoCount > 0 && `; ${Object.keys(clones.matched).length} of your ${repoCount} repos matched`}.
        </p>
      )}
    </>
  );
}
