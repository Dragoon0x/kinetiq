"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DarkroomDevelop } from "@/registry/ui/darkroom-develop";

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
  safelight: { kind: "toggle", label: "Safelight", default: true },
  grain: {
    kind: "range",
    label: "Grain",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** How long the gallery card rests on a finished print before the next. */
const REST_MS = 3200;

/**
 * Harbour at dawn: a lighthouse on the breakwater, a boat, the low sun on the
 * water. Fixed pigments — it is a photograph, the same in either theme.
 */
function Harbour() {
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
          <stop offset="0" stopColor="oklch(0.42 0.09 285)" />
          <stop offset="0.55" stopColor="oklch(0.72 0.11 35)" />
          <stop offset="1" stopColor="oklch(0.89 0.1 78)" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.7 0.09 45)" />
          <stop offset="1" stopColor="oklch(0.34 0.06 272)" />
        </linearGradient>
      </defs>
      <rect width="320" height="150" fill={`url(#${id}-sky)`} />
      <circle
        cx="210"
        cy="136"
        r="34"
        fill="oklch(0.95 0.08 88)"
        opacity="0.3"
      />
      <circle cx="210" cy="136" r="17" fill="oklch(0.97 0.06 92)" />
      <path
        d="M0 128 L34 112 L62 120 L96 102 L132 118 L160 110 L196 132 L230 124 L262 134 L320 122 L320 150 L0 150 Z"
        fill="oklch(0.5 0.06 300)"
      />
      <path
        d="M0 150 L0 104 L22 98 L46 110 L70 106 L104 126 L126 150 Z"
        fill="oklch(0.3 0.05 292)"
      />
      <rect y="150" width="320" height="90" fill={`url(#${id}-sea)`} />
      <g fill="oklch(0.96 0.07 88)">
        <rect x="199" y="156" width="22" height="2.5" rx="1.25" opacity="0.9" />
        <rect x="193" y="164" width="34" height="2.5" rx="1.25" opacity="0.7" />
        <rect x="201" y="173" width="20" height="2" rx="1" opacity="0.55" />
        <rect x="189" y="183" width="40" height="2" rx="1" opacity="0.4" />
        <rect x="203" y="195" width="16" height="2" rx="1" opacity="0.3" />
      </g>
      <g stroke="oklch(0.78 0.06 60)" strokeWidth="1.2" opacity="0.45">
        <path d="M20 204 h36 M70 222 h28 M246 212 h40 M130 198 h22" />
      </g>
      <path
        d="M168 170 L320 162 L320 172 L168 176 Z"
        fill="oklch(0.24 0.03 282)"
      />
      <path
        d="M284 166 L288 116 L300 116 L304 166 Z"
        fill="oklch(0.95 0.012 90)"
      />
      <path
        d="M286.6 134 L301.4 134 L302.2 144 L285.8 144 Z"
        fill="oklch(0.56 0.19 28)"
      />
      <rect
        x="286"
        y="104"
        width="16"
        height="12"
        fill="oklch(0.27 0.03 282)"
      />
      <path d="M284 104 L294 94 L304 104 Z" fill="oklch(0.27 0.03 282)" />
      <circle cx="294" cy="110" r="3" fill="oklch(0.95 0.1 90)" />
      <g fill="oklch(0.2 0.03 282)">
        <path d="M70 182 L118 182 L110 191 L78 191 Z" />
        <rect x="92.5" y="146" width="2" height="36" />
        <path d="M95 148 L95 179 L114 179 Z" opacity="0.9" />
        <path d="M91 152 L91 179 L76 179 Z" opacity="0.8" />
      </g>
      <path
        d="M78 194 L110 194 M84 198 L104 198"
        stroke="oklch(0.2 0.03 282)"
        strokeWidth="1.5"
        opacity="0.35"
      />
      <g
        fill="none"
        stroke="oklch(0.24 0.03 282)"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M128 70 q5 -5 10 0 q5 -5 10 0" />
        <path d="M152 84 q4 -4 8 0 q4 -4 8 0" />
      </g>
    </svg>
  );
}

/**
 * Fernworks Photo Lab printing frame 14 of a roll: the print comes up in the
 * tray, and rocking the tray brings it up faster.
 */
export function DarkroomDevelopDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sheet, setSheet] = React.useState(0);
  const [took, setTook] = React.useState<number | null>(null);
  const laid = React.useRef(0);

  // The clock starts when a sheet goes into the tray.
  React.useEffect(() => {
    laid.current = performance.now();
  }, [sheet]);

  // The gallery card has no Replay: it lays the next sheet itself.
  React.useEffect(() => {
    if (chrome || took === null) return;
    const next = window.setTimeout(() => {
      setTook(null);
      setSheet((n) => n + 1);
    }, REST_MS);
    return () => window.clearTimeout(next);
  }, [chrome, took]);

  const print = (
    <DarkroomDevelop
      key={sheet}
      alt="A lighthouse on a breakwater at dawn, a small boat on the water"
      onReady={() =>
        setTook(Math.round((performance.now() - laid.current) / 100) / 10)
      }
      sound={sound}
      {...values}
    >
      <Harbour />
    </DarkroomDevelop>
  );

  if (!chrome) return <div className="flex w-full max-w-[296px]">{print}</div>;

  return (
    <div className="flex w-full max-w-96 flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Photo Lab · roll 6 · frame 14
      </p>
      {print}
      <div className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {took === null ? (
            <>
              <span className="text-signal">developing</span> · rock the tray to
              hurry it
            </>
          ) : (
            <>
              <span className="text-signal">print ready</span> · came up in{" "}
              {took.toFixed(1)} s
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setTook(null);
            setSheet((n) => n + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
