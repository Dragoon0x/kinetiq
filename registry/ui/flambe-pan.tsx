"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FlambePanState = "out" | "flaring" | "licks";
export type FlambePanMetal = "copper" | "steel" | "iron";
export type FlambePanTrigger = "inView" | "mount" | "manual";

export type FlambePanProps = {
  /** How tall the flare stands, as a share of the room above the pan, 0.2 to 1. @default 0.7 */
  height?: number;
  /** How much a quick shake feeds the flames, 0 (ignores it) to 1 (a hard shake nearly doubles them). @default 0.6 */
  gust?: number;
  /** The flame's hue in degrees, at fixed lightness: 52 brandy orange, 30 deep red, 80 gold, 140 a copper-green flame. @default 52 */
  hue?: number;
  /** Seconds the spirit burns after it catches before the last blue lick goes out, 1 to 8. @default 3.2 */
  burnTime?: number;
  /** How far the far lip must dip, in degrees, before it catches the spirit, 6 to 24. @default 12 */
  catchAngle?: number;
  /** The furthest the pan tips before it resists, in degrees, 16 to 40. @default 30 */
  maxTilt?: number;
  /** How far the tongues lean with the tilt and trail behind the pan's motion, 0 to 1. @default 0.6 */
  lean?: number;
  /** How full the flame is: 0.3 a few tongues, 1 a dense sheet. @default 0.7 */
  density?: number;
  /** The pan's metal. @default "copper" */
  metal?: FlambePanMetal;
  /** The cooktop's colour; any CSS colour. @default a dark steel pigment */
  rangeColor?: string;
  /** When the pan tips itself once to show the flare: the first time it is seen, at mount, or never. @default "inView" */
  trigger?: FlambePanTrigger;
  /** Play the flare when the spirit catches and when a shake gusts it. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when the flame catches, burns down to blue licks, or goes out. */
  onFlameChange?: (state: FlambePanState) => void;
  /** The scene's accessible name. @default "Flambé pan" */
  label?: string;
  /** Hold the flame still where it is; the pan can still be moved. @default false */
  paused?: boolean;
  /** No tipping, tossing or shaking. @default false */
  disabled?: boolean;
  /** Seeds the flame's tongues. @default 1 */
  seed?: number;
  /** Cap on the canvas's pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Overlay content drawn above the scene (a caption); it never takes the pointer. */
  children?: React.ReactNode;
  /** Classes for the root. Give it a size; the demo uses `aspect-[16/10]`. */
  className?: string;
};

/** The scene's own units: everything is drawn in a 320×200 box, bottom-centred. */
const VIEW_W = 320;
const VIEW_H = 200;
/** The pan turns about the middle of its rim. */
const PIVOT = { x: 150, y: 128 };
/** The surface of the sauce, in the pan's own frame. */
const SAUCE = { cx: 150, cy: 125.4, rx: 46, ry: 6.2 };
/** Room above the sauce the tallest flare may take. */
const ROOM = 112;
const CAP = 420;
const STEP = 1 / 240;
/** The catch runs across the sauce in this long, s. */
const SPREAD = 0.26;
/** Tilt degrees per scene unit of vertical drag. */
const TILT_PER_UNIT = 0.42;
const SLIDE = 26;
const TEMPS = 28;
const BLUES = 6;
const SPRITE = 48;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function mulberry(seed: number) {
  let s = (Math.floor(seed * 7919) ^ 0x5f3759df) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** OKLCH → an sRGB `rgb()` string for the sprite atlas (client only). */
function oklchRgb(L: number, C: number, hue: number): string {
  const h = (hue * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [r, g, bl] = lin.map((c) => {
    const x = clamp(c, 0, 1);
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.round(v * 255);
  });
  return `rgb(${r ?? 0} ${g ?? 0} ${bl ?? 0})`;
}

/** The flame's ramp, ember to white-gold, as (L, C, hue offset) anchors. */
const RAMP: [number, number, number, number][] = [
  [0, 0.34, 0.12, -24],
  [0.3, 0.56, 0.19, -12],
  [0.55, 0.72, 0.19, 0],
  [0.8, 0.86, 0.15, 10],
  [1, 0.97, 0.06, 24],
];

function rampAt(t: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i += 1) {
    const a = RAMP[i - 1];
    const b = RAMP[i];
    if (!a || !b) continue;
    if (t <= b[0]) {
      const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      return [
        a[1] + (b[1] - a[1]) * k,
        a[2] + (b[2] - a[2]) * k,
        a[3] + (b[3] - a[3]) * k,
      ];
    }
  }
  return [0.97, 0.06, 24];
}

/**
 * One row of soft sprites, ember to white-gold then the blue of a spirit
 * flame, drawn once per hue so the frame loop only ever copies pixels.
 */
function buildAtlas(hue: number): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = (TEMPS + BLUES) * SPRITE;
  c.height = SPRITE;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const half = SPRITE / 2;
  // Each stop carries its own alpha in the sprite's colour: fading through a
  // transparent black would grey the rim of every tongue.
  const paint = (i: number, rgb: string, stops: [number, number][]) => {
    const x = i * SPRITE + half;
    const g = ctx.createRadialGradient(x, half, 0, x, half, half);
    for (const [at, alpha] of stops) {
      g.addColorStop(at, rgb.replace(")", ` / ${alpha})`));
    }
    ctx.fillStyle = g;
    ctx.fillRect(i * SPRITE, 0, SPRITE, SPRITE);
  };
  for (let i = 0; i < TEMPS; i += 1) {
    const [L, C, dh] = rampAt(i / (TEMPS - 1));
    paint(i, oklchRgb(L, C, hue + dh), [
      [0, 1],
      [0.36, 0.42],
      [0.7, 0.1],
      [1, 0],
    ]);
  }
  for (let i = 0; i < BLUES; i += 1) {
    const t = i / (BLUES - 1);
    paint(TEMPS + i, oklchRgb(0.45 + 0.33 * t, 0.19 - 0.07 * t, 262 - 22 * t), [
      [0, 0.85],
      [0.32, 0.85],
      [1, 0],
    ]);
  }
  return c;
}

type Metal = {
  light: string;
  mid: string;
  dark: string;
  inside: string;
  handle: [string, string];
};

const METALS: Record<FlambePanMetal, Metal> = {
  copper: {
    light: "oklch(0.74 0.11 55)",
    mid: "oklch(0.58 0.125 45)",
    dark: "oklch(0.36 0.09 38)",
    inside: "oklch(0.47 0.1 44)",
    handle: ["oklch(0.62 0.012 250)", "oklch(0.36 0.01 250)"],
  },
  steel: {
    light: "oklch(0.9 0.008 250)",
    mid: "oklch(0.68 0.012 250)",
    dark: "oklch(0.42 0.01 250)",
    inside: "oklch(0.56 0.01 250)",
    handle: ["oklch(0.74 0.01 250)", "oklch(0.44 0.01 250)"],
  },
  iron: {
    light: "oklch(0.5 0.008 250)",
    mid: "oklch(0.34 0.008 250)",
    dark: "oklch(0.2 0.006 250)",
    inside: "oklch(0.27 0.006 250)",
    handle: ["oklch(0.44 0.008 250)", "oklch(0.24 0.006 250)"],
  },
};

const RANGE = "oklch(0.235 0.008 60)";
const BACKSPLASH = "oklch(0.195 0.012 60)";
const GAS = "oklch(0.68 0.17 255)";

type Config = {
  height: number;
  gust: number;
  hue: number;
  burnTime: number;
  catchAngle: number;
  maxTilt: number;
  lean: number;
  density: number;
  trigger: FlambePanTrigger;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Hooks = {
  /** The flame caught, burned down to licks, or went out. */
  state: (next: FlambePanState) => void;
  /** The spirit caught (or a shake gusted it) because of the visitor. */
  flare: (kind: "catch" | "gust", clientX: number | null) => void;
};

type Nodes = {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  back: SVGGElement;
  front: SVGGElement;
  wash: SVGElement;
  sheen: SVGElement;
  rim: SVGElement;
  glaze: SVGElement;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  seen: (inView: boolean) => void;
  wake: () => void;
  grab: (clientX: number) => void;
  drag: (dx: number, dy: number, clientX: number) => void;
  release: (vx: number, vy: number) => void;
  press: (clientX: number | null) => void;
  flaring: () => boolean;
  dispose: () => void;
};

function createEngine(
  nodes: Nodes,
  visible: { current: boolean },
  hooks: { current: Hooks },
): Engine {
  const { root, canvas } = nodes;
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let atlas: HTMLCanvasElement | null = null;
  let atlasHue = Number.NaN;
  let frame = 0;
  let last = 0;
  let disposed = false;
  const timers: number[] = [];
  const view = { w: 0, h: 0, s: 1, ox: 0, oy: 0, ratio: 1 };

  // The pan: tilt in degrees (positive dips the far lip), slide in units.
  const pan = { tilt: 0, tiltV: 0, slide: 0, slideV: 0 };
  let tiltTarget = 0;
  let tiltSpring: { stiffness: number; damping: number; mass: number } =
    springs.glide;
  let dragging = false;
  let grabbed = { tilt: 0, slide: 0 };
  let byVisitor = false;
  let pointerX: number | null = null;
  // What the hand did last frame: smoothed velocities and their last signs.
  let omega = 0;
  let sweep = 0;
  let prevTilt = 0;
  let prevSlide = 0;
  let omegaSign = 0;
  let sweepSign = 0;
  let prevTiltForCatch = 0;
  let tossing = false;

  let fuel = 0;
  let front = 1;
  let gustE = 0;
  let light = 0;
  let state: FlambePanState = "out";
  let lastFlare = -1e9;
  let stillKey = "";
  let autoDone = false;

  // Particles, preallocated: nothing is created per frame.
  const px = new Float32Array(CAP);
  const py = new Float32Array(CAP);
  const vx = new Float32Array(CAP);
  const vy = new Float32Array(CAP);
  const age = new Float32Array(CAP);
  const life = new Float32Array(CAP);
  const size = new Float32Array(CAP);
  const rise = new Float32Array(CAP);
  const kind = new Uint8Array(CAP);
  const wob = new Float32Array(CAP);
  let next = 0;
  let alive = 0;
  let emitAcc = 0;
  let lickAcc = 0;
  let rand = mulberry(1);

  // The still flame for reduced motion: a fixed seeded arrangement.
  const STILL = 72;
  const still = new Float32Array(STILL * 4);
  const seedStill = (seed: number) => {
    const r = mulberry(seed + 41);
    for (let i = 0; i < STILL; i += 1) {
      const lick = i >= STILL - 12;
      still[i * 4] = r();
      still[i * 4 + 1] = lick ? r() * 0.18 : Math.pow(r(), 0.8);
      still[i * 4 + 2] = lick ? 2.4 + r() * 1.4 : 5 + r() * 5;
      still[i * 4 + 3] = lick ? -1 : r();
    }
  };

  const fuelShape = () => ({
    flare: smooth(0.22, 0.62, fuel),
    tall: 0.35 + 0.65 * smooth(0.2, 0.8, fuel),
  });
  const gustNow = (c: Config) => Math.min(1.3, gustE) * clamp(c.gust, 0, 1);

  /** A point on the pan, in its own frame, carried into the scene. */
  const toScene = (lx: number, ly: number): [number, number] => {
    const a = (-pan.tilt * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const dx = lx - PIVOT.x;
    const dy = ly - PIVOT.y;
    return [
      PIVOT.x + dx * cos - dy * sin + pan.slide,
      PIVOT.y + dx * sin + dy * cos,
    ];
  };

  const report = () => {
    const next: FlambePanState =
      fuel > 0.22 ? "flaring" : fuel > 0 ? "licks" : "out";
    if (next === state) return;
    state = next;
    hooks.current.state(next);
  };

  const catchSpirit = () => {
    const c = cfg;
    if (!c) return;
    const now = performance.now();
    if (fuel < 0.55) {
      fuel = 1;
      front = c.motionSafe ? 0 : 1;
      gustE = Math.max(gustE, 0.35);
      if (byVisitor && now - lastFlare > 600) {
        lastFlare = now;
        hooks.current.flare("catch", pointerX);
      }
    } else {
      // Tipped again while it burns: topped up and gusting.
      fuel = 1;
      gustE = Math.min(1.6, gustE + 0.5);
    }
    report();
  };

  const emit = (c: Config, dt: number) => {
    const { flare, tall } = fuelShape();
    const g = gustNow(c);
    const height = clamp(c.height, 0.2, 1) * ROOM * tall * (1 + g);
    const density = clamp(c.density, 0.3, 1);
    const low = Math.max(0, pan.tilt);
    const bias = 1 + low / 7;
    const spawn = (lick: boolean) => {
      const i = next;
      next = (next + 1) % CAP;
      const u = front * Math.pow(rand(), bias);
      const across = 2 * u - 1;
      const lx = SAUCE.cx + across * SAUCE.rx * 0.9;
      const ly =
        SAUCE.cy +
        (rand() * 2 - 1) * SAUCE.ry * 0.55 * Math.sqrt(1 - across * across);
      const [sx, sy] = toScene(lx, ly);
      px[i] = sx;
      py[i] = sy;
      age[i] = 0;
      wob[i] = rand() * 40;
      if (lick) {
        const L = 0.16 + rand() * 0.14;
        const H = 6 + rand() * 8 * (0.6 + 0.4 * (1 - flare));
        life[i] = L;
        rise[i] = H / (L * L);
        vy[i] = (-0.55 * H) / L;
        vx[i] = (rand() - 0.5) * 8;
        size[i] = 2.2 + rand() * 1.6;
        kind[i] = 1;
      } else {
        const L = (0.48 + rand() * 0.44) * (0.75 + 0.35 * tall);
        const H = height * (0.75 + rand() * 0.4);
        life[i] = L;
        rise[i] = H / (L * L);
        vy[i] = (-0.4 * H) / L;
        vx[i] = (rand() - 0.5) * 10;
        size[i] =
          (4.5 + rand() * 4.8) *
          (0.65 + 0.55 * clamp(c.height, 0.2, 1)) *
          (0.8 + 0.4 * tall);
        kind[i] = 0;
      }
    };
    // The front of the catch throws a burst at the lip.
    const catching = front < 1 ? 1 : 0;
    emitAcc += dt * density * 250 * flare * (1 + 0.6 * g) + dt * catching * 120;
    lickAcc += dt * density * 60 * (fuel > 0 ? 1 : 0);
    while (emitAcc >= 1) {
      emitAcc -= 1;
      spawn(false);
    }
    while (lickAcc >= 1) {
      lickAcc -= 1;
      spawn(true);
    }
  };

  const springStep = (
    x: number,
    v: number,
    target: number,
    k: { stiffness: number; damping: number; mass: number },
    dt: number,
  ): [number, number] => {
    const n = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / n;
    for (let i = 0; i < n; i += 1) {
      const a = (-k.stiffness * (x - target) - k.damping * v) / k.mass;
      v += a * h;
      x += v * h;
    }
    return [x, v];
  };

  /** Advances everything by dt; returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;

    if (!dragging) {
      if (c.motionSafe) {
        [pan.tilt, pan.tiltV] = springStep(
          pan.tilt,
          pan.tiltV,
          tiltTarget,
          tiltSpring,
          dt,
        );
        [pan.slide, pan.slideV] = springStep(
          pan.slide,
          pan.slideV,
          0,
          springs.glide,
          dt,
        );
        if (tossing && pan.tilt >= tiltTarget * 0.94) {
          tossing = false;
          tiltTarget = 0;
          tiltSpring = springs.glide;
        }
        if (
          Math.abs(pan.tilt - tiltTarget) < 0.01 &&
          Math.abs(pan.tiltV) < 0.05 &&
          Math.abs(pan.slide) < 0.01 &&
          Math.abs(pan.slideV) < 0.05
        ) {
          pan.tilt = tiltTarget;
          pan.slide = 0;
          pan.tiltV = 0;
          pan.slideV = 0;
        } else moving = true;
      } else {
        pan.tilt = tiltTarget;
        pan.slide = 0;
      }
    } else moving = true;

    // The hand: smoothed velocities; each reversal of a quick movement is a
    // shake, and a shake gusts the flame.
    const w = (pan.tilt - prevTilt) / Math.max(dt, 1e-3);
    const sv = (pan.slide - prevSlide) / Math.max(dt, 1e-3);
    prevTilt = pan.tilt;
    prevSlide = pan.slide;
    omega += (w - omega) * 0.5;
    sweep += (sv - sweep) * 0.5;
    const shake = (v: number, threshold: number, sign: number) => {
      if (Math.abs(v) < threshold) return sign;
      const s = Math.sign(v);
      if (sign !== 0 && s !== sign) {
        gustE = Math.min(1.6, gustE + 0.42);
        if (fuel > 0.1) fuel = Math.min(1, fuel + 0.05);
        if (byVisitor && fuel > 0.2) {
          const now = performance.now();
          if (now - lastFlare > 420) {
            lastFlare = now;
            hooks.current.flare("gust", pointerX);
          }
        }
      }
      return s;
    };
    sweepSign = shake(sweep, 110, sweepSign);
    omegaSign = shake(omega, 70, omegaSign);

    const crossing =
      prevTiltForCatch < c.catchAngle && pan.tilt >= c.catchAngle;
    prevTiltForCatch = pan.tilt;
    if (crossing) catchSpirit();

    gustE *= Math.exp(-dt / 0.4);
    if (gustE < 0.002) gustE = 0;
    else moving = true;

    if (!c.paused) {
      if (fuel > 0) {
        fuel = Math.max(0, fuel - dt / clamp(c.burnTime, 1, 8));
        front = Math.min(1, front + dt / SPREAD);
        moving = true;
      }
      report();
      if (c.motionSafe) {
        emit(c, dt);
        const leanK = clamp(c.lean, 0, 1);
        const trail = clamp(-pan.slideV - sweep, -420, 420) * 1.5 * leanK;
        let count = 0;
        for (let i = 0; i < CAP; i += 1) {
          const L = life[i] ?? 0;
          if (L <= 0) continue;
          const a = (age[i] ?? 0) + dt;
          if (a >= L) {
            life[i] = 0;
            continue;
          }
          age[i] = a;
          const r = rise[i] ?? 0;
          const k = kind[i] === 1 ? 0.35 : 1;
          // Buoyancy up, a lean toward the low lip, the air the pan moves
          // through, and a slow curl that makes tongues of the plume.
          const curl =
            r * 0.55 * Math.sin((wob[i] ?? 0) + a * 8.5 + (py[i] ?? 0) * 0.07);
          const ax = (-(pan.tilt / 18) * 0.7 * r * leanK + trail + curl) * k;
          vy[i] = (vy[i] ?? 0) - 1.2 * r * dt;
          vx[i] = ((vx[i] ?? 0) + ax * dt) * Math.exp(-dt * 1.4);
          px[i] = (px[i] ?? 0) + (vx[i] ?? 0) * dt;
          py[i] = (py[i] ?? 0) + (vy[i] ?? 0) * dt;
          count += 1;
        }
        alive = count;
        if (alive > 0) moving = true;
      }
    }

    const { flare } = fuelShape();
    const target =
      fuel > 0
        ? flare * (0.72 + 0.35 * Math.min(1, gustNow(c))) +
          0.14 * smooth(0, 0.08, fuel)
        : 0;
    const rate = target > light ? 14 : 3.5;
    light += (target - light) * (1 - Math.exp(-dt * rate));
    if (Math.abs(target - light) < 0.002) light = target;
    else moving = true;
    return moving;
  };

  const ensureAtlas = (c: Config) => {
    if (atlas && atlasHue === c.hue) return;
    atlas = buildAtlas(c.hue);
    atlasHue = c.hue;
  };

  const drawSprite = (
    index: number,
    x: number,
    y: number,
    w: number,
    h: number,
    alpha: number,
  ) => {
    if (!ctx || !atlas || alpha <= 0.003) return;
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(
      atlas,
      index * SPRITE,
      0,
      SPRITE,
      SPRITE,
      x - w / 2,
      y - h / 2,
      w,
      h,
    );
  };

  const setAttr = (el: Element, name: string, value: string) => {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const paintPan = () => {
    const t = `translate(${r3(pan.slide)} 0) rotate(${r3(-pan.tilt)} ${PIVOT.x} ${PIVOT.y})`;
    setAttr(nodes.back, "transform", t);
    setAttr(nodes.front, "transform", t);
    setAttr(nodes.wash, "opacity", String(r3(light * 0.62)));
    setAttr(nodes.sheen, "opacity", String(r3(light * 0.55)));
    setAttr(nodes.rim, "opacity", String(r3(light * 0.4)));
    setAttr(nodes.glaze, "opacity", String(r3(light * 0.5)));
  };

  const drawLive = (c: Config) => {
    if (!ctx) return;
    const { flare, tall } = fuelShape();
    const g = gustNow(c);
    if (light > 0.01) {
      const [cx, cy] = toScene(SAUCE.cx, SAUCE.cy - 4);
      drawSprite(
        Math.round((TEMPS - 1) * 0.5),
        cx,
        cy - 8,
        130,
        70 + 40 * tall,
        0.32 * light * (1 + 0.4 * g),
      );
    }
    const temp = 0.55 + 0.45 * smooth(0.15, 0.7, fuel);
    for (let i = 0; i < CAP; i += 1) {
      const L = life[i] ?? 0;
      if (L <= 0) continue;
      const t = (age[i] ?? 0) / L;
      const T = 1 - t;
      const s0 = size[i] ?? 0;
      const grow = (0.7 + 0.8 * Math.sqrt(t)) * (1 - t * t * t);
      const r = s0 * grow;
      if (kind[i] === 1) {
        const idx = TEMPS + Math.round(clamp(T, 0, 1) * (BLUES - 1));
        drawSprite(
          idx,
          px[i] ?? 0,
          py[i] ?? 0,
          r * 2,
          r * 3.2,
          Math.min(1, t * 12) * Math.pow(T, 0.8) * 0.9,
        );
      } else {
        // Born pale gold rather than white, so the roots do not merge into a
        // white bar; a tongue narrows and stretches as it climbs.
        const idx = Math.round(clamp(T * temp * 0.9, 0, 1) * (TEMPS - 1));
        drawSprite(
          idx,
          px[i] ?? 0,
          py[i] ?? 0,
          r * 2 * (1 - 0.45 * t),
          r * 3.6 * (1 + 0.4 * t),
          Math.min(1, t * 9) * Math.pow(T, 0.7) * 0.8 * (0.5 + 0.5 * flare),
        );
      }
    }
  };

  /** Reduced motion: a still, seeded arrangement of tongues sized by the fuel. */
  const drawStill = (c: Config) => {
    if (!ctx || fuel <= 0) return;
    const { flare, tall } = fuelShape();
    const height = clamp(c.height, 0.2, 1) * ROOM * tall;
    const leanK = clamp(c.lean, 0, 1);
    const temp = 0.55 + 0.45 * smooth(0.15, 0.7, fuel);
    const [gx, gy] = toScene(SAUCE.cx, SAUCE.cy - 4);
    drawSprite(
      Math.round((TEMPS - 1) * 0.5),
      gx,
      gy - 8,
      130,
      70 + 40 * tall,
      0.32 * light,
    );
    const count = Math.round(STILL * (0.4 + 0.6 * clamp(c.density, 0.3, 1)));
    for (let i = 0; i < STILL; i += 1) {
      const lick = (still[i * 4 + 3] ?? 0) < 0;
      if (!lick && (i > count || flare <= 0.02)) continue;
      const u = still[i * 4] ?? 0;
      const v = still[i * 4 + 1] ?? 0;
      const s0 = still[i * 4 + 2] ?? 0;
      const across = 2 * u - 1;
      const [bx, by] = toScene(SAUCE.cx + across * SAUCE.rx * 0.88, SAUCE.cy);
      if (lick) {
        drawSprite(TEMPS + 3, bx, by - 3 - v * 30, s0 * 2, s0 * 3.2, 0.85);
        continue;
      }
      const h = v * height;
      const x = bx - leanK * (pan.tilt / 18) * 0.35 * h * v;
      const T = 1 - v;
      drawSprite(
        Math.round(clamp(T * temp, 0, 1) * (TEMPS - 1)),
        x,
        by - h,
        s0 * (1 - v * 0.6) * 2 * (0.65 + 0.55 * c.height),
        s0 * (1 - v * 0.6) * 3.5 * (0.65 + 0.55 * c.height),
        0.75 * flare * Math.pow(T, 0.5),
      );
    }
  };

  const draw = () => {
    const c = cfg;
    if (!c) return;
    paintPan();
    if (!ctx || view.w < 1) return;
    ensureAtlas(c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = view.ratio * view.s;
    ctx.setTransform(k, 0, 0, k, view.ratio * view.ox, view.ratio * view.oy);
    ctx.globalCompositeOperation = "lighter";
    if (c.motionSafe) drawLive(c);
    else drawStill(c);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    if (c.motionSafe) draw();
    else {
      // The still flame is redrawn only when it would look different.
      const key = `${Math.ceil(fuel * 10)}|${r3(pan.tilt)}|${Math.round(light * 10)}`;
      if (key !== stillKey) {
        stillKey = key;
        draw();
      }
    }
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const clearTimers = () => {
    for (const t of timers) window.clearTimeout(t);
    timers.length = 0;
  };

  const later = (ms: number, fn: () => void) => {
    timers.push(window.setTimeout(fn, ms));
  };

  /** A toss: tip past the catch on snap, hold a beat, set it back on glide. */
  const toss = () => {
    const c = cfg;
    if (!c) return;
    clearTimers();
    if (!c.motionSafe) {
      prevTiltForCatch = 0;
      catchSpirit();
      draw();
      kick();
      return;
    }
    tiltTarget = clamp(c.catchAngle + 9, 0, c.maxTilt);
    tiltSpring = springs.snap;
    // The pan is set back once it has reached the top of the toss, not after
    // a fixed time: a slow frame rate must not cut the toss short of the catch.
    tossing = true;
    kick();
  };

  /** A shake: three quick slides each way, as a hand would. */
  const shakePan = () => {
    const c = cfg;
    if (!c) return;
    clearTimers();
    if (!c.motionSafe) {
      gustE = Math.min(1.6, gustE + 0.9);
      fuel = Math.min(1, fuel + 0.12);
      if (byVisitor) hooks.current.flare("gust", pointerX);
      report();
      draw();
      kick();
      return;
    }
    const kicks = [520, -560, 540, -420];
    kicks.forEach((v, i) => {
      later(i * 95, () => {
        pan.slideV = v;
        pan.tiltV = v > 0 ? 60 : -60;
        kick();
      });
    });
    kick();
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const s = Math.min(w / VIEW_W, h / VIEW_H);
    view.w = w;
    view.h = h;
    view.s = s;
    view.ox = (w - VIEW_W * s) / 2;
    view.oy = h - VIEW_H * s;
    view.ratio = ratio;
    const bw = Math.max(1, Math.round(w * ratio));
    const bh = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    stillKey = "";
    draw();
  };

  return {
    configure(nextCfg) {
      const was = cfg;
      cfg = nextCfg;
      if (!was || was.seed !== nextCfg.seed) {
        rand = mulberry(nextCfg.seed);
        seedStill(nextCfg.seed);
      }
      if (!was || was.dpr !== nextCfg.dpr) resize();
      if (was && was.motionSafe !== nextCfg.motionSafe && !nextCfg.motionSafe) {
        // Reduced motion now: whatever flew is gone, the still takes over.
        life.fill(0);
        alive = 0;
        front = 1;
      }
      if (!was && nextCfg.trigger === "mount") {
        autoDone = true;
        later(420, () => {
          if (dragging) return;
          byVisitor = false;
          toss();
        });
      }
      stillKey = "";
      draw();
      kick();
    },
    resize,
    seen(inView) {
      if (!inView) return;
      const c = cfg;
      if (c && c.trigger === "inView" && !autoDone) {
        autoDone = true;
        later(380, () => {
          if (dragging) return;
          byVisitor = false;
          toss();
        });
      }
      stillKey = "";
      draw();
      kick();
    },
    wake() {
      stillKey = "";
      draw();
      kick();
    },
    grab(clientX) {
      clearTimers();
      dragging = true;
      byVisitor = true;
      pointerX = clientX;
      grabbed = { tilt: pan.tilt, slide: pan.slide };
      tossing = false;
      pan.tiltV = 0;
      pan.slideV = 0;
      tiltTarget = 0;
      tiltSpring = springs.glide;
      kick();
    },
    drag(dx, dy, clientX) {
      const c = cfg;
      if (!c || !dragging) return;
      pointerX = clientX;
      const s = view.s || 1;
      const tilt = grabbed.tilt - (dy / s) * TILT_PER_UNIT;
      pan.tilt = r3(rubberClamp(tilt, -6, clamp(c.maxTilt, 16, 40), 24));
      pan.slide = r3(rubberClamp(grabbed.slide + dx / s, -SLIDE, SLIDE, 60));
      if (!c.motionSafe) {
        // No loop needs to be running for a still flame to follow the pan.
        if (prevTiltForCatch < c.catchAngle && pan.tilt >= c.catchAngle) {
          catchSpirit();
        }
        prevTiltForCatch = pan.tilt;
        stillKey = "";
        draw();
      }
      kick();
    },
    release(velX, velY) {
      const c = cfg;
      dragging = false;
      if (!c) return;
      const s = view.s || 1;
      tiltTarget = 0;
      tiltSpring = springs.glide;
      if (c.motionSafe) {
        pan.tiltV = clamp((-velY / s) * TILT_PER_UNIT, -400, 400);
        pan.slideV = clamp(velX / s, -900, 900);
      } else {
        pan.tilt = 0;
        pan.slide = 0;
        prevTiltForCatch = 0;
        stillKey = "";
        draw();
      }
      kick();
    },
    press(clientX) {
      byVisitor = true;
      pointerX = clientX;
      if (fuel > 0.22) shakePan();
      else toss();
    },
    flaring: () => fuel > 0.22,
    dispose() {
      disposed = true;
      clearTimers();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      atlas = null;
    },
  };
}

/**
 * A copper pan on a dark range, held by its handle. Drag the scene and the pan
 * follows the hand 1:1: up tips it, dipping the far lip toward the gas, and
 * side to side slides it over the grate; let go and it is set back level on
 * the glide spring with the throw's velocity. When the lip dips past
 * `catchAngle` the spirit catches: a front of fire runs across the sauce from
 * the low lip and tongues of flame flare up, leaning with the tilt and
 * trailing the pan's motion through the air, while the room takes their
 * light. A quick shake gusts them higher; then the spirit burns down to a few
 * blue licks and goes out.
 *
 * The flame is a particle plume on one Canvas 2D layer, drawn with
 * pre-rendered sprites in additive light (`plus-lighter` over the scene); the
 * scene itself is SVG in fixed pigments. The loop runs only on screen, in a
 * visible tab and while something burns or moves. Under reduced motion the pan
 * follows the hand without springs and the flame is a still, seeded
 * arrangement redrawn smaller in calm steps as it burns down.
 */
export function FlambePan({
  height = 0.7,
  gust = 0.6,
  hue = 52,
  burnTime = 3.2,
  catchAngle = 12,
  maxTilt = 30,
  lean = 0.6,
  density = 0.7,
  metal = "copper",
  rangeColor = RANGE,
  trigger = "inView",
  sound = false,
  onFlameChange,
  label = "Flambé pan",
  paused = false,
  disabled = false,
  seed = 1,
  dpr = 2,
  children,
  className,
}: FlambePanProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const m = METALS[metal] ?? METALS.copper;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const backRef = React.useRef<SVGGElement | null>(null);
  const frontRef = React.useRef<SVGGElement | null>(null);
  const washRef = React.useRef<SVGEllipseElement | null>(null);
  const sheenRef = React.useRef<SVGEllipseElement | null>(null);
  const rimRef = React.useRef<SVGEllipseElement | null>(null);
  const glazeRef = React.useRef<SVGEllipseElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const [spoken, setSpoken] = React.useState("");

  const config: Config = {
    height,
    gust,
    hue,
    burnTime,
    catchAngle: clamp(catchAngle, 6, 24),
    maxTilt: clamp(maxTilt, 16, 40),
    lean,
    density,
    trigger,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  const hooks = React.useRef<Hooks>({ state: () => {}, flare: () => {} });
  React.useEffect(() => {
    hooks.current = {
      state: (next) => {
        setSpoken(
          next === "flaring"
            ? "Flaring."
            : next === "licks"
              ? "Burning down to blue licks."
              : "Out.",
        );
        onFlameChange?.(next);
      },
      flare: (kind, clientX) => {
        const root = rootRef.current;
        const pan = clientX !== null && root ? panFrom(clientX, root) : 0;
        if (kind === "catch") {
          audio.play("flare", {
            pitch: 0.82 + clamp(height, 0.2, 1) * 0.3,
            gain: 0.62,
            pan,
          });
        } else {
          audio.play("flare", { pitch: 1.3, gain: 0.3, pan });
        }
      },
    };
  });

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const back = backRef.current;
    const front = frontRef.current;
    const wash = washRef.current;
    const sheen = sheenRef.current;
    const rim = rimRef.current;
    const glaze = glazeRef.current;
    if (
      !root ||
      !canvas ||
      !back ||
      !front ||
      !wash ||
      !sheen ||
      !rim ||
      !glaze
    )
      return;
    const e = createEngine(
      { root, canvas, back, front, wash, sheen, rim, glaze },
      visible,
      hooks,
    );
    engine.current = e;
    e.configure(latest.current);
    if (visible.current) e.seen(true);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        e.seen(visible.current);
      },
      { threshold: 0.2 },
    );
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      sizer.disconnect();
      watcher.disconnect();
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => engine.current?.grab(point.x),
    onMove: ({ offset, point }) =>
      engine.current?.drag(offset.x, offset.y, point.x),
    onEnd: ({ velocity }) => engine.current?.release(velocity.x, velocity.y),
    onCancel: () => engine.current?.release(0, 0),
    onTap: (event) => engine.current?.press(event.clientX),
  });

  const flame = {
    core: `oklch(0.95 0.08 ${r3(hue + 20)})`,
    mid: `oklch(0.74 0.17 ${r3(hue)})`,
  };

  return (
    <div className={cn("relative isolate w-full", className)}>
      <div
        ref={rootRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!event.repeat) engine.current?.press(null);
          }
        }}
        {...drag}
        className={cn(
          "absolute inset-0 touch-none overflow-clip rounded-4 select-none",
          "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
        style={{
          backgroundColor: BACKSPLASH,
          backgroundImage: [
            "linear-gradient(180deg, oklch(0.25 0.014 60 / 0.55), transparent 62%)",
            "repeating-linear-gradient(0deg, oklch(1 0 0 / 0.028) 0 1px, transparent 1px 24px)",
            "repeating-linear-gradient(90deg, oklch(1 0 0 / 0.02) 0 1px, transparent 1px 48px)",
          ].join(", "),
        }}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMax meet"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <defs>
            <radialGradient id={`${uid}-wash`}>
              <stop offset="0" stopColor={flame.mid} stopOpacity="0.9" />
              <stop offset="0.55" stopColor={flame.mid} stopOpacity="0.25" />
              <stop offset="1" stopColor={flame.mid} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-sheen`}>
              <stop offset="0" stopColor={flame.core} stopOpacity="0.7" />
              <stop offset="1" stopColor={flame.core} stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`${uid}-gas`}>
              <stop offset="0" stopColor={GAS} stopOpacity="0.55" />
              <stop offset="1" stopColor={GAS} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`${uid}-wall`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor={m.dark} />
              <stop offset="0.22" stopColor={m.mid} />
              <stop offset="0.42" stopColor={m.light} />
              <stop offset="0.62" stopColor={m.mid} />
              <stop offset="1" stopColor={m.dark} />
            </linearGradient>
            <linearGradient id={`${uid}-inside`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={m.dark} />
              <stop offset="1" stopColor={m.inside} />
            </linearGradient>
            <radialGradient id={`${uid}-sauce`} cx="0.42" cy="0.4" r="0.7">
              <stop offset="0" stopColor="oklch(0.6 0.13 62)" />
              <stop offset="0.6" stopColor="oklch(0.44 0.11 52)" />
              <stop offset="1" stopColor="oklch(0.3 0.08 45)" />
            </radialGradient>
            <linearGradient id={`${uid}-handle`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={m.handle[0]} />
              <stop offset="1" stopColor={m.handle[1]} />
            </linearGradient>
            <clipPath id={`${uid}-mouth`}>
              <ellipse cx="150" cy="122.6" rx="53" ry="8.4" />
            </clipPath>
          </defs>
          <ellipse
            ref={washRef}
            cx="150"
            cy="78"
            rx="190"
            ry="120"
            fill={`url(#${uid}-wash)`}
            opacity="0"
          />
          {/* The cooktop, run out past the box so a wide root stays covered. */}
          <rect x="-400" y="156" width="1120" height="60" fill={rangeColor} />
          <rect
            x="-400"
            y="156"
            width="1120"
            height="1.2"
            fill="oklch(0.42 0.01 60)"
          />
          <rect
            x="-400"
            y="192"
            width="1120"
            height="8"
            fill="oklch(0.17 0.006 60)"
          />
          <ellipse
            ref={sheenRef}
            cx="150"
            cy="162"
            rx="150"
            ry="14"
            fill={`url(#${uid}-sheen)`}
            opacity="0"
          />
          {/* Grate and the gas ring burning low. */}
          <ellipse cx="150" cy="152" rx="44" ry="9" fill={`url(#${uid}-gas)`} />
          <ellipse
            cx="150"
            cy="153.2"
            rx="31"
            ry="3.6"
            fill="oklch(0.16 0.006 60)"
          />
          {Array.from({ length: 11 }, (_, i) => {
            const a = Math.PI * (0.06 + (0.88 * i) / 10);
            const x = r3(150 - 29 * Math.cos(a));
            const y = r3(153.2 + 3.2 * Math.sin(a));
            return (
              <path
                key={i}
                d={`M ${r3(x - 1.4)} ${y} Q ${x} ${r3(y - 6.5)} ${r3(x + 1.4)} ${y} Z`}
                fill={GAS}
                opacity="0.85"
              />
            );
          })}
          <rect
            x="94"
            y="150.4"
            width="112"
            height="2.6"
            rx="1.3"
            fill="oklch(0.13 0.004 60)"
          />
          <rect
            x="100"
            y="150.4"
            width="3"
            height="6"
            fill="oklch(0.13 0.004 60)"
          />
          <rect
            x="197"
            y="150.4"
            width="3"
            height="6"
            fill="oklch(0.13 0.004 60)"
          />
          <g
            ref={backRef}
            transform={`translate(0 0) rotate(0 ${PIVOT.x} ${PIVOT.y})`}
          >
            <ellipse cx="150" cy="122" rx="56" ry="9.5" fill={m.dark} />
            <ellipse
              cx="150"
              cy="122.6"
              rx="53"
              ry="8.4"
              fill={`url(#${uid}-inside)`}
            />
            <g clipPath={`url(#${uid}-mouth)`}>
              <ellipse
                cx={SAUCE.cx}
                cy={SAUCE.cy}
                rx={SAUCE.rx + 3}
                ry={SAUCE.ry + 1}
                fill={`url(#${uid}-sauce)`}
              />
              {/* Three folded crêpes lying in the sauce. */}
              <path
                d="M 112 125.6 Q 118 119.4 131 120.2 L 129.4 127.4 Q 120 128.4 112 125.6 Z"
                fill="oklch(0.8 0.1 78)"
                stroke="oklch(0.6 0.1 62)"
                strokeWidth="0.5"
              />
              <path
                d="M 137 127.6 Q 141 120.4 156 120.4 L 158 128.2 Q 147 129.6 137 127.6 Z"
                fill="oklch(0.83 0.095 80)"
                stroke="oklch(0.6 0.1 62)"
                strokeWidth="0.5"
              />
              <path
                d="M 165 126.6 Q 172 119.8 186 121.6 L 182.6 127.4 Q 173 128.4 165 126.6 Z"
                fill="oklch(0.78 0.1 74)"
                stroke="oklch(0.6 0.1 62)"
                strokeWidth="0.5"
              />
              <ellipse
                ref={glazeRef}
                cx={SAUCE.cx}
                cy={SAUCE.cy - 1}
                rx={SAUCE.rx}
                ry={SAUCE.ry}
                fill={flame.core}
                opacity="0"
              />
            </g>
          </g>
        </svg>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
          style={{ mixBlendMode: "plus-lighter" }}
        />
        <svg
          aria-hidden
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMax meet"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <g
            ref={frontRef}
            transform={`translate(0 0) rotate(0 ${PIVOT.x} ${PIVOT.y})`}
          >
            {/* The outer wall stands in front of the flame's roots, so the
                flame rises from inside the pan. */}
            <path
              d="M 94 122 A 56 9.5 0 0 0 206 122 L 196 146 A 46 4.5 0 0 1 104 146 Z"
              fill={`url(#${uid}-wall)`}
            />
            <path
              d="M 94 122 A 56 9.5 0 0 0 206 122 L 203 122.6 A 53 8.4 0 0 1 97 122.6 Z"
              fill={m.light}
            />
            <ellipse
              ref={rimRef}
              cx="150"
              cy="122"
              rx="56"
              ry="9.5"
              fill="none"
              stroke={flame.core}
              strokeWidth="0.7"
              opacity="0"
            />
            <path
              d="M 203 120.6 L 296 108 Q 304 107.2 304.6 111.6 Q 304.8 115.8 298 116.6 L 205 127.6 Z"
              fill={`url(#${uid}-handle)`}
            />
            <rect
              x="200"
              y="119.6"
              width="12"
              height="9"
              rx="2"
              fill={m.mid}
              transform="rotate(-7 206 124)"
            />
            <circle cx="206.4" cy="122.2" r="1" fill={m.light} />
            <circle cx="207" cy="126" r="1" fill={m.light} />
            <ellipse
              cx="296"
              cy="112.3"
              rx="3.2"
              ry="1.7"
              fill={BACKSPLASH}
              transform="rotate(-7 296 112.3)"
            />
          </g>
        </svg>
        {children ? (
          <div className="pointer-events-none absolute inset-0">{children}</div>
        ) : null}
      </div>
      <span id={hintId} className="sr-only">
        Drag to tip and shake the pan. Enter or Space tips it to catch the
        spirit, and again to shake it while it burns.
      </span>
      <span aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
