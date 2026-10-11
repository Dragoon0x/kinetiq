"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PleatField } from "@/registry/ui/pleat-field";

export const tweaks = defineTweaks({
  pleats: {
    kind: "range",
    label: "Pleats",
    default: 12,
    min: 6,
    max: 24,
    step: 1,
  },
  density: {
    kind: "range",
    label: "Density",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "prism",
    options: ["prism", "tide", "ember", "mono"],
    names: { prism: "Prism", tide: "Tide", ember: "Ember", mono: "Mono" },
  },
});

type Phase = "rest" | "hand" | "back";

/**
 * Fernworks Paper's folded-light card: the sheet rests half open on the
 * card, a sideways drag fans it open or shut, and it relaxes back when let go.
 */
export function PleatFieldDemo({
  chrome = true,
  // The sheet is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(0.5);
  const [phase, setPhase] = React.useState<Phase>("rest");
  const [direction, setDirection] = React.useState<"opening" | "closing">(
    "opening",
  );
  const last = React.useRef(0.5);
  const timer = React.useRef<number | null>(null);
  const pleats = values.pleats ?? 12;
  const palette = values.palette ?? "prism";

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const onOpenChange = (o: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (o === 0.5 && phase !== "rest") {
      // Let go: the line says so while the sheet eases home.
      setPhase("back");
      timer.current = window.setTimeout(() => {
        timer.current = null;
        setPhase("rest");
      }, 900);
    } else {
      setPhase("hand");
      setDirection(o >= last.current ? "opening" : "closing");
    }
    last.current = o;
    setOpen(o);
  };

  const sheet = (
    <div
      className={
        chrome
          ? "relative h-60 w-full overflow-clip rounded-3 border border-hairline bg-card"
          : "relative h-52 w-full overflow-clip rounded-3 border border-hairline bg-card"
      }
    >
      <PleatField
        label="Folded light, opening"
        onOpenChange={onOpenChange}
        {...values}
      />
      <p className="pointer-events-none absolute top-3 left-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Paper
      </p>
    </div>
  );

  if (!chrome) return <div className="flex w-full">{sheet}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {sheet}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground">Folded light</p>
        <p className="text-xs text-ink-2">
          One sheet, {pleats} pleats, drag it open
        </p>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {phase === "hand" ? (
          <>
            <span className="text-signal">{direction}</span> ·{" "}
            {Math.round(open * 100)}%
          </>
        ) : phase === "back" ? (
          <>
            <span className="text-signal">easing back</span> · half open
          </>
        ) : (
          <>
            <span className="text-signal">half open</span> · {pleats} pleats ·{" "}
            {palette}
          </>
        )}
      </p>
    </div>
  );
}
