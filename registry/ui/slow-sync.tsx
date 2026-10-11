"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SlowSyncProps = {
  /** Content above the field: a headline, a call to action. It stays fully interactive. */
  children?: React.ReactNode;
  /** How strongly a flash nudges its neighbours, 0 (they never agree) to 1 (they lock in seconds). @default 0.5 */
  coupling?: number;
  /** How many dots on a 720 × 208 field; other sizes keep the same density. 20 to 600. @default 220 */
  count?: number;
  /** The colour of the light, 0 (cool moon-white) to 0.5 (firefly green) to 1 (amber). @default 0.5 */
  warmth?: number;
  /** Any CSS colour for the light; overrides `warmth`. */
  color?: string;
  /** Mean time between one dot's blinks, s. @default 1.8 */
  period?: number;
  /** How different the dots' own rhythms are, 0 (all alike) to 1. More spread, more waves, slower agreement. @default 0.35 */
  spread?: number;
  /** How far a flash is felt, in dot spacings, 1 to 3. @default 1.6 */
  reach?: number;
  /** Size and strength of a flash's halo, 0 to 1. @default 0.6 */
  glow?: number;
  /** Dot radius at rest, px. @default 3 */
  dotSize?: number;
  /** Radius of a scatter, as a fraction of the field's width. @default 0.2 */
  patch?: number;
  /** A click on the field, or Enter, scatters a patch. @default true */
  interactive?: boolean;
  /** Fires when a patch is scattered, with its centre as fractions of the field. */
  onScatter?: (x: number, y: number) => void;
  /** How in step the field is, 0 (scattered) to 1 (one pulse), rounded to 2 dp, at most four times a second. */
  onSyncChange?: (sync: number) => void;
  /** Freeze the field. @default false */
  paused?: boolean;
  /** Seeds the layout, the rhythms and the starting phases. @default 7 */
  seed?: number;
  /** Accessible name. @default "Blinking field" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the field. @default "h-52 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const TAU = Math.PI * 2;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The field the `count` is quoted for; other boxes keep its density. */
const REF_AREA = 720 * 208;
/** A flash's light decays like a firefly's: an exponential, s. */
const FLASH_TAU = 0.42;
/** Just after a flash a dot cannot be pushed (fraction of its cycle). */
const REFRACTORY = 0.08;
/** Local pulse gain and global pull, both scaled by `coupling`. */
const PULSE_GAIN = 0.7;
const MEAN_GAIN = 0.1;
const SUBSTEP = 1 / 60;
/** How fast a scatter's ring opens, as a share of its radius per second. */
const RING_RATE = 4;

/** Light colours from a warmth: cool blue, firefly green, amber — one fixed lightness per page. */
function lightOf(warmth: number, onLight: boolean) {
  const w = clamp01(warmth);
  // On paper the firefly's yellow-green turns to mud, so the middle of the
  // range leans greener there; light glows, pigment has to read.
  const mid = onLight ? 142 : 112;
  const hue =
    w < 0.5 ? lerp(232, mid, w / 0.5) : lerp(mid, 62, (w - 0.5) / 0.5);
  const chroma =
    w < 0.5 ? lerp(0.07, 0.17, w / 0.5) : lerp(0.17, 0.16, (w - 0.5) / 0.5);
  return {
    L: onLight ? 0.7 : 0.9,
    C: chroma,
    h: hue,
  };
}

function oklchCss(c: { L: number; C: number; h: number }, alpha = 1) {
  return `oklch(${r2(c.L)} ${r2(c.C)} ${r2(c.h)}${alpha < 1 ? ` / ${r2(alpha)}` : ""})`;
}

type Config = {
  coupling: number;
  count: number;
  warmth: number;
  color: string | undefined;
  period: number;
  spread: number;
  reach: number;
  glow: number;
  dotSize: number;
  patch: number;
  paused: boolean;
  motionSafe: boolean;
  seed: number;
  dpr: number;
};

type Hooks = {
  sync: (r: number) => void;
  inStep: () => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  scatter: (x: number, y: number) => void;
  pointer: (x: number, y: number, on: boolean) => void;
  reticle: (x: number, y: number, on: boolean) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

type Ring = {
  x: number;
  y: number;
  r: number;
  v: number;
  R: number;
  age: number;
  live: boolean;
};

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  hooks: Hooks,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let drawnAt = 0;
  let scatters = 0;
  const size = { w: 0, h: 0, dpr: 1, spacing: 10 };

  let n = 0;
  let px = new Float32Array(0);
  let py = new Float32Array(0);
  let ph = new Float64Array(0);
  let rate = new Float32Array(0);
  let age = new Float32Array(0);
  let ox = new Float32Array(0);
  let oy = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let kickAt = new Float32Array(0);
  let kickV = new Float32Array(0);
  let order = new Float32Array(0);
  let shown = new Float32Array(0);
  let fired = new Uint8Array(0);
  let queue = new Int32Array(0);
  let nbStart = new Int32Array(1);
  let nbList = new Int32Array(0);
  let moving = 0;

  let sync = 0;
  let reported = -1;
  let reportIn = 0;
  let armed = true;
  let orderIn = 0;

  const rings: Ring[] = Array.from({ length: 4 }, () => ({
    x: 0,
    y: 0,
    r: 0,
    v: 0,
    R: 0,
    age: 0,
    live: false,
  }));
  const hover = { x: 0, y: 0, on: false, a: 0 };
  /** Where the latest scatter was centred: the push is away from it. */
  const burst = { x: 0, y: 0 };
  const mark = { x: 0.5, y: 0.5, on: false, a: 0 };

  const dot = document.createElement("canvas");
  const halo = document.createElement("canvas");
  let onLight = false;
  const tint = { core: "rgb(220, 240, 170)", ring: "rgba(220, 240, 170, 0.5)" };

  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readerCtx = reader.getContext("2d", { willReadFrequently: true });
  const rgbOf = (colour: string): [number, number, number] => {
    if (!readerCtx) return [200, 220, 160];
    readerCtx.clearRect(0, 0, 1, 1);
    readerCtx.fillStyle = "rgb(0, 0, 0)";
    readerCtx.fillStyle = colour;
    readerCtx.fillRect(0, 0, 1, 1);
    const d = readerCtx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };

  /** Two sprites, drawn once per colour and size: a soft dot and its halo. */
  const paintSprites = () => {
    const c = cfg;
    if (!c) return;
    const kids = carriers.children;
    const bg = kids[1] ? rgbOf(getComputedStyle(kids[1]).color) : [0, 0, 0];
    onLight =
      (0.2126 * (bg[0] ?? 0) + 0.7152 * (bg[1] ?? 0) + 0.0722 * (bg[2] ?? 0)) /
        255 >
      0.5;
    const light = c.color
      ? kids[0]
        ? rgbOf(getComputedStyle(kids[0]).color)
        : [220, 240, 170]
      : rgbOf(oklchCss(lightOf(c.warmth, onLight)));
    const [r, g, b] = light;
    const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${r2(a)})`;
    tint.core = rgba(1);
    tint.ring = rgba(onLight ? 0.55 : 0.45);
    const dpr = size.dpr;
    const rad = clamp(c.dotSize, 1, 10);
    const d = Math.ceil(rad * 2 * 2.2 * dpr);
    dot.width = d;
    dot.height = d;
    const dc = dot.getContext("2d");
    if (dc) {
      dc.clearRect(0, 0, d, d);
      const gr = dc.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
      // A hot centre on a dark page; a solid pigment dot on a light one.
      gr.addColorStop(0, onLight ? rgba(1) : "rgba(255, 255, 250, 1)");
      gr.addColorStop(0.28, rgba(1));
      gr.addColorStop(0.46, rgba(onLight ? 0.9 : 0.75));
      gr.addColorStop(1, rgba(0));
      dc.fillStyle = gr;
      dc.fillRect(0, 0, d, d);
    }
    const hd = Math.ceil(rad * 2 * (3 + 7 * clamp01(c.glow)) * dpr);
    halo.width = hd;
    halo.height = hd;
    const hc = halo.getContext("2d");
    if (hc) {
      hc.clearRect(0, 0, hd, hd);
      const gr = hc.createRadialGradient(
        hd / 2,
        hd / 2,
        0,
        hd / 2,
        hd / 2,
        hd / 2,
      );
      gr.addColorStop(0, rgba(onLight ? 0.32 : 0.55));
      gr.addColorStop(0.3, rgba(onLight ? 0.12 : 0.2));
      gr.addColorStop(1, rgba(0));
      hc.fillStyle = gr;
      hc.fillRect(0, 0, hd, hd);
    }
  };

  /** A seeded, jittered hex lattice at the asked density, and who hears whose flash. */
  const layout = (keep = false) => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const r = lcg(c.seed);
    const area = size.w * size.h;
    const want = clamp(
      Math.round(clamp(c.count, 20, 600) * (area / REF_AREA)),
      30,
      600,
    );
    const s = Math.sqrt((2 * area) / (Math.sqrt(3) * want));
    size.spacing = s;
    const margin = clamp(c.dotSize, 1, 10) * 1.6;
    const xs: number[] = [];
    const ys: number[] = [];
    const rows = Math.ceil(size.h / (s * 0.866)) + 1;
    const cols = Math.ceil(size.w / s) + 1;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const x = (i + (j % 2) * 0.5) * s + (r() - 0.5) * s * 0.34 + s * 0.25;
        const y = (j + 0.5) * s * 0.866 + (r() - 0.5) * s * 0.34;
        if (x < margin || x > size.w - margin) continue;
        if (y < margin || y > size.h - margin) continue;
        xs.push(x);
        ys.push(y);
      }
    }
    const kept = keep ? ph : new Float64Array(0);
    n = xs.length;
    px = Float32Array.from(xs);
    py = Float32Array.from(ys);
    ph = new Float64Array(n);
    rate = new Float32Array(n);
    age = new Float32Array(n);
    ox = new Float32Array(n);
    oy = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    kickAt = new Float32Array(n).fill(-1);
    kickV = new Float32Array(n);
    order = new Float32Array(n);
    shown = new Float32Array(n);
    fired = new Uint8Array(n);
    queue = new Int32Array(n);
    moving = 0;
    const period = clamp(c.period, 0.4, 8);
    const spread = clamp01(c.spread);
    for (let i = 0; i < n; i += 1) {
      const fresh = r();
      // A resize keeps the timing the field has already agreed on.
      ph[i] = i < kept.length ? (kept[i] ?? fresh) : fresh;
      rate[i] = 1 / (period * (1 + spread * 0.12 * (2 * r() - 1)));
      age[i] = 9;
    }
    // Neighbours through a spatial hash, stored flat: no per-frame lists.
    const reach = clamp(c.reach, 1, 3) * s;
    const cell = reach;
    const gw = Math.max(1, Math.ceil(size.w / cell));
    const gh = Math.max(1, Math.ceil(size.h / cell));
    const buckets: number[][] = Array.from({ length: gw * gh }, () => []);
    for (let i = 0; i < n; i += 1) {
      const bx = Math.min(gw - 1, Math.floor((px[i] ?? 0) / cell));
      const by = Math.min(gh - 1, Math.floor((py[i] ?? 0) / cell));
      buckets[by * gw + bx]?.push(i);
    }
    const starts: number[] = [0];
    const list: number[] = [];
    const r2max = reach * reach;
    for (let i = 0; i < n; i += 1) {
      const x = px[i] ?? 0;
      const y = py[i] ?? 0;
      const bx = Math.min(gw - 1, Math.floor(x / cell));
      const by = Math.min(gh - 1, Math.floor(y / cell));
      for (
        let yy = Math.max(0, by - 1);
        yy <= Math.min(gh - 1, by + 1);
        yy += 1
      ) {
        for (
          let xx = Math.max(0, bx - 1);
          xx <= Math.min(gw - 1, bx + 1);
          xx += 1
        ) {
          for (const j of buckets[yy * gw + xx] ?? []) {
            if (j === i) continue;
            const dx = (px[j] ?? 0) - x;
            const dy = (py[j] ?? 0) - y;
            if (dx * dx + dy * dy < r2max) list.push(j);
          }
        }
      }
      starts.push(list.length);
    }
    nbStart = Int32Array.from(starts);
    nbList = Int32Array.from(list);
    armed = true;
    reported = -1;
    updateOrder(true);
  };

  /** Each dot's agreement with its neighbours: what the still frame shows. */
  const updateOrder = (instant: boolean) => {
    for (let i = 0; i < n; i += 1) {
      let cx = Math.cos(TAU * (ph[i] ?? 0));
      let cy = Math.sin(TAU * (ph[i] ?? 0));
      const a = nbStart[i] ?? 0;
      const b = nbStart[i + 1] ?? 0;
      for (let k = a; k < b; k += 1) {
        const j = nbList[k] ?? 0;
        cx += Math.cos(TAU * (ph[j] ?? 0));
        cy += Math.sin(TAU * (ph[j] ?? 0));
      }
      const v = Math.hypot(cx, cy) / (b - a + 1);
      order[i] = v;
      if (instant) shown[i] = v;
    }
  };

  const simulate = (dt: number) => {
    const c = cfg;
    if (!c || n === 0) return;
    const k = clamp01(c.coupling);
    const eps = k * PULSE_GAIN;
    const pull = k * MEAN_GAIN;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < n; i += 1) {
      cx += Math.cos(TAU * (ph[i] ?? 0));
      cy += Math.sin(TAU * (ph[i] ?? 0));
    }
    sync = Math.hypot(cx, cy) / n;
    const psi = Math.atan2(cy, cx) / TAU;
    fired.fill(0);
    let q = 0;
    for (let i = 0; i < n; i += 1) {
      let p = (ph[i] ?? 0) + dt * (rate[i] ?? 0.5);
      // The weak mean-field pull: what finally dissolves the spiral cores
      // local nudges alone can keep turning for ever.
      p += ((pull * sync * Math.sin(TAU * (psi - p))) / TAU) * dt;
      ph[i] = p;
      age[i] = (age[i] ?? 0) + dt;
      if (p >= 1) queue[q++] = i;
    }
    // A flash can push a late neighbour over the edge: the chain is followed
    // in the same step, each dot flashing at most once.
    while (q > 0) {
      const i = queue[--q] ?? 0;
      if (fired[i]) continue;
      fired[i] = 1;
      const p = ph[i] ?? 0;
      ph[i] = p - Math.floor(p);
      age[i] = 0;
      const a = nbStart[i] ?? 0;
      const b = nbStart[i + 1] ?? 0;
      for (let s = a; s < b; s += 1) {
        const j = nbList[s] ?? 0;
        if (fired[j]) continue;
        const pj = ph[j] ?? 0;
        if (pj < REFRACTORY) continue;
        // Late in its cycle: advanced. Early: held back. Both toward the flasher.
        const next = pj - (eps * Math.sin(TAU * pj)) / TAU;
        ph[j] = next;
        if (next >= 1 && q < n) queue[q++] = j;
      }
    }
  };

  /** The scatter's push: each dot kicked as the ring reaches it, home on recoil. */
  const settleOffsets = (dt: number) => {
    if (moving === 0) return;
    const sp = springs.recoil;
    let still = 0;
    for (let i = 0; i < n; i += 1) {
      const at = kickAt[i] ?? -1;
      if (at >= 0 && clock >= at) {
        const dx = (px[i] ?? 0) - burst.x;
        const dy = (py[i] ?? 0) - burst.y;
        const d = Math.hypot(dx, dy) || 1;
        vx[i] = (vx[i] ?? 0) + ((kickV[i] ?? 0) * dx) / d;
        vy[i] = (vy[i] ?? 0) + ((kickV[i] ?? 0) * dy) / d;
        kickAt[i] = -1;
      }
      const x = ox[i] ?? 0;
      const y = oy[i] ?? 0;
      const u = vx[i] ?? 0;
      const v = vy[i] ?? 0;
      if (
        at < 0 &&
        Math.abs(x) + Math.abs(y) < 0.02 &&
        Math.abs(u) + Math.abs(v) < 0.5
      ) {
        ox[i] = 0;
        oy[i] = 0;
        vx[i] = 0;
        vy[i] = 0;
        still += 1;
        continue;
      }
      const ax = (-sp.stiffness * x - sp.damping * u) / sp.mass;
      const ay = (-sp.stiffness * y - sp.damping * v) / sp.mass;
      vx[i] = u + ax * dt;
      vy[i] = v + ay * dt;
      ox[i] = x + (vx[i] ?? 0) * dt;
      oy[i] = y + (vy[i] ?? 0) * dt;
    }
    if (still === n) moving = 0;
  };

  const ringsLive = () => {
    for (let i = 0; i < rings.length; i += 1) if (rings[i]?.live) return true;
    return false;
  };

  const stepRings = (dt: number) => {
    const sp = springs.snap;
    for (const ring of rings) {
      if (!ring.live) continue;
      ring.age += dt;
      // The ring opens on snap toward its radius: one overshoot past it.
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      for (let s = 0; s < steps; s += 1) {
        const a = (sp.stiffness * (1 - ring.r) - sp.damping * ring.v) / sp.mass;
        ring.v += a * h;
        ring.r += ring.v * h;
      }
      if (ring.age > 1.1) ring.live = false;
    }
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || size.w < 1) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const dw = dot.width / size.dpr;
    const hw = halo.width / size.dpr;
    const glow = clamp01(c.glow);
    const still = !c.motionSafe;
    // Halos first, added as light on a dark page; a soft wash on a light one.
    ctx.globalCompositeOperation = onLight ? "source-over" : "lighter";
    if (glow > 0) {
      for (let i = 0; i < n; i += 1) {
        const b = still ? 0 : Math.exp(-(age[i] ?? 9) / FLASH_TAU);
        if (b < 0.03) continue;
        const s = hw * (0.7 + 0.5 * b);
        ctx.globalAlpha = b * (onLight ? 0.9 : 1);
        ctx.drawImage(
          halo,
          (px[i] ?? 0) + (ox[i] ?? 0) - s / 2,
          (py[i] ?? 0) + (oy[i] ?? 0) - s / 2,
          s,
          s,
        );
      }
    }
    ctx.globalCompositeOperation = "source-over";
    for (let i = 0; i < n; i += 1) {
      let b: number;
      if (still) {
        // Reduced motion: no blinking — a steady light for how in step it is.
        b = clamp01(((shown[i] ?? 0) - 0.3) / 0.7) * 0.75;
      } else b = Math.exp(-(age[i] ?? 9) / FLASH_TAU);
      const s = dw * (1 + 0.38 * b);
      ctx.globalAlpha = (onLight ? 0.24 : 0.2) + (onLight ? 0.76 : 0.8) * b;
      ctx.drawImage(
        dot,
        (px[i] ?? 0) + (ox[i] ?? 0) - s / 2,
        (py[i] ?? 0) + (oy[i] ?? 0) - s / 2,
        s,
        s,
      );
    }
    ctx.globalAlpha = 1;
    // Rings: a scatter's, the pointer's reach and the keyboard's reticle.
    ctx.strokeStyle = tint.ring;
    ctx.lineWidth = 1;
    for (const ring of rings) {
      if (!ring.live) continue;
      const a = clamp01(1 - ring.age / 1.1);
      ctx.globalAlpha = a * a;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, Math.max(0, ring.r * ring.R), 0, TAU);
      ctx.stroke();
    }
    const R = clamp(c.patch, 0.04, 0.6) * size.w;
    if (hover.a > 0.01) {
      ctx.globalAlpha = hover.a * 0.35;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, R, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (mark.a > 0.01) {
      const mx = mark.x * size.w;
      const my = mark.y * size.h;
      ctx.globalAlpha = mark.a * 0.8;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(mx, my, R, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(mx - 5, my);
      ctx.lineTo(mx + 5, my);
      ctx.moveTo(mx, my - 5);
      ctx.lineTo(mx, my + 5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const report = (dt: number) => {
    reportIn -= dt;
    if (reportIn > 0) return;
    reportIn = 0.25;
    const r = Math.round(sync * 100) / 100;
    if (r !== reported) {
      reported = r;
      hooks.sync(r);
    }
    if (armed && sync > 0.95) {
      armed = false;
      hooks.inStep();
    } else if (sync < 0.8) armed = true;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!c.paused) {
      let left = dt;
      while (left > 1e-6) {
        const h = Math.min(SUBSTEP, left);
        simulate(h);
        clock += h;
        left -= h;
      }
      report(dt);
    }
    settleOffsets(dt);
    stepRings(dt);
    const ease = 1 - Math.exp(-dt / 0.12);
    hover.a += ((hover.on ? 1 : 0) - hover.a) * ease;
    mark.a += ((mark.on ? 1 : 0) - mark.a) * ease;
    if (c.motionSafe) draw();
    else {
      // Reduced motion: re-read the agreement every 600 ms and cross-fade to it.
      orderIn -= dt;
      if (orderIn <= 0) {
        orderIn = 0.6;
        updateOrder(false);
      }
      const k = 1 - Math.exp(-dt / 0.3);
      for (let i = 0; i < n; i += 1)
        shown[i] = (shown[i] ?? 0) + ((order[i] ?? 0) - (shown[i] ?? 0)) * k;
      if (now - drawnAt > 90) {
        drawnAt = now;
        draw();
      }
    }
    const busy =
      !c.paused ||
      moving > 0 ||
      ringsLive() ||
      Math.abs(hover.a - (hover.on ? 1 : 0)) > 0.01 ||
      Math.abs(mark.a - (mark.on ? 1 : 0)) > 0.01;
    if (busy) frame = window.requestAnimationFrame(tick);
    else {
      draw();
      last = 0;
    }
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const relayout = Math.abs(w - size.w) > 0.5 || Math.abs(h - size.h) > 0.5;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    paintSprites();
    if (relayout) layout(size.spacing > 0 && n > 0);
    draw();
    kick();
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
        resize();
        return;
      }
      if (
        was.warmth !== next.warmth ||
        was.color !== next.color ||
        was.glow !== next.glow ||
        was.dotSize !== next.dotSize
      )
        paintSprites();
      if (
        was.count !== next.count ||
        was.seed !== next.seed ||
        was.reach !== next.reach ||
        was.dotSize !== next.dotSize
      )
        layout();
      else if (was.period !== next.period || was.spread !== next.spread) {
        const r = lcg(next.seed * 31 + 5);
        const period = clamp(next.period, 0.4, 8);
        const spread = clamp01(next.spread);
        for (let i = 0; i < n; i += 1)
          rate[i] = 1 / (period * (1 + spread * 0.12 * (2 * r() - 1)));
      }
      if (was.dpr !== next.dpr) resize();
      if (was.motionSafe !== next.motionSafe) updateOrder(true);
      draw();
      kick();
    },
    scatter(x, y) {
      const c = cfg;
      if (!c || n === 0) return;
      scatters += 1;
      const r = lcg(c.seed * 97 + scatters * 13);
      const R = clamp(c.patch, 0.04, 0.6) * size.w;
      burst.x = x;
      burst.y = y;
      for (let i = 0; i < n; i += 1) {
        const d = Math.hypot((px[i] ?? 0) - x, (py[i] ?? 0) - y);
        if (d > R) continue;
        ph[i] = r();
        age[i] = 9;
        if (c.motionSafe) {
          kickAt[i] = clock + d / (R * RING_RATE);
          kickV[i] = 150 * (1 - d / R) + 20;
          moving = 1;
        }
      }
      if (c.motionSafe) {
        const ring = rings.find((g) => !g.live) ?? rings[0];
        if (ring) {
          ring.live = true;
          ring.x = x;
          ring.y = y;
          ring.R = R;
          ring.r = 0;
          ring.v = 0;
          ring.age = 0;
        }
      } else updateOrder(false);
      armed = true;
      draw();
      kick();
    },
    pointer(x, y, on) {
      hover.x = x;
      hover.y = y;
      hover.on = on;
      kick();
    },
    reticle(x, y, on) {
      mark.x = x;
      mark.y = y;
      mark.on = on;
      kick();
    },
    resize,
    readColours() {
      paintSprites();
      draw();
    },
    setVisible(on) {
      visible = on;
      if (on) kick();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

const INTERACTIVE =
  "a,button,input,select,textarea,summary,[role=button],[role=link],[tabindex]:not([tabindex='-1'])";

/**
 * A field of soft dots, each blinking on its own rhythm, that slowly falls
 * into step. Every dot is a pulse-coupled oscillator: when it flashes, its
 * neighbours are nudged — a late one advanced, an early one held back — so
 * patches agree first and waves of light sweep the field, and a weak pull
 * toward the field's mean dissolves the last whirling cores until it beats
 * as one. A flash blooms and fades like a firefly's light.
 *
 * Click the field (or press Enter) and the timing in a patch is scattered: a
 * ring opens on the snap spring, the dots it passes are pushed out and come
 * home on recoil, and the patch blinks out of step until its neighbours draw
 * it back in. Arrow keys move the patch when the field has focus. Under
 * reduced motion nothing blinks: each dot glows steadily by how in step it
 * is, so the field still visibly evens out.
 */
export function SlowSync({
  children,
  coupling = 0.5,
  count = 220,
  warmth = 0.5,
  color,
  period = 1.8,
  spread = 0.35,
  reach = 1.6,
  glow = 0.6,
  dotSize = 3,
  patch = 0.2,
  interactive = true,
  onScatter,
  onSyncChange,
  paused = false,
  seed = 7,
  label = "Blinking field",
  dpr = 2,
  className,
}: SlowSyncProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const mark = React.useRef({ x: 0.5, y: 0.5 });
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const handlers = React.useRef({ onScatter, onSyncChange });
  React.useEffect(() => {
    handlers.current = { onScatter, onSyncChange };
  });

  const config: Config = {
    coupling,
    count,
    warmth,
    color,
    period,
    spread,
    reach,
    glow,
    dotSize,
    patch,
    paused,
    motionSafe,
    seed,
    dpr,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, {
      sync: (r) => handlers.current.onSyncChange?.(r),
      inStep: () => setSaid((s) => ({ n: s.n + 1, text: "In step." })),
    });
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  const scatterAt = (x: number, y: number, w: number, h: number) => {
    engine.current?.scatter(x, y);
    setSaid((s) => ({ n: s.n + 1, text: "Patch scattered." }));
    handlers.current.onScatter?.(
      r2(clamp01(x / Math.max(1, w))),
      r2(clamp01(y / Math.max(1, h))),
    );
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || event.detail === 0) return;
    const hit = (event.target as Element | null)?.closest(INTERACTIVE);
    // The content's own controls keep their clicks.
    if (hit && hit !== event.currentTarget && event.currentTarget.contains(hit))
      return;
    const r = event.currentTarget.getBoundingClientRect();
    scatterAt(event.clientX - r.left, event.clientY - r.top, r.width, r.height);
  };

  const showMark = () =>
    engine.current?.reticle(mark.current.x, mark.current.y, true);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    const el = rootRef.current;
    if (!el) return;
    const m = mark.current;
    const move = (dx: number, dy: number) => {
      event.preventDefault();
      m.x = r2(clamp(m.x + dx, 0.04, 0.96));
      m.y = r2(clamp(m.y + dy, 0.08, 0.92));
      showMark();
    };
    switch (event.key) {
      case "ArrowLeft":
        move(-0.06, 0);
        break;
      case "ArrowRight":
        move(0.06, 0);
        break;
      case "ArrowUp":
        move(0, -0.14);
        break;
      case "ArrowDown":
        move(0, 0.14);
        break;
      case "Home":
        m.x = 0.5;
        m.y = 0.5;
        move(0, 0);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        showMark();
        scatterAt(
          m.x * el.clientWidth,
          m.y * el.clientHeight,
          el.clientWidth,
          el.clientHeight,
        );
        break;
      default:
        break;
    }
  };

  const light = lightOf(warmth, false);
  const tone = color ?? oklchCss(light);
  // The still: the lattice at rest as a dot pattern, the server's frame.
  const spacing = r2(
    Math.sqrt((2 * REF_AREA) / (Math.sqrt(3) * clamp(count, 20, 600))),
  );

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="blinking field"
      aria-label={label}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onFocus={(event) => {
        if (
          event.target === event.currentTarget &&
          event.currentTarget.matches(":focus-visible")
        )
          showMark();
      }}
      onBlur={(event) => {
        if (event.target === event.currentTarget)
          engine.current?.reticle(mark.current.x, mark.current.y, false);
      }}
      onPointerMove={(event) => {
        if (!interactive || event.pointerType !== "mouse") return;
        const r = event.currentTarget.getBoundingClientRect();
        engine.current?.pointer(
          event.clientX - r.left,
          event.clientY - r.top,
          true,
        );
      }}
      onPointerLeave={() => engine.current?.pointer(0, 0, false)}
      className={cn(
        "group/slow-sync relative isolate h-52 w-full overflow-clip rounded-3",
        interactive ? "cursor-crosshair" : "cursor-default",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {interactive ? (
        <span id={hintId} className="sr-only">
          Click or press Enter to scatter the timing in a patch; arrow keys move
          the patch.
        </span>
      ) : null}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/slow-sync:opacity-0"
        style={{
          backgroundImage: `radial-gradient(circle, color-mix(in oklab, ${tone} 45%, transparent) ${r2(dotSize * 0.7)}px, transparent ${r2(dotSize * 1.1)}px)`,
          backgroundSize: `${spacing}px ${r2(spacing * 0.866)}px`,
          backgroundPosition: `${r2(spacing / 4)}px ${r2(spacing * 0.433)}px`,
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/slow-sync:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[color ?? "transparent", "var(--background)"].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      {children ? (
        <div className="relative z-10 size-full">{children}</div>
      ) : null}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
