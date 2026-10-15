import { authorize } from "../server/admin.js";
import { getCommunityStore } from "../server/community-store.js";
import { communityRateLimit, requireSameOriginJson, submitTool, visitor } from "../server/community.js";
import { getStore } from "../server/db.js";
import { handle, HttpError, json, readJson } from "../server/http.js";

export function GET(req: Request): Promise<Response> {
  return handle(async () => {
    await authorize(req);
    return json(await getCommunityStore().listTools(), 200, { "cache-control": "private, no-store" });
  });
}

export function PATCH(req: Request): Promise<Response> {
  return handle(async () => {
    await authorize(req);
    requireSameOriginJson(req);
    const body = await readJson(req) as { id?: unknown; action?: unknown } | null;
    if (typeof body?.id !== "string" || body.id.length > 100 || body.action !== "approve")
      throw new HttpError(400, "invalid_tool", "Choose a pending tool to approve.");
    if (!await getCommunityStore().approveTool(body.id))
      throw new HttpError(404, "not_found", "That tool is no longer awaiting review.");
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  });
}

export function POST(req: Request): Promise<Response> {
  return handle(async () => {
    requireSameOriginJson(req);
    const session = visitor(req, true);
    await communityRateLimit(req, getStore(), session.actor, "tool");
    return json(await submitTool(getCommunityStore(), await readJson(req)), 201, session.headers);
  });
}

export function DELETE(req: Request): Promise<Response> {
  return handle(async () => {
    await authorize(req);
    requireSameOriginJson(req);
    const body = await readJson(req) as { id?: unknown } | null;
    if (typeof body?.id !== "string" || body.id.length > 100)
      throw new HttpError(400, "invalid_tool", "Choose a community tool to remove.");
    await getCommunityStore().removeTool(body.id);
    return json({ ok: true }, 200, { "cache-control": "no-store" });
  });
}
