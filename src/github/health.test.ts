import { describe, expect, it } from "vitest";
import type { GhAuthRaw } from "./accounts";
import { parseGhHealth } from "./health";

/** Shape of real `gh auth status --json hosts` output. */
const hosts = (
  ...accounts: { login: string; active?: boolean; state?: string; error?: string; tokenSource?: string }[]
) =>
  JSON.stringify({
    hosts: {
      "github.com": accounts.map((a) => ({
        host: "github.com",
        login: a.login,
        active: a.active ?? false,
        state: a.state,
        error: a.error,
        tokenSource: a.tokenSource ?? "keyring",
      })),
    },
  });

const raw = (over: Partial<GhAuthRaw> = {}): GhAuthRaw => ({
  found: true,
  hosts: hosts({ login: "rsforbes", active: true, state: "success" }),
  detail: "",
  ...over,
});

describe("parseGhHealth", () => {
  it("reports a healthy active account", () => {
    const h = parseGhHealth(raw(), null);
    expect(h.ok).toBe(true);
    expect(h.summary).toBe("Signed in as @rsforbes");
  });

  it("counts the other logged-in accounts", () => {
    const h = parseGhHealth(
      raw({ hosts: hosts({ login: "a", active: true, state: "success" }, { login: "b", state: "success" }) }),
      null,
    );
    expect(h.summary).toBe("Signed in as @a (1 other account)");
  });

  it("flags a missing gh with an install link and no command", () => {
    const h = parseGhHealth(raw({ found: false, hosts: "" }), null);
    expect(h.ok).toBe(false);
    expect(h.summary).toBe("GitHub CLI not found");
    expect(h.url).toBeTruthy();
    expect(h.fix).toBeUndefined();
  });

  it("flags having no github.com login at all", () => {
    const h = parseGhHealth(raw({ hosts: JSON.stringify({ hosts: {} }) }), null);
    expect(h.ok).toBe(false);
    expect(h.summary).toBe("Not signed in to GitHub");
    expect(h.fix).toBe("gh auth login -h github.com");
  });

  it("treats an older gh that only says 'not logged in' on stderr as no login", () => {
    const h = parseGhHealth(
      raw({ hosts: "", detail: "You are not logged into any GitHub hosts. To log in, run: gh auth login" }),
      null,
    );
    expect(h.summary).toBe("Not signed in to GitHub");
  });

  const BAD = "HTTP 401: Bad credentials (https://api.github.com/)";

  it("flags an invalid token on the active account, with gh's reason", () => {
    const h = parseGhHealth(raw({ hosts: hosts({ login: "rsforbes", active: true, state: "error", error: BAD }) }), null);
    expect(h.ok).toBe(false);
    expect(h.unverified).toBeUndefined();
    expect(h.summary).toBe("@rsforbes's token is not working");
    expect(h.detail).toBe(BAD);
    expect(h.fix).toBe("gh auth refresh -h github.com");
  });

  // `gh auth refresh` has no --user flag, so it would refresh the wrong account.
  it("suggests logging in again when the broken account isn't gh's active one", () => {
    const two = hosts({ login: "active-one", active: true, state: "success" }, { login: "picked", state: "error", error: BAD });
    const h = parseGhHealth(raw({ hosts: two }), "picked");
    expect(h.fix).toBe("gh auth login -h github.com");
    expect(h.detail).toContain("@picked isn't gh's active account");
  });

  // GitHub answered, so it's the token, not the network: e.g. SAML SSO not authorized.
  it("treats an HTTP 403 as a token problem, not an unreachable GitHub", () => {
    const forbidden = "HTTP 403: Resource protected by organization SAML enforcement (https://api.github.com/)";
    const h = parseGhHealth(raw({ hosts: hosts({ login: "rsforbes", active: true, state: "error", error: forbidden }) }), null);
    expect(h.unverified).toBeUndefined();
    expect(h.summary).toBe("@rsforbes's token is not working");
  });

  it("treats a failure with no reason as a bad token", () => {
    expect(parseGhHealth(raw({ hosts: hosts({ login: "rsforbes", active: true, state: "error" }) }), null).summary).toBe(
      "@rsforbes's token is not working",
    );
  });

  // Real gh output when offline: same "error" state as a bad token, only the reason differs.
  it("doesn't blame the token when GitHub couldn't be reached", () => {
    const offline = 'Get "https://api.github.com/": dial tcp: lookup api.github.com: no such host';
    for (const [state, error] of [["error", offline], ["timeout", "context deadline exceeded"], ["error", "HTTP 502: Bad Gateway"]]) {
      const h = parseGhHealth(raw({ hosts: hosts({ login: "rsforbes", active: true, state, error }) }), null);
      expect(h.ok).toBe(false);
      expect(h.unverified).toBe(true);
      expect(h.summary).toBe("Couldn't reach GitHub to check @rsforbes");
      expect(h.fix).toBeUndefined();
    }
  });

  it("never blames the token for a timeout, even without a reason", () => {
    const h = parseGhHealth(raw({ hosts: hosts({ login: "rsforbes", active: true, state: "timeout" }) }), null);
    expect(h.unverified).toBe(true);
    expect(h.detail).toBeUndefined();
  });

  // gh refuses `auth refresh` / `auth login` while it's using a token from the environment.
  it("points at the environment variable instead of a gh command for an env token", () => {
    const h = parseGhHealth(
      raw({ hosts: hosts({ login: "rsforbes", active: true, state: "error", error: BAD, tokenSource: "GH_TOKEN" }) }),
      null,
    );
    expect(h.ok).toBe(false);
    expect(h.fix).toBeUndefined();
    expect(h.detail).toContain("GH_TOKEN environment variable");
  });

  // The selected account is the one the app passes to gh_graphql, so its state is what matters.
  it("judges the selected account, not the active one", () => {
    const two = hosts({ login: "active-one", active: true, state: "success" }, { login: "picked", state: "error", error: BAD });
    expect(parseGhHealth(raw({ hosts: two }), "picked").ok).toBe(false);
    expect(parseGhHealth(raw({ hosts: two }), null).ok).toBe(true);
  });

  it("flags a selected account that has since been logged out", () => {
    const h = parseGhHealth(raw(), "someone-else");
    expect(h.ok).toBe(false);
    expect(h.summary).toBe("@someone-else is no longer signed in");
  });

  it("treats a gh build that omits state as healthy", () => {
    expect(parseGhHealth(raw({ hosts: hosts({ login: "rsforbes", active: true }) }), null).ok).toBe(true);
  });

  it("flags output it cannot parse", () => {
    const h = parseGhHealth(raw({ hosts: "not json" }), null);
    expect(h.ok).toBe(false);
    expect(h.summary).toBe("Could not read gh's sign-in state");
  });

  it("flags a github.com entry that isn't a list", () => {
    expect(parseGhHealth(raw({ hosts: JSON.stringify({ hosts: { "github.com": {} } }) }), null).summary).toBe(
      "Could not read gh's sign-in state",
    );
  });
});
