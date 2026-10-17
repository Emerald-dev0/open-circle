import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { handle, HttpError, json, MAX_REQUEST_BYTES } from "./http.js";
import { apiBodyLimit, validateApiRequest } from "./api-security.js";

export async function readBody(
  req: IncomingMessage,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<Buffer> {
  const declaredLength = req.headers["content-length"];
  if (
    typeof declaredLength === "string" &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    throw new HttpError(413, "too_large", "That request is too large.");
  }
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += bytes.byteLength;
    if (bytesRead > maxBytes)
      throw new HttpError(413, "too_large", "That request is too large.");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, bytesRead);
}

/**
 * Serves api/*.ts under `vite dev` with the same Web Request/Response
 * handlers Vercel runs in production, so there's no second server to start.
 */
export function devApi(): Plugin {
  return {
    name: "opencircle:dev-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = /^\/api\/([a-z-]+)\/?$/.exec(url.pathname);
        if (!match) {
          if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) return next();
          const response = json({ error: { code: "not_found", message: "That endpoint does not exist." } }, 404);
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.statusCode = response.status;
          return res.end(await response.text());
        }

        const file = path.resolve(server.config.root, "api", `${match[1]}.ts`);
        if (!existsSync(file)) {
          const response = json({ error: { code: "not_found", message: "That endpoint does not exist." } }, 404);
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.statusCode = response.status;
          return res.end(await response.text());
        }

        try {
          const mod = await server.ssrLoadModule(file);
          const method = req.method ?? "GET";
          const handler = mod[method] as
            | ((r: Request) => Promise<Response>)
            | undefined;
          if (typeof handler !== "function" || !["GET", "POST", "PATCH", "DELETE"].includes(method)) {
            const response = json({ error: { code: "method_not_allowed", message: "That method is not supported." } }, 405, { allow: Object.keys(mod).filter((key) => /^(GET|POST|PATCH|DELETE)$/.test(key)).join(", ") });
            response.headers.forEach((value, key) => res.setHeader(key, value));
            res.statusCode = response.status;
            return res.end(await response.text());
          }

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
          }
          headers.set(
            "x-vercel-forwarded-for",
            req.socket.remoteAddress ?? "127.0.0.1",
          );
          const response = await handle(async () => {
            validateApiRequest(new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`), { method, headers }));
            const body =
              method === "GET" || method === "HEAD"
                ? undefined
                : await readBody(req, apiBodyLimit(url.pathname));
            return handler(
              new Request(
                new URL(
                  req.url ?? "/",
                  `http://${req.headers.host ?? "localhost"}`,
                ),
                {
                  method,
                  headers,
                  body: body ? new Uint8Array(body) : undefined,
                },
              ),
            );
          });

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key !== "set-cookie") res.setHeader(key, value);
          });
          const cookies = response.headers.getSetCookie();
          if (cookies.length) res.setHeader("set-cookie", cookies);
          if (response.status === 413) res.setHeader("connection", "close");
          if (url.pathname === "/api/event-media" && response.ok && response.body) await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), res).catch(() => res.destroy());
          else res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          next(err);
        }
      });
    },
  };
}
