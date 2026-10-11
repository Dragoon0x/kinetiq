"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type SteamWordsDraught = "left" | "right";

export type SteamWordsProps = {
  /** The phrases the steam spells, in order, cycled. */
  phrases: string[];
  /** Controlled: index of the phrase in the air. */
  value?: number;
  /** Initial phrase when uncontrolled. @default 0 */
  defaultValue?: number;
  /** A new phrase began to rise: its index. Fires from the cycle and from a blow. */
  onValueChange?: (index: number) => void;
  /** How fast the steam lifts and the cycle turns, 0.5 to 2. @default 1 */
  rise?: number;
  /** How hard the draught shears the letters apart, 0 (they melt in place) to 1. @default 0.6 */
  shear?: number;
  /** How hot the cup is, 0 to 1: more steam, a quicker lift and a warmer tint. @default 0.6 */
  warmth?: number;
  /** Where the draught comes from. @default "left" */
  draught?: SteamWordsDraught;
  /** How long a phrase stays legible, ms at rise 1. @default 1600 */
  hold?: number;
  /** Height of the reading line, 0 (top) to 1 (foot). @default 0.42 */
  readingLine?: number;
  /** The steam and the letters' cool colour. @default "var(--ink-2)" */
  steamColor?: string;
  /** The warm tint the steam and letters take as `warmth` rises. @default an amber pigment from the warn token */
  warmColor?: string;
  /** The cup's glaze. @default a cream ceramic pigment */
  cupColor?: string;
  /** The letters' colour before the warm tint. @default "var(--foreground)" */
  color?: string;
  /** A hand across the steam breathes on it; a press on the cup or a sideways swipe blows. @default true */
  interactive?: boolean;
  /** Hold the current phrase where it is legible. @default false */
  paused?: boolean;
  /** The scene's accessible name. @default "Steam rising from a cup" */
  label?: string;
  /** The cup cannot be blown on. @default false */
  disabled?: boolean;
  className?: string;
};

const WARM = "oklch(from var(--warn) 0.78 0.13 h)";
/** Cream ceramic: a cup is pigment, the same cup in either theme. */
const GLAZE = "oklch(0.93 0.018 85)";
const COFFEE = "oklch(0.34 0.045 52)";
const CREMA = "oklch(0.58 0.08 62)";

/** Puff pool size: enough for a hot cup at double speed. */
const MAX_PUFFS = 96;
/** Seconds a letter takes to condense out of the steam, at rise 1. */
const RISE = 2;
/** Centre-out stagger of the letters leaving the cup. */
const LEAVE = 0.5;
/** Seconds a released letter takes to thin to nothing. */
const SHEAR_LIFE = 1.6;

const wrapIndex = (i: number, n: number) => ((Math.round(i) % n) + n) % n;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The house drift spring's step response (ζ = 1, critically damped), exact:
 * a letter condensing out of the steam arrives without overshoot, the way a
 * vapour settles rather than lands.
 */
const DRIFT = (() => {
  const { stiffness: k, damping: c, mass: m } = springs.drift;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (Math.abs(zeta - 1) < 1e-3) {
    return (t: number) => (t <= 0 ? 0 : 1 - Math.exp(-w0 * t) * (1 + w0 * t));
  }
  const wd = w0 * Math.sqrt(Math.abs(1 - zeta * zeta));
  return (t: number) =>
    t <= 0
      ? 0
      : 1 -
        Math.exp(-zeta * w0 * t) *
          (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
})();

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b1, 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (b + 0x632be5ab), 0xc2b2ae35) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

type Letter = {
  el: HTMLElement;
  ghosts: HTMLElement[];
  /** Natural centre, relative to the scene. */
  x: number;
  y: number;
  /** Windward order, 0..1, and centre-out distance, 0..1. */
  order: number;
  centre: number;
  phase: number;
};

type SlotState = {
  letters: Letter[];
  /** Cycle start in scene time (s); null while empty. */
  start: number | null;
  /** When the shear begins, scene time; set at start, brought forward by a blow. */
  shearAt: number;
  dir: 1 | -1;
  gust: number;
  /** The next phrase has been asked for. */
  handedOver: boolean;
};

type Live = {
  rise: number;
  shear: number;
  warmth: number;
  draught: SteamWordsDraught;
  hold: number;
  interactive: boolean;
  paused: boolean;
  motionSafe: boolean;
  phrases: number;
  next: (dir: 1 | -1 | null, to?: number) => void;
};

type Engine = {
  measure: (slot: number, startNow: boolean) => void;
  blow: (dir: 1 | -1, to?: number) => void;
  breathe: (x: number, y: number, vx: number) => void;
  recolour: () => void;
  kick: () => void;
  layout: () => void;
  dispose: () => void;
};

function rgbOf(colour: string): [number, number, number] {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [128, 128, 128];
  ctx.fillStyle = "rgb(0 0 0)";
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

/**
 * The frame loop: steam puffs on a canvas from a fixed pool, and the letters
 * of the two phrase slots written straight to their nodes. It runs only on
 * screen, in a visible page, unpaused and with motion allowed; scene time
 * stops with it, so nothing jumps when it resumes.
 */
function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  slotEls: [HTMLElement, HTMLElement],
  mouth: HTMLElement,
  carrier: HTMLElement,
  latest: { current: Live },
  current: { current: number },
): Engine | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const sprite = document.createElement("canvas");
  sprite.width = 64;
  sprite.height = 64;
  const sctx = sprite.getContext("2d");

  let w = 1;
  let h = 1;
  let dpr = 1;
  let mouthX = 0;
  let mouthY = 0;
  let mouthW = 40;
  let visible = false;
  let raf = 0;
  let wall = 0;
  let time = 0;
  let spawnDebt = 0;
  let disposed = false;
  let seq = 0;

  const breath = { x: 0, y: 0, vx: 0, at: -10 };

  const px = new Float32Array(MAX_PUFFS);
  const py = new Float32Array(MAX_PUFFS);
  const born = new Float32Array(MAX_PUFFS).fill(-100);
  const life = new Float32Array(MAX_PUFFS);
  const phase = new Float32Array(MAX_PUFFS);
  const size = new Float32Array(MAX_PUFFS);
  const lift = new Float32Array(MAX_PUFFS);
  const push = new Float32Array(MAX_PUFFS);

  const slots: [SlotState, SlotState] = [
    {
      letters: [],
      start: null,
      shearAt: Infinity,
      dir: 1,
      gust: 1,
      handedOver: false,
    },
    {
      letters: [],
      start: null,
      shearAt: Infinity,
      dir: 1,
      gust: 1,
      handedOver: false,
    },
  ];

  const recolour = () => {
    if (!sctx) return;
    const cs = getComputedStyle(carrier);
    const cool = rgbOf(cs.color);
    const warm = rgbOf(cs.borderTopColor);
    const k = clamp(latest.current.warmth, 0, 1) * 0.35;
    const c = cool.map((v, i) => Math.round(v + ((warm[i] ?? v) - v) * k));
    const g = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgb(${c[0]} ${c[1]} ${c[2]} / 1)`);
    g.addColorStop(0.45, `rgb(${c[0]} ${c[1]} ${c[2]} / 0.55)`);
    g.addColorStop(1, `rgb(${c[0]} ${c[1]} ${c[2]} / 0)`);
    sctx.clearRect(0, 0, 64, 64);
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, 64, 64);
  };

  const layout = () => {
    const box = root.getBoundingClientRect();
    w = Math.max(1, box.width);
    h = Math.max(1, box.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const m = mouth.getBoundingClientRect();
    mouthX = m.left - box.left + m.width / 2;
    mouthY = m.top - box.top + m.height * 0.4;
    mouthW = Math.max(12, m.width);
    measure(0, false);
    measure(1, false);
    recolour();
    paint();
  };

  /** Each letter's resting centre, so every transform is an offset from it. */
  const measure = (slot: number, startNow: boolean) => {
    const el = slotEls[slot as 0 | 1];
    const state = slots[slot as 0 | 1];
    const box = root.getBoundingClientRect();
    const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-letter]"));
    // Clear transforms while measuring so the rest positions are true.
    const saved = nodes.map((n) => n.style.transform);
    for (const n of nodes) n.style.transform = "none";
    const raw = nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return {
        n,
        x: r.left - box.left + r.width / 2,
        y: r.top - box.top + r.height / 2,
      };
    });
    nodes.forEach((n, i) => (n.style.transform = saved[i] ?? ""));
    const left = Math.min(...raw.map((r) => r.x), w);
    const right = Math.max(...raw.map((r) => r.x), 0);
    const span = Math.max(1, right - left);
    const mid = (left + right) / 2;
    seq += 1;
    state.letters = raw.map((r, i) => ({
      el: r.n,
      ghosts: Array.from(r.n.querySelectorAll<HTMLElement>("[data-ghost]")),
      x: r.x,
      y: r.y,
      order: (r.x - left) / span,
      centre: Math.abs(r.x - mid) / (span / 2),
      phase: hash(i, seq) * Math.PI * 2,
    }));
    if (startNow) {
      const live = latest.current;
      state.start = time;
      state.dir = live.draught === "left" ? 1 : -1;
      state.gust = 1;
      state.handedOver = false;
      state.shearAt =
        time +
        (LEAVE + RISE * 0.85 + live.hold / 1000) / clamp(live.rise, 0.5, 2);
      // A letter still invisible before the first frame lands.
      write(slot, state);
      kick();
    }
  };

  const write = (slot: number, state: SlotState) => {
    const live = latest.current;
    const speed = clamp(live.rise, 0.5, 2);
    const shear = clamp(live.shear, 0, 1);
    const still = !live.motionSafe;
    const shown = slot === current.current;
    for (const L of state.letters) {
      if (still || state.start === null) {
        L.el.style.transform = "";
        L.el.style.filter = "";
        // Still: the slot's own opacity cross-fades it. An idle slot in
        // motion stays hidden unless it holds the phrase in the air.
        L.el.style.opacity = still || shown ? "" : "0";
        for (const g of L.ghosts) g.style.opacity = "0";
        continue;
      }
      const t = (time - state.start) * speed;
      const leave = L.centre * LEAVE;
      // Rise: out of the cup mouth, bunched over it, tall, thin and soft,
      // condensing on the drift spring as it opens out to its place.
      const u = DRIFT((t - leave) * 0.45);
      const drop = mouthY - L.y;
      const sway = Math.sin(t * 2.6 + L.phase) * (1 - u) * 7;
      let x = (1 - u) * (mouthX - L.x) * 0.78 + sway;
      let y = (1 - u) * drop - Math.max(0, t - leave - RISE) * 3;
      let sx = 1 - (1 - u) * 0.55;
      let sy = 1 + (1 - u) * 1.2;
      let skew = 0;
      let blur = (1 - u) * 6;
      let alpha = clamp(u * 1.7, 0, 1);
      let gx = 0;
      let gy = 0;
      let ghostAlpha = (1 - u) * 0.4;
      // Shear: released from the windward end, carried by a gust that grows
      // with the square of the time since release, skewed by height, thinned
      // and split into wisps.
      const release =
        state.shearAt +
        ((state.dir > 0 ? L.order : 1 - L.order) * 0.55) / speed;
      if (time > release) {
        const s = (time - release) * speed;
        const k = shear * state.gust;
        const carry = state.dir * (k * 64 * s * s + s * 6);
        x += carry;
        y -= s * 20 + s * s * 7;
        skew = -state.dir * k * Math.min(1, s / 0.7) * 26;
        sy *= 1 + s * 0.45 * (0.4 + k);
        sx *= 1 - Math.min(0.45, s * 0.28);
        blur += s * 5;
        alpha *= clamp(1 - s / (SHEAR_LIFE * (0.75 + 0.25 * (1 - k))), 0, 1);
        gx = carry * 0.4 + state.dir * s * 10;
        gy = -s * 10;
        ghostAlpha = alpha * 0.55;
      }
      // The visitor's breath leans nearby letters away from the hand.
      const bt = time - breath.at;
      if (bt < 1.2) {
        const d = Math.hypot(L.x + x - breath.x, L.y + y - breath.y);
        const f = Math.max(0, 1 - d / 120) * Math.exp(-bt * 2.5);
        x += clamp(breath.vx, -900, 900) * 0.03 * f;
        skew -= clamp(breath.vx, -900, 900) * 0.01 * f;
      }
      L.el.style.opacity = String(r2(alpha));
      L.el.style.transform = `translate3d(${r2(x)}px, ${r2(y)}px, 0) skewX(${r2(skew)}deg) scale(${r2(sx)}, ${r2(sy)})`;
      L.el.style.filter = blur > 0.05 ? `blur(${r2(blur)}px)` : "";
      L.ghosts.forEach((g, i) => {
        const m = i + 1;
        const a = ghostAlpha / m;
        g.style.opacity = String(r2(a));
        if (a < 0.01) return;
        g.style.transform = `translate3d(${r2(gx * m)}px, ${r2(gy * m + (1 - u) * 14 * m)}px, 0) scale(${r2(1 + m * 0.08)}, ${r2(1 + m * 0.3)})`;
        g.style.filter = `blur(${r2(2 + m * 2.5)}px)`;
      });
    }
  };

  /** How fast a puff ages: the cycle's speed, and a hotter cup lifts quicker. */
  const pace = () => {
    const live = latest.current;
    return clamp(live.rise, 0.5, 2) * (0.8 + clamp(live.warmth, 0, 1) * 0.4);
  };

  const spawn = (now: number) => {
    let slot = -1;
    let oldest = Infinity;
    const k = pace();
    for (let i = 0; i < MAX_PUFFS; i += 1) {
      const age = (now - (born[i] ?? 0)) * k;
      if (age > (life[i] ?? 0)) {
        slot = i;
        break;
      }
      if ((born[i] ?? 0) < oldest) {
        oldest = born[i] ?? 0;
        slot = i;
      }
    }
    if (slot < 0) return;
    const r1 = hash(slot, Math.floor(now * 1000));
    const r3 = hash(Math.floor(now * 1000), slot + 11);
    px[slot] = mouthX + (r1 - 0.5) * mouthW * 0.55;
    py[slot] = mouthY;
    born[slot] = now;
    life[slot] = 2.6 + r3 * 1.4;
    phase[slot] = r1 * Math.PI * 2;
    size[slot] = mouthW * (0.22 + r3 * 0.16);
    lift[slot] = 26 + r1 * 14;
    push[slot] = 0;
  };

  const paint = () => {
    const live = latest.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const warm = clamp(live.warmth, 0, 1);
    const k = pace();
    const shear = clamp(live.shear, 0, 1);
    const dirSlot = slots[current.current as 0 | 1];
    const dir = dirSlot.dir;
    const base = 0.05 + warm * 0.08;
    for (let i = 0; i < MAX_PUFFS; i += 1) {
      const a = (time - (born[i] ?? 0)) * k;
      const L = life[i] ?? 0;
      if (a < 0 || a > L) continue;
      const x0 = px[i] ?? 0;
      const ph = phase[i] ?? 0;
      const y = (py[i] ?? 0) - (lift[i] ?? 30) * a - 7 * a * a;
      const height = clamp((mouthY - y) / Math.max(1, h), 0, 1);
      const wind = dir * shear * Math.max(0, height - 0.3) * a * 70;
      const x =
        x0 + Math.sin(a * 1.4 + ph) * (4 + 7 * a) + wind + (push[i] ?? 0);
      const s = (size[i] ?? 10) * (1 + a * 0.9);
      const env = Math.min(1, a / 0.45) * Math.pow(Math.max(0, 1 - a / L), 1.4);
      const alpha = base * env;
      if (alpha < 0.003) continue;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - s * 0.36, y - s * 0.7, s * 0.72, s * 1.4);
    }
    ctx.globalAlpha = 1;
  };

  const frame = (now: number) => {
    raf = 0;
    const live = latest.current;
    if (disposed || !visible || document.hidden) return;
    if (live.paused || !live.motionSafe) return;
    const dt = Math.min(0.05, Math.max(0, (now - wall) / 1000));
    wall = now;
    time += dt;
    // Steam: a hotter cup puffs more, and faster.
    const speed = clamp(live.rise, 0.5, 2);
    spawnDebt += dt * (5 + clamp(live.warmth, 0, 1) * 13) * speed;
    while (spawnDebt >= 1) {
      spawn(time - (spawnDebt - 1) / 10);
      spawnDebt -= 1;
    }
    // A breath pushes nearby puffs along the hand.
    const bt = time - breath.at;
    if (bt < 1.2) {
      const decay = Math.exp(-bt * 2.5);
      const k = pace();
      for (let i = 0; i < MAX_PUFFS; i += 1) {
        const a = (time - (born[i] ?? 0)) * k;
        if (a < 0 || a > (life[i] ?? 0)) continue;
        const y = (py[i] ?? 0) - (lift[i] ?? 30) * a - 7 * a * a;
        const d = Math.hypot(
          (px[i] ?? 0) + (push[i] ?? 0) - breath.x,
          y - breath.y,
        );
        if (d > 110) continue;
        push[i] =
          (push[i] ?? 0) +
          clamp(breath.vx, -900, 900) * dt * 0.5 * (1 - d / 110) * decay;
      }
    }
    // The cycle: a slot past its shear hands over to the other slot.
    const cur = current.current as 0 | 1;
    const active = slots[cur];
    if (
      active.start !== null &&
      !active.handedOver &&
      time > active.shearAt + 0.3 / speed
    ) {
      active.handedOver = true;
      live.next(null);
    }
    write(0, slots[0]);
    write(1, slots[1]);
    paint();
    raf = window.requestAnimationFrame(frame);
  };

  const kick = () => {
    const live = latest.current;
    if (disposed || raf || !visible || document.hidden) return;
    if (live.paused || !live.motionSafe) return;
    wall = performance.now();
    raf = window.requestAnimationFrame(frame);
  };

  /** A column already steaming: puffs placed at seeded ages along their lives. */
  const seedColumn = (count: number) => {
    for (let i = 0; i < MAX_PUFFS; i += 1) {
      const r1 = hash(i, 3);
      const r3 = hash(5, i);
      px[i] = mouthX + (r1 - 0.5) * mouthW * 0.55;
      py[i] = mouthY;
      life[i] = 2.6 + r3 * 1.4;
      born[i] = i < count ? time - (i / count) * (life[i] ?? 3) : -100;
      phase[i] = r1 * Math.PI * 2;
      size[i] = mouthW * (0.22 + r3 * 0.16);
      lift[i] = 26 + r1 * 14;
      push[i] = 0;
    }
  };

  /** A still frame for reduced motion or a paused cup. */
  const still = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
    if (!latest.current.motionSafe) seedColumn(24);
    write(0, slots[0]);
    write(1, slots[1]);
    paint();
  };

  const io = new IntersectionObserver((entries) => {
    const entry = entries[entries.length - 1];
    visible = Boolean(entry?.isIntersecting);
    if (visible) kick();
  });
  io.observe(root);
  let pending = 0;
  const ro = new ResizeObserver(() => {
    if (pending) return;
    pending = window.requestAnimationFrame(() => {
      pending = 0;
      layout();
    });
  });
  ro.observe(root);
  const onVisibility = () => {
    if (!document.hidden) kick();
  };
  document.addEventListener("visibilitychange", onVisibility);

  layout();
  seedColumn(Math.round(14 + clamp(latest.current.warmth, 0, 1) * 30));
  // The first phrase is already legible in the server's frame: its cycle
  // begins at the hold, so it reads at once and then drifts apart.
  const first = slots[current.current as 0 | 1];
  first.start = time - (LEAVE + RISE) / clamp(latest.current.rise, 0.5, 2);
  first.shearAt =
    time + latest.current.hold / 1000 / clamp(latest.current.rise, 0.5, 2);
  first.dir = latest.current.draught === "left" ? 1 : -1;
  if (!latest.current.motionSafe || latest.current.paused) still();

  return {
    measure,
    blow: (dir, to) => {
      const state = slots[current.current as 0 | 1];
      if (state.start === null) return;
      state.dir = dir;
      state.gust = 1.35;
      if (state.shearAt > time) state.shearAt = time;
      if (!state.handedOver) {
        state.handedOver = true;
        latest.current.next(dir, to);
      }
      kick();
    },
    breathe: (x, y, vx) => {
      breath.x = x;
      breath.y = y;
      breath.vx = breath.vx * 0.6 + vx * 0.4;
      breath.at = time;
      kick();
    },
    recolour: () => {
      recolour();
      if (!raf) paint();
    },
    kick: () => {
      const live = latest.current;
      if (!live.motionSafe || live.paused) {
        // Paused mid-cycle: the phrase in the air settles legible.
        const state = slots[current.current as 0 | 1];
        if (live.paused && live.motionSafe && state.start !== null) {
          const speed = clamp(live.rise, 0.5, 2);
          state.start = time - (LEAVE + RISE) / speed;
          state.shearAt = Infinity;
          state.handedOver = false;
          const other = slots[(1 - current.current) as 0 | 1];
          other.start = null;
          for (const L of other.letters) L.el.style.opacity = "0";
        }
        still();
        return;
      }
      const state = slots[current.current as 0 | 1];
      if (state.shearAt === Infinity) {
        state.shearAt =
          time +
          latest.current.hold / 1000 / clamp(latest.current.rise, 0.5, 2);
      }
      kick();
    },
    layout,
    dispose: () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      if (pending) window.cancelAnimationFrame(pending);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

/** One phrase, a letter to a node, words kept whole across lines. */
function Phrase({ text, show }: { text: string; show: boolean }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, wi) => (
        <React.Fragment key={wi}>
          {wi > 0 ? " " : null}
          <span className="inline-block whitespace-nowrap">
            {Array.from(word).map((ch, ci) => (
              <span
                key={ci}
                data-letter=""
                className="relative inline-block will-change-transform"
                style={show ? undefined : { opacity: 0 }}
              >
                {ch}
                <span
                  data-ghost=""
                  className="absolute inset-0 opacity-0"
                  aria-hidden
                >
                  {ch}
                </span>
                <span
                  data-ghost=""
                  className="absolute inset-0 opacity-0"
                  aria-hidden
                >
                  {ch}
                </span>
              </span>
            ))}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * A cup at the foot of the frame and a column of steam lifting off it, out
 * of which a phrase condenses. Each letter leaves the cup as a tall, thin,
 * blurred wisp bunched over the coffee and climbs to the reading line,
 * opening out to its place and sharpening on the house drift spring (exact,
 * critically damped: vapour settles, it never lands); the centre letters go
 * first, as steam rises from the middle of a cup. The phrase holds, legible,
 * then the draught shears it apart from the windward end: each letter is
 * carried off by a gust that grows with the square of its time released,
 * skews with height, stretches, and splits into wisps that thin to nothing,
 * while the next phrase is already rising.
 *
 * The steam is a pool of soft puffs on a canvas, more and quicker the warmer
 * the cup; a hand moving across it breathes it aside. The cup is a real
 * button: pressing it, Space or Enter blows the phrase away and brings the
 * next, Left and Right blow it toward that side, and a sideways swipe across
 * the steam does the same. Under reduced motion one phrase stands still and
 * legible over a drawn wisp, and a blow cross-fades to the next.
 */
export function SteamWords({
  phrases,
  value,
  defaultValue = 0,
  onValueChange,
  rise = 1,
  shear = 0.6,
  warmth = 0.6,
  draught = "left",
  hold = 1600,
  readingLine = 0.42,
  steamColor = "var(--ink-2)",
  warmColor = WARM,
  cupColor = GLAZE,
  color = "var(--foreground)",
  interactive = true,
  paused = false,
  label = "Steam rising from a cup",
  disabled = false,
  className,
}: SteamWordsProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const count = Math.max(1, phrases.length);

  const [own, setOwn] = React.useState(() => wrapIndex(defaultValue, count));
  const index = value !== undefined ? wrapIndex(value, count) : own;

  /** Which phrase each of the two slots holds, and which slot is current. */
  const [slots, setSlots] = React.useState(() => ({
    phrase: [index, -1] as [number, number],
    current: 0,
    seq: 0,
    startNow: false,
  }));
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const slotA = React.useRef<HTMLDivElement | null>(null);
  const slotB = React.useRef<HTMLDivElement | null>(null);
  const mouthRef = React.useRef<SVGEllipseElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const currentSlot = React.useRef(0);

  /** Hand the air to the next phrase: from the cycle, or from a blow. */
  const next = React.useCallback(
    (dir: 1 | -1 | null, to?: number) => {
      const target =
        to !== undefined
          ? wrapIndex(to, count)
          : wrapIndex(
              (value !== undefined ? wrapIndex(value, count) : own) + 1,
              count,
            );
      if (value === undefined) setOwn(target);
      setSlots((s) => {
        const slot = 1 - s.current;
        const phrase: [number, number] = [...s.phrase];
        phrase[slot] = target;
        return { phrase, current: slot, seq: s.seq + 1, startNow: true };
      });
      onValueChange?.(target);
      if (dir !== null) {
        setSaid((s) => ({
          n: s.n + 1,
          text: `Now: ${phrases[target] ?? ""}`,
        }));
      }
    },
    [value, own, count, onValueChange, phrases],
  );

  const latest = React.useRef<Live>({
    rise,
    shear,
    warmth,
    draught,
    hold,
    interactive,
    paused,
    motionSafe,
    phrases: count,
    next,
  });
  React.useEffect(() => {
    latest.current = {
      rise,
      shear,
      warmth,
      draught,
      hold,
      interactive,
      paused,
      motionSafe,
      phrases: count,
      next,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const a = slotA.current;
    const b = slotB.current;
    const mouth = mouthRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !a || !b || !mouth || !carrier) return;
    const made = createEngine(
      root,
      canvas,
      [a, b],
      mouth as unknown as HTMLElement,
      carrier,
      latest,
      currentSlot,
    );
    engine.current = made;
    return () => {
      made?.dispose();
      engine.current = null;
    };
  }, []);

  // A slot was handed a new phrase: measure it and start its rise.
  React.useLayoutEffect(() => {
    currentSlot.current = slots.current;
    engine.current?.measure(slots.current, slots.startNow);
    if (!latest.current.motionSafe) engine.current?.kick();
  }, [slots]);

  // A host that moves `value` itself gets the same hand-over a blow gives.
  const shownIndex = slots.phrase[slots.current] ?? 0;
  React.useEffect(() => {
    if (value === undefined) return;
    const v = wrapIndex(value, count);
    if (v === shownIndex) return;
    const made = engine.current;
    if (made && motionSafe && !paused) {
      made.blow(draught === "left" ? 1 : -1, v);
    } else {
      // No air to blow through: hand over on the next frame, as a swap.
      const id = window.requestAnimationFrame(() => next(null, v));
      return () => window.cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  React.useEffect(() => {
    engine.current?.recolour();
  }, [warmth, steamColor, warmColor]);

  React.useEffect(() => {
    engine.current?.kick();
  }, [paused, motionSafe, rise, shear, hold]);

  const blow = (dir: 1 | -1) => {
    if (disabled || !interactive) return;
    if (!motionSafe || paused) {
      next(dir);
      return;
    }
    engine.current?.blow(dir);
  };

  const swipe = useDrag({
    axis: "x",
    threshold: 8,
    disabled: disabled || !interactive,
    onMove: ({ point, delta }) => {
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      engine.current?.breathe(
        point.x - box.left,
        point.y - box.top,
        delta.x * 60,
      );
    },
    onEnd: ({ offset, velocity }) => {
      if (Math.abs(offset.x) > 60 || Math.abs(velocity.x) > 500) {
        blow(offset.x > 0 ? 1 : -1);
      }
    },
  });

  const lastMove = React.useRef({ x: 0, t: 0 });
  const letterColor = `color-mix(in oklab, ${color} ${Math.round(100 - clamp(warmth, 0, 1) * 40)}%, ${warmColor})`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className={cn(
        "group/steam-words relative isolate overflow-clip select-none",
        interactive && !disabled ? "touch-pan-y" : undefined,
        className,
      )}
      onPointerDown={swipe.onPointerDown}
      onPointerMove={(event) => {
        swipe.onPointerMove(event);
        if (!interactive || disabled || event.pointerType === "touch") return;
        const box = rootRef.current?.getBoundingClientRect();
        if (!box) return;
        const t = event.timeStamp;
        const dt = Math.max(8, t - lastMove.current.t);
        const vx = ((event.clientX - lastMove.current.x) / dt) * 1000;
        lastMove.current = { x: event.clientX, t };
        if (Math.abs(vx) < 4000) {
          engine.current?.breathe(
            event.clientX - box.left,
            event.clientY - box.top,
            vx,
          );
        }
      }}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerCancel}
      onLostPointerCapture={swipe.onLostPointerCapture}
    >
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.recolour()}
        className="pointer-events-none absolute top-0 left-0 size-px border-t opacity-0 transition-colors duration-1"
        style={{ color: steamColor, borderTopColor: warmColor }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {[0, 1].map((slot) => {
        const phrase = slots.phrase[slot] ?? -1;
        const text = phrase >= 0 ? (phrases[phrase] ?? "") : "";
        const isCurrent = slot === slots.current;
        return (
          <div
            key={slot}
            ref={slot === 0 ? slotA : slotB}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-x-0 -translate-y-1/2 px-4 text-center leading-[1.15] font-medium tracking-tight text-balance",
              !motionSafe && "transition-opacity",
              !motionSafe && (isCurrent ? "duration-240" : "duration-150"),
            )}
            style={{
              top: `${r2(clamp(readingLine, 0.1, 0.8) * 100)}%`,
              color: letterColor,
              opacity: !motionSafe && !isCurrent ? 0 : undefined,
            }}
          >
            <Phrase
              key={`${slot}-${phrase}-${slots.seq}`}
              text={text}
              show={isCurrent && slots.seq === 0}
            />
          </div>
        );
      })}
      <button
        type="button"
        disabled={disabled || !interactive}
        aria-label="Blow across the cup"
        aria-describedby={hintId}
        onClick={() => blow(draught === "left" ? 1 : -1)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            blow(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            blow(1);
          }
        }}
        className={cn(
          "absolute bottom-[4%] left-1/2 w-[min(9.5rem,46%)] -translate-x-1/2 cursor-pointer rounded-3 outline-none",
          "transition-transform duration-150 active:translate-y-px",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-default",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 160 104"
          className="block h-auto w-full overflow-visible"
        >
          <defs>
            <radialGradient id={`${hintId}-glow`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor={warmColor} stopOpacity="0.9" />
              <stop offset="1" stopColor={warmColor} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${hintId}-glaze`} x1="0" x2="1" y1="0" y2="0">
              <stop
                offset="0"
                stopColor={`color-mix(in oklab, ${cupColor} 86%, black)`}
              />
              <stop offset="0.35" stopColor={cupColor} />
              <stop
                offset="0.7"
                stopColor={`color-mix(in oklab, ${cupColor} 94%, white)`}
              />
              <stop
                offset="1"
                stopColor={`color-mix(in oklab, ${cupColor} 80%, black)`}
              />
            </linearGradient>
          </defs>
          {/* Saucer. */}
          <ellipse
            cx="80"
            cy="93"
            rx="72"
            ry="9"
            className="fill-[color-mix(in_oklab,var(--foreground)_10%,transparent)]"
          />
          <ellipse
            cx="80"
            cy="90"
            rx="70"
            ry="10"
            fill={`url(#${hintId}-glaze)`}
            className="stroke-hairline-strong"
            strokeWidth="1"
          />
          <ellipse
            cx="80"
            cy="88"
            rx="36"
            ry="4.5"
            className="fill-[color-mix(in_oklab,var(--foreground)_8%,transparent)]"
          />
          {/* Handle. */}
          <path
            d="M 121 40 C 146 38 148 70 118 72"
            fill="none"
            stroke={`color-mix(in oklab, ${cupColor} 88%, black)`}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M 121 40 C 146 38 148 70 118 72"
            fill="none"
            className="stroke-hairline-strong"
            strokeWidth="1"
          />
          {/* Body. */}
          <path
            d="M 34 30 L 126 30 C 126 62 112 86 80 86 C 48 86 34 62 34 30 Z"
            fill={`url(#${hintId}-glaze)`}
            className="stroke-hairline-strong"
            strokeWidth="1"
          />
          {/* Mouth: rim, coffee, crema and the heat glow. */}
          <ellipse
            cx="80"
            cy="30"
            rx="46"
            ry="7.5"
            fill={`color-mix(in oklab, ${cupColor} 90%, black)`}
            className="stroke-hairline-strong"
            strokeWidth="1"
          />
          <ellipse
            ref={mouthRef}
            cx="80"
            cy="31"
            rx="41"
            ry="5.6"
            fill={COFFEE}
          />
          <ellipse
            cx="80"
            cy="31"
            rx="41"
            ry="5.6"
            fill="none"
            stroke={CREMA}
            strokeWidth="1.4"
            opacity="0.7"
          />
          <ellipse
            cx="80"
            cy="28"
            rx="40"
            ry="9"
            fill={`url(#${hintId}-glow)`}
            opacity={r2(0.08 + clamp(warmth, 0, 1) * 0.32)}
          />
        </svg>
      </button>
      <p className="sr-only">
        {label}, spelling {phrases.join(", ")}.
      </p>
      <span id={hintId} className="sr-only">
        Blows the phrase away and brings the next. Left and Right blow it toward
        that side.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
