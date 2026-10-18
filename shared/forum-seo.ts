import { BRAND_NAME, DEFAULT_SITE_URL } from "./brand.js";
import type { ForumCategory, ForumKind } from "./forum.js";
import { seoDocument, type SeoDocument } from "./seo.js";

export interface ForumSharePreview {
  id: string;
  kind: ForumKind;
  title: string;
  description: string;
  category: ForumCategory;
  author: string;
  version: string;
}

export function forumPreviewId(pathname: string): string | null {
  return /^\/community\/([a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})$/i.exec(pathname)?.[1].toLowerCase() ?? null;
}

export function forumSeoDocument(preview: ForumSharePreview, origin = DEFAULT_SITE_URL): SeoDocument {
  const path = `/community/${preview.id}`;
  const document = seoDocument(path, origin);
  return {
    ...document, path, url: new URL(path, document.url).href,
    title: `${preview.title} · ${BRAND_NAME}`, heading: preview.title,
    description: preview.description, summary: preview.description,
    image: {
      url: new URL(`/api/forum-image?${new URLSearchParams({ id: preview.id, v: preview.version })}`, document.url).href,
      alt: `${preview.kind === "question" ? "Question" : "Discussion"}: ${preview.title}`,
      contentType: "image/png", width: 1200, height: 630,
    },
  };
}
