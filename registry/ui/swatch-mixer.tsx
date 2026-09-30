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
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SwatchMixerReadout = "hex" | "oklch";

export type SwatchMixerProps = {
  /** Controlled colour, `#rrggbb`, or `""` for an empty well. */
  value?: string;
  /** Initial colour when uncontrolled. @default "" */
  defaultValue?: string;
  /** Fires from the drop, key or press that changed the mix, with the new colour. */
  onValueChange?: (value: string) => void;
  /** The field's visible label and the pigments' group name. */
  label: string;
  /** Form field name; the colour rides a hidden input. */
  name?: string;
  /** Guidance under the well. */
  hint?: string;
  /** An error from the host; shown under the well and announced once. */
  error?: string;
  /** Marks the field required; an emptied well then says so. @default false */
  required?: boolean;
  disabled?: boolean;
  /** How many pigment pots the palette offers, 3 to 6. @default 4 */
  pigments?: number;
  /** How much the well swirls as a part mixes in, 0 to 1. @default 0.6 */
  swirl?: number;
  /** The readout's format. @default "hex" */
  readout?: SwatchMixerReadout;
  /** Play the drops. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

type Lab = readonly [number, number, number];
type Pigment = {
  id: string;
  name: string;
  css: string;
  lab: Lab;
  light: number;
};
type Entry = { value: string; recipe: readonly number[] };
type Mix = {
  value: string;
  count: number;
  recipe: readonly number[];
  prev: Entry | null;
};
type Pt = { x: number; y: number };
/** Where a new pigment's streak starts, and its colour. */
type Streak = { a: number; r: number; color: string };
type Geo = {
  left: number;
  top: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  scale: number;
};

/** The well's drawing, in px: the dish, its recipe ring and the paint. */
const SIZE = 132;
const C = SIZE / 2;
const DISH_R = 65;
const RING_OUT = 63;
const RING_IN = 55;
const PAINT_R = 51;
const MAX_PARTS = 8;
const BLOB = 28;
const HOP = 0.34;
const HISTORY = 5;
const SETTLE_MS = 700;
const ZERO: readonly number[] = [0, 0, 0, 0, 0, 0];
const TAU = Math.PI * 2;

const fix = (v: number, d: number) => {
  const n = Number(v.toFixed(d));
  return Object.is(n, -0) ? 0 : n;
};
const r2 = (v: number) => fix(v, 2);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const fromLch = (l: number, c: number, h: number): Lab => {
  const a = (h * Math.PI) / 180;
  return [l, fix(c * Math.cos(a), 6), fix(c * Math.sin(a), 6)];
};

// Paint is fixed art: the same pigment in either theme. Three are the
// primaries; the fourth adds white, the fifth black, the sixth a green.
const PIGMENTS: readonly Pigment[] = (
  [
    ["madder", "Madder", 0.56, 0.19, 25],
    ["ochre", "Ochre", 0.83, 0.15, 86],
    ["cobalt", "Cobalt", 0.5, 0.17, 262],
    ["chalk", "Chalk", 0.97, 0.012, 95],
    ["soot", "Soot", 0.25, 0.02, 265],
    ["moss", "Moss", 0.6, 0.13, 148],
  ] as const
).map(([id, name, l, c, h]) => ({
  id,
  name,
  css: `oklch(${l} ${c} ${h})`,
  lab: fromLch(l, c, h),
  light: l,
}));

const encode = (x: number) =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
const decode = (x: number) =>
  x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);

/** OKLab to `#rrggbb`, clipped to sRGB. */
function hexOf([L, a, b]: Lab): string {
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;
  const channel = (v: number) =>
    Math.round(clamp01(encode(v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3)}${channel(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3)}${channel(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3)}`;
}

/** `#rgb` or `#rrggbb` to OKLab, rounded so server and browser agree. */
function labOf(hex: string): Lab | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  const digits = match?.[1];
  if (!digits) return null;
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  const [r, g, b] = [0, 2, 4].map((i) =>
    decode(parseInt(full.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    fix(0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 6),
    fix(1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 6),
    fix(0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s, 6),
  ];
}

const normalise = (v: string | undefined): string => {
  const lab = v ? labOf(v) : null;
  if (!lab || !v) return "";
  const digits = v.trim().replace(/^#/, "").toLowerCase();
  return digits.length === 6
    ? `#${digits}`
    : `#${digits
        .split("")
        .map((d) => d + d)
        .join("")}`;
};

const labCss = (lab: Lab) =>
  `oklab(${fix(lab[0], 4)} ${fix(lab[1], 4)} ${fix(lab[2], 4)})`;

/** The parts-weighted average of the pigments, in OKLab: the mix itself. */
function mixOf(recipe: readonly number[], count: number): Lab | null {
  let total = 0;
  let L = 0;
  let A = 0;
  let B = 0;
  for (let i = 0; i < count; i += 1) {
    const k = recipe[i] ?? 0;
    const p = PIGMENTS[i];
    if (!k || !p) continue;
    total += k;
    L += k * p.lab[0];
    A += k * p.lab[1];
    B += k * p.lab[2];
  }
  if (total === 0) return null;
  return [fix(L / total, 6), fix(A / total, 6), fix(B / total, 6)];
}

const valueOf = (recipe: readonly number[], count: number) => {
  const lab = mixOf(recipe, count);
  return lab ? hexOf(lab) : "";
};

const partsIn = (recipe: readonly number[], count: number) =>
  recipe.slice(0, count).reduce((s, k) => s + k, 0);

const sharesOf = (recipe: readonly number[], count: number) => {
  const total = partsIn(recipe, count);
  return PIGMENTS.map((_, i) =>
    i < count && total ? fix((recipe[i] ?? 0) / total, 6) : 0,
  );
};

/** Euclidean projection onto the probability simplex. */
function toSimplex(v: number[]): number[] {
  const u = [...v].sort((p, q) => q - p);
  let sum = 0;
  let theta = 0;
  for (let j = 0; j < u.length; j += 1) {
    sum += u[j] ?? 0;
    const t = (sum - 1) / (j + 1);
    if ((u[j] ?? 0) - t > 0) theta = t;
  }
  return v.map((x) => Math.max(0, x - theta));
}

/** Whole parts that share `total` as closely as possible to the weights. */
function apportion(w: readonly number[], total: number): number[] {
  const raw = w.map((v) => v * total);
  const out = raw.map((v) => Math.floor(v));
  let left = total - out.reduce((s, v) => s + v, 0);
  const order = raw
    .map((v, i) => ({ f: v - Math.floor(v), i }))
    .sort((p, q) => q.f - p.f || p.i - q.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] = (out[i] ?? 0) + 1;
    left -= 1;
  }
  return out;
}

const distance = (p: Lab, q: Lab) =>
  Math.sqrt(
    (p[0] - q[0]) * (p[0] - q[0]) +
      (p[1] - q[1]) * (p[1] - q[1]) +
      (p[2] - q[2]) * (p[2] - q[2]),
  );

/**
 * The recipe nearest a colour the palette may not make exactly: the
 * non-negative weights summing to one whose mix is closest in OKLab
 * (projected gradient on the simplex), then the fewest whole parts that keep
 * it that close.
 */
function nearest(target: Lab, count: number): number[] {
  const P = PIGMENTS.slice(0, count).map((p) => p.lab);
  let norm = 0;
  for (const p of P) norm += p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
  const step = 1 / (2 * norm);
  let w = P.map(() => 1 / P.length);
  for (let it = 0; it < 500; it += 1) {
    let m0 = 0;
    let m1 = 0;
    let m2 = 0;
    P.forEach((p, i) => {
      const k = w[i] ?? 0;
      m0 += k * p[0];
      m1 += k * p[1];
      m2 += k * p[2];
    });
    const d0 = m0 - target[0];
    const d1 = m1 - target[1];
    const d2 = m2 - target[2];
    w = toSimplex(
      w.map((k, i) => {
        const p = P[i] as Lab;
        return k - step * 2 * (p[0] * d0 + p[1] * d1 + p[2] * d2);
      }),
    );
  }
  let best: number[] = [];
  let bestErr = Infinity;
  for (let total = 1; total <= MAX_PARTS * P.length; total += 1) {
    const parts = apportion(w, total);
    if (parts.some((k) => k > MAX_PARTS)) continue;
    const mix = mixOf(parts, P.length);
    if (!mix) continue;
    const err = distance(mix, target);
    if (err < bestErr - 1e-9) {
      best = parts;
      bestErr = err;
    }
    if (err < 0.004) break;
  }
  return PIGMENTS.map((_, i) => best[i] ?? 0);
}

const fits = (recipe: readonly number[], count: number) =>
  recipe.every((k, i) => i < count || k === 0);

/** A recipe for a value: one already known for it, or the nearest mix. */
function recipeFor(
  value: string,
  count: number,
  known: readonly (Entry | null | undefined)[],
): readonly number[] {
  if (!value) return ZERO;
  for (const k of known) {
    if (k && k.value === value && fits(k.recipe, count)) return k.recipe;
  }
  const lab = labOf(value);
  return lab ? nearest(lab, count) : ZERO;
}

function readoutOf(value: string, format: SwatchMixerReadout): string {
  if (!value) return "No colour";
  if (format === "hex") return value.toUpperCase();
  const lab = labOf(value);
  if (!lab) return value;
  const chroma = Math.sqrt(lab[1] * lab[1] + lab[2] * lab[2]);
  const hue =
    chroma < 0.005
      ? 0
      : Math.round(((Math.atan2(lab[2], lab[1]) * 180) / Math.PI + 360) % 360) %
        360;
  return `oklch(${lab[0].toFixed(2)} ${(chroma < 0.005 ? 0 : chroma).toFixed(2)} ${hue})`;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** A glossy blob of paint: lit from the top left, shaded toward black. */
const blobFill = (css: string) =>
  `radial-gradient(circle at 34% 30%, color-mix(in oklab, ${css} 45%, white) 0%, ${css} 42%, color-mix(in oklab, ${css} 76%, black) 100%)`;
const BLOB_SHADOW =
  "inset 0 -2px 3px color-mix(in oklab, black 16%, transparent), 0 1px 3px color-mix(in oklab, black 22%, transparent)";

/** A loose spiral from `r0` in to `r1` over `span` radians, from angle `a0`. */
function swirlPath(a0: number, r0: number, r1: number, span: number) {
  const pts: string[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const u = i / 14;
    const r = r0 + (r1 - r0) * u;
    const a = a0 + span * u;
    pts.push(`${r2(C + r * Math.cos(a))} ${r2(C + r * Math.sin(a))}`);
  }
  return `M ${pts.join(" L ")}`;
}

/** One pigment's stretch of the rim: an annular sector as long as its share. */
function sectorPath(shares: readonly number[], index: number): string {
  const live = shares.filter((s) => s > 0.001).length;
  let before = 0;
  for (let i = 0; i < index; i += 1) before += shares[i] ?? 0;
  const share = shares[index] ?? 0;
  if (share <= 0.001) return "";
  if (share >= 0.999) {
    const ring = (r: number) =>
      `M ${C + r} ${C} A ${r} ${r} 0 1 1 ${C - r} ${C} A ${r} ${r} 0 1 1 ${C + r} ${C} Z`;
    return `${ring(RING_OUT)} ${ring(RING_IN)}`;
  }
  const gap = live > 1 ? 0.045 : 0;
  const a0 = -Math.PI / 2 + before * TAU + gap / 2;
  const a1 = -Math.PI / 2 + (before + share) * TAU - gap / 2;
  if (a1 - a0 < 0.004) return "";
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const at = (r: number, a: number) =>
    `${r2(C + r * Math.cos(a))} ${r2(C + r * Math.sin(a))}`;
  return [
    `M ${at(RING_OUT, a0)}`,
    `A ${RING_OUT} ${RING_OUT} 0 ${large} 1 ${at(RING_OUT, a1)}`,
    `L ${at(RING_IN, a1)}`,
    `A ${RING_IN} ${RING_IN} 0 ${large} 0 ${at(RING_IN, a0)}`,
    "Z",
  ].join(" ");
}

/** The middle of a pigment's stretch of rim, as an angle. */
function sectorMid(shares: readonly number[], index: number): number {
  let before = 0;
  for (let i = 0; i < index; i += 1) before += shares[i] ?? 0;
  return -Math.PI / 2 + (before + (shares[index] ?? 0) / 2) * TAU;
}

/**
 * The new pigment's streak: a curl from where it landed toward the middle,
 * carried round as the paint turns. `t` is the stir's progress.
 */
function streakPath(t: number, a0: number, r0: number, swirl: number) {
  const head = Math.min(1, 0.3 + t * 2.2);
  const spin = t * (0.35 + swirl * 1.25) * TAU;
  const curl = Math.PI * (0.6 + swirl);
  const pts: string[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const u = (head * i) / 16;
    const r = r0 * (1 - 0.78 * u);
    const a = a0 + spin + u * curl;
    pts.push(`${r2(C + r * Math.cos(a))} ${r2(C + r * Math.sin(a))}`);
  }
  return `M ${pts.join(" L ")}`;
}

/** One stretch of the recipe ring, redrawn from the share values each frame. */
function Sector({
  shares,
  index,
  color,
  lifted,
}: {
  shares: MotionValue<number>[];
  index: number;
  color: string;
  lifted: boolean;
}) {
  const d = useTransform(shares, (v: number[]) => sectorPath(v, index));
  // The dim is on a plain group: motion keeps an SVG element's first style.
  return (
    <g className="transition-opacity" style={{ opacity: lifted ? 0.3 : 1 }}>
      <motion.path d={d} className="cursor-grab" style={{ fill: color }} />
    </g>
  );
}

/**
 * A colour input you fill by mixing paint. A pigment is dragged off its pot —
 * the blob follows the pointer 1:1 — and let go over the well, where it sinks
 * in with a ripple and the well lands on the recoil spring; a tap, or Up on
 * the pot, hops a blob in along a short arc. The colour is the parts-weighted
 * average of the pigments in OKLab, and it does not swap: the new pigment
 * curls in as a streak, two stir lines sweep round, and the paint's OKLab
 * channels travel from the old mix to the new one over the same stir. `swirl`
 * sets how long and how far it swirls.
 *
 * The dish's rim is the recipe — one segment per pigment, as long as its
 * share, re-dividing on the glide spring — and a segment dragged out of the
 * dish takes that pigment out of the mix. A mix that stands still is kept in
 * the recent strip, where a press restores it. The value is `#rrggbb` on a
 * hidden input; a value the host sets is shown exactly, with the nearest
 * recipe the palette can make on the rim.
 *
 * Each pot is a slider: Left and Right move between pigments, Up, Enter and
 * Space add a part, Down takes one away, Delete or Home take the pigment out,
 * End fills it. Under reduced motion nothing travels, swirls or bounces: the
 * ring re-divides and the paint cross-fades, because the mix is the value.
 */
export function SwatchMixer({
  value,
  defaultValue,
  onValueChange,
  label,
  name,
  hint,
  error,
  required = false,
  disabled = false,
  pigments = 4,
  swirl = 0.6,
  readout = "hex",
  sound = false,
  className,
}: SwatchMixerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-error`;
  const clipId = `${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-paint`;
  const count = Math.round(Math.min(6, Math.max(3, pigments)));
  const sw = clamp01(swirl);
  const format: SwatchMixerReadout = readout === "oklch" ? "oklch" : "hex";

  const [own, setOwn] = React.useState(() => normalise(defaultValue));
  const controlled = value !== undefined;
  const current = controlled ? normalise(value) : own;

  const [mix, setMix] = React.useState<Mix>(() => ({
    value: current,
    count,
    recipe: recipeFor(current, count, []),
    prev: null,
  }));
  const [history, setHistory] = React.useState<Entry[]>(() =>
    mix.value ? [{ value: mix.value, recipe: mix.recipe }] : [],
  );

  // A value that is not the one this mix makes — the host set it, refused a
  // change, or the palette changed — gets a recipe: the one it had, if it is
  // known, or the nearest one the palette can make.
  let recipe = mix.recipe;
  if (mix.value !== current || mix.count !== count) {
    recipe = recipeFor(current, count, [
      mix.prev,
      mix.value === current ? mix : null,
      ...history,
    ]);
    setMix({
      value: current,
      count,
      recipe,
      prev:
        mix.value !== current
          ? { value: mix.value, recipe: mix.recipe }
          : mix.prev,
    });
  }

  const [carry, setCarry] = React.useState<{
    index: number;
    size: number;
  } | null>(null);
  const [over, setOver] = React.useState(false);
  const [lifted, setLifted] = React.useState(-1);
  const [emptied, setEmptied] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [spot, setSpot] = React.useState<number | null>(null);
  const [activeMix, setActiveMix] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "", value: current });

  const startLab = labOf(current) ?? ([0.6, 0, 0] as Lab);
  const startShares = sharesOf(recipe, count);
  const paintL = useMotionValue(startLab[0]);
  const paintA = useMotionValue(startLab[1]);
  const paintB = useMotionValue(startLab[2]);
  const paintOn = useMotionValue(current ? 1 : 0);
  const s0 = useMotionValue(startShares[0] ?? 0);
  const s1 = useMotionValue(startShares[1] ?? 0);
  const s2 = useMotionValue(startShares[2] ?? 0);
  const s3 = useMotionValue(startShares[3] ?? 0);
  const s4 = useMotionValue(startShares[4] ?? 0);
  const s5 = useMotionValue(startShares[5] ?? 0);
  const shareValues = [s0, s1, s2, s3, s4, s5];
  const stir = useMotionValue(1);
  const streakA = useMotionValue(0);
  const streakR = useMotionValue(30);
  const streakOn = useMotionValue(0);
  const streakColor = useMotionValue("transparent");
  const ripple = useMotionValue(1);
  const rippleX = useMotionValue(C);
  const rippleY = useMotionValue(C);
  const wellScale = useMotionValue(1);
  const blobX = useMotionValue(0);
  const blobY = useMotionValue(0);
  const blobScale = useMotionValue(1);
  const blobOpacity = useMotionValue(0);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const wellRef = React.useRef<HTMLDivElement | null>(null);
  const pots = React.useRef(new Map<string, HTMLDivElement>());
  const mixes = React.useRef(new Map<string, HTMLButtonElement>());
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timers = React.useRef<number[]>([]);
  const plan = React.useRef<{
    value: string;
    delay: number;
    streak: Streak | null;
  } | null>(null);
  const shownValue = React.useRef(current);
  const grabbedPot = React.useRef(-1);
  const grabbedSeg = React.useRef(-1);
  const dragGeo = React.useRef<Geo | null>(null);
  const dragFrom = React.useRef<Pt>({ x: 0, y: 0 });
  const hovering = React.useRef(false);
  const leaving = React.useRef(false);
  const api = React.useRef<{
    mixTo: (v: string, delay: number, streak: Streak | null) => void;
  } | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (...keys: string[]) => {
    for (const key of keys) {
      anims.current.get(key)?.stop();
      anims.current.delete(key);
    }
  };
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, Math.round(ms)));
  };

  const geo = (): Geo | null => {
    const root = rootRef.current;
    const well = wellRef.current;
    if (!root || !well) return null;
    const r = root.getBoundingClientRect();
    const w = well.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      cx: w.left - r.left + w.width / 2,
      cy: w.top - r.top + w.height / 2,
      scale: w.width / SIZE || 1,
    };
  };

  const potCentre = (i: number, g: Geo | null): Pt | null => {
    const id = PIGMENTS[i]?.id;
    const node = id ? pots.current.get(id) : undefined;
    if (!node || !g) return null;
    const b = node.getBoundingClientRect();
    return {
      x: r2(b.left - g.left + b.width / 2),
      y: r2(b.top - g.top + b.height / 2),
    };
  };

  const panAt = (x: number, g: Geo | null) =>
    g ? panFrom(g.left + x, rootRef.current) : 0;

  /** The paint travels to a value's colour, stirred, after `delay`. */
  const mixTo = (next: string, delay: number, streak: Streak | null) => {
    const target = labOf(next);
    if (!motionSafe) {
      if (target) {
        const tween = { duration: durations.fast, ease: easings.enter };
        run("L", animate(paintL, target[0], tween));
        run("A", animate(paintA, target[1], tween));
        run("B", animate(paintB, target[2], tween));
      }
      run("on", animate(paintOn, target ? 1 : 0, { duration: durations.fast }));
      streakOn.set(0);
      stir.set(1);
      return;
    }
    const dur = lerp(durations.base, 1.4, sw);
    if (target) {
      if (paintOn.get() < 0.05) {
        // Into an empty well: the first paint is its own colour, not a
        // blend from whatever the well last held.
        halt("L", "A", "B");
        paintL.set(target[0]);
        paintA.set(target[1]);
        paintB.set(target[2]);
      } else {
        const tween = { duration: dur, ease: easings.move, delay };
        run("L", animate(paintL, target[0], tween));
        run("A", animate(paintA, target[1], tween));
        run("B", animate(paintB, target[2], tween));
      }
    }
    run(
      "on",
      animate(
        paintOn,
        target ? 1 : 0,
        target
          ? { duration: dur * 0.6, ease: easings.enter, delay }
          : { duration: durations.base, ease: easings.exit },
      ),
    );
    // The streak is set up as its stir starts, so a stir still running is
    // replaced whole rather than repainted mid-curl.
    if (streak) {
      streakA.set(streak.a);
      streakR.set(streak.r);
      streakColor.set(streak.color);
    }
    streakOn.set(streak && sw > 0.02 ? 1 : 0);
    stir.set(0);
    run(
      "stir",
      animate(stir, 1, { duration: dur, ease: easings.enter, delay }),
    );
  };

  /** A preview of the paint without a stir: while a pigment is held out. */
  const tint = (next: string) => {
    const target = labOf(next);
    const tween = { duration: durations.base, ease: easings.enter };
    if (target) {
      run("L", animate(paintL, target[0], tween));
      run("A", animate(paintA, target[1], tween));
      run("B", animate(paintB, target[2], tween));
    }
    run("on", animate(paintOn, target ? 1 : 0, tween));
  };

  const commit = (
    next: readonly number[],
    how: { delay: number; streak: Streak | null },
  ) => {
    const nextValue = valueOf(next, count);
    plan.current = { value: nextValue, ...how };
    setMix({
      value: nextValue,
      count,
      recipe: next,
      prev: { value: current, recipe },
    });
    if (nextValue === "" && required) setEmptied(true);
    if (nextValue === current) {
      // The same colour from a new recipe: the well still stirs.
      mixTo(nextValue, how.delay, how.streak);
      return;
    }
    if (!controlled) setOwn(nextValue);
    onValueChange?.(nextValue);
  };

  const clearBlob = () => setCarry(null);

  const sink = () => {
    const out = { duration: durations.base, ease: easings.exit };
    run("blobScale", animate(blobScale, 0.25, out));
    run(
      "blobOpacity",
      animate(blobOpacity, 0, { ...out, onComplete: clearBlob }),
    );
  };

  /** Contact: the ripple, the well's landing and the drop's voice. */
  const land = (i: number, at: Pt, g: Geo) => {
    sink();
    rippleX.set(r2(C + (at.x - g.cx) / g.scale));
    rippleY.set(r2(C + (at.y - g.cy) / g.scale));
    ripple.set(0);
    run(
      "ripple",
      animate(ripple, 1, { duration: durations.slow, ease: easings.enter }),
    );
    wellScale.set(0.955);
    run("well", animate(wellScale, 1, springs.recoil));
    audio.play("plip", {
      pitch: r2(0.78 + (PIGMENTS[i]?.light ?? 0.5) * 0.62),
      gain: 0.55,
      pan: panAt(at.x, g),
    });
  };

  const aimStreak = (i: number, at: Pt, g: Geo): Streak => {
    const dx = (at.x - g.cx) / g.scale;
    const dy = (at.y - g.cy) / g.scale;
    return {
      a: fix(Math.atan2(dy, dx), 4),
      r: r2(Math.max(18, Math.min(PAINT_R - 6, Math.hypot(dx, dy)))),
      color: PIGMENTS[i]?.css ?? "transparent",
    };
  };

  const added = (i: number, to = (recipe[i] ?? 0) + 1) => {
    const next = [...recipe];
    next[i] = Math.min(MAX_PARTS, Math.max(0, to));
    return next;
  };

  const sendHome = (i: number, velocity: Pt = { x: 0, y: 0 }) => {
    const home = potCentre(i, dragGeo.current ?? geo());
    const fade = {
      duration: durations.base,
      ease: easings.exit,
      delay: motionSafe ? 0.12 : 0,
    };
    if (motionSafe && home) {
      run(
        "blobX",
        animate(blobX, home.x, { ...springs.glide, velocity: velocity.x }),
      );
      run(
        "blobY",
        animate(blobY, home.y, { ...springs.glide, velocity: velocity.y }),
      );
      run("blobScale", animate(blobScale, 0.7, fade));
    }
    run(
      "blobOpacity",
      animate(blobOpacity, 0, { ...fade, onComplete: clearBlob }),
    );
  };

  /** A part hops from its pot into the well: a tap, or a key. */
  const hop = (i: number, to?: number) => {
    const next = added(i, to);
    if ((next[i] ?? 0) === (recipe[i] ?? 0)) return;
    const g = geo();
    const from = potCentre(i, g);
    if (!g || !from) {
      commit(next, { delay: 0, streak: null });
      return;
    }
    const a = Math.atan2(from.y - g.cy, from.x - g.cx);
    const at = {
      x: r2(g.cx + Math.cos(a) * 30 * g.scale),
      y: r2(g.cy + Math.sin(a) * 30 * g.scale),
    };
    commit(next, {
      delay: motionSafe ? HOP : 0,
      streak: aimStreak(i, at, g),
    });
    if (!motionSafe) {
      audio.play("plip", {
        pitch: r2(0.78 + (PIGMENTS[i]?.light ?? 0.5) * 0.62),
        gain: 0.55,
        pan: panAt(at.x, g),
      });
      return;
    }
    halt("blobX", "blobY", "blobScale", "blobOpacity");
    setCarry({ index: i, size: BLOB - 4 });
    blobX.set(from.x);
    blobY.set(from.y);
    blobScale.set(0.9);
    blobOpacity.set(1);
    const peak = r2(Math.max(BLOB / 2, Math.min(from.y, at.y) - 22));
    run("blobX", animate(blobX, at.x, { duration: HOP, ease: easings.move }));
    run(
      "blobY",
      animate(blobY, [from.y, peak, at.y], {
        duration: HOP,
        ease: ["easeOut", "easeIn"],
        times: [0, 0.42, 1],
        onComplete: () => land(i, at, g),
      }),
    );
  };

  /** A pigment leaves: one part (`one`) or all of it. */
  const take = (i: number, how: "one" | "all", visual: boolean) => {
    const had = recipe[i] ?? 0;
    if (!had) return;
    const share = had / Math.max(1, partsIn(recipe, count));
    const next = added(i, how === "one" ? had - 1 : 0);
    const g = geo();
    commit(next, { delay: 0, streak: null });
    audio.play("gloop", {
      pitch: r2(1.05 - share * 0.35),
      gain: how === "one" ? 0.4 : 0.55,
      pan: g ? panAt(g.cx, g) : 0,
    });
    if (!visual || !motionSafe || !g) return;
    // From the keyboard, a blob lifts off the rim and goes back to its pot.
    const mid = sectorMid(
      shareValues.map((s) => s.get()),
      i,
    );
    const from = {
      x: r2(g.cx + Math.cos(mid) * 59 * g.scale),
      y: r2(g.cy + Math.sin(mid) * 59 * g.scale),
    };
    const home = potCentre(i, g);
    halt("blobX", "blobY", "blobScale", "blobOpacity");
    setCarry({ index: i, size: r2(14 + (how === "one" ? 0 : 14 * share)) });
    blobX.set(from.x);
    blobY.set(from.y);
    blobScale.set(1);
    blobOpacity.set(1);
    if (home) {
      run("blobX", animate(blobX, home.x, springs.glide));
      run("blobY", animate(blobY, home.y, springs.glide));
    }
    run(
      "blobOpacity",
      animate(blobOpacity, 0, {
        duration: durations.base,
        ease: easings.exit,
        delay: 0.14,
        onComplete: clearBlob,
      }),
    );
  };

  const restore = (entry: Entry) => {
    const next = fits(entry.recipe, count)
      ? entry.recipe
      : recipeFor(entry.value, count, []);
    if (next.every((k, i) => k === (recipe[i] ?? 0))) return;
    const g = geo();
    commit(next, { delay: 0, streak: null });
    audio.play("plip", { pitch: 0.9, gain: 0.35, pan: g ? panAt(g.cx, g) : 0 });
  };

  const hover = (inside: boolean) => {
    if (hovering.current === inside) return;
    hovering.current = inside;
    setOver(inside);
    if (motionSafe)
      run("well", animate(wellScale, inside ? 0.97 : 1, springs.snap));
  };

  const inDish = (g: Geo, x: number, y: number, slack = 0) =>
    Math.hypot(x - g.cx, y - g.cy) <= DISH_R * g.scale + slack;

  const follow = (offset: Pt, size: number) => {
    const g = dragGeo.current;
    if (!g) return null;
    const half = size / 2;
    const x = r2(
      rubberClamp(dragFrom.current.x + offset.x, half, g.width - half, size),
    );
    const y = r2(
      rubberClamp(dragFrom.current.y + offset.y, half, g.height - half, size),
    );
    blobX.set(x);
    blobY.set(y);
    return { x, y, g };
  };

  const potDrag = useDrag({
    disabled,
    onStart: () => {
      const i = grabbedPot.current;
      const g = geo();
      const from = potCentre(i, g);
      if (i < 0 || !g || !from) return;
      dragGeo.current = g;
      dragFrom.current = from;
      halt("blobX", "blobY", "blobScale", "blobOpacity");
      setCarry({ index: i, size: BLOB });
      blobX.set(from.x);
      blobY.set(from.y);
      blobOpacity.set(1);
      if (motionSafe) {
        blobScale.set(0.8);
        run("blobScale", animate(blobScale, 1.08, springs.flick));
      } else {
        blobScale.set(1);
      }
    },
    onMove: ({ offset }) => {
      const at = follow(offset, BLOB);
      if (at) hover(inDish(at.g, at.x, at.y, 4));
    },
    onEnd: ({ velocity }) => {
      const i = grabbedPot.current;
      const g = dragGeo.current;
      hover(false);
      if (i < 0 || !g) return;
      const x = blobX.get();
      const y = blobY.get();
      const px = project(x, velocity.x, 0.99);
      const py = project(y, velocity.y, 0.99);
      const here = inDish(g, x, y);
      // A throw commits to where it would come to rest.
      if (!here && !inDish(g, px, py)) {
        sendHome(i, velocity);
        return;
      }
      const aim = here ? { x, y } : { x: px, y: py };
      const dx = aim.x - g.cx;
      const dy = aim.y - g.cy;
      const reach = Math.hypot(dx, dy);
      const limit = PAINT_R * 0.72 * g.scale;
      const k = reach > limit ? limit / reach : 1;
      const at = { x: r2(g.cx + dx * k), y: r2(g.cy + dy * k) };
      const next = added(i);
      if ((next[i] ?? 0) === (recipe[i] ?? 0)) {
        sendHome(i, velocity);
        return;
      }
      const flight = here ? 0.08 : 0.2;
      commit(next, {
        delay: motionSafe ? flight : 0,
        streak: aimStreak(i, at, g),
      });
      if (!motionSafe) {
        blobOpacity.set(0);
        clearBlob();
        land(i, at, g);
        return;
      }
      run(
        "blobX",
        animate(blobX, at.x, { ...springs.glide, velocity: velocity.x }),
      );
      run(
        "blobY",
        animate(blobY, at.y, { ...springs.glide, velocity: velocity.y }),
      );
      later(flight * 1000, () => land(i, at, g));
    },
    onCancel: () => {
      hover(false);
      sendHome(grabbedPot.current);
    },
    onTap: () => {
      const i = grabbedPot.current;
      if (i >= 0) hop(i);
    },
  });

  /** The rim segment under a point, or -1. */
  const segmentAt = (clientX: number, clientY: number) => {
    const well = wellRef.current;
    if (!well) return -1;
    const b = well.getBoundingClientRect();
    const scale = b.width / SIZE || 1;
    const dx = (clientX - b.left) / scale - C;
    const dy = (clientY - b.top) / scale - C;
    const r = Math.hypot(dx, dy);
    if (r < RING_IN - 8 || r > DISH_R + 6) return -1;
    const turn = (((Math.atan2(dy, dx) + Math.PI / 2) % TAU) + TAU) % TAU;
    const shares = shareValues.map((s) => s.get());
    let before = 0;
    for (let i = 0; i < count; i += 1) {
      const share = shares[i] ?? 0;
      if (
        share > 0.001 &&
        turn >= before * TAU &&
        turn <= (before + share) * TAU
      )
        return i;
      before += share;
    }
    return -1;
  };

  const ringDrag = useDrag({
    disabled,
    onStart: ({ point, offset }) => {
      const i = grabbedSeg.current;
      const g = geo();
      if (i < 0 || !g) return;
      dragGeo.current = g;
      leaving.current = false;
      const share = (recipe[i] ?? 0) / Math.max(1, partsIn(recipe, count));
      const size = Math.round(16 + 20 * share);
      dragFrom.current = {
        x: r2(point.x - offset.x - g.left),
        y: r2(point.y - offset.y - g.top),
      };
      halt("blobX", "blobY", "blobScale", "blobOpacity");
      setLifted(i);
      setCarry({ index: i, size });
      blobX.set(dragFrom.current.x);
      blobY.set(dragFrom.current.y);
      blobOpacity.set(1);
      if (motionSafe) {
        blobScale.set(0.5);
        run("blobScale", animate(blobScale, 1, springs.flick));
      } else {
        blobScale.set(1);
      }
    },
    onMove: ({ offset }) => {
      const i = grabbedSeg.current;
      const size = carry?.size ?? BLOB;
      const at = follow(offset, size);
      if (!at || i < 0) return;
      const out = !inDish(at.g, at.x, at.y, 8);
      if (out === leaving.current) return;
      leaving.current = out;
      // Held outside, the paint shows the mix without it.
      tint(out ? valueOf(added(i, 0), count) : current);
    },
    onEnd: ({ velocity }) => {
      const i = grabbedSeg.current;
      const g = dragGeo.current;
      setLifted(-1);
      if (i < 0 || !g) return;
      const x = blobX.get();
      const y = blobY.get();
      const out =
        !inDish(g, x, y, 8) ||
        !inDish(
          g,
          project(x, velocity.x, 0.99),
          project(y, velocity.y, 0.99),
          8,
        );
      leaving.current = false;
      if (!out) {
        tint(current);
        const mid = sectorMid(
          shareValues.map((s) => s.get()),
          i,
        );
        const back = {
          x: r2(g.cx + Math.cos(mid) * 59 * g.scale),
          y: r2(g.cy + Math.sin(mid) * 59 * g.scale),
        };
        if (motionSafe) {
          run("blobX", animate(blobX, back.x, springs.glide));
          run("blobY", animate(blobY, back.y, springs.glide));
        }
        run(
          "blobOpacity",
          animate(blobOpacity, 0, {
            duration: durations.base,
            ease: easings.exit,
            onComplete: clearBlob,
          }),
        );
        return;
      }
      take(i, "all", false);
      const fall = { duration: durations.base, ease: easings.exit };
      if (motionSafe) {
        run("blobY", animate(blobY, r2(Math.min(g.height, y + 18)), fall));
        run("blobScale", animate(blobScale, 0.7, fall));
      }
      run(
        "blobOpacity",
        animate(blobOpacity, 0, { ...fall, onComplete: clearBlob }),
      );
    },
    onCancel: () => {
      setLifted(-1);
      leaving.current = false;
      tint(current);
      run(
        "blobOpacity",
        animate(blobOpacity, 0, {
          duration: durations.fast,
          onComplete: clearBlob,
        }),
      );
    },
  });

  const focusPot = (i: number) => {
    const n = (i + count) % count;
    setActive(n);
    const id = PIGMENTS[n]?.id;
    if (id) pots.current.get(id)?.focus();
  };

  const onPotKey = (event: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowUp":
      case "Enter":
      case " ":
        event.preventDefault();
        hop(i);
        return;
      case "ArrowDown":
        event.preventDefault();
        take(i, "one", true);
        return;
      case "Home":
      case "Delete":
      case "Backspace":
        event.preventDefault();
        take(i, "all", true);
        return;
      case "End":
        event.preventDefault();
        hop(i, MAX_PARTS);
        return;
      case "ArrowRight":
        event.preventDefault();
        focusPot(i + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        focusPot(i - 1);
        return;
    }
  };

  const onMixKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const n = Math.min(history.length, HISTORY);
    if (n === 0) return;
    const at = Math.min(activeMix, n - 1);
    const go = (k: number) => {
      event.preventDefault();
      const next = (k + n) % n;
      setActiveMix(next);
      const v = history[next]?.value;
      if (v) mixes.current.get(v)?.focus();
    };
    if (event.key === "ArrowRight") go(at + 1);
    else if (event.key === "ArrowLeft") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(n - 1);
  };

  React.useEffect(() => {
    api.current = { mixTo };
  });

  // The ring re-divides whenever the recipe changes, whoever changed it.
  React.useEffect(() => {
    const next = sharesOf(recipe, count);
    [s0, s1, s2, s3, s4, s5].forEach((mv, i) => {
      const to = next[i] ?? 0;
      const key = `share-${i}`;
      anims.current.get(key)?.stop();
      if (!motionSafe) {
        anims.current.set(
          key,
          animate(mv, to, { duration: durations.fast, ease: easings.enter }),
        );
      } else {
        anims.current.set(key, animate(mv, to, springs.glide));
      }
    });
  }, [recipe, count, motionSafe, s0, s1, s2, s3, s4, s5]);

  // The paint follows the value. A change this field made carries its own
  // timing (the hop's flight, the streak); one from the host just stirs.
  React.useEffect(() => {
    if (shownValue.current === current) return;
    shownValue.current = current;
    const p = plan.current;
    const mine = p && p.value === current ? p : null;
    api.current?.mixTo(current, mine?.delay ?? 0, mine?.streak ?? null);
  }, [current]);

  // A mix that has stood still is kept, and said once.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      if (current) {
        setHistory((h) =>
          h[0]?.value === current
            ? h
            : [
                { value: current, recipe },
                ...h.filter((e) => e.value !== current),
              ].slice(0, HISTORY),
        );
      }
      setSaid((s) =>
        s.value === current
          ? s
          : {
              n: s.n + 1,
              value: current,
              text: current
                ? `Mixed ${readoutOf(current, format)}.`
                : "The well is empty.",
            },
      );
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [current, recipe, format]);

  React.useEffect(() => {
    const running = anims.current;
    const pending = timers.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      for (const t of pending) window.clearTimeout(t);
      pending.length = 0;
    };
  }, []);

  const paint = useTransform(
    [paintL, paintA, paintB] as MotionValue<number>[],
    ([l = 0, a = 0, b = 0]: number[]) => labCss([l, a, b]),
  );
  const paintLip = useTransform(
    paint,
    (p) => `color-mix(in oklab, ${p} 72%, black)`,
  );
  const paintLight = useTransform(
    paint,
    (p) => `color-mix(in oklab, ${p} 58%, white)`,
  );
  const paintDark = useTransform(
    paint,
    (p) => `color-mix(in oklab, ${p} 68%, black)`,
  );
  const streak = useTransform(
    [stir, streakA, streakR, streakOn] as MotionValue<number>[],
    ([t = 1, a = 0, r = 30, on = 0]: number[]) =>
      on < 0.5 || t <= 0 || t >= 1 ? "" : streakPath(t, a, r, sw),
  );
  const streakWidth = useTransform(stir, (t) => r2(1.5 + 5.5 * (1 - t)));
  const streakOpacity = useTransform(
    [stir, streakOn] as MotionValue<number>[],
    ([t = 1, on = 0]: number[]) =>
      // The streak holds its colour for most of the stir, then gives it up.
      on < 0.5 || t <= 0 ? 0 : fix((1 - Math.pow(t, 1.6)) * 0.95, 3),
  );
  const stirLines = useTransform(
    [stir, streakA] as MotionValue<number>[],
    ([t = 1, a = 0]: number[]) => {
      const base = a + Math.PI / 2 + t * (0.4 + sw * 2.2) * Math.PI;
      return {
        outer: swirlPath(base, 42, 20, 2.3),
        inner: swirlPath(base + Math.PI * 0.85, 33, 9, 2.6),
      };
    },
  );
  const stirOuter = useTransform(stirLines, (l) => l.outer);
  const stirInner = useTransform(stirLines, (l) => l.inner);
  const stirOpacity = useTransform(stir, (t) =>
    sw < 0.02 || t <= 0 || t >= 1
      ? 0
      : fix(Math.sin(Math.PI * t) * (0.3 + 0.4 * sw), 3),
  );
  const rippleR = useTransform(ripple, (v) => r2(3 + 22 * v));
  const rippleOpacity = useTransform(ripple, (v) =>
    v <= 0 || v >= 1 ? 0 : fix(0.75 * (1 - v), 3),
  );

  const total = partsIn(recipe, count);
  const used = recipe.slice(0, count).filter((k) => k > 0).length;
  const shownError =
    error ??
    (required && emptied && current === "" ? "Mix a colour first." : undefined);
  // An error is said once, in the render it appears.
  const [voiced, setVoiced] = React.useState(shownError);
  if (voiced !== shownError) {
    setVoiced(shownError);
    if (shownError) setSaid((v) => ({ ...v, n: v.n + 1, text: shownError }));
  }
  const focusable = Math.min(active, count - 1);
  const mixFocus = Math.min(activeMix, Math.max(0, history.length - 1));
  const carried = carry ? PIGMENTS[carry.index] : undefined;
  const spotted = spot !== null && spot < count ? PIGMENTS[spot] : undefined;
  const spotParts = spot !== null ? (recipe[spot] ?? 0) : 0;
  const caption = spotted
    ? `${spotted.name} · ${plural(spotParts, "part", "parts")}${total && spotParts ? ` · ${Math.round((spotParts / total) * 100)}%` : ""}`
    : total
      ? `${plural(total, "part", "parts")} · ${plural(used, "pigment", "pigments")}`
      : "Well empty";
  const currentLab = labOf(current);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={
        [hint ? hintId : null, shownError ? errorId : null]
          .filter(Boolean)
          .join(" ") || undefined
      }
      aria-disabled={disabled || undefined}
      className={cn(
        "relative flex w-full max-w-sm flex-col gap-2 overflow-clip p-1 select-none",
        disabled && "opacity-50",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span
          id={labelId}
          className="truncate text-sm font-medium text-foreground"
        >
          {label}
          {required ? (
            <span className="font-normal text-ink-3"> (required)</span>
          ) : null}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-ink-2 tabular-nums">
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border border-hairline-strong"
            style={{
              background: currentLab ? labCss(currentLab) : "transparent",
            }}
          />
          <span className="truncate">{readoutOf(current, format)}</span>
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div
          ref={wellRef}
          onPointerDown={(event) => {
            if (disabled) return;
            const i = segmentAt(event.clientX, event.clientY);
            grabbedSeg.current = i;
            if (i >= 0) ringDrag.onPointerDown(event);
          }}
          onPointerMove={ringDrag.onPointerMove}
          onPointerUp={ringDrag.onPointerUp}
          onPointerCancel={ringDrag.onPointerCancel}
          onLostPointerCapture={ringDrag.onLostPointerCapture}
          className="relative size-[132px] shrink-0 touch-none"
        >
          <svg
            aria-hidden
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="block"
          >
            <defs>
              <clipPath id={clipId}>
                <circle cx={C} cy={C} r={PAINT_R} />
              </clipPath>
            </defs>
            <circle
              cx={C}
              cy={C}
              r={DISH_R}
              strokeWidth={1}
              className={cn(
                "fill-surface-2 transition-colors",
                over ? "stroke-cobalt-bright" : "stroke-hairline-strong",
              )}
            />
            <circle
              cx={C}
              cy={C}
              r={(RING_IN + RING_OUT) / 2}
              fill="none"
              strokeWidth={RING_OUT - RING_IN}
              className={cn(
                "transition-colors",
                over ? "stroke-cobalt-wash" : "stroke-hairline",
              )}
            />
            <circle
              cx={C}
              cy={C}
              r={PAINT_R}
              fill="none"
              strokeWidth={1}
              strokeDasharray="3 4"
              className="stroke-hairline-strong"
            />
            {current ? null : (
              <path
                d={`M ${C - 6} ${C} H ${C + 6} M ${C} ${C - 6} V ${C + 6}`}
                strokeWidth={1.5}
                strokeLinecap="round"
                className="stroke-ink-3"
              />
            )}
            {PIGMENTS.slice(0, count).map((p, i) => (
              <Sector
                key={p.id}
                shares={shareValues}
                index={i}
                color={p.css}
                lifted={lifted === i}
              />
            ))}
            <motion.g
              style={{
                scale: wellScale,
                originX: 0.5,
                originY: 0.5,
                opacity: paintOn,
              }}
            >
              <rect width={SIZE} height={SIZE} fill="none" />
              <motion.circle
                cx={C}
                cy={C}
                r={PAINT_R}
                style={{ fill: paint }}
              />
              <g clipPath={`url(#${clipId})`}>
                <motion.path
                  d={stirOuter}
                  fill="none"
                  strokeWidth={3}
                  strokeLinecap="round"
                  style={{ stroke: paintLight, opacity: stirOpacity }}
                />
                <motion.path
                  d={stirInner}
                  fill="none"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  style={{ stroke: paintDark, opacity: stirOpacity }}
                />
                <motion.path
                  d={streak}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    stroke: streakColor,
                    strokeWidth: streakWidth,
                    opacity: streakOpacity,
                  }}
                />
                <motion.circle
                  cx={rippleX}
                  cy={rippleY}
                  r={rippleR}
                  fill="none"
                  strokeWidth={1.5}
                  style={{ stroke: paintLight, opacity: rippleOpacity }}
                />
              </g>
              <motion.circle
                cx={C}
                cy={C}
                r={PAINT_R - 1}
                fill="none"
                strokeWidth={2}
                style={{ stroke: paintLip }}
              />
              <ellipse
                cx={C - 16}
                cy={C - 22}
                rx={14}
                ry={7}
                fill="white"
                opacity={0.16}
              />
            </motion.g>
          </svg>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div
            role="group"
            aria-label="Pigments"
            className={cn(
              "grid w-max gap-2",
              count === 3
                ? "grid-cols-3"
                : count === 4
                  ? "grid-cols-2"
                  : "grid-cols-3",
            )}
          >
            {PIGMENTS.slice(0, count).map((p, i) => {
              const parts = recipe[i] ?? 0;
              return (
                <div
                  key={p.id}
                  ref={(node) => {
                    if (node) pots.current.set(p.id, node);
                    else pots.current.delete(p.id);
                  }}
                  role="slider"
                  tabIndex={disabled ? -1 : focusable === i ? 0 : -1}
                  aria-label={p.name}
                  aria-orientation="vertical"
                  aria-valuemin={0}
                  aria-valuemax={MAX_PARTS}
                  aria-valuenow={parts}
                  aria-valuetext={
                    parts
                      ? `${plural(parts, "part", "parts")}, ${Math.round((parts / Math.max(1, total)) * 100)}% of the mix.`
                      : "Not in the mix."
                  }
                  aria-disabled={disabled || undefined}
                  onPointerDown={(event) => {
                    grabbedPot.current = i;
                    potDrag.onPointerDown(event);
                  }}
                  onPointerMove={potDrag.onPointerMove}
                  onPointerUp={potDrag.onPointerUp}
                  onPointerCancel={potDrag.onPointerCancel}
                  onLostPointerCapture={potDrag.onLostPointerCapture}
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") setSpot(i);
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === "mouse")
                      setSpot((s) => (s === i ? null : s));
                  }}
                  onFocus={() => {
                    setActive(i);
                    setSpot(i);
                  }}
                  onBlur={() => setSpot((s) => (s === i ? null : s))}
                  onKeyDown={(event) => onPotKey(event, i)}
                  className={cn(
                    "relative size-9 touch-none rounded-full outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    disabled
                      ? "cursor-not-allowed"
                      : "cursor-grab active:cursor-grabbing",
                    motionSafe &&
                      !disabled &&
                      "transition-transform duration-150 hover:-translate-y-0.5 active:scale-95",
                  )}
                  style={{
                    background: blobFill(p.css),
                    boxShadow: BLOB_SHADOW,
                  }}
                >
                  {parts > 0 ? (
                    <span
                      aria-hidden
                      className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 font-mono text-[9px] leading-none text-background tabular-nums"
                    >
                      {parts}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p
            aria-hidden
            className="truncate font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase"
          >
            {caption}
          </p>

          <div
            role="toolbar"
            aria-label="Recent mixes"
            onKeyDown={onMixKey}
            className="flex items-center gap-1.5"
          >
            {Array.from({ length: HISTORY }, (_, k) => {
              const entry = history[k];
              const lab = entry ? labOf(entry.value) : null;
              if (!entry || !lab) {
                return (
                  <span
                    key={`empty-${k}`}
                    aria-hidden
                    className="size-5 shrink-0 rounded-full border border-dashed border-hairline-strong"
                  />
                );
              }
              return (
                <button
                  key={entry.value}
                  ref={(node) => {
                    if (node) mixes.current.set(entry.value, node);
                    else mixes.current.delete(entry.value);
                  }}
                  type="button"
                  tabIndex={mixFocus === k ? 0 : -1}
                  disabled={disabled}
                  aria-label={`Use mix ${readoutOf(entry.value, format)}`}
                  aria-pressed={entry.value === current}
                  onFocus={() => setActiveMix(k)}
                  onClick={() => restore(entry)}
                  className={cn(
                    "size-5 shrink-0 rounded-full border outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    entry.value === current
                      ? "border-foreground"
                      : "border-hairline-strong",
                    disabled ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                  style={{ background: labCss(lab) }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {hint || shownError ? (
        <div className="flex flex-col gap-1">
          {hint ? (
            <p id={hintId} className="text-xs leading-4 text-ink-3">
              {hint}
            </p>
          ) : null}
          {shownError ? (
            <p id={errorId} className="text-xs leading-4 text-danger">
              {shownError}
            </p>
          ) : null}
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
      <input type="hidden" name={name} value={current} disabled={disabled} />

      {carry && carried ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 size-0"
          style={{ x: blobX, y: blobY, scale: blobScale, opacity: blobOpacity }}
        >
          <span
            className="absolute rounded-full"
            style={{
              width: carry.size,
              height: carry.size,
              left: -carry.size / 2,
              top: -carry.size / 2,
              background: blobFill(carried.css),
              boxShadow: BLOB_SHADOW,
            }}
          />
        </motion.span>
      ) : null}
    </div>
  );
}
