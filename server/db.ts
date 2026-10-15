import { HttpError } from "./http.js";
import type { Store } from "./store.js";
import { MemoryStore } from "./store-memory.js";
import { RedisStore } from "./store-redis.js";
import { PostgresStore } from "./store-postgres.js";
import { createPostgresPool } from "./postgres.js";

let store: Store | undefined;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (process.env.DATABASE_URL) {
    store = new PostgresStore(createPostgresPool(process.env.DATABASE_URL));
  } else if (url && token) {
    store = new RedisStore(url, token);
  } else if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    // A per-instance memory store in production would silently lose sign-ups.
    throw new HttpError(503, "storage_missing", "Storage isn't configured yet. Set DATABASE_URL for Neon Postgres or connect Upstash Redis.");
  } else {
    store = new MemoryStore();
  }
  return store;
}
