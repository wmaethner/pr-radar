/** Accepts "owner/name" or a github.com URL; returns "owner/name" or null. */
export function parseRepo(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Whether a remote URL (https or ssh form) points at the GitHub repo "owner/name". */
export function matchesGithubRemote(key: string, remote: string): boolean {
  const url = remote.trim().toLowerCase().replace(/\.git$/, "").replace(/\/$/, "").replace(":", "/");
  // The host must start at a boundary, so "notgithub.com/acme/site" is not "github.com/acme/site".
  const tail = `github.com/${key.toLowerCase()}`;
  return url === tail || url.endsWith(`/${tail}`) || url.endsWith(`@${tail}`);
}
