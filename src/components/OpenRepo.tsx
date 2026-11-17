import { useOpenRepo } from "../hooks/useOpenRepo";

/** Small button that opens a repo's local clone in VS Code (or focuses its window). */
export function OpenRepo({ repo }: { repo: string }) {
  const open = useOpenRepo();
  return (
    <button
      className="icon-btn open-repo"
      title="Open in VS Code"
      aria-label="Open in VS Code"
      onClick={(e) => {
        e.stopPropagation(); // don't toggle the group this button sits in
        open(repo);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {"</>"}
    </button>
  );
}
