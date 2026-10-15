import * as React from "react";
import GitHubButton from "react-github-btn";
import { MetalText } from "metal-fx";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useMatch, useNavigate } from "react-router-dom";
import { FolderWithFilesIcon, RefreshIcon, UsersGroupRoundedIcon } from "@solar-icons/react/bold-duotone";
import { GitPullRequestIcon } from "@solar-icons/react/linear";
import type { PublicMember, PublicRepository } from "@shared/types";
import { HowItWorks } from "@/components/board/how-it-works";
import {
  LeaderboardPodium,
  type LeaderboardEntry,
} from "@/components/board/leaderboard-podium";
import { RankMe } from "@/components/board/rank-me";
import { RankTable } from "@/components/board/rank-table";
import { RepositoryExplorer } from "@/components/board/repository-explorer";
import { ToolsDirectory } from "@/components/board/tools-directory";
import { GitHubAccount } from "@/components/github-account";
import { SiteFooter } from "@/components/site-footer";
import { Dock } from "@/components/dock";
import { BoardSkeleton } from "@/components/site-skeleton";
import { TextureButton } from "@/components/ui/texture-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBoard } from "@/hooks/use-board";
import { useCommunity } from "@/hooks/use-community";
import { usePageMeta } from "@/hooks/use-page-meta";
import { pageFor } from "@shared/seo";
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
    activity: m.activity,
    upvotes: m.upvotes,
    href: githubUrl(m.login),
    avatarUrl: m.avatarUrl || undefined,
    seed: id,
  };
}

function repoEntry(r: PublicRepository): LeaderboardEntry {
  return {
    id: r.id,
    name: r.name,
    points: r.stars,
    handle: r.ownerLogin,
    stars: r.stars,
    href: r.url,
    avatarUrl: r.ownerAvatarUrl || undefined,
    seed: r.ownerLogin.toLowerCase(),
    secondary: { icon: <GitPullRequestIcon size={11} aria-hidden />, value: r.forks, label: "forks" },
  };
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-white/[0.06] text-t3">{icon}</span>
      <p className="mt-3 text-sm font-medium text-t2">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-t4">{body}</p>
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
  usePageMeta();
  const page = pageFor(location.pathname);
  const howItWorks = useMatch("/how-it-works") !== null;
  const repositoriesOpen =
    useMatch("/repositories") !== null ||
    new URLSearchParams(location.search).get("tab") === "repositories";
  const toolsOpen =
    useMatch("/tools") !== null ||
    new URLSearchParams(location.search).get("tab") === "tools";
  const activeTab = toolsOpen ? "tools" : repositoriesOpen ? "repositories" : "developers";
  const { data: board, isPending, isError, refetch, isRefetching } = useBoard();
  const { data: community } = useCommunity();
  const [me, setMe] = useState<string | null>(readMe);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(Date.now);
  const flashTimer = useRef<number | undefined>(undefined);

  const members = useMemo(() => board?.members ?? [], [board]);
  const currentMember = members.find((member) => member.login.toLowerCase() === me);
  const podium = useMemo(() => members.slice(0, 3).map(toEntry), [members]);
  const rest = useMemo(() => members.slice(3), [members]);
  const repoPodium = useMemo(() => (board?.repositories ?? []).slice(0, 3).map(repoEntry), [board]);
  const repositories = board?.repositories ?? [];
  const toolCount = community?.tools.length ?? 0;

  // Visiting /how-it-works opens the explainer over the board.
  const setHowOpen = (open: boolean) =>
    navigate(
      open
        ? `/how-it-works${activeTab !== "developers" ? `?tab=${activeTab}` : ""}`
        : activeTab === "developers" ? "/" : `/${activeTab}`,
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

  useEffect(() => {
    if (location.pathname !== "/") return;
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "repositories" || tab === "tools") navigate(`/${tab}`, { replace: true });
  }, [location.pathname, location.search, navigate]);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <div className="app-backdrop" aria-hidden />

      <div className="relative z-10">
        <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[calc(1rem+env(safe-area-inset-top))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-[calc(1.5rem+env(safe-area-inset-top))]">
          <div className="flex min-h-10 min-w-0 max-w-full flex-wrap items-center gap-2">
            <GitHubButton
              href="https://github.com/opencirclehq/open-circle"
              data-color-scheme="dark"
              data-icon="octicon-star"
              data-size="large"
              data-show-count="true"
              aria-label="Star OpenCircle on GitHub"
            >
              Star
            </GitHubButton>
            <GitHubButton
              href="https://github.com/opencirclehq"
              data-color-scheme="dark"
              data-size="large"
              data-show-count="true"
              aria-label="Follow @opencirclehq on GitHub"
            >
              Follow @opencirclehq
            </GitHubButton>
          </div>
          <div className="ml-auto min-w-0 max-w-full"><GitHubAccount /></div>
        </header>

        <main className="page-container pb-6">
          <section
            className="flex flex-col items-center pt-6 text-center sm:pt-12"
            aria-labelledby="pitch"
          >
            <span className="surface-quiet inline-flex items-center rounded-full px-3.5 py-1.5">
              <MetalText font="500 12px/1 Aspekta, ui-sans-serif, system-ui, sans-serif" color="#E2E2E2" theme="dark">
                Open Source Circle
              </MetalText>
            </span>
            <h1
              id="pitch"
              className="text-gradient mt-3 max-w-full text-balance text-[30px] font-[350] leading-[1.05] tracking-[-0.035em] min-[400px]:text-[34px] sm:mt-4 sm:text-[64px] sm:leading-[1.02] sm:tracking-[-0.04em]"
            >
              {currentMember ? "You're on the board." : "Paste your username."}
              <br />
              {currentMember ? `Ranked #${formatFull(currentMember.rank)}.` : "Take your place."}
            </h1>
            {page && <p className="mx-auto mt-3 max-w-md text-balance text-sm leading-relaxed text-t3 sm:mt-4">{page.summary}</p>}

            <div className="mt-6 w-full max-w-xl sm:mt-10">
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

          <section
            id="board"
            className="mt-8 scroll-mt-8 sm:mt-10"
            aria-labelledby="board-title"
          >
            <h2 id="board-title" className="sr-only">
              {activeTab === "tools" ? "Developer tools" : activeTab === "repositories" ? "Repository ranking" : "Developer leaderboard"}
            </h2>
            <Tabs
              value={activeTab}
              onValueChange={(value) => {
                setShowAll(false);
                navigate(value === "developers" ? "/" : `/${value}`);
              }}
            >
              <div className="mb-5 flex flex-col items-center gap-2 sm:mb-8 sm:gap-3">
                <TabsList aria-label="Leaderboard type" className="grid h-auto w-full grid-cols-[1fr_1.15fr_0.7fr] min-[480px]:inline-flex min-[480px]:w-auto">
                  <TabsTrigger value="developers" className="min-h-11 min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
                    {activeTab === "developers" && <TabPill />}
                    <span className="relative">Developers</span>{" "}
                    <span className="relative ml-2 hidden text-xs tabular text-t3 min-[480px]:inline">
                      {formatFull(members.length)}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="repositories" className="min-h-11 min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
                    {activeTab === "repositories" && <TabPill />}
                    <span className="relative">Repositories</span>{" "}
                    <span className="relative ml-2 hidden text-xs tabular text-t3 min-[480px]:inline">
                      {formatFull(repositories.length)}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="tools" className="min-h-11 min-w-0 px-2 text-xs sm:px-3 sm:text-sm">
                    {activeTab === "tools" && <TabPill />}
                    <span className="relative">Tools</span>{" "}
                    <span className="relative ml-2 hidden text-xs tabular text-t3 min-[480px]:inline">
                      {formatFull(toolCount)}
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {isError && !board && !toolsOpen ? (
                <div className="surface-quiet flex flex-col items-center gap-3 rounded-2xl px-4 py-8 text-center">
                  <p className="text-sm text-t2">Couldn't load the board.</p>
                  <TextureButton
                    variant="minimal"
                    size="sm"
                    className="w-auto"
                    onClick={() => refetch()}
                    loading={isRefetching}
                  >
                    {!isRefetching && <RefreshIcon size={14} aria-hidden />}
                    {isRefetching ? "Retrying…" : "Try again"}
                  </TextureButton>
                </div>
              ) : (
                <TabsContent value="developers" asChild>
                <TabPanel>
                  {isPending ? <BoardSkeleton /> : <LeaderboardPodium
                    entries={podium}
                    currentUserId={me}
                    flashId={flashId}
                  />}

                  {!isPending && members.length === 0 && (
                    <EmptyState
                      icon={<UsersGroupRoundedIcon size={22} aria-hidden />}
                      title="Nobody's on the board yet"
                      body="Paste your GitHub username above and take #1."
                    />
                  )}

                  {!isPending && members.length > 0 && <div className="mt-4 sm:mt-6">
                    <RankTable
                      members={rest}
                      meId={me}
                      flashId={flashId}
                      limit={showAll ? undefined : TABLE_LIMIT}
                      onShowAll={() => setShowAll(true)}
                    />
                  </div>}
                </TabPanel>
                </TabsContent>
              )}
              <TabsContent value="repositories" asChild>
                <TabPanel>
                {isPending ? (
                  <BoardSkeleton repositories />
                ) : repositories.length > 0 ? (
                  <>
                    <LeaderboardPodium entries={repoPodium} unit="stars" ariaLabel="Top three repositories" />
                    <div className="mt-4 sm:mt-6">
                      <RepositoryExplorer repositories={repositories} />
                    </div>
                  </>
                ) : (
                  !isError && (
                    <EmptyState
                      icon={<FolderWithFilesIcon size={22} aria-hidden />}
                      title="No repositories yet"
                      body="Join the board and your public projects show up here."
                    />
                  )
                )}
                </TabPanel>
              </TabsContent>
              <TabsContent value="tools">
                <ToolsDirectory />
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
