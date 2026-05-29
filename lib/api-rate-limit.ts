import { NextRequest, NextResponse } from "next/server";

type Tier = "free" | "pro" | "enterprise";
type EndpointKey = "batch-build" | "batch-submit" | "batch-submit-signed" | "webhook-register";

type EndpointLimit = {
  free: number;
  pro: number;
  enterprise: number;
  windowMs: number;
};

type RateBucket = {
  remaining: number;
  resetAt: number;
};

// #271: env-tunable defaults. The shipping numbers below are kept as
// the deployment baseline; each tier of each endpoint can be raised
// or lowered without a code change via the matching env var:
//
//   RATE_LIMIT_<ENDPOINT>_<TIER>=<requests-per-window>
//   RATE_LIMIT_<ENDPOINT>_WINDOW_MS=<milliseconds>
//
// e.g. `RATE_LIMIT_BATCH_BUILD_PRO=50`. Missing / non-numeric env
// values fall back to the shipped defaults so dev keeps working.
function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envKey(endpoint: EndpointKey): string {
  // batch-build → BATCH_BUILD
  return endpoint.toUpperCase().replace(/-/g, "_");
}

function tunedLimit(
  endpoint: EndpointKey,
  defaults: EndpointLimit,
): EndpointLimit {
  const k = envKey(endpoint);
  return {
    free: intEnv(`RATE_LIMIT_${k}_FREE`, defaults.free),
    pro: intEnv(`RATE_LIMIT_${k}_PRO`, defaults.pro),
    enterprise: intEnv(`RATE_LIMIT_${k}_ENTERPRISE`, defaults.enterprise),
    windowMs: intEnv(`RATE_LIMIT_${k}_WINDOW_MS`, defaults.windowMs),
  };
}

const DEFAULT_LIMITS: Record<EndpointKey, EndpointLimit> = {
  "batch-build": { free: 8, pro: 20, enterprise: 60, windowMs: 60_000 },
  "batch-submit": { free: 5, pro: 15, enterprise: 45, windowMs: 60_000 },
  "batch-submit-signed": { free: 5, pro: 15, enterprise: 45, windowMs: 60_000 },
  "webhook-register": { free: 3, pro: 10, enterprise: 30, windowMs: 60_000 },
};

const endpointLimits: Record<EndpointKey, EndpointLimit> = {
  "batch-build": tunedLimit("batch-build", DEFAULT_LIMITS["batch-build"]),
  "batch-submit": tunedLimit("batch-submit", DEFAULT_LIMITS["batch-submit"]),
  "batch-submit-signed": tunedLimit(
    "batch-submit-signed",
    DEFAULT_LIMITS["batch-submit-signed"],
  ),
  "webhook-register": tunedLimit(
    "webhook-register",
    DEFAULT_LIMITS["webhook-register"],
  ),
};

/**
 * Read-only accessor for the configured limits. Useful for tests +
 * an `/api/health` style endpoint.
 */
export function getEndpointLimits(): Record<EndpointKey, EndpointLimit> {
  return endpointLimits;
}

const buckets = new Map<string, RateBucket>();

function resolveTier(request: NextRequest): Tier {
  const rawTier = (request.headers.get("x-api-tier") || "free").toLowerCase();
  if (rawTier === "enterprise") return "enterprise";
  if (rawTier === "pro") return "pro";
  return "free";
}

function resolveIdentifier(request: NextRequest): string {
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) {
    return `auth:${auth.slice(7, 31)}`;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return `ip:${ip}`;
  }
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return `ip:${cfIp}`;
  return "ip:unknown";
}

export function applyRateLimit(request: NextRequest, endpoint: EndpointKey): {
  blocked: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
  response?: NextResponse;
} {
  const tier = resolveTier(request);
  const policy = endpointLimits[endpoint];
  const limit = policy[tier];
  const now = Date.now();
  const key = `${endpoint}:${tier}:${resolveIdentifier(request)}`;
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    buckets.set(key, {
      remaining: limit - 1,
      resetAt: now + policy.windowMs,
    });
    return {
      blocked: false,
      remaining: Math.max(0, limit - 1),
      retryAfterSec: Math.ceil(policy.windowMs / 1000),
      limit,
    };
  }

  if (existing.remaining <= 0) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    const response = NextResponse.json(
      { error: "Too Many Requests", detail: "Rate limit exceeded for this endpoint." },
      { status: 429 },
    );
    response.headers.set("Retry-After", String(retryAfterSec));
    response.headers.set("X-RateLimit-Remaining", "0");
    response.headers.set("X-RateLimit-Limit", String(limit));
    return { blocked: true, remaining: 0, retryAfterSec, limit, response };
  }

  existing.remaining -= 1;
  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    blocked: false,
    remaining: existing.remaining,
    retryAfterSec,
    limit,
  };
}

export function setRateLimitHeaders(response: NextResponse, state: {
  remaining: number;
  retryAfterSec: number;
  limit: number;
}) {
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, state.remaining)));
  response.headers.set("X-RateLimit-Limit", String(state.limit));
  response.headers.set("Retry-After", String(state.retryAfterSec));
  return response;
}

