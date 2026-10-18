import { seoDocument, type SeoDocument } from "../shared/seo.js";
import { getEventStore } from "./event-store.js";

export async function eventSeoDocument(pathname: string, origin: string): Promise<SeoDocument | null> {
  const match = /^\/events\/([a-z0-9-]+)$/.exec(pathname);
  if (!match) return null;
  const document = seoDocument(pathname, origin);
  const event = await getEventStore().read(match[1]);
  if (!event?.published) return { ...document, status: 404, title: "Event unavailable · OpenCircle", heading: "Event unavailable", description: "This event is unavailable.", summary: "This event is unavailable." };
  const url = new URL(`/events/${event.slug}`, document.url).href;
  const cover = event.cover;
  return {
    ...document, url, path: `/events/${event.slug}`, title: event.content.title,
    heading: event.content.title, description: event.content.summary, summary: event.content.summary,
    ...(cover ? { image: {
      url: new URL(`/api/event-cover?${new URLSearchParams({ slug: event.slug, asset: cover.id })}`, url).href,
      alt: event.content.coverAlt || event.content.title, contentType: cover.contentType,
    } } : {}),
  };
}
