import { describe, expect, it } from "vitest";
import type { PullRequest, StackMember } from "../github/types";
import { memberStatus, stackChip, stackStatus } from "./stack";

const member = (position: number, extra: Partial<StackMember> = {}): StackMember => ({
  number: 100 + position,
  title: `PR ${position}`,
  url: `https://example.com/${100 + position}`,
  position,
  state: "OPEN",
  isDraft: false,
  reviewDecision: "APPROVED",
  ...extra,
});

/** A PR whose own number matches the member at `current`. */
const pr = (current: number, members: StackMember[], size = members.length): PullRequest =>
  ({
    number: 100 + current,
    stack: { position: current, size, members },
  }) as PullRequest;

describe("memberStatus", () => {
  it("applies the same bar as classify's ready", () => {
    expect(memberStatus(member(1))).toBe("ready");
    expect(memberStatus(member(1, { isDraft: true }))).toBe("draft");
    expect(memberStatus(member(1, { reviewDecision: "CHANGES_REQUESTED" }))).toBe("changes");
    expect(memberStatus(member(1, { reviewDecision: "REVIEW_REQUIRED" }))).toBe("unapproved");
    expect(memberStatus(member(1, { reviewDecision: null }))).toBe("unapproved");
    expect(memberStatus(member(1, { state: "MERGED" }))).toBe("merged");
    expect(memberStatus(member(1, { state: "CLOSED" }))).toBe("closed");
  });
});

describe("stackStatus", () => {
  it("is null for a PR that isn't in a stack", () => {
    expect(stackStatus({ number: 1 } as PullRequest)).toBeNull();
  });
  it("is null when every other member has merged or closed", () => {
    const members = [member(1, { state: "MERGED" }), member(2), member(3, { state: "CLOSED" })];
    expect(stackStatus(pr(2, members))).toBeNull();
  });
  it("counts the other open members that aren't ready", () => {
    const members = [member(1), member(2, { reviewDecision: "REVIEW_REQUIRED" }), member(3, { isDraft: true })];
    const s = stackStatus(pr(1, members))!;
    expect(s.blocking).toBe(2);
    expect(s.position).toBe(1);
    expect(s.size).toBe(3);
    expect(s.members.find((m) => m.isCurrent)?.number).toBe(101);
  });
  it("doesn't count this PR or merged members as blocking", () => {
    const members = [member(1, { state: "MERGED" }), member(2, { reviewDecision: "REVIEW_REQUIRED" }), member(3)];
    expect(stackStatus(pr(3, members))!.blocking).toBe(1);
    expect(stackStatus(pr(2, members))!.blocking).toBe(0);
  });
  it("notes members the host didn't return", () => {
    const s = stackStatus(pr(1, [member(1), member(2)], 5))!;
    expect(s.hidden).toBe(3);
  });
  it("gives every member a label", () => {
    const s = stackStatus(pr(1, [member(1), member(2, { isDraft: true })]))!;
    expect(s.members.map((m) => m.label)).toEqual(["Approved", "Draft"]);
  });
});

describe("stackChip", () => {
  const status = (members: StackMember[], current = 1, size?: number) => stackStatus(pr(current, members, size))!;

  it("warns on a ready PR whose stack isn't ready", () => {
    const chip = stackChip(status([member(1), member(2, { reviewDecision: "REVIEW_REQUIRED" })]), "ready");
    expect(chip).toEqual({ text: "Stack 1/2 · 1 not ready", tone: "warn" });
  });
  it("says so when the whole stack is ready", () => {
    expect(stackChip(status([member(1), member(2)]), "ready")).toEqual({ text: "Stack 1/2 · all ready", tone: "ok" });
  });
  it("treats unseen members as not ready", () => {
    expect(stackChip(status([member(1), member(2)], 1, 4), "ready").tone).toBe("warn");
  });
  it("is only informative on a PR that isn't ready", () => {
    const s = status([member(1), member(2, { reviewDecision: "REVIEW_REQUIRED" })]);
    expect(stackChip(s, "action")).toEqual({ text: "Stack 1/2", tone: "plain" });
    expect(stackChip(s, "waiting").tone).toBe("plain");
  });
});
