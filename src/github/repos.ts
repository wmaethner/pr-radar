import type { RepoChoice, RepoPage } from "../providers/types";
import { gqlRaw } from "./client";

const PAGE_SIZE = 100;

const VIEWER_REPOS_QUERY = `
query($after: String) {
  viewer {
    repositories(
      first: ${PAGE_SIZE}, after: $after
      orderBy: {field: PUSHED_AT, direction: DESC}
      affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes { nameWithOwner description isPrivate isFork isArchived pushedAt }
    }
  }
}`;

interface ViewerReposData {
  viewer: {
    repositories: {
      totalCount: number;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: ({
        nameWithOwner: string;
        description: string | null;
        isPrivate: boolean;
        isFork: boolean;
        isArchived: boolean;
        pushedAt: string | null;
      } | null)[];
    };
  } | null;
}

/**
 * Turn a `viewer.repositories` response into a page of choices. Pure. GitHub can answer with data
 * and `errors` together (e.g. an org that requires SAML SSO the token isn't authorised for): that
 * is a partial list plus a warning. No data at all is a failure.
 */
export function parseViewerRepos(json: { data: ViewerReposData | null; errors?: { message: string }[] }): RepoPage {
  const repos = json.data?.viewer?.repositories;
  if (!repos) throw new Error(json.errors?.[0]?.message ?? "Could not list repos");
  return {
    // GraphQL nulls an entry it couldn't show, rather than dropping it.
    choices: repos.nodes.filter((n) => n !== null).map(
      (n): RepoChoice => ({
        key: n.nameWithOwner,
        description: n.description,
        isPrivate: n.isPrivate,
        isFork: n.isFork,
        isArchived: n.isArchived,
        pushedAt: n.pushedAt,
      }),
    ),
    next: repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null,
    total: repos.totalCount,
    warning: json.errors?.[0]?.message,
  };
}

/** One page of the repos `account` can access (null = gh's active account), newest push first. */
export async function listRepos(account: string | null, cursor: string | null): Promise<RepoPage> {
  return parseViewerRepos(await gqlRaw<ViewerReposData>(VIEWER_REPOS_QUERY, { after: cursor }, account));
}
