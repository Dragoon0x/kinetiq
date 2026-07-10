"use client";

import * as React from "react";

import { CommitLever } from "@/registry/ui/commit-lever";
import { cn } from "@/registry/lib/utils";

const pad2 = (v: number): string => String(v).padStart(2, "0");

/**
 * CommitLever dressed as the KQ-154 launch quadrant: one guarded lever over
 * the batch release line. Pull past the guard to arm, full travel to send —
 * the counter only moves on a completed throw, and the log line mirrors
 * every guard event.
 */
export function CommitLeverDemo() {
  // KQ-154 boots safe; nothing here is random.
  const [sent, setSent] = React.useState(0);
  const [log, setLog] = React.useState("STANDING BY");

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Launch Quadrant</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-154</span>
        </div>

        <CommitLever
          commitLabel="Release the batch"
          onCommit={() => {
            setSent((count) => count + 1);
            setLog("FULL TRAVEL · BATCH AWAY");
          }}
          onArmChange={(armed) =>
            setLog(armed ? "GUARD CLEARED · ARMED" : "LEVER HOME · SAFE")
          }
        />

        {/* The dispatch counter — moves only on a completed throw. */}
        <p
          role="status"
          className="mt-4 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Batches Sent &middot;{" "}
          <span className="font-mono text-sm text-signal tabular-nums">
            {pad2(sent)}
          </span>
        </p>
        <p className="mt-2 text-center font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase">
          Log &middot; {log}
        </p>

        <p className="mt-4 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-154 &middot; Commit Lever &middot; Travel 95&deg; &middot; Guard
          55&deg; &middot; &zeta; 0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Pull past the guard to arm - full travel sends it.
      </p>
    </div>
  );
}
