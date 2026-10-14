"use client";

import * as React from "react";

import { FastForward, RotateCcw, TriangleAlert } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultLapseExtend,
  defaultLapseNow,
  SessionLapse,
  type LapseState,
} from "@/registry/ui/session-lapse";

export const tweaks = defineTweaks({
  ringStyle: {
    kind: "choice",
    label: "Count",
    default: "ring",
    options: ["ring", "bar", "digits"],
    names: { ring: "Ring", bar: "Bar", digits: "Digits" },
  },
  warnSeconds: {
    kind: "range",
    label: "Warn window",
    default: 120,
    min: 30,
    max: 300,
    step: 10,
    unit: "s",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

/**
 * Basinworks' idle session: two minutes left on the clock, two drafts
 * autosaved, and the choice to stay or go.
 */
export function SessionLapseDemo({
  chrome = true,
  // The card is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [jump, setJump] = React.useState<number | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const [state, setState] = React.useState<LapseState>("active");
  const [extended, setExtended] = React.useState(0);

  const window_ = (values.warnSeconds ?? tweaks.warnSeconds.default) * 1000;
  const expiresAt = defaultLapseNow + (jump ?? window_);

  const extend = async () => {
    if (failNext) {
      setFailNext(false);
      await new Promise((r) => setTimeout(r, 500));
      throw new Error("extend failed");
    }
    await defaultLapseExtend();
    setExtended((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <SessionLapse
          key={run}
          height={280}
          expiresAt={expiresAt}
          now={defaultLapseNow}
          {...values}
        />
      </div>
    );
  }

  const reset = () => {
    setJump(null);
    setFailNext(false);
    setState("active");
    setExtended(0);
    setRun((n) => n + 1);
  };

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <div className="mx-auto w-full max-w-sm">
        <SessionLapse
          key={run}
          height={320}
          expiresAt={expiresAt}
          now={defaultLapseNow}
          onExtend={extend}
          onStateChange={setState}
          {...values}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {state === "active" ? "session active" : "signed out"}
          </span>{" "}
          · extended {extended}
          {failNext ? " · next extend fails" : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setJump(15_000);
              setRun((n) => n + 1);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <FastForward aria-hidden className="size-3.5" />
            Jump to 15 s
          </button>
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            Fail next extend
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
