/**
 * Network-config tests (#272).
 *
 * Pins the env-var ↔ default fallback contract so a future drop of
 * the public SDF URLs doesn't silently regress.
 */

import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { horizonUrl, sorobanRpcUrl } from "../lib/stellar/network-config";

const ENV_KEYS = [
  "HORIZON_URL_TESTNET",
  "HORIZON_URL_MAINNET",
  "NEXT_PUBLIC_HORIZON_URL_TESTNET",
  "NEXT_PUBLIC_HORIZON_URL_MAINNET",
  "SOROBAN_RPC_URL_TESTNET",
  "SOROBAN_RPC_URL_MAINNET",
  "NEXT_PUBLIC_SOROBAN_RPC_URL_TESTNET",
  "NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET",
];

let snapshot: Record<string, string | undefined> = {};

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(snapshot)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("horizonUrl (#272)", () => {
  test("falls back to public SDF nodes when nothing is set", () => {
    expect(horizonUrl("testnet")).toBe("https://horizon-testnet.stellar.org");
    expect(horizonUrl("mainnet")).toBe("https://horizon.stellar.org");
  });

  test("HORIZON_URL_TESTNET overrides the default", () => {
    process.env.HORIZON_URL_TESTNET = "https://horizon-private.example.com";
    expect(horizonUrl("testnet")).toBe("https://horizon-private.example.com");
  });

  test("NEXT_PUBLIC_HORIZON_URL_MAINNET wins over the non-prefixed env var", () => {
    process.env.HORIZON_URL_MAINNET = "https://server-side.example.com";
    process.env.NEXT_PUBLIC_HORIZON_URL_MAINNET = "https://public.example.com";
    expect(horizonUrl("mainnet")).toBe("https://public.example.com");
  });

  test("whitespace-only env values fall back to the default", () => {
    process.env.HORIZON_URL_TESTNET = "   ";
    expect(horizonUrl("testnet")).toBe("https://horizon-testnet.stellar.org");
  });
});

describe("sorobanRpcUrl (#272)", () => {
  test("falls back to public Soroban RPC when nothing is set", () => {
    expect(sorobanRpcUrl("testnet")).toBe("https://soroban-testnet.stellar.org");
    expect(sorobanRpcUrl("mainnet")).toBe("https://soroban-mainnet.stellar.org");
  });
  test("SOROBAN_RPC_URL_TESTNET overrides the default", () => {
    process.env.SOROBAN_RPC_URL_TESTNET = "https://rpc-private.example.com";
    expect(sorobanRpcUrl("testnet")).toBe("https://rpc-private.example.com");
  });
});
