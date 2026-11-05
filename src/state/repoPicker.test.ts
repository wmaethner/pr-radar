import { describe, expect, it } from "vitest";
import type { RepoChoice } from "../providers/types";
import { filterChoices, mergeChoices, newKeys, ownersOf, type PickerFilter } from "./repoPicker";

const repo = (key: string, extra: Partial<RepoChoice> = {}): RepoChoice => ({
  key,
  description: null,
  isPrivate: false,
  isFork: false,
  isArchived: false,
  pushedAt: null,
  ...extra,
});

const all = [
  repo("me/pr-radar", { description: "PR dashboard" }),
  repo("acme/api"),
  repo("acme/web", { description: "Marketing site" }),
  repo("acme/old-api", { isArchived: true }),
  repo("me/notes"),
];
const noFilter: PickerFilter = { query: "", showArchived: false, owner: null };

describe("filterChoices", () => {
  const keys = (f: Partial<typeof noFilter>) => filterChoices(all, { ...noFilter, ...f }).map((c) => c.key);

  it("hides archived repos unless asked", () => {
    expect(keys({})).not.toContain("acme/old-api");
    expect(keys({ showArchived: true })).toContain("acme/old-api");
  });
  it("matches name or description, ignoring case", () => {
    expect(keys({ query: "RADAR" })).toEqual(["me/pr-radar"]);
    expect(keys({ query: "marketing" })).toEqual(["acme/web"]);
  });
  it("needs every word to match, in any order", () => {
    expect(keys({ query: "acme api" })).toEqual(["acme/api"]);
    expect(keys({ query: "api acme" })).toEqual(["acme/api"]);
    expect(keys({ query: "acme nothing" })).toEqual([]);
  });
  it("filters by owner, ignoring case", () => {
    expect(keys({ owner: "ACME" })).toEqual(["acme/api", "acme/web"]);
  });
  it("keeps the original order", () => {
    expect(keys({})).toEqual(["me/pr-radar", "acme/api", "acme/web", "me/notes"]);
  });
});

describe("ownersOf", () => {
  it("counts per owner, biggest first, leaving out hidden archived repos", () => {
    expect(ownersOf(all, false)).toEqual([
      { owner: "acme", count: 2 },
      { owner: "me", count: 2 },
    ]);
    expect(ownersOf(all, true)[0]).toEqual({ owner: "acme", count: 3 });
  });
});

describe("mergeChoices", () => {
  it("appends new repos and skips ones already loaded, ignoring case", () => {
    const merged = mergeChoices([repo("a/b")], [repo("A/B"), repo("c/d")]);
    expect(merged.map((c) => c.key)).toEqual(["a/b", "c/d"]);
  });
});

describe("newKeys", () => {
  it("drops repos already added and repeats, ignoring case", () => {
    expect(newKeys(["a/b"], ["A/B", "c/d", "C/D", "e/f"])).toEqual(["c/d", "e/f"]);
  });
});
