import { describe, expect, it } from "vitest";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("falls back to defaults for empty, garbled or non-object JSON", () => {
    for (const raw of ["", "{nope", "null", "[]", "3"]) {
      expect(parseConfig(raw)).toMatchObject({ repos: [], pollMinutes: 5, view: "mine", tab: "action" });
    }
  });
  it("keeps valid saved values", () => {
    const saved = {
      repos: ["o/r"],
      pollMinutes: 10,
      view: "backlog",
      tab: "ready",
      snoozed: { u: "2026-01-01T00:00:00Z" },
      collapsed: ["k"],
      codeRoot: "/code",
      account: "me",
    };
    expect(parseConfig(JSON.stringify(saved))).toEqual(saved);
  });
  it("replaces only the fields with the wrong type", () => {
    const c = parseConfig(JSON.stringify({ repos: "o/r", pollMinutes: -1, tab: "nope", snoozed: { u: 5 }, account: "me" }));
    expect(c).toMatchObject({ repos: [], pollMinutes: 5, tab: "action", snoozed: {}, account: "me" });
  });
  it("ignores the legacy groupBy key", () => {
    expect(parseConfig(JSON.stringify({ groupBy: "repo", repos: ["o/r"] }))).not.toHaveProperty("groupBy");
  });
});
