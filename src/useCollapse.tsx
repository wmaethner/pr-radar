import type { KeyboardEvent } from "react";
import type { Collapse } from "./Backlog";
import type { Config } from "./store/config";

/** Collapsible section helpers, persisted in the config's `collapsed` list. */
export function useCollapse(config: Config | null, update: (next: Config) => Promise<void>): Collapse {
  const isCollapsed = (key: string) => config?.collapsed.includes(key) ?? false;
  const toggle = (key: string) => {
    if (!config) return;
    const collapsed = config.collapsed.includes(key)
      ? config.collapsed.filter((k) => k !== key)
      : [...config.collapsed, key];
    update({ ...config, collapsed });
  };
  /** Heading props that make a section title a keyboard-accessible collapse toggle. */
  const toggler = (key: string) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": !isCollapsed(key),
    onClick: () => toggle(key),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") (e.preventDefault(), toggle(key));
    },
  });
  const chevron = (key: string) => <span className="chevron">{isCollapsed(key) ? "▸" : "▾"}</span>;
  return { isCollapsed, toggler, chevron };
}
