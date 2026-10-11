"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DustDevilProps = {
  /** How many times each thread winds round the column from foot to crown, 1 to 8. @default 3.5 */
  turns?: number;
  /** How far the crown trails the foot and whips past when it stops, 0 (a stiff column) to 1 (a whippy one). @default 0.6 */
  lean?: number;
  /** How many threads of light make the funnel, 6 to 64. @default 24 */
  threadCount?: number;
  /** The light's colour. Drawn additively on a dark page and as ink on a light one. @default sand, from the warn token's hue */
  color?: string;
  /** The crown's width, as a share of the box's width, 0.2 to 0.9. @default 0.55 */
  flare?: number;
  /** The funnel's height, as a share of the box's height, 0.4 to 0.95. @default 0.82 */
  height?: number;
  /** How fast it spins, 0 (held) to 2. @default 1 */
  speed?: number;
  /** How much dust circles the skirt and how big a spray a click flings, 0 to 1. @default 0.6 */
  dust?: number;
  /** How far the foot wanders round its spot when no hand leads it, 0 to 1. @default 0.5 */
  wander?: number;
  /** Percent of the width per arrow key. @default 8 */
  step?: number;
  /** Controlled place where it stands, 0 (left) to 100 (right). */
  value?: number;
  /** Initial place when uncontrolled. @default 50 */
  defaultValue?: number;
  /** Fires when the pointer (on leaving) or the keys set a new place, in whole percent. */
  onValueChange?: (value: number) => void;
  /** The pointer and keys walk it, and a click flings dust. @default true */
  interactive?: boolean;
  /** No walking or flinging by hand or key. @default false */
  disabled?: boolean;
  /** Hold the spin and the wander; the walk and a fling still move. @default false */
  paused?: boolean;
  /** Seeds the threads and the dust, so two whirlwinds never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The accessible name of the whirlwind's control. @default "Move the whirlwind" */
  label?: string;
  /** Fires when a click or Enter flings dust off the skirt. */
  onFling?: () => void;
  /** Sizes the box; it fills its parent by default. */
  className?: string;
};

const STEP = 1 / 120;
const NODES = 20;
const SAMPLES = 44;
const MAX_THREADS = 64;
const SKIRT = 70;
const SPRAY = 96;
/** Height bands (skirt, body, crown) × depth (back, front). */
const BANDS = 3;
const HEIGHT_ALPHA = [0.85, 0.55, 0.28] as const;
/** Reduced motion: a fling's still ring fades over this long, s. */
const STILL_RING = 0.7;
const KEY_PAGE = 25;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x2545f491) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

let probe: CanvasRenderingContext2D | null = null;
function readRgb(el: Element | undefined): Rgb {
  if (!el) return [0, 0, 0];
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgb(0, 0, 0)";
  probe.fillStyle = getComputedStyle(el).color;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

type Config = {
  turns: number;
  lean: number;
  threads: number;
  flare: number;
  height: number;
  speed: number;
  dust: number;
  wander: number;
  home: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number) => void;
  handAway: () => number | null;
  fling: () => void;
  dispose: () => void;
};

/**
 * The whirlwind outside React: a spine of nodes on springs, the threads that
 * wind round it, the dust circling its skirt and the dust it flings.
 */
function createWhirl(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let disposed = false;
  let live = false;
  const size = { w: 0, h: 0, dpr: 1 };
  let light = "rgb(0, 0, 0)";
  let dark = true;
  let shadow: HTMLCanvasElement | null = null;
  const sim = {
    t: 0,
    spin: 0,
    /** Where the hand leads the foot, px, or null with no hand. */
    hand: null as number | null,
    flings: 0,
  };
  /** Spine: each node's offset (px) and velocity. Node 0 is the foot. */
  const nodeX = new Float32Array(NODES);
  const nodeV = new Float32Array(NODES);
  /** Per thread: phase, radius share, pace, reach (how high it climbs). */
  const thread = {
    phase: new Float32Array(MAX_THREADS),
    radius: new Float32Array(MAX_THREADS),
    pace: new Float32Array(MAX_THREADS),
    reach: new Float32Array(MAX_THREADS),
  };
  /** Projected samples: x, y, depth. */
  const pts = new Float32Array(MAX_THREADS * (SAMPLES + 1) * 3);
  /** Skirt dust: angle, radius share, height, pace. */
  const skirt = new Float32Array(SKIRT * 4);
  /** Flung dust: x, y, z, vx, vy, vz, life, span. */
  const spray = new Float32Array(SPRAY * 8);
  let sprayNext = 0;
  /** Reduced motion's still ring, s left. */
  let ring = 0;

  const seedAll = (c: Config) => {
    const rand = lcg(c.seed * 13 + 5);
    for (let i = 0; i < MAX_THREADS; i += 1) {
      thread.phase[i] = rand() * Math.PI * 2;
      thread.radius[i] = 0.78 + rand() * 0.44;
      thread.pace[i] = 0.88 + rand() * 0.24;
      thread.reach[i] = 0.72 + rand() * 0.28;
    }
    for (let i = 0; i < SKIRT; i += 1) {
      skirt[i * 4] = rand() * Math.PI * 2;
      skirt[i * 4 + 1] = 1.3 + rand() * 3.2;
      skirt[i * 4 + 2] = rand();
      skirt[i * 4 + 3] = 0.6 + rand() * 0.8;
    }
    sim.t = rand() * 30;
  };

  const geo = { floor: 0, H: 0, crown: 0, foot: 0 };
  const measure = () => {
    const c = cfg;
    const { w, h } = size;
    geo.floor = h * 0.9;
    geo.H = clamp(c?.height ?? 0.82, 0.4, 0.95) * geo.floor * 0.96;
    geo.crown = (clamp(c?.flare ?? 0.55, 0.2, 0.9) * w) / 2;
    geo.foot = Math.max(3, Math.min(w, h) * 0.018);
    return geo;
  };

  /** How far in from each side the foot may stand, so the crown stays inside. */
  const margin = () => {
    const crown = (clamp(cfg?.flare ?? 0.55, 0.2, 0.9) * size.w) / 2;
    return Math.min(size.w * 0.45, Math.max(size.w * 0.12, crown * 1.05));
  };

  /** Home: 0 to 100 laid across the room the crown allows. */
  const homeX = () => {
    const m = margin();
    return m + ((cfg?.home ?? 50) / 100) * (size.w - 2 * m);
  };

  /** Where the foot is headed: the hand, or home plus a slow wander. */
  const footTarget = () => {
    const c = cfg;
    const m = margin();
    if (sim.hand !== null) return clamp(sim.hand, m, size.w - m);
    if (!c || !c.motionSafe) return homeX();
    const t = sim.t;
    const roam =
      clamp01(c.wander) *
      size.w *
      0.05 *
      (Math.sin(t * 0.37 + 1.3) + 0.6 * Math.sin(t * 0.83 + 0.4));
    return clamp(homeX() + roam, m, size.w - m);
  };

  const paintColours = () => {
    const kids = carriers.children;
    const lit = readRgb(kids[0]);
    const ink = readRgb(kids[1]);
    const ground = readRgb(kids[2]);
    dark =
      (0.2126 * ground[0] + 0.7152 * ground[1] + 0.0722 * ground[2]) / 255 <
      0.5;
    const use = dark ? lit : ink;
    light = `rgb(${use[0]}, ${use[1]}, ${use[2]})`;
    // The pool of shade under the foot, rendered once per colour.
    const s = shadow ?? document.createElement("canvas");
    s.width = 64;
    s.height = 64;
    const sc = s.getContext("2d");
    if (sc) {
      sc.clearRect(0, 0, 64, 64);
      const g = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, `rgba(${use[0]}, ${use[1]}, ${use[2]}, 0.55)`);
      g.addColorStop(1, `rgba(${use[0]}, ${use[1]}, ${use[2]}, 0)`);
      sc.fillStyle = g;
      sc.fillRect(0, 0, 64, 64);
    }
    shadow = s;
  };

  const draw = () => {
    const c = cfg;
    const ctx = canvas.getContext("2d");
    if (!c || !ctx || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    const { floor, H, crown, foot } = measure();
    const n = clamp(Math.round(c.threads), 6, MAX_THREADS);
    const turns = clamp(c.turns, 1, 8);
    const spin = sim.spin;
    const squash = 0.22;

    // Every sample of every thread, projected once.
    for (let i = 0; i < n; i += 1) {
      const reach = thread.reach[i] ?? 1;
      const rs = thread.radius[i] ?? 1;
      const pace = thread.pace[i] ?? 1;
      const base = (i / n) * Math.PI * 2 + (thread.phase[i] ?? 0) * 0.35;
      for (let m = 0; m <= SAMPLES; m += 1) {
        const s = (m / SAMPLES) * reach;
        // The spine's offset at this height, between its two nearest nodes.
        const at = s * (NODES - 1);
        const k = Math.min(NODES - 2, Math.floor(at));
        const f = at - k;
        const sx = (nodeX[k] ?? 0) * (1 - f) + (nodeX[k + 1] ?? 0) * f;
        const r =
          (foot + (crown - foot) * Math.pow(s, 1.6)) *
          rs *
          (1 + 0.07 * Math.sin(s * 9 + sim.t * 1.7 + i));
        // Spinning faster low down, where the funnel is tight.
        const th =
          base - turns * Math.PI * 2 * s + spin * pace * (1.35 - 0.55 * s);
        const o = (i * (SAMPLES + 1) + m) * 3;
        pts[o] = sx + r * Math.cos(th);
        pts[o + 1] = floor - s * H + r * Math.sin(th) * squash;
        pts[o + 2] = Math.sin(th);
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const footX = nodeX[0] ?? w / 2;
    // The floor: a faint line and the pool of shade under the foot.
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = light;
    ctx.globalAlpha = dark ? 0.12 : 0.16;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, floor + 0.5);
    ctx.lineTo(w, floor + 0.5);
    ctx.stroke();
    if (shadow) {
      ctx.globalAlpha = dark ? 0.55 : 0.4;
      const sw = foot * 9 + crown * 0.25;
      ctx.drawImage(shadow, footX - sw, floor - sw * 0.18, sw * 2, sw * 0.36);
    }

    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    ctx.lineCap = "butt";
    ctx.strokeStyle = light;
    const density = Math.sqrt(Math.min(1, 24 / n));
    // Back half first, then front; within each, skirt to crown: six strokes.
    for (let front = 0; front < 2; front += 1) {
      for (let b = 0; b < BANDS; b += 1) {
        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
          const reach = thread.reach[i] ?? 1;
          for (let m = 0; m < SAMPLES; m += 1) {
            const s = (m / SAMPLES) * reach;
            const band = s < 0.3 ? 0 : s < 0.65 ? 1 : 2;
            if (band !== b) continue;
            const o = (i * (SAMPLES + 1) + m) * 3;
            const d = ((pts[o + 2] ?? 0) + (pts[o + 5] ?? 0)) / 2;
            if (d >= 0 !== (front === 1)) continue;
            ctx.moveTo(pts[o] ?? 0, pts[o + 1] ?? 0);
            ctx.lineTo(pts[o + 3] ?? 0, pts[o + 4] ?? 0);
          }
        }
        ctx.lineWidth = front ? 1.15 - b * 0.15 : 0.8;
        ctx.globalAlpha =
          (HEIGHT_ALPHA[b] ?? 0.4) *
          (front ? 1 : 0.38) *
          density *
          (dark ? 0.8 : 0.7);
        ctx.stroke();
      }
    }

    // Dust circling the skirt, and dust in flight.
    const dustAmt = clamp01(c.dust);
    ctx.fillStyle = light;
    ctx.beginPath();
    const skirtCount = Math.round(SKIRT * dustAmt);
    for (let p = 0; p < skirtCount; p += 1) {
      const a = (skirt[p * 4] ?? 0) + spin * (skirt[p * 4 + 3] ?? 1) * 1.6;
      const rr = foot * (skirt[p * 4 + 1] ?? 2);
      const yy = floor - (skirt[p * 4 + 2] ?? 0) * foot * 5;
      const x = (nodeX[0] ?? 0) + rr * Math.cos(a);
      const y = yy + rr * Math.sin(a) * squash;
      const sz = Math.sin(a) > 0 ? 1.3 : 0.9;
      ctx.rect(x - sz / 2, y - sz / 2, sz, sz);
    }
    ctx.globalAlpha = (dark ? 0.55 : 0.5) * (0.4 + 0.6 * dustAmt);
    ctx.fill();
    ctx.beginPath();
    let any = false;
    for (let p = 0; p < SPRAY; p += 1) {
      const life = spray[p * 8 + 6] ?? 0;
      if (life <= 0) continue;
      const x = spray[p * 8] ?? 0;
      const y = (spray[p * 8 + 1] ?? 0) + (spray[p * 8 + 2] ?? 0) * squash;
      const sz = 1 + 1.2 * (life / (spray[p * 8 + 7] || 1));
      ctx.rect(x - sz / 2, y - sz / 2, sz, sz);
      any = true;
    }
    if (any) {
      ctx.globalAlpha = dark ? 0.85 : 0.75;
      ctx.fill();
    }
    if (ring > 0) {
      ctx.globalAlpha = (ring / STILL_RING) * 0.7;
      ctx.beginPath();
      for (let p = 0; p < 36; p += 1) {
        const a = (p / 36) * Math.PI * 2;
        const rr = foot * 7;
        ctx.rect(
          footX + rr * Math.cos(a) - 0.8,
          floor + rr * Math.sin(a) * squash - 0.8,
          1.6,
          1.6,
        );
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  /** Advances the spin, the spine, the wander and the dust; says whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const spinning = c.motionSafe && !c.paused && c.speed > 0;
    if (spinning) {
      sim.spin += dt * clamp(c.speed, 0, 2) * 2.4;
      sim.t += dt;
      moving = true;
    }
    const target = footTarget();
    if (!c.motionSafe) {
      for (let k = 0; k < NODES; k += 1) {
        nodeX[k] = target;
        nodeV[k] = 0;
      }
    } else {
      const G = springs.glide;
      const lean = clamp01(c.lean);
      const base = 40 + 60 * (1 - lean);
      carry += dt;
      let steps = 0;
      while (carry >= STEP && steps < 10) {
        carry -= STEP;
        steps += 1;
        // The foot walks after its target on the glide spring.
        const a0 =
          (G.stiffness * (target - (nodeX[0] ?? 0)) -
            G.damping * (nodeV[0] ?? 0)) /
          G.mass;
        nodeV[0] = (nodeV[0] ?? 0) + a0 * STEP;
        nodeX[0] = (nodeX[0] ?? 0) + (nodeV[0] ?? 0) * STEP;
        // Each node chases the one below on its own underdamped spring,
        // softer toward the top: the crown trails, then whips past.
        for (let k = 1; k < NODES; k += 1) {
          const s = k / (NODES - 1);
          const om = base * (1 - 0.6 * lean * s);
          const ak =
            om * om * ((nodeX[k - 1] ?? 0) - (nodeX[k] ?? 0)) -
            2 * 0.55 * om * (nodeV[k] ?? 0);
          nodeV[k] = (nodeV[k] ?? 0) + ak * STEP;
          nodeX[k] = (nodeX[k] ?? 0) + (nodeV[k] ?? 0) * STEP;
        }
      }
      if (steps === 10) carry = 0;
      let still = true;
      for (let k = 0; k < NODES; k += 1) {
        if (
          Math.abs((nodeX[k] ?? 0) - target) > 0.05 ||
          Math.abs(nodeV[k] ?? 0) > 0.5
        ) {
          still = false;
          break;
        }
      }
      if (still) {
        for (let k = 0; k < NODES; k += 1) {
          nodeX[k] = target;
          nodeV[k] = 0;
        }
      } else moving = true;
    }
    for (let p = 0; p < SPRAY; p += 1) {
      const life = spray[p * 8 + 6] ?? 0;
      if (life <= 0) continue;
      moving = true;
      const drag = Math.exp(-1.4 * dt);
      spray[p * 8 + 3] = (spray[p * 8 + 3] ?? 0) * drag;
      spray[p * 8 + 4] = ((spray[p * 8 + 4] ?? 0) + 260 * dt) * drag;
      spray[p * 8 + 5] = (spray[p * 8 + 5] ?? 0) * drag;
      spray[p * 8] = (spray[p * 8] ?? 0) + (spray[p * 8 + 3] ?? 0) * dt;
      spray[p * 8 + 1] = Math.min(
        geo.floor,
        (spray[p * 8 + 1] ?? 0) + (spray[p * 8 + 4] ?? 0) * dt,
      );
      spray[p * 8 + 2] = (spray[p * 8 + 2] ?? 0) + (spray[p * 8 + 5] ?? 0) * dt;
      spray[p * 8 + 6] = life - dt;
    }
    if (ring > 0) {
      ring = Math.max(0, ring - dt);
      moving = true;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    const first = size.w === 0;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    if (first) {
      const x = homeX();
      nodeX.fill(x);
      nodeV.fill(0);
    }
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.seed !== next.seed) seedAll(next);
      if (!was) {
        paintColours();
        resize();
        return;
      }
      if (was.colourKey !== next.colourKey) paintColours();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (!next.interactive && sim.hand !== null) sim.hand = null;
      if (!next.motionSafe) step(0);
      draw();
      kick();
    },
    resize,
    readColours() {
      paintColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    handTo(x) {
      sim.hand = x;
      if (cfg && !cfg.motionSafe) step(0);
      draw();
      kick();
    },
    handAway() {
      const at = sim.hand;
      sim.hand = null;
      if (cfg && !cfg.motionSafe) step(0);
      draw();
      kick();
      if (at === null || size.w < 1) return null;
      const m = margin();
      return (
        ((clamp(at, m, size.w - m) - m) / Math.max(1, size.w - 2 * m)) * 100
      );
    },
    fling() {
      const c = cfg;
      if (!c) return;
      sim.flings += 1;
      if (!c.motionSafe) {
        ring = STILL_RING;
        draw();
        kick();
        return;
      }
      const rand = lcg(c.seed * 977 + sim.flings * 131);
      const { floor, foot } = geo;
      const count = Math.round(24 + 60 * clamp01(c.dust));
      const fx = nodeX[0] ?? size.w / 2;
      for (let q = 0; q < count; q += 1) {
        const p = sprayNext;
        sprayNext = (sprayNext + 1) % SPRAY;
        const a = rand() * Math.PI * 2;
        const rr = foot * (1.5 + rand() * 2.5);
        // Off the skirt along the spin, outward, and up.
        const tangent = 140 + rand() * 180;
        const out = 30 + rand() * 90;
        spray[p * 8] = fx + rr * Math.cos(a);
        spray[p * 8 + 1] = floor - rand() * foot * 4;
        spray[p * 8 + 2] = rr * Math.sin(a);
        spray[p * 8 + 3] = -Math.sin(a) * tangent + Math.cos(a) * out;
        spray[p * 8 + 4] = -(70 + rand() * 190);
        spray[p * 8 + 5] = Math.cos(a) * tangent + Math.sin(a) * out;
        const span = 1 + rand() * 0.8;
        spray[p * 8 + 6] = span;
        spray[p * 8 + 7] = span;
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A tall funnel of fine light threads spiralling up from a floor, tight at
 * the foot and loose at the crown, with dust circling its skirt. Each thread
 * winds round a spine of twenty nodes, spinning faster low down where the
 * funnel is tight, and is drawn in depth and height — dim behind, bright in
 * front, dense at the skirt and wispy at the crown — additively on a dark
 * page so the skirt glows, in ink on a light one.
 *
 * The foot walks after the pointer on springs.glide; every node above chases
 * the one below on its own underdamped spring, softer toward the top, so the
 * column bends as the foot moves and the crown whips past and settles when it
 * stops. Left alone it wanders round its spot. A click flings a spray of dust
 * off the skirt along the spin. It is a slider for where it stands: arrows
 * walk the foot and Enter flings dust. Under reduced motion it stands still
 * and straight, goes straight where it is put, and a fling shows as a still
 * ring of dust that fades.
 */
export function DustDevil({
  turns = 3.5,
  lean = 0.6,
  threadCount = 24,
  color = "oklch(from var(--warn) 0.8 0.09 h)",
  flare = 0.55,
  height = 0.82,
  speed = 1,
  dust = 0.6,
  wander = 0.5,
  step = 8,
  value,
  defaultValue = 50,
  onValueChange,
  interactive = true,
  disabled = false,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Move the whirlwind",
  onFling,
  className,
}: DustDevilProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [own, setOwn] = React.useState(() =>
    Math.round(clamp(defaultValue, 0, 100)),
  );
  const home = Math.round(clamp(value ?? own, 0, 100));
  const live = interactive && !disabled;
  const paints = React.useMemo(
    () =>
      [
        color,
        `color-mix(in oklab, ${color} 62%, black)`,
        "var(--background)",
      ] as const,
    [color],
  );
  const colourKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef({ onValueChange, onFling });
  const pressed = React.useRef<{ x: number; y: number } | null>(null);

  const config: Config = {
    turns,
    lean,
    threads: threadCount,
    flare,
    height,
    speed,
    dust,
    wander,
    home,
    interactive: live,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onValueChange, onFling };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createWhirl(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
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

  /** A new place from the hand or a key: held if uncontrolled, and reported. */
  const commit = (next: number) => {
    const v = Math.round(clamp(next, 0, 100));
    if (v === home) return;
    if (value === undefined) setOwn(v);
    report.current.onValueChange?.(v);
  };

  const local = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    return clientX - root.getBoundingClientRect().left - root.clientLeft;
  };

  const fling = () => {
    engine.current?.fling();
    report.current.onFling?.();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    engine.current?.handTo(local(event.clientX));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!live) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    engine.current?.handTo(local(event.clientX));
    pressed.current = { x: event.clientX, y: event.clientY };
  };

  const away = () => {
    const at = engine.current?.handAway();
    if (at !== null && at !== undefined) commit(at);
  };

  // A tap flings; a press that travels was a walk, and flings nothing.
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = pressed.current;
    pressed.current = null;
    if (
      live &&
      from &&
      Math.hypot(event.clientX - from.x, event.clientY - from.y) < 6
    )
      fling();
    if (event.pointerType === "touch") away();
  };

  const onPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    pressed.current = null;
    if (event.pointerType === "touch") away();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") away();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;
    const by = clamp(step, 1, 50);
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = home + by;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = home - by;
        break;
      case "PageUp":
        next = home + KEY_PAGE;
        break;
      case "PageDown":
        next = home - KEY_PAGE;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!event.repeat) fling();
        return;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      className={cn(
        // A sideways finger walks it; an upright swipe scrolls the page.
        "group/dust-devil relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/dust-devil:invisible group-data-live/dust-devil:opacity-0"
      >
        <StandIn color={color} at={home} />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <div
        role="slider"
        tabIndex={live ? 0 : -1}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={home}
        aria-valuetext={`Standing ${home} percent across`}
        aria-disabled={!live || undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          live ? "cursor-crosshair" : "cursor-default",
        )}
      />
      <p id={hintId} className="sr-only">
        Arrow keys walk the whirlwind across; Enter flings dust off its skirt.
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * funnel as rings stacked from a tight foot to a loose crown, in SVG laid out
 * in percentages of the box.
 */
function StandIn({ color, at }: { color: string; at: number }) {
  const x = clamp(at, 12, 88);
  const rings = [];
  for (let i = 0; i < 9; i += 1) {
    const s = i / 8;
    const cy = Number((90 - s * 72).toFixed(3));
    const rx = Number((1.8 + 25.7 * Math.pow(s, 1.6)).toFixed(3));
    rings.push(
      <ellipse
        key={i}
        cx={`${x}%`}
        cy={`${cy}%`}
        rx={`${rx}%`}
        ry={`${Number((rx * 0.14).toFixed(3))}%`}
        opacity={Number((0.75 - s * 0.45).toFixed(3))}
      />,
    );
  }
  return (
    <svg className="size-full" fill="none" stroke={color} strokeWidth={1}>
      <line x1="0%" y1="90%" x2="100%" y2="90%" opacity={0.15} />
      {rings}
    </svg>
  );
}
