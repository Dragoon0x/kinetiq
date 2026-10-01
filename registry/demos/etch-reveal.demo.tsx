"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EtchReveal } from "@/registry/ui/etch-reveal";

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
  frame: {
    kind: "choice",
    label: "Frame",
    default: "teal",
    options: ["red", "teal", "ink"],
    names: { red: "Red", teal: "Teal", ink: "Ink" },
  },
  line: {
    kind: "range",
    label: "Line",
    default: 2,
    min: 1,
    max: 3,
    step: 0.5,
    unit: "px",
  },
});

/** Basin dam at noon: a curved wall across a valley, the reservoir behind it. */
function BasinDam() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg aria-hidden viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.84 0.06 232)" />
          <stop offset="1" stopColor="oklch(0.95 0.02 210)" />
        </linearGradient>
      </defs>
      <rect width="400" height="120" fill={`url(#${id}-sky)`} />
      <circle cx="324" cy="44" r="17" fill="oklch(0.96 0.08 95)" />
      <path
        d="M0 92 C60 58 120 64 170 84 C220 60 300 52 400 86 L400 120 L0 120 Z"
        fill="oklch(0.66 0.06 150)"
      />
      <path d="M96 96 L304 96 L296 110 L104 110 Z" fill="oklch(0.6 0.09 235)" />
      <path
        d="M0 104 C40 96 82 98 118 108 L150 200 L0 200 Z"
        fill="oklch(0.44 0.07 150)"
      />
      <path
        d="M400 100 C356 94 312 98 282 108 L250 200 L400 200 Z"
        fill="oklch(0.47 0.07 145)"
      />
      <path
        d="M114 104 Q200 92 286 104 L262 168 Q200 160 138 168 Z"
        fill="oklch(0.84 0.01 80)"
      />
      <path
        d="M190 102 L210 102 L208 166 L192 166 Z"
        fill="oklch(0.52 0.02 250)"
      />
      <path
        d="M120 112 Q200 101 280 112"
        fill="none"
        stroke="oklch(0.7 0.01 80)"
        strokeWidth="2"
      />
      <path
        d="M138 168 Q200 160 262 168 L250 200 L150 200 Z"
        fill="oklch(0.56 0.1 140)"
      />
      <path
        d="M192 166 C188 178 204 186 196 200 L210 200 C216 186 204 178 208 166 Z"
        fill="oklch(0.66 0.08 235)"
      />
    </svg>
  );
}

/**
 * Basinworks' reservoir survey: the site photo of Basin dam draws itself on
 * a drawing toy while it loads, then the screen resolves into it.
 */
export function EtchRevealDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [held, setHeld] = React.useState(false);

  // The gallery card draws again a while after it resolves, never under the
  // visitor's pointer or focus.
  React.useEffect(() => {
    if (chrome || !ready || held) return;
    const again = window.setTimeout(() => {
      setReady(false);
      setRun((r) => r + 1);
    }, 6000);
    return () => window.clearTimeout(again);
  }, [chrome, ready, held]);

  const toy = (
    <EtchReveal
      key={run}
      alt="Basin dam at noon: a curved concrete wall across a green valley, the reservoir behind it and a river below"
      onReady={() => setReady(true)}
      sound={sound}
      {...values}
    >
      <BasinDam />
    </EtchReveal>
  );

  if (!chrome) {
    return (
      <div
        className="flex w-full max-w-[360px]"
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
      >
        {toy}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {toy}
      <p className="flex items-center justify-between gap-3 px-3 text-xs">
        <span className="font-medium text-foreground">Basin dam</span>
        <span className="font-mono text-ink-3 tabular-nums">
          Survey 0614 · 41 m crest
        </span>
      </p>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {ready ? (
            <>
              <span className="text-signal">picture ready</span> · basin dam
            </>
          ) : (
            <>
              <span className="text-signal">drawing</span> · turn a knob · shake
              to clear
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
