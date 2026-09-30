"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { StraightenDial } from "@/registry/ui/straighten-dial";

export const tweaks = defineTweaks({
  range: {
    kind: "choice",
    label: "Range",
    default: "45",
    options: ["15", "45"],
    names: { "15": "±15°", "45": "±45°" },
  },
  grid: { kind: "toggle", label: "Grid", default: true },
  magnet: {
    kind: "range",
    label: "Magnet",
    default: 1.5,
    min: 0,
    max: 3,
    step: 0.5,
    unit: "°",
  },
  crop: { kind: "toggle", label: "Crop", default: true },
});

/** How far off level the camera was held: the photo needs this much clockwise turn. */
const TILT = 3.8;

// A photograph, not a themed surface: the same dawn in light and dark, so
// every colour is a fixed lightness taken from a token's hue.
const SKY_TOP = "oklch(from var(--accent) 0.74 0.08 h)";
const SKY_LOW = "oklch(from var(--warn) 0.9 0.06 h)";
const SUN = "oklch(from var(--warn) 0.96 0.09 h)";
const SEA_TOP = "oklch(from var(--accent) 0.6 0.07 h)";
const SEA_LOW = "oklch(from var(--accent) 0.4 0.07 h)";
const LAND = "oklch(from var(--accent) 0.3 0.03 h)";
const WHITE = "oklch(from var(--bg-1) 0.97 0.005 h)";
const BAND = "oklch(from var(--danger) 0.58 0.17 h)";
const GLITTER = "oklch(from var(--warn) 0.94 0.07 h)";
const HULL = "oklch(from var(--accent) 0.26 0.03 h)";

/** Sun on the water: fixed, so the photo is the same on every render. */
const GLINTS = [
  [150, 60, 14],
  [154, 63.5, 9],
  [146, 67, 18],
  [156, 71, 11],
  [142, 75, 22],
  [158, 79.5, 13],
  [139, 85, 26],
  [161, 91, 15],
] as const;

/** Fieldline Photos: a dawn harbour, shot a few degrees off level. */
function Harbour() {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const sky = `sky${uid}`;
  const sea = `sea${uid}`;
  return (
    <svg
      aria-hidden
      viewBox="0 0 240 100"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
    >
      <defs>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: SKY_TOP }} />
          <stop offset="1" style={{ stopColor: SKY_LOW }} />
        </linearGradient>
        <linearGradient id={sea} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: SEA_TOP }} />
          <stop offset="1" style={{ stopColor: SEA_LOW }} />
        </linearGradient>
      </defs>
      {/* Drawn oversize and turned: the camera was crooked, not the frame. */}
      <g transform={`rotate(${-TILT} 120 50)`}>
        <rect x={-40} y={-50} width={320} height={106} fill={`url(#${sky})`} />
        <circle cx={158} cy={45} r={17} style={{ fill: SUN, opacity: 0.35 }} />
        <circle cx={158} cy={45} r={7.5} style={{ fill: SUN }} />
        <ellipse
          cx={96}
          cy={22}
          rx={26}
          ry={2.2}
          style={{ fill: WHITE, opacity: 0.5 }}
        />
        <ellipse
          cx={206}
          cy={30}
          rx={18}
          ry={1.8}
          style={{ fill: WHITE, opacity: 0.4 }}
        />
        <rect x={-40} y={56} width={320} height={90} fill={`url(#${sea})`} />
        {GLINTS.map(([x, y, w]) => (
          <rect
            key={`${x}-${y}`}
            x={x - w / 2}
            y={y}
            width={w}
            height={1.1}
            rx={0.55}
            style={{ fill: GLITTER, opacity: 0.7 }}
          />
        ))}
        <path
          d="M-40 56V38C-8 36 14 29 40 32C58 34 72 45 96 56Z"
          style={{ fill: LAND }}
        />
        <path d="M27 33L28.6 19H31.4L33 33Z" style={{ fill: WHITE }} />
        <path d="M27.9 26.6H32.1L32.3 28.6H27.7Z" style={{ fill: BAND }} />
        <rect
          x={28.2}
          y={15.6}
          width={3.6}
          height={3.4}
          style={{ fill: SUN }}
        />
        <path d="M27.6 15.8L30 12.6L32.4 15.8Z" style={{ fill: BAND }} />
        <path d="M188 55.2H206L203.4 58.4H190.4Z" style={{ fill: HULL }} />
        <path d="M197.6 54.6V38.5L206.4 54.6Z" style={{ fill: WHITE }} />
        <path
          d="M196.4 54.6V42L190.2 54.6Z"
          style={{ fill: WHITE, opacity: 0.85 }}
        />
      </g>
    </svg>
  );
}

const signed = (v: number) =>
  v === 0 ? "0.0°" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}°`;

/**
 * Fieldline Photos, straightening "Harbour at 06:12": the camera was held
 * 3.8° off level. Drag the ruler, or focus it and use the arrows, until the
 * sea sits flat.
 */
export function StraightenDialDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // A first try, not quite there: the crop is already at work.
  const [angle, setAngle] = React.useState(2);
  const off = Math.abs(Math.round((angle - TILT) * 10) / 10);

  return (
    <div className="flex w-full max-w-96 flex-col gap-4">
      <StraightenDial
        aspect={2.4}
        value={angle}
        onValueChange={setAngle}
        sound={sound}
        {...values}
      >
        <Harbour />
      </StraightenDial>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{signed(angle)}</span>
          {off < 0.25 ? " · horizon level" : ` · ${off.toFixed(1)}° off level`}
        </p>
      ) : null}
    </div>
  );
}
