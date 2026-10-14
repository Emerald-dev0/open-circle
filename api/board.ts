import { waitUntil } from "@vercel/functions";
import { readBoard } from "../server/board.js";
import { getStore } from "../server/db.js";
import { handle, json } from "../server/http.js";

export function GET(): Promise<Response> {
  return handle(async () => {
    const board = await readBoard(getStore(), waitUntil);
    // Vercel's CDN absorbs the 10s polling from every open tab; browsers always revalidate.
    return json(board, 200, {
      "cache-control": "no-cache",
      "vercel-cdn-cache-control": "max-age=5, stale-while-revalidate=30",
    });
  });
}
