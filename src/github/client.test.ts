import { describe, expect, it } from "vitest";
import { toRequestedAt } from "./client";

describe("toRequestedAt", () => {
  it("keeps the latest request per user and skips non-user reviewers", () => {
    expect(
      toRequestedAt([
        { createdAt: "2026-01-01T00:00:00Z", requestedReviewer: { login: "a" } },
        { createdAt: "2026-01-03T00:00:00Z", requestedReviewer: { login: "a" } },
        { createdAt: "2026-01-02T00:00:00Z", requestedReviewer: {} },
        { createdAt: "2026-01-02T00:00:00Z", requestedReviewer: null },
      ]),
    ).toEqual({ a: "2026-01-03T00:00:00Z" });
  });
});
