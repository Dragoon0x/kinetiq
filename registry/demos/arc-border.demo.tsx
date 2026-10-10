"use client";

import * as React from "react";

import { Check } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { ArcBorder } from "@/registry/ui/arc-border";

export const tweaks = defineTweaks({
  jitter: {
    kind: "range",
    label: "Jitter",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  thickness: {
    kind: "range",
    label: "Thickness",
    default: 1.5,
    min: 1,
    max: 4,
    step: 0.5,
    unit: "px",
  },
  color: {
    kind: "choice",
    label: "Colour",
    default: "cobalt",
    options: ["cobalt", "signal", "ember", "rose"],
    names: { cobalt: "Cobalt", signal: "Signal", ember: "Ember", rose: "Rose" },
  },
});

const FEATURES = ["Unlimited routes", "Offline maps", "Live weather"];

/**
 * Waylight's Pro plan, framed in a live current: the frame hums at rest and
 * charges when the pointer or the keyboard comes inside it.
 */
export function ArcBorderDemo({
  chrome = true,
  // The current is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const jitter = values.jitter ?? tweaks.jitter.default;
  const thickness = values.thickness ?? tweaks.thickness.default;
  const color = values.color ?? tweaks.color.default;
  const [charged, setCharged] = React.useState(false);
  const [chosen, setChosen] = React.useState(false);

  const plan = (
    <ArcBorder
      className="w-full"
      contentClassName="bg-card p-4"
      onChargeChange={setCharged}
      {...values}
    >
      <div className="@container flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase">
            Waylight · Pro
          </p>
          <p className="hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @[17rem]:block">
            Billed monthly
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-2xl font-semibold tracking-[-0.02em] text-foreground tabular-nums">
            $24
            <span className="text-sm font-normal tracking-normal text-ink-3">
              {" "}
              / month
            </span>
          </p>
          <button
            type="button"
            aria-pressed={chosen}
            onClick={() => setChosen((c) => !c)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2 px-4 text-sm font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              chosen
                ? "border border-hairline-strong text-foreground hover:bg-surface-2"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {chosen ? <Check aria-hidden className="size-4 shrink-0" /> : null}
            {chosen ? "Your plan" : "Upgrade"}
          </button>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          {FEATURES.map((feature, i) => (
            <li
              key={feature}
              className={
                i === FEATURES.length - 1 ? "hidden @[20rem]:block" : undefined
              }
            >
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </ArcBorder>
  );

  if (!chrome) return <div className="flex w-full max-w-md">{plan}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {plan}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{charged ? "charged" : "idle hum"}</span>{" "}
        · {color} · jitter {jitter.toFixed(2)} · {thickness.toFixed(1)} px
        {chosen ? " · pro chosen" : ""}
      </p>
    </div>
  );
}
