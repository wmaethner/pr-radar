import { describe, expect, it } from "vitest";
import type { Issue, PullRequest } from "../github/types";
import { backlogIssues, backlogPrs, reviewersOf } from "./backlog";

const ME = "me";

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  repo: "o/r",
  number: 1,
  title: "t",
  url: "u",
  isDraft: false,
  author: { login: "them" },
  updatedAt: "2026-01-01T00:00:00Z",
  reviewDecision: null,
  lastCommitAt: "2026-01-01T00:00:00Z",
  ciState: "SUCCESS",
  requestedReviewers: [],
  reviews: [],
  threads: [],
  comments: [],
  ...over,
});

const issue = (over: Partial<Issue> = {}): Issue => ({
  repo: "o/r",
  number: 1,
  title: "t",
  url: "u",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  labels: [],
  assignees: [],
  commentCount: 0,
  linkedPrs: [],
  ...over,
});

describe("reviewersOf", () => {
  it("combines requested and past reviewers once, without the author", () => {
    const p = pr({
      requestedReviewers: ["a", "b", "them"],
      reviews: [{ author: { login: "b" }, state: "APPROVED", submittedAt: "x" }],
    });
    expect(reviewersOf(p)).toEqual([
      { login: "a", reviewed: false },
      { login: "b", reviewed: true },
    ]);
  });
});

describe("backlogPrs", () => {
  it("skips drafts, own PRs, approved PRs and ones the user is already involved in", () => {
    const prs = [
      pr({ number: 1, isDraft: true }),
      pr({ number: 2, author: { login: ME } }),
      pr({ number: 3, reviewDecision: "APPROVED" }),
      pr({ number: 4, requestedReviewers: [ME] }),
      pr({ number: 5 }),
    ];
    expect(backlogPrs(prs, ME).map((b) => b.pr.number)).toEqual([5]);
  });
  it("lists PRs with nobody assigned first", () => {
    const prs = [pr({ number: 9, requestedReviewers: ["a"] }), pr({ number: 3 }), pr({ number: 5 })];
    expect(backlogPrs(prs, ME).map((b) => b.pr.number)).toEqual([5, 3, 9]);
  });
});

describe("backlogIssues", () => {
  it("orders unassigned, then yours, then someone else's, and labels each", () => {
    const issues = [
      issue({ number: 1, assignees: ["x"] }),
      issue({ number: 2, assignees: [ME, "x"] }),
      issue({ number: 3 }),
      issue({ number: 4 }),
    ];
    expect(backlogIssues(issues, ME).map((i) => [i.issue.number, i.assignment])).toEqual([
      [4, "unassigned"],
      [3, "unassigned"],
      [2, "you"],
      [1, "others"],
    ]);
  });
});
