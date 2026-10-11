"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AsciiHearthRamp = "classic" | "blocks" | "dots";
export type AsciiHearthLevel = "embers" | "low" | "steady" | "roaring";

export type AsciiHearthProps = {
  /** How tall the fire burns while it is tended, 0 (embers) to 1. @default 0.6 */
  heat?: number;
  /** The glyph ramp the fire is drawn in, coolest to hottest. @default "classic" */
  charRamp?: AsciiHearthRamp;
  /** How strongly the pointer's speed fans the fire and leans the flames, 0 to 1. @default 0.5 */
  draught?: number;
  /** How long the fire burns untended before it banks down to embers, ms. @default 5000 */
  bankAfter?: number;
  /** Sparks fly from the bed while the fire is fanned. @default true */
  sparks?: boolean;
  /** Draw the brick surround and hearthstone; off, the fire burns in a plain dark box. @default true */
  bricks?: boolean;
  /** Glyph size in px (7 to 16). @default 9 */
  size?: number;
  /** Five CSS colours from ember to white-hot. Pigments at fixed lightness by default, so the fire reads the same in both themes. */
  colors?: readonly string[];
  /** Brick ink, any CSS colour. @default "color-mix(in oklab, var(--danger) 28%, var(--ink-3))" */
  brickColor?: string;
  /** The pointer and the keyboard work the bellows. @default true */
  interactive?: boolean;
  /** Hold the flames where they are. @default false */
  paused?: boolean;
  /** Seeds the logs, the tongues and the sparks. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the fire changes level: banked to embers, low, steady or roaring. */
  onLevelChange?: (level: AsciiHearthLevel) => void;
  /** The fire's name; the button reads "<label>: work the bellows". @default "Fire" */
  label?: string;
  /** No bellows: the fire keeps its level and the button says so. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box. @default "h-52 w-full" */
  className?: string;
};

const DEFAULT_COLORS = [
  "oklch(from var(--danger) 0.42 0.15 h)",
  "oklch(from var(--danger) 0.6 0.19 calc(h + 20))",
  "oklch(from var(--warn) 0.76 0.16 calc(h - 16))",
  "oklch(from var(--warn) 0.88 0.13 calc(h + 10))",
  "oklch(from var(--warn) 0.97 0.04 h)",
] as const;

const RAMPS: Record<AsciiHearthRamp, string> = {
  classic: ".:-=+*#%@",
  blocks: "·░▒▓█",
  dots: "·∙•●⬤",
};

/** Heat inks in the atlas, ember to white-hot. */
const INKS = 12;
const SOOT = "oklch(0.16 0.012 40)";
const SIM_HZ = 30;
const BANKED_HZ = 12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Seeded value noise on a lattice, smooth between points. */
function valueNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
}

const levelOf = (level: number, air: number): AsciiHearthLevel =>
  level + air * 0.6 >= 0.95
    ? "roaring"
    : level < 0.27
      ? "embers"
      : level < 0.45
        ? "low"
        : "steady";

type Config = {
  heat: number;
  charRamp: AsciiHearthRamp;
  draught: number;
  bankAfter: number;
  sparks: boolean;
  bricks: boolean;
  size: number;
  interactive: boolean;
  disabled: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  colorKey: string;
  motionSafe: boolean;
};

type Grid = {
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  cwD: number;
  chD: number;
  dpr: number;
  w: number;
  h: number;
  x0: number;
  y0: number;
  /** The firebox, in cells. */
  fx: number;
  fy: number;
  fw: number;
  fh: number;
  heat: Float32Array;
  next: Float32Array;
  fuel: Float32Array;
  /** Reduced motion: the still frames, tended, roaring and banked. */
  still: Float32Array[];
};

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  refont: () => void;
  wake: () => void;
  fan: (x: number, y: number, t: number) => void;
  away: () => void;
  puff: () => void;
  dispose: () => void;
};

const STEP = 1 / 120;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement[],
  visible: React.RefObject<boolean>,
  report: React.RefObject<(level: AsciiHearthLevel, announce: boolean) => void>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let grid: Grid | null = null;
  let atlas: HTMLCanvasElement | null = null;
  let wall: HTMLCanvasElement | null = null;
  let ramp: string[] = [];
  let inks: string[] = [];
  let brickInk = "currentColor";
  let stoneInk = "currentColor";
  let glowInk = "transparent";
  let glowEnd = "transparent";
  let family = "ui-monospace, monospace";
  let frame = 0;
  let timer = 0;
  let last = 0;
  let acc = 0;
  let disposed = false;
  let t = 0;
  let noise = valueNoise(1);
  let rand = lcg(1);
  const sparks: Spark[] = [];
  // The fire's state.
  let level = 0.6;
  let air = 0;
  let airV = 0;
  let airTarget = 0;
  let lean = 0;
  let leanV = 0;
  let leanTarget = 0;
  let lastInput = 0;
  let shown: AsciiHearthLevel | null = null;
  // The pointer, for its speed.
  let px = -1;
  let py = -1;
  let pt = 0;
  // Reduced motion: which still is showing and the crossfade to the next.
  let stillFrom = 0;
  let stillTo = 0;
  let stillMix = 1;
  let stillHoldUntil = 0;

  const readColours = () => {
    const read = (k: number, fallback: string) => {
      const el = carriers[k];
      return el ? getComputedStyle(el).color : fallback;
    };
    inks = carriers.slice(0, INKS).map((el) => getComputedStyle(el).color);
    brickInk = read(INKS, brickInk);
    stoneInk = read(INKS + 1, stoneInk);
    glowInk = read(INKS + 2, glowInk);
    // The glow fades to its own colour at zero alpha, not to transparent
    // black, so its edge never greys.
    glowEnd = read(INKS + 3, glowEnd);
    family = getComputedStyle(canvas).fontFamily || family;
    buildAtlas();
    buildWall();
  };

  const buildAtlas = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c || !ctx) return;
    ramp = Array.from(RAMPS[c.charRamp] ?? RAMPS.classic);
    const chars = [...ramp, "'", "·", "*"];
    const a = atlas ?? document.createElement("canvas");
    a.width = Math.max(1, chars.length * g.cwD);
    a.height = Math.max(1, INKS * g.chD);
    const actx = a.getContext("2d");
    if (!actx) return;
    actx.clearRect(0, 0, a.width, a.height);
    actx.font = `600 ${Math.round(clamp(c.size, 7, 16) * g.dpr)}px ${family}`;
    actx.textAlign = "center";
    actx.textBaseline = "middle";
    for (let k = 0; k < INKS; k += 1) {
      actx.fillStyle = inks[k] ?? "currentColor";
      chars.forEach((ch, i) => {
        actx.fillText(ch, i * g.cwD + g.cwD / 2, k * g.chD + g.chD / 2);
      });
    }
    atlas = a;
  };

  /** The brick surround, the soot of the firebox and the hearthstone, drawn once. */
  const buildWall = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c || !ctx) return;
    const wc = wall ?? document.createElement("canvas");
    wc.width = canvas.width;
    wc.height = canvas.height;
    const wctx = wc.getContext("2d");
    if (!wctx) return;
    wctx.clearRect(0, 0, wc.width, wc.height);
    wctx.font = `500 ${Math.round(clamp(c.size, 7, 16) * g.dpr)}px ${family}`;
    wctx.textAlign = "center";
    wctx.textBaseline = "middle";
    const r = lcg(c.seed * 17 + 5);
    const at = (i: number, j: number) => [
      Math.round((g.x0 + (i + 0.5) * g.cw) * g.dpr),
      Math.round((g.y0 + (j + 0.5) * g.ch) * g.dpr),
    ];
    const inOpening = (i: number, j: number) => {
      if (i < g.fx || i >= g.fx + g.fw || j < g.fy || j >= g.fy + g.fh)
        return false;
      // An arched top: the corners of the first rows belong to the wall.
      const row = j - g.fy;
      const inset = row === 0 ? 3 : row === 1 ? 1 : 0;
      return i >= g.fx + inset && i < g.fx + g.fw - inset;
    };
    // Soot: the firebox opening, dark in both themes, with the firebrick
    // of its back wall just showing — the fire's light does the rest.
    wctx.fillStyle = SOOT;
    for (let j = g.fy; j < g.fy + g.fh; j += 1) {
      for (let i = g.fx; i < g.fx + g.fw; i += 1) {
        if (!inOpening(i, j)) continue;
        wctx.fillRect(
          Math.floor((g.x0 + i * g.cw) * g.dpr),
          Math.floor((g.y0 + j * g.ch) * g.dpr),
          Math.ceil(g.cwD) + 1,
          Math.ceil(g.chD) + 1,
        );
      }
    }
    wctx.fillStyle = brickInk;
    for (let j = g.fy; j < g.fy + g.fh; j += 1) {
      for (let i = g.fx; i < g.fx + g.fw; i += 1) {
        if (!inOpening(i, j)) continue;
        const [x, y] = at(i, j);
        const joint = (i + (j % 2) * 3) % 6 === 0;
        // Deeper in shadow toward the top of the box.
        wctx.globalAlpha =
          (joint ? 0.16 : 0.1) * (0.4 + (0.6 * (j - g.fy)) / g.fh);
        wctx.fillText(joint ? "|" : "_", x ?? 0, y ?? 0);
      }
    }
    wctx.globalAlpha = 1;
    if (!c.bricks) {
      wall = wc;
      return;
    }
    const hearth = g.fy + g.fh;
    for (let j = 0; j < g.rows; j += 1) {
      for (let i = 0; i < g.cols; i += 1) {
        if (inOpening(i, j)) continue;
        const [x, y] = at(i, j);
        if (j === g.fy - 1 && i >= g.fx - 1 && i <= g.fx + g.fw) {
          // The lintel over the opening.
          wctx.globalAlpha = 0.8;
          wctx.fillStyle = brickInk;
          wctx.fillText("=", x ?? 0, y ?? 0);
          continue;
        }
        if (
          j >= hearth &&
          j <= hearth + 1 &&
          i >= g.fx - 3 &&
          i <= g.fx + g.fw + 2
        ) {
          // The hearthstone, a slab wider than the opening.
          wctx.globalAlpha = j === hearth ? 0.5 : 0.28;
          wctx.fillStyle = stoneInk;
          wctx.fillText(j === hearth ? "▀" : "▔", x ?? 0, y ?? 0);
          continue;
        }
        // Running bond: a joint every four cells, offset by two on alternate courses.
        const joint = (i + (j % 2) * 2) % 4 === 0;
        wctx.globalAlpha = joint ? 0.42 : 0.3 + r() * 0.22;
        wctx.fillStyle = brickInk;
        wctx.fillText(joint ? "|" : "_", x ?? 0, y ?? 0);
      }
    }
    wctx.globalAlpha = 1;
    wall = wc;
  };

  const layout = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const size = clamp(c.size, 7, 16);
    ctx.font = `600 ${size}px ${family}`;
    const advance = Math.max(size * 0.58, ctx.measureText("M").width);
    const cwD = Math.max(3, Math.round(advance * dpr));
    const chD = Math.max(4, Math.round(size * 1.04 * dpr));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const cw = cwD / dpr;
    const ch = chD / dpr;
    const cols = Math.max(8, Math.floor(w / cw));
    const rows = Math.max(8, Math.floor(h / ch));
    // A surround with some weight: three courses over the opening, the
    // hearthstone and a course under it.
    const brickRows = c.bricks ? 3 : 0;
    const fw = Math.min(
      34,
      Math.max(6, Math.round(cols * (c.bricks ? 0.5 : 1))),
    );
    const fh = Math.min(22, Math.max(5, rows - brickRows - (c.bricks ? 3 : 0)));
    const fx = Math.floor((cols - fw) / 2);
    const fy = c.bricks ? brickRows : Math.floor((rows - fh) / 2);
    const n = fw * fh;
    const g: Grid = {
      cols,
      rows,
      cw,
      ch,
      cwD,
      chD,
      dpr,
      w,
      h,
      x0: (w - cols * cw) / 2,
      y0: (h - rows * ch) / 2,
      fx,
      fy,
      fw,
      fh,
      heat: new Float32Array(n),
      next: new Float32Array(n),
      fuel: new Float32Array(fw),
      still: [],
    };
    // Logs: a smooth bump across the bed with knots in it.
    const r = lcg(c.seed * 29 + 3);
    for (let i = 0; i < fw; i += 1) {
      const u = (i + 0.5) / fw;
      // Two logs crossed in the middle: a broad bed with a hotter heart.
      const bump = Math.max(
        Math.exp(-Math.pow((u - 0.4) / 0.24, 2)),
        Math.exp(-Math.pow((u - 0.62) / 0.22, 2)) * 0.95,
      );
      g.fuel[i] = clamp(bump * (0.82 + r() * 0.3), 0, 1.05);
    }
    grid = g;
    noise = valueNoise(Math.imul(Math.round(c.seed) | 0, 2246822519) | 0);
    rand = lcg(c.seed * 41 + 9);
    sparks.length = 0;
    buildAtlas();
    buildWall();
    if (!c.motionSafe) buildStills();
    else {
      // Light it from cold for a moment so the first frame has flames.
      for (let k = 0; k < 40; k += 1) simulate(1 / SIM_HZ, false);
    }
  };

  /** One fixed step of the heat field. */
  const simulate = (dt: number, live: boolean) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    t += dt;
    const { fw, fh, heat, next, fuel } = g;
    const flameRows = fh * (0.3 + 0.75 * level) * (1 + 0.7 * Math.max(0, air));
    const cool = 1 / Math.max(2, flameRows);
    const rise = 3.2 + 4 * Math.max(0, air);
    const bottom = fh - 1;
    for (let i = 0; i < fw; i += 1) {
      const flicker = noise(i * 0.55, t * 2.4);
      // The bed burns white-hot where the logs are thickest; banked, it
      // glows red with a slow breath in it.
      const bed =
        (fuel[i] ?? 0) *
        ((0.36 + 0.86 * level) * (0.86 + 0.3 * flicker) +
          Math.max(0, air) * 0.45);
      next[bottom * fw + i] = clamp(bed, 0, 1.15);
    }
    for (let j = bottom - 1; j >= 0; j -= 1) {
      const sx = lean * 0.9;
      for (let i = 0; i < fw; i += 1) {
        // Sample the row below, shifted by the lean, spread over three cells.
        const x = i - sx;
        const ix = Math.floor(x);
        const fx = x - ix;
        const below = (j + 1) * fw;
        const at = (k: number) =>
          k >= 0 && k < fw ? (next[below + k] ?? 0) : 0;
        const centre = at(ix) * (1 - fx) + at(ix + 1) * fx;
        const left = at(ix - 1) * (1 - fx) + at(ix) * fx;
        const right = at(ix + 1) * (1 - fx) + at(ix + 2) * fx;
        const spread = (left + centre * 4 + right) / 6;
        // Two octaves of rising noise carve the heat into tongues: the
        // coarse one sets where they stand, the fine one makes them lick.
        const tongue =
          noise(i * 0.42, (j + t * rise) * 0.5) * 0.7 +
          noise(i * 1.1 + 7, (j + t * rise * 1.6) * 1.2) * 0.3;
        const h = spread - cool * (0.2 + 1.65 * tongue * tongue);
        next[j * fw + i] = h > 0 ? h : 0;
      }
    }
    heat.set(next);
    if (!live || !c.sparks) return;
    // Sparks leave the bed while the fire is fanned (and now and then when hot).
    const rate = Math.max(0, air) * 22 + Math.max(0, level - 0.7) * 3;
    if (rand() < rate * dt && sparks.length < 48) {
      const i = Math.floor(fw * (0.25 + rand() * 0.5));
      sparks.push({
        x: i + 0.5,
        y: bottom - 1,
        vx: lean * 2.4 + (rand() - 0.5) * 2,
        vy: -(6 + rand() * 9) * (0.6 + Math.max(0, air)),
        life: 0.6 + rand() * 0.9,
        age: 0,
      });
    }
    for (let s = sparks.length - 1; s >= 0; s -= 1) {
      const sp = sparks[s];
      if (!sp) continue;
      sp.age += dt;
      sp.vx += lean * 4 * dt + (noise(sp.x * 0.5, t * 3 + s) - 0.5) * 6 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vy *= Math.exp(-dt * 0.6);
      if (sp.age > sp.life || sp.y < -1 || sp.x < 0 || sp.x > fw)
        sparks.splice(s, 1);
    }
  };

  /** Reduced motion: the field stepped to rest at three levels, then held. */
  const buildStills = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const keep = { level, air, lean, t };
    const make = (lv: number, a: number) => {
      level = lv;
      air = a;
      lean = 0;
      t = 0;
      g.heat.fill(0);
      g.next.fill(0);
      for (let k = 0; k < 90; k += 1) simulate(1 / SIM_HZ, false);
      return Float32Array.from(g.heat);
    };
    const tended = clamp(c.heat, 0, 1);
    g.still = [
      make(tended, 0),
      make(Math.max(tended, 0.85), 0.5),
      make(0.22, 0),
    ];
    level = keep.level;
    air = keep.air;
    lean = keep.lean;
    t = keep.t;
  };

  const integrate = (dt: number) => {
    const c = cfg;
    if (!c) return;
    // Bellows: the air is a recoil spring chasing a target that bleeds away,
    // so a fast pass (or a puff) makes the flames leap twice and settle; the
    // lean goes with it.
    airTarget *= Math.exp(-dt / 0.8);
    leanTarget *= Math.exp(-dt / 1.2);
    const rs = springs.recoil;
    const ds = springs.drift;
    let left = dt;
    while (left > 0) {
      const h1 = Math.min(STEP, left);
      left -= h1;
      airV +=
        ((-rs.stiffness * (air - airTarget) - rs.damping * airV) / rs.mass) *
        h1;
      air += airV * h1;
      leanV +=
        ((-ds.stiffness * (lean - leanTarget) - ds.damping * leanV) / ds.mass) *
        h1;
      lean += leanV * h1;
    }
    // Level: up quickly when tended, down slowly to embers when left alone.
    const tended =
      performance.now() - lastInput < clamp(c.bankAfter, 500, 600000);
    const goal = tended
      ? clamp(c.heat, 0, 1)
      : Math.min(0.22, clamp(c.heat, 0, 1));
    level += (goal - level) * (1 - Math.exp(-dt / (goal > level ? 1.1 : 6)));
    const now = levelOf(level, Math.max(0, air));
    if (now !== shown) {
      shown = now;
      report.current(now, true);
    }
  };

  const draw = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c || !ctx || !atlas) return;
    const img = atlas;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (wall) ctx.drawImage(wall, 0, 0);
    // Firelight on the surround and the hearth, stronger as the fire grows.
    const bedX = (g.x0 + (g.fx + g.fw / 2) * g.cw) * g.dpr;
    const bedY = (g.y0 + (g.fy + g.fh) * g.ch) * g.dpr;
    const glow = clamp(level * 0.8 + Math.max(0, air) * 0.4, 0, 1);
    if (glow > 0.02) {
      const radius = g.fw * g.cw * (0.55 + glow * 0.5) * g.dpr;
      const grad = ctx.createRadialGradient(bedX, bedY, 0, bedX, bedY, radius);
      grad.addColorStop(0, glowInk);
      grad.addColorStop(1, glowEnd);
      ctx.globalAlpha = 0.22 * glow;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    const n = ramp.length;
    const put = (field: Float32Array, alpha: number) => {
      for (let j = 0; j < g.fh; j += 1) {
        for (let i = 0; i < g.fw; i += 1) {
          // Keep the arch: the top corners are wall.
          if (
            (j === 0 && (i < 3 || i >= g.fw - 3)) ||
            (j === 1 && (i < 1 || i >= g.fw - 1))
          )
            continue;
          const h = field[j * g.fw + i] ?? 0;
          if (h < 0.05) continue;
          // Glyphs lean light: the heaviest mark is kept for the core.
          const gi = Math.min(
            n - 1,
            Math.floor(Math.pow(clamp(h, 0, 0.999), 1.35) * n),
          );
          // Ink leans hot: a flame is mostly orange with a pale core.
          const ink = Math.min(
            INKS - 1,
            Math.floor(Math.pow(clamp(h, 0, 0.999), 0.8) * INKS),
          );
          ctx.globalAlpha = Math.min(1, alpha * (0.35 + h * 0.9));
          ctx.drawImage(
            img,
            gi * g.cwD,
            ink * g.chD,
            g.cwD,
            g.chD,
            Math.round((g.x0 + (g.fx + i) * g.cw) * g.dpr),
            Math.round((g.y0 + (g.fy + j) * g.ch) * g.dpr),
            g.cwD,
            g.chD,
          );
        }
      }
    };
    if (c.motionSafe) put(g.heat, 1);
    else {
      const from = g.still[stillFrom];
      const to = g.still[stillTo];
      if (from && stillMix < 1) put(from, 1 - stillMix);
      if (to) put(to, stillMix);
    }
    // Sparks: a bright mark, cooling to a dim one.
    for (const sp of sparks) {
      const life = 1 - sp.age / sp.life;
      const gi = n + (life > 0.66 ? 2 : life > 0.33 ? 0 : 1);
      const ink = Math.min(
        INKS - 1,
        Math.round(INKS * (0.45 + life * 0.55)) - 1,
      );
      ctx.globalAlpha = Math.min(1, 0.3 + life * 0.7);
      ctx.drawImage(
        img,
        gi * g.cwD,
        ink * g.chD,
        g.cwD,
        g.chD,
        Math.round((g.x0 + (g.fx + sp.x - 0.5) * g.cw) * g.dpr),
        Math.round((g.y0 + (g.fy + sp.y) * g.ch) * g.dpr),
        g.cwD,
        g.chD,
      );
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const settled = () =>
    Math.abs(air) < 0.004 &&
    Math.abs(airV) < 0.01 &&
    Math.abs(lean) < 0.004 &&
    Math.abs(leanV) < 0.01 &&
    sparks.length === 0;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    const g = grid;
    if (disposed || !c || !g || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!c.motionSafe) {
      // Reduced motion: a crossfade between stills, then nothing runs.
      stillMix = Math.min(1, stillMix + dt / 0.24);
      draw();
      if (stillMix < 1) frame = window.requestAnimationFrame(tick);
      else {
        last = 0;
        scheduleStill();
      }
      return;
    }
    if (c.paused) {
      draw();
      last = 0;
      return;
    }
    integrate(dt);
    // Banked embers step at a slower clock: they barely change.
    const hz = level < 0.25 && air < 0.03 && settled() ? BANKED_HZ : SIM_HZ;
    acc += dt;
    let stepped = false;
    while (acc >= 1 / hz) {
      acc -= 1 / hz;
      simulate(1 / hz, true);
      stepped = true;
    }
    if (stepped) draw();
    const cold = clamp(c.heat, 0, 1) <= 0 && level < 0.01 && settled();
    if (cold) {
      last = 0;
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: hold a roaring still, then fall back; bank after a while. */
  const scheduleStill = () => {
    const c = cfg;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (!c || c.motionSafe) return;
    const nowMs = performance.now();
    const goal =
      nowMs < stillHoldUntil
        ? 1
        : nowMs - lastInput < clamp(c.bankAfter, 500, 600000)
          ? 0
          : 2;
    if (goal !== stillTo) {
      stillFrom = stillTo;
      stillTo = goal;
      stillMix = 0;
      const lv: AsciiHearthLevel =
        goal === 1
          ? "roaring"
          : goal === 2
            ? "embers"
            : levelOf(clamp(c.heat, 0, 1), 0);
      if (lv !== shown) {
        shown = lv;
        report.current(lv, true);
      }
      kick();
      return;
    }
    const wake =
      goal === 1
        ? stillHoldUntil - nowMs
        : goal === 0
          ? lastInput + clamp(c.bankAfter, 500, 600000) - nowMs
          : -1;
    if (wake > 0) {
      timer = window.setTimeout(
        () => {
          timer = 0;
          scheduleStill();
        },
        Math.ceil(wake) + 10,
      );
    }
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !grid)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const rebuild = () => {
    layout();
    draw();
    kick();
  };

  const input = () => {
    lastInput = performance.now();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        level = clamp(next.heat, 0, 1);
        lastInput = performance.now();
        // The level is state: reported from the start, but not announced.
        shown = levelOf(level, 0);
        report.current(shown, false);
        readColours();
        rebuild();
        if (!next.motionSafe) scheduleStill();
        return;
      }
      if (
        was.size !== next.size ||
        was.dpr !== next.dpr ||
        was.seed !== next.seed ||
        was.bricks !== next.bricks
      ) {
        rebuild();
        if (!next.motionSafe) scheduleStill();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      else if (was.charRamp !== next.charRamp) buildAtlas();
      if (was.heat !== next.heat) {
        input();
        if (!next.motionSafe) buildStills();
      }
      if (was.motionSafe !== next.motionSafe) {
        if (!next.motionSafe) {
          buildStills();
          stillTo = 0;
          stillMix = 1;
          scheduleStill();
        } else {
          sparks.length = 0;
        }
      }
      draw();
      kick();
    },
    resize() {
      const g = grid;
      const c = cfg;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
      if (
        g &&
        g.w === root.clientWidth &&
        g.h === root.clientHeight &&
        g.dpr === dpr
      )
        return;
      rebuild();
    },
    readColours() {
      readColours();
      draw();
    },
    refont() {
      if (!cfg || !ctx) return;
      readColours();
      rebuild();
    },
    wake() {
      draw();
      kick();
    },
    fan(x, y, time) {
      const c = cfg;
      const g = grid;
      if (!c || !g || !c.interactive || c.disabled) return;
      let push = 0;
      if (px >= 0 && time > pt) {
        const speed = Math.hypot(x - px, y - py) / ((time - pt) / 1000);
        push =
          clamp(speed / 1400, 0, 1.4) * (0.4 + 1.2 * clamp(c.draught, 0, 1));
        if (push > 0.05) {
          input();
          airTarget = Math.max(airTarget, Math.min(1.4, push));
        }
      }
      px = x;
      py = y;
      pt = time;
      // The flames lean away from where the pointer is.
      const centre = g.x0 + (g.fx + g.fw / 2) * g.cw;
      const rel = clamp(
        (x - centre) / Math.max(1, (g.fw * g.cw) / 2),
        -1.5,
        1.5,
      );
      leanTarget =
        -rel *
        (0.25 + 1.1 * clamp(c.draught, 0, 1)) *
        Math.min(1, airTarget + 0.2);
      if (!c.motionSafe) {
        if (push > 0.3) {
          stillHoldUntil = performance.now() + 1600;
          scheduleStill();
        }
        return;
      }
      kick();
    },
    away() {
      px = -1;
      leanTarget = 0;
      kick();
    },
    puff() {
      const c = cfg;
      if (!c || !c.interactive || c.disabled) return;
      input();
      if (!c.motionSafe) {
        stillHoldUntil = performance.now() + 1600;
        scheduleStill();
        return;
      }
      airTarget = Math.max(airTarget, 0.8 + 0.6 * clamp(c.draught, 0, 1));
      // A squeeze of the bellows: a kick into the air spring.
      airV += 7;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (timer) window.clearTimeout(timer);
      timer = 0;
    },
  };
}

/** The server's frame: a brick wall in seeded courses around a dark opening. */
function standInRows(seed: number) {
  const rand = lcg(seed * 17 + 5);
  const rows: string[] = [];
  for (let j = 0; j < 26; j += 1) {
    let row = "";
    for (let i = 0; i < 90; i += 1) {
      row += (i + (j % 2) * 2) % 4 === 0 ? "|" : rand() < 0.9 ? "_" : " ";
    }
    rows.push(row);
  }
  return rows;
}

/**
 * A small hearth drawn in characters: a brick surround in a running bond, a
 * lintel and a hearthstone, and in the dark firebox a fire whose every cell
 * picks its glyph from `charRamp` by its heat and its ink from a ramp of
 * ember red to white-hot. The heat field steps at a fixed 30 Hz: the bed is
 * fed by seeded logs and each cell takes the three below it, shifted by the
 * lean, minus a cooling that rising value noise carves into licking tongues.
 *
 * The pointer works the bellows: its speed over the hearth feeds the air,
 * a springs.recoil spring, so a fast pass makes the flames leap twice and
 * settle, lean away from the pointer (on the drift spring) and throw sparks.
 * Space, Enter or a click is one full puff — it is a real button. Left alone
 * for `bankAfter` ms, the fire banks down to glowing embers. Under reduced
 * motion the fire is a still frame that crossfades to a roaring still and
 * back when worked, and to an ember still when banked.
 */
export function AsciiHearth({
  heat = 0.6,
  charRamp = "classic",
  draught = 0.5,
  bankAfter = 5000,
  sparks = true,
  bricks = true,
  size = 9,
  colors = DEFAULT_COLORS,
  brickColor = "color-mix(in oklab, var(--danger) 28%, var(--ink-3))",
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onLevelChange,
  label = "Fire",
  disabled = false,
  className,
}: AsciiHearthProps) {
  const motionSafe = useMotionSafe();
  const [said, setSaid] = React.useState("");
  const stand = React.useMemo(() => standInRows(seed), [seed]);
  const stops = React.useMemo(() => {
    const list = colors.length >= 2 ? colors : DEFAULT_COLORS;
    return Array.from({ length: INKS }, (_, k) => {
      const p = (k / (INKS - 1)) * (list.length - 1);
      const a = Math.floor(p);
      const b = Math.min(list.length - 1, a + 1);
      const f = Math.round((p - a) * 100);
      return f === 0
        ? (list[a] ?? "currentColor")
        : `color-mix(in oklab, ${list[a]} ${100 - f}%, ${list[b]})`;
    });
  }, [colors]);
  const colorKey = `${stops.join("|")}|${brickColor}`;

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const callback = React.useRef(onLevelChange);
  const report = React.useRef<
    (level: AsciiHearthLevel, announce: boolean) => void
  >((level, announce) => {
    if (announce) {
      setSaid(
        level === "embers"
          ? "Banked to embers"
          : level === "roaring"
            ? "Roaring"
            : level === "low"
              ? "Burning low"
              : "Burning steadily",
      );
    }
    callback.current?.(level);
  });

  const config: Config = {
    heat,
    charRamp,
    draught,
    bankAfter,
    sparks,
    bricks,
    size,
    interactive,
    disabled,
    paused,
    seed,
    dpr,
    colorKey,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callback.current = onLevelChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carrierRefs.current.filter((c): c is HTMLSpanElement =>
      Boolean(c),
    );
    if (!root || !canvas || carriers.length < INKS + 4) return;
    const e = createEngine(root, canvas, carriers, visible, report);
    engine.current = e;
    e.configure(latest.current);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.refont();
    });
    return () => {
      live = false;
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLButtonElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
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
      visible.current = false;
    };
  }, []);

  const inert = disabled || !interactive;

  return (
    <button
      ref={bindRoot}
      type="button"
      aria-label={`${label}: work the bellows`}
      aria-disabled={inert || undefined}
      onClick={() => {
        if (!inert) engine.current?.puff();
      }}
      onPointerMove={(event) => {
        if (inert) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        const r = event.currentTarget.getBoundingClientRect();
        engine.current?.fan(
          event.clientX - r.left,
          event.clientY - r.top,
          event.timeStamp,
        );
      }}
      onPointerLeave={() => engine.current?.away()}
      className={cn(
        "group/ascii-hearth relative isolate block h-52 w-full touch-pan-y overflow-clip rounded-3 text-left outline-none select-none",
        inert ? "cursor-default" : "cursor-pointer",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full font-mono"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 block overflow-clip font-mono text-[9px] leading-[9px] whitespace-pre select-none group-data-live/ascii-hearth:hidden"
        style={{
          color: bricks
            ? `color-mix(in oklab, ${brickColor} 40%, transparent)`
            : "transparent",
        }}
      >
        {stand.map((row, j) => (
          <span key={j} className="block">
            {row}
          </span>
        ))}
        <span
          className="absolute inset-x-[20%] top-[18px] bottom-[27px] block rounded-t-2"
          style={{
            background: `radial-gradient(ellipse 60% 40% at 50% 100%, color-mix(in oklab, ${stops[3]} 55%, transparent), ${SOOT} 70%)`,
          }}
        />
      </span>
      {[
        ...stops,
        brickColor,
        "var(--ink-3)",
        `color-mix(in oklab, ${stops[7]} 80%, transparent)`,
        `color-mix(in oklab, ${stops[7]} 1%, transparent)`,
      ].map((ink, i) => (
        <span
          key={i}
          ref={(node) => {
            carrierRefs.current[i] = node;
          }}
          aria-hidden
          onTransitionEnd={() => engine.current?.readColours()}
          className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
          style={{ color: ink }}
        />
      ))}
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </button>
  );
}
