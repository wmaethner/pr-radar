import { repoDisplay } from "./providers";

export function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export const labelOf = (key: string) => {
  const { owner, name } = repoDisplay(key);
  return owner ? `${owner}/${name}` : name;
};

/** Repo name with the owner dimmed so the repo itself stands out. */
export function RepoName({ repo }: { repo: string }) {
  const { owner, name } = repoDisplay(repo);
  return (
    <span className="repo-name">
      <span className="owner">{owner}/</span>
      {name}
    </span>
  );
}
