/**
 * In-memory sliding-window rate limiter for Exit Ticket API endpoints.
 *
 * NOTE: This implementation is per-process (single Node.js instance).
 * For horizontal scaling with multiple instances, replace the Map below
 * with a Redis-backed implementation using ioredis (already a project
 * dependency) and atomic INCR/EXPIRE commands.
 */

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20;

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check whether the given IP is within the rate limit.
 *
 * @param ip - The client IP address used as the rate-limit key.
 * @returns `{ allowed: true }` if the request is permitted, or
 *          `{ allowed: false, retryAfter: <seconds> }` if the limit is exceeded.
 */
export function checkRateLimit(
  ip: string,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  // No entry or window has expired — start a fresh window
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  // Limit reached — deny and tell the caller how long to wait
  if (entry.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  // Within limit — increment and allow
  entry.count += 1;
  return { allowed: true };
}

/**
 * Reset the in-memory rate-limit store.
 * Intended for test isolation only — do not call in production code.
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}
