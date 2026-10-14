// Both arms name both fields so callers can read `.error` without strict narrowing.
export type Parsed<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// GitHub's own rule: alphanumerics and single hyphens, no leading/trailing hyphen, max 39.
const LOGIN_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

// First path segments on github.com that are never a person.
const RESERVED = new Set([
  "about", "apps", "codespaces", "collections", "contact", "customer-stories", "dashboard",
  "enterprise", "events", "explore", "features", "issues", "join", "login", "marketplace",
  "new", "notifications", "organizations", "pricing", "pulls", "readme", "search", "security",
  "settings", "site", "sponsors", "team", "topics", "trending", "users",
]);

/** Accepts a profile URL, `github.com/name`, `@name` or a bare username. */
export function parseGithubInput(raw: string): Parsed<string> {
  let candidate = raw.trim().replace(/^@/, "");
  if (!candidate) return fail("Paste your GitHub profile link or username.");

  if (/github\.com|^https?:\/\/|\//i.test(candidate)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    } catch {
      return fail("That link doesn't look right. Try github.com/yourname.");
    }
    const host = url.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") {
      return fail("That's not a GitHub profile link. Try github.com/yourname.");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return fail("That's GitHub's homepage. Paste your profile: github.com/yourname.");
    const first = parts[0].toLowerCase();
    if (first === "orgs") return fail("That's an organisation. Paste your personal profile instead.");
    if (RESERVED.has(first)) return fail("That's not a profile link. Try github.com/yourname.");
    if (parts.length > 1) return fail(`That's a repo link. Paste your profile instead: github.com/${parts[0]}`);
    candidate = parts[0];
  }

  if (!LOGIN_RE.test(candidate)) return fail("That isn't a valid GitHub username.");
  return { ok: true, value: candidate };
}

/**
 * The group is Nigerian, so numbers are Nigerian mobiles only. Accepts
 * 0803 123 4567, 803 123 4567, +234 803 123 4567, 234803…, with any spacing.
 * Returns E.164 (+2348031234567).
 */
export function parseNigerianNumber(raw: string): Parsed<string> {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (!digits) return fail("Add the WhatsApp number you use in the group.");

  if (digits.startsWith("+")) {
    if (!digits.startsWith("+234")) return fail("Use your Nigerian (+234) number, the one you're on in the group.");
    digits = digits.slice(4);
  } else if (digits.startsWith("00234")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("234") && digits.length >= 13) {
    digits = digits.slice(3);
  }
  if (digits.startsWith("0")) digits = digits.slice(1);

  if (!/^\d+$/.test(digits)) return fail("Digits only, like 0803 123 4567.");
  if (!/^[789][01]\d{8}$/.test(digits)) {
    return fail("That doesn't look like a Nigerian mobile number. Try 0803 123 4567.");
  }
  return { ok: true, value: `+234${digits}` };
}

/** +2348031234567 → +234 803 123 4567 */
export function formatNigerianNumber(e164: string): string {
  const n = e164.replace(/^\+234/, "");
  return `+234 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

export function parseWhatsappNumber(raw: string): Parsed<string> {
  const value = raw.trim().replace(/[\s\-().]/g, "").replace(/^00/, "+");
  if (!value.startsWith("+")) return parseNigerianNumber(value);
  if (value.startsWith("+234")) return parseNigerianNumber(value);
  if (!/^\+[1-9]\d{6,14}$/.test(value)) {
    return fail("Use your WhatsApp number with its country code, like +234 803 123 4567.");
  }
  return { ok: true, value };
}

const LINKISH =
  /(https?:|www\.|:\/\/)|\.(com|net|org|io|dev|ng|app|xyz|me|co|ai|ly|gg|tv|info|biz|site|online|tech|link)\b/i;

export function parseNickname(raw: string): Parsed<string> {
  const name = raw.trim().replace(/\s+/g, " ");
  const length = [...name].length;
  if (length < 2) return fail("Nickname needs at least 2 characters.");
  if (length > 24) return fail("Keep the nickname to 24 characters or fewer.");
  if (LINKISH.test(name)) return fail("No links in nicknames.");
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u.test(name)) {
    return fail("Letters, numbers, spaces and _ . ' - only.");
  }
  return { ok: true, value: name };
}
