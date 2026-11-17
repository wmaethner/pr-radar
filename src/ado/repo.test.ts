import { describe, expect, it } from "vitest";
import { matchesAdoRemote } from "./repo";

describe("matchesAdoRemote", () => {
  const key = "ado:acme/My Proj/site";

  it("matches https, legacy visualstudio.com and ssh remotes", () => {
    expect(matchesAdoRemote(key, "https://acme@dev.azure.com/acme/My%20Proj/_git/site")).toBe(true);
    expect(matchesAdoRemote(key, "https://dev.azure.com/acme/My%20Proj/_git/site.git")).toBe(true);
    expect(matchesAdoRemote(key, "https://acme.visualstudio.com/My%20Proj/_git/site")).toBe(true);
    expect(matchesAdoRemote(key, "git@ssh.dev.azure.com:v3/acme/My Proj/site")).toBe(true);
  });
  it("matches a repo named like its project, which may drop the project segment", () => {
    expect(matchesAdoRemote("ado:acme/site/site", "https://dev.azure.com/acme/_git/site")).toBe(true);
    expect(matchesAdoRemote("ado:acme/site/site", "https://dev.azure.com/acme/site/_git/site")).toBe(true);
  });
  it("is case-insensitive and ignores a trailing slash", () => {
    expect(matchesAdoRemote(key, "https://dev.azure.com/ACME/my%20proj/_git/Site/")).toBe(true);
  });
  it("rejects other orgs, projects and repos", () => {
    expect(matchesAdoRemote(key, "https://dev.azure.com/other/My%20Proj/_git/site")).toBe(false);
    expect(matchesAdoRemote(key, "https://dev.azure.com/acme/Other/_git/site")).toBe(false);
    expect(matchesAdoRemote(key, "https://dev.azure.com/acme/My%20Proj/_git/other")).toBe(false);
  });
  it("needs the whole org name, not just part of it", () => {
    expect(matchesAdoRemote("ado:ac/proj/site", "https://dev.azure.com/acme/proj/_git/site")).toBe(false);
    expect(matchesAdoRemote("ado:ac/proj/site", "https://dev.azure.com/ac/proj/_git/site")).toBe(true);
  });
  it("rejects keys that are not ADO keys", () => {
    expect(matchesAdoRemote("acme/site", "https://github.com/acme/site")).toBe(false);
  });
});
