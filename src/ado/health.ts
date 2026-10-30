import { invoke } from "@tauri-apps/api/core";
import type { Health } from "../providers/types";

/**
 * Raw result of the `az_health` command. `ok` means `az` could get an Azure DevOps token, which
 * is the same path `az_rest` takes; `user` is the signed-in user's name when it could.
 */
export interface AzHealthRaw {
  found: boolean;
  ok: boolean;
  user: string;
  detail: string;
}

const INSTALL_URL = "https://aka.ms/installazurecli";
const LOGIN = "az login";
/** az (Python requests/urllib3) failing to connect at all, e.g. to login.microsoftonline.com. */
const NETWORK = /HTTPSConnectionPool|Max retries exceeded|Failed to establish a new connection|NewConnectionError|ConnectionError|getaddrinfo|Name or service not known|timed out/i;
/** az saying the login itself is the problem: no account, or an Entra (AADSTS) refusal. */
const NEEDS_LOGIN = /az login|AADSTS/i;

/** Azure DevOps reuses the `az` CLI's login, so "signed in" means `az` can get a token for it. */
export function parseAzHealth(raw: AzHealthRaw): Health {
  if (!raw.found) {
    return {
      ok: false,
      summary: "Azure CLI not found",
      detail: "Azure DevOps repos are read through the `az` CLI. It isn't installed, or isn't on this app's PATH.",
      url: INSTALL_URL,
    };
  }
  // A failed token request is usually a login problem, but offline it fails too. Only call it
  // unverified when az clearly couldn't connect and didn't also ask for a login.
  if (!raw.ok && NETWORK.test(raw.detail) && !NEEDS_LOGIN.test(raw.detail)) {
    return { ok: false, unverified: true, summary: "Couldn't reach Azure to check the sign-in", detail: raw.detail };
  }
  if (!raw.ok) {
    return {
      ok: false,
      summary: "Not signed in to Azure",
      detail: raw.detail || "`az` could not get an Azure DevOps token.",
      fix: LOGIN,
    };
  }
  return { ok: true, summary: raw.user ? `Signed in as ${raw.user}` : "Signed in to Azure" };
}

/** A failure to even ask (not a bad login) is reported by `useHealth`, the same for every host. */
export async function azHealth(): Promise<Health> {
  return parseAzHealth(JSON.parse(await invoke<string>("az_health")));
}
