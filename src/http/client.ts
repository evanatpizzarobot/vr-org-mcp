/**
 * HTTP client for VR.org's public JSON API, with in-process response
 * caching and a simple per-tool token bucket.
 *
 * Caching: short TTLs keyed by request. The live feed and trending topics
 * refresh every 15 minutes on the server, so a 60s client cache is plenty
 * fresh while shielding VR.org from a chatty agent. Static-ish data (deals,
 * top lists, originals) gets a longer TTL.
 *
 * Rate limiting: a per-tool token bucket smooths bursts. There is no hard
 * global cap; the real ceiling is VR.org's own nginx.
 */

import { BASE_URL, userAgent } from "../config.js";
import { UpstreamError } from "../security/errors.js";

const FETCH_TIMEOUT_MS = 10_000;

export async function fetchJson(
  pathname: string,
  params?: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL(BASE_URL + pathname);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", "User-Agent": userAgent() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new UpstreamError(res.status, pathname);
  }
  return res.json();
}

// -------- in-memory cache --------

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE = new Map<string, CacheEntry>();
const CACHE_MAX = 200;

export const TTL = {
  FEED: 60_000,
  TRENDING: 60_000,
  ARTICLES: 5 * 60_000,
  DEALS: 10 * 60_000,
  TOP_LISTS: 10 * 60_000,
  SOURCES: 5 * 60_000,
} as const;

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value as T;
  }
  const value = await loader();
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest) CACHE.delete(oldest);
  }
  CACHE.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

// -------- simple token bucket per tool --------

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const BUCKETS = new Map<string, Bucket>();
const BUCKET_CAPACITY = 30;
const BUCKET_REFILL_PER_SEC = 10;

export async function rateLimit(tool: string): Promise<void> {
  const now = Date.now();
  let b = BUCKETS.get(tool);
  if (!b) {
    b = { tokens: BUCKET_CAPACITY, lastRefill: now };
    BUCKETS.set(tool, b);
  }
  const elapsedSec = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + elapsedSec * BUCKET_REFILL_PER_SEC);
  b.lastRefill = now;
  if (b.tokens < 1) {
    const waitMs = Math.ceil(((1 - b.tokens) / BUCKET_REFILL_PER_SEC) * 1000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    b.tokens = 0;
  } else {
    b.tokens -= 1;
  }
}

export function _resetCache(): void {
  CACHE.clear();
  BUCKETS.clear();
}
