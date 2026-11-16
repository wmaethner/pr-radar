import type { Classified } from "../github/types";
import type { Tab } from "../store/config";
/** Snoozed PRs: PR url -> ISO time the snooze ends. */
export type Snoozed = Record<string, string>;

export const SNOOZE_HOURS = 24;

export const snoozeUntil = (now: Date, hours = SNOOZE_HOURS) =>
  new Date(now.getTime() + hours * 3_600_000).toISOString();

export const isSnoozed = (snoozed: Snoozed, url: string, now: Date) =>
  url in snoozed && new Date(snoozed[url]).getTime() > now.getTime();

/** Drops expired entries; returns the same object when nothing expired. */
export function pruneSnoozed(snoozed: Snoozed, now: Date): Snoozed {
  const live = Object.entries(snoozed).filter(([, until]) => new Date(until).getTime() > now.getTime());
  return live.length === Object.keys(snoozed).length ? snoozed : Object.fromEntries(live);
}

/** "19h", "45m": time left on a snooze, rounded up to the minute. */
export function timeLeft(until: string, now: Date): string {
  const mins = Math.max(1, Math.ceil((new Date(until).getTime() - now.getTime()) / 60000));
  return mins < 60 ? `${mins}m` : `${Math.ceil(mins / 60)}h`;
}

/** The tab a classified PR shows under: only `action` PRs can be snoozed, and a lapsed snooze no longer counts. */
export const tabOf = (item: Classified, snoozed: Snoozed, now: Date): Tab =>
  item.bucket === "action" && isSnoozed(snoozed, item.pr.url, now) ? "snoozed" : item.bucket;
