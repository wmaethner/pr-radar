/** ADO repos are stored in `Config.repos` as "ado:org/project/repo"; GitHub ones stay "owner/name". */
const PREFIX = "ado:";

export interface AdoRepo {
  org: string;
  project: string;
  repo: string;
}

export const isAdo = (key: string) => key.startsWith(PREFIX);

export function adoKey({ org, project, repo }: AdoRepo): string {
  return `${PREFIX}${org}/${project}/${repo}`;
}

export function fromAdoKey(key: string): AdoRepo | null {
  const [org, project, repo, ...rest] = key.slice(PREFIX.length).split("/");
  return isAdo(key) && org && project && repo && rest.length === 0 ? { org, project, repo } : null;
}

/**
 * Accepts https://dev.azure.com/{org}/{project}/_git/{repo} (optionally with an
 * `org@` user prefix or trailing path), the legacy https://{org}.visualstudio.com/...
 * form (optionally with a DefaultCollection segment), or a stored "ado:org/project/repo" key. Returns the key or null.
 */
export function parseAdoRepo(input: string): string | null {
  const text = input.trim();
  if (isAdo(text)) {
    const parsed = fromAdoKey(text);
    return parsed ? adoKey(parsed) : null;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  const segs = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let org: string;
  if (url.hostname === "dev.azure.com") {
    org = segs.shift() ?? "";
  } else if (url.hostname.endsWith(".visualstudio.com")) {
    org = url.hostname.slice(0, -".visualstudio.com".length);
    // Legacy URLs put a collection name before the project; it's always "DefaultCollection" on the cloud.
    if (segs[0]?.toLowerCase() === "defaultcollection") segs.shift();
  } else {
    return null;
  }
  const git = segs.indexOf("_git");
  const repo = segs[git + 1];
  if (!org || git < 0 || git > 1 || !repo) return null;
  // `.../org/_git/repo` has no project segment: the project is named after the repo.
  const project = git === 1 ? segs[0] : repo;
  return adoKey({ org, project, repo });
}
