"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import {
  createVelocityTracker,
  rubberband,
  useDrag,
} from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

type HeadingTag = "h1" | "h2" | "h3" | "p" | "div" | "span";

export type TaffyPullProps = {
  /** The headline. Every letter can be pulled. @default "Pull me" */
  text?: string;
  /** The element the headline renders as. @default "h2" */
  as?: HeadingTag;
  /** How far a letter reaches before it resists (and, at 1.6× that, tears): 0 is 0.4 of a letter's height, 1 is 1.6. @default 0.5 */
  stretch?: number;
  /** How hard a letter snaps home, as a spring stiffness (120 to 900). @default 420 */
  stiffness?: number;
  /** How thin the neck gets as it stretches, 0 to 1. @default 0.6 */
  thinning?: number;
  /** How long a letter and the word ring after the snap, 0 (dead) to 1 (ringing). @default 0.5 */
  wobble?: number;
  /** How much the neighbours are dragged after a pulled letter, 0 to 1. @default 0.35 */
  cling?: number;
  /** A hard fling, or a pull far past the reach, tears the letter free; it arcs out and is reeled back. @default true */
  tear?: boolean;
  /** Release speed that tears a letter free, px a second. @default 1600 */
  tearSpeed?: number;
  /** Ink for the letters; inherits the text colour unless set. */
  color?: string;
  /** Fires while a letter is pulled, with its index and how far toward the reach it is, 0 to 1 (in steps of 0.01). */
  onPull?: (index: number, amount: number) => void;
  /** Fires when a pulled letter is let go and snaps home, or lands after a tear. */
  onSnap?: (index: number) => void;
  /** Fires when a letter tears free. */
  onTear?: (index: number) => void;
  /** A twang at the snap, pitched by the stretch; a higher one at a tear. @default false */
  sound?: boolean;
  /** Letters cannot be pulled. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the type (set the font size here) and places the headline. */
  className?: string;
};

const GX = 10;
const GY = 12;
const STEP = 1 / 240;
const GRAVITY = 2600;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Graphemes, so an accented letter or an emoji is pulled whole. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

type Mode = 0 | 1 | 2 | 3 | 4;
const REST: Mode = 0;
const HELD: Mode = 1;
const SPRING: Mode = 2;
const FLIGHT: Mode = 3;
const REEL: Mode = 4;

type Letter = {
  el: HTMLSpanElement;
  ch: string;
  /** Rest box in the root's padding box, px. */
  x: number;
  y: number;
  w: number;
  h: number;
};

type State = {
  mode: Mode;
  /** The grabbed part's travel from rest, and its velocity. */
  px: number;
  py: number;
  pvx: number;
  pvy: number;
  /** Where it was grabbed, from the letter's centre. */
  gx: number;
  gy: number;
  /** The whole letter's offset (neighbour drag, wobble, flight), and velocity. */
  bx: number;
  by: number;
  bvx: number;
  bvy: number;
  /** Flight spin. */
  angle: number;
  spin: number;
  /** Seconds in the current mode. */
  age: number;
  /** Reduced motion: the stretched raster fading out after a release. */
  fade: number;
  /** Pull frozen at the release, for that fade. */
  fx: number;
  fy: number;
};

type Strand = { x0: number; y0: number; x1: number; y1: number; age: number };
type Kick = { i: number; at: number; vx: number; vy: number };

type Config = {
  stretch: number;
  stiffness: number;
  thinning: number;
  wobble: number;
  cling: number;
  tear: boolean;
  tearSpeed: number;
  disabled: boolean;
  dpr: number;
  motionSafe: boolean;
};

type Hooks = {
  pull: (i: number, amount: number) => void;
  snap: (i: number) => void;
  tear: (i: number) => void;
  sound: (kind: "snap" | "tear" | "land", strain: number, x: number) => void;
};

type Engine = {
  configure: (c: Config) => void;
  remeasure: () => void;
  grab: (i: number, x: number, y: number) => void;
  move: (dx: number, dy: number, t: number) => void;
  drop: (vx: number, vy: number) => void;
  tug: (i: number, dx: number, dy: number) => void;
  untug: () => void;
  letGo: () => boolean;
  dispose: () => void;
};

/** The affine map that carries triangle s onto triangle d. */
function affine(
  s0x: number,
  s0y: number,
  s1x: number,
  s1y: number,
  s2x: number,
  s2y: number,
  d0x: number,
  d0y: number,
  d1x: number,
  d1y: number,
  d2x: number,
  d2y: number,
): [number, number, number, number, number, number] | null {
  const den = s0x * (s1y - s2y) + s1x * (s2y - s0y) + s2x * (s0y - s1y);
  if (Math.abs(den) < 1e-6) return null;
  const a = (d0x * (s1y - s2y) + d1x * (s2y - s0y) + d2x * (s0y - s1y)) / den;
  const b = (d0y * (s1y - s2y) + d1y * (s2y - s0y) + d2y * (s0y - s1y)) / den;
  const c = (d0x * (s2x - s1x) + d1x * (s0x - s2x) + d2x * (s1x - s0x)) / den;
  const d = (d0y * (s2x - s1x) + d1y * (s0x - s2x) + d2y * (s1x - s0x)) / den;
  const e =
    (d0x * (s1x * s2y - s2x * s1y) +
      d1x * (s2x * s0y - s0x * s2y) +
      d2x * (s0x * s1y - s1x * s0y)) /
    den;
  const f =
    (d0y * (s1x * s2y - s2x * s1y) +
      d1y * (s2x * s0y - s0x * s2y) +
      d2y * (s0x * s1y - s1x * s0y)) /
    den;
  return [a, b, c, d, e, f];
}

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  visible: React.RefObject<boolean>,
  hooks: React.RefObject<Hooks>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let letters: Letter[] = [];
  let states: State[] = [];
  let frame = 0;
  let last = 0;
  let disposed = false;
  let dpr = 1;
  let W = 0;
  let H = 0;
  let held = -1;
  let keyed = -1;
  let keyTarget = { x: 0, y: 0 };
  // The key pull before the rubber band: what decides a tear.
  let keyRaw = { x: 0, y: 0 };
  const strands: Strand[] = [];
  const kicks: Kick[] = [];
  let clock = 0;
  let reported = -1;
  // Pointer velocity while held, for a tear that happens mid-pull.
  const tracker = createVelocityTracker();
  // Where a grab starts from: a letter caught mid-ring keeps its stretch.
  const grabFrom = { x: 0, y: 0 };
  const rasters = new Map<string, { img: HTMLCanvasElement; pad: number }>();

  const fresh = (): State => ({
    mode: REST,
    px: 0,
    py: 0,
    pvx: 0,
    pvy: 0,
    gx: 0,
    gy: 0,
    bx: 0,
    by: 0,
    bvx: 0,
    bvy: 0,
    angle: 0,
    spin: 0,
    age: 0,
    fade: 0,
    fx: 0,
    fy: 0,
  });

  /** Rest boxes from layout (offsets ignore the transforms we write). */
  const measure = () => {
    const nodes = Array.from(
      root.querySelectorAll<HTMLSpanElement>("[data-taffy-letter]"),
    );
    letters = nodes.map((el) => {
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== root) {
        x += node.offsetLeft;
        y += node.offsetTop;
        const parent: Element | null = node.offsetParent;
        node = parent instanceof HTMLElement ? parent : null;
      }
      return {
        el,
        ch: el.textContent ?? "",
        x,
        y,
        w: el.offsetWidth,
        h: el.offsetHeight,
      };
    });
    if (states.length !== letters.length) {
      states = letters.map(() => fresh());
    }
    W = root.clientWidth;
    H = root.clientHeight;
    const c = cfg;
    dpr = Math.min(window.devicePixelRatio || 1, clamp(c?.dpr ?? 2, 0.5, 2));
    const cw = Math.round(W * dpr);
    const chh = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== chh) {
      canvas.width = cw;
      canvas.height = chh;
    }
  };

  const reach = (l: Letter) =>
    l.h * (0.4 + 1.2 * clamp(cfg?.stretch ?? 0.5, 0, 1));

  /** The letter drawn once at the device ratio, in its own font and ink. */
  const raster = (l: Letter) => {
    const style = getComputedStyle(l.el);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const color = style.color;
    const key = `${l.ch}|${font}|${color}|${dpr}|${l.w}|${l.h}`;
    const hit = rasters.get(key);
    if (hit) return hit;
    const pad = Math.ceil(parseFloat(style.fontSize) * 0.3);
    const img = document.createElement("canvas");
    img.width = Math.ceil((l.w + pad * 2) * dpr);
    img.height = Math.ceil((l.h + pad * 2) * dpr);
    const g = img.getContext("2d");
    if (g) {
      g.scale(dpr, dpr);
      g.font = font;
      g.fillStyle = color;
      g.textBaseline = "alphabetic";
      const m = g.measureText(l.ch);
      const ascent =
        m.fontBoundingBoxAscent || parseFloat(style.fontSize) * 0.8;
      const descent =
        m.fontBoundingBoxDescent || parseFloat(style.fontSize) * 0.2;
      // The CSS line box: half-leading above the ascent, as the page lays it.
      const base = pad + (l.h - (ascent + descent)) / 2 + ascent;
      g.fillText(l.ch, pad, base);
    }
    const out = { img, pad };
    if (rasters.size > 64) rasters.clear();
    rasters.set(key, out);
    return out;
  };

  /** Draws a stretched letter: a textured mesh pulled from the grab, necked midway. */
  const drawMesh = (
    l: Letter,
    s: State,
    alpha: number,
    px: number,
    py: number,
  ) => {
    const c = cfg;
    if (!ctx || !c) return;
    const { img, pad } = raster(l);
    const L = Math.hypot(px, py);
    const ux = L > 0.01 ? px / L : 0;
    const uy = L > 0.01 ? py / L : 0;
    const nx = -uy;
    const ny = ux;
    const hw = l.w / 2 + pad;
    const hh = l.h / 2 + pad;
    // Along the pull: the glyph's far side stays in its slot, the part at
    // and beyond the grab is carried, and the stretch is everything between.
    // Measured on the glyph's own box, not the raster's padding, or the far
    // side would ride along too.
    const gw = l.w / 2;
    const gh = l.h / 2;
    let sFar = Infinity;
    for (const [cx = 0, cy = 0] of [
      [-gw, -gh],
      [gw, -gh],
      [gw, gh],
      [-gw, gh],
    ])
      sFar = Math.min(sFar, cx * ux + cy * uy);
    const sGrab = s.gx * ux + s.gy * uy;
    const sMin = sFar * 0.55 + sGrab * 0.45 - Math.abs(sFar) * 0.15;
    const sG = Math.max(sMin + Math.abs(sFar) * 0.5, sGrab);
    const strain = clamp(L / Math.max(1, reach(l)), 0, 1.2);
    const thin = clamp(c.thinning, 0, 1) * Math.min(1, strain);
    const ox = l.x + l.w / 2 + s.bx;
    const oy = l.y + l.h / 2 + s.by;
    const vx = new Float32Array((GX + 1) * (GY + 1));
    const vy = new Float32Array((GX + 1) * (GY + 1));
    for (let j = 0; j <= GY; j += 1) {
      for (let i = 0; i <= GX; i += 1) {
        const qx = -hw + (2 * hw * i) / GX;
        const qy = -hh + (2 * hh * j) / GY;
        const sq = qx * ux + qy * uy;
        const t = clamp((sq - sMin) / (sG - sMin), 0, 1);
        const wgt = t * t * (3 - 2 * t);
        const e = (qx - s.gx) * nx + (qy - s.gy) * ny;
        const neck = 1 - thin * Math.pow(Math.sin(Math.PI * t), 1.5);
        const k = j * (GX + 1) + i;
        vx[k] = ox + qx + px * wgt + nx * e * (neck - 1);
        vy[k] = oy + qy + py * wgt + ny * e * (neck - 1);
      }
    }
    // Barely stretched (the end of a ring), the letter is drawn whole and
    // carried: a mesh would only thicken its anti-aliased edges.
    if (L < 2.5) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        img,
        Math.round((ox - hw + px * 0.5) * dpr),
        Math.round((oy - hh + py * 0.5) * dpr),
      );
      ctx.globalAlpha = 1;
      return;
    }
    const sw = img.width / GX;
    const sh = img.height / GY;
    ctx.globalAlpha = alpha;
    const tri = (
      a: number,
      b: number,
      cc: number,
      sa: [number, number],
      sb: [number, number],
      sc: [number, number],
    ) => {
      const ax = (vx[a] ?? 0) * dpr;
      const ay = (vy[a] ?? 0) * dpr;
      const bx = (vx[b] ?? 0) * dpr;
      const by = (vy[b] ?? 0) * dpr;
      const cx = (vx[cc] ?? 0) * dpr;
      const cy = (vy[cc] ?? 0) * dpr;
      const m = affine(
        sa[0],
        sa[1],
        sb[0],
        sb[1],
        sc[0],
        sc[1],
        ax,
        ay,
        bx,
        by,
        cx,
        cy,
      );
      if (!m) return;
      // Clip a hair outside the triangle so neighbours overlap: no seams.
      const mx = (ax + bx + cx) / 3;
      const my = (ay + by + cy) / 3;
      const grow = (x: number, y: number): [number, number] => {
        const d = Math.hypot(x - mx, y - my) || 1;
        return [x + ((x - mx) / d) * 0.45, y + ((y - my) / d) * 0.45];
      };
      const [gax, gay] = grow(ax, ay);
      const [gbx, gby] = grow(bx, by);
      const [gcx, gcy] = grow(cx, cy);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(gax, gay);
      ctx.lineTo(gbx, gby);
      ctx.lineTo(gcx, gcy);
      ctx.closePath();
      ctx.clip();
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    };
    for (let j = 0; j < GY; j += 1) {
      for (let i = 0; i < GX; i += 1) {
        const k00 = j * (GX + 1) + i;
        const k10 = k00 + 1;
        const k01 = k00 + GX + 1;
        const k11 = k01 + 1;
        const s00: [number, number] = [i * sw, j * sh];
        const s10: [number, number] = [(i + 1) * sw, j * sh];
        const s01: [number, number] = [i * sw, (j + 1) * sh];
        const s11: [number, number] = [(i + 1) * sw, (j + 1) * sh];
        tri(k00, k10, k11, s00, s10, s11);
        tri(k00, k11, k01, s00, s11, s01);
      }
    }
    ctx.globalAlpha = 1;
  };

  const strainOf = (i: number) => {
    const l = letters[i];
    const s = states[i];
    if (!l || !s) return 0;
    return clamp(Math.hypot(s.px, s.py) / Math.max(1, reach(l)), 0, 1);
  };

  const report = (i: number) => {
    const amount = Math.round(strainOf(i) * 100) / 100;
    const key = i * 1000 + Math.round(amount * 100);
    if (key === reported) return;
    reported = key;
    hooks.current.pull(i, amount);
  };

  /** A wobble that runs down the word from letter i, both ways. */
  const ripple = (i: number, vx: number, vy: number) => {
    const c = cfg;
    if (!c || !c.motionSafe) return;
    const decay = 0.55 + 0.35 * clamp(c.cling, 0, 1);
    const gap = cascade(letters.length);
    const speed = Math.min(1600, Math.hypot(vx, vy));
    for (let j = 0; j < letters.length; j += 1) {
      if (j === i) continue;
      const k = Math.abs(j - i);
      const amp = Math.pow(decay, k);
      if (amp < 0.04) continue;
      kicks.push({
        i: j,
        at: clock + k * gap,
        vx: (vx / Math.max(1, speed)) * speed * 0.08 * amp,
        vy: -(140 + speed * 0.22) * amp,
      });
    }
  };

  const tearFree = (i: number, vx: number, vy: number) => {
    const s = states[i];
    const l = letters[i];
    const c = cfg;
    if (!s || !l || !c) return;
    const ax = l.x + l.w / 2;
    const ay = l.y + l.h / 2;
    if (held === i) held = -1;
    if (keyed === i) keyed = -1;
    if (!c.motionSafe) {
      // Reduced motion: no flight. The stretched letter fades out as the
      // letter fades back in, in its slot.
      s.fx = s.px;
      s.fy = s.py;
      s.fade = 1;
      s.px = 0;
      s.py = 0;
      s.pvx = 0;
      s.pvy = 0;
      s.mode = REST;
      hooks.current.tear(i);
      hooks.current.sound("tear", 1, ax);
      return;
    }
    // The neck breaks: one strand recoils into the slot, one into the letter.
    strands.push({
      x0: ax,
      y0: ay,
      x1: ax + s.px * 0.5,
      y1: ay + s.py * 0.5,
      age: 0,
    });
    s.mode = FLIGHT;
    s.age = 0;
    s.bx = s.px * 0.85;
    s.by = s.py * 0.85;
    s.bvx = clamp(vx, -3000, 3000);
    s.bvy = clamp(vy, -3000, 3000);
    s.spin = clamp((s.gx * vy - s.gy * vx) * 0.0006, -14, 14);
    s.angle = 0;
    s.px = 0;
    s.py = 0;
    s.pvx = 0;
    s.pvy = 0;
    s.fade = 0;
    hooks.current.tear(i);
    hooks.current.sound("tear", 1, ax);
  };

  const release = (i: number, vx: number, vy: number) => {
    const s = states[i];
    const l = letters[i];
    const c = cfg;
    if (!s || !l || !c) return;
    const strain = strainOf(i);
    if (
      c.tear &&
      Math.hypot(vx, vy) > Math.max(200, c.tearSpeed) &&
      strain > 0.4
    ) {
      tearFree(i, vx, vy);
      return;
    }
    if (!c.motionSafe) {
      // Reduced motion: home at once, the stretched shape fading out.
      s.fx = s.px;
      s.fy = s.py;
      s.fade = 1;
      s.px = 0;
      s.py = 0;
      s.pvx = 0;
      s.pvy = 0;
      s.mode = REST;
    } else {
      s.mode = SPRING;
      s.pvx = clamp(vx, -4000, 4000);
      s.pvy = clamp(vy, -4000, 4000);
      ripple(i, s.px * 6 + vx * 0.3, s.py * 6 + vy * 0.3);
    }
    s.age = 0;
    hooks.current.snap(i);
    hooks.current.sound("snap", strain, l.x + l.w / 2);
  };

  const springTo = (
    x: number,
    v: number,
    goal: number,
    k: number,
    damp: number,
    mass: number,
    h: number,
  ) => {
    const nv = v + ((-k * (x - goal) - damp * v) / mass) * h;
    return [x + nv * h, nv] as const;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    const k = clamp(c.stiffness, 60, 1600);
    const zeta = 0.9 - 0.72 * clamp(c.wobble, 0, 1);
    const damp = 2 * zeta * Math.sqrt(k);
    const snap = springs.snap;
    const recoil = springs.recoil;
    const glide = springs.glide;
    const flick = springs.flick;
    // Kicks that have come due.
    for (let q = kicks.length - 1; q >= 0; q -= 1) {
      const kick = kicks[q];
      if (!kick || kick.at > clock) continue;
      const s = states[kick.i];
      if (s && s.mode !== FLIGHT && s.mode !== REEL) {
        s.bvx += kick.vx;
        s.bvy += kick.vy;
      }
      kicks.splice(q, 1);
    }
    // The pulled letter, the one the neighbours follow.
    const lead = held >= 0 ? held : keyed;
    const ls = lead >= 0 ? states[lead] : undefined;
    const decay = 0.25 + 0.5 * clamp(c.cling, 0, 1);
    let left = dt;
    while (left > 0) {
      const h = Math.min(STEP, left);
      left -= h;
      for (let i = 0; i < states.length; i += 1) {
        const s = states[i];
        const l = letters[i];
        if (!s || !l) continue;
        s.age += h;
        if (s.mode === SPRING) {
          [s.px, s.pvx] = springTo(s.px, s.pvx, 0, k, damp, 1, h);
          [s.py, s.pvy] = springTo(s.py, s.pvy, 0, k, damp, 1, h);
        } else if (s.mode === HELD && i === keyed) {
          // A key tug: the grabbed part follows the held key on flick.
          [s.px, s.pvx] = springTo(
            s.px,
            s.pvx,
            keyTarget.x,
            flick.stiffness,
            flick.damping,
            flick.mass,
            h,
          );
          [s.py, s.pvy] = springTo(
            s.py,
            s.pvy,
            keyTarget.y,
            flick.stiffness,
            flick.damping,
            flick.mass,
            h,
          );
        }
        if (s.mode === FLIGHT) {
          s.bvy += GRAVITY * h;
          s.bx += s.bvx * h;
          s.by += s.bvy * h;
          s.angle += s.spin * h;
          // Soft bounces off the box's walls, inside its padding box.
          const cx = l.x + l.w / 2 + s.bx;
          const cy = l.y + l.h / 2 + s.by;
          const rx = l.w / 2;
          const ry = l.h / 2;
          if (cx < rx) {
            s.bx += rx - cx;
            s.bvx = Math.abs(s.bvx) * 0.45;
          } else if (cx > W - rx) {
            s.bx -= cx - (W - rx);
            s.bvx = -Math.abs(s.bvx) * 0.45;
          }
          if (cy < ry) {
            s.by += ry - cy;
            s.bvy = Math.abs(s.bvy) * 0.45;
          } else if (cy > H - ry) {
            s.by -= cy - (H - ry);
            s.bvy = -Math.abs(s.bvy) * 0.4;
            s.bvx *= 0.8;
          }
          // After its arc, the reel takes it.
          if (s.age > 0.5 && (s.bvy > 0 || s.age > 0.9)) {
            s.mode = REEL;
            s.age = 0;
          }
          continue;
        }
        if (s.mode === REEL) {
          [s.bx, s.bvx] = springTo(
            s.bx,
            s.bvx,
            0,
            glide.stiffness,
            glide.damping,
            glide.mass,
            h,
          );
          [s.by, s.bvy] = springTo(
            s.by,
            s.bvy,
            0,
            glide.stiffness,
            glide.damping,
            glide.mass,
            h,
          );
          [s.angle, s.spin] = springTo(
            s.angle,
            s.spin,
            0,
            glide.stiffness,
            glide.damping,
            glide.mass,
            h,
          );
          if (Math.hypot(s.bx, s.by) < l.h * 0.12) {
            // Home: the landing is a recoil, and the word rings with it.
            s.mode = REST;
            s.age = 0;
            s.bvy = Math.max(s.bvy, 0) + 220;
            ripple(i, s.bvx, 260);
            hooks.current.snap(i);
            hooks.current.sound("land", 0.3, l.x + l.w / 2);
          }
          continue;
        }
        // The body: neighbours follow the lead on the snap spring and lean
        // toward it; everyone else rings home on the word's own spring.
        let tx = 0;
        let ty = 0;
        if (ls && lead !== i && c.motionSafe) {
          const amp = Math.pow(decay, Math.abs(i - lead)) * 0.42;
          tx = ls.px * amp;
          ty = ls.py * amp;
        }
        const following = ls && lead !== i;
        const bodyK = following ? snap.stiffness : recoil.stiffness;
        const bodyD = following ? snap.damping : recoil.damping;
        [s.bx, s.bvx] = springTo(s.bx, s.bvx, tx, bodyK, bodyD, 1, h);
        [s.by, s.bvy] = springTo(s.by, s.bvy, ty, bodyK, bodyD, 1, h);
        if (
          s.mode === SPRING &&
          Math.hypot(s.px, s.py) < 0.15 &&
          Math.hypot(s.pvx, s.pvy) < 2
        ) {
          s.mode = REST;
          s.px = 0;
          s.py = 0;
          s.pvx = 0;
          s.pvy = 0;
        }
      }
    }
    for (const s of states)
      if (s.fade > 0) s.fade = Math.max(0, s.fade - dt / 0.15);
    for (let q = strands.length - 1; q >= 0; q -= 1) {
      const st = strands[q];
      if (!st) continue;
      st.age += dt;
      if (st.age > 0.2) strands.splice(q, 1);
    }
  };

  const busy = () =>
    held >= 0 ||
    keyed >= 0 ||
    kicks.length > 0 ||
    strands.length > 0 ||
    states.some(
      (s) =>
        s.mode !== REST ||
        s.fade > 0 ||
        Math.abs(s.bx) > 0.05 ||
        Math.abs(s.by) > 0.05 ||
        Math.abs(s.bvx) > 1 ||
        Math.abs(s.bvy) > 1,
    );

  const render = () => {
    const c = cfg;
    if (!ctx || !c) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < states.length; i += 1) {
      const s = states[i];
      const l = letters[i];
      if (!s || !l) continue;
      const stretched = s.mode === HELD || s.mode === SPRING;
      const lean = c.motionSafe ? clamp(s.bx * 0.06, -9, 9) : 0;
      const raw = c.motionSafe ? clamp(-s.bvy * 0.00022, -0.14, 0.14) : 0;
      const squash = Math.abs(raw) < 0.002 ? 0 : raw;
      if (s.mode === FLIGHT || s.mode === REEL) {
        l.el.style.opacity = c.motionSafe ? "1" : String(r2(1 - s.fade));
        l.el.style.transform = `translate3d(${r2(s.bx)}px, ${r2(s.by)}px, 0) rotate(${r2((s.angle * 180) / Math.PI)}deg)`;
      } else if (
        stretched &&
        (Math.abs(s.px) > 0.3 || Math.abs(s.py) > 0.3 || s.mode === HELD)
      ) {
        l.el.style.opacity = "0";
        l.el.style.transform = "";
        drawMesh(l, s, 1, s.px, s.py);
      } else {
        l.el.style.opacity = s.fade > 0 ? String(r2(1 - s.fade)) : "";
        l.el.style.transform =
          Math.abs(s.bx) < 0.05 && Math.abs(s.by) < 0.05 && squash === 0
            ? ""
            : `translate3d(${r2(s.bx)}px, ${r2(s.by)}px, 0) rotate(${r2(lean)}deg) scale(${r2(1 - squash * 0.6)}, ${r2(1 + squash)})`;
        if (s.fade > 0) drawMesh(l, s, s.fade, s.fx, s.fy);
      }
      // The reel's line, from the slot to the letter.
      if (s.mode === REEL && c.motionSafe) {
        const ax = l.x + l.w / 2;
        const ay = l.y + l.h / 2;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = getComputedStyle(l.el).color;
        ctx.lineWidth = Math.max(1, l.h * 0.02) * dpr;
        ctx.beginPath();
        ctx.moveTo(ax * dpr, ay * dpr);
        ctx.lineTo((ax + s.bx) * dpr, (ay + s.by) * dpr);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // The broken neck: two strands snapping back.
    for (const st of strands) {
      const l = letters[0];
      const p = st.age / 0.2;
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = l ? getComputedStyle(l.el).color : "currentColor";
      ctx.lineWidth = Math.max(1.5, (l?.h ?? 40) * 0.05 * (1 - p)) * dpr;
      ctx.lineCap = "round";
      const mx = st.x0 + (st.x1 - st.x0) * (1 - p) * 0.5;
      const my = st.y0 + (st.y1 - st.y0) * (1 - p) * 0.5;
      ctx.beginPath();
      ctx.moveTo(st.x0 * dpr, st.y0 * dpr);
      ctx.lineTo(mx * dpr, my * dpr);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.04, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    if (keyed >= 0) report(keyed);
    if (busy()) {
      render();
      frame = window.requestAnimationFrame(tick);
    } else {
      // Settled: every letter back to plain text, no stray sub-pixel transform.
      last = 0;
      for (const s of states) {
        if (s.mode !== REST) continue;
        s.bx = 0;
        s.by = 0;
        s.bvx = 0;
        s.bvy = 0;
        s.angle = 0;
        s.spin = 0;
      }
      render();
    }
  };

  const kick = () => {
    if (disposed || frame || !visible.current) return;
    frame = window.requestAnimationFrame(tick);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was || was.dpr !== next.dpr) {
        measure();
        rasters.clear();
      }
      if (was && was.motionSafe !== next.motionSafe) {
        kicks.length = 0;
        for (const s of states) {
          if (s.mode === FLIGHT || s.mode === REEL) Object.assign(s, fresh());
        }
      }
      kick();
    },
    remeasure() {
      measure();
      rasters.clear();
      render();
    },
    grab(i, x, y) {
      const c = cfg;
      if (!c || c.disabled) return;
      measure();
      const l = letters[i];
      const s = states[i];
      if (!l || !s || s.mode === FLIGHT || s.mode === REEL) return;
      held = i;
      tracker.reset();
      s.mode = HELD;
      s.age = 0;
      s.pvx = 0;
      s.pvy = 0;
      s.fade = 0;
      // Grab where the finger is, held inside the letter's box.
      s.gx = clamp(x - (l.x + l.w / 2 + s.bx), -l.w / 2, l.w / 2);
      s.gy = clamp(y - (l.y + l.h / 2 + s.by), -l.h / 2, l.h / 2);
      // A letter caught mid-ring keeps its stretch as the starting point.
      grabFrom.x = s.px;
      grabFrom.y = s.py;
      kick();
    },
    move(dx, dy, time) {
      const c = cfg;
      const i = held;
      const l = letters[i];
      const s = states[i];
      if (!c || !l || !s || s.mode !== HELD) return;
      const rawX = grabFrom.x + dx;
      const rawY = grabFrom.y + dy;
      tracker.push(rawX, rawY, time);
      const R = reach(l);
      const raw = Math.hypot(rawX, rawY);
      if (c.tear && raw > R * 1.6) {
        const v = tracker.velocity();
        tearFree(i, v.x, v.y);
        render();
        kick();
        return;
      }
      // 1:1 up to the reach, then the taffy resists.
      const eased = raw <= R ? raw : R + rubberband(raw - R, R);
      const k = raw > 0 ? eased / raw : 0;
      let px = rawX * k;
      let py = rawY * k;
      // Never past the box: the grabbed part stays inside it.
      const gxw = l.x + l.w / 2 + s.gx;
      const gyw = l.y + l.h / 2 + s.gy;
      // The grabbed side of the letter stays whole inside the box.
      const mx = Math.min(l.w * 0.5, W * 0.2);
      const my = Math.min(l.h * 0.35, H * 0.2);
      px = clamp(px, -gxw + mx, W - gxw - mx);
      py = clamp(py, -gyw + my, H - gyw - my);
      s.px = px;
      s.py = py;
      report(i);
      kick();
    },
    drop(vx, vy) {
      const i = held;
      held = -1;
      if (i < 0) return;
      release(i, vx, vy);
      kick();
    },
    tug(i, dx, dy) {
      const c = cfg;
      if (!c || c.disabled) return;
      measure();
      const l = letters[i];
      const s = states[i];
      if (!l || !s || s.mode === FLIGHT || s.mode === REEL) return;
      if (keyed !== i || s.mode !== HELD) {
        if (keyed >= 0 && keyed !== i) release(keyed, 0, 0);
        keyed = i;
        s.mode = HELD;
        s.age = 0;
        s.fade = 0;
        // Pulled from the edge that faces the tug.
        s.gx = Math.sign(dx) * l.w * 0.4;
        s.gy = Math.sign(dy) * l.h * 0.4;
        keyTarget = { x: s.px, y: s.py };
        keyRaw = { x: s.px, y: s.py };
      }
      const R = reach(l);
      keyRaw = { x: keyRaw.x + dx * R * 0.18, y: keyRaw.y + dy * R * 0.18 };
      const raw = Math.hypot(keyRaw.x, keyRaw.y);
      if (c.tear && raw > R * 1.6) {
        tearFree(i, (keyRaw.x / raw) * 1800, (keyRaw.y / raw) * 1800);
        keyTarget = { x: 0, y: 0 };
        keyRaw = { x: 0, y: 0 };
        kick();
        return;
      }
      const eased = raw <= R ? raw : R + rubberband(raw - R, R);
      keyTarget =
        raw > 0
          ? { x: (keyRaw.x / raw) * eased, y: (keyRaw.y / raw) * eased }
          : { x: 0, y: 0 };
      if (!c.motionSafe) {
        s.px = keyTarget.x;
        s.py = keyTarget.y;
      }
      report(i);
      kick();
    },
    untug() {
      const i = keyed;
      keyed = -1;
      if (i < 0) return;
      const s = states[i];
      if (s && s.mode === HELD) release(i, 0, 0);
      kick();
    },
    letGo() {
      if (keyed >= 0) {
        const i = keyed;
        keyed = -1;
        release(i, 0, 0);
        kick();
        return true;
      }
      return false;
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      for (const l of letters) {
        l.el.style.transform = "";
        l.el.style.opacity = "";
      }
    },
  };
}

/**
 * A display headline whose every letter can be grabbed and pulled like
 * taffy. The part you hold follows the finger 1:1 while the far side stays
 * put, so the letter stretches along the pull and thins into a neck; past
 * its reach it rubber-bands, and its neighbours are dragged a little after
 * it on springs.snap. Let go and it snaps home on a spring of `stiffness`
 * that takes the release velocity, while a wobble runs down the word letter
 * by letter. Fling it hard, or pull far past the reach, and it tears free —
 * the neck breaks, it arcs out under gravity, and a line reels it back into
 * its slot on springs.glide, where it lands with a recoil.
 *
 * At rest the letters are real text; a stretched letter is redrawn on a
 * canvas as a textured mesh. Keyboard: Left and Right choose a letter, Up and
 * Down tug it (Shift with Left or Right tugs it sideways), hold to pull
 * further, let the key go to let the letter go. Under reduced motion a pull
 * still stretches under the finger, but it returns home at once.
 */
export function TaffyPull({
  text = "Pull me",
  as = "h2",
  stretch = 0.5,
  stiffness = 420,
  thinning = 0.6,
  wobble = 0.5,
  cling = 0.35,
  tear = true,
  tearSpeed = 1600,
  color,
  onPull,
  onSnap,
  onTear,
  sound = false,
  disabled = false,
  dpr = 2,
  className,
}: TaffyPullProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const headingId = React.useId();
  const hintId = React.useId();
  const Tag = as;
  const words = React.useMemo(() => {
    let index = 0;
    return text.split(/(\s+)/).map((part) => {
      if (/^\s+$/.test(part)) return { space: true as const, part };
      return {
        space: false as const,
        letters: graphemes(part).map((ch) => ({ ch, i: index++ })),
      };
    });
  }, [text]);
  const count = words.reduce((n, w) => n + (w.space ? 0 : w.letters.length), 0);
  const all = React.useMemo(
    () => words.flatMap((w) => (w.space ? [] : w.letters.map((l) => l.ch))),
    [words],
  );
  const [chosen, setChosen] = React.useState(0);
  const [said, setSaid] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const latestProps = React.useRef({ onPull, onSnap, onTear, audio });
  const keyHeld = React.useRef<string | null>(null);
  const hooks = React.useRef<Hooks>({
    pull: (i, amount) => latestProps.current.onPull?.(i, amount),
    snap: (i) => latestProps.current.onSnap?.(i),
    tear: (i) => {
      setSaid("Torn free. Reeling it back.");
      latestProps.current.onTear?.(i);
    },
    sound: (kind, strain, x) => {
      const node = rootRef.current;
      const pan = node
        ? panFrom(node.getBoundingClientRect().left + x, node)
        : 0;
      const a = latestProps.current.audio;
      if (kind === "snap") {
        if (strain < 0.08) return;
        a.play("twang", {
          pitch: 0.8 + strain * 0.8,
          gain: 0.3 + strain * 0.35,
          pan,
        });
      } else if (kind === "tear")
        a.play("twang", { pitch: 1.9, gain: 0.5, pan });
      else a.play("twang", { pitch: 0.7, gain: 0.35, pan });
    },
  });

  const config: Config = {
    stretch,
    stiffness,
    thinning,
    wobble,
    cling,
    tear,
    tearSpeed,
    disabled,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latestProps.current = { onPull, onSnap, onTear, audio };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const e = createEngine(root, canvas, visible, hooks);
    engine.current = e;
    e.configure(latest.current);
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) engine.current?.remeasure();
    });
    return () => {
      live = false;
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [text]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.remeasure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  // The drag: a press on a letter grabs it. The shared gesture captures only
  // after a few px of travel and hands over the release velocity.
  const pressed = React.useRef(-1);

  const local = (x: number, y: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: x - r.left - root.clientLeft, y: y - r.top - root.clientTop };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point, offset }) => {
      const at = local(point.x - offset.x, point.y - offset.y);
      engine.current?.grab(pressed.current, at.x, at.y);
    },
    onMove: ({ offset, event }) =>
      engine.current?.move(offset.x, offset.y, event.timeStamp),
    onEnd: ({ velocity }) => engine.current?.drop(velocity.x, velocity.y),
    onCancel: () => engine.current?.drop(0, 0),
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-taffy-letter]")
        : null;
    const i = el ? Number(el.dataset.taffyLetter) : -1;
    // Only a press on a letter starts a pull; the rest of the box is page.
    if (i < 0) return;
    pressed.current = i;
    setChosen(i);
    drag.onPointerDown(event);
  };

  const choose = (i: number) => {
    const next = clamp(i, 0, Math.max(0, count - 1));
    setChosen(next);
    const ch = all[next] ?? "";
    setSaid(`${ch.toUpperCase()}, letter ${next + 1} of ${count}`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !count) return;
    const e = engine.current;
    const key = event.key;
    if (key === "Escape") {
      if (e?.letGo()) {
        keyHeld.current = null;
        event.preventDefault();
      }
      return;
    }
    let dx = 0;
    let dy = 0;
    if (key === "ArrowUp") dy = -1;
    else if (key === "ArrowDown") dy = 1;
    else if (event.shiftKey && key === "ArrowLeft") dx = -1;
    else if (event.shiftKey && key === "ArrowRight") dx = 1;
    else if (key === "ArrowLeft" || key === "ArrowRight") {
      event.preventDefault();
      if (keyHeld.current) {
        e?.untug();
        keyHeld.current = null;
      }
      choose(chosen + (key === "ArrowLeft" ? -1 : 1));
      return;
    } else if (key === "Home" || key === "End") {
      event.preventDefault();
      choose(key === "Home" ? 0 : count - 1);
      return;
    } else return;
    event.preventDefault();
    keyHeld.current = key;
    e?.tug(chosen, dx, dy);
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (keyHeld.current && event.key === keyHeld.current) {
      keyHeld.current = null;
      engine.current?.untug();
    }
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="stretchy headline"
      aria-labelledby={headingId}
      aria-describedby={hintId}
      tabIndex={disabled ? undefined : 0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        if (keyHeld.current) {
          keyHeld.current = null;
          engine.current?.untug();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/taffy-pull relative isolate overflow-clip px-[0.25em] py-[0.75em] outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
      style={color ? { color } : undefined}
    >
      <Tag id={headingId} className="m-0 leading-[1.05]">
        <span className="sr-only">{text}</span>
        <span aria-hidden>
          {words.map((w, k) =>
            w.space ? (
              <React.Fragment key={k}> </React.Fragment>
            ) : (
              <span key={k} className="inline-block whitespace-nowrap">
                {w.letters.map(({ ch, i }) => (
                  <span
                    key={i}
                    data-taffy-letter={i}
                    data-chosen={i === chosen ? "" : undefined}
                    className={cn(
                      "inline-block origin-bottom select-none",
                      disabled
                        ? "cursor-default"
                        : "cursor-grab touch-none active:cursor-grabbing",
                      "group-focus-visible/taffy-pull:data-[chosen]:underline group-focus-visible/taffy-pull:data-[chosen]:decoration-ring group-focus-visible/taffy-pull:data-[chosen]:decoration-2 group-focus-visible/taffy-pull:data-[chosen]:underline-offset-[0.12em]",
                    )}
                  >
                    {ch}
                  </span>
                ))}
              </span>
            ),
          )}
        </span>
      </Tag>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span id={hintId} className="sr-only">
        Left and right arrows choose a letter. Up and down tug it; Shift with
        left or right tugs it sideways. Hold a key to pull further, let go to
        let it snap back.
      </span>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
