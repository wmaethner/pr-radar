import type { Bucket, PullRequest, StackMember } from "../github/types";

export type MemberStatus = "ready" | "draft" | "changes" | "unapproved" | "merged" | "closed";

export interface StackMemberView {
  number: number;
  title: string;
  url: string;
  position: number;
  status: MemberStatus;
  label: string;
  isCurrent: boolean;
}

export interface StackStatus {
  position: number;
  size: number;
  members: StackMemberView[];
  /** Open members other than this PR that aren't ready yet. */
  blocking: number;
  /** Members the host didn't return (stack bigger than what was asked for). */
  hidden: number;
}

const LABELS: Record<MemberStatus, string> = {
  ready: "Approved",
  draft: "Draft",
  changes: "Changes requested",
  unapproved: "Not approved yet",
  merged: "Merged",
  closed: "Closed",
};

/** Same bar as `classify` uses for "ready" on one PR: open, not a draft, and approved. */
export function memberStatus(m: StackMember): MemberStatus {
  if (m.state === "MERGED") return "merged";
  if (m.state === "CLOSED") return "closed";
  if (m.isDraft) return "draft";
  if (m.reviewDecision === "APPROVED") return "ready";
  if (m.reviewDecision === "CHANGES_REQUESTED") return "changes";
  return "unapproved";
}

/**
 * Where a PR stands in its stack, or null when it isn't in one or nothing else in the stack is
 * still open (merged and closed PRs no longer hold anything up). Pure: `classify` doesn't know
 * about stacks, this only annotates what it decided.
 */
export function stackStatus(pr: PullRequest): StackStatus | null {
  const stack = pr.stack;
  if (!stack) return null;
  const members: StackMemberView[] = stack.members.map((m) => {
    const status = memberStatus(m);
    return {
      number: m.number,
      title: m.title,
      url: m.url,
      position: m.position,
      status,
      label: LABELS[status],
      isCurrent: m.number === pr.number,
    };
  });
  const hidden = Math.max(0, stack.size - members.length);
  const open = members.filter((m) => m.status !== "merged" && m.status !== "closed");
  const others = open.filter((m) => !m.isCurrent);
  if (others.length === 0 && hidden === 0) return null;
  return {
    position: stack.position,
    size: stack.size,
    members,
    blocking: others.filter((m) => m.status !== "ready").length,
    hidden,
  };
}

export interface StackChip {
  text: string;
  /** warn: this PR is ready but the stack isn't; ok: the whole stack is ready; plain: just informative. */
  tone: "warn" | "ok" | "plain";
}

/** The short label shown on a row. It only raises a warning for a PR that is otherwise ready to merge. */
export function stackChip(s: StackStatus, bucket: Bucket): StackChip {
  const base = `Stack ${s.position}/${s.size}`;
  if (bucket !== "ready") return { text: base, tone: "plain" };
  const waiting = s.blocking + s.hidden;
  if (waiting === 0) return { text: `${base} · all ready`, tone: "ok" };
  return { text: `${base} · ${waiting} not ready`, tone: "warn" };
}
