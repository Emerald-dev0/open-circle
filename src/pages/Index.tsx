import * as React from "react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import { RefreshIcon } from "@solar-icons/react/bold-duotone";
import type { PublicMember } from "@shared/types";
import { HowItWorks } from "@/components/board/how-it-works";
import {
  LeaderboardPodium,
  type LeaderboardEntry,
} from "@/components/board/leaderboard-podium";
import { RankMe } from "@/components/board/rank-me";
import { RankTable } from "@/components/board/rank-table";
import { RepositoryTable } from "@/components/board/repository-table";
import { JoinGroupButton } from "@/components/board/join-group-button";
import { SiteFooter } from "@/components/site-footer";
import { Dock } from "@/components/dock";
import { Skeleton } from "@/components/ui/skeleton";
import { TextureButton } from "@/components/ui/texture-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBoard } from "@/hooks/use-board";
import { formatFull, githubUrl, timeAgo } from "@/lib/format";
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
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl px-2.5 py-2.5"
        >
          <Skeleton className="h-4 w-5 bg-white/[0.06]" />
          <Skeleton className="size-8 rounded-full bg-white/[0.06]" />
          <Skeleton className="h-4 flex-1 bg-white/[0.06]" />
          <Skeleton className="h-4 w-12 bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

/** The active tab's background; slides between triggers via a shared layoutId. */
function TabPill() {
  return (
    <motion.span
      layoutId="board-tab-pill"
      className="absolute inset-0 rounded-full bg-white/[0.1]"
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
    />
  );
}

/** Fades and lifts a tab's content in as it becomes active. */
const TabPanel = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof motion.div>>(
  (props, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
      {...props}
    />
  ),
);
TabPanel.displayName = "TabPanel";

const Index = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const howItWorks = useMatch("/how-it-works") !== null;
  const repositoriesOpen =
    useMatch("/repositories") !== null ||
    new URLSearchParams(location.search).get("tab") === "repositories";
  const { data: board, isPending, isError, refetch, isRefetching } = useBoard();
  const [me, setMe] = useState<string | null>(readMe);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(Date.now);
  const flashTimer = useRef<number | undefined>(undefined);

  const members = useMemo(() => board?.members ?? [], [board]);
  const podium = useMemo(() => members.slice(0, 3).map(toEntry), [members]);
  const rest = useMemo(() => members.slice(3), [members]);
  const repositories = board?.repositories ?? [];

  // Visiting /how-it-works opens the explainer over the board.
  const setHowOpen = (open: boolean) =>
    navigate(
      open
        ? `/how-it-works${repositoriesOpen ? "?tab=repositories" : ""}`
        : repositoriesOpen
          ? "/repositories"
          : "/",
      { replace: !open },
    );

  const locate = useCallback(
    (login: string) => {
      const id = login.toLowerCase();
      navigate("/", { replace: true });
      setShowAll(true);
      window.clearTimeout(flashTimer.current);
      setFlashId(null);
      // Let the result card finish opening first; layout moving under a
      // smooth scroll cancels it. Also restarts the flash.
      flashTimer.current = window.setTimeout(() => {
        setFlashId(id);
        document
          .getElementById(`member-${id}`)
          ?.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "auto"
              : "smooth",
            block: "center",
          });
        flashTimer.current = window.setTimeout(() => setFlashId(null), 1700);
      }, 450);
    },
    [navigate],
  );

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="app-backdrop" aria-hidden />

      <div className="relative z-10">
        <main className="mx-auto max-w-3xl px-4 pb-6">
          <section
            className="flex flex-col items-center pt-20 text-center sm:pt-28"
            aria-labelledby="pitch"
          >
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
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <JoinGroupButton invite={board?.invite} size="sm" metal={false} />
              <span className="text-xs text-t3">Open Source Circle</span>
            </div>
          </section>

          <section
            id="board"
            className="mt-12 scroll-mt-8 sm:mt-16"
            aria-labelledby="board-title"
          >
            <h2 id="board-title" className="sr-only">
              Community leaderboard
            </h2>
            <Tabs
              value={repositoriesOpen ? "repositories" : "developers"}
              onValueChange={(value) => {
                setShowAll(false);
                navigate(value === "repositories" ? "/repositories" : "/");
              }}
            >
              <div className="mb-8 flex flex-col items-center gap-3">
                <TabsList aria-label="Leaderboard type">
                  <TabsTrigger value="developers">
                    {!repositoriesOpen && <TabPill />}
                    <span className="relative">Developers</span>{" "}
                    <span className="relative ml-2 text-xs tabular text-t3">
                      {formatFull(members.length)}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="repositories">
                    {repositoriesOpen && <TabPill />}
                    <span className="relative">Repositories</span>{" "}
                    <span className="relative ml-2 text-xs tabular text-t3">
                      {formatFull(repositories.length)}
                    </span>
                  </TabsTrigger>
                </TabsList>
                <p
                  className="flex items-center gap-1.5 text-[11px] text-t3"
                  role="status"
                >
                  <span
                    className={
                      isError || board?.statsDelayed
                        ? "size-1.5 rounded-full bg-[hsl(var(--warn))]"
                        : "size-1.5 rounded-full bg-[hsl(var(--up))]"
                    }
                    aria-hidden
                  />
                  {isError
                    ? board
                      ? "Reconnecting · showing last rankings"
                      : "Couldn't connect to the board"
                    : board?.statsDelayed
                      ? "GitHub updates delayed"
                      : isPending
                        ? "Loading rankings…"
                        : `Live · GitHub updated ${timeAgo(board!.refreshedAt, now)}`}
                </p>
              </div>

              {isError && !board ? (
                <div className="surface-quiet flex flex-col items-center gap-3 rounded-2xl px-4 py-8 text-center">
                  <p className="text-sm text-t2">Couldn't load the board.</p>
                  <TextureButton
                    variant="minimal"
                    size="sm"
                    className="w-auto"
                    onClick={() => refetch()}
                    disabled={isRefetching}
                  >
                    <RefreshIcon size={14} aria-hidden />
                    {isRefetching ? "Retrying…" : "Try again"}
                  </TextureButton>
                </div>
              ) : (
                <TabsContent value="developers" asChild>
                <TabPanel>
                  <LeaderboardPodium
                    entries={podium}
                    currentUserId={me}
                    flashId={flashId}
                    className={isPending ? "animate-pulse" : undefined}
                  />

                  {!isPending && members.length === 0 && (
                    <p className="mt-4 text-center text-sm text-t3">
                      Nobody's on the board yet. Paste your GitHub above and
                      take #1.
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
                </TabPanel>
                </TabsContent>
              )}
              <TabsContent value="repositories" asChild>
                <TabPanel>
                <p className="mb-5 text-center text-xs text-t3">
                  Public projects from the circle, ranked by stars.
                </p>
                {isPending ? (
                  <TableSkeleton />
                ) : repositories.length > 0 ? (
                  <RepositoryTable
                    repositories={repositories}
                    limit={showAll ? Number.POSITIVE_INFINITY : TABLE_LIMIT}
                    onShowAll={() => setShowAll(true)}
                  />
                ) : (
                  !isError && (
                    <div className="surface-quiet rounded-[28px] px-5 py-8 text-center">
                      <p className="text-sm text-t2">No repositories yet.</p>
                      <p className="mt-2 text-xs text-t3">
                        Join the board and your public projects will appear
                        here.
                      </p>
                    </div>
                  )
                )}
                </TabPanel>
              </TabsContent>
            </Tabs>
          </section>
        </main>

        <SiteFooter />
      </div>

      <Dock
        invite={board?.invite}
        onRank={() => {
          window.scrollTo({ top: 0, behavior: "smooth" });
          window.setTimeout(
            () =>
              document
                .getElementById("github-input")
                ?.focus({ preventScroll: true }),
            400,
          );
        }}
        onRules={() => setHowOpen(true)}
      />

      <HowItWorks
        open={howItWorks}
        onOpenChange={setHowOpen}
        weights={board?.weights}
      />
    </div>
  );
};

export default Index;
