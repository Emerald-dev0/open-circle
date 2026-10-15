import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AddIcon, MagnifierIcon } from "@solar-icons/react/linear";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TOOL_CATEGORIES, type ToolInput } from "@shared/community";
import { parseToolInput } from "@shared/tool-validation";
import { ToolRow } from "@/components/board/tool-row";
import { MetalButton } from "@/components/metal-button";
import { SharedSelect } from "@/components/ui/select";
import { TextureButton } from "@/components/ui/texture-button";
import { COMMUNITY_KEY, GITHUB_SIGN_OUT_KEY, useCommunity, useToolVote } from "@/hooks/use-community";
import { ApiError, api } from "@/lib/api";

const SAVED_KEY = "opencircle.saved-tools";
const EMPTY_INPUT: ToolInput = { name: "", url: "", description: "", category: "Development" };
const CATEGORY_OPTIONS = TOOL_CATEGORIES.map((value) => ({ value, label: value }));
const FILTER_OPTIONS = [{ value: "all", label: "All categories" }, ...CATEGORY_OPTIONS];
const SORT_OPTIONS = [
  { value: "votes", label: "Top rated" },
  { value: "newest", label: "Newest" },
  { value: "name", label: "Name" },
];

function readSavedTools(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function ToolsDirectory() {
  const community = useCommunity();
  const vote = useToolVote();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("votes");
  const [saved, setSaved] = useState(readSavedTools);
  const [sharing, setSharing] = useState(false);
  const [sentForReview, setSentForReview] = useState(false);
  const [input, setInput] = useState<ToolInput>(EMPTY_INPUT);
  const [formError, setFormError] = useState<{ message: string; field?: string } | null>(null);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const profile = community.data?.profile;
  const signingOut = useIsMutating({ mutationKey: GITHUB_SIGN_OUT_KEY }) > 0;

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_KEY || event.key === null) setSaved(readSavedTools());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const submit = useMutation({
    mutationFn: api.submitTool,
    onSuccess: () => {
      setInput(EMPTY_INPUT);
      setFormError(null);
      setSharing(false);
      setSentForReview(true);
      toast.success("Sent to admins for review.");
      void queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY });
    },
    onError: (error) => {
      setFormError({
        message: error instanceof Error ? error.message : "Couldn't share this tool. Try again.",
        field: error instanceof ApiError ? error.field : undefined,
      });
    },
  });

  useEffect(() => {
    if (submit.isSuccess && !sharing) shareButtonRef.current?.focus();
  }, [submit.isSuccess, sharing]);

  const tools = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (community.data?.tools ?? [])
      .filter((tool) => category === "all" || tool.category === category)
      .filter((tool) => !query || `${tool.name} ${tool.description} ${tool.category} ${tool.url}`.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "newest") return b.createdAt - a.createdAt || a.name.localeCompare(b.name);
        return (community.data?.counts[`tool:${b.id}`] ?? 0) - (community.data?.counts[`tool:${a.id}`] ?? 0) || a.name.localeCompare(b.name);
      });
  }, [community.data, search, category, sort]);

  function toggleSaved(id: string) {
    const next = saved.includes(id) ? saved.filter((value) => value !== id) : [...saved, id];
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      toast.message("Saved for this visit. Browser storage is unavailable.");
    }
  }

  function shareTool(event: React.FormEvent) {
    event.preventDefault();
    if (submit.isPending || !community.data || community.isError) return;
    const parsed = parseToolInput(input);
    if (parsed.ok === false) {
      setFormError({ message: parsed.error, field: parsed.field });
      formRef.current?.querySelector<HTMLElement>(`[name="${parsed.field}"]`)?.focus();
      return;
    }
    setFormError(null);
    submit.mutate(parsed.value);
  }

  function clearFilters() {
    setSearch("");
    setCategory("all");
  }

  return (
    <section aria-labelledby={`${formId}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${formId}-heading`} className="text-lg font-medium tracking-[-0.02em]">Tools</h2>
          <TextureButton
            ref={shareButtonRef}
            variant="minimal"
            className="h-10 w-auto"
            innerClassName="px-4"
            aria-expanded={sharing}
            aria-controls={`${formId}-form`}
            disabled={submit.isPending || !community.data || community.isError}
            onClick={() => { setSharing(!sharing); setSentForReview(false); }}
          >
            <AddIcon aria-hidden="true" className="size-3.5" />
            {sharing ? "Close form" : "Share a tool"}
          </TextureButton>
      </div>

      {sentForReview && <p role="status" className="mt-3 text-sm text-t2">Sent to admins for review. It will appear here once approved.</p>}

      {sharing && (
        <form ref={formRef} id={`${formId}-form`} onSubmit={shareTool} noValidate className="surface-quiet mt-4 rounded-2xl p-4 sm:p-5">
          <fieldset disabled={submit.isPending} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
            <div>
              <label className="mb-2 block text-xs text-t2" htmlFor={`${formId}-name`}>Name</label>
              <input id={`${formId}-name`} name="name" className="field text-base" value={input.name} maxLength={60} autoComplete="off" aria-invalid={formError?.field === "name"} aria-describedby={formError?.field === "name" ? `${formId}-error` : undefined} onChange={(event) => setInput({ ...input, name: event.target.value })} />
            </div>
            <div>
              <label className="mb-2 block text-xs text-t2" htmlFor={`${formId}-url`}>URL</label>
              <input id={`${formId}-url`} name="url" type="url" inputMode="url" className="field text-base" value={input.url} maxLength={2048} placeholder="https://" autoComplete="url" aria-invalid={formError?.field === "url"} aria-describedby={formError?.field === "url" ? `${formId}-error` : undefined} onChange={(event) => setInput({ ...input, url: event.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-xs text-t2" htmlFor={`${formId}-description`}>Description</label>
              <textarea id={`${formId}-description`} name="description" className="field min-h-24 resize-y rounded-2xl py-3 text-base" value={input.description} maxLength={240} rows={3} placeholder="What does it help you do?" aria-invalid={formError?.field === "description"} aria-describedby={formError?.field === "description" ? `${formId}-error` : undefined} onChange={(event) => setInput({ ...input, description: event.target.value })} />
            </div>
            <div>
              <label className="mb-2 block text-xs text-t2" htmlFor={`${formId}-category`}>Category</label>
              <SharedSelect
                id={`${formId}-category`}
                name="category"
                aria-label="Category"
                className="text-base"
                value={input.category}
                options={CATEGORY_OPTIONS}
                disabled={submit.isPending}
                aria-invalid={formError?.field === "category"}
                aria-describedby={formError?.field === "category" ? `${formId}-error` : undefined}
                onValueChange={(value) => setInput({ ...input, category: value as ToolInput["category"] })}
              />
            </div>
            <div className="flex items-end sm:justify-end">
              <MetalButton wrapperClassName="w-full sm:w-auto" className="h-11 w-full" type="submit" disabled={submit.isPending || !community.data || community.isError}>{submit.isPending ? "Sending…" : "Share tool"}</MetalButton>
            </div>
          </fieldset>
          {formError && <p id={`${formId}-error`} role="alert" className="mt-3 text-sm text-down">{formError.message}</p>}
        </form>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
        <div className="relative min-w-0 min-[400px]:col-span-2 sm:col-span-1">
          <MagnifierIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-t3" aria-hidden="true" />
          <input className="field pl-11 text-base" type="search" aria-label="Search tools" placeholder="Search tools" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <SharedSelect className="text-sm" aria-label="Filter tools by category" value={category} options={FILTER_OPTIONS} onValueChange={setCategory} />
        <SharedSelect className="text-sm" aria-label="Sort tools" value={sort} options={SORT_OPTIONS} onValueChange={setSort} />
      </div>

      {community.isLoading && !community.data ? (
        <p role="status" className="py-12 text-center text-sm text-t3">Loading tools…</p>
      ) : community.isError && !community.data ? (
        <div role="alert" className="py-10 text-center">
          <p className="mb-4 text-sm text-t2">Couldn't load the tools. Try again.</p>
          <TextureButton variant="minimal" className="h-11 w-auto" onClick={() => void community.refetch()}>Retry tools</TextureButton>
        </div>
      ) : (
        <>
          {community.isError && <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 text-xs text-t3">Couldn't refresh tools.<TextureButton type="button" variant="secondary" className="h-11 w-auto" onClick={() => void community.refetch()}>Retry</TextureButton></div>}
          {vote.error && <p role="alert" className="mb-3 text-sm text-down">{vote.error instanceof Error ? vote.error.message : "Couldn't update your vote. Try again."}</p>}
          {tools.length ? (
            <ul aria-label="Tools" className="mt-5 flex flex-col gap-2">
              {tools.map((tool) => {
                const target = `tool:${tool.id}`;
                return (
                  <ToolRow key={tool.id} tool={tool} count={community.data?.counts[target] ?? 0} value={community.data?.toolVotes?.[target] ?? 0} saved={saved.includes(tool.id)} disabled={!profile || vote.isPending || signingOut || community.isError || !community.data} onVote={(value) => vote.mutate({ target, value })} onSave={() => toggleSaved(tool.id)} />
                );
              })}
            </ul>
          ) : (
            <div role="status" className="py-12 text-center">
              <p className="text-sm text-t2">{search || category !== "all" ? "No tools match these filters." : "No tools shared yet."}</p>
              <p className="mt-2 text-xs text-t3">Share a tool you use with the circle.</p>
              {(search || category !== "all") && <TextureButton variant="minimal" className="mt-4 h-11 w-auto" onClick={clearFilters}>Show all tools</TextureButton>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
