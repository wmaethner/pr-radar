import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { fetchAll, healthProviders, parseAnyRepo, providerOf, providers, repoDisplay } from "./index";

const KEYS = ["acme/site", "ado:acme/Web/site"];

describe("providers", () => {
  it("exactly one provider owns each key", () => {
    for (const key of KEYS) expect(providers.filter((p) => p.owns(key))).toHaveLength(1);
  });
  it("parse output is owned by the provider that produced it", () => {
    for (const input of ["https://github.com/acme/site", "https://dev.azure.com/acme/Web/_git/site"]) {
      const key = parseAnyRepo(input)!;
      expect(providerOf(key)!.parse(input)).toBe(key);
    }
  });
  it("parseAnyRepo rejects unknown input", () => {
    expect(parseAnyRepo("nonsense")).toBeNull();
  });
  it("splits keys for display", () => {
    expect(repoDisplay("acme/site")).toEqual({ owner: "acme", name: "site" });
    expect(repoDisplay("ado:acme/Web/site")).toEqual({ owner: "acme/Web", name: "site" });
  });
});

describe("healthProviders", () => {
  const ids = (repos: string[]) => healthProviders(repos).map((p) => p.id);

  it("checks GitHub even with no repos configured, which is the first-run case", () => {
    expect(ids([])).toEqual(["github"]);
  });
  it("leaves an unused host's CLI alone", () => {
    expect(ids(["acme/site"])).toEqual(["github"]);
  });
  it("adds a host once the user has a repo there", () => {
    expect(ids(["ado:acme/Web/site"]).sort()).toEqual(["ado", "github"]);
  });
  it("only names providers that can actually report health", () => {
    for (const p of healthProviders(KEYS)) expect(p.health).toBeTypeOf("function");
  });
});

describe("fetchAll", () => {
  it("reports a failing repo as an error result and still reports the others", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockRejectedValue(new Error("boom"));
    const seen: string[] = [];
    const results = await fetchAll(["acme/site", "ado:bad"], null, (r) => seen.push(r.repo));
    expect(results.map((r) => r.repo)).toEqual(["acme/site", "ado:bad"]);
    expect(results.every((r) => r.error && r.prs.length === 0 && r.me === "")).toBe(true);
    expect(seen.sort()).toEqual(["acme/site", "ado:bad"]);
  });
});
