"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { createVelocityTracker, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PulledSugarPalette = "berry" | "mint" | "honey" | "lilac";

export type PulledSugarProps = {
  /** The motor's speed in turns a minute; negative runs it backwards (controlled). */
  speed?: number;
  /** The speed it starts at when uncontrolled. @default 18 */
  defaultSpeed?: number;
  /** Fires from the throw, key or stop that changed the motor's speed, in whole turns a minute. */
  onSpeedChange?: (speed: number) => void;
  /** How readily the sugar stretches, 0 (stiff, it holds its shape) to 1 (soft: long sags and thin necks). @default 0.5 */
  stretch?: number;
  /** How glassy the candy is, 0 (matte) to 1 (a sharp, bright highlight). @default 0.6 */
  gloss?: number;
  /** The candy's three colours. @default "berry" */
  palette?: PulledSugarPalette;
  /** Three CSS colours for the stripes, overriding `palette`. */
  colors?: string[];
  /** Folds before a fresh batch drops on; 0 keeps pulling the same one. @default 8 */
  batch?: number;
  /** The fastest the motor turns either way, turns a minute, 10 to 90. @default 60 */
  maxSpeed?: number;
  /** The rope's thickness before it is pulled, in the machine's own units (it is drawn 280 wide). @default 24 */
  ropeWidth?: number;
  /** Fires on every fold, and with 0 when a fresh batch starts: the folds so far in this batch and the stripes across the rope. */
  onFold?: (folds: number, stripes: number) => void;
  /** The control's accessible name. @default "Candy puller speed" */
  label?: string;
  /** Stop the machine and the candy where they are. @default false */
  paused?: boolean;
  /** No dragging or keys. @default false */
  disabled?: boolean;
  /** Seeds the stripes' order and the first drape. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the piece; the machine scales to fit and centres. It is 224px tall by default. */
  className?: string;
};

const PALETTES: Record<PulledSugarPalette, [string, string, string]> = {
  berry: [
    "oklch(from var(--danger) 0.74 0.14 calc(h - 22))",
    "oklch(from var(--warn) 0.96 0.025 h)",
    "oklch(from var(--danger) 0.56 0.19 calc(h - 6))",
  ],
  mint: [
    "oklch(from var(--success) 0.86 0.09 h)",
    "oklch(from var(--warn) 0.96 0.025 h)",
    "oklch(from var(--success) 0.6 0.12 calc(h + 4))",
  ],
  honey: [
    "oklch(from var(--warn) 0.84 0.12 h)",
    "oklch(from var(--warn) 0.96 0.025 h)",
    "oklch(from var(--warn) 0.6 0.13 calc(h - 25))",
  ],
  lilac: [
    "oklch(from var(--accent) 0.8 0.1 calc(h + 40))",
    "oklch(from var(--warn) 0.96 0.025 h)",
    "oklch(from var(--accent) 0.58 0.15 calc(h + 40))",
  ],
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

/* The machine, in its own frame. */
/* The part of that frame the machine and its hanging candy use. */
const VX = 70;
const VY = 12;
const VW = 280;
const VH = 180;
const PIN_C = { x: 210, y: 50 };
const AXLE_L = { x: 160, y: 76 };
const AXLE_R = { x: 260, y: 76 };
const ARM = 36;
const PIN_R = 7;
const N = 120;
const STEP = 1 / 120;
const GRAVITY = 900;
const ITERATIONS = 10;
const CHUNKS = 15;
const MAX_FOLDS = 4;

/**
 * The arm pins for a crank angle. The arms turn opposite ways half a turn
 * apart, so one pin comes in past the middle pin as the other swings out:
 * the candy's path round the three stays about as long while it is pulled
 * and folded from side to side.
 */
const pinsAt = (theta: number) => ({
  l: {
    x: AXLE_L.x + ARM * Math.cos(theta),
    y: AXLE_L.y + ARM * Math.sin(theta),
  },
  r: {
    x: AXLE_R.x + ARM * Math.cos(theta),
    y: AXLE_R.y - ARM * Math.sin(theta),
  },
});

type Config = {
  stretch: number;
  gloss: number;
  batch: number;
  ropeWidth: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (v: boolean) => void;
  wake: () => void;
  /** Sets the motor's target, rad/s. */
  motor: (omega: number) => void;
  /** Holds the arms at an angle under the finger. */
  hold: (theta: number | null) => void;
  angle: () => number;
  /** The box's mapping into the machine's frame. */
  frame: () => { ox: number; oy: number; scale: number };
  freshBatch: () => void;
  dispose: () => void;
};

type FoldReport = (folds: number, stripes: number, fresh: boolean) => void;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  report: { current: FoldReport },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let w = 0;
  let h = 0;
  let dprNow = 1;
  const view = { ox: 0, oy: 0, scale: 1 };

  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const qx = new Float32Array(N);
  const qy = new Float32Array(N);
  const rest = new Float32Array(N);
  const level = new Float32Array(N);
  const nx = new Float32Array(N);
  const ny = new Float32Array(N);
  const thick = new Float32Array(N);
  let base = 4;

  let theta = Math.PI;
  let omega = 0;
  let omegaV = 0;
  let target = 0;
  let held: number | null = null;
  let motorSet = false;
  let heldPrev = 0;
  let folds = 0;
  let foldFront = { at: -1, from: 0, to: 0 };
  let lastSector = 0;
  let aeration = 0;
  let settled = false;
  let colours = {
    stripes: ["pink", "white", "red"],
    blend: "pink",
    metal: "gray",
    metalDark: "dimgray",
    metalLight: "white",
    shade: "rgba(0,0,0,0.2)",
    gloss: "rgba(255,255,255,0.6)",
  };
  /** Stripe and blend fills, rebuilt only when the colours or the aeration change. */
  const fills = {
    stripes: ["pink", "white", "red"],
    blends: ["pink"],
    key: "",
  };
  const stripeRgb: [number, number, number][] = [
    [240, 150, 170],
    [250, 245, 235],
    [200, 60, 80],
  ];

  const reader = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    return c.getContext("2d", { willReadFrequently: true });
  })();
  const rgb = (colour: string): [number, number, number, number] => {
    if (!reader) return [128, 128, 128, 1];
    reader.clearRect(0, 0, 1, 1);
    reader.fillStyle = "rgb(128, 128, 128)";
    reader.fillStyle = colour;
    reader.fillRect(0, 0, 1, 1);
    const d = reader.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 255) / 255];
  };

  /** A new dollop draped over the pins, dropped from a little above them. */
  const lay = (lift: number) => {
    const pins = pinsAt(theta);
    const cx = (pins.l.x + pins.r.x) / 2;
    const span = Math.max(130, Math.abs(pins.r.x - pins.l.x) + 34);
    let perimeter = 0;
    let prevX = 0;
    let prevY = 0;
    for (let i = 0; i <= N; i += 1) {
      const a = (i / N) * TAU - Math.PI / 2;
      const x = cx + (span / 2) * Math.cos(a);
      const y =
        72 - lift + 40 * Math.sin(a) + (Math.sin(a) > 0 ? 12 * Math.sin(a) : 0);
      if (i < N) {
        px[i] = x;
        py[i] = y;
        qx[i] = x;
        qy[i] = y;
        level[i] = 0;
      }
      if (i > 0) perimeter += Math.hypot(x - prevX, y - prevY);
      prevX = x;
      prevY = y;
    }
    base = (perimeter * 0.8) / N;
    rest.fill(base);
    folds = 0;
    aeration = 0;
    foldFront = { at: -1, from: 0, to: 0 };
    settled = false;
  };

  const pinList = () => {
    const p = pinsAt(theta);
    return [PIN_C, p.l, p.r];
  };

  /** One fixed step of the rope: gravity, constraints, pins with grip, plastic flow. */
  const rope = (dt: number, pinVel: { x: number; y: number }[]) => {
    const c = cfg;
    if (!c) return;
    const soft = clamp(c.stretch, 0, 1);
    const radius = PIN_R + clamp(c.ropeWidth, 6, 36) * 0.42;
    const damp = 0.992;
    for (let i = 0; i < N; i += 1) {
      const x = px[i] ?? 0;
      const y = py[i] ?? 0;
      const vx = (x - (qx[i] ?? 0)) * damp;
      const vy = (y - (qy[i] ?? 0)) * damp;
      qx[i] = x;
      qy[i] = y;
      px[i] = x + vx;
      py[i] = y + vy + GRAVITY * dt * dt;
    }
    const pins = pinList();
    for (let it = 0; it < ITERATIONS; it += 1) {
      for (let i = 0; i < N; i += 1) {
        const j = (i + 1) % N;
        const dx = (px[j] ?? 0) - (px[i] ?? 0);
        const dy = (py[j] ?? 0) - (py[i] ?? 0);
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const diff = ((d - (rest[i] ?? base)) / d) * 0.5;
        px[i] = (px[i] ?? 0) + dx * diff;
        py[i] = (py[i] ?? 0) + dy * diff;
        px[j] = (px[j] ?? 0) - dx * diff;
        py[j] = (py[j] ?? 0) - dy * diff;
      }
      for (let k = 0; k < pins.length; k += 1) {
        const pin = pins[k];
        if (!pin) continue;
        for (let i = 0; i < N; i += 1) {
          const dx = (px[i] ?? 0) - pin.x;
          const dy = (py[i] ?? 0) - pin.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= radius * radius) continue;
          const d = Math.sqrt(d2) || 1e-6;
          px[i] = pin.x + (dx / d) * radius;
          py[i] = pin.y + (dy / d) * radius;
          if (it === ITERATIONS - 1) {
            // Grip: the candy in contact is carried by the pin.
            const v = pinVel[k] ?? { x: 0, y: 0 };
            const gvx = (px[i] ?? 0) - (qx[i] ?? 0);
            const gvy = (py[i] ?? 0) - (qy[i] ?? 0);
            qx[i] = (px[i] ?? 0) - lerp(gvx, v.x * dt, 0.35);
            qy[i] = (py[i] ?? 0) - lerp(gvy, v.y * dt, 0.35);
          }
        }
      }
      // A thick rope cannot fold sharper than about its own width.
      for (let i = 0; i < N; i += 1) {
        const j = (i + 3) % N;
        const dx = (px[j] ?? 0) - (px[i] ?? 0);
        const dy = (py[j] ?? 0) - (py[i] ?? 0);
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
        const least = 2.8 * base;
        if (d >= least) continue;
        const push = ((least - d) / d) * 0.25;
        px[i] = (px[i] ?? 0) - dx * push;
        py[i] = (py[i] ?? 0) - dy * push;
        px[j] = (px[j] ?? 0) + dx * push;
        py[j] = (py[j] ?? 0) + dy * push;
      }
    }
    // Where the rope lies on itself it presses, rather than passing through.
    const touch = clamp(c.ropeWidth, 6, 36) * 0.78;
    for (let i = 0; i < N; i += 1) {
      for (let j = i + 5; j < N; j += 1) {
        if (N - (j - i) < 5) continue;
        const dx = (px[j] ?? 0) - (px[i] ?? 0);
        const dy = (py[j] ?? 0) - (py[i] ?? 0);
        const d2 = dx * dx + dy * dy;
        if (d2 >= touch * touch) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const push = ((touch - d) / d) * 0.5;
        px[i] = (px[i] ?? 0) - dx * push;
        py[i] = (py[i] ?? 0) - dy * push;
        px[j] = (px[j] ?? 0) + dx * push;
        py[j] = (py[j] ?? 0) + dy * push;
      }
    }
    // Sugar is plastic: a pulled segment keeps some of its new length, and
    // slowly gathers back toward its first.
    const flow = lerp(0.25, 3.2, soft);
    for (let i = 0; i < N; i += 1) {
      const j = (i + 1) % N;
      const d = Math.hypot(
        (px[j] ?? 0) - (px[i] ?? 0),
        (py[j] ?? 0) - (py[i] ?? 0),
      );
      let r = rest[i] ?? base;
      if (d > r * 1.015) r += (d - r) * flow * dt;
      r += (base - r) * lerp(0.7, 0.25, soft) * dt;
      rest[i] = clamp(r, base * 0.8, base * 1.75);
    }
  };

  const stripesFor = (lv: number) => 3 * Math.pow(2, Math.min(MAX_FOLDS, lv));

  /** Each arm passing over its inner point folds the rope over the middle pin. */
  const countFolds = () => {
    const sector = Math.floor(theta / TAU);
    if (sector === lastSector) return;
    lastSector = sector;
    folds += 1;
    aeration = Math.min(1, aeration + 0.12);
    // The finer stripes run out along the rope from where it lay on the pin.
    let near = 0;
    let best = Infinity;
    for (let i = 0; i < N; i += 1) {
      const d = Math.hypot((px[i] ?? 0) - PIN_C.x, (py[i] ?? 0) - PIN_C.y);
      if (d < best) {
        best = d;
        near = i;
      }
    }
    foldFront = { at: clock, from: near, to: folds };
    const c = cfg;
    if (!c?.motionSafe) for (let i = 0; i < N; i += 1) level[i] = folds;
    report.current(folds, stripesFor(folds), false);
    if (c && c.batch > 0 && folds >= c.batch) {
      lay(70);
      report.current(0, 3, true);
    }
  };

  const spreadFold = () => {
    if (foldFront.at < 0) return false;
    const reach = (clock - foldFront.at) * 120;
    let pending = false;
    for (let i = 0; i < N; i += 1) {
      const ring = Math.min(
        Math.abs(i - foldFront.from),
        N - Math.abs(i - foldFront.from),
      );
      if ((level[i] ?? 0) < foldFront.to) {
        if (ring <= reach) level[i] = foldFront.to;
        else pending = true;
      }
    }
    if (!pending) foldFront.at = -1;
    return pending;
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    clock += dt;
    let moving = false;
    const before = pinsAt(theta);
    if (held !== null) {
      theta = held;
      omega = (held - heldPrev) / Math.max(dt, 1e-4);
      heldPrev = held;
      omegaV = 0;
      moving = true;
    } else if (!c.paused) {
      // The flywheel answers the motor on drift's constants: slow, no overshoot.
      const k = springs.drift;
      const n = Math.max(1, Math.ceil(dt / STEP));
      const hh = dt / n;
      for (let i = 0; i < n; i += 1) {
        omegaV +=
          ((k.stiffness * (target - omega) - k.damping * omegaV) / k.mass) * hh;
        omega += omegaV * hh;
      }
      if (Math.abs(target - omega) < 0.001 && Math.abs(omegaV) < 0.001) {
        omega = target;
        omegaV = 0;
      }
      theta += omega * dt;
      if (omega !== 0 || omegaV !== 0) moving = true;
    }
    const after = pinsAt(theta);
    const vel = [
      { x: 0, y: 0 },
      { x: (after.l.x - before.l.x) / dt, y: (after.l.y - before.l.y) / dt },
      { x: (after.r.x - before.r.x) / dt, y: (after.r.y - before.r.y) / dt },
    ];
    countFolds();
    if (!c.paused) {
      const n = Math.max(1, Math.round(dt / STEP));
      let energy = 0;
      for (let i = 0; i < n; i += 1) rope(dt / n, vel);
      for (let i = 0; i < N; i += 1)
        energy +=
          Math.abs((px[i] ?? 0) - (qx[i] ?? 0)) +
          Math.abs((py[i] ?? 0) - (qy[i] ?? 0));
      settled = energy < 0.02 * N && !moving;
      if (!settled) moving = true;
      if (spreadFold()) moving = true;
    }
    return moving;
  };

  /** Settles a fresh drape at once: the reduced-motion frame and the first one. */
  const rest0 = () => {
    const vel = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    for (let i = 0; i < 240; i += 1) rope(STEP, vel);
    for (let i = 0; i < N; i += 1) {
      qx[i] = px[i] ?? 0;
      qy[i] = py[i] ?? 0;
    }
  };

  const refill = () => {
    const key = `${colours.stripes.join()}|${aeration}`;
    if (key === fills.key) return;
    fills.key = key;
    fills.stripes = [0, 1, 2].map(stripeCss);
    fills.blends = Array.from({ length: MAX_FOLDS + 1 }, (_, lv) =>
      blendCss(lv),
    );
  };

  const blendCss = (lv: number) => {
    // Pulled fine enough, the stripes read as one colour; air lightens it.
    let r = 0;
    let g = 0;
    let b = 0;
    for (const s of stripeRgb) {
      r += s[0];
      g += s[1];
      b += s[2];
    }
    const lift = Math.min(0.4, aeration * 0.4 + lv * 0.02);
    r = lerp(r / 3, 250, lift);
    g = lerp(g / 3, 246, lift);
    b = lerp(b / 3, 238, lift);
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
  };

  const stripeCss = (i: number) => {
    const s = stripeRgb[i % 3] ?? [200, 200, 200];
    const lift = aeration * 0.3;
    return `rgb(${Math.round(lerp(s[0], 250, lift))}, ${Math.round(lerp(s[1], 246, lift))}, ${Math.round(lerp(s[2], 238, lift))})`;
  };

  const drawMachine = (pins: ReturnType<typeof pinsAt>) => {
    if (!ctx) return;
    // The bracket: a rail between the axles and a post up to the middle pin.
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colours.metalDark;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(AXLE_L.x, AXLE_L.y);
    ctx.lineTo(AXLE_R.x, AXLE_R.y);
    ctx.moveTo(PIN_C.x, AXLE_L.y);
    ctx.lineTo(PIN_C.x, PIN_C.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // The arms and their hubs sit behind the candy.
    ctx.strokeStyle = colours.metalDark;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(AXLE_L.x, AXLE_L.y);
    ctx.lineTo(pins.l.x, pins.l.y);
    ctx.moveTo(AXLE_R.x, AXLE_R.y);
    ctx.lineTo(pins.r.x, pins.r.y);
    ctx.stroke();
    ctx.fillStyle = colours.metalDark;
    for (const a of [AXLE_L, AXLE_R]) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 9, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = colours.metal;
    for (const a of [AXLE_L, AXLE_R]) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, TAU);
      ctx.fill();
    }
  };

  const drawPins = (pins: ReturnType<typeof pinsAt>) => {
    if (!ctx) return;
    // The pins stand out of the candy toward you: polished steel caps.
    for (const p of [PIN_C, pins.l, pins.r]) {
      ctx.fillStyle = colours.metalDark;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PIN_R + 1.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = colours.metal;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PIN_R, 0, TAU);
      ctx.fill();
      ctx.fillStyle = colours.metalLight;
      ctx.beginPath();
      ctx.arc(p.x - 2.2, p.y - 2.4, 2.2, 0, TAU);
      ctx.fill();
    }
  };

  const drawRope = () => {
    const c = cfg;
    if (!ctx || !c) return;
    const W = clamp(c.ropeWidth, 6, 36);
    for (let i = 0; i < N; i += 1) {
      const a = (i + N - 2) % N;
      const b = (i + 2) % N;
      const tx = (px[b] ?? 0) - (px[a] ?? 0);
      const ty = (py[b] ?? 0) - (py[a] ?? 0);
      const l = Math.hypot(tx, ty) || 1;
      nx[i] = -ty / l;
      ny[i] = tx / l;
      const stretchK = ((rest[a] ?? base) + (rest[i] ?? base)) / (2 * base);
      thick[i] = clamp(W / Math.pow(stretchK, 0.85), W * 0.5, W * 1.12);
    }
    const lightA = -2.3 + 0.28 * Math.sin(clock * 0.45);
    const lx = Math.cos(lightA);
    const ly = Math.sin(lightA);
    const gloss = clamp(c.gloss, 0, 1);
    const per = Math.ceil(N / CHUNKS);
    for (let ch = 0; ch < CHUNKS; ch += 1) {
      const s = ch * per;
      const e = Math.min(N, s + per + 1);
      if (e - s < 2) continue;
      const mid = (s + Math.floor((e - s) / 2)) % N;
      const lv = Math.min(MAX_FOLDS, level[mid] ?? 0);
      const k = stripesFor(lv);
      const stripePx = ((thick[mid] ?? W) * view.scale) / k;
      const solid = stripePx < 1.6;
      const bands = solid ? 1 : k;
      for (let j = 0; j < bands; j += 1) {
        const a0 = j / bands;
        const a1 = (j + 1) / bands;
        ctx.fillStyle = solid
          ? (fills.blends[Math.round(lv)] ?? "pink")
          : (fills.stripes[(j + c.seed) % 3] ?? "pink");
        ctx.beginPath();
        for (let q = s; q <= e; q += 1) {
          const i = q % N;
          const t = (thick[i] ?? W) / 2;
          const off = t - a0 * 2 * t;
          const x = (px[i] ?? 0) + (nx[i] ?? 0) * off;
          const y = (py[i] ?? 0) + (ny[i] ?? 0) * off;
          if (q === s) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let q = e; q >= s; q -= 1) {
          const i = q % N;
          const t = (thick[i] ?? W) / 2;
          const off = t - a1 * 2 * t - (j < bands - 1 ? 0.4 : 0);
          ctx.lineTo(
            (px[i] ?? 0) + (nx[i] ?? 0) * off,
            (py[i] ?? 0) + (ny[i] ?? 0) * off,
          );
        }
        ctx.closePath();
        ctx.fill();
      }
      // Volume: the rope darkens toward both edges.
      ctx.strokeStyle = colours.shade;
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(1, (thick[mid] ?? W) * 0.2);
      for (const side of [1, -1]) {
        ctx.beginPath();
        for (let q = s; q <= e; q += 1) {
          const i = q % N;
          const off = side * ((thick[i] ?? W) / 2 - (thick[mid] ?? W) * 0.1);
          const x = (px[i] ?? 0) + (nx[i] ?? 0) * off;
          const y = (py[i] ?? 0) + (ny[i] ?? 0) * off;
          if (q === s) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      // The gloss runs along the side that faces the light.
      const facing = (nx[mid] ?? 0) * lx + (ny[mid] ?? 0) * ly;
      if (gloss > 0.02 && Math.abs(facing) > 0.08) {
        const side = facing > 0 ? 1 : -1;
        ctx.globalAlpha = clamp(
          Math.abs(facing) * (0.25 + 0.75 * gloss),
          0,
          0.9,
        );
        ctx.strokeStyle = colours.gloss;
        ctx.lineCap = "round";
        ctx.lineWidth = Math.max(
          0.8,
          (thick[mid] ?? W) * lerp(0.2, 0.09, gloss),
        );
        ctx.beginPath();
        for (let q = s + 1; q < e; q += 1) {
          const i = q % N;
          const off = side * (thick[i] ?? W) * 0.24;
          const x = (px[i] ?? 0) + (nx[i] ?? 0) * off;
          const y = (py[i] ?? 0) + (ny[i] ?? 0) * off;
          if (q === s + 1) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  };

  const draw = () => {
    if (!ctx || !cfg || !visible || w < 2) return;
    ctx.setTransform(dprNow, 0, 0, dprNow, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.setTransform(
      dprNow * view.scale,
      0,
      0,
      dprNow * view.scale,
      dprNow * view.ox,
      dprNow * view.oy,
    );
    const pins = pinsAt(theta);
    refill();
    drawMachine(pins);
    drawRope();
    drawPins(pins);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const tick = (now: number) => {
    raf = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = cfg.motionSafe ? step(dt) : false;
    draw();
    if (moving) raf = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || raf || !visible || document.hidden || !ctx) return;
    raf = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const css = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "gray";
    };
    const stripes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const v = rgb(css(i));
      stripeRgb[i] = [v[0], v[1], v[2]];
      stripes.push(`rgb(${v[0]}, ${v[1]}, ${v[2]})`);
    }
    const m = rgb(css(3));
    const md = rgb(css(4));
    const ml = rgb(css(5));
    colours = {
      stripes,
      blend: stripes[0] ?? "pink",
      metal: `rgb(${m[0]}, ${m[1]}, ${m[2]})`,
      metalDark: `rgb(${md[0]}, ${md[1]}, ${md[2]})`,
      metalLight: `rgb(${ml[0]}, ${ml[1]}, ${ml[2]})`,
      shade: "rgba(40, 10, 20, 0.16)",
      gloss: "rgba(255, 255, 255, 0.95)",
    };
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    if (nw < 2 || nh < 2) return;
    w = nw;
    h = nh;
    dprNow = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dprNow);
    canvas.height = Math.round(h * dprNow);
    view.scale = Math.min(w / VW, h / VH);
    view.ox = (w - VW * view.scale) / 2 - VX * view.scale;
    view.oy = (h - VH * view.scale) / 2 - VY * view.scale;
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
        readColours();
        lay(0);
        rest0();
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      if (was.dpr !== next.dpr) resize();
      if (!next.motionSafe && was.motionSafe) rest0();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    setVisible(v) {
      visible = v;
      if (v) {
        draw();
        kick();
      }
    },
    wake() {
      draw();
      kick();
    },
    motor(next) {
      // The machine is already running when it first appears.
      if (!motorSet) omega = next;
      motorSet = true;
      target = next;
      if (cfg && !cfg.motionSafe) omega = next;
      kick();
    },
    hold(next) {
      if (next === null) {
        held = null;
      } else {
        if (held === null) heldPrev = next;
        held = next;
        if (cfg && !cfg.motionSafe) {
          theta = next;
          rest0();
          draw();
        }
      }
      kick();
    },
    angle: () => theta,
    frame: () => ({ ...view }),
    freshBatch() {
      lay(cfg?.motionSafe ? 70 : 0);
      if (!cfg?.motionSafe) rest0();
      report.current(0, 3, true);
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

const STILL_ROPE =
  "M 112 66 Q 150 36 200 30 Q 236 28 240 58 Q 246 92 214 116 Q 168 146 128 118 Q 98 94 112 66 Z";

/**
 * A candy-pulling machine: a fixed steel pin in the middle and two arms whose
 * pins orbit their own axles, mirror to each other, with a glossy rope of
 * sugar looped over all three. The rope is a soft body — a closed chain of
 * particles under gravity, pushed out by the pins and carried by their grip —
 * and the sugar is plastic: a span pulled long keeps some of its new length
 * and necks down thinner, then slowly gathers back. Every time the arms come
 * round the rope is folded over the middle pin and its stripes double, the
 * finer stripes running out along the rope from the fold, until they are fine
 * enough to read as satin; the sugar lightens as air is worked in. A gloss
 * highlight runs along the side of every span that faces a slowly swaying
 * light.
 *
 * It is a `role="slider"` for the motor's speed. Drag an arm round and it
 * follows your hand 1:1; release and the motor takes the throw's speed,
 * forwards or backwards, the flywheel easing to it on the drift spring. Keys:
 * ←/→ step the speed, Home/End run it flat out either way, Space stops and
 * restarts it, Enter drops a fresh batch. Under reduced motion the candy hangs
 * still on the pins.
 */
export function PulledSugar({
  speed,
  defaultSpeed = 18,
  onSpeedChange,
  stretch = 0.5,
  gloss = 0.6,
  palette = "berry",
  colors,
  batch = 8,
  maxSpeed = 60,
  ropeWidth = 24,
  onFold,
  label = "Candy puller speed",
  paused = false,
  disabled = false,
  seed = 3,
  dpr = 2,
  className,
}: PulledSugarProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const top = Math.round(clamp(maxSpeed, 10, 90));
  const bottom = -top;
  const [own, setOwn] = React.useState(() =>
    Math.round(clamp(defaultSpeed, -top, top)),
  );
  const current = Math.round(clamp(speed ?? own, -top, top));
  const [stripes, setStripes] = React.useState(3);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const resume = React.useRef(
    current || Math.round(clamp(defaultSpeed, -top, top)) || 18,
  );
  const stripeColours =
    colors && colors.length >= 3
      ? [colors[0] ?? "", colors[1] ?? "", colors[2] ?? ""]
      : (PALETTES[palette] ?? PALETTES.berry);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const shown = React.useRef(current);
  const grab = React.useRef({
    axle: AXLE_L,
    mirror: 1,
    angle: 0,
    theta: 0,
    tracker: createVelocityTracker(),
  });

  const config: Config = {
    stretch,
    gloss,
    batch,
    ropeWidth,
    paused,
    seed,
    dpr,
    motionSafe,
    colorKey: stripeColours.join("|"),
  };
  const latest = React.useRef(config);
  const onReport = React.useRef<FoldReport>(() => {});
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
    onReport.current = (folds, count, fresh) => {
      setStripes(count);
      if (fresh) setSaid((s) => ({ n: s.n + 1, text: "A fresh batch." }));
      onFold?.(folds, count);
    };
  });

  const toOmega = (rpm: number) => (rpm * Math.PI * 2) / 60;

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, onReport);
    engine.current = e;
    e.configure(latest.current);
    e.motor(toOmega(shown.current));
    e.setVisible(visibleRef.current);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
    };
  }, []);

  React.useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    engine.current?.motor(toOmega(current));
  }, [current]);

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

  /** Sets the motor and reports it, from the throw or key that chose it. */
  const commit = (rpm: number) => {
    const next = Math.round(clamp(rpm, -top, top));
    if (next !== 0) resume.current = next;
    if (speed === undefined) {
      setOwn(next);
      shown.current = next;
      engine.current?.motor(toOmega(next));
    } else engine.current?.motor(toOmega(current));
    if (next !== current) onSpeedChange?.(next);
  };

  const pointerAngle = (
    x: number,
    y: number,
    axle: { x: number; y: number },
  ) => {
    const e = engine.current;
    const root = rootRef.current;
    if (!e || !root) return 0;
    const r = root.getBoundingClientRect();
    const f = e.frame();
    const mx = (x - r.left - f.ox) / f.scale;
    const my = (y - r.top - f.oy) / f.scale;
    return Math.atan2(my - axle.y, mx - axle.x);
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      const e = engine.current;
      const root = rootRef.current;
      if (!e || !root) return;
      const r = root.getBoundingClientRect();
      const f = e.frame();
      const mx = (point.x - r.left - f.ox) / f.scale;
      const g = grab.current;
      // The arm on the side you grabbed.
      g.axle = mx < PIN_C.x ? AXLE_L : AXLE_R;
      g.mirror = mx < PIN_C.x ? 1 : -1;
      g.angle = pointerAngle(point.x, point.y, g.axle);
      g.theta = e.angle();
      g.tracker.reset();
      g.tracker.push(g.theta, 0, performance.now());
      e.hold(g.theta);
    },
    onMove: ({ point }) => {
      const e = engine.current;
      if (!e) return;
      const g = grab.current;
      const a = pointerAngle(point.x, point.y, g.axle);
      let d = a - g.angle;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      g.angle = a;
      // The right arm turns the other way round: it mirrors the left.
      g.theta += g.mirror === 1 ? d : -d;
      g.tracker.push(g.theta, 0, performance.now());
      e.hold(g.theta);
    },
    onEnd: () => {
      const e = engine.current;
      if (!e) return;
      const rpm = (grab.current.tracker.velocity().x * 60) / TAU;
      e.hold(null);
      // Let go of a still arm and the motor carries on; throw it and the
      // motor takes the throw.
      commit(Math.abs(rpm) < 4 ? current : rpm);
    },
    onCancel: () => engine.current?.hold(null),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const stepBy = event.shiftKey ? 18 : 6;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = shown.current + stepBy;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = shown.current - stepBy;
        break;
      case "Home":
        next = -top;
        break;
      case "End":
        next = top;
        break;
      case " ":
        next = shown.current === 0 ? resume.current : 0;
        break;
      case "Enter":
        event.preventDefault();
        engine.current?.freshBatch();
        return;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  };

  const valueText =
    current === 0
      ? `Stopped, ${stripes} stripes`
      : `Pulling ${current > 0 ? "forwards" : "backwards"} at ${Math.abs(current)} turns a minute, ${stripes} stripes`;

  return (
    <div
      ref={bindRoot}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={`${uid}-hint`}
      aria-valuemin={bottom}
      aria-valuemax={top}
      aria-valuenow={current}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/pulled-sugar relative isolate h-56 w-full touch-none rounded-3 outline-none select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        className,
      )}
    >
      {/* The still: the server's frame and the first paint. */}
      <svg
        aria-hidden
        viewBox={`${VX} ${VY} ${VW} ${VH}`}
        preserveAspectRatio="xMidYMid meet"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/pulled-sugar:opacity-0"
      >
        <g className="stroke-ink-3" strokeWidth={6} strokeLinecap="round">
          <line x1={AXLE_L.x} y1={AXLE_L.y} x2={AXLE_L.x - ARM} y2={AXLE_L.y} />
          <line x1={AXLE_R.x} y1={AXLE_R.y} x2={AXLE_R.x - ARM} y2={AXLE_R.y} />
        </g>
        <path
          d={STILL_ROPE}
          fill="none"
          strokeLinejoin="round"
          strokeWidth={24}
          style={{ stroke: stripeColours[0] }}
        />
        <path
          d={STILL_ROPE}
          fill="none"
          strokeLinejoin="round"
          strokeWidth={15}
          style={{ stroke: stripeColours[1] }}
        />
        <path
          d={STILL_ROPE}
          fill="none"
          strokeLinejoin="round"
          strokeWidth={5}
          style={{ stroke: stripeColours[2] }}
        />
        <g className="fill-ink-3">
          {[
            [PIN_C.x, PIN_C.y],
            [AXLE_L.x - ARM, AXLE_L.y],
            [AXLE_R.x - ARM, AXLE_R.y],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={PIN_R + 1.5} />
          ))}
        </g>
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/pulled-sugar:opacity-100"
      />
      <span id={`${uid}-hint`} className="sr-only">
        Drag an arm round to turn the machine faster, slower or backwards, or
        use the arrow keys. Space stops and starts it; Enter drops a fresh
        batch.
      </span>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        {[
          ...stripeColours,
          "oklch(from var(--ink-3) 0.78 0.01 h)",
          "oklch(from var(--ink-3) 0.46 0.015 h)",
          "oklch(from var(--ink-3) 0.97 0.005 h)",
        ].map((colour, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: colour }}
          />
        ))}
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
