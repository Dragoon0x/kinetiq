"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MicaDriftProps = {
  /** Content above the liquid, in a readable layer. */
  children?: React.ReactNode;
  /** Flakes in a 760 × 232 box; scaled by area, from 120 to 2400. @default 1200 */
  flakeCount?: number;
  /** Where the light comes from when the pointer is away, degrees: 0 from the right, 90 from above. @default 135 */
  lightAngle?: number;
  /** How thick the liquid is, 0 to 1: thin and lively to slow, heavy settling. @default 0.5 */
  viscosity?: number;
  /** Flake size, 0.5 to 2. @default 1 */
  flakeSize?: number;
  /** How bright a flake flashes, 0 to 1. @default 0.8 */
  shimmer?: number;
  /** The flash's colour, any CSS colour. @default "color-mix(in oklab, var(--warn) 22%, white)" */
  glintColor?: string;
  /** The flakes' own dim colour. @default "oklch(from var(--warn) 0.72 0.045 h)" */
  flakeColor?: string;
  /** The liquid: fixed art, dark in both themes. @default "color-mix(in oklab, var(--accent) 16%, black)" */
  liquid?: string;
  /** How much depth the field has, 0 (flat) to 1: far flakes smaller, fainter, slower. @default 0.6 */
  depth?: number;
  /** The pointer carries the light and a click stirs. @default true */
  interactive?: boolean;
  /** Strength of a click's swirl, 0 to 2. @default 1 */
  stir?: number;
  /** Hold every flake where it is. @default false */
  paused?: boolean;
  /** Seeds every flake. @default 11 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Name of the keyboard handle that turns the light. @default "Mica in liquid" */
  label?: string;
  /** Fires when the keyboard turns the light, with its new angle in degrees. */
  onLightAngleChange?: (angle: number) => void;
  /** Sizes the box; the liquid fills it. */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;
/** How tight a flash is: a face must meet the light within a few degrees. */
const SHINE = 90;
const BUCKETS = 5;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.9, 0.85, 0.7];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

const rgba = (c: [number, number, number], a: number) =>
  `rgb(${Math.round(clamp01(c[0]) * 255)} ${Math.round(clamp01(c[1]) * 255)} ${Math.round(clamp01(c[2]) * 255)} / ${Math.round(clamp01(a) * 1000) / 1000})`;

type Config = {
  flakeCount: number;
  angle: number;
  viscosity: number;
  flakeSize: number;
  shimmer: number;
  depth: number;
  interactive: boolean;
  stir: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  point: (x: number, y: number) => void;
  away: () => void;
  stirAt: (x: number, y: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement,
  visible: React.RefObject<boolean>,
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let disposed = false;
  let glintRGB: [number, number, number] = [1, 0.95, 0.85];
  let flakeRGB: [number, number, number] = [0.75, 0.7, 0.6];
  const bucketStyle: string[] = [];
  let sprite: { flash: HTMLCanvasElement; glow: HTMLCanvasElement } | null =
    null;
  let builtFor = "";
  let n = 0;
  let x = new Float32Array(0);
  let y = new Float32Array(0);
  let z = new Float32Array(0);
  let size = new Float32Array(0);
  let tilt0 = new Float32Array(0);
  let rock = new Float32Array(0);
  let rockRate = new Float32Array(0);
  let phase = new Float32Array(0);
  let az = new Float32Array(0);
  let azRate = new Float32Array(0);
  let azBase = new Float32Array(0);
  /** The flake's facing this frame: the liquid's flow, plus its own lean. */
  let effAz = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);
  let spin = new Float32Array(0);
  let bucket = new Uint8Array(0);
  let glint = new Float32Array(0);
  let minorK = new Float32Array(0);
  let rand = lcg(11);
  /** The light: a point that rests far off at the angle and comes close to the pointer. */
  const light = { near: 0, nearV: 0, x: 0, y: 0, tx: 0, ty: 0, on: false };

  const readColours = () => {
    const kids = carriers.children;
    if (kids[0]) glintRGB = read(getComputedStyle(kids[0]).color);
    if (kids[1]) flakeRGB = read(getComputedStyle(kids[1]).color);
    bucketStyle.length = 0;
    for (let b = 0; b < BUCKETS; b += 1) {
      // Five brightness steps, from the flake's dim body to most of the way
      // to the flash colour.
      const t = b / (BUCKETS - 1);
      const c: [number, number, number] = [
        lerp(flakeRGB[0], glintRGB[0], t * 0.8),
        lerp(flakeRGB[1], glintRGB[1], t * 0.8),
        lerp(flakeRGB[2], glintRGB[2], t * 0.8),
      ];
      bucketStyle.push(rgba(c, lerp(0.2, 0.95, t)));
    }
    sprite = null;
    draw();
  };

  /** The flash (a soft core and a four-point flare) and the bloom, drawn once per colour and ratio. */
  const ensureSprite = () => {
    if (sprite) return sprite;
    const glow = document.createElement("canvas");
    glow.width = 128;
    glow.height = 128;
    const gg = glow.getContext("2d");
    if (gg) {
      const grad = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, rgba(glintRGB, 1));
      grad.addColorStop(1, rgba(glintRGB, 0));
      gg.fillStyle = grad;
      gg.fillRect(0, 0, 128, 128);
    }
    const s = document.createElement("canvas");
    const px = Math.round(48 * dpr);
    s.width = px;
    s.height = px;
    const g = s.getContext("2d");
    if (g) {
      const c = px / 2;
      const core = g.createRadialGradient(c, c, 0, c, c, c * 0.42);
      core.addColorStop(0, rgba(glintRGB, 1));
      core.addColorStop(0.25, rgba(glintRGB, 0.55));
      core.addColorStop(1, rgba(glintRGB, 0));
      g.fillStyle = core;
      g.fillRect(0, 0, px, px);
      g.globalCompositeOperation = "lighter";
      for (const [angle, reach, width] of [
        [0, 0.5, 0.05],
        [Math.PI / 2, 0.5, 0.05],
        [Math.PI / 4, 0.26, 0.035],
        [-Math.PI / 4, 0.26, 0.035],
      ] as const) {
        g.save();
        g.translate(c, c);
        g.rotate(angle);
        const ray = g.createLinearGradient(-c * reach, 0, c * reach, 0);
        ray.addColorStop(0, rgba(glintRGB, 0));
        ray.addColorStop(0.5, rgba(glintRGB, 0.9));
        ray.addColorStop(1, rgba(glintRGB, 0));
        g.fillStyle = ray;
        g.fillRect(-c * reach, -c * width, c * reach * 2, c * width * 2);
        g.restore();
      }
    }
    sprite = { flash: s, glow };
    return sprite;
  };

  const alloc = (count: number) => {
    n = count;
    x = new Float32Array(n);
    y = new Float32Array(n);
    z = new Float32Array(n);
    size = new Float32Array(n);
    tilt0 = new Float32Array(n);
    rock = new Float32Array(n);
    rockRate = new Float32Array(n);
    phase = new Float32Array(n);
    az = new Float32Array(n);
    azRate = new Float32Array(n);
    azBase = new Float32Array(n);
    effAz = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    spin = new Float32Array(n);
    bucket = new Uint8Array(n);
    glint = new Float32Array(n);
    minorK = new Float32Array(n);
  };

  /** Seeds the field for this size, count and seed. */
  const build = () => {
    const c = cfg;
    if (!c || W < 1 || H < 1) return;
    const count = clamp(
      Math.round((clamp(c.flakeCount, 50, 4000) * (W * H)) / (760 * 232)),
      120,
      2400,
    );
    const key = `${count}|${c.seed}|${Math.round(W)}|${Math.round(H)}`;
    if (key === builtFor) return;
    builtFor = key;
    alloc(count);
    rand = lcg(c.seed);
    for (let i = 0; i < n; i += 1) {
      x[i] = rand() * W;
      y[i] = rand() * H;
      // More flakes far than near, as in any volume seen from the front.
      z[i] = Math.sqrt(rand());
      size[i] = 0.5 + rand() * rand() * 1.5;
      tilt0[i] = (rand() - 0.5) * 0.6;
      rock[i] = 0.08 + rand() * 0.3;
      rockRate[i] = 0.35 + rand() * 0.9;
      phase[i] = rand() * TAU;
      azBase[i] = (rand() - 0.5) * 1.1;
      az[i] = azBase[i] ?? 0;
      azRate[i] = (rand() - 0.5) * 0.5;
    }
  };

  const measure = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    W = w;
    H = h;
    const next = Math.min(
      window.devicePixelRatio || 1,
      clamp(c?.dpr ?? 2, 0.5, 2),
    );
    if (next !== dpr) sprite = null;
    dpr = next;
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    build();
  };

  let lx = 0;
  let ly = 0;
  let lz = 1;
  /** Where the light is now, in px, with its height above the liquid (written to lx, ly, lz). */
  const lightPos = () => {
    const c = cfg;
    const a = (((c?.angle ?? 135) + Math.sin(clock * 0.7) * 4) * Math.PI) / 180;
    const far = Math.max(W, H) * 2.2;
    const fx = W / 2 + Math.cos(a) * far;
    const fy = H / 2 - Math.sin(a) * far;
    const fz = Math.max(W, H) * 1.1;
    const nz = Math.min(W, H) * 0.6;
    const k = clamp01(light.near);
    lx = lerp(fx, light.x, k);
    ly = lerp(fy, light.y, k);
    lz = lerp(fz, nz, k);
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    clock += dt;
    const visc = clamp01(c.viscosity);
    const sink = lerp(1.35, 0.35, visc);
    const turn = lerp(1.5, 0.35, visc);
    const damp = Math.exp(-lerp(1.1, 4.8, visc) * dt);
    const depth = clamp01(c.depth);
    for (let i = 0; i < n; i += 1) {
      const zi = z[i] ?? 0;
      const near = 1 - zi * depth * 0.6;
      const s = size[i] ?? 1;
      // A slow seeded current: a few sines, never a random call.
      const yy = y[i] ?? 0;
      const xx = x[i] ?? 0;
      const cur =
        Math.sin(yy * 0.011 + clock * 0.13 + (phase[i] ?? 0) * 0.3) * 4 +
        Math.sin(xx * 0.007 - clock * 0.09) * 2.5;
      const fall = (5 + 11 * s) * sink * near;
      const nvx = (vx[i] ?? 0) * damp;
      const nvy = (vy[i] ?? 0) * damp;
      vx[i] = nvx;
      vy[i] = nvy;
      let nx = xx + (cur * near + nvx) * dt;
      let ny = yy + (fall + nvy) * dt;
      if (ny > H + 6) {
        ny = -6;
        nx = rand() * W;
      } else if (ny < -8) ny = H + 4;
      if (nx < -6) nx += W + 12;
      else if (nx > W + 6) nx -= W + 12;
      x[i] = nx;
      y[i] = ny;
      const sp = (spin[i] ?? 0) * damp;
      spin[i] = sp;
      phase[i] = (phase[i] ?? 0) + (rockRate[i] ?? 1) * turn * dt + sp * dt;
      // Its own lean wanders and spins with a stir, and the liquid draws it
      // back into line with the flow, faster the thicker it is.
      const wander =
        Math.sin(clock * (azRate[i] ?? 0) + (phase[i] ?? 0)) * 0.25;
      const base = (azBase[i] ?? 0) + wander;
      const ai = az[i] ?? 0;
      az[i] = ai + (sp * 0.6 + (base - ai) * lerp(0.4, 1.6, visc)) * dt;
    }
    // The light comes to the pointer on the drift constants, critically
    // damped, and follows it closely once there.
    const d = springs.drift;
    const target = light.on ? 1 : 0;
    light.nearV +=
      ((-d.stiffness * (light.near - target) - d.damping * light.nearV) /
        d.mass) *
      dt;
    light.near = clamp(light.near + light.nearV * dt, 0, 1);
    const follow = 1 - Math.exp(-dt / 0.06);
    light.x += (light.tx - light.x) * follow;
    light.y += (light.ty - light.y) * follow;
  };

  function draw() {
    const c = cfg;
    if (!ctx || !c || W < 1 || n === 0 || bucketStyle.length === 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lightPos();
    // A faint bloom in the liquid where the light reaches it.
    const gx = clamp(lx, -W * 0.2, W * 1.2);
    const gy = clamp(ly, -H * 0.3, H * 1.3);
    const reach = Math.max(W, H) * 0.7;
    const { glow } = ensureSprite();
    ctx.globalAlpha = 0.07 + 0.05 * light.near;
    ctx.drawImage(glow, gx - reach, gy - reach, reach * 2, reach * 2);
    ctx.globalAlpha = 1;
    const scale = clamp(c.flakeSize, 0.4, 2.5);
    const depth = clamp01(c.depth);
    const shimmer = clamp01(c.shimmer);
    // Per flake: its normal, the half vector to the light, and the flash.
    for (let i = 0; i < n; i += 1) {
      const fx = x[i] ?? 0;
      const fy = y[i] ?? 0;
      // Flakes in a moving liquid line up with its flow, so neighbours face
      // nearly the same way: the field is a slow sum of sines in place and
      // time, and each flake only leans a little off it. That is what turns
      // single sparks into bands of glints that sweep with the light.
      const flowA =
        1.3 * Math.sin(fx * 0.01 + fy * 0.004 + clock * 0.12) +
        1.1 * Math.sin(fy * 0.015 - fx * 0.003 - clock * 0.09);
      const flowT =
        0.45 + 0.35 * Math.sin(fx * 0.008 - fy * 0.011 + clock * 0.1);
      const t =
        flowT + (tilt0[i] ?? 0) + Math.sin(phase[i] ?? 0) * (rock[i] ?? 0);
      const st = Math.sin(t);
      const ct = Math.cos(t);
      const a = flowA + (az[i] ?? 0);
      effAz[i] = a;
      const nx = st * Math.cos(a);
      const ny = st * Math.sin(a);
      const nz = ct;
      minorK[i] = Math.max(0.18, Math.abs(ct));
      let ldx = lx - (x[i] ?? 0);
      let ldy = ly - (y[i] ?? 0);
      let ldz = lz;
      const ll = Math.hypot(ldx, ldy, ldz) || 1;
      ldx /= ll;
      ldy /= ll;
      ldz /= ll;
      // Half vector with the view straight on (0, 0, 1). A plate flashes from
      // either face, so the sign of the dot does not matter.
      const hx = ldx;
      const hy = ldy;
      const hz = ldz + 1;
      const hl = Math.hypot(hx, hy, hz) || 1;
      const dot = Math.abs((nx * hx + ny * hy + nz * hz) / hl);
      const fade = 1 - (z[i] ?? 0) * depth * 0.5;
      // Two lobes: a broad sheen that brightens a whole band of flakes, and
      // the tight flash only a face square to the light gives.
      const sheen = Math.pow(dot, 8) * fade;
      const g = Math.pow(dot, SHINE) * shimmer * fade;
      glint[i] = g;
      bucket[i] = Math.min(
        BUCKETS - 1,
        Math.round(clamp01(sheen * 1.05 + g * 2) * (BUCKETS - 1)),
      );
    }
    // Bodies, batched by brightness: one path per step.
    for (let b = 0; b < BUCKETS; b += 1) {
      ctx.fillStyle = bucketStyle[b] ?? "transparent";
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        if (bucket[i] !== b) continue;
        const zi = z[i] ?? 0;
        const r = (size[i] ?? 1) * scale * (1.5 - zi * depth * 0.8);
        const a = effAz[i] ?? 0;
        // A disc seen at an angle: the long axis across the tilt, the short
        // one shrunk by how far it is turned away.
        const ux = -Math.sin(a);
        const uy = Math.cos(a);
        const minor = (minorK[i] ?? 1) * r;
        const px = x[i] ?? 0;
        const py = y[i] ?? 0;
        const ax = ux * r;
        const ay = uy * r;
        const bx = -uy * minor;
        const by = ux * minor;
        ctx.moveTo(px + ax, py + ay);
        ctx.lineTo(px + bx * 0.9 + ax * 0.35, py + by * 0.9 + ay * 0.35);
        ctx.lineTo(px + bx * 0.9 - ax * 0.45, py + by * 0.9 - ay * 0.45);
        ctx.lineTo(px - ax, py - ay);
        ctx.lineTo(px - bx * 0.9 - ax * 0.35, py - by * 0.9 - ay * 0.35);
        ctx.lineTo(px - bx * 0.9 + ax * 0.45, py - by * 0.9 + ay * 0.45);
        ctx.closePath();
      }
      ctx.fill();
    }
    // Flashes: a sprite each, added to the light already there.
    const spr = ensureSprite().flash;
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < n; i += 1) {
      const g = glint[i] ?? 0;
      if (g < 0.03) continue;
      const zi = z[i] ?? 0;
      const s = (5 + 26 * Math.min(1, g)) * scale * (1.2 - zi * depth * 0.5);
      ctx.globalAlpha = Math.min(1, g * 1.4);
      ctx.drawImage(spr, (x[i] ?? 0) - s / 2, (y[i] ?? 0) - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || c.paused) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
    last = time;
    if (c.motionSafe) step(dt);
    else {
      // Reduced motion: the flakes hold still; only the light moves, and it
      // goes straight where it is put.
      light.near = light.on ? 1 : 0;
      light.x = light.tx;
      light.y = light.ty;
    }
    draw();
    if (c.motionSafe) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  function kick() {
    if (disposed || frame || !visible.current || document.hidden || cfg?.paused)
      return;
    frame = window.requestAnimationFrame(tick);
  }

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (!was || was.dpr !== next.dpr) measure();
      else build();
      if (!was || was.colourKey !== next.colourKey) readColours();
      draw();
      kick();
    },
    resize() {
      measure();
      draw();
      kick();
    },
    readColours,
    point(px, py) {
      const c = cfg;
      if (!c || !c.interactive) return;
      if (!light.on && light.near < 0.02) {
        light.x = px;
        light.y = py;
      }
      light.on = true;
      light.tx = px;
      light.ty = py;
      kick();
    },
    away() {
      light.on = false;
      kick();
    },
    stirAt(px, py) {
      const c = cfg;
      if (!c || !c.motionSafe || n === 0) return;
      const radius = Math.min(W, H) * 0.55 + 40;
      const strength = 170 * clamp(c.stir, 0, 2);
      for (let i = 0; i < n; i += 1) {
        const dx = (x[i] ?? 0) - px;
        const dy = (y[i] ?? 0) - py;
        const d = Math.hypot(dx, dy);
        if (d > radius || d < 0.01) continue;
        const f = Math.pow(1 - d / radius, 2);
        // A swirl: mostly around the click, a little outward.
        vx[i] = (vx[i] ?? 0) + ((-dy / d) * 1 + (dx / d) * 0.25) * strength * f;
        vy[i] = (vy[i] ?? 0) + ((dx / d) * 1 + (dy / d) * 0.25) * strength * f;
        spin[i] = (spin[i] ?? 0) + (2 + 6 * f) * clamp(c.stir, 0, 2);
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      sprite = null;
      alloc(0);
    },
  };
}

const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

/**
 * Fine flakes of mica suspended in a dark liquid, as a background with your
 * content above it. Each flake is a thin plate that sinks slowly, drifts on a
 * seeded current and rocks as it falls, turning its faces through every
 * angle; it is dim, until the instant its face meets the light, when it
 * flashes — the half vector between the light and the eye is checked for
 * every flake every frame. The light rests far off at `lightAngle`; bring the
 * pointer in and it comes close, so the angle each flake needs changes across
 * the field and a wave of glints follows the hand. A click stirs the liquid
 * into a swirl that spins the flakes up, and the liquid takes the energy back.
 *
 * The flakes are Canvas 2D, batched by brightness, with a pre-drawn sprite per
 * flash; the loop runs only while the box is on screen and the tab visible.
 * The keyboard turns the light with the arrow keys and stirs with Enter.
 * Under reduced motion the flakes hold still; the light still turns, and each
 * turn relights the still field.
 */
export function MicaDrift({
  children,
  flakeCount = 1200,
  lightAngle = 135,
  viscosity = 0.5,
  flakeSize = 1,
  shimmer = 0.8,
  glintColor = "color-mix(in oklab, var(--warn) 22%, white)",
  flakeColor = "oklch(from var(--warn) 0.72 0.045 h)",
  liquid = "color-mix(in oklab, var(--accent) 16%, black)",
  depth = 0.6,
  interactive = true,
  stir = 1,
  paused = false,
  seed = 11,
  dpr = 2,
  label = "Mica in liquid",
  onLightAngleChange,
  className,
}: MicaDriftProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  // The keyboard turns the light from wherever the prop last put it.
  const [angle, setAngle] = React.useState(lightAngle);
  const [fromProp, setFromProp] = React.useState(lightAngle);
  if (fromProp !== lightAngle) {
    setFromProp(lightAngle);
    setAngle(lightAngle);
  }
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const config: Config = {
    flakeCount,
    angle,
    viscosity,
    flakeSize,
    shimmer,
    depth,
    interactive,
    stir,
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey: `${glintColor}|${flakeColor}`,
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
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
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
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.resize();
    });
    watcher.observe(node);
    const onVisibility = () => {
      if (!document.hidden) engine.current?.resize();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: 0, y: 0 };
  };

  const turn = (by: number) => {
    const next = ((Math.round(angle + by) % 360) + 360) % 360;
    setAngle(next);
    setSaid((s) => ({ n: s.n + 1, text: `Light from ${next} degrees.` }));
    onLightAngleChange?.(next);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!interactive) return;
    const by = event.shiftKey ? 45 : 15;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      turn(by);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      turn(-by);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      const root = rootRef.current;
      engine.current?.stirAt(
        (root?.clientWidth ?? 0) / 2,
        (root?.clientHeight ?? 0) / 2,
      );
      setSaid((s) => ({
        n: s.n + 1,
        text: motionSafe ? "Stirred." : "Stirred; the flakes are held still.",
      }));
    }
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (!interactive) return;
        const at = local(event.clientX, event.clientY);
        engine.current?.point(at.x, at.y);
      }}
      onPointerLeave={() => engine.current?.away()}
      onPointerDown={(event) => {
        if (!interactive) return;
        const target = event.target instanceof Element ? event.target : null;
        const own = target?.closest("[data-mica-handle]");
        if (!own && target?.closest(INTERACTIVE)) return;
        const at = local(event.clientX, event.clientY);
        engine.current?.point(at.x, at.y);
        engine.current?.stirAt(at.x, at.y);
      }}
      className={cn(
        "group/mica-drift relative isolate overflow-clip",
        className,
      )}
      style={{
        backgroundColor: liquid,
        backgroundImage: `linear-gradient(180deg, color-mix(in oklab, ${liquid}, white 7%), color-mix(in oklab, ${liquid}, black 35%))`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {interactive ? (
        <button
          type="button"
          data-mica-handle=""
          aria-label={label}
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute inset-0 z-0 size-full cursor-default rounded-[inherit] outline-none",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        />
      ) : null}
      <div className="relative z-10 size-full">{children}</div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span
          className="transition-colors duration-1"
          style={{ color: glintColor }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: flakeColor }}
        />
      </span>
      <span id={hintId} className="sr-only">
        The light falls from {angle} degrees. Left and Right turn it, Shift for
        larger steps; Enter or Space stirs the liquid.
      </span>
      <span aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
