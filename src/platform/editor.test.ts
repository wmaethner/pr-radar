import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const openUrl = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

const { findLocalRepo, openRepoInVscode, vscodeUrl } = await import("./editor");

describe("vscodeUrl", () => {
  it("builds a file link from a macOS path", () => {
    expect(vscodeUrl("/Users/me/code/site")).toBe("vscode://file/Users/me/code/site?windowId=_blank");
  });
  it("builds a file link from a Windows path", () => {
    expect(vscodeUrl("C:\\Users\\me\\code\\site")).toBe("vscode://file/C:/Users/me/code/site?windowId=_blank");
  });
  it("escapes spaces and the characters that would end the path early", () => {
    expect(vscodeUrl("/Users/me/my code")).toBe("vscode://file/Users/me/my%20code?windowId=_blank");
    expect(vscodeUrl("/Users/me/c#/what?")).toBe("vscode://file/Users/me/c%23/what%3F?windowId=_blank");
  });
});

describe("findLocalRepo", () => {
  beforeEach(() => {
    invoke.mockReset();
    openUrl.mockReset();
  });

  it("returns the clone whose remote matches, whichever of its remotes that is", async () => {
    invoke.mockResolvedValue([
      { path: "/code/other", remotes: ["https://github.com/acme/other.git"] },
      { path: "/code/site", remotes: ["git@github.com:me/site.git", "git@github.com:acme/site.git"] },
    ]);
    expect(await findLocalRepo("/code", "acme/site")).toBe("/code/site");
    expect(invoke).toHaveBeenCalledWith("scan_repos", { root: "/code" });
  });
  it("returns null when no clone matches", async () => {
    invoke.mockResolvedValue([{ path: "/code/other", remotes: ["https://github.com/acme/other.git"] }]);
    expect(await findLocalRepo("/code", "acme/site")).toBeNull();
  });
});

describe("openRepoInVscode", () => {
  beforeEach(() => {
    invoke.mockReset();
    openUrl.mockReset();
  });

  it("asks for the code folder first", async () => {
    expect(await openRepoInVscode(null, "acme/site")).toMatch(/code folder/);
    expect(openUrl).not.toHaveBeenCalled();
  });
  it("opens the matching clone and reports no error", async () => {
    invoke.mockResolvedValue([{ path: "/code/site", remotes: ["https://github.com/acme/site"] }]);
    expect(await openRepoInVscode("/code", "acme/site")).toBeNull();
    expect(openUrl).toHaveBeenCalledWith("vscode://file/code/site?windowId=_blank");
  });
  it("says so when there is no clone", async () => {
    invoke.mockResolvedValue([]);
    expect(await openRepoInVscode("/code", "acme/site")).toMatch(/No local clone/);
    expect(openUrl).not.toHaveBeenCalled();
  });
  it("returns the error when the scan fails", async () => {
    invoke.mockRejectedValue("/nope is not a folder");
    expect(await openRepoInVscode("/nope", "acme/site")).toContain("is not a folder");
  });
});
