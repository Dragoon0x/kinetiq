"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { InkSplash, type InkSplashEvent } from "@/registry/ui/ink-splash";

export const tweaks = defineTweaks({
  viscosity: {
    kind: "range",
    label: "Viscosity",
    default: 0.3,
    min: 0,
    max: 1,
    step: 0.05,
  },
  fade: {
    kind: "range",
    label: "Fade",
    default: 6,
    min: 1,
    max: 16,
    step: 1,
    unit: "s",
  },
  colors: {
    kind: "choice",
    label: "Colours",
    default: "indigo",
    options: ["indigo", "sumi", "tide", "ember"],
    names: { indigo: "Indigo", sumi: "Sumi", tide: "Tide", ember: "Ember" },
  },
});

type Phase = "still" | "stirring" | "splash" | "drip";

const button =
  "inline-flex h-8 items-center rounded-2 px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * The Basinworks ink studio's hero: a pool of ink you stir with the cursor
 * and splash with a click, under the studio's own call to action.
 */
export function InkSplashDemo({
  chrome = true,
  // The pool is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [phase, setPhase] = React.useState<Phase>("still");
  const [last, setLast] = React.useState<InkSplashEvent | null>(null);
  const [count, setCount] = React.useState(0);
  const visitorAt = React.useRef(-Infinity);
  const splashAt = React.useRef(-Infinity);
  const palette = values.colors ?? tweaks.colors.default;

  const pool = (
    <InkSplash
      className={cn(
        "w-full rounded-3 border border-hairline bg-card",
        chrome ? "h-60" : "h-52",
      )}
      onSplash={(event) => {
        if (event.source === "ambient") {
          // A drip only takes the line once the visitor has stepped away.
          if (performance.now() - visitorAt.current < 3000) return;
          setPhase("drip");
          return;
        }
        visitorAt.current = performance.now();
        splashAt.current = visitorAt.current;
        setLast(event);
        setCount((n) => n + 1);
        setPhase("splash");
      }}
      {...values}
    >
      <div
        className="flex size-full flex-col items-start justify-between gap-3 p-4 sm:p-5"
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const now = performance.now();
          visitorAt.current = now;
          // A fresh splash keeps the line for a beat before stirring does.
          if (now - splashAt.current > 1200) setPhase("stirring");
        }}
      >
        <p className="rounded-full bg-background/80 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase backdrop-blur-sm">
          Basinworks · ink studio
        </p>
        <div className="flex max-w-[19rem] flex-col items-start gap-2 rounded-3 bg-background/80 px-3 py-2.5 backdrop-blur-sm">
          <p className="text-base leading-snug font-semibold tracking-tight text-balance text-foreground">
            Stir the pool. Leave a mark.
          </p>
          {chrome ? (
            <p className="text-xs text-ink-2">
              Inks that move like water, for brush and screen.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                button,
                "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              Open the studio
            </button>
            {chrome ? (
              <button
                type="button"
                className={cn(
                  button,
                  "border border-hairline-strong bg-background/60 text-foreground hover:bg-surface-2",
                )}
              >
                Sample inks
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </InkSplash>
  );

  if (!chrome) return <div className="flex w-full">{pool}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {pool}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "splash" && last ? (
          <>
            <span className="text-signal">splash</span> ·{" "}
            {last.source === "keyboard" ? "from the keyboard" : "from a click"}{" "}
            · {count} {count === 1 ? "drop" : "drops"} so far
          </>
        ) : phase === "stirring" ? (
          <>
            <span className="text-signal">stirring</span> · {palette} ink, click
            to drop
          </>
        ) : phase === "drip" ? (
          <>
            <span className="text-signal">drip</span> · the pool keeps moving
          </>
        ) : (
          <>
            <span className="text-signal">still water</span> · move to stir,
            click to drop
          </>
        )}
      </p>
    </div>
  );
}
