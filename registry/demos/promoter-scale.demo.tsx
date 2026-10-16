"use client";

import * as React from "react";

import { Package, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { PromoterScale } from "@/registry/ui/promoter-scale";

export const tweaks = defineTweaks({
  segmentStyle: {
    kind: "choice",
    label: "Segments",
    default: "tiles",
    options: ["tiles", "bars", "dots"],
    names: { tiles: "Tiles", bars: "Bars", dots: "Dots" },
  },
  bandPalette: {
    kind: "choice",
    label: "Bands",
    default: "status",
    options: ["status", "tonal", "quiet"],
    names: { status: "Status", tonal: "Tonal", quiet: "Quiet" },
  },
  cornerRadius: {
    kind: "range",
    label: "Corners",
    default: 8,
    min: 0,
    max: 16,
    step: 2,
    unit: "px",
  },
});

/**
 * The card under a Fernworks order page once the plants have arrived: one
 * score, then the question that fits it.
 */
export function PromoterScaleDemo({
  chrome = true,
  // The survey is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<string | null>(null);
  const [failNext, setFailNext] = React.useState(false);
  const failRef = React.useRef(false);
  const timers = React.useRef(new Set<number>());

  React.useEffect(() => {
    failRef.current = failNext;
  }, [failNext]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
    };
  }, []);

  const surface = (
    <PromoterScale
      key={round}
      onScore={(score, band) =>
        setEvent(`score ${score} · ${band.label.toLowerCase()}`)
      }
      onSubmit={(answer) =>
        new Promise<void>((resolve, reject) => {
          setEvent(`sending · ${answer.score}`);
          const t = window.setTimeout(() => {
            timers.current.delete(t);
            if (failRef.current) {
              setFailNext(false);
              setEvent("send failed · answer kept");
              reject(new Error("offline"));
            } else {
              setEvent(
                `sent · ${answer.score} · ${answer.band.label.toLowerCase()}`,
              );
              resolve();
            }
          }, 900);
          timers.current.add(t);
        })
      }
      onDismiss={() => setEvent("dismissed")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground aria-pressed:border-warn/50 aria-pressed:text-warn",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <p className="flex items-center gap-2 text-[13px] text-ink-2">
        <Package aria-hidden className="size-4 shrink-0 text-ink-3" />
        Order FW-2041 · three ferns, arrived Tuesday
      </p>
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setEvent(null);
            setFailNext(false);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((f) => !f)}
          className={button}
        >
          Fail next send
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{event ?? "pick a score"}</span>
        {failNext ? " · next send fails" : " · fernworks survey"}
      </p>
    </div>
  );
}
