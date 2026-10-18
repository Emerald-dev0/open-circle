import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LocalForumStore } from "../server/forum-store";
import { commandForum, readForum } from "../server/forum";
import { admin, alice, command, content, forumContract, poll } from "./helpers/forum-contract";


describe("local forum contract", () => forumContract(() => new LocalForumStore(null)));
it("persists committed threads, comments, votes, requests and private revisions across local store restarts", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "opencircle-forum-"));
  try {
    const file = path.join(directory, "forum.json");
    const first = new LocalForumStore(file);
    const post = await commandForum(first, admin, command({ action: "create", kind: "discussion", content, publish: true, poll }));
    await commandForum(first, alice, command({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_2" }));
    await commandForum(first, alice, command({ action: "comment", id: post.id, body: "Saved across restarts" }));
    await commandForum(first, alice, command({ action: "like", id: post.id, liked: true }));
    expect(await readForum(new LocalForumStore(file), alice, post.id)).toMatchObject({ commentCount: 1, likeCount: 1, liked: true, poll: { total: 1, selected: "option_2" } });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
