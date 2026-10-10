"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BlockDissolve,
  type BlockDissolveValue,
} from "@/registry/ui/block-dissolve";

export const tweaks = defineTweaks({
  block: {
    kind: "range",
    label: "Block",
    default: 24,
    min: 8,
    max: 48,
    step: 4,
    unit: "px",
  },
  order: {
    kind: "choice",
    label: "Order",
    default: "pointer",
    options: ["random", "diagonal", "pointer"],
    names: { random: "Random", diagonal: "Diagonal", pointer: "Pointer" },
  },
  duration: {
    kind: "range",
    label: "Duration",
    default: 800,
    min: 300,
    max: 2000,
    step: 100,
    unit: "ms",
  },
});

/**
 * Fixed art in pigment: every colour is a token's hue at a set lightness,
 * so the webcam frames look the same on a light page and a dark one.
 */
const ink = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

const RIDGES = {
  back: "M0 132 L38 104 L66 116 L104 82 L140 108 L176 90 L214 112 L252 86 L300 110 L300 200 L0 200 Z",
  mid: "M0 150 L44 128 L86 144 L130 120 L172 140 L220 124 L262 142 L300 130 L300 200 L0 200 Z",
  front:
    "M0 176 C60 160 110 170 160 162 C210 154 250 168 300 160 L300 200 L0 200 Z",
};

/** Seeded stars, rounded so the server and the browser draw the same sky. */
const STARS = Array.from({ length: 34 }, (_, i) => {
  const a = Math.imul(i + 1, 2654435761) >>> 0;
  const b = Math.imul(i + 7, 1597334677) >>> 0;
  return {
    x: Math.round((a / 4294967296) * 300),
    y: Math.round((b / 4294967296) * 96),
    r: i % 5 === 0 ? 1.2 : 0.7,
  };
});

function Scene({ night }: { night: boolean }) {
  const text = night
    ? ink("--accent", 0.95, 0.02)
    : ink("--accent", 0.26, 0.04);
  return (
    <div
      className="relative size-full overflow-hidden"
      style={{
        backgroundImage: night
          ? `linear-gradient(to bottom, ${ink("--accent", 0.2, 0.06)}, ${ink("--accent", 0.34, 0.08, 24)})`
          : `linear-gradient(to bottom, ${ink("--accent", 0.84, 0.07, -36)}, ${ink("--warn", 0.93, 0.06)})`,
      }}
    >
      <svg
        aria-hidden
        viewBox="0 0 300 200"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 size-full"
      >
        {night ? (
          <>
            {STARS.map((s, i) => (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={s.r}
                style={{ fill: ink("--warn", 0.96, 0.02), opacity: 0.85 }}
              />
            ))}
            <circle
              cx={86}
              cy={52}
              r={11}
              style={{ fill: ink("--warn", 0.95, 0.04) }}
            />
            <circle
              cx={91}
              cy={48}
              r={10}
              style={{ fill: ink("--accent", 0.22, 0.06) }}
            />
          </>
        ) : (
          <>
            <circle
              cx={212}
              cy={78}
              r={26}
              style={{ fill: ink("--warn", 0.95, 0.08), opacity: 0.45 }}
            />
            <circle
              cx={212}
              cy={78}
              r={14}
              style={{ fill: ink("--warn", 0.96, 0.11) }}
            />
          </>
        )}
        <path
          d={RIDGES.back}
          style={{
            fill: night
              ? ink("--accent", 0.3, 0.05)
              : ink("--accent", 0.66, 0.07, -16),
          }}
        />
        <path
          d={RIDGES.mid}
          style={{
            fill: night
              ? ink("--success", 0.24, 0.04, 40)
              : ink("--success", 0.52, 0.07),
          }}
        />
        <path
          d={RIDGES.front}
          style={{
            fill: night
              ? ink("--success", 0.18, 0.03, 40)
              : ink("--success", 0.38, 0.06),
          }}
        />
        <path
          d="M200 158 L212 148 L224 158 Z"
          style={{ fill: ink("--danger", night ? 0.3 : 0.48, 0.08) }}
        />
        <rect
          x={203}
          y={158}
          width={18}
          height={12}
          style={{ fill: ink("--warn", night ? 0.26 : 0.82, 0.03) }}
        />
        <rect
          x={209}
          y={161}
          width={5}
          height={5}
          style={{
            fill: night
              ? ink("--warn", 0.86, 0.15)
              : ink("--accent", 0.4, 0.04),
          }}
        />
      </svg>
      <p
        className="absolute top-3 left-3 font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums"
        style={{ color: text }}
      >
        Summit cam · {night ? "21:10" : "06:40"}
      </p>
      <p
        className="absolute right-3 bottom-3 font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums"
        style={{ color: night ? text : ink("--accent", 0.97, 0.01) }}
      >
        {night ? "−2° · still" : "4° · clear"}
      </p>
    </div>
  );
}

/**
 * Basinworks' summit webcam: dawn dissolves into the same view at night,
 * block by block, from wherever the pointer comes in.
 */
export function BlockDissolveDemo({
  chrome = true,
  // The dissolve is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const block = values.block ?? tweaks.block.default;
  const order = values.order ?? tweaks.order.default;
  const duration = values.duration ?? tweaks.duration.default;
  const [view, setView] = React.useState<BlockDissolveValue>("first");
  // A tweak shows itself at once: the frame dissolves to the other view
  // with the new settings (state adjusted during render, not in an effect).
  const settings = `${block}:${order}:${duration}`;
  const [shownWith, setShownWith] = React.useState(settings);
  if (shownWith !== settings) {
    setShownWith(settings);
    setView((v) => (v === "first" ? "second" : "first"));
  }

  const frame = (
    <BlockDissolve
      value={view}
      onValueChange={setView}
      label="Show the summit at night"
      className="aspect-[3/2] w-full max-w-[21rem] self-center rounded-3"
      {...values}
    >
      <Scene night={false} />
      <Scene night />
    </BlockDissolve>
  );

  if (!chrome) return <div className="flex w-full max-w-[21rem]">{frame}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      {frame}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {view === "second" ? "night" : "dawn"}
        </span>{" "}
        · {order} order · {block} px blocks · {duration} ms
      </p>
    </div>
  );
}
