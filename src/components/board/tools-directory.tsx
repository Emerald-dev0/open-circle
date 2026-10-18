import { isRateLimited } from "@/lib/query-policy";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useErrorToast } from "@/hooks/use-error-toast";
import { AddIcon, MagnifierIcon, Tuning2Icon } from "@solar-icons/react/linear";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AnimatePresence, motion } from "motion/react";
import { TOOL_CATEGORIES, type ToolInput } from "@shared/community";
import { parseToolInput } from "@shared/tool-validation";
import { Pagination } from "@/components/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { ToolRow } from "@/components/board/tool-row";
import { ToolsSkeleton } from "@/components/site-skeleton";
import { MetalButton } from "@/components/metal-button";
import { SharedSelect } from "@/components/ui/select";
import { TextureButton } from "@/components/ui/texture-button";
import { COMMUNITY_KEY, GITHUB_SIGN_OUT_KEY, useCommunity, useToolVote } from "@/hooks/use-community";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersActive = category !== "all" || sort !== "votes";
  const [saved, setSaved] = useState(readSavedTools);
  const [sharing, setSharing] = useState(false);
  const [sentForReview, setSentForReview] = useState(false);
  const [input, setInput] = useState<ToolInput>(EMPTY_INPUT);
  const [formError, setFormError] = useState<{ message: string; field?: string } | null>(null);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const profile = community.data?.profile;
  const unavailable = community.isError && !isRateLimited(community.error);
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

  const pagination = usePagination(tools, 20, JSON.stringify([search, category, sort]));

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
    if (submit.isPending || !community.data || unavailable) return;
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

  useErrorToast(community.isError || null, community.data ? "Couldn't refresh tools." : "Couldn't load the tools.", { id: "tools-load", retry: () => void community.refetch() });
  useErrorToast(vote.error, "Couldn't update your vote. Try again.");
  useEffect(() => { if (formError) toast.error(formError.message, { id: "tool-form" }); }, [formError]);

  return (
    <section ref={pagination.regionRef} tabIndex={-1} className="scroll-mt-6" aria-labelledby={`${formId}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${formId}-heading`} className="text-lg font-medium tracking-[-0.02em]">Tools</h2>
          <TextureButton
            ref={shareButtonRef}
            variant="minimal"
            className="h-10 w-auto"
            innerClassName="px-4"
            aria-expanded={sharing}
            aria-controls={`${formId}-form`}
            disabled={submit.isPending || !community.data || unavailable}
            onClick={() => { setSharing(!sharing); setSentForReview(false); }}
          >
            <AddIcon aria-hidden="true" className={cn("size-3.5 transition-transform duration-300", sharing && "rotate-45")} />
            {sharing ? "Close form" : "Share a tool"}
          </TextureButton>
      </div>

      <AnimatePresence initial={false}>
        {sentForReview && (
          <motion.p key="sent" role="status" className="overflow-hidden text-sm text-t2" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34 }}>
            <span className="block pt-3">Sent to admins for review. It will appear here once approved.</span>
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {sharing && (
          <motion.div key="share-form" className="overflow-hidden" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34 }}>
            <div className="pt-4">
              <form ref={formRef} id={`${formId}-form`} onSubmit={shareTool} noValidate className="surface-quiet rounded-[24px] p-4 sm:p-5">
                <fieldset disabled={submit.isPending} className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
                  <div>
                    <label className="mb-2 block text-xs text-t2" htmlFor={`${formId}-name`}>Name</label>
                    <input id={`${formId}-name`} name="name" className="field text-base" value={input.name} maxLength={60} autoComplete="off" aria-invalid={formError?.field === "name"} onChange={(event) => setInput({ ...input, name: event.target.value })} />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs text-t2" htmlFor={`${formId}-url`}>URL</label>
                    <input id={`${formId}-url`} name="url" type="url" inputMode="url" className="field text-base" value={input.url} maxLength={2048} placeholder="https://" autoComplete="url" aria-invalid={formError?.field === "url"} onChange={(event) => setInput({ ...input, url: event.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-xs text-t2" htmlFor={`${formId}-description`}>Description</label>
                    <textarea id={`${formId}-description`} name="description" className="field min-h-24 resize-y rounded-2xl py-3 text-base" value={input.description} maxLength={240} rows={3} placeholder="What does it help you do?" aria-invalid={formError?.field === "description"} onChange={(event) => setInput({ ...input, description: event.target.value })} />
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
               
                      onValueChange={(value) => setInput({ ...input, category: value as ToolInput["category"] })}
                    />
                  </div>
                  <div className="flex items-end sm:justify-end">
                    <MetalButton className="min-h-11" type="submit" loading={submit.isPending} disabled={submit.isPending || !community.data || unavailable}>{submit.isPending ? "Sending…" : "Share tool"}</MetalButton>
                  </div>
                </fieldset>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phones: search plus a filter toggle on one line; the selects open
          underneath. From sm up all three sit inline. */}
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_10rem] sm:gap-3">
        <div className="relative min-w-0">
          <MagnifierIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-t3" aria-hidden="true" />
          <input className="field pl-11 text-base" type="search" aria-label="Search tools" placeholder="Search tools" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <TextureButton
          type="button"
          variant="icon"
          size="icon"
          className="relative size-11 sm:hidden"
          aria-label="Filters"
          aria-expanded={filtersOpen}
          aria-controls={`${formId}-filters`}
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <Tuning2Icon className="size-5" aria-hidden="true" />
          {filtersActive && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-foreground" aria-hidden="true" />}
        </TextureButton>
        {/* Collapses by animating the grid row to 0fr; `invisible` keeps closed
            selects out of the tab order. From sm up both wrappers vanish. */}
        <div
          id={`${formId}-filters`}
          className={cn(
            "col-span-2 grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out sm:contents",
            filtersOpen ? "visible grid-rows-[1fr] opacity-100" : "invisible grid-rows-[0fr] opacity-0 sm:visible sm:opacity-100",
          )}
        >
          <div className="grid min-h-0 grid-cols-2 gap-2 overflow-hidden sm:contents">
            <SharedSelect className="text-sm" aria-label="Filter tools by category" value={category} options={FILTER_OPTIONS} onValueChange={setCategory} />
            <SharedSelect className="text-sm" aria-label="Sort tools" value={sort} options={SORT_OPTIONS} onValueChange={setSort} />
          </div>
        </div>
      </div>

      {community.isLoading && !community.data ? (
        <ToolsSkeleton />
      ) : community.isError && !community.data ? (
        <div className="py-10 text-center">
          <TextureButton variant="minimal" className="h-11 w-auto" onClick={() => void community.refetch()}>Retry tools</TextureButton>
        </div>
      ) : (
        <>
          {tools.length ? (
            <>
            <ul key={JSON.stringify([search, category, sort, pagination.page])} aria-label="Tools" className="mt-5 flex flex-col gap-2">
              <AnimatePresence initial={false}>
              {pagination.items.map((tool) => {
                const target = `tool:${tool.id}`;
                return (
                  <ToolRow key={tool.id} pendingValue={vote.isPending && vote.variables?.target === target ? vote.variables.value : null} tool={tool} count={community.data?.counts[target] ?? 0} value={community.data?.toolVotes?.[target] ?? 0} saved={saved.includes(tool.id)} disabled={!profile || vote.isPending || signingOut || unavailable || !community.data} onVote={(value) => vote.mutate({ target, value })} onSave={() => toggleSaved(tool.id)} />
                );
              })}
              </AnimatePresence>
            </ul>
            <Pagination {...pagination} label="Tools" onPageChange={pagination.changePage} />
            </>
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
