import { useEffect, useState } from "react";
import { openRepoInVscode } from "../platform/editor";

/** Small button that opens a repo's local clone in VS Code (or focuses its window). */
export function OpenRepo({ repo, root }: { repo: string; root: string | null }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(id);
  }, [error]);

  return (
    <>
      <button
        className="icon-btn open-repo"
        title="Open in VS Code"
        aria-label="Open in VS Code"
        onClick={async (e) => {
          e.stopPropagation(); // don't toggle the group this button sits in
          setError(await openRepoInVscode(root, repo));
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {"</>"}
      </button>
      {error && <span className="error open-repo-error">{error}</span>}
    </>
  );
}
