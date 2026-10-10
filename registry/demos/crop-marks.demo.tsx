"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CropMarks, type CropRect } from "@/registry/ui/crop-marks";

export const tweaks = defineTweaks({
  snap: {
    kind: "range",
    label: "Snap",
    default: 10,
    min: 0,
    max: 24,
    step: 2,
    unit: "px",
  },
  aspect: {
    kind: "choice",
    label: "Aspect",
    default: "free",
    options: ["free", "1:1", "4:3", "16:9"],
    names: { free: "Free", "1:1": "Square", "4:3": "4:3", "16:9": "16:9" },
  },
  grid: {
    kind: "choice",
    label: "Grid",
    default: "thirds",
    options: ["thirds", "golden", "quarters", "none"],
    names: {
      thirds: "Thirds",
      golden: "Golden",
      quarters: "Quarters",
      none: "None",
    },
  },
});

const START: CropRect = { x: 0.18, y: 0.14, width: 0.56, height: 0.62 };

/** Dawn over a mountain lake: fixed art, the same in both themes. */
function Lake() {
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const sky = `sky-${uid}`;
  const lake = `lake-${uid}`;
  const glow = `glow-${uid}`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.74 0.07 250)" />
          <stop offset="0.62" stopColor="oklch(0.88 0.06 60)" />
          <stop offset="1" stopColor="oklch(0.93 0.05 75)" />
        </linearGradient>
        <linearGradient id={lake} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.72 0.06 230)" />
          <stop offset="1" stopColor="oklch(0.42 0.06 245)" />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="oklch(0.97 0.07 85)" stopOpacity="0.9" />
          <stop offset="1" stopColor="oklch(0.97 0.07 85)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#${sky})`} />
      <circle cx="214" cy="96" r="40" fill={`url(#${glow})`} />
      <circle cx="214" cy="96" r="12" fill="oklch(0.97 0.06 88)" />
      <path
        d="M0 118 L34 92 L58 104 L92 70 L120 96 L146 84 L178 108 L214 80 L246 102 L278 76 L320 104 L320 140 L0 140 Z"
        fill="oklch(0.66 0.05 255)"
      />
      <path
        d="M0 128 L28 112 L64 124 L104 98 L138 120 L170 110 L204 126 L236 112 L270 124 L300 108 L320 118 L320 140 L0 140 Z"
        fill="oklch(0.5 0.06 250)"
      />
      <path
        d="M0 134 C40 126 70 130 100 134 C140 128 180 126 214 132 C250 128 290 128 320 132 L320 142 L0 142 Z"
        fill="oklch(0.36 0.05 210)"
      />
      <rect y="140" width="320" height="60" fill={`url(#${lake})`} />
      <g fill="oklch(0.95 0.06 85)" opacity="0.7">
        <rect x="200" y="148" width="28" height="1.4" rx="0.7" />
        <rect x="205" y="154" width="18" height="1.2" rx="0.6" />
        <rect x="209" y="160" width="10" height="1" rx="0.5" />
      </g>
      <path
        d="M0 182 C48 174 96 178 140 186 C186 180 236 176 320 184 L320 200 L0 200 Z"
        fill="oklch(0.27 0.04 175)"
      />
    </svg>
  );
}

const share = (r: CropRect) => Math.round(r.width * r.height * 100);

/**
 * A Waylight journal's cover photo: draw, move and nudge the crop until the
 * horizon sits where you want it.
 */
export function CropMarksDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rect, setRect] = React.useState<CropRect>(START);
  // The frame's size in the picture's own pixels, as the sheet reports it.
  const [size, setSize] = React.useState<{
    width: number;
    height: number;
  } | null>(null);

  const sheet = (
    <CropMarks
      label="Cover photo crop"
      value={rect}
      onValueChange={(next, px) => {
        setRect(next);
        setSize(px);
      }}
      sound={sound}
      className="h-[204px] w-full"
      {...values}
    >
      <Lake />
    </CropMarks>
  );

  if (!chrome) {
    return (
      <div className="flex w-full max-w-[480px] justify-center">{sheet}</div>
    );
  }

  return (
    <div className="flex w-full max-w-[480px] flex-col gap-3">
      {sheet}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {size ? (
            <>
              <span className="text-signal">
                frame {size.width} × {size.height}
              </span>{" "}
              · {share(rect)}% of the cover
            </>
          ) : (
            <>
              <span className="text-signal">cover photo</span> · drag on the
              photo to draw
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setRect(START);
            setSize(null);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
