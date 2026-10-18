import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import { forumPreviewId, forumSeoDocument, type ForumSharePreview } from "../shared/forum-seo.js";
import { seoDocument, type SeoDocument } from "../shared/seo.js";
import { getForumStore } from "./forum-store.js";

export async function readForumPreview(id: string): Promise<ForumSharePreview | null> {
  if (!forumPreviewId(`/community/${id}`)) return null;
  const post = await getForumStore().readPublished(id.toLowerCase());
  if (!post) return null;
  const plain = fromMarkdown(post.content.body).children.map(node => toString(node, { includeHtml: false, includeImageAlt: false })).join(" ").replace(/\s+/gu, " ").trim();
  const text = Array.from(plain || post.content.title);
  const description = text.length > 240 ? `${text.slice(0, 239).join("").trimEnd()}…` : text.join("");
  const preview = {
    id: post.id, kind: post.kind, title: post.content.title, description,
    category: post.content.category, author: `@${post.author.login}`,
  };
  return { ...preview, version: createHash("sha256").update(JSON.stringify(preview)).digest("hex").slice(0, 16) };
}

export async function communitySeoDocument(pathname: string, origin: string): Promise<SeoDocument | null> {
  const id = forumPreviewId(pathname);
  if (!id) return null;
  const preview = await readForumPreview(id);
  if (preview) return forumSeoDocument(preview, origin);
  return {
    ...seoDocument(pathname, origin), status: 404, title: "Post unavailable · OpenCircle",
    heading: "Post unavailable", description: "This community post is unavailable.", summary: "This community post is unavailable.",
  };
}
