"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KaleidoResolve } from "@/registry/ui/kaleido-resolve";

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
  wedges: {
    kind: "range",
    label: "Wedges",
    default: 8,
    min: 6,
    max: 12,
    step: 2,
  },
  spin: {
    kind: "range",
    label: "Spin",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** How long the photo takes to arrive, and the card's rest between entries. */
const LOAD_MS = 2800;
const REST_MS = 3400;

const LEAF = "oklch(0.58 0.13 150)";
const LEAF_DARK = "oklch(0.44 0.1 160)";
const LEAF_LIGHT = "oklch(0.74 0.14 135)";
const POT = "oklch(0.62 0.12 45)";
const BAR = "oklch(0.97 0.01 100)";

/**
 * A glasshouse in June: white glazing bars fanning from the ridge over a
 * pale sky, hanging ferns, a palm, pots of pink and yellow blooms on a tiled
 * floor. Fixed pigments, so the photo is the same in either theme — and its
 * bars and blooms make a fine kaleidoscope.
 */
function Glasshouse() {
  return (
    <svg
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <rect width="300" height="200" style={{ fill: "oklch(0.9 0.045 200)" }} />
      <path
        d="M0 76 L150 18 L300 76 V 200 H 0 Z"
        style={{ fill: "oklch(0.93 0.035 170)" }}
      />
      <g style={{ stroke: BAR, strokeWidth: 2.5, fill: "none" }}>
        <path d="M0 76 L150 18 L300 76" strokeWidth={4} />
        {[0, 38, 75, 112, 188, 225, 262, 300].map((x) => (
          <path key={x} d={`M150 18 L${x} 76 V 158`} />
        ))}
        <path d="M0 132 H300" />
        <path d="M150 18 V 158" />
      </g>
      <rect
        y="156"
        width="300"
        height="44"
        style={{ fill: "oklch(0.66 0.1 42)" }}
      />
      <path
        d="M118 200 L138 156 H162 L182 200 Z"
        style={{ fill: "oklch(0.8 0.05 70)" }}
      />
      <g style={{ stroke: "oklch(0.56 0.09 40)", strokeWidth: 1 }}>
        <path d="M0 170 H118 M182 170 H300 M0 186 H112 M188 186 H300" />
      </g>
      <g style={{ stroke: "oklch(0.4 0.04 60)", strokeWidth: 1 }}>
        <path d="M96 41 V 58 M204 41 V 58" />
      </g>
      {[
        { x: 96, bloom: "oklch(0.7 0.19 350)", deep: "oklch(0.52 0.17 310)" },
        { x: 204, bloom: "oklch(0.8 0.15 70)", deep: "oklch(0.66 0.18 35)" },
      ].map(({ x, bloom, deep }) => (
        <g key={x}>
          <path
            d={`M${x - 16} 61 q -5 14 -1 25 q 5 -11 9 -23 Z M${x + 16} 61 q 5 14 1 25 q -5 -11 -9 -23 Z M${x - 3} 64 q 0 16 3 24 q 3 -12 1 -24 Z`}
            style={{ fill: LEAF_DARK }}
          />
          <ellipse cx={x} cy="61" rx="18" ry="8" style={{ fill: LEAF }} />
          <g style={{ fill: bloom }}>
            <circle cx={x - 11} cy="58" r="3.5" />
            <circle cx={x + 2} cy="56" r="4" />
            <circle cx={x + 12} cy="60" r="3.2" />
            <circle cx={x - 15} cy="80" r="3.4" />
            <circle cx={x + 15} cy="82" r="3.4" />
          </g>
          <g style={{ fill: deep }}>
            <circle cx={x - 4} cy="62" r="2.6" />
            <circle cx={x + 7} cy="64" r="2.4" />
            <circle cx={x} cy="90" r="3" />
          </g>
        </g>
      ))}
      <g style={{ fill: "oklch(0.85 0.14 95)" }}>
        <path d="M128 112 q 6 -8 10 0 q -5 6 -10 0 Z" />
        <path d="M168 104 q 5 -7 9 0 q -4 5 -9 0 Z" />
      </g>
      <path
        d="M150 160 V 92"
        style={{ stroke: "oklch(0.5 0.07 60)", strokeWidth: 4 }}
      />
      <g style={{ fill: LEAF }}>
        <path d="M150 92 q -30 -10 -52 8 q 26 -4 52 -8 Z" />
        <path d="M150 92 q 30 -10 52 8 q -26 -4 -52 -8 Z" />
        <path d="M150 92 q -18 -24 -42 -24 q 22 8 42 24 Z" />
        <path d="M150 92 q 18 -24 42 -24 q -22 8 -42 24 Z" />
      </g>
      <path
        d="M150 92 q -4 -26 6 -40 q -2 20 -6 40 Z"
        style={{ fill: LEAF_LIGHT }}
      />
      {[
        { x: 40, bloom: "oklch(0.72 0.17 0)" },
        { x: 92, bloom: "oklch(0.88 0.15 95)" },
        { x: 208, bloom: "oklch(0.7 0.16 30)" },
        { x: 260, bloom: "oklch(0.74 0.15 340)" },
      ].map(({ x, bloom }) => (
        <g key={x}>
          <ellipse
            cx={x}
            cy="134"
            rx="22"
            ry="16"
            style={{ fill: LEAF_DARK }}
          />
          <ellipse cx={x - 8} cy="128" rx="12" ry="9" style={{ fill: LEAF }} />
          <ellipse
            cx={x + 10}
            cy="130"
            rx="10"
            ry="8"
            style={{ fill: LEAF_LIGHT }}
          />
          <g style={{ fill: bloom }}>
            <circle cx={x - 10} cy="122" r="4.5" />
            <circle cx={x + 4} cy="118" r="5" />
            <circle cx={x + 14} cy="126" r="4" />
            <circle cx={x - 2} cy="130" r="3.5" />
          </g>
          <path
            d={`M${x - 14} 146 H${x + 14} L${x + 10} 164 H${x - 10} Z`}
            style={{ fill: POT }}
          />
          <rect
            x={x - 16}
            y="144"
            width="32"
            height="5"
            rx="1.5"
            style={{ fill: "oklch(0.68 0.12 48)" }}
          />
        </g>
      ))}
    </svg>
  );
}

/**
 * Fernworks Garden Journal: an entry's photo arriving over a slow
 * connection. The demo says when the photo is ready; the card turns the
 * kaleidoscope again by itself after a rest.
 */
export function KaleidoResolveDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [placed, setPlaced] = React.useState(false);
  const pace = values.speed ?? tweaks.speed.default;
  const pieces = values.wedges ?? tweaks.wedges.default;

  React.useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setReady(true), LOAD_MS / pace);
    return () => window.clearTimeout(timer);
  }, [ready, run, pace]);

  const again = React.useCallback(() => {
    setRun((r) => r + 1);
    setReady(false);
    setPlaced(false);
  }, []);

  // The gallery card has no button: it loads the entry again by itself.
  React.useEffect(() => {
    if (chrome || !placed) return;
    const timer = window.setTimeout(again, REST_MS);
    return () => window.clearTimeout(timer);
  }, [again, chrome, placed]);

  const photo = (
    <KaleidoResolve
      alt="The glasshouse in June: hanging ferns, a palm and pots of pink and yellow blooms under white glazing bars"
      ready={ready}
      onReady={() => setPlaced(true)}
      sound={sound}
      {...values}
    >
      <Glasshouse />
    </KaleidoResolve>
  );

  if (!chrome) return <div className="flex w-full max-w-80">{photo}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Fernworks Garden Journal · 14 June
      </p>
      {photo}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {placed ? (
            <>
              <span className="text-signal">in place</span> · the glasshouse
            </>
          ) : ready ? (
            <>
              <span className="text-signal">opening</span> · {pieces} pieces
            </>
          ) : (
            <>
              <span className="text-signal">turning</span> · {pieces} pieces
            </>
          )}
        </p>
        <button
          type="button"
          disabled={!placed}
          onClick={again}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
