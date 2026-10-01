"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { ScreenPrint } from "@/registry/ui/screen-print";

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
  register: {
    kind: "range",
    label: "Register",
    default: 2,
    min: 0,
    max: 4,
    step: 0.5,
    unit: "px",
  },
  inks: {
    kind: "choice",
    label: "Inks",
    default: "cmyk",
    options: ["cmyk", "riso", "duo"],
    names: { cmyk: "CMYK", riso: "Riso", duo: "Duotone" },
  },
});

/** How long the poster file takes to arrive, and the card's rest between proofs. */
const LOAD_MS = 3600;
const REST_MS = 3200;

const PULLS = { cmyk: 4, riso: 3, duo: 2 } as const;

/**
 * The harbour festival poster, drawn in flat inks the way a screen print is
 * built: bands of sky, a low sun, hills, a lighthouse on the headland and two
 * boats on the water. Fixed pigments, so the print is the same in either theme.
 */
function HarbourPoster() {
  return (
    <svg
      viewBox="0 0 300 200"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <rect width="300" height="200" style={{ fill: "oklch(0.8 0.07 240)" }} />
      <rect
        y="44"
        width="300"
        height="36"
        style={{ fill: "oklch(0.84 0.08 12)" }}
      />
      <rect
        y="76"
        width="300"
        height="50"
        style={{ fill: "oklch(0.9 0.09 78)" }}
      />
      <circle
        cx="198"
        cy="104"
        r="25"
        style={{ fill: "oklch(0.78 0.16 52)" }}
      />
      <path
        d="M0 112 C 38 94 70 96 104 108 C 138 90 176 94 212 110 C 246 98 276 100 300 106 V 128 H 0 Z"
        style={{ fill: "oklch(0.62 0.07 300)" }}
      />
      <path
        d="M0 116 C 26 108 58 110 92 124 L 96 130 H 0 Z"
        style={{ fill: "oklch(0.44 0.06 185)" }}
      />
      <rect
        x="30"
        y="84"
        width="9"
        height="30"
        style={{ fill: "oklch(0.96 0.01 90)" }}
      />
      <rect
        x="30"
        y="94"
        width="9"
        height="6"
        style={{ fill: "oklch(0.56 0.18 28)" }}
      />
      <path
        d="M28 84 L34.5 76 L41 84 Z"
        style={{ fill: "oklch(0.56 0.18 28)" }}
      />
      <rect
        y="126"
        width="300"
        height="74"
        style={{ fill: "oklch(0.52 0.1 238)" }}
      />
      <g style={{ fill: "oklch(0.8 0.14 60)" }}>
        <rect x="170" y="132" width="56" height="4" rx="2" />
        <rect x="178" y="142" width="40" height="3" rx="1.5" />
        <rect x="186" y="151" width="24" height="3" rx="1.5" />
        <rect x="191" y="160" width="14" height="2" rx="1" />
      </g>
      <g style={{ fill: "oklch(0.66 0.09 232)" }}>
        <rect x="18" y="140" width="46" height="2" rx="1" />
        <rect x="104" y="170" width="60" height="2" rx="1" />
        <rect x="236" y="178" width="44" height="2" rx="1" />
        <rect x="40" y="186" width="38" height="2" rx="1" />
      </g>
      <path
        d="M44 160 H 104 L 96 172 H 54 Z"
        style={{ fill: "oklch(0.42 0.13 30)" }}
      />
      <rect
        x="73"
        y="112"
        width="2.5"
        height="48"
        style={{ fill: "oklch(0.3 0.03 260)" }}
      />
      <path
        d="M77 116 L 77 156 L 100 156 Z"
        style={{ fill: "oklch(0.95 0.02 85)" }}
      />
      <path
        d="M71 122 L 71 156 L 54 156 Z"
        style={{ fill: "oklch(0.88 0.05 80)" }}
      />
      <path
        d="M226 146 H 262 L 256 154 H 231 Z"
        style={{ fill: "oklch(0.34 0.07 255)" }}
      />
      <rect
        x="242.5"
        y="120"
        width="2"
        height="26"
        style={{ fill: "oklch(0.3 0.03 260)" }}
      />
      <path
        d="M246 124 L 246 143 L 259 143 Z"
        style={{ fill: "oklch(0.9 0.12 95)" }}
      />
      <g style={{ fill: "oklch(0.3 0.03 260)" }}>
        <rect x="252" y="160" width="7" height="40" />
        <rect x="270" y="154" width="7" height="46" />
        <rect x="288" y="158" width="7" height="42" />
        <rect x="248" y="162" width="52" height="4" />
      </g>
      <g
        style={{
          fill: "none",
          stroke: "oklch(0.32 0.03 260)",
          strokeWidth: 1.6,
          strokeLinecap: "round",
        }}
      >
        <path d="M118 54 q 5 -5 9 0 q 5 -5 9 0" />
        <path d="M140 66 q 4 -4 7 0 q 4 -4 7 0" />
      </g>
    </svg>
  );
}

/**
 * Basinworks Print Shop proofing the Fieldline harbour festival poster. The
 * file arrives a few seconds after each proof starts; the print waits for it
 * before its last pull.
 */
export function ScreenPrintDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [proof, setProof] = React.useState(1);
  const [ready, setReady] = React.useState(false);
  const [printed, setPrinted] = React.useState(false);
  const pace = values.speed ?? tweaks.speed.default;
  const inks = values.inks ?? tweaks.inks.default;

  React.useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setReady(true), LOAD_MS / pace);
    return () => window.clearTimeout(timer);
  }, [ready, proof, pace]);

  const again = React.useCallback(() => {
    setProof((p) => p + 1);
    setReady(false);
    setPrinted(false);
  }, []);

  // The gallery card has no button: it pulls the next proof by itself.
  React.useEffect(() => {
    if (chrome || !printed) return;
    const timer = window.setTimeout(again, REST_MS);
    return () => window.clearTimeout(timer);
  }, [again, chrome, printed]);

  const print = (
    <ScreenPrint
      alt="Harbour at dawn: two sailing boats at their moorings under a low sun, a lighthouse on the headland"
      ready={ready}
      onReady={() => setPrinted(true)}
      sound={sound}
      {...values}
    >
      <HarbourPoster />
    </ScreenPrint>
  );

  if (!chrome) return <div className="flex w-full max-w-80">{print}</div>;

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Basinworks Print Shop · festival poster
      </p>
      {print}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {printed ? (
            <>
              <span className="text-signal">printed</span> · proof {proof} · in
              register
            </>
          ) : ready ? (
            <>
              <span className="text-signal">registering</span> · last pull
            </>
          ) : (
            <>
              <span className="text-signal">proofing</span> · {PULLS[inks]}{" "}
              pulls · {inks === "duo" ? "duotone" : inks}
            </>
          )}
        </p>
        <button
          type="button"
          disabled={!printed}
          onClick={again}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Replay
        </button>
      </div>
    </div>
  );
}
