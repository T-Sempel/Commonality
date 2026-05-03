// =============================================================================
// RATE LIMITER
// =============================================================================
// Simple in-memory token bucket. Works for single-region Vercel deployments
// and local dev. For multi-region or higher-traffic prod, swap the implementation
// for Upstash Redis (https://upstash.com) — same API, just persists across
// function invocations and regions.
//
// Used to gate:
//   - OTP send: 3 per email per hour
//   - OTP verify: 5 attempts per code
//   - Message send for new accounts: 10 per minute
//   - Report creation: 5 per user per day
// =============================================================================

interface Bucket {
  tokens: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

export interface RateLimitOptions {
  key: string;
  max: number;
  windowMs: number;
}

export function rateLimit({ key, max, windowMs }: RateLimitOptions): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let b = store.get(key);
  if (!b || b.resetAt < now) {
    b = { tokens: max, resetAt: now + windowMs };
    store.set(key, b);
  }
  if (b.tokens <= 0) {
    return { ok: false, remaining: 0, resetAt: b.resetAt };
  }
  b.tokens -= 1;
  return { ok: true, remaining: b.tokens, resetAt: b.resetAt };
}

// Sweep occasionally so the Map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k);
  }
}, 60_000).unref?.();

// -----------------------------------------------------------------------------
// PRE-CONFIGURED LIMITERS
// -----------------------------------------------------------------------------

export const limits = {
  otpSend: (email: string) =>
    rateLimit({ key: `otp:send:${email.toLowerCase()}`, max: 3, windowMs: 60 * 60 * 1000 }),

  otpVerify: (email: string) =>
    rateLimit({ key: `otp:verify:${email.toLowerCase()}`, max: 5, windowMs: 15 * 60 * 1000 }),

  messageSend: (userId: string) =>
    rateLimit({ key: `msg:${userId}`, max: 10, windowMs: 60 * 1000 }),

  reportCreate: (userId: string) =>
    rateLimit({ key: `report:${userId}`, max: 5, windowMs: 24 * 60 * 60 * 1000 }),
};
