"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type KoiPondWater = "jade" | "ink" | "dusk";

export type KoiPondProps = {
  /** The content on top of the water: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many koi live in the pond, 3 to 12. @default 7 */
  fish?: number;
  /** How alive the surface is, 0 to 1: glints, rings, the shimmer over the fish and the pads' bob. @default 0.5 */
  ripple?: number;
  /** The pond's water. @default "jade" */
  water?: KoiPondWater;
  /** The pond's accessible name, for the keyboard's way in. @default "Koi pond" */
  label?: string;
  /** A touch on the water scattered this many koi; reported from the press or key that touched it. */
  onScatter?: (count: number) => void;
  /** The koi swim on; the hand is ignored. */
  disabled?: boolean;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
};

type Rgb = readonly [number, number, number];

type Patch = { t: number; side: number; r: number; colour: string };

type Koi = {
  x: number;
  y: number;
  heading: number;
  speed: number;
  fear: number;
  /** Where the last scare came from: the koi flees directly away from it. */
  fromX: number;
  fromY: number;
  depth: number;
  size: number;
  base: string;
  patches: Patch[];
  school: number;
  /** 0 shy to 1 bold: how close it comes to a still hand. */
  bold: number;
  seed: number;
  swim: number;
  /** Seconds until it next kisses the surface. */
  kiss: number;
  spine: Float32Array;
  /** Reduced motion: where it rests, where a touch sends it, and how far it has faded across. */
  homeX: number;
  homeY: number;
  awayX: number;
  awayY: number;
  fade: number;
  fadeTo: number;
};

type Pad = {
  x: number;
  y: number;
  r: number;
  rot: number;
  spin: number;
  vx: number;
  vy: number;
  driftX: number;
  driftY: number;
  notch: number;
  flower: boolean;
  bob: number;
};

type Ring = {
  x: number;
  y: number;
  age: number;
  life: number;
  strength: number;
  /** Pads this ring has already nudged, one bit each. */
  touched: number;
};

type Scene = {
  w: number;
  h: number;
  dpr: number;
  /** A koi's length at this size of pond, in px. */
  unit: number;
  water: CanvasGradient | null;
  rim: CanvasGradient | null;
  glints: CanvasPattern | null;
};

type Palette = {
  shallow: string;
  deep: string;
  glint: string;
  shade: Rgb;
  ring: string;
};

type Hand = {
  x: number;
  y: number;
  present: boolean;
  pressed: boolean;
  source: "pointer" | "key" | null;
  ring: boolean;
  /** Seconds since the hand last moved. */
  still: number;
  speed: number;
  at: number;
  wake: number;
};

/** The water's pigments, shallow and deep. */
const WATERS: Record<KoiPondWater, readonly [string, string]> = {
  jade: ["oklch(0.62 0.075 178)", "oklch(0.35 0.055 200)"],
  ink: ["oklch(0.37 0.035 252)", "oklch(0.18 0.02 262)"],
  dusk: ["oklch(0.5 0.075 305)", "oklch(0.26 0.06 290)"],
};

/** Koi, pads and flowers are things in the pond: fixed pigments. */
const SCALE = {
  cream: "oklch(0.95 0.02 85)",
  red: "oklch(0.6 0.19 32)",
  orange: "oklch(0.75 0.15 60)",
  black: "oklch(0.3 0.02 250)",
  gold: "oklch(0.84 0.12 88)",
} as const;
const PAD = "oklch(0.56 0.11 142)";
const PAD_RIM = "oklch(0.68 0.1 136)";
const PAD_VEIN = "oklch(0.42 0.09 148)";
const PETAL = "oklch(0.92 0.05 350)";
const PETAL_IN = "oklch(0.8 0.1 355)";
const STAMEN = "oklch(0.86 0.15 92)";

type Variety = {
  base: string;
  patches: readonly (readonly [number, number, number, string])[];
  weight: number;
};

/** Kohaku, sanke, showa, ogon, tancho, chagoi: [t along, side, size, colour]. */
const VARIETIES: readonly Variety[] = [
  {
    base: SCALE.cream,
    patches: [
      [0.12, 0, 1, SCALE.red],
      [0.45, 0.25, 1.1, SCALE.red],
      [0.72, -0.2, 0.8, SCALE.red],
    ],
    weight: 3,
  },
  {
    base: SCALE.cream,
    patches: [
      [0.14, 0, 1, SCALE.red],
      [0.5, -0.2, 1, SCALE.red],
      [0.32, 0.55, 0.35, SCALE.black],
      [0.62, -0.6, 0.3, SCALE.black],
      [0.8, 0.3, 0.3, SCALE.black],
    ],
    weight: 2,
  },
  {
    base: SCALE.black,
    patches: [
      [0.15, 0, 0.9, SCALE.red],
      [0.5, 0.3, 1, SCALE.red],
      [0.35, -0.5, 0.6, SCALE.cream],
      [0.7, 0.1, 0.5, SCALE.cream],
    ],
    weight: 2,
  },
  { base: SCALE.gold, patches: [], weight: 1 },
  { base: SCALE.cream, patches: [[0.1, 0, 0.6, SCALE.red]], weight: 1 },
  {
    base: SCALE.orange,
    patches: [[0.55, 0.35, 0.55, SCALE.cream]],
    weight: 1,
  },
];

/** Half-widths along the body, head to tail root, as shares of its widest. */
const PROFILE = [0.62, 0.92, 1, 0.96, 0.86, 0.7, 0.52, 0.34, 0.2];
const SPINE = PROFILE.length;
/** The most one joint of the spine bends, in radians. */
const JOINT = 0.42;

/**
 * The water's colours live on the canvas element as its own colours, mixed a
 * little into the page so the pond sits in its theme, and are read back from
 * its computed style. Shading and glints are oklab mixes toward black and
 * white, which keep the water's hue.
 */
function colours(water: readonly [string, string]): React.CSSProperties {
  const [shallow, deep] = water;
  return {
    color: `color-mix(in oklab, ${shallow} 85%, var(--background))`,
    borderTopColor: `color-mix(in oklab, ${deep} 88%, var(--background))`,
    borderRightColor: `color-mix(in oklab, ${shallow} 30%, white)`,
    borderBottomColor: `color-mix(in oklab, ${deep} 55%, black)`,
    borderLeftColor: "var(--ring)",
    backgroundColor: `color-mix(in oklab, ${deep} 88%, var(--background))`,
  };
}

/** What stands in for the pond before the canvas has painted it. */
const standIn = (c: React.CSSProperties) =>
  `linear-gradient(160deg, ${String(c.color)}, ${String(c.borderTopColor)})`;

const KEY_STEP = 16;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same pond every time. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** An integer hash as a fraction in [0, 1). Unsigned shifts throughout. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

/** Smooth noise in time, -1 to 1: a koi's wandering mind. */
function wander(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const s = f * f * (3 - 2 * f);
  const a = hash01((i + seed) >>> 0);
  const b = hash01((i + 1 + seed) >>> 0);
  return (a + (b - a) * s) * 2 - 1;
}

const angleTo = (from: number, to: number) => {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}
const rgba = ([r, g, b]: Rgb, a: number) =>
  `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;

/**
 * Light through a moving surface, as a tile that repeats: bright where a few
 * crossing waves cancel, which draws the familiar net of lines. Wave numbers
 * are whole cycles over the tile, so it meets itself at every edge.
 */
function glintTile(): HTMLCanvasElement {
  const size = 160;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const image = ctx.createImageData(size, size);
  const d = image.data;
  const waves = [
    [2, 1, 0.3],
    [-1, 2, 1.7],
    [3, -2, 2.9],
    [1, 3, 4.1],
  ] as const;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let sum = 0;
      for (const [a, b, p] of waves) {
        sum += Math.sin(((a * x + b * y) / size) * Math.PI * 2 + p);
      }
      const v = Math.max(0, 1 - Math.abs(sum) / 0.55);
      const o = (y * size + x) * 4;
      d[o] = 255;
      d[o + 1] = 255;
      d[o + 2] = 255;
      d[o + 3] = Math.round(Math.pow(v, 2.2) * 200);
    }
  }
  ctx.putImageData(image, 0, 0);
  return c;
}

/**
 * A touch at (x, y). Every koi within about three body lengths takes
 * fright by distance and flees from the spot; under reduced motion the
 * near ones are given a place further off to fade across to. Returns how
 * many scattered.
 */
function scare(
  fishes: Koi[],
  x: number,
  y: number,
  moving: boolean,
  w: number,
  h: number,
): number {
  let scattered = 0;
  for (const f of fishes) {
    const d = Math.hypot(f.x - x, f.y - y);
    const k = clamp(1.25 - d / (f.size * 3.2), 0, 1);
    if (k > 0.35) scattered += 1;
    if (moving) {
      if (k > f.fear) {
        f.fear = k;
        f.fromX = x;
        f.fromY = y;
      }
    } else if (k > 0.35) {
      const ox = f.homeX - x;
      const oy = f.homeY - y;
      const od = Math.hypot(ox, oy) || 1;
      const edge = f.size * 0.3;
      f.awayX = clamp(f.homeX + (ox / od) * f.size * 3, edge, w - edge);
      f.awayY = clamp(f.homeY + (oy / od) * f.size * 3, edge, h - edge);
      f.fadeTo = 1;
    }
  }
  return scattered;
}

/** The props a backdrop must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Api = {
  resize: () => void;
  paint: () => void;
  kick: () => void;
  stock: () => void;
};

/**
 * A background that is a garden pond seen from above: koi glide in loose
 * schools under a gently rippling surface, lily pads drift on it, and the
 * content sits on top in its own layer. The pointer is a hand over the
 * water. Its shadow makes the koi near it edge away; held still, it draws
 * the bolder ones back to mill around it. A touch on the water spreads a
 * ring and scatters every koi within reach — a turn away and a burst of
 * speed, then a long glide — and as the fright fades they return. Dragging
 * a pressed hand sweeps a wake through the water.
 *
 * Each koi is a body rebuilt every frame from a spine that follows its
 * head, with a wave running down it, translucent fins and a seeded pattern.
 * One canvas, a couple of milliseconds a frame, and the loop runs only on
 * screen in a visible page. The water's colours are the canvas's own,
 * re-read when the theme changes. The keyboard's way in is a transparent
 * button behind the content: arrow keys move the hand and Space or Enter
 * touches the water. Under reduced motion the pond is a still picture: a
 * touch fades the near koi across to places further off, and back again a
 * little later.
 */
export function KoiPond({
  children,
  fish = 7,
  ripple = 0.5,
  water = "jade",
  label = "Koi pond",
  onScatter,
  disabled = false,
  className,
}: KoiPondProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const seed = hashText(uid);
  const count = clamp(Math.round(fish), 3, 12);
  const life = clamp(ripple, 0, 1);
  const carriers = colours(WATERS[water] ?? WATERS.jade);

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const scene = React.useRef<Scene | null>(null);
  const palette = React.useRef<Palette | null>(null);
  const reader = React.useRef<((colour: string) => Rgb) | null>(null);
  const tile = React.useRef<HTMLCanvasElement | null>(null);
  const koi = React.useRef<Koi[]>([]);
  const pads = React.useRef<Pad[]>([]);
  const rings = React.useRef<Ring[]>([]);
  const hand = React.useRef<Hand>({
    x: 0,
    y: 0,
    present: false,
    pressed: false,
    source: null,
    ring: false,
    still: 0,
    speed: 0,
    at: 0,
    wake: 0,
  });
  const random = React.useRef(seeded(seed ^ 0x9e3779b9));
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const clock = React.useRef(0);
  const visible = React.useRef(true);
  const dirty = React.useRef(true);
  const lastKey = React.useRef(0);
  const homeTimer = React.useRef<number | null>(null);
  /** Stops listening for the touching pointer's release. */
  const unlisten = React.useRef<(() => void) | null>(null);
  const latest = React.useRef({
    count,
    life,
    motionSafe,
    disabled,
    onScatter,
  });
  React.useEffect(() => {
    latest.current = { count, life, motionSafe, disabled, onScatter };
  });

  /** A koi for slot `index`: the same one every time for this pond. */
  const spawn = (index: number, s: Scene): Koi => {
    const rand = seeded((seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0);
    const depth = 0.1 + rand() * 0.8;
    const size = s.unit * (0.78 + rand() * 0.45) * (1 - 0.22 * depth);
    let pick = rand() * VARIETIES.reduce((a, v) => a + v.weight, 0);
    let variety = VARIETIES[0] as Variety;
    for (const v of VARIETIES) {
      pick -= v.weight;
      if (pick <= 0) {
        variety = v;
        break;
      }
    }
    const x = s.w * (0.08 + rand() * 0.84);
    const y = s.h * (0.15 + rand() * 0.7);
    const heading =
      (rand() < 0.5 ? 0 : Math.PI) +
      (rand() - 0.5) * 0.9 +
      (rand() - 0.5) * 0.3;
    const spine = new Float32Array(SPINE * 2);
    // Laid out behind the head with a gentle bend, so a still pond still
    // shows fish that were swimming.
    const bend = (rand() - 0.5) * 0.5;
    let px = x;
    let py = y;
    let a = heading + Math.PI;
    for (let i = 0; i < SPINE; i += 1) {
      spine[i * 2] = px;
      spine[i * 2 + 1] = py;
      a += bend / SPINE;
      px += Math.cos(a) * (size / 8) * 0.92;
      py += Math.sin(a) * (size / 8) * 0.92;
    }
    return {
      x,
      y,
      heading,
      speed: size * 0.4,
      fear: 0,
      fromX: x,
      fromY: y,
      depth,
      size,
      base: variety.base,
      patches: variety.patches.map(([t, side, r, colour]) => ({
        t: clamp(t + (rand() - 0.5) * 0.12, 0.04, 0.9),
        side: side + (rand() - 0.5) * 0.4,
        r: r * (0.8 + rand() * 0.4),
        colour,
      })),
      school: index % Math.max(1, Math.round(latest.current.count / 4)),
      bold: 0.3 + rand() * 0.7,
      seed: (seed ^ Math.imul(index + 7, 0x85ebca6b)) >>> 0,
      swim: rand() * Math.PI * 2,
      kiss: 4 + rand() * 12,
      spine,
      homeX: x,
      homeY: y,
      awayX: x,
      awayY: y,
      fade: 0,
      fadeTo: 0,
    };
  };

  /** As many koi as asked for; the ones already swimming stay as they are. */
  const stock = () => {
    const s = scene.current;
    if (!s) return;
    const want = latest.current.count;
    const now = koi.current;
    if (now.length > want) koi.current = now.slice(0, want);
    for (let i = now.length; i < want; i += 1) koi.current.push(spawn(i, s));
  };

  const lay = (s: Scene) => {
    const rand = seeded(seed ^ 0x51ed270b);
    const n = clamp(Math.round(s.w / 190), 2, 6);
    const out: Pad[] = [];
    for (let i = 0; i < n; i += 1) {
      const r = clamp(s.h * 0.13, 16, 46) * (0.85 + rand() * 0.35);
      out.push({
        x: ((i + 0.2 + rand() * 0.6) / n) * s.w,
        y: s.h * (0.15 + rand() * 0.7),
        r,
        rot: rand() * Math.PI * 2,
        spin: 0,
        vx: 0,
        vy: 0,
        driftX: (rand() - 0.5) * 6,
        driftY: (rand() - 0.5) * 3,
        notch: 0.24 + rand() * 0.12,
        flower: i === Math.floor(n / 2),
        bob: 0,
      });
    }
    pads.current = out;
  };

  const readPalette = (): Palette | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!reader.current) reader.current = rgbReader();
    const read = reader.current;
    const st = getComputedStyle(canvas);
    const css = (c: Rgb) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    return {
      shallow: css(read(st.color)),
      deep: css(read(st.borderTopColor)),
      glint: css(read(st.borderRightColor)),
      shade: read(st.borderBottomColor),
      ring: st.borderLeftColor,
    };
  };

  /** Gradients and the glint pattern belong to a size and a palette. */
  const prepare = () => {
    const s = scene.current;
    const p = palette.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!s || !p || !ctx) return;
    const water = ctx.createLinearGradient(0, 0, s.w * 0.35, s.h * 1.2);
    water.addColorStop(0, p.shallow);
    water.addColorStop(1, p.deep);
    const big = Math.max(s.w, s.h);
    const rim = ctx.createRadialGradient(
      s.w / 2,
      s.h / 2,
      Math.min(s.w, s.h) * 0.35,
      s.w / 2,
      s.h / 2,
      big * 0.72,
    );
    rim.addColorStop(0, rgba(p.shade, 0));
    rim.addColorStop(1, rgba(p.shade, 0.42));
    if (!tile.current) tile.current = glintTile();
    // The glints take the water's own light, not plain white.
    const tinted = document.createElement("canvas");
    tinted.width = tile.current.width;
    tinted.height = tile.current.height;
    const tctx = tinted.getContext("2d");
    if (tctx) {
      tctx.drawImage(tile.current, 0, 0);
      tctx.globalCompositeOperation = "source-in";
      tctx.fillStyle = p.glint;
      tctx.fillRect(0, 0, tinted.width, tinted.height);
    }
    s.water = water;
    s.rim = rim;
    s.glints = ctx.createPattern(tinted, "repeat");
  };

  /** One koi's body as a path, from its spine and the swimming wave. */
  const bodyOf = (f: Koi, motion: boolean) => {
    const { spine, size } = f;
    const wide = size * 0.15;
    const amp =
      size *
      0.075 *
      (motion ? 0.35 + 0.65 * Math.min(1.4, f.speed / (size * 0.5)) : 0);
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    let fx = 1;
    let fy = 0;
    let tx = -1;
    let ty = 0;
    const body: [number, number][] = [];
    for (let i = 0; i < SPINE; i += 1) {
      const x = spine[i * 2] ?? 0;
      const y = spine[i * 2 + 1] ?? 0;
      const a = Math.max(0, i - 1);
      const b = Math.min(SPINE - 1, i + 1);
      let dx = (spine[a * 2] ?? 0) - (spine[b * 2] ?? 0);
      let dy = (spine[a * 2 + 1] ?? 0) - (spine[b * 2 + 1] ?? 0);
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      if (i === 0) {
        fx = dx;
        fy = dy;
      }
      if (i === SPINE - 1) {
        tx = -dx;
        ty = -dy;
      }
      const u = i / (SPINE - 1);
      const off = amp * Math.pow(u, 1.6) * Math.sin(f.swim - i * 0.75);
      const nx = -dy;
      const ny = dx;
      const bx = x + nx * off;
      const by = y + ny * off;
      body.push([bx, by]);
      const w = wide * (PROFILE[i] ?? 0.2);
      left.push([bx + nx * w, by + ny * w]);
      right.push([bx - nx * w, by - ny * w]);
    }
    const head = body[0] ?? [f.x, f.y];
    const tail = body[SPINE - 1] ?? [f.x, f.y];
    const path = new Path2D();
    const nose: [number, number] = [
      head[0] + fx * wide * 0.75,
      head[1] + fy * wide * 0.75,
    ];
    const outline = [
      ...left,
      [tail[0] + tx * 2, tail[1] + ty * 2],
      ...right.reverse(),
    ] as [number, number][];
    path.moveTo(nose[0], nose[1]);
    const first = outline[0] ?? nose;
    path.quadraticCurveTo(
      first[0] + fx * wide * 0.5,
      first[1] + fy * wide * 0.5,
      (first[0] + (outline[1]?.[0] ?? first[0])) / 2,
      (first[1] + (outline[1]?.[1] ?? first[1])) / 2,
    );
    for (let i = 1; i < outline.length - 1; i += 1) {
      const p = outline[i] as [number, number];
      const q = outline[i + 1] as [number, number];
      path.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
    }
    const lastPt = outline[outline.length - 1] ?? nose;
    path.quadraticCurveTo(
      lastPt[0] + fx * wide * 0.5,
      lastPt[1] + fy * wide * 0.5,
      nose[0],
      nose[1],
    );
    path.closePath();
    return { path, body, fx, fy, tx, ty, wide };
  };

  const drawKoi = (
    ctx: CanvasRenderingContext2D,
    f: Koi,
    alpha: number,
    motion: boolean,
    p: Palette,
  ) => {
    if (alpha <= 0.01) return;
    const { path, body, fx, fy, tx, ty, wide } = bodyOf(f, motion);
    const tail = body[SPINE - 1] ?? [f.x, f.y];
    // A deep koi is not see-through: it is the same koi with more water
    // over it, so the whole body dims evenly (below), and only the fins,
    // which are thin, let the water through.
    const fins = 0.55 * (1 - 0.45 * f.depth) * alpha;
    const sway = motion ? Math.sin(f.swim - SPINE * 0.75) * 0.32 : 0.12;
    // Shadow on the water below a koi near the surface.
    if (f.depth < 0.55) {
      ctx.save();
      ctx.translate(f.size * 0.05, f.size * 0.09);
      ctx.globalAlpha = 0.2 * (1 - f.depth) * alpha;
      ctx.fillStyle = rgba(p.shade, 1);
      ctx.fill(path);
      ctx.restore();
    }
    // Fins: translucent, so they are drawn first and the body sits on them.
    ctx.globalAlpha = fins;
    ctx.fillStyle = f.base;
    const len = f.size * 0.27;
    const spread = 0.42;
    const base = Math.atan2(ty, tx);
    const tip1 = base + spread + sway;
    const tip2 = base - spread + sway;
    ctx.beginPath();
    ctx.moveTo(tail[0] - ty * wide * 0.25, tail[1] + tx * wide * 0.25);
    ctx.quadraticCurveTo(
      tail[0] + Math.cos(tip1) * len * 0.6,
      tail[1] + Math.sin(tip1) * len * 0.6,
      tail[0] + Math.cos(tip1) * len,
      tail[1] + Math.sin(tip1) * len,
    );
    ctx.lineTo(
      tail[0] + Math.cos(base + sway) * len * 0.5,
      tail[1] + Math.sin(base + sway) * len * 0.5,
    );
    ctx.lineTo(tail[0] + Math.cos(tip2) * len, tail[1] + Math.sin(tip2) * len);
    ctx.quadraticCurveTo(
      tail[0] + Math.cos(tip2) * len * 0.6,
      tail[1] + Math.sin(tip2) * len * 0.6,
      tail[0] + ty * wide * 0.25,
      tail[1] - tx * wide * 0.25,
    );
    ctx.closePath();
    ctx.fill();
    const chest = body[2] ?? [f.x, f.y];
    const flap = motion ? Math.sin(f.swim * 0.6) * 0.25 : 0;
    for (const side of [-1, 1]) {
      const a = Math.atan2(fy, fx) + side * (2.25 + flap * side);
      ctx.beginPath();
      ctx.ellipse(
        chest[0] - fy * side * wide * 0.8 + Math.cos(a) * f.size * 0.07,
        chest[1] + fx * side * wide * 0.8 + Math.sin(a) * f.size * 0.07,
        f.size * 0.11,
        f.size * 0.045,
        a,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // The body and its pattern.
    ctx.globalAlpha = alpha;
    ctx.fill(path);
    // Light catches the body's edge, so even a black koi on dark water
    // keeps its outline.
    ctx.globalAlpha = 0.4 * alpha * (1 - 0.5 * f.depth);
    ctx.strokeStyle = p.glint;
    ctx.lineWidth = 0.9;
    ctx.stroke(path);
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.clip(path);
    for (const patch of f.patches) {
      const at = patch.t * (SPINE - 1);
      const i = Math.min(SPINE - 2, Math.floor(at));
      const u = at - i;
      const a = body[i] ?? [f.x, f.y];
      const b = body[i + 1] ?? a;
      const x = a[0] + (b[0] - a[0]) * u;
      const y = a[1] + (b[1] - a[1]) * u;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      const w = wide * (PROFILE[i] ?? 0.5);
      ctx.fillStyle = patch.colour;
      ctx.beginPath();
      ctx.ellipse(
        x - (dy / d) * patch.side * w * 0.6,
        y + (dx / d) * patch.side * w * 0.6,
        w * patch.r * 1.15,
        w * patch.r * 0.8,
        Math.atan2(dy, dx),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // Light along the back, so the body reads round.
    ctx.globalAlpha = 0.16 * alpha;
    ctx.strokeStyle = "white";
    ctx.lineWidth = wide * 0.55;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 1; i < 6; i += 1) {
      const pt = body[i] ?? [f.x, f.y];
      if (i === 1) ctx.moveTo(pt[0], pt[1]);
      else ctx.lineTo(pt[0], pt[1]);
    }
    ctx.stroke();
    if (f.depth > 0.05) {
      ctx.globalAlpha = 0.62 * f.depth * alpha;
      ctx.fillStyle = p.deep;
      ctx.fill(path);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const drawPad = (ctx: CanvasRenderingContext2D, pad: Pad, p: Palette) => {
    const swell = 1 + 0.05 * pad.bob * Math.sin(pad.bob * 14);
    const r = pad.r * swell;
    const half = pad.notch / 2;
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = rgba(p.shade, 1);
    ctx.beginPath();
    ctx.arc(pad.x + r * 0.1, pad.y + r * 0.16, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(pad.x, pad.y);
    ctx.arc(pad.x, pad.y, r, pad.rot + half, pad.rot + Math.PI * 2 - half);
    ctx.closePath();
    ctx.fillStyle = PAD;
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = PAD_RIM;
    ctx.stroke();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = PAD_VEIN;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let k = 0; k < 7; k += 1) {
      const a = pad.rot + half + ((k + 0.5) / 7) * (Math.PI * 2 - pad.notch);
      ctx.moveTo(pad.x, pad.y);
      ctx.lineTo(
        pad.x + Math.cos(a) * r * 0.86,
        pad.y + Math.sin(a) * r * 0.86,
      );
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (!pad.flower) return;
    const cx = pad.x + Math.cos(pad.rot + Math.PI) * r * 0.32;
    const cy = pad.y + Math.sin(pad.rot + Math.PI) * r * 0.32;
    const pr = r * 0.3;
    for (const [ring, colour, scale] of [
      [0, PETAL, 1],
      [0.4, PETAL_IN, 0.66],
    ] as const) {
      ctx.fillStyle = colour;
      for (let k = 0; k < 8; k += 1) {
        const a = pad.rot + ring + (k / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(
          cx + Math.cos(a) * pr * 0.55 * scale,
          cy + Math.sin(a) * pr * 0.55 * scale,
          pr * 0.5 * scale,
          pr * 0.22 * scale,
          a,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.fillStyle = STAMEN;
    ctx.beginPath();
    ctx.arc(cx, cy, pr * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };

  const draw = () => {
    const s = scene.current;
    const p = palette.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!s || !p || !canvas || !ctx || !s.water) return;
    if (!visible.current) {
      dirty.current = true;
      return;
    }
    dirty.current = false;
    const L = latest.current;
    const motion = L.motionSafe;
    const t = clock.current;
    const { w, h, dpr } = s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = s.water;
    ctx.fillRect(0, 0, w, h);

    const order = [...koi.current].sort((a, b) => b.depth - a.depth);
    for (const f of order) {
      // The surface bends the light: a koi wavers a little under it.
      const wob = motion ? L.life * 1.4 : 0;
      ctx.save();
      ctx.translate(
        wob * Math.sin(t * 1.3 + f.y * 0.031),
        wob * Math.cos(t * 1.1 + f.x * 0.027),
      );
      if (!motion && (f.fade > 0 || f.fadeTo > 0)) {
        drawKoi(ctx, f, 1 - f.fade, false, p);
        const keep = f.spine.slice();
        const dx = f.awayX - f.homeX;
        const dy = f.awayY - f.homeY;
        for (let i = 0; i < SPINE; i += 1) {
          f.spine[i * 2] = (keep[i * 2] ?? 0) + dx;
          f.spine[i * 2 + 1] = (keep[i * 2 + 1] ?? 0) + dy;
        }
        drawKoi(ctx, f, f.fade, false, p);
        f.spine.set(keep);
      } else {
        drawKoi(ctx, f, 1, motion, p);
      }
      ctx.restore();
    }

    if (s.glints && L.life > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      const drift = motion ? t : 0;
      for (const [scale, vx, vy, a] of [
        [1, 9, 5, 0.2],
        [1.37, -7, 8, 0.13],
      ] as const) {
        s.glints.setTransform(
          new DOMMatrix([
            scale,
            0,
            0,
            scale,
            (drift * vx) % (160 * scale),
            (drift * vy) % (160 * scale),
          ]),
        );
        ctx.globalAlpha = a * L.life;
        ctx.fillStyle = s.glints;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    for (const ring of rings.current) {
      const k = 1 - ring.age / ring.life;
      if (k <= 0) continue;
      const r = 4 + (motion ? 64 * ring.age : 22);
      const a = ring.strength * k * k * (0.3 + 0.7 * L.life);
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = Math.min(1, a * 0.9);
      ctx.strokeStyle = p.glint;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.stroke();
      if (r > 6) {
        ctx.globalAlpha = Math.min(1, a * 0.5);
        ctx.strokeStyle = rgba(p.shade, 1);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, r - 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    for (const pad of pads.current) drawPad(ctx, pad, p);

    if (s.rim) {
      ctx.fillStyle = s.rim;
      ctx.fillRect(0, 0, w, h);
    }

    const hd = hand.current;
    if (hd.present && !L.disabled) {
      const reach = s.unit * (hd.pressed ? 0.7 : 0.95);
      const shadow = ctx.createRadialGradient(hd.x, hd.y, 0, hd.x, hd.y, reach);
      shadow.addColorStop(0, rgba(p.shade, hd.pressed ? 0.34 : 0.26));
      shadow.addColorStop(1, rgba(p.shade, 0));
      ctx.fillStyle = shadow;
      ctx.fillRect(hd.x - reach, hd.y - reach, reach * 2, reach * 2);
      if (hd.ring) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = p.ring;
        ctx.beginPath();
        ctx.arc(hd.x, hd.y, s.unit * 0.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    rootRef.current?.setAttribute("data-painted", "");
  };

  /** One step of the pond's life. */
  const step = (dt: number) => {
    const s = scene.current;
    if (!s) return;
    const L = latest.current;
    const hd = hand.current;
    const fishes = koi.current;
    const rand = random.current;
    clock.current += dt;
    hd.still += dt;
    hd.wake -= dt;
    // A hand dragged through the water leaves a wake of small rings.
    if (hd.pressed && hd.speed > 30 && hd.wake <= 0) {
      hd.wake = 0.09;
      rings.current.push({
        x: hd.x,
        y: hd.y,
        age: 0,
        life: 1.1,
        strength: 0.45,
        touched: 0,
      });
    }
    hd.speed *= Math.exp(-dt / 0.1);

    for (const f of fishes) {
      const cruise = f.size * 0.5;
      let dx = 0;
      let dy = 0;
      // Banks: a koi may slip partly out of view before it turns back.
      const m = f.size * 0.45;
      if (f.x < m) dx += (m - f.x) / m;
      if (f.x > s.w - m) dx -= (f.x - (s.w - m)) / m;
      if (f.y < m) dy += (m - f.y) / m;
      if (f.y > s.h - m) dy -= (f.y - (s.h - m)) / m;
      dx *= 2.4;
      dy *= 2.4;
      // A loose school: toward the others, along with them, never onto
      // one at the same depth.
      let cx = 0;
      let cy = 0;
      let hx = 0;
      let hy = 0;
      let mates = 0;
      for (const o of fishes) {
        if (o === f) continue;
        const ox = o.x - f.x;
        const oy = o.y - f.y;
        const d = Math.hypot(ox, oy) || 1;
        const near = (f.size + o.size) * 0.42;
        if (d < near && Math.abs(o.depth - f.depth) < 0.45) {
          const k = (1 - d / near) * 1.5;
          dx -= (ox / d) * k;
          dy -= (oy / d) * k;
        }
        if (o.school === f.school) {
          cx += o.x;
          cy += o.y;
          hx += Math.cos(o.heading);
          hy += Math.sin(o.heading);
          mates += 1;
        }
      }
      if (mates > 0) {
        const tx = cx / mates - f.x;
        const ty = cy / mates - f.y;
        const td = Math.hypot(tx, ty) || 1;
        if (td > f.size * 1.6) {
          dx += (tx / td) * 0.35;
          dy += (ty / td) * 0.35;
        }
        dx += (hx / mates) * 0.4;
        dy += (hy / mates) * 0.4;
      }
      // The hand.
      let pace = 1;
      if (hd.present && !L.disabled) {
        const ox = f.x - hd.x;
        const oy = f.y - hd.y;
        const d = Math.hypot(ox, oy) || 1;
        if (hd.pressed && hd.speed > 30 && d < f.size * 2.2) {
          const k = 0.85 * (1 - d / (f.size * 2.2));
          if (k > f.fear) {
            f.fear = k;
            f.fromX = hd.x;
            f.fromY = hd.y;
          }
        }
        if (f.fear < 0.12 && hd.still > 0.9 && d < f.size * 5) {
          // Curious: up to about a body length from a still hand, then
          // round it.
          const k = clamp((d - f.size * 1.15) / f.size, -1, 1) * 0.9 * f.bold;
          dx -= (ox / d) * k;
          dy -= (oy / d) * k;
          dx += (-oy / d) * 0.35 * f.bold * (1 - Math.abs(k));
          dy += (ox / d) * 0.35 * f.bold * (1 - Math.abs(k));
          if (d < f.size * 2) pace = 0.55;
        } else if (d < f.size * 1.8) {
          const k = 1.3 * (1 - d / (f.size * 1.8));
          dx += (ox / d) * k;
          dy += (oy / d) * k;
        }
      }
      if (f.fear > 0.02) {
        const ox = f.x - f.fromX;
        const oy = f.y - f.fromY;
        const d = Math.hypot(ox, oy) || 1;
        dx += (ox / d) * 3 * f.fear;
        dy += (oy / d) * 3 * f.fear;
      }
      // Its own mind.
      const mind = wander(clock.current * 0.35, f.seed);
      const want = Math.atan2(
        Math.sin(f.heading) + dy,
        Math.cos(f.heading) + dx,
      );
      const most = (1.4 + 6 * f.fear) * dt;
      f.heading +=
        clamp(angleTo(f.heading, want), -most, most) + mind * 0.55 * dt;
      const target =
        cruise *
        (0.85 + 0.3 * wander(clock.current * 0.2, f.seed ^ 0x77)) *
        pace *
        (1 + 5 * f.fear);
      f.speed +=
        (target - f.speed) *
        (1 - Math.exp(-dt / (target > f.speed ? 0.12 : 0.9)));
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.y += Math.sin(f.heading) * f.speed * dt;
      f.fear *= Math.exp(-dt / 1.6);
      if (f.fear < 0.005) f.fear = 0;
      f.swim += dt * (2.2 + (5 * f.speed) / f.size);
      // The body follows the head, link by link, and no joint bends
      // further than a koi's spine can: a hard turn swings the tail wide
      // instead of folding the body.
      const seg = (f.size / 8) * 0.92;
      const sp = f.spine;
      sp[0] = f.x;
      sp[1] = f.y;
      let bx = -Math.cos(f.heading);
      let by = -Math.sin(f.heading);
      for (let i = 1; i < SPINE; i += 1) {
        const px = sp[(i - 1) * 2] ?? 0;
        const py = sp[(i - 1) * 2 + 1] ?? 0;
        const qx = (sp[i * 2] ?? px) - px;
        const qy = (sp[i * 2 + 1] ?? py) - py;
        const d = Math.hypot(qx, qy) || 1;
        let ux = qx / d;
        let uy = qy / d;
        const bend = Math.atan2(bx * uy - by * ux, bx * ux + by * uy);
        if (Math.abs(bend) > JOINT) {
          const a = Math.sign(bend) * JOINT;
          const c = Math.cos(a);
          const sn = Math.sin(a);
          ux = bx * c - by * sn;
          uy = bx * sn + by * c;
        }
        sp[i * 2] = px + ux * seg;
        sp[i * 2 + 1] = py + uy * seg;
        bx = ux;
        by = uy;
      }
      // Now and then a koi near the top kisses the surface.
      f.kiss -= dt;
      if (f.kiss <= 0) {
        f.kiss = 6 + rand() * 12;
        if (f.depth < 0.4 && L.life > 0.05) {
          rings.current.push({
            x: f.x + Math.cos(f.heading) * f.size * 0.1,
            y: f.y + Math.sin(f.heading) * f.size * 0.1,
            age: 0,
            life: 1.2,
            strength: 0.35,
            touched: 0,
          });
        }
      }
    }

    const live: Ring[] = [];
    for (const ring of rings.current) {
      ring.age += dt;
      if (ring.age < ring.life) live.push(ring);
    }
    rings.current = live.slice(-16);

    pads.current.forEach((pad, index) => {
      for (const ring of rings.current) {
        if (ring.touched & (1 << index)) continue;
        const ox = pad.x - ring.x;
        const oy = pad.y - ring.y;
        const d = Math.hypot(ox, oy) || 1;
        const front = 4 + 64 * ring.age;
        if (Math.abs(d - front) < pad.r * 0.6) {
          ring.touched |= 1 << index;
          const k = ring.strength * (1 - ring.age / ring.life);
          pad.vx += (ox / d) * 16 * k;
          pad.vy += (oy / d) * 16 * k;
          pad.spin += (ox * ring.y > oy * ring.x ? 0.5 : -0.5) * k;
          pad.bob = Math.max(pad.bob, k * (0.4 + 0.6 * L.life));
        }
      }
      const settle = Math.exp(-dt / 2);
      pad.vx = pad.driftX + (pad.vx - pad.driftX) * settle;
      pad.vy = pad.driftY + (pad.vy - pad.driftY) * settle;
      const edge = pad.r * 0.25;
      if (pad.x < edge) pad.vx += (edge - pad.x) * 2 * dt;
      if (pad.x > s.w - edge) pad.vx -= (pad.x - (s.w - edge)) * 2 * dt;
      if (pad.y < edge) pad.vy += (edge - pad.y) * 2 * dt;
      if (pad.y > s.h - edge) pad.vy -= (pad.y - (s.h - edge)) * 2 * dt;
      if ((pad.x < 0 && pad.driftX < 0) || (pad.x > s.w && pad.driftX > 0)) {
        pad.driftX = -pad.driftX;
      }
      if ((pad.y < 0 && pad.driftY < 0) || (pad.y > s.h && pad.driftY > 0)) {
        pad.driftY = -pad.driftY;
      }
      pad.x += pad.vx * dt;
      pad.y += pad.vy * dt;
      pad.rot += pad.spin * dt;
      pad.spin *= Math.exp(-dt / 1.5);
      pad.bob *= Math.exp(-dt / 0.7);
    });
  };

  /** Reduced motion: only fades and fading rings move, and only for a moment. */
  const settleStill = (dt: number) => {
    let moving = false;
    const rate = dt / durations.base;
    for (const f of koi.current) {
      if (f.fade !== f.fadeTo) {
        f.fade =
          f.fadeTo > f.fade
            ? Math.min(f.fadeTo, f.fade + rate)
            : Math.max(f.fadeTo, f.fade - rate);
        moving = true;
      }
    }
    const live: Ring[] = [];
    for (const ring of rings.current) {
      ring.age += dt;
      if (ring.age < ring.life) live.push(ring);
    }
    rings.current = live;
    return moving || live.length > 0;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(1 / 30, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    if (!latest.current.motionSafe) {
      const moving = settleStill(dt);
      draw();
      if (moving) frame.current = window.requestAnimationFrame(tick);
      else last.current = 0;
      return;
    }
    step(dt);
    draw();
    frame.current = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    if (frame.current || !scene.current) return;
    if (!visible.current || document.hidden) {
      dirty.current = true;
      return;
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  const paint = () => {
    palette.current = readPalette();
    prepare();
    draw();
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const was = scene.current;
    if (was && was.w === w && was.h === h && was.dpr === dpr) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const s: Scene = {
      w,
      h,
      dpr,
      unit: clamp(Math.sqrt(w * h) * 0.115, 34, 92),
      water: null,
      rim: null,
      glints: null,
    };
    scene.current = s;
    if (!was || Math.abs(was.unit - s.unit) > 1) {
      koi.current = [];
      lay(s);
    } else {
      // Resized a little: keep the pond, nudge everything back inside.
      for (const f of koi.current) {
        f.x = clamp(f.x, 0, w);
        f.y = clamp(f.y, 0, h);
      }
    }
    stock();
    if (!palette.current) palette.current = readPalette();
    prepare();
    draw();
    kick();
  };

  const api = React.useRef<Api>({ resize, paint, kick, stock });
  React.useEffect(() => {
    api.current = { resize, paint, kick, stock };
  });

  React.useEffect(() => {
    api.current.stock();
    api.current.paint();
    api.current.kick();
  }, [count, life, motionSafe]);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const rect = root?.getBoundingClientRect();
    if (!root || !rect) return { x: 0, y: 0, inside: false };
    const x = clientX - rect.left - root.clientLeft;
    const y = clientY - rect.top - root.clientTop;
    return {
      x,
      y,
      inside:
        x >= 0 && y >= 0 && x <= root.clientWidth && y <= root.clientHeight,
    };
  };

  const moveTo = (
    x: number,
    y: number,
    at: number,
    source: "pointer" | "key",
  ) => {
    const hd = hand.current;
    const dt = hd.at ? Math.max(8, at - hd.at) / 1000 : 0;
    const moved = Math.hypot(x - hd.x, y - hd.y);
    if (dt > 0 && hd.present) hd.speed = Math.max(hd.speed * 0.5, moved / dt);
    if (moved > 1.5) hd.still = 0;
    hd.x = x;
    hd.y = y;
    hd.at = at;
    hd.present = true;
    hd.source = source;
    if (source === "pointer") hd.ring = false;
    kick();
  };

  /** Returns the koi under reduced motion to where they rest. */
  const sendHome = () => {
    if (homeTimer.current !== null) window.clearTimeout(homeTimer.current);
    homeTimer.current = window.setTimeout(() => {
      homeTimer.current = null;
      if (document.hidden || !visible.current) {
        sendHome();
        return;
      }
      for (const f of koi.current) f.fadeTo = 0;
      kick();
    }, 2600);
  };

  /** The hand touches the water: a ring, and every koi within reach flees. */
  const touch = (source: "pointer" | "key") => {
    const s = scene.current;
    const hd = hand.current;
    if (!s || latest.current.disabled) return;
    hd.pressed = true;
    hd.present = true;
    hd.source = source;
    rings.current.push({
      x: hd.x,
      y: hd.y,
      age: 0,
      life: latest.current.motionSafe ? 1.6 : 0.6,
      strength: 1,
      touched: 0,
    });
    const scattered = scare(
      koi.current,
      hd.x,
      hd.y,
      latest.current.motionSafe,
      s.w,
      s.h,
    );
    if (!latest.current.motionSafe) sendHome();
    kick();
    latest.current.onScatter?.(scattered);
    setSaid((v) => ({
      n: v.n + 1,
      text:
        scattered === 0
          ? "The water rings; no koi were close."
          : `${scattered} koi scattered.`,
    }));
  };

  const lift = (source: "pointer" | "key", stay: boolean) => {
    const hd = hand.current;
    if (hd.source !== source) return;
    hd.pressed = false;
    if (!stay) hd.present = false;
    rootRef.current?.removeAttribute("data-pressing");
    kick();
  };

  const away = () => {
    const hd = hand.current;
    hd.pressed = false;
    hd.present = false;
    hd.ring = false;
    rootRef.current?.removeAttribute("data-pressing");
    kick();
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onEnd: ({ point, event }) => {
      const at = local(point.x, point.y);
      lift("pointer", event.pointerType !== "touch" && at.inside);
    },
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      lift("pointer", event.pointerType !== "touch" && at.inside);
    },
    onCancel: () => lift("pointer", false),
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && hit !== surfaceRef.current && rootRef.current?.contains(hit))
      return;
    const at = local(event.clientX, event.clientY);
    rootRef.current?.setAttribute("data-pressing", "");
    moveTo(at.x, at.y, event.timeStamp, "pointer");
    touch("pointer");
    drag.onPointerDown(event);
    // A touch that ends before it became a drag, off the pond or by a
    // cancel, never reaches the drag's own end; the hand still lifts.
    unlisten.current?.();
    const id = event.pointerId;
    const release = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      unlisten.current?.();
      const hd = hand.current;
      if (hd.pressed && hd.source === "pointer") {
        const spot = local(e.clientX, e.clientY);
        lift(
          "pointer",
          e.type === "pointerup" && e.pointerType !== "touch" && spot.inside,
        );
      }
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    unlisten.current = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      unlisten.current = null;
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (disabled) return;
    const hd = hand.current;
    if (hd.pressed && hd.source !== "pointer") return;
    if (!hd.pressed && event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    moveTo(at.x, at.y, event.timeStamp, "pointer");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const s = scene.current;
    const hd = hand.current;
    if (!s || (hd.pressed && hd.source === "pointer")) return;
    lastKey.current = event.timeStamp;
    const stepBy = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-stepBy, 0],
      ArrowRight: [stepBy, 0],
      ArrowUp: [0, -stepBy],
      ArrowDown: [0, stepBy],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      if (!hd.present) {
        hd.x = s.w / 2;
        hd.y = s.h / 2;
      }
      hd.ring = true;
      moveTo(
        clamp(hd.x + move[0], 0, s.w),
        clamp(hd.y + move[1], 0, s.h),
        event.timeStamp,
        "key",
      );
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (event.repeat) return;
      if (!hd.present) {
        hd.x = s.w / 2;
        hd.y = s.h / 2;
      }
      hd.ring = true;
      hd.at = 0;
      touch("key");
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    lastKey.current = event.timeStamp;
    lift("key", true);
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    const s = scene.current;
    if (!s || disabled || !event.currentTarget.matches(":focus-visible"))
      return;
    const hd = hand.current;
    if (!hd.present) {
      hd.x = s.w / 2;
      hd.y = s.h / 2;
    }
    hd.present = true;
    hd.ring = true;
    hd.at = 0;
    hd.still = 0;
    hd.source = "key";
    kick();
  };

  const onBlur = () => {
    if (hand.current.source === "key") away();
  };

  // A click with no pointer and no key behind it — assistive technology —
  // touches the water once.
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 || disabled) return;
    if (event.timeStamp - lastKey.current < 500) return;
    const s = scene.current;
    const hd = hand.current;
    if (!s) return;
    if (!hd.present) {
      hd.x = s.w / 2;
      hd.y = s.h / 2;
    }
    touch("key");
    lift("key", true);
  };

  React.useEffect(() => {
    if (!disabled) return;
    const hd = hand.current;
    hd.pressed = false;
    hd.present = false;
    hd.ring = false;
    rootRef.current?.removeAttribute("data-pressing");
    api.current.kick();
  }, [disabled]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        const hd = hand.current;
        hd.pressed = false;
        hd.present = false;
        rootRef.current?.removeAttribute("data-pressing");
        return;
      }
      if (dirty.current) api.current.paint();
      api.current.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    const home = homeTimer;
    const listening = unlisten;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      if (home.current !== null) window.clearTimeout(home.current);
      home.current = null;
      listening.current?.();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        if (dirty.current) api.current.paint();
        api.current.kick();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // A new theme or water changes the canvas's colours; the 1ms colour
  // transition says when, and the pond is drawn again from them.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current.paint();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        const hd = hand.current;
        if (hd.source === "pointer" && !hd.pressed) away();
      }}
      className={cn(
        "group/koi-pond relative isolate h-full w-full overflow-clip data-pressing:select-none",
        // The hand moves over the water in any direction; a disabled pond
        // gives the page its scrolling back.
        disabled ? "touch-auto" : "touch-none",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={carriers}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/koi-pond:hidden"
        style={{ backgroundImage: standIn(carriers) }}
      />
      <div className="relative z-10 size-full">{children}</div>
      <button
        ref={surfaceRef}
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={onClick}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        Move over the water and the koi keep their distance; keep still and they
        come closer. Press, or Space or Enter, to touch the water. Arrow keys
        move your hand.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
