"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SheenGlass } from "@/registry/ui/sheen-glass";

export const tweaks = defineTweaks({
  width: {
    kind: "range",
    label: "Width",
    default: 80,
    min: 24,
    max: 160,
    step: 8,
    unit: "px",
  },
  strength: {
    kind: "range",
    label: "Strength",
    default: 0.6,
    min: 0.1,
    max: 1,
    step: 0.05,
  },
  angle: {
    kind: "range",
    label: "Angle",
    default: 24,
    min: -60,
    max: 60,
    step: 5,
    unit: "°",
  },
});

/** Pigment at fixed lightness, so the glass reads the same in both themes. */
const glass = (l: number, c: number, turn = 0) =>
  `oklch(from var(--accent) ${l} ${c} calc(h + ${turn}))`;

/** The pass's mark: a seeded constellation of dots, drawn once. */
const DOTS = Array.from({ length: 16 }, (_, i) => {
  const lit = (Math.imul(i + 3, 2654435761) >>> 0) % 3 !== 0;
  return { x: (i % 4) * 7 + 3.5, y: Math.floor(i / 4) * 7 + 3.5, lit };
});

/**
 * A Waylight season pass under glass: move across it and the light rides
 * with your hand; tab to the button and the light comes to it.
 */
export function SheenGlassDemo({
  chrome = true,
  // The glass is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const width = values.width ?? tweaks.width.default;
  const strength = values.strength ?? tweaks.strength.default;
  const angle = values.angle ?? tweaks.angle.default;
  const [flash, setFlash] = React.useState(0);
  // A tweak shows itself at once: one sweep with the new light (state
  // adjusted during render, not in an effect).
  const settings = `${width}:${strength}:${angle}`;
  const [sweptWith, setSweptWith] = React.useState(settings);
  if (sweptWith !== settings) {
    setSweptWith(settings);
    setFlash((n) => n + 1);
  }
  const [added, setAdded] = React.useState(false);

  const pass = (
    <SheenGlass
      sweepKey={flash}
      className="aspect-[8/5] w-full max-w-72 self-center rounded-4 shadow-[0_18px_40px_-24px_color-mix(in_oklab,black_70%,transparent)]"
      {...values}
    >
      <div
        className="flex size-full flex-col justify-between p-4"
        style={{
          backgroundImage: [
            `radial-gradient(120% 90% at 0% 0%, ${glass(0.5, 0.13)}, transparent 60%)`,
            `linear-gradient(135deg, ${glass(0.36, 0.12)}, ${glass(0.2, 0.07, 36)})`,
          ].join(", "),
          color: glass(0.97, 0.02),
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="font-mono text-[10px] tracking-[0.08em] uppercase"
              style={{ color: glass(0.82, 0.06) }}
            >
              Waylight pass
            </p>
            <p className="mt-0.5 truncate text-lg leading-6 font-semibold tracking-[-0.01em]">
              North Basin
            </p>
          </div>
          <svg
            aria-hidden
            viewBox="0 0 28 28"
            className="size-7 shrink-0"
            style={{ color: glass(0.9, 0.05) }}
          >
            {DOTS.map((d, i) => (
              <circle
                key={i}
                cx={d.x}
                cy={d.y}
                r={d.lit ? 1.6 : 0.9}
                fill="currentColor"
                opacity={d.lit ? 0.9 : 0.35}
              />
            ))}
          </svg>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p
              className="font-mono text-[10px] tracking-[0.12em] tabular-nums"
              style={{ color: glass(0.82, 0.06) }}
            >
              WL 0420 · 2026
            </p>
            <p className="truncate text-xs">Season · Trails and huts</p>
          </div>
          <button
            type="button"
            aria-pressed={added}
            onClick={() => setAdded((a) => !a)}
            className="inline-flex h-8 shrink-0 items-center rounded-2 bg-white/15 px-3 text-xs font-medium transition-colors outline-none hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            {added ? "In wallet" : "Add to wallet"}
          </button>
        </div>
      </div>
    </SheenGlass>
  );

  if (!chrome) return <div className="flex w-full max-w-72">{pass}</div>;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      {pass}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{added ? "in wallet" : "glint"}</span> ·{" "}
          {angle}° · {width} px · strength {strength.toFixed(2)}
        </p>
        <button
          type="button"
          onClick={() => setFlash((n) => n + 1)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Catch the light
        </button>
      </div>
    </div>
  );
}
