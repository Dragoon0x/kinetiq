"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPracticeAttempts,
  PracticeRun,
  type PracticeAttempt,
  type PracticeStatus,
} from "@/registry/ui/practice-run";

export const tweaks = defineTweaks({
  ribbonStyle: {
    kind: "choice",
    label: "Flag",
    default: "ribbon",
    options: ["ribbon", "banner", "border"],
    names: { ribbon: "Corner ribbon", banner: "Banner", border: "Border only" },
  },
  holdSeconds: {
    kind: "range",
    label: "Hold",
    default: 1.2,
    min: 0.6,
    max: 2,
    step: 0.1,
    unit: "s",
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

/**
 * Gaugeworks Pay's payout form in practice mode: try a send, read the pretend
 * receipt and the lesson from the one that was refused, then switch practice
 * off and hold Send for real.
 */
export function PracticeRunDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<PracticeStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [practice, setPractice] = React.useState(true);
  const [attempts, setAttempts] = React.useState<PracticeAttempt[]>(
    defaultPracticeAttempts,
  );
  const [epoch, setEpoch] = React.useState(0);
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
    }, 900);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStatus("ready");
    setFailNext(false);
    setPractice(true);
    setAttempts(defaultPracticeAttempts);
    setEpoch((n) => n + 1);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <PracticeRun height={540} {...values} />
      </div>
    );
  }

  const refused = attempts.filter((a) => !a.ok).length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PracticeRun
        key={epoch}
        height={560}
        status={status}
        onRetry={reload}
        practice={practice}
        onPracticeChange={setPractice}
        attempts={attempts}
        onAttemptsChange={setAttempts}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {practice ? "practice on" : "sends are real"}
          </span>{" "}
          · {attempts.length} {attempts.length === 1 ? "attempt" : "attempts"} ·{" "}
          {refused} refused
          {failNext ? " · next load fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
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
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:text-danger"
          >
            Fail next load
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
