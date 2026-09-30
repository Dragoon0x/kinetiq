"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FILTER_SWIPE_PRESETS, FilterSwipe } from "@/registry/ui/filter-swipe";

export const tweaks = defineTweaks({
  filters: {
    kind: "choice",
    label: "Filters",
    default: "film",
    options: ["film", "mono", "tone"],
    names: { film: "Film", mono: "Mono", tone: "Tone" },
  },
  threshold: {
    kind: "range",
    label: "Threshold",
    default: 0.5,
    min: 0.2,
    max: 0.8,
    step: 0.05,
  },
  label: { kind: "toggle", label: "Label", default: true },
  edge: {
    kind: "choice",
    label: "Edge",
    default: "hard",
    options: ["hard", "soft"],
    names: { hard: "Hard", soft: "Soft" },
  },
});

// A photo drawn from the theme's own colours, mixed in oklab. It is drawn
// twice by the component, so it carries no ids.
const dark = (token: string, pct: number) =>
  `color-mix(in oklab, var(--${token}) ${pct}%, black)`;
const pale = (token: string, pct: number) =>
  `color-mix(in oklab, var(--${token}) ${pct}%, white)`;
const SKY = `linear-gradient(to bottom, ${pale("accent", 55)}, ${pale("warn", 70)} 52%, color-mix(in oklab, var(--danger) 45%, var(--warn)) 64%)`;

/** Coldbrook harbour at dawn: a lighthouse, a pier, a fishing boat, the sun on the water. */
function Harbour() {
  return (
    <div aria-hidden className="absolute inset-0" style={{ background: SKY }}>
      <svg
        viewBox="0 0 120 90"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <circle cx={82} cy={51} r={8} fill={pale("warn", 75)} />
        <path
          d="M0 55 Q16 45 32 52 T66 48 T102 51 T120 49 V62 H0Z"
          fill={dark("success", 50)}
        />
        <path
          d="M0 58 Q24 52 48 57 T96 55 T120 57 V62 H0Z"
          fill={dark("success", 32)}
        />
        <rect x={0} y={60} width={120} height={30} fill={dark("accent", 62)} />
        <ellipse cx={82} cy={64} rx={9} ry={1.2} fill={pale("warn", 70)} />
        <ellipse cx={82} cy={68} rx={6} ry={0.9} fill={pale("warn", 60)} />
        <ellipse cx={82} cy={72} rx={4} ry={0.7} fill={pale("warn", 50)} />
        <rect
          x={10}
          y={76}
          width={22}
          height={0.8}
          fill="white"
          opacity={0.3}
        />
        <rect
          x={50}
          y={82}
          width={30}
          height={0.8}
          fill="white"
          opacity={0.25}
        />
        <path d="M4 62 Q12 56 22 62Z" fill={dark("ink-3", 40)} />
        <path d="M11 60 L12.5 38 L16.5 38 L18 60Z" fill="white" />
        <rect
          x={11.9}
          y={44}
          width={5.2}
          height={3}
          fill={dark("danger", 90)}
        />
        <rect
          x={11.4}
          y={52}
          width={6.2}
          height={3}
          fill={dark("danger", 90)}
        />
        <rect
          x={12.2}
          y={34.5}
          width={4.6}
          height={3.5}
          fill={pale("warn", 85)}
        />
        <path d="M12 34.5 L14.5 31.5 L17 34.5Z" fill={dark("danger", 70)} />
        <path d="M120 71 H88 V73 H120Z" fill={dark("warn", 30)} />
        {[92, 100, 108, 116].map((x) => (
          <rect
            key={x}
            x={x}
            y={73}
            width={1.4}
            height={9}
            fill={dark("warn", 25)}
          />
        ))}
        <path d="M34 72 H58 L54 78 H38Z" fill={dark("danger", 85)} />
        <rect x={42} y={66} width={9} height={6} fill="white" />
        <rect
          x={44}
          y={67.5}
          width={2.5}
          height={2}
          fill={dark("accent", 60)}
        />
        <rect
          x={49.5}
          y={58}
          width={0.9}
          height={14}
          fill={dark("ink-3", 50)}
        />
        <path
          d="M28 26 l2.5 2 l2.5 -2 M40 20 l2 1.6 l2 -1.6 M58 30 l1.8 1.4 l1.8 -1.4"
          fill="none"
          stroke={dark("accent", 40)}
          strokeWidth={0.7}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

/**
 * Fieldline Photos: a dawn shot of Coldbrook harbour and a row of looks.
 * Swipe across the photo and the next look slides over it, its name riding
 * the edge; let go past the notches and it stays.
 */
export function FilterSwipeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [look, setLook] = React.useState(0);
  const set = FILTER_SWIPE_PRESETS[values.filters ?? tweaks.filters.default];
  const name = set[look]?.name ?? "";

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <FilterSwipe
        alt="Coldbrook harbour at dawn"
        value={look}
        onValueChange={setLook}
        sound={sound}
        {...values}
      >
        <Harbour />
      </FilterSwipe>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">look · {name.toLowerCase()}</span>
          {` · ${look + 1} of ${set.length} · swipe across`}
        </p>
      ) : null}
    </div>
  );
}
