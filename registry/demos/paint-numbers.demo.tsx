"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PaintNumbers } from "@/registry/ui/paint-numbers";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  regions: {
    kind: "range",
    label: "Regions",
    default: 30,
    min: 12,
    max: 60,
    step: 2,
  },
  numbers: { kind: "toggle", label: "Numbers", default: true },
});

const PINES = [
  [14, 176],
  [30, 168],
  [47, 172],
  [64, 164],
  [82, 170],
  [101, 176],
  [120, 182],
];

/** Lake Arden at first light: ridges, a low sun, pines and a red canoe. */
function LakeArden() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.6 0.08 255)" />
          <stop offset="0.45" stopColor="oklch(0.79 0.07 25)" />
          <stop offset="0.7" stopColor="oklch(0.89 0.09 78)" />
        </linearGradient>
        <linearGradient id={`${id}-lake`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.76 0.06 235)" />
          <stop offset="1" stopColor="oklch(0.55 0.07 248)" />
        </linearGradient>
      </defs>
      <rect width="400" height="210" fill={`url(#${id}-sky)`} />
      <circle
        cx="286"
        cy="128"
        r="34"
        fill="oklch(0.94 0.08 86)"
        opacity="0.5"
      />
      <circle cx="286" cy="128" r="19" fill="oklch(0.97 0.06 95)" />
      <path
        d="M0 150 L40 126 L70 140 L110 100 L150 132 L190 110 L230 138 L270 118 L310 142 L350 106 L400 134 L400 196 L0 196 Z"
        style={{
          fill: "color-mix(in oklab, var(--accent) 22%, oklch(0.68 0.05 300))",
        }}
      />
      <path
        d="M110 100 L98 112 L108 110 L114 116 L121 109 Z M190 110 L180 120 L190 118 L196 123 L201 117 Z M350 106 L338 118 L348 116 L355 122 L362 115 Z"
        fill="oklch(0.96 0.015 260)"
      />
      <path
        d="M0 178 L46 152 L84 170 L128 142 L176 172 L220 152 L262 174 L300 158 L344 178 L400 162 L400 204 L0 204 Z"
        fill="oklch(0.5 0.07 272)"
      />
      <path
        d="M0 198 C40 172 92 168 152 194 L152 206 L0 206 Z"
        fill="oklch(0.43 0.08 152)"
      />
      <path
        d="M246 202 C296 180 356 176 400 188 L400 208 L246 208 Z"
        fill="oklch(0.48 0.07 140)"
      />
      {PINES.map(([x = 0, top = 0]) => (
        <path
          key={x}
          d={`M${x} ${top} L${x - 8} 204 L${x + 8} 204 Z`}
          fill="oklch(0.31 0.06 160)"
        />
      ))}
      <rect y="200" width="400" height="100" fill={`url(#${id}-lake)`} />
      <path
        d="M0 202 L46 222 L84 210 L128 232 L176 208 L220 222 L262 206 L300 218 L344 204 L400 214 L400 202 Z"
        fill="oklch(0.5 0.07 272)"
        opacity="0.35"
      />
      {[214, 226, 238, 252].map((y, i) => (
        <rect
          key={y}
          x={286 - (26 - i * 5)}
          y={y}
          width={(26 - i * 5) * 2}
          height="3"
          rx="1.5"
          fill="oklch(0.95 0.07 90)"
          opacity={[0.8, 0.65, 0.5, 0.35][i]}
        />
      ))}
      <path d="M126 240 Q150 249 174 240 Z" fill="oklch(0.56 0.16 35)" />
      <path
        d="M0 300 L0 262 C58 250 124 266 176 300 Z"
        fill="oklch(0.66 0.06 78)"
      />
      <ellipse cx="44" cy="276" rx="18" ry="9" fill="oklch(0.47 0.02 60)" />
      <ellipse cx="86" cy="286" rx="12" ry="6" fill="oklch(0.42 0.02 60)" />
    </svg>
  );
}

/**
 * Fieldline's trail guide: the cover of the Lake Arden loop arrives as a
 * paint-by-numbers kit traced from the photo, and paints itself in.
 */
export function PaintNumbersDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const regions = values.regions ?? tweaks.regions.default;

  // The gallery card lays out a fresh kit a while after each one resolves,
  // never under the visitor's pointer or focus.
  React.useEffect(() => {
    if (chrome || !ready || held) return;
    const again = window.setTimeout(() => {
      setReady(false);
      setRun((r) => r + 1);
    }, 5000);
    return () => window.clearTimeout(again);
  }, [chrome, ready, held]);

  const picture = (
    <PaintNumbers
      key={run}
      alt="Lake Arden at first light: a low sun over three ridges, pines on the shore and a red canoe on the water"
      onReady={() => setReady(true)}
      sound={sound}
      {...values}
    >
      <LakeArden />
    </PaintNumbers>
  );

  if (!chrome) {
    return (
      <div
        className="flex w-full max-w-72"
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {picture}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex w-full max-w-72 flex-col gap-2 self-center">
        {picture}
        <p className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-foreground">Lake Arden loop</span>
          <span className="font-mono text-ink-3 tabular-nums">7.4 km</span>
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {ready ? (
            <>
              <span className="text-signal">cover ready</span> · lake arden loop
            </>
          ) : (
            <>
              <span className="text-signal">painting</span> · {regions} regions
              · tap a colour
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setReady(false);
            setRun((r) => r + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
