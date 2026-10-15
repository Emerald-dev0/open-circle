import { createHash } from "node:crypto";
import type { ApiErrorBody } from "../shared/types.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "x-robots-tag": "noindex",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "cache-control": "no-store",
};

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function conditionalJson(req: Request, data: unknown, headers: Record<string, string>): Response {
  const body = JSON.stringify(data);
  const tag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  const unchanged = req.headers.get("if-none-match")?.split(",").some((value) => {
    const candidate = value.trim().replace(/^W\//, "");
    return candidate === "*" || candidate === tag;
  });
  return new Response(unchanged ? null : body, {
    status: unchanged ? 304 : 200,
    headers: { ...JSON_HEADERS, ...headers, etag: `W/${tag}` },
  });
}

const NO_STORE = { "cache-control": "no-store" };

/** Runs a handler and turns thrown errors into `{ error: { code, message } }`. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    const response = await run();
    response.headers.set("x-content-type-options", "nosniff");
    response.headers.set("referrer-policy", "same-origin");
    response.headers.set("x-robots-tag", "noindex");
    if (!response.headers.has("cache-control")) response.headers.set("cache-control", "no-store");
    return response;
  } catch (err) {
    if (err instanceof HttpError) {
      const body: ApiErrorBody = {
        error: { code: err.code, message: err.message, field: err.field },
      };
      return json(body, err.status, { ...err.headers, ...NO_STORE });
    }
    console.error(err);
    const body: ApiErrorBody = {
      error: {
        code: "internal",
        message: "Something broke on our side. Try again in a minute.",
      },
    };
    return json(body, 500, NO_STORE);
  }
}

export const MAX_REQUEST_BYTES = 4096;

export async function readJson(
  req: Request,
  maxBytes = MAX_REQUEST_BYTES,
): Promise<unknown> {
  const declaredLength = req.headers.get("content-length");
  if (
    declaredLength &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > maxBytes
  ) {
    await req.body?.cancel().catch(() => undefined);
    throw new HttpError(413, "too_large", "That request is too large.");
  }

  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  const reader = req.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytesRead += value.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new HttpError(413, "too_large", "That request is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new HttpError(400, "bad_json", "That request wasn't valid JSON.");
  }
}

export function requireSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  const site = req.headers.get("sec-fetch-site");
  if ((origin !== null && origin !== new URL(req.url).origin) || site === "cross-site" || site === "same-site")
    throw new HttpError(403, "cross_origin", "Open this page directly to make changes.");
}
