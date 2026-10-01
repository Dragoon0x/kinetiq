"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SlideProjector } from "@/registry/ui/slide-projector";

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
  keystone: {
    kind: "range",
    label: "Keystone",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  dust: { kind: "toggle", label: "Dust", default: true },
});

/** How long a slide takes to arrive, and the card's rest before the next. */
const LOAD_MS = 2600;
const REST_MS = 3000;

const fill = (c: string) => ({ fill: c });

function MountainLake() {
  return (
    <svg
      viewBox="0 0 240 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <rect width="240" height="100" style={fill("oklch(0.82 0.08 230)")} />
      <rect
        y="30"
        width="240"
        height="30"
        style={fill("oklch(0.88 0.05 220)")}
      />
      <path
        d="M0 62 L40 26 L62 44 L96 12 L132 50 L158 30 L196 58 L240 34 V 66 H0 Z"
        style={fill("oklch(0.62 0.05 255)")}
      />
      <path
        d="M86 22 L96 12 L106 22 L100 20 L96 24 L91 20 Z M152 36 L158 30 L165 37 L159 35 Z"
        style={fill("oklch(0.97 0.01 240)")}
      />
      <path
        d="M0 66 L14 52 L22 60 L34 48 L48 62 L60 54 L74 66 Z M160 66 L176 50 L188 60 L202 46 L218 60 L228 52 L240 62 V 66 Z"
        style={fill("oklch(0.42 0.08 160)")}
      />
      <rect
        y="64"
        width="240"
        height="36"
        style={fill("oklch(0.58 0.1 225)")}
      />
      <g style={fill("oklch(0.7 0.07 225)")}>
        <rect x="70" y="72" width="40" height="1.6" rx="0.8" />
        <rect x="120" y="80" width="56" height="1.6" rx="0.8" />
        <rect x="30" y="88" width="34" height="1.6" rx="0.8" />
      </g>
      <path d="M180 76 H226 V 79 H180 Z" style={fill("oklch(0.5 0.06 55)")} />
      <g style={fill("oklch(0.42 0.05 55)")}>
        <rect x="184" y="79" width="2" height="10" />
        <rect x="200" y="79" width="2" height="10" />
        <rect x="218" y="79" width="2" height="10" />
      </g>
      <circle cx="40" cy="16" r="7" style={fill("oklch(0.97 0.06 95)")} />
    </svg>
  );
}

function Lighthouse() {
  return (
    <svg
      viewBox="0 0 240 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <rect width="240" height="100" style={fill("oklch(0.9 0.04 200)")} />
      <rect
        y="56"
        width="240"
        height="44"
        style={fill("oklch(0.55 0.09 215)")}
      />
      <g style={fill("oklch(0.68 0.08 210)")}>
        <rect x="20" y="64" width="44" height="1.6" rx="0.8" />
        <rect x="90" y="74" width="60" height="1.6" rx="0.8" />
        <rect x="40" y="86" width="40" height="1.6" rx="0.8" />
      </g>
      <path
        d="M120 100 L138 68 L160 60 L186 64 L210 74 L240 70 V 100 Z"
        style={fill("oklch(0.45 0.03 60)")}
      />
      <path
        d="M150 100 L162 76 L190 72 L214 82 L240 80 V 100 Z"
        style={fill("oklch(0.38 0.03 60)")}
      />
      <path
        d="M170 64 L174 26 H184 L188 64 Z"
        style={fill("oklch(0.96 0.01 90)")}
      />
      <g style={fill("oklch(0.56 0.18 28)")}>
        <path d="M172.6 44 H185.4 L186.2 52 H171.8 Z" />
        <path d="M173 18 H185 L183 26 H175 Z" />
      </g>
      <rect
        x="174.5"
        y="20"
        width="9"
        height="5"
        style={fill("oklch(0.93 0.13 95)")}
      />
      <path d="M171 18 L179 11 L187 18 Z" style={fill("oklch(0.3 0.03 260)")} />
      <g
        style={{
          fill: "none",
          stroke: "oklch(0.32 0.03 260)",
          strokeWidth: 1.2,
          strokeLinecap: "round",
        }}
      >
        <path d="M58 24 q 4 -4 8 0 q 4 -4 8 0" />
        <path d="M84 34 q 3 -3 6 0 q 3 -3 6 0" />
      </g>
    </svg>
  );
}

function Dunes() {
  return (
    <svg
      viewBox="0 0 240 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <rect width="240" height="100" style={fill("oklch(0.62 0.12 330)")} />
      <rect
        y="22"
        width="240"
        height="22"
        style={fill("oklch(0.72 0.14 30)")}
      />
      <rect
        y="40"
        width="240"
        height="20"
        style={fill("oklch(0.82 0.13 70)")}
      />
      <circle cx="150" cy="56" r="14" style={fill("oklch(0.9 0.12 90)")} />
      <path
        d="M0 62 C 40 48 80 50 120 60 C 160 50 200 50 240 58 V 100 H0 Z"
        style={fill("oklch(0.66 0.13 55)")}
      />
      <path
        d="M0 78 C 50 60 90 64 130 76 C 170 66 210 68 240 74 V 100 H0 Z"
        style={fill("oklch(0.56 0.13 45)")}
      />
      <path
        d="M0 92 C 60 78 110 82 150 92 C 190 84 220 86 240 90 V 100 H0 Z"
        style={fill("oklch(0.46 0.11 40)")}
      />
      <path
        d="M130 76 C 150 70 170 68 190 69"
        style={{ fill: "none", stroke: "oklch(0.74 0.12 60)", strokeWidth: 1 }}
      />
      <g style={fill("oklch(0.34 0.06 140)")}>
        <circle cx="40" cy="80" r="2.5" />
        <circle cx="44" cy="81" r="2" />
        <circle cx="200" cy="84" r="2.2" />
      </g>
    </svg>
  );
}

const DECK = [
  {
    title: "Mountain lake at noon",
    alt: "A mountain lake at noon: snow on the peaks, pines on both shores and a wooden jetty",
    Art: MountainLake,
  },
  {
    title: "Lighthouse on the point",
    alt: "A white lighthouse with red bands on a rocky point above a calm sea, two gulls overhead",
    Art: Lighthouse,
  },
  {
    title: "Dunes at dusk",
    alt: "Rolling dunes at dusk under a pink and orange sky, a low sun on the horizon",
    Art: Dunes,
  },
] as const;

/**
 * Waylight Slides, presenting the Fieldline field-trip deck. Each slide takes
 * a moment to arrive; the advance button steps through the deck, and the
 * card moves on by itself after a rest.
 */
export function SlideProjectorDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [index, setIndex] = React.useState(0);
  const [run, setRun] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [sharp, setSharp] = React.useState(false);
  const [warm, setWarm] = React.useState(false);
  const pace = values.speed ?? tweaks.speed.default;
  const slide = DECK[index % DECK.length] ?? DECK[0];

  React.useEffect(() => {
    if (ready) return;
    const warmed = window.setTimeout(() => setWarm(true), 1200 / pace);
    const timer = window.setTimeout(() => setReady(true), LOAD_MS / pace);
    return () => {
      window.clearTimeout(warmed);
      window.clearTimeout(timer);
    };
  }, [ready, run, pace]);

  const load = React.useCallback((next: (i: number) => number) => {
    setIndex(next);
    setRun((r) => r + 1);
    setReady(false);
    setSharp(false);
    setWarm(false);
  }, []);

  // The gallery card has no visitor at the projector: it moves on by itself.
  React.useEffect(() => {
    if (chrome || !sharp) return;
    const timer = window.setTimeout(() => load((i) => i + 1), REST_MS);
    return () => window.clearTimeout(timer);
  }, [chrome, load, sharp]);

  const { Art } = slide;
  const projector = (
    <SlideProjector
      alt={slide.alt}
      ready={ready}
      onReady={() => setSharp(true)}
      onAdvance={() => load((i) => i + 1)}
      ratio={2.4}
      sound={sound}
      {...values}
    >
      <Art />
    </SlideProjector>
  );

  if (!chrome) {
    return <div className="flex w-full max-w-[440px]">{projector}</div>;
  }

  const number = (index % DECK.length) + 1;
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Waylight Slides · Fieldline field trip
      </p>
      {projector}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {sharp ? (
            <>
              <span className="text-signal">sharp</span> ·{" "}
              {slide.title.toLowerCase()}
            </>
          ) : (
            <>
              <span className="text-signal">
                {ready ? "racking focus" : warm ? "focusing" : "warming up"}
              </span>{" "}
              · slide {number} of {DECK.length}
            </>
          )}
        </p>
        <button
          type="button"
          disabled={!sharp}
          onClick={() => load((i) => i)}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
