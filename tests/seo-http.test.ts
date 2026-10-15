import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_SITE_URL } from "../shared/brand";
import { createAppServer } from "../server/node-server";

vi.mock("../server/db", () => ({ getStore: () => null }));
vi.mock("../server/community-store", () => ({ getCommunityStore: () => null }));

let server: Server;
let base: string;
let directory: string;

beforeEach(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "opencircle-seo-"));
  writeFileSync(path.join(directory, "index.html"), readFileSync(new URL("../index.html", import.meta.url), "utf8"));
  server = createAppServer(directory);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No HTTP test port");
  base = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  rmSync(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

it("serves route metadata, a real 404 and a trailing-slash redirect", async () => {
  const repositories = await fetch(`${base}/repositories`);
  expect(repositories.status).toBe(200);
  const html = await repositories.text();
  expect(html).toContain("<title>Spotlight · OpenCircle</title>");
  expect(html).toContain(`href="${DEFAULT_SITE_URL}/repositories"`);
  expect(html).toContain("One repo per developer. At least 5 stars.");
  expect(repositories.headers.get("x-robots-tag")).toBeNull();

  const missing = await fetch(`${base}/missing`);
  expect(missing.status).toBe(404);
  expect(missing.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(await missing.text()).toContain("<title>Page not found · OpenCircle</title>");

  const admin = await fetch(`${base}/admin`);
  expect(admin.status).toBe(200);
  expect(admin.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(admin.headers.get("x-frame-options")).toBe("DENY");

  const editor = await fetch(`${base}/portfolio`);
  expect(editor.status).toBe(200);
  expect(editor.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  expect(editor.headers.get("cache-control")).toBe("no-store");
  expect(editor.headers.get("x-frame-options")).toBe("DENY");
  expect(await editor.text()).toContain("<title>Your portfolio · OpenCircle</title>");

  const slash = await fetch(`${base}/repositories/?q=1`, { redirect: "manual" });
  expect(slash.status).toBe(301);
  expect(slash.headers.get("location")).toBe("/repositories?q=1");
});

it.each(["/%2Fevil.example", "/%5Cevil.example", "/%0D%0Aheader", "/repositories%2F"])("preserves encoded redirect path %s", async (pathname) => {
  const response = await fetch(`${base}${pathname}/`, { redirect: "manual" });
  expect(response.status).toBe(301);
  expect(response.headers.get("location")).toBe(pathname);
  expect(new URL(response.headers.get("location")!, base).origin).toBe(base);
  expect((await fetch(`${base}/repositories`)).status).toBe(200);
});
