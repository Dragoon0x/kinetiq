"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag, wheelPixels } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type FieldLoupeNote = {
  /** Stable id: the open note is reported by it. */
  id: string;
  /** Where the note is pinned, as a fraction of the photo's width (0 left, 1 right). */
  x: number;
  /** Where the note is pinned, as a fraction of the photo's height (0 top, 1 bottom). */
  y: number;
  /** The note's heading. */
  title: string;
  /** One or two sentences about what is under the ring. */
  body: string;
  /** A small mono line above the title, e.g. a maker or a part number. */
  tag?: string;
};

export type FieldLoupeProps = {
  /** The annotated points. @default five notes on the drawn workbench */
  notes?: readonly FieldLoupeNote[];
  /** An image to inspect instead of the drawn workbench. Magnified, a raster shows its own pixels: give it room. */
  src?: string;
  /** What the photo shows, for assistive technology. @default a description of the workbench */
  alt?: string;
  /** The photo's width divided by its height. @default 1.6 */
  aspectRatio?: number;
  /** Controlled: the id of the open note, or null. */
  value?: string | null;
  /** The note open at first when uncontrolled. @default the first note */
  defaultValue?: string | null;
  /** Fires when a note opens (its id) or closes (null). */
  onValueChange?: (id: string | null) => void;
  /** Magnification at rest; the wheel, a pinch or + and - change it from there. @default 2.5 */
  power?: number;
  /** The least the wheel or a pinch can magnify. @default 1.25 */
  minPower?: number;
  /** The most the wheel or a pinch can magnify. @default 5 */
  maxPower?: number;
  /** Fires when the wheel, a pinch or a key changes the magnification. */
  onPowerChange?: (power: number) => void;
  /** The lens's diameter in px, capped to fit small photos. @default 144 */
  lensSize?: number;
  /** How strongly notes pull the loupe, 0 (it glides freely) to 1 (a firm magnetic detent). @default 0.6 */
  snap?: number;
  /** Let the wheel and a trackpad pinch change magnification over the photo. @default true */
  wheelZoom?: boolean;
  /** Draw the hairline rings that mark each note. @default true */
  markers?: boolean;
  /** The rim, any CSS colour. @default a brass pigment */
  rimColor?: string;
  /** Names the photo with its notes for assistive technology. @default "Photo with notes" */
  label?: string;
  /** Shows the photo without the loupe's input. @default false */
  disabled?: boolean;
  /** Sizes the component; the photo keeps its aspect ratio at this width. @default "w-full" */
  className?: string;
};

export const defaultFieldLoupeNotes: FieldLoupeNote[] = [
  {
    id: "gauge",
    x: 0.842,
    y: 0.31,
    tag: "Fieldline · 0–60 psi",
    title: "Fieldline gauge",
    body: "Line pressure for the air tools. The needle rests at 42 after the morning's leak test.",
  },
  {
    id: "plane",
    x: 0.538,
    y: 0.632,
    tag: "Fernworks · No. 4",
    title: "Smoothing plane",
    body: "The lever cap carries the maker's stamp. Its iron is honed at 25° and touched up weekly.",
  },
  {
    id: "vise",
    x: 0.135,
    y: 0.764,
    tag: "Bench hardware",
    title: "Beech-jaw vise",
    body: "A quick-release front vise. Leather facings keep the jaws from marking soft work.",
  },
  {
    id: "square",
    x: 0.42,
    y: 0.294,
    tag: "Fernworks · 150 mm",
    title: "Try square",
    body: "An engraved brass blade, checked against the reference edge every spring.",
  },
  {
    id: "glue",
    x: 0.691,
    y: 0.606,
    tag: "Kept at 60 °C",
    title: "Hide glue pot",
    body: "Warm hide glue gives about five minutes of open time before it grabs.",
  },
];

const DEFAULT_ALT =
  "A woodworker's bench under a lamp: tools hang on a pegboard, a pressure gauge on a pipe, a hand plane among shavings, a glue pot and a vise at the front edge.";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------ the workbench ------------------------------ */

/** Points on a circle, rounded so the server and the browser draw the same dial. */
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return {
    x: Number((cx + r * Math.cos(a)).toFixed(3)),
    y: Number((cy + r * Math.sin(a)).toFixed(3)),
  };
};

/** The gauge's dial: 270° of sweep, 0 at lower left, 60 at lower right. */
const GAUGE = { cx: 673, cy: 155, r: 36 };
const dialAngle = (v: number) => 135 + (v / 60) * 270;
const GAUGE_TICKS = Array.from({ length: 61 }, (_, i) => {
  const deg = dialAngle(i);
  const major = i % 10 === 0;
  const a = polar(GAUGE.cx, GAUGE.cy, GAUGE.r - 3, deg);
  const b = polar(
    GAUGE.cx,
    GAUGE.cy,
    GAUGE.r - (major ? 9 : i % 5 === 0 ? 7 : 5.5),
    deg,
  );
  return { i, a, b, major };
});
const GAUGE_NUMBERS = [0, 10, 20, 30, 40, 50, 60].map((v) => ({
  v,
  p: polar(GAUGE.cx, GAUGE.cy, GAUGE.r - 15, dialAngle(v)),
}));
const NEEDLE = polar(GAUGE.cx, GAUGE.cy, GAUGE.r - 7, dialAngle(42));
const NEEDLE_TAIL = polar(GAUGE.cx, GAUGE.cy, 7, dialAngle(42) + 180);

/** Pegboard holes, one path. */
const PEG_HOLES = (() => {
  const parts: string[] = [];
  for (let y = 34; y <= 250; y += 22) {
    for (let x = 30; x <= 560; x += 22) {
      parts.push(`M${x - 1.6} ${y}a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0`);
    }
  }
  return parts.join("");
})();

/** Wood grain on the bench top: long, slightly wandering lines. */
const GRAIN = Array.from({ length: 14 }, (_, i) => {
  const y = 318 + i * 6.5 + ((i * 37) % 5);
  const wobble = 1.5 + ((i * 13) % 4) * 0.6;
  return `M0 ${y} C 180 ${r2(y - wobble)} 320 ${r2(y + wobble)} 520 ${r2(y - wobble * 0.5)} S 760 ${r2(y + wobble)} 800 ${y}`;
});

/** Shavings: loose curls beside the plane. */
const SHAVINGS = [
  "M455 352 c-14 -8 -30 2 -24 14 c5 9 21 6 20 -4 c-1 -7 -11 -7 -12 -1",
  "M612 362 c10 -12 28 -8 26 6 c-2 10 -18 10 -18 1 c0 -6 8 -7 10 -3",
  "M585 344 c-8 -10 -24 -6 -22 6 c2 9 16 8 16 0",
  "M440 380 c18 -6 34 6 26 16 c-6 7 -18 2 -15 -5",
];

/**
 * The default photo: a woodworker's bench under a lamp, drawn as vectors so
 * the loupe finds real detail when it magnifies — the gauge's scale and its
 * maker's name, the stamp on the plane's lever cap, the square's engraved
 * graduations, the label on the glue pot.
 */
function BenchScene({ id, className }: { id: string; className?: string }) {
  const ink = "oklch(0.24 0.012 250)";
  const brass = "oklch(0.76 0.11 84)";
  const brassDark = "oklch(0.58 0.1 70)";
  const steel = "oklch(0.8 0.008 250)";
  const steelDark = "oklch(0.36 0.01 250)";
  const rosewood = "oklch(0.44 0.09 38)";
  const oak = "oklch(0.64 0.085 66)";
  const oakDark = "oklch(0.47 0.07 58)";
  const beech = "oklch(0.78 0.065 76)";
  return (
    <svg
      aria-hidden
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block", className)}
    >
      <defs>
        <radialGradient id={`${id}-lamp`} cx="0.86" cy="0.02" r="0.9">
          <stop offset="0" stopColor="oklch(0.9 0.07 85)" stopOpacity="0.55" />
          <stop
            offset="0.45"
            stopColor="oklch(0.8 0.06 80)"
            stopOpacity="0.12"
          />
          <stop offset="1" stopColor="oklch(0.2 0.02 60)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-vignette`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.6" stopColor="black" stopOpacity="0" />
          <stop offset="1" stopColor="black" stopOpacity="0.38" />
        </radialGradient>
        <linearGradient id={`${id}-top`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.7 0.085 70)" />
          <stop offset="1" stopColor={oak} />
        </linearGradient>
        <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.86 0.1 88)" />
          <stop offset="0.5" stopColor={brass} />
          <stop offset="1" stopColor={brassDark} />
        </linearGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.5 0.01 250)" />
          <stop offset="1" stopColor={steelDark} />
        </linearGradient>
      </defs>

      {/* Wall and pegboard */}
      <rect width="800" height="500" fill="oklch(0.38 0.022 62)" />
      <rect
        x="14"
        y="16"
        width="560"
        height="250"
        rx="3"
        fill="oklch(0.6 0.045 70)"
      />
      <path d={PEG_HOLES} fill="oklch(0.36 0.03 62)" />
      <rect
        x="14"
        y="16"
        width="560"
        height="250"
        rx="3"
        fill="none"
        stroke="oklch(0.5 0.04 66)"
        strokeWidth="2"
      />

      {/* Hanging saw */}
      <g>
        <path d="M60 60 L200 60 L200 92 L60 128 Z" fill={steel} />
        <path
          d="M60 128 L200 92"
          stroke="oklch(0.62 0.008 250)"
          strokeWidth="1"
        />
        {Array.from({ length: 36 }, (_, i) => (
          <path
            key={i}
            d={`M${r2(60 + i * 3.9)} ${r2(128 - i * 1.0)} l1.9 2.4 l1.9 -2.9`}
            fill="none"
            stroke="oklch(0.62 0.008 250)"
            strokeWidth="0.8"
          />
        ))}
        <path
          d="M196 50 h34 a10 10 0 0 1 10 10 v40 a10 10 0 0 1 -10 10 h-34 z"
          fill={rosewood}
        />
        <ellipse cx="220" cy="80" rx="9" ry="15" fill="oklch(0.38 0.022 62)" />
        <circle cx="204" cy="64" r="2" fill={brass} />
        <circle cx="204" cy="96" r="2" fill={brass} />
      </g>

      {/* Try square, engraved */}
      <g>
        <rect
          x="246"
          y="140"
          width="150"
          height="14"
          fill={`url(#${id}-brass)`}
        />
        <rect x="246" y="78" width="18" height="76" fill={rosewood} />
        <rect
          x="246"
          y="78"
          width="18"
          height="76"
          fill="none"
          stroke={brassDark}
          strokeWidth="0.8"
        />
        {Array.from({ length: 64 }, (_, i) => (
          <path
            key={i}
            d={`M${r2(268 + i * 2)} 140 v${i % 10 === 0 ? 6 : i % 5 === 0 ? 4.5 : 3}`}
            stroke={ink}
            strokeWidth="0.35"
          />
        ))}
        {/* Labels run to 40; the blade's far end carries the maker's stamp. */}
        {[0, 1, 2, 3, 4].map((n) => (
          <text
            key={n}
            x={268 + n * 20}
            y="151.6"
            fontSize="3.4"
            textAnchor="middle"
            fill={ink}
          >
            {n * 10}
          </text>
        ))}
        <text
          x="393"
          y="151.8"
          fontSize="2.6"
          textAnchor="end"
          fill={ink}
          letterSpacing="0.4"
        >
          FERNWORKS 150
        </text>
        <circle cx="255" cy="100" r="1.6" fill={brass} />
        <circle cx="255" cy="132" r="1.6" fill={brass} />
      </g>

      {/* Dividers */}
      <g stroke={steel} strokeWidth="3" strokeLinecap="round">
        <path d="M470 70 L446 190" />
        <path d="M470 70 L494 190" />
        <path d="M452 150 Q470 140 488 150" strokeWidth="1.5" fill="none" />
      </g>
      <circle cx="470" cy="68" r="7" fill={`url(#${id}-brass)`} />

      {/* Pipe and the Fieldline gauge */}
      <g>
        <rect
          x="660"
          y="0"
          width="26"
          height="320"
          fill={`url(#${id}-steel)`}
        />
        <rect x="654" y="210" width="38" height="10" rx="2" fill={steelDark} />
        <rect
          x="667"
          y="186"
          width="12"
          height="20"
          fill={`url(#${id}-brass)`}
        />
        <circle
          cx={GAUGE.cx}
          cy={GAUGE.cy}
          r={GAUGE.r + 6}
          fill={`url(#${id}-brass)`}
        />
        <circle
          cx={GAUGE.cx}
          cy={GAUGE.cy}
          r={GAUGE.r + 1.5}
          fill={brassDark}
        />
        <circle
          cx={GAUGE.cx}
          cy={GAUGE.cy}
          r={GAUGE.r}
          fill="oklch(0.96 0.012 90)"
        />
        {GAUGE_TICKS.map((t) => (
          <path
            key={t.i}
            d={`M${t.a.x} ${t.a.y} L${t.b.x} ${t.b.y}`}
            stroke={ink}
            strokeWidth={t.major ? 0.8 : 0.35}
          />
        ))}
        <path
          d={`M${polar(GAUGE.cx, GAUGE.cy, GAUGE.r - 3, dialAngle(48)).x} ${polar(GAUGE.cx, GAUGE.cy, GAUGE.r - 3, dialAngle(48)).y} A ${GAUGE.r - 3} ${GAUGE.r - 3} 0 0 1 ${polar(GAUGE.cx, GAUGE.cy, GAUGE.r - 3, dialAngle(60)).x} ${polar(GAUGE.cx, GAUGE.cy, GAUGE.r - 3, dialAngle(60)).y}`}
          fill="none"
          stroke="oklch(0.6 0.17 28)"
          strokeWidth="1.6"
        />
        {GAUGE_NUMBERS.map((n) => (
          <text
            key={n.v}
            x={n.p.x}
            y={r2(n.p.y + 1.3)}
            fontSize="3.8"
            textAnchor="middle"
            fill={ink}
          >
            {n.v}
          </text>
        ))}
        <text
          x={GAUGE.cx}
          y={GAUGE.cy - 11}
          fontSize="3"
          textAnchor="middle"
          fill={ink}
          letterSpacing="0.6"
        >
          FIELDLINE
        </text>
        <text
          x={GAUGE.cx}
          y={GAUGE.cy + 14}
          fontSize="2.6"
          textAnchor="middle"
          fill={ink}
        >
          PSI
        </text>
        <text
          x={GAUGE.cx}
          y={GAUGE.cy + 19}
          fontSize="1.7"
          textAnchor="middle"
          fill={ink}
          opacity="0.7"
        >
          No. 2207 · CHECKED 03
        </text>
        <path
          d={`M${NEEDLE_TAIL.x} ${NEEDLE_TAIL.y} L${NEEDLE.x} ${NEEDLE.y}`}
          stroke="oklch(0.55 0.18 28)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx={GAUGE.cx} cy={GAUGE.cy} r="3" fill={ink} />
        <path
          d={`M${GAUGE.cx - 26} ${GAUGE.cy - 18} A ${GAUGE.r} ${GAUGE.r} 0 0 1 ${GAUGE.cx + 12} ${GAUGE.cy - 33}`}
          fill="none"
          stroke="white"
          strokeOpacity="0.55"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      {/* Lamp */}
      <g>
        <path
          d="M760 0 L760 40 L716 64"
          fill="none"
          stroke={steelDark}
          strokeWidth="4"
        />
        <path
          d="M690 58 L742 58 L732 84 L700 84 Z"
          fill="oklch(0.42 0.03 150)"
        />
        <ellipse cx="716" cy="84" rx="16" ry="4" fill="oklch(0.95 0.08 90)" />
      </g>

      {/* Bench */}
      <rect x="0" y="300" width="800" height="104" fill={`url(#${id}-top)`} />
      {GRAIN.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={oakDark}
          strokeOpacity="0.35"
          strokeWidth="0.8"
        />
      ))}
      <rect x="0" y="300" width="800" height="3" fill="oklch(0.76 0.08 74)" />
      <rect x="0" y="404" width="800" height="96" fill={oakDark} />
      <rect x="0" y="404" width="800" height="4" fill="oklch(0.38 0.06 52)" />
      {[40, 230, 420, 610].map((x) => (
        <rect
          key={x}
          x={x}
          y="420"
          width="40"
          height="80"
          fill="oklch(0.4 0.06 54)"
        />
      ))}

      {/* Ruler on the bench */}
      <g>
        <rect
          x="236"
          y="384"
          width="190"
          height="12"
          fill="oklch(0.9 0.01 90)"
        />
        {Array.from({ length: 91 }, (_, i) => (
          <path
            key={i}
            d={`M${r2(240 + i * 2)} 384 v${i % 10 === 0 ? 5 : i % 5 === 0 ? 3.5 : 2.2}`}
            stroke={ink}
            strokeWidth="0.3"
          />
        ))}
      </g>

      {/* Shavings */}
      {SHAVINGS.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="oklch(0.88 0.05 82)"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      ))}

      {/* The No. 4 plane */}
      <g>
        <path
          d="M340 330 L520 330 L528 352 L332 352 Z"
          fill={`url(#${id}-steel)`}
        />
        <rect x="332" y="352" width="196" height="5" fill={steelDark} />
        <path
          d="M352 330 C352 310 370 300 384 304 L396 330 Z"
          fill={rosewood}
        />
        <path
          d="M464 330 C462 296 476 280 494 286 C506 290 508 312 500 330 Z"
          fill={rosewood}
        />
        <path
          d="M476 300 C480 292 490 292 494 300"
          fill="none"
          stroke="oklch(0.38 0.022 62)"
          strokeWidth="5"
        />
        <path d="M410 330 L428 296 L452 296 L438 330 Z" fill={steel} />
        <path
          d="M414 330 L430 300 L446 300 L432 330 Z"
          fill={`url(#${id}-brass)`}
        />
        <text
          x="431"
          y="314"
          fontSize="2.4"
          textAnchor="middle"
          fill={ink}
          letterSpacing="0.3"
          transform="rotate(-62 431 314)"
        >
          FERNWORKS
        </text>
        <text
          x="436.5"
          y="317.5"
          fontSize="2.2"
          textAnchor="middle"
          fill={ink}
          transform="rotate(-62 436.5 317.5)"
        >
          No 4 · 2019
        </text>
        <circle cx="423" cy="320" r="2" fill={brassDark} />
        <circle cx="388" cy="343" r="2.4" fill={brass} />
        <circle cx="482" cy="343" r="2.4" fill={brass} />
      </g>

      {/* Glue pot and brush */}
      <g>
        <rect
          x="530"
          y="282"
          width="46"
          height="48"
          rx="6"
          fill="oklch(0.34 0.02 250)"
        />
        <rect
          x="526"
          y="278"
          width="54"
          height="8"
          rx="3"
          fill="oklch(0.28 0.02 250)"
        />
        <rect
          x="536"
          y="296"
          width="34"
          height="20"
          rx="2"
          fill="oklch(0.9 0.03 85)"
        />
        <text
          x="553"
          y="304"
          fontSize="3.4"
          textAnchor="middle"
          fill={ink}
          letterSpacing="0.3"
        >
          HIDE GLUE
        </text>
        <text x="553" y="310" fontSize="2.6" textAnchor="middle" fill={ink}>
          keep at 60 °C
        </text>
        <path
          d="M566 282 L590 236"
          stroke={beech}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M563 290 L568 278"
          stroke="oklch(0.32 0.03 60)"
          strokeWidth="6"
          strokeLinecap="round"
        />
      </g>

      {/* Pencil */}
      <path
        d="M612 392 L700 376"
        stroke="oklch(0.78 0.13 92)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M700 376 L710 374"
        stroke="oklch(0.3 0.01 250)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Vise at the front edge */}
      <g>
        <rect x="56" y="350" width="104" height="64" rx="3" fill={beech} />
        <rect x="56" y="350" width="104" height="5" fill="oklch(0.5 0.05 50)" />
        <rect x="56" y="408" width="104" height="5" fill="oklch(0.5 0.05 50)" />
        <circle cx="108" cy="382" r="8" fill={`url(#${id}-steel)`} />
        <rect
          x="58"
          y="378"
          width="100"
          height="8"
          rx="4"
          fill={`url(#${id}-steel)`}
        />
        <circle cx="58" cy="382" r="6" fill={steelDark} />
        <circle cx="158" cy="382" r="6" fill={steelDark} />
        <path
          d="M60 352 h100"
          stroke="oklch(0.45 0.07 45)"
          strokeWidth="1"
          strokeDasharray="1.5 1.2"
        />
      </g>

      <rect width="800" height="500" fill={`url(#${id}-lamp)`} />
      <rect width="800" height="500" fill={`url(#${id}-vignette)`} />
    </svg>
  );
}

/* --------------------------------- the lens -------------------------------- */

type Placement = {
  side: "left" | "right" | "below";
  /** Card box in photo px (side placements only). */
  x: number;
  y: number;
  w: number;
  /** Leader line, photo px: from the rim, through a knee, to the card. */
  path: string;
  end: { x: number; y: number };
};

/** Where the card goes for a note, and the elbow of its leader line. */
function place(
  nx: number,
  ny: number,
  lensR: number,
  W: number,
  H: number,
  cardH: number,
): Placement {
  if (W < 440) {
    // Narrow: the card sits under the photo and the line drops to its edge.
    const sx = nx;
    const sy = ny + lensR;
    const path = `M${r2(sx)} ${r2(sy)} L${r2(sx)} ${r2(H)}`;
    return {
      side: "below",
      x: 0,
      y: 0,
      w: W,
      path,
      end: { x: r2(sx), y: r2(H) },
    };
  }
  const w = clamp(W * 0.3, 168, 224);
  const right = nx < W / 2;
  const gap = 34;
  const cx = right ? nx + lensR + gap : nx - lensR - gap - w;
  const x = clamp(cx, 10, W - w - 10);
  const y = clamp(ny - cardH / 2 - 10, 10, Math.max(10, H - cardH - 10));
  const endX = right ? x : x + w;
  const endY = clamp(ny - 10, y + 14, y + cardH - 14);
  const dir = right ? 1 : -1;
  // Leave the rim along the diagonal toward the card, then run level into it.
  const ang = Math.atan2(endY - ny, (endX - nx) * 1.6);
  const sx = nx + lensR * Math.cos(ang);
  const sy = ny + lensR * Math.sin(ang);
  const kx = endX - dir * 14;
  const path = `M${r2(sx)} ${r2(sy)} L${r2(kx)} ${r2(endY)} L${r2(endX)} ${r2(endY)}`;
  return {
    side: right ? "right" : "left",
    x: r2(x),
    y: r2(y),
    w: r2(w),
    path,
    end: { x: r2(endX), y: r2(endY) },
  };
}

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A photo you inspect with a jeweller's loupe: a circle of the photo
 * magnified `power` times inside a hairline brass rim, gliding after the
 * pointer with a little weight. Annotated points are magnetic — come close
 * and the loupe is drawn onto the note and settles there (it holds until you
 * pull clearly away), and a leader line draws out from the rim to a note card
 * that rises in beside it. The wheel or a pinch changes the magnification,
 * passing the scroll back to the page at either end so it never traps it.
 *
 * Every note is a button in tab order: Tab walks the loupe from note to note,
 * + and - change the power and Escape closes the card. On touch, tap to place
 * the loupe and drag the lens to move it while the page still scrolls. The
 * drawn workbench is vector art, so magnifying it finds detail; pass `src`
 * for a photo of your own.
 */
export function FieldLoupe({
  notes = defaultFieldLoupeNotes,
  src,
  alt = DEFAULT_ALT,
  aspectRatio = 1.6,
  value,
  defaultValue,
  onValueChange,
  power = 2.5,
  minPower = 1.25,
  maxPower = 5,
  onPowerChange,
  lensSize = 144,
  snap = 0.6,
  wheelZoom = true,
  markers = true,
  rimColor = "oklch(from var(--warn) 0.74 0.1 h)",
  label = "Photo with notes",
  disabled = false,
  className,
}: FieldLoupeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const sceneId = `field-loupe-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ratio = aspectRatio > 0 ? aspectRatio : 1.6;
  const first = notes[0]?.id ?? null;
  const [own, setOwn] = React.useState<string | null>(
    defaultValue !== undefined ? defaultValue : first,
  );
  const open = value !== undefined ? value : own;
  const openNote = notes.find((n) => n.id === open) ?? null;
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [cardH, setCardH] = React.useState(96);
  const [pointerIn, setPointerIn] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const W = size?.w ?? 0;
  const H = size?.h ?? 0;
  // A lens never covers more than about two thirds of a small photo.
  const lens = Math.round(
    Math.min(clamp(lensSize, 48, 320), size ? Math.min(W, H) * 0.62 : 320),
  );
  const lensR = lens / 2;

  // Geometry lives in motion values: the lens centre in photo px, and power.
  const start = openNote ?? notes[0];
  const lx = useMotionValue(0);
  const ly = useMotionValue(0);
  const pw = useMotionValue(clamp(power, minPower, maxPower));
  const placedOnce = React.useRef(false);
  const moving = React.useRef<AnimationPlaybackControls[]>([]);
  const zooming = React.useRef<AnimationPlaybackControls | null>(null);
  const captured = React.useRef<string | null>(null);
  const dwell = React.useRef(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const photoRef = React.useRef<HTMLDivElement | null>(null);
  const markerRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const grab = React.useRef({ dx: 0, dy: 0 });
  const pinch = React.useRef<{
    ids: Map<number, { x: number; y: number }>;
    d0: number;
    p0: number;
  } | null>(null);

  // A new resting power from the host resets the magnification.
  React.useEffect(() => {
    zooming.current?.stop();
    pw.set(clamp(power, minPower, maxPower));
  }, [power, minPower, maxPower, pw]);

  const glideTo = React.useCallback(
    (x: number, y: number, kind: "follow" | "settle") => {
      for (const c of moving.current) c.stop();
      if (!motionSafe) {
        lx.set(r2(x));
        ly.set(r2(y));
        moving.current = [];
        return;
      }
      const spring = kind === "settle" ? springs.glide : springs.flick;
      moving.current = [animate(lx, r2(x), spring), animate(ly, r2(y), spring)];
    },
    [lx, ly, motionSafe],
  );

  // First measurement: the loupe starts on the open note (or the middle).
  React.useEffect(() => {
    if (!size || placedOnce.current) return;
    placedOnce.current = true;
    const n = start;
    lx.set(r2(n ? n.x * size.w : size.w / 2));
    ly.set(r2(n ? n.y * size.h : size.h / 2));
  }, [size, start, lx, ly]);

  // Size changes keep the loupe on the same spot of the photo.
  const lastSize = React.useRef<{ w: number; h: number } | null>(null);
  React.useEffect(() => {
    const prev = lastSize.current;
    lastSize.current = size;
    if (!prev || !size || (prev.w === size.w && prev.h === size.h)) return;
    lx.set(r2((lx.get() / prev.w) * size.w));
    ly.set(r2((ly.get() / prev.h) * size.h));
  }, [size, lx, ly]);

  React.useEffect(
    () => () => {
      for (const c of moving.current) c.stop();
      zooming.current?.stop();
      window.clearTimeout(dwell.current);
    },
    [],
  );

  const setOpen = React.useCallback(
    (id: string | null) => {
      if (id === open) return;
      if (value === undefined) setOwn(id);
      onValueChange?.(id);
      const n = notes.find((x) => x.id === id);
      if (n) say(`${n.title}: ${n.body}`);
    },
    [open, value, onValueChange, notes],
  );

  const setPower = (next: number, announce: boolean) => {
    const to = Math.round(clamp(next, minPower, maxPower) * 100) / 100;
    zooming.current?.stop();
    if (motionSafe) zooming.current = animate(pw, to, springs.snap);
    else pw.set(to);
    onPowerChange?.(to);
    if (announce) say(`Magnification ${to.toFixed(1)} times.`);
    return to;
  };

  /** Where the loupe goes for a pointer at (x, y): the pointer, or a note it is captured by. */
  const track = (x: number, y: number) => {
    const s = clamp(snap, 0, 1);
    const capture = lerp(6, lensR * 0.9, s);
    const release = capture * 1.6 + 8;
    let held = captured.current
      ? (notes.find((n) => n.id === captured.current) ?? null)
      : null;
    if (held && Math.hypot(held.x * W - x, held.y * H - y) > release)
      held = null;
    if (!held) {
      let best: FieldLoupeNote | null = null;
      let bestD = capture;
      for (const n of notes) {
        const d = Math.hypot(n.x * W - x, n.y * H - y);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      held = best;
    }
    const was = captured.current;
    captured.current = held?.id ?? null;
    if (held) {
      glideTo(held.x * W, held.y * H, was === held.id ? "follow" : "settle");
      if (was !== held.id) {
        window.clearTimeout(dwell.current);
        const id = held.id;
        // A moment's settle before the note opens, so a sweep across the
        // photo does not flicker every card it passes.
        dwell.current = window.setTimeout(
          () => setOpenRef.current(id),
          motionSafe ? 140 : 0,
        );
      }
    } else {
      glideTo(x, y, "follow");
      if (was) {
        window.clearTimeout(dwell.current);
        setOpenRef.current(null);
      }
    }
  };
  const setOpenRef = React.useRef(setOpen);
  React.useEffect(() => {
    setOpenRef.current = setOpen;
  });

  const local = (clientX: number, clientY: number) => {
    const r = photoRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  const onPhotoPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !size || event.pointerType !== "mouse") return;
    const p = local(event.clientX, event.clientY);
    track(clamp(p.x, 0, W), clamp(p.y, 0, H));
  };

  const lensDrag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      const p = local(point.x, point.y);
      grab.current = { dx: lx.get() - p.x, dy: ly.get() - p.y };
    },
    onMove: ({ point }) => {
      if (pinch.current && pinch.current.ids.size > 1) return;
      const p = local(point.x, point.y);
      track(
        clamp(p.x + grab.current.dx, 0, W),
        clamp(p.y + grab.current.dy, 0, H),
      );
    },
  });

  // A tap on the photo (touch or pen) places the loupe there.
  const tapStart = React.useRef<{ x: number; y: number; id: number } | null>(
    null,
  );
  const onPhotoPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    tapStart.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
  };
  const onPhotoPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const t = tapStart.current;
    tapStart.current = null;
    if (!t || t.id !== event.pointerId || disabled || !size) return;
    if (Math.hypot(event.clientX - t.x, event.clientY - t.y) > 8) return;
    const p = local(event.clientX, event.clientY);
    captured.current = null;
    track(clamp(p.x, 0, W), clamp(p.y, 0, H));
  };

  // Two fingers on the lens pinch the power.
  const onLensPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    lensDrag.onPointerDown(event);
    if (event.pointerType !== "touch") return;
    const cur = pinch.current ?? { ids: new Map(), d0: 0, p0: pw.get() };
    cur.ids.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (cur.ids.size === 2) {
      const [a, b] = [...cur.ids.values()];
      cur.d0 = a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
      cur.p0 = pw.get();
    }
    pinch.current = cur;
  };
  const onLensPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const cur = pinch.current;
    if (cur?.ids.has(event.pointerId)) {
      cur.ids.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (cur.ids.size === 2 && cur.d0 > 0) {
        const [a, b] = [...cur.ids.values()];
        if (a && b) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const to = clamp(cur.p0 * (d / cur.d0), minPower, maxPower);
          zooming.current?.stop();
          pw.set(r2(to));
          onPowerChange?.(r2(to));
        }
        return;
      }
    }
    lensDrag.onPointerMove(event);
  };
  const endPinch = (event: React.PointerEvent<HTMLDivElement>) => {
    const cur = pinch.current;
    if (cur) {
      cur.ids.delete(event.pointerId);
      if (cur.ids.size === 0) pinch.current = null;
    }
  };

  // The wheel needs a listener that may cancel the page scroll.
  const wheelRef = React.useRef<(event: WheelEvent) => void>(() => {});
  React.useEffect(() => {
    wheelRef.current = (event: WheelEvent) => {
      if (!wheelZoom || disabled) return;
      const d = wheelPixels(event).y;
      if (d === 0) return;
      const current = pw.get();
      const k = event.ctrlKey ? 0.012 : 0.0028;
      const next = clamp(current * Math.exp(-d * k), minPower, maxPower);
      // At either end the scroll belongs to the page again.
      if (Math.abs(next - current) < 0.001) return;
      event.preventDefault();
      zooming.current?.stop();
      pw.set(r2(next));
      onPowerChange?.(r2(next));
    };
  });

  const bindPhoto = React.useCallback((node: HTMLDivElement | null) => {
    photoRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setSize({ w: node.clientWidth, h: node.clientHeight });
    });
    sizer.observe(node);
    const onWheel = (event: WheelEvent) => wheelRef.current(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      sizer.disconnect();
      node.removeEventListener("wheel", onWheel);
    };
  }, []);

  const bindCard = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => setCardH(node.offsetHeight));
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const focusNote = (n: FieldLoupeNote) => {
    if (!size) return;
    captured.current = n.id;
    window.clearTimeout(dwell.current);
    glideTo(n.x * W, n.y * H, "settle");
    setOpen(n.id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    setPointerIn(false);
    if (disabled) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      setPower(pw.get() + 0.5, true);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      setPower(pw.get() - 0.5, true);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      captured.current = null;
      setOpen(null);
      say("Note closed.");
    }
  };

  // The lens radius is a motion value too, so a resize re-derives the
  // magnified copy instead of leaving it on the old radius.
  const lr = useMotionValue(lensR);
  React.useEffect(() => {
    lr.set(lensR);
  }, [lensR, lr]);
  // The magnified copy: the photo at full size, scaled about the lens centre.
  const inner = useTransform(
    [lx, ly, pw, lr],
    ([x, y, p, r]) =>
      `translate(${r2((r as number) - (x as number) * (p as number))}px, ${r2((r as number) - (y as number) * (p as number))}px) scale(${r2(p as number)})`,
  );
  const lensLeft = useTransform([lx, lr], ([x, r]) =>
    r2((x as number) - (r as number)),
  );
  const lensTop = useTransform([ly, lr], ([y, r]) =>
    r2((y as number) - (r as number)),
  );
  const powerText = useTransform(pw, (p) => `${p.toFixed(1)}×`);

  const placement =
    openNote && size
      ? place(openNote.x * W, openNote.y * H, lensR, W, H, cardH)
      : null;
  const below = size ? W < 440 : false;

  const photo = (copy: string, cls?: string) =>
    src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn("block size-full object-cover select-none", cls)}
      />
    ) : (
      <BenchScene id={`${sceneId}-${copy}`} className={cn("size-full", cls)} />
    );

  const card = (n: FieldLoupeNote, i: number) => (
    <>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {n.tag ?? `Note ${i + 1} of ${notes.length}`}
      </p>
      <p className="mt-1 text-sm leading-snug font-medium text-foreground">
        {n.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{n.body}</p>
    </>
  );
  const openIndex = openNote ? notes.indexOf(openNote) : -1;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("relative w-full", className)}
      style={{ "--field-loupe-rim": rimColor } as React.CSSProperties}
    >
      <div
        ref={bindPhoto}
        onPointerMove={onPhotoPointerMove}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setPointerIn(true);
        }}
        onPointerLeave={() => setPointerIn(false)}
        onPointerDown={onPhotoPointerDown}
        onPointerUp={onPhotoPointerUp}
        className={cn(
          "group/field-loupe relative w-full touch-pan-y overflow-clip rounded-3 bg-surface-2 [contain:paint] select-none",
          pointerIn && !disabled ? "cursor-none" : "cursor-default",
        )}
        style={{ aspectRatio: String(ratio) }}
      >
        <div role="img" aria-label={alt} className="absolute inset-0">
          {photo("base")}
        </div>

        {markers
          ? notes.map((n, i) => {
              const on = n.id === open;
              return (
                <button
                  key={n.id}
                  ref={(node) => {
                    if (node) markerRefs.current.set(n.id, node);
                    else markerRefs.current.delete(n.id);
                  }}
                  type="button"
                  aria-label={`Note ${i + 1} of ${notes.length}: ${n.title}`}
                  aria-describedby={on ? `${uid}-card` : undefined}
                  aria-pressed={on}
                  disabled={disabled}
                  onFocus={() => focusNote(n)}
                  onClick={() => focusNote(n)}
                  className={cn(
                    "absolute z-10 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full",
                    pointerIn ? "cursor-none" : "cursor-pointer",
                    FOCUS_RING,
                  )}
                  style={{
                    left: `${r2(n.x * 100)}%`,
                    top: `${r2(n.y * 100)}%`,
                  }}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-3 rounded-full border-[1.5px] transition-colors",
                      on
                        ? "border-[color:var(--field-loupe-rim)] bg-[color-mix(in_oklab,var(--field-loupe-rim)_35%,transparent)]"
                        : "border-white/85 bg-black/20",
                    )}
                  />
                </button>
              );
            })
          : null}

        {size ? (
          <>
            {/* The leader line, drawn out from the rim. */}
            <svg
              aria-hidden
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className="pointer-events-none absolute inset-0 z-20 overflow-visible"
            >
              <AnimatePresence>
                {placement && openNote ? (
                  <motion.g
                    key={`${openNote.id}-${W}-${H}`}
                    initial={{ opacity: motionSafe ? 1 : 0 }}
                    animate={{ opacity: 1 }}
                    exit={{
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }}
                    transition={{ duration: durations.fast }}
                  >
                    <motion.path
                      d={placement.path}
                      fill="none"
                      strokeWidth={3.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="stroke-black/30"
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                        delay: motionSafe ? 0.08 : 0,
                      }}
                    />
                    <motion.path
                      d={placement.path}
                      fill="none"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                      style={{ stroke: rimColor }}
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                        delay: motionSafe ? 0.08 : 0,
                      }}
                    />
                    <motion.circle
                      cx={placement.end.x}
                      cy={placement.end.y}
                      r={2.5}
                      style={{ fill: rimColor }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        delay: motionSafe ? 0.28 : 0,
                        duration: durations.fast,
                      }}
                    />
                  </motion.g>
                ) : null}
              </AnimatePresence>
            </svg>

            {/* The note card beside the lens, on wide photos. */}
            {!below ? (
              <AnimatePresence>
                {placement && openNote ? (
                  <motion.div
                    key={openNote.id}
                    ref={bindCard}
                    id={`${uid}-card`}
                    className="pointer-events-none absolute z-30 rounded-3 border border-hairline bg-popover px-3 py-2.5 shadow-[0_8px_24px_color-mix(in_oklab,black_22%,transparent)]"
                    style={{
                      left: placement.x,
                      top: placement.y,
                      width: placement.w,
                    }}
                    initial={{ opacity: 0, y: motionSafe ? 8 : 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }}
                    transition={{
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: motionSafe ? 0.2 : 0,
                      },
                      y: motionSafe
                        ? { ...springs.flick, delay: 0.2 }
                        : { duration: 0 },
                    }}
                  >
                    {card(openNote, openIndex)}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            ) : null}

            {/* The loupe. */}
            <motion.div
              aria-hidden
              {...lensDrag}
              onPointerDown={onLensPointerDown}
              onPointerMove={onLensPointerMove}
              onPointerUp={(event) => {
                endPinch(event);
                lensDrag.onPointerUp(event);
              }}
              onPointerCancel={(event) => {
                endPinch(event);
                lensDrag.onPointerCancel(event);
              }}
              className="absolute top-0 left-0 z-20 touch-none rounded-full will-change-transform"
              style={{ x: lensLeft, y: lensTop, width: lens, height: lens }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="absolute top-0 left-0 origin-top-left"
                  style={{ width: W, height: H, transform: inner }}
                >
                  {photo("lens")}
                </motion.div>
                {/* Glass: a soft vignette at the edge and a highlight arc. */}
                <div className="absolute inset-0 rounded-full shadow-[inset_0_0_18px_color-mix(in_oklab,black_38%,transparent)]" />
                <div className="absolute inset-0 rounded-full bg-[radial-gradient(120%_80%_at_30%_8%,color-mix(in_oklab,white_32%,transparent),transparent_38%)]" />
              </div>
              <div
                className="pointer-events-none absolute -inset-[3px] rounded-full border-[3px]"
                style={{
                  borderColor: rimColor,
                  boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${rimColor} 55%, black), 0 0 0 1px color-mix(in oklab, ${rimColor} 45%, black), 0 6px 18px color-mix(in oklab, black 34%, transparent)`,
                }}
              />
              <motion.span className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-[color-mix(in_oklab,black_45%,transparent)] px-1.5 py-px font-mono text-[9px] leading-none text-white tabular-nums">
                {powerText}
              </motion.span>
            </motion.div>
          </>
        ) : null}
      </div>

      {/* On narrow photos the card sits under the photo, where its line lands. */}
      {below ? (
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ height: cardH }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <div ref={bindCard} id={`${uid}-card`} className="pt-2">
            <div className="rounded-3 border border-hairline bg-popover px-3 py-2.5">
              {openNote ? (
                card(openNote, openIndex)
              ) : (
                <p className="text-xs text-ink-3">
                  Move the loupe onto a ring to read its note.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
