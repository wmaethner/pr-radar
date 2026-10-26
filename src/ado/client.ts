import { invoke } from "@tauri-apps/api/core";
import type { RepoResult } from "../github/client";
import type { PullRequest, Review, ReviewThread } from "../github/types";
import { fromAdoKey, type AdoRepo } from "./repo";

const API = "api-version=7.1";

interface Identity {
  id: string;
  displayName: string;
}
interface Reviewer extends Identity {
  vote: number; // 10 approved, 5 approved with suggestions, 0 none, -5 waiting for author, -10 rejected
  isRequired?: boolean;
  isContainer?: boolean;
  hasDeclined?: boolean;
}
export interface AdoPr {
  pullRequestId: number;
  title: string;
  isDraft?: boolean;
  creationDate: string;
  createdBy: Identity;
  reviewers: Reviewer[];
  repository: { project: { id: string } };
}
export interface AdoThread {
  status?: string;
  isDeleted?: boolean;
  threadContext?: unknown;
  properties?: Record<string, { $value?: unknown }>;
  comments?: { author: Identity; publishedDate: string; commentType?: string; isDeleted?: boolean }[];
}
export interface AdoIteration {
  createdDate: string;
}

const enc = encodeURIComponent;
const toActor = (i: Identity) => ({ login: i.id, name: i.displayName });
const latest = (dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort().at(-1) ?? null;

/** Open threads are "active" or "pending"; fixed/closed/won't fix/by design are resolved. */
const isOpen = (t: AdoThread) => t.status === "active" || t.status === "pending";

/** Reviews are votes, which carry no date; the "voted" system threads give when each was cast. */
function voteDates(threads: AdoThread[]): Map<string, string> {
  const dates = new Map<string, string>();
  for (const t of threads) {
    if (t.properties?.CodeReviewThreadType?.$value !== "VoteUpdate") continue;
    const c = t.comments?.[0];
    if (c && (dates.get(c.author.id) ?? "") < c.publishedDate) dates.set(c.author.id, c.publishedDate);
  }
  return dates;
}

function decision(reviewers: Reviewer[]): PullRequest["reviewDecision"] {
  const people = reviewers.filter((r) => !r.isContainer && !r.hasDeclined);
  if (people.some((r) => r.vote < 0)) return "CHANGES_REQUESTED";
  const approved = (r: Reviewer) => r.vote >= 5;
  return people.some(approved) && people.filter((r) => r.isRequired).every(approved)
    ? "APPROVED"
    : "REVIEW_REQUIRED";
}

/** Worst state wins; null when there is nothing to report. */
function combineCi(states: (PullRequest["ciState"])[]): PullRequest["ciState"] {
  for (const s of ["FAILURE", "ERROR", "PENDING", "SUCCESS"] as const) if (states.includes(s)) return s;
  return null;
}

export function ciFromStatuses(states: string[]): PullRequest["ciState"] {
  return combineCi(
    states.map((s) =>
      s === "failed" ? "FAILURE" : s === "error" ? "ERROR" : s === "pending" ? "PENDING" : s === "succeeded" ? "SUCCESS" : null,
    ),
  );
}

export function mapPr(
  repo: AdoRepo,
  key: string,
  raw: AdoPr,
  rawThreads: AdoThread[],
  iterations: AdoIteration[],
  ciState: PullRequest["ciState"],
): PullRequest {
  const votedAt = voteDates(rawThreads);
  const threads: ReviewThread[] = rawThreads
    .filter((t) => !t.isDeleted && t.comments?.some((c) => c.commentType !== "system"))
    .map((t) => ({
      isResolved: !isOpen(t),
      comments: {
        nodes: (t.comments ?? [])
          .filter((c) => c.commentType !== "system" && !c.isDeleted)
          .map((c) => ({ author: toActor(c.author), createdAt: c.publishedDate })),
      },
    }));

  const lastCommentBy = (id: string) =>
    latest(threads.flatMap((t) => t.comments.nodes.filter((c) => c.author?.login === id).map((c) => c.createdAt)));
  const people = raw.reviewers.filter((r) => !r.isContainer && !r.hasDeclined);
  const reviews: Review[] = people
    .filter((r) => r.vote !== 0)
    .map((r) => ({
      author: toActor(r),
      state: r.vote < 0 ? "CHANGES_REQUESTED" : "APPROVED",
      submittedAt: votedAt.get(r.id) ?? lastCommentBy(r.id),
    }));

  const lastCommitAt = iterations.at(-1)?.createdDate ?? null;
  const org = repo.org;
  return {
    repo: key,
    number: raw.pullRequestId,
    title: raw.title,
    url: `https://dev.azure.com/${enc(org)}/${enc(repo.project)}/_git/${enc(repo.repo)}/pullrequest/${raw.pullRequestId}`,
    isDraft: !!raw.isDraft,
    author: toActor(raw.createdBy),
    updatedAt:
      latest([
        raw.creationDate,
        lastCommitAt,
        ...threads.flatMap((t) => t.comments.nodes.map((c) => c.createdAt)),
        ...votedAt.values(),
      ]) ?? raw.creationDate,
    reviewDecision: decision(raw.reviewers),
    lastCommitAt,
    ciState,
    requestedReviewers: people.filter((r) => r.vote === 0).map((r) => r.id),
    reviews,
    threads,
    comments: [],
  };
}

async function get<T>(url: string): Promise<T> {
  const raw = await invoke<string>("az_rest", { url });
  try {
    return JSON.parse(raw) as T;
  } catch {
    // An unauthorised request gets an HTML sign-in page rather than an error status.
    throw new Error("Unexpected response from Azure DevOps. Run `az login` and check you have access to the org.");
  }
}

async function fetchRepo(key: string, repo: AdoRepo, me: string): Promise<PullRequest[]> {
  const org = `https://dev.azure.com/${enc(repo.org)}`;
  const base = `${org}/${enc(repo.project)}/_apis/git/repositories/${enc(repo.repo)}`;
  const list = await get<{ value: AdoPr[] }>(`${base}/pullrequests?searchCriteria.status=active&$top=50&${API}`);
  // Only PRs the user authored or was asked to review can ever be classified.
  const mine = list.value.filter(
    (pr) => pr.createdBy.id === me || pr.reviewers.some((r) => r.id === me && !r.isContainer),
  );
  return Promise.all(
    mine.map(async (pr) => {
      const prBase = `${base}/pullrequests/${pr.pullRequestId}`;
      const [threads, iterations, ci] = await Promise.all([
        get<{ value: AdoThread[] }>(`${prBase}/threads?${API}`),
        get<{ value: AdoIteration[] }>(`${prBase}/iterations?${API}`),
        pr.createdBy.id === me ? fetchCi(org, base, pr) : Promise.resolve(null),
      ]);
      return mapPr(repo, key, pr, threads.value, iterations.value, ci);
    }),
  );
}

/** CI for the user's own PRs: PR statuses plus build policies. Best effort, so failures read as "unknown". */
async function fetchCi(org: string, base: string, pr: AdoPr): Promise<PullRequest["ciState"]> {
  const projectId = pr.repository.project.id;
  const artifact = enc(`vstfs:///CodeReview/CodeReviewId/${projectId}/${pr.pullRequestId}`);
  const [statuses, policies] = await Promise.all([
    get<{ value: { state: string }[] }>(`${base}/pullrequests/${pr.pullRequestId}/statuses?${API}`)
      .then((r) => ciFromStatuses(r.value.map((s) => s.state)))
      .catch(() => null),
    get<{ value: { status: string; configuration: { type: { displayName: string } } }[] }>(
      `${org}/${projectId}/_apis/policy/evaluations?artifactId=${artifact}&api-version=7.1-preview.1`,
    )
      .then((r) =>
        ciFromStatuses(
          r.value
            .filter((p) => p.configuration.type.displayName === "Build")
            .map((p) => (p.status === "rejected" || p.status === "broken" ? "failed" : p.status === "approved" ? "succeeded" : "pending")),
        ),
      )
      .catch(() => null),
  ]);
  return combineCi([statuses, policies]);
}

/**
 * Fetch open PRs for each ADO repo key ("ado:org/project/repo") in parallel, as the `az login` user;
 * `onResult` fires as each repo finishes.
 */
export async function fetchAdoRepos(keys: string[], onResult?: (r: RepoResult) => void): Promise<RepoResult[]> {
  const identities = new Map<string, Promise<string>>();
  const whoAmI = (org: string) => {
    if (!identities.has(org))
      identities.set(
        org,
        get<{ authenticatedUser: { id: string } }>(
          `https://dev.azure.com/${enc(org)}/_apis/connectionData?api-version=7.1-preview.1`,
        ).then((r) => r.authenticatedUser.id),
      );
    return identities.get(org)!;
  };
  const fetchOne = async (key: string): Promise<RepoResult> => {
    const repo = fromAdoKey(key);
    if (!repo) return { repo: key, me: "", prs: [], error: "Invalid Azure DevOps repo" };
    try {
      const me = await whoAmI(repo.org);
      return { repo: key, me, prs: await fetchRepo(key, repo, me) };
    } catch (e) {
      return { repo: key, me: "", prs: [], error: String(e) };
    }
  };
  return Promise.all(
    keys.map(async (key): Promise<RepoResult> => {
      const result = await fetchOne(key);
      onResult?.(result);
      return result;
    }),
  );
}
