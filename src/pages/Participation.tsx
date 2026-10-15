import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LinkChallenge, ParticipationAction, ParticipationState } from "@shared/coordination";
import { GitHubAccount } from "@/components/github-account";
import { SiteFooter } from "@/components/site-footer";
import { TextureButton } from "@/components/ui/texture-button";
import { useCommunity } from "@/hooks/use-community";
import { api, ApiError } from "@/lib/api";

type Field = { name: string; label: string; type?: "text" | "url" | "tel" | "number" | "textarea"; min?: number; max?: number; value?: string };

function ParticipationForm({ title, button, fields, busy, submit, reset = true, onEdit }: { title: string; button: string; fields: Field[]; busy: boolean; submit: (data: FormData) => Promise<boolean>; reset?: boolean; onEdit?: () => void }) {
  const prefix = useId();
  return <form className="space-y-3" onChange={onEdit} onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (await submit(new FormData(form)) && reset) form.reset();
  }}>
    <h3 className="font-medium">{title}</h3>
    {fields.map((field) => <label key={field.name} htmlFor={`${prefix}-${field.name}`} className="block space-y-1">
      <span className="block text-sm text-t3">{field.label}</span>
      {field.type === "textarea" ? <textarea id={`${prefix}-${field.name}`} name={field.name} className="field min-h-28 rounded-2xl py-3" required minLength={field.min} maxLength={field.max} disabled={busy} /> : <input id={`${prefix}-${field.name}`} name={field.name} className="field" type={field.type ?? "text"} required min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} maxLength={field.type !== "number" ? field.max : undefined} defaultValue={field.value} autoComplete={field.type === "tel" ? "tel" : "off"} disabled={busy} />}
    </label>)}
    <TextureButton type="submit" disabled={busy}>{busy ? "Saving…" : button}</TextureButton>
  </form>;
}

export default function Participation() {
  const community = useCommunity();
  const profile = community.data?.profile;
  const key = ["participation", profile?.id ?? null];
  const client = useQueryClient();
  const state = useQuery({ queryKey: key, queryFn: ({ signal }) => api.participation(signal), enabled: !!profile, refetchInterval: 15_000, retry: false });
  const [challenge, setChallenge] = useState<LinkChallenge | null>(null);
  const [target, setTarget] = useState<{ kind: "review" | "answer"; id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const owner = useRef(profile?.id);
  owner.current = profile?.id;
  const feedbackForm = useRef<HTMLElement>(null);
  const link = useMutation({ mutationFn: api.linkWhatsapp, onMutate: () => ({ owner: profile?.id }), onSuccess: (result, _input, context) => { if (owner.current === context?.owner) setChallenge(result); } });
  const action = useMutation({ mutationFn: api.participate, onMutate: async () => { await client.cancelQueries({ queryKey: key }); return { owner: profile?.id, key }; }, onSuccess: (result, _input, context) => { if (context && owner.current === context.owner) client.setQueryData<ParticipationState>(context.key, result); }, onSettled: (_result, _error, _input, context) => context && owner.current === context.owner ? client.invalidateQueries({ queryKey: context.key }) : undefined });
  const busy = action.isPending || link.isPending;
  const data = state.data;
  useEffect(() => { setChallenge(null); setTarget(null); setError(null); setNotice(null); if (!profile?.id) client.removeQueries({ queryKey: ["participation"] }); }, [profile?.id, client]);
  useEffect(() => { if (data?.activity.linked) setChallenge(null); }, [data?.activity.linked]);
  useEffect(() => { if (target) feedbackForm.current?.querySelector("textarea")?.focus(); }, [target]);

  async function submit(input: ParticipationAction) {
    setError(null); setNotice(null);
    try {
      await action.mutateAsync(input);
      if (input.action === "review" || input.action === "answer") { setTarget(null); setNotice("Your contribution is saved and awaits confirmation."); }
      else if (input.action === "project") setNotice("Your project is waiting for admin approval.");
      else if (input.action === "away") setNotice("Your break request is waiting for admin approval.");
      else if (input.action === "help") setNotice("Your help request is open.");
      else setNotice("Saved.");
      return true;
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : "Couldn't save that. Try again."); return false; }
  }
  async function linkPhone(form: FormData) {
    setError(null); setNotice(null);
    try { await link.mutateAsync(String(form.get("phone"))); return true; }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "Couldn't create your linking code. Try again."); return false; }
  }

  return <div className="relative min-h-dvh overflow-x-clip">
    <div className="app-backdrop" aria-hidden />
    <div className="relative z-10">
      <header className="page-container flex flex-wrap items-center justify-between gap-4 pt-6">
        <TextureButton asChild variant="secondary" size="sm"><Link to="/">Back to the board</Link></TextureButton><GitHubAccount />
      </header>
      <main className="page-container space-y-8 pb-10 pt-10 sm:pt-16">
        <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Group participation</h1>
        {!profile ? <section className="surface space-y-4 rounded-[28px] p-5 sm:p-6">
          <p className="text-t2">Sign in to connect your WhatsApp account, give project feedback and see your activity.</p>
          {community.data?.signInAvailable ? <TextureButton asChild><a href="/api/auth-start?returnTo=%2Fparticipation">Sign in with GitHub</a></TextureButton> : <p className="text-sm text-t3">{community.isPending ? "Checking sign-in…" : "GitHub sign-in is being set up."}</p>}
        </section> : state.isPending ? <p role="status" className="text-t3">Loading your participation…</p> : state.isError ? <div className="space-y-3">
          <p role="alert" className="text-down">{state.error instanceof ApiError ? state.error.message : "Couldn't load participation. Try again."}</p><TextureButton onClick={() => state.refetch()} disabled={state.isFetching}>Try again</TextureButton>
        </div> : data && <>
          {error && <p role="alert" className="text-down">{error}</p>}{notice && <p role="status" className="text-t2">{notice}</p>}
          {!data.activity.linked ? <section className="surface space-y-4 rounded-[28px] p-5 sm:p-6">
            <p className="text-sm text-t3">Use your number in Open Source Circle. Send the code from that account so your participation belongs to you.</p>
            <ParticipationForm title="Connect your WhatsApp account" button="Get linking code" fields={[{ name: "phone", label: "Your WhatsApp group number", type: "tel" }]} busy={busy} submit={linkPhone} reset={false} onEdit={() => setChallenge(null)} />
            {challenge && <div className="space-y-2" role="status"><p>Send this in the WhatsApp group from your number:</p><code className="block break-all rounded-xl bg-white/[0.06] p-3 text-lg">/link {challenge.code}</code><p className="text-sm text-t3">The code expires in 10 minutes. This page checks automatically after you send it.</p><TextureButton variant="secondary" size="sm" onClick={() => state.refetch()} disabled={state.isFetching}>Check link</TextureButton></div>}
          </section> : <>
            <section className="surface space-y-3 rounded-[28px] p-5 sm:p-6">
              <h2 className="text-xl font-medium">Your activity</h2>
              <p className="text-t2">{data.activity.contributions}/{data.activity.target} confirmed contributions · project feedback for {data.activity.reviewPeers}/{data.activity.requiredReviewPeers} members.</p>
              <p className="text-sm text-t3">{data.activity.pendingContributions} contributions await confirmation. Tracking pauses during bot outages and approved breaks.</p>
              {!data.activity.tracking && <p role="status" className="text-sm text-t3">{data.activity.enabled ? "Tracking is paused while the bot checks group access." : "Coordination is paused. You can still submit feedback."}</p>}
              {data.activity.graceRemainingDays > 0 && <p className="text-sm text-t3">You have {data.activity.graceRemainingDays} days left in the settling-in period.</p>}
              {data.activity.removalReview && <p className="text-sm text-t3">An admin is reviewing your participation. Pending feedback and approved breaks are checked before any removal.</p>}
            </section>
            <section className="space-y-4"><h2 className="text-xl font-medium">Projects to review</h2>
              {data.projects.length ? <ul className="divide-y divide-white/[0.08]">{data.projects.map((project) => <li key={project.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1"><a href={project.url} target="_blank" rel="noopener noreferrer" className="break-words font-medium underline-offset-4 hover:underline">{project.title}</a><p className="break-words text-sm text-t3">{project.owner} · {project.reviews} confirmed reviews · {project.status}</p>{project.assignedTo.some((login) => login.toLowerCase() === profile.login.toLowerCase()) && <p className="text-sm text-t2">You are assigned to review this project.</p>}</div>
                {project.status === "approved" && project.owner.toLowerCase() !== profile.login.toLowerCase() && <TextureButton variant="secondary" size="sm" disabled={busy} onClick={() => setTarget({ kind: "review", id: project.id, title: project.title })}>Give feedback</TextureButton>}
                {project.owner.toLowerCase() === profile.login.toLowerCase() && project.status !== "closed" && <TextureButton variant="secondary" size="sm" disabled={busy} onClick={() => submit({ action: "close", id: project.id })}>Close project</TextureButton>}
              </li>)}</ul> : <p className="text-sm text-t3">No approved projects are waiting for feedback yet.</p>}
              <ParticipationForm title="Share your project" button="Submit for review" busy={busy} fields={[{ name: "title", label: "Project name", max: 80 }, { name: "url", label: "Project link", type: "url" }]} submit={(form) => submit({ action: "project", title: String(form.get("title")), url: String(form.get("url")) })} />
            </section>
            {target && <section ref={feedbackForm} className="surface space-y-3 rounded-[28px] p-5 sm:p-6"><ParticipationForm title={`Feedback for ${target.title}`} button="Submit feedback" busy={busy} fields={[{ name: "feedback", label: "What you tried and a useful observation or suggestion", type: "textarea", min: 30, max: 1000 }]} submit={(form) => submit(target.kind === "review" ? { action: "review", projectId: target.id, text: String(form.get("feedback")) } : { action: "answer", helpId: target.id, text: String(form.get("feedback")) })} /><TextureButton variant="secondary" size="sm" disabled={busy} onClick={() => setTarget(null)}>Cancel</TextureButton></section>}
            <section className="space-y-4"><h2 className="text-xl font-medium">Help requests</h2>
              {data.help.length ? <ul className="divide-y divide-white/[0.08]">{data.help.map((help) => <li key={help.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words">{help.question}</p><p className="text-sm text-t3">{help.owner} · {help.status}</p></div>{help.status === "open" && help.owner.toLowerCase() !== profile.login.toLowerCase() && <TextureButton variant="secondary" size="sm" disabled={busy} onClick={() => setTarget({ kind: "answer", id: help.id, title: help.owner })}>Help with this</TextureButton>}{help.status === "open" && help.owner.toLowerCase() === profile.login.toLowerCase() && <TextureButton variant="secondary" size="sm" disabled={busy} onClick={() => submit({ action: "close", id: help.id })}>Mark resolved</TextureButton>}</li>)}</ul> : <p className="text-sm text-t3">No open help requests.</p>}
              <ParticipationForm title="Ask the group for help" button="Post help request" busy={busy} fields={[{ name: "question", label: "Your question", type: "textarea", min: 15, max: 500 }]} submit={(form) => submit({ action: "help", question: String(form.get("question")) })} />
            </section>
            <section className="space-y-4"><h2 className="text-xl font-medium">Feedback</h2>{data.contributions.length ? <ul className="divide-y divide-white/[0.08]">{data.contributions.map((entry) => <li key={entry.id} className="space-y-2 py-4"><p className="text-sm text-t3">{entry.by} → {entry.for} · {entry.status}</p><p className="break-words text-t2">{entry.text}</p>{entry.status === "pending" && entry.for.toLowerCase() === profile.login.toLowerCase() && <div className="flex flex-wrap gap-2"><TextureButton size="sm" disabled={busy} onClick={() => submit({ action: "confirm", id: entry.id, approve: true })}>Confirm useful</TextureButton><TextureButton variant="secondary" size="sm" disabled={busy} onClick={() => submit({ action: "confirm", id: entry.id, approve: false })}>Needs more detail</TextureButton></div>}</li>)}</ul> : <p className="text-sm text-t3">Your submitted and received feedback will appear here.</p>}</section>
            <section className="surface space-y-3 rounded-[28px] p-5 sm:p-6"><h2 className="text-xl font-medium">Need a break?</h2>{data.activity.awayUntil && data.activity.awayUntil > Date.now() ? <p className="text-t3">Your break is approved until {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(data.activity.awayUntil)}.</p> : data.activity.awayRequestedDays ? <p className="text-t3">Your {data.activity.awayRequestedDays}-day break awaits admin approval.</p> : <ParticipationForm title="Request time away" button="Request break" busy={busy} fields={[{ name: "days", label: "Days away, up to 30", type: "number", min: 1, max: 30, value: "7" }]} submit={(form) => submit({ action: "away", days: Number(form.get("days")) })} />}</section>
          </>}
        </>}
      </main><SiteFooter />
    </div>
  </div>;
}
