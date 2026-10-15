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
  const forwarded = req.headers.get("x-vercel-forwarded-for") ?? "";
  const candidate = forwarded.split(",", 1)[0].trim().toLowerCase();
  let ip = !candidate.includes("%") && isIP(candidate) ? candidate : "unknown";
  if (isIP(ip) === 6) {
    const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const [left, right] = normalized.split("::");
    const start = left ? left.split(":") : [];
    const end = right ? right.split(":") : [];
    const parts = right === undefined ? start : [...start, ...Array(8 - start.length - end.length).fill("0"), ...end];
    if (parts.slice(0, 5).every((part) => parseInt(part, 16) === 0) && parseInt(parts[5], 16) === 65535) {
      const high = parseInt(parts[6], 16);
      const low = parseInt(parts[7], 16);
      ip = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    } else {
      ip = `${parts.slice(0, 4).map((part) => part.padStart(4, "0")).join(":")}::/64`;
    }
  }
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
