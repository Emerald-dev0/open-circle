import { useQuery } from "@tanstack/react-query";
import { StarIcon } from "@solar-icons/react/linear";
import { GitHubIcon } from "@/components/brand-icons";
import { TextureButton } from "@/components/ui/texture-button";
import { formatCount, formatFull } from "@/lib/format";
import { GITHUB_URL } from "@shared/seo";

function GitHubCount({ kind }: { kind: "stars" | "followers" }) {
  const { data, isPending } = useQuery({
    queryKey: ["github-community-count", kind],
    queryFn: async ({ signal }) => {
      const path = kind === "stars" ? "repos/opencirclehq/open-circle" : "users/opencirclehq";
      const response = await fetch(`https://api.github.com/${path}`, {
        signal,
        credentials: "omit",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!response.ok) throw new Error("GitHub count unavailable");
      const body = await response.json();
      const count: unknown = body[kind === "stars" ? "stargazers_count" : "followers"];
      if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
        throw new Error("Invalid GitHub count");
      }
      return count;
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const description = data === undefined
    ? `${kind === "stars" ? "Star" : "Follower"} count ${isPending ? "loading" : "unavailable"}`
    : `${formatFull(data)} ${kind}`;

  return <span id={`github-${kind}-count`} className="min-w-4 text-right tabular text-t3" title={description}>
    <span aria-hidden="true">{data === undefined ? "—" : formatCount(data)}</span>
    <span className="sr-only">{description}</span>
  </span>;
}

export function GitHubCommunityLinks() {
  return <nav aria-label="OpenCircle on GitHub" className="flex min-h-10 min-w-0 max-w-full flex-wrap items-center gap-2">
    <TextureButton asChild variant="minimal" size="sm" className="h-11 w-auto">
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="Star OpenCircle on GitHub" aria-describedby="github-stars-count">
        <StarIcon className="size-4 shrink-0" aria-hidden="true" />
        <span>Star</span>
        <GitHubCount kind="stars" />
      </a>
    </TextureButton>
    <TextureButton asChild variant="minimal" size="sm" className="h-11 w-auto">
      <a href="https://github.com/opencirclehq" target="_blank" rel="noopener noreferrer" aria-label="Follow @opencirclehq on GitHub" aria-describedby="github-followers-count">
        <GitHubIcon className="size-4 shrink-0" />
        <span>Follow @opencirclehq</span>
        <GitHubCount kind="followers" />
      </a>
    </TextureButton>
  </nav>;
}
