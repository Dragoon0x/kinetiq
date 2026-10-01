"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PaperFacetsPaper = "white" | "kraft" | "ink";

/** A point over the sheet, as fractions of its width and height. */
export type PaperFacetsLight = { x: number; y: number };

export type PaperFacetsProps = {
  /** What sits on the paper: a hero, a heading, a call to action. Its text takes an ink that reads on the paper. */
  children?: React.ReactNode;
  /** About how many facets show, 20 to 120: broad folds or a fine crumple. @default 72 */
  facets?: number;
  /** How deep the folds are, 0 to 1: flat card, or hard creases with dark valleys. @default 0.6 */
  relief?: number;
  /** The card. @default "white" */
  paper?: PaperFacetsPaper;
  /** Folds the sheet: the same seed always makes the same folds. A new one refolds it. @default 1 */
  seed?: number;
  /** Where the lamp rests when nobody is moving it. @default { x: 0.22, y: 0.18 } */
  rest?: PaperFacetsLight;
  /** Fires when the visitor moves the lamp (pointer, touch or keys), and with null when it goes back to rest. */
  onLightChange?: (light: PaperFacetsLight | null) => void;
  /** Let the pointer and the keyboard move the lamp. Off, the sheet is decoration only: no tab stop, no pointer handling. @default true */
  interactive?: boolean;
  /** The lamp control's accessible name. @default "Light" */
  label?: string;
  /** Sets the size. @default "h-full w-full" */
  className?: string;
};

type Stock = {
  /** The card's own colour: a fixed pigment, so a paper looks like itself on either theme. */
  base: string;
  /** Text that reads on it. */
  ink: string;
  /** How much the card shines where it faces the lamp. */
  sheen: number;
  /** Fibres in the grain. */
  fibre: number;
};

const STOCKS: Record<PaperFacetsPaper, Stock> = {
  white: {
    base: "oklch(0.965 0.008 85)",
    ink: "oklch(0.24 0.02 258)",
    sheen: 0.1,
    fibre: 0.2,
  },
  kraft: {
    base: "oklch(0.7 0.075 68)",
    ink: "oklch(0.22 0.035 60)",
    sheen: 0.06,
    fibre: 1,
  },
  ink: {
    base: "oklch(0.3 0.035 262)",
    ink: "oklch(0.95 0.01 85)",
    sheen: 0.24,
    fibre: 0.35,
  },
};

const REST: PaperFacetsLight = { x: 0.22, y: 0.18 };
/** How bright the lamp is while nobody holds it. */
const RESTING = 0.6;
/** The cool fill from the sky, from the upper left and above. */
const SKY = (() => {
  const v = [-0.42, -0.58, 0.7];
  const n = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 1);
  return v.map((c) => c / n) as [number, number, number];
})();

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h = Math.imul(h ^ Math.round(p * 1000), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** A small seeded generator: the same folds every visit. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

let probe: CanvasRenderingContext2D | null = null;
/** Any CSS colour the browser can resolve, as linear-light RGB. */
function toLinear(css: string): Rgb {
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "black";
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [lin(d[0] ?? 0), lin(d[1] ?? 0), lin(d[2] ?? 0)];
}

/** Light past 0.7 rolls off toward white instead of clipping flat. */
const knee = (v: number) =>
  v < 0.7 ? v : 0.7 + 0.3 * (1 - Math.exp(-(v - 0.7) / 0.3));

const byte = (v: number) => {
  const c = clamp01(v);
  return Math.round(
    (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255,
  );
};

/**
 * The sheet's folds: vertices of a jittered triangular lattice (one cell of
 * margin past every edge, so the field runs on beyond the box), each with a
 * height in px at full relief.
 */
type Fold = {
  /** Vertices per row and rows of vertices. */
  cols: number;
  rows: number;
  xs: Float64Array;
  ys: Float64Array;
  zs: Float64Array;
  /** Three vertex indices per facet. */
  tris: Uint32Array;
};

/** A triangle wave, 1 on the ridges and -1 in the valleys: an accordion. */
const zigzag = (t: number) => 4 * Math.abs(t - Math.floor(t) - 0.5) - 1;

function foldSheet(w: number, h: number, count: number, seed: number): Fold {
  const cell = Math.sqrt((2 * w * h) / (0.866 * count));
  const rowH = cell * 0.866;
  const cols = Math.ceil(w / cell) + 3;
  const rows = Math.ceil(h / rowH) + 3;
  const span = Math.sqrt(w * h);

  // The folds: an accordion at a seeded angle and pitch, and two long
  // creases across it, each a V whose faces are planes, held to a band so
  // the sheet never rises past the lamp.
  const rand = seeded(hash(seed, 7));
  const accAngle = rand() * Math.PI;
  const pitch = span * (0.38 + rand() * 0.3);
  const accHeight = pitch * 0.2;
  const ax = Math.cos(accAngle);
  const ay = Math.sin(accAngle);
  const phase = rand();
  const creases = [0, 1].map(() => {
    const a = rand() * Math.PI;
    return {
      nx: -Math.sin(a),
      ny: Math.cos(a),
      px: rand() * w,
      py: rand() * h,
      slope: (rand() < 0.5 ? -1 : 1) * (0.14 + rand() * 0.12),
      reach: span * (0.35 + rand() * 0.3),
    };
  });

  const n = (cols + 1) * (rows + 1);
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const zs = new Float64Array(n);
  for (let j = 0; j <= rows; j += 1) {
    for (let i = 0; i <= cols; i += 1) {
      const k = j * (cols + 1) + i;
      const jitter = seeded(hash(seed, i, j, 3));
      const x =
        (i - 1.5) * cell +
        (j % 2 ? cell / 2 : 0) +
        (jitter() - 0.5) * cell * 0.62;
      const y = (j - 1) * rowH + (jitter() - 0.5) * rowH * 0.62;
      let z = accHeight * zigzag((x * ax + y * ay) / pitch + phase);
      for (const c of creases) {
        const d = (x - c.px) * c.nx + (y - c.py) * c.ny;
        z += c.slope * (Math.min(Math.abs(d), c.reach) - c.reach * 0.5);
      }
      z += (jitter() - 0.5) * cell * 0.2;
      xs[k] = x;
      ys[k] = y;
      zs[k] = z;
    }
  }

  const tris: number[] = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const a = j * (cols + 1) + i;
      const b = a + 1;
      const c = a + cols + 1;
      const d = c + 1;
      // Odd rows sit half a cell right, so the diagonal flips with the row.
      if (j % 2 === 0) tris.push(a, b, c, b, d, c);
      else tris.push(a, d, c, a, b, d);
    }
  }
  return { cols, rows, xs, ys, zs, tris: Uint32Array.from(tris) };
}

/** A tile of the card's grain: specks, and for kraft, fibres. */
function grainTile(seed: number, fibre: number): HTMLCanvasElement {
  const size = 256;
  const tile = document.createElement("canvas");
  tile.width = size;
  tile.height = size;
  const ctx = tile.getContext("2d");
  if (!ctx) return tile;
  const rand = seeded(hash(seed, 41));
  ctx.fillStyle = "rgb(128 128 128)";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i += 1) {
    const v = rand() < 0.5 ? 70 : 190;
    ctx.fillStyle = `rgb(${v} ${v} ${v} / ${r3(0.25 + rand() * 0.35)})`;
    ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), 1, 1);
  }
  const strands = Math.round(260 * fibre);
  ctx.lineCap = "round";
  for (let i = 0; i < strands; i += 1) {
    const v = rand() < 0.6 ? 80 : 180;
    ctx.strokeStyle = `rgb(${v} ${v} ${v} / ${r3(0.3 + rand() * 0.4)})`;
    ctx.lineWidth = 0.6 + rand() * 0.9;
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * Math.PI * 2;
    const len = 4 + rand() * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(a + 0.6) * len * 0.5,
      y + Math.sin(a + 0.6) * len * 0.5,
      x + Math.cos(a) * len,
      y + Math.sin(a) * len,
    );
    ctx.stroke();
  }
  return tile;
}

type Look = {
  paper: Rgb;
  room: Rgb;
  lamp: Rgb;
  sky: Rgb;
  /** How much the room lights the card: less on a dark page, so the lamp reads like a lamp at night. */
  ambient: number;
  /** How much the lamp adds: less in a bright room, which leaves it less headroom. */
  gain: number;
  sheen: number;
  grain: CanvasPattern | null;
};

type Api = {
  home: () => void;
  resize: () => void;
  rebuild: (fade: boolean) => void;
  refold: () => void;
  recolour: () => void;
  schedule: () => void;
  wake: () => void;
};

// The light's colours live on the canvas — the paper as its text colour, the
// room, the lamp and the sky as its (zero-width) border colours — so they
// resolve from the theme the sheet sits in, and a 1ms colour transition says
// when that theme (or the paper) changed. Mixes toward white are in oklab.
const inksFor = (stock: Stock): React.CSSProperties => ({
  color: stock.base,
  borderTopColor: "var(--background)",
  borderRightColor: "color-mix(in oklab, var(--warn) 12%, white)",
  borderLeftColor: "color-mix(in oklab, var(--accent) 10%, white)",
});

/**
 * A backdrop of folded card: a low-poly field of flat facets, lit by a lamp
 * the pointer carries over the sheet. Each facet's shade comes from its own
 * normal — the room's ambient, a cool fill from the sky and the lamp's warm
 * key with a soft sheen — so as the lamp moves, faces turned toward it
 * brighten, faces turned away fall into shadow, and glints run across the
 * folds. Let go and the lamp drifts home to `rest`.
 *
 * Shading is done in linear light from colours read off the canvas itself,
 * so the card follows the page's theme; frames run only while the lamp
 * moves, and only on screen. A new `seed` refolds the same sheet, every
 * vertex travelling to its new place as the card relaxes and creases again.
 * The lamp is a real control under the content: arrow keys move it. Under
 * reduced motion the lamp jumps instead of gliding and a refold cross-fades.
 */
export function PaperFacets({
  children,
  facets = 72,
  relief = 0.6,
  paper = "white",
  seed = 1,
  rest = REST,
  onLightChange,
  interactive = true,
  label = "Light",
  className,
}: PaperFacetsProps) {
  const motionSafe = useMotionSafe();
  const count = Math.round(clamp(facets, 20, 120));
  const stock = STOCKS[paper] ?? STOCKS.white;
  const restX = clamp01(rest.x);
  const restY = clamp01(rest.y);

  const [spot, setSpot] = React.useState<PaperFacetsLight | null>(null);
  const shown = spot ?? { x: restX, y: restY };

  const lx = useMotionValue(restX);
  const ly = useMotionValue(restY);
  const presence = useMotionValue(0);
  const morph = useMotionValue(1);
  const fade = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const from = React.useRef<Fold | null>(null);
  const fold = React.useRef<Fold | null>(null);
  const look = React.useRef<Look | null>(null);
  const prev = React.useRef<HTMLCanvasElement | null>(null);
  const scratch = React.useRef<HTMLCanvasElement | null>(null);
  const box = React.useRef({ w: 0, h: 0, dpr: 1 });
  const frame = React.useRef(0);
  const visible = React.useRef(true);
  const stale = React.useRef(true);
  const painted = React.useRef(false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const hovering = React.useRef(false);
  const keyed = React.useRef(false);
  const raised = React.useRef(false);
  const said = React.useRef("rest");
  const recolouring = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const latest = React.useRef({ relief, count, seed, stock, motionSafe });
  React.useEffect(() => {
    latest.current = { relief, count, seed, stock, motionSafe };
  });

  const report = (light: PaperFacetsLight | null) => {
    const next = light
      ? { x: r2(clamp01(light.x)), y: r2(clamp01(light.y)) }
      : null;
    const key = next ? `${next.x},${next.y}` : "rest";
    if (key === said.current) return;
    said.current = key;
    setSpot(next);
    onLightChange?.(next);
  };

  const lift = () => {
    if (raised.current) return;
    raised.current = true;
    if (!motionSafe) {
      halt("presence");
      presence.set(1);
      return;
    }
    run(
      "presence",
      animate(presence, 1, { duration: durations.base, ease: easings.enter }),
    );
  };

  const place = (x: number, y: number, velocity?: { x: number; y: number }) => {
    if (!motionSafe) {
      halt("lx");
      halt("ly");
      lx.set(x);
      ly.set(y);
      return;
    }
    run(
      "lx",
      animate(lx, x, {
        ...springs.glide,
        ...(velocity ? { velocity: velocity.x } : {}),
      }),
    );
    run(
      "ly",
      animate(ly, y, {
        ...springs.glide,
        ...(velocity ? { velocity: velocity.y } : {}),
      }),
    );
  };

  /** Nobody holds the lamp: it drifts home, and the facets settle. */
  const home = () => {
    raised.current = false;
    if (!motionSafe) {
      for (const k of ["lx", "ly", "presence"]) halt(k);
      lx.set(restX);
      ly.set(restY);
      presence.set(0);
    } else {
      run("lx", animate(lx, restX, springs.drift));
      run("ly", animate(ly, restY, springs.drift));
      run(
        "presence",
        animate(presence, 0, { duration: durations.page, ease: easings.move }),
      );
    }
    report(null);
  };

  const fraction = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.width < 1 || r.height < 1) return { x: restX, y: restY };
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };

  // Touch carries the lamp 1:1 (the mouse only ever hovers); vertical
  // swipes still scroll the page.
  const drag = useDrag({
    disabled: !interactive,
    onStart: () => {
      halt("lx");
      halt("ly");
      lift();
    },
    onMove: ({ point }) => {
      const { w, h } = box.current;
      const f = fraction(point.x, point.y);
      lx.set(r3(rubberClamp(f.x * w, 0, w, w * 0.25) / Math.max(1, w)));
      ly.set(r3(rubberClamp(f.y * h, 0, h, h * 0.25) / Math.max(1, h)));
      report(f);
    },
    onEnd: ({ velocity }) => {
      const { w, h } = box.current;
      if (w < 1 || h < 1) return;
      const x = clamp(project(lx.get() * w, velocity.x, 0.99), 0, w) / w;
      const y = clamp(project(ly.get() * h, velocity.y, 0.99), 0, h) / h;
      place(x, y, { x: velocity.x / w, y: velocity.y / h });
      report({ x, y });
    },
    onCancel: () => {
      place(clamp01(lx.get()), clamp01(ly.get()));
    },
    onTap: (event) => {
      const f = fraction(event.clientX, event.clientY);
      lift();
      place(clamp01(f.x), clamp01(f.y));
      report(f);
    },
  });

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const to = fold.current;
    const lk = look.current;
    if (!canvas || !ctx || !to || !lk) return;
    const sheet = (scratch.current ??= document.createElement("canvas"));
    if (sheet.width !== canvas.width || sheet.height !== canvas.height) {
      sheet.width = canvas.width;
      sheet.height = canvas.height;
    }
    const sc = sheet.getContext("2d");
    if (!sc) return;
    const { w, h, dpr } = box.current;
    const span = Math.sqrt(w * h);
    // The lamp hangs a little higher than the sheet is tall: close enough to
    // throw a pool of light, far enough that the pool spans several folds.
    const lampZ = Math.max(h * 0.95, span * 0.62);
    const Lx = lx.get() * w;
    const Ly = ly.get() * h;
    const level = lerp(RESTING, 1, clamp01(presence.get()));
    const t = clamp(morph.get(), 0, 1);
    const old = from.current && t < 1 ? from.current : null;
    // Mid-refold the card relaxes, then creases again.
    const depth =
      clamp01(latest.current.relief) *
      (old ? 1 - 0.5 * Math.sin(Math.PI * t) : 1);
    const { paper: P, room, lamp, sky, ambient, gain, sheen } = lk;
    // The room's own colour tints the ambient a little.
    const ambR = ambient * (room[0] * 0.25 + 0.75);
    const ambG = ambient * (room[1] * 0.25 + 0.75);
    const ambB = ambient * (room[2] * 0.25 + 0.75);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgb(${byte(P[0] * ambR * 0.8)} ${byte(P[1] * ambG * 0.8)} ${byte(P[2] * ambB * 0.8)})`;
    ctx.fillRect(0, 0, w, h);
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = "source-over";
    sc.globalAlpha = 1;
    sc.clearRect(0, 0, sheet.width, sheet.height);
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const c of [ctx, sc]) {
      c.lineWidth = 0.75;
      c.lineJoin = "round";
    }

    const tris = to.tris;
    const vertex = (k: number, out: Float64Array, o: number) => {
      if (old) {
        out[o] = lerp(old.xs[k] ?? 0, to.xs[k] ?? 0, t);
        out[o + 1] = lerp(old.ys[k] ?? 0, to.ys[k] ?? 0, t);
        out[o + 2] = lerp(old.zs[k] ?? 0, to.zs[k] ?? 0, t) * depth;
      } else {
        out[o] = to.xs[k] ?? 0;
        out[o + 1] = to.ys[k] ?? 0;
        out[o + 2] = (to.zs[k] ?? 0) * depth;
      }
    };
    const v = new Float64Array(9);
    const facet = (c: CanvasRenderingContext2D, colour: string) => {
      c.beginPath();
      c.moveTo(v[0] ?? 0, v[1] ?? 0);
      c.lineTo(v[3] ?? 0, v[4] ?? 0);
      c.lineTo(v[6] ?? 0, v[7] ?? 0);
      c.closePath();
      c.fillStyle = colour;
      c.strokeStyle = colour;
      c.fill();
      // Its own colour round its edge: no hairline seam between facets.
      c.stroke();
    };
    for (let i = 0; i < tris.length; i += 3) {
      vertex(tris[i] ?? 0, v, 0);
      vertex(tris[i + 1] ?? 0, v, 3);
      vertex(tris[i + 2] ?? 0, v, 6);
      const ax = v[0] ?? 0;
      const ay = v[1] ?? 0;
      const az = v[2] ?? 0;
      const bx = v[3] ?? 0;
      const by = v[4] ?? 0;
      const bz = v[5] ?? 0;
      const cx = v[6] ?? 0;
      const cy = v[7] ?? 0;
      const cz = v[8] ?? 0;
      if (
        Math.max(ax, bx, cx) < -2 ||
        Math.min(ax, bx, cx) > w + 2 ||
        Math.max(ay, by, cy) < -2 ||
        Math.min(ay, by, cy) > h + 2
      ) {
        continue;
      }
      // The facet's normal, turned to face up out of the sheet.
      const ux = bx - ax;
      const uy = by - ay;
      const uz = bz - az;
      const wx = cx - ax;
      const wy = cy - ay;
      const wz = cz - az;
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const flip = nz < 0 ? -1 : 1;
      nx = (nx / nl) * flip;
      ny = (ny / nl) * flip;
      nz = (nz / nl) * flip;

      const dx = Lx - (ax + bx + cx) / 3;
      const dy = Ly - (ay + by + cy) / 3;
      const dz = lampZ - (az + bz + cz) / 3;
      const dl = Math.hypot(dx, dy, dz) || 1;
      // How much more (or less) this facet faces the lamp than flat card
      // would there: the smooth pool of light is laid over it afterwards, so
      // a flat sheet shows no facets at all.
      const facing = Math.min(
        2.5,
        Math.max(0, (nx * dx + ny * dy + nz * dz) / dl) /
          Math.max(0.2, dz / dl),
      );
      const fill = Math.max(0, nx * SKY[0] + ny * SKY[1] + nz * SKY[2]);
      // Blinn: halfway between the lamp and the eye straight above.
      const hx = dx / dl;
      const hy = dy / dl;
      const hz = dz / dl + 1;
      const hl = Math.hypot(hx, hy, hz) || 1;
      // Only the glint a facet's tilt adds over flat card: flat card's own
      // sheen would step from facet to facet.
      const spec =
        Math.max(
          0,
          Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 26) -
            Math.pow(hz / hl, 26),
        ) * sheen;

      const shade = 0.62 + 0.38 * fill;
      const aR = P[0] * ambR * shade + 0.05 * sky[0] * fill;
      const aG = P[1] * ambG * shade + 0.05 * sky[1] * fill;
      const aB = P[2] * ambB * shade + 0.05 * sky[2] * fill;
      const bR = byte(aR);
      const bG = byte(aG);
      const bB = byte(aB);
      facet(ctx, `rgb(${bR} ${bG} ${bB})`);
      // The lamp layer carries what full lamplight adds on top of the room,
      // in the canvas's own (gamma) terms, so adding it lands on the right
      // colour; a soft knee keeps the brightest facets from flattening.
      const kR = lamp[0] * (P[0] * gain * facing + spec);
      const kG = lamp[1] * (P[1] * gain * facing + spec);
      const kB = lamp[2] * (P[2] * gain * facing + spec);
      facet(
        sc,
        `rgb(${Math.max(0, byte(knee(aR + kR)) - bR)} ${Math.max(0, byte(knee(aG + kG)) - bG)} ${Math.max(0, byte(knee(aB + kB)) - bB)})`,
      );
    }

    // The lamp's pool: Lambert on flat card times its falloff, laid smoothly
    // over the facets' own response and added to the room's light.
    const reach = lampZ * 3;
    sc.globalCompositeOperation = "destination-in";
    const pool = sc.createRadialGradient(Lx, Ly, 0, Lx, Ly, reach);
    for (let i = 0; i <= 8; i += 1) {
      const r = (i / 8) * reach;
      const flat = lampZ / Math.hypot(r, lampZ);
      const fall = 1 / (1 + (r * r) / (1.4 * lampZ * lampZ));
      pool.addColorStop(
        i / 8,
        `rgb(0 0 0 / ${i === 8 ? 0 : r3(flat * fall * level)})`,
      );
    }
    sc.fillStyle = pool;
    sc.fillRect(0, 0, w, h);
    sc.globalCompositeOperation = "source-over";
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(sheet, 0, 0, w, h);

    if (lk.grain) {
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = lk.grain;
      ctx.fillRect(0, 0, w, h);
    }

    // The sheet being replaced fades from over the new one.
    const shot = prev.current;
    const f = fade.get();
    if (shot && f < 1) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1 - f;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(shot, 0, 0);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (!painted.current) {
      painted.current = true;
      rootRef.current?.setAttribute("data-painted", "");
    }
  };

  const schedule = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      if (stale.current || !fold.current || !look.current) {
        api.current.rebuild(false);
      } else {
        draw();
      }
    });
  };

  /** Reads the paper, room, lamp and sky off the canvas, and makes the grain. */
  const recolour = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const style = getComputedStyle(canvas);
    const room = toLinear(style.borderTopColor);
    const lum = 0.2126 * room[0] + 0.7152 * room[1] + 0.0722 * room[2];
    const ctx = canvas.getContext("2d");
    const { stock: st, seed: s } = latest.current;
    const tile = grainTile(s, st.fibre);
    const grain = ctx?.createPattern(tile, "repeat") ?? null;
    grain?.setTransform(new DOMMatrix().scale(1 / box.current.dpr));
    look.current = {
      paper: toLinear(style.color),
      room,
      lamp: toLinear(style.borderRightColor),
      sky: toLinear(style.borderLeftColor),
      ambient: lerp(0.4, 0.62, clamp01(lum * 1.1)),
      gain: lerp(0.95, 0.66, clamp01(lum * 1.1)),
      sheen: st.sheen,
      grain,
    };
  };

  /** Lays the sheet for the current box and facet count; a fade covers the change. */
  const rebuild = (withFade: boolean) => {
    const canvas = canvasRef.current;
    const { w, h } = box.current;
    if (!canvas || w < 2 || h < 2) return;
    if (!visible.current || document.hidden) {
      stale.current = true;
      return;
    }
    stale.current = false;
    if (withFade && painted.current) {
      const shot = document.createElement("canvas");
      shot.width = canvas.width;
      shot.height = canvas.height;
      shot.getContext("2d")?.drawImage(canvas, 0, 0);
      prev.current = shot;
    } else {
      prev.current = null;
    }
    const { count: n, seed: s } = latest.current;
    halt("morph");
    morph.set(1);
    from.current = null;
    fold.current = foldSheet(w, h, n, s);
    recolour();
    if (prev.current) {
      fade.set(0);
      run(
        "fade",
        animate(fade, 1, { duration: durations.base, ease: easings.move }),
      );
    } else {
      halt("fade");
      fade.set(1);
    }
    draw();
  };

  /** The same sheet, folded again from a new seed. */
  const refold = () => {
    const now = fold.current;
    const { w, h } = box.current;
    if (!now || !visible.current || document.hidden || w < 2 || h < 2) {
      stale.current = true;
      return;
    }
    const { count: n, seed: s, motionSafe: safe } = latest.current;
    const next = foldSheet(w, h, n, s);
    if (!safe || next.xs.length !== now.xs.length) {
      rebuild(true);
      return;
    }
    // From wherever the last refold had got to.
    const t = clamp(morph.get(), 0, 1);
    const old = from.current;
    const here: Fold = old
      ? {
          ...now,
          xs: now.xs.map((v, k) => lerp(old.xs[k] ?? v, v, t)),
          ys: now.ys.map((v, k) => lerp(old.ys[k] ?? v, v, t)),
          zs: now.zs.map((v, k) => lerp(old.zs[k] ?? v, v, t)),
        }
      : now;
    from.current = here;
    fold.current = next;
    morph.set(0);
    run(
      "morph",
      animate(morph, 1, {
        ...springs.drift,
        onComplete: () => {
          from.current = null;
        },
      }),
    );
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w < 2 || h < 2) return;
    const b = box.current;
    if (b.w === w && b.h === h && b.dpr === dpr && fold.current) return;
    box.current = { w, h, dpr };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    halt("fade");
    prev.current = null;
    rebuild(false);
  };

  const wake = () => {
    if (!visible.current || document.hidden) return;
    if (stale.current || !fold.current) rebuild(false);
    else schedule();
  };

  const api = React.useRef<Api>({
    home,
    resize,
    rebuild,
    refold,
    recolour,
    schedule,
    wake,
  });
  React.useEffect(() => {
    api.current = { home, resize, rebuild, refold, recolour, schedule, wake };
  });

  React.useEffect(() => {
    const kick = () => api.current.schedule();
    const offs = [lx, ly, presence, morph, fade].map((v) =>
      v.on("change", kick),
    );
    return () => {
      for (const off of offs) off();
    };
  }, [lx, ly, presence, morph, fade]);

  // A new seed refolds the sheet; a new facet count lays a new one. The
  // first run only remembers what is shown.
  const shownFold = React.useRef({ seed, count });
  React.useEffect(() => {
    const was = shownFold.current;
    if (was.seed === seed && was.count === count) return;
    shownFold.current = { seed, count };
    if (was.count !== count) api.current.rebuild(true);
    else api.current.refold();
  }, [seed, count]);

  // Relief is only a redraw; a new paper is new colours and a new grain.
  React.useEffect(() => {
    api.current.schedule();
  }, [relief]);
  const shownPaper = React.useRef(paper);
  React.useEffect(() => {
    if (shownPaper.current === paper) return;
    shownPaper.current = paper;
    api.current.recolour();
    api.current.schedule();
  }, [paper]);

  React.useEffect(() => {
    if (hovering.current || keyed.current || said.current !== "rest") return;
    if (motionSafe) {
      run("lx", animate(lx, restX, springs.drift));
      run("ly", animate(ly, restY, springs.drift));
    } else {
      halt("lx");
      halt("ly");
      lx.set(restX);
      ly.set(restY);
    }
    // Moved only when the resting place itself moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restX, restY]);

  React.useEffect(() => {
    if (interactive) return;
    hovering.current = false;
    keyed.current = false;
    if (raised.current || said.current !== "rest") api.current.home();
  }, [interactive]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (recolouring.current) window.cancelAnimationFrame(recolouring.current);
      recolouring.current = 0;
      for (const c of running.values()) c.stop();
      running.clear();
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
      if (visible.current) api.current.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // A theme change re-colours the canvas's own borders; the 1ms transition
  // says when, and the sheet is lit again from them.
  const onColours = () => {
    if (recolouring.current) return;
    recolouring.current = window.requestAnimationFrame(() => {
      recolouring.current = 0;
      api.current.recolour();
      api.current.schedule();
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.2 : 0.05;
    let { x, y } = shown;
    switch (event.key) {
      case "ArrowLeft":
        x -= step;
        break;
      case "ArrowRight":
        x += step;
        break;
      case "ArrowUp":
        y -= step;
        break;
      case "ArrowDown":
        y += step;
        break;
      case "Home":
        x = 0;
        break;
      case "End":
        x = 1;
        break;
      case "PageUp":
        y = 0;
        break;
      case "PageDown":
        y = 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    x = r2(clamp01(x));
    y = r2(clamp01(y));
    lift();
    place(x, y);
    report({ x, y });
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (interactive && event.pointerType !== "mouse") {
          drag.onPointerDown(event);
        }
      }}
      onPointerMove={(event) => {
        if (!interactive) return;
        if (event.pointerType !== "mouse") {
          drag.onPointerMove(event);
          return;
        }
        hovering.current = true;
        const f = fraction(event.clientX, event.clientY);
        lift();
        place(f.x, f.y);
        report(f);
      }}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (!interactive || event.pointerType !== "mouse") return;
        hovering.current = false;
        if (!keyed.current) home();
      }}
      className={cn(
        "group/paper-facets relative isolate h-full w-full overflow-clip",
        interactive && "touch-pan-y",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/paper-facets:hidden"
        style={{
          background: `linear-gradient(135deg, ${stock.base}, color-mix(in oklab, ${stock.base} 78%, black))`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={inksFor(stock)}
      />
      {interactive ? (
        <div
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-roledescription="2D slider"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(shown.x * 100)}
          aria-valuetext={`${spot ? capital(placeName(shown)) : `At rest, ${placeName(shown)}`}, ${Math.round(shown.x * 100)}% across, ${Math.round(shown.y * 100)}% down`}
          onKeyDown={onKeyDown}
          onFocus={() => {
            keyed.current = true;
            lift();
            report(shown);
          }}
          onBlur={() => {
            keyed.current = false;
            if (!hovering.current) home();
          }}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        />
      ) : null}
      <div
        className="relative h-full"
        style={
          { color: stock.ink, "--paper-ink": stock.ink } as React.CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

/** A ninth of the sheet, in words. */
function placeName({ x, y }: PaperFacetsLight): string {
  const col = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "";
  const row = y < 1 / 3 ? "top" : y > 2 / 3 ? "bottom" : "";
  return [row, col].filter(Boolean).join(" ") || "centre";
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
