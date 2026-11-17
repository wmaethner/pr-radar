import { describe, expect, it } from "vitest";
import { matchesGithubRemote } from "./repo";

describe("matchesGithubRemote", () => {
  const match = (remote: string) => matchesGithubRemote("Acme/Site", remote);

  it("matches the https and ssh forms", () => {
    expect(match("https://github.com/acme/site")).toBe(true);
    expect(match("https://github.com/acme/site.git")).toBe(true);
    expect(match("git@github.com:acme/site.git")).toBe(true);
    expect(match("ssh://git@github.com/acme/site.git")).toBe(true);
  });
  it("ignores case, whitespace, a trailing slash and credentials", () => {
    expect(match("  https://GitHub.com/ACME/Site/\n")).toBe(true);
    expect(match("https://x-access-token:abc@github.com/acme/site.git")).toBe(true);
  });
  it("rejects other repos, owners and hosts", () => {
    expect(match("https://github.com/acme/site-two")).toBe(false);
    expect(match("https://github.com/other/acme/site")).toBe(false);
    expect(match("https://github.com/acme/other")).toBe(false);
    expect(match("https://notgithub.com/acme/site")).toBe(false);
    expect(match("https://gitlab.com/acme/site")).toBe(false);
    expect(match("")).toBe(false);
  });
});
