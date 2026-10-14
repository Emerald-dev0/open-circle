import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { RefreshIcon } from "@solar-icons/react/bold-duotone";
import type { PublicMember } from "@shared/types";
import { HowItWorks } from "@/components/board/how-it-works";
import { LeaderboardPodium, type LeaderboardEntry } from "@/components/board/leaderboard-podium";
import { RankMe } from "@/components/board/rank-me";
import { RankTable } from "@/components/board/rank-table";
import { SiteFooter } from "@/components/site-footer";
import { Dock } from "@/components/dock";
import { Skeleton } from "@/components/ui/skeleton";
import { TextureButton } from "@/components/ui/texture-button";
import { useBoard } from "@/hooks/use-board";
import { githubUrl } from "@/lib/format";
import { readMe } from "@/lib/identity";

const TABLE_LIMIT = 50;

function toEntry(m: PublicMember): LeaderboardEntry {
  const id = m.login.toLowerCase();
  return {
    id,
    name: m.nickname,
    points: m.score,
    handle: m.login,
    stars: m.stars,
    href: githubUrl(m.login),
    avatarUrl: m.avatarUrl || undefined,
    seed: id,
  };
}

function TableSkeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5">
          <Skeleton className="h-4 w-5 bg-white/[0.06]" />
          <Skeleton className="size-8 rounded-full bg-white/[0.06]" />
          <Skeleton className="h-4 flex-1 bg-white/[0.06]" />
          <Skeleton className="h-4 w-12 bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

const Index = () => {
  const navigate = useNavigate();
  const howItWorks = useMatch("/how-it-works") !== null;
  const { data: board, isPending, isError, refetch, isRefetching } = useBoard();
  const [me, setMe] = useState<string | null>(readMe);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  const members = useMemo(() => board?.members ?? [], [board]);
  const podium = useMemo(() => members.slice(0, 3).map(toEntry), [members]);
  const rest = useMemo(() => members.slice(3), [members]);

  // Visiting /how-it-works opens the explainer over the board.
  const setHowOpen = (open: boolean) => navigate(open ? "/how-it-works" : "/", { replace: !open });

  const locate = useCallback(
    (login: string) => {
      const id = login.toLowerCase();
      const index = members.findIndex((m) => m.login.toLowerCase() === id);
      if (index >= 3 + TABLE_LIMIT) setShowAll(true);
      window.clearTimeout(flashTimer.current);
      setFlashId(null);
      // Let the result card finish opening first; layout moving under a
      // smooth scroll cancels it. Also restarts the flash.
      flashTimer.current = window.setTimeout(() => {
        setFlashId(id);
        document.getElementById(`member-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        flashTimer.current = window.setTimeout(() => setFlashId(null), 1700);
      }, 450);
    },
    [members],
  );

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="app-backdrop" aria-hidden />

      <div className="relative z-10">
        <main className="mx-auto max-w-3xl px-4 pb-6">
          <section className="flex flex-col items-center pt-20 text-center sm:pt-28" aria-labelledby="pitch">
            <h1
              id="pitch"
              className="text-gradient text-[40px] font-[350] leading-[1.02] tracking-[-0.04em] sm:text-[64px]"
            >
              Paste your username.
              <br />
              Take your place.
            </h1>

            <div className="mt-8 w-full max-w-xl sm:mt-10">
              <RankMe
                board={board}
                me={me}
                onLocate={locate}
                onJoined={(login) => {
                  setMe(login.toLowerCase());
                  locate(login);
                }}
                onRules={() => setHowOpen(true)}
              />
            </div>
          </section>

          <section id="board" className="mt-12 scroll-mt-8 sm:mt-16" aria-labelledby="board-title">
            <h2 id="board-title" className="text-gradient-x mb-8 text-center text-[22px] font-[450] tracking-[-0.025em] sm:text-2xl">
              The board
            </h2>

            {isError && !board ? (
              <div className="surface-quiet flex flex-col items-center gap-3 rounded-2xl px-4 py-8 text-center">
                <p className="text-sm text-t2">Couldn't load the board.</p>
                <TextureButton variant="minimal" size="sm" className="w-auto" onClick={() => refetch()} disabled={isRefetching}>
                  <RefreshIcon size={14} aria-hidden />
                  {isRefetching ? "Retrying…" : "Try again"}
                </TextureButton>
              </div>
            ) : (
              <>
                <LeaderboardPodium
                  entries={podium}
                  currentUserId={me}
                  flashId={flashId}
                  className={isPending ? "animate-pulse" : undefined}
                />

                {!isPending && members.length === 0 && (
                  <p className="mt-4 text-center text-sm text-t3">
                    Nobody's on the board yet. Paste your GitHub above and take #1.
                  </p>
                )}

                <div className="mt-6">
                  {isPending ? (
                    <TableSkeleton />
                  ) : (
                    members.length > 0 && (
                      <RankTable
                        members={rest}
                        meId={me}
                        flashId={flashId}
                        limit={showAll ? undefined : TABLE_LIMIT}
                        onShowAll={() => setShowAll(true)}
                      />
                    )
                  )}
                </div>
              </>
            )}
          </section>
        </main>

        <SiteFooter />
      </div>

      <Dock
        invite={board?.invite}
        onRank={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          window.setTimeout(() => document.getElementById("github-input")?.focus({ preventScroll: true }), 400);
        }}
        onRules={() => setHowOpen(true)}
      />

      <HowItWorks open={howItWorks} onOpenChange={setHowOpen} weights={board?.weights} />
    </div>
  );
};

export default Index;
