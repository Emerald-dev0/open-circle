import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eventRegistrationOpen, type EventView } from "@shared/events";
import { eventsApi } from "@/lib/events-api";
import { ApiError } from "@/lib/api";
import { TextureButton } from "@/components/ui/texture-button";

export function EventRegistration({ event, memberId }: { event: EventView; memberId: number }) {
  const location = useLocation(); const client = useQueryClient(); const [editing, setEditing] = useState(location.hash === "#register");
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const trigger = useRef<HTMLButtonElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const key = ["events", memberId, "registration", event.id];
  const query = useQuery({ queryKey: key, queryFn: ({ signal }) => eventsApi.registration(event.slug, signal), retry: false, gcTime: 0 });
  useEffect(() => { if (editing && !query.isPending && !query.isError) nameField.current?.focus(); }, [editing, query.isPending, query.isError]);
  const mutation = useMutation({ mutationFn: () => eventsApi.register(event.slug, { name, email }), onSuccess: result => { if (alive.current) { client.setQueryData(key, result); setEditing(false); } } });
  const saved = query.data?.registration; const error = mutation.error ?? query.error;
  const field = error instanceof ApiError ? error.field : undefined;
  const open = eventRegistrationOpen(event);
  return <section id="register" aria-label="Event registration" className="scroll-mt-8 space-y-4">
    {saved ? <div role="status" className="space-y-1"><p className="font-medium text-up">You're registered</p><p className="break-words text-sm text-t2">{saved.name} · {saved.email}</p></div> : !open ? <p role="status" className="text-sm text-t3">{event.content.cancelled ? "Registration is closed because this event was cancelled." : "Registration is closed."}</p> : <>
      {!editing ? <TextureButton ref={trigger} type="button" size="lg" className="min-h-12 w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground sm:min-h-12 sm:w-auto" innerClassName="!bg-none !bg-foreground !text-background" disabled={query.isPending || query.isError} aria-expanded={false} onClick={() => { mutation.reset(); setEditing(true); }}>Register for event</TextureButton> : <form aria-label="Register for event" className="max-w-md space-y-4" onSubmit={e => { e.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
        <h2 className="text-lg font-medium">Register for event</h2>
        <fieldset disabled={mutation.isPending || query.isPending || query.isError} className="space-y-4">
          <label className="block space-y-2 text-sm"><span>Full name</span><input ref={nameField} className="field" autoComplete="name" required maxLength={150} value={name} onChange={e => setName(e.target.value)} aria-invalid={field === "name"} aria-describedby={field === "name" ? "registration-error" : undefined} /></label>
          <label className="block space-y-2 text-sm"><span>Email address</span><input className="field" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} aria-invalid={field === "email"} aria-describedby={field === "email" ? "registration-error" : "registration-privacy"} /></label>
          <p id="registration-privacy" className="text-sm text-t3">Your name and email are only visible to you and event organisers.</p>
          <div className="flex flex-wrap items-center gap-3"><TextureButton type="submit" size="lg" loading={mutation.isPending} innerClassName="!bg-none !bg-foreground !text-background">Confirm registration</TextureButton><button type="button" className="min-h-11 px-3 text-sm text-t2 underline underline-offset-4" onClick={() => { setEditing(false); mutation.reset(); window.requestAnimationFrame(() => trigger.current?.focus()); }}>Cancel</button></div>
        </fieldset>
      </form>}
    </>}
    {error && !saved && <div id="registration-error" role="alert" className="space-y-2"><p className="text-sm text-down">{error.message}</p>{query.isError && <button type="button" className="min-h-11 text-sm underline" onClick={() => { void query.refetch(); }}>Try again</button>}</div>}
  </section>;
}
