import { useEffect, useRef } from "react";
import { isProblem, useHealth } from "../components/Health";

/** A clean sign-in check younger than this is reused when settings opens. */
const RECHECK_AFTER_MS = 60_000;

/**
 * The sign-in check plus the watching around it, so the red dot on the gear stays right whether or
 * not settings is open. Call it from something that is always mounted.
 */
export function useSignInWatch({
  repos,
  account,
  lastRefresh,
  onSignedIn,
}: {
  repos: string[];
  account: string | null;
  /** When the last full refresh finished, and whether any repo failed in it. */
  lastRefresh: { at: number; failed: boolean } | null;
  /** A check just went from a problem to all green: refresh so the repos' errors clear too. */
  onSignedIn: () => void;
}) {
  const { health, checking, checkedAt, checkedFor, recheck } = useHealth(repos, account);
  const problem = health?.some(isProblem) ?? false;
  // null means the first check is still running, which is as good as a fresh, clean one here.
  const allOk = health?.every((h) => h.ok) ?? true;

  // Going green means the fix worked, but the repo errors on screen are from the last refresh,
  // made with the broken login. Refresh now rather than leaving them until the next poll. Only
  // for the same account and hosts: a switch or a removed host isn't a fix, and App already
  // refreshes on an account change.
  const was = useRef<{ key: string; ok: boolean } | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the check result changes; the other values are read as of that check
  useEffect(() => {
    if (!health) return;
    if (was.current && was.current.key === checkedFor && !was.current.ok && allOk) onSignedIn();
    was.current = { key: checkedFor, ok: allOk };
  }, [health]);

  // Refreshes starting to fail is how a token that dies mid-session first shows up, and starting
  // to succeed again is how a fix does: re-check on those changes, so the red dot follows without
  // opening settings. Not on every failed poll, since a repo can fail for reasons unrelated to sign-in.
  const lastFailed = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per finished refresh (lastRefresh.at); recheck() is recreated every render
  useEffect(() => {
    if (!lastRefresh) return;
    if (lastRefresh.failed !== lastFailed.current) recheck();
    lastFailed.current = lastRefresh.failed;
  }, [lastRefresh?.at]);

  // Opening settings is when the user looks at sign-in, so re-check then unless the last check
  // was recent and clean: it also clears "couldn't reach GitHub" once the network is back.
  const recheckOnOpen = () => {
    if (health && (!allOk || Date.now() - checkedAt > RECHECK_AFTER_MS)) recheck();
  };

  return { health, checking, recheck, problem, recheckOnOpen };
}
