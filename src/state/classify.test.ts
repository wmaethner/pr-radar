import { describe, expect, it } from "vitest";
import type { PullRequest } from "../github/types";
import { classify } from "./classify";

const ME = "me";
const them = { login: "them" };
const mine = { login: ME };

const pr = (over: Partial<PullRequest> = {}): PullRequest => ({
  repo: "o/r",
  number: 1,
  title: "t",
  url: "u",
  isDraft: false,
  author: mine,
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

describe("authored PRs", () => {
  it("flags failing CI", () => {
    expect(classify(pr({ ciState: "FAILURE" }), ME)).toMatchObject({ bucket: "action", reason: "CI failing" });
  });
  it("flags unresolved thread last answered by reviewer", () => {
    const threads = [{ isResolved: false, comments: { nodes: [{ author: them, createdAt: "2026-01-02T00:00:00Z" }] } }];
    expect(classify(pr({ threads }), ME)?.bucket).toBe("action");
  });
  it("ignores thread when I replied last", () => {
    const threads = [
      {
        isResolved: false,
        comments: {
          nodes: [
            { author: them, createdAt: "2026-01-02T00:00:00Z" },
            { author: mine, createdAt: "2026-01-03T00:00:00Z" },
          ],
        },
      },
    ];
    expect(classify(pr({ threads }), ME)?.bucket).toBe("waiting");
  });
  it("hands an open thread back to a reviewer I re-requested", () => {
    const threads = [{ isResolved: false, comments: { nodes: [{ author: them, createdAt: "2026-01-02T00:00:00Z" }] } }];
    const reviews = [{ author: them, state: "COMMENTED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(classify(pr({ threads, reviews, requestedReviewers: [them.login] }), ME)?.bucket).toBe("waiting");
  });
  it("keeps threads from other reviewers open when only one was re-requested", () => {
    const other = { login: "other", name: null };
    const threads = [
      { isResolved: false, comments: { nodes: [{ author: them, createdAt: "2026-01-02T00:00:00Z" }] } },
      { isResolved: false, comments: { nodes: [{ author: other, createdAt: "2026-01-02T00:00:00Z" }] } },
    ];
    const reviews = [{ author: them, state: "COMMENTED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(classify(pr({ threads, reviews, requestedReviewers: [them.login] }), ME)).toMatchObject({
      bucket: "action",
      reason: "1 unresolved comment thread",
    });
  });
  it("still flags open threads when the reviewer was never re-requested", () => {
    const threads = [{ isResolved: false, comments: { nodes: [{ author: them, createdAt: "2026-01-02T00:00:00Z" }] } }];
    expect(classify(pr({ threads, lastCommitAt: "2026-01-03T00:00:00Z" }), ME)?.bucket).toBe("action");
  });
  it("flags changes requested until a newer commit", () => {
    const reviews = [{ author: them, state: "CHANGES_REQUESTED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    const base = { reviewDecision: "CHANGES_REQUESTED" as const, reviews };
    expect(classify(pr(base), ME)?.reason).toBe("Changes requested");
    expect(classify(pr({ ...base, lastCommitAt: "2026-01-03T00:00:00Z" }), ME)?.bucket).toBe("waiting");
  });
  it("marks approved PR ready", () => {
    expect(classify(pr({ reviewDecision: "APPROVED" }), ME)?.bucket).toBe("ready");
  });
  it("flags new top-level comment from someone else", () => {
    const comments = [{ author: them, createdAt: "2026-01-02T00:00:00Z" }];
    expect(classify(pr({ comments }), ME)?.reason).toBe("New comment on your PR");
  });
  it("ignores top-level comments from bots", () => {
    const comments = [{ author: { login: "Copilot", isBot: true }, createdAt: "2026-01-02T00:00:00Z" }];
    expect(classify(pr({ comments }), ME)?.reason).toBe("Waiting on reviewers");
  });
  it("clears a top-level comment once I reply in a review thread", () => {
    const comments = [{ author: them, createdAt: "2026-01-02T00:00:00Z" }];
    const reviews = [{ author: mine, state: "COMMENTED" as const, submittedAt: "2026-01-03T00:00:00Z" }];
    expect(classify(pr({ comments, reviews }), ME)?.reason).not.toBe("New comment on your PR");
  });
  it("clears a top-level comment once I push a newer commit", () => {
    const comments = [{ author: them, createdAt: "2026-01-02T00:00:00Z" }];
    expect(classify(pr({ comments, lastCommitAt: "2026-01-03T00:00:00Z" }), ME)?.reason).not.toBe(
      "New comment on your PR",
    );
  });
  it("still flags a top-level comment that arrives after my last activity", () => {
    const comments = [{ author: them, createdAt: "2026-01-05T00:00:00Z" }];
    const reviews = [{ author: mine, state: "COMMENTED" as const, submittedAt: "2026-01-03T00:00:00Z" }];
    expect(classify(pr({ comments, reviews }), ME)?.reason).toBe("New comment on your PR");
  });
  it("treats own draft as waiting", () => {
    expect(classify(pr({ isDraft: true }), ME)).toMatchObject({ bucket: "waiting", reason: "Draft" });
  });
});

describe("reviewing PRs", () => {
  const theirs = (over: Partial<PullRequest> = {}) => pr({ author: them, ...over });
  it("ignores PRs I am not involved in", () => {
    expect(classify(theirs(), ME)).toBeNull();
  });
  it("flags review request", () => {
    expect(classify(theirs({ requestedReviewers: [ME] }), ME)).toMatchObject({ bucket: "action", reason: "Review requested" });
  });
  it("flags re-review request", () => {
    const reviews = [{ author: mine, state: "COMMENTED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(classify(theirs({ requestedReviewers: [ME], reviews }), ME)?.reason).toBe("Re-review requested");
  });
  it("flags author reply to my thread", () => {
    const threads = [
      {
        isResolved: false,
        comments: {
          nodes: [
            { author: mine, createdAt: "2026-01-02T00:00:00Z" },
            { author: them, createdAt: "2026-01-03T00:00:00Z" },
          ],
        },
      },
    ];
    expect(classify(theirs({ threads }), ME)?.reason).toBe("1 reply to your comments");
  });
  it("ignores replies to my thread made before I approved", () => {
    const threads = [
      {
        isResolved: false,
        comments: {
          nodes: [
            { author: mine, createdAt: "2026-01-02T00:00:00Z" },
            { author: them, createdAt: "2026-01-03T00:00:00Z" },
          ],
        },
      },
    ];
    const reviews = [{ author: mine, state: "APPROVED" as const, submittedAt: "2026-01-04T00:00:00Z" }];
    expect(classify(theirs({ threads, reviews }), ME)?.bucket).toBe("waiting");
  });
  it("flags new commits after my review", () => {
    const reviews = [{ author: mine, state: "COMMENTED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(classify(theirs({ reviews, lastCommitAt: "2026-01-03T00:00:00Z" }), ME)?.reason).toBe("New commits since your review");
  });
  it("stays quiet on new commits after I approved", () => {
    const reviews = [{ author: mine, state: "APPROVED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(classify(theirs({ reviews, lastCommitAt: "2026-01-03T00:00:00Z" }), ME)).toMatchObject({
      bucket: "waiting",
      reason: "You approved",
    });
  });
  it("stays quiet on replies to my threads after I approved", () => {
    const threads = [
      {
        isResolved: false,
        comments: {
          nodes: [
            { author: mine, createdAt: "2026-01-02T00:00:00Z" },
            { author: them, createdAt: "2026-01-05T00:00:00Z" },
          ],
        },
      },
    ];
    const reviews = [{ author: mine, state: "APPROVED" as const, submittedAt: "2026-01-03T00:00:00Z" }];
    expect(classify(theirs({ threads, reviews }), ME)).toMatchObject({ bucket: "waiting", reason: "You approved" });
  });
  it("brings an approved PR back when I'm re-requested", () => {
    const reviews = [{ author: mine, state: "APPROVED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(
      classify(theirs({ reviews, requestedReviewers: [ME], lastCommitAt: "2026-01-03T00:00:00Z" }), ME)?.reason,
    ).toBe("Re-review requested");
  });
  it("still flags new commits when my approval was dismissed", () => {
    const reviews = [{ author: mine, state: "DISMISSED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(classify(theirs({ reviews, lastCommitAt: "2026-01-03T00:00:00Z" }), ME)?.reason).toBe("New commits since your review");
  });
  it("flags new commits when my last verdict was changes requested after an approval", () => {
    const reviews = [
      { author: mine, state: "APPROVED" as const, submittedAt: "2026-01-02T00:00:00Z" },
      { author: mine, state: "CHANGES_REQUESTED" as const, submittedAt: "2026-01-03T00:00:00Z" },
    ];
    expect(classify(theirs({ reviews, lastCommitAt: "2026-01-04T00:00:00Z" }), ME)?.reason).toBe("New commits since your review");
  });
  it("waits on author when nothing new", () => {
    const reviews = [{ author: mine, state: "COMMENTED" as const, submittedAt: "2026-01-02T00:00:00Z" }];
    expect(classify(theirs({ reviews }), ME)?.bucket).toBe("waiting");
  });
});
