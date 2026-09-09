/**
 * In-memory sliding window rate limiter for critical actions (e.g. login).
 * Periodically purges expired entries to prevent memory leaks.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, RateLimitEntry>();

// Purge expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of stores.entries()) {
      if (entry.resetAt <= now) {
        stores.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref?.();
}

export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000,
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = stores.get(key);

  if (!entry || entry.resetAt <= now) {
    stores.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, retryAfterSeconds: 0 };
  }

  if (entry.count >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: maxAttempts - entry.count,
    retryAfterSeconds: 0,
  };
}

export function resetRateLimit(key: string) {
  stores.delete(key);
}
