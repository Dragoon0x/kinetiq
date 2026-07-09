"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import {
  BalanceMobile,
  type BalanceMobileItem,
} from "@/registry/ui/balance-mobile";

/** Fixed payload manifest — the weights are the rig's honest torque input. */
const PODS: BalanceMobileItem[] = [
  { id: "pod-a", label: "POD A", weight: 1 },
  { id: "pod-b", label: "POD B", weight: 1.4 },
  { id: "pod-c", label: "POD C", weight: 1 },
  { id: "pod-d", label: "POD D", weight: 0.8 },
];

/** REBALANCE settles ~700ms after release; a beat of margin on top. */
const SETTLE_MS = 1100;

/**
 * BalanceMobile dressed as a bench rig: bezel plate with corner ticks, mono
 * spec header, and a live status line. The status listens at the capture
 * phase — pointer holds read as REBALANCING until a fixed beat after release,
 * keyboard tugs schedule the same settle — so the component's API stays
 * exactly items/height/label.
 */
export function BalanceMobileDemo() {
  const [trimmed, setTrimmed] = React.useState(true);
  const held = React.useRef(false);
  const timer = React.useRef<number | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  React.useEffect(() => clearTimer, [clearTimer]);

  const settleSoon = () => {
    clearTimer();
    setTrimmed(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setTrimmed(true);
    }, SETTLE_MS);
  };

  const onPodDown = (event: React.PointerEvent) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("button") === null) return;
    held.current = true;
    clearTimer();
    setTrimmed(false);
  };

  const onPodUp = () => {
    if (!held.current) return;
    held.current = false;
    settleSoon();
  };

  const onPodKey = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("button") === null) return;
    settleSoon();
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="border-hairline bg-surface-0 relative rounded-4 border p-4">
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
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">PAYLOAD TRIM · 04 PODS</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-080</span>
        </div>

        <div
          onPointerDownCapture={onPodDown}
          onPointerUpCapture={onPodUp}
          onPointerCancelCapture={onPodUp}
          onKeyDownCapture={onPodKey}
        >
          <BalanceMobile items={PODS} aria-label="Payload trim mobile" />
        </div>

        <p
          role="status"
          className="border-hairline text-label mt-3 flex items-center justify-between border-t pt-3"
        >
          <span className="text-ink-3">RIG STATUS</span>
          <span className={trimmed ? "text-signal" : "text-warn"}>
            {trimmed ? "TRIMMED" : "REBALANCING"}
          </span>
        </p>
      </div>

      <p className="text-ink-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Pull a pod and let go - the rig swings back through balance.
      </p>
    </div>
  );
}
