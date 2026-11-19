import type { Classified } from "../github/types";

const DAY = 24 * 60 * 60 * 1000;

export type AgeTone = "fresh" | "aging" | "old";

/** Compact length of time since `since`: "20m", "5h", "3d". */
export function ageLabel(since: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(since).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

/** How worried to look: under 2 days is fresh, from 2 days aging, from 5 days old. */
export function ageTone(since: string, now: Date): AgeTone {
  const days = (now.getTime() - new Date(since).getTime()) / DAY;
  return days >= 5 ? "old" : days >= 2 ? "aging" : "fresh";
}

/** Longest in its state first; PRs with no known start go last, newest PR number first among equals. */
export function byAge(a: Classified, b: Classified): number {
  if (a.since && b.since && a.since !== b.since) return a.since < b.since ? -1 : 1;
  if (!a.since !== !b.since) return a.since ? -1 : 1;
  return b.pr.number - a.pr.number;
}
