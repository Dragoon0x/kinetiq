"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PrintHold } from "@/registry/ui/print-hold";

export const tweaks = defineTweaks({
  scan: {
    kind: "range",
    label: "Scan",
    default: 1.6,
    min: 1,
    max: 3,
    step: 0.1,
    unit: "s",
  },
  ridges: {
    kind: "range",
    label: "Ridges",
    default: 10,
    min: 6,
    max: 14,
    step: 1,
  },
  colour: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", amber: "Amber", ink: "Ink" },
  },
  feedback: {
    kind: "choice",
    label: "Feedback",
    default: "tick",
    options: ["tick", "unlock"],
    names: { tick: "Tick", unlock: "Unlock" },
  },
});

/** How long Coldbrook takes to answer, so the waiting state is seen. */
const ANSWER_MS = 450;

/**
 * Approving a Coldbrook Bank transfer: the amount and payee above a pad you
 * hold until its ridges fill. The bank takes a moment to answer, then the
 * transfer is approved; Reset arms the pad again.
 */
export function PrintHoldDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [approved, setApproved] = React.useState(false);
  const pending = React.useRef<number[]>([]);

  React.useEffect(() => {
    const owned = pending.current;
    return () => {
      for (const t of owned) window.clearTimeout(t);
      owned.length = 0;
    };
  }, []);

  const verify = React.useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        pending.current.push(window.setTimeout(() => resolve(true), ANSWER_MS));
      }),
    [],
  );

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Approve transfer
            </p>
            <p
              className="truncate text-xs text-ink-3"
              title="To Fernworks Supply"
            >
              To Fernworks Supply
            </p>
          </div>
          <p className="shrink-0 font-mono text-sm text-foreground tabular-nums">
            1,240.00
          </p>
        </div>
        <PrintHold
          label="Hold to approve 1,240.00 to Fernworks Supply"
          confirmed={approved}
          onConfirmedChange={setApproved}
          verify={verify}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {approved ? (
              <>
                <span className="text-signal">transfer approved</span> ·
                1,240.00 sent
              </>
            ) : (
              <>
                <span className="text-signal">transfer pending</span> · hold the
                pad
              </>
            )}
          </p>
          <button
            type="button"
            disabled={!approved}
            onClick={() => setApproved(false)}
            className="inline-flex h-7 shrink-0 items-center justify-center rounded-2 border border-hairline-strong px-2.5 text-xs text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}
