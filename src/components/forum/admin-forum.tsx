import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ForumAuthor, ForumCommand } from "@shared/forum";
import { useForumSearch } from "@/hooks/use-forum-search";
import { MetalButton } from "@/components/metal-button";
import { ContentSkeleton } from "@/components/site-skeleton";
import { forumApi } from "@/lib/forum-api";
import { ApiError } from "@/lib/api";
import { ForumEditor } from "./editor";
import { ForumFeed, ForumFilters } from "./feed";
import { ForumThreadView } from "./thread";

export default function AdminForum({ profile, onUnauthorized }: { profile: ForumAuthor; onUnauthorized: () => void }) {
  const [params, setParams] = useState(new URLSearchParams({ queue: "pending" }));
  const [id, setId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const client = useQueryClient();
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const query = useForumSearch(params);
  const list = useQuery({ queryKey: ["admin", "forum", profile.id, "list", query.toString()], queryFn: ({ signal }) => forumApi.list(query, true, signal), enabled: !id && !creating, retry: false, gcTime: 0 });
  const detail = useQuery({ queryKey: ["admin", "forum", profile.id, "detail", id, page], queryFn: ({ signal }) => forumApi.detail(id!, page, true, signal), enabled: !!id && !creating, retry: false, gcTime: 0 });
  const mutation = useMutation({ mutationFn: (command: ForumCommand) => forumApi.command(command, true) });
  const active = id ? detail : list;
  useEffect(() => { if (active.error instanceof ApiError && ["unauthorized", "admin_disabled", "admin_origin"].includes(active.error.code)) onUnauthorized(); }, [active.error, onUnauthorized]);
  async function act(command: ForumCommand) {
    try {
      const result = await mutation.mutateAsync(command);
      if (!alive.current) return false;
      await client.invalidateQueries({ queryKey: ["admin", "forum", profile.id] });
      if (command.action === "create") { setCreating(false); setId(result.id); setPage(1); }
      toast.success("Saved.");
      return true;
    } catch (error) {
      if (alive.current) {
        if (error instanceof ApiError && ["unauthorized", "admin_disabled", "admin_origin"].includes(error.code)) onUnauthorized();
        if (error instanceof ApiError && error.status === 409) await client.invalidateQueries({ queryKey: ["admin", "forum", profile.id] });
        toast.error((error as Error).message);
      }
      return false;
    }
  }
  const change = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (key !== "page") next.delete("page"); return next; });
  return <section className="max-w-3xl space-y-5" aria-label="Community moderation">
    <div className="flex flex-wrap items-center gap-2"><MetalButton className="min-h-11 w-auto" disabled={mutation.isPending} onClick={() => { setCreating(true); setId(null); }}>New discussion</MetalButton>{(id || creating) && <button className="forum-action" type="button" disabled={mutation.isPending} onClick={() => { setId(null); setCreating(false); }}>Back to queue</button>}</div>
    {creating ? <ForumEditor key="new-discussion" admin busy={mutation.isPending} onSave={act} onCancel={() => setCreating(false)} /> : <>
      {!id && <ForumFilters params={params} onChange={change} admin />}
      {active.isPending ? <ContentSkeleton label="Loading community moderation…" detail={!!id} /> : active.isError ? <div className="space-y-3" role="alert"><p className="text-sm text-t2">{active.error.message}</p><button className="forum-action" type="button" onClick={() => active.refetch()}>Try again</button></div> : id && detail.data ? <ForumThreadView key={id} admin data={detail.data} profile={profile} busy={mutation.isPending} onAction={act} onPage={setPage} /> : list.data ? <ForumFeed admin data={list.data} busy={mutation.isPending} onSelect={(id) => { setId(id); setPage(1); }} onPage={(page) => change("page", String(page))} /> : null}
    </>}
  </section>;
}
