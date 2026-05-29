/**
 * Tests for the SEP-7 redirect helpers (#268).
 */

import { describe, expect, test, vi } from "vitest";
import { Sep7RedirectError, pollForTxHash } from "../lib/stellar/sep7-redirect";

describe("Sep7RedirectError (#268)", () => {
  test("is identifiable via instanceof + sentinel field", () => {
    const err = new Sep7RedirectError("web+stellar:tx/?...");
    expect(err).toBeInstanceOf(Sep7RedirectError);
    expect(err.isSep7Redirect).toBe(true);
    expect(err.uri).toMatch(/^web\+stellar:/);
    expect(err.name).toBe("Sep7RedirectError");
  });

  test("carries optional innerTxHash through to the catch site", () => {
    const err = new Sep7RedirectError("uri", "abc123");
    expect(err.innerTxHash).toBe("abc123");
  });
});

describe("pollForTxHash (#268)", () => {
  test("resolves found=true as soon as the tx-status endpoint flips", async () => {
    // Polls 2 times. First call returns not-found; second call returns found.
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      calls += 1;
      const body =
        calls < 2 ? { status: "not_found" } : { status: "found" };
      return {
        ok: true,
        json: async () => body,
      } as Response;
    });
    const out = await pollForTxHash({
      hash: "abc",
      initialIntervalMs: 1,
      maxIntervalMs: 1,
      maxWaitMs: 5_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.found).toBe(true);
    expect(out.hash).toBe("abc");
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  test("returns found=false on max-wait expiry instead of hanging", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "not_found" }),
    } as Response);
    const out = await pollForTxHash({
      hash: "h",
      initialIntervalMs: 5,
      maxIntervalMs: 5,
      maxWaitMs: 25,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.found).toBe(false);
    expect(out.hash).toBe("h");
  });

  test("treats a transient fetch rejection as a non-fatal blip", async () => {
    let calls = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network blip");
      return {
        ok: true,
        json: async () => ({ found: true }),
      } as Response;
    });
    const out = await pollForTxHash({
      hash: "x",
      initialIntervalMs: 1,
      maxIntervalMs: 1,
      maxWaitMs: 2_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.found).toBe(true);
  });
});
