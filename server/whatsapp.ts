import { HttpError } from "./http.js";

export async function requireWhatsappMembership(phone: string): Promise<void> {
  const endpoint = process.env.WHATSAPP_MEMBERSHIP_URL?.trim();
  const token = process.env.WHATSAPP_MEMBERSHIP_TOKEN?.trim();
  const unavailable = () => new HttpError(
    503,
    "whatsapp_unavailable",
    "We can't check the WhatsApp group right now. Try again shortly.",
    "whatsapp",
  );
  if (!endpoint || !token || token.length < 32) throw unavailable();

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw unavailable();
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && local && process.env.NODE_ENV !== "production"))) {
    throw unavailable();
  }

  let member: boolean;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ phone }),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw unavailable();
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("member" in body) || typeof body.member !== "boolean") throw unavailable();
    member = body.member;
  } catch {
    throw unavailable();
  }
  if (!member) {
    throw new HttpError(
      403,
      "whatsapp_not_member",
      "That number isn't in the WhatsApp group yet. Join with the same number, then check again.",
      "whatsapp",
    );
  }
}
