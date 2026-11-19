import type { GhAccount } from "../../github/accounts";
import { HealthPanel, type HostHealth } from "../Health";

/** Sign-in state of each code host, and which GitHub account the app uses. */
export function AccountsTab({
  health,
  checking,
  onRecheck,
  accounts,
  account,
  onAccount,
}: {
  health: HostHealth[] | null;
  checking: boolean;
  onRecheck: () => void;
  accounts: GhAccount[];
  /** The chosen login; null = gh's active account. */
  account: string | null;
  onAccount: (login: string) => void;
}) {
  return (
    <>
      <HealthPanel health={health} checking={checking} onRecheck={onRecheck} />
      {accounts.length > 0 && (
        <>
          <div className="section-title">GitHub account</div>
          <label className="field">
            <span>Account to use</span>
            <select value={account ?? accounts.find((a) => a.active)?.login ?? ""} onChange={(e) => onAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.login} value={a.login}>
                  @{a.login}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
}
