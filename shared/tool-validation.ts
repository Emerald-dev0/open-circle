import { TOOL_CATEGORIES, type ToolInput, type ToolCategory } from "./community.js";

type ToolValidation =
  | { ok: true; value: ToolInput }
  | { ok: false; error: string; field: keyof ToolInput };

export function parseToolInput(input: unknown): ToolValidation {
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const text = (key: string) => typeof body[key] === "string" ? body[key].trim().replace(/\s+/g, " ") : "";
  const name = text("name");
  if (name.length < 2 || name.length > 60)
    return { ok: false, error: "Use a tool name between 2 and 60 characters.", field: "name" };
  const description = text("description");
  if (description.length < 10 || description.length > 240)
    return { ok: false, error: "Describe what it does in 10 to 240 characters.", field: "description" };
  const category = text("category") as ToolCategory;
  if (!TOOL_CATEGORIES.includes(category))
    return { ok: false, error: "Choose a category for this tool.", field: "category" };
  let url: URL;
  try {
    if (typeof body.url !== "string" || body.url.length > 2048 || [...body.url.trim()].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) throw new Error();
    url = new URL(body.url.trim());
    const host = url.hostname.replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !host.includes(".") || host.endsWith(".local") || host.endsWith(".localhost") ||
      host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":")) throw new Error();
    url.hostname = host;
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
  } catch {
    return { ok: false, error: "Enter a public HTTPS link, such as https://example.com.", field: "url" };
  }
  return { ok: true, value: { name, description, category, url: url.href } };
}
