import type { ApiErrorBody } from "../shared/types.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
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
      const body: ApiErrorBody = { error: { code: err.code, message: err.message, field: err.field } };
      return json(body, err.status, NO_STORE);
    }
    console.error(err);
    const body: ApiErrorBody = { error: { code: "internal", message: "Something broke on our side. Try again in a minute." } };
    return json(body, 500, NO_STORE);
  }
}

export async function readJson(req: Request, maxBytes = 4096): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "That request is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_json", "That request wasn't valid JSON.");
  }
}
