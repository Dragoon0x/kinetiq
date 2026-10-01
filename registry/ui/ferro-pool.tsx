"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FerroPoolProps = {
  /** The magnet, 0 to 1: how far its field reaches, how tall the spikes grow and how far they lean. @default 0.6 */
  strength?: number;
  /** Spikes across the pool's front edge, 8 to 32: a few tall cones or a dense bristle. @default 16 */
  spikes?: number;
  /** How much the fluid shines, 0 to 1: highlights, glints, rim light and the reflection on the pool. 0 is matte ink. @default 0.6 */
  sheen?: number;
  /** The keyboard surface's accessible name. @default "Ferrofluid pool" */
  label?: string;
  /** A click, a tap, Enter or Space pulsed the field. */
  onPulse?: () => void;
  /** Ambient only: the pool ignores the pointer and the keyboard and leaves the tab order. */
  disabled?: boolean;
  /** What sits over the pool: a hero, a heading. Rendered in a layer above it. */
  children?: React.ReactNode;
  /** The root fills its container (`h-full w-full`); size it here. */
  className?: string;
};

/** How long a touch-placed magnet stays after the finger lifts, in ms. */
const TOUCH_HOLD = 1600;
/** How long a changed strength or spike count shows itself on a resting pool, in ms. */
const PREVIEW = 1400;
/** How long a reduced-motion pulse shows its surged spikes, in ms. */
const STILL_PULSE = 240;
/** The spike spring: stiff enough to stand, light enough to jiggle (ζ ≈ 0.32). */
const STIFF = 260;
const DAMP = 2 * 0.32 * Math.sqrt(STIFF);
/** The field below which the surface stays smooth; above it, it breaks into spikes. */
const CRITICAL = 0.22;
const BG_LIGHT = 0.985;
const BG_DARK = 0.145;
/** Presses on the hero's own controls are theirs, not the pool's. */
const CONTROLS =
  "a,button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A colour whose lightness follows the page background: one value for light, one for dark. */
const pigment = (light: number, dark: number, c: number, h: number) => {
  const b = (light - dark) / (BG_LIGHT - BG_DARK);
  const a = dark - BG_DARK * b;
  return `oklch(from var(--background) calc(${r4(a)} + l * ${r4(b)}) ${c} ${h})`;
};

/*
 * Ferrofluid is near-black whatever the theme; what changes is the room it
 * reflects. The colours live on the canvas element as its text, border and
 * outline colours, so the canvas reads them back resolved, and a 1ms colour
 * transition tells it when the theme has changed them.
 */
const FLUID = pigment(0.25, 0.13, 0.014, 262);
const ROOM = pigment(0.84, 0.55, 0.016, 250);
const INKS: React.CSSProperties = {
  color: FLUID,
  borderTopColor: ROOM,
  borderRightColor: pigment(0.99, 0.92, 0.008, 250),
  borderBottomColor: pigment(0.1, 0.06, 0.012, 262),
  borderLeftColor: pigment(0.64, 0.5, 0.02, 250),
  outlineColor: "var(--ring)",
};
/** What shows before the canvas has painted. */
const COVER = `linear-gradient(180deg, color-mix(in oklab, ${ROOM} 42%, ${FLUID}), ${FLUID} 72%)`;

type Colors = {
  fluid: string;
  room: string;
  spec: string;
  deep: string;
  rim: string;
  ring: string;
};

type Lattice = {
  n: number;
  X: Float32Array;
  Z: Float32Array;
  h: Float32Array;
  v: Float32Array;
  hit: Int32Array;
  /** Spacing, world units (px at the front edge). */
  a: number;
  /** The horizon's screen y, far above the box. */
  yh: number;
  /** World depth per unit of perspective divisor. */
  Z0: number;
};

type Ripple = { id: number; t0: number; X: number; Z: number; r: number };

type Magnet = {
  x: number;
  y: number;
  on: number;
  target: number;
  inside: boolean;
  keyboard: boolean;
  kx: number;
  ky: number;
  touch: number;
  still: number;
  /** A tweak previewing itself: the magnet held over the middle for a moment. */
  preview: number;
};

type Sim = {
  w: number;
  h: number;
  dpr: number;
  T: number;
  lat: Lattice | null;
  strength: number;
  sheen: number;
  spikes: number;
  mag: Magnet;
  surge: number;
  ripples: Ripple[];
  pulses: number;
  active: boolean;
  colors: Colors | null;
};

const createSim = (): Sim => ({
  w: 0,
  h: 0,
  dpr: 1,
  T: 0,
  lat: null,
  strength: 0.6,
  sheen: 0.6,
  spikes: 16,
  mag: {
    x: 0,
    y: 0,
    on: 0,
    target: 0,
    inside: false,
    keyboard: false,
    kx: -1,
    ky: -1,
    touch: 0,
    still: 0,
    preview: 0,
  },
  surge: 0,
  ripples: [],
  pulses: 0,
  active: false,
  colors: null,
});

const ensure = (ref: React.RefObject<Sim | null>): Sim => {
  ref.current ??= createSim();
  return ref.current;
};

/*
 * The pool is a plane seen from a low camera: the horizon sits well above
 * the box, so the back of the pool is a little smaller than the front, and
 * the pointer's height on the screen is a depth in the pool.
 */
function buildLattice(w: number, h: number, spikes: number): Lattice {
  const yh = -1.2 * h;
  const span = h - yh;
  const Z0 = 2 * span;
  const zFar = span / -yh;
  const a = w / clamp(Math.round(spikes), 8, 32);
  const gap = a * 0.866;
  const rand = lcg(0x2c1b3c6d ^ Math.round(spikes * 977 + w));
  const X: number[] = [];
  const Z: number[] = [];
  // Far rows first: the painter's order.
  let row = 0;
  for (let depth = Z0 * zFar + gap; depth >= Z0 - gap * 1.5; depth -= gap) {
    const z = depth / Z0;
    const half = (w / 2 + a * 1.5) * z;
    const shift = row % 2 ? a / 2 : 0;
    for (let x = -half + shift; x <= half; x += a) {
      X.push(x + (rand() - 0.5) * a * 0.24);
      Z.push(depth + (rand() - 0.5) * gap * 0.24);
    }
    row += 1;
  }
  const n = X.length;
  return {
    n,
    X: Float32Array.from(X),
    Z: Float32Array.from(Z),
    h: new Float32Array(n),
    v: new Float32Array(n),
    hit: new Int32Array(n),
    a,
    yh,
    Z0,
  };
}

/** The field's reach on the pool, in world units. */
const reachOf = (s: Sim) => s.w * lerp(0.16, 0.28, s.strength);
/** How tall a spike stands in a full field. */
const tallOf = (s: Sim, L: Lattice) => L.a * lerp(1, 2.6, s.strength);

/** The magnet's footprint on the pool, from its place on the screen. */
function footprint(s: Sim, L: Lattice) {
  const z = (s.h - L.yh) / Math.max(1, s.mag.y - L.yh);
  return { X: (s.mag.x - s.w / 2) * z, Z: z * L.Z0 };
}

const falloff = (d: number, r: number) => {
  const u = 1 + (d * d) / (r * r);
  return 1 / (u * Math.sqrt(u));
};

/** A spike's resting height for a field of `b`: nothing below the threshold. */
const standing = (b: number, tall: number, surge: number) =>
  tall *
  smooth((b * (1 + 0.9 * surge) - CRITICAL) / (1 - CRITICAL)) *
  (1 + 0.35 * surge);

/** Moves every spike toward the height its field asks for. */
function settle(s: Sim, dt: number) {
  const L = s.lat;
  if (!L) return;
  const m = s.mag;
  const field = m.on > 0.002 || s.surge > 0.002;
  if (!field && !s.active && s.ripples.length === 0) return;
  const foot = footprint(s, L);
  const r = reachOf(s);
  const tall = tallOf(s, L);
  const kick = L.a * 11;
  for (const p of s.ripples) {
    const before = p.r;
    p.r = (s.T - p.t0) * L.Z0 * 1.4;
    for (let i = 0; i < L.n; i += 1) {
      if (L.hit[i] === p.id) continue;
      const d = Math.hypot((L.X[i] ?? 0) - p.X, (L.Z[i] ?? 0) - p.Z);
      if (d > before && d <= p.r) {
        L.hit[i] = p.id;
        L.v[i] = (L.v[i] ?? 0) + kick * falloff(d, r * 1.6);
      }
    }
  }
  s.ripples = s.ripples.filter((p) => p.r < L.Z0 * 1.4);

  const steps = Math.max(1, Math.ceil(dt * 120));
  const h = dt / steps;
  let moving = 0;
  for (let i = 0; i < L.n; i += 1) {
    let target = 0;
    if (field) {
      const d = Math.hypot((L.X[i] ?? 0) - foot.X, (L.Z[i] ?? 0) - foot.Z);
      if (d < r * 4) target = standing(m.on * falloff(d, r), tall, s.surge);
    }
    let y = L.h[i] ?? 0;
    let v = L.v[i] ?? 0;
    if (target === 0 && Math.abs(y) < 0.01 && Math.abs(v) < 0.02) {
      L.h[i] = 0;
      L.v[i] = 0;
      continue;
    }
    for (let k = 0; k < steps; k += 1) {
      v += (STIFF * (target - y) - DAMP * v) * h;
      y += v * h;
    }
    // The fluid can rise but not dig a hole in itself.
    if (y < 0) {
      y *= 0.5;
      v *= 0.5;
    }
    L.h[i] = y;
    L.v[i] = v;
    moving += Math.abs(target - y) + Math.abs(v) * 0.05;
  }
  s.active = moving > 0.05;
}

/** Still frames: every spike exactly where its field puts it. */
function hold(s: Sim) {
  const L = s.lat;
  if (!L) return;
  const foot = footprint(s, L);
  const r = reachOf(s);
  const tall = tallOf(s, L);
  for (let i = 0; i < L.n; i += 1) {
    const d = Math.hypot((L.X[i] ?? 0) - foot.X, (L.Z[i] ?? 0) - foot.Z);
    L.h[i] =
      s.mag.on > 0 ? standing(s.mag.on * falloff(d, r), tall, s.surge) : 0;
    L.v[i] = 0;
  }
}

function draw(ctx: CanvasRenderingContext2D, s: Sim, light: number) {
  const L = s.lat;
  const c = s.colors;
  if (!L || !c) return;
  const { w, h } = s;
  const span = h - L.yh;
  const sheen = s.sheen;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = c.fluid;
  ctx.fillRect(0, 0, w, h);

  // Toward the back the pool is seen at a grazing angle and mirrors more of
  // the room.
  const grazing = ctx.createLinearGradient(0, 0, 0, h);
  grazing.addColorStop(0, c.room);
  grazing.addColorStop(0.78, "transparent");
  ctx.globalAlpha = 0.34 + 0.22 * sheen;
  ctx.fillStyle = grazing;
  ctx.fillRect(0, 0, w, h);

  // The softbox, lying on the pool as a long soft band that follows the light.
  if (sheen > 0) {
    const bx = w / 2 + Math.sin(light) * w * 0.34;
    const by = h * 0.3;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(1, 0.2);
    const band = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.42);
    band.addColorStop(0, c.spec);
    band.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.32 * sheen;
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const m = s.mag;
  const foot = footprint(s, L);
  const zm = foot.Z / L.Z0;
  const r = reachOf(s);
  if (m.on > 0.01) {
    // The mound under the magnet catches the room on its crown.
    const sx = w / 2 + foot.X / zm;
    const sy = L.yh + span / zm;
    const rx = (r / zm) * 1.3;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(1, span / (zm * L.Z0));
    const dome = ctx.createRadialGradient(-rx * 0.2, -rx * 0.3, 0, 0, 0, rx);
    dome.addColorStop(0, c.room);
    dome.addColorStop(1, "transparent");
    ctx.globalAlpha = (0.12 + 0.25 * sheen) * m.on * (0.5 + 0.5 * s.strength);
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const p of s.ripples) {
    const z = p.Z / L.Z0;
    const fade = 1 - p.r / (L.Z0 * 1.4);
    if (fade <= 0) continue;
    ctx.globalAlpha = 0.45 * fade * (0.4 + 0.6 * sheen);
    ctx.strokeStyle = c.room;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(
      w / 2 + p.X / z,
      L.yh + span / z,
      Math.max(0.1, p.r / z),
      Math.max(0.1, (p.r * span) / (z * z * L.Z0)),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  // Spikes, back to front. The lit flank faces the light; its rim faces away.
  const side = light < 0 ? -1 : 1;
  const lit = 0.55 + 0.45 * Math.abs(Math.sin(light));
  const hm = L.a * 2.5;
  const reach = 0.45 * (0.4 + 0.6 * s.strength);
  for (let i = 0; i < L.n; i += 1) {
    const height = L.h[i] ?? 0;
    if (height < 0.35) continue;
    const X = L.X[i] ?? 0;
    const Z = L.Z[i] ?? 0;
    const z = Z / L.Z0;
    const k = 1 / z;
    const fore = span / (z * z * L.Z0);
    const d = Math.hypot(foot.X - X, foot.Z - Z);
    const mound = 0.45 * L.a * s.strength * m.on * falloff(d, r);
    const bx = w / 2 + X * k;
    const by = L.yh + span * k - mound * k;
    if (by < -height * k || bx < -L.a || bx > w + L.a) continue;
    const rb = L.a * 0.56 * k;
    const ry = rb * fore * z;
    const hs = height * k;
    // Spikes follow the field lines up toward the magnet above its footprint.
    const tilt = d > 0.01 ? (reach * d) / (d + hm) : 0;
    const ox = d > 0.01 ? ((foot.X - X) / d) * height * tilt * k : 0;
    const oy = d > 0.01 ? -((foot.Z - Z) / d) * height * tilt * fore : 0;
    const ax = bx + ox;
    const ay = by - hs + oy;

    // A low spike is a smooth bump; a tall one a cone whose flanks curve in
    // to a sharp tip. The flanks' control points move toward the axis as it
    // grows.
    const sharp = clamp01(hs / (rb * 3));
    // A bump barely off the surface is the same black as the surface: its
    // shading comes in as it rises, so the edge of the field is soft.
    const shown = smooth(hs / (rb * 1.2));
    const q = lerp(0.62, 0.14, sharp) * rb;
    const cy = by - hs * lerp(0.6, 0.24, sharp);
    const lean = ox * 0.2;
    const flank = (dir: number, from: number) => {
      ctx.moveTo(bx + dir * rb * from, by);
      ctx.quadraticCurveTo(bx + dir * q + lean, cy, ax, ay);
    };

    ctx.globalAlpha = 1;
    ctx.fillStyle = c.fluid;
    ctx.beginPath();
    flank(-1, 1);
    ctx.quadraticCurveTo(bx + q + lean, cy, bx + rb, by);
    ctx.ellipse(bx, by, rb, Math.max(0.1, ry), 0, 0, Math.PI);
    ctx.fill();

    // The flank away from the light falls into the fluid's own shadow.
    ctx.globalAlpha = 0.55 * shown;
    ctx.fillStyle = c.deep;
    ctx.beginPath();
    flank(-side, 1);
    ctx.quadraticCurveTo(
      bx - side * q * 0.3 + lean,
      cy,
      bx - side * rb * 0.4,
      by + ry * 0.6,
    );
    ctx.closePath();
    ctx.fill();

    if (sheen <= 0) continue;
    // The lit flank mirrors the room, and a thin specular line runs up it
    // to the tip: the metallic look is mostly these two.
    ctx.globalAlpha = 0.4 * sheen * lit * shown;
    ctx.fillStyle = c.room;
    ctx.beginPath();
    flank(side, 0.74);
    ctx.quadraticCurveTo(
      bx + side * q * 0.35 + lean,
      cy,
      bx + side * rb * 0.26,
      by + ry * 0.45,
    );
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.85 * sheen * lit * (0.25 + 0.75 * sharp);
    ctx.strokeStyle = c.spec;
    ctx.lineWidth = Math.max(0.6, rb * 0.07);
    ctx.beginPath();
    ctx.moveTo(bx + side * rb * 0.5, by - ry * 0.15);
    ctx.quadraticCurveTo(bx + side * q * 0.62 + lean, cy, ax, ay);
    ctx.stroke();
    // A rim of reflected room on the far flank.
    ctx.globalAlpha = 0.3 * sheen * shown;
    ctx.strokeStyle = c.rim;
    ctx.lineWidth = Math.max(0.5, rb * 0.06);
    ctx.beginPath();
    flank(-side, 0.96);
    ctx.stroke();
    // A pinpoint at the tip of the tall ones.
    if (sharp > 0.5) {
      ctx.globalAlpha = 0.55 * sheen;
      ctx.fillStyle = c.spec;
      ctx.beginPath();
      ctx.arc(ax, ay + 0.6, Math.max(0.45, rb * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (m.keyboard && m.on > 0.01) {
    // Without a cursor, the keyboard's magnet needs its own mark.
    ctx.globalAlpha = 0.95 * m.on;
    ctx.strokeStyle = c.ring;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 6, 0, Math.PI * 2);
    for (const [px, py] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      ctx.moveTo(m.x + px * 9, m.y + py * 9);
      ctx.lineTo(m.x + px * 13, m.y + py * 13);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

type Api = {
  resize: () => void;
  colors: () => void;
  wake: () => void;
  sleep: () => void;
  paint: () => void;
};

/**
 * A pool of ferrofluid as a backdrop, seen at a low angle: glossy near-black
 * at the front, reflecting more of the room toward the back, with a softbox
 * lying on it as a long soft band.
 *
 * The pointer is a magnet held above the pool. Its footprint is found
 * through the same perspective that draws the pool, and over a jittered
 * hexagonal lattice every site feels its field; above a threshold the site
 * stands up as a spike — the instability ferrofluid is known for — on its
 * own underdamped spring, so the spikes jiggle as they rise and sink back
 * when the magnet leaves. They stand on a mound that bulges under the
 * magnet, lean along the field lines toward it and are drawn back to front
 * in perspective, each with a lit flank, a rim and a glint on the side the
 * light comes from, while the light drifts slowly across the room. A click
 * pulses the field: it surges, and a ring runs out across the pool kicking
 * every spike as it passes.
 *
 * Canvas, at most 2× resolution, colours read from its own computed style
 * and re-read on a theme change, a frame loop only while it is on screen in
 * a visible page. The keyboard path is a real `role="application"` surface:
 * focus brings the magnet over the pool, arrow keys move it, Enter or Space
 * pulse. Under reduced motion nothing jiggles or drifts: the spikes are
 * drawn where the field puts them, once per move, and a pulse shows its
 * surge for a moment.
 */
export function FerroPool({
  strength = 0.6,
  spikes = 16,
  sheen = 0.6,
  label = "Ferrofluid pool",
  onPulse,
  disabled = false,
  children,
  className,
}: FerroPoolProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const simRef = React.useRef<Sim | null>(null);
  const loop = React.useRef({ raf: 0, last: 0, seen: false });
  const api = React.useRef<Api | null>(null);
  const repaintSoon = React.useRef(0);

  const getSim = () => ensure(simRef);

  const readColors = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cs = getComputedStyle(canvas);
    getSim().colors = {
      fluid: cs.color,
      room: cs.borderTopColor,
      spec: cs.borderRightColor,
      deep: cs.borderBottomColor,
      rim: cs.borderLeftColor,
      ring: cs.outlineColor,
    };
  };

  /** The light's bearing: drifting slowly across the upper left, or still. */
  const lightAt = (T: number) =>
    motionSafe ? -0.55 + 0.38 * Math.sin((T * Math.PI * 2) / 14) : -0.55;

  const frame = (dt: number) => {
    const s = getSim();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !s.colors || !s.lat || s.w < 1) return false;
    s.T += dt;
    const m = s.mag;
    // The magnet arrives and leaves on a short ease, never popping in.
    m.on += (m.target - m.on) * (1 - Math.exp(-dt / durations.fast));
    if (Math.abs(m.target - m.on) < 0.002) m.on = m.target;
    s.surge *= Math.exp(-dt / durations.slow);
    if (s.surge < 0.002) s.surge = 0;
    settle(s, dt);
    draw(ctx, s, lightAt(s.T));
    // The light drifting is life enough to keep going; a matte pool sleeps
    // once it is flat and still.
    return (
      s.sheen > 0 || s.active || m.on > 0 || s.surge > 0 || s.ripples.length > 0
    );
  };

  /** Reduced motion: one frame, exactly as the field is now. */
  const paint = () => {
    const s = getSim();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !s.colors || !s.lat || s.w < 1) return;
    s.mag.on = s.mag.target;
    s.ripples = [];
    hold(s);
    draw(ctx, s, lightAt(0));
  };

  const sleep = () => {
    const l = loop.current;
    if (l.raf) window.cancelAnimationFrame(l.raf);
    l.raf = 0;
  };

  const wake = () => {
    const l = loop.current;
    if (!motionSafe) {
      sleep();
      paint();
      return;
    }
    if (l.raf || !l.seen || document.hidden) return;
    l.last = 0;
    const tick = (now: number) => {
      const dt = l.last ? Math.min(0.05, (now - l.last) / 1000) : 0;
      l.last = now;
      l.raf = 0;
      if (!l.seen || document.hidden) return;
      if (frameRef.current(dt)) l.raf = window.requestAnimationFrame(tick);
    };
    l.raf = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const s = getSim();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w !== s.w || h !== s.h || !s.lat) {
      s.w = w;
      s.h = h;
      s.lat = buildLattice(w, h, s.spikes);
      s.active = true;
    }
    s.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (!s.colors) readColors();
    if (!motionSafe) paint();
    else {
      const ctx = canvas.getContext("2d");
      if (ctx) draw(ctx, s, lightAt(s.T));
      wake();
    }
  };

  const frameRef = React.useRef(frame);
  React.useEffect(() => {
    frameRef.current = frame;
    api.current = {
      resize,
      colors: () => {
        readColors();
        if (!motionSafe) paint();
        else wake();
      },
      wake,
      sleep,
      paint,
    };
  });

  // The props the pool reads, and a redraw or a wake when they change.
  React.useEffect(() => {
    const s = ensure(simRef);
    const count = clamp(Math.round(spikes), 8, 32);
    const m = s.mag;
    // A new strength or spike count on a resting pool would change nothing
    // anyone could see: the magnet is held over the middle for a moment, so
    // the new crown shows, then lifts away unless someone took it.
    const changed =
      s.w > 0 && (count !== s.spikes || clamp01(strength) !== s.strength);
    s.strength = clamp01(strength);
    s.sheen = clamp01(sheen);
    if (count !== s.spikes) {
      s.spikes = count;
      if (s.w > 0) s.lat = buildLattice(s.w, s.h, count);
    }
    if (changed && !m.inside && !m.keyboard && (m.target < 0.5 || m.preview)) {
      m.x = s.w / 2;
      m.y = s.h * 0.62;
      m.target = 1;
      window.clearTimeout(m.preview);
      m.preview = window.setTimeout(() => {
        m.preview = 0;
        if (m.inside || m.keyboard) return;
        m.target = 0;
        s.active = true;
        api.current?.wake();
      }, PREVIEW);
    }
    s.active = true;
    api.current?.wake();
  }, [strength, spikes, sheen, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) api.current?.sleep();
      else api.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const l = loop.current;
    const s = ensure(simRef);
    return () => {
      if (l.raf) window.cancelAnimationFrame(l.raf);
      l.raf = 0;
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
      window.clearTimeout(s.mag.touch);
      window.clearTimeout(s.mag.still);
      window.clearTimeout(s.mag.preview);
    };
  }, []);

  // Size and visibility, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const l = loop.current;
    const sizer = new ResizeObserver(() => api.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      l.seen = Boolean(entry?.isIntersecting);
      if (l.seen) api.current?.wake();
      else api.current?.sleep();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      l.seen = false;
      if (l.raf) window.cancelAnimationFrame(l.raf);
      l.raf = 0;
    };
  }, []);

  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current?.colors();
    });
  };

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const placeMagnet = (x: number, y: number) => {
    const s = getSim();
    s.mag.x = clamp(x, 0, s.w);
    s.mag.y = clamp(y, 0, s.h);
    s.mag.target = 1;
    s.active = true;
    wake();
  };

  const liftMagnet = () => {
    const s = getSim();
    if (s.mag.keyboard || s.mag.inside) return;
    s.mag.target = 0;
    s.active = true;
    wake();
  };

  /** The field surges and a ring runs out across the pool from the magnet. */
  const pulse = () => {
    const s = getSim();
    const L = s.lat;
    if (!L) return;
    s.pulses += 1;
    s.surge = 1;
    s.active = true;
    onPulse?.();
    if (!motionSafe) {
      paint();
      window.clearTimeout(s.mag.still);
      s.mag.still = window.setTimeout(() => {
        s.surge = 0;
        api.current?.paint();
      }, STILL_PULSE);
      return;
    }
    const foot = footprint(s, L);
    s.ripples.push({ id: s.pulses, t0: s.T, X: foot.X, Z: foot.Z, r: 0 });
    if (s.ripples.length > 3) s.ripples.shift();
    wake();
  };

  const fromControl = (target: EventTarget | null) => {
    const root = rootRef.current;
    if (!(target instanceof Element) || !root) return false;
    const hit = target.closest(CONTROLS);
    return Boolean(hit && root.contains(hit));
  };

  return (
    <div
      ref={bindRoot}
      className={cn(
        "relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ background: COVER }}
      onPointerMove={(event) => {
        if (disabled) return;
        if (event.pointerType === "touch" && event.buttons === 0) return;
        const at = local(event.clientX, event.clientY);
        if (!at) return;
        getSim().mag.inside = event.pointerType !== "touch";
        placeMagnet(at.x, at.y);
      }}
      onPointerDown={(event) => {
        if (disabled || event.pointerType !== "touch") return;
        const s = getSim();
        window.clearTimeout(s.mag.touch);
        const at = local(event.clientX, event.clientY);
        if (at) placeMagnet(at.x, at.y);
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== "touch") return;
        const s = getSim();
        window.clearTimeout(s.mag.touch);
        s.mag.touch = window.setTimeout(liftMagnet, TOUCH_HOLD);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        getSim().mag.inside = false;
        liftMagnet();
      }}
      onClick={(event) => {
        if (disabled || fromControl(event.target)) return;
        const at = local(event.clientX, event.clientY);
        if (at && getSim().mag.target < 0.5) placeMagnet(at.x, at.y);
        pulse();
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 block size-full transition-colors duration-1"
        style={INKS}
      />

      <div
        role="application"
        aria-roledescription="ferrofluid pool"
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onFocus={(event) => {
          if (disabled || !event.currentTarget.matches(":focus-visible")) {
            return;
          }
          const s = getSim();
          s.mag.keyboard = true;
          if (s.mag.kx < 0) {
            s.mag.kx = s.w / 2;
            s.mag.ky = s.h * 0.55;
          }
          if (!s.mag.inside) placeMagnet(s.mag.kx, s.mag.ky);
        }}
        onBlur={() => {
          const s = getSim();
          s.mag.keyboard = false;
          liftMagnet();
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const s = getSim();
          const step = (event.shiftKey ? 0.18 : 0.06) * Math.max(s.w, s.h);
          let { kx, ky } = s.mag;
          if (kx < 0 || !s.mag.keyboard) {
            kx = s.mag.target > 0.5 ? s.mag.x : s.w / 2;
            ky = s.mag.target > 0.5 ? s.mag.y : s.h * 0.55;
          }
          switch (event.key) {
            case "ArrowRight":
              kx += step;
              break;
            case "ArrowLeft":
              kx -= step;
              break;
            case "ArrowDown":
              ky += step;
              break;
            case "ArrowUp":
              ky -= step;
              break;
            case "Enter":
            case " ":
              event.preventDefault();
              if (!event.repeat) {
                s.mag.keyboard = true;
                if (s.mag.target < 0.5) placeMagnet(kx, ky);
                pulse();
              }
              return;
            default:
              return;
          }
          event.preventDefault();
          s.mag.keyboard = true;
          s.mag.kx = clamp(kx, 0, s.w);
          s.mag.ky = clamp(ky, 0, s.h);
          placeMagnet(s.mag.kx, s.mag.ky);
        }}
        className={cn(
          "absolute inset-0 rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />

      {children !== undefined && children !== null ? (
        <div className="relative h-full w-full">{children}</div>
      ) : null}

      <p id={hintId} className="sr-only">
        Arrow keys move a magnet over the pool, Shift for larger steps; the
        fluid rises into spikes beneath it. Enter or Space pulses the field.
      </p>
    </div>
  );
}
