import { useRef, useState } from "react";
import { StarIcon } from "@solar-icons/react/linear";
import { StarIcon as FilledStarIcon } from "@solar-icons/react/bold";
import type { PublicRepository } from "@shared/types";
import type { RepositoryStar } from "@shared/repository-stars";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TextureButton } from "@/components/ui/texture-button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCount, formatFull } from "@/lib/format";

export function RepositoryStarButton({ repo, status, connected, available, disabled, pending, onStar }: {
  repo: PublicRepository;
  status?: RepositoryStar;
  connected: boolean;
  available: boolean;
  disabled: boolean;
  pending: boolean;
  onStar: (active: boolean) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [consent, setConsent] = useState(false);
  const starred = status?.starred ?? false;
  const stars = status?.stars ?? repo.stars;
  const Icon = starred ? FilledStarIcon : StarIcon;
  return <>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={button}
          type="button"
          aria-label={`${starred ? "Unstar" : "Star"} ${repo.fullName} on GitHub`}
          aria-pressed={connected ? starred : undefined}
          disabled={disabled || !available || pending}
          aria-busy={pending || undefined}
          onClick={() => connected ? onStar(!starred) : setConsent(true)}
          className="touch-target inline-flex min-h-8 items-center gap-1.5 rounded text-xs transition-colors hover:text-foreground aria-pressed:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Spinner size={14} /> : <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
          <span aria-hidden="true">{starred ? "Starred" : "Star"}</span>
          <span className="tabular text-t3" aria-label={`${formatFull(stars)} GitHub stars`}>{formatCount(stars)}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{!available ? "GitHub sign-in is being set up." : starred ? "Remove your GitHub star" : "Star this repository on GitHub"}</TooltipContent>
    </Tooltip>
    <Dialog open={consent} onOpenChange={setConsent}>
      <DialogContent onCloseAutoFocus={(event) => { event.preventDefault(); button.current?.focus(); }} className="max-w-sm rounded-[28px] border-0 bg-popover p-6 shadow-none sm:rounded-[28px]">
        <DialogTitle>Enable GitHub stars</DialogTitle>
        <DialogDescription>
          GitHub requires access to your public repositories to star from OpenCircle. This permission also allows changes to public repository code. This does not request access to private repositories. You can revoke access in GitHub settings.
        </DialogDescription>
        <p className="text-sm text-t2">After connecting, click Star on the repo you want to support.</p>
        <TextureButton asChild>
          <a href="/api/auth-start?returnTo=%2Frepositories&stars=1">Continue with GitHub</a>
        </TextureButton>
      </DialogContent>
    </Dialog>
  </>;
}
