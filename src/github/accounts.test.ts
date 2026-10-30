import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { ghAuthStatus, listAccounts, onAccounts } from "./accounts";

const status = (hosts: unknown) => JSON.stringify({ found: true, hosts: JSON.stringify({ hosts }), detail: "" });

describe("ghAuthStatus", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  // The account picker and the sign-in panel both ask at startup: that should be one `gh`.
  it("shares one gh run between callers that overlap", async () => {
    vi.mocked(invoke).mockResolvedValue(status({}));
    await Promise.all([ghAuthStatus(), listAccounts()]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("runs gh again once the previous run has finished", async () => {
    vi.mocked(invoke).mockResolvedValue(status({}));
    await ghAuthStatus();
    await ghAuthStatus();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

describe("onAccounts", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  // A sign-in recheck started by the panel must update the picker too, without its own gh run.
  it("hands every finished run's accounts to listeners, whoever started it", async () => {
    const seen: string[][] = [];
    const off = onAccounts((a) => seen.push(a.map((x) => x.login)));
    vi.mocked(invoke).mockResolvedValueOnce(status({ "github.com": [{ login: "a", active: true }] }));
    await ghAuthStatus();
    vi.mocked(invoke).mockResolvedValueOnce(
      status({ "github.com": [{ login: "a", active: true }, { login: "b", active: false }] }),
    );
    await ghAuthStatus();
    off();
    vi.mocked(invoke).mockResolvedValueOnce(status({}));
    await ghAuthStatus();
    expect(seen).toEqual([["a"], ["a", "b"]]);
  });

  it("reports no accounts when gh's output can't be read", async () => {
    const seen: number[] = [];
    const off = onAccounts((a) => seen.push(a.length));
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ found: true, hosts: "not json", detail: "" }));
    await ghAuthStatus();
    off();
    expect(seen).toEqual([0]);
  });
});

describe("listAccounts", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("lists github.com logins", async () => {
    vi.mocked(invoke).mockResolvedValue(status({ "github.com": [{ login: "a", active: true, state: "success" }] }));
    expect(await listAccounts()).toEqual([{ login: "a", active: true }]);
  });

  it("throws when gh printed nothing, so App falls back to no accounts", async () => {
    vi.mocked(invoke).mockResolvedValue(JSON.stringify({ found: false, hosts: "", detail: "not found" }));
    await expect(listAccounts()).rejects.toThrow("not found");
  });
});
