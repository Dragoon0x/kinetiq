"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  countSinceUnseen,
  defaultSinceChanges,
  defaultSinceLastSeen,
  SinceYouLeft,
  type SinceStatus,
} from "@/registry/ui/since-you-left";

export const tweaks = defineTweaks({
  sheetSide: {
    kind: "choice",
    label: "Sheet",
    default: "right",
    options: ["right", "foot"],
    names: { right: "Right", foot: "Foot" },
  },
  pace: {
    kind: "range",
    label: "Pace",
    default: 1.6,
    min: 0.8,
    max: 3,
    step: 0.2,
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
 * Back at Coldbrook Projects' Harbour app board after three hours away:
 * fourteen things happened. Jump to one, play them all, or mark them seen.
 */
export function SinceYouLeftDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [seen, setSeen] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<SinceStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [open, setOpen] = React.useState(true);
  const [playing, setPlaying] = React.useState(false);
  const [epoch, setEpoch] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const load = (fail: boolean) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
      setFailNext(false);
    }, 900);
  };

  const reset = () => {
    setSeen([]);
    setOpen(true);
    setEpoch((e) => e + 1);
    load(false);
  };

  if (!chrome) {
    return (
      <div className="w-full">
        <SinceYouLeft height={540} {...values} />
      </div>
    );
  }

  const left = countSinceUnseen(
    defaultSinceChanges,
    defaultSinceLastSeen,
    seen,
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <SinceYouLeft
        key={epoch}
        height={540}
        value={seen}
        onChange={setSeen}
        status={status}
        onRetry={() => load(false)}
        onOpenChange={setOpen}
        onPlayChange={setPlaying}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {playing
              ? "catching up"
              : status === "ready"
                ? `${left} unseen`
                : status}
          </span>{" "}
          · sheet {open ? "up" : "down"} · {seen.length} of{" "}
          {defaultSinceChanges.length} seen
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load(failNext)}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-warn aria-pressed:text-warn"
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
