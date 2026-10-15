import { HttpError } from "./http.js";

export async function coordinationRequest<T>(action: "profile" | "link" | "action", body: unknown): Promise<T> {
  const configured = process.env.WHATSAPP_MEMBERSHIP_URL?.trim();
  const token = process.env.WHATSAPP_MEMBERSHIP_TOKEN?.trim();
  const unavailable = () => new HttpError(503, "coordination_unavailable", "Group participation is unavailable right now. Your activity won't be penalised while tracking is paused.");
  if (!configured || !token || token.length < 32) throw unavailable();
  let url: URL;
  try { url = new URL(configured); } catch { throw unavailable(); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/api/v1/membership") || (url.protocol !== "https:" && !(url.protocol === "http:" && local && process.env.NODE_ENV !== "production"))) throw unavailable();
  url.pathname = url.pathname.replace(/membership$/, `coordination/${action}`);
  let response: Response;
  let result: unknown;
  try {
    response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(body), redirect: "error", signal: AbortSignal.timeout(12_000) });
    result = await response.json();
  } catch { throw unavailable(); }
  if (!response.ok) {
    if ([400, 403, 404, 409, 429].includes(response.status) && result && typeof result === "object" && "error" in result && typeof result.error === "string") {
      throw new HttpError(response.status, "participation_rejected", result.error);
    }
    throw unavailable();
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw unavailable();
  if (action === "link") {
    if (!("id" in result) || !("code" in result) || !("expiresAt" in result) || typeof result.id !== "string" || typeof result.code !== "string" || typeof result.expiresAt !== "number") throw unavailable();
  } else if (!("activity" in result) || !("projects" in result) || !("help" in result) || !("contributions" in result) || !result.activity || typeof result.activity !== "object" || !Array.isArray(result.projects) || !Array.isArray(result.help) || !Array.isArray(result.contributions)) throw unavailable();
  return result as T;
}
