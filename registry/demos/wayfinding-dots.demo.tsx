"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTourStops,
  WayfindingDots,
  type TourStatus,
} from "@/registry/ui/wayfinding-dots";

export const tweaks = defineTweaks({
  spotlight: {
    kind: "choice",
    label: "Spotlight",
    default: "rounded",
    options: ["rounded", "pill", "none"],
    names: { rounded: "Rounded", pill: "Pill", none: "Ring only" },
  },
  placement: {
    kind: "choice",
    label: "Card",
    default: "auto",
    options: ["auto", "below", "beside"],
    names: { auto: "Auto", below: "Below", beside: "Beside" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const LOAD_MS = 900;

/**
 * A new Fieldline dispatcher's first look at the jobs screen: five dots, a
 * spotlight that walks from the sidebar to the Assign button, and a tour that
 * remembers it has been taken.
 */
export function WayfindingDotsDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState<number | null>(null);
  const [completed, setCompleted] = React.useState(false);
  const [status, setStatus] = React.useState<TourStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setIndex(null);
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, LOAD_MS);
  };

  const reset = () => {
    setIndex(null);
    setCompleted(false);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <WayfindingDots height={540} {...values} />
      </div>
    );
  }

  const total = defaultTourStops.length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <WayfindingDots
        height={520}
        value={index}
        onChange={setIndex}
        completed={completed}
        onComplete={() => setCompleted(true)}
        status={status}
        onRetry={reload}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {index === null
              ? completed
                ? "toured"
                : "not started"
              : `stop ${index + 1} of ${total}`}
          </span>{" "}
          · {total} stops · jobs screen
          {status !== "ready" ? ` · ${status}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            aria-pressed={failNext}
            onClick={() => setFailNext((f) => !f)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid ${
              failNext
                ? "border-danger text-danger"
                : "border-hairline text-ink-2"
            }`}
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Forget the tour
          </button>
        </div>
      </div>
    </div>
  );
}
