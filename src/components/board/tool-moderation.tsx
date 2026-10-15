import { pollApi } from "@/lib/query-policy";
import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useErrorToast } from "@/hooks/use-error-toast";
import { CheckIcon, TrashBinMinimalisticIcon } from "@solar-icons/react/linear";
import { toast } from "sonner";
import { Pagination } from "@/components/pagination";
import { usePagination } from "@/hooks/use-pagination";
import { TextureButton } from "@/components/ui/texture-button";
import { MetalButton } from "@/components/metal-button";
import { COMMUNITY_KEY } from "@/hooks/use-community";
import { ApiError, api } from "@/lib/api";
import { SharedSelect } from "@/components/ui/select";
import { AdminToolsSkeleton } from "@/components/admin-skeleton";
import { ToolFavicon } from "@/components/board/tool-favicon";
import { Chip, Panel } from "@/components/panel";
import { formatFull } from "@/lib/format";
import { AnimatePresence, motion } from "motion/react";
import { AdminToolForm } from "@/components/board/admin-tool-form";

export function ToolModeration({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const key = ["admin", "tools"];
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const formId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  const wasAdding = useRef(false);
  useEffect(() => {
    if (!adding && wasAdding.current) addButton.current?.focus();
    wasAdding.current = adding;
  }, [adding]);
  const community = useQuery({ queryKey: key, queryFn: ({ signal }) => api.adminTools(signal), retry: false, gcTime: 0, refetchInterval: pollApi(30_000) });
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => approve ? api.approveTool(id) : api.removeTool(id),
    onSuccess: async (_, input) => {
      toast.success(input.approve ? "Tool approved." : "Tool removed.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["admin", "analytics"] }),
      ]);
    },
  });
  useEffect(() => {
    for (const error of [community.error, action.error]) {
      if (error instanceof ApiError && ["unauthorized", "admin_disabled"].includes(error.code)) onUnauthorized?.();
    }
  }, [community.error, action.error, onUnauthorized]);
  const tools = [...community.data ?? []].filter((tool) => (status === "all" || (tool.status ?? "pending") === status) && `${tool.name} ${tool.description} ${tool.category} ${tool.url}`.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => Number(a.status === "approved") - Number(b.status === "approved") || a.name.localeCompare(b.name));

  useErrorToast(community.isError || null, "Couldn't load shared tools.", { id: "tools-moderation-load", retry: () => community.refetch() });
  useErrorToast(action.error, "That didn't work. Try again.");

  const pagination = usePagination(tools, 20, JSON.stringify([status, search]));
  const all = community.data ?? [];
  const pendingCount = all.filter((tool) => tool.status !== "approved").length;
  const closeForm = () => setAdding(false);

  return (
    <section ref={pagination.regionRef} tabIndex={-1} className="scroll-mt-6" aria-labelledby="moderate-tools-title">
      <Panel
        header={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id="moderate-tools-title" className="text-lg font-medium tracking-tight sm:text-xl">Tools</h2>
              <p className="mt-0.5 text-sm text-t3">
                {community.data ? `${formatFull(pendingCount)} pending · ${formatFull(all.length - pendingCount)} approved` : "Tool directory"}
              </p>
            </div>
            <TextureButton ref={addButton} variant="minimal" className="h-11 w-auto" aria-expanded={adding} aria-controls={formId} disabled={adding} onClick={() => setAdding(true)}>Add tool</TextureButton>
          </div>
        }
      >
        {adding && <AdminToolForm id={formId} onCancel={closeForm} onUnauthorized={onUnauthorized} onAdded={async (tool) => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: key }),
            queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY }),
            queryClient.invalidateQueries({ queryKey: ["admin", "analytics"] }),
          ]);
          setStatus("all");
          setSearch(tool.name);
          closeForm();
        }} />}
        <div className="flex flex-col gap-3 py-4 sm:flex-row">
          <input type="search" aria-label="Search tools" placeholder="Search tools" className="field min-w-0 flex-1 text-base" value={search} onChange={(event) => setSearch(event.target.value)} />
          <SharedSelect aria-label="Tool status" className="w-full text-sm sm:w-48" value={status} onValueChange={setStatus} options={[{ value: "all", label: "All tools" }, { value: "pending", label: "Pending review" }, { value: "approved", label: "Approved" }]} />
        </div>
        {community.isPending ? <AdminToolsSkeleton /> : community.isError ? (
          <div className="flex justify-center py-8">
            <TextureButton size="sm" variant="minimal" className="w-auto" onClick={() => community.refetch()}>Try again</TextureButton>
          </div>
        ) : tools.length === 0 ? (
          <p className="py-8 text-center text-sm text-t3">{all.length ? "No tools match this filter." : "No tools yet. Add a tool to get started."}</p>
        ) : (
          <ul key={`${status}:${pagination.page}`} aria-label="Tool review">
            <AnimatePresence initial={false}>
              {pagination.items.map((tool) => (
                <motion.li
                  key={tool.id}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ layout: { type: "spring", stiffness: 340, damping: 34 }, duration: 0.2 }}
                  className="flex flex-col gap-3 overflow-hidden border-b border-foreground/[0.06] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <ToolFavicon url={tool.url} />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={tool.url} target="_blank" rel="noopener noreferrer" className="break-words rounded text-sm font-medium [overflow-wrap:anywhere] hover:underline hover:underline-offset-4">{tool.name}</a>
                        <Chip tone={tool.status === "approved" ? "ok" : "warn"}>{tool.status === "approved" ? "Approved" : "Pending review"}</Chip>
                      </div>
                      <p className="break-words text-xs leading-relaxed text-t2 [overflow-wrap:anywhere]">{tool.description}</p>
                      <p className="text-xs text-t3">{tool.category} · {tool.source === "curated" ? "Built-in" : "Community"}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:pl-4">
                    {tool.status !== "approved" && <MetalButton wrapperClassName="overflow-clip rounded-full" className="h-10 w-auto" innerClassName="px-4" disabled={action.isPending} aria-label={`Approve ${tool.name}`} onClick={() => action.mutate({ id: tool.id, approve: true })}>
                      <CheckIcon aria-hidden="true" className="size-4" /> Approve
                    </MetalButton>}
                    <TextureButton variant="minimal" className="h-10 w-auto" innerClassName="px-4" disabled={action.isPending} aria-label={`${tool.status === "approved" ? "Remove" : "Reject"} ${tool.name}`} onClick={() => {
                      if (window.confirm(`${tool.status === "approved" ? "Remove" : "Reject"} ${tool.name}? Its votes will also be removed.`)) action.mutate({ id: tool.id, approve: false });
                    }}>
                      <TrashBinMinimalisticIcon aria-hidden="true" className="size-4" /> {tool.status === "approved" ? "Remove" : "Reject"}
                    </TextureButton>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {!community.isPending && <Pagination {...pagination} label="Tool review" disabled={action.isPending} onPageChange={pagination.changePage} />}
      </Panel>
    </section>
  );
}
