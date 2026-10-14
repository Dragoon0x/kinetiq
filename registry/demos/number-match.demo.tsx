"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultMatchNumber,
  NumberMatch,
  type MatchState,
  type MatchStatus,
} from "@/registry/ui/number-match";

export const tweaks = defineTweaks({
  phonePosition: {
    kind: "choice",
    label: "Phone",
    default: "right",
    options: ["right", "below"],
    names: { right: "Beside", below: "Below" },
  },
  digitStyle: {
    kind: "choice",
    label: "Digits",
    default: "roll",
    options: ["roll", "fade"],
    names: { roll: "Roll", fade: "Fade" },
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
 * Mara signs in to Gaugeworks from the Fieldline office: the browser shows
 * 47, her phone offers three numbers, and the one she taps decides it.
 */
export function NumberMatchDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<MatchStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [epoch, setEpoch] = React.useState(0);
  const [state, setState] = React.useState<MatchState>({
    outcome: "pending",
    number: defaultMatchNumber,
    misses: 0,
    lockReason: null,
  });
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <NumberMatch height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      if (!fail) {
        setEpoch((e) => e + 1);
        setState({
          outcome: "pending",
          number: defaultMatchNumber,
          misses: 0,
          lockReason: null,
        });
      }
    }, 1200);
  };

  const reset = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setStatus("ready");
    setFailNext(false);
    setEpoch((e) => e + 1);
    setState({
      outcome: "pending",
      number: defaultMatchNumber,
      misses: 0,
      lockReason: null,
    });
  };

  const word =
    status === "loading"
      ? "sending push"
      : status === "error"
        ? "push failed"
        : state.outcome === "locked"
          ? `locked · ${state.lockReason === "reported" ? "reported" : "tries used"}`
          : state.outcome;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <NumberMatch
        key={epoch}
        height={540}
        status={status}
        onRetry={reload}
        onChange={setState}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{word}</span> · number {state.number} ·{" "}
          {state.misses} wrong
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
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-danger aria-pressed:text-danger"
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
