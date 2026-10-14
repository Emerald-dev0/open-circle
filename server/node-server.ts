/**
 * Standalone Node server for hosts that aren't Vercel (e.g. Pxxl): serves the
 * built SPA from dist/ and the same api/*.ts handlers on the same paths.
 * Background stats refresh just keeps running in this long-lived process.
 *
 *   pnpm build && pnpm build:server && pnpm start
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import * as admin from "../api/admin.js";
import * as board from "../api/board.js";
import * as preview from "../api/preview.js";
import * as register from "../api/register.js";
import { readBody } from "./vite-dev-api.js";

type Handler = (req: Request) => Promise<Response>;
const routes: Record<string, Record<string, Handler | undefined>> = {
  admin: admin as Record<string, Handler>,
  board: board as Record<string, Handler>,
  preview: preview as Record<string, Handler>,
  register: register as Record<string, Handler>,
};

const DIST = path.resolve(process.cwd(), "dist");
const INDEX = path.join(DIST, "index.html");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  const api = /^\/api\/([a-z-]+)\/?$/.exec(url.pathname);
  if (api) {
    const handler = routes[api[1]]?.[req.method ?? "GET"];
    if (!handler) {
      res.writeHead(routes[api[1]] ? 405 : 404).end();
      return;
    }
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === "string") headers.set(key, value);
      }
      const method = req.method ?? "GET";
      const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
      const response = await handler(new Request(url, { method, headers, body }));
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        // Vercel-only CDN directive; meaningless here.
        if (key !== "vercel-cdn-cache-control") res.setHeader(key, value);
      });
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "internal", message: "Something broke on our side." } }));
    }
    return;
  }

  // Static files, falling back to index.html for client-side routes.
  const file = path.join(DIST, path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, ""));
  const target = file.startsWith(DIST) && existsSync(file) && statSync(file).isFile() ? file : INDEX;
  const ext = path.extname(target);
  res.setHeader("content-type", TYPES[ext] ?? "application/octet-stream");
  if (target.includes(`${path.sep}assets${path.sep}`) || target.includes(`${path.sep}fonts${path.sep}`)) {
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
  } else if (target === INDEX) {
    res.setHeader("cache-control", "no-cache");
    if (url.pathname.startsWith("/admin")) res.setHeader("x-robots-tag", "noindex, nofollow");
  }
  createReadStream(target).pipe(res);
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`Devechleon listening on :${port}`));
