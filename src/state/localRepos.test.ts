import { describe, expect, it } from "vitest";
import { findClone, matchClones, type LocalRepo, type RemoteMatcher } from "./localRepos";

// Matches when the remote ends with the key, which is enough to test the lookup itself.
const matches: RemoteMatcher = (key, remote) => remote.endsWith(key);

const clones: LocalRepo[] = [
  { path: "/code/site", remotes: ["git@github.com:me/site", "git@github.com:acme/site"] },
  { path: "/code/api", remotes: ["git@github.com:acme/api"] },
];

describe("findClone", () => {
  it("finds a clone through any of its remotes", () => {
    expect(findClone(clones, "acme/site", matches)).toBe("/code/site");
    expect(findClone(clones, "me/site", matches)).toBe("/code/site");
  });
  it("returns null when nothing matches or there are no clones", () => {
    expect(findClone(clones, "acme/web", matches)).toBeNull();
    expect(findClone([], "acme/site", matches)).toBeNull();
  });
  it("takes the first clone when two match", () => {
    const twice = [{ path: "/a", remotes: ["x/acme/site"] }, { path: "/b", remotes: ["y/acme/site"] }];
    expect(findClone(twice, "acme/site", matches)).toBe("/a");
  });
});

describe("matchClones", () => {
  it("maps each repo that has a clone and leaves out the rest", () => {
    expect(matchClones(clones, ["acme/site", "acme/api", "acme/web"], matches)).toEqual({
      "acme/site": "/code/site",
      "acme/api": "/code/api",
    });
  });
  it("is empty without keys", () => {
    expect(matchClones(clones, [], matches)).toEqual({});
  });
});
