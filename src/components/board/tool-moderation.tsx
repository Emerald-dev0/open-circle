import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiCheck, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import { TextureButton } from "@/components/ui/texture-button";
import { MetalButton } from "@/components/metal-button";
import { COMMUNITY_KEY } from "@/hooks/use-community";
import { ApiError, api } from "@/lib/api";
import { SharedSelect } from "@/components/ui/select";

export function ToolModeration({ onUnauthorized }: { onUnauthorized?: () => void }) {
  const key = ["admin", "tools"];
  const [status, setStatus] = useState("all");
  const community = useQuery({ queryKey: key, queryFn: ({ signal }) => api.adminTools(signal), retry: false, gcTime: 0, refetchInterval: 30_000 });
  const queryClient = useQueryClient();
  const action = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => approve ? api.approveTool(id) : api.removeTool(id),
    onSuccess: async (_, input) => {
      toast.success(input.approve ? "Tool approved." : "Tool removed.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: COMMUNITY_KEY }),
      ]);
    },
  });
  useEffect(() => {
    for (const error of [community.error, action.error]) {
      if (error instanceof ApiError && ["unauthorized", "admin_disabled"].includes(error.code)) onUnauthorized?.();
    }
  }, [community.error, action.error, onUnauthorized]);
  const tools = [...community.data ?? []].filter((tool) => status === "all" || tool.status === status).sort((a, b) => Number(a.status === "approved") - Number(b.status === "approved") || a.name.localeCompare(b.name));

  return (
    <section aria-labelledby="moderate-tools-title">
      <h2 id="moderate-tools-title" className="text-lg font-medium">Tool review</h2>
      <SharedSelect aria-label="Tool status" className="mt-3 sm:w-52" value={status} onValueChange={setStatus} options={[{ value: "all", label: "All submissions" }, { value: "pending", label: "Pending review" }, { value: "approved", label: "Approved" }]} />
      {community.isPending ? <p className="mt-3 text-sm text-t3">Loading tools…</p> : community.isError ? (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-sm text-down">Couldn't load shared tools.</p>
          <TextureButton size="sm" variant="minimal" className="w-auto" onClick={() => community.refetch()}>Try again</TextureButton>
        </div>
      ) : tools.length === 0 ? <p className="mt-3 text-sm text-t3">{community.data?.length ? "No tools match this filter." : "No community submissions yet."}</p> : (
        <ul className="mt-3 space-y-1">
          {tools.map((tool) => (
            <li key={tool.id} className="surface-quiet flex flex-wrap items-center gap-3 rounded-2xl p-4">
              <div className="min-w-0 flex-1 basis-48">
                <a href={tool.url} target="_blank" rel="noopener noreferrer" className="block break-words rounded-lg text-sm font-medium [overflow-wrap:anywhere]">{tool.name}</a>
                <p className="mt-1 break-words text-xs leading-relaxed text-t2 [overflow-wrap:anywhere]">{tool.description}</p>
                <p className="mt-2 text-xs text-t3">{tool.category} · {tool.status === "approved" ? "Approved" : "Pending review"}</p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {tool.status !== "approved" && <MetalButton wrapperClassName="overflow-clip rounded-full" className="h-11 w-auto" innerClassName="px-3.5" disabled={action.isPending} aria-label={`Approve ${tool.name}`} onClick={() => action.mutate({ id: tool.id, approve: true })}>
                  <FiCheck aria-hidden="true" className="size-4" /> Approve
                </MetalButton>}
                <TextureButton variant="minimal" className="h-11 w-auto" innerClassName="px-3.5" disabled={action.isPending} aria-label={`${tool.status === "approved" ? "Remove" : "Reject"} ${tool.name}`} onClick={() => {
                  if (window.confirm(`${tool.status === "approved" ? "Remove" : "Reject"} ${tool.name}? Its votes will also be removed.`)) action.mutate({ id: tool.id, approve: false });
                }}>
                  <FiTrash2 aria-hidden="true" className="size-4" /> {tool.status === "approved" ? "Remove" : "Reject"}
                </TextureButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {action.isError && <p role="alert" className="mt-3 text-sm text-down">{action.error.message}</p>}
    </section>
  );
}
import { useEffect, useState } from "react";
