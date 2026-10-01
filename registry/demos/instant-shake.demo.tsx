"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { InstantShake } from "@/registry/ui/instant-shake";

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
  tint: {
    kind: "choice",
    label: "Tint",
    default: "cool",
    options: ["cool", "warm"],
    names: { cool: "Cool", warm: "Warm" },
  },
  frame: {
    kind: "choice",
    label: "Frame",
    default: "classic",
    options: ["classic", "wide"],
    names: { classic: "Classic", wide: "Wide" },
  },
});

/** How long the gallery card rests on a finished photo before the next. */
const REST_MS = 3200;

/**
 * A mountain lake at seven in the morning: snow peaks, a pine shore, a red
 * canoe on still water. Fixed pigments — it is a photograph.
 */
function MountainLake() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const peaks =
    "M-10 142 L40 92 L62 108 L104 58 L140 100 L162 86 L204 122 L236 76 L268 104 L292 90 L330 130 L330 150 L-10 150 Z";
  return (
    <svg
      viewBox="0 0 320 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="block"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.62 0.1 242)" />
          <stop offset="1" stopColor="oklch(0.9 0.045 215)" />
        </linearGradient>
        <linearGradient id={`${id}-lake`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.62 0.08 232)" />
          <stop offset="1" stopColor="oklch(0.38 0.07 248)" />
        </linearGradient>
      </defs>
      <rect width="320" height="150" fill={`url(#${id}-sky)`} />
      <g fill="oklch(0.97 0.01 240)" opacity="0.85">
        <ellipse cx="70" cy="40" rx="30" ry="7" />
        <ellipse cx="92" cy="34" rx="18" ry="6" />
        <ellipse cx="240" cy="30" rx="24" ry="5" />
      </g>
      <path d={peaks} fill="oklch(0.56 0.06 256)" />
      <path
        d="M104 58 L92 72 L100 70 L108 76 L118 70 L124 78 L126 76 Z M236 76 L226 88 L234 86 L242 92 L250 86 Z M40 92 L32 101 L40 99 L46 104 Z"
        fill="oklch(0.97 0.01 240)"
      />
      <path
        d="M-10 150 L30 118 L70 136 L120 110 L170 134 L210 116 L260 132 L330 112 L330 150 Z"
        fill="oklch(0.44 0.05 252)"
      />
      <g fill="oklch(0.34 0.07 158)">
        {[
          [12, 150, 22],
          [30, 150, 30],
          [48, 150, 20],
          [214, 150, 24],
          [232, 150, 34],
          [252, 150, 26],
          [270, 150, 38],
          [290, 150, 28],
          [308, 150, 32],
        ].map(([x = 0, y = 0, h = 0]) => (
          <path key={x} d={`M${x} ${y - h} L${x + 7} ${y} L${x - 7} ${y} Z`} />
        ))}
      </g>
      <rect y="150" width="320" height="90" fill={`url(#${id}-lake)`} />
      <path
        d={peaks}
        fill="oklch(0.56 0.06 256)"
        opacity="0.35"
        transform="matrix(1 0 0 -1 0 300)"
      />
      <g stroke="oklch(0.9 0.03 220)" strokeWidth="1.2" opacity="0.5">
        <path d="M30 176 h40 M200 170 h56 M120 196 h30 M250 210 h34" />
      </g>
      <g>
        <path
          d="M118 188 Q150 196 184 188 L178 194 Q150 200 124 194 Z"
          fill="oklch(0.58 0.2 30)"
        />
        <circle cx="152" cy="178" r="3.4" fill="oklch(0.3 0.03 260)" />
        <path d="M149 181 h6 v8 h-6 Z" fill="oklch(0.62 0.15 85)" />
        <path
          d="M140 176 L166 196"
          stroke="oklch(0.35 0.05 60)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M122 199 Q150 205 180 199"
          stroke="oklch(0.58 0.2 30)"
          strokeWidth="1.2"
          opacity="0.35"
          fill="none"
        />
      </g>
      <path
        d="M-10 240 L-10 206 L20 200 L44 214 L70 222 L96 240 Z"
        fill="oklch(0.32 0.03 60)"
      />
      <path
        d="M20 200 L44 214 L30 216 Z"
        fill="oklch(0.45 0.03 60)"
        opacity="0.7"
      />
    </svg>
  );
}

/**
 * Waylight Booth, a photo booth kiosk: each photo feeds out of the slot and
 * comes up in the hand — faster if it is shaken.
 */
export function InstantShakeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [shot, setShot] = React.useState(0);
  const [took, setTook] = React.useState<number | null>(null);
  const fed = React.useRef(0);

  // The clock starts when a photo starts to feed.
  React.useEffect(() => {
    fed.current = performance.now();
  }, [shot]);

  // The gallery card has no Replay: it takes the next photo itself.
  React.useEffect(() => {
    if (chrome || took === null) return;
    const next = window.setTimeout(() => {
      setTook(null);
      setShot((n) => n + 1);
    }, REST_MS);
    return () => window.clearTimeout(next);
  }, [chrome, took]);

  const photo = (
    <InstantShake
      key={shot}
      alt="A red canoe on a still mountain lake under snow peaks"
      caption="Lake Aster, 7 am"
      onReady={() =>
        setTook(Math.round((performance.now() - fed.current) / 100) / 10)
      }
      sound={sound}
      {...values}
    >
      <MountainLake />
    </InstantShake>
  );

  if (!chrome) {
    return (
      <div className="flex w-full max-w-72 flex-col items-center gap-3">
        {photo}
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Waylight Booth · strip 2 of 4
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight Booth · strip 2 of 4
      </p>
      <div className="flex justify-center">{photo}</div>
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {took === null ? (
            <>
              <span className="text-signal">developing</span> · shake it to
              bring it up
            </>
          ) : (
            <>
              <span className="text-signal">ready</span> · came up in{" "}
              {took.toFixed(1)} s
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setTook(null);
            setShot((n) => n + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
