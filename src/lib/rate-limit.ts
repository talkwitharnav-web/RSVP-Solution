import { NextResponse } from "next/server";

/**
 * Simple in-memory fixed-window rate limiter, keyed by client IP + a caller-
 * supplied bucket name. In-memory (not Redis/DB-backed) is fine here — this
 * is a single-process app (see server.js), and the goal is just to blunt
 * naive scripted abuse of the handful of routes anyone on the internet can
 * hit with no auth (login, signup, RSVP submission), not to survive a
 * multi-instance deployment. Resets on process restart, same as every other
 * in-memory globalThis state this app already relies on (WS client set,
 * heartbeat interval).
 */
type Bucket = { count: number; resetAt: number };

const buckets: Map<string, Bucket> = (globalThis as unknown as { __rsvpRateLimitBuckets?: Map<string, Bucket> })
  .__rsvpRateLimitBuckets ?? new Map();
(globalThis as unknown as { __rsvpRateLimitBuckets?: Map<string, Bucket> }).__rsvpRateLimitBuckets = buckets;

function clientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

/**
 * Returns null if the request is within limits (and records the attempt),
 * or a 429 NextResponse to return immediately if the caller has exceeded
 * `max` attempts within `windowMs`.
 */
export function rateLimit(req: Request, bucketName: string, max: number, windowMs: number): NextResponse | null {
  const key = `${bucketName}:${clientIp(req)}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  existing.count += 1;
  return null;
}
