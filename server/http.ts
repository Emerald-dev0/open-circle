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

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-robots-tag": "noindex",
      ...headers,
    },
  });
}

const NO_STORE = { "cache-control": "no-store" };

/** Runs a handler and turns thrown errors into `{ error: { code, message } }`. */
export async function handle(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
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
