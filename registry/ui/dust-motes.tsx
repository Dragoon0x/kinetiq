"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DustMotesProps = {
  /** The content on top of the room: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many motes hang in a 760 × 208 box, 40 to 600; smaller boxes hold fewer. @default 220 */
  count?: number;
  /** Where the lens is focused, 0 (nearest motes) to 1 (farthest). @default 0.45 */
  focus?: number;
  /** How much the air moves, 0 (still) to 2. @default 0.6 */
  drift?: number;
  /** How shallow the depth of field is, 0 (everything sharp) to 1 (very soft near and far). @default 0.6 */
  aperture?: number;
  /** How strong the beam of light is, 0 (an evenly lit room) to 1. @default 0.7 */
  beam?: number;
  /** The beam's lean from vertical, degrees, −60 to 60. @default 24 */
  beamAngle?: number;
  /** How brightly motes flash as they turn to the light, 0 (never) to 1. @default 0.6 */
  glint?: number;
  /** A mote's size at the focal plane, px. @default 1.6 */
  moteSize?: number;
  /** The light's colour, any CSS colour. @default a warm pigment from the warn token */
  light?: string;
  /** Show a thin focus mark that closes on the mote a press racks to. @default true */
  focusMark?: boolean;
  /** The pointer and keyboard focus lean the camera, and a press racks focus. @default true */
  interactive?: boolean;
  /** How far the hand leans the camera, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the air still; the hand still leans and racks. @default false */
  paused?: boolean;
  /** Seeds the motes, so two rooms never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a press or keyboard focus racks focus, with the new depth from 0 (near) to 1 (far), and with null when the lens lets go and drifts back to `focus`. */
  onFocusPull?: (depth: number | null) => void;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) leaning the camera. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** A warm light from the warn token's hue at a fixed lightness: sunlight in either theme. */
const LIGHT = "oklch(from var(--warn) 0.9 0.07 h)";

/** Depths of the volume, in focal lengths. */
const Z_NEAR = 0.6;
const Z_FAR = 3.2;
const MAX = 600;
/** Prefiltered blur levels in the sprite atlas, and each sprite's size. */
const LEVELS = 10;
const SPRITE = 64;
const CORE = 4;
const LEVEL_STEP = 2.8;
/** The rack follows glide, the camera and the return drift, the mark snaps. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const SNAP = springs.snap;
/** A touch has no hover to hold focus with: it holds this long, ms. */
const TOUCH_HOLD = 2400;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = [number, number, number];

/** Any CSS colour, as sRGB bytes, by painting one pixel. */
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
const css = ([r, g, b]: Rgb, a = 1) => `rgba(${r}, ${g}, ${b}, ${a})`;

/** A focus this soon after a press or a lift inside came from the hand, ms. */
const PRESS_FOCUS_MS = 1000;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,video[controls],audio[controls],[role='button'],[role='link'],[role='slider'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='menuitem'],[role='option'],[role='combobox'],[role='spinbutton'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/**
 * Sprites for each blur level: level 0 a sharp soft dot, higher levels a
 * bokeh disc with a soft edge and a faintly brighter rim, the way an out of
 * focus point of light looks through a lens.
 */
function makeAtlas(colour: Rgb, rim: boolean): HTMLCanvasElement {
  const atlas = document.createElement("canvas");
  atlas.width = SPRITE * LEVELS;
  atlas.height = SPRITE;
  const ctx = atlas.getContext("2d");
  if (!ctx) return atlas;
  const c = SPRITE / 2;
  for (let l = 0; l < LEVELS; l += 1) {
    const ox = l * SPRITE + c;
    const r = CORE + l * LEVEL_STEP;
    const g = ctx.createRadialGradient(ox, c, 0, ox, c, r + 1.5);
    if (l === 0) {
      g.addColorStop(0, css(colour, 1));
      g.addColorStop(0.45, css(colour, 0.85));
      g.addColorStop(1, css(colour, 0));
    } else {
      const edge = r / (r + 1.5);
      g.addColorStop(0, css(colour, 0.8));
      g.addColorStop(Math.max(0, edge - 0.18), css(colour, 0.84));
      g.addColorStop(Math.max(0, edge - 0.04), css(colour, rim ? 0.96 : 0.9));
      g.addColorStop(1, css(colour, 0));
    }
    ctx.fillStyle = g;
    ctx.fillRect(l * SPRITE, 0, SPRITE, SPRITE);
  }
  return atlas;
}

/** A glint: a bright point with a short cross, and on a pale page a hairline dark rim. */
function makeGlint(colour: Rgb, rim: Rgb | null): HTMLCanvasElement {
  const s = 24;
  const glint = document.createElement("canvas");
  glint.width = s;
  glint.height = s;
  const ctx = glint.getContext("2d");
  if (!ctx) return glint;
  const c = s / 2;
  if (rim) {
    ctx.beginPath();
    ctx.arc(c, c, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = css(rim, 0.45);
    ctx.fill();
  }
  const g = ctx.createRadialGradient(c, c, 0, c, c, 4);
  g.addColorStop(0, css([255, 255, 255], 1));
  g.addColorStop(0.5, css(colour, 0.9));
  g.addColorStop(1, css(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = css(colour, 0.5);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(c - 9, c);
  ctx.lineTo(c + 9, c);
  ctx.moveTo(c, c - 9);
  ctx.lineTo(c, c + 9);
  ctx.stroke();
  return glint;
}

type Config = {
  count: number;
  focus: number;
  drift: number;
  aperture: number;
  beam: number;
  beamAngle: number;
  glint: number;
  moteSize: number;
  lightKey: string;
  focusMark: boolean;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onPull: (depth: number | null) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus", touch?: boolean) => void;
  rack: (x: number, y: number) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  let dark = true;
  let atlas: HTMLCanvasElement | null = null;
  let glintSprite: HTMLCanvasElement | null = null;
  let beamLayer: HTMLCanvasElement | null = null;
  let room = "rgb(0, 0, 0)";
  let ring = "rgb(0, 0, 0)";
  let holdTimer = 0;
  /** Reduced motion: the mark is taken down by a timer, not faded by frames. */
  let markTimer = 0;
  const read = rgbReader();
  const ctx = canvas.getContext("2d");
  const size = { w: 0, h: 0, dpr: 1 };
  /** The volume, in focal-length units; the wander's seeded shape per mote. */
  const px = new Float32Array(MAX);
  const py = new Float32Array(MAX);
  const pz = new Float32Array(MAX);
  const wa = new Float32Array(MAX);
  const wf = new Float32Array(MAX);
  const wp = new Float32Array(MAX);
  const grain = new Float32Array(MAX);
  const spin = new Float32Array(MAX);
  const spinRate = new Float32Array(MAX);
  const sx = new Float32Array(MAX);
  const sy = new Float32Array(MAX);
  const sr = new Float32Array(MAX);
  let n = 0;
  let laidFor = "";
  let laidAspect = 1;
  /** The beam's colour from the last colour read, so a resize redraws only the beam. */
  let beamLight: Rgb = [255, 255, 255];
  const sim = { t: 0 };
  /** The focal plane, as a depth; where it is heading and how. */
  const lens = {
    z: Z_NEAR + 0.45 * (Z_FAR - Z_NEAR),
    v: 0,
    target: Z_NEAR + 0.45 * (Z_FAR - Z_NEAR),
    held: false,
    tweenFrom: 0,
    tweenAt: -1,
  };
  const cam = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  /** The focus mark: which mote, its radius spring, how long it has shown. */
  const mark = { mote: -1, r: 0, rv: 0, age: 0, alpha: 0 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const restZ = () =>
    Z_NEAR + clamp(cfg?.focus ?? 0.45, 0, 1) * (Z_FAR - Z_NEAR);

  const focal = () => size.h * 0.95;

  /** The motes, seeded through the frustum: more far than near, as a volume holds them. */
  const lay = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const area = size.w * size.h;
    const want = clamp(Math.round(c.count), 40, MAX);
    const next = Math.max(12, Math.round(want * Math.min(1, area / 158080)));
    const key = `${next}|${c.seed}`;
    const aspect = size.w / Math.max(1, size.h);
    if (key === laidFor) {
      // The same motes, re-projected into the new frustum: a resize keeps
      // the room's drift instead of re-laying it from the seed.
      if (aspect !== laidAspect) {
        const k = aspect / laidAspect;
        for (let i = 0; i < n; i += 1) px[i] = (px[i] ?? 0) * k;
        laidAspect = aspect;
      }
      return;
    }
    laidFor = key;
    laidAspect = aspect;
    n = next;
    const rand = lcg(c.seed * 41 + 3);
    const f = focal();
    for (let i = 0; i < n; i += 1) {
      const z = Z_NEAR + (Z_FAR - Z_NEAR) * Math.sqrt(rand());
      pz[i] = z;
      px[i] = (rand() * 2 - 1) * ((size.w / 2 / f) * z * 1.1);
      py[i] = (rand() * 2 - 1) * ((size.h / 2 / f) * z * 1.1);
      wa[i] = 0.004 + rand() * 0.01;
      wf[i] = 0.12 + rand() * 0.35;
      wp[i] = rand() * Math.PI * 2;
      grain[i] = 0.55 + rand() * 0.9;
      spin[i] = rand() * Math.PI * 2;
      spinRate[i] = (0.5 + rand() * 1.6) * (rand() < 0.5 ? -1 : 1);
    }
  };

  /** The beam, drawn once per size and colour: a soft shaft that widens as it falls. */
  const layBeam = (light: Rgb) => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const layer = beamLayer ?? document.createElement("canvas");
    beamLayer = layer;
    const pad = Math.round(size.w * 0.25);
    layer.width = Math.round((size.w + pad * 2) * size.dpr);
    layer.height = Math.round(size.h * size.dpr);
    const b = layer.getContext("2d");
    if (!b) return;
    b.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    b.clearRect(0, 0, size.w + pad * 2, size.h);
    const angle = (clamp(c.beamAngle, -60, 60) * Math.PI) / 180;
    const cx = pad + size.w * 0.56;
    const cy = size.h * 0.5;
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);
    const strength = clamp(c.beam, 0, 1);
    const rows = Math.ceil(size.h / 2);
    for (let r = 0; r < rows; r += 1) {
      const y = r * 2 + 1;
      const along = (y - cy) / Math.max(0.2, dy);
      const x0 = cx + dx * along;
      const width = Math.max(70, size.w * 0.16) * (0.72 + 0.5 * (y / size.h));
      const g = b.createLinearGradient(
        x0 - width * 1.6,
        0,
        x0 + width * 1.6,
        0,
      );
      const a = (dark ? 0.32 : 0.85) * strength * (1.12 - 0.5 * (y / size.h));
      g.addColorStop(0, css(light, 0));
      g.addColorStop(0.32, css(light, a * 0.45));
      g.addColorStop(0.5, css(light, a));
      g.addColorStop(0.68, css(light, a * 0.45));
      g.addColorStop(1, css(light, 0));
      b.fillStyle = g;
      b.fillRect(x0 - width * 1.6, y - 1, width * 3.2, 2);
    }
    // A dither of a level either way, so the soft shaft never bands.
    const image = b.getImageData(0, 0, layer.width, layer.height);
    const data = image.data;
    const rand = lcg(c.seed * 5 + 1);
    for (let i = 3; i < data.length; i += 4) {
      const v = data[i] ?? 0;
      if (v > 0) data[i] = clamp(Math.round(v + (rand() - 0.5) * 2.4), 0, 255);
    }
    b.putImageData(image, 0, 0);
  };

  /** The beam alone at the last point lightAt read: glints happen only in the beam. */
  let beamHere = 0;
  /** How lit a screen point is: the room's ambient plus the beam. */
  const lightAt = (x: number, y: number) => {
    const c = cfg;
    if (!c) return 0;
    const angle = (clamp(c.beamAngle, -60, 60) * Math.PI) / 180;
    const cx = size.w * 0.56 - cam.x * (focal() / 1.6);
    const cy = size.h * 0.5;
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);
    const along = (y - cy) / Math.max(0.2, dy);
    const d = x - (cx + dx * along);
    const width = Math.max(70, size.w * 0.16) * (0.72 + 0.5 * (y / size.h));
    const inBeam = Math.exp(-(d * d) / (width * width));
    const strength = clamp(c.beam, 0, 1);
    beamHere = strength * inBeam;
    return (1 - strength) * 0.6 + strength * (0.08 + 0.92 * inBeam);
  };

  const readColours = () => {
    const kids = carriers.children;
    const pick = (i: number) => {
      const el = kids[i];
      return el ? read(getComputedStyle(el).color) : ([0, 0, 0] as Rgb);
    };
    const bg = pick(0);
    const ink = pick(1);
    const light = pick(2);
    const ringRgb = pick(3);
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    dark = lum < 0.45;
    // A dark room is the page a shade deeper; a pale one the page in soft shade.
    room = css(dark ? mixRgb(bg, [0, 0, 0], 0.22) : mixRgb(bg, ink, 0.1));
    ring = css(ringRgb, 0.85);
    const mote = dark
      ? mixRgb(light, [255, 255, 255], 0.18)
      : mixRgb(bg, ink, 0.62);
    atlas = makeAtlas(mote, dark);
    glintSprite = makeGlint(
      dark ? mixRgb(light, [255, 255, 255], 0.5) : light,
      dark ? null : mixRgb(bg, ink, 0.7),
    );
    beamLight = dark ? light : mixRgb(light, [255, 255, 255], 0.55);
    layBeam(beamLight);
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || !atlas || !visible.current || size.w < 1) return;
    const { w, h, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = room;
    ctx.fillRect(0, 0, w, h);
    if (beamLayer) {
      const pad = Math.round(w * 0.25);
      ctx.drawImage(
        beamLayer,
        -pad - cam.x * (focal() / 1.6),
        0,
        w + pad * 2,
        h,
      );
    }
    const f = focal();
    const zf = lens.z;
    const ap = clamp(c.aperture, 0, 1);
    const base = clamp(c.moteSize, 0.5, 6);
    const glintAmt = clamp(c.glint, 0, 1);
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    for (let i = 0; i < n; i += 1) {
      const z = pz[i] ?? 1;
      const x = w / 2 + ((px[i] ?? 0) - cam.x) * (f / z);
      const y = h / 2 + ((py[i] ?? 0) - cam.y) * (f / z);
      const rs = (base * (0.7 + 0.6 * (grain[i] ?? 1)) * 1.1) / z;
      // The circle of confusion of a thin lens, in px.
      const coc = ap * h * 0.11 * (Math.abs(z - zf) / z);
      const r = Math.sqrt(rs * rs + coc * coc);
      sx[i] = x;
      sy[i] = y;
      sr[i] = r;
      if (x < -r - 4 || x > w + r + 4 || y < -r - 4 || y > h + r + 4) continue;
      const level = clamp(
        Math.round((r / Math.max(rs, 0.3) - 1) / 0.7),
        0,
        LEVELS - 1,
      );
      const spriteR = CORE + level * LEVEL_STEP;
      const scale = r / spriteR;
      const lit = lightAt(x, y);
      // Its light is spread over the disc: soft motes never outshine sharp ones.
      const spread = Math.pow(Math.min(1, rs / r), 1.3);
      const turn = Math.cos(spin[i] ?? 0);
      const flash = turn > 0 ? Math.pow(turn, 60) * glintAmt * beamHere : 0;
      const alpha = clamp(
        (dark ? 0.85 : 0.6) *
          lit *
          spread *
          (1 + flash * 3) *
          (0.6 + 0.4 * (grain[i] ?? 1)),
        0,
        1,
      );
      if (alpha < 0.01) continue;
      ctx.globalAlpha = alpha;
      const size2 = SPRITE * scale;
      ctx.drawImage(
        atlas,
        level * SPRITE,
        0,
        SPRITE,
        SPRITE,
        x - size2 / 2,
        y - size2 / 2,
        size2,
        size2,
      );
      if (flash > 0.04 && level <= 2 && glintSprite) {
        ctx.globalAlpha = clamp(flash * 1.4, 0, 1);
        const gs = 14 + 10 * flash;
        ctx.drawImage(glintSprite, x - gs / 2, y - gs / 2, gs, gs);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    if (mark.mote >= 0 && mark.alpha > 0.01 && c.focusMark) {
      const mx = sx[mark.mote] ?? 0;
      const my = sy[mark.mote] ?? 0;
      ctx.globalAlpha = mark.alpha;
      ctx.strokeStyle = ring;
      ctx.lineWidth = 1;
      const r = Math.max(4, mark.r);
      // Four arcs with gaps, like a lens's focus point, not a cursor.
      for (let q = 0; q < 4; q += 1) {
        ctx.beginPath();
        ctx.arc(
          mx,
          my,
          r,
          (q * Math.PI) / 2 + 0.28,
          ((q + 1) * Math.PI) / 2 - 0.28,
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the air, the lens, the camera and the mark. Returns whether anything moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const air = c.paused ? 0 : clamp(c.drift, 0, 2);
    if (air > 0) {
      sim.t += dt;
      const t = sim.t;
      const f = focal();
      for (let i = 0; i < n; i += 1) {
        const z = pz[i] ?? 1;
        const a = (wa[i] ?? 0) * air;
        const fr = wf[i] ?? 0.2;
        const ph = wp[i] ?? 0;
        // Brownian-looking wander from three slow sines, and the faint rise
        // of warm air in the light.
        let x =
          (px[i] ?? 0) +
          a *
            (Math.sin(t * fr + ph) + 0.5 * Math.sin(t * fr * 2.7 + ph * 1.9)) *
            dt;
        let y =
          (py[i] ?? 0) +
          (a * Math.cos(t * fr * 1.3 + ph * 0.7) - 0.006 * air) * dt;
        let zz = z + a * 0.6 * Math.sin(t * fr * 0.8 + ph * 2.3) * dt;
        zz = clamp(zz, Z_NEAR, Z_FAR);
        const hw = (size.w / 2 / f) * zz * 1.1;
        const hh = (size.h / 2 / f) * zz * 1.1;
        if (x > hw) x -= hw * 2;
        else if (x < -hw) x += hw * 2;
        if (y > hh) y -= hh * 2;
        else if (y < -hh) y += hh * 2;
        px[i] = x;
        py[i] = y;
        pz[i] = zz;
        spin[i] = (spin[i] ?? 0) + (spinRate[i] ?? 1) * air * 0.6 * dt;
      }
      moving = true;
    }
    // The lens: a spring to its target — glide when racking to a mote,
    // drift when it lets go and returns.
    const k = lens.held ? GLIDE : DRIFT;
    lens.v +=
      ((k.stiffness * (lens.target - lens.z) - k.damping * lens.v) / k.mass) *
      dt;
    lens.z += lens.v * dt;
    if (Math.abs(lens.target - lens.z) < 0.0005 && Math.abs(lens.v) < 0.002) {
      lens.z = lens.target;
      lens.v = 0;
    } else moving = true;
    // The camera leans with the hand, heavy, on drift.
    cam.vx +=
      ((DRIFT.stiffness * (cam.tx - cam.x) - DRIFT.damping * cam.vx) /
        DRIFT.mass) *
      dt;
    cam.vy +=
      ((DRIFT.stiffness * (cam.ty - cam.y) - DRIFT.damping * cam.vy) /
        DRIFT.mass) *
      dt;
    cam.x += cam.vx * dt;
    cam.y += cam.vy * dt;
    if (
      Math.abs(cam.tx - cam.x) + Math.abs(cam.ty - cam.y) < 0.0002 &&
      Math.abs(cam.vx) + Math.abs(cam.vy) < 0.001
    ) {
      cam.x = cam.tx;
      cam.y = cam.ty;
      cam.vx = 0;
      cam.vy = 0;
    } else moving = true;
    if (mark.mote >= 0) {
      mark.rv +=
        ((SNAP.stiffness * (9 - mark.r) - SNAP.damping * mark.rv) / SNAP.mass) *
        dt;
      mark.r += mark.rv * dt;
      mark.age += dt;
      mark.alpha =
        mark.age < 0.7
          ? Math.min(1, mark.age / 0.08)
          : Math.max(0, 1 - (mark.age - 0.7) / 0.35);
      if (mark.alpha <= 0 && mark.age > 0.7) mark.mote = -1;
      else moving = true;
    }
    return moving;
  };

  /** Reduced motion: the lens tweens and the mark simply stands; nothing else moves. */
  const stepStill = (dt: number): boolean => {
    let moving = false;
    if (lens.tweenAt >= 0) {
      lens.tweenAt += dt;
      const p = Math.min(1, lens.tweenAt / durations.slow);
      // Blur is not travel: a short ease-out, fast arrival and a soft landing.
      const e = 1 - Math.pow(1 - p, 3);
      lens.z = lens.tweenFrom + (lens.target - lens.tweenFrom) * e;
      if (p >= 1) {
        lens.z = lens.target;
        lens.tweenAt = -1;
      } else moving = true;
    }
    if (mark.mote >= 0) {
      mark.r = 9;
      mark.alpha = 1;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c) {
      last = 0;
      return;
    }
    // Drifting alone, dust moves slowly enough for thirty frames a second;
    // a rack, the camera or the mark get every frame.
    const calm =
      lens.v === 0 &&
      cam.vx === 0 &&
      cam.vy === 0 &&
      (mark.mote < 0 || !c.motionSafe) &&
      lens.tweenAt < 0;
    if (calm && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : stepStill(dt);
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
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    lay();
    // The sprites do not depend on the size; the beam does.
    if (atlas) layBeam(beamLight);
    else readColours();
    draw();
    kick();
  };

  /** The lens heads for a depth: a spring in motion, a tween when reduced. */
  const focusTo = (z: number, held: boolean) => {
    const c = cfg;
    lens.target = clamp(z, Z_NEAR, Z_FAR);
    lens.held = held;
    if (c && !c.motionSafe) {
      lens.tweenFrom = lens.z;
      lens.tweenAt = 0;
      lens.v = 0;
    }
    kick();
  };

  const letGo = () => {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
    if (lens.held) {
      focusTo(restZ(), false);
      cfg?.onPull(null);
    }
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        lens.z = restZ();
        lens.target = lens.z;
        resize();
        return;
      }
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (was.count !== next.count || was.seed !== next.seed) lay();
      if (
        was.lightKey !== next.lightKey ||
        was.beam !== next.beam ||
        was.beamAngle !== next.beamAngle
      ) {
        readColours();
      }
      if (was.focus !== next.focus && !lens.held) focusTo(restZ(), false);
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        cam.tx = 0;
        cam.ty = 0;
        setActive(false);
        letGo();
      }
      if (!next.motionSafe) {
        setActive(false);
        cam.x = 0;
        cam.y = 0;
        cam.vx = 0;
        cam.vy = 0;
        cam.tx = 0;
        cam.ty = 0;
        lens.v = 0;
        if (lens.tweenAt < 0) lens.z = lens.target;
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
      draw();
      kick();
    },
    handTo(x, y, source) {
      const c = cfg;
      if (!c?.interactive) return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      // Under reduced motion the camera never leans, so there is nothing to report.
      if (c.motionSafe) setActive(true);
      if (holdTimer && source === "pointer") {
        window.clearTimeout(holdTimer);
        holdTimer = 0;
      }
      if (c.motionSafe) {
        const reach = 0.1 * clamp(c.pointerStrength, 0, 1);
        cam.tx = (x / Math.max(1, size.w) - 0.5) * reach;
        cam.ty = (y / Math.max(1, size.h) - 0.5) * reach * 0.6;
      }
      kick();
    },
    handAway(source, touch = false) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      cam.tx = 0;
      cam.ty = 0;
      setActive(false);
      if (touch && lens.held) {
        if (holdTimer) window.clearTimeout(holdTimer);
        holdTimer = window.setTimeout(letGo, TOUCH_HOLD);
      } else letGo();
      kick();
    },
    rack(x, y) {
      const c = cfg;
      if (!c?.interactive || n === 0) return;
      // Where each mote is drawn now; the one under the hand, or the nearest.
      draw();
      let best = -1;
      let score = Infinity;
      for (let i = 0; i < n; i += 1) {
        const d = Math.hypot((sx[i] ?? 0) - x, (sy[i] ?? 0) - y);
        const s = d / Math.max(6, sr[i] ?? 6);
        if (d < 160 && s < score) {
          score = s;
          best = i;
        }
      }
      if (best < 0) return;
      focusTo(pz[best] ?? restZ(), true);
      if (markTimer) window.clearTimeout(markTimer);
      markTimer = 0;
      // With the mark off, nothing animates it unseen.
      mark.mote = c.focusMark ? best : -1;
      mark.r = 24;
      mark.rv = 0;
      mark.age = 0;
      mark.alpha = 0;
      if (c.focusMark && !c.motionSafe) {
        markTimer = window.setTimeout(() => {
          markTimer = 0;
          mark.mote = -1;
          draw();
        }, 700);
      }
      const depth = ((pz[best] ?? Z_NEAR) - Z_NEAR) / (Z_FAR - Z_NEAR);
      c.onPull(Math.round(depth * 100) / 100);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (holdTimer) window.clearTimeout(holdTimer);
      holdTimer = 0;
      if (markTimer) window.clearTimeout(markTimer);
      markTimer = 0;
    },
  };
}

/**
 * A background of dust hanging in still air, seen through a lens, with a
 * beam of light crossing the room and the content on top in its own layer.
 * The motes are a seeded volume through the camera's frustum, each a flake
 * that wanders on slow currents, rises a little in the warm light and turns
 * as it goes, flashing when its face meets the light. A thin-lens depth of
 * field opens near and far motes into soft bokeh discs with a faintly
 * brighter rim while those at the focal plane stay crisp points; each disc's
 * light is spread over its area, so a soft mote never outshines a sharp one.
 *
 * The pointer leans the camera, heavy and without overshoot on the drift
 * spring, so near motes slide further than far ones. A press racks focus to
 * the mote under the hand: the focal plane travels to its depth on the glide
 * spring — discs shrink to points and points bloom into discs as the plane
 * passes — while a thin focus mark closes on it on the snap spring and
 * fades. Focus holds while the hand stays and drifts back to `focus` when it
 * leaves. Keyboard focus on a control inside racks to the mote nearest it.
 * Canvas 2D from a prefiltered sprite atlas; thirty frames a second while it
 * only drifts, every frame while the lens or camera moves; nothing off screen
 * or in a hidden page. Under reduced motion nothing drifts or leans, and a
 * rack is a short tween.
 */
export function DustMotes({
  children,
  count = 220,
  focus = 0.45,
  drift = 0.6,
  aperture = 0.6,
  beam = 0.7,
  beamAngle = 24,
  glint = 0.6,
  moteSize = 1.6,
  light = LIGHT,
  focusMark = true,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onFocusPull,
  onActiveChange,
  className,
}: DustMotesProps) {
  const motionSafe = useMotionSafe();
  const paints = [
    "var(--background)",
    "var(--foreground)",
    light,
    "var(--ring)",
  ];

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);
  const pulled = React.useRef(onFocusPull);

  const config: Config = {
    count,
    focus,
    drift,
    aperture,
    beam,
    beamAngle,
    glint,
    moteSize,
    lightKey: light,
    focusMark,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
    onPull: (d) => pulled.current?.(d),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
    pulled.current = onFocusPull;
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

  /** When the hand last pressed or lifted inside, so the focus it causes is not taken for the keyboard. */
  const pressedAt = React.useRef(-Infinity);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedAt.current = performance.now();
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit))
      engine.current?.rack(at.x, at.y);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    // A tap focuses its target after the finger lifts.
    pressedAt.current = performance.now();
    if (event.pointerType === "touch")
      engine.current?.handAway("pointer", true);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    // A text field shows a focus ring even when clicked; a press is not the keyboard.
    if (performance.now() - pressedAt.current < PRESS_FOCUS_MS) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.rack(at.x, at.y);
  };

  // A key pressed inside means the next focus is the keyboard's, however
  // recently the hand pressed.
  const onKeyDown = () => {
    pressedAt.current = -Infinity;
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDownCapture={onKeyDown}
      className={cn(
        // Nothing is dragged here; the page keeps its vertical scroll on touch.
        "group/dust-motes relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/dust-motes:opacity-0"
        style={standIn(light, beamAngle, beam, seed)}
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
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * room a shade deeper than the page, the beam as a soft band at its angle,
 * and a scatter of seeded motes, a few of them soft.
 */
function standIn(
  light: string,
  beamAngle: number,
  beam: number,
  seed: number,
): React.CSSProperties {
  const rand = lcg(seed * 41 + 3);
  const angle = Math.round(90 + clamp(beamAngle, -60, 60));
  const glow = `color-mix(in oklab, ${light} ${Math.round(clamp(beam, 0, 1) * 34)}%, transparent)`;
  const mote = "color-mix(in oklab, var(--foreground) 55%, transparent)";
  const dots: string[] = [];
  for (let i = 0; i < 18; i += 1) {
    const soft = rand() < 0.3;
    const r = soft ? 3 + Math.round(rand() * 4) : 1;
    dots.push(
      `radial-gradient(circle at ${Math.round(rand() * 100)}% ${Math.round(rand() * 100)}%, ${soft ? "color-mix(in oklab, var(--foreground) 14%, transparent)" : mote} 0 ${r}px, transparent ${r + 1}px)`,
    );
  }
  return {
    backgroundColor: "color-mix(in oklab, var(--background) 92%, black)",
    backgroundImage: [
      ...dots,
      `linear-gradient(${angle}deg, transparent 38%, ${glow} 56%, transparent 74%)`,
    ].join(", "),
  };
}
