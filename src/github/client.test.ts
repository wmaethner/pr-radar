import { describe, expect, it } from "vitest";
import { toIssue, toPr, toRequestedAt, toStack } from "./client";
import type { RawIssue, RawPullRequest } from "./raw";

describe("toRequestedAt", () => {
  it("keeps the latest request per user and skips non-user reviewers", () => {
    expect(
      toRequestedAt([
        { createdAt: "2026-01-01T00:00:00Z", requestedReviewer: { login: "a" } },
        { createdAt: "2026-01-03T00:00:00Z", requestedReviewer: { login: "a" } },
        { createdAt: "2026-01-02T00:00:00Z", requestedReviewer: {} },
        { createdAt: "2026-01-02T00:00:00Z", requestedReviewer: null },
      ]),
    ).toEqual({ a: "2026-01-03T00:00:00Z" });
  });
});

describe("toStack", () => {
  const pr = (number: number) => ({
    number,
    title: `t${number}`,
    url: `u${number}`,
    state: "OPEN" as const,
    isDraft: false,
    reviewDecision: null,
  });
  it("is undefined when the PR is in no stack", () => {
    expect(toStack(null)).toBeUndefined();
    expect(toStack({ position: 1, stack: null })).toBeUndefined();
  });
  it("orders members by position and drops entries without a visible PR", () => {
    const stack = toStack({
      position: 2,
      stack: {
        size: 3,
        entries: {
          nodes: [
            { position: 3, pullRequest: pr(30) },
            null,
            { position: 1, pullRequest: pr(10) },
            { position: 2, pullRequest: null },
          ],
        },
      },
    });
    expect(stack?.position).toBe(2);
    expect(stack?.size).toBe(3);
    expect(stack?.members.map((m) => [m.position, m.number])).toEqual([
      [1, 10],
      [3, 30],
    ]);
  });
});

describe("toPr", () => {
  const raw = (over: Partial<RawPullRequest> = {}): RawPullRequest => ({
    number: 7,
    title: "Fix it",
    url: "https://github.com/o/r/pull/7",
    isDraft: false,
    updatedAt: "2026-01-05T00:00:00Z",
    reviewDecision: "APPROVED",
    author: { login: "me" },
    commits: { nodes: [{ commit: { committedDate: "2026-01-04T00:00:00Z", statusCheckRollup: { state: "FAILURE" } } }] },
    reviewRequests: { nodes: [{ requestedReviewer: { login: "a" } }, { requestedReviewer: null }, { requestedReviewer: {} }] },
    timelineItems: { nodes: [{ createdAt: "2026-01-02T00:00:00Z", requestedReviewer: { login: "a" } }] },
    reviews: { nodes: [] },
    reviewThreads: { nodes: [] },
    comments: {
      nodes: [
        { author: { login: "bot", __typename: "Bot" }, createdAt: "2026-01-03T00:00:00Z" },
        { author: { login: "bob", __typename: "User" }, createdAt: "2026-01-03T01:00:00Z" },
        { author: null, createdAt: "2026-01-03T02:00:00Z" },
      ],
    },
    stackEntry: null,
    ...over,
  });
  it("maps the node to a PullRequest", () => {
    expect(toPr("o/r", raw())).toMatchObject({
      repo: "o/r",
      number: 7,
      title: "Fix it",
      lastCommitAt: "2026-01-04T00:00:00Z",
      ciState: "FAILURE",
      requestedReviewers: ["a"],
      requestedAt: { a: "2026-01-02T00:00:00Z" },
      stack: undefined,
    });
  });
  it("marks bot commenters and tolerates a deleted author", () => {
    const { comments } = toPr("o/r", raw());
    expect(comments.map((c) => [c.author?.login, c.author?.isBot])).toEqual([
      ["bot", true],
      ["bob", false],
      [undefined, undefined],
    ]);
  });
  it("has no commit data when the PR has no commits", () => {
    expect(toPr("o/r", raw({ commits: { nodes: [] } }))).toMatchObject({ lastCommitAt: null, ciState: null });
  });
});

describe("toIssue", () => {
  it("flattens labels, assignees and linked PRs", () => {
    const n: RawIssue = {
      number: 3,
      title: "Bug",
      url: "u",
      createdAt: "c",
      updatedAt: "u",
      comments: { totalCount: 4 },
      labels: { nodes: [{ name: "bug" }] },
      assignees: { nodes: [{ login: "a" }] },
      closedByPullRequestsReferences: { nodes: [{ number: 9 }] },
    };
    expect(toIssue("o/r", n)).toMatchObject({ labels: ["bug"], assignees: ["a"], commentCount: 4, linkedPrs: [9] });
  });
});
