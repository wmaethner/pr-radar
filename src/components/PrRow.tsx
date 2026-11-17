import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Classified } from "../github/types";
import { stackChip, stackStatus } from "../state/stack";
import { ago } from "./ui";

export interface RowAction {
  note?: string;
  label: string;
  title: string;
  run: () => void;
}

export function PrRow({ item, action }: { item: Classified; action?: RowAction }) {
  const { pr, role, reason, bucket } = item;
  const stack = stackStatus(pr);
  const chip = stack && stackChip(stack, bucket);
  const [stackOpen, setStackOpen] = useState(false);
  return (
    <div className="pr-item">
      <a className={`pr ${bucket}`} href={pr.url} onClick={(e) => (e.preventDefault(), openUrl(pr.url))}>
        <div className="pr-main">
          <span className="title">
            {pr.title} <span className="muted">#{pr.number}</span>
          </span>
          <span className="meta">
            {role === "author" ? "Your PR" : `Reviewing · by ${pr.author?.name ?? pr.author?.login ?? "unknown"}`} · updated {ago(pr.updatedAt)}
          </span>
        </div>
        {stack && chip && (
          <button
            className={`stack-chip ${chip.tone}`}
            title={stackOpen ? "Hide the stack" : "Show the PRs in this stack"}
            aria-expanded={stackOpen}
            onClick={(e) => (e.preventDefault(), e.stopPropagation(), setStackOpen(!stackOpen))}
          >
            {stackOpen ? "▾" : "▸"} {chip.text}
          </button>
        )}
        <span className={`tag ${bucket}`}>{reason}</span>
        {action?.note && <span className="meta note">{action.note}</span>}
        {action && (
          <button
            className="row-action"
            title={action.title}
            aria-label={action.title}
            onClick={(e) => (e.preventDefault(), e.stopPropagation(), action.run())}
          >
            {action.label}
          </button>
        )}
      </a>
      {stack && stackOpen && (
        <ul className="stack-list" aria-label="PRs in this stack">
          {stack.members.map((m) => (
            <li key={m.number} className={m.isCurrent ? "current" : undefined}>
              <span className="muted">{m.position}</span>
              <a href={m.url} onClick={(e) => (e.preventDefault(), openUrl(m.url))}>
                {m.title} <span className="muted">#{m.number}</span>
              </a>
              {m.isCurrent && <span className="muted">(this PR)</span>}
              <span className={`member-status ${m.status}`}>{m.label}</span>
            </li>
          ))}
          {stack.hidden > 0 && <li className="muted">and {stack.hidden} more not shown</li>}
        </ul>
      )}
    </div>
  );
}
