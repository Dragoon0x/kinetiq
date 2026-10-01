"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SketchPaint } from "@/registry/ui/sketch-paint";

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
  wash: {
    kind: "range",
    label: "Wash",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pencil: {
    kind: "choice",
    label: "Pencil",
    default: "hb",
    options: ["hb", "4b"],
    names: { hb: "HB", "4b": "4B" },
  },
});

/** How long the gallery card rests on a finished painting before the next. */
const REST_MS = 3200;

/** Glazing bars across the greenhouse's front, x positions. */
const MULLIONS = [92, 114, 136, 158, 180, 202, 224];

/**
 * The greenhouse: an arched glasshouse full of plants, terracotta pots, a
 * gravel path. Fixed pigments and plenty of clean edges for the pencil.
 */
function Greenhouse() {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      viewBox="0 0 320 240"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className="block"
    >
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.78 0.07 230)" />
          <stop offset="1" stopColor="oklch(0.94 0.03 200)" />
        </linearGradient>
        <clipPath id={`${id}-glass`}>
          <path d="M70 200 L70 112 Q160 32 250 112 L250 200 Z" />
        </clipPath>
      </defs>
      <rect width="320" height="240" fill={`url(#${id}-sky)`} />
      <g fill="oklch(0.5 0.1 148)">
        <ellipse cx="20" cy="160" rx="40" ry="30" />
        <ellipse cx="300" cy="158" rx="44" ry="34" />
        <ellipse cx="270" cy="170" rx="30" ry="22" />
      </g>
      <rect y="186" width="320" height="54" fill="oklch(0.64 0.12 138)" />
      <path
        d="M70 200 L70 112 Q160 32 250 112 L250 200 Z"
        fill="oklch(0.88 0.04 185)"
      />
      <g clipPath={`url(#${id}-glass)`}>
        <g fill="oklch(0.56 0.14 145)">
          <ellipse cx="96" cy="176" rx="24" ry="30" />
          <ellipse cx="226" cy="170" rx="26" ry="36" />
          <ellipse cx="160" cy="184" rx="40" ry="20" />
        </g>
        <g fill="oklch(0.68 0.15 128)">
          <ellipse cx="120" cy="150" rx="14" ry="22" />
          <ellipse cx="200" cy="146" rx="12" ry="26" />
          <ellipse cx="160" cy="120" rx="10" ry="30" />
        </g>
        <g fill="oklch(0.64 0.2 25)">
          <circle cx="108" cy="160" r="4" />
          <circle cx="214" cy="150" r="4" />
          <circle cx="150" cy="176" r="3.5" />
          <circle cx="232" cy="182" r="3.5" />
        </g>
        <g fill="oklch(0.85 0.15 92)">
          <circle cx="128" cy="140" r="3" />
          <circle cx="192" cy="132" r="3" />
        </g>
      </g>
      <g
        fill="none"
        stroke="oklch(0.97 0.01 95)"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        <path d="M70 200 L70 112 Q160 32 250 112 L250 200" />
        <path d="M70 140 L250 140" />
        {MULLIONS.map((x) => (
          <path key={x} d={`M${x} 200 L${x} 112`} />
        ))}
        <path d="M92 112 Q126 66 160 62 M228 112 Q194 66 160 62 M160 62 L160 112" />
        <path d="M70 112 L250 112" />
        <path d="M146 200 L146 156 L174 156 L174 200" />
      </g>
      <rect x="64" y="198" width="192" height="12" fill="oklch(0.55 0.12 38)" />
      <g stroke="oklch(0.45 0.1 38)" strokeWidth="1">
        <path d="M64 204 H256 M96 198 V204 M128 204 V210 M160 198 V204 M192 204 V210 M224 198 V204" />
      </g>
      <path
        d="M146 210 L174 210 L214 240 L106 240 Z"
        fill="oklch(0.84 0.03 80)"
      />
      <g fill="oklch(0.6 0.14 45)">
        <path d="M44 212 L66 212 L62 232 L48 232 Z" />
        <path d="M252 214 L276 214 L272 234 L256 234 Z" />
      </g>
      <g fill="oklch(0.5 0.13 150)">
        <ellipse cx="55" cy="204" rx="14" ry="11" />
        <ellipse cx="264" cy="205" rx="15" ry="12" />
      </g>
      <g fill="oklch(0.62 0.2 340)">
        <circle cx="50" cy="200" r="3" />
        <circle cx="60" cy="198" r="3" />
        <circle cx="268" cy="200" r="3" />
      </g>
    </svg>
  );
}

/**
 * Fieldline Journal, a gardening notebook: the entry's photograph is painted
 * in while it loads — pencil first, then paint.
 */
export function SketchPaintDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [took, setTook] = React.useState<number | null>(null);
  const begun = React.useRef(0);

  // The clock starts when a fresh sheet goes down.
  React.useEffect(() => {
    begun.current = performance.now();
  }, [round]);

  // The gallery card has no Replay: it paints the next one itself.
  React.useEffect(() => {
    if (chrome || took === null) return;
    const next = window.setTimeout(() => {
      setTook(null);
      setRound((n) => n + 1);
    }, REST_MS);
    return () => window.clearTimeout(next);
  }, [chrome, took]);

  const painting = (
    <SketchPaint
      key={round}
      alt="A glasshouse with an arched roof, full of plants, with pots by a gravel path"
      onReady={() =>
        setTook(Math.round((performance.now() - begun.current) / 100) / 10)
      }
      sound={sound}
      {...values}
    >
      <Greenhouse />
    </SketchPaint>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[296px]">{painting}</div>;
  }

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fieldline Journal · 14 March · the greenhouse
      </p>
      {painting}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {took === null ? (
            <>
              <span className="text-signal">painting</span> · paint ahead with
              the brush
            </>
          ) : (
            <>
              <span className="text-signal">painted</span> · finished in{" "}
              {took.toFixed(1)} s
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setTook(null);
            setRound((n) => n + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
