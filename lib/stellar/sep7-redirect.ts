/**
 * SEP-7 redirect / polling helpers (#268).
 *
 * The mobile signing flow is inherently asymmetric — the dApp opens
 * a deep-link URI and the wallet signs out-of-band, so the original
 * `signTx` invocation cannot synchronously resolve to a signed XDR.
 *
 * Previously `signTx` returned `new Promise(() => {})` — a promise
 * that NEVER resolves — which left the calling component stuck in
 * its "signing" state forever. This module defines:
 *
 *   - `Sep7RedirectError`: a typed sentinel error the UI can catch
 *     to switch to a "Waiting for mobile wallet" polling screen
 *     instead of hanging on the awaited promise.
 *   - `pollForTxHash(...)`: polls `/api/tx-status` until the signed
 *     transaction appears on-chain (or a max-wait expires).
 */

export class Sep7RedirectError extends Error {
  /** Sentinel for `error instanceof Sep7RedirectError`. */
  public readonly isSep7Redirect = true as const;
  /** The deep-link URI the wallet handler was sent to. */
  public readonly uri: string;
  /**
   * The hash of the (still-unsigned) inner transaction so callers
   * can poll for it. Computed from the XDR by the caller.
   */
  public readonly innerTxHash?: string;

  constructor(uri: string, innerTxHash?: string) {
    super(
      "Signing was handed off to a SEP-7 wallet via deep link; the dApp must poll for the signed transaction.",
    );
    this.name = "Sep7RedirectError";
    this.uri = uri;
    this.innerTxHash = innerTxHash;
  }
}

export interface PollForTxHashOptions {
  /** Inner-tx hash (hex). The dApp can pre-compute this from the XDR. */
  hash: string;
  /** Total wait time before giving up. Defaults to 5 minutes. */
  maxWaitMs?: number;
  /** Initial polling delay. Doubles up to `maxIntervalMs`. */
  initialIntervalMs?: number;
  maxIntervalMs?: number;
  /** Abort signal for early cancel from the UI. */
  signal?: AbortSignal;
  /** Override for `fetch`, mostly for tests. */
  fetchImpl?: typeof fetch;
}

export interface PollForTxHashResult {
  found: boolean;
  hash: string;
  /** Time the loop waited in total, in ms. */
  waitedMs: number;
}

/**
 * Polls a tx-status endpoint until the wallet has submitted the
 * signed transaction. Exponential backoff between polls so we don't
 * hammer the backend during the wallet round-trip.
 */
export async function pollForTxHash(
  opts: PollForTxHashOptions,
): Promise<PollForTxHashResult> {
  const {
    hash,
    maxWaitMs = 5 * 60 * 1000,
    initialIntervalMs = 1_500,
    maxIntervalMs = 8_000,
    signal,
    fetchImpl = fetch,
  } = opts;
  const start = Date.now();
  let interval = initialIntervalMs;

  while (Date.now() - start < maxWaitMs) {
    if (signal?.aborted) {
      return { found: false, hash, waitedMs: Date.now() - start };
    }
    try {
      const res = await fetchImpl(
        `/api/tx-status?hash=${encodeURIComponent(hash)}`,
        { signal },
      );
      if (res.ok) {
        const body = await res.json();
        if (body?.status === "found" || body?.found === true) {
          return { found: true, hash, waitedMs: Date.now() - start };
        }
      }
    } catch {
      // Network blip — keep polling.
    }
    await new Promise((r) => setTimeout(r, interval));
    interval = Math.min(maxIntervalMs, Math.round(interval * 1.5));
  }
  return { found: false, hash, waitedMs: Date.now() - start };
}
