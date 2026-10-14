import { HttpError } from "./http.js";
import type { Store } from "./store.js";
import { MemoryStore } from "./store-memory.js";
import { RedisStore } from "./store-redis.js";

let store: Store | undefined;

export function getStore(): Store {
  if (store) return store;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    store = new RedisStore(url, token);
  } else if (process.env.VERCEL) {
    // A per-instance memory store in production would silently lose sign-ups.
    throw new HttpError(503, "storage_missing", "Storage isn't configured yet. Connect Upstash Redis to this project.");
  } else {
    store = new MemoryStore();
  }
  return store;
}
