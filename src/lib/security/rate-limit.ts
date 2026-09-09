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

/**
 * Evaluates whether an incoming action or request violates rate limiting constraints.
 *
 * Implements a memory-safe sliding window counter:
 * - If no previous record exists or window expired, creates a fresh record with `count = 1`.
 * - If count exceeds `maxAttempts`, returns `{ allowed: false }` with remaining cooldown seconds.
 * - Otherwise increments the counter and returns `{ allowed: true }` with remaining attempts.
 *
 * @param key Unique rate limiting key (e.g., `login:${ip}`).
 * @param maxAttempts Maximum permitted attempts within the window (default: 5).
 * @param windowMs Duration of the sliding window in milliseconds (default: 15 minutes).
 * @returns Object indicating whether the attempt is allowed, remaining quota, and retry cooldown in seconds.
 */
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

/**
 * Resets or clears the rate limit record for a specific key.
 * Typically called after a successful authentication to prevent lockouts on legitimate users.
 *
 * @param key Rate limit key to clear (e.g. `login:${ip}`).
 */
export function resetRateLimit(key: string) {
  stores.delete(key);
}
