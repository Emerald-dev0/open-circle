import { StarIcon } from "@solar-icons/react/bold-duotone";
import { MetalBadge } from "metal-fx";
import { motion } from "motion/react";
import type { PublicMember } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextureButton } from "@/components/ui/texture-button";
import { diceBearAvatarUrl, formatCount, formatFull, githubUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Movement } from "./movement";

// Phone: rank · member · score. From md up, every column in PRD §11.3 order.
const GRID =
  "grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-2 md:gap-x-3 md:grid-cols-[2rem_minmax(0,1.4fr)_minmax(0,1fr)_4.75rem_3.75rem_4.75rem_3.25rem_5.5rem_3.25rem]";

function Row({
  member,
  index,
  isMe,
  flash,
}: {
  member: PublicMember;
  index: number;
  isMe: boolean;
  flash: boolean;
}) {
  const id = member.login.toLowerCase();
  return (
    <motion.div
      layout="position"
      id={`member-${id}`}
      role="row"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ layout: { type: "spring", stiffness: 420, damping: 38 }, opacity: { duration: 0.25 } }}
      className={cn(
        GRID,
        "scroll-mt-24 rounded-full px-3 py-2.5 md:px-5",
        isMe ? "bg-white/[0.09]" : index % 2 === 1 && "surface-quiet",
        flash && "animate-row-flash",
      )}
    >
      <div role="cell" className="flex flex-col items-start leading-none">
        <span className="text-[15px] font-medium tabular text-t2">{member.rank}</span>
        <Movement delta={member.delta} isNew={member.isNew} className="mt-1 text-[10px] md:hidden" />
      </div>

      <div role="cell" className="min-w-0">
        <a
          href={githubUrl(member.login)}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg"
        >
          <Avatar className="size-6 shrink-0 min-[400px]:size-8">
            <AvatarImage src={member.avatarUrl || diceBearAvatarUrl(id)} alt="" loading="lazy" />
            <AvatarFallback className="bg-alva-card text-[10px] font-medium">
              {member.nickname.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-foreground group-hover:text-white">{member.nickname}</span>
              {isMe && (
                <span className="shrink-0">
                  <MetalBadge theme="dark" scale={0.78}>You</MetalBadge>
                </span>
              )}
            </span>
            <span className="block truncate text-xs text-t4 group-hover:text-t3 md:hidden">@{member.login}</span>
            <span className="block truncate text-[11px] text-t3 tabular md:hidden">{formatCount(member.activity)} contributions · {formatCount(member.upvotes)} upvotes</span>
          </span>
        </a>
      </div>

      <div role="cell" className="hidden min-w-0 md:block">
        <a
          href={githubUrl(member.login)}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={-1}
          className="block truncate text-sm text-t3 hover:text-foreground"
        >
          @{member.login}
        </a>
      </div>

      <div role="cell" className="text-right md:text-left">
        <span className="block text-sm font-medium tabular text-foreground" title={`${formatFull(member.score)} points · ${formatFull(member.activity)} contributions since joining · ${formatFull(member.upvotes)} repo upvotes`}>
          <span className="sr-only">{formatFull(member.score)} points</span>
          <span className="md:hidden" aria-hidden="true">{formatCount(member.score)}</span>
          <span className="hidden md:inline" aria-hidden="true">{formatFull(member.score)}</span>
        </span>
        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-t4 tabular md:hidden">
          <StarIcon size={10} aria-hidden />
          {formatCount(member.stars)}
          <span className="sr-only"> stars</span>
        </span>
      </div>
      <div role="cell" className="hidden text-sm tabular text-t2 md:block">{formatCount(member.stars)}</div>
      <div role="cell" className="hidden text-sm tabular text-t2 md:block">{formatCount(member.followers)}</div>
      <div role="cell" className="hidden text-sm tabular text-t3 md:block">{formatCount(member.repos)}</div>
      <div role="cell" className="hidden text-sm tabular text-t2 md:block" title="Contributions since joining OpenCircle">
        {formatCount(member.activity)}
        <span className="block text-[11px] text-t3">{formatCount(member.upvotes)} upvotes</span>
      </div>
      <div role="cell" className="hidden text-sm md:block">
        <Movement delta={member.delta} isNew={member.isNew} />
      </div>
    </motion.div>
  );
}

export function RankTable({
  members,
  meId,
  flashId,
  limit,
  onShowAll,
}: {
  /** Members ranked 4 and below, in rank order. */
  members: PublicMember[];
  meId?: string | null;
  flashId?: string | null;
  limit?: number;
  onShowAll?: () => void;
}) {
  if (members.length === 0) {
    return (
      <p className="surface-quiet rounded-full px-4 py-4 text-center text-sm text-t3">
        Ranks 4 and down land here as more of the group joins.
      </p>
    );
  }

  const shown = limit ? members.slice(0, limit) : members;
  // Past the cut-off, still show your own row so you can always find yourself.
  const me = limit && meId ? members.slice(limit).find((m) => m.login.toLowerCase() === meId) : undefined;
  const hiddenCount = members.length - shown.length;

  return (
    <div>
      <div role="table" aria-label="Ranks 4 and below" aria-rowcount={members.length + 1}>
        <div role="rowgroup">
          <div role="row" className={cn(GRID, "px-3 pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-t4 md:px-5")}>
            <span role="columnheader">#</span>
            <span role="columnheader">Member</span>
            <span role="columnheader" className="hidden md:block">GitHub</span>
            <span role="columnheader" className="text-right md:text-left">Score</span>
            <span role="columnheader" className="hidden md:block">Stars</span>
            <span role="columnheader" className="hidden md:block">Followers</span>
            <span role="columnheader" className="hidden md:block">Repos</span>
            <span role="columnheader" className="hidden md:block">Contributions</span>
            <span role="columnheader" className="hidden md:block">Move</span>
          </div>
        </div>
        <div role="rowgroup" className="space-y-1">
          {shown.map((m, i) => {
            const id = m.login.toLowerCase();
            return <Row key={id} member={m} index={i} isMe={id === meId} flash={id === flashId} />;
          })}
          {me && (
            <>
              <div aria-hidden className="py-1 text-center text-xs tracking-[0.3em] text-t4">···</div>
              <Row member={me} index={0} isMe flash={me.login.toLowerCase() === flashId} />
            </>
          )}
        </div>
      </div>

      {hiddenCount > 0 && onShowAll && (
        <div className="mt-4 flex justify-center">
          <TextureButton variant="minimal" size="sm" className="w-auto" onClick={onShowAll}>
            Show all {formatFull(members.length + 3)} members
          </TextureButton>
        </div>
      )}
    </div>
  );
}
