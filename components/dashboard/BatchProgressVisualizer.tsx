"use client";

/**
 * Transaction Status Visualizer (#267).
 *
 * Replaces the static spinner with a real-time progress bar that
 * tracks the four stages a batch goes through:
 *
 *   Building → Signing → Submitting → Confirming
 *
 * For multi-transaction batches, shows per-transaction progress
 * ("Submitting transaction 3 of 7"). Renders the current submitted
 * transaction hash with a link to the appropriate Stellar explorer.
 * Error states are surfaced inline without dismissing progress that
 * has already happened.
 *
 * State is fully controlled by the parent — the parent owns the
 * batch lifecycle and pushes updates via the `progress` prop.
 */

import { CheckCircle2, Circle, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export type BatchStage = "building" | "signing" | "submitting" | "confirming" | "done" | "error";

export interface BatchProgress {
  stage: BatchStage;
  /** 1-indexed; equals 0 before the loop starts. */
  currentTx: number;
  totalTx: number;
  /** Hash of the most recently submitted tx, if any. */
  lastTxHash?: string;
  /** Inline error message rendered without dismissing progress. */
  error?: string;
  /** "testnet" | "mainnet" — drives explorer link. */
  network: "testnet" | "mainnet";
}

interface BatchProgressVisualizerProps {
  progress: BatchProgress;
  className?: string;
}

const STAGE_ORDER: ReadonlyArray<Exclude<BatchStage, "done" | "error">> = [
  "building",
  "signing",
  "submitting",
  "confirming",
];

const STAGE_LABELS: Record<Exclude<BatchStage, "done" | "error">, string> = {
  building: "Building",
  signing: "Signing",
  submitting: "Submitting",
  confirming: "Confirming",
};

function explorerUrl(hash: string, network: "testnet" | "mainnet"): string {
  const base =
    network === "mainnet"
      ? "https://stellar.expert/explorer/public"
      : "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${encodeURIComponent(hash)}`;
}

/** Returns the index of the active stage in `STAGE_ORDER`. */
function activeStageIndex(stage: BatchStage): number {
  if (stage === "done") return STAGE_ORDER.length;
  if (stage === "error") return STAGE_ORDER.indexOf("submitting"); // best effort
  return STAGE_ORDER.indexOf(stage);
}

export function BatchProgressVisualizer({
  progress,
  className,
}: BatchProgressVisualizerProps) {
  const idx = activeStageIndex(progress.stage);
  const totalSteps = STAGE_ORDER.length;
  const percent =
    progress.stage === "done"
      ? 100
      : Math.max(0, Math.min(99, Math.round(((idx + 0.5) / totalSteps) * 100)));

  const showPerTx = progress.totalTx > 1 && progress.currentTx >= 1;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-lg border border-[#1F2937] bg-[#121827] p-6 space-y-5",
        className,
      )}
    >
      {/* Headline */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">
            {progress.stage === "done"
              ? "Batch submitted"
              : progress.stage === "error"
                ? "Batch failed"
                : `Stage: ${STAGE_LABELS[progress.stage as Exclude<BatchStage, "done" | "error">]}`}
          </h3>
          {showPerTx && (
            <p className="text-sm text-gray-400 mt-0.5">
              {progress.stage === "done"
                ? `${progress.totalTx} of ${progress.totalTx} transactions`
                : `Transaction ${progress.currentTx} of ${progress.totalTx}`}
            </p>
          )}
        </div>
        <span className="text-sm font-mono text-gray-400">{percent}%</span>
      </div>

      {/* Progress bar */}
      <div
        className="h-2 w-full rounded-full bg-[#1F2937] overflow-hidden"
        aria-hidden="true"
      >
        <div
          className={cn(
            "h-full transition-[width] duration-300 ease-out",
            progress.stage === "error" ? "bg-red-500/70" : "bg-[#00D98B]",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Stage list */}
      <ol className="space-y-2.5">
        {STAGE_ORDER.map((stage, i) => {
          const isActive = i === idx && progress.stage !== "done" && progress.stage !== "error";
          const isDone = i < idx || progress.stage === "done";
          const isError = progress.stage === "error" && i === idx;
          return (
            <li key={stage} className="flex items-center gap-3 text-sm">
              {isError ? (
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
              ) : isDone ? (
                <CheckCircle2 className="h-5 w-5 text-[#00D98B] shrink-0" />
              ) : isActive ? (
                <Loader2 className="h-5 w-5 text-[#00D98B] animate-spin shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-gray-600 shrink-0" />
              )}
              <span
                className={cn(
                  isActive
                    ? "text-white font-medium"
                    : isDone
                      ? "text-gray-300"
                      : "text-gray-500",
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Latest tx hash with explorer link */}
      {progress.lastTxHash && (
        <div className="border-t border-[#1F2937] pt-4">
          <p className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">
            Latest transaction
          </p>
          <a
            href={explorerUrl(progress.lastTxHash, progress.network)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-mono text-[#00D98B] hover:underline break-all"
            aria-label={`Open transaction ${progress.lastTxHash} on Stellar explorer`}
          >
            <span>{progress.lastTxHash.slice(0, 12)}…{progress.lastTxHash.slice(-8)}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </div>
      )}

      {/* Inline error — does NOT dismiss progress above */}
      {progress.error && (
        <div className="border-t border-red-500/30 pt-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-300">
              {progress.stage === "error" ? "Batch halted" : "Recoverable error"}
            </p>
            <p className="text-sm text-red-200/80 mt-0.5">{progress.error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
