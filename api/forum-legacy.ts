import { apiHandler } from "../server/api-security.js";
import { forumViewer, FORUM_HEADERS } from "../server/forum.js";
import { json } from "../server/http.js";

export function GET(req: Request): Promise<Response> {
  return apiHandler(req, async () => {
    const viewer = await forumViewer(req);
    const state = viewer.participation!;
    return json({ help: state.help.map(({ id, owner, question, createdAt, status, skills }) => ({ id, owner, question, createdAt, status, skills })), contributions: state.contributions.filter((c) => [c.by.toLowerCase(), c.for.toLowerCase()].includes(viewer.profile.login.toLowerCase())).map(({ id, by, for: recipient, kind, targetId, text, status, createdAt }) => ({ id, by, for: recipient, kind, targetId, text, status, createdAt })), assignedHelp: state.community?.assignedHelp ?? [] }, 200, FORUM_HEADERS);
  });
}
