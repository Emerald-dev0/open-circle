import { apiHandler } from "../server/api-security.js";
import { waitUntil } from "@vercel/functions";
import { readBoard } from "../server/board.js";
import { getStore } from "../server/db.js";
import { conditionalJson } from "../server/http.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const board = await readBoard(getStore(), waitUntil);
    // Vercel's CDN absorbs the 10s polling from every open tab; browsers always revalidate.
    return conditionalJson(req, board, {
      "cache-control": "no-cache",
      "vercel-cdn-cache-control": "max-age=5, stale-while-revalidate=30",
    });
  });
}
