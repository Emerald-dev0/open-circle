import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";
import { handle, HttpError, MAX_REQUEST_BYTES } from "./http.js";

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
        if (!match) return next();

        const file = path.resolve(server.config.root, "api", `${match[1]}.ts`);
        if (!existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }

        try {
          const mod = await server.ssrLoadModule(file);
          const method = req.method ?? "GET";
          const handler = mod[method] as
            | ((r: Request) => Promise<Response>)
            | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
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
            const body =
              method === "GET" || method === "HEAD"
                ? undefined
                : await readBody(req);
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
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          next(err);
        }
      });
    },
  };
}
