import { useEffect, useMemo, useState } from "react";
import { setActionBadge } from "./platform/badge";
import { tabOf } from "./state/snooze";
import { Backlog } from "./views/Backlog";
import { Header } from "./components/Header";
import { MyPrs } from "./views/MyPrs";
import { UpdateBanner } from "./components/UpdateBanner";
import { useCollapse } from "./hooks/useCollapse";
import { useConfig } from "./hooks/useConfig";
import { useRepoData } from "./hooks/useRepoData";
import { labelOf } from "./components/ui";
import "./App.css";

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const { config, update, addRepo, addRepos } = useConfig(now);
  const { results, pending, loading, updated, lastRefresh, items, errors, refresh } = useRepoData(config);
  const [repoFilter, setRepoFilter] = useState("");

  // Tick so snoozes expire (and "wakes in" labels stay fresh) without waiting for a refresh.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const collapse = useCollapse(config, update);

  const visible = useMemo(
    () => items.filter((i) => !repoFilter || i.pr.repo === repoFilter),
    [items, repoFilter],
  );

  // Dock badge (macOS) / taskbar overlay (Windows): PRs needing action across all repos, ignoring the view filter. Snoozed ones don't count.
  const snoozed = config?.snoozed;
  const actionCount = useMemo(
    () => items.filter((i) => tabOf(i, snoozed ?? {}, now) === "action").length,
    [items, snoozed, now],
  );
  useEffect(() => {
    setActionBadge(actionCount);
  }, [actionCount]);

  if (!config) return <main className="app">Loading…</main>;

  return (
    <main className="app">
      <Header
        config={config}
        update={update}
        updated={updated}
        loading={loading}
        pending={pending}
        lastRefresh={lastRefresh}
        repoFilter={repoFilter}
        onRepoFilter={setRepoFilter}
        onRefresh={() => refresh(config.repos, config.account)}
        onAddRepo={addRepo}
        onAddRepos={addRepos}
      />

      <UpdateBanner />

      {loading && (
        <p className="muted refreshing">
          Refreshing {pending.map(labelOf).join(", ")}…
        </p>
      )}
      {config.repos.length === 0 && <p className="muted">No repos yet. Open settings (⚙) to add one.</p>}
      {errors.map((e) => (
        <p key={e.repo} className="error">
          {labelOf(e.repo)}: {e.error}
        </p>
      ))}

      {config.view === "backlog" ? (
        <Backlog
          repos={config.repos}
          results={results}
          repoFilter={repoFilter}
          loading={loading}
          collapse={collapse}
        />
      ) : (
        <MyPrs config={config} update={update} items={visible} now={now} loading={loading} collapse={collapse} />
      )}
    </main>
  );
}
