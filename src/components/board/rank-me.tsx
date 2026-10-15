import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { CloseCircleIcon, CupStarIcon, InfoCircleIcon } from "@solar-icons/react/bold-duotone";
import { DEFAULT_WEIGHTS } from "@shared/ranking";
import { DEFAULT_INVITE_NOTE, DEFAULT_INVITE_URL } from "@shared/brand";
import type { Board, InviteConfig, PublicMember } from "@shared/types";
import { parseGithubInput, parseNickname, parseWhatsappNumber } from "@shared/validation";
import { GitHubIcon, WhatsAppIcon } from "@/components/brand-icons";
import { MetalButton } from "@/components/metal-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TextureButton } from "@/components/ui/texture-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSetBoard } from "@/hooks/use-board";
import { ApiError, api } from "@/lib/api";
import { formatFull, githubAvatarUrl } from "@/lib/format";
import { writeMe } from "@/lib/identity";

type Step =
  | { kind: "idle" }
  | { kind: "details"; login: string }
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
  useEffect(() => { if (inputError) toast.error(inputError, { id: "rank-me" }); }, [inputError]);
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
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

    setStep({ kind: "details", login: parsed.value });
  }

  function reset() {
    setStep({ kind: "idle" });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const w = board?.weights ?? DEFAULT_WEIGHTS;

  return (
    <div>
      <form onSubmit={lookup} className="flex flex-col items-stretch gap-2 min-[420px]:flex-row" noValidate>
        <label htmlFor="github-input" className="sr-only">
          Your GitHub profile link or username
        </label>
        <div className="relative min-w-0 flex-1">
          <UsernameAvatar input={input} />
          <input
            ref={inputRef}
            id="github-input"
            className="field h-12 pl-12 pr-12"
            placeholder="GitHub username"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="url"
            spellCheck={false}
            enterKeyHint="go"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setStep({ kind: "idle" });
              if (inputError) setInputError(null);
            }}
            aria-invalid={inputError ? true : undefined}
          />
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onRules}
                aria-label="How ranking works"
                className="absolute right-0.5 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-t4 transition-colors hover:text-foreground"
              >
                <InfoCircleIcon size={18} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="end"
              className="max-w-[260px] rounded-2xl border-0 bg-alva-surface px-3.5 py-2.5 text-left text-xs leading-relaxed text-t2 shadow-none"
            >
              <p className="font-medium text-foreground">How ranking works</p>
              <p className="mt-1">
                {w.stars} pts per star on repos you own, {w.followers} per follower, {w.repos} per repo (up to {w.reposCap}),{" "}
                {w.activity} per public contribution from the day you join OpenCircle, and {w.upvotes} per repo upvote. Contributions keep adding up. Ties go to more stars.
              </p>
              <p className="mt-1 text-t4">Your WhatsApp number stays private.</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 min-[420px]:w-auto">
          <MetalButton type="submit" wrapperClassName="min-w-0 flex-1 min-[420px]:flex-none" className="h-12 w-full min-[420px]:w-auto" innerClassName="px-4 sm:px-5">
            <CupStarIcon size={16} aria-hidden />
            Rank me
          </MetalButton>
          <GroupButton invite={board?.invite} />
        </div>
      </form>


      <AnimatePresence mode="wait" initial={false}>
        {step.kind === "details" && (
          <motion.div key={`details-${step.login}`} {...reveal} className="overflow-hidden">
            <RegistrationCard
              login={step.login}
              board={board}
              onClose={reset}
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

function GroupButton({ invite }: { invite?: InviteConfig }) {
  const group = invite ?? { url: DEFAULT_INVITE_URL, open: true, note: DEFAULT_INVITE_NOTE };
  const icon = <WhatsAppIcon className="size-5" />;
  if (!group.open) {
    return (
      <MetalButton type="button" aria-label="Join the group" wrapperClassName="size-12" className="size-12" innerClassName="size-full p-0" onClick={() => toast(group.note || DEFAULT_INVITE_NOTE)}>
        {icon}
      </MetalButton>
    );
  }
  return (
    <MetalButton asChild aria-label="Join the group" wrapperClassName="size-12" className="size-12" innerClassName="size-full p-0">
      <a href={group.url} target="_blank" rel="noopener noreferrer">{icon}</a>
    </MetalButton>
  );
}

function UsernameAvatar({ input }: { input: string }) {
  const parsed = parseGithubInput(input);
  const login = parsed.ok ? parsed.value : "";
  const [readyLogin, setReadyLogin] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setReadyLogin(login), 400);
    return () => clearTimeout(timer);
  }, [login]);

  return (
    <Avatar className="pointer-events-none absolute left-3 top-1/2 size-6 -translate-y-1/2">
      {login && login === readyLogin && <AvatarImage src={githubAvatarUrl(login)} alt={`GitHub profile photo for ${login}`} referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-transparent text-t3"><GitHubIcon className="size-4" /></AvatarFallback>
    </Avatar>
  );
}

function RegistrationCard({
  login,
  board,
  onClose,
  onJoined,
}: {
  login: string;
  board?: Board;
  onClose: () => void;
  onJoined: (member: PublicMember) => void;
}) {
  return (
    <div className="surface relative mt-3 rounded-[28px] p-4 text-left sm:p-5">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 flex size-11 items-center justify-center rounded-full text-t4 transition-colors hover:text-foreground"
      >
        <CloseCircleIcon size={20} aria-hidden />
      </button>
      <div className="flex items-center gap-3 pr-9">
        <Avatar className="size-10 shrink-0">
          <AvatarImage src={githubAvatarUrl(login)} alt={`GitHub profile photo for ${login}`} referrerPolicy="no-referrer" />
          <AvatarFallback className="bg-alva-card text-xs">{login.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">Join the board</p>
          <p className="truncate text-xs text-t3">github.com/{login}</p>
        </div>
      </div>

      <RegisterForm login={login} board={board} onJoined={onJoined} />
    </div>
  );
}

function RegisterForm({ login, board, onJoined }: { login: string; board?: Board; onJoined: (member: PublicMember) => void }) {
  const setBoard = useSetBoard();
  const [nickname, setNickname] = useState(login.slice(0, 24));
  const [whatsapp, setWhatsapp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);
  useEffect(() => { if (error) toast.error(error, { id: "register" }); }, [error]);
  const [needsJoin, setNeedsJoin] = useState(false);
  const ids = { nickname: useId(), whatsapp: useId(), error: useId(), hint: useId() };

  const register = useMutation({ mutationFn: api.register });
  const invite = board?.invite ?? { url: DEFAULT_INVITE_URL, open: true, note: DEFAULT_INVITE_NOTE };

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
    setNeedsJoin(false);

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
      setNeedsJoin(err instanceof ApiError && err.code === "whatsapp_not_member");
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2" noValidate>
      <div className="grid grid-cols-2 gap-2">
      <label htmlFor={ids.nickname} className="sr-only">
        Nickname
      </label>
      <input
        id={ids.nickname}
        className="field min-w-0"
        placeholder="Nickname"
        value={nickname}
        maxLength={24}
        autoComplete="nickname"
        disabled={register.isPending}
        aria-invalid={errorField === "nickname" || undefined}
        onChange={(e) => setNickname(e.target.value)}
      />

      <label htmlFor={ids.whatsapp} className="sr-only">
        WhatsApp number used in the group
      </label>
        <input
          id={ids.whatsapp}
          className="field min-w-0 tabular"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="e.g. +234 803 123 4567"
          value={whatsapp}
          disabled={register.isPending}
          aria-invalid={errorField === "whatsapp" || undefined}
          aria-describedby={ids.hint}
          onChange={(e) => {
            setWhatsapp(e.target.value);
            setNeedsJoin(false);
            if (errorField === "whatsapp") {
              setError(null);
              setErrorField(null);
            }
          }}
        />
      </div>
      <p id={ids.hint} className="px-4 text-xs leading-relaxed text-t3">Use your WhatsApp group number with its country code (e.g. +234). We check membership before ranking. Your number stays private. <Link to="/participation" className="text-foreground underline underline-offset-4">Connect your account and give feedback.</Link></p>


      {needsJoin && (
        <div className="space-y-2 px-4 py-2">
          {invite.open ? (
            <>
              <p className="text-sm text-t3">Join using {parseWhatsappNumber(whatsapp).value}, then check again. If joining needs approval, wait until an admin lets you in.</p>
              <a href={invite.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-foreground underline underline-offset-4">Join the WhatsApp group</a>
            </>
          ) : (
            <p className="text-sm text-t3">{invite.note || "The invite is paused. Ask an organiser to add your number."}</p>
          )}
        </div>
      )}

      <MetalButton type="submit" loading={register.isPending} wrapperClassName="w-full" className="min-h-11" innerClassName="whitespace-normal px-3 text-center">
        {register.isPending ? "Checking membership and ranking…" : needsJoin ? "Check again" : "Join the board"}
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
    <div className="surface mt-3 grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-[28px] p-3 text-left sm:flex sm:gap-3 sm:rounded-full sm:p-2.5 sm:pr-3">
      <Avatar className="size-10 shrink-0">
        <AvatarImage src={member.avatarUrl} alt="" />
        <AvatarFallback className="bg-alva-card text-xs">{member.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-foreground [overflow-wrap:anywhere] sm:truncate">
          {joined ? "You're in." : isMe ? "That's you." : `${member.nickname} is already on the board.`}
        </p>
        <p className="text-xs text-t3">
          {joined
            ? `#${member.rank} right now. Keep contributing to climb.`
            : `#${member.rank} · ${formatFull(member.score)} pts`}
        </p>
      </div>
      <div className="col-span-2 flex shrink-0 items-center justify-end gap-1.5">
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
