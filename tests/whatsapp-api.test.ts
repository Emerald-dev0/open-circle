import { createServer } from "node:http";
import { afterEach, expect, it, vi } from "vitest";
import { GET as previewGet, POST as previewPost } from "../api/preview";
import { POST as registerPost } from "../api/register";
import { githubJson, githubOwner } from "./helpers/fixtures";
import { TestStore } from "./helpers/test-store";

let store: TestStore;
vi.mock("../server/db", () => ({ getStore: () => store }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("runs the public handlers through a real HTTP membership service before contacting GitHub", async () => {
  store = new TestStore();
  const token = "local-http-membership-test-token-32-characters";
  const signup = { github: "Octocat", nickname: "Octo", whatsapp: "+234 803 123 4567" };
  let member = false;
  let available = true;
  const membershipCalls: unknown[] = [];
  const service = createServer(async (request, response) => {
    expect(request.method).toBe("POST");
    expect(request.headers.authorization).toBe(`Bearer ${token}`);
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    membershipCalls.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(available ? 200 : 503, { "content-type": "application/json" });
    response.end(JSON.stringify({ member }));
  });
  await new Promise<void>((resolve) => service.listen(0, "127.0.0.1", resolve));
  const address = service.address();
  expect(address && typeof address !== "string").toBe(true);
  if (!address || typeof address === "string") throw new Error("No test server address");
  vi.stubEnv("WHATSAPP_MEMBERSHIP_URL", `http://127.0.0.1:${address.port}/membership`);
  vi.stubEnv("WHATSAPP_MEMBERSHIP_TOKEN", token);
  vi.stubEnv("GITHUB_TOKEN", "github-test-token");
  const nativeFetch = globalThis.fetch;
  const github = vi.fn().mockImplementation(async () => githubJson({ data: { u0: githubOwner() } }));
  vi.stubGlobal("fetch", (url: string | URL, init?: RequestInit) =>
    String(url) === "https://api.github.com/graphql" ? github(url, init) : nativeFetch(url, init));
  const request = (path: string, body: unknown) => new Request(`https://opencircle.test/api/${path}`, {
    method: "POST", headers: { "content-type": "application/json", "x-vercel-forwarded-for": "192.0.2.20" }, body: JSON.stringify(body),
  });
  try {
    const legacy = await previewGet(new Request("https://opencircle.test/api/preview?u=Octocat"));
    expect(legacy.status).toBe(400);
    expect(legacy.headers.get("cache-control")).toBe("no-store");
    expect(membershipCalls).toEqual([]);
    for (const [index, whatsapp] of ["0803 123 4567", "2348031234567", "002348031234567"].entries()) {
      for (const [path, handler] of [["preview", previewPost], ["register", registerPost]] as const) {
        const response = await handler(request(path, { ...signup, github: `invalid-phone-${index}`, whatsapp }));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "invalid_whatsapp", field: "whatsapp", message: expect.stringContaining("country code") } });
      }
    }
    expect(membershipCalls).toEqual([]);
    expect(github).not.toHaveBeenCalled();
    expect((await previewPost(request("preview", signup))).status).toBe(403);
    const rejected = await registerPost(request("register", signup));
    expect(rejected.status).toBe(403);
    expect(github).not.toHaveBeenCalled();
    expect(await store.listMembers()).toEqual([]);
    member = true;
    expect((await previewPost(request("preview", signup))).status).toBe(200);
    const admitted = await registerPost(request("register", signup));
    expect(admitted.status).toBe(200);
    expect(admitted.headers.get("cache-control")).toBe("no-store");
    const result = await admitted.json();
    expect(result.board.members).toMatchObject([{ login: "Octocat", rank: 1 }]);
    expect(JSON.stringify(result)).not.toMatch(/"whatsapp":|8031234567/);
    expect(membershipCalls).toEqual(Array.from({ length: 4 }, () => ({ phone: "+2348031234567" })));
    expect(github).toHaveBeenCalledTimes(2);
    available = false;
    expect((await registerPost(request("register", signup))).status).toBe(503);
    expect(github).toHaveBeenCalledTimes(2);
    expect((await previewPost(request("preview", { ...signup, nickname: "x" }))).status).toBe(400);
    expect((await registerPost(request("register", { ...signup, whatsapp: "" }))).status).toBe(400);
  } finally {
    await new Promise<void>((resolve, reject) => service.close((error) => error ? reject(error) : resolve()));
  }
});
