import { describe, expect, it } from "vitest";
import { parseViewerRepos } from "./repos";

const node = (nameWithOwner: string, extra: object = {}) => ({
  nameWithOwner,
  description: null,
  isPrivate: false,
  isFork: false,
  isArchived: false,
  pushedAt: "2026-11-05T19:34:42Z",
  ...extra,
});

const page = (nodes: unknown[], hasNextPage = false, endCursor: string | null = null, totalCount = nodes.length) => ({
  viewer: { repositories: { totalCount, pageInfo: { hasNextPage, endCursor }, nodes } },
});

describe("parseViewerRepos", () => {
  it("maps repos to choices keyed by owner/name", () => {
    const r = parseViewerRepos({
      data: page([node("me/app", { description: "An app", isPrivate: true }), node("org/lib", { isFork: true })]) as never,
    });
    expect(r.choices).toEqual([
      { key: "me/app", description: "An app", isPrivate: true, isFork: false, isArchived: false, pushedAt: "2026-11-05T19:34:42Z" },
      { key: "org/lib", description: null, isPrivate: false, isFork: true, isArchived: false, pushedAt: "2026-11-05T19:34:42Z" },
    ]);
    expect(r.total).toBe(2);
    expect(r.warning).toBeUndefined();
  });

  it("returns the cursor only when there is another page", () => {
    expect(parseViewerRepos({ data: page([node("a/b")], true, "abc", 250) as never })).toMatchObject({ next: "abc", total: 250 });
    expect(parseViewerRepos({ data: page([node("a/b")], false, "abc") as never }).next).toBeNull();
  });

  it("drops entries GraphQL nulled out", () => {
    const r = parseViewerRepos({ data: page([node("a/b"), null, node("c/d")]) as never });
    expect(r.choices.map((c) => c.key)).toEqual(["a/b", "c/d"]);
  });

  it("keeps a partial list and reports the error as a warning", () => {
    const r = parseViewerRepos({
      data: page([node("a/b")]) as never,
      errors: [{ message: "Resource protected by organization SAML enforcement" }],
    });
    expect(r.choices).toHaveLength(1);
    expect(r.warning).toMatch(/SAML/);
  });

  it("fails when there is no data, using GitHub's message", () => {
    expect(() => parseViewerRepos({ data: null, errors: [{ message: "Bad credentials" }] })).toThrow("Bad credentials");
    expect(() => parseViewerRepos({ data: null })).toThrow("Could not list repos");
  });
});
