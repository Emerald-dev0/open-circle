import { createHash, randomBytes } from "node:crypto";
import type { GitHubProfile } from "../shared/community.js";
import type { CommunityStore } from "./community-contract.js";
import { requireSameOriginJson } from "./community.js";
import { HttpError } from "./http.js";

export const ADMIN_SESSION_SECONDS = 60 * 60;

export function adminUserIds(): Set<string> {
  const values = (process.env.ADMIN_GITHUB_IDS ?? "").split(",").map((id) => id.trim());
  if (!values.length || values.some((id) => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) return new Set();
  return new Set(values);
}

function cookieName(req: Request): string {
  return new URL(req.url).protocol === "https:" ? "__Host-opencircle_admin" : "opencircle_admin";
}

function sessionHash(token: string): string {
  return createHash("sha256").update(`admin:${token}`).digest("hex");
}

export function adminSessionHash(req: Request): string | null {
  const name = cookieName(req);
  const token = req.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? sessionHash(token) : null;
}

function sessionCookie(req: Request, token: string, seconds: number): string {
  return `${cookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}

export function requireAdminOrigin(req: Request, mutation = false): void {
  const url = new URL(req.url);
  const callback = process.env.GITHUB_OAUTH_REDIRECT_URI;
  let origin: string | undefined;
  try { origin = callback ? new URL(callback).origin : undefined; } catch { origin = undefined; }
  if (origin !== url.origin || (url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    throw new HttpError(403, "admin_origin", "Open the configured site to manage OpenCircle.");
  if (req.headers.get("sec-fetch-site") === "cross-site" || (req.headers.has("origin") && req.headers.get("origin") !== url.origin))
    throw new HttpError(403, "cross_origin", "Open this page directly to make changes.");
  if (mutation) {
    requireSameOriginJson(req);
    if (req.headers.get("origin") !== url.origin || req.headers.get("x-opencircle-admin") !== "1")
      throw new HttpError(403, "admin_csrf", "Reload the admin page and try again.");
  }
}

export async function adminProfile(req: Request, store: CommunityStore): Promise<GitHubProfile | null> {
  const hash = adminSessionHash(req);
  const profile = hash ? await store.readSession(hash) : null;
  return profile && adminUserIds().has(String(profile.id)) ? { id: profile.id, login: profile.login, ...(profile.name ? { name: profile.name } : {}), avatarUrl: profile.avatarUrl } : null;
}

export async function createAdminSession(req: Request, store: CommunityStore, profile: GitHubProfile): Promise<string> {
  if (!adminUserIds().has(String(profile.id))) throw new HttpError(403, "admin_forbidden", "This GitHub account doesn't have admin access.");
  const token = randomBytes(32).toString("hex");
  await store.createSession(sessionHash(token), profile, Date.now() + ADMIN_SESSION_SECONDS * 1000);
  const previous = adminSessionHash(req);
  if (previous) await store.removeSession(previous);
  return sessionCookie(req, token, ADMIN_SESSION_SECONDS);
}

export async function clearAdminSession(req: Request, store: CommunityStore): Promise<string> {
  const hash = adminSessionHash(req);
  if (hash) await store.removeSession(hash);
  return sessionCookie(req, "", 0);
}
