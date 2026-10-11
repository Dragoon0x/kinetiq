"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { project, useDrag, wheelPixels } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PaternosterCabinTone = "brass" | "oak" | "steel" | "enamel";

export type PaternosterCard = {
  /** The card's name, printed large when it swings out. */
  title: string;
  /** A short line above the title, e.g. "Floor 3 · Long gallery". */
  kicker?: string;
  /** A sentence or two of detail, shown at the landing. */
  detail?: string;
  /** A small mono reading at the foot of the card, e.g. "311 volumes". */
  meta?: string;
  /** A picture for the card's head. Without one, `art` or a drawn motif is used. */
  src?: string;
  /** Describes the picture. Defaults to the title. */
  alt?: string;
  /** Your own art for the card's head (fills a 2:1 box). */
  art?: React.ReactNode;
  /** Makes the open card's foot a real link. */
  href?: string;
};

export type PaternosterCardsProps = {
  /** The cards riding the lift. @default defaultPaternosterCards */
  items?: PaternosterCard[];
  /** Controlled: the card at the landing (0 is the first). */
  value?: number;
  /** Initial card at the landing when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires as a new card reaches the landing — from the run, a drag, a key or a click. */
  onValueChange?: (index: number) => void;
  /** Controlled: the landing card is held out and the chain stopped. */
  held?: boolean;
  /** Initial held state when uncontrolled. @default false */
  defaultHeld?: boolean;
  /** Fires from the press, key or click that held or released the landing card. */
  onHeldChange?: (held: boolean) => void;
  /** Gap between one cabin and the next, px; the cabins take the rest of the pitch. @default 16 */
  spacing?: number;
  /** How fast the chain runs by itself, 0 to 2; 0 leaves it still. @default 0.6 */
  speed?: number;
  /** How much the chain slows while a cabin is level with the landing, 0 to 1. @default 0.75 */
  dwell?: number;
  /** The cabins' material. @default "brass" */
  cabinTone?: PaternosterCabinTone;
  /** The landing's height, as a fraction of the frame from the top. @default 0.55 */
  landing?: number;
  /** Run the chain the other way: down the left shaft, up the right. @default false */
  reverse?: boolean;
  /** Stops the run without touching the visitor's own stop button. @default false */
  paused?: boolean;
  /** A pointer over the lift, or focus inside it, stops the run so a card can be read. @default true */
  pauseOnHover?: boolean;
  /** The wheel drives the chain once the visitor has rested on, clicked or tabbed into the lift. @default true */
  wheel?: boolean;
  /** The landing lamp's colour; it is used as a pigment, so any token reads in both themes. @default "var(--warn)" */
  lampColor?: string;
  /** Height of the lift, px. @default 520 */
  height?: number;
  /** The lift's accessible name. @default "Lift" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- constants ------------------------------- */

/** The card's body under its art, px: kicker, title, three lines, meta. */
const CARD_BODY = 156;
/** The ground floor at the foot of the frame, px: the cabins go under it. */
const FLOOR = 30;
/** A cabin counts as "at the landing" within this fraction of a pitch. */
const OPEN_WINDOW = 0.28;
/** Seconds per cabin at speed 1, including the dwell. */
const SECONDS_PER_CABIN = 2.6;
/** How much smaller a cabin is at the top of the turn, set back in the machine room. */
const RECEDE = 0.3;
/** After a visitor moves the chain, the run waits this long before carrying on. */
const RESUME_MS = 2600;
/** How long the pointer rests on the lift before the wheel is taken. */
const HOVER_INTENT_MS = 350;
/** A wheel event this long after the last one starts a new gesture. */
const WHEEL_BURST_MS = 220;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** The signed distance from `a` to the nearest multiple of `n`, in [-n/2, n/2). */
const wrapNear = (a: number, n: number) => mod(a + n / 2, n) - n / 2;

const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${r3(l)} ${r3(c)} ${dh ? `calc(h + ${r3(dh)})` : "h"})`;

type Tone = { frame: string; inner: string; edge: string };

const TONES: Record<PaternosterCabinTone, Tone> = {
  brass: {
    frame: pig("--warn", 0.7, 0.1),
    inner: pig("--warn", 0.4, 0.045),
    edge: pig("--warn", 0.86, 0.08),
  },
  oak: {
    frame: pig("--warn", 0.55, 0.075, -22),
    inner: pig("--warn", 0.3, 0.035, -22),
    edge: pig("--warn", 0.72, 0.06, -22),
  },
  steel: {
    frame: pig("--accent", 0.7, 0.018),
    inner: pig("--accent", 0.3, 0.014),
    edge: pig("--accent", 0.88, 0.012),
  },
  enamel: {
    frame: pig("--signal", 0.64, 0.06),
    inner: pig("--signal", 0.3, 0.025),
    edge: pig("--signal", 0.84, 0.05),
  },
};

/* ------------------------------- geometry -------------------------------- */

type Geo = {
  w: number;
  h: number;
  liftL: number;
  liftW: number;
  pillarW: number;
  shaftW: number;
  cw: number;
  ch: number;
  /** Shaft centres and the lift's centre line. */
  xL: number;
  xR: number;
  cx: number;
  /** Radius of the turn over the top (and under the floor). */
  d: number;
  /** Cabin pitch along the chain. */
  p: number;
  /** Where the straights meet the turns. */
  yT: number;
  yB: number;
  /** Straight length, whole chain length, cabins on the chain. */
  s: number;
  len: number;
  nc: number;
  landY: number;
  uLand: number;
  cardW: number;
  cardH: number;
  artH: number;
  /** The card's scale standing in its cabin. */
  tuck: number;
};

/**
 * Lays the lift out in its box. The chain is longer than the frame: the
 * turn under the floor is always out of sight, so the loop can carry any
 * number of cabins at the asked spacing without ever showing a seam. Cards
 * repeat round a chain that needs more cabins than there are cards.
 */
function geometry(
  width: number,
  height: number,
  count: number,
  spacing: number,
  landing: number,
): Geo {
  const w = Math.max(200, Math.round(width));
  const h = Math.max(300, Math.round(height));
  const liftW = Math.min(w, 420);
  const liftL = (w - liftW) / 2;
  const pad = 10;
  const pillarW = clamp(Math.round(liftW * 0.16), 40, 60);
  const shaftW = (liftW - 2 * pad - pillarW) / 2;
  const cw = shaftW - 10;
  const xL = liftL + pad + shaftW / 2;
  const xR = liftL + liftW - pad - shaftW / 2;
  const cx = liftL + liftW / 2;
  const d = (xR - xL) / 2;
  // Cabins keep their shape; spacing is the gap between them. Over the top
  // they recede into the machine room (see RECEDE), so a close pitch passes
  // one cabin behind the next instead of through it.
  const gap = clamp(spacing, 0, 80);
  const ch = Math.round(cw * 0.86);
  const p = ch + gap;
  const yT = 10 + d + (ch * (1 - RECEDE)) / 2;
  // The open card leaves the shafts' edges showing, so it reads as having
  // come out of the lift rather than covering it.
  const cardW = Math.round(Math.min(w * 0.86, 290));
  const artH = Math.round(cardW * 0.5);
  const cardH = artH + CARD_BODY;
  const lo = Math.max(yT + 2, cardH / 2 + 8);
  const hi = h - FLOOR - cardH / 2 - 6;
  const landY = Math.round(Math.min(hi, Math.max(lo, h * clamp01(landing))));
  const need = 2 * (h + ch / 2 + d + 6 - yT) + 2 * Math.PI * d;
  const n = Math.max(1, count);
  const nc = n * Math.max(1, Math.ceil(need / (n * p)));
  const len = nc * p;
  const s = (len - 2 * Math.PI * d) / 2;
  const yB = yT + s;
  // A card stands in its cabin with room around it, like a postcard in a box.
  const tuck = 0.8 * Math.min((cw - 14) / cardW, (ch - 14) / cardH);
  return {
    w,
    h,
    liftL,
    liftW,
    pillarW,
    shaftW,
    cw,
    ch,
    xL,
    xR,
    cx,
    d,
    p,
    yT,
    yB,
    s,
    len,
    nc,
    landY,
    uLand: yB - landY,
    cardW,
    cardH,
    artH,
    tuck,
  };
}

/** Distance along the chain of cabin `j` when the chain reads `c`. */
const along = (g: Geo, c: number, j: number) =>
  mod(g.uLand + (c - j) * g.p, g.len);

/**
 * A point on the loop: up the left straight, over the top on a half circle,
 * down the right straight and back under the floor. Cabins hang from the
 * chain, so they never rotate — only their centre follows the path.
 */
function pathX(g: Geo, u: number): number {
  if (u < g.s) return g.xL;
  const top = u - g.s;
  if (top < Math.PI * g.d) return g.cx - g.d * Math.cos(top / g.d);
  const down = top - Math.PI * g.d;
  if (down < g.s) return g.xR;
  return g.cx + g.d * Math.cos((down - g.s) / g.d);
}

/** How far into the machine room a cabin is: 0 in the shafts, 1 at the top of the turn. */
function topDepth(g: Geo, u: number): number {
  const top = u - g.s;
  if (top <= 0 || top >= Math.PI * g.d) return 0;
  return Math.sin(top / g.d);
}

function pathY(g: Geo, u: number): number {
  if (u < g.s) return g.yB - u;
  const top = u - g.s;
  if (top < Math.PI * g.d) return g.yT - g.d * Math.sin(top / g.d);
  const down = top - Math.PI * g.d;
  if (down < g.s) return g.yT + down;
  return g.yB + g.d * Math.sin((down - g.s) / g.d);
}

/* ---------------------------------- art ---------------------------------- */

/** Eight drawn motifs, one per collection; they repeat past eight. */
function CardArt({ motif }: { motif: number }) {
  const m = mod(motif, 8);
  const common = {
    viewBox: "0 0 200 100",
    preserveAspectRatio: "xMidYMid slice",
    className: "block size-full",
    "aria-hidden": true,
  } as const;
  if (m === 0) {
    const line = pig("--signal", 0.48, 0.07);
    return (
      <svg {...common}>
        <rect
          width="200"
          height="100"
          style={{ fill: pig("--signal", 0.93, 0.03) }}
        />
        {[0, 1, 2, 3, 4].map((k) => (
          <ellipse
            key={k}
            cx={92 + k * 3}
            cy={52 - k * 2}
            rx={70 - k * 13}
            ry={36 - k * 7}
            fill="none"
            style={{ stroke: line }}
            strokeWidth="1.2"
            opacity={r2(0.45 + k * 0.12)}
            transform={`rotate(${-8 + k * 4} 100 50)`}
          />
        ))}
        <path
          d="M0 78 C40 70 60 92 110 84 S170 70 200 76"
          fill="none"
          style={{ stroke: line }}
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <path
          d="M150 22 l7 12 h-14 z"
          style={{ fill: pig("--danger", 0.62, 0.15) }}
        />
      </svg>
    );
  }
  if (m === 1) {
    const leaf = pig("--success", 0.55, 0.09);
    return (
      <svg {...common}>
        <rect
          width="200"
          height="100"
          style={{ fill: pig("--warn", 0.95, 0.025) }}
        />
        <path
          d="M70 96 C84 70 100 46 124 20"
          fill="none"
          style={{ stroke: leaf }}
          strokeWidth="2"
        />
        {[
          [84, 72, -40],
          [96, 56, 30],
          [106, 44, -50],
          [116, 32, 20],
          [90, 64, 150],
        ].map(([x, y, a], k) => (
          <ellipse
            key={k}
            cx={x}
            cy={y}
            rx="13"
            ry="5"
            transform={`rotate(${a} ${x} ${y})`}
            style={{ fill: leaf }}
            opacity={0.85}
          />
        ))}
        <circle
          cx="125"
          cy="19"
          r="7"
          style={{ fill: pig("--danger", 0.7, 0.13) }}
        />
        <circle
          cx="125"
          cy="19"
          r="2.5"
          style={{ fill: pig("--warn", 0.85, 0.12) }}
        />
        <path
          d="M150 80 h34 M150 86 h24"
          style={{ stroke: pig("--warn", 0.55, 0.04) }}
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  if (m === 2) {
    const sea = pig("--accent", 0.45, 0.08);
    return (
      <svg {...common}>
        <rect
          width="200"
          height="100"
          style={{ fill: pig("--accent", 0.9, 0.035) }}
        />
        <rect
          y="58"
          width="200"
          height="42"
          style={{ fill: pig("--accent", 0.8, 0.05) }}
        />
        {[64, 74, 84, 94].map((y, k) => (
          <path
            key={y}
            d={`M-10 ${y} q 12 -5 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0 t 24 0`}
            fill="none"
            style={{ stroke: sea }}
            strokeWidth="1.2"
            opacity={r2(0.4 + k * 0.15)}
          />
        ))}
        <path
          d="M120 56 L120 22 L140 52 Z"
          style={{ fill: pig("--warn", 0.97, 0.02) }}
        />
        <path
          d="M118 56 L114 30 L104 54 Z"
          style={{ fill: pig("--warn", 0.9, 0.04) }}
        />
        <path
          d="M100 57 h40 l-6 5 h-30 z"
          style={{ fill: pig("--accent", 0.35, 0.06) }}
        />
        <circle
          cx="44"
          cy="26"
          r="9"
          style={{ fill: pig("--warn", 0.86, 0.1) }}
        />
      </svg>
    );
  }
  if (m === 3) {
    const lineC = pig("--accent", 0.92, 0.03);
    return (
      <svg {...common}>
        <rect
          width="200"
          height="100"
          style={{ fill: pig("--accent", 0.42, 0.11) }}
        />
        {Array.from({ length: 11 }, (_, k) => (
          <path
            key={k}
            d={`M${k * 20} 0 V100`}
            style={{ stroke: pig("--accent", 0.55, 0.1) }}
            strokeWidth="0.6"
          />
        ))}
        {Array.from({ length: 6 }, (_, k) => (
          <path
            key={k}
            d={`M0 ${k * 20} H200`}
            style={{ stroke: pig("--accent", 0.55, 0.1) }}
            strokeWidth="0.6"
          />
        ))}
        {Array.from({ length: 8 }, (_, k) => (
          <rect
            key={k}
            x="96"
            y="20"
            width="8"
            height="10"
            rx="1"
            transform={`rotate(${k * 45} 100 50)`}
            fill="none"
            style={{ stroke: lineC }}
            strokeWidth="1.2"
          />
        ))}
        <circle
          cx="100"
          cy="50"
          r="21"
          fill="none"
          style={{ stroke: lineC }}
          strokeWidth="1.4"
        />
        <circle
          cx="100"
          cy="50"
          r="6"
          fill="none"
          style={{ stroke: lineC }}
          strokeWidth="1.2"
        />
        <path
          d="M128 50 h48 M176 46 v8 M24 80 h44"
          style={{ stroke: lineC }}
          strokeWidth="1"
        />
      </svg>
    );
  }
  if (m === 4) {
    const ink = pig("--accent", 0.36, 0.04);
    return (
      <svg {...common}>
        <rect
          width="200"
          height="100"
          style={{ fill: pig("--danger", 0.93, 0.025) }}
        />
        <rect
          x="128"
          y="16"
          width="44"
          height="52"
          rx="2"
          style={{ fill: pig("--warn", 0.98, 0.01) }}
        />
        <rect
          x="133"
          y="21"
          width="34"
          height="42"
          style={{ fill: pig("--danger", 0.62, 0.14) }}
        />
        <path
          d="M138 52 l9 -14 l7 9 l5 -6 l8 11 z"
          style={{ fill: pig("--warn", 0.86, 0.1) }}
        />
        {[0, 1, 2].map((k) => (
          <circle
            key={k}
            cx="112"
            cy="58"
            r={10 + k * 6}
            fill="none"
            style={{ stroke: ink }}
            strokeWidth="1"
            opacity={0.6}
          />
        ))}
        <path
          d="M20 40 h70 M20 52 h58 M20 64 h64"
          style={{ stroke: ink }}
          strokeWidth="1.2"
          opacity={0.55}
        />
      </svg>
    );
  }
  if (m === 5) {
    const rule = pig("--accent", 0.74, 0.05);
    return (
      <svg {...common}>
        <rect
          width="200"
          height="100"
          style={{ fill: pig("--warn", 0.93, 0.04) }}
        />
        {[18, 30, 42, 54, 66, 78, 90].map((y) => (
          <path
            key={y}
            d={`M0 ${y} H200`}
            style={{ stroke: rule }}
            strokeWidth="0.7"
          />
        ))}
        <path
          d="M28 0 V100"
          style={{ stroke: pig("--danger", 0.66, 0.12) }}
          strokeWidth="0.9"
        />
        <path
          d="M44 78 C64 50 80 54 96 66 S128 40 150 52 S176 70 190 62"
          fill="none"
          style={{ stroke: pig("--accent", 0.35, 0.03) }}
          strokeWidth="1.6"
        />
        <path
          d="M110 44 l4 -9 l4 9"
          fill="none"
          style={{ stroke: pig("--accent", 0.35, 0.03) }}
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  if (m === 6) {
    const iso = pig("--accent", 0.55, 0.06);
    return (
      <svg {...common}>
        <rect
          width="200"
          height="100"
          style={{ fill: pig("--accent", 0.94, 0.02) }}
        />
        {[0, 1, 2, 3].map((k) => (
          <path
            key={k}
            d={`M-10 ${30 + k * 16} C 40 ${10 + k * 18} 90 ${70 + k * 6} 210 ${24 + k * 16}`}
            fill="none"
            style={{ stroke: iso }}
            strokeWidth="1.1"
          />
        ))}
        <circle
          cx="152"
          cy="30"
          r="12"
          style={{ fill: pig("--warn", 0.82, 0.14) }}
        />
        <path
          d="M52 58 a10 10 0 0 1 18 -6 a8 8 0 0 1 14 6 z"
          style={{ fill: pig("--accent", 0.99, 0.005) }}
        />
        <text
          x="22"
          y="22"
          style={{ fill: iso }}
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          1012
        </text>
      </svg>
    );
  }
  const seed = pig("--warn", 0.52, 0.08, -24);
  return (
    <svg {...common}>
      <rect
        width="200"
        height="100"
        style={{ fill: pig("--success", 0.92, 0.03) }}
      />
      {Array.from({ length: 15 }, (_, k) => {
        const x = 30 + (k % 5) * 35;
        const y = 22 + Math.floor(k / 5) * 28;
        return (
          <ellipse
            key={k}
            cx={x}
            cy={y}
            rx="9"
            ry="5"
            transform={`rotate(${(k * 37) % 180} ${x} ${y})`}
            style={{ fill: k % 4 === 0 ? pig("--success", 0.5, 0.08) : seed }}
            opacity={0.9}
          />
        );
      })}
    </svg>
  );
}

export const defaultPaternosterCards: PaternosterCard[] = [
  {
    kicker: "Floor 1 · Map room",
    title: "Maps & charts",
    detail:
      "Coastal surveys and hand-drawn contour sheets, flat in the plan chests by the windows.",
    meta: "1,240 sheets",
  },
  {
    kicker: "Floor 2 · East wing",
    title: "Botanical plates",
    detail:
      "Pressed specimens and the plates drawn from them, 1880 to the present day.",
    meta: "862 plates",
  },
  {
    kicker: "Floor 3 · Long gallery",
    title: "Ship logs",
    detail:
      "Daily entries from the river ferries: weather, tides, passengers and coal.",
    meta: "311 volumes",
  },
  {
    kicker: "Floor 4 · Drawing office",
    title: "Patent drawings",
    detail:
      "Ink-on-linen drawings for pumps, clocks and the city's first lifts.",
    meta: "2,015 drawings",
  },
  {
    kicker: "Floor 5 · Reading room",
    title: "Postcards",
    detail:
      "Views of the harbour sent home, sorted by the year on the postmark.",
    meta: "4,480 cards",
  },
  {
    kicker: "Floor 6 · Study carrels",
    title: "Field notebooks",
    detail:
      "Survey notebooks with sketches in the margins and rain on the pages.",
    meta: "196 notebooks",
  },
  {
    kicker: "Floor 7 · Roof office",
    title: "Weather diaries",
    detail:
      "Three readings a day from the roof station, kept without a gap since 1902.",
    meta: "44,000 days",
  },
  {
    kicker: "Floor 8 · Seed vault",
    title: "Seed catalogues",
    detail:
      "Growers' lists with prices, varieties long lost and notes in pencil.",
    meta: "538 catalogues",
  },
];

/* --------------------------------- cabin --------------------------------- */

type CabinProps = {
  g: Geo;
  j: number;
  chain: MotionValue<number>;
  reach: MotionValue<number>;
  swing: MotionValue<number>;
  item: PaternosterCard;
  motif: number;
  tone: Tone;
  lamp: string;
  index: number;
  count: number;
  open: boolean;
  held: boolean;
  motionSafe: boolean;
};

/**
 * One cabin and the card standing in it, on a band of layers of their own
 * so the cabin can pass behind its neighbours as it recedes over the top. The cabin
 * follows the chain; the card is drawn in the landing's coordinates and
 * carried back to its cabin by `1 - reach`, so as `reach` rises it leaves the
 * cabin, swings square to the viewer on `swing` and grows to full size at the
 * landing.
 */
function Cabin({
  g,
  j,
  chain,
  reach,
  swing,
  item,
  motif,
  tone,
  lamp,
  index,
  count,
  open,
  held,
  motionSafe,
}: CabinProps) {
  const x = useTransform(chain, (c) => r2(pathX(g, along(g, c, j)) - g.cw / 2));
  const y = useTransform(chain, (c) => r2(pathY(g, along(g, c, j)) - g.ch / 2));
  const depth = useTransform(chain, (c) => r3(topDepth(g, along(g, c, j))));
  const size = useTransform(depth, (k) => r3(1 - RECEDE * k));
  const shade = useTransform(depth, (k) => r3(0.4 * k));
  const shown = useTransform(chain, (c) =>
    pathY(g, along(g, c, j)) - g.ch / 2 > g.h ? "hidden" : "visible",
  );
  const glow = useTransform(chain, (c) =>
    r3(clamp01(1 - Math.abs(wrapNear(c - j, g.nc)) * 2.4)),
  );
  // Each cabin owns a band of three layers (box, card, frame); cabins set
  // back in the machine room take lower bands, so they pass behind. The
  // card that is out rises over the dusk and everything else.
  const band = useTransform(depth, (k) => 30 - Math.round(k * 6) * 3);
  const backLayer = band;
  const frameLayer = useTransform(band, (b) => b + 2);
  const cardLayer = useTransform(
    [reach, band] as MotionValue<number>[],
    ([r, b]) => ((r as number) > 0.02 ? 50 : (b as number) + 1),
  );

  // Under reduced motion the card never travels: it is either in its cabin
  // or at the landing, and the change is a cross-fade.
  const pose = (r: number) => (motionSafe ? r : r > 0.5 ? 1 : 0);
  const cardX = useTransform(
    [chain, reach] as MotionValue<number>[],
    ([c, r]) =>
      r2((pathX(g, along(g, c as number, j)) - g.cx) * (1 - pose(r as number))),
  );
  const cardY = useTransform(
    [chain, reach] as MotionValue<number>[],
    ([c, r]) => {
      const u = along(g, c as number, j);
      const k = 1 - RECEDE * topDepth(g, u);
      const standY = pathY(g, u) + (g.ch / 2 - 7 - (g.cardH * g.tuck) / 2) * k;
      return r2((standY - g.landY) * (1 - pose(r as number)));
    },
  );
  const scale = useTransform(
    [reach, size] as MotionValue<number>[],
    ([r, k]) => {
      const t = pose(r as number);
      const tucked = g.tuck * (k as number);
      return r3(tucked + (1 - tucked) * t);
    },
  );
  const rotateY = useTransform(swing, (v) =>
    motionSafe ? r2(-28 * (1 - v)) : 0,
  );
  const z = useTransform(reach, (r) =>
    motionSafe ? r2(64 * Math.sin(Math.PI * clamp01(r))) : 0,
  );
  const fade = useTransform(reach, (r) =>
    motionSafe ? 1 : r3(r < 0.5 ? 1 - 2 * r : 2 * r - 1),
  );
  const shadow = useTransform(reach, (r) => {
    const k = clamp01(r);
    return k < 0.01
      ? "none"
      : `0 ${r2(14 * k)}px ${r2(36 * k)}px color-mix(in oklab, black ${Math.round(20 * k)}%, transparent)`;
  });
  const lampOn = useTransform(glow, (k) => r3(0.25 + 0.75 * k));
  const step = cascade(4);
  const line = (i: number) => (r: number) =>
    r3(clamp01((pose(r) - 0.55 - i * step * 1.4) / 0.3));
  const show0 = useTransform(reach, line(0));
  const show1 = useTransform(reach, line(1));
  const show2 = useTransform(reach, line(2));
  const show3 = useTransform(reach, line(3));

  const box = {
    x,
    y,
    scale: size,
    visibility: shown,
    width: r2(g.cw),
    height: r2(g.ch),
  };

  return (
    <>
      {/* The cabin: an open box, its lamp warming as it nears the landing. */}
      <motion.div
        aria-hidden
        data-cabin={j}
        className="absolute top-0 left-0 overflow-hidden rounded-1"
        style={{ ...box, zIndex: backLayer, background: tone.inner }}
      >
        <div
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{
            background:
              "linear-gradient(to top, color-mix(in oklab, black 30%, transparent), transparent)",
          }}
        />
        <motion.div
          className="absolute inset-0"
          style={{
            opacity: glow,
            background: `radial-gradient(120% 80% at 50% 0%, color-mix(in oklab, ${lamp} 55%, transparent), transparent 70%)`,
          }}
        />
      </motion.div>

      {/* The card, in the landing's coordinates. */}
      <motion.div
        role="group"
        aria-roledescription="slide"
        aria-label={`${index + 1} of ${count}: ${item.title}`}
        aria-hidden={!open || undefined}
        inert={!open}
        data-cabin={j}
        className={cn(
          "absolute flex flex-col overflow-hidden rounded-3 border bg-card text-left text-card-foreground",
          held ? "border-[var(--paternoster-lamp)]" : "border-hairline-strong",
        )}
        style={{
          left: r2(g.cx - g.cardW / 2),
          top: r2(g.landY - g.cardH / 2),
          width: g.cardW,
          height: g.cardH,
          x: cardX,
          y: cardY,
          z,
          scale,
          rotateY,
          transformPerspective: 900,
          opacity: fade,
          zIndex: cardLayer,
          boxShadow: shadow,
          visibility: shown,
          transformOrigin: "50% 50%",
        }}
      >
        <div
          className="relative shrink-0 overflow-hidden"
          style={{ height: g.artH }}
        >
          {item.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.src}
              alt={item.alt ?? item.title}
              draggable={false}
              className="block size-full object-cover"
            />
          ) : (
            <div
              role="img"
              aria-label={item.alt ?? item.title}
              className="size-full"
            >
              {item.art ?? <CardArt motif={motif} />}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col overflow-hidden px-3.5 pt-3 pb-3">
          <motion.p
            style={{ opacity: show0 }}
            className="truncate font-mono text-[10px] leading-[14px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {item.kicker ?? `Card ${index + 1}`}
          </motion.p>
          <p className="mt-1 truncate text-[15px] leading-5 font-semibold text-foreground">
            {item.title}
          </p>
          <motion.p
            style={{ opacity: show1 }}
            className="mt-1.5 line-clamp-3 text-xs leading-[1.45] text-ink-2"
          >
            {item.detail}
          </motion.p>
          <motion.div
            style={{ opacity: show2 }}
            className="mt-auto flex items-center justify-between gap-2 pt-2"
          >
            <span className="truncate font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
              {item.meta}
            </span>
            {item.href ? (
              <a
                href={item.href}
                className="shrink-0 rounded-1 text-xs font-medium text-cobalt-bright underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Open
              </a>
            ) : null}
            <motion.span
              style={{ opacity: show3 }}
              className={cn(
                "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 font-mono text-[9px] tracking-[0.08em] uppercase",
                held
                  ? "bg-[var(--paternoster-lamp-wash)] text-foreground"
                  : "text-ink-3",
              )}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: held ? lamp : "var(--ink-3)" }}
              />
              {held ? "Held" : "At landing"}
            </motion.span>
          </motion.div>
        </div>
      </motion.div>

      {/* The cabin's front frame, in front of the card standing inside it. */}
      <motion.div
        aria-hidden
        data-cabin={j}
        className="absolute top-0 left-0 rounded-1 border-x-[4px] border-t-[6px] border-b-[5px]"
        style={{
          ...box,
          zIndex: frameLayer,
          borderColor: tone.frame,
          boxShadow: `inset 0 1px 0 ${tone.edge}`,
        }}
      >
        <motion.span
          className="absolute inset-0 bg-black"
          style={{ opacity: shade }}
        />
        <motion.span
          className="absolute -top-[5px] left-1/2 size-1.5 -translate-x-1/2 rounded-full"
          style={{
            background: lamp,
            opacity: lampOn,
            boxShadow: `0 0 6px ${lamp}`,
          }}
        />
      </motion.div>
    </>
  );
}

/* ------------------------------ the lift --------------------------------- */

type Api = {
  onChain: (c: number) => void;
  sync: () => void;
  advance: (dt: number) => void;
  wheel: (event: WheelEvent) => void;
};

/**
 * Cards riding the open cabins of an endless lift. The chain runs by
 * itself, crawling while a cabin is level with the landing and picking up
 * between, so the rhythm is arrive, hold, leave — and it never stops and
 * never jumps: the loop is longer than the frame and turns out of sight
 * under the floor. Over the top the cabins cross on the drive wheel's half
 * circle and stay upright, as cabins hanging from a chain do.
 *
 * As a cabin reaches the landing its lamp warms and its card swings out of
 * it — the turn on `springs.snap`, so the hinge overshoots once like a door,
 * the travel and growth on `springs.glide` — and its detail prints in line by
 * line; as the cabin moves on the card tucks back on an exit tween. Openness
 * is a motion value per cabin, so a fast scrub opens and closes each card
 * cleanly and every position of the chain is a valid frame.
 *
 * Drag drives the chain 1:1 (up on the left shaft lifts it, up on the right
 * sends it back, just as the cabins move under the finger), a flick projects
 * and settles on the nearest landing on `glide` with the release velocity, and
 * the wheel drives it once the visitor has settled on the lift. Clicking a
 * cabin brings it down; clicking the landing card holds it. The lift is a
 * carousel: Up/Right bring the next cabin, Down/Left the previous, Home/End
 * the first and last card, Enter or Space hold the landing card and Escape
 * lets it go. The stop button on the ground floor stops and starts the run,
 * which also rests while the pointer or keyboard focus is on the lift. Under
 * reduced motion the chain only moves when asked and lands at once, and the
 * landing card cross-fades open in place.
 */
export function PaternosterCards({
  items = defaultPaternosterCards,
  value,
  defaultValue = 0,
  onValueChange,
  held: heldProp,
  defaultHeld = false,
  onHeldChange,
  spacing = 16,
  speed = 0.6,
  dwell = 0.75,
  cabinTone = "brass",
  landing = 0.55,
  reverse = false,
  paused = false,
  pauseOnHover = true,
  wheel = true,
  lampColor = "var(--warn)",
  height = 520,
  label = "Lift",
  disabled = false,
  className,
}: PaternosterCardsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const list = items.length > 0 ? items : defaultPaternosterCards;
  const n = list.length;

  const [width, setWidth] = React.useState(320);
  const g = React.useMemo(
    () => geometry(width, height, n, spacing, landing),
    [width, height, n, spacing, landing],
  );
  const tone = TONES[cabinTone] ?? TONES.brass;
  const lamp = `oklch(from ${lampColor} 0.84 0.13 h)`;

  const start = mod(Math.round(value ?? defaultValue), n);
  const chain = useMotionValue(start);
  const dim = useMotionValue(1);
  const dusk = useTransform(dim, (k) => r3(clamp01(k) * 0.42));
  // The chain wraps the drive wheel at the turn's radius, so the wheel turns
  // by exactly the chain's travel.
  const wheelTurn = useTransform(chain, (c) =>
    r2(mod(((c * g.p) / g.d / Math.PI) * 180, 360)),
  );
  const linkShift = useTransform(chain, (c) => r2(-mod(c * g.p, 10)));
  const drum = useTransform(chain, (c) => r2(-mod(c, n) * 18));

  const [landed, setLanded] = React.useState({
    card: start,
    cabin: mod(start, g.nc),
  });
  const [ownHeld, setOwnHeld] = React.useState(defaultHeld);
  const held = heldProp ?? ownHeld;
  const [stopped, setStopped] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  // One reach (glide) and one swing (snap) per cabin. The cabin at the
  // landing starts open, so the server's frame is the finished picture.
  const cabins = React.useMemo(() => {
    const at = mod(Math.round(chain.get()), g.nc);
    return Array.from({ length: g.nc }, (_, j) => ({
      reach: motionValue(j === at ? 1 : 0),
      swing: motionValue(j === at ? 1 : 0),
    }));
  }, [g.nc, chain]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const api = React.useRef<Api | null>(null);
  const raf = React.useRef<number | null>(null);
  const lastT = React.useRef<number | null>(null);
  const settling = React.useRef<AnimationPlaybackControls | null>(null);
  const target = React.useRef(start);
  const openCab = React.useRef(-2);
  const openAnims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const landedRef = React.useRef(start);
  const reported = React.useRef<number | null>(null);
  const visitor = React.useRef(false);
  const dragSign = React.useRef(1);
  const dragFrom = React.useRef(0);
  const dragAxis = React.useRef<"x" | "y">("y");
  const resumeTimer = React.useRef<number | null>(null);
  const wheelTimer = React.useRef<number | null>(null);
  const state = React.useRef({
    hovered: false,
    hoverSince: 0,
    focused: false,
    inView: true,
    visible: true,
    dragging: false,
    idleUntil: 0,
    lastWheel: 0,
    wheelTaken: false,
  });

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const setHeld = (next: boolean) => {
    if (next === held) return;
    if (heldProp === undefined) setOwnHeld(next);
    onHeldChange?.(next);
    const item = list[landedRef.current];
    say(next ? `${item?.title ?? "Card"} held at the landing.` : "Released.");
  };

  /* ------------------------------ motion ------------------------------- */

  const runOpen = (key: string, controls: AnimationPlaybackControls) => {
    openAnims.current.get(key)?.stop();
    openAnims.current.set(key, controls);
  };

  const setOpen = (j: number, on: boolean) => {
    const cab = cabins[j];
    if (!cab) return;
    if (!motionSafe) {
      const fadeT = { duration: durations.fast, ease: easings.enter };
      runOpen(`r${j}`, animate(cab.reach, on ? 1 : 0, fadeT));
      runOpen(`s${j}`, animate(cab.swing, on ? 1 : 0, fadeT));
      return;
    }
    if (on) {
      runOpen(`r${j}`, animate(cab.reach, 1, springs.glide));
      runOpen(`s${j}`, animate(cab.swing, 1, springs.snap));
    } else {
      // Exits never spring: the card tucks back on the house exit tween.
      const exit = { duration: durations.base, ease: easings.exit };
      runOpen(`r${j}`, animate(cab.reach, 0, exit));
      runOpen(`s${j}`, animate(cab.swing, 0, exit));
    }
  };

  const halt = () => {
    settling.current?.stop();
    settling.current = null;
  };

  /** Brings the chain to rest at `to` (a whole cabin), carrying `velocity` in cabins/s. */
  const settleTo = (to: number, velocity = 0) => {
    halt();
    target.current = to;
    if (!motionSafe) {
      chain.jump(to);
      visitor.current = false;
      return;
    }
    settling.current = animate(chain, to, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        settling.current = null;
        visitor.current = false;
      },
    });
  };

  /** The cabin the visitor is looking at: the open one, or the one just left. */
  const current = () => {
    if (settling.current) return target.current;
    const c = chain.get();
    const near = Math.round(c);
    return Math.abs(c - near) < OPEN_WINDOW ? near : Math.floor(c);
  };

  /** A visitor moved the chain: announce what lands and rest the run a while. */
  const interacted = () => {
    visitor.current = true;
    state.current.idleUntil = performance.now() + RESUME_MS;
    if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => {
      resumeTimer.current = null;
      api.current?.sync();
    }, RESUME_MS + 20);
  };

  // Whatever the dwell, one cabin takes SECONDS_PER_CABIN / speed on
  // average: the run's gain is normalised over a whole pitch.
  const minGain = 0.92 - 0.88 * clamp01(dwell);
  const gain = React.useCallback(
    (d: number) => {
      const t = Math.sin((Math.PI / 2) * clamp01(d / 0.5));
      return minGain + (1 - minGain) * t * t;
    },
    [minGain],
  );
  const base = React.useMemo(() => {
    let sum = 0;
    const steps = 64;
    for (let i = 0; i < steps; i += 1) {
      const phase = (i + 0.5) / steps;
      sum += 1 / gain(Math.abs(phase - Math.round(phase)));
    }
    return sum / steps / SECONDS_PER_CABIN;
  }, [gain]);
  const direction = reverse ? -1 : 1;

  const advance = (dt: number) => {
    const c = chain.get();
    const d = Math.abs(c - Math.round(c));
    chain.set(c + direction * base * clamp(speed, 0, 2) * gain(d) * dt);
  };

  const sync = () => {
    const k = state.current;
    const want =
      motionSafe &&
      speed > 0 &&
      !paused &&
      !stopped &&
      !held &&
      !disabled &&
      k.inView &&
      k.visible &&
      !k.dragging &&
      !(pauseOnHover && (k.hovered || k.focused)) &&
      performance.now() >= k.idleUntil;
    if (want && raf.current === null) {
      halt();
      lastT.current = null;
      const frame = (now: number) => {
        raf.current = requestAnimationFrame(frame);
        const prev = lastT.current ?? now;
        lastT.current = now;
        api.current?.advance(Math.min(0.05, Math.max(0, (now - prev) / 1000)));
      };
      raf.current = requestAnimationFrame(frame);
    } else if (!want && raf.current !== null) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
      if (!k.dragging && !settling.current) {
        // A run that stops comes to rest with a cabin at the landing: the
        // open card stays, a card already tucking away lets the next arrive.
        const c = chain.get();
        settleTo(
          direction > 0
            ? Math.ceil(c - OPEN_WINDOW)
            : Math.floor(c + OPEN_WINDOW),
        );
      }
    }
  };

  const onChain = (c: number) => {
    const near = Math.round(c);
    const frac = Math.abs(c - near);
    const cab = mod(near, g.nc);
    const want = held || frac < OPEN_WINDOW ? cab : -1;
    if (want !== openCab.current) {
      if (openCab.current >= 0) setOpen(openCab.current, false);
      if (want >= 0) setOpen(want, true);
      openCab.current = want;
      const fadeT = motionSafe
        ? springs.glide
        : { duration: durations.fast, ease: easings.enter };
      runOpen("dim", animate(dim, want >= 0 ? 1 : 0, fadeT));
    }
    const card = mod(near, n);
    setLanded((s) =>
      s.card === card && s.cabin === cab ? s : { card, cabin: cab },
    );
    if (card !== landedRef.current) {
      landedRef.current = card;
      reported.current = card;
      onValueChange?.(card);
      if (visitor.current) {
        say(`${card + 1} of ${n}: ${list[card]?.title ?? "Card"}.`);
      }
    }
  };

  const takeWheel = (event: WheelEvent) => {
    const k = state.current;
    const now = performance.now();
    if (now - k.lastWheel > WHEEL_BURST_MS) {
      // A new gesture is only ours if the visitor had already settled on
      // the lift; a page scrolling past underneath is never caught.
      k.wheelTaken =
        wheel &&
        !disabled &&
        (k.focused || (k.hovered && now - k.hoverSince > HOVER_INTENT_MS));
    }
    k.lastWheel = now;
    if (!k.wheelTaken) return;
    event.preventDefault();
    const { x: dx, y: dy } = wheelPixels(event);
    const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    interacted();
    halt();
    if (held) setHeld(false);
    chain.set(chain.get() + delta / (g.p * 1.3));
    sync();
    if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(() => {
      wheelTimer.current = null;
      settleTo(Math.round(chain.get()));
    }, 140);
  };

  React.useEffect(() => {
    api.current = { onChain, sync, advance, wheel: takeWheel };
  });

  /* ------------------------------ effects ------------------------------ */

  // Measure the box; the lift is laid out from its width.
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

  // Follow the chain: openness, the landing card, the announcements. A new
  // set of cabins (a new layout) starts from nothing open.
  React.useEffect(() => {
    openCab.current = -2;
    api.current?.onChain(chain.get());
    return chain.on("change", (c) => api.current?.onChain(c));
  }, [chain, cabins]);

  // A host that moves `value` gets the same glide a key would.
  React.useEffect(() => {
    if (value === undefined) return;
    const k = mod(Math.round(value), n);
    if (k === reported.current || k === landedRef.current) return;
    reported.current = k;
    const from = Math.round(chain.get());
    const to = from + Math.round(wrapNear(k - mod(from, n), n));
    settling.current?.stop();
    target.current = to;
    if (!motionSafe) chain.jump(to);
    else settling.current = animate(chain, to, springs.glide);
  }, [value, n, chain, motionSafe]);

  // Nothing runs off screen or in a hidden tab.
  React.useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      state.current.inView = entry.isIntersecting;
      api.current?.sync();
    });
    io.observe(node);
    const onVisibility = () => {
      state.current.visible = document.visibilityState !== "hidden";
      api.current?.sync();
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    api.current?.sync();
  }, [motionSafe, speed, paused, stopped, held, disabled, pauseOnHover, base]);

  // The wheel needs a non-passive listener to keep the page still.
  React.useEffect(() => {
    const node = viewRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => api.current?.wheel(event);
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  React.useEffect(() => {
    const anims = openAnims.current;
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      settling.current?.stop();
      settling.current = null;
      for (const c of anims.values()) c.stop();
      anims.clear();
      if (resumeTimer.current !== null) {
        window.clearTimeout(resumeTimer.current);
      }
      if (wheelTimer.current !== null) window.clearTimeout(wheelTimer.current);
      resumeTimer.current = null;
      wheelTimer.current = null;
    };
  }, []);

  /* ------------------------------ gestures ----------------------------- */

  const tapAt = (hitTarget: EventTarget | null) => {
    if (!(hitTarget instanceof Element)) return;
    if (hitTarget.closest("button, a")) return;
    const hit = hitTarget.closest("[data-cabin]");
    if (!hit) return;
    const j = Number(hit.getAttribute("data-cabin"));
    if (!Number.isFinite(j)) return;
    interacted();
    const near = Math.round(chain.get());
    if (mod(near, g.nc) === j && !settling.current) {
      setHeld(!held);
    } else {
      if (held) setHeld(false);
      settleTo(near + Math.round(wrapNear(j - mod(near, g.nc), g.nc)));
    }
    sync();
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ event, offset }) => {
      const box = viewRef.current?.getBoundingClientRect();
      const lx = box ? event.clientX - offset.x - box.left : 0;
      const ly = box ? event.clientY - offset.y - box.top : 0;
      // Over the top the cabins move sideways; in the shafts, up and down.
      dragAxis.current =
        ly < g.yT - g.ch / 2 && Math.abs(offset.x) > Math.abs(offset.y)
          ? "x"
          : "y";
      dragSign.current = dragAxis.current === "x" || lx < g.cx ? 1 : -1;
      state.current.dragging = true;
      interacted();
      halt();
      if (held) setHeld(false);
      dragFrom.current = chain.get();
      sync();
    },
    onMove: ({ offset }) => {
      const move =
        dragAxis.current === "x" ? offset.x : -offset.y * dragSign.current;
      chain.set(dragFrom.current + move / g.p);
    },
    onEnd: ({ velocity }) => {
      state.current.dragging = false;
      const px =
        dragAxis.current === "x" ? velocity.x : -velocity.y * dragSign.current;
      const c = chain.get();
      const rest = motionSafe ? project(c * g.p, px, 0.99) / g.p : c;
      interacted();
      settleTo(Math.round(rest), motionSafe ? px / g.p : 0);
      sync();
    },
    onCancel: () => {
      state.current.dragging = false;
      settleTo(Math.round(chain.get()));
      sync();
    },
    onTap: (event) => tapAt(event.target),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    // Escape lets a held card go wherever focus is inside the lift (its
    // link, say); the moving keys belong to the lift itself.
    if (event.key === "Escape" && held) {
      event.preventDefault();
      setHeld(false);
      return;
    }
    if (event.target !== event.currentTarget) return;
    const go = (to: number) => {
      event.preventDefault();
      interacted();
      if (held) setHeld(false);
      settleTo(to);
      sync();
    };
    const toCard = (k: number) => {
      const from = current();
      return from + Math.round(wrapNear(k - mod(from, n), n));
    };
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        go(current() + 1);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        go(current() - 1);
        break;
      case "Home":
        go(toCard(0));
        break;
      case "End":
        go(toCard(n - 1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        interacted();
        if (!held) settleTo(current());
        setHeld(!held);
        sync();
        break;
      case "Escape":
        if (!held) return;
        event.preventDefault();
        setHeld(false);
        break;
      default:
        break;
    }
  };

  /* ------------------------------- render ------------------------------ */

  const landedItem = list[landed.card];
  const running = motionSafe && speed > 0;
  const pillarX = g.cx - g.pillarW / 2;
  const pillarTop = g.yT + g.ch / 2 + 4;
  const wheelR = Math.max(12, Math.min(g.d - g.cw / 2 - 2, g.d * 0.46));
  const chainPath = `M ${r2(g.xL)} ${r2(g.h + 30)} V ${r2(g.yT)} A ${r2(g.d)} ${r2(g.d)} 0 0 1 ${r2(g.xR)} ${r2(g.yT)} V ${r2(g.h + 30)}`;
  const recess = "color-mix(in oklab, var(--foreground) 7%, var(--background))";
  const drumNumbers = Array.from({ length: n + 1 }, (_, i) => (i % n) + 1);

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onPointerEnter={() => {
        state.current.hovered = true;
        state.current.hoverSince = performance.now();
        api.current?.sync();
      }}
      onPointerLeave={() => {
        state.current.hovered = false;
        api.current?.sync();
      }}
      onFocus={(event) => {
        // Only keyboard focus rests the run; a click lands focus too, and
        // the pointer leaving should let the lift carry on.
        state.current.focused = event.target.matches(":focus-visible");
        api.current?.sync();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }
        state.current.focused = false;
        api.current?.sync();
      }}
      className={cn(
        "relative w-full overflow-clip rounded-4 border border-hairline bg-surface-1 [contain:paint] select-none",
        disabled && "opacity-60",
        className,
      )}
      style={
        {
          height: g.h,
          "--paternoster-lamp": lamp,
          "--paternoster-lamp-wash": `color-mix(in oklab, ${lamp} 22%, transparent)`,
        } as React.CSSProperties
      }
    >
      <p id={hintId} className="sr-only">
        Up and Right bring the next cabin to the landing, Down and Left the
        previous one. Home and End go to the first and last card. Enter holds
        the card at the landing and Escape lets it go.
      </p>

      <div
        ref={viewRef}
        role="group"
        tabIndex={disabled ? -1 : 0}
        aria-describedby={hintId}
        aria-label={`${label}: ${landed.card + 1} of ${n}, ${landedItem?.title ?? ""}`}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          "absolute inset-0 touch-pan-x rounded-4 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      >
        {/* The wall: two shafts, the machine room over them, a pillar between. */}
        <div
          aria-hidden
          className="absolute rounded-t-3"
          style={{
            left: r2(g.xL - g.shaftW / 2),
            width: r2(g.xR - g.xL + g.shaftW),
            top: 0,
            height: r2(pillarTop),
            background: recess,
            boxShadow:
              "inset 0 1px 6px color-mix(in oklab, black 14%, transparent)",
          }}
        />
        {[g.xL, g.xR].map((x) => (
          <div
            key={x}
            aria-hidden
            className="absolute bottom-0"
            style={{
              left: r2(x - g.shaftW / 2),
              width: r2(g.shaftW),
              top: r2(pillarTop - 1),
              background: recess,
              boxShadow:
                "inset 3px 0 6px color-mix(in oklab, black 12%, transparent), inset -3px 0 6px color-mix(in oklab, black 12%, transparent)",
            }}
          />
        ))}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0"
          width={g.w}
          height={g.h}
          viewBox={`0 0 ${g.w} ${g.h}`}
        >
          <g transform={`translate(${r2(g.cx - wheelR)} ${r2(g.yT - wheelR)})`}>
            <motion.g style={{ rotate: wheelTurn, originX: 0.5, originY: 0.5 }}>
              <circle
                cx={r2(wheelR)}
                cy={r2(wheelR)}
                r={r2(wheelR - 1.5)}
                fill="none"
                className="stroke-hairline-strong"
                strokeWidth="3"
              />
              {[0, 1, 2, 3, 4, 5].map((k) => (
                <rect
                  key={k}
                  x={r2(wheelR - 1)}
                  y="3"
                  width="2"
                  height={r2(wheelR - 3)}
                  className="fill-ink-3"
                  opacity={0.35}
                  transform={`rotate(${k * 60} ${r2(wheelR)} ${r2(wheelR)})`}
                />
              ))}
              <circle
                cx={r2(wheelR)}
                cy={r2(wheelR)}
                r="4"
                className="fill-ink-3"
                opacity={0.6}
              />
            </motion.g>
          </g>
          <motion.path
            d={chainPath}
            fill="none"
            className="stroke-ink-3"
            strokeOpacity={0.45}
            strokeWidth="1.5"
            strokeDasharray="6 4"
            style={{ strokeDashoffset: linkShift }}
          />
        </svg>

        {/* The pillar between the shafts, with the floor drum at the landing. */}
        <div
          aria-hidden
          className="absolute bottom-0 border-x border-hairline bg-surface-2"
          style={{
            left: r2(pillarX),
            width: r2(g.pillarW),
            top: r2(pillarTop),
          }}
        />
        <div
          aria-hidden
          className="absolute flex items-center justify-center"
          style={{
            left: r2(pillarX),
            width: r2(g.pillarW),
            top: r2(g.landY - 12),
            height: 24,
          }}
        >
          <div className="relative h-[18px] w-6 overflow-hidden rounded-1 border border-hairline-strong bg-background">
            <motion.div
              style={{ y: drum }}
              className="absolute inset-x-0 top-0"
            >
              {drumNumbers.map((num, i) => (
                <span
                  key={i}
                  className="block h-[18px] text-center font-mono text-[11px] leading-[16px] font-medium text-foreground tabular-nums"
                >
                  {num}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
        <div
          aria-hidden
          className="absolute h-1"
          style={{
            left: r2(g.xL - g.shaftW / 2 - 2),
            width: r2(g.shaftW + 4),
            top: r2(g.landY + g.ch / 2 + 1),
            background: tone.frame,
            boxShadow: `0 -1px 0 ${tone.edge}`,
            zIndex: 35,
          }}
        />

        {cabins.map((cab, j) => {
          const card = mod(j, n);
          const item = list[card];
          if (!item) return null;
          return (
            <Cabin
              key={j}
              g={g}
              j={j}
              chain={chain}
              reach={cab.reach}
              swing={cab.swing}
              item={item}
              motif={card}
              tone={tone}
              lamp={lamp}
              index={card}
              count={n}
              open={j === landed.cabin}
              held={held && j === landed.cabin}
              motionSafe={motionSafe}
            />
          );
        })}

        {/* Dusk over the lift while a card is out, so the card reads. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-background"
          style={{ opacity: dusk, zIndex: 40 }}
        />

        {/* The ground floor: the cabins go under it. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 border-t border-hairline-strong bg-surface-2"
          style={{ height: FLOOR, zIndex: 45 }}
        />
      </div>

      {running ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setStopped((s) => !s);
            say(stopped ? "Lift running." : "Lift stopped.");
          }}
          className={cn(
            "absolute z-[60] inline-flex h-5 items-center gap-1.5 rounded-full border border-hairline-strong bg-background pr-2 pl-1 font-mono text-[9px] tracking-[0.08em] text-ink-2 uppercase transition-colors outline-none",
            "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
          )}
          style={{ left: r2(g.cx - 26), bottom: 5, width: 52 }}
        >
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full"
            style={{
              background: stopped
                ? pig("--success", 0.66, 0.13)
                : pig("--danger", 0.62, 0.17),
              boxShadow:
                "inset 0 -1.5px 0 color-mix(in oklab, black 25%, transparent)",
            }}
          />
          {stopped ? "Run" : "Stop"}
          <span className="sr-only"> the lift</span>
        </button>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
