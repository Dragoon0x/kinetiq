"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EnterStage } from "@/registry/ui/enter-stage";

export const tweaks = defineTweaks({
  preset: {
    kind: "choice",
    label: "Preset",
    default: "rise",
    options: ["rise", "settle", "unfold", "iris"],
    names: { rise: "Rise", settle: "Settle", unfold: "Unfold", iris: "Iris" },
  },
  stagger: {
    kind: "range",
    label: "Stagger",
    default: 60,
    min: 0,
    max: 120,
    step: 10,
    unit: "ms",
  },
  distance: {
    kind: "range",
    label: "Distance",
    default: 16,
    min: 0,
    max: 24,
    step: 4,
    unit: "px",
  },
});

/** Fieldline's seeds, each with a swatch drawn from a token's hue. */
const SEEDS = [
  { name: "Sorrel", price: "$4.20", token: "--danger", turn: 0 },
  { name: "Yarrow", price: "$3.80", token: "--warn", turn: 0 },
  { name: "Basil", price: "$3.40", token: "--success", turn: 0 },
  { name: "Borage", price: "$4.60", token: "--accent", turn: 0 },
  { name: "Tansy", price: "$3.10", token: "--warn", turn: -28 },
  { name: "Mallow", price: "$4.90", token: "--accent", turn: 48 },
] as const;

/**
 * Pigment at fixed lightness (relative colour from the token's hue), so the
 * swatches read the same on a light page and a dark one.
 */
const swatch = (token: string, turn: number) => {
  const at = (l: number, c: number) =>
    `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;
  return [
    `radial-gradient(circle at 80% 44%, ${at(0.96, 0.03)} 0 6px, transparent 6.5px)`,
    `radial-gradient(circle at 68% 66%, ${at(0.94, 0.04)} 0 3.5px, transparent 4px)`,
    `linear-gradient(140deg, ${at(0.86, 0.07)}, ${at(0.64, 0.12)})`,
  ].join(", ");
};

type Phase = "entering" | "on stage" | "leaving" | "off stage";

const PRESET_WORDS: Record<string, string> = {
  rise: "rising",
  settle: "set down",
  unfold: "unfolding",
  iris: "through an iris",
};

/**
 * Fieldline's spring line-up: six seed packets arriving as one diagonal
 * wave. The grid is a real list — the stage moves its items without
 * wrapping them.
 */
export function EnterStageDemo({
  chrome = true,
  // The stage is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const preset = values.preset ?? tweaks.preset.default;
  const stagger = values.stagger ?? tweaks.stagger.default;
  const distance = values.distance ?? tweaks.distance.default;
  const [round, setRound] = React.useState(0);
  const [show, setShow] = React.useState(true);
  const replayKey = `${round}:${preset}:${stagger}:${distance}`;
  // The phase belongs to the run that reported it: a replay, a tweak or the
  // Exit button starts a new run whose phase is in flight until it lands.
  const run = `${replayKey}:${show}`;
  const [landed, setLanded] = React.useState<{ run: string; phase: Phase }>({
    run: "",
    phase: "on stage",
  });
  const phase: Phase =
    landed.run === run ? landed.phase : show ? "entering" : "leaving";

  const stage = (
    <div className="@container flex w-full flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · Spring line-up
        </p>
        <p className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
          06 seeds
        </p>
      </div>
      <EnterStage
        as="ul"
        aria-label="Spring seeds"
        show={show}
        replayKey={replayKey}
        onComplete={(state) =>
          setLanded({
            run,
            phase: state === "entered" ? "on stage" : "off stage",
          })
        }
        className="grid grid-cols-3 gap-2"
        {...values}
      >
        {SEEDS.map((seed) => (
          <li
            key={seed.name}
            className="flex min-w-0 flex-col gap-1.5 rounded-3 border border-hairline bg-card p-2"
          >
            <span
              aria-hidden
              className="block h-8 rounded-2"
              style={{ backgroundImage: swatch(seed.token, seed.turn) }}
            />
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs leading-4 font-medium text-foreground">
                {seed.name}
              </span>
              <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 tabular-nums @[26rem]:inline">
                {seed.price}
              </span>
            </span>
          </li>
        ))}
      </EnterStage>
    </div>
  );

  if (!chrome) return <div className="flex w-full max-w-xl">{stage}</div>;

  const button =
    "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      {stage}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{phase}</span> · {PRESET_WORDS[preset]}{" "}
          · {stagger === 0 ? "all at once" : `${stagger} ms gaps, slowing`} ·{" "}
          {distance} px
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className={button}
            onClick={() => {
              setShow(true);
              setRound((n) => n + 1);
            }}
          >
            Replay
          </button>
          <button
            type="button"
            className={button}
            aria-pressed={!show}
            onClick={() => setShow((s) => !s)}
          >
            {show ? "Exit" : "Enter"}
          </button>
        </div>
      </div>
    </div>
  );
}
