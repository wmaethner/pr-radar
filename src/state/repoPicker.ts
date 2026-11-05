import type { RepoChoice } from "../providers/types";

/** Most repos the picker loads. Past this, the user narrows down or types the repo. */
export const MAX_LOADED = 500;

export interface PickerFilter {
  query: string;
  showArchived: boolean;
  /** Only repos under this owner (case-insensitive); null = any. */
  owner: string | null;
}

export const ownerOf = (key: string) => key.split("/")[0];

/** Append a freshly loaded page, skipping repos already present. Keeps the host's order. */
export function mergeChoices(have: RepoChoice[], more: RepoChoice[]): RepoChoice[] {
  const seen = new Set(have.map((c) => c.key.toLowerCase()));
  return [...have, ...more.filter((c) => !seen.has(c.key.toLowerCase()))];
}

/** The choices that match the filter, in their original order. Every search word must appear in the name or description. */
export function filterChoices(choices: RepoChoice[], f: PickerFilter): RepoChoice[] {
  const words = f.query.toLowerCase().split(/\s+/).filter(Boolean);
  const owner = f.owner?.toLowerCase() ?? null;
  return choices.filter((c) => {
    if (c.isArchived && !f.showArchived) return false;
    if (owner && ownerOf(c.key).toLowerCase() !== owner) return false;
    const hay = `${c.key} ${c.description ?? ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Owners present in the choices, biggest first, for the owner filter. Archived repos count only when shown. */
export function ownersOf(choices: RepoChoice[], showArchived: boolean): { owner: string; count: number }[] {
  const counts = new Map<string, { owner: string; count: number }>();
  for (const c of choices) {
    if (c.isArchived && !showArchived) continue;
    const owner = ownerOf(c.key);
    const entry = counts.get(owner.toLowerCase());
    if (entry) entry.count++;
    else counts.set(owner.toLowerCase(), { owner, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}

/** Keys not already in `have`, compared case-insensitively and without repeats, in order. */
export function newKeys(have: string[], keys: string[]): string[] {
  const seen = new Set(have.map((k) => k.toLowerCase()));
  return keys.filter((k) => {
    const lower = k.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}
