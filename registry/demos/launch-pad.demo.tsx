"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LaunchPad, type LaunchPadState } from "@/registry/ui/launch-pad";

export const tweaks = defineTweaks({
  countdown: {
    kind: "range",
    label: "Countdown",
    default: 3,
    min: 0,
    max: 5,
    step: 1,
    unit: "s",
  },
  thrust: {
    kind: "range",
    label: "Thrust",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  shake: {
    kind: "range",
    label: "Shake",
    default: 6,
    min: 0,
    max: 12,
    step: 1,
    unit: "px",
  },
});

const COMMITS = ["8f3c2e1", "a41d09c", "3be7f52", "d02c6a8", "6e19b4f"];
/** How long the Fernworks pipeline takes to go green, in ms. */
const PIPELINE = 1800;

/**
 * Shipping Fernworks web to production: the pad counts down so a stray
 * click can be called off, and each launch that lands bumps the patch.
 */
export function LaunchPadDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The patch that is live now; the next launch ships the one after it.
  const [live, setLive] = React.useState(1);
  const [phase, setPhase] = React.useState<LaunchPadState>("idle");
  const [aborted, setAborted] = React.useState(false);
  const [failNext, setFailNext] = React.useState(false);

  const shipped = `v2.4.${live}`;
  const next = `v2.4.${live + 1}`;
  const commit = COMMITS[live % COMMITS.length] ?? "8f3c2e1";

  const onLaunch = () => {
    const fail = failNext;
    setFailNext(false);
    return new Promise<void>((resolve, reject) => {
      window.setTimeout(
        () => (fail ? reject(new Error("Checks failed")) : resolve()),
        PIPELINE,
      );
    });
  };

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-3 border border-hairline bg-card py-2 pr-2 pl-4">
        <div className="min-w-0">
          <p className="truncate text-sm text-foreground">Fernworks web</p>
          <p className="truncate font-mono text-[11px] text-ink-3">
            main · {commit} → production
          </p>
        </div>
        <LaunchPad
          version={phase === "success" ? shipped : next}
          onLaunch={onLaunch}
          onStateChange={(state) => {
            setPhase(state);
            if (state === "countdown" || state === "pending") setAborted(false);
            if (state === "success") setLive((n) => n + 1);
          }}
          onAbort={() => setAborted(true)}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {phase === "countdown" ? (
              <>
                <span className="text-signal">counting down</span> · press again
                to abort
              </>
            ) : phase === "pending" ? (
              <>
                <span className="text-signal">deploying {next}</span> · pipeline
                running
              </>
            ) : phase === "success" ? (
              <>
                <span className="text-signal">live · {shipped}</span> ·
                production
              </>
            ) : phase === "error" ? (
              <>
                <span className="text-signal">failed · checks failed</span> ·
                press to retry
              </>
            ) : aborted ? (
              <>
                <span className="text-signal">aborted</span> · nothing shipped
              </>
            ) : (
              <>
                <span className="text-signal">ready</span> · {shipped} on
                production
              </>
            )}
          </p>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-2 border px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              failNext
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            Fail next
          </button>
        </div>
      ) : null}
    </div>
  );
}
