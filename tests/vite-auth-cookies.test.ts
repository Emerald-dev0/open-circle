import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { ViteDevServer } from "vite";
import { expect, it } from "vitest";
import { devApi } from "../server/vite-dev-api";

it("sends OAuth cleanup and session cookies as separate HTTP headers", async () => {
  let middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => Promise<void>;
  const configure = devApi().configureServer as (server: ViteDevServer) => void;
  configure({
    config: { root: process.cwd() },
    middlewares: { use: (handler: typeof middleware) => { middleware = handler; } },
    ssrLoadModule: async () => ({ GET: async () => {
      const headers = new Headers({ location: "/tools" });
      headers.append("set-cookie", "opencircle_oauth=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      headers.append("set-cookie", "opencircle_github=test-session; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800");
      return new Response(null, { status: 302, headers });
    } }),
    ssrFixStacktrace: () => undefined,
  } as unknown as ViteDevServer);
  const server = createServer((req, res) => { void middleware(req, res, () => { res.statusCode = 404; res.end(); }); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth-callback`, { redirect: "manual" });
    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.getSetCookie()[1]).toContain("opencircle_github=test-session");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
