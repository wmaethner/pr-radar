import type { Provider } from "../providers/types";
import { fetchAdoRepo } from "./client";
import { fromAdoKey, parseAdoRepo } from "./repo";

export const ado: Provider = {
  id: "ado",
  owns: (key) => key.startsWith("ado:"),
  parse: parseAdoRepo,
  display(key) {
    const r = fromAdoKey(key);
    return r ? { owner: `${r.org}/${r.project}`, name: r.repo } : { owner: "", name: key };
  },
  fetchRepo: (key, ctx) => fetchAdoRepo(key, ctx),
};
