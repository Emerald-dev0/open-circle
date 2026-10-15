import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewProfile, rebuildBoard, register } from "../server/board";
import { handle, json } from "../server/http";
import { requireWhatsappMembership } from "../server/whatsapp";
import { githubJson, githubOwner } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

const endpoint = "https://bot.opencircle.test/api/v1/membership";
const input = { github: "Octocat", nickname: "Octo", whatsapp: "0803 123 4567" };

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "test-github-token");
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", endpoint);
  vi.stubEnv("WHATSAPP_MEMBERSHIP_TOKEN", "test-membership-token-at-least-32-characters");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function network(member: boolean) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push(String(url));
    if (String(url) === endpoint) return json({ member });
    expect(JSON.parse(String(init?.body)).variables.l0).toBe("Octocat");
    return githubJson({ data: { u0: githubOwner() } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

describe("Required WhatsApp group membership", () => {
  it("blocks nonmembers before any GitHub request or stored registration", async () => {
    const { calls } = network(false);
    const store = new TestStore();
    const response = await handle(async () => json(await register(store, input)));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "whatsapp_not_member", field: "whatsapp" } });
    expect(calls).toEqual([endpoint]);
    expect(await store.listMembers()).toEqual([]);
    expect((await rebuildBoard(store)).members).toEqual([]);
  });

  it("checks normalized membership first and registers only after confirmation", async () => {
    const { calls, fetchMock } = network(true);
    const result = await register(new TestStore(), input);
    expect(calls).toEqual([endpoint, "https://api.github.com/graphql"]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "POST", body: JSON.stringify({ phone: "+2348031234567" }),
      headers: { authorization: "Bearer test-membership-token-at-least-32-characters", "cache-control": "no-store" },
      redirect: "error",
    });
    expect(result.board.members[0].rank).toBe(1);
    expect(JSON.stringify(result)).not.toContain("8031234567");
  });

  it("rechecks membership on retries and rejects a previously admitted number that has left", async () => {
    network(true);
    const store = new TestStore();
    await register(store, input);
    const { calls } = network(false);
    await expect(register(store, input)).rejects.toMatchObject({ code: "whatsapp_not_member" });
    expect(calls).toEqual([endpoint]);
    expect(await store.listMembers()).toHaveLength(1);
  });

  it("also gates previews and rejects the old username-only preview", async () => {
    const { calls } = network(false);
    const store = new TestStore();
    await expect(previewProfile(store, input.github)).rejects.toMatchObject({ code: "invalid_whatsapp" });
    expect(calls).toEqual([]);
    await expect(previewProfile(store, input.github, input.whatsapp)).rejects.toMatchObject({ code: "whatsapp_not_member" });
    expect(calls).toEqual([endpoint]);
  });

  it.each([undefined, "", "http://bot.opencircle.test/membership", "https://user:secret@bot.opencircle.test/membership"]) (
    "fails closed for missing or unsafe configuration: %s", async (url) => {
      vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", url);
      const { fetchMock } = network(true);
      await expect(register(new TestStore(), input)).rejects.toMatchObject({ status: 503, code: "whatsapp_unavailable" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([json({ member: true }, 401), json({ member: true }, 503), json({ member: "true" }), json({}), new Response("invalid-json")]) (
    "never admits a member after an upstream error or malformed response", async (response) => {
      const fetchMock = vi.fn().mockResolvedValue(response);
      vi.stubGlobal("fetch", fetchMock);
      await expect(register(new TestStore(), input)).rejects.toMatchObject({ status: 503, code: "whatsapp_unavailable" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("handles a disconnected or timed-out bot without leaking request details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret phone and credentials")));
    const response = await handle(async () => { await requireWhatsappMembership("+2348031234567"); return json({ ok: true }); });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).not.toMatch(/8031234567|credentials|secret/);
  });
});
