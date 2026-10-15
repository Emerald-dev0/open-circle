import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CopyIcon } from "@solar-icons/react/linear";
import type { LinkChallenge, ParticipationAction, ParticipationState } from "@shared/coordination";
import { parseWhatsappNumber } from "@shared/validation";
import { GitHubIcon } from "@/components/brand-icons";
import { AccountCorner } from "@/components/account-corner";
import { Dock } from "@/components/dock";
import { MetalButton } from "@/components/metal-button";
import { Chip, Panel, PanelHeader } from "@/components/panel";
import { SiteFooter } from "@/components/site-footer";
import { ParticipationSkeleton } from "@/components/site-skeleton";
import { useCommunity } from "@/hooks/use-community";
import { usePageMeta } from "@/hooks/use-page-meta";
import { pageFor } from "@shared/seo";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useErrorToast } from "@/hooks/use-error-toast";

type Field = { name: string; label: string; type?: "text" | "url" | "tel" | "number" | "textarea"; min?: number; max?: number; value?: string; placeholder?: string };

/**
 * Compact form. `inline` puts the fields and button on one line from sm up
 * with screen-reader-only labels; otherwise labels sit above each field.
 */
function ParticipationForm({ title, button, fields, busy, submit, reset = true, onEdit, inline = false }: { title?: string; button: string; fields: Field[]; busy: boolean; submit: (data: FormData) => Promise<boolean>; reset?: boolean; onEdit?: () => void; inline?: boolean }) {
  const prefix = useId();
  return <form className={cn("space-y-2.5", inline && "sm:flex sm:items-end sm:gap-2 sm:space-y-0")} onChange={onEdit} onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (await submit(new FormData(form)) && reset) form.reset();
  }}>
    {title && !inline && <p className="text-sm font-medium text-t2">{title}</p>}
    {fields.map((field) => <label key={field.name} htmlFor={`${prefix}-${field.name}`} className={cn("block", inline ? "min-w-0 sm:flex-1" : "space-y-1.5")}>
      <span className={inline ? "sr-only" : "block text-xs text-t3"}>{field.label}</span>
      {field.type === "textarea"
        ? <textarea id={`${prefix}-${field.name}`} name={field.name} placeholder={field.placeholder} className="field min-h-24 resize-none rounded-[20px] py-3 text-sm" required minLength={field.min} maxLength={field.max} disabled={busy} />
        : <input id={`${prefix}-${field.name}`} name={field.name} placeholder={field.placeholder ?? (inline ? field.label : undefined)} className="field h-11 text-sm" type={field.type ?? "text"} required min={field.type === "number" ? field.min : undefined} max={field.type === "number" ? field.max : undefined} maxLength={field.type !== "number" ? field.max : undefined} defaultValue={field.value} autoComplete={field.type === "tel" ? "tel" : "off"} disabled={busy} />}
    </label>)}
    <MetalButton type="submit" loading={busy} wrapperClassName={inline ? "w-full sm:w-auto" : "w-full"} className="h-11 w-full" innerClassName="px-5">{busy ? "Saving…" : button}</MetalButton>
  </form>;
}

/** x of y with a thin bar. */
function Progress({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return <div className="space-y-2 border-b border-white/[0.06] py-4 last:border-0">
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-t3">{label}</span>
      <span className="tabular font-medium text-foreground">{value}<span className="text-t4"> / {total}</span></span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={total}>
      <div className="h-full rounded-full bg-gradient-to-r from-white/60 to-white transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  </div>;
}

/** A list row: content left, action right; stacks on phones. */
function Item({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <li className="flex flex-col gap-3 border-b border-white/[0.06] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0 space-y-1">{children}</div>
    {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
  </li>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-t4">{children}</p>;
}

function FormFooter({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-white/[0.06] py-4">{children}</div>;
}

const statusTone = (status: string) => (status === "approved" || status === "open" || status === "confirmed" ? "ok" : status === "pending" ? "warn" : "muted") as "ok" | "warn" | "muted";

export default function Participation() {
  usePageMeta();
  const page = pageFor("/participation");
  const community = useCommunity();
  const profile = community.data?.profile;
  const key = ["participation", profile?.id ?? null];
  const client = useQueryClient();
  const state = useQuery({ queryKey: key, queryFn: ({ signal }) => api.participation(signal), enabled: !!profile, refetchInterval: 15_000, retry: false });
  const [challenge, setChallenge] = useState<LinkChallenge | null>(null);
  const [target, setTarget] = useState<{ kind: "review" | "answer"; id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { if (error) toast.error(error, { id: "participation" }); }, [error]);
  useEffect(() => { if (notice) toast.success(notice, { id: "participation-notice" }); }, [notice]);
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
    const phone = parseWhatsappNumber(String(form.get("phone") ?? ""));
    if (!phone.ok) { setError(phone.error); return false; }
    try { await link.mutateAsync(phone.value); return true; }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : "Couldn't create your linking code. Try again."); return false; }
  }

  useErrorToast(state.error, "Couldn't load participation. Try again.", { id: "participation-load" });
  const mine = (login: string) => !!profile && login.toLowerCase() === profile.login.toLowerCase();

  return <div className="relative min-h-dvh overflow-x-clip">
    <div className="app-backdrop" aria-hidden />
    <div className="relative z-10">
      {/* Signed out, the panel below carries the one sign-in button. */}
      {profile && <AccountCorner />}

      <main className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-[calc(5rem+env(safe-area-inset-top))] sm:space-y-6">
        <h1 className="text-2xl font-medium tracking-[-0.03em]">Participation</h1>
        {page && <p className="max-w-md text-balance text-sm leading-relaxed text-t3">{page.summary}</p>}


        {community.isPending ? <ParticipationSkeleton checkingSignIn /> : !profile ? <Panel header={<PanelHeader title="Sign in" subtitle="Connect your WhatsApp account, give project feedback and see your activity." />}>
          <div className="flex justify-center py-6">
            {community.data?.signInAvailable
              ? <MetalButton asChild className="h-11 w-auto" innerClassName="px-6"><a href="/api/auth-start?returnTo=%2Fparticipation"><GitHubIcon className="size-4" />Sign in with GitHub</a></MetalButton>
              : <p className="text-sm text-t3">{community.isPending ? "Checking sign-in…" : "GitHub sign-in is being set up."}</p>}
          </div>
        </Panel>

        : state.isPending ? <ParticipationSkeleton />

        : state.isError ? <div className="flex flex-col items-center gap-3 py-10 text-center">
          <MetalButton variant="minimal" size="sm" className="w-auto" onClick={() => state.refetch()} disabled={state.isFetching}>Try again</MetalButton>
        </div>

        : data && (!data.activity.linked ? <Panel header={<PanelHeader title="Connect your WhatsApp account" subtitle="Use your number in Open Source Circle with its country code (e.g. +234), then send the code to the bot in a private WhatsApp chat from that account." chip={<Chip tone="muted">Step {challenge ? 2 : 1} of 2</Chip>} />}>
          <div className="py-4">
            <ParticipationForm inline button="Get linking code" fields={[{ name: "phone", label: "Your WhatsApp group number", type: "tel", placeholder: "e.g. +234 803 123 4567" }]} busy={busy} submit={linkPhone} reset={false} onEdit={() => setChallenge(null)} />
          </div>
          {challenge && <div className="space-y-3 border-t border-white/[0.06] py-4" role="status">
            <p className="text-sm text-t3">Send this command to the OpenCircle bot in a private WhatsApp chat from that number:</p>
            <div className="flex items-center gap-2 rounded-full bg-white/[0.06] py-1.5 pl-4 pr-1.5">
              <code className="min-w-0 flex-1 truncate font-mono text-base text-foreground">/link {challenge.code}</code>
              <button type="button" aria-label="Copy command" className="flex size-8 items-center justify-center rounded-full text-t3 hover:text-foreground" onClick={async () => { try { await navigator.clipboard.writeText(`/link ${challenge.code}`); toast.success("Copied."); } catch { toast.error("Couldn't copy."); } }}><CopyIcon size={16} aria-hidden /></button>
            </div>
            <p className="text-xs text-t3">Open the bot's profile in the group and choose Message. It replies after you send the command. /link does not work in the group.</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-t4">Expires in 10 minutes. This page checks automatically.</p>
              <MetalButton variant="minimal" size="sm" className="w-auto" onClick={() => state.refetch()} disabled={state.isFetching}>Check link</MetalButton>
            </div>
          </div>}
        </Panel>

        : <>
          <Panel header={<PanelHeader title="Your activity" subtitle={`${data.activity.pendingContributions} contributions await confirmation`} chip={<Chip tone={data.activity.tracking ? "ok" : "warn"}>{data.activity.tracking ? "Tracking" : "Paused"}</Chip>} />}>
            <Progress label="Confirmed contributions" value={data.activity.contributions} total={data.activity.target} />
            <Progress label="Members you've given feedback" value={data.activity.reviewPeers} total={data.activity.requiredReviewPeers} />
            {(!data.activity.tracking || data.activity.graceRemainingDays > 0 || data.activity.removalReview) && <div className="space-y-1.5 py-4 text-xs text-t4">
              {!data.activity.tracking && <p role="status">{data.activity.enabled ? "Tracking is paused while the bot checks group access." : "Coordination is paused. You can still submit feedback."}</p>}
              {data.activity.graceRemainingDays > 0 && <p>{data.activity.graceRemainingDays} days left in your settling-in period.</p>}
              {data.activity.removalReview && <p>An admin is reviewing your participation. Pending feedback and approved breaks are checked before any removal.</p>}
            </div>}
          </Panel>

          {target && <section ref={feedbackForm}>
            <Panel header={<PanelHeader title={`Feedback for ${target.title}`} subtitle="What you tried, plus one useful observation or suggestion." />}>
              <div className="py-4">
                <ParticipationForm button="Submit feedback" busy={busy} fields={[{ name: "feedback", label: "What you tried and a useful observation or suggestion", type: "textarea", min: 30, max: 1000 }]} submit={(form) => submit(target.kind === "review" ? { action: "review", projectId: target.id, text: String(form.get("feedback")) } : { action: "answer", helpId: target.id, text: String(form.get("feedback")) })} />
                <div className="mt-2 flex justify-center"><MetalButton variant="minimal" size="sm" className="w-auto" disabled={busy} onClick={() => setTarget(null)}>Cancel</MetalButton></div>
              </div>
            </Panel>
          </section>}

          <Panel header={<PanelHeader title="Projects to review" subtitle={`${data.projects.length} in the circle`} />}>
            {data.projects.length ? <ul>{data.projects.map((project) => <Item key={project.id} action={<>
              {project.status === "approved" && !mine(project.owner) && <MetalButton variant="secondary" size="sm" className="w-auto" disabled={busy} onClick={() => setTarget({ kind: "review", id: project.id, title: project.title })}>Give feedback</MetalButton>}
              {mine(project.owner) && project.status !== "closed" && <MetalButton variant="minimal" size="sm" className="w-auto" disabled={busy} onClick={() => submit({ action: "close", id: project.id })}>Close project</MetalButton>}
            </>}>
              <div className="flex flex-wrap items-center gap-2">
                <a href={project.url} target="_blank" rel="noopener noreferrer" className="break-words font-medium hover:underline hover:underline-offset-4">{project.title}</a>
                <Chip tone={statusTone(project.status)}>{project.status}</Chip>
              </div>
              <p className="text-xs text-t4">@{project.owner} · {project.reviews} confirmed reviews</p>
              {project.assignedTo.some((login) => mine(login)) && <p className="text-xs text-t2">You're assigned to review this.</p>}
            </Item>)}</ul> : <Empty>No approved projects are waiting for feedback yet.</Empty>}
            <FormFooter>
              <ParticipationForm inline button="Submit for review" busy={busy} fields={[{ name: "title", label: "Project name", max: 80 }, { name: "url", label: "Project link", type: "url" }]} submit={(form) => submit({ action: "project", title: String(form.get("title")), url: String(form.get("url")) })} />
            </FormFooter>
          </Panel>

          <Panel header={<PanelHeader title="Help requests" subtitle="Ask the circle, or help someone out." />}>
            {data.help.length ? <ul>{data.help.map((help) => <Item key={help.id} action={<>
              {help.status === "open" && !mine(help.owner) && <MetalButton variant="secondary" size="sm" className="w-auto" disabled={busy} onClick={() => setTarget({ kind: "answer", id: help.id, title: help.owner })}>Help with this</MetalButton>}
              {help.status === "open" && mine(help.owner) && <MetalButton variant="minimal" size="sm" className="w-auto" disabled={busy} onClick={() => submit({ action: "close", id: help.id })}>Mark resolved</MetalButton>}
            </>}>
              <p className="break-words text-sm text-foreground">{help.question}</p>
              <p className="text-xs text-t4">@{help.owner} · {help.status}</p>
            </Item>)}</ul> : <Empty>No open help requests.</Empty>}
            <FormFooter>
              <ParticipationForm title="Ask the group for help" button="Post help request" busy={busy} fields={[{ name: "question", label: "Your question", type: "textarea", min: 15, max: 500 }]} submit={(form) => submit({ action: "help", question: String(form.get("question")) })} />
            </FormFooter>
          </Panel>

          <Panel header={<PanelHeader title="Feedback" subtitle="Given and received." />}>
            {data.contributions.length ? <ul>{data.contributions.map((entry) => <Item key={entry.id} action={entry.status === "pending" && mine(entry.for) ? <>
              <MetalButton size="sm" className="w-auto" disabled={busy} onClick={() => submit({ action: "confirm", id: entry.id, approve: true })}>Confirm useful</MetalButton>
              <MetalButton variant="minimal" size="sm" className="w-auto" disabled={busy} onClick={() => submit({ action: "confirm", id: entry.id, approve: false })}>Needs more detail</MetalButton>
            </> : undefined}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-t4"><span>@{entry.by} → @{entry.for}</span><Chip tone={statusTone(entry.status)}>{entry.status}</Chip></div>
              <p className="break-words text-sm text-t2">{entry.text}</p>
            </Item>)}</ul> : <Empty>Your submitted and received feedback will appear here.</Empty>}
          </Panel>

          <Panel header={<PanelHeader title="Need a break?" subtitle="Approved breaks pause tracking." />}>
            <div className="py-4">
              {data.activity.awayUntil && data.activity.awayUntil > Date.now()
                ? <p className="text-sm text-t3">Your break is approved until {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(data.activity.awayUntil)}.</p>
                : data.activity.awayRequestedDays
                  ? <p className="text-sm text-t3">Your {data.activity.awayRequestedDays}-day break awaits admin approval.</p>
                  : <ParticipationForm inline button="Request break" busy={busy} fields={[{ name: "days", label: "Days away, up to 30", type: "number", min: 1, max: 30, value: "7" }]} submit={(form) => submit({ action: "away", days: Number(form.get("days")) })} />}
            </div>
          </Panel>
        </>)}
      </main>
      <SiteFooter />
      <Dock />
    </div>
  </div>;
}
