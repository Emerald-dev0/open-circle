import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { eventsApi } from "@/lib/events-api";
import { Pagination } from "@/components/pagination";
import { ContentSkeleton } from "@/components/site-skeleton";

export function EventAttendees({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["admin", "events", "registrations", slug, page], queryFn: ({ signal }) => eventsApi.registrations(slug, page, signal), retry: false, gcTime: 0 });
  return <section aria-label="Event registrations" className="space-y-4">
    <h3 className="text-lg font-medium">Registrations{query.data ? ` (${query.data.total})` : ""}</h3>
    {query.isPending ? <ContentSkeleton label="Loading registrations…" /> : query.isError ? <div role="alert" className="space-y-2"><p className="text-sm text-down">{query.error.message}</p><button type="button" className="min-h-11 text-sm underline" onClick={() => { void query.refetch(); }}>Try again</button></div> : query.data.total ? <>
      <ul className="divide-y divide-foreground/10">{query.data.registrations.map(r => <li key={r.id} className="space-y-1 py-3"><p className="break-words font-medium">{r.name}</p><p className="break-words text-sm text-t2">{r.email}</p><p className="text-xs text-t3">@{r.login} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(r.registeredAt)}</p></li>)}</ul>
      <Pagination page={page} pageSize={query.data.pageSize} total={query.data.total} onPageChange={setPage} label="Registrations" />
    </> : <p className="text-sm text-t3">No registrations yet.</p>}
  </section>;
}
