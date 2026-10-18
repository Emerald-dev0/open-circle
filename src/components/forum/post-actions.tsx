import { HeartIcon as LikedHeartIcon } from "@solar-icons/react/bold";
import { ChatRoundIcon, HeartIcon } from "@solar-icons/react/linear";
import { Link } from "react-router-dom";
import type { ForumSummary } from "@shared/forum";
import { ShareButton } from "@/components/share-button";

export function ForumPostActions({ post, busy, onLike }: { post: ForumSummary; busy: boolean; onLike?: (liked: boolean) => void }) {
  const Heart = post.liked ? LikedHeartIcon : HeartIcon;
  return <div className="content-actions" role="group" aria-label={`Actions for ${post.content.title}`}>
    {onLike && <button type="button" className="content-action content-action-like" aria-label={`${post.liked ? "Unlike" : "Like"} ${post.content.title}`} aria-describedby={`likes-${post.id}`} aria-pressed={post.liked} disabled={busy} onClick={() => onLike(!post.liked)}>
      <Heart className="size-[18px] shrink-0" aria-hidden /><span id={`likes-${post.id}`} className="content-action-count">{post.likeCount} <span className="sr-only">{post.likeCount === 1 ? "like" : "likes"}</span></span>
    </button>}
    <Link className="content-action" to={`/community/${post.id}#comments`} aria-label={`${post.commentCount} ${post.commentCount === 1 ? "comment" : "comments"} on ${post.content.title}`}>
      <ChatRoundIcon className="size-[18px] shrink-0" aria-hidden /><span className="content-action-count">{post.commentCount} <span className="hidden min-[360px]:inline">{post.commentCount === 1 ? "comment" : "comments"}</span></span>
    </Link>
    <div className="ml-auto"><ShareButton path={`/community/${post.id}`} title={post.publishedTitle ?? post.content.title} kind={post.kind} /></div>
  </div>;
}
