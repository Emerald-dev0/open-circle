import type { ForumPage } from "@shared/forum";
import { forumCategories, reviewLabel } from "@shared/forum";
import { Link } from "react-router-dom";
import { Pagination } from "@/components/pagination";
import { SharedSelect } from "@/components/ui/select";
import { Chip } from "@/components/panel";
import { ChartIcon, CheckCircleIcon, LockKeyholeIcon, MagnifierIcon } from "@solar-icons/react/linear";
import { ForumAuthorLine } from "./author-line";
import { ForumPostActions } from "./post-actions";

export function ForumFilters({ params, onChange, questions = false, admin = false }: { params: URLSearchParams; onChange: (key: string, value: string) => void; questions?: boolean; admin?: boolean }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
    <label className="forum-search min-w-0 flex-1"><span className="sr-only">Search community</span><MagnifierIcon className="forum-search-icon" aria-hidden /><input type="search" className="field h-11" placeholder="Search community" maxLength={150} value={params.get("search") ?? ""} onChange={(e) => onChange("search", e.target.value)} /></label>
    <SharedSelect aria-label="Category" className="h-11 w-full sm:w-52" value={params.get("category") || "all"} onValueChange={(value) => onChange("category", value === "all" ? "" : value)} options={[{ label: "All categories", value: "all" }, ...forumCategories.map((value) => ({ label: value, value }))]} />
    {questions && <SharedSelect aria-label="Question status" className="h-11 w-full sm:w-40" value={params.get("status") || "all"} onValueChange={(value) => onChange("status", value === "all" ? "" : value)} options={[{ label: "Any status", value: "all" }, { label: "Open", value: "open" }, { label: "Resolved", value: "resolved" }]} />}
    {admin && <SharedSelect aria-label="Moderation queue" className="h-11 w-full sm:w-52" value={params.get("queue") ?? "pending"} onValueChange={(value) => onChange("queue", value)} options={[{ label: "Awaiting review", value: "pending" }, { label: "Reports", value: "reports" }, { label: "Published", value: "published" }, { label: "Hidden", value: "hidden" }, { label: "Drafts", value: "drafts" }, { label: "All content", value: "all" }]} />}
  </div>;
}
export function ForumFeed({ data, admin = false, busy, onPage, onSelect, onLike }: { data: ForumPage; admin?: boolean; busy: boolean; onPage: (page: number) => void; onSelect?: (id: string) => void; onLike?: (id: string, liked: boolean) => void }) {
  return <div>
    {!data.items.length && <p className="py-9 text-sm text-t3">{admin ? "No posts in this queue." : "No posts found. Try another filter or come back later."}</p>}
    <ul className="forum-feed">{data.items.map((post) => <li key={post.id} className="forum-post"><article aria-labelledby={`post-${post.id}`}>
      <div className="forum-post-header"><ForumAuthorLine author={post.author} at={post.publishedAt ?? post.createdAt} edited={post.edited} /><span className="forum-category">{post.content.category}</span></div>
      <div className="forum-post-content space-y-3">
      <div className="flex flex-wrap items-start gap-2">
        <h2 id={`post-${post.id}`} className="min-w-0 flex-1 break-words text-lg font-medium leading-snug tracking-[-0.02em] [overflow-wrap:anywhere]">{admin ? <button type="button" onClick={() => onSelect?.(post.id)} className="text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">{post.content.title}</button> : <Link to={`/community/${post.id}`} className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">{post.content.title}</Link>}</h2>
        {post.pinned && <Chip tone="muted">Pinned</Chip>}{post.locked && <Chip tone="muted" icon={<LockKeyholeIcon />}>Locked</Chip>}{post.hidden && <Chip tone="warn">Hidden</Chip>}{post.resolved && <Chip tone="ok" icon={<CheckCircleIcon />}>Resolved</Chip>}{reviewLabel(post.review, post.hasRevision) && <Chip tone="warn">{reviewLabel(post.review, post.hasRevision)}</Chip>}
      </div>
      <p className="line-clamp-2 max-w-prose break-words text-sm leading-relaxed text-t2 [overflow-wrap:anywhere]">{post.content.body.slice(0, 300)}</p>
      {post.hasPoll && <p className="inline-flex items-center gap-1.5 text-xs text-t3"><ChartIcon className="size-3.5" aria-hidden />Poll</p>}
      </div>
      {post.publishedAt && !post.hidden && !admin && <ForumPostActions post={post} busy={busy} onLike={onLike ? (liked) => onLike(post.id, liked) : undefined} />}
    </article></li>)}</ul>
    <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={onPage} label="Community" disabled={busy} />
  </div>;
}
