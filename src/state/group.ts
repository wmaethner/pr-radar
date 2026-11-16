import type { Classified } from "../github/types";

/** Split items into [repo, items] groups, keeping first-seen order. */
export function groupByRepo(items: Classified[]): [string, Classified[]][] {
  const map = new Map<string, Classified[]>();
  for (const i of items) map.set(i.pr.repo, [...(map.get(i.pr.repo) ?? []), i]);
  return [...map];
}
