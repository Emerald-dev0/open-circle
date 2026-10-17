import type { ForumAuthor, ForumDetail, ForumPage } from "../shared/forum.js";
import type { Store } from "./store.js";
import { getStore } from "./db.js";

export async function forumAuthorNames<T extends ForumPage | ForumDetail>(value: T, store: Pick<Store, "getMember"> = getStore()): Promise<T> {
  const result = structuredClone(value);
  const authors: ForumAuthor[] = "items" in result ? result.items.map(item => item.author) : [
    result.author,
    ...result.comments.map(comment => comment.author),
    ...(result.reports ?? []).flatMap(report => [report.author, ...(report.reportedComment ? [report.reportedComment.author] : [])]),
    ...(result.audit ?? []).map(entry => entry.actor),
  ];
  const missing = authors.filter(author => typeof author.name !== "string" || !author.name.trim());
  const logins = [...new Set(missing.map(author => author.login.toLowerCase()))];
  const names = new Map(await Promise.all(logins.map(async login => {
    const member = await store.getMember(login);
    return [login, typeof member?.name === "string" ? member.name.trim() : ""] as const;
  })));
  for (const author of missing) {
    const name = names.get(author.login.toLowerCase());
    if (name) author.name = name;
  }
  return result;
}
