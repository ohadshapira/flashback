import { ApiError } from './errors';

type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __fbRl?: Map<string, Bucket> };
const buckets = (g.__fbRl ??= new Map<string, Bucket>());

/** Fixed-window in-memory limiter. Throws 429 when exceeded. */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()) {
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > max) throw new ApiError(429, 'rate_limited', 'Too many requests, slow down');
}

export function resetRateLimits() {
  buckets.clear();
}
