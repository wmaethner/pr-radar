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

export interface PullRequest {
  repo: string; // owner/name, or "ado:org/project/repo"
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  author: Actor | null;
  updatedAt: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  lastCommitAt: string | null;
  ciState: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;
  requestedReviewers: string[];
  reviews: Review[];
  threads: ReviewThread[];
  comments: TimedComment[];
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
