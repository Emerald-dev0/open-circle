import { useId, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { TOOL_CATEGORIES, type CommunityTool, type ToolInput } from "@shared/community";
import { parseToolInput } from "@shared/tool-validation";
import { ApiError, api } from "@/lib/api";
import { MetalButton } from "@/components/metal-button";
import { SharedSelect } from "@/components/ui/select";
import { TextureButton } from "@/components/ui/texture-button";

export function AdminToolForm({ id, onAdded, onCancel, onUnauthorized }: {
  id: string;
  onAdded: (tool: CommunityTool) => Promise<void>;
  onCancel: () => void;
  onUnauthorized?: () => void;
}) {
  const prefix = useId();
  const form = useRef<HTMLFormElement>(null);
  const [input, setInput] = useState<ToolInput>({ name: "", url: "", description: "", category: "Development" });
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const showError = (message: string, field?: string) => {
    setError({ message, field });
    toast.error(message, { id: "admin-tool-form" });
    if (field) requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus());
  };
  const add = useMutation({
    mutationFn: api.addTool,
    onSuccess: async (tool) => {
      toast.success("Tool added to the directory.");
      await onAdded(tool);
    },
    onError: (error) => {
      if (error instanceof ApiError && ["unauthorized", "admin_disabled"].includes(error.code)) onUnauthorized?.();
      showError(error.message, error instanceof ApiError ? error.field : undefined);
    },
  });
  const invalid = (field: keyof ToolInput) => ({ "aria-invalid": error?.field === field });

  return <form id={id} ref={form} aria-label="Add tool" noValidate className="space-y-4 py-5" onSubmit={(event) => {
    event.preventDefault();
    if (add.isPending) return;
    const parsed = parseToolInput(input);
    if (parsed.ok === false) return showError(parsed.error, parsed.field);
    setError(null);
    add.mutate(parsed.value);
  }}>
    <p className="text-sm text-t3">Tools you add are published immediately.</p>
    <fieldset disabled={add.isPending} className="grid min-w-0 gap-4 sm:grid-cols-2 disabled:opacity-60">
      <div className="min-w-0">
        <label className="mb-2 block text-sm text-t2" htmlFor={`${prefix}-name`}>Name</label>
        <input autoFocus id={`${prefix}-name`} name="name" className="field text-base" maxLength={60} value={input.name} {...invalid("name")} onChange={(event) => setInput({ ...input, name: event.target.value })} />
      </div>
      <div className="min-w-0">
        <label className="mb-2 block text-sm text-t2" htmlFor={`${prefix}-url`}>URL</label>
        <input id={`${prefix}-url`} name="url" type="url" inputMode="url" autoComplete="url" className="field text-base" placeholder="https://" maxLength={2048} value={input.url} {...invalid("url")} onChange={(event) => setInput({ ...input, url: event.target.value })} />
      </div>
      <div className="min-w-0 sm:col-span-2">
        <label className="mb-2 block text-sm text-t2" htmlFor={`${prefix}-description`}>Description</label>
        <textarea id={`${prefix}-description`} name="description" className="field min-h-24 resize-y rounded-2xl py-3 text-base" rows={3} maxLength={240} value={input.description} {...invalid("description")} onChange={(event) => setInput({ ...input, description: event.target.value })} />
      </div>
      <div className="min-w-0">
        <label className="mb-2 block text-sm text-t2" htmlFor={`${prefix}-category`}>Category</label>
        <SharedSelect id={`${prefix}-category`} name="category" aria-label="Category" className="text-base" value={input.category} {...invalid("category")} options={TOOL_CATEGORIES.map((value) => ({ value, label: value }))} onValueChange={(category) => setInput({ ...input, category: category as ToolInput["category"] })} />
      </div>
      <div className="flex flex-wrap items-end justify-end gap-2">
        <TextureButton type="button" variant="minimal" className="h-11 w-auto" onClick={onCancel}>Cancel</TextureButton>
        <MetalButton type="submit" wrapperClassName="overflow-clip rounded-full" className="h-11 w-auto" loading={add.isPending}>{add.isPending ? "Adding…" : "Add tool"}</MetalButton>
      </div>
    </fieldset>
  </form>;
}
