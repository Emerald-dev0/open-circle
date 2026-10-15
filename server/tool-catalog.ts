import type { CommunityTool } from "../shared/community.js";
import { CURATED_TOOLS } from "../shared/tools.js";

export type StoredTool = CommunityTool & { removed?: boolean };

export function toolCatalog(records: StoredTool[]): CommunityTool[] {
  const tools = new Map<string, StoredTool>(CURATED_TOOLS.map((tool) => [tool.id, tool]));
  for (const tool of records) tools.set(tool.id, tool);
  return [...tools.values()].filter((tool) => !tool.removed).map((tool) => {
    const result = { ...tool };
    delete result.removed;
    return result;
  });
}
