"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  wheelPixels,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CrateWood = "oak" | "walnut" | "pine";

export type CrateAlbum = {
  /** The record's title, printed on its label and on the plate. */
  title: string;
  /** Who made it. */
  artist: string;
  /** The year on the label. */
  year?: number;
  /** A picture for the cover. Without one, `art` or a drawn cover is used. */
  src?: string;
  /** Describes the cover. Defaults to "Title by Artist". */
  alt?: string;
  /** Your own cover art (fills a square). */
  art?: React.ReactNode;
  /** The record label's colour. Any CSS colour; it is used as a pigment. */
  label?: string;
};

export type CrateDigProps = {
  /** The records in the crate, front to back. @default defaultCrateAlbums */
  albums?: CrateAlbum[];
  /** Controlled: the sleeve standing revealed (0 is the front one). */
  value?: number;
  /** Initial revealed sleeve when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the flick, drag, wheel, key or click that revealed a new sleeve. */
  onValueChange?: (index: number) => void;
  /** Controlled: the revealed record is pulled out and turning. */
  pulled?: boolean;
  /** Initial pulled state when uncontrolled. @default false */
  defaultPulled?: boolean;
  /** Fires from the drag, click or key that pulled the record or put it back. */
  onPulledChange?: (pulled: boolean) => void;
  /** How steeply you look down into the crate, degrees. @default 48 */
  tilt?: number;
  /** Length of the crate front to back, px at a 180px sleeve; a deeper crate spaces the sleeves out. @default 200 */
  crateDepth?: number;
  /** How fast a pulled record turns, rpm; 0 leaves it still. @default 33 */
  spin?: number;
  /** How far a flipped sleeve leans forward, degrees. @default 48 */
  tipAngle?: number;
  /** The crate's wood. @default "oak" */
  woodTone?: CrateWood;
  /** The wheel flips sleeves once the visitor has rested on the crate or tabbed in, and lets the page scroll at either end. @default true */
  wheel?: boolean;
  /** Play the paper of the sleeves. Off unless asked for. @default false */
  sound?: boolean;
  /** Height of the frame, px. @default 520 */
  height?: number;
  /** The crate's accessible name. @default "Record crate" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

/** Drag travel that flips one sleeve, px. */
const FLIP_PX = 44;
/** Wheel travel that flips one sleeve, px. */
const WHEEL_PX = 70;
const HOVER_INTENT_MS = 350;
const WHEEL_BURST_MS = 220;
/** The record slides out this long after the sleeve starts to rise, s. */
const SLIDE_DELAY = 0.18;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

const WOODS: Record<CrateWood, { face: string; seam: string; inner: string }> =
  {
    oak: {
      face: pig("--warn", 0.68, 0.075, -12),
      seam: pig("--warn", 0.5, 0.06, -12),
      inner: pig("--warn", 0.52, 0.06, -12),
    },
    walnut: {
      face: pig("--warn", 0.46, 0.055, -30),
      seam: pig("--warn", 0.33, 0.04, -30),
      inner: pig("--warn", 0.36, 0.045, -30),
    },
    pine: {
      face: pig("--warn", 0.82, 0.07, 4),
      seam: pig("--warn", 0.66, 0.07, 4),
      inner: pig("--warn", 0.7, 0.06, 4),
    },
  };

const planks = (face: string, seam: string, rows: number, size: number) => {
  const step = r2(size / rows);
  return `repeating-linear-gradient(to bottom, ${face} 0px, ${face} ${r2(step - 1.5)}px, ${seam} ${r2(step - 1.5)}px, ${seam} ${step}px)`;
};

/* ---------------------------------- art ---------------------------------- */

function Cover({ index, title }: { index: number; title: string }) {
  const m = ((index % 12) + 12) % 12;
  const common = {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  const type = (fill: string, y = 90, size = 7) => (
    <text
      x="8"
      y={y}
      fontSize={size}
      fontWeight="700"
      letterSpacing="0.06em"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      style={{ fill }}
    >
      {title.toUpperCase()}
    </text>
  );
  switch (m) {
    case 0:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--warn", 0.86, 0.08, -10) }}
          />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <rect
              key={k}
              y={44 + k * 7}
              width="100"
              height="4"
              style={{ fill: pig("--success", 0.46, 0.08) }}
              opacity={r2(0.4 + k * 0.1)}
            />
          ))}
          <circle
            cx="68"
            cy="26"
            r="12"
            style={{ fill: pig("--danger", 0.62, 0.17) }}
          />
          {type(pig("--success", 0.3, 0.05), 18, 6)}
        </svg>
      );
    case 1:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--accent", 0.32, 0.1) }}
          />
          {[0, 1, 2, 3].map((k) => (
            <rect
              key={k}
              x={14 + k * 20}
              y={20 + (k % 2) * 10}
              width="12"
              height={52 - (k % 2) * 10}
              style={{ fill: pig("--accent", 0.8, 0.06) }}
              opacity={r2(0.3 + k * 0.18)}
            />
          ))}
          {type(pig("--accent", 0.95, 0.02))}
        </svg>
      );
    case 2:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--accent", 0.16, 0.03) }}
          />
          {[0, 1, 2, 3, 4].map((k) => (
            <circle
              key={k}
              cx="50"
              cy="46"
              r={8 + k * 8}
              fill="none"
              style={{ stroke: pig("--danger", 0.65, 0.18, 20 + k * 14) }}
              strokeWidth="2.2"
            />
          ))}
          {type(pig("--warn", 0.9, 0.06))}
        </svg>
      );
    case 3:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--warn", 0.62, 0.13, -25) }}
          />
          <path
            d="M0 100 L50 30 L100 100 Z"
            style={{ fill: pig("--warn", 0.4, 0.09, -30) }}
          />
          <path
            d="M20 100 L60 48 L100 100 Z"
            style={{ fill: pig("--warn", 0.82, 0.1, -10) }}
            opacity={0.8}
          />
          {type(pig("--warn", 0.97, 0.03), 16)}
        </svg>
      );
    case 4:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--accent", 0.88, 0.02) }}
          />
          {Array.from({ length: 9 }, (_, k) => (
            <path
              key={k}
              d={`M0 ${12 + k * 9} q 25 ${k % 2 ? 6 : -6} 50 0 t 50 0`}
              fill="none"
              style={{ stroke: pig("--accent", 0.45, 0.06) }}
              strokeWidth="1.2"
            />
          ))}
          {type(pig("--accent", 0.3, 0.05), 96, 6)}
        </svg>
      );
    case 5:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--danger", 0.9, 0.04, 20) }}
          />
          {[
            [30, 34],
            [64, 58],
            [40, 72],
          ].map(([x, y], k) => (
            <circle
              key={k}
              cx={x}
              cy={y}
              r={14 - k * 3}
              style={{ fill: pig("--accent", 0.5, 0.12, -20 + k * 30) }}
              opacity={0.85}
            />
          ))}
          {type(pig("--accent", 0.3, 0.06), 94, 6)}
        </svg>
      );
    case 6:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--success", 0.52, 0.1) }}
          />
          <rect
            x="18"
            y="18"
            width="64"
            height="64"
            style={{ fill: pig("--success", 0.82, 0.06) }}
          />
          <rect
            x="34"
            y="34"
            width="32"
            height="32"
            style={{ fill: pig("--warn", 0.75, 0.15) }}
          />
          {type(pig("--success", 0.95, 0.02), 95, 6)}
        </svg>
      );
    case 7:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--accent", 0.42, 0.15) }}
          />
          <circle
            cx="50"
            cy="56"
            r="28"
            style={{ fill: pig("--warn", 0.84, 0.13) }}
          />
          <rect
            y="56"
            width="100"
            height="44"
            style={{ fill: pig("--accent", 0.28, 0.1) }}
          />
          {[62, 70, 78, 86].map((y) => (
            <rect
              key={y}
              x="22"
              y={y}
              width="56"
              height="2"
              style={{ fill: pig("--warn", 0.84, 0.13) }}
              opacity={0.5}
            />
          ))}
          {type(pig("--warn", 0.95, 0.04), 16)}
        </svg>
      );
    case 8:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--warn", 0.94, 0.02) }}
          />
          {Array.from({ length: 40 }, (_, k) => (
            <rect
              key={k}
              x={(k * 37) % 96}
              y={((k * 53) % 70) + 6}
              width="3"
              height="3"
              style={{ fill: pig("--accent", 0.3 + (k % 3) * 0.15, 0.05) }}
            />
          ))}
          {type(pig("--danger", 0.55, 0.18), 92)}
        </svg>
      );
    case 9:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--success", 0.3, 0.06) }}
          />
          {Array.from({ length: 7 }, (_, k) => (
            <circle
              key={k}
              cx={14 + k * 12}
              cy={40 + ((k * 13) % 20)}
              r="5"
              style={{ fill: pig("--warn", 0.88, 0.14) }}
            />
          ))}
          <path
            d="M0 74 H100"
            style={{ stroke: pig("--success", 0.6, 0.1) }}
            strokeWidth="1"
          />
          {type(pig("--success", 0.9, 0.05), 90)}
        </svg>
      );
    case 10:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--accent", 0.96, 0.01) }}
          />
          {Array.from({ length: 6 }, (_, k) => (
            <path
              key={k}
              d={`M${10 + k * 16} 10 V90`}
              style={{ stroke: pig("--accent", 0.25, 0.03) }}
              strokeWidth={1 + k * 0.6}
            />
          ))}
          <rect
            x="60"
            y="56"
            width="30"
            height="30"
            style={{ fill: pig("--danger", 0.6, 0.18) }}
          />
          {type(pig("--accent", 0.25, 0.03), 8, 6)}
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect
            width="100"
            height="100"
            style={{ fill: pig("--success", 0.84, 0.06, -20) }}
          />
          {Array.from({ length: 10 }, (_, k) => (
            <ellipse
              key={k}
              cx={20 + (k % 5) * 16}
              cy={30 + Math.floor(k / 5) * 30}
              rx="6"
              ry="10"
              transform={`rotate(${((k * 29) % 90) - 45} ${20 + (k % 5) * 16} ${30 + Math.floor(k / 5) * 30})`}
              style={{ fill: pig("--danger", 0.68, 0.14, k * 8) }}
            />
          ))}
          {type(pig("--success", 0.32, 0.06), 94, 6)}
        </svg>
      );
  }
}

export const defaultCrateAlbums: CrateAlbum[] = [
  { title: "Low Fields", artist: "Marrow Cove", year: 1974 },
  { title: "Glass Harbour", artist: "Ines Varden", year: 1981 },
  { title: "Night Signals", artist: "Arlo Venn", year: 1979 },
  { title: "Copper Season", artist: "Mirela Doss", year: 1986 },
  { title: "Slow Weather", artist: "The Quillon Trio", year: 1968 },
  { title: "Paper Moons", artist: "Isa Kettering", year: 1991 },
  { title: "Inland", artist: "Fernhollow", year: 1977 },
  { title: "Blue Hour Radio", artist: "Lantern Society", year: 1983 },
  { title: "Salt & Static", artist: "Juno Marr", year: 1995 },
  { title: "Orchard Lights", artist: "Pell & Avery", year: 1972 },
  { title: "Northern Line", artist: "Kestrel Strings", year: 1989 },
  { title: "Second Spring", artist: "Wren Holloway", year: 1999 },
];

const LABELS = [
  pig("--danger", 0.62, 0.17),
  pig("--warn", 0.8, 0.14),
  pig("--accent", 0.6, 0.15),
  pig("--success", 0.66, 0.13),
];

/* -------------------------------- geometry ------------------------------- */

type Geo = {
  w: number;
  h: number;
  /** Sleeve size, crate inner width and depth, wall heights. */
  s: number;
  cw: number;
  depth: number;
  front: number;
  wall: number;
  /** Where the floor sits below the scene's centre. */
  floor: number;
  /** z of each sleeve's foot, front to back. */
  zs: number[];
  /** Lean of each flipped sleeve, degrees. */
  lean: number[];
  /** Scene drop so the crate and a pulled record both fit. */
  drop: number;
};

function geometry(
  width: number,
  height: number,
  count: number,
  crateDepth: number,
  tipAngle: number,
): Geo {
  const w = Math.max(220, Math.round(width));
  const h = Math.max(260, Math.round(height));
  const s = Math.round(clamp(Math.min(w * 0.46, h * 0.44), 100, 250));
  const k = s / 180;
  const front = Math.round(s * 0.3);
  const wall = Math.round(s * 0.46);
  const tip = clamp(tipAngle, 30, 70);
  // The first sleeve to tip rests on the front wall's top edge.
  const pad = front * Math.tan((tip * Math.PI) / 180);
  const n = Math.max(1, count);
  const depth = Math.round(
    Math.max(pad + n * 4 + 14, clamp(crateDepth, 100, 400) * k),
  );
  const spacing = (depth - pad - 12) / Math.max(1, n - 1);
  const zs: number[] = [];
  for (let i = 0; i < n; i += 1) zs.push(r2(depth / 2 - pad - i * spacing));
  // Each sleeve leans a hair less than the one in front, so the stack never
  // passes through itself: the gap between two feet closes along the sleeve.
  const step = Math.min(
    1.4,
    ((0.85 * spacing * Math.cos((tip * Math.PI) / 180)) / s) * (180 / Math.PI),
  );
  const lean = zs.map((_, i) => r2(Math.max(tip * 0.6, tip - i * step)));
  return {
    w,
    h,
    s,
    cw: s + 22,
    depth,
    front,
    wall,
    floor: Math.round(s * 0.42),
    zs,
    lean,
    // The crate sits a little below the middle, leaving room above for a
    // pulled record and below for the plate.
    drop: Math.round(h * 0.14 - s * 0.35),
  };
}

/* --------------------------------- sleeve -------------------------------- */

type SleeveProps = {
  g: Geo;
  index: number;
  album: CrateAlbum;
  flip: MotionValue<number>;
  pull: MotionValue<number>;
  slide: MotionValue<number>;
  turn: MotionValue<number>;
  tilt: number;
  /** The sleeve the pull belongs to: the one last pulled, until another is. */
  owner: number;
  motionSafe: boolean;
};

/**
 * One sleeve: cover on the front, its back with a catalogue number and
 * track lines, the record between them. It reads the crate's one flip value
 * (tipped when the flip has passed it) and, if it is the revealed sleeve,
 * the pull and the record's slide and turn.
 */
function Sleeve({
  g,
  index,
  album,
  flip,
  pull,
  slide,
  turn,
  tilt,
  owner,
  motionSafe,
}: SleeveProps) {
  const z0 = g.zs[index] ?? 0;
  const lean = g.lean[index] ?? 50;
  // The pull and the record follow the sleeve that was pulled, so one that
  // is going home while the stack flips keeps its own motion.
  const isOwner = index === owner;
  const pulled = (p: number) => (isOwner ? clamp(p, 0, 1.1) : 0);

  const rotateX = useTransform(
    [flip, pull] as MotionValue<number>[],
    ([f, p]) => {
      const tipped = clamp01((f as number) - index);
      const out = pulled(p as number);
      // A pulled sleeve turns to face the eye, undoing the crate's tilt.
      return r2(-lean * tipped * (1 - Math.min(1, out)) + tilt * 0.92 * out);
    },
  );
  const y = useTransform([flip, pull] as MotionValue<number>[], ([f, p]) => {
    const near = Math.max(0, 1 - Math.abs((f as number) - index) * 2);
    const pinch = motionSafe ? -g.s * 0.07 * near : 0;
    return r2(pinch - pulled(p as number) * g.s * 1.02);
  });
  const z = useTransform(pull, (p) =>
    r2(z0 + pulled(p) * (g.depth / 2 + g.s * 0.25 - z0)),
  );
  const x = useTransform(pull, (p) => r2(-pulled(p) * g.s * 0.3));
  const discX = useTransform(slide, (v) => (isOwner ? r2(v * g.s * 0.58) : 0));
  const discOpacity = useTransform(slide, (v) => (isOwner && v > 0.01 ? 1 : 0));

  const disc = Math.round(g.s * 0.94);
  const labelColour = album.label
    ? `oklch(from ${album.label} 0.7 0.15 h)`
    : (LABELS[index % LABELS.length] ?? LABELS[0]);
  const cat = `CB-${String(410 + index * 7).padStart(4, "0")}`;

  return (
    <motion.div
      data-sleeve={index}
      className="absolute [transform-style:preserve-3d]"
      style={{
        left: r2(-g.s / 2),
        top: r2(g.floor - g.s),
        width: g.s,
        height: g.s,
        x,
        y,
        z,
        rotateX,
        transformOrigin: "50% 100%",
      }}
    >
      {/* The record, between the sleeve's two faces until it slides out. */}
      <motion.div
        className="absolute rounded-full [transform-style:preserve-3d]"
        style={{
          left: r2((g.s - disc) / 2),
          top: r2((g.s - disc) / 2),
          width: disc,
          height: disc,
          x: discX,
          opacity: discOpacity,
        }}
      >
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            rotate: isOwner ? turn : 0,
            background: `radial-gradient(circle, transparent 0 18%, oklch(0.16 0.004 260) 18.5% 31%, oklch(0.22 0.004 260) 31.5%, oklch(0.15 0.004 260) 40%, oklch(0.21 0.004 260) 52%, oklch(0.14 0.004 260) 66%, oklch(0.2 0.004 260) 80%, oklch(0.13 0.004 260) 97%, transparent 98%)`,
            boxShadow: "inset 0 0 0 1px oklch(0.3 0.004 260)",
          }}
        >
          <div
            className="absolute inset-[32%] flex flex-col items-center justify-center rounded-full text-center"
            style={{ background: labelColour }}
          >
            <span
              className="block max-w-[86%] truncate font-semibold text-[oklch(0.18_0.01_80)]"
              style={{
                fontSize: Math.max(6, Math.round(g.s * 0.045)),
                lineHeight: 1.15,
              }}
            >
              {album.title}
            </span>
            <span
              className="block max-w-[86%] truncate text-[oklch(0.25_0.01_80)]"
              style={{
                fontSize: Math.max(5, Math.round(g.s * 0.033)),
                lineHeight: 1.2,
              }}
            >
              {album.artist}
            </span>
            <span className="absolute size-[7%] rounded-full bg-[oklch(0.12_0_0)]" />
          </div>
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background:
                "conic-gradient(from 30deg, transparent 0 12%, color-mix(in oklab, white 10%, transparent) 16%, transparent 22% 62%, color-mix(in oklab, white 7%, transparent) 66%, transparent 72%)",
            }}
          />
        </motion.div>
      </motion.div>

      {/* Front: the cover. */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[2px] [backface-visibility:hidden]"
        style={{
          transform: "translateZ(1px)",
          boxShadow:
            "inset 0 1px 0 color-mix(in oklab, white 35%, transparent), 0 0 0 1px color-mix(in oklab, black 18%, transparent)",
        }}
      >
        {album.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={album.src}
            alt=""
            draggable={false}
            className="block size-full object-cover"
          />
        ) : (
          (album.art ?? <Cover index={index} title={album.title} />)
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(160deg, color-mix(in oklab, white 14%, transparent), transparent 40%, color-mix(in oklab, black 12%, transparent))",
          }}
        />
      </div>

      {/* Back: catalogue number and the running order. */}
      <div
        className="absolute inset-0 overflow-hidden rounded-[2px] [backface-visibility:hidden]"
        style={{
          // Turned over top to bottom, so it reads the right way up when the
          // sleeve is tipped toward you — the only time it is seen.
          transform: "rotateX(180deg) translateZ(1px)",
          // The back is printed in a pale wash of the label's colour.
          background: `color-mix(in oklab, ${labelColour} 22%, oklch(0.93 0.01 85))`,
          boxShadow:
            "inset 0 0 0 1px color-mix(in oklab, black 12%, transparent)",
        }}
      >
        <div className="absolute inset-[9%] flex flex-col gap-[5%]">
          <span
            className="font-mono font-semibold tracking-[0.08em] text-[oklch(0.3_0.01_80)]"
            style={{ fontSize: Math.max(6, Math.round(g.s * 0.05)) }}
          >
            {cat}
          </span>
          {[0.8, 0.62, 0.74, 0.5, 0.68, 0.56].map((wd, k) => (
            <span
              key={k}
              className="block h-[3%] rounded-full bg-[oklch(0.62_0.01_80)]"
              style={{ width: `${Math.round(wd * 100)}%` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* --------------------------------- crate --------------------------------- */

type Api = {
  onFlip: (f: number) => void;
  wheel: (event: WheelEvent) => void;
  spinTick: (now: number) => void;
  wake: () => void;
};

/**
 * Album sleeves stand in a wooden crate seen from above at an angle, in
 * CSS 3D: floor, four plank walls (the front one low) and the sleeves in a
 * row, covers to you. Flick, drag or scroll and they tip forward one at a
 * time about their bottom edges, coming to rest on the front wall and on
 * each other — each a hair more upright than the one before, so the stack
 * never passes through itself — showing their backs while the next cover
 * stands revealed, lifted a notch as if pinched. The flip is one continuous
 * value: a drag riffles through 1:1 (down tips forward) and a flick projects
 * and settles on a whole sleeve on `springs.glide` with the release velocity.
 *
 * Pull the revealed sleeve (drag it up, click it, or Enter) and it rises out
 * of the crate and turns to face you on `glide`; the record slides out of its
 * open side a beat later on `glide` and starts to turn, spinning up to
 * `spin` rpm like a platter, its label printed with the title and artist,
 * while a plate under it reads them in full. Escape, Enter again, a click
 * outside or a drag down slides the record home on an exit tween and drops
 * the sleeve back. With `sound`, every sleeve that passes and every pull is
 * heard as paper. Keys: Down and Right flip forward, Up and Left flip back,
 * Home and End go to the ends. Under reduced motion the stack re-poses at
 * once, the record and plate cross-fade in, and the record does not turn.
 */
export function CrateDig({
  albums = defaultCrateAlbums,
  value,
  defaultValue = 0,
  onValueChange,
  pulled: pulledProp,
  defaultPulled = false,
  onPulledChange,
  tilt = 48,
  crateDepth = 200,
  spin = 33,
  tipAngle = 48,
  woodTone = "oak",
  wheel = true,
  sound = false,
  height = 520,
  label = "Record crate",
  disabled = false,
  className,
}: CrateDigProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = albums.length > 0 ? albums : defaultCrateAlbums;
  const n = list.length;
  const tiltDeg = clamp(tilt, 15, 70);

  const [width, setWidth] = React.useState(720);
  const g = React.useMemo(
    () => geometry(width, height, n, crateDepth, tipAngle),
    [width, height, n, crateDepth, tipAngle],
  );
  const wood = WOODS[woodTone] ?? WOODS.oak;

  const start = clamp(Math.round(value ?? defaultValue), 0, n - 1);
  const flip = useMotionValue(start);
  const [ownPulled, setOwnPulled] = React.useState(defaultPulled);
  const isPulled = pulledProp ?? ownPulled;
  const pull = useMotionValue(isPulled ? 1 : 0);
  const slide = useMotionValue(isPulled ? 1 : 0);
  const turn = useMotionValue(0);
  const plate = useTransform(pull, (p) => r3(clamp01(p)));
  const plateOff = useTransform(plate, (p) => r3(1 - p));

  const [current, setCurrent] = React.useState(start);
  const [owner, setOwner] = React.useState(start);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const flipAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const pullAnims = React.useRef<AnimationPlaybackControls[]>([]);
  const target = React.useRef(start);
  const currentRef = React.useRef(start);
  const passed = React.useRef(start);
  const reported = React.useRef<number | null>(null);
  const visitor = React.useRef(false);
  const shownPulled = React.useRef(isPulled);
  const gesture = React.useRef<{ kind: "flip" | "pull"; from: number } | null>(
    null,
  );
  const wheelTimer = React.useRef<number | null>(null);
  const spinRaf = React.useRef<number | null>(null);
  const spinState = React.useRef({ omega: 0, last: 0 });
  const state = React.useRef({
    hovered: false,
    hoverSince: 0,
    focused: false,
    lastWheel: 0,
    wheelTaken: false,
    inView: true,
    visible: true,
  });

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const describe = (i: number) => {
    const a = list[i];
    return a ? `${a.title} by ${a.artist}` : "";
  };

  /** Paper, only once the visitor has pressed or typed: a wheel is not an activation. */
  const rustle = (pitch: number, gain: number) => {
    if (!sound) return;
    if (
      typeof navigator !== "undefined" &&
      "userActivation" in navigator &&
      !navigator.userActivation.hasBeenActive
    ) {
      return;
    }
    const box = viewRef.current?.getBoundingClientRect();
    audio.play("paper", {
      pitch,
      gain,
      pan: box ? panFrom(box.left + box.width / 2, null) : 0,
    });
  };

  /* -------------------------------- flip ------------------------------- */

  const haltFlip = () => {
    flipAnim.current?.stop();
    flipAnim.current = null;
  };

  const settleFlip = (to: number, velocity = 0) => {
    haltFlip();
    const i = clamp(Math.round(to), 0, n - 1);
    target.current = i;
    if (!motionSafe) {
      flip.jump(i);
      visitor.current = false;
      return;
    }
    flipAnim.current = animate(flip, i, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        flipAnim.current = null;
        visitor.current = false;
      },
    });
  };

  const onFlip = (f: number) => {
    // A sound each time a sleeve's top passes the halfway point.
    const whole = Math.round(f);
    if (whole !== passed.current) {
      const dir = whole > passed.current ? 1 : -1;
      passed.current = whole;
      rustle(dir > 0 ? 1 + (whole % 3) * 0.06 : 0.86, 0.45);
    }
    const idx = clamp(whole, 0, n - 1);
    if (idx !== currentRef.current) {
      currentRef.current = idx;
      setCurrent(idx);
      reported.current = idx;
      onValueChange?.(idx);
      if (visitor.current) say(`${idx + 1} of ${n}: ${describe(idx)}.`);
    }
  };

  /* -------------------------------- pull ------------------------------- */

  const runPull = (on: boolean, velocity = 0) => {
    for (const a of pullAnims.current) a.stop();
    if (!motionSafe) {
      const fadeT = { duration: durations.base, ease: easings.enter };
      pull.jump(on ? 1 : 0);
      pullAnims.current = [animate(slide, on ? 1 : 0, fadeT)];
      return;
    }
    if (on) {
      pullAnims.current = [
        animate(pull, 1, { ...springs.glide, velocity }),
        animate(slide, 1, { ...springs.glide, delay: SLIDE_DELAY }),
      ];
    } else {
      // The record goes home first, on the house exit tween; then the sleeve drops.
      const exit = { duration: durations.base * 0.6, ease: easings.exit };
      pullAnims.current = [
        animate(slide, 0, exit),
        animate(pull, 0, {
          ...springs.glide,
          velocity,
          delay: exit.duration * 0.7,
        }),
      ];
    }
  };

  const setPulled = (next: boolean, velocity = 0) => {
    if (disabled) return;
    if (next) setOwner(currentRef.current);
    if (next === isPulled) {
      runPull(next, velocity);
      return;
    }
    if (pulledProp === undefined) {
      setOwnPulled(next);
      shownPulled.current = next;
      runPull(next, velocity);
    } else {
      runPull(isPulled, velocity);
    }
    onPulledChange?.(next);
    rustle(next ? 0.72 : 0.84, next ? 0.6 : 0.45);
    say(next ? `Pulled ${describe(currentRef.current)}.` : "Put back.");
  };

  // A host that changes `pulled` gets the same motion a click would.
  React.useEffect(() => {
    if (shownPulled.current === isPulled) return;
    shownPulled.current = isPulled;
    runPull(isPulled);
    // runPull closes over motion values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPulled]);

  /* -------------------------------- spin ------------------------------- */

  const spinTick = (now: number) => {
    const st = spinState.current;
    const dt = Math.min(0.05, Math.max(0, (now - (st.last || now)) / 1000));
    st.last = now;
    const want =
      isPulled && motionSafe && state.current.visible && state.current.inView
        ? clamp(spin, 0, 78) * 6
        : 0;
    // A platter spins up and runs down: the speed eases toward the target.
    st.omega += (want - st.omega) * (1 - Math.exp(-dt / 0.45));
    if (want === 0 && st.omega < 0.5) {
      st.omega = 0;
      st.last = 0;
      spinRaf.current = null;
      return;
    }
    turn.set(r2((turn.get() + st.omega * dt) % 360));
    spinRaf.current = requestAnimationFrame((t) => api.current?.spinTick(t));
  };

  const wakeSpin = () => {
    if (spinRaf.current !== null) return;
    if (
      !(isPulled && motionSafe && spin > 0) &&
      spinState.current.omega === 0
    ) {
      return;
    }
    spinRaf.current = requestAnimationFrame((t) => api.current?.spinTick(t));
  };

  /* -------------------------------- wheel ------------------------------ */

  const takeWheel = (event: WheelEvent) => {
    const k = state.current;
    const now = performance.now();
    if (now - k.lastWheel > WHEEL_BURST_MS) {
      k.wheelTaken =
        wheel &&
        !disabled &&
        (k.focused || (k.hovered && now - k.hoverSince > HOVER_INTENT_MS));
    }
    k.lastWheel = now;
    if (!k.wheelTaken) return;
    const { x: wx, y: wy } = wheelPixels(event);
    const delta = Math.abs(wy) >= Math.abs(wx) ? wy : wx;
    const f = flip.get();
    if ((delta < 0 && f <= 0.01) || (delta > 0 && f >= n - 1.01)) return;
    event.preventDefault();
    haltFlip();
    if (isPulled) setPulled(false);
    visitor.current = true;
    flip.set(clamp(f + delta / WHEEL_PX, 0, n - 1));
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelTimer.current = null;
      settleFlip(flip.get());
    }, 130);
  };

  React.useEffect(() => {
    api.current = { onFlip, wheel: takeWheel, spinTick, wake: wakeSpin };
  });

  /* ------------------------------ effects ------------------------------ */

  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.width > 0) setWidth(Math.round(box.width));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  React.useEffect(
    () => flip.on("change", (f) => api.current?.onFlip(f)),
    [flip],
  );

  React.useEffect(() => {
    if (value === undefined) return;
    const k = clamp(Math.round(value), 0, n - 1);
    if (k === reported.current || k === currentRef.current) return;
    reported.current = k;
    settleFlip(k);
    // settleFlip closes over motion values only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, n]);

  // The record only turns on screen, in a visible tab.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      state.current.inView = entry.isIntersecting;
      api.current?.wake();
    });
    io.observe(node);
    const onVisibility = () => {
      state.current.visible = document.visibilityState !== "hidden";
      api.current?.wake();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    wakeSpin();
  });

  React.useEffect(() => {
    const node = viewRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => api.current?.wheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  React.useEffect(
    () => () => {
      flipAnim.current?.stop();
      for (const a of pullAnims.current) a.stop();
      pullAnims.current = [];
      if (spinRaf.current !== null) cancelAnimationFrame(spinRaf.current);
      spinRaf.current = null;
      spinState.current.omega = 0;
      spinState.current.last = 0;
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      wheelTimer.current = null;
    },
    [],
  );

  /* ------------------------------ gestures ----------------------------- */

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ event, offset }) => {
      const hit =
        event.target instanceof Element
          ? event.target.closest("[data-sleeve]")
          : null;
      const onCurrent =
        hit !== null &&
        Number(hit.getAttribute("data-sleeve")) === currentRef.current;
      visitor.current = true;
      haltFlip();
      // Up on the revealed sleeve pulls it; down on a pulled one puts it back.
      if (
        (onCurrent && offset.y < 0 && !isPulled) ||
        (isPulled && offset.y > 0)
      ) {
        for (const a of pullAnims.current) a.stop();
        gesture.current = { kind: "pull", from: pull.get() };
        if (!isPulled) {
          setOwner(currentRef.current);
          slide.set(0);
        }
        return;
      }
      if (isPulled) setPulled(false);
      gesture.current = { kind: "flip", from: flip.get() };
    },
    onMove: ({ offset }) => {
      const gs = gesture.current;
      if (!gs) return;
      if (gs.kind === "pull") {
        pull.set(clamp(gs.from - offset.y / (g.s * 0.95), 0, 1.08));
        return;
      }
      flip.set(rubberClamp(gs.from + offset.y / FLIP_PX, 0, n - 1, 1));
    },
    onEnd: ({ velocity }) => {
      const gs = gesture.current;
      gesture.current = null;
      if (!gs) return;
      if (gs.kind === "pull") {
        const v = -velocity.y / (g.s * 0.95);
        const out = pull.get() > 0.4 || v > 1.4 ? v > -1.4 : false;
        setPulled(out, motionSafe ? v : 0);
        return;
      }
      const v = velocity.y / FLIP_PX;
      const rest = motionSafe
        ? project(flip.get(), v * 1000, 0.995)
        : flip.get();
      settleFlip(rest, motionSafe ? v : 0);
    },
    onCancel: () => {
      const gs = gesture.current;
      gesture.current = null;
      if (gs?.kind === "pull") runPull(isPulled);
      else settleFlip(flip.get());
    },
    onTap: (event) => {
      const hit =
        event.target instanceof Element
          ? event.target.closest("[data-sleeve]")
          : null;
      visitor.current = true;
      if (!hit) {
        if (isPulled) setPulled(false);
        return;
      }
      const i = Number(hit.getAttribute("data-sleeve"));
      if (!Number.isFinite(i)) return;
      if (i === currentRef.current) {
        setPulled(!isPulled);
        return;
      }
      if (isPulled) setPulled(false);
      settleFlip(i);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const go = (to: number) => {
      event.preventDefault();
      visitor.current = true;
      if (isPulled) setPulled(false);
      const from = flipAnim.current ? target.current : Math.round(flip.get());
      settleFlip(to === Infinity ? n - 1 : to === -Infinity ? 0 : from + to);
    };
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        go(1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        go(-1);
        break;
      case "Home":
        go(-Infinity);
        break;
      case "End":
        go(Infinity);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        setPulled(!isPulled);
        break;
      case "Escape":
        if (!isPulled) return;
        event.preventDefault();
        setPulled(false);
        break;
      default:
        break;
    }
  };

  /* ------------------------------- render ------------------------------ */

  const album = list[current];
  const half = g.depth / 2;
  const wallFace = planks(wood.face, wood.seam, 3, g.wall);
  const frontFace = planks(wood.face, wood.seam, 2, g.front);
  const innerFace = planks(wood.inner, wood.seam, 3, g.wall);
  const edge = "0 0 0 1px color-mix(in oklab, black 22%, transparent)";

  return (
    <div
      ref={rootRef}
      onPointerEnter={() => {
        state.current.hovered = true;
        state.current.hoverSince = performance.now();
      }}
      onPointerLeave={() => {
        state.current.hovered = false;
      }}
      onFocus={(event) => {
        state.current.focused = event.target.matches(":focus-visible");
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          state.current.focused = false;
        }
      }}
      className={cn(
        "relative w-full overflow-clip rounded-4 border border-hairline bg-surface-1 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height: g.h }}
    >
      <p id={hintId} className="sr-only">
        Down and Right flip the front sleeve forward, Up and Left flip it back,
        Home and End go to the ends. Enter pulls the revealed record out or puts
        it back; Escape puts it back.
      </p>
      <div
        ref={viewRef}
        role="group"
        aria-roledescription="record crate"
        aria-label={`${label}: ${current + 1} of ${n}, ${describe(current)}${isPulled ? ", pulled out" : ""}`}
        aria-describedby={hintId}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "absolute inset-0 touch-pan-x rounded-4 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{ perspective: 1000, perspectiveOrigin: "50% 30%" }}
      >
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-0 [transform-style:preserve-3d]"
          style={{
            transform: `translateY(${g.drop}px) rotateX(${-tiltDeg}deg)`,
          }}
        >
          {/* Floor. */}
          <div
            className="absolute"
            style={{
              left: r2(-g.cw / 2),
              top: r2(-half),
              width: g.cw,
              height: g.depth,
              transform: `translateY(${g.floor}px) rotateX(90deg)`,
              background: `linear-gradient(to bottom, ${wood.seam}, ${wood.inner})`,
            }}
          />
          {/* Back wall. */}
          <div
            className="absolute"
            style={{
              left: r2(-g.cw / 2),
              top: r2(g.floor - g.wall),
              width: g.cw,
              height: g.wall,
              transform: `translateZ(${r2(-half)}px)`,
              background: innerFace,
              boxShadow: edge,
            }}
          />
          {/* Side walls. */}
          {[-1, 1].map((side) => (
            <div
              key={side}
              className="absolute"
              style={{
                left: r2(-half),
                top: r2(g.floor - g.wall),
                width: g.depth,
                height: g.wall,
                transform: `translateX(${r2((side * g.cw) / 2)}px) rotateY(90deg)`,
                background: side < 0 ? innerFace : wallFace,
                boxShadow: edge,
              }}
            />
          ))}
          {list.map((a, i) => (
            <Sleeve
              key={i}
              g={g}
              index={i}
              album={a}
              flip={flip}
              pull={pull}
              slide={slide}
              turn={turn}
              tilt={tiltDeg}
              owner={owner}
              motionSafe={motionSafe}
            />
          ))}
          {/* Front wall, low, so the covers show over it. */}
          <div
            className="absolute"
            style={{
              left: r2(-g.cw / 2),
              top: r2(g.floor - g.front),
              width: g.cw,
              height: g.front,
              transform: `translateZ(${r2(half)}px)`,
              background: frontFace,
              boxShadow: `${edge}, inset 0 1px 0 color-mix(in oklab, white 25%, transparent)`,
            }}
          >
            <span
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono font-semibold tracking-[0.2em] uppercase"
              style={{
                fontSize: Math.max(6, Math.round(g.s * 0.05)),
                color: wood.seam,
              }}
            >
              {String(current + 1).padStart(2, "0")} /{" "}
              {String(n).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      {/* The plate: what is revealed, and in full once pulled. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3 bottom-3 grid justify-items-center"
      >
        <motion.p
          className="col-start-1 row-start-1 max-w-full self-center truncate rounded-full bg-background/80 px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase backdrop-blur-sm"
          style={{ opacity: plateOff }}
        >
          {album ? `${album.title} · ${album.artist}` : ""}
        </motion.p>
        <motion.div
          className="col-start-1 row-start-1 flex max-w-full flex-col items-center self-center rounded-3 border border-hairline bg-background/85 px-3 py-1.5 text-center backdrop-blur-sm"
          style={{ opacity: plate }}
        >
          <span className="max-w-full truncate text-sm font-semibold text-foreground">
            {album?.title}
          </span>
          <span className="max-w-full truncate font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
            {album
              ? `${album.artist}${album.year ? ` · ${album.year}` : ""}${motionSafe && spin > 0 ? ` · ${Math.round(spin)} rpm` : ""}`
              : ""}
          </span>
        </motion.div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
