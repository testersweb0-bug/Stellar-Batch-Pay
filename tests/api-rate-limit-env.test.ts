/**
 * Tests for the env-configurable rate limits (#271).
 *
 * We `vi.resetModules()` before each assertion because the limits
 * are computed at module-load time, so we have to reload the module
 * after mutating process.env to observe new values.
 */

import { describe, expect, test, beforeEach, vi } from "vitest";

const ENV_KEYS = [
  "RATE_LIMIT_BATCH_BUILD_FREE",
  "RATE_LIMIT_BATCH_BUILD_PRO",
  "RATE_LIMIT_BATCH_BUILD_ENTERPRISE",
  "RATE_LIMIT_BATCH_BUILD_WINDOW_MS",
  "RATE_LIMIT_BATCH_SUBMIT_FREE",
];

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

beforeEach(() => {
  vi.resetModules();
  clearEnv();
});

describe("getEndpointLimits (#271)", () => {
  test("uses the shipped defaults when no env vars are set", async () => {
    const { getEndpointLimits } = await import("../lib/api-rate-limit");
    const limits = getEndpointLimits();
    expect(limits["batch-build"]).toEqual({
      free: 8,
      pro: 20,
      enterprise: 60,
      windowMs: 60_000,
    });
    expect(limits["batch-submit"].free).toBe(5);
  });

  test("RATE_LIMIT_BATCH_BUILD_FREE overrides the free-tier limit", async () => {
    process.env.RATE_LIMIT_BATCH_BUILD_FREE = "42";
    const { getEndpointLimits } = await import("../lib/api-rate-limit");
    expect(getEndpointLimits()["batch-build"].free).toBe(42);
  });

  test("RATE_LIMIT_BATCH_BUILD_WINDOW_MS overrides the window", async () => {
    process.env.RATE_LIMIT_BATCH_BUILD_WINDOW_MS = "30000";
    const { getEndpointLimits } = await import("../lib/api-rate-limit");
    expect(getEndpointLimits()["batch-build"].windowMs).toBe(30_000);
  });

  test("non-numeric env values fall back to the shipped default", async () => {
    process.env.RATE_LIMIT_BATCH_BUILD_PRO = "not-a-number";
    const { getEndpointLimits } = await import("../lib/api-rate-limit");
    expect(getEndpointLimits()["batch-build"].pro).toBe(20);
  });

  test("zero / negative values fall back so a typo can't disable a tier", async () => {
    process.env.RATE_LIMIT_BATCH_SUBMIT_FREE = "0";
    const { getEndpointLimits } = await import("../lib/api-rate-limit");
    expect(getEndpointLimits()["batch-submit"].free).toBe(5);
  });
});
