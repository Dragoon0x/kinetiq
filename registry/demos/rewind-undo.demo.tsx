"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  RewindUndo,
  defaultHistory,
  type RewindUndoState,
} from "@/registry/ui/rewind-undo";

export const tweaks = defineTweaks({
  steps: {
    kind: "range",
    label: "Steps per turn",
    default: 6,
    min: 3,
    max: 12,
    step: 1,
  },
  spool: {
    kind: "range",
    label: "Spool weight",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  hold: {
    kind: "range",
    label: "Hold speed-up",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const toggle = (on: boolean) =>
  cn(
    "inline-flex h-7 cursor-pointer items-center rounded-2 border px-2.5 text-xs transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
    on
      ? "border-cobalt-bright/40 bg-cobalt-wash text-cobalt-bright"
      : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

/**
 * A morning's edits to a Fernworks Sheets forecast: press to step back,
 * hold to spool back through them, and redo what you rewound.
 */
export function RewindUndoDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const total = defaultHistory.length;
  const [index, setIndex] = React.useState(total);
  const [phase, setPhase] = React.useState<RewindUndoState>("idle");
  const [failNext, setFailNext] = React.useState(false);
  const failArmed = React.useRef(false);
  const last = defaultHistory[index - 1];

  /** The sheet's server takes a beat to apply an undo — or refuses one. */
  const apply = (_: unknown, signal: AbortSignal) => {
    if (!failArmed.current) return;
    failArmed.current = false;
    setFailNext(false);
    return new Promise<void>((_resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("Sheet locked by another editor")),
        700,
      );
      signal.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          reject(new Error("Cancelled"));
        },
        { once: true },
      );
    });
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3 border border-hairline bg-card py-2.5 pr-2.5 pl-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            Q3 forecast
          </p>
          <p className="truncate text-xs text-ink-3 tabular-nums">
            Fernworks Sheets · {index} of {total} edits
          </p>
        </div>
        <RewindUndo
          className="max-w-full"
          index={index}
          onIndexChange={setIndex}
          onStateChange={setPhase}
          onUndo={apply}
          onRedo={apply}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "pending" ? (
              <span className="text-signal">applying</span>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">undo failed</span> · still at{" "}
                {index} of {total}
              </>
            ) : (
              <>
                <span className="text-signal">
                  {index} of {total} steps
                </span>
                {last ? ` · last: ${last.label}` : " · back at the start"}
              </>
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-pressed={failNext}
              onClick={() => {
                failArmed.current = !failNext;
                setFailNext(!failNext);
              }}
              className={toggle(failNext)}
            >
              Fail next
            </button>
            <button
              type="button"
              onClick={() => setIndex(total)}
              className={toggle(false)}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
