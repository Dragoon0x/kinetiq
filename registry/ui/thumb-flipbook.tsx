"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ThumbFlipbookProps = {
  /** One picture per frame, drawn on the pages in order; replaces the drawn loop. */
  images?: string[];
  /** Drawings in the loop, 6 to 24: a choppy loop to a fluid one. Ignored with `images`. @default 12 */
  frames?: number;
  /** Pages in the book, 12 to 120. @default 48 */
  pages?: number;
  /** How far the thumb curls the waiting pages, 0 to 1: a slight lift to a tall fan. @default 0.6 */
  bend?: number;
  /** Riffle speed, 0 to 1: a slow heavy peel to a quick flutter — pages per px of drag or scroll, and how fast each page drops. @default 0.5 */
  riffle?: number;
  /** Pages turned (controlled), 0 to `pages`. */
  value?: number;
  /** Pages turned at first when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires from the drag, scroll or key that turned a page, with the pages turned. */
  onValueChange?: (page: number) => void;
  /** Scrolling the page (or any scroll container) riffles the book forward and back. @default true */
  scroll?: boolean;
  /** Draw the thumb holding the pages. @default true */
  thumb?: boolean;
  /** The pages, any CSS colour. @default a warm white pigment */
  paper?: string;
  /** The drawing's ink, any CSS colour. @default from the ink token at a fixed lightness */
  ink?: string;
  /** The drawing's one colour, any CSS colour. @default a red pigment from the danger token */
  accent?: string;
  /** A paper crinkle as each page lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The book's accessible name. @default "Flipbook" */
  label?: string;
  /** No riffling by hand, scroll or key. @default false */
  disabled?: boolean;
  /** Sizes the book's box; 8:5 and the full width by default. */
  className?: string;
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const STRIPS = 14;
/** The book lies turned a little anticlockwise on the table. */
const ANGLE = -8 * DEG;
/** Where lifting a page moves it on screen: up and a little left. */
const LIFT_X = -0.26;
const LIFT_Y = -0.64;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------------ */
/* The drawing: a boat on a rolling swell and a gull, a seamless loop.       */
/* Path data in a 300 × 200 page, shared by the server's still and canvas.   */
/* ------------------------------------------------------------------------ */

type Mark = {
  d: string;
  kind: "ink" | "fill" | "accent" | "paper";
  w: number;
};

function drawing(phase: number): Mark[] {
  const out: Mark[] = [];
  const swell = (x: number) =>
    130 +
    7 * Math.sin(TAU * ((x / 300) * 1.4 - phase)) +
    2.4 * Math.sin(TAU * ((x / 300) * 3 - 2 * phase) + 1.3);
  let sea = "";
  for (let x = -10; x <= 310; x += 10) {
    sea += `${x === -10 ? "M" : "L"}${x} ${r2(swell(x))}`;
  }
  out.push({ d: sea, kind: "ink", w: 2.2 });
  for (let row = 0; row < 3; row += 1) {
    let dashes = "";
    const y = 148 + row * 15;
    for (let k = -1; k < 7; k += 1) {
      const x = k * 52 + row * 19 + phase * 52;
      dashes += `M${r2(x)} ${r2(y + 2 * Math.sin(TAU * (k / 7 + phase)))}h${22 - row * 5}`;
    }
    out.push({ d: dashes, kind: "ink", w: 1.3 });
  }
  // The sun, its rays turning by one ray's spacing per loop.
  out.push({
    d: "M222 44a17 17 0 1 0 34 0a17 17 0 1 0 -34 0",
    kind: "ink",
    w: 1.8,
  });
  let rays = "";
  for (let i = 0; i < 8; i += 1) {
    const a = TAU * (i / 8 + phase / 8);
    rays += `M${r2(239 + 22 * Math.cos(a))} ${r2(44 + 22 * Math.sin(a))}L${r2(239 + 29 * Math.cos(a))} ${r2(44 + 29 * Math.sin(a))}`;
  }
  out.push({ d: rays, kind: "ink", w: 1.6 });
  // A cloud drifting across once per loop.
  const cx = ((phase * 360 + 60) % 360) - 30;
  out.push({
    d: `M${r2(cx - 26)} 66a12 12 0 0 1 14 -12a16 16 0 0 1 28 -2a11 11 0 0 1 12 14z`,
    kind: "paper",
    w: 1.5,
  });
  // The boat rides the swell, rocking with its slope.
  const bx = 168;
  const by = swell(bx) - 1;
  const tilt = Math.atan2(swell(bx + 8) - swell(bx - 8), 16) * 0.9;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const P = (x: number, y: number) =>
    `${r2(bx + x * cos - y * sin)} ${r2(by + x * sin + y * cos)}`;
  out.push({
    d: `M${P(-26, -3)}L${P(26, -3)}L${P(17, 8)}L${P(-18, 8)}Z`,
    kind: "fill",
    w: 1.6,
  });
  out.push({ d: `M${P(0, -3)}L${P(0, -54)}`, kind: "ink", w: 2 });
  out.push({
    d: `M${P(3, -52)}L${P(3, -7)}L${P(30, -7)}Z`,
    kind: "accent",
    w: 1.6,
  });
  out.push({
    d: `M${P(-3, -46)}L${P(-3, -8)}L${P(-22, -8)}Z`,
    kind: "paper",
    w: 1.6,
  });
  // A gull beating its wings twice per loop on a small circuit.
  const gx = 86 + 10 * Math.sin(TAU * phase);
  const gy = 58 + 6 * Math.sin(TAU * phase * 2);
  const flap = Math.sin(TAU * phase * 2);
  out.push({
    d: `M${r2(gx - 19)} ${r2(gy - 9 * flap - 2)}Q${r2(gx - 9)} ${r2(gy - 8 - 4 * flap)} ${r2(gx)} ${r2(gy)}Q${r2(gx + 9)} ${r2(gy - 8 - 4 * flap)} ${r2(gx + 19)} ${r2(gy - 9 * flap - 2)}`,
    kind: "ink",
    w: 2,
  });
  return out;
}

/* ------------------------------------------------------------------------ */
/* The engine.                                                               */
/* ------------------------------------------------------------------------ */

type Config = {
  images: string[];
  frames: number;
  pages: number;
  bend: number;
  riffle: number;
  scroll: boolean;
  thumb: boolean;
  dpr: number;
  motionSafe: boolean;
  disabled: boolean;
  colorKey: string;
};

type Page = { c: number; v: number };

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** Where the hand is: pages turned, fractional while a page is half peeled. */
  hand: () => number;
  /** Puts the hand at `p` directly (a drag): pages track it 1:1. */
  holdAt: (p: number) => void;
  /** Riffles to page `to` at the riffle rate. */
  runTo: (to: number) => void;
  /** Riffles by `pages` from the scroll. */
  scrolled: (pages: number) => void;
  dispose: () => void;
};

type Hooks = {
  onPage: (page: number) => void;
  onRelease: (speed: number, page: number) => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  hooks: { current: Hooks },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let hand = 0;
  let holding = false;
  let run: { to: number } | null = null;
  let reported = -1;
  const curls = new Map<number, Page>();
  const size = { w: 0, h: 0, scale: 1 };
  const book = { pw: 200, ph: 132, tx: 0, ty: 0, cos: 1, sin: 0 };
  const colours = {
    paper: "white",
    ink: "black",
    accent: "red",
    cover: "gray",
    tape: "beige",
    thumb: "tan",
  };
  const textures = new Map<number, HTMLCanvasElement>();
  let pictures: (HTMLImageElement | null)[] = [];
  let picturesKey = "";
  let base: HTMLCanvasElement | null = null;

  const frameCount = () =>
    cfg && cfg.images.length > 0
      ? cfg.images.length
      : clamp(Math.round(cfg?.frames ?? 12), 6, 24);
  const pageCount = () => clamp(Math.round(cfg?.pages ?? 48), 12, 120);
  const bendOf = () => clamp(cfg?.bend ?? 0.6, 0, 1);

  /** How far page `j` wants to be peeled: 0 in the stack, 1 flipped away; the boundary page follows the hand. */
  const targetOf = (j: number) => clamp(hand - j, 0, 1);

  /* ---------------------------- page textures ---------------------------- */

  const texture = (f: number): HTMLCanvasElement | null => {
    const hit = textures.get(f);
    if (hit) return hit;
    const tw = Math.max(2, Math.round(book.pw * size.scale));
    const th = Math.max(2, Math.round(book.ph * size.scale));
    const tex = document.createElement("canvas");
    tex.width = tw;
    tex.height = th;
    const g = tex.getContext("2d");
    if (!g) return null;
    g.fillStyle = colours.paper;
    g.fillRect(0, 0, tw, th);
    const picture = pictures[f];
    if (cfg && cfg.images.length > 0) {
      if (picture && picture.complete && picture.naturalWidth > 0) {
        const pa = picture.naturalWidth / picture.naturalHeight;
        const ta = tw / th;
        const sw = pa > ta ? picture.naturalHeight * ta : picture.naturalWidth;
        const sh = pa > ta ? picture.naturalHeight : picture.naturalWidth / ta;
        g.drawImage(
          picture,
          (picture.naturalWidth - sw) / 2,
          (picture.naturalHeight - sh) / 2,
          sw,
          sh,
          tw * 0.04,
          th * 0.06,
          tw * 0.92,
          th * 0.88,
        );
      } else return tex;
    } else {
      g.save();
      g.scale(tw / 300, th / 200);
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const m of drawing(f / frameCount())) {
        const path = new Path2D(m.d);
        if (m.kind !== "ink") {
          g.fillStyle =
            m.kind === "accent"
              ? colours.accent
              : m.kind === "fill"
                ? colours.ink
                : colours.paper;
          g.fill(path);
        }
        g.strokeStyle = colours.ink;
        g.lineWidth = m.w;
        g.stroke(path);
      }
      g.restore();
    }
    // A little grain of shade toward the gutter, where pages curve in.
    const gutter = g.createLinearGradient(0, 0, tw * 0.12, 0);
    gutter.addColorStop(0, "rgba(0, 0, 0, 0.1)");
    gutter.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = gutter;
    g.fillRect(0, 0, tw * 0.12, th);
    textures.set(f, tex);
    return tex;
  };

  const loadPictures = () => {
    const list = cfg?.images ?? [];
    const key = list.join("|");
    if (key === picturesKey) return;
    picturesKey = key;
    pictures = list.map((src, i) => {
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (pictures[i] !== img || disposed) return;
        textures.delete(i);
        draw();
      };
      img.src = src;
      return img;
    });
    textures.clear();
  };

  /* -------------------------------- layout ------------------------------- */

  const place = () => {
    const w = size.w;
    const h = size.h;
    const pw = Math.max(60, Math.min(0.95 * h, 0.66 * w, 340));
    const ph = pw * 0.66;
    book.pw = pw;
    book.ph = ph;
    book.cos = Math.cos(ANGLE);
    book.sin = Math.sin(ANGLE);
    // Centre the turned book a little left of and below the middle, leaving
    // the curl room above and the thumb room at the corner.
    const cx = w * 0.47;
    const cy = h * 0.53;
    book.tx = cx - (pw / 2) * book.cos + (ph / 2) * book.sin;
    book.ty = cy - (pw / 2) * book.sin - (ph / 2) * book.cos;
  };

  const sx = (x: number, y: number) => book.tx + x * book.cos - y * book.sin;
  const sy = (x: number, y: number) => book.ty + x * book.sin + y * book.cos;

  /** The table shadow, the back cover and the edges of the block: drawn once per size. */
  const paintBase = () => {
    const tw = Math.max(1, Math.round(size.w * size.scale));
    const th = Math.max(1, Math.round(size.h * size.scale));
    base ??= document.createElement("canvas");
    base.width = tw;
    base.height = th;
    const g = base.getContext("2d");
    if (!g) return;
    g.setTransform(size.scale, 0, 0, size.scale, 0, 0);
    const { pw, ph } = book;
    const corners = (inset: number, dx: number, dy: number) => {
      g.beginPath();
      g.moveTo(sx(-inset, -inset) + dx, sy(-inset, -inset) + dy);
      g.lineTo(sx(pw + inset, -inset) + dx, sy(pw + inset, -inset) + dy);
      g.lineTo(
        sx(pw + inset, ph + inset) + dx,
        sy(pw + inset, ph + inset) + dy,
      );
      g.lineTo(sx(-inset, ph + inset) + dx, sy(-inset, ph + inset) + dy);
      g.closePath();
    };
    g.save();
    g.shadowColor = "rgba(0, 0, 0, 0.22)";
    g.shadowBlur = 18 * size.scale;
    g.shadowOffsetY = 8 * size.scale;
    g.fillStyle = colours.cover;
    corners(2, 3, 5);
    g.fill();
    g.restore();
    // Page edges between the cover and the top page: a few thin layers.
    for (let k = 4; k >= 1; k -= 1) {
      g.fillStyle = k % 2 ? colours.paper : "rgba(0, 0, 0, 0.06)";
      corners(0, k * 0.7, k * 1.1);
      g.fill();
      if (k % 2) {
        g.fillStyle = "rgba(0, 0, 0, 0.05)";
        g.fill();
      }
    }
  };

  /* ------------------------------- drawing ------------------------------- */

  /** A page's shape: the curl's angle, how much of the page curls, how far the curl's line leans, and the turn about the spine. */
  type Bend = { theta: number; reach: number; lean: number; hinge: number };
  const bendScratch: Bend = { theta: 0, reach: 0, lean: 0, hinge: 0 };
  const thumbBend: Bend = { theta: 0, reach: 0, lean: 0, hinge: 0 };

  /**
   * Page `j`'s shape. In the stack the thumb holds the corner curled, the
   * top page most. Peeling curls the corner up past the thumb, then the page
   * swings over about the spine and away, showing its back.
   */
  const bendOf_ = (j: number, q: number, out: Bend): Bend => {
    const b = bendOf();
    const hold = lerp(18, 76, b) * DEG;
    const reachHeld = book.pw * lerp(0.26, 0.4, b);
    out.hinge = 0;
    if (q <= 0.0005) {
      const depth = Math.max(0, j - hand);
      out.theta = hold * clamp(1 - 0.26 * depth, 0, 1);
      out.reach = reachHeld;
      out.lean = 17 * DEG;
      return out;
    }
    const peel = clamp(q / 0.55, 0, 1);
    const e = peel * peel * (3 - 2 * peel);
    const turn = clamp((q - 0.18) / 0.82, 0, 1);
    out.theta = lerp(hold, 150 * DEG, e);
    out.reach = lerp(reachHeld, book.pw * 0.72, e);
    out.lean = lerp(17, 8, q) * DEG;
    out.hinge = 168 * DEG * turn * turn * (3 - 2 * turn);
    return out;
  };

  /** A point of a page at page coordinates (x, y) under shape `g`, on screen; `z` is its height. */
  const bent = (
    x: number,
    y: number,
    g: Bend,
    out: { x: number; y: number; z?: number },
  ) => {
    const { pw, ph } = book;
    const ax = Math.sin(g.lean);
    const ay = -Math.cos(g.lean);
    const nx = Math.cos(g.lean);
    const ny = Math.sin(g.lean);
    const bx = pw - g.reach;
    const by = ph;
    const d = (x - bx) * nx + (y - by) * ny;
    let px = x;
    let py = y;
    let z = 0;
    if (d > 0 && g.theta > 0.001) {
      const r = (g.reach * nx) / g.theta;
      const u = (x - bx) * ax + (y - by) * ay;
      const X = r * Math.sin(d / r);
      z = r * (1 - Math.cos(d / r));
      px = bx + ax * u + nx * X;
      py = by + ay * u + ny * X;
    }
    if (g.hinge > 0.0005) {
      // The turn about the spine (x = 0), carrying the curl with it.
      const c = Math.cos(g.hinge);
      const s = Math.sin(g.hinge);
      const hx = px * c - z * s;
      z = px * s + z * c;
      px = hx;
    }
    out.x = sx(px, py) + LIFT_X * z;
    out.y = sy(px, py) + LIFT_Y * z;
    out.z = z;
  };

  const pt: { x: number; y: number; z?: number } = { x: 0, y: 0 };
  const pt2: { x: number; y: number; z?: number } = { x: 0, y: 0 };
  const pt3: { x: number; y: number; z?: number } = { x: 0, y: 0 };

  /** Traces a page's outline under shape `g` into the current path. */
  const outline = (g: Bend) => {
    if (!ctx) return;
    const { pw, ph } = book;
    ctx.beginPath();
    const steps = 14;
    for (let i = 0; i <= steps; i += 1) {
      bent((pw * i) / steps, ph, g, pt);
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    for (let i = 1; i <= 6; i += 1) {
      bent(pw, ph - (ph * i) / 6, g, pt);
      ctx.lineTo(pt.x, pt.y);
    }
    for (let i = steps - 1; i >= 0; i -= 1) {
      bent((pw * i) / steps, 0, g, pt);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
  };

  /**
   * Draws one page: a flat part, then strips across the curl. Each strip is
   * an exact affine slice of the page's texture, solved from three points
   * mapped through the page's shape; only its own bounding box of texture is
   * drawn, and a strip that faces away shows plain paper. `flat` false skips
   * the flat part, which the page above covers anyway.
   */
  const drawPage = (
    tex: HTMLCanvasElement | null,
    g: Bend,
    q: number,
    flat: boolean,
  ) => {
    if (!ctx) return;
    const { pw, ph } = book;
    const s = size.scale;
    const lift = Math.min(1, (g.theta + g.hinge) / (90 * DEG));
    // A page flicked past the thumb fades as it turns away over the spine.
    const gone = clamp((q - 0.55) / 0.4, 0, 1);
    const alpha = 1 - gone * gone * (3 - 2 * gone);
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    // A soft shadow on the page below while the page is over the stack;
    // once it turns away over the spine it has nothing to shade.
    const shadow = (0.04 + 0.07 * lift) * clamp(1 - g.hinge / 0.6, 0, 1);
    if ((q > 0.001 || flat) && shadow > 0.004) {
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.translate(2 + 3 * lift, 3 + 4 * lift);
      outline(g);
      ctx.fillStyle = `rgba(0, 0, 0, ${r2(shadow)})`;
      ctx.fill();
    }
    const ax = Math.sin(g.lean);
    const ay = -Math.cos(g.lean);
    const nx = Math.cos(g.lean);
    const ny = Math.sin(g.lean);
    const bx = pw - g.reach;
    const by = ph;
    const dMax = g.reach * nx + 1;
    const big = pw * 3;
    const tw = tex ? tex.width / pw : 1;
    const th = tex ? tex.height / ph : 1;
    for (let k = flat ? -1 : 0; k < STRIPS; k += 1) {
      const d1 = k < 0 ? -pw * 1.5 : (dMax * k) / STRIPS;
      const d2 = k < 0 ? 0 : (dMax * (k + 1)) / STRIPS;
      // Three page points of the strip and where the shape puts them.
      const p1x = bx + nx * d1;
      const p1y = by + ny * d1;
      const p2x = bx + nx * d2;
      const p2y = by + ny * d2;
      const p3x = p1x + ax * ph;
      const p3y = p1y + ay * ph;
      bent(p1x, p1y, g, pt);
      bent(p2x, p2y, g, pt2);
      bent(p3x, p3y, g, pt3);
      const u0 = p2x - p1x;
      const u1 = p2y - p1y;
      const v0 = p3x - p1x;
      const v1 = p3y - p1y;
      const det = u0 * v1 - v0 * u1;
      if (Math.abs(det) < 1e-6) continue;
      const s0x = pt2.x - pt.x;
      const s0y = pt2.y - pt.y;
      const s1x = pt3.x - pt.x;
      const s1y = pt3.y - pt.y;
      const m00 = (s0x * v1 - s1x * u1) / det;
      const m01 = (s1x * u0 - s0x * v0) / det;
      const m10 = (s0y * v1 - s1y * u1) / det;
      const m11 = (s1y * u0 - s0y * v0) / det;
      const e = pt.x - (m00 * p1x + m01 * p1y);
      const f = pt.y - (m10 * p1x + m11 * p1y);
      const slope = ((pt2.z ?? 0) - (pt.z ?? 0)) / Math.max(1e-6, d2 - d1);
      // The strip in page space: a slab across the curl, a hair wide of its
      // neighbours so no seam shows, and the box of page it can touch.
      const lo = k < 0 ? -big : d1 - 0.6;
      const hi = k < 0 ? 0.3 : d2 + 0.6;
      const x0 = clamp(bx + (k < 0 ? -big : lo) / nx - 1, 0, pw);
      const x1 = clamp(bx + (hi + ph * ny) / nx + 1, 0, pw);
      if (x1 - x0 < 0.5) continue;
      ctx.save();
      ctx.setTransform(m00 * s, m10 * s, m01 * s, m11 * s, e * s, f * s);
      ctx.beginPath();
      ctx.moveTo(bx + nx * lo - ax * big, by + ny * lo - ay * big);
      ctx.lineTo(bx + nx * hi - ax * big, by + ny * hi - ay * big);
      ctx.lineTo(bx + nx * hi + ax * big, by + ny * hi + ay * big);
      ctx.lineTo(bx + nx * lo + ax * big, by + ny * lo + ay * big);
      ctx.closePath();
      ctx.clip();
      const back = m00 * m11 - m01 * m10 < 0;
      // Lit from the upper left: a surface tipped toward the light
      // brightens, one tipped away darkens.
      const tip = Math.atan(slope);
      if (back || !tex) {
        ctx.fillStyle = colours.paper;
        ctx.fillRect(x0, 0, x1 - x0, ph);
        ctx.fillStyle = `rgba(0, 0, 0, ${r2(0.07 + 0.1 * Math.abs(Math.sin(tip)))})`;
        ctx.fillRect(x0, 0, x1 - x0, ph);
      } else {
        ctx.drawImage(
          tex,
          x0 * tw,
          0,
          (x1 - x0) * tw,
          ph * th,
          x0,
          0,
          x1 - x0,
          ph,
        );
        const light = Math.cos(tip - 0.45);
        const shade = 0.16 * (1 - light);
        if (shade > 0.004) {
          ctx.fillStyle = `rgba(0, 0, 0, ${r2(shade)})`;
          ctx.fillRect(x0, 0, x1 - x0, ph);
        } else if (light > 0.96 && k >= 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
          ctx.fillRect(x0, 0, x1 - x0, ph);
        }
      }
      ctx.restore();
    }
    // A hairline round the page, so paper on paper still reads.
    ctx.setTransform(s, 0, 0, s, 0, 0);
    outline(g);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const drawThumb = (g: Bend) => {
    if (!ctx || !cfg?.thumb) return;
    const s = size.scale;
    bent(book.pw, book.ph * 0.84, g, pt);
    bent(book.pw, book.ph * 0.98, g, pt2);
    const len = book.pw * 0.34;
    const wide = book.pw * 0.12;
    const angle = ANGLE + 36 * DEG;
    ctx.save();
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate((pt.x + pt2.x) / 2 - 2, (pt.y + pt2.y) / 2);
    ctx.rotate(angle);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(-wide / 2, len);
      ctx.lineTo(-wide / 2, wide * 0.45);
      ctx.quadraticCurveTo(-wide / 2, -wide * 0.25, 0, -wide * 0.3);
      ctx.quadraticCurveTo(wide / 2, -wide * 0.25, wide / 2, wide * 0.45);
      ctx.lineTo(wide / 2, len);
      ctx.closePath();
    };
    ctx.translate(2, 3);
    shape();
    ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
    ctx.fill();
    ctx.translate(-2, -3);
    shape();
    ctx.fillStyle = colours.thumb;
    ctx.fill();
    // The nail and the knuckle crease, in the thumb's own colour.
    ctx.beginPath();
    ctx.ellipse(0, wide * 0.22, wide * 0.3, wide * 0.4, 0, 0, TAU);
    ctx.fillStyle = "rgba(255, 255, 255, 0.34)";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-wide * 0.3, wide * 1.35);
    ctx.quadraticCurveTo(0, wide * 1.5, wide * 0.3, wide * 1.35);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !c || disposed || size.w < 2) return;
    const s = size.scale;
    const n = pageCount();
    const F = frameCount();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (base) ctx.drawImage(base, 0, 0);
    const peelOf = (j: number) => curls.get(j)?.c ?? targetOf(j);
    const top = Math.floor(hand);
    // Back to front: the deepest page of the stack first, the pages already
    // flipped away last (the earliest on top).
    const deepest = Math.min(n - 1, top + 3);
    if (deepest < top + 1) {
      // The stack is running out: the inside of the back cover shows.
      bendScratch.theta = 0;
      bendScratch.reach = book.pw * 0.3;
      bendScratch.lean = 17 * DEG;
      bendScratch.hinge = 0;
      drawPage(null, bendScratch, 0, true);
    }
    // The thumb rests on the top page still in the stack.
    thumbBend.theta = 0;
    thumbBend.reach = book.pw * 0.3;
    thumbBend.lean = 17 * DEG;
    thumbBend.hinge = 0;
    for (let j = deepest; j >= Math.max(0, top - 12); j -= 1) {
      const q = peelOf(j);
      if (q >= 0.999) continue;
      const g = bendOf_(j, q, bendScratch);
      drawPage(texture(j % F), g, q, j - hand < 1 || q > 0.0005);
      if (q <= 0.0005) {
        thumbBend.theta = g.theta;
        thumbBend.reach = g.reach;
        thumbBend.lean = g.lean;
      }
    }
    // The tape along the spine, over every page.
    ctx.setTransform(
      book.cos * s,
      book.sin * s,
      -book.sin * s,
      book.cos * s,
      book.tx * s,
      book.ty * s,
    );
    ctx.fillStyle = colours.tape;
    ctx.fillRect(-4, -3, book.pw * 0.075 + 4, book.ph + 6);
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.fillRect(-4, -3, book.pw * 0.075 + 4, 3);
    drawThumb(thumbBend);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /* -------------------------------- motion ------------------------------- */

  /** Brings the pages around a hand move into play with where they were. */
  const moveHand = (next: number) => {
    const n = pageCount();
    const to = clamp(next, 0, n);
    if (!cfg?.motionSafe) {
      // Pages change in place; the page still sounds as it goes.
      const page = Math.round(to);
      if (page !== hand) hooks.current.onRelease(8, page);
      hand = page;
      curls.clear();
      return;
    }
    const lo = Math.max(0, Math.floor(Math.min(hand, to)) - 1);
    const hi = Math.min(n - 1, Math.ceil(Math.max(hand, to)) + 1);
    // Far-off pages in a long jump go straight to where they belong.
    const keepLo = Math.max(lo, Math.floor(to) - 12);
    const keepHi = Math.min(hi, Math.ceil(to) + 12);
    for (let j = keepLo; j <= keepHi; j += 1) {
      if (!curls.has(j)) curls.set(j, { c: targetOf(j), v: 0 });
    }
    hand = to;
  };

  const report = () => {
    const page = clamp(Math.round(hand), 0, pageCount());
    if (page === reported) return;
    reported = page;
    hooks.current.onPage(page);
  };

  const busy = () => run !== null || curls.size > 0;

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    if (run) {
      const rate = lerp(9, 34, clamp(c.riffle, 0, 1));
      const left = run.to - hand;
      const move = Math.sign(left) * Math.min(Math.abs(left), rate * dt);
      moveHand(hand + move);
      if (Math.abs(run.to - hand) < 1e-4) {
        moveHand(run.to);
        run = null;
      }
      report();
    }
    const quick = lerp(0.55, 1.9, clamp(c.riffle, 0, 1));
    const flight = holding ? springs.flick : springs.snap;
    const k = (flight.stiffness / flight.mass) * quick;
    const damp = (flight.damping / flight.mass) * Math.sqrt(quick);
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (const [j, p] of curls) {
      const goal = targetOf(j);
      const before = p.c;
      for (let i = 0; i < sub; i += 1) {
        const a = -k * (p.c - goal) - damp * p.v;
        p.v += a * h;
        p.c += p.v * h;
      }
      // Paper does not sink into the stack: a page coming back bounces off it.
      if (p.c < 0) {
        p.c = -p.c * 0.3;
        p.v = Math.abs(p.v) * 0.25;
      }
      if (before < 0.2 && p.c >= 0.2 && p.v > 0) {
        hooks.current.onRelease(Math.abs(p.v), j);
      }
      if (Math.abs(p.c - goal) < 0.002 && Math.abs(p.v) < 0.02) {
        curls.delete(j);
      }
    }
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    draw();
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!busy()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const keys = ["paper", "ink", "accent", "cover", "tape", "thumb"] as const;
    keys.forEach((key, i) => {
      const el = kids[i];
      if (el) colours[key] = getComputedStyle(el).color;
    });
    textures.clear();
    paintBase();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    size.w = root.clientWidth;
    size.h = root.clientHeight;
    if (size.w < 2 || size.h < 2) return;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    size.scale = ratio;
    const w = Math.max(1, Math.round(size.w * ratio));
    const h = Math.max(1, Math.round(size.h * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    place();
    textures.clear();
    paintBase();
    draw();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      loadPictures();
      if (!was) {
        readColours();
        resize();
        report();
        kick();
        return;
      }
      if (was.dpr !== next.dpr) resize();
      if (was.frames !== next.frames || was.colorKey !== next.colorKey) {
        if (was.colorKey !== next.colorKey) readColours();
        textures.clear();
      }
      if (was.pages !== next.pages) {
        hand = clamp(hand, 0, pageCount());
        curls.clear();
        report();
      }
      if (!next.motionSafe && was.motionSafe) {
        run = null;
        hand = Math.round(hand);
        curls.clear();
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      kick();
    },
    hand: () => hand,
    holdAt(p) {
      run = null;
      holding = true;
      moveHand(p);
      report();
      kick();
    },
    runTo(to) {
      holding = false;
      const target = clamp(Math.round(to), 0, pageCount());
      if (!cfg?.motionSafe) {
        moveHand(target);
        report();
        draw();
        return;
      }
      run = { to: target };
      kick();
    },
    scrolled(pages) {
      if (!cfg?.motionSafe || !cfg.scroll || holding) return;
      const from = run ? run.to : hand;
      const to = clamp(from + pages, 0, pageCount());
      holding = false;
      run = null;
      moveHand(to);
      report();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      textures.clear();
      for (const img of pictures) if (img) img.src = "";
      pictures = [];
      root.removeAttribute("data-live");
    },
  };
}

/* ------------------------------------------------------------------------ */
/* The server's still: the book lying open on the current drawing.           */
/* ------------------------------------------------------------------------ */

function StillBook({
  phase,
  image,
  paper,
  ink,
  accent,
}: {
  phase: number;
  image?: string;
  paper: string;
  ink: string;
  accent: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 320 200"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 size-full"
    >
      <g transform="translate(150 106) rotate(-8) translate(-95 -63)">
        <rect
          x="1"
          y="3"
          width="194"
          height="130"
          rx="1"
          style={{ fill: "oklch(from var(--accent) 0.42 0.08 h)" }}
        />
        <rect width="190" height="126" style={{ fill: paper }} />
        <svg x="0" y="0" width="190" height="126" viewBox="0 0 300 200">
          {image ? (
            <image
              href={image}
              x="12"
              y="12"
              width="276"
              height="176"
              preserveAspectRatio="xMidYMid slice"
            />
          ) : (
            drawing(phase).map((m, i) => (
              <path
                key={i}
                d={m.d}
                style={{
                  fill:
                    m.kind === "ink"
                      ? "none"
                      : m.kind === "accent"
                        ? accent
                        : m.kind === "fill"
                          ? ink
                          : paper,
                  stroke: ink,
                }}
                strokeWidth={m.w}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          )}
        </svg>
        <rect
          width="190"
          height="126"
          fill="none"
          stroke="oklch(0 0 0 / 0.16)"
          strokeWidth="0.75"
        />
        <rect
          x="-4"
          y="-3"
          width="18"
          height="132"
          style={{ fill: "oklch(from var(--warn) 0.86 0.06 h)" }}
        />
      </g>
    </svg>
  );
}

/**
 * A pocket flipbook lying on the table, bound with tape at its spine, a thumb
 * on the bottom-right corner holding the waiting pages curled up into a fan.
 * Riffling releases them one after another: each page swings down from the
 * curl, bending as it goes, and lands flat on the pile, so the drawing on the
 * visible page moves — a boat on a rolling swell and a gull beating its
 * wings, a seamless loop — and a fast riffle keeps several pages in the air.
 *
 * Every page has its own curl on a spring: the page under a drag tracks the
 * finger on springs.flick, released pages drop on springs.snap (the paper
 * bounces once off the pile) at the `riffle` rate. A flick keeps riffling to
 * where the throw would rest; scrolling the page riffles forward and back.
 * Each page is cut into strips across a leaning bend line and drawn as exact
 * affine slices of its texture, shaded by its slope, its back showing as
 * plain paper. It is a slider: Right and Up turn a page, Left and Down turn
 * back, Page Up and Page Down a whole loop, Home and End riffle to either end,
 * Space riffles one loop. Under
 * reduced motion pages change in place and scrolling leaves the book alone.
 */
export function ThumbFlipbook({
  images,
  frames = 12,
  pages = 48,
  bend = 0.6,
  riffle = 0.5,
  value,
  defaultValue = 0,
  onValueChange,
  scroll = true,
  thumb = true,
  paper = "oklch(from var(--warn) 0.975 0.012 h)",
  ink = "oklch(from var(--ink) 0.3 0.03 h)",
  accent = "oklch(from var(--danger) 0.6 0.16 h)",
  sound = false,
  dpr = 2,
  label = "Flipbook",
  disabled = false,
  className,
}: ThumbFlipbookProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const pageCount = clamp(Math.round(pages), 12, 120);
  const frameCount =
    images && images.length > 0
      ? images.length
      : clamp(Math.round(frames), 6, 24);

  const [own, setOwn] = React.useState(() =>
    clamp(Math.round(defaultValue), 0, pageCount),
  );
  const turned = clamp(Math.round(value ?? own), 0, pageCount);
  const [shown, setShown] = React.useState(turned);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const dragFrom = React.useRef(0);
  const asked = React.useRef(turned);

  const config: Config = {
    images: images ?? [],
    frames: frameCount,
    pages: pageCount,
    bend,
    riffle,
    scroll,
    thumb,
    dpr,
    motionSafe,
    disabled,
    colorKey: `${paper}|${ink}|${accent}`,
  };
  const latest = React.useRef(config);

  const hooks = React.useRef<Hooks>({ onPage: () => {}, onRelease: () => {} });
  React.useEffect(() => {
    latest.current = config;
    hooks.current = {
      onPage: (page) => {
        setShown(page);
        if (page === asked.current) return;
        asked.current = page;
        if (value === undefined) setOwn(page);
        onValueChange?.(page);
      },
      onRelease: (speed, page) => {
        // A wheel or scroll is not a user activation: stay silent until the
        // visitor has clicked, tapped or pressed a key.
        const active =
          typeof navigator !== "undefined" &&
          (navigator.userActivation?.hasBeenActive ?? true);
        if (!active) return;
        audio.play("paper", {
          pitch: 0.9 + ((page * 37) % 11) / 30 + Math.min(0.3, speed / 60),
          gain: clamp(0.18 + speed / 80, 0.18, 0.5),
        });
      },
    };
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, hooks);
    engine.current = e;
    e.configure(latest.current);
    e.holdAt(asked.current);
    e.runTo(asked.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // A host that moves `value` gets the same riffle a key would.
  React.useEffect(() => {
    if (turned === asked.current) return;
    asked.current = turned;
    engine.current?.runTo(turned);
  }, [turned]);

  React.useEffect(() => {
    const onVisibility = () => engine.current?.wake();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Scrolling anything that moves the book on screen riffles it.
  React.useEffect(() => {
    let lastTop: number | null = null;
    const onScroll = () => {
      const root = rootRef.current;
      if (!root || !visible.current) {
        lastTop = null;
        return;
      }
      const top = root.getBoundingClientRect().top;
      if (lastTop !== null && top !== lastTop) {
        const perPx = lerp(1 / 22, 1 / 7, clamp(latest.current.riffle, 0, 1));
        if (!latest.current.disabled) {
          engine.current?.scrolled((lastTop - top) * perPx);
        }
      }
      lastTop = top;
    };
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const perPx = () => lerp(1 / 18, 1 / 6, clamp(riffle, 0, 1));

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      dragFrom.current = engine.current?.hand() ?? turned;
    },
    onMove: ({ offset }) => {
      const raw = dragFrom.current - offset.x * perPx();
      const p =
        raw < 0
          ? rubberband(raw, 2)
          : raw > pageCount
            ? pageCount + rubberband(raw - pageCount, 2)
            : raw;
      if (!motionSafe) {
        engine.current?.runTo(Math.round(clamp(p, 0, pageCount)));
        return;
      }
      engine.current?.holdAt(p);
    },
    onEnd: ({ velocity }) => {
      const p = engine.current?.hand() ?? turned;
      const v = -velocity.x * perPx();
      engine.current?.runTo(
        motionSafe ? Math.round(project(p, v, 0.994)) : Math.round(p),
      );
    },
    onCancel: () => {
      const e = engine.current;
      if (e) e.runTo(Math.round(e.hand()));
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const at = asked.current;
    const moves: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowUp: at + 1,
      ArrowLeft: at - 1,
      ArrowDown: at - 1,
      PageUp: at + frameCount,
      PageDown: at - frameCount,
      Home: 0,
      End: pageCount,
      " ": at + frameCount > pageCount ? 0 : at + frameCount,
      Enter: at + frameCount > pageCount ? 0 : at + frameCount,
    };
    const to = moves[event.key];
    if (to === undefined) return;
    event.preventDefault();
    engine.current?.runTo(clamp(to, 0, pageCount));
  };

  const frameNow = shown % frameCount;
  const carriers = [
    paper,
    ink,
    accent,
    "oklch(from var(--accent) 0.42 0.08 h)",
    "oklch(from var(--warn) 0.86 0.06 h)",
    "oklch(0.8 0.05 55)",
  ];

  return (
    <div
      ref={bindRoot}
      role="slider"
      aria-label={label}
      aria-describedby={hintId}
      aria-valuemin={0}
      aria-valuemax={pageCount}
      aria-valuenow={shown}
      aria-valuetext={`Page ${shown} of ${pageCount}, drawing ${frameNow + 1} of ${frameCount}`}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/thumb-flipbook relative isolate aspect-[8/5] w-full touch-pan-y overflow-clip rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-live/thumb-flipbook:hidden"
      >
        <StillBook
          phase={frameNow / frameCount}
          image={images?.[frameNow]}
          paper={paper}
          ink={ink}
          accent={accent}
        />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/thumb-flipbook:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {carriers.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <p id={hintId} className="sr-only">
        Drag sideways or scroll to riffle the pages. Right or Up turns one page,
        Left or Down turns one back, Page Up and Page Down a whole loop, Home
        and End riffle to either end, Space riffles one loop.
      </p>
    </div>
  );
}
