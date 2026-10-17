import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CommunitySections } from "@/components/community-sections";
import { Dock } from "@/components/dock";
import { AccountCorner } from "@/components/account-corner";
import { TextureButton } from "@/components/ui/texture-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCommunity } from "@/hooks/use-community";
import { usePageMeta } from "@/hooks/use-page-meta";
import { ApiError } from "@/lib/api";
import { eventsApi } from "@/lib/events-api";
import { eventDate, eventMediaUrl, eventStatus, fileSize, type EventView } from "@shared/events";
import { EventDetails } from "@/components/events/event-details";
export default function Events() {
  const { slug } = useParams(); const [params] = useSearchParams(); const admin = params.get("preview") === "1"; const community = useCommunity();
  const identity = community.data?.profile?.id; const [tab, setTab] = useState("upcoming");
  usePageMeta();
  const query = useQuery<EventView | { events: EventView[]; storageConfigured?: boolean }>({ queryKey: ["events", identity, admin, slug ?? "list"], queryFn: ({ signal }) => slug ? eventsApi.detail(slug, admin, signal) : eventsApi.list(admin, signal), enabled: admin || (!!identity && !community.isError), retry: false, gcTime: 0, staleTime: 0, refetchInterval: 30000 });
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const [now, setNow] = useState(Date.now());
  const signedOut = !admin && !identity && !community.isPending;
  const error = query.error ?? community.error;
  const access = error instanceof ApiError && error.status === 403;
  const data = (admin || (!!identity && !community.isError)) ? query.data : undefined;
  return <div className="relative min-h-dvh"><div className="app-backdrop" aria-hidden /><AccountCorner /><main className="page-container relative z-10 min-w-0 pb-40 pt-28">
    <div className="mx-auto max-w-4xl space-y-6">
      {slug ? <Link className="inline-flex min-h-11 items-center text-sm text-t3 underline underline-offset-4" to="/events">All events</Link> : <h1 className="text-3xl font-medium tracking-[-0.03em]">Community</h1>}
      <CommunitySections section="events">
      {!slug && <h2 className="my-5 text-xl font-medium">Events</h2>}
      {admin && <p role="status" className="text-sm text-warn">Admin preview · {data && "published" in data && data.published ? "Published" : "Draft / unpublished"}</p>}
      {signedOut ? <div className="space-y-4"><p className="text-t3">Sign in to find community events, recordings and resources.</p><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`/api/auth-start?returnTo=${encodeURIComponent(slug ? `/events/${slug}` : "/events")}`}>Sign in with GitHub</a></div> : error ? <div role="alert" className="space-y-3"><p>{error.message}</p>{access ? <Link className="inline-flex min-h-11 items-center underline" to="/participation">Connect your group account</Link> : <TextureButton onClick={() => { void community.refetch(); void query.refetch(); }}>Try again</TextureButton>}</div> : !data ? <p role="status" className="text-t3">Loading events…</p> : "events" in data ? <>
        <Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Event schedule"><TabsTrigger className="min-h-11" value="upcoming">Upcoming</TabsTrigger><TabsTrigger className="min-h-11" value="past">Past & recordings</TabsTrigger></TabsList>
        <TabsContent value={tab}><EventList events={data.events.filter(e => tab === "upcoming" ? !e.content.cancelled && (e.content.endsAt ?? 0) > now : e.content.cancelled || (e.content.endsAt ?? 0) <= now).sort((a,b) => tab === "upcoming" ? (a.content.startsAt ?? 0)-(b.content.startsAt ?? 0) : (b.content.startsAt ?? 0)-(a.content.startsAt ?? 0))} now={now} /></TabsContent></Tabs>
      </> : <EventDetails key={`${data.id}:${identity}:${admin}`} event={data} admin={admin} />}
      </CommunitySections>
    </div></main><Dock /></div>;
}
function EventList({ events, now }: { events: EventView[]; now: number }) {
  if (!events.length) return <p role="status" className="py-10 text-t3">No events here yet.</p>;
  return <ul className="divide-y divide-foreground/10">{events.map(e => <li key={e.id}><Link to={`/events/${e.slug}`} className="group flex min-w-0 flex-col gap-5 rounded-xl py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 sm:flex-row">
    {e.cover && <img className="aspect-video w-full rounded-xl object-cover sm:w-56" src={eventMediaUrl(e.slug,e.cover.id)} alt={e.content.coverAlt} loading="lazy" />}
    <div className="min-w-0 space-y-2"><p className="text-xs text-t3">{eventStatus(e,now)}</p><h2 className="break-words text-xl font-medium group-hover:underline">{e.content.title}</h2><p className="text-sm text-t3">{eventDate(e.content.startsAt,e.content.timezone)} · {e.content.timezone}</p><p className="break-words text-sm leading-relaxed text-t2">{e.content.summary}</p><p className="text-sm text-t3">{e.content.host}</p>{e.recording && <p className="text-xs text-t3">Recording · {fileSize(e.recording.size)}</p>}</div>
  </Link></li>)}</ul>;
}
