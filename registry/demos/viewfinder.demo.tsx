"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { Viewfinder, type ViewfinderShot } from "@/registry/ui/viewfinder";

export const tweaks = defineTweaks({
  grid: {
    kind: "choice",
    label: "Grid",
    default: "thirds",
    options: ["thirds", "cross", "none"],
    names: { thirds: "Thirds", cross: "Cross", none: "None" },
  },
  level: { kind: "toggle", label: "Level", default: true },
  focus: {
    kind: "range",
    label: "Depth of field",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const PLACES = [
  "the sky",
  "the peak",
  "the sun",
  "the far ridge",
  "the lake",
  "the near ridge",
  "the signpost",
  "the trail",
  "the grass",
];

/**
 * The view from the Fieldline trail at dawn: sky and sun up top, two ridges
 * and a lake across the middle, the trail's signpost in the grass in front.
 * Fixed pigments: it is a picture, the same in either theme.
 */
function TrailScene() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
      role="img"
      aria-label="A lake between two ridges at dawn, with a trail signpost in the grass"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "oklch(0.74 0.08 235)" }} />
          <stop offset="0.7" style={{ stopColor: "oklch(0.9 0.05 70)" }} />
          <stop offset="1" style={{ stopColor: "oklch(0.93 0.06 80)" }} />
        </linearGradient>
        <linearGradient id={`${id}-lake`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "oklch(0.82 0.06 80)" }} />
          <stop offset="1" style={{ stopColor: "oklch(0.6 0.07 225)" }} />
        </linearGradient>
      </defs>
      <rect width="300" height="130" style={{ fill: `url(#${id}-sky)` }} />
      <circle
        cx="214"
        cy="84"
        r="26"
        style={{ fill: "oklch(0.97 0.06 90 / 0.35)" }}
      />
      <circle cx="214" cy="84" r="13" style={{ fill: "oklch(0.98 0.07 92)" }} />
      <g
        fill="none"
        strokeWidth="1.4"
        strokeLinecap="round"
        style={{ stroke: "oklch(0.35 0.03 250 / 0.7)" }}
      >
        <path d="M 70 46 q 4 -4 8 0 q 4 -4 8 0" />
        <path d="M 96 36 q 3 -3 6 0 q 3 -3 6 0" />
      </g>
      <path
        d="M 0 112 L 34 84 L 58 96 L 96 58 L 128 88 L 150 76 L 186 104 L 220 92 L 260 108 L 300 90 L 300 130 L 0 130 Z"
        style={{ fill: "oklch(0.66 0.045 262)" }}
      />
      <path
        d="M 96 58 L 104 66 L 98 66 L 92 72 L 88 66 Z"
        style={{ fill: "oklch(0.95 0.01 250)" }}
      />
      <path
        d="M 0 126 L 40 108 L 82 118 L 124 102 L 168 120 L 214 110 L 252 122 L 300 112 L 300 136 L 0 136 Z"
        style={{ fill: "oklch(0.47 0.06 200)" }}
      />
      <rect
        y="132"
        width="300"
        height="22"
        style={{ fill: `url(#${id}-lake)` }}
      />
      <g
        strokeWidth="1"
        strokeLinecap="round"
        style={{ stroke: "oklch(0.97 0.04 90 / 0.8)" }}
      >
        <line x1="196" y1="138" x2="232" y2="138" />
        <line x1="204" y1="143" x2="224" y2="143" />
        <line x1="60" y1="146" x2="84" y2="146" />
      </g>
      <path
        d="M 0 150 Q 80 140 150 148 T 300 146 L 300 200 L 0 200 Z"
        style={{ fill: "oklch(0.52 0.1 138)" }}
      />
      <path
        d="M 128 200 Q 150 170 168 152 L 176 152 Q 166 172 162 200 Z"
        style={{ fill: "oklch(0.72 0.05 75)" }}
      />
      <g style={{ fill: "oklch(0.4 0.1 140)" }}>
        {[
          [18, 186],
          [40, 176],
          [94, 190],
          [210, 180],
          [246, 192],
          [276, 172],
          [112, 166],
        ].map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M ${x} ${y} l 3 -10 l 1 10 l 3 -8 l 1 8 Z`}
          />
        ))}
      </g>
      <rect
        x="66"
        y="150"
        width="4"
        height="40"
        style={{ fill: "oklch(0.45 0.06 55)" }}
      />
      <path
        d="M 50 152 H 96 L 102 159 L 96 166 H 50 Z"
        style={{ fill: "oklch(0.56 0.08 58)" }}
      />
      <text
        x="74"
        y="162"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        letterSpacing="0.6"
        className="font-sans"
        style={{ fill: "oklch(0.97 0.02 90)" }}
      >
        LAKE 2.4 KM
      </text>
    </svg>
  );
}

/**
 * A Fieldline trail guide's camera: pick a focus point, hold the shutter
 * until the brackets go green, let go.
 */
export function ViewfinderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [point, setPoint] = React.useState(4);
  const [last, setLast] = React.useState<ViewfinderShot | null>(null);

  const camera = (
    <Viewfinder
      label="Fieldline trail camera"
      point={point}
      onPointChange={setPoint}
      onShoot={setLast}
      sound={sound}
      {...values}
    >
      <TrailScene />
    </Viewfinder>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[440px]">{camera}</div>;
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {camera}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            <span className="text-signal">
              {last.count} {last.count === 1 ? "photo" : "photos"}
            </span>{" "}
            · last one {last.sharp ? "sharp" : "soft"} · focus on{" "}
            {PLACES[point]}
          </>
        ) : (
          <>
            <span className="text-signal">hold the shutter</span> · focus on{" "}
            {PLACES[point]}
          </>
        )}
      </p>
    </div>
  );
}
