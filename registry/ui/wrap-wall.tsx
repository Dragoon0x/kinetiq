"use client";

import * as React from "react";

import { X } from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  usePresence,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type WrapWallItem = {
  /** A picture. Without one, `art` or a drawn picture is shown. */
  src?: string;
  /** Describes the picture. */
  alt: string;
  /** A short title, shown when the picture is open. Defaults to `alt`. */
  caption?: string;
  /** Your own art, filling the tile. */
  art?: React.ReactNode;
};

export type WrapWallProps = {
  /** The pictures. The wall repeats them in every direction. @default defaultWrapWallItems */
  items?: WrapWallItem[];
  /** Controlled: the open picture, or null while the wall is showing. */
  value?: number | null;
  /** Initial open picture when uncontrolled. @default null */
  defaultValue?: number | null;
  /** Fires from the click or key that opened or closed a picture. */
  onValueChange?: (index: number | null) => void;
  /** Columns across the frame, 2 to 6. @default 4 */
  columns?: number;
  /** The most the wall leans at speed, 0 to 12 degrees. @default 5 */
  skew?: number;
  /** How quickly a throw slows, 0 (coasts long) to 1 (stops short). @default 0.4 */
  friction?: number;
  /** How far columns trail the one you hold, 0 (all as one) to 1. @default 0.6 */
  ripple?: number;
  /** How differently the columns start, 0 (level) to 1. @default 0.6 */
  stagger?: number;
  /** Space between tiles, px. @default 10 */
  gap?: number;
  /** Height of the frame, px. @default 440 */
  height?: number;
  /** Seeds tile heights and the order of the pictures. @default 2 */
  seed?: number;
  /** Fires when a pan settles, with the picture nearest the centre. */
  onCentreChange?: (index: number) => void;
  /** The wall's accessible name. @default "Pictures" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- helpers ------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const STEP = 1 / 240;
/** Distinct column designs before the wall repeats sideways. */
const DESIGNS = 9;

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

/** A small hash, so every tile's height and picture are seeded, not random. */
const hash = (a: number, b: number, seed: number) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

type Column = {
  /** How far the column starts above the frame, in column widths. */
  lead: number;
  /** Height over width for each tile. */
  aspects: number[];
  /** Picture per tile. */
  pictures: number[];
};

/** One column design: seeded tile shapes and pictures, no two alike in a row. */
function designColumn(
  l: number,
  count: number,
  cards: number,
  stagger: number,
  seed: number,
): Column {
  const aspects: number[] = [];
  const pictures: number[] = [];
  // A seeded shuffle of the pictures, walked so that neighbours across and
  // down never repeat: steps coprime-ish with the count.
  const order = Array.from({ length: cards }, (_, i) => i).sort(
    (a, b) => hash(a, 7, seed) - hash(b, 7, seed),
  );
  const across = [7, 5, 3, 2].find((a) => cards > 1 && a % cards !== 0) ?? 1;
  const down =
    [3, 2, 5].find((b) => cards > 1 && b % cards !== 0 && b !== across) ?? 1;
  for (let t = 0; t < count; t += 1) {
    aspects.push(r3(0.72 + hash(l, t, seed) * 0.78));
    pictures.push(order[mod(l * across + t * down, cards)] ?? 0);
  }
  return {
    lead: r3(clamp01(stagger) * hash(l, 99, seed) * 1.1),
    aspects,
    pictures,
  };
}

/* ----------------------------------- art --------------------------------- */

export const defaultWrapWallItems: WrapWallItem[] = [
  { alt: "A harbour at dusk with moored boats", caption: "Harbour at dusk" },
  { alt: "Rows of apple trees in an orchard", caption: "Orchard rows" },
  { alt: "A lighthouse on a headland", caption: "Lighthouse" },
  { alt: "A red boathouse by still water", caption: "Red boathouse" },
  { alt: "Channels winding through a salt marsh", caption: "Salt marsh" },
  { alt: "A hill town of white houses", caption: "Hill town" },
  { alt: "Sunflowers turned toward the sun", caption: "Sunflowers" },
  { alt: "Pier lights reflected in the sea at night", caption: "Pier lights" },
  { alt: "Fog drifting through pine trees", caption: "Fog over pines" },
  { alt: "A straight road across a desert", caption: "Desert road" },
  { alt: "A glacier lake under grey peaks", caption: "Glacier lake" },
  { alt: "Rooftops and chimneys of a city", caption: "City rooftops" },
  { alt: "Tide pools among dark rocks", caption: "Tide pools" },
  { alt: "A wheat field under a wide sky", caption: "Wheat field" },
  { alt: "Lanterns over a night market", caption: "Night market" },
  { alt: "A stone bridge over a canal", caption: "Canal bridge" },
];

/** Sixteen drawn pictures, one for each default caption: shapes in pigments. */
function WallArt({ index }: { index: number }) {
  const common = {
    viewBox: "0 0 100 100",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  const f = (token: string, l: number, c: number, dh = 0) => ({
    style: { fill: pig(token, l, c, dh) },
  });
  const st = (token: string, l: number, c: number, dh = 0) => ({
    style: { stroke: pig(token, l, c, dh) },
    fill: "none",
  });
  switch (mod(index, 16)) {
    case 0: // Harbour at dusk
      return (
        <svg {...common}>
          <rect width="100" height="60" {...f("--danger", 0.78, 0.08, 30)} />
          <rect y="34" width="100" height="26" {...f("--warn", 0.84, 0.09)} />
          <circle cx="62" cy="54" r="8" {...f("--warn", 0.9, 0.12)} />
          <rect y="58" width="100" height="42" {...f("--accent", 0.32, 0.06)} />
          <path d="M14 66 h22 l-4 6 h-14 Z" {...f("--accent", 0.18, 0.03)} />
          <path d="M24 66 V48 l8 16 Z" {...f("--accent", 0.22, 0.03)} />
          <path d="M60 70 h18 l-3 5 h-12 Z" {...f("--accent", 0.18, 0.03)} />
          {[62, 78, 88].map((y) => (
            <path
              key={y}
              d={`M${40 + (y % 9)} ${y} h18`}
              {...st("--warn", 0.85, 0.1)}
              strokeWidth="1"
            />
          ))}
        </svg>
      );
    case 1: // Orchard rows
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--warn", 0.92, 0.04, 40)} />
          <rect
            y="44"
            width="100"
            height="56"
            {...f("--success", 0.7, 0.1, -30)}
          />
          {[0, 1, 2, 3].map((r) =>
            [0, 1, 2, 3, 4, 5].map((k) => (
              <circle
                key={`${r}-${k}`}
                cx={(k * 20 + r * 7) % 104}
                cy={50 + r * 13}
                r={4 + r * 2}
                {...f("--success", 0.42 + r * 0.04, 0.12)}
              />
            )),
          )}
        </svg>
      );
    case 2: // Lighthouse
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.88, 0.05, -40)} />
          <rect
            y="62"
            width="100"
            height="38"
            {...f("--accent", 0.55, 0.12, -40)}
          />
          <path
            d="M0 70 C20 58 40 56 58 62 V100 H0 Z"
            {...f("--success", 0.4, 0.06)}
          />
          <path d="M30 60 l3 -34 h8 l3 34 Z" {...f("--accent", 0.97, 0.01)} />
          <rect
            x="31"
            y="40"
            width="12"
            height="6"
            {...f("--danger", 0.55, 0.18)}
          />
          <path d="M33 26 h8 v-6 h-8 Z" {...f("--warn", 0.85, 0.14)} />
        </svg>
      );
    case 3: // Red boathouse
      return (
        <svg {...common}>
          <rect width="100" height="56" {...f("--accent", 0.86, 0.04, -60)} />
          <rect
            y="56"
            width="100"
            height="44"
            {...f("--accent", 0.7, 0.06, -60)}
          />
          <path
            d="M28 56 V40 L46 28 L64 40 V56 Z"
            {...f("--danger", 0.52, 0.16)}
          />
          <path
            d="M28 56 V72 L46 84 L64 72 V56 Z"
            {...f("--danger", 0.6, 0.1)}
            opacity="0.55"
          />
          <rect
            x="40"
            y="44"
            width="12"
            height="12"
            {...f("--accent", 0.25, 0.03)}
          />
          <path
            d="M0 50 C30 46 60 52 100 48 V56 H0 Z"
            {...f("--success", 0.45, 0.08)}
          />
        </svg>
      );
    case 4: // Salt marsh
      return (
        <svg {...common}>
          <rect width="100" height="30" {...f("--accent", 0.9, 0.03, -50)} />
          <rect
            y="30"
            width="100"
            height="70"
            {...f("--success", 0.62, 0.07, -50)}
          />
          <path
            d="M40 30 C50 44 20 52 34 66 S80 76 60 100"
            {...st("--accent", 0.72, 0.08, -40)}
            strokeWidth="6"
          />
          <path
            d="M70 30 C72 40 88 46 84 58"
            {...st("--accent", 0.72, 0.08, -40)}
            strokeWidth="3"
          />
        </svg>
      );
    case 5: // Hill town
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.8, 0.07, -50)} />
          <path
            d="M0 100 V64 C30 40 70 36 100 58 V100 Z"
            {...f("--warn", 0.7, 0.07, -20)}
          />
          {[
            [18, 58],
            [30, 50],
            [44, 46],
            [58, 44],
            [72, 48],
            [36, 60],
            [52, 56],
            [66, 58],
          ].map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="10"
              height="8"
              {...f("--accent", 0.97, 0.01)}
            />
          ))}
          <path d="M57 44 v-10 h3 v10 Z" {...f("--accent", 0.97, 0.01)} />
        </svg>
      );
    case 6: // Sunflowers
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.78, 0.09, -40)} />
          <rect y="70" width="100" height="30" {...f("--success", 0.5, 0.12)} />
          {[
            [20, 48, 11],
            [50, 40, 13],
            [80, 52, 10],
            [36, 70, 9],
            [66, 72, 9],
          ].map(([x, y, r]) => (
            <g key={`${x}`}>
              <circle cx={x} cy={y} r={r} {...f("--warn", 0.84, 0.16)} />
              <circle
                cx={x}
                cy={y}
                r={(r ?? 10) * 0.42}
                {...f("--warn", 0.4, 0.08, -30)}
              />
            </g>
          ))}
        </svg>
      );
    case 7: // Pier lights
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.24, 0.07)} />
          <rect y="56" width="100" height="44" {...f("--accent", 0.18, 0.05)} />
          <path d="M0 52 H70 V56 H0 Z" {...f("--accent", 0.12, 0.03)} />
          {[10, 26, 42, 58].map((x) => (
            <g key={x}>
              <circle cx={x} cy="46" r="2" {...f("--warn", 0.9, 0.12)} />
              <path
                d={`M${x} 60 v${18 + (x % 7)}`}
                {...st("--warn", 0.85, 0.12)}
                strokeWidth="1.4"
                opacity="0.6"
              />
            </g>
          ))}
          <circle cx="82" cy="22" r="5" {...f("--warn", 0.95, 0.03)} />
        </svg>
      );
    case 8: // Fog over pines
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.88, 0.01)} />
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3, 4, 5].map((k) => (
              <path
                key={`${r}-${k}`}
                d={`M${k * 18 + r * 9 - 4} ${70 + r * 12} l8 -${24 + r * 4} l8 ${24 + r * 4} Z`}
                {...f("--success", 0.66 - r * 0.12, 0.04 + r * 0.02)}
              />
            )),
          )}
          <rect
            y="54"
            width="100"
            height="10"
            {...f("--accent", 0.92, 0.01)}
            opacity="0.7"
          />
        </svg>
      );
    case 9: // Desert road
      return (
        <svg {...common}>
          <rect width="100" height="46" {...f("--warn", 0.9, 0.06, -10)} />
          <rect
            y="46"
            width="100"
            height="54"
            {...f("--warn", 0.74, 0.1, -20)}
          />
          <path
            d="M0 52 C30 44 60 50 100 46 V46 H0 Z"
            {...f("--danger", 0.62, 0.1, 20)}
          />
          <path
            d="M46 46 L54 46 L80 100 L20 100 Z"
            {...f("--accent", 0.3, 0.02)}
          />
          <path
            d="M50 52 V60 M50 70 V82 M50 90 V100"
            {...st("--warn", 0.92, 0.08)}
            strokeWidth="1.5"
          />
        </svg>
      );
    case 10: // Glacier lake
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.86, 0.03)} />
          <path
            d="M0 62 L22 26 L38 46 L56 16 L78 44 L100 30 V62 Z"
            {...f("--accent", 0.5, 0.03)}
          />
          <path
            d="M50 22 L56 16 L62 24 Z M18 32 L22 26 L26 32 Z"
            {...f("--accent", 0.98, 0.01)}
          />
          <rect
            y="62"
            width="100"
            height="38"
            {...f("--signal", 0.62, 0.1, 30)}
          />
        </svg>
      );
    case 11: // City rooftops
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--warn", 0.86, 0.05)} />
          <path
            d="M0 100 V58 L16 46 L32 58 V100 Z"
            {...f("--danger", 0.5, 0.1, 15)}
          />
          <path
            d="M30 100 V50 L50 36 L70 50 V100 Z"
            {...f("--danger", 0.42, 0.09, 15)}
          />
          <path
            d="M66 100 V60 L84 48 L100 58 V100 Z"
            {...f("--danger", 0.56, 0.1, 15)}
          />
          {[20, 56, 88].map((x) => (
            <rect
              key={x}
              x={x}
              y={x === 56 ? 34 : 44}
              width="5"
              height="10"
              {...f("--danger", 0.32, 0.06, 15)}
            />
          ))}
        </svg>
      );
    case 12: // Tide pools
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.3, 0.02)} />
          <ellipse
            cx="30"
            cy="34"
            rx="22"
            ry="12"
            {...f("--signal", 0.6, 0.1, 20)}
          />
          <ellipse
            cx="70"
            cy="64"
            rx="26"
            ry="14"
            {...f("--signal", 0.55, 0.09, 20)}
          />
          <ellipse
            cx="24"
            cy="78"
            rx="12"
            ry="7"
            {...f("--signal", 0.62, 0.1, 20)}
          />
          <circle cx="66" cy="60" r="3" {...f("--danger", 0.62, 0.16)} />
        </svg>
      );
    case 13: // Wheat field
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.84, 0.06, -50)} />
          <rect y="58" width="100" height="42" {...f("--warn", 0.78, 0.13)} />
          {[64, 72, 82, 94].map((y, k) => (
            <path
              key={y}
              d={`M0 ${y} Q50 ${y - 4} 100 ${y}`}
              {...st("--warn", 0.66 - k * 0.03, 0.12)}
              strokeWidth={r3(1 + k * 0.6)}
            />
          ))}
          <path
            d="M60 30 q10 -8 20 0"
            {...st("--accent", 0.98, 0.01)}
            strokeWidth="3"
          />
        </svg>
      );
    case 14: // Night market
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--danger", 0.24, 0.07, 40)} />
          <path
            d="M0 26 Q50 46 100 26"
            {...st("--warn", 0.6, 0.04)}
            strokeWidth="0.8"
          />
          {[10, 24, 38, 50, 62, 76, 90].map((x) => (
            <circle
              key={x}
              cx={x}
              cy={r2(26 + 20 * (1 - ((x - 50) / 50) ** 2) * 0.62)}
              r="3.5"
              {...f(x % 3 ? "--warn" : "--danger", 0.78, 0.15)}
            />
          ))}
          <rect
            y="70"
            width="100"
            height="30"
            {...f("--danger", 0.16, 0.04, 40)}
          />
          <path
            d="M10 70 h22 v-12 h-22 Z M58 70 h30 v-14 h-30 Z"
            {...f("--warn", 0.6, 0.1)}
          />
        </svg>
      );
    default: // Canal bridge
      return (
        <svg {...common}>
          <rect width="100" height="100" {...f("--accent", 0.86, 0.04, -30)} />
          <rect
            y="56"
            width="100"
            height="44"
            {...f("--success", 0.46, 0.07, 20)}
          />
          <path
            d="M0 56 V40 H100 V56 H78 A28 20 0 0 0 22 56 Z"
            {...f("--warn", 0.66, 0.05, -20)}
          />
          <path
            d="M22 56 A28 20 0 0 1 78 56"
            {...st("--warn", 0.5, 0.05, -20)}
            strokeWidth="1.5"
          />
          <path
            d="M22 56 A28 20 0 0 0 78 56"
            {...st("--warn", 0.66, 0.05, -20)}
            strokeWidth="1.5"
            opacity="0.5"
          />
        </svg>
      );
  }
}

function Picture({ item, index }: { item: WrapWallItem; index: number }) {
  if (item.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.src}
        alt=""
        draggable={false}
        className="block size-full object-cover"
      />
    );
  }
  return item.art ? <>{item.art}</> : <WallArt index={index} />;
}

/* --------------------------------- engine -------------------------------- */

type Config = {
  columns: number;
  skew: number;
  friction: number;
  ripple: number;
  gap: number;
  height: number;
  motionSafe: boolean;
};

type Tile = { el: HTMLElement; j: number; t: number };

type Engine = {
  configure: (c: Config, designs: Column[], width: number) => void;
  /** Re-reads the tiles React rendered and places any new ones at once. */
  refresh: () => void;
  grab: (x: number) => void;
  drag: (dx: number, dy: number) => void;
  drop: (vx: number, vy: number) => void;
  pan: (dx: number, dy: number, origin?: boolean) => void;
  centre: () => { j: number; t: number; picture: number } | null;
  rectOf: (j: number, t: number) => DOMRect | null;
  wake: () => void;
  dispose: () => void;
};

/**
 * The wall's one loop. The pan follows the hand 1:1 and coasts by friction;
 * every column's vertical offset is its own spring chasing the pan, stiffer the
 * nearer it is to the column you hold, so the wall bends round your hand and
 * ripples straight as it slows. Positions are written straight to tile
 * transforms; React only hears when a column enters or leaves.
 */
function createEngine(
  plane: HTMLDivElement,
  visible: () => boolean,
  onRange: (from: number, to: number) => void,
  onSettle: () => void,
): Engine {
  let cfg: Config | null = null;
  let designs: Column[] = [];
  let width = 0;
  let pitch = 1;
  let colW = 1;
  const tiles = new Map<string, Tile>();
  const pan = { x: 0, y: 0 };
  const vel = { x: 0, y: 0 };
  const seen = { x: 0, y: 0 };
  let steer: { x: number; y: number } | null = null;
  const steerV = { x: 0, y: 0 };
  const followers = new Map<number, { y: number; v: number }>();
  let anchor = 0;
  let dragging = false;
  const grabbed = { x: 0, y: 0 };
  let frame = 0;
  let last = 0;
  let disposed = false;
  let range: [number, number] = [0, 0];
  let moving = false;
  let lastPan = { x: 0, y: 0 };

  const periodOf = (d: Column) => {
    let p = 0;
    for (const a of d.aspects) p += a * colW + (cfg?.gap ?? 10);
    return p;
  };

  const place = (tile: Tile) => {
    const c = cfg;
    if (!c) return;
    const d = designs[mod(tile.j, DESIGNS)];
    if (!d) return;
    const gap = c.gap;
    let base = -d.lead * colW;
    for (let t = 0; t < tile.t; t += 1)
      base += (d.aspects[t] ?? 1) * colW + gap;
    const period = periodOf(d);
    const reach = colW * 1.6 + gap;
    const offset = followers.get(tile.j)?.y ?? pan.y;
    const y = mod(base + offset + reach, period) - reach;
    tile.el.style.transform = `translate3d(0, ${r2(y - base)}px, 0)`;
  };

  const writePlane = () => {
    const c = cfg;
    if (!c) return;
    const max = c.motionSafe ? clamp(c.skew, 0, 12) : 0;
    const sx = clamp((-seen.x / 1800) * max, -max, max);
    const sy = clamp((seen.y / 2600) * max * 0.6, -max * 0.6, max * 0.6);
    plane.style.transform = `translate3d(${r2(pan.x)}px, 0, 0) skewX(${r2(sx)}deg) skewY(${r2(sy)}deg)`;
  };

  const updateRange = () => {
    const c = cfg;
    if (!c || width < 1) return;
    const pad = c.height * 0.12 + pitch;
    const from = Math.floor((-pan.x - pad) / pitch);
    const to = Math.ceil((width - pan.x + pad) / pitch);
    if (from !== range[0] || to !== range[1]) {
      range = [from, to];
      onRange(from, to);
    }
  };

  const writeAll = () => {
    writePlane();
    for (const tile of tiles.values()) place(tile);
    updateRange();
  };

  const settleFollowers = (dt: number) => {
    const c = cfg;
    if (!c) return true;
    let still = true;
    const lag = c.motionSafe ? clamp01(c.ripple) : 0;
    for (const [j, f] of followers) {
      const centre = j * pitch + colW / 2 + pan.x;
      const d = Math.abs(centre - anchor) / Math.max(1, pitch);
      if (dragging && d < 0.5) {
        f.y = pan.y;
        f.v = 0;
        continue;
      }
      if (lag * d < 0.04) {
        f.y = pan.y;
        f.v = 0;
        continue;
      }
      const k = lerp(
        springs.snap.stiffness,
        springs.drift.stiffness,
        clamp01((lag * d) / 3),
      );
      const damp = 2 * 0.74 * Math.sqrt(k);
      let left = dt;
      while (left > 1e-7) {
        const h = Math.min(STEP, left);
        left -= h;
        f.v += (k * (pan.y - f.y) - damp * f.v) * h;
        f.y += f.v * h;
      }
      if (Math.abs(f.y - pan.y) > 0.3 || Math.abs(f.v) > 2) still = false;
      else {
        f.y = pan.y;
        f.v = 0;
      }
    }
    return still;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c) return;
    if (!visible() || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!dragging) {
      if (steer) {
        const sp = springs.glide;
        let left = dt;
        while (left > 1e-7) {
          const h = Math.min(STEP, left);
          left -= h;
          steerV.x +=
            ((-sp.stiffness * (pan.x - steer.x) - sp.damping * steerV.x) /
              sp.mass) *
            h;
          steerV.y +=
            ((-sp.stiffness * (pan.y - steer.y) - sp.damping * steerV.y) /
              sp.mass) *
            h;
          pan.x += steerV.x * h;
          pan.y += steerV.y * h;
        }
        if (
          Math.hypot(pan.x - steer.x, pan.y - steer.y) < 0.3 &&
          Math.hypot(steerV.x, steerV.y) < 4
        ) {
          pan.x = steer.x;
          pan.y = steer.y;
          steer = null;
          steerV.x = 0;
          steerV.y = 0;
        }
      } else {
        const tau = lerp(0.95, 0.14, clamp01(c.friction));
        const k = Math.exp(-dt / tau);
        pan.x += vel.x * tau * (1 - k);
        pan.y += vel.y * tau * (1 - k);
        vel.x *= k;
        vel.y *= k;
        if (Math.hypot(vel.x, vel.y) < 6) {
          vel.x = 0;
          vel.y = 0;
        }
      }
    }
    // The lean reads the wall's actual speed, smoothed over ~60ms.
    const ix = (pan.x - lastPan.x) / dt;
    const iy = (pan.y - lastPan.y) / dt;
    lastPan = { x: pan.x, y: pan.y };
    const a = 1 - Math.exp(-dt / 0.06);
    seen.x += (ix - seen.x) * a;
    seen.y += (iy - seen.y) * a;
    const still = settleFollowers(dt);
    const leaning = Math.hypot(seen.x, seen.y) > 8;
    writeAll();
    const busy =
      dragging ||
      steer !== null ||
      vel.x !== 0 ||
      vel.y !== 0 ||
      !still ||
      leaning;
    if (busy) {
      frame = window.requestAnimationFrame(tick);
    } else {
      seen.x = 0;
      seen.y = 0;
      writePlane();
      last = 0;
      if (moving) {
        moving = false;
        onSettle();
      }
    }
  };

  const kick = () => {
    moving = true;
    if (disposed || frame || !visible() || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  return {
    configure(next, nextDesigns, nextWidth) {
      cfg = next;
      designs = nextDesigns;
      width = nextWidth;
      const cols = clamp(Math.round(next.columns), 2, 6);
      colW = Math.max(1, (width - next.gap * (cols - 1)) / cols);
      pitch = colW + next.gap;
      if (!next.motionSafe) {
        vel.x = 0;
        vel.y = 0;
      }
      writeAll();
    },
    refresh() {
      tiles.clear();
      for (const el of plane.querySelectorAll<HTMLElement>("[data-tile]")) {
        const j = Number(el.getAttribute("data-col"));
        const t = Number(el.getAttribute("data-tile"));
        if (!Number.isFinite(j) || !Number.isFinite(t)) continue;
        const tile = { el, j, t };
        tiles.set(`${j}:${t}`, tile);
        if (!followers.has(j)) followers.set(j, { y: pan.y, v: 0 });
        place(tile);
      }
      // Columns that left keep no spring; ones that stay keep their lag.
      for (const j of [...followers.keys()]) {
        if (j < range[0] - 1 || j > range[1] + 1) followers.delete(j);
      }
    },
    grab(x) {
      dragging = true;
      steer = null;
      vel.x = 0;
      vel.y = 0;
      grabbed.x = pan.x;
      grabbed.y = pan.y;
      anchor = x;
      kick();
    },
    drag(dx, dy) {
      pan.x = grabbed.x + dx;
      pan.y = grabbed.y + dy;
      kick();
    },
    drop(vx, vy) {
      dragging = false;
      if (cfg?.motionSafe) {
        vel.x = clamp(vx, -5000, 5000);
        vel.y = clamp(vy, -5000, 5000);
      }
      kick();
    },
    pan(dx, dy, origin) {
      const c = cfg;
      if (!c) return;
      anchor = width / 2;
      const base = steer ?? { x: pan.x, y: pan.y };
      const target = origin
        ? { x: 0, y: 0 }
        : { x: base.x + dx, y: base.y + dy };
      vel.x = 0;
      vel.y = 0;
      if (!c.motionSafe) {
        pan.x = target.x;
        pan.y = target.y;
        steer = null;
        for (const f of followers.values()) {
          f.y = pan.y;
          f.v = 0;
        }
        writeAll();
        moving = true;
        kick();
        return;
      }
      steer = target;
      kick();
    },
    centre() {
      const c = cfg;
      if (!c) return null;
      let best: { j: number; t: number; picture: number } | null = null;
      let gap = Infinity;
      const cx = width / 2;
      const cy = c.height / 2;
      for (const tile of tiles.values()) {
        const d = designs[mod(tile.j, DESIGNS)];
        if (!d) continue;
        const rect = tile.el.getBoundingClientRect();
        const root = plane.parentElement?.getBoundingClientRect();
        if (!root) continue;
        const x = rect.left - root.left + rect.width / 2;
        const y = rect.top - root.top + rect.height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < gap) {
          gap = dist;
          best = { j: tile.j, t: tile.t, picture: d.pictures[tile.t] ?? 0 };
        }
      }
      for (const tile of tiles.values()) {
        const on = best !== null && tile.j === best.j && tile.t === best.t;
        if (on) tile.el.setAttribute("data-centre", "");
        else tile.el.removeAttribute("data-centre");
      }
      return best;
    },
    rectOf(j, t) {
      return tiles.get(`${j}:${t}`)?.el.getBoundingClientRect() ?? null;
    },
    wake() {
      writeAll();
      if (moving) kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/* -------------------------------- lightbox ------------------------------- */

type Rect = { x: number; y: number; w: number; h: number };

type LightboxProps = {
  item: WrapWallItem | undefined;
  picture: number;
  from: Rect;
  to: Rect;
  motionSafe: boolean;
  titleId: string;
  onClose: () => void;
};

/**
 * The open picture. It grows from its tile to its place on springs.glide (as
 * one transform, so the art is never re-laid out) and, told to leave, shrinks
 * back into the tile before it unmounts. Under reduced motion it fades.
 */
function Lightbox({
  item,
  picture,
  from,
  to,
  motionSafe,
  titleId,
  onClose,
}: LightboxProps) {
  const [present, safeToRemove] = usePresence();
  const grow = useMotionValue(motionSafe ? 0 : 1);
  const fade = useMotionValue(0);
  const x = useTransform(grow, (g) => r2(lerp(from.x, to.x, g)));
  const y = useTransform(grow, (g) => r2(lerp(from.y, to.y, g)));
  const sx = useTransform(grow, (g) => r3(lerp(from.w / to.w, 1, g)));
  const sy = useTransform(grow, (g) => r3(lerp(from.h / to.h, 1, g)));
  const closeRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (present) {
      const a = motionSafe ? animate(grow, 1, springs.glide) : null;
      const b = animate(fade, 1, {
        duration: motionSafe ? durations.base : durations.slow,
        ease: easings.enter,
      });
      return () => {
        a?.stop();
        b.stop();
      };
    }
    const a = motionSafe ? animate(grow, 0, springs.glide) : null;
    const b = animate(fade, 0, {
      duration: motionSafe ? durations.slow : durations.base,
      ease: easings.exit,
    });
    void Promise.all([a, b]).then(() => safeToRemove?.());
    return () => {
      a?.stop();
      b.stop();
    };
  }, [fade, grow, motionSafe, present, safeToRemove]);

  // Focus arrives with the close button.
  const [closeNode, setCloseNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  React.useEffect(() => {
    closeNode?.focus();
  }, [closeNode]);
  const bindClose = React.useCallback((node: HTMLButtonElement | null) => {
    closeRef.current = node;
    setCloseNode(node);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === "Tab") {
      // One control inside: focus stays on it.
      event.preventDefault();
      closeRef.current?.focus();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className={cn("absolute inset-0 z-10", !present && "pointer-events-none")}
    >
      <motion.div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-background/80"
        style={{ opacity: fade }}
      />
      <motion.div
        className="absolute top-0 left-0 overflow-clip rounded-3 bg-muted shadow-lg"
        style={{
          width: to.w,
          height: to.h,
          originX: 0,
          originY: 0,
          x,
          y,
          scaleX: sx,
          scaleY: sy,
          opacity: motionSafe ? 1 : fade,
        }}
      >
        {item?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt={item.alt}
            draggable={false}
            className="block size-full object-cover"
          />
        ) : item ? (
          <div role="img" aria-label={item.alt} className="size-full">
            <Picture item={item} index={picture} />
          </div>
        ) : null}
      </motion.div>
      <motion.div
        className="absolute inset-x-4 bottom-3 flex items-center justify-between gap-3"
        style={{ opacity: fade }}
      >
        <p
          id={titleId}
          className="min-w-0 truncate text-sm font-medium text-foreground"
        >
          {item?.caption ?? item?.alt}
        </p>
        <button
          ref={bindClose}
          type="button"
          onClick={onClose}
          aria-label="Close picture"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline bg-card text-foreground outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <X aria-hidden className="size-4" />
        </button>
      </motion.div>
    </div>
  );
}

/* ------------------------------- component ------------------------------- */

/**
 * An endless wall of pictures: columns of seeded tiles that start at their own
 * heights and wrap in every direction. Drag it anywhere and it follows 1:1;
 * throw it and it coasts by `friction`, leaning with its speed. Every column
 * trails the hand on its own spring — stiffer near the column you hold, softer
 * further away — so the wall bends round your hand and ripples straight as it
 * slows. Enter or a click opens the picture nearest the centre: it grows from
 * its tile to fill the frame on springs.glide while the wall dims, and Escape
 * shrinks it home. Arrow keys pan a column or a row on glide. Under reduced
 * motion the wall pans 1:1 with no coast, lean or ripple, keys jump and a
 * picture fades in where it opens.
 */
export function WrapWall({
  items = defaultWrapWallItems,
  value,
  defaultValue = null,
  onValueChange,
  columns = 4,
  skew = 5,
  friction = 0.4,
  ripple = 0.6,
  stagger = 0.6,
  gap = 10,
  height = 440,
  seed = 2,
  onCentreChange,
  label = "Pictures",
  disabled = false,
  className,
}: WrapWallProps) {
  const motionSafe = useMotionSafe();
  const list = items.length > 0 ? items : defaultWrapWallItems;
  const M = list.length;
  const cols = clamp(Math.round(columns), 2, 6);
  const gapPx = clamp(gap, 0, 40);
  const hintId = React.useId();
  const titleId = React.useId();

  const [own, setOwn] = React.useState<number | null>(defaultValue);
  const rawOpen = value === undefined ? own : value;
  const openIndex =
    rawOpen === null || !Number.isFinite(rawOpen) ? null : mod(rawOpen, M);
  const [width, setWidth] = React.useState(0);
  const [range, setRange] = React.useState<[number, number]>([0, cols - 1]);
  const [said, setSaid] = React.useState("");
  /** Where the open picture grew from, when a tile was the one opened. */
  const [origin, setOrigin] = React.useState<{
    picture: number;
    from: Rect;
    aspect: number;
  } | null>(null);

  // Enough tiles per column to wrap with no gap: for the measured width, and
  // before that for the narrowest plate, so the very first frame is full.
  const colGuess =
    width > 0
      ? (width - gapPx * (cols - 1)) / cols
      : (258 - gapPx * (cols - 1)) / cols;
  const count = clamp(
    Math.ceil((height + colGuess * 1.7 + gapPx) / (colGuess * 0.72 + gapPx)) +
      1,
    3,
    24,
  );
  const designs = React.useMemo(
    () =>
      Array.from({ length: DESIGNS }, (_, l) =>
        designColumn(l, count, M, stagger, Math.round(seed) * 7919 + 17),
      ),
    [M, count, seed, stagger],
  );

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const planeRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const focused = React.useRef(false);
  const config: Config = {
    columns: cols,
    skew,
    friction,
    ripple,
    gap: gapPx,
    height,
    motionSafe,
  };
  const latest = React.useRef({ config, designs, width, list, onCentreChange });
  React.useEffect(() => {
    latest.current = { config, designs, width, list, onCentreChange };
    engine.current?.configure(config, designs, width);
  });
  // New tiles are placed before they paint.
  React.useLayoutEffect(() => {
    engine.current?.refresh();
  });

  React.useEffect(() => {
    const plane = planeRef.current;
    if (!plane) return;
    const e = createEngine(
      plane,
      () => visible.current,
      (from, to) => setRange([from, to]),
      () => {
        const c = engine.current?.centre();
        if (!c) return;
        latest.current.onCentreChange?.(c.picture);
        if (focused.current) {
          const item = latest.current.list[c.picture];
          setSaid(
            `Centre: ${item?.caption ?? item?.alt ?? ""}. Enter opens it.`,
          );
        }
      },
    );
    engine.current = e;
    const { config: c, designs: d, width: w } = latest.current;
    e.configure(c, d, w);
    e.refresh();
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const bindViewport = React.useCallback((node: HTMLDivElement | null) => {
    viewportRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => setWidth(node.clientWidth));
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* ------------------------------ opening ------------------------------ */

  const commitOpen = (next: number | null) => {
    const item = next === null ? undefined : list[next];
    setSaid(
      next === null
        ? "Back to the wall."
        : `${item?.caption ?? item?.alt ?? ""}, open.`,
    );
    if (next === openIndex) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const openTile = (j: number, t: number) => {
    const d = designs[mod(j, DESIGNS)];
    const rect = engine.current?.rectOf(j, t);
    const root = viewportRef.current?.getBoundingClientRect();
    if (!d) return;
    const picture = d.pictures[t] ?? 0;
    setOrigin({
      picture,
      aspect: d.aspects[t] ?? 1,
      from:
        rect && root
          ? {
              x: rect.left - root.left,
              y: rect.top - root.top,
              w: rect.width,
              h: rect.height,
            }
          : { x: 0, y: 0, w: 1, h: 1 },
    });
    commitOpen(picture);
  };

  // Focus goes back to the wall once it is no longer inert.
  const restore = React.useRef(false);
  const close = () => {
    restore.current = true;
    commitOpen(null);
  };
  React.useEffect(() => {
    if (openIndex !== null || !restore.current) return;
    restore.current = false;
    const node = viewportRef.current;
    if (node?.isConnected) node.focus();
  }, [openIndex]);

  const frameW = width > 0 ? width : 720;
  const fit = (aspect: number): Rect => {
    const pad = 16;
    const caption = 44;
    let w = frameW - pad * 2;
    let h = w * aspect;
    if (h > height - pad * 2 - caption) {
      h = height - pad * 2 - caption;
      w = h / aspect;
    }
    return { x: (frameW - w) / 2, y: (height - caption - h) / 2, w, h };
  };
  const shownOrigin =
    openIndex !== null && origin?.picture === openIndex ? origin : null;
  const openAspect = shownOrigin?.aspect ?? 0.75;
  const openTo = fit(openAspect);
  const openFrom: Rect = shownOrigin?.from ?? {
    x: openTo.x + openTo.w * 0.3,
    y: openTo.y + openTo.h * 0.3,
    w: openTo.w * 0.4,
    h: openTo.h * 0.4,
  };

  /* ------------------------------ gestures ----------------------------- */

  const local = (clientX: number) =>
    clientX - (viewportRef.current?.getBoundingClientRect().left ?? 0);

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || openIndex !== null,
    onStart: ({ point, offset }) =>
      engine.current?.grab(local(point.x - offset.x)),
    onMove: ({ offset }) => engine.current?.drag(offset.x, offset.y),
    onEnd: ({ velocity }) => engine.current?.drop(velocity.x, velocity.y),
    onCancel: () => engine.current?.drop(0, 0),
    onTap: (event) => {
      const tile = (event.target as Element).closest?.("[data-tile]");
      if (!tile) return;
      const j = Number(tile.getAttribute("data-col"));
      const t = Number(tile.getAttribute("data-tile"));
      if (Number.isFinite(j) && Number.isFinite(t)) openTile(j, t);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || openIndex !== null) return;
    const w = viewportRef.current?.clientWidth ?? 0;
    const pitch = (w - gapPx * (cols - 1)) / cols + gapPx;
    const row = pitch * 0.9;
    const e = engine.current;
    switch (event.key) {
      case "ArrowLeft":
        e?.pan(pitch, 0);
        break;
      case "ArrowRight":
        e?.pan(-pitch, 0);
        break;
      case "ArrowUp":
        e?.pan(0, row);
        break;
      case "ArrowDown":
        e?.pan(0, -row);
        break;
      case "PageUp":
        e?.pan(0, height * 0.8);
        break;
      case "PageDown":
        e?.pan(0, -height * 0.8);
        break;
      case "Home":
        e?.pan(0, 0, true);
        break;
      case "Enter":
      case " ": {
        const c = e?.centre();
        if (c) openTile(c.j, c.t);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  };

  /* ------------------------------- render ------------------------------ */

  const colW = `((100cqw - ${gapPx * (cols - 1)}px) / ${cols})`;
  const columnsOut: React.ReactNode[] = [];
  for (let j = range[0]; j <= range[1]; j += 1) {
    const d = designs[mod(j, DESIGNS)];
    if (!d) continue;
    const tops = d.aspects.reduce<number[]>(
      (out, a, t) => [
        ...out,
        (out[t - 1] ?? -d.lead) + (t ? (d.aspects[t - 1] ?? 0) : 0),
      ],
      [],
    );
    columnsOut.push(
      <div
        key={j}
        className="absolute top-0"
        style={{
          left: `calc(${j} * (${colW} + ${gapPx}px))`,
          width: `calc${colW}`,
        }}
      >
        {d.aspects.map((a, t) => {
          const top = tops[t] ?? 0;
          const picture = d.pictures[t] ?? 0;
          const item = list[picture];
          return (
            <div
              key={t}
              data-col={j}
              data-tile={t}
              className={cn(
                "absolute inset-x-0 overflow-clip rounded-2 bg-muted",
                "group-focus-visible/wrap-wall:data-[centre]:outline-2 group-focus-visible/wrap-wall:data-[centre]:outline-offset-2 group-focus-visible/wrap-wall:data-[centre]:outline-ring group-focus-visible/wrap-wall:data-[centre]:outline-solid",
              )}
              style={{
                top: `calc(${r3(top)} * ${colW} + ${t * gapPx}px)`,
                aspectRatio: `1 / ${a}`,
              }}
            >
              {item ? <Picture item={item} index={picture} /> : null}
            </div>
          );
        })}
      </div>,
    );
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-clip rounded-4 bg-surface-1 select-none",
        disabled && "opacity-60",
        className,
      )}
      style={{ height }}
    >
      <div
        ref={bindViewport}
        role="region"
        aria-roledescription="wall"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hintId}
        inert={openIndex !== null}
        onKeyDown={onKeyDown}
        onFocus={() => {
          focused.current = true;
          engine.current?.centre();
        }}
        onBlur={() => {
          focused.current = false;
        }}
        {...drag}
        className={cn(
          "group/wrap-wall [container-type:inline-size] absolute inset-0 rounded-4 outline-none",
          !disabled && "cursor-grab touch-none active:cursor-grabbing",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      >
        <div
          ref={planeRef}
          aria-hidden
          className="absolute inset-0 will-change-transform"
        >
          {columnsOut}
        </div>
      </div>
      <AnimatePresence>
        {openIndex !== null ? (
          <Lightbox
            key={openIndex}
            item={list[openIndex]}
            picture={openIndex}
            from={openFrom}
            to={openTo}
            motionSafe={motionSafe}
            titleId={titleId}
            onClose={close}
          />
        ) : null}
      </AnimatePresence>
      <span id={hintId} className="sr-only">
        Drag or throw the wall, or use the arrow keys to pan it; Page Up and
        Page Down move a screen, Home goes back to the start. Enter opens the
        picture nearest the centre.
      </span>
      <ul className="sr-only">
        {list.map((item, i) => (
          <li key={i}>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                setOrigin(null);
                commitOpen(i);
              }}
            >
              {`Open ${item.caption ?? item.alt}`}
            </button>
          </li>
        ))}
      </ul>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
