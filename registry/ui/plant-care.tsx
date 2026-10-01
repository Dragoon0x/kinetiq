"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberClamp } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PlantCarePlant = "fern" | "monstera" | "cactus";
export type PlantCarePot = "clay" | "stone" | "glaze";

export type PlantCareProps = {
  /** Controlled: days since the plant was last watered. */
  days?: number;
  /** Days since watering when uncontrolled. @default 5 */
  defaultDays?: number;
  /** Fires from the Water press with 0. */
  onDaysChange?: (days: number) => void;
  /** Which plant is drawn; it also sets the default watering interval. @default "fern" */
  plant?: PlantCarePlant;
  /** The pot's finish. @default "clay" */
  pot?: PlantCarePot;
  /** The plant's name: the widget's title and accessible name. @default "Fern", "Monstera" or "Cactus" */
  name?: string;
  /** Days between waterings. @default 4 for a fern, 7 for a monstera, 10 for a cactus */
  interval?: number;
  /** The current moment (ms or Date); with it, the next watering day is named. */
  now?: number | Date;
  /** Minutes east of UTC used to read `now` as a calendar day. @default 0 */
  utcOffset?: number;
  /** The button's text. @default "Water" */
  waterLabel?: string;
  /** Play the pour and the drops landing. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = readonly [number, number];

/** The drawing's own box. Every pose of the plant and the can stays inside it. */
const W = 136;
const H = 148;
const CX = 68;
/** The soil surface, where stems start and drops land. */
const SOIL = 104;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
const rad = (deg: number) => (deg * Math.PI) / 180;
/** A unit vector at `deg` from straight up, clockwise. */
const dirOf = (deg: number): Pt => [Math.sin(rad(deg)), -Math.cos(rad(deg))];
const f = (p: Pt) => `${r2(p[0])} ${r2(p[1])}`;
const poly = (pts: readonly Pt[]) =>
  pts.length ? `M ${pts.map(f).join(" L ")} Z` : "";

/** A spring from a stiffness and a damping ratio, at unit mass. */
const spring = (stiffness: number, ratio: number) => ({
  type: "spring" as const,
  stiffness,
  damping: 2 * ratio * Math.sqrt(stiffness),
  mass: 1,
});

/* ------------------------------------------------------------------ */
/* Thirst                                                              */
/* ------------------------------------------------------------------ */

const INTERVAL: Record<PlantCarePlant, number> = {
  fern: 4,
  monstera: 7,
  cactus: 10,
};
const NAME: Record<PlantCarePlant, string> = {
  fern: "Fern",
  monstera: "Monstera",
  cactus: "Cactus",
};

/** Droop starts at a third of the interval and is complete at 1.4 of it. */
const droopOf = (thirst: number) => smooth((thirst - 0.33) / (1.4 - 0.33));
/** Colour drains later than the pose: a plant sags before it yellows. */
const paleOf = (thirst: number) => smooth((thirst - 0.5) / (1.7 - 0.5));
/** Soil dries first of all. */
const dryOf = (thirst: number) => smooth((thirst - 0.15) / (0.9 - 0.15));

type Targets = {
  limbs: number[];
  hydration: number;
  soil: number;
  bloom: number;
  turgor: number;
};

/* ------------------------------------------------------------------ */
/* Fern                                                                */
/* ------------------------------------------------------------------ */

type FrondSpec = { base: number; a: number; len: number };

/** Centre out: the order the fronds perk up in. */
const FERN: FrondSpec[] = [
  { base: 0, a: -4, len: 50 },
  { base: 2, a: 22, len: 54 },
  { base: -2, a: -27, len: 54 },
  { base: 4, a: 46, len: 50 },
  { base: -4, a: -50, len: 50 },
  { base: 6, a: 70, len: 42 },
  { base: -6, a: -73, len: 42 },
];
const FROND_SEGMENTS = 9;

/**
 * A frond's rib, as points with their heading: ten segments whose turning
 * grows toward the tip, the way a frond arches under its own weight. Thirst
 * moves the turning earlier and further, until the tip hangs.
 */
function frondRib(sp: FrondSpec, d: number, s: number) {
  const side = sp.a < 0 ? -1 : 1;
  const sway = rubberClamp(s, -24, 24, 30);
  const k0 = lerp(sp.a * 0.78, sp.a * 0.95 + side * 24, d) + sway;
  const k1 =
    lerp(sp.a * 0.78 + side * (26 + Math.abs(sp.a) * 0.55), side * 162, d) +
    sway * 1.4;
  const len = sp.len * (1 - 0.12 * d);
  const p = lerp(1.7, 1.15, d);
  const step = len / FROND_SEGMENTS;
  let x = CX + sp.base;
  let y = SOIL;
  const pts: [number, number, number][] = [[x, y, k0]];
  for (let i = 1; i <= FROND_SEGMENTS; i += 1) {
    const heading = k0 + (k1 - k0) * Math.pow((i - 0.5) / FROND_SEGMENTS, p);
    const [dx, dy] = dirOf(heading);
    x += dx * step;
    y += dy * step;
    pts.push([x, y, k0 + (k1 - k0) * Math.pow(i / FROND_SEGMENTS, p)]);
  }
  return pts;
}

function frondPaths(sp: FrondSpec, d: number, s: number) {
  const pts = frondRib(sp, d, s);
  const rib = `M ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(" L ")}`;
  // Leaflets fold toward the rib as the frond loses water.
  const fold = lerp(60, 20, d);
  const parts: string[] = [];
  for (let i = 1; i < FROND_SEGMENTS; i += 1) {
    const at = pts[i];
    if (!at) continue;
    const u = i / FROND_SEGMENTS;
    const size =
      sp.len * 0.21 * Math.pow(1 - u, 0.65) * Math.min(1, 0.45 + u * 3);
    const [px, py, heading] = at;
    for (const sign of [-1, 1]) {
      const psi = heading + sign * fold;
      const [dx, dy] = dirOf(psi);
      const nx = Math.cos(rad(psi)) * size * 0.3;
      const ny = Math.sin(rad(psi)) * size * 0.3;
      const mx = px + dx * size * 0.5;
      const my = py + dy * size * 0.5;
      const tip: Pt = [px + dx * size, py + dy * size];
      parts.push(
        `M ${f([px, py])} Q ${f([mx + nx, my + ny])} ${f(tip)} Q ${f([mx - nx, my - ny])} ${f([px, py])} Z`,
      );
    }
  }
  return { rib, leaves: parts.join(" ") };
}

/* ------------------------------------------------------------------ */
/* Monstera                                                            */
/* ------------------------------------------------------------------ */

type LeafSpec = { base: number; a: number; stem: number; size: number };

const MONSTERA: LeafSpec[] = [
  { base: 1, a: 4, stem: 54, size: 30 },
  { base: 3, a: 30, stem: 44, size: 28 },
  { base: -2, a: -24, stem: 46, size: 29 },
  { base: 5, a: 56, stem: 30, size: 24 },
  { base: -5, a: -52, stem: 32, size: 25 },
];

/**
 * The blade in its own frame — u along the midrib from the stalk, v across —
 * a heart with a notch at the stalk and three slits a side, cut as narrow Vs
 * into the outline so the leaf behind shows through them.
 */
function bladeOutline(size: number): Pt[] {
  const c = size * 0.5;
  const rx = size * 0.5;
  const ry = size * 0.44;
  const slits = [0.95, 1.65, 2.3].flatMap((a) => [a, -a]);
  const at = (t: number): Pt => [
    c +
      rx * Math.cos(t) +
      size * 0.05 * Math.pow(Math.max(0, Math.cos(t)), 6) +
      size * 0.12 * Math.exp(-Math.pow((Math.abs(t) - Math.PI) / 0.35, 2)),
    ry * Math.sin(t),
  ];
  const angles: { t: number; slit: boolean }[] = [];
  for (let i = 0; i < 48; i += 1) {
    const t = -Math.PI + (2 * Math.PI * i) / 48;
    if (slits.some((s) => Math.abs(s - t) < 0.065)) continue;
    angles.push({ t, slit: false });
  }
  for (const s of slits) {
    angles.push({ t: s - 0.06, slit: false });
    angles.push({ t: s, slit: true });
    angles.push({ t: s + 0.06, slit: false });
  }
  angles.sort((p, q) => p.t - q.t);
  return angles.map(({ t, slit }) => {
    const p = at(t);
    return slit ? ([p[0] * 0.92 + c * 0.08, p[1] * 0.38] as Pt) : p;
  });
}

const BLADES = MONSTERA.map((l) => bladeOutline(l.size));

function leafPaths(sp: LeafSpec, outline: readonly Pt[], d: number, s: number) {
  const side = sp.a < 0 ? -1 : 1;
  const sway = rubberClamp(s, -24, 24, 30);
  const k0 = lerp(sp.a * 0.6, sp.a * 0.9 + side * 14, d) + sway * 0.6;
  const k1 = lerp(sp.a + side * 12, side * 125, d) + sway;
  const len = sp.stem * (1 - 0.08 * d);
  let x = CX + sp.base;
  let y = SOIL;
  const stem: Pt[] = [[x, y]];
  for (let i = 1; i <= 6; i += 1) {
    const [dx, dy] = dirOf(k0 + ((k1 - k0) * (i - 0.5)) / 6);
    x += (dx * len) / 6;
    y += (dy * len) / 6;
    stem.push([x, y]);
  }
  // The blade faces out and up on a full stalk and hangs from a limp one.
  const psi = lerp(k1 + side * 25, side * 170, d) + sway * 0.4;
  const [ux, uy] = dirOf(psi);
  const nx = Math.cos(rad(psi));
  const ny = Math.sin(rad(psi));
  const blade = outline.map(([u, v]): Pt => [
    x + u * ux + v * nx,
    y + u * uy + v * ny,
  ]);
  return {
    stem: `M ${stem.map(f).join(" L ")}`,
    blade: poly(blade),
    rib: `M ${f([x, y])} L ${f([x + ux * sp.size * 0.92, y + uy * sp.size * 0.92])}`,
    tip: [x + ux * sp.size, y + uy * sp.size] as Pt,
  };
}

/* ------------------------------------------------------------------ */
/* Cactus                                                              */
/* ------------------------------------------------------------------ */

const ARM_W = 5;

/** Signed area: positive is clockwise on screen. */
const area = (pts: readonly Pt[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (p && q) a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};
/** Every outline wound the same way, so overlapping parts fill as one. */
const wound = (pts: Pt[]) => (area(pts) < 0 ? [...pts].reverse() : pts);

/** A capsule standing on (0, 0) in a frame where +y is up. */
function capsule(halfBase: number, half: number, height: number): Pt[] {
  const pts: Pt[] = [[-halfBase, 0]];
  const top = Math.max(half, height - half);
  for (let i = 0; i <= 10; i += 1) {
    const t = Math.PI - (Math.PI * i) / 10;
    pts.push([half * Math.cos(t), top + half * Math.sin(t)]);
  }
  pts.push([halfBase, 0]);
  return pts;
}

function cactusPaths(
  body: number,
  bodySway: number,
  left: number,
  leftSway: number,
  right: number,
  rightSway: number,
) {
  const h = lerp(64, 58, body);
  const hw = lerp(12.5, 9.8, body);
  const lean = rad(lerp(0, -7, body) + rubberClamp(bodySway, -10, 10, 14));
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  const base: Pt = [CX, SOIL + 2];
  // Body frame (x across, y up) to the drawing.
  const world = ([x, y]: Pt): Pt => [
    base[0] + x * cos + y * sin,
    base[1] + x * sin - y * cos,
  ];
  const arm = (
    joint: number,
    reach: number,
    length: number,
    droop: number,
    sway: number,
    side: number,
  ) => {
    const ex = side * (hw + reach);
    const stub = wound(
      (
        [
          [side * (hw - 3), joint - ARM_W],
          [ex, joint - ARM_W],
          [ex, joint + ARM_W],
          [side * (hw - 3), joint + ARM_W],
        ] as Pt[]
      ).map(world),
    );
    const turn = rad(
      side * lerp(0, 108, droop) + rubberClamp(sway, -22, 22, 30),
    );
    const c = Math.cos(turn);
    const s = Math.sin(turn);
    const up = wound(
      capsule(ARM_W, ARM_W, length).map(([x, y]): Pt =>
        world([ex + x * c + y * s, joint - x * s + y * c]),
      ),
    );
    const tip = world([ex + length * s, joint + length * c]);
    const elbow: Pt[] = [];
    for (let i = 0; i < 12; i += 1) {
      const t = (Math.PI * 2 * i) / 12;
      elbow.push(
        world([ex + ARM_W * Math.cos(t), joint + ARM_W * Math.sin(t)]),
      );
    }
    return { parts: [stub, wound(elbow), up], tip };
  };
  const leftArm = arm(22, 7, 19, left, leftSway, -1);
  const rightArm = arm(33, 6, 15, right, rightSway, 1);
  const shapes = [
    wound(capsule(hw * 0.92, hw, h).map(world)),
    ...leftArm.parts,
    ...rightArm.parts,
  ];
  const ribs = [-0.5, 0, 0.5]
    .map(
      (k) =>
        `M ${f(world([hw * k, 3]))} L ${f(world([hw * k * 0.9, h - hw * 0.7]))}`,
    )
    .join(" ");
  const spines: string[] = [];
  for (let y = 9; y < h - 6; y += 9) {
    for (const k of [-0.5, 0.5]) {
      const p = world([hw * k * 1.4, y + (k > 0 ? 4 : 0)]);
      spines.push(
        `M ${f([p[0] - 1, p[1] - 1])} L ${f([p[0] + 1, p[1] + 1])} M ${f([p[0] + 1, p[1] - 1])} L ${f([p[0] - 1, p[1] + 1])}`,
      );
    }
  }
  return {
    body: shapes.map(poly).join(" "),
    ribs,
    spines: spines.join(" "),
    top: world([0, h + 0.5]),
    tips: [leftArm.tip, rightArm.tip] as const,
  };
}

/* ------------------------------------------------------------------ */
/* Watering can                                                        */
/* ------------------------------------------------------------------ */

/** The can turns about the middle of its body; this is where that sits. */
const CAN_PIVOT: Pt = [110, 44];
const CAN_TIP = -56;
const CAN_BODY: Pt[] = [
  [-12, -9],
  [12, -9],
  [13, 10],
  [-13, 10],
];
const CAN_BAND: Pt[] = [
  [-12.2, -9],
  [12.2, -9],
  [12.4, -5.5],
  [-12.4, -5.5],
];
const S0: Pt = [-11.5, 4];
const S1: Pt = [-34, -14.5];
const SPOUT_U: Pt = (() => {
  const dx = S1[0] - S0[0];
  const dy = S1[1] - S0[1];
  const l = Math.hypot(dx, dy);
  return [dx / l, dy / l];
})();
const SPOUT_N: Pt = [-SPOUT_U[1], SPOUT_U[0]];
const along = (p: Pt, u: number, n: number): Pt => [
  p[0] + SPOUT_U[0] * u + SPOUT_N[0] * n,
  p[1] + SPOUT_U[1] * u + SPOUT_N[1] * n,
];
const CAN_SPOUT: Pt[] = [
  along(S0, 0, 2.6),
  along(S1, 0, 1.4),
  along(S1, 0, -1.4),
  along(S0, 0, -2.6),
];
const CAN_ROSE: Pt[] = [
  along(S1, -0.4, 1.7),
  along(S1, 2.6, 3.8),
  along(S1, 2.6, -3.8),
  along(S1, -0.4, -1.7),
];
const HOLES: Pt[] = [0, 1, 2, 3].map((k) => along(S1, 2.6, (k - 1.5) * 1.9));
const HANDLE: [Pt, Pt, Pt] = [
  [5, -9],
  [17, -25],
  [13.5, 1],
];

const placeCan = (pts: readonly Pt[], pose: number, lift: number): Pt[] => {
  const a = rad(CAN_TIP * pose);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return pts.map(([x, y]): Pt => [
    CAN_PIVOT[0] + x * c - y * s,
    CAN_PIVOT[1] + lift + x * s + y * c,
  ]);
};

/* ------------------------------------------------------------------ */
/* The pour: every drop decided up front, so a frame is a pure function */
/* of the clock.                                                       */
/* ------------------------------------------------------------------ */

const POUR = 1;
const EMIT = 0.02;
const GRAVITY = 520;
const LANDING = SOIL;

type Drop = {
  e: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  land: number;
};

/** A hash in [0, 1), unsigned so it never goes negative. */
const jitter = (j: number, k: number) =>
  ((Math.imul(j * 7 + k + 1, 2654435761) >>> 0) % 1000) / 1000;

const DROPS: Drop[] = (() => {
  const holes = placeCan(HOLES, 1, 0);
  const [ux, uy] = placeCan(
    [
      [0, 0],
      [SPOUT_U[0], SPOUT_U[1]],
    ],
    1,
    0,
  ).reduce((a, b) => [b[0] - a[0], b[1] - a[1]]);
  const out: Drop[] = [];
  const count = Math.floor(POUR / EMIT);
  for (let j = 0; j < count; j += 1) {
    const k = j % 4;
    const hole = holes[k] ?? holes[0] ?? CAN_PIVOT;
    const speed = 64 + 14 * jitter(j, 1);
    const spread = (k - 1.5) * 7 + (jitter(j, 2) - 0.5) * 6;
    const vx = ux * speed - uy * spread;
    const vy = uy * speed + ux * spread;
    const drop = Math.max(1, LANDING - hole[1]);
    const t = (-vy + Math.sqrt(vy * vy + 2 * GRAVITY * drop)) / GRAVITY;
    out.push({
      e: j * EMIT + jitter(j, 3) * 0.012,
      x: hole[0],
      y: hole[1],
      vx,
      vy,
      land: t,
    });
  }
  return out;
})();
const FIRST_LAND = Math.min(...DROPS.map((d) => d.e + d.land));
const LAST_LAND = Math.max(...DROPS.map((d) => d.e + d.land));
const SPLASH = 0.16;
const POUR_END = LAST_LAND + SPLASH;
/** Where the shower lands, on average: the wet patch spreads from here. */
const PATCH_X = r2(
  DROPS.reduce((sum, d) => sum + d.x + d.vx * d.land, 0) / DROPS.length,
);

function dropPaths(clock: number) {
  const streaks: string[] = [];
  const specks: string[] = [];
  for (const d of DROPS) {
    const age = clock - d.e;
    if (age < 0) continue;
    if (age < d.land) {
      const x = d.x + d.vx * age;
      const y = d.y + d.vy * age + 0.5 * GRAVITY * age * age;
      const vy = d.vy + GRAVITY * age;
      const speed = Math.hypot(d.vx, vy) || 1;
      streaks.push(
        `M ${f([x, y])} L ${f([x - (d.vx / speed) * 3, y - (vy / speed) * 3])}`,
      );
    } else if (age < d.land + SPLASH) {
      const a = age - d.land;
      const lx = d.x + d.vx * d.land;
      const hop = 70 * a - 440 * a * a;
      for (const side of [-1, 1]) {
        const p: Pt = [lx + side * (1.5 + 18 * a), LANDING - hop];
        specks.push(`M ${f(p)} L ${f([p[0] + 0.01, p[1]])}`);
      }
    }
  }
  return { streaks: streaks.join(" "), specks: specks.join(" ") };
}

/* ------------------------------------------------------------------ */
/* Colour: fixed pigments, so a leaf is the same green in either theme */
/* ------------------------------------------------------------------ */

const LEAF: Record<PlantCarePlant, { well: string; dry: string }> = {
  fern: { well: "oklch(0.62 0.15 140)", dry: "oklch(0.77 0.09 96)" },
  monstera: { well: "oklch(0.52 0.13 155)", dry: "oklch(0.73 0.08 96)" },
  cactus: { well: "oklch(0.6 0.11 150)", dry: "oklch(0.75 0.07 100)" },
};
const RIB: Record<PlantCarePlant, { well: string; dry: string }> = {
  fern: { well: "oklch(0.48 0.12 142)", dry: "oklch(0.6 0.08 92)" },
  monstera: { well: "oklch(0.42 0.1 152)", dry: "oklch(0.58 0.07 92)" },
  cactus: { well: "oklch(0.44 0.09 150)", dry: "oklch(0.56 0.07 96)" },
};
const SOIL_WET = "oklch(0.36 0.05 50)";
const SOIL_DRY = "oklch(0.67 0.05 75)";
const WATER = "oklch(0.72 0.11 235)";

type PotLook = {
  body: string;
  band: string;
  lip: string;
  inside: string;
  shade: string;
};
const POTS: Record<PlantCarePot, PotLook> = {
  clay: {
    body: "oklch(0.63 0.12 45)",
    band: "oklch(0.66 0.12 47)",
    lip: "oklch(0.73 0.1 52)",
    inside: "oklch(0.42 0.08 42)",
    shade: "oklch(0.45 0.1 40)",
  },
  stone: {
    body: "oklch(0.72 0.012 250)",
    band: "oklch(0.75 0.012 250)",
    lip: "oklch(0.81 0.01 250)",
    inside: "oklch(0.46 0.012 250)",
    shade: "oklch(0.5 0.012 250)",
  },
  glaze: {
    body: "oklch(0.48 0.1 235)",
    band: "oklch(0.52 0.1 232)",
    lip: "oklch(0.63 0.09 228)",
    inside: "oklch(0.3 0.06 235)",
    shade: "oklch(0.3 0.07 238)",
  },
};
const POT_WORD: Record<PlantCarePot, string> = {
  clay: "a clay",
  stone: "a stone",
  glaze: "a glazed",
};

const mixLeaf = (plant: PlantCarePlant, h: number, kind: "leaf" | "rib") => {
  const set = kind === "leaf" ? LEAF[plant] : RIB[plant];
  return `color-mix(in oklch, ${set.well} ${Math.round(clamp01(h) * 100)}%, ${set.dry})`;
};

/* ------------------------------------------------------------------ */
/* Dates, read from a day number so server and client agree            */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MO = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MO_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const toMs = (v: number | Date | undefined) =>
  v === undefined ? undefined : typeof v === "number" ? v : v.getTime();
const dateOf = (day: number, long: boolean) => {
  const d = new Date(day * DAY);
  return long
    ? `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MO_LONG[d.getUTCMonth()]}`
    : `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ------------------------------------------------------------------ */
/* Limbs                                                               */
/* ------------------------------------------------------------------ */

type Limb = { pose: MotionValue<number>; sway: MotionValue<number> };
const LIMBS = 7;

function Frond({
  spec,
  limb,
  leaf,
  rib,
}: {
  spec: FrondSpec;
  limb: Limb;
  leaf: MotionValue<string>;
  rib: MotionValue<string>;
}) {
  const paths = useTransform(
    [limb.pose, limb.sway] as MotionValue<number>[],
    ([d = 0, s = 0]: number[]) => frondPaths(spec, d, s),
  );
  const ribD = useTransform(paths, (p) => p.rib);
  const leavesD = useTransform(paths, (p) => p.leaves);
  return (
    <g>
      <motion.path d={leavesD} style={{ fill: leaf }} />
      <motion.path
        d={ribD}
        fill="none"
        strokeWidth={1.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: rib }}
      />
    </g>
  );
}

function Leaf({
  spec,
  outline,
  limb,
  leaf,
  rib,
}: {
  spec: LeafSpec;
  outline: readonly Pt[];
  limb: Limb;
  leaf: MotionValue<string>;
  rib: MotionValue<string>;
}) {
  const paths = useTransform(
    [limb.pose, limb.sway] as MotionValue<number>[],
    ([d = 0, s = 0]: number[]) => leafPaths(spec, outline, d, s),
  );
  const stemD = useTransform(paths, (p) => p.stem);
  const bladeD = useTransform(paths, (p) => p.blade);
  const midD = useTransform(paths, (p) => p.rib);
  return (
    <g>
      <motion.path
        d={stemD}
        fill="none"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: rib }}
      />
      <motion.path d={bladeD} style={{ fill: leaf }} />
      <motion.path
        d={midD}
        fill="none"
        strokeWidth={0.9}
        strokeLinecap="round"
        opacity={0.55}
        style={{ stroke: rib }}
      />
    </g>
  );
}

function Cactus({
  limbs,
  leaf,
  rib,
  ribOpacity,
  bloom,
}: {
  limbs: Limb[];
  leaf: MotionValue<string>;
  rib: MotionValue<string>;
  ribOpacity: MotionValue<number>;
  bloom: MotionValue<number>;
}) {
  const sources = limbs
    .slice(0, 3)
    .flatMap((l) => [l.pose, l.sway]) as MotionValue<number>[];
  const paths = useTransform(
    sources,
    ([b = 0, bs = 0, l = 0, ls = 0, r = 0, rs = 0]: number[]) =>
      cactusPaths(b, bs, l, ls, r, rs),
  );
  const bodyD = useTransform(paths, (p) => p.body);
  const ribsD = useTransform(paths, (p) => p.ribs);
  const spinesD = useTransform(paths, (p) => p.spines);
  const topX = useTransform(paths, (p) => r2(p.top[0]));
  const topY = useTransform(paths, (p) => r2(p.top[1]));
  const bloomOpacity = useTransform(bloom, (b) => r2(clamp01(b * 3)));
  return (
    <g>
      <motion.path d={bodyD} style={{ fill: leaf }} />
      <motion.path
        d={ribsD}
        fill="none"
        strokeWidth={0.9}
        strokeLinecap="round"
        style={{ stroke: rib, opacity: ribOpacity }}
      />
      <motion.path
        d={spinesD}
        fill="none"
        strokeWidth={0.6}
        strokeLinecap="round"
        stroke="oklch(0.92 0.04 95)"
        opacity={0.85}
      />
      <motion.g style={{ x: topX, y: topY }}>
        <motion.g
          style={{
            scale: bloom,
            opacity: bloomOpacity,
            originX: 0.5,
            originY: 0.5,
          }}
        >
          {[0, 72, 144, 216, 288].map((a) => {
            const [dx, dy] = dirOf(a);
            return (
              <ellipse
                key={a}
                cx={r2(dx * 2.6)}
                cy={r2(dy * 2.6)}
                rx={2.2}
                ry={2.2}
                fill="oklch(0.72 0.16 355)"
              />
            );
          })}
          <circle r={1.5} fill="oklch(0.86 0.13 90)" />
        </motion.g>
      </motion.g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The pot                                                             */
/* ------------------------------------------------------------------ */

const RIM_Y = 103;
const BAND_Y = 110;

/** Seeded speckles for the stone pot, fixed so both renders agree. */
const SPECKS: Pt[] = Array.from({ length: 16 }, (_, i) => [
  r2(CX - 22 + 44 * jitter(i, 11)),
  r2(BAND_Y + 4 + 28 * jitter(i, 12)),
]);

function Pot({ pot }: { pot: PlantCarePot }) {
  const look = POTS[pot] ?? POTS.clay;
  const body = `M ${CX - 27} ${BAND_Y - 2} L ${CX - 21} 141 Q ${CX - 21} 144 ${CX - 18} 144 L ${CX + 18} 144 Q ${CX + 21} 144 ${CX + 21} 141 L ${CX + 27} ${BAND_Y - 2} Z`;
  const band = `M ${CX - 30} ${RIM_Y} A 30 5 0 0 0 ${CX + 30} ${RIM_Y} L ${CX + 30} ${BAND_Y} A 30 5 0 0 1 ${CX - 30} ${BAND_Y} Z`;
  return (
    <g>
      <ellipse cx={CX} cy={145} rx={27} ry={2.5} className="fill-ink-3/15" />
      <path d={body} fill={look.body} />
      {pot === "stone"
        ? SPECKS.map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={0.8}
              fill={look.shade}
              opacity={0.5}
            />
          ))
        : null}
      {pot === "glaze" ? (
        <>
          <path
            d={`M ${CX - 22.2} 135 Q ${CX - 14} 139 ${CX - 6} 135.5 T ${CX + 9} 136 T ${CX + 22.2} 135 L ${CX + 21} 141 Q ${CX + 21} 144 ${CX + 18} 144 L ${CX - 18} 144 Q ${CX - 21} 144 ${CX - 21} 141 Z`}
            fill="oklch(0.72 0.06 60)"
          />
          <path
            d={`M ${CX - 20} ${BAND_Y + 3} L ${CX - 16.5} 132`}
            stroke="oklch(0.86 0.04 220)"
            strokeWidth={2.4}
            strokeLinecap="round"
            opacity={0.45}
          />
        </>
      ) : null}
      <path
        d={`M ${CX + 13} ${BAND_Y} L ${CX + 27} ${BAND_Y - 2} L ${CX + 21} 141 Q ${CX + 21} 144 ${CX + 18} 144 L ${CX + 10} 144 Z`}
        fill={look.shade}
        opacity={0.22}
      />
      <path d={band} fill={look.band} />
      <ellipse cx={CX} cy={RIM_Y} rx={30} ry={5} fill={look.lip} />
      <ellipse cx={CX} cy={RIM_Y + 0.3} rx={27.2} ry={3.9} fill={look.inside} />
    </g>
  );
}

function CanIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 6.5h6.5l-.6 6.5H5.6Z" />
      <path d="M5.2 8.5 1.8 5.8" />
      <path d="M1 5.2 2.6 4" />
      <path d="M8 6.5c.4-2.6 3.8-2.8 4.6-.4.4 1.2 0 2.4-.9 3.1" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The widget                                                          */
/* ------------------------------------------------------------------ */

type Api = {
  onCanPose: (v: number) => void;
  tick: (t: number) => void;
  done: () => void;
  finish: () => void;
};

/**
 * A plant that shows how thirsty it is. As the days since watering pass its
 * leaves hang lower and pale, the soil dries and cracks, and a cactus thins
 * and lets its arms sag; the next watering day sits beside it. Pressing
 * Water brings a can in over the pot and tips it, a shower of seeded drops
 * falls in real arcs and splashes, a wet patch spreads through the soil, and
 * when the last drops land the leaves spring back up one after another,
 * centre first.
 *
 * Every leaf is rebuilt each frame from its pose — analytic curves, no
 * transforms on the drawing — so a pointer brushed through the plant flicks
 * the leaves it crosses, crisply on a watered plant and slowly on a thirsty
 * one. Under reduced motion nothing travels or bounces: the can fades in
 * already tipped over a still shower, the soil darkens, and the leaves swap
 * to their new pose while their green returns.
 */
export function PlantCare({
  days,
  defaultDays = 5,
  onDaysChange,
  plant = "fern",
  pot = "clay",
  name,
  interval,
  now,
  utcOffset = 0,
  waterLabel = "Water",
  sound = false,
  disabled = false,
  className,
}: PlantCareProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const agoId = `${uid}-ago`;
  const nextId = `${uid}-next`;
  const soilClip = `${uid}-soil`;

  const kind: PlantCarePlant = plant in INTERVAL ? plant : "fern";
  const potKind: PlantCarePot = pot in POTS ? pot : "clay";
  const label = name ?? NAME[kind];
  const every = Math.max(1, Math.round(interval ?? INTERVAL[kind]));

  const [own, setOwn] = React.useState(() =>
    Math.max(0, Math.round(defaultDays)),
  );
  const current = Math.max(0, Math.round(days ?? own));
  const [busy, setBusy] = React.useState(false);
  const [count, setCount] = React.useState(0);

  const targetsFor = (d: number): Targets => {
    const thirst = d / every;
    const droop = droopOf(thirst);
    const specs =
      kind === "fern"
        ? FERN.map((s) => Math.abs(s.a) / 74)
        : kind === "monstera"
          ? MONSTERA.map((s) => Math.abs(s.a) / 56)
          : [0.7, 1, 1];
    return {
      // Older, outer leaves give up first.
      limbs: specs.map((outer) => clamp01(droop * (0.82 + 0.36 * outer))),
      hydration: 1 - paleOf(thirst),
      soil: 1 - dryOf(thirst),
      bloom: kind === "cactus" && thirst < 0.2 ? 1 : 0,
      turgor: 1 - droop,
    };
  };
  const targets = targetsFor(current);
  const targetKey = `${kind}|${every}|${current}|${motionSafe}`;

  const [limbs] = React.useState<Limb[]>(() =>
    Array.from({ length: LIMBS }, (_, i) => ({
      pose: motionValue(targets.limbs[i] ?? 0),
      sway: motionValue(0),
    })),
  );
  const hydration = useMotionValue(targets.hydration);
  const soil = useMotionValue(targets.soil);
  const bloom = useMotionValue(targets.bloom);
  const wet = useMotionValue(0);
  const canPose = useMotionValue(0);
  const canLift = useMotionValue(0);
  const canOn = useMotionValue(0);
  const clock = useMotionValue(-1);
  const stillOn = useMotionValue(0);

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const loop = React.useRef<LoopHandle | null>(null);
  const drawing = React.useRef<HTMLDivElement | null>(null);
  const watering = React.useRef({
    busy: false,
    pouring: false,
    events: 0,
    perked: "",
  });
  const brush = React.useRef<{ angle: number; t: number } | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const pan = () => {
    const rect = drawing.current?.getBoundingClientRect();
    return rect ? panFrom(rect.left + (PATCH_X / W) * rect.width, null) : 0;
  };

  const stopLoop = () => {
    loop.current?.stop();
    loop.current = null;
  };

  /** The plant goes to where its days say, one limb after another. */
  const settle = (t: Targets, perk: boolean) => {
    const n = kind === "fern" ? FERN.length : kind === "monstera" ? 5 : 3;
    for (let i = 0; i < LIMBS; i += 1) {
      const limb = limbs[i];
      if (!limb) continue;
      const to = t.limbs[i] ?? 0;
      if (!motionSafe) {
        halt(`pose-${i}`);
        limb.pose.set(to);
        continue;
      }
      const rising = to < limb.pose.get();
      const velocity = limb.pose.getVelocity();
      // A leaf already on its way keeps going; one at rest waits its turn.
      const moving = Math.abs(velocity) > 0.05;
      // Water comes back fast and the leaves spring up past level once;
      // thirst takes hold slowly and never overshoots.
      run(
        `pose-${i}`,
        animate(
          limb.pose,
          to,
          rising
            ? {
                ...springs.snap,
                velocity,
                delay: moving ? 0 : i * cascade(n),
              }
            : { ...springs.drift, velocity, delay: moving ? 0 : i * 0.03 },
        ),
      );
    }
    run(
      "hydration",
      animate(hydration, t.hydration, {
        duration: durations.page,
        ease: easings.enter,
      }),
    );
    run(
      "soil",
      animate(soil, t.soil, { duration: durations.page, ease: easings.enter }),
    );
    run(
      "bloom",
      motionSafe
        ? animate(bloom, t.bloom, {
            ...(t.bloom > bloom.get()
              ? { ...springs.recoil, delay: perk ? n * cascade(n) : 0 }
              : { duration: durations.base, ease: easings.exit }),
          })
        : animate(bloom, t.bloom, { duration: durations.base }),
    );
  };

  const water = () => {
    if (disabled || watering.current.busy) return;
    const w = watering.current;
    w.busy = true;
    w.pouring = false;
    w.events = 0;
    setBusy(true);
    setCount((c) => c + 1);
    if (days === undefined) setOwn(0);
    onDaysChange?.(0);
    clock.set(-1);
    wet.set(0);
    if (!motionSafe) {
      halt("canPose");
      canLift.set(0);
      run(
        "canOn",
        animate(canOn, 1, { duration: durations.base, ease: easings.enter }),
      );
      // Already tipped: the pour starts as it appears.
      canPose.set(1);
      return;
    }
    canLift.set(-distances.step);
    run(
      "canOn",
      animate(canOn, 1, { duration: durations.fast, ease: easings.enter }),
    );
    run("canLift", animate(canLift, 0, springs.snap));
    // The snap spring's one overshoot is the water's weight in the can.
    run("canPose", animate(canPose, 1, { ...springs.snap, delay: 0.1 }));
  };

  const onCanPose = (v: number) => {
    const w = watering.current;
    if (!w.busy || w.pouring || v < 0.72) return;
    w.pouring = true;
    loop.current?.stop();
    loop.current = audio.start("pour", { pitch: 1.15, gain: 0.55, pan: pan() });
    if (!motionSafe) stillOn.set(1);
    clock.set(0);
    run(
      "clock",
      animate(clock, POUR_END, {
        duration: POUR_END,
        ease: "linear",
        onUpdate: (t) => api.current?.tick(t),
        onComplete: () => api.current?.done(),
      }),
    );
  };

  const plip = (k: number) =>
    audio.play("plip", {
      pitch: r2(0.92 + 0.2 * k),
      gain: r2(0.42 + 0.06 * k),
      pan: pan(),
    });

  const tick = (t: number) => {
    const w = watering.current;
    if (!(w.events & 1) && t >= FIRST_LAND) {
      w.events |= 1;
      plip(0);
      run(
        "wet",
        animate(wet, 1, {
          duration: motionSafe ? 0.55 : durations.slow,
          ease: easings.enter,
        }),
      );
      run("soil", animate(soil, 1, { duration: POUR, ease: easings.enter }));
    }
    if (!(w.events & 2) && t >= FIRST_LAND + POUR / 2) {
      w.events |= 2;
      plip(1);
    }
    if (!(w.events & 4) && t >= POUR) {
      w.events |= 4;
      stopLoop();
      stillOn.set(0);
      if (motionSafe) {
        run("canPose", animate(canPose, 0, springs.glide));
        run(
          "canOn",
          animate(canOn, 0, { ...exitFor(durations.base), delay: 0.25 }),
        );
      } else {
        run(
          "canOn",
          animate(canOn, 0, {
            ...exitFor(durations.base),
            onComplete: () => canPose.set(0),
          }),
        );
      }
    }
    if (!(w.events & 8) && t >= LAST_LAND) {
      w.events |= 8;
      w.perked = targetKey;
      plip(2);
      settle(targets, true);
    }
  };

  /** The clock has run out: the watering is over. */
  const done = () => {
    const w = watering.current;
    w.busy = false;
    w.pouring = false;
    clock.set(-1);
    wet.set(0);
    setBusy(false);
    // The host moved the days while the water was falling: catch up now.
    if (w.perked !== targetKey) settle(targets, false);
  };

  /** The page went away mid-watering: everything goes to its end now. */
  const finish = () => {
    const w = watering.current;
    if (!w.busy) return;
    for (const key of ["clock", "canPose", "canOn", "canLift", "wet"]) {
      halt(key);
    }
    stopLoop();
    stillOn.set(0);
    canOn.set(0);
    canPose.set(0);
    canLift.set(0);
    done();
    for (let i = 0; i < LIMBS; i += 1) {
      halt(`pose-${i}`);
      limbs[i]?.pose.set(targets.limbs[i] ?? 0);
    }
    halt("hydration");
    halt("soil");
    halt("bloom");
    hydration.set(targets.hydration);
    soil.set(targets.soil);
    bloom.set(targets.bloom);
  };

  React.useEffect(() => {
    api.current = { onCanPose, tick, done, finish };
  });

  // A new plant is a new drawing: its leaves start where its days put them.
  React.useEffect(() => {
    const t = targetsFor(current);
    for (let i = 0; i < LIMBS; i += 1) {
      anims.current.get(`pose-${i}`)?.stop();
      anims.current.get(`sway-${i}`)?.stop();
      limbs[i]?.pose.jump(t.limbs[i] ?? 0);
      limbs[i]?.sway.jump(0);
    }
    bloom.jump(t.bloom);
    // Only a change of drawing jumps; days are animated below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  // Days from the host — a day passing, a tweak — move the plant there.
  // Re-run as often as it likes: it always heads for the same pose.
  React.useEffect(() => {
    if (watering.current.busy) return;
    const t = targetsFor(current);
    settle(t, false);
    // The key carries every input of the targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  React.useEffect(
    () => canPose.on("change", (v) => api.current?.onCanPose(v)),
    [canPose],
  );

  React.useEffect(() => {
    const away = () => {
      if (document.hidden) api.current?.finish();
    };
    document.addEventListener("visibilitychange", away);
    return () => document.removeEventListener("visibilitychange", away);
  }, []);

  React.useEffect(() => {
    if (disabled) api.current?.finish();
  }, [disabled]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      loop.current?.stop();
      loop.current = null;
      // Unmounted mid-watering in development, the next mount starts clean.
      watering.current = {
        busy: false,
        pouring: false,
        events: 0,
        perked: "",
      };
    };
  }, []);

  /* Brushing ---------------------------------------------------------- */

  /** Where each limb points, as an angle about the stems' root, and how far it reaches. */
  const aims = (): { angle: number; reach: number }[] => {
    const from = (p: Pt) => ({
      angle: (Math.atan2(p[0] - CX, SOIL - p[1]) * 180) / Math.PI,
      reach: Math.hypot(p[0] - CX, p[1] - SOIL),
    });
    if (kind === "fern") {
      return FERN.map((sp, i) => {
        const pts = frondRib(
          sp,
          limbs[i]?.pose.get() ?? 0,
          limbs[i]?.sway.get() ?? 0,
        );
        const mid = pts[6] ?? pts[0] ?? [CX, SOIL];
        const tip = pts[pts.length - 1] ?? mid;
        return {
          angle: from([mid[0], mid[1]]).angle,
          reach: from([tip[0], tip[1]]).reach,
        };
      });
    }
    if (kind === "monstera") {
      return MONSTERA.map((sp, i) =>
        from(
          leafPaths(
            sp,
            [],
            limbs[i]?.pose.get() ?? 0,
            limbs[i]?.sway.get() ?? 0,
          ).tip,
        ),
      );
    }
    const c = cactusPaths(
      limbs[0]?.pose.get() ?? 0,
      0,
      limbs[1]?.pose.get() ?? 0,
      0,
      limbs[2]?.pose.get() ?? 0,
      0,
    );
    const top = from(c.top);
    return [{ angle: top.angle, reach: top.reach + 4 }, ...c.tips.map(from)];
  };

  const onBrush = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !motionSafe) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = ((event.clientX - rect.left) * W) / rect.width;
    const y = ((event.clientY - rect.top) * H) / rect.height;
    const angle = (Math.atan2(x - CX, SOIL - y) * 180) / Math.PI;
    const radius = Math.hypot(x - CX, y - SOIL);
    const last = brush.current;
    brush.current = { angle, t: event.timeStamp };
    if (!last || radius < 8) return;
    const dt = Math.max(8, event.timeStamp - last.t) / 1000;
    // Under the stems the angle wraps from +180 to -180: that is not a sweep.
    if (Math.abs(angle - last.angle) > 90) return;
    const omega = Math.max(-900, Math.min(900, (angle - last.angle) / dt));
    if (Math.abs(omega) < 20) return;
    // Turgor is the spring: a watered leaf snaps back, a thirsty one swings
    // slow and loose and further.
    const turgor = targets.turgor;
    const k = lerp(110, 520, turgor);
    const ratio = lerp(0.26, 0.42, turgor);
    aims().forEach((aim, i) => {
      const limb = limbs[i];
      if (!limb || radius > aim.reach * 1.2) return;
      if (Math.sign(last.angle - aim.angle) === Math.sign(angle - aim.angle)) {
        return;
      }
      run(
        `sway-${i}`,
        animate(limb.sway, 0, {
          ...spring(k, ratio),
          velocity: limb.sway.getVelocity() + omega * lerp(0.6, 0.35, turgor),
        }),
      );
    });
  };

  /* Drawing ------------------------------------------------------------ */

  const leafFill = useTransform(hydration, (h) => mixLeaf(kind, h, "leaf"));
  const ribStroke = useTransform(hydration, (h) => mixLeaf(kind, h, "rib"));
  const ribOpacity = useTransform(hydration, (h) => r2(lerp(0.75, 0.35, h)));
  const soilFill = useTransform(
    soil,
    (s) =>
      `color-mix(in oklab, ${SOIL_WET} ${Math.round(clamp01(s) * 100)}%, ${SOIL_DRY})`,
  );
  const cracks = useTransform(soil, (s) => r2(clamp01(1 - s * 1.4) * 0.7));
  const patchRx = useTransform(wet, (v) => r2(34 * v));
  const patchRy = useTransform(wet, (v) => r2(1 + 6 * v));
  const patchOpacity = useTransform(wet, (v) => (v > 0.001 ? 0.92 : 0));

  const can = useTransform(
    [canPose, canLift] as MotionValue<number>[],
    ([p = 0, l = 0]: number[]) => {
      const [h0, h1, h2] = placeCan(HANDLE, p, l);
      return {
        body: poly(placeCan(CAN_BODY, p, l)),
        band: poly(placeCan(CAN_BAND, p, l)),
        spout: poly(placeCan(CAN_SPOUT, p, l)),
        rose: poly(placeCan(CAN_ROSE, p, l)),
        handle: h0 && h1 && h2 ? `M ${f(h0)} Q ${f(h1)} ${f(h2)}` : "",
      };
    },
  );
  const canBody = useTransform(can, (c) => c.body);
  const canBand = useTransform(can, (c) => c.band);
  const canSpout = useTransform(can, (c) => c.spout);
  const canRose = useTransform(can, (c) => c.rose);
  const canHandle = useTransform(can, (c) => c.handle);

  const drops = useTransform(clock, (t) =>
    t < 0 || !motionSafe ? { streaks: "", specks: "" } : dropPaths(t),
  );
  const streaks = useTransform(drops, (d) => d.streaks);
  const specks = useTransform(drops, (d) => d.specks);
  const still = React.useMemo(() => {
    const holes = placeCan(HOLES, 1, 0);
    return holes
      .map((h, k) => {
        const land: Pt = [PATCH_X + (k - 1.5) * 5, LANDING - 1];
        return `M ${f(h)} Q ${f([r2((h[0] + land[0]) / 2 - 6), h[1]])} ${f(land)}`;
      })
      .join(" ");
  }, []);

  /* Words -------------------------------------------------------------- */

  const nowMs = toMs(now);
  const today =
    nowMs === undefined
      ? undefined
      : Math.floor((nowMs + utcOffset * 60_000) / DAY);
  const due = every - current;
  const ago =
    current === 0
      ? "Watered today"
      : current === 1
        ? "Watered yesterday"
        : `Watered ${current} days ago`;
  const tone: "ok" | "soon" | "late" =
    due < 0 ? "late" : due <= 1 ? "soon" : "ok";
  const next =
    due < 0
      ? `${plural(-due, "day")} overdue`
      : due === 0
        ? "Water today"
        : due === 1
          ? "Water tomorrow"
          : today !== undefined
            ? `Next ${dateOf(today + due, false)}`
            : `Next in ${due} days`;
  const nextSpoken =
    due < 0
      ? `${plural(-due, "day")} overdue`
      : due === 0
        ? "water today"
        : due === 1
          ? "water tomorrow"
          : today !== undefined
            ? `next watering ${dateOf(today + due, true)}`
            : `next watering in ${due} days`;
  const droop = droopOf(current / every);
  const look =
    kind === "cactus"
      ? droop < 0.15
        ? "plump"
        : droop < 0.6
          ? "thinning"
          : "shrivelled"
      : droop < 0.15
        ? "upright"
        : droop < 0.6
          ? "drooping"
          : "wilting";
  const picture = `${label} in ${POT_WORD[potKind]} pot, ${look}`;

  // The sentence is frozen in the render that changes it, from the new
  // values: a watering the host refused is never announced as one.
  const sayKey = `${current}|${count}`;
  const [said, setSaid] = React.useState({
    key: sayKey,
    count,
    n: 0,
    text: "",
  });
  if (said.key !== sayKey) {
    const watered = count !== said.count && current === 0;
    const nextDue = every;
    setSaid({
      key: sayKey,
      count,
      n: said.n + 1,
      text: watered
        ? `${label} watered. ${
            nextDue === 1
              ? "Next watering tomorrow."
              : today !== undefined
                ? `Next watering ${dateOf(today + nextDue, true)}.`
                : `Next watering in ${nextDue} days.`
          }`
        : `${label}: ${current === 0 ? "watered today" : `${plural(current, "day")} since watering`}, ${nextSpoken}.`,
    });
  }

  const dot =
    tone === "late" ? "bg-danger" : tone === "soon" ? "bg-warn" : "bg-success";

  return (
    <div className={cn("@container w-full max-w-xs", className)}>
      <div
        role="group"
        aria-labelledby={titleId}
        aria-describedby={`${agoId} ${nextId}`}
        className={cn(
          "flex items-center gap-3 rounded-4 border border-hairline bg-card p-3",
          disabled && "opacity-50",
        )}
      >
        <div
          ref={drawing}
          role="img"
          aria-label={picture}
          onPointerMove={onBrush}
          onPointerLeave={() => {
            brush.current = null;
          }}
          onPointerCancel={() => {
            brush.current = null;
          }}
          className="relative w-[112px] shrink-0 touch-pan-y select-none @[19rem]:w-[136px]"
        >
          <svg
            aria-hidden
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full overflow-hidden"
          >
            <defs>
              <clipPath id={soilClip}>
                <ellipse cx={CX} cy={RIM_Y + 0.8} rx={25.6} ry={3.2} />
              </clipPath>
            </defs>
            <circle cx={CX} cy={80} r={56} className="fill-surface-2" />
            <Pot pot={potKind} />
            <motion.ellipse
              cx={CX}
              cy={RIM_Y + 0.8}
              rx={25.6}
              ry={3.2}
              style={{ fill: soilFill }}
            />
            <g clipPath={`url(#${soilClip})`}>
              <motion.path
                d={`M ${CX - 17} ${RIM_Y + 0.4} l 4 1 l 3 -0.6 M ${CX + 6} ${RIM_Y + 1.8} l 5 -0.8 l 2 1 M ${CX - 4} ${RIM_Y - 0.9} l 3 0.7`}
                fill="none"
                strokeWidth={0.6}
                strokeLinecap="round"
                stroke="oklch(0.45 0.04 60)"
                style={{ opacity: cracks }}
              />
              <motion.ellipse
                cx={PATCH_X}
                cy={RIM_Y + 1}
                rx={patchRx}
                ry={patchRy}
                fill={SOIL_WET}
                style={{ opacity: patchOpacity }}
              />
            </g>

            {kind === "fern"
              ? FERN.map((spec, i) => ({ spec, i }))
                  .reverse()
                  .map(({ spec, i }) =>
                    limbs[i] ? (
                      <Frond
                        key={`fern-${i}`}
                        spec={spec}
                        limb={limbs[i]}
                        leaf={leafFill}
                        rib={ribStroke}
                      />
                    ) : null,
                  )
              : null}
            {kind === "monstera"
              ? MONSTERA.map((spec, i) => ({ spec, i }))
                  .reverse()
                  .map(({ spec, i }) =>
                    limbs[i] && BLADES[i] ? (
                      <Leaf
                        key={`monstera-${i}`}
                        spec={spec}
                        outline={BLADES[i]}
                        limb={limbs[i]}
                        leaf={leafFill}
                        rib={ribStroke}
                      />
                    ) : null,
                  )
              : null}
            {kind === "cactus" ? (
              <Cactus
                limbs={limbs}
                leaf={leafFill}
                rib={ribStroke}
                ribOpacity={ribOpacity}
                bloom={bloom}
              />
            ) : null}

            <motion.path
              d={still}
              fill="none"
              stroke={WATER}
              strokeWidth={1.1}
              strokeDasharray="2 3"
              strokeLinecap="round"
              style={{ opacity: stillOn }}
            />
            <motion.path
              d={streaks}
              fill="none"
              stroke={WATER}
              strokeWidth={1.3}
              strokeLinecap="round"
            />
            <motion.path
              d={specks}
              fill="none"
              stroke={WATER}
              strokeWidth={1.1}
              strokeLinecap="round"
            />

            <motion.g style={{ opacity: canOn }}>
              <motion.path
                d={canHandle}
                fill="none"
                stroke="oklch(0.55 0.02 240)"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
              <motion.path d={canSpout} fill="oklch(0.66 0.018 240)" />
              <motion.path d={canRose} fill="oklch(0.55 0.02 240)" />
              <motion.path d={canBody} fill="oklch(0.75 0.015 240)" />
              <motion.path d={canBand} fill="oklch(0.58 0.02 240)" />
            </motion.g>
          </svg>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="min-w-0">
            <p
              id={titleId}
              title={label}
              className="truncate text-sm font-medium text-foreground"
            >
              {label}
            </p>
            <p id={agoId} className="text-xs text-ink-3">
              {ago}
            </p>
          </div>
          <p
            id={nextId}
            className={cn(
              "inline-grid text-xs",
              tone === "late"
                ? "text-danger"
                : tone === "soon"
                  ? "text-warn"
                  : "text-ink-2",
            )}
          >
            <AnimatePresence initial={false}>
              <motion.span
                key={next}
                className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5"
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? springs.snap
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                <span
                  aria-hidden
                  className={cn("size-1.5 shrink-0 rounded-full", dot)}
                />
                <span className="min-w-0">{next}</span>
              </motion.span>
            </AnimatePresence>
          </p>
          <button
            type="button"
            onClick={water}
            disabled={disabled}
            aria-disabled={busy || undefined}
            aria-label={`${waterLabel} ${label}`}
            className={cn(
              "inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-[background-color,opacity] outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              "enabled:hover:bg-primary/90 disabled:cursor-not-allowed aria-disabled:cursor-progress aria-disabled:opacity-70",
            )}
          >
            <CanIcon className="size-4 shrink-0" />
            <span className="truncate">{waterLabel}</span>
          </button>
        </div>
      </div>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
