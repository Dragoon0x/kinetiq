"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FilmBurn } from "@/registry/ui/film-burn";

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
  leak: {
    kind: "choice",
    label: "Leak",
    default: "amber",
    options: ["amber", "rose", "teal"],
    names: { amber: "Amber", rose: "Rose", teal: "Teal" },
  },
  grain: {
    kind: "range",
    label: "Grain",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const GLITTER = [
  [300, 124, 22],
  [300, 133, 30],
  [298, 143, 18],
  [303, 153, 26],
  [299, 164, 14],
];

/** A harbour at dusk: a low sun, a breakwater with its light, boats at rest. */
function HarbourAtDusk() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hull = "oklch(0.27 0.03 265)";
  return (
    <svg aria-hidden viewBox="0 0 420 180" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.42 0.09 285)" />
          <stop offset="0.55" stopColor="oklch(0.68 0.13 25)" />
          <stop offset="1" stopColor="oklch(0.86 0.12 68)" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.62 0.1 40)" />
          <stop offset="1" stopColor="oklch(0.3 0.06 268)" />
        </linearGradient>
      </defs>
      <rect width="420" height="120" fill={`url(#${id}-sky)`} />
      <circle cx="300" cy="112" r="18" fill="oklch(0.95 0.09 86)" />
      <path
        d="M0 119 C40 96 92 92 140 108 C172 99 204 104 236 119 Z"
        fill="oklch(0.36 0.06 300)"
      />
      <path
        d="M326 119 C358 104 394 99 420 105 L420 119 Z"
        fill="oklch(0.4 0.05 300)"
      />
      <rect y="117" width="420" height="63" fill={`url(#${id}-sea)`} />
      {GLITTER.map(([x = 0, y = 0, w = 0]) => (
        <rect
          key={y}
          x={x - w / 2}
          y={y}
          width={w}
          height="2.5"
          rx="1.25"
          fill="oklch(0.94 0.09 82)"
          opacity="0.75"
        />
      ))}
      <path d="M248 129 L420 122 L420 133 L248 135 Z" fill={hull} />
      <path
        d="M386 124 L398 124 L396 92 L388 92 Z"
        fill="oklch(0.94 0.01 90)"
      />
      <rect
        x="387.5"
        y="100"
        width="9.4"
        height="5"
        fill="oklch(0.55 0.18 28)"
      />
      <rect
        x="386.8"
        y="112"
        width="10.6"
        height="5"
        fill="oklch(0.55 0.18 28)"
      />
      <rect x="387" y="85" width="10" height="7" fill={hull} />
      <circle cx="392" cy="88.5" r="2.4" fill="oklch(0.97 0.11 95)" />
      <path d="M385.5 85 L392 79.5 L398.5 85 Z" fill="oklch(0.55 0.18 28)" />
      <path d="M50 141 L94 141 L87 150 L57 150 Z" fill={hull} />
      <rect x="71" y="102" width="1.6" height="39" fill={hull} />
      <path d="M74 105 L74 137 L93 137 Z" fill="oklch(0.93 0.02 80)" />
      <path d="M66 108 L66 137 L51 137 Z" fill="oklch(0.86 0.03 70)" />
      <path
        d="M140 156 L170 156 L165 162 L145 162 Z"
        fill="oklch(0.5 0.15 30)"
      />
      <rect x="154" y="131" width="1.2" height="25" fill={hull} />
      <path d="M156 134 L156 153 L168 153 Z" fill="oklch(0.92 0.02 80)" />
      <path
        d="M120 52 l5 3 l5 -3 M136 44 l4 2.5 l4 -2.5"
        fill="none"
        stroke={hull}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Waylight's sailing listing: the header frame of a harbour charter burns in
 * like a frame of film while it loads, then clears.
 */
export function FilmBurnDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [held, setHeld] = React.useState(false);

  // The gallery card loads the frame again a while after it clears, never
  // under the visitor's pointer or focus.
  React.useEffect(() => {
    if (chrome || !ready || held) return;
    const again = window.setTimeout(() => {
      setReady(false);
      setRun((r) => r + 1);
    }, 5000);
    return () => window.clearTimeout(again);
  }, [chrome, ready, held]);

  const frame = (
    <FilmBurn
      key={run}
      alt="Harbour at dusk: a low sun over the water, a lighthouse on the breakwater and two sailing boats at rest"
      onReady={() => setReady(true)}
      sound={sound}
      {...values}
    >
      <HarbourAtDusk />
    </FilmBurn>
  );

  if (!chrome) {
    return (
      <div
        className="flex w-full max-w-lg"
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {frame}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      {frame}
      <p className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">
          Evening sail, Port Avel
        </span>
        <span className="font-mono text-ink-3 tabular-nums">
          2 h · 6 berths
        </span>
      </p>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {ready ? (
            <>
              <span className="text-signal">frame clear</span> · harbour at dusk
            </>
          ) : (
            <>
              <span className="text-signal">exposing</span> · hover or press to
              hold the burn
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
