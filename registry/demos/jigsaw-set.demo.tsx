"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { JigsawSet } from "@/registry/ui/jigsaw-set";

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
  pieces: {
    kind: "choice",
    label: "Pieces",
    default: "4",
    options: ["3", "4", "5"],
    names: { "3": "3 × 3", "4": "4 × 4", "5": "5 × 5" },
  },
  scatter: {
    kind: "range",
    label: "Scatter",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

const MULLIONS = [117, 145, 172, 228, 255, 283];
const FLOWERS = [
  [122, 196],
  [138, 188],
  [262, 192],
  [276, 200],
  [154, 200],
];

/** Greenhouse no. 4: a glasshouse on a lawn, staging inside, pots by the door. */
function Greenhouse() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const frame = "oklch(0.97 0.006 95)";
  const leaf = "oklch(0.55 0.13 148)";
  const pot = "oklch(0.6 0.12 45)";
  return (
    <svg aria-hidden viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.8 0.07 232)" />
          <stop offset="1" stopColor="oklch(0.94 0.03 200)" />
        </linearGradient>
      </defs>
      <rect width="400" height="210" fill={`url(#${id}-sky)`} />
      <circle cx="56" cy="52" r="20" fill="oklch(0.96 0.07 95)" />
      <path
        d="M0 200 C20 150 70 156 84 182 C100 140 150 150 160 190 L240 190 C250 146 300 140 318 180 C336 150 384 156 400 196 L400 214 L0 214 Z"
        fill="oklch(0.44 0.08 152)"
      />
      <rect y="208" width="400" height="92" fill="oklch(0.66 0.12 138)" />
      <path
        d="M182 242 L218 242 L262 300 L138 300 Z"
        fill="oklch(0.84 0.03 80)"
      />
      <path d="M90 124 L200 64 L310 124 Z" fill="oklch(0.86 0.04 200)" />
      <rect
        x="90"
        y="124"
        width="220"
        height="118"
        fill="oklch(0.84 0.05 195)"
      />
      <circle cx="132" cy="214" r="22" fill={leaf} />
      <circle cx="160" cy="222" r="16" fill="oklch(0.5 0.12 150)" />
      <circle cx="268" cy="212" r="24" fill={leaf} />
      <circle cx="240" cy="224" r="14" fill="oklch(0.5 0.12 150)" />
      {FLOWERS.map(([x = 0, y = 0]) => (
        <circle key={x} cx={x} cy={y} r="4" fill="oklch(0.62 0.19 22)" />
      ))}
      <rect x="96" y="226" width="208" height="6" fill="oklch(0.52 0.06 60)" />
      <rect
        x="185"
        y="172"
        width="30"
        height="70"
        fill="oklch(0.72 0.05 200)"
      />
      <g fill={frame}>
        <path d="M86 126 L200 62 L314 126 L308 128 L200 70 L92 128 Z" />
        <rect x="88" y="124" width="5" height="120" />
        <rect x="307" y="124" width="5" height="120" />
        <rect x="88" y="168" width="224" height="4" />
        <rect x="88" y="240" width="224" height="4" />
        {MULLIONS.map((x) => (
          <rect key={x} x={x} y="124" width="3" height="118" />
        ))}
        <rect x="183" y="170" width="3" height="72" />
        <rect x="214" y="170" width="3" height="72" />
        <rect x="198" y="64" width="4" height="106" />
      </g>
      <path d="M44 268 L76 268 L71 292 L49 292 Z" fill={pot} />
      <circle cx="60" cy="258" r="14" fill={leaf} />
      <path d="M326 266 L362 266 L356 292 L332 292 Z" fill={pot} />
      <circle cx="336" cy="256" r="10" fill={leaf} />
      <circle cx="352" cy="252" r="12" fill="oklch(0.5 0.12 150)" />
      <circle cx="344" cy="246" r="4" fill="oklch(0.62 0.19 22)" />
    </svg>
  );
}

/**
 * Fernworks' product page for a glasshouse kit: the photo of Greenhouse
 * no. 4 puts itself together as a jigsaw while it loads.
 */
export function JigsawSetDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [count, setCount] = React.useState({ placed: 0, total: 16 });
  const [held, setHeld] = React.useState(false);
  const pieces = values.pieces ?? tweaks.pieces.default;
  const total = Number(pieces) ** 2;

  // The gallery card starts over a while after it completes, never under the
  // visitor's pointer or focus.
  React.useEffect(() => {
    if (chrome || !ready || held) return;
    const again = window.setTimeout(() => {
      setReady(false);
      setCount({ placed: 0, total });
      setRun((r) => r + 1);
    }, 5000);
    return () => window.clearTimeout(again);
  }, [chrome, ready, held, total]);

  const puzzle = (
    <JigsawSet
      key={`${run}-${pieces}`}
      alt="Greenhouse no. 4: a white-framed glasshouse on a lawn, plants on staging inside and pots by the door"
      onReady={() => setReady(true)}
      onPlace={(placed, all) => setCount({ placed, total: all })}
      sound={sound}
      {...values}
    >
      <Greenhouse />
    </JigsawSet>
  );

  if (!chrome) {
    return (
      <div
        className="flex w-full max-w-68"
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {puzzle}
      </div>
    );
  }

  const placed = count.total === total ? count.placed : 0;
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <div className="flex w-full max-w-68 flex-col gap-2 self-center">
        {puzzle}
        <p className="flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-foreground">Greenhouse no. 4</span>
          <span className="font-mono text-ink-3 tabular-nums">3.2 × 2.4 m</span>
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {ready ? (
            <>
              <span className="text-signal">picture ready</span> · greenhouse
              no. 4
            </>
          ) : (
            <>
              <span className="text-signal">assembling</span> · {placed} of{" "}
              {total} in place
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setReady(false);
            setCount({ placed: 0, total });
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
