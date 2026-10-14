import { createHash, timingSafeEqual } from "node:crypto";
import type { AdminConfig, AdminState, Board, Weights } from "../shared/types.js";
import { formatNigerianNumber } from "../shared/validation.js";
import { loadConfig, rebuildBoard } from "./board.js";
import { HttpError } from "./http.js";
import type { Store } from "./store.js";

export function authorize(req: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new HttpError(503, "admin_disabled", "Set ADMIN_SECRET to turn on the admin page.");
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(digest(given), digest(secret))) {
    throw new HttpError(401, "unauthorized", "That admin secret is wrong.");
  }
}

export async function adminState(store: Store, board?: Board): Promise<AdminState> {
  const [records, config, current] = await Promise.all([
    store.listMembers(),
    loadConfig(store),
    board ?? store.getBoard(),
  ]);
  const scores = new Map((current?.members ?? []).map((m) => [m.login.toLowerCase(), m]));
  const members = records
    .map((r) => {
      const pub = scores.get(r.login);
      return {
        login: r.displayLogin,
        nickname: r.nickname,
        avatarUrl: r.avatarUrl,
        score: pub?.score ?? 0,
        stars: r.stars,
        followers: r.followers,
        repos: r.repos,
        activity: r.activity,
        rank: pub?.rank ?? 0,
        delta: pub?.delta ?? 0,
        isNew: pub?.isNew ?? false,
        whatsapp: formatNigerianNumber(r.whatsapp),
        hidden: r.hidden,
        createdAt: r.createdAt,
        statsUpdatedAt: r.statsUpdatedAt,
      };
    })
    // Ranked members first in board order, hidden ones after.
    .sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity) || b.createdAt - a.createdAt);
  return { members, config };
}

const WEIGHT_KEYS: (keyof Weights)[] = ["stars", "followers", "repos", "reposCap", "activity", "activityCap"];

function validConfig(input: unknown): AdminConfig {
  const c = input as Partial<AdminConfig> | null;
  const invite = c?.invite;
  if (!invite || typeof invite.url !== "string" || typeof invite.open !== "boolean" || typeof invite.note !== "string") {
    throw new HttpError(400, "invalid_config", "Invite settings are incomplete.");
  }
  if (!/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+(\?[\w=&.-]*)?$/.test(invite.url.trim())) {
    throw new HttpError(400, "invalid_invite", "Use a WhatsApp group invite link: https://chat.whatsapp.com/…");
  }
  if (invite.note.trim().length > 200) throw new HttpError(400, "invalid_note", "Keep the fallback note under 200 characters.");

  const weights = {} as Weights;
  for (const key of WEIGHT_KEYS) {
    const value = c?.weights?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 10_000) {
      throw new HttpError(400, "invalid_weights", `Weight "${key}" must be a number from 0 to 10000.`);
    }
    weights[key] = value;
  }
  return { invite: { url: invite.url.trim(), open: invite.open, note: invite.note.trim() }, weights };
}

export async function adminAction(store: Store, body: unknown): Promise<AdminState> {
  const action = (body as { action?: string } | null)?.action;
  const login = String((body as { login?: unknown } | null)?.login ?? "").toLowerCase();

  switch (action) {
    case "hide":
    case "unhide":
      await store.patchMember(login, { hidden: action === "hide" });
      break;
    case "remove":
      await store.deleteMember(login);
      break;
    case "config":
      await store.setConfig(validConfig((body as { config?: unknown }).config));
      break;
    default:
      throw new HttpError(400, "unknown_action", "Unknown admin action.");
  }
  return adminState(store, await rebuildBoard(store));
}
