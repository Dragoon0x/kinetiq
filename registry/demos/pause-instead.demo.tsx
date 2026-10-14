"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultPauseOffers,
  defaultPauseReasons,
  defaultPauseState,
  offersFor,
  PauseInstead,
  type PauseState,
  type PauseStatus,
} from "@/registry/ui/pause-instead";

export const tweaks = defineTweaks({
  layout: {
    kind: "choice",
    label: "Layout",
    default: "steps",
    options: ["steps", "single"],
    names: { steps: "Steps", single: "One page" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

/**
 * Leaving Basinworks Pro before the quiet season: say why, and the sheet
 * offers a pause, a discount or a smaller plan before it lets you cancel.
 */
export function PauseInsteadDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<PauseState>(defaultPauseState);
  const [status, setStatus] = React.useState<PauseStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);
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
        <PauseInstead height={540} {...values} />
      </div>
    );
  }

  const load = () => {
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
    setValue(defaultPauseState);
    setStatus("ready");
    setFailNext(false);
    setLast(null);
  };

  const reason = defaultPauseReasons.find((r) => r.id === value.reason);
  const offers = offersFor(defaultPauseOffers, value.reason).length;
  const stepNumber =
    value.step === "summary" ? 3 : value.step === "offer" ? 2 : 1;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <PauseInstead
        height={560}
        value={value}
        onChange={setValue}
        status={status}
        onRetry={load}
        onPause={(p) =>
          setLast(`paused ${p.months} mo, resumes ${isoDay(p.resumesAt)}`)
        }
        onCancel={(c) => setLast(`cancelled, ends ${isoDay(c.endsAt)}`)}
        onAcceptOffer={(o) => setLast(`took ${o.id}`)}
        onDone={() => setLast("done")}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            step {stepNumber} of 3 · {reason ? reason.label : "no reason yet"}
          </span>{" "}
          · {offers} {offers === 1 ? "offer" : "offers"}
          {status !== "ready" ? ` · ${status}` : ""}
          {last ? ` · ${last}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload offers
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

/** "2026-12-21", from a UTC ms value. */
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
