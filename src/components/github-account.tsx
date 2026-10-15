import { useEffect } from "react";
import { LogoutIcon } from "@solar-icons/react/linear";
import { useIsMutating } from "@tanstack/react-query";
import { toast } from "sonner";
import { GitHubIcon } from "@/components/brand-icons";
import { TextureButton } from "@/components/ui/texture-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TOOL_VOTE_KEY, useCommunity, useGitHubSignOut } from "@/hooks/use-community";

export function GitHubAccount() {
  const community = useCommunity();
  const signOut = useGitHubSignOut();
  const voting = useIsMutating({ mutationKey: TOOL_VOTE_KEY }) > 0;
  const profile = community.data?.profile;
  const signInError = new URLSearchParams(window.location.search).has("signin");

  useEffect(() => {
    if (signInError && !profile) toast.error("GitHub sign-in didn't finish. Please try again.");
  }, [signInError, profile]);

  useEffect(() => {
    if (signOut.error) toast.error("Couldn't sign out. Please try again.");
  }, [signOut.error]);

  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      {profile ? (
        <div role="group" aria-label="GitHub account" className="flex min-w-0 max-w-full items-center gap-2 text-base text-t2">
          <span className="min-w-0 max-w-40 truncate sm:max-w-56" title={`@${profile.login}`}>@{profile.login}</span>
          <img src={profile.avatarUrl} alt="" className="size-10 shrink-0 rounded-full" width={40} height={40} />
          <TextureButton variant="icon" size="icon" className="size-10" aria-label="Sign out of GitHub" disabled={signOut.isPending || voting} onClick={() => signOut.mutate()}>
            <LogoutIcon className="size-4" aria-hidden="true" />
          </TextureButton>
        </div>
      ) : community.data?.signInAvailable ? (
        <TextureButton asChild variant="secondary" size="sm" className="h-10 w-auto" innerClassName="gap-2 px-3.5 text-xs"><a href="/api/auth-start"><GitHubIcon className="size-4" />Sign in to vote</a></TextureButton>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild><span className="inline-flex" tabIndex={0}><TextureButton variant="secondary" size="sm" className="h-10 w-auto" innerClassName="gap-2 px-3.5 text-xs" disabled><GitHubIcon className="size-4" />Sign in to vote</TextureButton></span></TooltipTrigger>
          <TooltipContent>GitHub sign-in is being set up.</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
