import { describe, expect, it } from "vitest";
import { isSnoozed, pruneSnoozed, snoozeUntil, tabOf, timeLeft } from "./snooze";
import type { Classified } from "../github/types";

const now = new Date("2026-01-01T12:00:00Z");

describe("snooze", () => {
  it("snoozes for 24 hours by default", () => {
    expect(snoozeUntil(now)).toBe("2026-01-02T12:00:00.000Z");
  });
  it("is snoozed only until the end time", () => {
    const snoozed = { a: "2026-01-01T13:00:00Z" };
    expect(isSnoozed(snoozed, "a", now)).toBe(true);
    expect(isSnoozed(snoozed, "a", new Date("2026-01-01T13:00:00Z"))).toBe(false);
    expect(isSnoozed(snoozed, "b", now)).toBe(false);
  });
  it("prunes expired entries and keeps the object when nothing expired", () => {
    const snoozed = { old: "2026-01-01T11:00:00Z", live: "2026-01-01T13:00:00Z" };
    expect(pruneSnoozed(snoozed, now)).toEqual({ live: "2026-01-01T13:00:00Z" });
    const fresh = { live: "2026-01-01T13:00:00Z" };
    expect(pruneSnoozed(fresh, now)).toBe(fresh);
  });
  it("formats the time left", () => {
    expect(timeLeft("2026-01-01T12:45:00Z", now)).toBe("45m");
    expect(timeLeft("2026-01-02T07:00:00Z", now)).toBe("19h");
  });

  it("moves only action PRs to the snoozed tab, until the snooze lapses", () => {
    const item = (bucket: Classified["bucket"]) => ({ bucket, pr: { url: "a" } }) as Classified;
    const snoozed = { a: "2026-01-01T13:00:00Z" };
    expect(tabOf(item("action"), snoozed, now)).toBe("snoozed");
    expect(tabOf(item("ready"), snoozed, now)).toBe("ready");
    expect(tabOf(item("action"), snoozed, new Date("2026-01-01T13:00:00Z"))).toBe("action");
  });
});
