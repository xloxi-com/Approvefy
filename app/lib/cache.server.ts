/**
 * Shop-scoped in-memory LRU cache for serverless warm instances.
 * Keys: `{shop}:{resource}` — use `shopKey()` to build them.
 */
import { LRUCache } from "lru-cache";

type CacheEntry = { value: unknown; expiresAt: number };

const store = new LRUCache<string, CacheEntry>({
  max: 500,
});

export const CACHE_TTL = {
  approvalMode: 5 * 60_000,
  analytics: 2 * 60_000,
  shopMeta: 30 * 60_000,
  formConfig: 5 * 60_000,
  appSettings: 5 * 60_000,
} as const;

export function shopKey(shop: string, resource: string): string {
  return `${(shop || "").trim().toLowerCase()}:${resource}`;
}

export function getCache<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCache(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(key: string): void {
  store.delete(key);
}

export function invalidateShopCache(shop: string): void {
  const prefix = `${(shop || "").trim().toLowerCase()}:`;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
