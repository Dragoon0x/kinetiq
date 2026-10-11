"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type FacetLaserProps = {
  /** How many hairline beams leave the crystal, 3 to 24. @default 9 */
  beamCount?: number;
  /** How smoky the room is, 0 (clear: only the hits show) to 1 (the beams hang in the air). @default 0.5 */
  haze?: number;
  /** How fast an engraving cools from white through the laser's colour to ember and fades, 0 (slow) to 1 (fast). @default 0.5 */
  cooling?: number;
  /** The laser's colour, any CSS colour; taken at a fixed lightness per theme. @default "var(--danger)" */
  color?: string;
  /** The crystal's facets: how many detents a turn has, 5 to 12. @default 8 */
  facets?: number;
  /** The crystal's angle in degrees (controlled). */
  angle?: number;
  /** The angle it starts at when uncontrolled, degrees. @default 0 */
  defaultAngle?: number;
  /** Fires with the facet angle (0–359) a key, a drag or a throw settles on. */
  onAngleChange?: (angle: number) => void;
  /** Fires when a hand or a key starts turning the crystal (true) and when it has settled on a facet (false). */
  onTurningChange?: (turning: boolean) => void;
  /** How fast the crystal turns by itself while untouched, degrees a second, 0 to 30. @default 6 */
  drift?: number;
  /** How long a thrown turn coasts before it settles on a facet, 0 to 1. @default 0.6 */
  momentum?: number;
  /** How wide the crown of beams opens toward the walls, 0 (a tight cone) to 1 (wide). @default 0.6 */
  spread?: number;
  /** Dragging and the keys turn the crystal. @default true */
  interactive?: boolean;
  /** Hold the drift and the smoke still; the hand still turns it. @default false */
  paused?: boolean;
  /** Seeds the beams' directions, so two crystals cut differently. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The crystal's accessible name. @default "Crystal" */
  label?: string;
  /** The room is drawn and holds still; drag and keys are ignored. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
  /** Content over the room, bottom left: a caption, a label. */
  children?: React.ReactNode;
};

type Rgb = readonly [number, number, number];

const MAX_BEAMS = 24;
/** Trail samples kept per beam: about two turns at the sampling step. */
const TRAIL = 360;
/** A new trail sample every this many degrees of turn. */
const SAMPLE_DEG = 1.2;
const HEAT_BUCKETS = 10;
const STEP = 1 / 240;
const CALM_FRAME = 31;
/** Untouched this long, the drift resumes, ramping in over a second. */
const RESUME = 1.6;
/** Reduced motion: engravings fade in still steps this far apart, ms. */
const STILL_STEP = 1200;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const mod = (v: number, m: number) => ((v % m) + m) % m;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as sRGB bytes, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];
const css = ([r, g, b]: Rgb, a = 1) =>
  a >= 1
    ? `rgb(${r}, ${g}, ${b})`
    : `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;

/** The laser as a pigment: bright on a dark page, deep on a pale one; its ember and its white-hot core. */
const beamOf = (c: string) => `oklch(from ${c} 0.72 calc(c * 1.05) h)`;
const inkOf = (c: string) => `oklch(from ${c} 0.52 c h)`;
const emberOf = (c: string) =>
  `oklch(from ${c} 0.42 calc(c * 0.8) calc(h + 18))`;
const coreOf = (c: string) => `oklch(from ${c} 0.97 calc(c * 0.12) h)`;

/** A small value-noise texture for the smoke, seeded, drawn once per look. */
function smokeTexture(seed: number, tint: Rgb, dark: boolean) {
  const w = 96;
  const h = 48;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const rand = lcg(seed * 31 + 7);
  const grid: number[] = [];
  const gw = 9;
  const gh = 5;
  for (let i = 0; i < gw * gh; i += 1) grid.push(rand());
  const at = (x: number, y: number) =>
    grid[(mod(y, gh) * gw + mod(x, gw)) % grid.length] ?? 0;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let v = 0;
      let amp = 0.6;
      let f = 1;
      for (let o = 0; o < 3; o += 1) {
        // Wraps on the texture's own size, so it can be tiled as it drifts.
        const fx = (x / w) * (gw - 1) * f;
        const fy = (y / h) * (gh - 1) * f;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = fx - ix;
        const ty = fy - iy;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
        const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
        v += (a + (b - a) * sy) * amp;
        amp *= 0.5;
        f *= 2;
      }
      const o = (y * w + x) * 4;
      img.data[o] = tint[0];
      img.data[o + 1] = tint[1];
      img.data[o + 2] = tint[2];
      img.data[o + 3] = Math.round(
        clamp((v - 0.3) * 1.4, 0, 1) * (dark ? 70 : 60),
      );
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

type Config = {
  beamCount: number;
  haze: number;
  cooling: number;
  colorKey: string;
  facets: number;
  angle: number | undefined;
  drift: number;
  momentum: number;
  spread: number;
  interactive: boolean;
  disabled: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  /** The facet a gesture or key has committed to, reported when it is chosen. */
  onSettle: (deg: number) => void;
  /** The crystal has come to rest on it. */
  onRest: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** The hand takes the crystal. */
  grab: () => void;
  /** Turns it to an angle, degrees, while held. */
  turnTo: (deg: number) => void;
  /** Lets go with an angular velocity, degrees a second. */
  release: (velocity: number) => void;
  /** A key's turn: by whole facets, or to an absolute facet angle. */
  stepFacets: (steps: number) => void;
  home: () => void;
  angle: () => number;
  stepDeg: () => number;
  /** Degrees per pixel of drag, for this box. */
  rate: () => number;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  start: number,
): Engine {
  let cfg: Config | null = null;
  const ctx = canvas.getContext("2d");
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let dark = true;
  const read = rgbReader();
  const size = { w: 0, h: 0, dpr: 1, F: 1, D: 1 };
  const paint = {
    room: [0, 0, 0] as Rgb,
    wall: [0, 0, 0] as Rgb,
    edge: [0, 0, 0] as Rgb,
    beam: [0, 0, 0] as Rgb,
    ember: [0, 0, 0] as Rgb,
    core: [0, 0, 0] as Rgb,
    glass: [0, 0, 0] as Rgb,
    heat: [] as string[],
    glow: [] as string[],
  };
  let roomLayer: HTMLCanvasElement | null = null;
  let smoke: HTMLCanvasElement | null = null;
  let spot: HTMLCanvasElement | null = null;
  /** The crystal's angle, degrees, and its velocity; where a spring is taking it. */
  const turn = {
    deg: start,
    v: 0,
    target: start,
    held: false,
    coasting: false,
    springing: false,
  };
  let idle = RESUME;
  let lastSample = start;
  const sim = { t: 0, clock: 0 };
  /** Per beam: its cone direction (azimuth, elevation) and its trail ring. */
  const dirs = new Float32Array(MAX_BEAMS * 2);
  const tx = new Float32Array(MAX_BEAMS * TRAIL);
  const ty = new Float32Array(MAX_BEAMS * TRAIL);
  const tb = new Float64Array(MAX_BEAMS * TRAIL);
  const head = new Int32Array(MAX_BEAMS);
  const count = new Int32Array(MAX_BEAMS);
  const hits = new Float32Array(MAX_BEAMS * 2);
  /** Each trail segment's heat bucket this frame (255: not drawn). */
  const bucket = new Uint8Array(MAX_BEAMS * TRAIL);

  /** Seconds from white-hot to gone: eight when slow, one when fast. */
  const life = () => 8 - 7 * clamp(cfg?.cooling ?? 0.5, 0, 1);
  const beams = () => Math.round(clamp(cfg?.beamCount ?? 9, 3, MAX_BEAMS));

  const lay = () => {
    const c = cfg;
    if (!c) return;
    const rand = lcg(c.seed * 13 + 5);
    const n = beams();
    const s = clamp(c.spread, 0, 1);
    // From the back wall out to the side walls near the frame: a crown, not a cone.
    const lo = (22 + 14 * s) * (Math.PI / 180);
    const hi = (52 + 36 * s) * (Math.PI / 180);
    for (let i = 0; i < MAX_BEAMS; i += 1) {
      const az =
        (i / n) * Math.PI * 2 + (rand() - 0.5) * ((Math.PI * 2) / n) * 0.6;
      dirs[i * 2] = az;
      dirs[i * 2 + 1] = lo + (hi - lo) * rand();
    }
    head.fill(0);
    count.fill(0);
  };

  /** The room's camera for this box: the frame is its front opening. */
  /** The crystal and the emitter in the room, px; kept current by the resize. */
  const C = { x: 0, y: 0, z: 0 };
  const E = { x: 0, y: 0, z: 0 };
  /** The two on screen. */
  const cs = { x: 0, y: 0 };
  const es = { x: 0, y: 0 };
  const placeScene = () => {
    C.x = 0;
    C.y = size.h * 0.06;
    C.z = size.D * 0.3;
    E.x = -size.w / 2;
    E.y = size.h * 0.2;
    E.z = size.D * 0.1;
    let s = size.F / (size.F + C.z);
    cs.x = size.w / 2 + C.x * s;
    cs.y = size.h / 2 + C.y * s;
    s = size.F / (size.F + E.z);
    es.x = size.w / 2 + E.x * s;
    es.y = size.h / 2 + E.y * s;
  };
  const project = (x: number, y: number, z: number) => {
    const s = size.F / (size.F + z);
    return { x: size.w / 2 + x * s, y: size.h / 2 + y * s };
  };

  /** Where beam i strikes a wall with the crystal at `deg`, on screen. */
  const hitOf = (i: number, deg: number, out: Float32Array, at: number) => {
    const az = (dirs[i * 2] ?? 0) + (deg * Math.PI) / 180;
    const el = dirs[i * 2 + 1] ?? 0.5;
    const dx = Math.sin(el) * Math.cos(az);
    const dy = Math.sin(el) * Math.sin(az);
    const dz = Math.cos(el);
    const W = size.w / 2;
    const H = size.h / 2;
    let t = (size.D - C.z) / dz;
    if (dx > 1e-6) t = Math.min(t, (W - C.x) / dx);
    if (dx < -1e-6) t = Math.min(t, (-W - C.x) / dx);
    if (dy > 1e-6) t = Math.min(t, (H - C.y) / dy);
    if (dy < -1e-6) t = Math.min(t, (-H - C.y) / dy);
    const z = C.z + dz * t;
    const s = size.F / (size.F + z);
    out[at] = size.w / 2 + (C.x + dx * t) * s;
    out[at + 1] = size.h / 2 + (C.y + dy * t) * s;
  };

  const scratch = new Float32Array(2);
  /** Engraves every beam's hit at `deg` into its trail. */
  const sample = (deg: number, now: number) => {
    const n = beams();
    for (let i = 0; i < n; i += 1) {
      hitOf(i, deg, scratch, 0);
      const k = i * TRAIL + (head[i] ?? 0);
      tx[k] = scratch[0] ?? 0;
      ty[k] = scratch[1] ?? 0;
      tb[k] = now;
      head[i] = ((head[i] ?? 0) + 1) % TRAIL;
      count[i] = Math.min(TRAIL, (count[i] ?? 0) + 1);
    }
  };

  /** Samples the turn from the last engraved angle to `deg`, a step at a time. */
  const engrave = (deg: number, now: number) => {
    const delta = deg - lastSample;
    if (Math.abs(delta) < SAMPLE_DEG) return;
    const steps = Math.min(48, Math.floor(Math.abs(delta) / SAMPLE_DEG));
    for (let s = 1; s <= steps; s += 1) {
      sample(lastSample + (delta * s) / steps, now);
    }
    lastSample = deg;
  };

  const readColours = () => {
    const kids = carriers.children;
    const pick = (i: number): Rgb => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : [0, 0, 0];
    };
    const bg = pick(0);
    const fg = pick(1);
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    dark = lum < 0.5;
    const beam = pick(dark ? 2 : 3);
    const ember = pick(4);
    const core = pick(5);
    paint.room = dark ? mixRgb(bg, [0, 0, 0], 0.45) : mixRgb(bg, fg, 0.05);
    paint.wall = dark ? mixRgb(bg, fg, 0.05) : mixRgb(bg, fg, 0.1);
    paint.edge = dark ? mixRgb(bg, fg, 0.16) : mixRgb(bg, fg, 0.24);
    paint.beam = beam;
    paint.ember = dark ? ember : mixRgb(beam, bg, 0.55);
    paint.core = dark ? core : mixRgb(beam, [0, 0, 0], 0.2);
    paint.glass = dark ? mixRgb(bg, fg, 0.3) : mixRgb(bg, fg, 0.45);
    // Ten heats, cold to hot: ember to the laser's colour to white-hot.
    paint.heat = [];
    paint.glow = [];
    for (let b = 0; b < HEAT_BUCKETS; b += 1) {
      const h = (b + 0.5) / HEAT_BUCKETS;
      const rgb =
        h < 0.55
          ? mixRgb(paint.ember, beam, h / 0.55)
          : mixRgb(beam, paint.core, (h - 0.55) / 0.45);
      const a = clamp(h / 0.3, 0, 1) * (dark ? 0.95 : 0.9);
      paint.heat.push(css(rgb, a));
      // The halo is the laser's own colour, even round a white-hot line.
      paint.glow.push(css(beam, a * (dark ? 0.3 : 0.12)));
    }
    smoke = smokeTexture(
      cfg?.seed ?? 1,
      dark ? mixRgb(bg, fg, 0.5) : mixRgb(bg, fg, 0.35),
      dark,
    );
    spot = makeSpot();
    layRoom();
  };

  const makeSpot = () => {
    const c = document.createElement("canvas");
    const r = 16;
    c.width = r * 2;
    c.height = r * 2;
    const g = c.getContext("2d");
    if (!g) return c;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, css(paint.core, 1));
    grad.addColorStop(0.18, css(paint.beam, 0.9));
    grad.addColorStop(0.5, css(paint.beam, dark ? 0.25 : 0.15));
    grad.addColorStop(1, css(paint.beam, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    return c;
  };

  /** The room in one-point perspective: walls, their edges and a vignette, drawn once per size and look. */
  const layRoom = () => {
    if (size.w < 1) return;
    const layer = roomLayer ?? document.createElement("canvas");
    roomLayer = layer;
    layer.width = Math.round(size.w * size.dpr);
    layer.height = Math.round(size.h * size.dpr);
    const g = layer.getContext("2d");
    if (!g) return;
    const { w, h } = size;
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    g.fillStyle = css(paint.room);
    g.fillRect(0, 0, w, h);
    const W = w / 2;
    const H = h / 2;
    const b = (x: number, y: number) => project(x, y, size.D);
    const tl = b(-W, -H);
    const tr = b(W, -H);
    const br = b(W, H);
    const bl = b(-W, H);
    const face = (pts: { x: number; y: number }[], tone: Rgb, a: number) => {
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.fillStyle = css(tone, a);
      g.fill();
    };
    // Ceiling and the back wall a touch lighter than the floor and the sides.
    face([{ x: 0, y: 0 }, { x: w, y: 0 }, tr, tl], paint.wall, 0.55);
    face([tl, tr, br, bl], paint.wall, dark ? 0.9 : 0.7);
    face([{ x: 0, y: h }, { x: w, y: h }, br, bl], paint.room, 0.6);
    g.strokeStyle = css(paint.edge, dark ? 0.7 : 0.8);
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(tl.x, tl.y);
    g.lineTo(tr.x, tr.y);
    g.lineTo(br.x, br.y);
    g.lineTo(bl.x, bl.y);
    g.closePath();
    g.moveTo(0, 0);
    g.lineTo(tl.x, tl.y);
    g.moveTo(w, 0);
    g.lineTo(tr.x, tr.y);
    g.moveTo(w, h);
    g.lineTo(br.x, br.y);
    g.moveTo(0, h);
    g.lineTo(bl.x, bl.y);
    g.stroke();
    const vignette = g.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.2,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7,
    );
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(
      1,
      dark ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.05)",
    );
    g.fillStyle = vignette;
    g.fillRect(0, 0, w, h);
  };

  const draw = (now: number) => {
    const c = cfg;
    if (!c || !ctx || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (roomLayer) ctx.drawImage(roomLayer, 0, 0, w, h);
    else {
      ctx.fillStyle = css(paint.room);
      ctx.fillRect(0, 0, w, h);
    }
    const haze = clamp(c.haze, 0, 1);
    // The smoke: one tiled texture drifting slowly sideways and up.
    if (smoke && haze > 0) {
      const sw = w * 1.2;
      const sh = h * 1.2;
      const ox = mod(sim.t * 9, sw);
      const oy = mod(sim.t * 4, sh);
      ctx.globalAlpha = 0.15 + 0.85 * haze;
      for (const dx of [-sw, 0]) {
        for (const dy of [-sh, 0]) {
          ctx.drawImage(smoke, ox + dx, oy + dy, sw, sh);
        }
      }
      ctx.globalAlpha = 1;
    }
    const additive = dark ? "lighter" : "source-over";
    const n = beams();
    // Engravings, batched by heat: ten paths, ten strokes.
    const span = life() * 1000;
    const clock = c.motionSafe
      ? now
      : Math.floor(now / STILL_STEP) * STILL_STEP;
    let warm = false;
    // First pass: each segment's heat bucket, or 255 for none.
    for (let i = 0; i < n; i += 1) {
      const cnt = count[i] ?? 0;
      const start = ((head[i] ?? 0) - cnt + TRAIL) % TRAIL;
      for (let j = 1; j < cnt; j += 1) {
        const k = i * TRAIL + ((start + j) % TRAIL);
        const p = i * TRAIL + ((start + j - 1) % TRAIL);
        const heat = 1 - (clock - (tb[k] ?? 0)) / span;
        const far =
          Math.abs((tx[k] ?? 0) - (tx[p] ?? 0)) +
            Math.abs((ty[k] ?? 0) - (ty[p] ?? 0)) >
          80;
        bucket[k] =
          heat > 0 && !far
            ? Math.min(HEAT_BUCKETS - 1, Math.floor(heat * HEAT_BUCKETS))
            : 255;
        if (heat > 0) warm = true;
      }
    }
    // Then one stroke per heat: ten strokes for the whole drawing.
    ctx.globalCompositeOperation = additive;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let b = 0; b < HEAT_BUCKETS; b += 1) {
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < n; i += 1) {
        const cnt = count[i] ?? 0;
        const start = ((head[i] ?? 0) - cnt + TRAIL) % TRAIL;
        for (let j = 1; j < cnt; j += 1) {
          const k = i * TRAIL + ((start + j) % TRAIL);
          if (bucket[k] !== b) continue;
          const p = i * TRAIL + ((start + j - 1) % TRAIL);
          ctx.moveTo(tx[p] ?? 0, ty[p] ?? 0);
          ctx.lineTo(tx[k] ?? 0, ty[k] ?? 0);
          any = true;
        }
      }
      if (!any) continue;
      const hb = (b + 0.5) / HEAT_BUCKETS;
      if (hb > 0.35) {
        ctx.strokeStyle = paint.glow[b] ?? "transparent";
        ctx.lineWidth = 2 + 3 * hb;
        ctx.stroke();
      }
      ctx.strokeStyle = paint.heat[b] ?? "transparent";
      ctx.lineWidth = 0.7 + 0.7 * hb;
      ctx.stroke();
    }
    // The beams in the smoke, the laser coming in, and the hot spots.
    for (let i = 0; i < n; i += 1) hitOf(i, turn.deg, hits, i * 2);
    const air = 0.05 + 0.45 * haze;
    ctx.strokeStyle = css(paint.beam, air * 0.35);
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      ctx.moveTo(cs.x, cs.y);
      ctx.lineTo(hits[i * 2] ?? 0, hits[i * 2 + 1] ?? 0);
    }
    ctx.stroke();
    ctx.strokeStyle = css(paint.beam, air);
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.strokeStyle = css(paint.beam, 0.25 + 0.4 * haze);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(es.x, es.y);
    ctx.lineTo(cs.x, cs.y);
    ctx.stroke();
    ctx.strokeStyle = css(paint.core, 0.95);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (spot) {
      for (let i = 0; i < n; i += 1) {
        ctx.drawImage(
          spot,
          (hits[i * 2] ?? 0) - 8,
          (hits[i * 2 + 1] ?? 0) - 8,
          16,
          16,
        );
      }
      ctx.drawImage(spot, es.x - 6, es.y - 6, 12, 12);
    }
    ctx.globalCompositeOperation = "source-over";
    drawCrystal(cs.x, cs.y);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
    return warm;
  };

  /** The crystal's outline and table, reused every frame. */
  const outer = new Float32Array(24);
  const inner = new Float32Array(24);

  /** The crystal from the front: a brilliant cut whose facets turn with it. */
  const drawCrystal = (x: number, y: number) => {
    const c = cfg;
    if (!c || !ctx) return;
    const f = Math.round(clamp(c.facets, 5, 12));
    const r = clamp(Math.min(size.w, size.h) * 0.1, 14, 30);
    const a0 = (turn.deg * Math.PI) / 180;
    for (let i = 0; i < f; i += 1) {
      const a = a0 + (i / f) * Math.PI * 2;
      outer[i * 2] = x + Math.cos(a) * r;
      outer[i * 2 + 1] = y + Math.sin(a) * r;
      const b = a + Math.PI / f;
      inner[i * 2] = x + Math.cos(b) * r * 0.52;
      inner[i * 2 + 1] = y + Math.sin(b) * r * 0.52;
    }
    const ox = (i: number) => outer[(i % f) * 2] ?? 0;
    const oy = (i: number) => outer[(i % f) * 2 + 1] ?? 0;
    const ix = (i: number) => inner[(((i % f) + f) % f) * 2] ?? 0;
    const iy = (i: number) => inner[(((i % f) + f) % f) * 2 + 1] ?? 0;
    // The facet facing the incoming laser glints.
    const toward = Math.atan2(es.y - y, es.x - x);
    ctx.lineJoin = "round";
    for (let i = 0; i < f; i += 1) {
      const mid = a0 + ((i + 0.5) / f) * Math.PI * 2;
      const facing = Math.max(0, Math.cos(mid - toward));
      ctx.beginPath();
      ctx.moveTo(ox(i), oy(i));
      ctx.lineTo(ox(i + 1), oy(i + 1));
      ctx.lineTo(ix(i), iy(i));
      ctx.closePath();
      ctx.fillStyle = css(
        mixRgb(paint.glass, paint.core, facing * facing * 0.8),
        dark ? 0.35 + 0.5 * facing * facing : 0.25 + 0.45 * facing * facing,
      );
      ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i < f; i += 1) {
      if (i) ctx.lineTo(ix(i), iy(i));
      else ctx.moveTo(ix(i), iy(i));
    }
    ctx.closePath();
    ctx.fillStyle = css(
      mixRgb(paint.glass, paint.core, 0.25),
      dark ? 0.45 : 0.35,
    );
    ctx.fill();
    ctx.strokeStyle = css(
      dark ? paint.core : mixRgb(paint.glass, [0, 0, 0], 0.3),
      dark ? 0.55 : 0.7,
    );
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < f; i += 1) {
      ctx.moveTo(ox(i), oy(i));
      ctx.lineTo(ix(i), iy(i));
      ctx.moveTo(ox(i), oy(i));
      ctx.lineTo(ix(i - 1), iy(i - 1));
    }
    for (let i = 0; i <= f; i += 1) {
      if (i) ctx.lineTo(ox(i), oy(i));
      else ctx.moveTo(ox(i), oy(i));
    }
    for (let i = 0; i <= f; i += 1) {
      if (i) ctx.lineTo(ix(i), iy(i));
      else ctx.moveTo(ix(i), iy(i));
    }
    ctx.stroke();
  };

  const stepDeg = () => 360 / Math.round(clamp(cfg?.facets ?? 8, 5, 12));

  const step = (dt: number, now: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const ambient = !c.paused && c.motionSafe;
    if (ambient) sim.t += dt;
    if (turn.held) {
      idle = 0;
    } else if (turn.coasting) {
      const tau = 0.25 + 1.2 * clamp(c.momentum, 0, 1);
      turn.deg += turn.v * dt;
      turn.v *= Math.exp(-dt / tau);
      moving = true;
      // Slow enough: settle on the facet it was heading for.
      if (Math.abs(turn.v) < 70) {
        const s = stepDeg();
        turn.coasting = false;
        turn.springing = true;
        turn.target =
          (turn.v >= 0 ? Math.ceil(turn.deg / s) : Math.floor(turn.deg / s)) *
          s;
        report();
      }
    } else if (turn.springing) {
      const k = springs.snap;
      const steps = Math.max(1, Math.ceil(dt / STEP));
      const h = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        turn.v +=
          ((k.stiffness * (turn.target - turn.deg) - k.damping * turn.v) /
            k.mass) *
          h;
        turn.deg += turn.v * h;
      }
      if (Math.abs(turn.target - turn.deg) < 0.02 && Math.abs(turn.v) < 0.5) {
        turn.deg = turn.target;
        turn.v = 0;
        turn.springing = false;
        idle = 0;
        c.onRest();
      }
      moving = true;
    } else if (c.angle === undefined && c.drift > 0 && ambient) {
      // Untouched, the crystal turns by itself, easing back in after a hand.
      idle += dt;
      const ramp = clamp((idle - RESUME) / 1, 0, 1);
      turn.deg += clamp(c.drift, 0, 30) * ramp * dt;
      turn.target = turn.deg;
      moving = true;
    }
    engrave(turn.deg, now);
    return moving || turn.held || (ambient && c.haze > 0 && c.drift > 0);
  };

  const report = () => {
    cfg?.onSettle(Math.round(mod(turn.target, 360)));
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !ctx) {
      last = 0;
      return;
    }
    const busy = turn.held || turn.coasting || turn.springing;
    if (!busy && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = step(dt, now);
    const warm = draw(now) ?? false;
    if (moving || warm) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !ctx)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced-motion still steps: the engravings fade a step at a time while any are warm. */
  let stillTimer: number | null = null;
  const stillSteps = () => {
    if (stillTimer !== null) return;
    stillTimer = window.setTimeout(() => {
      stillTimer = null;
      const warm = draw(performance.now());
      if (warm && !cfg?.motionSafe) stillSteps();
    }, STILL_STEP);
  };

  /** Turns straight to `deg`: reduced motion, or a controlled angle that jumps. */
  const jumpTo = (deg: number) => {
    const now = performance.now();
    turn.deg = deg;
    turn.target = deg;
    turn.v = 0;
    turn.coasting = false;
    turn.springing = false;
    engrave(deg, now);
    draw(now);
    stillSteps();
    cfg?.onRest();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (size.w === w && size.h === h && size.dpr === dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    // A wide frame looks down a long room; a narrow one into a deeper box.
    size.F = Math.max(w, h * 1.4);
    size.D = size.F * (1 / (0.52 + 0.08 * clamp(h / w, 0, 1)) - 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    placeScene();
    // Old engravings belong to the old room.
    head.fill(0);
    count.fill(0);
    lastSample = turn.deg;
    if (!paint.heat.length) readColours();
    else layRoom();
    draw(performance.now());
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
        lay();
        readColours();
        resize();
        return;
      }
      if (
        was.beamCount !== next.beamCount ||
        was.seed !== next.seed ||
        was.spread !== next.spread
      ) {
        lay();
        lastSample = turn.deg;
      }
      if (was.colorKey !== next.colorKey || was.seed !== next.seed)
        readColours();
      if (was.dpr !== next.dpr) resize();
      if (next.angle !== undefined && next.angle !== was.angle) {
        if (!next.motionSafe) jumpTo(next.angle);
        else {
          turn.target = next.angle;
          turn.springing = true;
          turn.coasting = false;
        }
      }
      if (!next.motionSafe) {
        turn.coasting = false;
        if (turn.springing) jumpTo(turn.target);
      }
      draw(performance.now());
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw(performance.now());
    },
    wake() {
      draw(performance.now());
      kick();
    },
    grab() {
      turn.held = true;
      turn.coasting = false;
      turn.springing = false;
      turn.v = 0;
      kick();
    },
    turnTo(deg) {
      turn.deg = deg;
      turn.target = deg;
      if (!cfg?.motionSafe) {
        engrave(deg, performance.now());
        draw(performance.now());
        stillSteps();
        return;
      }
      kick();
    },
    release(velocity) {
      turn.held = false;
      const c = cfg;
      if (!c) return;
      const s = stepDeg();
      if (!c.motionSafe) {
        const to = Math.round(turn.deg / s) * s;
        turn.target = to;
        report();
        jumpTo(to);
        return;
      }
      if (Math.abs(velocity) > 70) {
        turn.v = clamp(velocity, -1440, 1440);
        turn.coasting = true;
      } else {
        turn.target = Math.round(turn.deg / s) * s;
        turn.v = velocity;
        turn.springing = true;
        report();
      }
      kick();
    },
    stepFacets(steps) {
      const c = cfg;
      if (!c) return;
      const s = stepDeg();
      const base =
        turn.springing || turn.held
          ? turn.target
          : Math.round(turn.deg / s) * s;
      const to = base + steps * s;
      turn.target = to;
      turn.held = false;
      turn.coasting = false;
      report();
      if (!c.motionSafe) {
        jumpTo(to);
        return;
      }
      turn.springing = true;
      kick();
    },
    home() {
      const c = cfg;
      if (!c) return;
      const to = Math.round(turn.deg / 360) * 360;
      turn.target = to;
      turn.coasting = false;
      report();
      if (!c.motionSafe) {
        jumpTo(to);
        return;
      }
      turn.springing = true;
      kick();
    },
    angle: () => turn.deg,
    stepDeg,
    rate: () => 360 / Math.max(120, size.w * 0.9),
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (stillTimer !== null) window.clearTimeout(stillTimer);
      stillTimer = null;
    },
  };
}

/**
 * A single laser enters a cut crystal in a smoky room and leaves as a crown
 * of hairline beams that strike the walls. The room is seen in one-point
 * perspective with the frame as its front opening; each beam is a seeded
 * direction on a cone, traced to the wall it strikes and projected. Turning
 * the crystal turns the whole crown: every hit point sweeps across the
 * walls and engraves a line there, white-hot at the beam, cooling through
 * the laser's colour to ember and fading, so a turn leaves a drawing of
 * loops and arcs behind.
 *
 * A sideways drag turns it 1:1; a throw coasts on its velocity and settles
 * on the nearest facet on the snap spring, and arrow keys turn it a facet
 * at a time. Untouched, it drifts round slowly. Canvas 2D with the
 * engravings batched into ten heat strokes; nothing runs off screen,
 * hidden, or still and cold. Under reduced motion a turn is drawn at once
 * and the engravings fade in still steps.
 */
export function FacetLaser({
  beamCount = 9,
  haze = 0.5,
  cooling = 0.5,
  color = "var(--danger)",
  facets = 8,
  angle,
  defaultAngle = 0,
  onAngleChange,
  onTurningChange,
  drift = 6,
  momentum = 0.6,
  spread = 0.6,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Crystal",
  disabled = false,
  className,
  children,
}: FacetLaserProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      beamOf(color),
      inkOf(color),
      emberOf(color),
      coreOf(color),
    ],
    [color],
  );
  const facetCount = Math.round(clamp(facets, 5, 12));
  const stepDeg = 360 / facetCount;
  const [settled, setSettled] = React.useState(() =>
    Math.round(mod(angle ?? defaultAngle, 360)),
  );
  const [turning, setTurningState] = React.useState(false);
  const tellTurning = React.useRef(onTurningChange);
  const turningNow = React.useRef(false);
  /** The turning state, reported from the gesture or the settle that changed it. */
  const setTurning = (next: boolean) => {
    setTurningState(next);
    if (turningNow.current === next) return;
    turningNow.current = next;
    tellTurning.current?.(next);
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const dragStart = React.useRef(0);
  const report = React.useRef(onAngleChange);

  const config: Config = {
    beamCount,
    haze,
    cooling,
    colorKey: paints.join("|"),
    facets,
    angle,
    drift,
    momentum,
    spread,
    interactive,
    disabled,
    paused,
    seed,
    dpr,
    motionSafe,
    onSettle: (deg) => {
      setSettled(deg);
      report.current?.(deg);
    },
    onRest: () => setTurning(false),
  };
  const latest = React.useRef(config);
  const startAt = React.useRef(angle ?? defaultAngle);

  React.useEffect(() => {
    report.current = onAngleChange;
    tellTurning.current = onTurningChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, startAt.current);
    engine.current = e;
    e.configure(latest.current);
    if (visible.current) e.wake();
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
    };
  }, []);

  const live = interactive && !disabled;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: !live,
    onStart: () => {
      const e = engine.current;
      if (!e) return;
      dragStart.current = e.angle();
      e.grab();
      setTurning(true);
    },
    onMove: ({ offset }) => {
      const e = engine.current;
      if (!e) return;
      e.turnTo(dragStart.current + offset.x * e.rate());
    },
    onEnd: ({ velocity }) => {
      const e = engine.current;
      if (!e) return;
      e.release(velocity.x * e.rate());
    },
    onCancel: () => engine.current?.release(0),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const e = engine.current;
    if (!e || !live) return;
    const moves: Record<string, number> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 3,
      PageDown: -3,
    };
    const by = moves[event.key];
    if (by !== undefined) {
      event.preventDefault();
      setTurning(true);
      e.stepFacets(by);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setTurning(true);
      e.home();
    }
  };

  const facet = Math.round(settled / stepDeg) % facetCount;

  return (
    <div
      ref={bindRoot}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={hintId}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={settled}
      aria-valuetext={`Facet ${facet + 1} of ${facetCount}, ${settled} degrees`}
      aria-disabled={disabled || undefined}
      aria-busy={turning || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "group/facet-laser relative isolate h-full w-full overflow-clip select-none",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        live ? "cursor-ew-resize touch-pan-y" : "touch-auto",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-live/facet-laser:hidden"
        style={standIn(paints)}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      {children ? (
        <div className="absolute bottom-0 left-0 p-3">{children}</div>
      ) : null}
      <span id={hintId} className="sr-only">
        Drag sideways to turn the crystal; every beam sweeps and engraves the
        walls. Arrow keys turn it one facet at a time, Home returns it.
      </span>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without a 2D canvas: the room's back wall as a lit rectangle in
 * the dark, the crown as a soft glow round where the crystal hangs.
 */
function standIn(paints: readonly string[]): React.CSSProperties {
  const beam = paints[2] ?? "white";
  return {
    backgroundColor:
      "light-dark(color-mix(in oklab, var(--background) 94%, var(--foreground)), color-mix(in oklab, var(--background) 55%, black))",
    backgroundImage: [
      `radial-gradient(circle at 50% 56%, color-mix(in oklab, ${beam} 55%, transparent) 0, transparent 9%)`,
      `radial-gradient(60% 70% at 50% 56%, color-mix(in oklab, ${beam} 14%, transparent) 0, transparent 70%)`,
      "linear-gradient(light-dark(color-mix(in oklab, var(--background) 86%, var(--foreground)), color-mix(in oklab, var(--background) 80%, var(--foreground))), light-dark(color-mix(in oklab, var(--background) 86%, var(--foreground)), color-mix(in oklab, var(--background) 80%, var(--foreground))))",
    ].join(", "),
    backgroundSize: "auto, auto, 42% 42%",
    backgroundPosition: "center, center, center",
    backgroundRepeat: "no-repeat",
  };
}
