import { BOT_SETTINGS_MAX_BYTES, type BotSettingsInput } from "../shared/bot-settings.js";
import { authorize } from "../server/admin.js";
import { apiHandler } from "../server/api-security.js";
import { botSettingsRequest } from "../server/bot-settings.js";
import { json, readJson } from "../server/http.js";

const PRIVATE = { "cache-control": "private, no-store", vary: "Cookie" };

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => { await authorize(req); return json(await botSettingsRequest(), 200, PRIVATE); });
}

export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => { await authorize(req); return json(await botSettingsRequest(await readJson(req, BOT_SETTINGS_MAX_BYTES) as BotSettingsInput), 200, PRIVATE); });
}
