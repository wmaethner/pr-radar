import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import { healthProviders } from "./providers";
import type { Health, Provider } from "./providers/types";
import { configPath } from "./store/config";

/** One provider's sign-in state, tagged with which provider it came from. */
export interface HostHealth extends Health {
  id: string;
  label: string;
}

/** A sign-in that needs the user. A check that couldn't reach the host doesn't count. */
export const isProblem = (h: Health) => !h.ok && !h.unverified;

async function checkAll(targets: Provider[], account: string | null): Promise<HostHealth[]> {
  return Promise.all(
    targets.map(async (p): Promise<HostHealth> => {
      let h: Health;
      try {
        h = await p.health!(account);
      } catch (e) {
        h = { ok: false, summary: `Could not check ${p.label} sign-in`, detail: String(e) };
      }
      return { ...h, id: p.id, label: p.label };
    }),
  );
}

/**
 * Runs `run` one at a time. Calling while it runs queues exactly one more run, which starts after
 * it; only a run with nothing queued behind it publishes, so the result is always from the latest
 * call. `busy` is true from the first call until the last queued run has finished. A run that
 * fails is ignored if another is queued behind it; otherwise its error is thrown.
 */
export function serialRunner<T>(run: () => Promise<T>, publish: (t: T) => void, busy: (b: boolean) => void) {
  let running = false;
  let again = false;
  return async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    busy(true);
    try {
      do {
        again = false;
        try {
          const result = await run();
          if (!again) publish(result);
        } catch (e) {
          if (!again) throw e;
        }
      } while (again);
    } finally {
      running = false;
      busy(false);
    }
  };
}

/**
 * Checks every relevant host's CLI sign-in. Each check shells out to `gh`/`az`, which validate
 * their tokens over the network, so this runs on mount, when the account or the set of hosts
 * changes, and on demand, rather than on a timer.
 * Runs go through `serialRunner` and read the latest inputs when they start.
 */
export function useHealth(repos: string[], account: string | null) {
  const [health, setHealth] = useState<HostHealth[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  // Which hosts and account `health` was checked for, so a change of verdict can be told apart
  // from a change of what was checked.
  const [checkedFor, setCheckedFor] = useState("");
  const targets = healthProviders(repos);
  const hosts = targets.map((p) => p.id).join(",");
  // The latest inputs, read when a run starts rather than captured when it was asked for.
  const latest = useRef({ targets, account, key: "" });
  latest.current = { targets, account, key: `${hosts}|${account ?? ""}` };
  const runner = useRef<() => Promise<void>>(null);
  runner.current ??= serialRunner(
    async () => {
      const { targets, account, key } = latest.current;
      return { results: await checkAll(targets, account), key };
    },
    ({ results, key }) => {
      setHealth(results);
      setCheckedFor(key);
      setCheckedAt(Date.now());
    },
    setChecking,
  );
  const check = useCallback(() => runner.current!(), []);

  // `repos` only matters through which hosts it brings in, so adding a repo doesn't re-run gh.
  useEffect(() => {
    check();
  }, [hosts, account, check]);

  return { health, checking, checkedAt, checkedFor, recheck: check };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-btn"
      title={`Copy "${text}"`}
      aria-label={`Copy ${text}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // Nothing useful to say: the command is on screen to select by hand.
        }
      }}
    >
      {copied ? "✓" : "⧉"}
    </button>
  );
}

function HealthRow({ h }: { h: HostHealth }) {
  return (
    <li className={`health-row ${h.ok ? "ok" : h.unverified ? "unverified" : "bad"}`}>
      <div className="health-head">
        <span className="dot" aria-hidden="true" />
        <span className="health-host">{h.label}</span>
        <span className="health-summary">{h.summary}</span>
      </div>
      {!h.ok && h.detail && <p className="health-detail">{h.detail}</p>}
      {!h.ok && h.fix && (
        <div className="health-fix">
          <span>Run</span>
          <code>{h.fix}</code>
          <CopyButton text={h.fix} />
        </div>
      )}
      {!h.ok && h.url && (
        <div className="health-fix">
          <a
            href={h.url}
            onClick={(e) => (e.preventDefault(), openUrl(h.url!))}
          >
            Install instructions
          </a>
        </div>
      )}
    </li>
  );
}

/** Sign-in status per host, plus a way to get at the config file for anything with no UI. */
export function HealthPanel({
  health,
  checking,
  onRecheck,
}: {
  health: HostHealth[] | null;
  checking: boolean;
  onRecheck: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    try {
      await revealItemInDir(await configPath());
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <>
      <div className="section-title with-action">
        <span>Sign-in</span>
        <button className="link-btn" onClick={onRecheck} disabled={checking}>
          {checking ? "Checking…" : "Recheck"}
        </button>
      </div>
      <ul className="health-list">
        {health === null && <li className="muted">Checking…</li>}
        {health?.map((h) => <HealthRow key={h.id} h={h} />)}
      </ul>
      <button className="link-btn config-btn" onClick={reveal}>
        Show config file
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
