"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMovingBoxes,
  MovingDay,
  type MovingStatus,
} from "@/registry/ui/moving-day";

export const tweaks = defineTweaks({
  arcStyle: {
    kind: "choice",
    label: "Travel",
    default: "arc",
    options: ["arc", "straight", "fade"],
    names: { arc: "Arc", straight: "Straight", fade: "Fade" },
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 2.5,
    min: 1,
    max: 6,
    step: 0.5,
    unit: "s / box",
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
 * Basinworks' import from the old system: four boxes, two fields with
 * nowhere to go, and 38 duplicate contacts waiting to be merged on the way.
 */
export function MovingDayDemo({
  chrome = true,
  // The move is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [status, setStatus] = React.useState<MovingStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    setNote(null);
    const fail = failNext;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setFailNext(false);
      setNote(fail ? "old system unreachable" : "boxes found");
    }, 900);
  };

  const surface = (
    <MovingDay
      key={round}
      status={status}
      onRetry={load}
      onStart={(boxes) => setNote(`moving ${boxes.length} boxes`)}
      onBoxMoved={(box) => setNote(`${box.label.toLowerCase()} in`)}
      onResolve={(box, conflict, resolution) =>
        setNote(
          `${resolution === "both" ? "kept both for" : resolution === "merge" ? "merged" : "skipped"} ${conflict.count} ${box.label.toLowerCase()}`,
        )
      }
      onComplete={(summary) =>
        setNote(
          `${summary.boxes} boxes in · ${summary.unmapped} fields left behind`,
        )
      }
      onStop={() => setNote("stopped")}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <MovingDay height={540} {...values} />
      </div>
    );
  }

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-cobalt-bright/50 aria-pressed:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={load}
          aria-disabled={status === "loading" || undefined}
          className={cn(button, "aria-disabled:opacity-50")}
        >
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next load
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            setStatus("ready");
            setFailNext(false);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ??
            (status === "loading"
              ? "asking the old system"
              : status === "error"
                ? "old system unreachable"
                : "packed and waiting")}
        </span>{" "}
        · {defaultMovingBoxes.length} boxes ·{" "}
        {failNext ? "next load fails" : "basinworks"}
      </p>
    </div>
  );
}
