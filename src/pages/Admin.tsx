import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EyeClosedIcon, EyeIcon, LockIcon, TrashBinMinimalisticIcon } from "@solar-icons/react/bold-duotone";
import { BRAND_NAME } from "@shared/brand";
import type { AdminAction, AdminConfig, AdminMember, AdminState, Weights } from "@shared/types";
import { BrandMark } from "@/components/site-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
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
            <BrandMark className="size-6" />
            <span className="text-[15px] font-semibold tracking-[-0.02em]">{BRAND_NAME}</span>
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
  return (
    <form
      className="surface mx-auto mt-16 max-w-sm space-y-3 rounded-2xl p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onUnlock(value.trim());
      }}
    >
      <p className="flex items-center gap-2 font-medium">
        <LockIcon size={18} aria-hidden /> Admin
      </p>
      <label htmlFor="admin-secret" className="block text-xs text-t3">
        Admin secret (ADMIN_SECRET)
      </label>
      <input
        id="admin-secret"
        type="password"
        autoComplete="current-password"
        className="field"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <TextureButton type="submit">Unlock</TextureButton>
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
    <div className="mt-4 space-y-8">
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
  { key: "activity", label: "Per contribution (30d)" },
  { key: "activityCap", label: "Contribution cap" },
];

function Settings({ config, saving, onSave }: { config: AdminConfig; saving: boolean; onSave: (c: AdminConfig) => void }) {
  const [draft, setDraft] = useState(config);
  useEffect(() => setDraft(config), [config]);

  return (
    <section className="surface space-y-4 rounded-2xl p-4 sm:p-5" aria-labelledby="settings-title">
      <h2 id="settings-title" className="text-lg font-medium tracking-tight">
        Group invite
      </h2>
      <div>
        <label htmlFor="invite-url" className="mb-1.5 block text-xs text-t3">
          WhatsApp invite link
        </label>
        <input
          id="invite-url"
          className="field"
          value={draft.invite.url}
          onChange={(e) => setDraft({ ...draft, invite: { ...draft.invite, url: e.target.value } })}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="invite-open" className="text-sm text-t2">
          Link is working
          <span className="block text-xs text-t4">Turn off when the group is full or the link is stale.</span>
        </label>
        <Switch
          id="invite-open"
          checked={draft.invite.open}
          onCheckedChange={(open) => setDraft({ ...draft, invite: { ...draft.invite, open } })}
        />
      </div>
      <div>
        <label htmlFor="invite-note" className="mb-1.5 block text-xs text-t3">
          Message shown when the link is off
        </label>
        <textarea
          id="invite-note"
          rows={3}
          maxLength={200}
          className="field h-auto resize-none py-2.5"
          value={draft.invite.note}
          onChange={(e) => setDraft({ ...draft, invite: { ...draft.invite, note: e.target.value } })}
        />
      </div>

      <h2 className="pt-2 text-lg font-medium tracking-tight">Ranking weights</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {WEIGHT_FIELDS.map(({ key, label }) => (
          <div key={key}>
            <label htmlFor={`w-${key}`} className="mb-1.5 block text-xs text-t3">
              {label}
            </label>
            <input
              id={`w-${key}`}
              type="number"
              min={0}
              max={10000}
              step="any"
              className="field tabular"
              value={draft.weights[key]}
              onChange={(e) => setDraft({ ...draft, weights: { ...draft.weights, [key]: Number(e.target.value) } })}
            />
          </div>
        ))}
      </div>

      <TextureButton className="sm:w-auto" disabled={saving} onClick={() => onSave(draft)}>
        {saving ? "Saving…" : "Save settings"}
      </TextureButton>
    </section>
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
  return (
    <section aria-labelledby="members-title">
      <h2 id="members-title" className="mb-3 text-lg font-medium tracking-tight">
        Members <span className="text-t4">{formatFull(members.length)}</span>
      </h2>
      {members.length === 0 ? (
        <p className="surface-quiet rounded-2xl p-5 text-sm text-t3">No one has registered yet.</p>
      ) : (
        <ul className="space-y-1">
          {members.map((m, i) => (
            <li
              key={m.login}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5",
                i % 2 === 1 && "surface-quiet",
                m.hidden && "opacity-60",
              )}
            >
              <span className="w-8 shrink-0 text-sm tabular text-t3">{m.rank || "—"}</span>
              <Avatar className="size-8 shrink-0">
                <AvatarImage src={m.avatarUrl} alt="" />
                <AvatarFallback className="bg-alva-card text-[10px]">{m.nickname.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.nickname} {m.hidden && <span className="text-xs font-normal text-warn">hidden</span>}
                </p>
                <p className="truncate text-xs text-t4">
                  <a href={githubUrl(m.login)} target="_blank" rel="noopener noreferrer" className="hover:text-t2">
                    @{m.login}
                  </a>
                  {" · "}
                  <span className="tabular">{m.whatsapp}</span>
                  {" · "}joined {timeAgo(m.createdAt, now)}
                </p>
              </div>
              <span className="hidden text-sm tabular text-t2 sm:block">{formatFull(m.score)}</span>
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
    </section>
  );
}

export default Admin;
