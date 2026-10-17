import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCommunityStore } from "../server/community-memory";
import { beginGitHubSignIn, finishGitHubSignIn, githubProfile, githubSignInAvailable, profileActor, sessionHash, signOutGitHub } from "../server/github-auth";
import { adminProfile } from "../server/admin-session";

const callback = "https://opencircle.test/api/auth-callback";
let store: MemoryCommunityStore;

function start() {
  const response = beginGitHubSignIn(new Request("https://opencircle.test/api/auth-start"));
  const destination = new URL(response.headers.get("location")!);
  const cookie = response.headers.get("set-cookie")!.split(";", 1)[0];
  const request = new Request(`${callback}?code=github-code&state=${destination.searchParams.get("state")}`, { headers: { cookie } });
  return { response, destination, cookie, request };
}

beforeEach(() => {
  store = new MemoryCommunityStore(null);
  vi.stubEnv("GITHUB_OAUTH_CLIENT_ID", "test-client");
  vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", callback);
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("GitHub sign-in", () => {
  it("keeps the verified display name in member and admin sessions", async () => {
    vi.stubEnv("ADMIN_GITHUB_IDS", "123");
    for (const admin of [false, true]) {
      const start = beginGitHubSignIn(new Request(`https://opencircle.test/api/auth-start?returnTo=${admin ? "/admin" : "/tools"}`));
      const state = new URL(start.headers.get("location")!).searchParams.get("state");
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "private-oauth-token", token_type: "bearer" }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, login: "octocat", name: "  Mona Octocat  ", type: "User" }))));
      const response = await finishGitHubSignIn(new Request(`${callback}?code=test&state=${state}`, { headers: { cookie: start.headers.get("set-cookie")!.split(";")[0] } }), store);
      const session = response.headers.getSetCookie().find(cookie => cookie.startsWith(admin ? "__Host-opencircle_admin=" : "opencircle_github="))!.split(";")[0];
      const request = new Request("https://opencircle.test/api/community", { headers: { cookie: session } });
      const profile = admin ? await adminProfile(request, store) : await githubProfile(request, store);
      expect(profile).toEqual({ id: 123, login: "octocat", name: "Mona Octocat", avatarUrl: "https://avatars.githubusercontent.com/u/123?s=80" });
      expect(JSON.stringify(profile)).not.toContain("private-oauth-token");
    }
  });
  it("uses exact callbacks, random state and PKCE without requesting private access", () => {
    const { response, destination } = start();
    expect(destination.origin).toBe("https://github.com");
    expect(destination.searchParams.get("redirect_uri")).toBe(callback);
    expect(destination.searchParams.get("scope")).toBe("");
    expect(destination.searchParams.get("code_challenge_method")).toBe("S256");
    expect(destination.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
    expect(start().destination.searchParams.get("state")).not.toBe(destination.searchParams.get("state"));
  });

  it("verifies the authenticated GitHub user and stores only a hash of the session token", async () => {
    const flow = start();
    const exchange = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "github-secret-token", token_type: "bearer" }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 123, login: "octocat", type: "User" })));
    vi.stubGlobal("fetch", exchange);
    const create = vi.spyOn(store, "createSession");
    const response = await finishGitHubSignIn(flow.request, store);
    expect(response.headers.get("location")).toBe("/tools");
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((cookie) => cookie.startsWith("opencircle_github="))!.split(";", 1)[0];
    const authenticated = new Request("https://opencircle.test/api/community", { headers: { cookie: session } });
    const hash = sessionHash(authenticated)!;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(create.mock.calls[0][0]).toBe(hash);
    expect(hash).not.toBe(session.split("=")[1]);
    expect(await githubProfile(authenticated, store)).toEqual({ id: 123, login: "octocat", avatarUrl: "https://avatars.githubusercontent.com/u/123?s=80" });
    expect(JSON.stringify(create.mock.calls)).not.toContain("github-secret-token");
    expect(cookies.join(" ")).not.toContain("github-secret-token");
    const parameters = exchange.mock.calls[0][1].body as URLSearchParams;
    expect(createHash("sha256").update(parameters.get("code_verifier")!).digest("base64url")).toBe(flow.destination.searchParams.get("code_challenge"));
    expect(exchange.mock.calls[1][0]).toBe("https://api.github.com/user");
    expect(exchange.mock.calls[1][1].headers.authorization).toBe("Bearer github-secret-token");
    expect(cookies.some((cookie) => cookie.startsWith("opencircle_oauth=;"))).toBe(true);
    await signOutGitHub(authenticated, store);
    expect(await githubProfile(authenticated, store)).toBeNull();
  });

  it.each(["wrong-state", "tampered-cookie", "missing-cookie", "expired"])("rejects %s before contacting GitHub", async (kind) => {
    const flow = start();
    const url = new URL(flow.request.url);
    let cookie = flow.cookie;
    if (kind === "wrong-state") url.searchParams.set("state", "b".repeat(64));
    if (kind === "tampered-cookie") cookie += "x";
    if (kind === "missing-cookie") cookie = "";
    if (kind === "expired") vi.spyOn(Date, "now").mockReturnValue(Date.now() + 601_000);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await finishGitHubSignIn(new Request(url, { headers: { cookie } }), store);
    expect(response.headers.get("location")).toBe("/tools?signin=github_state");
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("handles cancellation and provider failures without creating a session", async () => {
    const flow = start();
    const create = vi.spyOn(store, "createSession");
    const url = new URL(flow.request.url);
    url.searchParams.set("error", "access_denied");
    const cancelled = await finishGitHubSignIn(new Request(url, { headers: { cookie: flow.cookie } }), store);
    expect(cancelled.headers.get("location")).toContain("github_denied");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const failed = await finishGitHubSignIn(flow.request, store);
    expect(failed.headers.get("location")).toContain("github_unavailable");
    expect(create).not.toHaveBeenCalled();
  });

  it("keys votes by durable GitHub ID and rejects forged or expired sessions", async () => {
    expect(profileActor({ id: 1, login: "before", avatarUrl: "" })).toBe(profileActor({ id: 1, login: "renamed", avatarUrl: "" }));
    const forged = new Request("https://opencircle.test/api/community", { headers: { cookie: `opencircle_github=${"b".repeat(64)}` } });
    expect(await githubProfile(forged, store)).toBeNull();
    await store.createSession(sessionHash(forged)!, { id: 1, login: "octocat", avatarUrl: "" }, Date.now() - 1);
    expect(await githubProfile(forged, store)).toBeNull();
  });

  it("fails closed when credentials or the callback origin are unavailable", () => {
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "");
    expect(githubSignInAvailable()).toBe(false);
    expect(() => start()).toThrow("isn't set up");
    vi.stubEnv("GITHUB_OAUTH_CLIENT_SECRET", "test-secret");
    expect(() => beginGitHubSignIn(new Request("https://attacker.test/api/auth-start"))).toThrow("configured site");
    vi.stubEnv("GITHUB_OAUTH_REDIRECT_URI", "http://opencircle.test/api/auth-callback");
    expect(githubSignInAvailable()).toBe(false);
  });
});
