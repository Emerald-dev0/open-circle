import { existsSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import type { Plugin } from "vite";

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

/**
 * Serves api/*.ts under `vite dev` with the same Web Request/Response
 * handlers Vercel runs in production, so there's no second server to start.
 */
export function devApi(): Plugin {
  return {
    name: "devechleon:dev-api",
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
          const handler = mod[method] as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
          }
          const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
          const response = await handler(
            new Request(new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`), { method, headers, body }),
          );

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          next(err);
        }
      });
    },
  };
}
