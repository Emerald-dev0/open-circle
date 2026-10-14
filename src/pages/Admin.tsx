import type * as React from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CopyIcon, EyeClosedIcon, EyeIcon, LockIcon, TrashBinMinimalisticIcon } from "@solar-icons/react/bold-duotone";
import { MetalText } from "metal-fx";
import { BRAND_NAME } from "@shared/brand";
import type { AdminAction, AdminConfig, AdminMember, AdminState, Weights } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { MetalButton } from "@/components/metal-button";
import { TextureButton } from "@/components/ui/texture-button";
import { ApiError, api } from "@/lib/api";
import { formatFull, githubUrl, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const SECRET_KEY = "devechleon:admin";

function readSecret() {
  try {
    return sessionStorage.getItem(SECRET_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeSecret(secret: string) {
  try {
    if (secret) sessionStorage.setItem(SECRET_KEY, secret);
    else sessionStorage.removeItem(SECRET_KEY);
  } catch {
    // The secret just won't survive a reload.
  }
}

/** Keeps admin out of search results; the server sends X-Robots-Tag too. */
function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const title = document.title;
    document.title = `Admin · ${BRAND_NAME}`;
    return () => {
      meta.remove();
      document.title = title;
    };
  }, []);
}

const Admin = () => {
  useNoIndex();
  const [secret, setSecret] = useState(readSecret);

  return (
    <div className="relative min-h-dvh">
      <div className="app-backdrop" aria-hidden />
      <div className="relative z-10 mx-auto max-w-3xl px-4 pb-16">
        <header className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2 rounded-lg">
            <MetalText font="650 15px/1 Aspekta, ui-sans-serif, system-ui, sans-serif" color="#F4F7FB" theme="dark">
              {BRAND_NAME}
            </MetalText>
            <span className="text-sm text-t4">admin</span>
          </Link>
          {secret && (
            <TextureButton
              variant="minimal"
              size="sm"
              className="w-auto"
              onClick={() => {
                writeSecret("");
                setSecret("");
              }}
            >
              Lock
            </TextureButton>
          )}
        </header>
        {secret ? (
          <Dashboard
            secret={secret}
            onUnauthorized={() => {
              writeSecret("");
              setSecret("");
            }}
          />
        ) : (
          <Unlock
            onUnlock={(s) => {
              writeSecret(s);
              setSecret(s);
            }}
          />
        )}
      </div>
    </div>
  );
};

function Unlock({ onUnlock }: { onUnlock: (secret: string) => void }) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  return (
    <form
      className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center text-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onUnlock(value.trim());
      }}
    >
      <LockIcon size={28} className="text-t3" aria-hidden />
      <h1 className="mt-3 text-xl font-medium tracking-tight">Admin</h1>
      <div className="mt-6 w-full max-w-xs space-y-2">
        <label htmlFor="admin-secret" className="sr-only">
          Admin secret
        </label>
        <div className="relative">
          <input
            id="admin-secret"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Admin secret"
            className="field pr-11"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide secret" : "Show secret"}
            aria-pressed={visible}
            className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-t4 transition-colors hover:text-foreground"
          >
            {visible ? <EyeClosedIcon size={18} aria-hidden /> : <EyeIcon size={18} aria-hidden />}
          </button>
        </div>
        <TextureButton type="submit" className="h-11">Unlock</TextureButton>
      </div>
    </form>
  );
}

function Dashboard({ secret, onUnauthorized }: { secret: string; onUnauthorized: () => void }) {
  const queryClient = useQueryClient();
  const key = ["admin", secret];
  const state = useQuery({ queryKey: key, queryFn: () => api.adminState(secret), retry: false });
  const action = useMutation({
    mutationFn: (a: AdminAction) => api.adminAction(secret, a),
    onSuccess: (next: AdminState) => {
      queryClient.setQueryData(key, next);
      queryClient.invalidateQueries({ queryKey: ["board"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "That didn't work."),
  });

  const error = state.error;
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      toast.error(error.message);
      onUnauthorized();
    }
  }, [error, onUnauthorized]);

  if (state.isPending) return <p className="mt-10 text-sm text-t3">Loading…</p>;
  if (state.isError || !state.data) {
    return (
      <p className="surface-quiet mt-10 rounded-2xl p-5 text-sm text-t2">
        {state.error instanceof ApiError ? state.error.message : "Couldn't load admin data."}
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-4 sm:space-y-6">
      <Settings
        config={state.data.config}
        saving={action.isPending}
        onSave={(config) => action.mutate({ action: "config", config }, { onSuccess: () => toast.success("Saved.") })}
      />
      <Members
        members={state.data.members}
        busy={action.isPending}
        onAction={(a) => action.mutate(a)}
      />
    </div>
  );
}

const WEIGHT_FIELDS: { key: keyof Weights; label: string }[] = [
  { key: "stars", label: "Per star" },
  { key: "followers", label: "Per follower" },
  { key: "repos", label: "Per repo" },
  { key: "reposCap", label: "Repo cap" },
  { key: "activity", label: "Per contribution (30 days)" },
  { key: "activityCap", label: "Contribution cap" },
];

/** Outer frame holding a header card and a body card, like a status console. */
function Panel({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[30px] bg-white/[0.06] p-1.5 sm:rounded-[34px] sm:p-2">
      <div className="rounded-[24px] bg-[hsl(218_31%_7%)] px-4 py-4 sm:rounded-[28px] sm:px-6 sm:py-5">{header}</div>
      <div className="mt-1.5 rounded-[24px] bg-[hsl(218_31%_7%)] px-4 sm:mt-2 sm:rounded-[28px] sm:px-6">{children}</div>
    </section>
  );
}

function PanelHeader({ title, subtitle, chip }: { title: string; subtitle?: string; chip?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-medium tracking-tight sm:text-xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-t3">{subtitle}</p>}
      </div>
      {chip}
    </div>
  );
}

function Chip({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const dot = tone === "ok" ? "bg-[hsl(var(--up))]" : tone === "warn" ? "bg-[hsl(var(--warn))]" : "bg-t4";
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-t2">
      <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
      {children}
    </span>
  );
}

/** One key/value line. Stacks on phones when the value is a wide control. */
function Row({ label, htmlFor, stack, children }: { label: string; htmlFor?: string; stack?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-2 border-b border-white/[0.06] py-3.5 last:border-0 sm:items-center sm:gap-6",
        stack ? "flex-col sm:flex-row" : "items-center justify-between",
      )}
    >
      <label htmlFor={htmlFor} className="shrink-0 text-[13px] text-t3 sm:w-48">
        {label}
      </label>
      <div className={cn("min-w-0", stack ? "w-full sm:flex-1" : "flex justify-end")}>{children}</div>
    </div>
  );
}

function Settings({ config, saving, onSave }: { config: AdminConfig; saving: boolean; onSave: (c: AdminConfig) => void }) {
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const setInvite = (patch: Partial<AdminConfig["invite"]>) => setDraft({ ...draft, invite: { ...draft.invite, ...patch } });

  return (
    <Panel
      header={
        <PanelHeader
          title="Settings"
          subtitle="Group invite and ranking weights"
          chip={<Chip tone={config.invite.open ? "ok" : "warn"}>{config.invite.open ? "Invite live" : "Invite paused"}</Chip>}
        />
      }
    >
      <Row label="Invite link" htmlFor="invite-url" stack>
        <div className="relative">
          <input
            id="invite-url"
            className="field h-10 pr-11 text-sm"
            value={draft.invite.url}
            onChange={(e) => setInvite({ url: e.target.value })}
          />
          <button
            type="button"
            aria-label="Copy invite link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(draft.invite.url);
                toast.success("Invite link copied.");
              } catch {
                toast.error("Couldn't copy. Select the link and copy it manually.");
              }
            }}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-t4 transition-colors hover:text-foreground"
          >
            <CopyIcon size={16} aria-hidden />
          </button>
        </div>
      </Row>
      <Row label="Invite open" htmlFor="invite-open">
        <Switch id="invite-open" checked={draft.invite.open} onCheckedChange={(open) => setInvite({ open })} />
      </Row>
      <Row label="Paused message" htmlFor="invite-note" stack>
        <textarea
          id="invite-note"
          rows={3}
          maxLength={200}
          className="field h-auto resize-none rounded-[20px] py-2.5 text-sm"
          value={draft.invite.note}
          onChange={(e) => setInvite({ note: e.target.value })}
        />
      </Row>
      {WEIGHT_FIELDS.map(({ key, label }) => (
        <Row key={key} label={label} htmlFor={`w-${key}`}>
          <input
            id={`w-${key}`}
            type="number"
            min={0}
            max={10000}
            step="any"
            className="field h-9 w-24 text-right text-sm tabular"
            value={draft.weights[key]}
            onChange={(e) => setDraft({ ...draft, weights: { ...draft.weights, [key]: Number(e.target.value) } })}
          />
        </Row>
      ))}
      <div className="flex justify-end gap-2 py-4">
        {dirty && (
          <MetalButton variant="minimal" className="h-10 w-auto" innerClassName="px-5" onClick={() => setDraft(config)}>
            Cancel
          </MetalButton>
        )}
        <MetalButton className="h-10 w-auto" innerClassName="px-6" disabled={saving || !dirty} onClick={() => onSave(draft)}>
          {saving ? "Saving…" : "Save"}
        </MetalButton>
      </div>
    </Panel>
  );
}

function Members({
  members,
  busy,
  onAction,
}: {
  members: AdminMember[];
  busy: boolean;
  onAction: (a: AdminAction) => void;
}) {
  const now = Date.now();
  const hidden = members.filter((m) => m.hidden).length;
  return (
    <Panel
      header={
        <PanelHeader
          title="Members"
          subtitle={`${formatFull(members.length)} registered`}
          chip={hidden > 0 ? <Chip tone="warn">{hidden} hidden</Chip> : <Chip tone="ok">All visible</Chip>}
        />
      }
    >
      {members.length === 0 ? (
        <p className="py-8 text-center text-sm text-t3">No one has registered yet.</p>
      ) : (
        <ul>
          {members.map((m) => (
            <li
              key={m.login}
              className={cn("flex items-center gap-3 border-b border-white/[0.06] py-3 last:border-0", m.hidden && "opacity-55")}
            >
              <span className="w-6 shrink-0 font-mono text-xs tabular text-t4">{m.rank || "—"}</span>
              <Avatar className="size-9 shrink-0">
                <AvatarImage src={m.avatarUrl} alt="" />
                <AvatarFallback className="bg-alva-card text-[10px]">{m.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  <span className="truncate">{m.nickname}</span>
                  {m.hidden && <span className="shrink-0 text-[11px] font-normal text-warn">hidden</span>}
                </p>
                <p className="truncate font-mono text-[11px] text-t4">
                  <a href={githubUrl(m.login)} target="_blank" rel="noopener noreferrer" className="hover:text-t2">
                    @{m.login}
                  </a>
                  <span className="hidden sm:inline">
                    {" · "}
                    {m.whatsapp} · {timeAgo(m.createdAt, now)}
                  </span>
                </p>
                <p className="truncate font-mono text-[11px] text-t4 sm:hidden">{m.whatsapp}</p>
              </div>
              <span className="hidden shrink-0 text-right text-sm tabular text-t2 sm:block">{formatFull(m.score)}</span>
              <div className="flex shrink-0 gap-1">
                <TextureButton
                  variant="icon"
                  size="icon"
                  className="w-auto"
                  disabled={busy}
                  aria-label={m.hidden ? `Show ${m.nickname}` : `Hide ${m.nickname}`}
                  onClick={() => onAction({ action: m.hidden ? "unhide" : "hide", login: m.login })}
                >
                  {m.hidden ? <EyeIcon size={18} aria-hidden /> : <EyeClosedIcon size={18} aria-hidden />}
                </TextureButton>
                <TextureButton
                  variant="icon"
                  size="icon"
                  className="w-auto"
                  disabled={busy}
                  aria-label={`Remove ${m.nickname}`}
                  onClick={() => {
                    if (window.confirm(`Remove ${m.nickname} (@${m.login}) for good? They can register again.`)) {
                      onAction({ action: "remove", login: m.login });
                    }
                  }}
                >
                  <TrashBinMinimalisticIcon size={18} aria-hidden />
                </TextureButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default Admin;
