import { describe, expect, it } from "vitest";
import type { Classified } from "../github/types";
import { groupByRepo } from "./group";

const item = (repo: string, number: number) => ({ pr: { repo, number } }) as Classified;

describe("groupByRepo", () => {
  it("groups by repo and keeps first-seen order", () => {
    const groups = groupByRepo([item("b", 1), item("a", 2), item("b", 3)]);
    expect(groups.map(([repo, list]) => [repo, list.map((i) => i.pr.number)])).toEqual([
      ["b", [1, 3]],
      ["a", [2]],
    ]);
  });
  it("returns nothing for no items", () => {
    expect(groupByRepo([])).toEqual([]);
  });
});
