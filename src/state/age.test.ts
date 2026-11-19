import { describe, expect, it } from "vitest";
import type { Classified } from "../github/types";
import { ageLabel, ageTone, byAge } from "./age";

const now = new Date("2026-01-10T00:00:00Z");
const item = (number: number, since: string | null) => ({ pr: { number }, since }) as unknown as Classified;

describe("ageLabel", () => {
  it("uses minutes, hours then days", () => {
    expect(ageLabel("2026-01-09T23:40:00Z", now)).toBe("20m");
    expect(ageLabel("2026-01-09T19:00:00Z", now)).toBe("5h");
    expect(ageLabel("2026-01-07T00:00:00Z", now)).toBe("3d");
  });
});

describe("ageTone", () => {
  it("escalates at 2 and 5 days", () => {
    expect(ageTone("2026-01-09T00:00:00Z", now)).toBe("fresh");
    expect(ageTone("2026-01-08T00:00:00Z", now)).toBe("aging");
    expect(ageTone("2026-01-05T00:00:00Z", now)).toBe("old");
  });
});

describe("byAge", () => {
  it("puts the longest-waiting first and unknown last", () => {
    const sorted = [item(1, null), item(2, "2026-01-09T00:00:00Z"), item(3, "2026-01-02T00:00:00Z")].sort(byAge);
    expect(sorted.map((i) => i.pr.number)).toEqual([3, 2, 1]);
  });
  it("breaks ties with the newest PR number", () => {
    expect([item(1, null), item(5, null)].sort(byAge).map((i) => i.pr.number)).toEqual([5, 1]);
  });
});
