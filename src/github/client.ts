import { invoke } from "@tauri-apps/api/core";
import type { PullRequest } from "./types";

const REPO_QUERY = `
query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url isDraft updatedAt reviewDecision
        author { login }
        commits(last: 1) { nodes { commit { committedDate statusCheckRollup { state } } } }
        reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
        reviews(last: 50) { nodes { author { login } state submittedAt } }
        reviewThreads(first: 50) {
          nodes { isResolved comments(first: 30) { nodes { author { login } createdAt } } }
        }
        comments(last: 30) { nodes { author { login } createdAt } }
      }
    }
  }
}`;

async function gql<T>(variables: Record<string, string>, account: string | null): Promise<T> {
  const raw = await invoke<string>("gh_graphql", {
    body: JSON.stringify({ query: REPO_QUERY, variables }),
    account,
  });
  const json = JSON.parse(raw);
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPr(repo: string, n: any): PullRequest {
  const commit = n.commits.nodes[0]?.commit;
  return {
    repo,
    number: n.number,
    title: n.title,
    url: n.url,
    isDraft: n.isDraft,
    author: n.author,
    updatedAt: n.updatedAt,
    reviewDecision: n.reviewDecision,
    lastCommitAt: commit?.committedDate ?? null,
    ciState: commit?.statusCheckRollup?.state ?? null,
    requestedReviewers: n.reviewRequests.nodes
      .map((r: { requestedReviewer: { login?: string } | null }) => r.requestedReviewer?.login)
      .filter(Boolean),
    reviews: n.reviews.nodes,
    threads: n.reviewThreads.nodes,
    comments: n.comments.nodes,
  };
}

/** Fetch one repo's open PRs ("owner/name"), as the viewer of `account` (null = gh's active account). */
export async function fetchRepo(repo: string, account: string | null): Promise<{ me: string; prs: PullRequest[] }> {
  const [owner, name] = repo.split("/");
  const data = await gql<{
    viewer: { login: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository: { pullRequests: { nodes: any[] } } | null;
  }>({ owner, name }, account);
  if (!data.repository) throw new Error("Repo not found or no access");
  return { me: data.viewer.login, prs: data.repository.pullRequests.nodes.map((n) => toPr(repo, n)) };
}
