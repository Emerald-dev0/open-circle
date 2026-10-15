import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { parseGithubInput } from "../shared/validation.js";
import { HttpError } from "./http.js";
import type { Store } from "./store.js";

const LIMITS = {
  preview: { ip: 30, username: 10 },
  register: { ip: 10, username: 5 },
};
const WINDOW_SECONDS = 60;

export function clientKey(req: Request): string {
  const forwarded =
    req.headers.get("x-vercel-forwarded-for") ??
    req.headers.get("x-forwarded-for") ??
    "";
  const candidate = forwarded.split(",", 1)[0].trim().toLowerCase();
  const ip = isIP(candidate) ? candidate : "unknown";
  return createHash("sha256").update(ip).digest("hex");
}

export async function enforcePublicRateLimit(
  req: Request,
  store: Store,
  action: keyof typeof LIMITS,
  input: unknown,
): Promise<void> {
  const reject = () => {
    throw new HttpError(
      429,
      "rate_limited",
      "Too many requests. Wait a minute and try again.",
      undefined,
      {
        "retry-after": String(WINDOW_SECONDS),
      },
    );
  };
  const limits = LIMITS[action];
  if (
    !(await store.rateLimit(
      `${action}:ip:${clientKey(req)}`,
      limits.ip,
      WINDOW_SECONDS,
    ))
  )
    reject();

  const username = typeof input === "string" ? parseGithubInput(input) : null;
  if (
    username?.ok &&
    !(await store.rateLimit(
      `${action}:username:${username.value.toLowerCase()}`,
      limits.username,
      WINDOW_SECONDS,
    ))
  ) {
    reject();
  }
}
