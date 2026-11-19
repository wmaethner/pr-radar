import { useAppVersion } from "../../hooks/useAppVersion";

const POLL_CHOICES = [1, 2, 5, 10, 15, 30];

/** How often to refresh, and which version is running. */
export function GeneralTab({ pollMinutes, onPollMinutes }: { pollMinutes: number; onPollMinutes: (m: number) => void }) {
  const version = useAppVersion();
  return (
    <>
      <div className="section-title">Refresh</div>
      <label className="field">
        <span>Refresh every</span>
        <select value={pollMinutes} onChange={(e) => onPollMinutes(Number(e.target.value))}>
          {[...new Set([...POLL_CHOICES, pollMinutes])]
            .sort((a, b) => a - b)
            .map((m) => (
              <option key={m} value={m}>
                {m} min
              </option>
            ))}
        </select>
      </label>
      {version && <div className="muted version">PR Radar {version}</div>}
    </>
  );
}
