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

export type StainedGlassPalette = "cathedral" | "sea" | "dusk";

/** A point on the window, as fractions of its width and height. */
export type StainedGlassLight = { x: number; y: number };

export type StainedGlassProps = {
  /** What sits over the window: a hero, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many panes the window is cut into, 12 to 60. @default 36 */
  panes?: number;
  /** How hot the light is, 0 to 1: a soft wash, or a bright core whose coloured light spills over the leads. @default 0.6 */
  glow?: number;
  /** The glass. @default "cathedral" */
  palette?: StainedGlassPalette;
  /** Leads the window: the same seed always cuts the same panes. A new one re-leads it, from the light outward. @default 1 */
  seed?: number;
  /** Where the light rests when nobody is moving it. @default { x: 0.8, y: 0.2 } */
  rest?: StainedGlassLight;
  /** Fires when the visitor moves the light (pointer, touch or keys), and with null when it goes back to rest. */
  onLightChange?: (light: StainedGlassLight | null) => void;
  /** Let the pointer and the keyboard move the light. Off, the window is decoration only: no tab stop, no pointer handling. @default true */
  interactive?: boolean;
  /** The light control's accessible name. @default "Light" */
  label?: string;
  /** Sets the size. @default "h-full w-full" */
  className?: string;
};

type Lch = readonly [number, number, number];

/** Glass as it looks with light through it: fixed pigments, the same on either theme. */
const PALETTES: Record<StainedGlassPalette, readonly Lch[]> = {
  cathedral: [
    [0.55, 0.2, 22],
    [0.48, 0.19, 264],
    [0.78, 0.16, 70],
    [0.6, 0.15, 158],
    [0.5, 0.17, 302],
    [0.88, 0.09, 92],
  ],
  sea: [
    [0.62, 0.11, 196],
    [0.76, 0.1, 186],
    [0.46, 0.13, 248],
    [0.66, 0.12, 160],
    [0.87, 0.05, 88],
    [0.8, 0.07, 228],
  ],
  dusk: [
    [0.66, 0.16, 8],
    [0.74, 0.15, 52],
    [0.46, 0.14, 325],
    [0.42, 0.13, 278],
    [0.86, 0.07, 62],
    [0.58, 0.18, 345],
  ],
};

const REST: StainedGlassLight = { x: 0.8, y: 0.2 };
/** How lit the window is while nobody holds the light. */
const RESTING = 0.55;
/** A soft, roughly Gaussian falloff, as radial gradient stops. */
const FALLOFF: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.2, 0.89],
  [0.4, 0.62],
  [0.6, 0.34],
  [0.8, 0.13],
  [1, 0],
];
const BUCKETS = 6;

// The window's own colours live on its canvas — the room as its text colour,
// the lead, the glint and the shadow as its (zero-width) border colours — so
// they resolve from whatever theme the window sits in, and a 1ms colour
// transition says when the theme changed. Shading mixes toward black and
// white are in oklab, which keeps the hue.
const INKS: React.CSSProperties = {
  color: "var(--background)",
  borderTopColor: "color-mix(in oklab, var(--ink-3) 28%, black)",
  borderRightColor: "color-mix(in oklab, var(--warn) 20%, white)",
  borderLeftColor:
    "color-mix(in oklab, var(--background) 30%, oklch(0.45 0 0))",
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const oklch = (l: number, c: number, h: number) =>
  `oklch(${r3(clamp(l, 0, 1))} ${r3(Math.max(0, c))} ${r2(h)})`;

function hash(...parts: number[]): number {
  let h = 2166136261;
  for (const p of parts) {
    h = Math.imul(h ^ Math.round(p * 1000), 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** A small seeded generator: the same window every visit. */
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
/** Any CSS colour the browser can resolve, as sRGB bytes. */
function toRgb(css: string): Rgb {
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
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const rgba = ([r, g, b]: Rgb, a: number) => `rgb(${r} ${g} ${b} / ${r3(a)})`;

type Pt = { x: number; y: number };
type Pane = { poly: Pt[]; cx: number; cy: number; r: number; colour: Lch };
type Edge = {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  mx: number;
  my: number;
  nx: number;
  ny: number;
  len: number;
  /** Lies along the frame, which is its own, thicker came. */
  frame: boolean;
};
type Leading = { panes: Pane[]; edges: Edge[]; joints: Pt[]; lead: number };

/** Keeps the part of a polygon where nx·x + ny·y ≤ c. */
function clipHalf(poly: Pt[], nx: number, ny: number, c: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as Pt;
    const b = poly[(i + 1) % poly.length] as Pt;
    const da = nx * a.x + ny * a.y - c;
    const db = nx * b.x + ny * b.y - c;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Each site's Voronoi cell inside the box: the box cut by every bisector. */
function cells(sites: Pt[], w: number, h: number): Pt[][] {
  return sites.map((s, i) => {
    let poly: Pt[] = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
    ];
    for (let j = 0; j < sites.length && poly.length > 2; j += 1) {
      if (j === i) continue;
      const o = sites[j] as Pt;
      const nx = o.x - s.x;
      const ny = o.y - s.y;
      const c = (nx * (s.x + o.x)) / 2 + (ny * (s.y + o.y)) / 2;
      poly = clipHalf(poly, nx, ny, c);
    }
    return poly;
  });
}

function centroid(poly: Pt[]): Pt & { area: number } {
  let a = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i] as Pt;
    const q = poly[(i + 1) % poly.length] as Pt;
    const k = p.x * q.y - q.x * p.y;
    a += k;
    x += (p.x + q.x) * k;
    y += (p.y + q.y) * k;
  }
  if (Math.abs(a) < 1e-6) {
    const n = Math.max(1, poly.length);
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
      area: 0,
    };
  }
  return { x: x / (3 * a), y: y / (3 * a), area: Math.abs(a) / 2 };
}

/**
 * Cuts a window: blue-noise sites (best of a dozen candidates each, so no
 * clumps and no slivers), relaxed twice toward their cells' centres, then
 * the cells. Shared edges are found once, so each lead is one stroke and
 * the panes either side of it are neighbours that never share a colour.
 */
function leadWindow(
  w: number,
  h: number,
  count: number,
  seed: number,
  palette: readonly Lch[],
): Leading {
  const rand = seeded(hash(seed, count, 51));
  let sites: Pt[] = [];
  for (let i = 0; i < count; i += 1) {
    let best: Pt = { x: rand() * w, y: rand() * h };
    let far = -1;
    for (let k = 0; k < (i === 0 ? 1 : 12); k += 1) {
      const p = k === 0 ? best : { x: rand() * w, y: rand() * h };
      let d = Infinity;
      for (const q of sites)
        d = Math.min(d, (p.x - q.x) ** 2 + (p.y - q.y) ** 2);
      if (d > far) {
        far = d;
        best = p;
      }
    }
    sites.push(best);
  }
  for (let pass = 0; pass < 2; pass += 1) {
    sites = cells(sites, w, h).map((poly, i) =>
      poly.length > 2 ? centroid(poly) : (sites[i] as Pt),
    );
  }
  const polys = cells(sites, w, h).filter((p) => p.length > 2);

  const edges: Edge[] = [];
  const owners: number[][] = [];
  const joints: Pt[] = [];
  polys.forEach((poly, i) => {
    for (let k = 0; k < poly.length; k += 1) {
      const a = poly[k] as Pt;
      const b = poly[(k + 1) % poly.length] as Pt;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len >= 0.5) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const twin = edges.findIndex(
          (e) =>
            Math.abs(e.mx - mx) < 0.75 &&
            Math.abs(e.my - my) < 0.75 &&
            Math.abs(e.len - len) < 1,
        );
        if (twin === -1) {
          edges.push({
            ax: a.x,
            ay: a.y,
            bx: b.x,
            by: b.y,
            mx,
            my,
            nx: -(b.y - a.y) / len,
            ny: (b.x - a.x) / len,
            len,
            frame:
              (Math.abs(a.x - b.x) < 0.5 && (a.x < 0.5 || a.x > w - 0.5)) ||
              (Math.abs(a.y - b.y) < 0.5 && (a.y < 0.5 || a.y > h - 0.5)),
          });
          owners.push([i]);
        } else {
          owners[twin]?.push(i);
        }
      }
      const corner =
        (a.x < 0.5 || a.x > w - 0.5) && (a.y < 0.5 || a.y > h - 0.5);
      if (
        !corner &&
        !joints.some(
          (j) => Math.abs(j.x - a.x) < 0.75 && Math.abs(j.y - a.y) < 0.75,
        )
      ) {
        joints.push(a);
      }
    }
  });

  const neighbours = polys.map(() => new Set<number>());
  for (const o of owners) {
    const [p, q] = o;
    if (p !== undefined && q !== undefined && p !== q) {
      neighbours[p]?.add(q);
      neighbours[q]?.add(p);
    }
  }
  const picked: number[] = [];
  const panes: Pane[] = polys.map((poly, i) => {
    const order = palette.map((_, k) => k);
    for (let k = order.length - 1; k > 0; k -= 1) {
      const j = Math.floor(rand() * (k + 1));
      [order[k], order[j]] = [order[j] as number, order[k] as number];
    }
    const taken = new Set<number>();
    for (const n of neighbours[i] ?? []) {
      const c = picked[n];
      if (c !== undefined) taken.add(c);
    }
    const choice = order.find((k) => !taken.has(k)) ?? order[0] ?? 0;
    picked[i] = choice;
    const c = centroid(poly);
    const r = Math.max(...poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    return {
      poly,
      cx: c.x,
      cy: c.y,
      r,
      colour: palette[choice] ?? [0.6, 0.1, 80],
    };
  });

  const lead = clamp(Math.sqrt((w * h) / count) * 0.058, 2, 4.4);
  return { panes, edges, joints, lead };
}

const pathOf = (poly: Pt[]) => {
  const p = new Path2D();
  poly.forEach((pt, i) =>
    i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y),
  );
  p.closePath();
  return p;
};

/** The glass alone, with light through it: density, reams and seeds. */
function paintPanes(ctx: CanvasRenderingContext2D, win: Leading, seed: number) {
  for (const [i, pane] of win.panes.entries()) {
    const rand = seeded(hash(seed, i, 977));
    const [l, c, hue] = pane.colour;
    const lit = Math.min(0.96, l + 0.08);
    const path = pathOf(pane.poly);
    const a = rand() * Math.PI;
    const dx = Math.cos(a) * pane.r;
    const dy = Math.sin(a) * pane.r;
    const vary = 0.04 + rand() * 0.06;
    const g = ctx.createLinearGradient(
      pane.cx - dx,
      pane.cy - dy,
      pane.cx + dx,
      pane.cy + dy,
    );
    g.addColorStop(0, oklch(lit + vary, c * 0.82, hue + (rand() - 0.5) * 8));
    g.addColorStop(0.55, oklch(lit, c, hue));
    g.addColorStop(
      1,
      oklch(lit - vary * 1.3, c * 1.08, hue + (rand() - 0.5) * 8),
    );
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fill(path);

    ctx.save();
    ctx.clip(path);
    // Glass reads darker where it meets the lead, as thick glass does.
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = oklch(lit - 0.2, c, hue);
    ctx.lineWidth = win.lead * 2.4;
    ctx.stroke(path);
    // Reams: pale wavy streaks in the melt.
    const reams = rand() < 0.55 ? 1 + Math.floor(rand() * 2) : 0;
    ctx.strokeStyle = oklch(Math.min(0.98, lit + 0.16), c * 0.6, hue);
    ctx.lineCap = "round";
    for (let k = 0; k < reams; k += 1) {
      const b = rand() * Math.PI;
      const ux = Math.cos(b);
      const uy = Math.sin(b);
      const off = (rand() - 0.5) * pane.r;
      const bend = (rand() - 0.5) * pane.r * 0.9;
      const sx = pane.cx - ux * pane.r * 1.2 - uy * off;
      const sy = pane.cy - uy * pane.r * 1.2 + ux * off;
      const ex = pane.cx + ux * pane.r * 1.2 - uy * off;
      const ey = pane.cy + uy * pane.r * 1.2 + ux * off;
      ctx.globalAlpha = 0.1 + rand() * 0.12;
      ctx.lineWidth = 0.8 + rand() * 2.2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(
        sx + ux * pane.r * 0.8 - uy * bend,
        sy + uy * pane.r * 0.8 + ux * bend,
        ex - ux * pane.r * 0.8 + uy * bend,
        ey - uy * pane.r * 0.8 - ux * bend,
        ex,
        ey,
      );
      ctx.stroke();
    }
    // Seeds: the small bubbles hand-made glass keeps.
    if (rand() < 0.35) {
      ctx.fillStyle = oklch(Math.min(0.98, lit + 0.2), c * 0.5, hue);
      const n = 3 + Math.floor(rand() * 6);
      for (let k = 0; k < n; k += 1) {
        ctx.globalAlpha = 0.18 + rand() * 0.2;
        ctx.beginPath();
        ctx.arc(
          pane.cx + (rand() - 0.5) * pane.r * 1.3,
          pane.cy + (rand() - 0.5) * pane.r * 1.3,
          0.5 + rand() * 1.3,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** The came: every lead, the frame round the edge and a blob of solder at each joint. */
function paintLeads(
  ctx: CanvasRenderingContext2D,
  win: Leading,
  w: number,
  h: number,
  lead: string,
) {
  ctx.globalAlpha = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = lead;
  ctx.lineWidth = win.lead;
  ctx.beginPath();
  for (const e of win.edges) {
    ctx.moveTo(e.ax, e.ay);
    ctx.lineTo(e.bx, e.by);
  }
  ctx.stroke();
  ctx.lineWidth = win.lead * 2.6;
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = lead;
  ctx.beginPath();
  for (const j of win.joints) {
    ctx.moveTo(j.x + win.lead * 0.78, j.y);
    ctx.arc(j.x, j.y, win.lead * 0.78, 0, Math.PI * 2);
  }
  ctx.fill();
}

type Layers = {
  /** The window lit through. */
  lit: HTMLCanvasElement;
  /** The window in the room's shadow. */
  unlit: HTMLCanvasElement;
  /** The glass's own colours, shrunk to an eighth: drawn back up, it is their cast light. */
  haze: HTMLCanvasElement;
  /** Where the haze is masked, at its own size. */
  mist: HTMLCanvasElement;
  scratch: HTMLCanvasElement;
  glint: Rgb;
  /** 0 on a light page, 1 on a dark one. */
  dark: number;
  win: Leading;
};

const sheet = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/** Halves an image until it is an eighth the size: a real box blur, not a skip. */
function shrink(src: HTMLCanvasElement): HTMLCanvasElement {
  let from = src;
  for (let i = 0; i < 3; i += 1) {
    const next = sheet(from.width / 2, from.height / 2);
    const ctx = next.getContext("2d");
    if (!ctx) return from;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(from, 0, 0, next.width, next.height);
    from = next;
  }
  return from;
}

type Api = {
  home: () => void;
  resize: () => void;
  rebuild: (swap: boolean) => void;
  schedule: () => void;
  wake: () => void;
};

/**
 * A backdrop of leaded glass. Irregular panes, cut from a seed, fill the box;
 * the pointer is the light behind them. Where it falls the glass glows, its
 * own colours spill as a soft cast light over the leads around it, and the
 * came catches a glint along the side that faces it. Move away and the light
 * drifts home to `rest` and dims.
 *
 * The window is painted once into a lit and an unlit layer (from the theme's
 * own colours, read off the canvas) and each frame is a few masked
 * composites, so a frame stays cheap; frames run only while the light moves
 * and only on screen. A new `seed`, `panes` or `palette` re-leads the window
 * from the light outward. The light is a real control under the content:
 * arrow keys move it, so a keyboard reaches every place a pointer can. Under
 * reduced motion the light jumps instead of gliding and a new window
 * cross-fades; nothing runs between moves.
 */
export function StainedGlass({
  children,
  panes = 36,
  glow = 0.6,
  palette = "cathedral",
  seed = 1,
  rest = REST,
  onLightChange,
  interactive = true,
  label = "Light",
  className,
}: StainedGlassProps) {
  const motionSafe = useMotionSafe();
  const count = Math.round(clamp(panes, 12, 60));
  const glass = PALETTES[palette] ?? PALETTES.cathedral;
  const restX = clamp01(rest.x);
  const restY = clamp01(rest.y);

  const [spot, setSpot] = React.useState<StainedGlassLight | null>(null);
  const shown = spot ?? { x: restX, y: restY };

  const lx = useMotionValue(restX);
  const ly = useMotionValue(restY);
  const presence = useMotionValue(0);
  const wipe = useMotionValue(1);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const layers = React.useRef<Layers | null>(null);
  const prev = React.useRef<HTMLCanvasElement | null>(null);
  const wipeAt = React.useRef<Pt>({ x: 0, y: 0 });
  const box = React.useRef({ w: 0, h: 0, dpr: 1 });
  const frame = React.useRef(0);
  const visible = React.useRef(true);
  const stale = React.useRef(true);
  const painted = React.useRef(false);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const hovering = React.useRef(false);
  const keyed = React.useRef(false);
  const raised = React.useRef(false);
  const said = React.useRef<string>("rest");
  const recolour = React.useRef(0);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };

  const latest = React.useRef({ glow, glass, count, seed, motionSafe });
  React.useEffect(() => {
    latest.current = { glow, glass, count, seed, motionSafe };
  });

  /** Reports the light once per change, rounded, from the move that made it. */
  const report = (light: StainedGlassLight | null) => {
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

  /** Sends the light somewhere: gliding after a hand, or at once under reduced motion. */
  const place = (x: number, y: number, velocity?: Pt) => {
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

  /** Nobody holds the light: it drifts home and dims. */
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

  const fraction = (clientX: number, clientY: number): Pt => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r || r.width < 1 || r.height < 1) return { x: restX, y: restY };
    return { x: (clientX - r.left) / r.width, y: (clientY - r.top) / r.height };
  };

  // Touch carries the light 1:1 (the mouse only ever hovers), so a finger
  // can lay it anywhere; vertical swipes still scroll the page.
  const drag = useDrag({
    disabled: !interactive,
    onStart: () => {
      for (const k of ["lx", "ly"]) halt(k);
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
    const lay = layers.current;
    if (!canvas || !ctx || !lay) return;
    const scratch = lay.scratch.getContext("2d");
    if (!scratch) return;
    const { w, h, dpr } = box.current;
    const g = clamp01(latest.current.glow);
    const level = lerp(RESTING, 1, clamp01(presence.get()));
    const x = lx.get() * w;
    const y = ly.get() * h;
    const diag = Math.hypot(w, h);
    // The light's reach goes with the window's area, not its longest line,
    // so a wide window still has a pool of light rather than a wash.
    const span = Math.sqrt(w * h);
    const W = canvas.width;
    const H = canvas.height;

    /** A soft radial falloff round (cx, cy), in a context's own pixels. */
    const falloff = (
      c: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      reach: number,
      peak: number,
    ) => {
      const fall = c.createRadialGradient(cx, cy, 0, cx, cy, reach);
      for (const [t, a] of FALLOFF) {
        fall.addColorStop(t, `rgb(0 0 0 / ${r3(a * Math.min(1, peak))})`);
      }
      return fall;
    };

    /**
     * `src`, kept only inside a soft circle round (cx, cy), composited onto
     * the window. Only the circle's box is touched — a clip keeps even the
     * whole-canvas composite modes inside it — so a frame costs what the
     * light covers, not what the window does.
     */
    const masked = (
      src: HTMLCanvasElement,
      cx: number,
      cy: number,
      reach: number,
      peak: number,
      mode: GlobalCompositeOperation,
    ) => {
      if (peak <= 0.005 || reach <= 1) return;
      const X0 = Math.max(0, Math.floor((cx - reach) * dpr));
      const Y0 = Math.max(0, Math.floor((cy - reach) * dpr));
      const X1 = Math.min(W, Math.ceil((cx + reach) * dpr));
      const Y1 = Math.min(H, Math.ceil((cy + reach) * dpr));
      const bw = X1 - X0;
      const bh = Y1 - Y0;
      if (bw < 1 || bh < 1) return;
      scratch.save();
      scratch.setTransform(1, 0, 0, 1, 0, 0);
      scratch.beginPath();
      scratch.rect(X0, Y0, bw, bh);
      scratch.clip();
      scratch.globalCompositeOperation = "source-over";
      scratch.globalAlpha = 1;
      scratch.clearRect(X0, Y0, bw, bh);
      scratch.drawImage(src, X0, Y0, bw, bh, X0, Y0, bw, bh);
      scratch.globalCompositeOperation = "destination-in";
      scratch.fillStyle = falloff(
        scratch,
        cx * dpr,
        cy * dpr,
        reach * dpr,
        peak,
      );
      scratch.fillRect(X0, Y0, bw, bh);
      scratch.restore();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = mode;
      ctx.globalAlpha = 1;
      ctx.drawImage(lay.scratch, X0, Y0, bw, bh, X0, Y0, bw, bh);
      ctx.restore();
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(lay.unlit, 0, 0, w, h);

    // The glass glows where the light falls, hottest right behind it…
    const reach = span * lerp(0.74, 0.52, g);
    masked(lay.lit, x, y, reach, lerp(0.7, 1, g) * level, "source-over");
    masked(lay.lit, x, y, reach * 0.5, g * 0.6 * level, "screen");
    // …and its colours spill past the leads as a soft cast light: masked
    // at the haze's own eighth size, then drawn up, which is what blurs it.
    const spill = g * level * lerp(0.45, 0.75, lay.dark);
    const small = lay.mist.getContext("2d");
    if (spill > 0.005 && small) {
      const k = lay.mist.width / w;
      small.setTransform(1, 0, 0, 1, 0, 0);
      small.globalCompositeOperation = "copy";
      small.globalAlpha = 1;
      small.drawImage(lay.haze, 0, 0);
      small.globalCompositeOperation = "destination-in";
      small.fillStyle = falloff(small, x * k, y * k, reach * 1.5 * k, spill);
      small.fillRect(0, 0, lay.mist.width, lay.mist.height);
      ctx.globalCompositeOperation = "screen";
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(lay.mist, 0, 0, w, h);
    }

    // The came catches the light on the side that faces it.
    const strength = lerp(0.35, 1, g) * level;
    const near = span * lerp(0.26, 0.36, g);
    const lines = Array.from({ length: BUCKETS }, () => new Path2D());
    const dots = Array.from({ length: BUCKETS }, () => new Path2D());
    const lead = lay.win.lead;
    for (const e of lay.win.edges) {
      if (e.frame) continue;
      const vx = x - e.mx;
      const vy = y - e.my;
      const d = Math.hypot(vx, vy) || 1;
      const f = Math.exp(-((d / near) ** 2));
      if (f < 0.03) continue;
      const along = (e.nx * vx + e.ny * vy) / d;
      const k = f * f * (0.25 + 0.75 * Math.abs(along)) * strength;
      if (k < 0.04) continue;
      const path = lines[Math.min(BUCKETS - 1, Math.floor(k * BUCKETS))];
      if (!path) continue;
      const off = lead * 0.3 * (along < 0 ? -1 : 1);
      const ux = (e.bx - e.ax) / e.len;
      const uy = (e.by - e.ay) / e.len;
      const trim = Math.min(lead * 0.6, e.len * 0.3);
      path.moveTo(e.ax + ux * trim + e.nx * off, e.ay + uy * trim + e.ny * off);
      path.lineTo(e.bx - ux * trim + e.nx * off, e.by - uy * trim + e.ny * off);
    }
    for (const j of lay.win.joints) {
      if (j.x < 1 || j.y < 1 || j.x > w - 1 || j.y > h - 1) continue;
      const vx = x - j.x;
      const vy = y - j.y;
      const d = Math.hypot(vx, vy) || 1;
      const k = Math.exp(-((d / near) ** 2)) * strength;
      if (k < 0.06) continue;
      const path = dots[Math.min(BUCKETS - 1, Math.floor(k * BUCKETS))];
      if (!path) continue;
      const cx = j.x + (vx / d) * lead * 0.32;
      const cy = j.y + (vy / d) * lead * 0.32;
      path.moveTo(cx + lead * 0.3, cy);
      path.arc(cx, cy, lead * 0.3, 0, Math.PI * 2);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.6, lead * 0.18);
    ctx.strokeStyle = rgba(lay.glint, 1);
    ctx.fillStyle = rgba(lay.glint, 1);
    for (let b = 0; b < BUCKETS; b += 1) {
      ctx.globalAlpha = (b + 1) / BUCKETS;
      const line = lines[b];
      const dot = dots[b];
      if (line) ctx.stroke(line);
      if (dot) ctx.fill(dot);
    }

    // The light itself, a warm core behind the glass.
    const core = g * level * 0.55;
    if (core > 0.01) {
      const r = span * lerp(0.08, 0.13, g);
      const sun = ctx.createRadialGradient(x, y, 0, x, y, r);
      sun.addColorStop(0, rgba(lay.glint, core));
      sun.addColorStop(0.4, rgba(lay.glint, core * 0.45));
      sun.addColorStop(1, rgba(lay.glint, 0));
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 1;
      ctx.fillStyle = sun;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // The window being replaced, opened from the light outward.
    const old = prev.current;
    const t = wipe.get();
    if (old && t < 1) {
      if (!latest.current.motionSafe) {
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(old, 0, 0, w, h);
      } else {
        const at = wipeAt.current;
        const soft = Math.max(24, diag * 0.12);
        const far =
          Math.hypot(Math.max(at.x, w - at.x), Math.max(at.y, h - at.y)) + soft;
        const outer = Math.max(1, t * far);
        const inner = Math.max(0, outer - soft);
        scratch.setTransform(1, 0, 0, 1, 0, 0);
        scratch.globalCompositeOperation = "copy";
        scratch.globalAlpha = 1;
        scratch.drawImage(old, 0, 0, W, H);
        scratch.setTransform(dpr, 0, 0, dpr, 0, 0);
        scratch.globalCompositeOperation = "destination-out";
        const hole = scratch.createRadialGradient(
          at.x,
          at.y,
          0,
          at.x,
          at.y,
          outer,
        );
        hole.addColorStop(0, "rgb(0 0 0 / 1)");
        hole.addColorStop(inner / outer, "rgb(0 0 0 / 1)");
        hole.addColorStop(1, "rgb(0 0 0 / 0)");
        scratch.fillStyle = hole;
        scratch.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.drawImage(lay.scratch, 0, 0, w, h);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (!painted.current) {
      painted.current = true;
      rootRef.current?.setAttribute("data-painted", "");
    }
  };

  /** Draws on the next frame — only if the window is on screen in a visible page. */
  const schedule = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0;
      if (stale.current || !layers.current) api.current.rebuild(false);
      else draw();
    });
  };

  /** Cuts and paints the window for the current box, theme and props. */
  const rebuild = (swap: boolean) => {
    const canvas = canvasRef.current;
    const { w, h, dpr } = box.current;
    if (!canvas || w < 2 || h < 2) return;
    if (!visible.current || document.hidden) {
      stale.current = true;
      layers.current = null;
      return;
    }
    stale.current = false;
    const style = getComputedStyle(canvas);
    const room = toRgb(style.color);
    const glint = toRgb(style.borderRightColor);
    const dark = clamp01(1 - luminance(room) * 1.2);
    const W = canvas.width;
    const H = canvas.height;
    const { count: n, seed: s, glass: pal, motionSafe: safe } = latest.current;

    if (swap && painted.current) {
      const old = sheet(W, H);
      old.getContext("2d")?.drawImage(canvas, 0, 0);
      prev.current = old;
      wipeAt.current = { x: lx.get() * w, y: ly.get() * h };
    } else {
      prev.current = null;
    }

    const win = leadWindow(w, h, n, s, pal);
    const scratch = layers.current?.scratch ?? sheet(W, H);
    if (scratch.width !== W || scratch.height !== H) {
      scratch.width = W;
      scratch.height = H;
    }
    const sc = scratch.getContext("2d");
    const lit = sheet(W, H);
    const unlit = sheet(W, H);
    const lc = lit.getContext("2d");
    const uc = unlit.getContext("2d");
    if (!sc || !lc || !uc) return;
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc.globalCompositeOperation = "source-over";
    sc.clearRect(0, 0, w, h);
    paintPanes(sc, win, s);
    const haze = shrink(scratch);

    lc.drawImage(scratch, 0, 0);
    lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintLeads(lc, win, w, h, style.borderTopColor);

    // Glass out of the light keeps its colour but loses its light: the
    // same panes, multiplied down by the room's shadow (deeper on a dark page).
    uc.drawImage(scratch, 0, 0);
    uc.setTransform(dpr, 0, 0, dpr, 0, 0);
    uc.globalCompositeOperation = "multiply";
    uc.fillStyle = style.borderLeftColor;
    uc.fillRect(0, 0, w, h);
    uc.globalCompositeOperation = "source-over";
    paintLeads(uc, win, w, h, style.borderTopColor);

    const mist = sheet(haze.width, haze.height);
    layers.current = { lit, unlit, haze, mist, scratch, glint, dark, win };

    if (prev.current) {
      wipe.set(0);
      run(
        "wipe",
        animate(
          wipe,
          1,
          safe
            ? { duration: durations.page, ease: easings.move }
            : { duration: durations.base, ease: easings.move },
        ),
      );
    } else {
      halt("wipe");
      wipe.set(1);
    }
    draw();
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
    if (b.w === w && b.h === h && b.dpr === dpr && layers.current) return;
    box.current = { w, h, dpr };
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    halt("wipe");
    prev.current = null;
    rebuild(false);
  };

  /** Back on screen: anything that waited is painted now. */
  const wake = () => {
    if (!visible.current || document.hidden) return;
    if (stale.current || !layers.current) rebuild(false);
    else schedule();
  };

  const api = React.useRef<Api>({ home, resize, rebuild, schedule, wake });
  React.useEffect(() => {
    api.current = { home, resize, rebuild, schedule, wake };
  });

  // Every moving value asks for one frame; nothing runs while nothing moves.
  React.useEffect(() => {
    const kick = () => api.current.schedule();
    const offs = [lx, ly, presence, wipe].map((v) => v.on("change", kick));
    return () => {
      for (const off of offs) off();
    };
  }, [lx, ly, presence, wipe]);

  // A new window: re-leaded from the light outward. The first run only
  // remembers what is shown.
  const cut = `${seed}|${count}|${palette}`;
  const shownCut = React.useRef(cut);
  React.useEffect(() => {
    if (shownCut.current === cut) return;
    shownCut.current = cut;
    api.current.rebuild(true);
  }, [cut]);

  // A hotter or cooler light is only a redraw.
  React.useEffect(() => {
    api.current.schedule();
  }, [glow]);

  // A new resting place, or the hand gone under reduced motion.
  React.useEffect(() => {
    if (hovering.current || keyed.current || said.current !== "rest") return;
    halt("lx");
    halt("ly");
    if (motionSafe) {
      run("lx", animate(lx, restX, springs.drift));
      run("ly", animate(ly, restY, springs.drift));
    } else {
      lx.set(restX);
      ly.set(restY);
    }
    // Moved only when the resting place itself moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restX, restY]);

  // Switched to decoration: whatever held the light lets go.
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
      if (recolour.current) window.cancelAnimationFrame(recolour.current);
      recolour.current = 0;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  // The box and whether it is on screen, bound to the node when it arrives.
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
  // says when, and the window is painted again from them.
  const onColours = () => {
    if (recolour.current) return;
    recolour.current = window.requestAnimationFrame(() => {
      recolour.current = 0;
      api.current.rebuild(false);
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

  const fallback = `linear-gradient(115deg, ${glass
    .map(
      ([l, c, h]) =>
        `color-mix(in oklab, ${oklch(l, c, h)} 45%, color-mix(in oklab, var(--background) 45%, black))`,
    )
    .join(", ")})`;

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (interactive && event.pointerType !== "mouse")
          drag.onPointerDown(event);
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
        "group/stained-glass relative isolate h-full w-full overflow-clip",
        interactive && "touch-pan-y",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/stained-glass:hidden"
        style={{ background: fallback }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={INKS}
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
      <div className="relative h-full">{children}</div>
    </div>
  );
}

/** A ninth of the window, in words. */
function placeName({ x, y }: StainedGlassLight): string {
  const col = x < 1 / 3 ? "left" : x > 2 / 3 ? "right" : "";
  const row = y < 1 / 3 ? "top" : y > 2 / 3 ? "bottom" : "";
  return [row, col].filter(Boolean).join(" ") || "centre";
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
