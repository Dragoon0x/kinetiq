"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SnowDriveBeam = "halogen" | "xenon" | "amber" | "led";

export type SnowDriveProps = {
  /** How hard it snows, 0 (a few flakes) to 1 (a blizzard). @default 0.55 */
  snowfall?: number;
  /** The cruising speed, in km/h. @default 60 */
  speed?: number;
  /** The headlights: a named lamp or any CSS colour. @default "halogen" */
  beam?: SnowDriveBeam | (string & {});
  /** How much faster the car goes while held, 1 to 4 times the cruise. @default 2.8 */
  boost?: number;
  /** The crosswind, -1 (from the right) to 1 (from the left). @default 0.25 */
  wind?: number;
  /** How far the pointer steers the view, 0 (not at all) to 1. @default 0.6 */
  steer?: number;
  /** Draw the road, its banks and the reflector posts. @default true */
  road?: boolean;
  /** Let a few flakes land on the windscreen and melt. @default true */
  glass?: boolean;
  /** Show the speed in the corner. @default true */
  speedometer?: boolean;
  /** Hold the scene still on one frame. @default false */
  paused?: boolean;
  /** Pointer and keys drive. @default true */
  interactive?: boolean;
  /** Fires from the press or key that starts or ends a burst of speed. */
  onBoostChange?: (boosting: boolean) => void;
  /** Content over the scene, in a layer of its own. Its tokens are the dark theme's: it is always night. */
  children?: React.ReactNode;
  /** Names the scene for assistive technology. @default "Night drive in falling snow" */
  label?: string;
  /** Seeds the snow. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the scene still and takes no input. @default false */
  disabled?: boolean;
  /** Sizes the scene. @default "h-56 w-full" */
  className?: string;
};

const BEAMS: Record<SnowDriveBeam, string> = {
  halogen: "oklch(0.93 0.06 85)",
  xenon: "oklch(0.94 0.035 245)",
  amber: "oklch(0.86 0.13 72)",
  led: "oklch(0.97 0.012 200)",
};

/** Night is night: these pigments are the same on a light page and a dark one. */
const PIGMENTS = [
  "oklch(0.11 0.018 258)", // sky, top
  "oklch(0.2 0.024 252)", // sky at the horizon, snow-glow
  "oklch(0.21 0.016 250)", // road, packed snow, unlit
  "oklch(0.15 0.018 255)", // banks in the dark
  "oklch(0.13 0.015 255)", // ruts
  "oklch(0.3 0.01 255)", // posts
  "oklch(0.8 0.15 70)", // amber reflector
  "oklch(0.96 0.01 240)", // white reflector, splats
];

const MAX_FLAKES = 1400;
const MAX_SPLATS = 24;
const ALPHAS = [0.1, 0.22, 0.38, 0.58, 0.82];
const WIDTHS = [0.9, 1.5, 2.3];
const BUCKETS = ALPHAS.length * WIDTHS.length;
/** World units: the camera sits this high over the road. */
const CAM_H = 1.25;
const Z_NEAR = 0.7;
const Z_FAR = 64;
const ROAD_HALF = 2.7;
const POST_GAP = 24;
const EXPOSURE = 0.03;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x68e31da4) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** km/h to world units a second, scaled for the eye rather than the road. */
const unitsPerSecond = (kmh: number) => (Math.max(0, kmh) / 3.6) * 0.62;

type Scene = {
  w: number;
  h: number;
  ratio: number;
  F: number;
  cx: number;
  cy: number;
  /** Pre-rendered: the light in the snowy air and on the road. */
  haze: HTMLCanvasElement | null;
  sprite: HTMLCanvasElement | null;
  sky: CanvasGradient | null;
  bonnet: CanvasGradient | null;
  vignette: CanvasGradient | null;
};

type Paints = {
  beam: string;
  rgb: [number, number, number];
  skyTop: string;
  skyLow: string;
  road: string;
  bank: string;
  rut: string;
  post: string;
  amber: string;
  white: string;
};

/** The interactive things a press on the scene must leave alone. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[contenteditable='true']";

/**
 * Driving at night into falling snow, in Canvas 2D. Every flake is a point in
 * 3D falling at its own rate, swaying on its own phase, pushed by the wind
 * and coming at you at the car's speed — and it is lit only by the
 * headlights: its brightness is the beams' cone at its position, attenuated
 * with distance, over a faint ambient, so flakes appear out of the dark as
 * they enter the light and vanish at its edges. Far flakes are points, near
 * ones soft discs; each is drawn as a streak from where it was one exposure
 * ago, so at speed they stretch into long lines toward the edges. Reflector
 * posts flash past on a snow-covered road and a few flakes land on the glass
 * and melt.
 *
 * Holding a press or Space eases the speed up to `speed × boost` on the glide
 * spring's constants and letting go eases it back on the drift spring's,
 * integrated per frame. The pointer slides the vanishing point after it and
 * bends the road; arrow keys steer, Home straightens. Under reduced motion the
 * scene is a still frame, and holding shows a still frame at speed.
 */
export function SnowDrive({
  snowfall = 0.55,
  speed = 60,
  beam = "halogen",
  boost = 2.8,
  wind = 0.25,
  steer = 0.6,
  road = true,
  glass = true,
  speedometer = true,
  paused = false,
  interactive = true,
  onBoostChange,
  children,
  label = "Night drive in falling snow",
  seed = 3,
  dpr = 2,
  disabled = false,
  className,
}: SnowDriveProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const [announcement, setAnnouncement] = React.useState("");
  const live = interactive && !disabled;
  const beamCss = beam in BEAMS ? BEAMS[beam as SnowDriveBeam] : beam;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const meterRef = React.useRef<HTMLSpanElement | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const paints = React.useRef<Paints | null>(null);
  const scene = React.useRef<Scene | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(true);
  const flakes = React.useRef({
    x: new Float32Array(MAX_FLAKES),
    y: new Float32Array(MAX_FLAKES),
    z: new Float32Array(MAX_FLAKES),
    size: new Float32Array(MAX_FLAKES),
    phase: new Float32Array(MAX_FLAKES),
    fall: new Float32Array(MAX_FLAKES),
    count: 0,
    rand: lcg(seed),
  });
  const buckets = React.useRef(
    Array.from({ length: BUCKETS }, () => new Float32Array(MAX_FLAKES * 4)),
  );
  const fills = React.useRef(new Int32Array(BUCKETS));
  const big = React.useRef(new Float32Array(MAX_FLAKES * 4));
  const splats = React.useRef({
    data: new Float32Array(MAX_SPLATS * 5),
    next: 0,
  });
  const sim = React.useRef({
    v: unitsPerSecond(speed),
    dv: 0,
    t: 0,
    travelled: 0,
    sx: 0,
    sy: 0,
    vx: 0,
    vy: 0,
    tx: 0,
    ty: 0,
    holding: false,
    keyHold: false,
    last: 0,
    shownKmh: -1,
  });

  const latest = React.useRef({
    snowfall,
    speed,
    boost,
    wind,
    steer,
    road,
    glass,
    paused,
    motionSafe,
    onBoostChange,
  });
  React.useLayoutEffect(() => {
    latest.current = {
      snowfall,
      speed,
      boost,
      wind,
      steer,
      road,
      glass,
      paused,
      motionSafe,
      onBoostChange,
    };
  });

  const api = React.useRef<{
    draw: () => void;
    kick: () => void;
    resize: () => void;
    readColours: () => void;
    tick: (now: number) => void;
    populate: () => void;
  } | null>(null);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Turns each carrier's resolved colour into rgb the canvas takes. */
  const readColours = () => {
    const holder = carrierRef.current;
    if (!holder) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const probe = reader.current;
    if (!probe) return;
    const bytes = (
      el: Element | undefined | null,
    ): [number, number, number] => {
      if (!el) return [255, 255, 255];
      probe.fillStyle = "rgb(0 0 0)";
      probe.fillStyle = getComputedStyle(el).color;
      probe.clearRect(0, 0, 1, 1);
      probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
    };
    const css = (b: [number, number, number]) => `rgb(${b[0]} ${b[1]} ${b[2]})`;
    const kids = holder.children;
    const beamRgb = bytes(kids[0]);
    paints.current = {
      beam: css(beamRgb),
      rgb: beamRgb,
      skyTop: css(bytes(kids[1])),
      skyLow: css(bytes(kids[2])),
      road: css(bytes(kids[3])),
      bank: css(bytes(kids[4])),
      rut: css(bytes(kids[5])),
      post: css(bytes(kids[6])),
      amber: css(bytes(kids[7])),
      white: css(bytes(kids[8])),
    };
    prerender();
  };

  /** The light that does not move with the snow, drawn once per size and lamp. */
  const prerender = () => {
    const sc = scene.current;
    const p = paints.current;
    const canvas = canvasRef.current;
    if (!sc || !p || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const [r, g, b] = p.rgb;
    const tint = (a: number) => `rgb(${r} ${g} ${b} / ${a})`;
    // The flake: a soft disc in the lamp's colour.
    const sprite = sc.sprite ?? document.createElement("canvas");
    sprite.width = 48;
    sprite.height = 48;
    const sctx = sprite.getContext("2d");
    if (sctx) {
      sctx.clearRect(0, 0, 48, 48);
      const grad = sctx.createRadialGradient(24, 24, 0, 24, 24, 24);
      grad.addColorStop(0, tint(1));
      grad.addColorStop(0.35, tint(0.55));
      grad.addColorStop(1, tint(0));
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 48, 48);
    }
    sc.sprite = sprite;
    // The beams: two pools on the road and two wedges of lit air, at half
    // resolution — they are all soft.
    const hw = Math.max(2, Math.round(sc.w / 2));
    const hh = Math.max(2, Math.round(sc.h / 2));
    const haze = sc.haze ?? document.createElement("canvas");
    haze.width = hw;
    haze.height = hh;
    const hctx = haze.getContext("2d");
    if (hctx) {
      hctx.clearRect(0, 0, hw, hh);
      hctx.globalCompositeOperation = "lighter";
      const vx = hw / 2;
      const vy = (sc.cy / sc.h) * hh;
      for (const side of [-1, 1]) {
        const lx = hw / 2 + side * hw * 0.3;
        const ly = hh * 1.02;
        // The wedge of lit snow-air, from the lamp toward the vanishing point.
        const wedge = hctx.createLinearGradient(
          lx,
          ly,
          vx + side * hw * 0.04,
          vy,
        );
        wedge.addColorStop(0, tint(0.3));
        wedge.addColorStop(0.55, tint(0.1));
        wedge.addColorStop(1, tint(0));
        hctx.fillStyle = wedge;
        hctx.beginPath();
        hctx.moveTo(lx - hw * 0.05, ly);
        hctx.lineTo(vx + side * hw * 0.02 - hw * 0.07, vy + hh * 0.04);
        hctx.lineTo(vx + side * hw * 0.02 + hw * 0.07, vy + hh * 0.04);
        hctx.lineTo(lx + hw * 0.05, ly);
        hctx.closePath();
        hctx.fill();
        // The pool on the road.
        const px = hw / 2 + side * hw * 0.09;
        const py = vy + (hh - vy) * 0.42;
        const pool = hctx.createRadialGradient(px, py, 0, px, py, hw * 0.3);
        pool.addColorStop(0, tint(0.42));
        pool.addColorStop(1, tint(0));
        hctx.save();
        hctx.translate(px, py);
        hctx.scale(1, 0.32);
        hctx.translate(-px, -py);
        hctx.fillStyle = pool;
        hctx.fillRect(px - hw * 0.3, py - hw * 0.3, hw * 0.6, hw * 0.6);
        hctx.restore();
      }
    }
    sc.haze = haze;
    sc.sky = ctx.createLinearGradient(0, 0, 0, sc.cy);
    sc.sky.addColorStop(0, p.skyTop);
    sc.sky.addColorStop(1, p.skyLow);
    sc.bonnet = ctx.createLinearGradient(0, sc.h * 0.84, 0, sc.h);
    sc.bonnet.addColorStop(0, "rgb(0 0 0 / 0)");
    sc.bonnet.addColorStop(1, "rgb(0 0 0 / 0.55)");
    sc.vignette = ctx.createRadialGradient(
      sc.w / 2,
      sc.h * 0.45,
      Math.min(sc.w, sc.h) * 0.35,
      sc.w / 2,
      sc.h * 0.45,
      Math.max(sc.w, sc.h) * 0.75,
    );
    sc.vignette.addColorStop(0, "rgb(0 0 0 / 0)");
    sc.vignette.addColorStop(1, "rgb(0 0 0 / 0.5)");
  };

  /** Fills the box of snow ahead of the car, seeded. */
  const populate = () => {
    const sc = scene.current;
    const f = flakes.current;
    const k = latest.current;
    if (!sc) return;
    const area = clamp((sc.w * sc.h) / (760 * 232), 0.4, 1.4);
    f.count = Math.min(
      MAX_FLAKES,
      Math.round(lerp(150, 1400, clamp01(k.snowfall)) * area),
    );
    f.rand = lcg(seed);
    for (let i = 0; i < f.count; i += 1) spawn(i, true);
  };

  /** A new flake far ahead (or anywhere ahead, when filling the box). */
  const spawn = (i: number, anywhere: boolean) => {
    const sc = scene.current;
    const f = flakes.current;
    if (!sc) return;
    const r = f.rand;
    const z = anywhere
      ? Z_NEAR + 1 + r() * (Z_FAR - Z_NEAR - 1)
      : Z_FAR - r() * 6;
    // Half the snow falls where the beams reach, so the light is full of it;
    // the rest fills the dark around them.
    const inBeam = r() < 0.5;
    const spanX = inBeam ? 1.6 + z * 0.24 : (sc.w / 2 / sc.F) * z * 1.2 + 2;
    const top = inBeam
      ? 0.6 + z * 0.1
      : Math.min(6, (sc.cy / sc.F) * z * 1.1 + 1);
    f.x[i] = (r() * 2 - 1) * spanX;
    f.y[i] = -CAM_H + r() * (top + CAM_H);
    f.z[i] = z;
    f.size[i] = 0.018 + r() * r() * 0.04;
    f.phase[i] = r() * Math.PI * 2;
    f.fall[i] = 0.7 + r() * 1.1;
  };

  const resize = () => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const w = Math.max(40, Math.round(root.clientWidth));
    const h = Math.max(40, Math.round(root.clientHeight));
    const ratio = Math.min(2, Math.max(0.5, dpr), window.devicePixelRatio || 1);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const was = scene.current;
    scene.current = {
      w,
      h,
      ratio,
      F: Math.max(w * 0.62, h * 1.6),
      cx: w / 2,
      cy: h * 0.42,
      haze: was?.haze ?? null,
      sprite: was?.sprite ?? null,
      sky: null,
      bonnet: null,
      vignette: null,
    };
    prerender();
    if (!was || was.w !== w || was.h !== h) populate();
  };

  /** The scene's lean toward where it is steered: none at your feet, all of it far away. */
  const lean = (z: number, off: number) => off * (1 - 1.2 / Math.max(1.2, z));

  const draw = () => {
    const canvas = canvasRef.current;
    const sc = scene.current;
    const p = paints.current;
    if (!canvas || !sc || !p) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = latest.current;
    const s = sim.current;
    const f = flakes.current;
    ctx.setTransform(sc.ratio, 0, 0, sc.ratio, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    const offX = s.sx * sc.w * 0.24 * k.steer;
    const offY = s.sy * sc.h * 0.1 * k.steer;
    const bend = -s.sx * 0.0022 * k.steer;
    const cruise = unitsPerSecond(k.speed);
    const pace = cruise > 0 ? s.v / cruise : 0;
    const vpY = sc.cy + offY;

    // Sky and the ground.
    ctx.fillStyle = sc.sky ?? p.skyTop;
    ctx.fillRect(0, 0, sc.w, sc.h);
    const groundY = (z: number) => sc.cy + (sc.F * CAM_H) / z + lean(z, offY);
    const roadX = (x: number, z: number) =>
      sc.cx + (sc.F * (x + bend * z * z)) / z + lean(z, offX);
    if (k.road) {
      ctx.fillStyle = p.bank;
      ctx.fillRect(0, vpY, sc.w, sc.h - vpY);
      ctx.fillStyle = p.road;
      ctx.beginPath();
      for (let i = 0; i <= 28; i += 1) {
        const z = 1.1 * Math.pow((Z_FAR * 3) / 1.1, i / 28);
        const x = roadX(-ROAD_HALF, z);
        const y = groundY(z);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = 28; i >= 0; i -= 1) {
        const z = 1.1 * Math.pow((Z_FAR * 3) / 1.1, i / 28);
        ctx.lineTo(roadX(ROAD_HALF, z), groundY(z));
      }
      ctx.closePath();
      ctx.fill();
      // Two pairs of ruts in the packed snow.
      ctx.strokeStyle = p.rut;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      for (const rx of [-2.1, -0.9, 0.9, 2.1]) {
        for (let i = 0; i <= 20; i += 1) {
          const z = 1.1 * Math.pow(Z_FAR / 1.1, i / 20);
          const x = roadX(rx, z);
          const y = groundY(z);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // The lit air and the pools on the road, swinging with the car.
    if (sc.haze) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp01(0.55 + 0.35 * k.snowfall + 0.15 * (pace - 1));
      ctx.drawImage(sc.haze, offX * 0.5, offY * 0.5, sc.w, sc.h);
      ctx.globalAlpha = 1;
    }

    // Reflector posts, catching the beams as they pass.
    if (k.road) {
      ctx.globalCompositeOperation = "source-over";
      const phase = s.travelled % POST_GAP;
      for (let n = 0; n < 6; n += 1) {
        const z = POST_GAP * (n + 1) - phase;
        if (z < 1.4) continue;
        const lit = clamp01(1.4 / (1 + (z / 22) * (z / 22)));
        for (const side of [-1, 1]) {
          const x = roadX(side * (ROAD_HALF + 0.7), z);
          const base = groundY(z);
          const top = base - (sc.F * 1.0) / z;
          ctx.globalAlpha = 0.5 + 0.5 * lit;
          ctx.strokeStyle = p.post;
          ctx.lineWidth = Math.max(1, (sc.F * 0.09) / z);
          ctx.beginPath();
          ctx.moveTo(x, base);
          ctx.lineTo(x, top);
          ctx.stroke();
          ctx.globalAlpha = 0.25 + 0.75 * lit;
          ctx.fillStyle = side < 0 ? p.white : p.amber;
          const rh = Math.max(1, (sc.F * 0.16) / z);
          ctx.fillRect(
            x - ctx.lineWidth / 2,
            top + rh * 0.4,
            ctx.lineWidth,
            rh,
          );
        }
      }
      ctx.globalAlpha = 1;
    }

    // The snow. Each flake streaks from where it was one exposure ago, its
    // brightness the headlights' cone at its position.
    const fill = fills.current;
    fill.fill(0);
    const bigs = big.current;
    let bigCount = 0;
    // A still scene shows its state as a still: points at a cruise, streaks
    // at speed.
    const still = !k.motionSafe || k.paused;
    const held = s.holding || s.keyHold;
    const vDraw = still ? (held ? cruise * clamp(k.boost, 1, 4) : cruise) : s.v;
    // The shutter stays open longer as the car speeds up, so the streaks
    // stretch faster than the speed alone would draw them.
    const stretch = cruise > 0 ? vDraw / cruise : 1;
    const exposure = still && !held ? 0 : EXPOSURE * (0.7 + 0.6 * stretch);
    const lampY = -CAM_H * 0.55;
    const yaw = -s.sx * 0.12 * k.steer;
    for (let i = 0; i < f.count; i += 1) {
      const z = f.z[i] ?? Z_FAR;
      if (z < Z_NEAR) continue;
      const x = f.x[i] ?? 0;
      const y = f.y[i] ?? 0;
      let light = 0.035;
      for (let side = -1; side <= 1; side += 2) {
        const dx = x - side * 0.75 - yaw * z;
        const dy = (y - lampY + 0.03 * z) * 1.25;
        const off = Math.sqrt(dx * dx + dy * dy) / z;
        const cone = Math.exp(-(off * off) / 0.09);
        light += (cone * 1.4) / (1 + (z / 24) * (z / 24));
      }
      if (light < 0.06) continue;
      const sx = sc.cx + (sc.F * x) / z + lean(z, offX);
      const sy = sc.cy + (sc.F * -y) / z + lean(z, offY);
      if (sx < -20 || sx > sc.w + 20 || sy < -20 || sy > sc.h + 20) continue;
      const rp = ((f.size[i] ?? 0.03) * sc.F) / z;
      const zb = z + vDraw * exposure;
      const px = sc.cx + (sc.F * x) / zb + lean(zb, offX);
      const py = sc.cy + (sc.F * -y) / zb + lean(zb, offY);
      const b = clamp01(light);
      if (rp > 2.6) {
        const at = bigCount * 4;
        bigs[at] = sx;
        bigs[at + 1] = sy;
        bigs[at + 2] = Math.min(14, rp);
        bigs[at + 3] = (b * 2.2) / Math.min(14, rp);
        bigCount += 1;
        continue;
      }
      const ai = Math.min(ALPHAS.length - 1, Math.floor(b * ALPHAS.length));
      const wi = rp < 0.9 ? 0 : rp < 1.6 ? 1 : 2;
      const bucket = ai * WIDTHS.length + wi;
      const n = fill[bucket] ?? 0;
      const arr = buckets.current[bucket];
      if (!arr || n * 4 + 3 >= arr.length) continue;
      arr[n * 4] = px;
      arr[n * 4 + 1] = py;
      arr[n * 4 + 2] = sx;
      arr[n * 4 + 3] = sy;
      fill[bucket] = n + 1;
    }
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = p.beam;
    ctx.lineCap = "round";
    for (let bucket = 0; bucket < BUCKETS; bucket += 1) {
      const n = fill[bucket] ?? 0;
      const arr = buckets.current[bucket];
      if (!n || !arr) continue;
      ctx.globalAlpha = ALPHAS[Math.floor(bucket / WIDTHS.length)] ?? 0.2;
      ctx.lineWidth = WIDTHS[bucket % WIDTHS.length] ?? 1;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const x1 = arr[i * 4] ?? 0;
        const y1 = arr[i * 4 + 1] ?? 0;
        const x2 = arr[i * 4 + 2] ?? 0;
        const y2 = arr[i * 4 + 3] ?? 0;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2 + (x1 === x2 && y1 === y2 ? 0.01 : 0), y2);
      }
      ctx.stroke();
    }
    if (sc.sprite) {
      for (let i = 0; i < bigCount; i += 1) {
        const x = bigs[i * 4] ?? 0;
        const y = bigs[i * 4 + 1] ?? 0;
        const r = bigs[i * 4 + 2] ?? 3;
        ctx.globalAlpha = clamp01(bigs[i * 4 + 3] ?? 0);
        ctx.drawImage(sc.sprite, x - r, y - r, r * 2, r * 2);
      }
    }

    // Flakes on the glass, melting.
    const sp = splats.current.data;
    ctx.strokeStyle = p.white;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < MAX_SPLATS; i += 1) {
      const life = sp[i * 5 + 2] ?? 0;
      if (life <= 0) continue;
      const x = sp[i * 5] ?? 0;
      const y = sp[i * 5 + 1] ?? 0;
      const r = (sp[i * 5 + 3] ?? 3) * (0.4 + 0.6 * life);
      const a0 = sp[i * 5 + 4] ?? 0;
      ctx.globalAlpha = 0.5 * life;
      ctx.beginPath();
      for (let arm = 0; arm < 3; arm += 1) {
        const a = a0 + (arm * Math.PI) / 3;
        ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.stroke();
    }

    // The bonnet's shadow and the dark at the edges of the glass.
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (sc.bonnet) {
      ctx.fillStyle = sc.bonnet;
      ctx.fillRect(0, sc.h * 0.84, sc.w, sc.h * 0.16 + 1);
    }
    if (sc.vignette) {
      ctx.fillStyle = sc.vignette;
      ctx.fillRect(0, 0, sc.w, sc.h);
    }

    const kmh = Math.round((vDraw / 0.62) * 3.6);
    if (kmh !== s.shownKmh && meterRef.current) {
      s.shownKmh = kmh;
      meterRef.current.textContent = `${kmh} km/h`;
    }
  };

  const step = (dt: number) => {
    const k = latest.current;
    const s = sim.current;
    const f = flakes.current;
    const sc = scene.current;
    if (!sc) return false;
    const cruise = unitsPerSecond(k.speed);
    const boosting = s.holding || s.keyHold;
    const target = boosting ? cruise * clamp(k.boost, 1, 4) : cruise;
    // Speeding up rides the glide spring's constants, easing off the drift
    // spring's — a lunge forward, a long coast back.
    const sp = boosting || s.v < target ? springs.glide : springs.drift;
    {
      let left = dt;
      while (left > 0) {
        const h = Math.min(1 / 120, left);
        const acc =
          (sp.stiffness * (target - s.v) - sp.damping * s.dv) / sp.mass;
        s.dv += acc * h;
        s.v = Math.max(0, s.v + s.dv * h);
        left -= h;
      }
    }
    // The vanishing point follows the steering on glide, recentres on drift.
    {
      const steerSpring =
        s.tx !== 0 || s.ty !== 0 ? springs.glide : springs.drift;
      let left = dt;
      while (left > 0) {
        const h = Math.min(1 / 120, left);
        s.vx +=
          ((steerSpring.stiffness * (s.tx - s.sx) -
            steerSpring.damping * s.vx) /
            steerSpring.mass) *
          h;
        s.vy +=
          ((steerSpring.stiffness * (s.ty - s.sy) -
            steerSpring.damping * s.vy) /
            steerSpring.mass) *
          h;
        s.sx += s.vx * h;
        s.sy += s.vy * h;
        left -= h;
      }
    }
    s.t += dt;
    s.travelled += s.v * dt;
    const windX = k.wind * 1.6;
    const sp2 = splats.current;
    const rand = f.rand;
    for (let i = 0; i < f.count; i += 1) {
      const z = (f.z[i] ?? Z_FAR) - s.v * dt;
      const ph = f.phase[i] ?? 0;
      f.z[i] = z;
      f.y[i] = (f.y[i] ?? 0) - (f.fall[i] ?? 1) * dt;
      f.x[i] = (f.x[i] ?? 0) + (windX + Math.sin(s.t * 1.3 + ph) * 0.5) * dt;
      const y = f.y[i] ?? 0;
      if (z < Z_NEAR) {
        // A few land on the glass on their way past.
        if (k.glass && rand() < 0.05) {
          const sx = sc.cx + (sc.F * (f.x[i] ?? 0)) / Z_NEAR;
          const sy = sc.cy + (sc.F * -y) / Z_NEAR;
          if (sx > 8 && sx < sc.w - 8 && sy > 8 && sy < sc.h * 0.82) {
            const at = sp2.next * 5;
            sp2.data[at] = sx;
            sp2.data[at + 1] = sy;
            sp2.data[at + 2] = 1;
            sp2.data[at + 3] = 2.2 + rand() * 2.6;
            sp2.data[at + 4] = rand() * Math.PI;
            sp2.next = (sp2.next + 1) % MAX_SPLATS;
          }
        }
        spawn(i, false);
      } else if (y < -CAM_H) {
        spawn(i, false);
      } else {
        const spanX = (sc.w / 2 / sc.F) * z * 1.6 + 3;
        if (Math.abs(f.x[i] ?? 0) > spanX) spawn(i, false);
      }
    }
    // The glass: melting, sliding down, and out with the airflow at speed.
    const pace = cruise > 0 ? s.v / cruise : 0;
    for (let i = 0; i < MAX_SPLATS; i += 1) {
      const at = i * 5;
      const life = sp2.data[at + 2] ?? 0;
      if (life <= 0) continue;
      sp2.data[at + 2] = life - dt / 1.6;
      const dx = (sp2.data[at] ?? 0) - sc.cx;
      const dy = (sp2.data[at + 1] ?? 0) - sc.cy;
      const flow = Math.max(0, pace - 1) * 18;
      const len = Math.hypot(dx, dy) || 1;
      sp2.data[at] = (sp2.data[at] ?? 0) + (dx / len) * flow * dt;
      sp2.data[at + 1] = (sp2.data[at + 1] ?? 0) + (6 + (dy / len) * flow) * dt;
    }
    return true;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    const k = latest.current;
    if (!visible.current || document.hidden || k.paused || !k.motionSafe) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    step(dt);
    draw();
    frame.current = window.requestAnimationFrame(loop);
  };

  const kick = () => {
    const k = latest.current;
    if (frame.current || !visible.current || document.hidden) return;
    if (k.paused || !k.motionSafe) {
      draw();
      return;
    }
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, populate };
  });

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [beamCss]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [dpr]);

  React.useEffect(() => {
    api.current?.populate();
    api.current?.draw();
  }, [snowfall, seed]);

  React.useEffect(() => {
    if (paused || !motionSafe) {
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
      sim.current.v = unitsPerSecond(speed);
      sim.current.dv = 0;
      api.current?.draw();
    } else api.current?.kick();
  }, [paused, motionSafe, speed, road, glass, steer, wind]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        api.current?.draw();
        api.current?.kick();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const hold = (on: boolean, by: "pointer" | "key") => {
    const s = sim.current;
    const was = s.holding || s.keyHold;
    if (by === "pointer") s.holding = on;
    else s.keyHold = on;
    const now = s.holding || s.keyHold;
    if (now === was) return;
    onBoostChange?.(now);
    setAnnouncement(now ? "Speeding up" : "Back to cruise");
    // A still scene shows the state as a still: streaks while held, points after.
    if (!motionSafe || paused) draw();
    else kick();
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!live) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as Element).closest(INTERACTIVE)) return;
    hold(true, "pointer");
    aim(event);
  };

  const release = () => {
    if (sim.current.holding) hold(false, "pointer");
  };

  const aim = (event: React.PointerEvent) => {
    const r = rootRef.current?.getBoundingClientRect();
    // Under reduced motion the view does not chase the pointer; keys steer.
    if (!r || !live || !motionSafe) return;
    const s = sim.current;
    s.tx = clamp(((event.clientX - r.left) / r.width) * 2 - 1, -1, 1);
    s.ty = clamp(((event.clientY - r.top) / r.height) * 2 - 1, -1, 1) * 0.6;
    if (paused) {
      s.sx = s.tx;
      s.sy = s.ty;
      draw();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!live) return;
    if ((event.target as HTMLElement) !== event.currentTarget) return;
    const s = sim.current;
    const nudge = (dx: number) => {
      s.tx = clamp(Math.round((s.tx + dx) * 4) / 4, -1, 1);
      if (!motionSafe || paused) {
        s.sx = s.tx;
        draw();
      }
    };
    switch (event.key) {
      case " ":
        event.preventDefault();
        if (!event.repeat) hold(true, "key");
        break;
      case "ArrowLeft":
        event.preventDefault();
        nudge(-0.25);
        break;
      case "ArrowRight":
        event.preventDefault();
        nudge(0.25);
        break;
      case "Home":
        event.preventDefault();
        s.tx = 0;
        s.ty = 0;
        if (!motionSafe || paused) {
          s.sx = 0;
          s.sy = 0;
          draw();
        }
        break;
      default:
        break;
    }
  };

  const onKeyUp = (event: React.KeyboardEvent) => {
    if (event.key === " ") hold(false, "key");
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="driving scene"
      aria-label={label}
      aria-describedby={live ? hintId : undefined}
      tabIndex={live ? 0 : undefined}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        if (sim.current.keyHold) hold(false, "key");
      }}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerMove={(event) => {
        if (event.pointerType !== "touch" || sim.current.holding) aim(event);
      }}
      onPointerLeave={(event) => {
        release();
        if (event.pointerType !== "touch") {
          sim.current.tx = 0;
          sim.current.ty = 0;
        }
      }}
      className={cn(
        "dark relative isolate touch-pan-y overflow-clip rounded-3 select-none",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        live && "cursor-crosshair",
        className ?? "h-56 w-full",
      )}
      style={{ backgroundColor: PIGMENTS[0] }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 block h-full w-full"
      />
      <span
        ref={carrierRef}
        aria-hidden
        className="invisible absolute size-0 overflow-hidden"
        onTransitionEnd={() => {
          api.current?.readColours();
          api.current?.draw();
        }}
      >
        {[beamCss, ...PIGMENTS].map((c, i) => (
          <span
            key={i}
            style={{
              color: c,
              transitionProperty: "color",
              transitionDuration: "1ms",
            }}
          />
        ))}
      </span>
      {children ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 px-4 pt-3 text-foreground [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
          {children}
        </div>
      ) : null}
      {speedometer ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 bottom-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase tabular-nums"
        >
          <span ref={meterRef}>{Math.round(speed)} km/h</span>
        </span>
      ) : null}
      <span id={hintId} className="sr-only">
        Hold Space to speed up; arrow keys steer and Home straightens.
      </span>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
