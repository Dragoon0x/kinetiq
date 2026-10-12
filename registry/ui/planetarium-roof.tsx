"use client";

import * as React from "react";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PlanetariumImage = {
  /** Stable key for the print. Defaults to its position. */
  id?: string;
  /** A picture. Without one, `art` or a drawn print is shown. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** The print's title, shown when it is in focus. Defaults to `alt`. */
  caption?: string;
  /** A short line under the title: a place, a time. */
  detail?: string;
  /** Your own art, filling the print (4:3). */
  art?: React.ReactNode;
};

export type PlanetariumRoofProps = {
  /** The prints, in constellations of three in order. @default defaultPlanetariumImages */
  items?: PlanetariumImage[];
  /** Field of view across the dome, degrees, 70 to 150. @default 110 */
  fov?: number;
  /** How far apart the constellations and their prints sit, 0.6 to 1.6. @default 1 */
  spacing?: number;
  /** How long a throw coasts, 0 (stops dead) to 1 (coasts long). @default 0.6 */
  inertia?: number;
  /** Controlled: the print in focus, or null for none. */
  value?: number | null;
  /** The print in focus first when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that brought a print into focus or sent it back, with its index or null. */
  onValueChange?: (index: number | null) => void;
  /** How fast the dome turns by itself while idle, degrees a second; 0 holds it still. @default 1.2 */
  drift?: number;
  /** Where the view starts, degrees above the horizon (90 looks straight up). @default 84 */
  altitude?: number;
  /** Each print's width on the dome, degrees. @default 17 */
  cardSize?: number;
  /** Draw the dome's rings and meridians. @default true */
  graticule?: boolean;
  /** Join each constellation's prints with thin lines. @default true */
  lines?: boolean;
  /** How many stars are pricked into the dome. @default 140 */
  stars?: number;
  /** Seeds the constellations' shapes and the stars. @default 4 */
  seed?: number;
  /** The stage's height, px. @default 480 */
  height?: number;
  /** The gallery's accessible name. @default "Planetarium gallery" */
  label?: string;
  /** No turning, clicks or keys; the dome dims. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const D2R = Math.PI / 180;
const W0 = 160;
const H0 = 120;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A pigment: a token's hue at a fixed lightness and chroma, the same in both themes. */
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${l} ${c} ${dh ? `calc(h + ${dh})` : "h"})`;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

type V3 = [number, number, number];
const dirOf = (az: number, alt: number): V3 => [
  Math.cos(alt) * Math.cos(az),
  Math.cos(alt) * Math.sin(az),
  Math.sin(alt),
];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/* ----------------------------------- art ---------------------------------- */

type PrintKind =
  | "trees"
  | "flat"
  | "tower"
  | "boat"
  | "kiln"
  | "reeds"
  | "house"
  | "snow"
  | "pool"
  | "mound"
  | "mill"
  | "fog";

type Recipe = {
  kind: PrintKind;
  sky: [string, string];
  sun?: [number, number, number, string];
  hills: [string, string, string];
  water?: string;
};

const RECIPES: Record<PrintKind, Recipe> = {
  trees: {
    kind: "trees",
    sky: [pig("--danger", 0.62, 0.09, 30), pig("--warn", 0.86, 0.09, -20)],
    sun: [118, 70, 14, pig("--warn", 0.95, 0.08, -10)],
    hills: [
      pig("--danger", 0.42, 0.06, 40),
      pig("--success", 0.36, 0.06, 10),
      pig("--success", 0.28, 0.05, 10),
    ],
  },
  flat: {
    kind: "flat",
    sky: [pig("--accent", 0.7, 0.08, -20), pig("--accent", 0.92, 0.03, -20)],
    sun: [40, 30, 10, pig("--warn", 0.98, 0.04)],
    hills: [
      pig("--accent", 0.66, 0.05, -10),
      pig("--warn", 0.94, 0.02),
      pig("--warn", 0.88, 0.03),
    ],
  },
  tower: {
    kind: "tower",
    sky: [pig("--accent", 0.62, 0.07, -30), pig("--accent", 0.86, 0.04, -40)],
    hills: [
      pig("--accent", 0.5, 0.05, -40),
      pig("--warn", 0.6, 0.05, -20),
      pig("--warn", 0.48, 0.05, -20),
    ],
    water: pig("--accent", 0.52, 0.07, -30),
  },
  boat: {
    kind: "boat",
    sky: [pig("--accent", 0.2, 0.05), pig("--accent", 0.36, 0.07)],
    sun: [124, 32, 9, pig("--warn", 0.95, 0.04, 10)],
    hills: [
      pig("--accent", 0.28, 0.04),
      pig("--accent", 0.24, 0.04),
      pig("--accent", 0.2, 0.03),
    ],
    water: pig("--accent", 0.3, 0.06),
  },
  kiln: {
    kind: "kiln",
    sky: [pig("--warn", 0.78, 0.09, -15), pig("--warn", 0.92, 0.05, -5)],
    sun: [36, 46, 12, pig("--warn", 0.97, 0.06)],
    hills: [
      pig("--success", 0.6, 0.06, 20),
      pig("--success", 0.48, 0.07, 10),
      pig("--warn", 0.4, 0.05, -30),
    ],
  },
  reeds: {
    kind: "reeds",
    sky: [pig("--danger", 0.84, 0.04, 20), pig("--warn", 0.94, 0.03)],
    sun: [80, 64, 13, pig("--warn", 0.97, 0.05)],
    hills: [
      pig("--accent", 0.74, 0.03, -20),
      pig("--warn", 0.66, 0.07, -10),
      pig("--warn", 0.52, 0.07, -10),
    ],
    water: pig("--accent", 0.82, 0.03, -20),
  },
  house: {
    kind: "house",
    sky: [pig("--accent", 0.74, 0.06, -10), pig("--warn", 0.9, 0.04, -20)],
    hills: [
      pig("--success", 0.58, 0.06, 15),
      pig("--success", 0.46, 0.06, 10),
      pig("--warn", 0.42, 0.04, -40),
    ],
  },
  snow: {
    kind: "snow",
    sky: [pig("--accent", 0.72, 0.02, -20), pig("--accent", 0.86, 0.015, -20)],
    hills: [
      pig("--accent", 0.92, 0.01, -20),
      pig("--accent", 0.96, 0.008, -20),
      pig("--accent", 0.99, 0.005, -20),
    ],
  },
  pool: {
    kind: "pool",
    sky: [pig("--accent", 0.78, 0.06, -30), pig("--accent", 0.9, 0.03, -30)],
    sun: [130, 26, 9, pig("--warn", 0.98, 0.05)],
    hills: [
      pig("--warn", 0.72, 0.03, -10),
      pig("--warn", 0.62, 0.03, -10),
      pig("--warn", 0.54, 0.03, -10),
    ],
    water: pig("--success", 0.55, 0.08, 40),
  },
  mound: {
    kind: "mound",
    sky: [pig("--accent", 0.58, 0.05, 20), pig("--danger", 0.84, 0.06, 40)],
    sun: [32, 82, 12, pig("--warn", 0.92, 0.1, -15)],
    hills: [
      pig("--accent", 0.46, 0.04, 30),
      pig("--success", 0.38, 0.04, 30),
      pig("--success", 0.3, 0.04, 30),
    ],
  },
  mill: {
    kind: "mill",
    sky: [pig("--warn", 0.86, 0.05, -10), pig("--warn", 0.94, 0.03)],
    hills: [
      pig("--success", 0.62, 0.05, 20),
      pig("--success", 0.5, 0.06, 20),
      pig("--warn", 0.46, 0.05, -20),
    ],
    water: pig("--accent", 0.6, 0.05, -20),
  },
  fog: {
    kind: "fog",
    sky: [pig("--accent", 0.86, 0.01, -10), pig("--accent", 0.94, 0.008, -10)],
    hills: [
      pig("--accent", 0.78, 0.015, -10),
      pig("--accent", 0.66, 0.02, -10),
      pig("--accent", 0.5, 0.025, -10),
    ],
  },
};

/** A hill line across the print, seeded. */
function ridge(seed: number, y: number, amp: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const x = i * 20;
    const h =
      Math.sin(i * 0.9 + seed) * amp * 0.6 + (hash(seed, i) - 0.5) * amp * 0.8;
    pts.push(`${x} ${r3(y + h)}`);
  }
  return `M0 120 L${pts.join(" L")} L160 120 Z`;
}

function PrintArt({ kind, seed }: { kind: PrintKind; seed: number }) {
  const r = RECIPES[kind];
  const uid = React.useId();
  const ink = r.hills[2];
  const feature = (() => {
    switch (kind) {
      case "trees":
        return Array.from({ length: 7 }, (_, i) => (
          <g key={i}>
            <rect
              x={14 + i * 21}
              y={84}
              width={2.4}
              height={18}
              style={{ fill: ink }}
            />
            <circle
              cx={15 + i * 21}
              cy={80}
              r={9 + (i % 2) * 2}
              style={{ fill: r.hills[1] }}
            />
          </g>
        ));
      case "tower":
        return (
          <g style={{ fill: pig("--warn", 0.95, 0.02) }}>
            <path d="M96 84 L100 34 L108 34 L112 84 Z" />
            <rect
              x="96"
              y="44"
              width="16"
              height="6"
              style={{ fill: pig("--danger", 0.55, 0.15) }}
            />
            <rect
              x="96"
              y="62"
              width="16"
              height="6"
              style={{ fill: pig("--danger", 0.55, 0.15) }}
            />
            <rect
              x="98"
              y="26"
              width="12"
              height="8"
              style={{ fill: pig("--warn", 0.9, 0.12) }}
            />
          </g>
        );
      case "boat":
        return (
          <g>
            <path
              d="M58 92 L102 92 L96 99 L64 99 Z"
              style={{ fill: pig("--warn", 0.86, 0.04) }}
            />
            <rect
              x="72"
              y="84"
              width="22"
              height="8"
              style={{ fill: pig("--warn", 0.9, 0.04) }}
            />
            {[76, 82, 88].map((x) => (
              <rect
                key={x}
                x={x}
                y="86"
                width="3"
                height="3"
                style={{ fill: pig("--warn", 0.85, 0.14) }}
              />
            ))}
            <path
              d="M58 104 L102 104"
              strokeWidth="1.2"
              style={{ stroke: pig("--warn", 0.8, 0.12), opacity: 0.6 }}
            />
          </g>
        );
      case "kiln":
        return (
          <g style={{ fill: pig("--danger", 0.52, 0.1, 15) }}>
            <rect x="74" y="58" width="28" height="34" />
            <path
              d="M74 58 L88 30 L102 58 Z"
              style={{ fill: pig("--warn", 0.94, 0.02) }}
            />
            <rect x="102" y="70" width="34" height="22" />
            <path
              d="M100 70 L118 58 L138 70 Z"
              style={{ fill: pig("--accent", 0.32, 0.03) }}
            />
          </g>
        );
      case "reeds":
        return Array.from({ length: 26 }, (_, i) => (
          <path
            key={i}
            d={`M${4 + i * 6} 120 Q${6 + i * 6} ${96 - (i % 4) * 4} ${8 + i * 6 + (i % 3)} ${82 - (i % 5) * 3}`}
            fill="none"
            strokeWidth="1.3"
            style={{ stroke: pig("--warn", 0.42, 0.06, -10) }}
          />
        ));
      case "house":
        return (
          <g>
            <rect
              x="64"
              y="66"
              width="30"
              height="20"
              style={{ fill: pig("--warn", 0.92, 0.03) }}
            />
            <path
              d="M60 66 L79 52 L98 66 Z"
              style={{ fill: pig("--danger", 0.42, 0.08) }}
            />
            <rect
              x="0"
              y="92"
              width="160"
              height="2"
              style={{ fill: pig("--accent", 0.3, 0.02) }}
            />
            <rect
              x="0"
              y="98"
              width="160"
              height="2"
              style={{ fill: pig("--accent", 0.3, 0.02) }}
            />
            <rect
              x="110"
              y="56"
              width="3"
              height="36"
              style={{ fill: pig("--accent", 0.3, 0.02) }}
            />
            <circle
              cx="111.5"
              cy="56"
              r="3"
              style={{ fill: pig("--danger", 0.55, 0.2) }}
            />
          </g>
        );
      case "pool":
        return (
          <path
            d="M20 120 L34 70 L54 92 L68 64 L84 120 Z"
            style={{ fill: pig("--warn", 0.66, 0.03, -10), opacity: 0.6 }}
          />
        );
      case "mound":
        return <path d="M40 92 Q80 64 124 92 Z" style={{ fill: r.hills[2] }} />;
      case "mill":
        return (
          <g>
            <rect
              x="58"
              y="56"
              width="44"
              height="34"
              style={{ fill: pig("--warn", 0.9, 0.03) }}
            />
            <path
              d="M54 56 L80 40 L106 56 Z"
              style={{ fill: pig("--accent", 0.34, 0.03) }}
            />
            <circle
              cx="112"
              cy="84"
              r="14"
              fill="none"
              strokeWidth="2.5"
              style={{ stroke: pig("--warn", 0.38, 0.05, -20) }}
            />
            <rect
              x="66"
              y="64"
              width="8"
              height="10"
              style={{ fill: pig("--accent", 0.4, 0.04) }}
            />
            <rect
              x="86"
              y="64"
              width="8"
              height="10"
              style={{ fill: pig("--accent", 0.4, 0.04) }}
            />
          </g>
        );
      case "snow":
        return Array.from({ length: 5 }, (_, i) => (
          <path
            key={i}
            d={`M${20 + i * 30} 96 l6 -16 l6 16 Z`}
            style={{ fill: pig("--success", 0.32, 0.04, 20) }}
          />
        ));
      default:
        return null;
    }
  })();
  const waterTop = r.water
    ? kind === "boat"
      ? 88
      : kind === "reeds"
        ? 96
        : 84
    : 0;
  return (
    <svg
      viewBox="0 0 160 120"
      preserveAspectRatio="xMidYMid slice"
      className="block size-full"
      aria-hidden
    >
      <defs>
        <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: r.sky[0] }} />
          <stop offset="1" style={{ stopColor: r.sky[1] }} />
        </linearGradient>
      </defs>
      <rect width="160" height="120" fill={`url(#${uid})`} />
      {r.sun ? (
        <circle
          cx={r.sun[0]}
          cy={r.sun[1]}
          r={r.sun[2]}
          style={{ fill: r.sun[3] }}
        />
      ) : null}
      {kind === "boat"
        ? Array.from({ length: 16 }, (_, i) => (
            <circle
              key={i}
              cx={r3(hash(seed, i) * 160)}
              cy={r3(hash(seed + 1, i) * 60)}
              r={0.7}
              style={{ fill: pig("--warn", 0.96, 0.02) }}
            />
          ))
        : null}
      <path d={ridge(seed, 64, 10)} style={{ fill: r.hills[0] }} />
      {r.water ? (
        <rect
          y={waterTop}
          width="160"
          height={120 - waterTop}
          style={{ fill: r.water }}
        />
      ) : null}
      {kind === "fog" ? (
        <>
          <path d={ridge(seed + 2, 74, 8)} style={{ fill: r.hills[1] }} />
          <rect
            y="70"
            width="160"
            height="16"
            style={{ fill: r.sky[1], opacity: 0.7 }}
          />
          <path d={ridge(seed + 3, 90, 7)} style={{ fill: r.hills[2] }} />
        </>
      ) : (
        <>
          {r.water ? null : (
            <path d={ridge(seed + 2, 84, 8)} style={{ fill: r.hills[1] }} />
          )}
          {r.water ? null : (
            <path d={ridge(seed + 3, 100, 5)} style={{ fill: r.hills[2] }} />
          )}
        </>
      )}
      {feature}
    </svg>
  );
}

const PRINTS: {
  kind: PrintKind;
  alt: string;
  caption: string;
  detail: string;
}[] = [
  {
    kind: "trees",
    caption: "Orchard at dusk",
    detail: "Hollin Farm · October",
    alt: "A row of round apple trees against a rose and amber dusk.",
  },
  {
    kind: "flat",
    caption: "Salt flats",
    detail: "Basin road · noon",
    alt: "White salt flats under a pale sky with blue hills far off.",
  },
  {
    kind: "tower",
    caption: "Harbour light",
    detail: "Coldbrook · low tide",
    alt: "A white and red lighthouse at the end of a harbour wall.",
  },
  {
    kind: "boat",
    caption: "Night ferry",
    detail: "The crossing · 23:40",
    alt: "A lit ferry crossing dark water under a starry sky and a small moon.",
  },
  {
    kind: "kiln",
    caption: "Hop kiln",
    detail: "Fernworks estate",
    alt: "A brick kiln with a white cowl among green fields.",
  },
  {
    kind: "reeds",
    caption: "Reed beds",
    detail: "Saltmarsh · dawn",
    alt: "Tall reeds in front of still, pale water at sunrise.",
  },
  {
    kind: "house",
    caption: "Signal box",
    detail: "Waylight line",
    alt: "A small signal box beside the rails with a red signal lamp.",
  },
  {
    kind: "snow",
    caption: "First snow",
    detail: "Upper fell",
    alt: "White fells under a grey sky with a few dark pines.",
  },
  {
    kind: "pool",
    caption: "Quarry pool",
    detail: "Gaugeworks · August",
    alt: "A green pool at the foot of pale quarry cliffs.",
  },
  {
    kind: "mound",
    caption: "Long barrow",
    detail: "The ridgeway · winter",
    alt: "A long grassy mound on a ridge under a low winter sun.",
  },
  {
    kind: "mill",
    caption: "Tide mill",
    detail: "Basin creek",
    alt: "A white mill with a water wheel on a creek.",
  },
  {
    kind: "fog",
    caption: "Fog bank",
    detail: "The headland · 6 am",
    alt: "Grey headlands fading into a bank of fog.",
  },
];

export const defaultPlanetariumImages: PlanetariumImage[] = PRINTS.map(
  (p, i) => ({
    id: `print-${i + 1}`,
    alt: p.alt,
    caption: p.caption,
    detail: p.detail,
    art: <PrintArt kind={p.kind} seed={i * 3 + 1} />,
  }),
);

/* --------------------------------- the dome -------------------------------- */

type Camera = { yaw: number; alt: number };

type Basis = { f: V3; r: V3; u: V3 };

const basisOf = (cam: Camera): Basis => {
  const y = cam.yaw * D2R;
  const a = cam.alt * D2R;
  return {
    f: dirOf(y, a),
    r: [-Math.sin(y), Math.cos(y), 0],
    u: [-Math.cos(y) * Math.sin(a), -Math.sin(y) * Math.sin(a), Math.cos(a)],
  };
};

type View = { w: number; h: number; F: number; limit: number };

const viewOf = (w: number, h: number, fov: number): View => {
  const half = (clamp(fov, 70, 150) * D2R) / 2;
  return {
    w,
    h,
    // The equisolid fisheye: fov/2 lands at half the longer side.
    F: Math.max(w, h) / 2 / (2 * Math.sin(half / 2)),
    limit: half + 14 * D2R,
  };
};

/** Screen position (px, y down) and the angle from the view's centre. */
function project(d: V3, b: Basis, v: View): [number, number, number] {
  const x = dot(d, b.r);
  const y = dot(d, b.u);
  const z = clamp(dot(d, b.f), -1, 1);
  const theta = Math.acos(z);
  const s = Math.hypot(x, y);
  if (s < 1e-9) return [v.w / 2, v.h / 2, theta];
  const rho = v.F * 2 * Math.sin(theta / 2);
  return [v.w / 2 + (rho * x) / s, v.h / 2 - (rho * y) / s, theta];
}

type Slot = { d: V3; right: V3; north: V3; group: number };

/** Constellations of three: one high near the zenith, the rest in a ring. */
function layoutDome(count: number, spacing: number, seed: number): Slot[] {
  const groups = Math.max(1, Math.ceil(count / 3));
  const s = clamp(spacing, 0.6, 1.6);
  const out: Slot[] = [];
  for (let i = 0; i < count; i += 1) {
    const g = Math.floor(i / 3);
    const k = i % 3;
    const ring = groups - 1;
    const az =
      g === 0
        ? 30
        : ((g - 1) / Math.max(1, ring)) * 360 + 50 + (hash(seed, g) - 0.5) * 26;
    const alt =
      g === 0
        ? 90 - 13 * s
        : clamp(64 - 14 * s + (hash(seed + 1, g) - 0.5) * 8, 22, 72);
    const c = dirOf(az * D2R, alt * D2R);
    const e = norm(cross([0, 0, 1], c));
    const n = cross(c, e);
    // Three prints on a loose triangle around the group's centre.
    const a =
      (k / 3) * Math.PI * 2 +
      hash(seed + 2, g) * 6.28 +
      (hash(seed + 3, i) - 0.5) * 0.8;
    const reach = (11 + hash(seed + 4, i) * 4) * s * D2R;
    const d = norm([
      c[0] + (e[0] * Math.cos(a) + n[0] * Math.sin(a)) * reach,
      c[1] + (e[1] * Math.cos(a) + n[1] * Math.sin(a)) * reach,
      c[2] + (e[2] * Math.cos(a) + n[2] * Math.sin(a)) * reach,
    ]);
    const east = norm(cross([0, 0, 1], d));
    const north = cross(d, east);
    out.push({
      d,
      right: cross(north, d),
      north,
      group: g,
    });
  }
  return out;
}

type Pose = {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
  y: number;
  theta: number;
};

/** A print's CSS matrix: the projection's Jacobian at its centre, scaled to its angular size. */
function poseOf(slot: Slot, b: Basis, v: View, size: number): Pose {
  const eps = 0.004;
  const [px, py, theta] = project(slot.d, b, v);
  const step = (dir: V3) =>
    project(
      norm([
        slot.d[0] + dir[0] * eps,
        slot.d[1] + dir[1] * eps,
        slot.d[2] + dir[2] * eps,
      ]),
      b,
      v,
    );
  const [rx, ry] = step(slot.right);
  const [nx, ny] = step(slot.north);
  const aw = size * D2R;
  const ah = aw * 0.75;
  const a = ((rx - px) / eps) * (aw / W0);
  const bb = ((ry - py) / eps) * (aw / W0);
  const c = (-(nx - px) / eps) * (ah / H0);
  const d = (-(ny - py) / eps) * (ah / H0);
  return {
    a,
    b: bb,
    c,
    d,
    x: px - (a * W0 + c * H0) / 2,
    y: py - (bb * W0 + d * H0) / 2,
    theta,
  };
}

const matrix = (p: Pose) =>
  `matrix(${r3(p.a)}, ${r3(p.b)}, ${r3(p.c)}, ${r3(p.d)}, ${r3(p.x)}, ${r3(p.y)})`;

/** Rotation, scales and shear of a 2D matrix, so a flight can tween them. */
function decompose(p: Pose) {
  const sx = Math.hypot(p.a, p.b) || 1e-6;
  const rot = Math.atan2(p.b, p.a);
  const k = (p.a * p.c + p.b * p.d) / sx;
  const sy = (p.a * p.d - p.b * p.c) / sx;
  // The centre, not the corner, travels in a straight line.
  const cx = p.x + (p.a * W0 + p.c * H0) / 2;
  const cy = p.y + (p.b * W0 + p.d * H0) / 2;
  return { sx, sy, k, rot, cx, cy };
}

function compose(
  sx: number,
  sy: number,
  k: number,
  rot: number,
  cx: number,
  cy: number,
): Pose {
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const a = sx * cs;
  const b = sx * sn;
  const c = k * cs - sy * sn;
  const d = k * sn + sy * cs;
  return {
    a,
    b,
    c,
    d,
    x: cx - (a * W0 + c * H0) / 2,
    y: cy - (b * W0 + d * H0) / 2,
    theta: 0,
  };
}

/* -------------------------------- component ------------------------------- */

/**
 * A gallery seen from the floor of a planetarium. The stage is the view up
 * into a dome — a soft radial ground, a faint graticule of altitude rings and
 * meridians, seeded stars — with the prints pinned to the inside of the dome
 * in loose constellations of three, each group joined by thin lines. Every
 * print is a flat card tangent to the sphere, posed by the Jacobian of an
 * equisolid fisheye at its centre, so prints near the edge compress and turn
 * with the curve: the dome's edges curve away. Tops point to the zenith.
 *
 * Dragging turns the whole dome 1:1 under the finger and a release coasts on
 * with the throw, decaying by `inertia`; with `drift` it turns slowly by
 * itself while idle. Clicking a print flies it down into focus: a copy starts
 * at the print's exact pose — its matrix decomposed into rotation, scales,
 * shear and centre — and tweens to an upright, centred, enlarged pose on
 * springs.glide while the dome dims and the caption rises in; Escape, Close
 * or a click on the dome flies it back. The prints are buttons with one tab
 * stop: the arrow keys move between prints and constellations and the dome
 * turns to each on springs.glide. Under reduced motion nothing drifts or
 * coasts and a print in focus cross-fades in.
 */
export function PlanetariumRoof({
  items = defaultPlanetariumImages,
  fov = 110,
  spacing = 1,
  inertia = 0.6,
  value,
  defaultValue = null,
  onValueChange,
  drift = 1.2,
  altitude = 84,
  cardSize = 17,
  graticule = true,
  lines = true,
  stars = 140,
  seed = 4,
  height = 480,
  label = "Planetarium gallery",
  disabled = false,
  className,
}: PlanetariumRoofProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = items.length > 0 ? items : defaultPlanetariumImages;
  const n = list.length;
  const idOf = (i: number) => list[i]?.id ?? `print-${i}`;
  const slots = React.useMemo(
    () => layoutDome(n, spacing, Math.round(seed)),
    [n, spacing, seed],
  );

  const norm1 = (v: number | null | undefined) =>
    v === null || v === undefined ? null : clamp(Math.round(v), 0, n - 1);
  const [own, setOwn] = React.useState<number | null>(() =>
    norm1(defaultValue),
  );
  const current = value === undefined ? norm1(own) : norm1(value);
  /** The print on the overlay: it outlives `current` while it flies back. */
  const [overlay, setOverlay] = React.useState<number | null>(current);
  const [seen, setSeen] = React.useState<number | null>(current);
  if (current !== seen) {
    setSeen(current);
    if (current !== null) setOverlay(current);
  }
  const [roving, setRoving] = React.useState(0);
  const [said, setSaid] = React.useState("");

  // The view the server draws: the first constellation's ring group in front.
  const startYaw = 230;
  const startAlt = clamp(altitude, 30, 90);
  const cam = React.useRef<Camera>({ yaw: startYaw, alt: startAlt });
  const vel = React.useRef({ yaw: 0, alt: 0 });
  const aim = React.useRef<Camera | null>(null);
  const size = React.useRef({ w: 720, h: height });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const cardRefs = React.useRef(new Map<string, HTMLElement>());
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const flyRef = React.useRef<HTMLDivElement | null>(null);
  const captionRef = React.useRef<HTMLDivElement | null>(null);
  const dimRef = React.useRef<HTMLDivElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const flight = React.useRef<AnimationPlaybackControls | null>(null);
  const progress = React.useRef(0);
  const visible = React.useRef(false);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const dragging = React.useRef(false);
  const colours = React.useRef({ line: "grey", star: "grey", link: "grey" });

  const register = React.useCallback(
    (kind: "card" | "button", id: string, node: HTMLElement | null) => {
      const map = kind === "card" ? cardRefs.current : buttonRefs.current;
      if (node) map.set(id, node);
      else map.delete(id);
    },
    [],
  );

  const live = React.useRef({
    fov,
    inertia,
    drift,
    cardSize,
    graticule,
    lines,
    stars,
    seed,
    motionSafe,
    slots,
    list,
    open: overlay !== null,
    disabled,
  });
  React.useLayoutEffect(() => {
    live.current = {
      fov,
      inertia,
      drift,
      cardSize,
      graticule,
      lines,
      stars,
      seed,
      motionSafe,
      slots,
      list,
      open: overlay !== null,
      disabled,
    };
  });

  /** Writes every print's pose and redraws the dome's lines and stars. */
  const render = React.useCallback(() => {
    const k = live.current;
    const { w, h } = size.current;
    if (w < 2 || h < 2) return;
    const b = basisOf(cam.current);
    const v = viewOf(w, h, k.fov);
    for (let i = 0; i < k.slots.length; i += 1) {
      const slot = k.slots[i];
      const node = cardRefs.current.get(k.list[i]?.id ?? `print-${i}`);
      if (!slot || !node) continue;
      const p = poseOf(slot, b, v, k.cardSize);
      const fade = clamp01((v.limit - 6 * D2R - p.theta) / (16 * D2R));
      // A print past the edge only fades: it stays focusable, so the roving
      // tab stop can always be reached and the dome turns to it.
      if (fade <= 0) {
        node.style.opacity = "0";
        node.style.pointerEvents = "none";
        continue;
      }
      node.style.pointerEvents = "";
      node.style.opacity = String(r3(fade));
      node.style.transform = matrix(p);
      node.style.zIndex = String(Math.round((1 - p.theta / Math.PI) * 100));
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const trace = (
      pts: (az: number) => V3,
      from: number,
      to: number,
      stepDeg: number,
    ) => {
      let drawing = false;
      for (let t = from; t <= to + 1e-6; t += stepDeg) {
        const [x, y, theta] = project(pts(t * D2R), b, v);
        if (theta > v.limit) {
          drawing = false;
          continue;
        }
        if (!drawing) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        drawing = true;
      }
    };
    if (k.graticule) {
      ctx.strokeStyle = colours.current.line;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      for (const alt of [0, 15, 30, 45, 60, 75]) {
        trace((az) => dirOf(az, alt * D2R), 0, 360, 4);
      }
      for (let m = 0; m < 12; m += 1) {
        trace((a) => dirOf(m * 30 * D2R, a), 0, 84, 4);
      }
      ctx.stroke();
    }
    ctx.fillStyle = colours.current.star;
    const s = Math.round(k.seed);
    for (let i = 0; i < k.stars; i += 1) {
      const az = hash(s + 40, i) * Math.PI * 2;
      const alt = Math.asin(0.08 + hash(s + 41, i) * 0.92);
      const [x, y, theta] = project(dirOf(az, alt), b, v);
      if (theta > v.limit) continue;
      ctx.globalAlpha = 0.18 + hash(s + 42, i) * 0.5;
      const rad = 0.5 + hash(s + 43, i) * 0.9;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    if (k.lines) {
      ctx.strokeStyle = colours.current.link;
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < k.slots.length; i += 1) {
        const a = k.slots[i];
        const bb = k.slots[i + 1];
        if (!a || !bb || a.group !== bb.group) continue;
        for (let t = 0; t <= 8; t += 1) {
          const u = t / 8;
          const d = norm([
            lerp(a.d[0], bb.d[0], u),
            lerp(a.d[1], bb.d[1], u),
            lerp(a.d[2], bb.d[2], u),
          ]);
          const [x, y, theta] = project(d, b, v);
          if (theta > v.limit) break;
          if (t === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, []);

  const stepCamera = React.useCallback((dt: number) => {
    const k = live.current;
    const c = cam.current;
    let moving = false;
    if (aim.current) {
      // Glide's constants, per degree, toward the aimed print.
      const t = aim.current;
      const kS = springs.glide.stiffness / springs.glide.mass;
      const dS = springs.glide.damping / springs.glide.mass;
      let dy = ((t.yaw - c.yaw + 540) % 360) - 180;
      const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
      for (let i = 0; i < sub; i += 1) {
        const h = dt / sub;
        vel.current.yaw += (kS * dy - dS * vel.current.yaw) * h;
        vel.current.alt += (kS * (t.alt - c.alt) - dS * vel.current.alt) * h;
        c.yaw += vel.current.yaw * h;
        c.alt += vel.current.alt * h;
        dy = ((t.yaw - c.yaw + 540) % 360) - 180;
      }
      if (
        Math.abs(dy) < 0.02 &&
        Math.abs(t.alt - c.alt) < 0.02 &&
        Math.abs(vel.current.yaw) + Math.abs(vel.current.alt) < 0.05
      ) {
        c.yaw = t.yaw;
        c.alt = t.alt;
        vel.current.yaw = 0;
        vel.current.alt = 0;
        aim.current = null;
      } else moving = true;
    } else if (Math.abs(vel.current.yaw) + Math.abs(vel.current.alt) > 0.4) {
      // A throw coasting down: inertia sets how long it keeps going.
      const tau = lerp(0.08, 1.4, clamp01(k.inertia));
      const decay = Math.exp(-dt / tau);
      c.yaw += vel.current.yaw * dt;
      c.alt += vel.current.alt * dt;
      vel.current.yaw *= decay;
      vel.current.alt *= decay;
      moving = true;
    } else {
      vel.current.yaw = 0;
      vel.current.alt = 0;
    }
    if (c.alt > 90) {
      c.alt = 90;
      vel.current.alt = 0;
    } else if (c.alt < 30) {
      c.alt = 30;
      vel.current.alt = 0;
    }
    const drifting =
      k.motionSafe && k.drift !== 0 && !k.open && !dragging.current && !moving;
    if (drifting) c.yaw += k.drift * dt;
    c.yaw = ((c.yaw % 360) + 360) % 360;
    return moving || drifting;
  }, []);

  // The loop lives in a ref so it can schedule itself without a stale copy.
  const loop = React.useRef<(now: number) => void>(() => {});
  const kick = React.useCallback(() => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame((t) => loop.current(t));
  }, []);
  React.useLayoutEffect(() => {
    loop.current = (now: number) => {
      frame.current = 0;
      if (!visible.current || document.hidden) {
        last.current = 0;
        return;
      }
      const dt = last.current
        ? Math.min(0.05, (now - last.current) / 1000)
        : 1 / 60;
      last.current = now;
      const more = stepCamera(dt);
      render();
      if (more) {
        frame.current = window.requestAnimationFrame((t) => loop.current(t));
      } else last.current = 0;
    };
  });

  const readColours = React.useCallback(() => {
    const kids = carriersRef.current?.children;
    if (!kids) return;
    const get = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "grey";
    };
    colours.current = { line: get(0), star: get(1), link: get(2) };
  }, []);

  // Every commit: props may have moved prints or changed the dome's look.
  React.useLayoutEffect(() => {
    render();
    kick();
  });

  React.useEffect(
    () => () => {
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      flight.current?.stop();
    },
    [],
  );

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [kick]);

  /* ------------------------------ the flight ------------------------------ */

  const focusPose = () => {
    const { w, h } = size.current;
    const s = Math.min((w * 0.66) / W0, (h * 0.56) / H0);
    return { s, cx: w / 2, cy: h * 0.43 };
  };

  /** Writes the overlay print at a share of its flight between its dome pose and focus. */
  const placeFlightAt = (index: number, p: number) => {
    const fly = flyRef.current;
    const slot = live.current.slots[index];
    const { w, h } = size.current;
    if (!fly || !slot || w < 2) return;
    const k = live.current;
    const from = decompose(
      poseOf(slot, basisOf(cam.current), viewOf(w, h, k.fov), k.cardSize),
    );
    const to = focusPose();
    const motion = k.motionSafe;
    const q = motion ? p : 1;
    let dRot = -from.rot;
    dRot = ((dRot + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const pose = compose(
      lerp(from.sx, to.s, q),
      lerp(from.sy, to.s, q),
      lerp(from.k, 0, q),
      from.rot + dRot * q,
      lerp(from.cx, to.cx, q),
      lerp(from.cy, to.cy, q),
    );
    fly.style.transform = matrix(pose);
    fly.style.opacity = motion ? "1" : String(r3(p));
    const dim = dimRef.current;
    if (dim) dim.style.opacity = String(r3(p));
    const cap = captionRef.current;
    if (cap) {
      const t = clamp01((p - 0.55) / 0.45);
      cap.style.opacity = String(r3(t));
      cap.style.top = `${r3(to.cy + (H0 * to.s) / 2 + 14)}px`;
      cap.style.transform = motion
        ? `translate(-50%, ${r3((1 - t) * 8)}px)`
        : "translate(-50%, 0px)";
    }
  };
  const placeFlight = () => {
    if (overlayRef.current !== null)
      placeFlightAt(overlayRef.current, progress.current);
  };
  const overlayRef = React.useRef<number | null>(overlay);
  React.useLayoutEffect(() => {
    overlayRef.current = overlay;
  });

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const measure = () => {
        size.current = { w: node.clientWidth, h: node.clientHeight };
        render();
        placeFlight();
      };
      readColours();
      measure();
      const sizer = new ResizeObserver(measure);
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
        if (visible.current) kick();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        visible.current = false;
      };
    },
    // placeFlight is stable (refs only).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [render, kick, readColours],
  );

  // A print came into focus: fly it down from where it hangs (or, if it was
  // on its way back, turn it round from where it is).
  React.useLayoutEffect(() => {
    if (overlay === null || current !== overlay) return;
    aim.current = null;
    vel.current = { yaw: 0, alt: 0 };
    flight.current?.stop();
    const index = overlay;
    const from = progress.current;
    placeFlightAt(index, from);
    closeRef.current?.focus({ preventScroll: true });
    const done = (p: number) => {
      progress.current = p;
      placeFlightAt(index, p);
    };
    flight.current = live.current.motionSafe
      ? animate(from, 1, { ...springs.glide, onUpdate: done })
      : animate(from, 1, {
          duration: durations.base,
          ease: easings.enter,
          onUpdate: done,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, current]);

  const returnTo = React.useRef<number | null>(null);
  React.useLayoutEffect(() => {
    if (overlay !== null || returnTo.current === null) return;
    const index = returnTo.current;
    returnTo.current = null;
    const id = live.current.list[index]?.id ?? `print-${index}`;
    const button = buttonRefs.current.get(id);
    if (button?.isConnected) button.focus({ preventScroll: true });
  }, [overlay]);

  // Back to the dome: fly it home, then hand focus back to its print.
  React.useLayoutEffect(() => {
    if (current !== null || overlay === null) return;
    flight.current?.stop();
    const index = overlay;
    const from = progress.current;
    const finish = () => {
      progress.current = 0;
      const root = rootRef.current;
      const active = document.activeElement;
      // Focus goes back to the print once the dome is no longer inert.
      if (
        !active ||
        active === document.body ||
        (root && root.contains(active))
      ) {
        returnTo.current = index;
      }
      setOverlay(null);
      kick();
    };
    flight.current = live.current.motionSafe
      ? animate(from, 0, {
          ...springs.glide,
          onUpdate: (p) => {
            progress.current = p;
            placeFlightAt(index, p);
          },
          onComplete: finish,
        })
      : animate(from, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onUpdate: (p) => {
            progress.current = p;
            placeFlightAt(index, p);
          },
          onComplete: finish,
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, overlay]);

  const setOpen = (next: number | null) => {
    if (disabled) return;
    const to = next === null ? null : clamp(next, 0, n - 1);
    if (to === current) return;
    if (value === undefined) setOwn(to);
    onValueChange?.(to);
    if (to !== null) {
      const item = list[to];
      setRoving(to);
      setSaid(
        `${item?.caption ?? item?.alt ?? ""}, ${to + 1} of ${n}, in focus.`,
      );
    } else {
      setSaid("Back on the dome.");
    }
  };

  /** Turns the dome to bring a print toward the middle. */
  const aimAt = (index: number) => {
    const slot = slots[index];
    if (!slot) return;
    const az = (Math.atan2(slot.d[1], slot.d[0]) / D2R + 360) % 360;
    const alt = clamp(Math.asin(clamp(slot.d[2], -1, 1)) / D2R, 30, 90);
    if (!motionSafe) {
      cam.current = { yaw: az, alt };
      vel.current = { yaw: 0, alt: 0 };
      aim.current = null;
      render();
      return;
    }
    aim.current = { yaw: az, alt };
    kick();
  };

  /* ------------------------------ gestures ------------------------------ */

  const degPerPx = () => {
    const { w, h } = size.current;
    return 1 / D2R / viewOf(w, h, fov).F;
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      if (overlay !== null) return;
      dragging.current = true;
      aim.current = null;
      vel.current = { yaw: 0, alt: 0 };
    },
    onMove: ({ delta }) => {
      if (!dragging.current) return;
      const k = degPerPx();
      cam.current.yaw -= delta.x * k;
      cam.current.alt = clamp(cam.current.alt + delta.y * k, 30, 90);
      render();
    },
    onEnd: ({ velocity }) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (motionSafe && inertia > 0) {
        const k = degPerPx();
        vel.current = { yaw: -velocity.x * k, alt: velocity.y * k };
      }
      kick();
    },
    onCancel: () => {
      dragging.current = false;
      kick();
    },
    onTap: (event) => {
      const target = event.target as Element | null;
      if (overlay !== null) {
        if (target?.closest("[data-planetarium-close], [data-planetarium-fly]"))
          return;
        setOpen(null);
        return;
      }
      const hit = target?.closest("[data-print]");
      if (!hit) return;
      const index = Number(hit.getAttribute("data-print"));
      if (Number.isFinite(index)) setOpen(index);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (overlay !== null) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(null);
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const from = current ?? overlay;
        setOpen((from + (event.key === "ArrowRight" ? 1 : n - 1)) % n);
      }
      return;
    }
    const groups = Math.ceil(n / 3);
    let to: number | null = null;
    if (event.key === "ArrowRight") to = (roving + 1) % n;
    else if (event.key === "ArrowLeft") to = (roving + n - 1) % n;
    else if (event.key === "ArrowDown")
      to = (((Math.floor(roving / 3) + 1) % groups) * 3) % n;
    else if (event.key === "ArrowUp")
      to = (((Math.floor(roving / 3) + groups - 1) % groups) * 3) % n;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = n - 1;
    if (to === null) return;
    event.preventDefault();
    setRoving(to);
    buttonRefs.current.get(idOf(to))?.focus({ preventScroll: true });
    aimAt(to);
    const item = list[to];
    setSaid(`${item?.caption ?? item?.alt ?? ""}, ${to + 1} of ${n}.`);
  };

  /* ------------------------------ server pose ------------------------------ */

  const serverPose = (i: number) => {
    const slot = slots[i];
    if (!slot) return { transform: "none", opacity: 0 };
    const v = viewOf(720, height, fov);
    const p = poseOf(
      slot,
      basisOf({ yaw: startYaw, alt: startAlt }),
      v,
      cardSize,
    );
    const fade = clamp01((v.limit - 6 * D2R - p.theta) / (16 * D2R));
    return { transform: matrix(p), opacity: r3(fade) };
  };

  const shown = overlay === null ? null : list[overlay];

  return (
    <div
      ref={bindRoot}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      aria-describedby={hintId}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/planetarium-roof relative isolate w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={{
        height,
        backgroundImage:
          "radial-gradient(closest-corner circle at 50% 50%, var(--surface-1) 0%, var(--surface-0) 62%, color-mix(in oklab, var(--surface-0) 86%, var(--ink)) 100%)",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span className="text-ink" />
        <span className="text-ink-2" />
        <span className="text-cobalt-bright" />
      </span>
      <span
        aria-hidden
        onTransitionEnd={() => {
          readColours();
          render();
        }}
        className="pointer-events-none absolute size-0 overflow-hidden text-ink transition-colors duration-1"
      />
      <div className="absolute inset-0" inert={overlay !== null || undefined}>
        {list.map((item, i) => {
          const id = idOf(i);
          const pose = serverPose(i);
          const title = item.caption ?? item.alt;
          return (
            <div
              key={id}
              ref={(node) => register("card", id, node)}
              data-print={i}
              className="absolute top-0 left-0 origin-top-left"
              style={{
                width: W0,
                height: H0,
                transform: pose.transform,
                opacity: pose.opacity,
              }}
            >
              <button
                ref={(node) => register("button", id, node)}
                type="button"
                tabIndex={i === roving ? 0 : -1}
                disabled={disabled}
                aria-roledescription="slide"
                aria-label={`${title}, ${i + 1} of ${n}`}
                onFocus={() => {
                  setRoving(i);
                  // Tabbed onto a print the dome has turned away: bring it round.
                  const slot = slots[i];
                  const { w, h } = size.current;
                  if (!slot || w < 2) return;
                  const v = viewOf(w, h, fov);
                  const [, , theta] = project(slot.d, basisOf(cam.current), v);
                  if (theta > v.limit - 30 * D2R) aimAt(i);
                }}
                onClick={(event) => {
                  // Pointer presses arrive through the drag's tap; Enter,
                  // Space and assistive technology come through here.
                  if (event.detail === 0) setOpen(i);
                }}
                className={cn(
                  overlay === i && "invisible",
                  "block size-full cursor-pointer rounded-[3px] bg-[oklch(0.985_0.006_80)] p-[4px] shadow-[0_2px_10px_oklch(0_0_0/0.22)] transition-shadow",
                  "hover:shadow-[0_4px_16px_oklch(0_0_0/0.3)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  "disabled:cursor-not-allowed",
                )}
              >
                <span className="relative block size-full overflow-hidden rounded-[1px]">
                  {item.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.src}
                      alt=""
                      draggable={false}
                      className="block size-full object-cover"
                    />
                  ) : (
                    (item.art ?? <span className="block size-full bg-muted" />)
                  )}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {overlay !== null ? (
        <div className="absolute inset-0 z-[200]">
          <div
            ref={dimRef}
            aria-hidden
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--background)_62%,transparent)] backdrop-blur-[2px]"
            style={{ opacity: 0 }}
          />
          <div
            role="group"
            aria-label={`In focus: ${shown?.caption ?? shown?.alt ?? ""}`}
            className="contents"
          >
            <div
              ref={flyRef}
              data-planetarium-fly=""
              className="absolute top-0 left-0 origin-top-left rounded-[3px] bg-[oklch(0.985_0.006_80)] p-[3px] shadow-[0_10px_40px_oklch(0_0_0/0.35)]"
              style={{ width: W0, height: H0 }}
            >
              <span className="relative block size-full overflow-hidden rounded-[1px]">
                {shown?.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shown.src}
                    alt={shown.alt}
                    draggable={false}
                    className="block size-full object-cover"
                  />
                ) : (
                  <span
                    role="img"
                    aria-label={shown?.alt}
                    className="block size-full"
                  >
                    {shown?.art ?? (
                      <span className="block size-full bg-muted" />
                    )}
                  </span>
                )}
              </span>
            </div>
            <div
              ref={captionRef}
              className="pointer-events-none absolute left-1/2 flex w-[min(86%,440px)] flex-col items-center gap-1 text-center"
              style={{ opacity: 0, top: "70%" }}
            >
              <p
                className="max-w-full truncate text-base font-medium text-foreground"
                title={shown?.caption ?? shown?.alt}
              >
                {shown?.caption ?? shown?.alt}
              </p>
              {shown?.detail ? (
                <p className="max-w-full truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {shown.detail} · {(overlay ?? 0) + 1} / {n}
                </p>
              ) : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              data-planetarium-close=""
              aria-label="Back to the dome"
              onClick={() => setOpen(null)}
              className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-full border border-hairline-strong bg-card text-ink-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <p id={hintId} className="sr-only">
        Prints on the inside of a dome. Drag to turn the dome. The arrow keys
        move between prints, Up and Down between constellations, and the dome
        turns to each; Enter or Space brings a print into focus, and Escape
        sends it back.
      </p>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
