import type { Issue, PullRequest } from "../github/types";
import { classify } from "./classify";

/** Everyone attached to a PR as a reviewer: requested ones plus those who already reviewed, minus the author. */
export interface Reviewer {
  login: string;
  reviewed: boolean;
}

export function reviewersOf(pr: PullRequest): Reviewer[] {
  const reviewed = new Set(
    pr.reviews.filter((r) => r.state !== "PENDING").flatMap((r) => (r.author ? [r.author.login] : [])),
  );
  const logins = new Set([...pr.requestedReviewers, ...reviewed]);
  if (pr.author) logins.delete(pr.author.login);
  return [...logins].map((login) => ({ login, reviewed: reviewed.has(login) }));
}

export interface BacklogPr {
  pr: PullRequest;
  reviewers: Reviewer[];
}

/**
 * Open PRs the user could review but isn't already involved in (those live in the status tabs):
 * not a draft, not the user's own, not already approved. PRs with nobody assigned come first.
 */
export function backlogPrs(prs: PullRequest[], me: string): BacklogPr[] {
  return prs
    .filter((pr) => !pr.isDraft && pr.author?.login !== me && pr.reviewDecision !== "APPROVED" && classify(pr, me) === null)
    .map((pr) => ({ pr, reviewers: reviewersOf(pr) }))
    .sort((a, b) => Number(a.reviewers.length > 0) - Number(b.reviewers.length > 0) || b.pr.number - a.pr.number);
}

export type IssueAssignment = "unassigned" | "you" | "others";

export function assignmentOf(issue: Issue, me: string): IssueAssignment {
  if (issue.assignees.length === 0) return "unassigned";
  return issue.assignees.includes(me) ? "you" : "others";
}

const ORDER: Record<IssueAssignment, number> = { unassigned: 0, you: 1, others: 2 };

/** All open issues: unassigned first, then yours, then ones someone else has. Newest number first within each. */
export function backlogIssues(issues: Issue[], me: string): { issue: Issue; assignment: IssueAssignment }[] {
  return issues
    .map((issue) => ({ issue, assignment: assignmentOf(issue, me) }))
    .sort((a, b) => ORDER[a.assignment] - ORDER[b.assignment] || b.issue.number - a.issue.number);
}
