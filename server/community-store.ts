import type { CommunityStore } from "./community-contract.js";
import { MemoryCommunityStore } from "./community-memory.js";
import { PostgresCommunityStore } from "./community-postgres.js";
import { RedisCommunityStore } from "./community-redis.js";
import { HttpError } from "./http.js";
import { createPostgresPool } from "./postgres.js";

let store: CommunityStore | undefined;

export function getCommunityStore(): CommunityStore {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (process.env.DATABASE_URL) {
    store = new PostgresCommunityStore(createPostgresPool(process.env.DATABASE_URL));
  } else if (url && token) {
    store = new RedisCommunityStore(url, token);
  } else if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new HttpError(503, "storage_missing", "Storage isn't configured yet. Set DATABASE_URL for Neon Postgres or connect Upstash Redis.");
  } else {
    store = new MemoryCommunityStore();
  }
  return store;
}
