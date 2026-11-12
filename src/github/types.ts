/** The overall review verdict GitHub reports for a PR; null when no review is required. */
export type ReviewDecision = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;

export interface Actor {
  login: string; // identity used for matching against the viewer
  name?: string; // display name, when login is not human-readable
  isBot?: boolean; // GitHub App / bot account (e.g. Copilot), whose comments are informational
}

export interface TimedComment {
  author: Actor | null;
  createdAt: string;
}

export interface ReviewThread {
  isResolved: boolean;
  comments: { nodes: TimedComment[] };
}

export interface Review {
  author: Actor | null;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  submittedAt: string | null;
}

/** One PR in a stack, as the host reports it. `position` 1 is the one closest to the base branch. */
export interface StackMember {
  number: number;
  title: string;
  url: string;
  position: number;
  state: "OPEN" | "CLOSED" | "MERGED";
  isDraft: boolean;
  reviewDecision: ReviewDecision;
}

/** The stack a PR belongs to. `members` may be fewer than `size` if the host returned only part of it. */
export interface StackInfo {
  position: number;
  size: number;
  members: StackMember[];
}

export interface PullRequest {
  repo: string; // owner/name, or "ado:org/project/repo"
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  author: Actor | null;
  updatedAt: string;
  reviewDecision: ReviewDecision;
  lastCommitAt: string | null;
  ciState: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;
  requestedReviewers: string[];
  reviews: Review[];
  threads: ReviewThread[];
  comments: TimedComment[];
  stack?: StackInfo; // only for PRs in a stack
}

export interface Issue {
  repo: string;
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  assignees: string[]; // logins
  commentCount: number;
  linkedPrs: number[]; // open PRs that would close it
}

export type Bucket = "action" | "ready" | "waiting";

export interface Classified {
  pr: PullRequest;
  role: "author" | "reviewer";
  bucket: Bucket;
  reason: string;
}
