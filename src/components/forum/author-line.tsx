import { forumAuthorName, type ForumAuthor } from "@shared/forum";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ForumTime } from "./content";

export function ForumAuthorLine({ author, at, edited = false }: { author: ForumAuthor; at: number; edited?: boolean }) {
  return <div className="flex min-w-0 items-center gap-3">
    <Avatar className="size-9"><AvatarImage src={author.avatarUrl} alt="" loading="lazy" /><AvatarFallback className="text-xs font-medium text-t2" aria-hidden>{author.login.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
    <div className="min-w-0 space-y-0.5"><p className="break-words text-sm font-medium [overflow-wrap:anywhere]">{forumAuthorName(author)}</p><p className="text-xs text-t3"><ForumTime at={at} />{edited && " · Edited"}</p></div>
  </div>;
}
