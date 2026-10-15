import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommunityTool } from "../shared/community.js";
import { CURATED_TOOLS } from "../shared/tools.js";
import { MemoryCommunityStore } from "../server/community-memory.js";

const directories: string[] = [];

function temporaryStore() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "opencircle-community-"));
  directories.push(directory);
  const file = path.join(directory, "community.json");
  return { store: new MemoryCommunityStore(file), file };
}

function tool(id = "community-tool", url = `https://${id}.example/`, status: CommunityTool["status"] = "approved"): CommunityTool {
  return {
    id,
    name: `Tool ${id}`,
    description: "A useful community tool.",
    category: "Development",
    url,
    source: "community",
    status,
    createdAt: 100,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("community persistence", () => {
  it("treats vote requests as desired state, including safe repeated removal", async () => {
    const store = new MemoryCommunityStore(null);
    expect(await store.setVote("repo:1", "actor-a", true)).toEqual({ target: "repo:1", active: true, count: 1 });
    expect(await store.setVote("repo:1", "actor-a", true)).toEqual({ target: "repo:1", active: true, count: 1 });
    expect(await store.setVote("repo:1", "actor-b", true)).toEqual({ target: "repo:1", active: true, count: 2 });
    await store.setVote("repo:2", "actor-a", true);
    expect(await store.readVotes("actor-a")).toEqual({ counts: { "repo:1": 2, "repo:2": 1 }, voted: ["repo:1", "repo:2"] });
    await store.setVote("repo:1", "actor-a", false);
    await store.setVote("repo:1", "actor-a", false);
    expect(await store.readVotes("actor-a")).toEqual({ counts: { "repo:1": 1, "repo:2": 1 }, voted: ["repo:2"] });
    await store.setVote("repo:1", "actor-b", false);
    expect(await store.setVote("repo:1", "actor-b", false)).toEqual({ target: "repo:1", active: false, count: 0 });
    expect((await store.readVotes("actor-b")).counts).not.toHaveProperty("repo:1");
  });

  it("does not lose distinct voters or double-count concurrent retries", async () => {
    const store = new MemoryCommunityStore(null);
    const actors = Array.from({ length: 80 }, (_, index) => `actor-${index}`);
    await Promise.all(actors.flatMap((actor) => Array.from({ length: 3 }, () => store.setVote("repo:1", actor, true))));
    expect((await store.readVotes(actors[0])).counts["repo:1"]).toBe(80);
    await Promise.all(actors.slice(0, 40).flatMap((actor) => [store.setVote("repo:1", actor, false), store.setVote("repo:1", actor, false)]));
    expect((await store.readVotes(actors[0])).counts["repo:1"]).toBe(40);
    expect((await store.readVotes(actors[0])).voted).toEqual([]);
    expect((await store.readVotes(actors[79])).voted).toEqual(["repo:1"]);
  });

  it("keeps tools and votes through module reloads and reads its saved snapshot", async () => {
    const { store, file } = temporaryStore();
    await store.createTool(tool());
    await store.setVote("tool:community-tool", "actor-a", true);
    vi.resetModules();
    const { MemoryCommunityStore: ReloadedStore } = await import("../server/community-memory.js");
    const reloaded = new ReloadedStore(file);
    await reloaded.setVote("repo:2", "actor-b", true);
    expect((await store.readVotes("actor-b")).counts).toEqual({ "tool:community-tool": 1, "repo:2": 1 });
    const globalStore = globalThis as typeof globalThis & {
      __openCircleCommunityStores?: Map<string, unknown>;
    };
    globalStore.__openCircleCommunityStores?.delete(file);
    const restored = new ReloadedStore(file);
    expect(await restored.listTools()).toEqual([tool()]);
    expect(await restored.readVotes("actor-a")).toEqual({ counts: { "tool:community-tool": 1, "repo:2": 1 }, voted: ["tool:community-tool"] });
    expect(JSON.parse(readFileSync(file, "utf8")).tools).toEqual([tool()]);
  });

  it("claims duplicate URLs and IDs once and protects curated entries", async () => {
    const store = new MemoryCommunityStore(null);
    const claims = await Promise.all([
      store.createTool(tool("first", "https://example.com/")),
      store.createTool(tool("second", "https://example.com/")),
    ]);
    expect(claims).toEqual([true, false]);
    expect(await store.createTool(tool("first", "https://another.example/"))).toBe(false);
    expect(await store.createTool(tool("copy", CURATED_TOOLS[0].url))).toBe(false);
    expect(await store.createTool(tool(CURATED_TOOLS[0].id))).toBe(false);
    const listed = await store.listTools();
    listed[0].name = "changed";
    expect((await store.listTools())[0].name).toBe("Tool first");
    expect(await store.setVote(`tool:${CURATED_TOOLS[0].id}`, "actor-a", true)).toMatchObject({ count: 1 });
  });

  it("removes all tool votes and rejects delayed votes after deletion", async () => {
    const { store, file } = temporaryStore();
    await store.createTool(tool());
    await store.setVote("tool:community-tool", "actor-a", true);
    await store.setVote("tool:community-tool", "actor-b", true);
    await store.setVote("repo:1", "actor-a", true);
    await store.removeTool("community-tool");
    await expect(store.setVote("tool:community-tool", "actor-a", true)).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(await store.listTools()).toEqual([]);
    expect(await store.readVotes("actor-a")).toEqual({ counts: { "repo:1": 1 }, voted: ["repo:1"] });
    expect(readFileSync(file, "utf8")).not.toContain("community-tool");
    expect(await store.createTool(tool())).toBe(true);
    expect(await store.setVote("tool:community-tool", "actor-a", true)).toMatchObject({ count: 1 });
  });

  it("does not publish a local mutation when saving fails", async () => {
    const { store, file } = temporaryStore();
    await store.setVote("repo:1", "actor-a", true);
    rmSync(file);
    mkdirSync(file);
    await expect(store.setVote("repo:1", "actor-b", true)).rejects.toThrow();
    expect(await store.readVotes("actor-b")).toEqual({ counts: { "repo:1": 1 }, voted: [] });
  });

  it("persists built-in removals, blocks late votes and restores one reviewed entry", async () => {
    const { store, file } = temporaryStore();
    const curated = CURATED_TOOLS[0];
    const target = `tool:${curated.id}`;
    expect(await store.listToolCatalog()).toEqual(CURATED_TOOLS);
    await store.setVote(target, "actor-a", true);
    await store.setProfileVote(target, "profile-a", -1);
    await store.removeTool(curated.id);
    await store.removeTool(curated.id);
    const globalStore = globalThis as typeof globalThis & { __openCircleCommunityStores?: Map<string, unknown> };
    globalStore.__openCircleCommunityStores?.delete(file);
    const restored = new MemoryCommunityStore(file);
    expect(await restored.listToolCatalog()).toEqual(CURATED_TOOLS.slice(1));
    expect(await restored.listTools()).toEqual([]);
    expect(await restored.approveTool(curated.id)).toBe(false);
    await expect(restored.setVote(target, "actor-a", true)).rejects.toMatchObject({ status: 404 });
    await expect(restored.setProfileVote(target, "profile-a", 1)).rejects.toMatchObject({ status: 404 });
    expect((await restored.readVotes("actor-a")).counts).not.toHaveProperty(target);
    expect((await restored.readProfileVotes("profile-a")).votes).not.toHaveProperty(target);
    expect(await restored.createTool({ ...curated, status: "pending", source: "community" })).toBe(true);
    await expect(restored.setProfileVote(target, "profile-a", 1)).rejects.toMatchObject({ status: 404 });
    expect((await restored.listToolCatalog()).filter((tool) => tool.id === curated.id)).toHaveLength(1);
    await restored.approveTool(curated.id);
    expect(await restored.setProfileVote(target, "profile-a", 1)).toMatchObject({ count: 1 });
  });

  it("enforces directory capacity without losing existing tools", async () => {
    const store = new MemoryCommunityStore(null);
    await Promise.all(Array.from({ length: 1_000 }, (_, index) => store.createTool(tool(`tool-${index}`))));
    await expect(store.createTool(tool("overflow"))).rejects.toMatchObject({ status: 409, code: "tools_full" });
    expect(await store.createTool(tool("tool-0"))).toBe(false);
    expect(await store.listTools()).toHaveLength(1_000);
    await store.removeTool("tool-0");
    expect(await store.createTool(tool("replacement"))).toBe(true);
  });

  it("requires approval before voting and preserves submitted metadata", async () => {
    const { store } = temporaryStore();
    const submitted = tool("review", "https://review.example/", "pending");
    await store.createTool(submitted);
    expect(await store.listTools()).toEqual([submitted]);
    await expect(store.setVote("tool:review", "actor-a", true)).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(await store.approveTool("missing")).toBe(false);
    expect(await store.approveTool("review")).toBe(true);
    expect(await store.listTools()).toEqual([{ ...submitted, status: "approved" }]);
    expect(await store.approveTool("review")).toBe(true);
    expect(await store.setVote("tool:review", "actor-a", true)).toMatchObject({ count: 1 });
    await store.removeTool("review");
    expect(await store.approveTool("review")).toBe(false);
    expect((await store.readVotes("actor-a")).counts).not.toHaveProperty("tool:review");
  });

  it("keeps legacy tools without review status unvotable until reviewed", async () => {
    const store = new MemoryCommunityStore(null);
    const legacy = tool("legacy-review");
    Reflect.deleteProperty(legacy, "status");
    await store.createTool(legacy);
    await expect(store.setVote("tool:legacy-review", "actor-a", true)).rejects.toMatchObject({ status: 404 });
    expect(await store.approveTool(legacy.id)).toBe(true);
    expect(await store.listTools()).toEqual([{ ...legacy, status: "approved" }]);
    expect(await store.setVote("tool:legacy-review", "actor-a", true)).toMatchObject({ count: 1 });
  });
});
