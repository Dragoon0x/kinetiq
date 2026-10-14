"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultTeaserFeatures,
  TeaserLens,
  type TeaserStatus,
} from "@/registry/ui/teaser-lens";

export const tweaks = defineTweaks({
  lensRadius: {
    kind: "range",
    label: "Lens",
    default: 110,
    min: 60,
    max: 160,
    step: 10,
    unit: "px",
  },
  frost: {
    kind: "range",
    label: "Frost",
    default: 6,
    min: 2,
    max: 10,
    step: 1,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

const LOAD_MS = 900;

/**
 * Coldbrook Analytics on the free plan: the bookings forecast is behind the
 * frost, and a lens shows a circle of it at a time until Unlock is pressed.
 */
export function TeaserLensDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [locked, setLocked] = React.useState(true);
  const [seen, setSeen] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<TeaserStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
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
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, LOAD_MS);
  };

  const reset = () => {
    setLocked(true);
    setSeen([]);
    setRound((r) => r + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <TeaserLens height={560} {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <TeaserLens
        key={round}
        height={520}
        locked={locked}
        onUnlock={() => setLocked(false)}
        onFeatureSeen={(_feature, all) => setSeen(all)}
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
            {locked ? "locked" : "unlocked"} · {seen.length} of{" "}
            {defaultTeaserFeatures.length} seen
          </span>{" "}
          · {values.lensRadius ?? tweaks.lensRadius.default} px lens
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
            Lock again
          </button>
        </div>
      </div>
    </div>
  );
}
