import { useMemo } from "react";
import type { Classified } from "../github/types";
import type { Collapse } from "./Backlog";
import { PrRow, type RowAction } from "../components/PrRow";
import { groupByRepo } from "../state/group";
import { snoozeUntil, tabOf, timeLeft } from "../state/snooze";
import type { Config, Tab } from "../store/config";
import { RepoName } from "../components/ui";

const TABS: { key: Tab; label: string }[] = [
  { key: "action", label: "Needs action" },
  { key: "ready", label: "Ready to merge" },
  { key: "waiting", label: "Waiting" },
  { key: "snoozed", label: "Snoozed" },
];

const EMPTY: Record<Tab, string> = {
  snoozed: "Nothing is snoozed.",
  action: "All caught up. Nothing needs your action.",
  ready: "No PRs are ready to merge.",
  waiting: "Nothing is waiting on others.",
};

const byNumber = (a: Classified, b: Classified) => b.pr.number - a.pr.number;

/** The "My PRs" view: status tabs with per-repo collapsible groups and snooze actions. */
export function MyPrs({
  config,
  update,
  items,
  now,
  loading,
  collapse,
}: {
  config: Config;
  update: (next: Config) => Promise<void>;
  /** Already filtered by the repo filter. */
  items: Classified[];
  now: Date;
  loading: boolean;
  collapse: Collapse;
}) {
  const { isCollapsed, toggler, chevron } = collapse;

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { action: 0, ready: 0, waiting: 0, snoozed: 0 };
    for (const i of items) c[tabOf(i, config.snoozed, now)]++;
    return c;
  }, [items, config.snoozed, now]);

  const rows = items.filter((i) => tabOf(i, config.snoozed, now) === config.tab).sort(byNumber);
  const snoozeAction = (item: Classified): RowAction | undefined => {
    const url = item.pr.url;
    if (config.tab === "action")
      return {
        label: "💤",
        title: "Snooze for 1 day",
        run: () => update({ ...config, snoozed: { ...config.snoozed, [url]: snoozeUntil(new Date()) } }),
      };
    if (config.tab === "snoozed")
      return {
        note: `wakes in ${timeLeft(config.snoozed[url], now)}`,
        label: "Unsnooze",
        title: "Move back to Needs action",
        run: () => {
          const { [url]: _removed, ...rest } = config.snoozed;
          update({ ...config, snoozed: rest });
        },
      };
  };
  const groups = groupByRepo(rows.sort((a, b) => a.pr.repo.localeCompare(b.pr.repo)));

  return (
        <section className="panel">
        <nav className="tabs panel-head" role="tablist">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={config.tab === key}
              className={`tab ${key}${config.tab === key ? " selected" : ""}`}
              onClick={() => update({ ...config, tab: key })}
            >
              {label} <span className="count">{counts[key]}</span>
            </button>
          ))}
        </nav>

        <div className="panel-body">
        {rows.length === 0 && config.repos.length > 0 && !loading && (
          <p className="muted empty">{EMPTY[config.tab]}</p>
        )}
        <section className={`bucket ${config.tab}`}>
          {groups.map(([repo, items]) => {
            const subKey = `status:${config.tab}/${repo}`;
            return (
              <div key={repo} className="repo-sub">
                {groups.length > 1 && (
                  <h3 {...toggler(subKey)}>
                    {chevron(subKey)}
                    <RepoName repo={repo} /> <span className="count">{items.length}</span>
                  </h3>
                )}
                {(groups.length === 1 || !isCollapsed(subKey)) &&
                  items.map((item) => (
                    <PrRow key={item.pr.url} item={item} showRepo={groups.length === 1} action={snoozeAction(item)} />
                  ))}
              </div>
            );
          })}
        </section>
        </div>
        </section>
  );
}
