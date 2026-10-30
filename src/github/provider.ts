import type { Provider } from "../providers/types";
import { fetchRepo } from "./client";
import { ghHealth } from "./health";
import { parseRepo } from "./repo";

/** GitHub repos are stored as "owner/name". It owns every key that isn't another provider's. */
export const github: Provider = {
  id: "github",
  label: "GitHub",
  owns: (key) => !key.startsWith("ado:"),
  parse: parseRepo,
  display(key) {
    const [owner, name] = key.split("/");
    return { owner, name };
  },
  fetchRepo: (key, ctx) => fetchRepo(key, ctx.account),
  health: ghHealth,
  // First run has no repos, which is exactly when a broken `gh` is otherwise invisible.
  alwaysCheckHealth: true,
};
