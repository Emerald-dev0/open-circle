import { useEffect, useRef, useState } from "react";
import type { ForumAuthor, ForumCommand, ForumDetail, ForumPollView } from "@shared/forum";
import { reviewLabel, FORUM_PAGE_SIZE } from "@shared/forum";
import { Link } from "react-router-dom";
import { Chip } from "@/components/panel";
import { MetalButton } from "@/components/metal-button";
import { Pagination } from "@/components/pagination";
import { ForumBody, ForumTime } from "./content";
import { ForumEditor } from "./editor";

function Poll({ value, busy, onVote }: { value: ForumPollView; busy: boolean; onVote: (optionId: string, requestId: string) => Promise<boolean> }) {
  const [choice, setChoice] = useState(value.selected ?? "");
  const requestId = useRef(crypto.randomUUID());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!value.closesAt || !value.open || value.closesAt <= now) return;
    const remaining = value.closesAt - Date.now();
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(Math.max(remaining, 0), 2147483647));
    return () => window.clearTimeout(timer);
  }, [value.closesAt, value.open, now]);
  const open = value.open && (value.closesAt === null || value.closesAt > now);
  return <form className="space-y-3 rounded-2xl bg-foreground/[0.04] p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); if (open && choice) void onVote(choice, requestId.current); }}>
    <fieldset disabled={busy || !open} className="space-y-2">
      <legend className="mb-3 text-base font-medium">{value.question}</legend>
      {value.options.map((option) => {
        const count = value.counts[option.id] ?? 0;
        const percent = value.total ? Math.round(count * 100 / value.total) : 0;
        return <label key={option.id} className="relative flex min-h-12 cursor-pointer items-center gap-3 overflow-hidden rounded-xl px-3 py-2 ring-1 ring-inset ring-foreground/10 focus-within:ring-2 focus-within:ring-foreground/50">
          <span aria-hidden className="absolute inset-y-0 left-0 bg-foreground/[0.06]" style={{ width: `${percent}%` }} />
          <input type="radio" name="poll-option" value={option.id} checked={choice === option.id} onChange={() => { setChoice(option.id); requestId.current = crypto.randomUUID(); }} className="relative shrink-0 accent-foreground" />
          <span className="relative min-w-0 flex-1 break-words text-sm">{option.label}{value.selected === option.id && <span className="ml-2 text-xs text-t3">Your vote</span>}</span>
          <span className="relative text-xs tabular text-t2">{count} · {percent}%</span>
        </label>;
      })}
    </fieldset>
    <p className="text-xs text-t3" role="status">{open ? "Open" : "Closed"} · {value.total ? `${value.total} ${value.total === 1 ? "vote" : "votes"}` : "No votes yet"}{value.closesAt ? <> · {open ? "Closes" : "Closing time"} <ForumTime at={value.closesAt} /></> : ""}</p>
    {open && <MetalButton type="submit" className="min-h-11 w-auto" loading={busy} disabled={!choice || choice === value.selected}>{value.selected ? "Change vote" : "Vote"}</MetalButton>}
    <p className="text-xs text-t3">One vote per GitHub account. Other members see totals, not your choice.</p>
  </form>;
}
export function ForumThreadView({ data, profile, admin = false, busy, onAction, onPage }: { data: ForumDetail; profile: ForumAuthor; admin?: boolean; busy: boolean; onAction: (command: ForumCommand) => Promise<boolean>; onPage: (page: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [reporting, setReporting] = useState<string | null | undefined>(undefined);
  const [reportReason, setReportReason] = useState("");
  const [reason, setReason] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const reportRequestId = useRef(crypto.randomUUID());
  const own = profile.id === data.author.id;
  const status = reviewLabel(data.review, data.hasRevision);
  async function send(patch: Omit<ForumCommand, "requestId" | "id">, id: string = crypto.randomUUID()) {
    return onAction({ ...patch, id: data.id, requestId: id });
  }
  const moderate = (operation: ForumCommand["operation"], extra: Partial<ForumCommand> = {}) => send({ action: "moderate", operation, version: data.version, reason, ...extra });
  const roots = data.comments.filter((c) => !c.parentId);
  return <article className="min-w-0 space-y-6">
    <Link className="forum-action inline-flex items-center" to={`/community?tab=${data.kind === "question" ? "questions" : "discussions"}`}>Back to {data.kind === "question" ? "questions" : "discussions"}</Link>
    <header className="space-y-3">
      <div className="flex flex-wrap gap-2">{data.pinned && <Chip tone="muted">Pinned</Chip>}{data.locked && <Chip tone="muted">Comments locked</Chip>}{data.hidden && <Chip tone="warn">Hidden</Chip>}{data.kind === "question" && data.publishedAt && <Chip tone={data.resolved ? "ok" : "muted"}>{data.resolved ? "Resolved" : "Open"}</Chip>}{status && <Chip tone="warn">{status}</Chip>}</div>
      <h2 className="break-words text-2xl font-medium tracking-[-0.03em]">{data.content.title}</h2>
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-t3"><span>@{data.author.login}</span><span><ForumTime at={data.publishedAt ?? data.createdAt} /></span><span>{data.content.category}</span>{data.edited && <span>Edited <ForumTime at={data.updatedAt} /></span>}</p>
    </header>
    <ForumBody>{data.content.body}</ForumBody>
    {data.reviewReason && <p className="rounded-xl bg-foreground/[0.04] p-3 text-sm text-t2">Private review note: {data.reviewReason}</p>}
    {data.revision && data.publishedAt && <details className="rounded-xl bg-foreground/[0.03] p-4"><summary className="min-h-8 cursor-pointer text-sm font-medium">{admin ? "Proposed revision" : "Your proposed revision"}</summary><h3 className="mb-3 mt-4 break-words font-medium">{data.revision.title}</h3><ForumBody>{data.revision.body}</ForumBody></details>}
    <div className="flex flex-wrap gap-2">
      {(admin || own && data.kind === "question") && <button className="forum-action" type="button" disabled={busy} onClick={() => setEditing(!editing)}>{editing ? "Close editor" : "Edit"}</button>}
      {data.kind === "question" && data.publishedAt && (admin || own) && <button className="forum-action" type="button" disabled={busy || admin && reason.trim().length < 3} onClick={() => void moderate(data.resolved ? "unresolve" : "resolve", { reason: admin ? reason : undefined })}>{data.resolved ? "Reopen question" : "Mark resolved"}</button>}
      {data.publishedAt && !data.hidden && <button className="forum-action" type="button" disabled={busy} onClick={() => { setReporting(null); setReportReason(""); reportRequestId.current = crypto.randomUUID(); }}>Report post</button>}
    </div>
    {editing && <ForumEditor key={data.id} initial={data} admin={admin} busy={busy} onCancel={() => setEditing(false)} onSave={async (input) => { const saved = await onAction(input); if (saved) setEditing(false); return saved; }} />}
    {data.poll && <Poll key={`${data.id}:${data.poll.selected}:${data.poll.open}`} value={data.poll} busy={busy} onVote={(optionId, requestId) => send({ action: "vote", optionId, ballot: data.poll!.ballot }, requestId)} />}
    {reporting !== undefined && <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await send({ action: "report", commentId: reporting, reason: reportReason }, reportRequestId.current)) { setReporting(undefined); setReportReason(""); } }}><label className="block space-y-2"><span className="text-sm">Why are you reporting this?</span><textarea className="field min-h-24 rounded-2xl py-3" value={reportReason} minLength={5} maxLength={1000} required onChange={(e) => { setReportReason(e.target.value); reportRequestId.current = crypto.randomUUID(); }} disabled={busy} /></label><MetalButton type="submit" className="min-h-11 w-auto" loading={busy}>Send report</MetalButton><button type="button" className="forum-action" disabled={busy} onClick={() => setReporting(undefined)}>Cancel report</button></form>}
    {admin && <section className="space-y-4 rounded-2xl bg-foreground/[0.03] p-4" aria-label="Moderation">
      <h3 className="font-medium">Moderation</h3>
      <p className="text-xs text-t3">Submitted <ForumTime at={data.submittedAt ?? data.createdAt} /> · Version {data.version}</p>
      <label className="block space-y-2"><span className="text-sm text-t2">Private reason or review note</span><textarea className="field min-h-24 rounded-2xl py-3" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} disabled={busy} /></label>
      <div className="flex flex-wrap gap-2">
        {data.review === "pending" && <>{([['approve', 'Approve'], ['changes', 'Request changes'], ['reject', 'Reject']] as const).map(([decision, label]) => <button type="button" className="forum-action" key={decision} disabled={busy || decision !== "approve" && reason.trim().length < 5} onClick={() => void send({ action: "review", decision, reason, version: data.version })}>{label}</button>)}</>}
        {([[data.hidden ? "restore" : "hide", data.hidden ? "Restore post" : "Hide post"], [data.locked ? "reopen" : "lock", data.locked ? "Reopen comments" : "Lock comments"], [data.pinned ? "unpin" : "pin", data.pinned ? "Unpin" : "Pin"]] as const).map(([op, label]) => <button className="forum-action" type="button" key={op} disabled={busy || reason.trim().length < 3} onClick={() => void moderate(op)}>{label}</button>)}
        {data.poll?.open && <button className="forum-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void moderate("close-poll")}>Close voting</button>}
      </div>
      {!!data.reports?.length && <div className="space-y-3"><h4 className="text-sm font-medium">Reports</h4>{data.reports.map((r) => <div key={r.id} className="text-sm text-t2"><p>@{r.author.login} · <ForumTime at={r.createdAt} /> · {r.commentId ? `Comment ${r.commentId}` : "Post"} · {r.resolved ? "Reviewed" : "Open"}</p><p className="break-words">{r.reason}</p>{!r.resolved && <button className="forum-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void moderate("dismiss-report", { reportId: r.id })}>Mark report reviewed</button>}</div>)}</div>}
      <details><summary className="cursor-pointer py-3 text-sm">Moderation history</summary><ol className="space-y-4">{data.audit?.map((a) => <li key={a.id} className="break-words text-xs text-t3"><p>@{a.actor.login} · {a.action} · <ForumTime at={a.at} /></p>{a.reason && <p className="mt-1 text-sm text-t2">{a.reason}</p>}{a.content && <details className="mt-2"><summary className="cursor-pointer">Submitted content</summary><p className="my-2 font-medium">{a.content.title}</p><ForumBody>{a.content.body}</ForumBody></details>}</li>)}</ol></details>
    </section>}
    {data.publishedAt && <section className="space-y-4" aria-labelledby="comments-heading">
      <h3 id="comments-heading" className="text-lg font-medium">Comments <span className="text-sm tabular text-t3">{data.commentCount}</span></h3>
      {!data.comments.length && <p className="py-3 text-sm text-t3">No comments yet.</p>}
      <ol className="space-y-5">{roots.map((root) => <li key={root.id} className="space-y-4 border-b border-foreground/[0.08] pb-5">{[root, ...data.comments.filter((c) => c.parentId === root.id)].map((comment) => <div key={comment.id} id={`comment-${comment.id}`} className={comment.parentId ? "ml-4 space-y-2 sm:ml-8" : "space-y-2"}>
        <p className="text-xs text-t3">@{comment.author.login} · <ForumTime at={comment.createdAt} />{comment.hidden && " · Hidden"}</p>
        <ForumBody>{comment.body}</ForumBody>
        <div className="flex flex-wrap gap-1">{!comment.parentId && !comment.hidden && !data.locked && <button className="forum-action" type="button" disabled={busy} onClick={() => { if (replyTo !== comment.id) requestId.current = crypto.randomUUID(); setReplyTo(comment.id); document.getElementById("forum-comment")?.focus(); }}>Reply</button>}<button className="forum-action" type="button" disabled={busy || comment.hidden} onClick={() => { setReporting(comment.id); setReportReason(""); reportRequestId.current = crypto.randomUUID(); }}>Report comment</button>{admin && <button className="forum-action" type="button" disabled={busy || reason.trim().length < 3} onClick={() => void moderate(comment.hidden ? "restore-comment" : "hide-comment", { commentId: comment.id })}>{comment.hidden ? "Restore comment" : "Hide comment"}</button>}</div>
      </div>)}</li>)}</ol>
      <Pagination page={data.commentPage} pageSize={FORUM_PAGE_SIZE} total={data.commentTotal} label="Comments" onPageChange={onPage} disabled={busy} />
      {data.locked ? <p className="text-sm text-t3">Comments are locked.</p> : <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); if (await send({ action: "comment", body, parentId: replyTo }, requestId.current)) { setBody(""); setReplyTo(null); requestId.current = crypto.randomUUID(); } }}>
        {replyTo && <p className="text-sm text-t3">Replying to @{data.comments.find((c) => c.id === replyTo)?.author.login} <button className="forum-action" type="button" onClick={() => { setReplyTo(null); requestId.current = crypto.randomUUID(); }}>Cancel reply</button></p>}
        <label className="block space-y-2" htmlFor="forum-comment"><span className="text-sm text-t2">{replyTo ? "Your reply" : "Your comment"}</span><textarea id="forum-comment" className="field min-h-28 rounded-2xl py-3" value={body} onChange={(e) => { setBody(e.target.value); requestId.current = crypto.randomUUID(); }} maxLength={6000} required disabled={busy} /></label>
        <MetalButton type="submit" className="min-h-11 w-auto" loading={busy} disabled={!body.trim()}>Comment</MetalButton>
      </form>}
    </section>}
  </article>;
}
