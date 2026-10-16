import { CupStarIcon, FireIcon, HandHeartIcon, UsersGroupRoundedIcon } from "@solar-icons/react/bold-duotone";
import type { PublicMember } from "@shared/types";
import { ACHIEVEMENTS, type AchievementId } from "@shared/progression";
import { cn } from "@/lib/utils";

const ICONS: Record<AchievementId, typeof FireIcon> = {
  first_contribution: CupStarIcon,
  streak_7: FireIcon,
  streak_30: FireIcon,
  first_help: HandHeartIcon,
  community_helper_5: UsersGroupRoundedIcon,
};

const MAX_BADGES = 3;

type Progression = Pick<PublicMember, "currentStreak" | "achievements">;

export function ProgressionBadges({ member, className }: { member: Progression; className?: string }) {
  const streak = member.currentStreak ?? 0;
  const earned = (member.achievements ?? []).filter((id): id is AchievementId => id in ACHIEVEMENTS);
  if (streak < 2 && earned.length === 0) return null;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {streak >= 2 && (
        <span className="inline-flex items-center gap-0.5 text-[11px] tabular text-t3" title={`${streak}-day activity streak`}>
          <FireIcon size={12} aria-hidden />
          {streak}
          <span className="sr-only"> day activity streak</span>
        </span>
      )}
      {earned.length > 0 && (
        <span className="hidden items-center gap-1 md:inline-flex">
          {earned.slice(0, MAX_BADGES).map((id) => {
            const Icon = ICONS[id];
            return (
              <span key={id} className="inline-flex text-t4" title={ACHIEVEMENTS[id]}>
                <Icon size={12} aria-hidden />
                <span className="sr-only">{ACHIEVEMENTS[id]}</span>
              </span>
            );
          })}
        </span>
      )}
    </span>
  );
}
