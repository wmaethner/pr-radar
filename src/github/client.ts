import { invoke } from "@tauri-apps/api/core";
import type { Issue, PullRequest } from "./types";

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
        comments(last: 30) { nodes { author { login __typename } createdAt } }
      }
    }
    issues(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url createdAt updatedAt
        comments { totalCount }
        labels(first: 10) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        closedByPullRequestsReferences(first: 5, includeClosedPrs: false) { nodes { number } }
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
    comments: n.comments.nodes.map((c: { author: { login: string; __typename: string } | null; createdAt: string }) => ({
      author: c.author && { login: c.author.login, isBot: c.author.__typename === "Bot" },
      createdAt: c.createdAt,
    })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toIssue(repo: string, n: any): Issue {
  return {
    repo,
    number: n.number,
    title: n.title,
    url: n.url,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    labels: n.labels.nodes.map((l: { name: string }) => l.name),
    assignees: n.assignees.nodes.map((a: { login: string }) => a.login),
    commentCount: n.comments.totalCount,
    linkedPrs: n.closedByPullRequestsReferences.nodes.map((p: { number: number }) => p.number),
  };
}

/** Fetch one repo's open PRs ("owner/name"), as the viewer of `account` (null = gh's active account). */
export async function fetchRepo(
  repo: string,
  account: string | null,
): Promise<{ me: string; prs: PullRequest[]; issues: Issue[] }> {
  const [owner, name] = repo.split("/");
  const data = await gql<{
    viewer: { login: string };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository: { pullRequests: { nodes: any[] }; issues: { nodes: any[] } } | null;
  }>({ owner, name }, account);
  if (!data.repository) throw new Error("Repo not found or no access");
  return {
    me: data.viewer.login,
    prs: data.repository.pullRequests.nodes.map((n) => toPr(repo, n)),
    issues: data.repository.issues.nodes.map((n) => toIssue(repo, n)),
  };
}
