// A small fixed-window rate limiter: "at most N requests per key per window".
//
// Used to protect the free AI key (per-user and per-day limits) and the login
// form (slows down password guessing).
//
// Limitation, on purpose for a learning project: counts live in this server's
// memory. On Vercel, each serverless instance has its own memory, so limits
// are per instance and reset on cold starts. For real production use a shared
// store such as Upstash Redis — the function signature can stay the same.

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  let w = buckets.get(key);
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + windowMs };
    buckets.set(key, w);
  }
  if (w.count >= limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count++;
  // Keep memory bounded: occasionally drop expired windows.
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
  return { ok: true, remaining: limit - w.count, retryAfterSec: 0 };
}

/** For tests only. */
export function resetRateLimits() {
  buckets.clear();
}

/** Best-effort client IP (Vercel and most proxies set x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}
