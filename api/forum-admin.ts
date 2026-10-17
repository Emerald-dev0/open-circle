import { apiHandler } from "../server/api-security.js";
import { getForumStore } from "../server/forum-store.js";
import { commandForum, FORUM_HEADERS, forumFilter, forumViewer, listForum, readForum } from "../server/forum.js";
import { json, readJson } from "../server/http.js";
import { FORUM_MAX_BYTES } from "../shared/forum.js";
import { forumAuthorNames } from "../server/forum-authors.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const viewer = await forumViewer(req, true);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const data = id ? await readForum(getForumStore(), viewer, id, Number(url.searchParams.get("page") ?? 1)) : await listForum(getForumStore(), viewer, forumFilter(url, true));
    return json(await forumAuthorNames(data), 200, FORUM_HEADERS);
  });
}
export function POST(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const viewer = await forumViewer(req, true);
    return json(await forumAuthorNames(await commandForum(getForumStore(), viewer, await readJson(req, FORUM_MAX_BYTES))), 200, FORUM_HEADERS);
  });
}
