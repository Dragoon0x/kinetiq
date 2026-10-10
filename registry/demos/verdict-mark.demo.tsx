"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { VerdictMark, type VerdictMarkState } from "@/registry/ui/verdict-mark";

export const tweaks = defineTweaks({
  state: {
    kind: "choice",
    label: "State",
    default: "pending",
    options: ["pending", "success", "warning", "error"],
    names: {
      pending: "Pending",
      success: "Success",
      warning: "Warning",
      error: "Error",
    },
  },
  stroke: {
    kind: "range",
    label: "Stroke",
    default: 3.5,
    min: 1.5,
    max: 6,
    step: 0.5,
  },
  size: {
    kind: "choice",
    label: "Size",
    default: "md",
    options: ["sm", "md", "lg", "xl"],
    names: { sm: "Small", md: "Medium", lg: "Large", xl: "Huge" },
  },
});

/** How long a Waylight deploy takes before its checks report. */
const DEPLOY_MS = 1300;
/** The first deploy settles shortly after the panel arrives. */
const FIRST_MS = 1100;

const WORDS: Record<VerdictMarkState, string> = {
  pending: "Deploying",
  success: "Live",
  warning: "Slow checks",
  error: "Rolled back",
};

const SAID: Record<VerdictMarkState, string> = {
  pending: "deploying",
  success: "live",
  warning: "live, 2 checks slow",
  error: "rolled back",
};

/** Left on Pending, each deploy settles on the next of these in turn. */
const CYCLE: VerdictMarkState[] = ["success", "warning", "error"];

/**
 * A Waylight deploy panel: the api's latest build, its outcome settling out
 * of the spinner, and a Redeploy that runs it again. The State tweak forces
 * the outcome; on Pending, deploys take turns to succeed, warn and fail.
 */
export function VerdictMarkDemo({
  chrome = true,
  sound,
  state: forced = "pending",
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [running, setRunning] = React.useState(true);
  const [build, setBuild] = React.useState(482);
  const timer = React.useRef<number | null>(null);
  const outcome =
    forced === "pending"
      ? (CYCLE[(build - 482) % CYCLE.length] ?? "success")
      : forced;
  const shown: VerdictMarkState = running ? "pending" : outcome;

  React.useEffect(() => {
    const id = window.setTimeout(() => setRunning(false), FIRST_MS);
    return () => {
      window.clearTimeout(id);
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const redeploy = () => {
    if (running) return;
    setRunning(true);
    setBuild((b) => b + 1);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setRunning(false);
    }, DEPLOY_MS);
  };

  const panel = (
    <div className="flex w-full max-w-sm flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight · api · production
          </p>
          <p className="mt-0.5 text-xs text-ink-2 tabular-nums">
            Build {build}
          </p>
        </div>
        <button
          type="button"
          onClick={redeploy}
          aria-disabled={running || undefined}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground outline-none hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-disabled:cursor-default aria-disabled:opacity-50 aria-disabled:hover:bg-card"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Redeploy
        </button>
      </div>
      <VerdictMark
        state={shown}
        showLabel
        labels={WORDS}
        sound={sound}
        {...values}
      />
    </div>
  );

  if (!chrome) {
    return <div className="flex w-full justify-center">{panel}</div>;
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {panel}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">build {build}</span> · {SAID[shown]}
      </p>
    </div>
  );
}
