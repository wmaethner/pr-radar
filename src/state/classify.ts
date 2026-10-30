import type { Classified, PullRequest } from "../github/types";

const after = (a: string | null, b: string | null) =>
  a !== null && b !== null && new Date(a).getTime() > new Date(b).getTime();

/** Threads where the last comment is not mine and which are still open. */
function threadsAwaitingMe(pr: PullRequest, me: string, startedByMe: boolean, skip: Set<string> = new Set()) {
  return pr.threads.filter((t) => {
    if (t.isResolved || t.comments.nodes.length === 0) return false;
    const first = t.comments.nodes[0].author?.login;
    const last = t.comments.nodes[t.comments.nodes.length - 1].author?.login;
    if (last === me || (last && skip.has(last))) return false;
    return startedByMe ? first === me : true;
  });
}

/**
 * Decide what, if anything, `me` must do on this PR. Returns null when the
 * user is not involved (neither author, requested, nor a past reviewer).
 */
export function classify(pr: PullRequest, me: string): Classified | null {
  if (pr.author?.login === me) return classifyAuthored(pr, me);
  return classifyReviewing(pr, me);
}

function classifyAuthored(pr: PullRequest, me: string): Classified {
  const make = (bucket: Classified["bucket"], reason: string): Classified => ({
    pr,
    role: "author",
    bucket,
    reason,
  });
  if (pr.isDraft) return make("waiting", "Draft");
  if (pr.ciState === "FAILURE" || pr.ciState === "ERROR") return make("action", "CI failing");

  // Reviewers who already reviewed and have been asked again have the ball, even with threads still open.
  const reReviewers = new Set(
    pr.requestedReviewers.filter((u) => u !== me && pr.reviews.some((r) => r.author?.login === u)),
  );
  const open = threadsAwaitingMe(pr, me, false, reReviewers);
  if (open.length > 0)
    return make("action", `${open.length} unresolved comment thread${open.length > 1 ? "s" : ""}`);

  const changes = pr.reviews
    .filter((r) => r.state === "CHANGES_REQUESTED" && r.author?.login !== me && !reReviewers.has(r.author?.login ?? ""))
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))
    .at(-1);
  if (pr.reviewDecision === "CHANGES_REQUESTED" && changes && !after(pr.lastCommitAt, changes.submittedAt))
    return make("action", "Changes requested");

  // Anything of mine (comment, review, thread reply, push) counts as having caught up.
  const lastMine =
    [
      ...pr.comments.filter((c) => c.author?.login === me).map((c) => c.createdAt),
      ...pr.reviews.filter((r) => r.author?.login === me).map((r) => r.submittedAt),
      ...pr.threads.flatMap((t) =>
        t.comments.nodes.filter((c) => c.author?.login === me).map((c) => c.createdAt),
      ),
      pr.lastCommitAt,
    ]
      .filter((t): t is string => t !== null)
      .sort()
      .at(-1) ?? null;
  // Bot comments (Copilot reporting it finished, CI summaries) are informational, not a request.
  const newComment = pr.comments.some(
    (c) => c.author?.login !== me && !c.author?.isBot && after(c.createdAt, lastMine),
  );
  if (newComment) return make("action", "New comment on your PR");

  if (pr.reviewDecision === "APPROVED") return make("ready", "Approved, ready to merge");
  return make("waiting", "Waiting on reviewers");
}

function classifyReviewing(pr: PullRequest, me: string): Classified | null {
  const make = (bucket: Classified["bucket"], reason: string): Classified => ({
    pr,
    role: "reviewer",
    bucket,
    reason,
  });
  if (pr.isDraft) return null;
  const myReviews = pr.reviews.filter((r) => r.author?.login === me && r.submittedAt);
  const myLast = myReviews.map((r) => r.submittedAt as string).sort().at(-1) ?? null;
  const requested = pr.requestedReviewers.includes(me);
  const startedThreads = pr.threads.some((t) => t.comments.nodes[0]?.author?.login === me);

  if (!requested && myReviews.length === 0 && !startedThreads) return null;

  if (requested) return make("action", myLast ? "Re-review requested" : "Review requested");

  // An approval stands, through later pushes and replies alike, until I'm asked to review again
  // (re-requested above) or the approval is dismissed or replaced.
  const myVerdict = myReviews
    .filter((r) => r.state !== "COMMENTED" && r.state !== "PENDING")
    .sort((a, b) => (a.submittedAt as string).localeCompare(b.submittedAt as string))
    .at(-1);
  if (myVerdict?.state === "APPROVED") return make("waiting", "You approved");

  // Approving counts as having seen every reply made before it.
  const myApproval =
    myReviews
      .filter((r) => r.state === "APPROVED")
      .map((r) => r.submittedAt as string)
      .sort()
      .at(-1) ?? null;
  const replies = threadsAwaitingMe(pr, me, true).filter((t) => {
    const lastAt = t.comments.nodes[t.comments.nodes.length - 1].createdAt;
    return myApproval === null || after(lastAt, myApproval);
  });
  if (replies.length > 0)
    return make("action", `${replies.length} repl${replies.length > 1 ? "ies" : "y"} to your comments`);

  if (after(pr.lastCommitAt, myLast)) return make("action", "New commits since your review");
  return make("waiting", "Waiting on author");
}
