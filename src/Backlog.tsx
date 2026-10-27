import { openUrl } from "@tauri-apps/plugin-opener";
import type { ReactNode } from "react";
import type { Issue, PullRequest } from "./github/types";
import type { RepoResult } from "./providers";
import { backlogIssues, backlogPrs, type BacklogPr, type IssueAssignment, type Reviewer } from "./state/backlog";
import { ago, RepoName } from "./ui";

/** Collapse helpers owned by App, which persists them in the config. */
export interface Collapse {
  isCollapsed: (key: string) => boolean;
  toggler: (key: string) => object;
  chevron: (key: string) => ReactNode;
}

function Row({ url, className, children }: { url: string; className: string; children: ReactNode }) {
  return (
    <a className={`pr ${className}`} href={url} onClick={(e) => (e.preventDefault(), openUrl(url))}>
      {children}
    </a>
  );
}

const who = (pr: PullRequest) => pr.author?.name ?? pr.author?.login ?? "unknown";

function reviewerTag(reviewers: Reviewer[]) {
  if (reviewers.length === 0) return <span className="tag action">No reviewer</span>;
  return (
    <span className="tag assigned" title="Reviewers; ✓ means they have reviewed">
      {reviewers.map((r) => `@${r.login}${r.reviewed ? " ✓" : ""}`).join(", ")}
    </span>
  );
}

function PrBacklogRow({ item, showRepo }: { item: BacklogPr; showRepo: boolean }) {
  const { pr, reviewers } = item;
  return (
    <Row url={pr.url} className={reviewers.length === 0 ? "action" : "waiting"}>
      <div className="pr-main">
        <span className="title">
          {pr.title} <span className="muted">#{pr.number}</span>
        </span>
        <span className="meta">
          {showRepo && <RepoName repo={pr.repo} />}
          {showRepo && " · "}by {who(pr)} · updated {ago(pr.updatedAt)}
          {pr.reviewDecision === "CHANGES_REQUESTED" && " · changes requested"}
        </span>
      </div>
      {reviewerTag(reviewers)}
    </Row>
  );
}

function assignmentTag(issue: Issue, assignment: IssueAssignment) {
  if (assignment === "unassigned") return <span className="tag action">Unassigned</span>;
  if (assignment === "you") return <span className="tag ready">Assigned to you</span>;
  return <span className="tag assigned">{issue.assignees.map((a) => `@${a}`).join(", ")}</span>;
}

function IssueRow({ issue, assignment, showRepo }: { issue: Issue; assignment: IssueAssignment; showRepo: boolean }) {
  const parts = [
    issue.labels.join(", "),
    issue.commentCount > 0 ? `${issue.commentCount} comment${issue.commentCount === 1 ? "" : "s"}` : "",
    issue.linkedPrs.length > 0 ? `PR ${issue.linkedPrs.map((n) => `#${n}`).join(", ")} open` : "",
    `updated ${ago(issue.updatedAt)}`,
  ].filter(Boolean);
  return (
    <Row url={issue.url} className={assignment === "others" ? "waiting" : assignment === "you" ? "ready" : "action"}>
      <div className="pr-main">
        <span className="title">
          {issue.title} <span className="muted">#{issue.number}</span>
        </span>
        <span className="meta">
          {showRepo && <RepoName repo={issue.repo} />}
          {showRepo && " · "}
          {parts.join(" · ")}
        </span>
      </div>
      {assignmentTag(issue, assignment)}
    </Row>
  );
}

/** Group rows by repo, keeping the order the repos were added in. */
function byRepo<T>(repos: string[], rows: [string, T][]): [string, T[]][] {
  return repos
    .map((repo): [string, T[]] => [repo, rows.filter(([r]) => r === repo).map(([, row]) => row)])
    .filter(([, list]) => list.length > 0);
}

function Section<T>({
  id,
  title,
  empty,
  groups,
  collapse,
  render,
}: {
  id: string;
  title: string;
  empty: string;
  groups: [string, T[]][];
  collapse: Collapse;
  render: (row: T, showRepo: boolean) => ReactNode;
}) {
  const total = groups.reduce((n, [, list]) => n + list.length, 0);
  const single = groups.length === 1;
  return (
    <section className="backlog-section">
      <h2>
        {title} <span className="count">{total}</span>
      </h2>
      {total === 0 && <p className="muted empty">{empty}</p>}
      {groups.map(([repo, list]) => {
        const key = `backlog:${id}/${repo}`;
        return (
          <div key={repo} className="repo-sub">
            {!single && (
              <h3 {...collapse.toggler(key)}>
                {collapse.chevron(key)}
                <RepoName repo={repo} /> <span className="count">{list.length}</span>
              </h3>
            )}
            {(single || !collapse.isCollapsed(key)) && list.map((row) => render(row, single))}
          </div>
        );
      })}
    </section>
  );
}

export function Backlog({
  repos,
  results,
  repoFilter,
  loading,
  collapse,
}: {
  repos: string[];
  results: Record<string, RepoResult>;
  repoFilter: string;
  loading: boolean;
  collapse: Collapse;
}) {
  const shown = repos.filter((r) => (!repoFilter || r === repoFilter) && results[r] && !results[r].error);
  const prRows = shown.flatMap((r): [string, BacklogPr][] =>
    backlogPrs(results[r].prs, results[r].me).map((b) => [r, b]),
  );
  const issueRows = shown.flatMap((r) =>
    backlogIssues(results[r].issues, results[r].me).map((i): [string, (typeof i)] => [r, i]),
  );
  return (
    <>
      <Section
        id="prs"
        title="Pull requests needing review"
        empty={loading ? "Loading…" : "No open PRs need a reviewer."}
        groups={byRepo(repos, prRows)}
        collapse={collapse}
        render={(item, showRepo) => <PrBacklogRow key={item.pr.url} item={item} showRepo={showRepo} />}
      />
      <Section
        id="issues"
        title="Open issues"
        empty={loading ? "Loading…" : "No open issues."}
        groups={byRepo(repos, issueRows)}
        collapse={collapse}
        render={(i, showRepo) => (
          <IssueRow key={i.issue.url} issue={i.issue} assignment={i.assignment} showRepo={showRepo} />
        )}
      />
    </>
  );
}
