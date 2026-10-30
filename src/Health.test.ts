import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));

import { serialRunner } from "./Health";

/** A run whose result the test hands back by hand, to control the order things finish in. */
function controlled() {
  const pending: ((v: string) => void)[] = [];
  const run = vi.fn(() => new Promise<string>((resolve) => pending.push(resolve)));
  const finish = async (i: number, v: string) => {
    pending[i](v);
    await new Promise((r) => setTimeout(r, 0));
  };
  return { run, finish };
}

describe("serialRunner", () => {
  it("runs once and publishes", async () => {
    const { run, finish } = controlled();
    const published: string[] = [];
    const busy: boolean[] = [];
    const go = serialRunner(run, (v) => published.push(v), (b) => busy.push(b));
    go();
    await finish(0, "a");
    expect(published).toEqual(["a"]);
    expect(busy).toEqual([true, false]);
  });

  // e.g. the account changes, or the user fixes gh, while a slow check is still running.
  it("drops a result that was asked for again mid-run, and publishes the fresh run instead", async () => {
    const { run, finish } = controlled();
    const published: string[] = [];
    const go = serialRunner(run, (v) => published.push(v), () => {});
    go();
    go();
    go(); // several asks while running collapse into one more run
    await finish(0, "stale");
    expect(published).toEqual([]);
    expect(run).toHaveBeenCalledTimes(2);
    await finish(1, "fresh");
    expect(published).toEqual(["fresh"]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("stays busy until the queued run has finished", async () => {
    const { run, finish } = controlled();
    const busy: boolean[] = [];
    const go = serialRunner(run, () => {}, (b) => busy.push(b));
    go();
    go();
    await finish(0, "a");
    expect(busy).toEqual([true]);
    await finish(1, "b");
    expect(busy).toEqual([true, false]);
  });

  // e.g. the account changes mid-check and the old check then fails: the new one must still run.
  it("still starts the queued run when the run before it throws", async () => {
    const published: string[] = [];
    let calls = 0;
    let failFirst!: (e: Error) => void;
    const run = () =>
      ++calls === 1 ? new Promise<string>((_, reject) => (failFirst = reject)) : Promise.resolve("fresh");
    const go = serialRunner(run, (v) => published.push(v), () => {});
    const first = go();
    go();
    failFirst(new Error("old check failed"));
    await first;
    expect(calls).toBe(2);
    expect(published).toEqual(["fresh"]);
  });

  it("isn't left busy when a run throws", async () => {
    const busy: boolean[] = [];
    const go = serialRunner(() => Promise.reject(new Error("boom")), () => {}, (b) => busy.push(b));
    await expect(go()).rejects.toThrow("boom");
    expect(busy).toEqual([true, false]);
    await expect(go()).rejects.toThrow("boom"); // and can run again
  });
});
