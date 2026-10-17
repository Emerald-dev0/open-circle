import type { CommunitySession } from "./coordination.js";
import type { EventView } from "./events.js";
export function sessionEvent(session: CommunitySession, events: EventView[]) {
  return events.find(e => e.content.botSessionId === session.id) ?? events.find(e => e.content.title.trim().toLowerCase() === session.title.trim().toLowerCase() && Math.abs((e.content.startsAt ?? 0) - session.startsAt) < 60000);
}
