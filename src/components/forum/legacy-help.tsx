import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { CoordinationContribution, CoordinationHelp } from "@shared/coordination";
import { api, request } from "@/lib/api";
import { PaginatedList } from "@/components/pagination";
import { MetalButton } from "@/components/metal-button";
import { ForumBody, ForumTime } from "./content";

export function LegacyHelp({ profileId, login, id }: { profileId: number; login: string; id?: string }) {
  const client = useQueryClient();
  const key = ["forum", profileId, "legacy"];
  const state = useQuery({ queryKey: key, queryFn: ({ signal }) => request<{ help: CoordinationHelp[]; contributions: CoordinationContribution[]; assignedHelp: string[] }>("/api/forum-legacy", { signal, cache: "no-store" }), retry: false, gcTime: 0 });
  const [text, setText] = useState("");
  const [answering, setAnswering] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const action = useMutation({ mutationFn: api.participate, onSuccess: async () => { await client.invalidateQueries({ queryKey: key }); await client.invalidateQueries({ queryKey: ["participation", profileId] }); } });
  async function send(input: Parameters<typeof api.participate>[0]) {
    try { await action.mutateAsync(input); if (alive.current) { setText(""); setAnswering(null); toast.success(input.action === "answer" ? "Your answer awaits the recipient's confirmation." : "Saved."); } } catch (e) { toast.error((e as Error).message); }
  }
  if (state.isPending) return <p role="status" className="py-4 text-sm text-t3">Loading earlier help requests…</p>;
  if (state.isError) return <div className="space-y-2"><p className="text-sm text-t3">{state.error.message}</p><button className="forum-action" onClick={() => state.refetch()}>Try earlier help again</button></div>;
  const items = state.data.help.filter((h) => !id || h.id === id);
  return <section className="space-y-4 pt-6" aria-label="Earlier help requests">
    <h2 className="text-lg font-medium">Earlier help requests</h2>
    <p className="text-sm text-t3">These keep their original group access and answer confirmations. New questions go through approval above.</p>
    {id && <Link to="/community?tab=questions" className="forum-action inline-flex items-center">All questions</Link>}
    {!items.length && <p className="text-sm text-t3">{id ? "This earlier request isn't available to your account." : "No earlier open help requests."}</p>}
    <PaginatedList items={items} label="Earlier help" resetKey={String(profileId)}>{(help) => <li key={help.id} className="space-y-2 border-b border-foreground/[0.08] py-4">
      <Link className="block break-words text-sm font-medium hover:underline" to={`/community/help/${encodeURIComponent(help.id)}`}>{help.question}</Link>
      <p className="text-xs text-t3">@{help.owner} · {help.status} · <ForumTime at={help.createdAt} /></p>
      <div className="flex flex-wrap gap-2">{help.status === "open" && help.owner.toLowerCase() !== login.toLowerCase() && <button className="forum-action" disabled={action.isPending} onClick={() => { if (answering !== help.id) setText(""); setAnswering(help.id); }}>Answer</button>}{help.status === "open" && help.owner.toLowerCase() === login.toLowerCase() && <button className="forum-action" disabled={action.isPending} onClick={() => void send({ action: "close", id: help.id })}>Mark resolved</button>}{state.data.assignedHelp.includes(help.id) && <button className="forum-action" disabled={action.isPending} onClick={() => void send({ action: "decline-help", id: help.id })}>Decline request</button>}</div>
      {answering === help.id && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void send({ action: "answer", helpId: help.id, text }); }}><label className="block space-y-2"><span className="text-sm">Your answer</span><textarea className="field min-h-28 rounded-2xl py-3" value={text} onChange={(e) => setText(e.target.value)} required minLength={30} maxLength={1000} disabled={action.isPending} /></label><MetalButton className="min-h-11 w-auto" loading={action.isPending}>Submit answer</MetalButton><button className="forum-action" type="button" onClick={() => setAnswering(null)}>Cancel</button></form>}
      {state.data.contributions.filter((c) => c.targetId === help.id).map((c) => <div key={c.id} className="space-y-1 py-2"><p className="text-xs text-t3">@{c.by} → @{c.for} · {c.status}</p><ForumBody>{c.text}</ForumBody></div>)}
    </li>}</PaginatedList>
    <Link className="forum-action inline-flex items-center" to="/participation#feedback">Confirm received answers in Participation</Link>
  </section>;
}
