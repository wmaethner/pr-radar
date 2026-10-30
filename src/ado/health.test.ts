import { describe, expect, it } from "vitest";
import { parseAzHealth, type AzHealthRaw } from "./health";

const raw = (over: Partial<AzHealthRaw> = {}): AzHealthRaw => ({
  found: true,
  ok: true,
  user: "me@example.com",
  detail: "",
  ...over,
});

describe("parseAzHealth", () => {
  it("names the signed-in user", () => {
    const h = parseAzHealth(raw());
    expect(h.ok).toBe(true);
    expect(h.summary).toBe("Signed in as me@example.com");
  });

  it("flags a missing az with an install link and no command", () => {
    const h = parseAzHealth(raw({ found: false, user: "" }));
    expect(h.ok).toBe(false);
    expect(h.summary).toBe("Azure CLI not found");
    expect(h.url).toBeTruthy();
    expect(h.fix).toBeUndefined();
  });

  it("flags a login whose token can't be used, with az's reason", () => {
    const h = parseAzHealth(raw({ ok: false, user: "", detail: "Please run 'az login'." }));
    expect(h.ok).toBe(false);
    expect(h.summary).toBe("Not signed in to Azure");
    expect(h.detail).toBe("Please run 'az login'.");
    expect(h.fix).toBe("az login");
  });

  it("doesn't call it a login problem when az couldn't connect", () => {
    const detail =
      "HTTPSConnectionPool(host='login.microsoftonline.com', port=443): Max retries exceeded with url: /organizations/oauth2/v2.0/token (Caused by NewConnectionError(...))";
    const h = parseAzHealth(raw({ ok: false, user: "", detail }));
    expect(h.ok).toBe(false);
    expect(h.unverified).toBe(true);
    expect(h.fix).toBeUndefined();
  });

  it("still asks for a login when az says so, even alongside connection noise", () => {
    const detail = "AADSTS700082: The refresh token has expired due to inactivity. Max retries exceeded. Please run 'az login'.";
    const h = parseAzHealth(raw({ ok: false, user: "", detail }));
    expect(h.unverified).toBeUndefined();
    expect(h.fix).toBe("az login");
  });

  it("stays healthy when the user name couldn't be read", () => {
    const h = parseAzHealth(raw({ user: "" }));
    expect(h.ok).toBe(true);
    expect(h.summary).toBe("Signed in to Azure");
  });
});
