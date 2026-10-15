import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { Client, Pool } from "pg";
import { createServer } from "vite";
import { createAdminSession } from "../server/admin-session.js";
import { PostgresCommunityStore } from "../server/community-postgres.js";
import { PostgresStore } from "../server/store-postgres.js";
import { memberRecord } from "../tests/helpers/fixtures.js";
import { loadLocalEnv } from "./env.js";
import { runMigrations } from "./migrations.js";

loadLocalEnv();
const connectionString = process.env.POSTGRES_TEST_URL;
const directUrl = process.env.POSTGRES_TEST_URL_UNPOOLED;
if (!connectionString || !directUrl) {
  throw new Error("Set POSTGRES_TEST_URL and POSTGRES_TEST_URL_UNPOOLED to a disposable Neon test branch.");
}
if (new URL(connectionString).hostname === new URL(process.env.DATABASE_URL ?? connectionString).hostname) {
  throw new Error("The Postgres test branch must be separate from the app's configured database.");
}
if (!process.env.GITHUB_TOKEN) throw new Error("Set GITHUB_TOKEN to verify registration against real GitHub.");

const client = new Client({ connectionString: directUrl, connectionTimeoutMillis: 15_000 });
const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 15_000 });
const store = new PostgresStore(pool);
let server: Awaited<ReturnType<typeof createServer>> | undefined;
const originalDatabaseUrl = process.env.DATABASE_URL;
const adminEnvKeys = ["ADMIN_GITHUB_IDS", "GITHUB_OAUTH_CLIENT_ID", "GITHUB_OAUTH_CLIENT_SECRET", "GITHUB_OAUTH_REDIRECT_URI"] as const;
const originalAdminEnv = Object.fromEntries(adminEnvKeys.map((key) => [key, process.env[key]]));
const originalMembershipUrl = process.env.WHATSAPP_MEMBERSHIP_URL;
const originalMembershipToken = process.env.WHATSAPP_MEMBERSHIP_TOKEN;
const membershipToken = randomUUID();
const membershipServer = createHttpServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const { phone } = JSON.parse(Buffer.concat(chunks).toString());
  response.writeHead(request.headers.authorization === `Bearer ${membershipToken}` ? 200 : 401, { "content-type": "application/json" });
  response.end(JSON.stringify({ member: ["+447700900123", "+447700900124"].includes(phone) }));
});

try {
  await client.connect();
  const applied = await runMigrations(client);
  assert.deepEqual(await runMigrations(client), []);
  console.log(`PASS migrations on isolated Neon branch (${applied.length} applied; rerun is idempotent)`);

  const id = randomUUID().replaceAll("-", "").slice(0, 12);
  const first = memberRecord({ login: `test-${id}`, displayLogin: `test-${id}`, nickname: `Test ${id}`, whatsapp: "+447700900001" });
  const second = memberRecord({ login: `other-${id}`, displayLogin: `other-${id}`, nickname: `Other ${id}`, whatsapp: "+447700900002" });
  const created = await Promise.all([store.createMember(first), store.createMember(first)]);
  assert.equal(created.filter((result) => result.ok).length, 1);
  assert.deepEqual(created.find((result) => !result.ok), { ok: false, conflict: "github" });
  assert.deepEqual(await store.createMember({ ...second, whatsapp: first.whatsapp }), { ok: false, conflict: "whatsapp" });
  assert.deepEqual(await store.createMember({ ...second, nickname: first.nickname.toUpperCase() }), { ok: false, conflict: "nickname" });
  assert.deepEqual(await store.getMember(first.login), first);
  await Promise.all([
    store.patchMember(first.login, { stars: 321 }),
    store.patchMember(first.login, { hidden: true }),
  ]);
  assert.equal((await store.getMember(first.login))?.stars, 321);
  assert.equal((await store.getMember(first.login))?.hidden, true);
  assert((await store.listMembers()).some((member) => member.login === first.login));
  await store.deleteMember(first.login);
  await store.patchMember(first.login, { stars: 999 });
  assert.equal(await store.getMember(first.login), null);
  assert.deepEqual(await store.createMember({ ...second, whatsapp: first.whatsapp, nickname: first.nickname }), { ok: true });
  await store.deleteMember(second.login);
  console.log("PASS member persistence, concurrent uniqueness, partial updates and deletion without resurrection");

  const lock = `test-lock-${id}`;
  const locks = await Promise.all(Array.from({ length: 6 }, () => store.tryLock(lock, 60)));
  assert.equal(locks.filter(Boolean).length, 1);
  await client.query("UPDATE opencircle_locks SET expires_at = NOW() - INTERVAL '1 second' WHERE name = $1", [lock]);
  assert.equal(await store.tryLock(lock, 60), true);
  await store.unlock(lock);
  assert.equal(await store.tryLock(lock, 60), true);
  await store.unlock(lock);
  const key = `test-limit-${id}`;
  const limits = await Promise.all(Array.from({ length: 8 }, () => store.rateLimit(key, 3, 60)));
  assert.equal(limits.filter(Boolean).length, 3);
  await client.query("UPDATE opencircle_rate_limits SET expires_at = NOW() - INTERVAL '1 second' WHERE key = $1", [key]);
  assert.equal(await store.rateLimit(key, 3, 60), true);
  assert.equal(await store.rateLimit(`${key}-other`, 3, 60), true);
  console.log("PASS cross-request refresh locks, concurrent request limits and expired-window recovery");

  process.env.DATABASE_URL = connectionString;
  process.env.ADMIN_GITHUB_IDS = "1";
  process.env.GITHUB_OAUTH_CLIENT_ID = "postgres-test-client";
  process.env.GITHUB_OAUTH_CLIENT_SECRET = randomUUID();
  await new Promise<void>((resolve) => membershipServer.listen(0, "127.0.0.1", resolve));
  const membershipAddress = membershipServer.address();
  assert(membershipAddress && typeof membershipAddress !== "string");
  process.env.WHATSAPP_MEMBERSHIP_URL = `http://127.0.0.1:${membershipAddress.port}/membership`;
  process.env.WHATSAPP_MEMBERSHIP_TOKEN = membershipToken;
  server = await createServer({ server: { host: "127.0.0.1", port: 0, open: false }, mode: "test" });
  await server.listen();
  const address = server.httpServer?.address();
  assert(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  console.log(`App started at ${origin}`);
  process.env.GITHUB_OAUTH_REDIRECT_URI = `${origin}/api/auth-callback`;
  const sessions = new PostgresCommunityStore(pool);
  const adminRequest = new Request(`${origin}/api/admin`);
  const cookie = (await createAdminSession(adminRequest, sessions, { id: 1, login: "test-organiser", avatarUrl: "" })).split(";", 1)[0];
  const headers = { cookie, origin, "x-opencircle-admin": "1", "content-type": "application/json" };
  const request = async (path: string, init?: RequestInit, status = 200) => {
    const response = await fetch(`${origin}${path}`, init);
    const text = await response.text();
    assert.equal(response.status, status, `${path} returned ${response.status}: ${text}`);
    return text ? JSON.parse(text) : null;
  };

  assert.equal((await fetch(origin)).status, 200);
  await request("/api/admin", undefined, 401);
  const initial = await request("/api/admin", { headers });
  const initialBoard = await request("/api/board");
  const signup = { github: "octocat", nickname: `Neon ${id}`, whatsapp: "+447700900123" };
  await request("/api/preview?u=octocat", undefined, 400);
  const preview = await request("/api/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signup) });
  assert.equal(preview.profile.login.toLowerCase(), "octocat");
  await request("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...signup, whatsapp: "+447700900125" }) }, 403);
  assert.equal(await store.getMember("octocat"), null, "Test branch already contains octocat; use a fresh test branch.");
  const registered = await request("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signup) });
  assert.equal(registered.login.toLowerCase(), "octocat");
  assert(registered.board.members.some((member: { login: string }) => member.login.toLowerCase() === "octocat"));
  assert(!JSON.stringify(registered).includes(signup.whatsapp));
  assert(!JSON.stringify(registered).includes('"whatsapp"'));
  assert.equal((await store.getMember("octocat"))?.whatsapp, signup.whatsapp);
  const retry = await request("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(signup) });
  assert.equal(retry.login.toLowerCase(), "octocat");
  await request("/api/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...signup, whatsapp: "+447700900124" }) }, 409);
  const publicBoard = await request("/api/board");
  assert(publicBoard.members.some((member: { login: string }) => member.login.toLowerCase() === "octocat"));
  assert(publicBoard.repositories.length > 0);
  assert(!JSON.stringify(publicBoard).includes('"whatsapp"'));
  console.log("PASS HTTP: app, real GitHub preview, registration and repository board; simulated membership rejects nonmembers; duplicates return 409; phones stay private");

  const persistedPool = new Pool({ connectionString, max: 2 });
  try {
    assert.equal((await new PostgresStore(persistedPool).getMember("octocat"))?.whatsapp, signup.whatsapp);
  } finally {
    await persistedPool.end();
  }
  const config = { ...initial.config, invite: { ...initial.config.invite, note: `Neon verification ${id}` } };
  await request("/api/admin", { method: "POST", headers, body: JSON.stringify({ action: "config", config }) });
  assert.equal((await store.getConfig())?.invite?.note, config.invite.note);
  assert.equal((await request("/api/board")).invite.note, config.invite.note);
  await request("/api/admin", { method: "POST", headers, body: JSON.stringify({ action: "hide", login: "octocat" }) });
  assert(!(await request("/api/board")).members.some((member: { login: string }) => member.login.toLowerCase() === "octocat"));
  await request("/api/admin", { method: "POST", headers, body: JSON.stringify({ action: "unhide", login: "octocat" }) });
  assert((await request("/api/board")).members.some((member: { login: string }) => member.login.toLowerCase() === "octocat"));
  await request("/api/admin", { method: "POST", headers, body: JSON.stringify({ action: "remove", login: "octocat" }) });
  assert.equal(await store.getMember("octocat"), null);
  await request("/api/admin", { method: "POST", headers, body: JSON.stringify({ action: "config", config: initial.config }) });
  assert.equal((await request("/api/board")).members.length, initialBoard.members.length);
  console.log("PASS HTTP 200: saved settings, hide, restore and removal; data persists across independent connections");
  console.log("PASS Neon Postgres end-to-end verification complete");
} finally {
  if (server) await server.close();
  if (membershipServer.listening) await new Promise<void>((resolve, reject) => membershipServer.close((error) => error ? reject(error) : resolve()));
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  for (const key of adminEnvKeys) {
    if (originalAdminEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalAdminEnv[key];
  }
  if (originalMembershipUrl === undefined) delete process.env.WHATSAPP_MEMBERSHIP_URL;
  else process.env.WHATSAPP_MEMBERSHIP_URL = originalMembershipUrl;
  if (originalMembershipToken === undefined) delete process.env.WHATSAPP_MEMBERSHIP_TOKEN;
  else process.env.WHATSAPP_MEMBERSHIP_TOKEN = originalMembershipToken;
  await pool.end();
  await client.end();
}
