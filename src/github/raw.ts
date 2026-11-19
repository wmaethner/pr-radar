import type { Review, ReviewDecision, ReviewThread, StackMember } from "./types";

/**
 * The shape of the nodes REPO_QUERY (client.ts) asks for. Keep the two in step: a field read in
 * `toPr`/`toIssue` that isn't here is a compile error. Where GitHub can answer null (a deleted
 * author, a stack entry whose PR we can't see) the type says so.
 */

export interface RawPullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  updatedAt: string;
  reviewDecision: ReviewDecision;
  author: { login: string } | null;
  commits: {
    nodes: {
      commit: {
        committedDate: string;
        statusCheckRollup: { state: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" } | null;
      };
    }[];
  };
  reviewRequests: { nodes: { requestedReviewer: { login?: string } | null }[] };
  timelineItems: { nodes: RawReviewRequestedEvent[] };
  reviews: { nodes: Review[] };
  reviewThreads: { nodes: ReviewThread[] };
  comments: { nodes: { author: { login: string; __typename: string } | null; createdAt: string }[] };
  stackEntry: RawStackEntry | null;
}

/** `... on ReviewRequestedEvent`: other event types, and team reviewers, leave the fields out. */
export interface RawReviewRequestedEvent {
  createdAt?: string;
  requestedReviewer?: { login?: string } | null;
}

export interface RawStackEntry {
  position: number;
  stack: {
    size: number;
    entries: { nodes: ({ position: number; pullRequest: Omit<StackMember, "position"> | null } | null)[] };
  } | null;
}

export interface RawIssue {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  comments: { totalCount: number };
  labels: { nodes: { name: string }[] };
  assignees: { nodes: { login: string }[] };
  closedByPullRequestsReferences: { nodes: { number: number }[] };
}

export interface RawRepoData {
  viewer: { login: string };
  repository: { pullRequests: { nodes: RawPullRequest[] }; issues: { nodes: RawIssue[] } } | null;
}
