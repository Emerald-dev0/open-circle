import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { CloseCircleIcon, CupStarIcon, InfoCircleIcon } from "@solar-icons/react/bold-duotone";
import { DEFAULT_WEIGHTS } from "@shared/ranking";
import { projectedRank } from "@shared/ranking";
import type { Board, Preview, PublicMember } from "@shared/types";
import { parseGithubInput, parseNickname, parseWhatsappNumber } from "@shared/validation";
import { UserRoundedIcon } from "@solar-icons/react/bold-duotone";
import { MetalButton } from "@/components/metal-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextureButton } from "@/components/ui/texture-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSetBoard } from "@/hooks/use-board";
import { ApiError, api } from "@/lib/api";
import { formatFull } from "@/lib/format";
import { writeMe } from "@/lib/identity";

type Step =
  | { kind: "idle" }
  | { kind: "preview"; preview: Preview }
  | { kind: "listed"; member: PublicMember }
  | { kind: "joined"; member: PublicMember };

const reveal = {
  initial: { opacity: 0, y: 8, height: 0 },
  animate: { opacity: 1, y: 0, height: "auto" },
  exit: { opacity: 0, y: -4, height: 0 },
  transition: { type: "spring", stiffness: 320, damping: 32 },
} as const;

function findMember(board: Board | undefined, login: string) {
  const id = login.toLowerCase();
  return board?.members.find((m) => m.login.toLowerCase() === id);
}

interface Props {
  board?: Board;
  me: string | null;
  /** Scroll to a member's row and flash it. */
  onLocate: (login: string) => void;
  onJoined: (login: string) => void;
  /** Opens the full ranking explainer (tap target for phones, which can't hover). */
  onRules: () => void;
}

export function RankMe({ board, me, onLocate, onJoined, onRules }: Props) {
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const preview = useMutation({ mutationFn: api.preview });

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    if (preview.isPending) return;
    const parsed = parseGithubInput(input);
    if (!parsed.ok) {
      setInputError(parsed.error);
      return;
    }
    setInputError(null);
    // Drops the phone keyboard so the result is visible; a focused input also
    // pins the page and cancels the scroll to your row.
    inputRef.current?.blur();

    const listed = findMember(board, parsed.value);
    if (listed) {
      setStep({ kind: "listed", member: listed });
      onLocate(listed.login);
      return;
    }

    try {
      const result = await preview.mutateAsync(parsed.value);
      const nowListed = findMember(board, result.profile.login);
      setStep(nowListed ? { kind: "listed", member: nowListed } : { kind: "preview", preview: result });
    } catch (err) {
      setInputError(err instanceof ApiError ? err.message : "Couldn't reach GitHub. Try again.");
    }
  }

  function reset() {
    setStep({ kind: "idle" });
    preview.reset();
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const w = board?.weights ?? DEFAULT_WEIGHTS;

  return (
    <div>
      <form onSubmit={lookup} className="flex items-stretch gap-2" noValidate>
        <label htmlFor="github-input" className="sr-only">
          Your GitHub profile link or username
        </label>
        <div className="relative min-w-0 flex-1">
          <UserRoundedIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-t4" aria-hidden />
          <input
            ref={inputRef}
            id="github-input"
            className="field h-12 pl-10 pr-11"
            placeholder="your GitHub username"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="url"
            spellCheck={false}
            enterKeyHint="go"
            value={input}
            disabled={preview.isPending}
            onChange={(e) => {
              setInput(e.target.value);
              setStep({ kind: "idle" });
              if (inputError) setInputError(null);
            }}
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? errorId : undefined}
          />
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRules}
                aria-label="How ranking works"
                className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-t4 transition-colors hover:text-foreground"
              >
                <InfoCircleIcon size={18} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="end"
              className="max-w-[260px] rounded-2xl border-0 bg-[hsl(218_29%_13%)] px-3.5 py-2.5 text-left text-xs leading-relaxed text-t2 shadow-none"
            >
              <p className="font-medium text-foreground">How ranking works</p>
              <p className="mt-1">
                {w.stars} pts per star on repos you own, {w.followers} per follower, {w.repos} per repo (up to {w.reposCap}),{" "}
                {w.activity} per public contribution in the last 30 days (up to {w.activityCap}). Ties go to more stars.
              </p>
              <p className="mt-1 text-t4">Your WhatsApp number stays private.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <MetalButton type="submit" disabled={preview.isPending} className="h-12 w-auto" innerClassName="px-4 sm:px-5">
          <CupStarIcon size={16} aria-hidden />
          {preview.isPending ? "Checking…" : "Rank me"}
        </MetalButton>
      </form>

      <AnimatePresence initial={false}>
        {inputError && (
          <motion.p key="error" {...reveal} id={errorId} role="alert" className="overflow-hidden pt-2 text-sm text-down">
            {inputError}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        {step.kind === "preview" && (
          <motion.div key={`preview-${step.preview.profile.login}`} {...reveal} className="overflow-hidden">
            <PreviewCard
              preview={step.preview}
              board={board}
              onJoined={(member) => {
                setStep({ kind: "joined", member });
                setInput("");
                onJoined(member.login);
              }}
            />
          </motion.div>
        )}
        {(step.kind === "listed" || step.kind === "joined") && (
          <motion.div key={`listed-${step.member.login}`} {...reveal} className="overflow-hidden">
            <ListedCard
              member={findMember(board, step.member.login) ?? step.member}
              joined={step.kind === "joined"}
              isMe={me === step.member.login.toLowerCase()}
              onLocate={() => onLocate(step.member.login)}
              onDismiss={reset}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PreviewCard({
  preview,
  board,
  onJoined,
}: {
  preview: Preview;
  board?: Board;
  onJoined: (member: PublicMember) => void;
}) {
  const { profile, score } = preview;
  const rank = projectedRank({ score, stars: profile.stars }, board?.members ?? []);

  return (
    <div className="surface mt-3 rounded-[28px] p-4 text-left sm:p-5">
      <div className="flex items-center gap-3">
        <Avatar className="size-11 shrink-0">
          <AvatarImage src={profile.avatarUrl} alt="" />
          <AvatarFallback className="bg-alva-card text-xs">{profile.login.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground">{profile.name || profile.login}</p>
          <p className="truncate text-xs text-t3">github.com/{profile.login}</p>
        </div>
        <p className="text-gradient shrink-0 text-[32px] font-light leading-none tracking-[-0.04em] tabular" aria-label={`You'd be number ${rank}`}>
          #{rank}
        </p>
      </div>

      <RegisterForm login={profile.login} onJoined={onJoined} />
    </div>
  );
}

function RegisterForm({ login, onJoined }: { login: string; onJoined: (member: PublicMember) => void }) {
  const setBoard = useSetBoard();
  const [nickname, setNickname] = useState(login.slice(0, 24));
  const [whatsapp, setWhatsapp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  const ids = { nickname: useId(), whatsapp: useId(), error: useId(), hint: useId() };

  const register = useMutation({ mutationFn: api.register });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (register.isPending) return;
    const nick = parseNickname(nickname);
    const phone = parseWhatsappNumber(whatsapp);
    if (!nick.ok || !phone.ok) {
      setError(nick.error ?? phone.error ?? null);
      setErrorField(!nick.ok ? "nickname" : "whatsapp");
      return;
    }
    setError(null);
    setErrorField(null);

    try {
      const result = await register.mutateAsync({ nickname: nick.value, github: login, whatsapp: phone.value });
      setBoard(result.board);
      writeMe(result.login);
      const member = findMember(result.board, result.login);
      if (member) {
        toast.success(`You're on the board at #${member.rank}.`);
        onJoined(member);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't register. Try again.");
      setErrorField(err instanceof ApiError ? err.field ?? null : null);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2" noValidate aria-describedby={error ? ids.error : undefined}>
      <label htmlFor={ids.nickname} className="sr-only">
        Nickname
      </label>
      <input
        id={ids.nickname}
        className="field"
        placeholder="Nickname"
        value={nickname}
        maxLength={24}
        autoComplete="nickname"
        disabled={register.isPending}
        aria-invalid={errorField === "nickname" || undefined}
        aria-describedby={errorField === "nickname" ? ids.error : undefined}
        onChange={(e) => setNickname(e.target.value)}
      />

      <label htmlFor={ids.whatsapp} className="sr-only">
        WhatsApp number used in the group
      </label>
      <div className="relative">
        <input
          id={ids.whatsapp}
          className="field tabular"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="WhatsApp number, e.g. +234 803 123 4567"
          value={whatsapp}
          disabled={register.isPending}
          aria-invalid={errorField === "whatsapp" || undefined}
          aria-describedby={errorField === "whatsapp" ? `${ids.hint} ${ids.error}` : ids.hint}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
      </div>
      <p id={ids.hint} className="px-4 text-[11px] leading-relaxed text-t3">Use the same number you're on in the group. Your number stays private.</p>

      {error && (
        <p id={ids.error} role="alert" className="px-4 text-xs text-down">
          {error}
        </p>
      )}

      <MetalButton type="submit" disabled={register.isPending} wrapperClassName="w-full" className="h-11">
        {register.isPending ? "Joining…" : "Join the board"}
      </MetalButton>
    </form>
  );
}

function ListedCard({
  member,
  joined,
  isMe,
  onLocate,
  onDismiss,
}: {
  member: PublicMember;
  joined: boolean;
  isMe: boolean;
  onLocate: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="surface mt-3 flex items-center gap-3 rounded-full p-2.5 pr-3 text-left">
      <Avatar className="size-10 shrink-0">
        <AvatarImage src={member.avatarUrl} alt="" />
        <AvatarFallback className="bg-alva-card text-xs">{member.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {joined ? "You're in." : isMe ? "That's you." : `${member.nickname} is already on the board.`}
        </p>
        <p className="text-xs text-t3">
          {joined
            ? `#${member.rank} right now. Ship and get starred to climb.`
            : `#${member.rank} · ${formatFull(member.score)} pts`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <TextureButton type="button" variant="secondary" size="sm" className="w-auto" onClick={onLocate}>
          Show row
        </TextureButton>
        <TextureButton type="button" variant="icon" size="icon" className="w-auto" onClick={onDismiss} aria-label="Dismiss">
          <CloseCircleIcon size={18} aria-hidden />
        </TextureButton>
      </div>
    </div>
  );
}
