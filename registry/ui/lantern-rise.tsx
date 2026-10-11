"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LanternRiseProps = {
  /** Content above the sky: a headline, a call to action. It stays fully interactive. */
  children?: React.ReactNode;
  /** Short wishes written on the lanterns' paper, readable while they are near. Released lanterns carry the next in turn. */
  wishes?: readonly string[];
  /** How many lanterns are aloft at once, 0 to 60. @default 18 */
  count?: number;
  /** The breeze, 0 (still air: they rise straight) to 1 (they lean, sail sideways and sway wide). @default 0.45 */
  drift?: number;
  /** The colour of the light, 0 (pale gold) to 1 (deep amber). @default 0.5 */
  warmth?: number;
  /** How fast they climb, 0.25 to 2. @default 1 */
  speed?: number;
  /** A near lantern's height in px; scaled down on small skies. @default 64 */
  size?: number;
  /** How many stars, 0 to 1. @default 0.5 */
  stars?: number;
  /** The sky, any CSS colour; the top is deepened and the horizon warmed from it. @default the accent mixed toward black */
  skyColor?: string;
  /** A click on the sky or Enter releases a lantern. @default true */
  interactive?: boolean;
  /** Fires when a lantern is released, with the wish it carries (or null). */
  onRelease?: (wish: string | null) => void;
  /** Hold every lantern where it is. @default false */
  paused?: boolean;
  /** Seeds where the lanterns rise and how each one sways. @default 3 */
  seed?: number;
  /** Names the sky for assistive technology. @default "Lantern sky" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the sky; give it a height. @default "h-56 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0 || 1));
  return t * t * (3 - 2 * t);
};

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The reference lantern: the sprite is drawn at this size and scaled. */
const REF_W = 52;
const REF_H = 68;
/** The snap spring, for a released lantern's paper filling out. */
const SNAP_W = Math.sqrt(springs.snap.stiffness / springs.snap.mass);
const SNAP_Z =
  springs.snap.damping /
  (2 * Math.sqrt(springs.snap.stiffness * springs.snap.mass));

type Lantern = {
  /** Where it started, px, and its starting scale. */
  x0: number;
  y0: number;
  s0: number;
  /** Seconds since it set off, and its own sway. */
  age: number;
  phase: number;
  freq: number;
  sway: number;
  rise: number;
  wish: number;
  /** Released by the visitor: it ignites and lifts off rather than drifting in. */
  released: boolean;
  /** Fading in (reduced motion) or out (at the end of its flight). */
  fade: number;
  alive: boolean;
  /** Computed each frame. */
  x: number;
  y: number;
  s: number;
  tilt: number;
  glow: number;
  fill: number;
};

/** OKLCH to an sRGB string the canvas reads everywhere. */
function rgb(L: number, C: number, h: number, alpha = 1): string {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  const [R, G, B] = lin.map((c) => {
    const v = clamp01(c);
    const g = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    return Math.round(clamp01(g) * 255);
  });
  return `rgba(${R}, ${G}, ${B}, ${r2(alpha)})`;
}

/** Paper colours for a warmth: one hue family from pale gold to deep amber. */
function palette(warmth: number) {
  const w = clamp01(warmth);
  const hue = 88 - 46 * w;
  const core = { L: 0.97, C: 0.06 + 0.04 * w, h: hue + 12 };
  const paper = { L: 0.82 - 0.06 * w, C: 0.13 + 0.05 * w, h: hue };
  const rim = { L: 0.52 - 0.06 * w, C: 0.14 + 0.03 * w, h: hue - 18 };
  const halo = { L: 0.86, C: 0.12 + 0.05 * w, h: hue + 4 };
  const css = (c: { L: number; C: number; h: number }, alpha = 1) =>
    `oklch(${r2(c.L)} ${r2(c.C)} ${r2(c.h)}${alpha < 1 ? ` / ${alpha}` : ""})`;
  return {
    core: rgb(core.L, core.C, core.h),
    paper: rgb(paper.L, paper.C, paper.h),
    rim: rgb(rim.L, rim.C, rim.h),
    ink: rgb(0.34, 0.09, hue - 26, 0.82),
    halo: rgb(halo.L, halo.C, halo.h, 0.55),
    haloMid: rgb(halo.L, halo.C, halo.h, 0.16),
    haloEdge: rgb(halo.L, halo.C, halo.h, 0),
    flame: rgb(0.98, 0.05, hue + 20),
    /** The same colours for CSS: the server's still. */
    cssCore: css(core),
    cssPaper: css(paper),
    cssHalo: css(halo, 0.55),
  };
}

type Palette = ReturnType<typeof palette>;

/** Wraps a wish into at most three short lines that fit the paper. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** One lantern's paper, lit from inside, with its wish, drawn once to a sprite. */
function paintLantern(
  ctx: CanvasRenderingContext2D,
  k: number,
  p: Palette,
  wish: string | null,
  font: string,
) {
  const w = REF_W * k;
  const h = REF_H * k;
  ctx.clearRect(0, 0, w + 4 * k, h + 10 * k);
  ctx.save();
  ctx.translate(w / 2 + 2 * k, h / 2 + 2 * k);
  ctx.scale(k, k);
  const body = new Path2D(
    "M-23 -30 Q0 -35 23 -30 Q26 0 16 31 L-16 31 Q-26 0 -23 -30 Z",
  );
  const g = ctx.createRadialGradient(0, 24, 2, 0, 8, 44);
  g.addColorStop(0, p.core);
  g.addColorStop(0.45, p.paper);
  g.addColorStop(1, p.rim);
  ctx.fillStyle = g;
  ctx.fill(body);
  // Ribs: the frame showing through the paper.
  ctx.strokeStyle = p.rim;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 0.8;
  for (const x of [-11, 0, 11]) {
    ctx.beginPath();
    ctx.moveTo(x * 1.05, -32);
    ctx.quadraticCurveTo(x * 1.25, 0, x * 0.72, 31);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // The opening and the flame inside it.
  ctx.fillStyle = p.rim;
  ctx.beginPath();
  ctx.ellipse(0, 31, 16, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = p.flame;
  ctx.beginPath();
  ctx.ellipse(0, 29.5, 4.5, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (wish) {
    ctx.font = font;
    ctx.fillStyle = p.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrap(ctx, wish, 40);
    const lh = 10.5;
    const top = -4 - ((lines.length - 1) * lh) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 0, top + i * lh));
  }
  ctx.restore();
}

type Config = {
  count: number;
  drift: number;
  warmth: number;
  speed: number;
  size: number;
  stars: number;
  paused: boolean;
  motionSafe: boolean;
  seed: number;
  dpr: number;
  wishes: readonly string[];
  colorKey: string;
};

type Engine = {
  configure: (cfg: Config) => void;
  release: (x: number, y: number) => number;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  setVisible: (on: boolean) => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let spawnIn = 0;
  let wishNext = 0;
  const size = { w: 0, h: 0, k: 1 };
  const lanterns: Lantern[] = [];
  const sky = document.createElement("canvas");
  const skyCtx = sky.getContext("2d");
  const halo = document.createElement("canvas");
  const sprites = new Map<number, HTMLCanvasElement>();
  let pal: Palette = palette(0.5);
  let rand = lcg(3);
  const colours = {
    top: "rgb(8, 10, 24)",
    mid: "rgb(16, 20, 44)",
    low: "rgb(40, 34, 48)",
    glow: "rgba(255, 200, 120, 0.3)",
  };
  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readerCtx = reader.getContext("2d", { willReadFrequently: true });
  /** Any CSS colour, resolved by painting one pixel, as an rgb() the canvas reads everywhere. */
  const resolve = (colour: string, fallback: string) => {
    if (!readerCtx) return fallback;
    readerCtx.clearRect(0, 0, 1, 1);
    readerCtx.fillStyle = fallback;
    readerCtx.fillStyle = colour;
    readerCtx.fillRect(0, 0, 1, 1);
    const d = readerCtx.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0}, ${r2((d[3] ?? 255) / 255)})`;
  };
  const byScale = (a: Lantern, b: Lantern) => a.s - b.s;

  const spriteScale = () => {
    const c = cfg;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      clamp(c?.dpr ?? 2, 0.5, 2),
    );
    return (dpr * lanternH()) / REF_H;
  };

  /** A near lantern's height in px for this sky. */
  const lanternH = () => {
    const c = cfg;
    const base = clamp(c?.size ?? 64, 24, 140);
    return base * clamp(size.w / 520, 0.7, 1);
  };

  const sprite = (wish: number): HTMLCanvasElement => {
    const key = wish;
    const have = sprites.get(key);
    if (have) return have;
    const c = document.createElement("canvas");
    const k = spriteScale();
    c.width = Math.ceil((REF_W + 4) * k);
    c.height = Math.ceil((REF_H + 10) * k);
    const cc = c.getContext("2d");
    const text = wish >= 0 ? (cfg?.wishes[wish] ?? null) : null;
    const font = `italic 600 9.5px ${getComputedStyle(root).fontFamily || "serif"}`;
    if (cc) paintLantern(cc, k, pal, text, font);
    sprites.set(key, c);
    return c;
  };

  const paintHalo = () => {
    const k = spriteScale();
    const d = Math.ceil(REF_H * 3 * k);
    halo.width = d;
    halo.height = d;
    const hc = halo.getContext("2d");
    if (!hc) return;
    const g = hc.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
    g.addColorStop(0, pal.halo);
    g.addColorStop(0.35, pal.haloMid);
    g.addColorStop(1, pal.haloEdge);
    hc.fillStyle = g;
    hc.fillRect(0, 0, d, d);
  };

  const paintSky = () => {
    const c = cfg;
    if (!c || !skyCtx || size.w < 1) return;
    sky.width = canvas.width;
    sky.height = canvas.height;
    const W = sky.width;
    const H = sky.height;
    const g = skyCtx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, colours.top);
    g.addColorStop(0.62, colours.mid);
    g.addColorStop(1, colours.low);
    skyCtx.fillStyle = g;
    skyCtx.fillRect(0, 0, W, H);
    // A low glow where the lanterns come from.
    const glow = skyCtx.createRadialGradient(
      W / 2,
      H * 1.25,
      0,
      W / 2,
      H * 1.25,
      H * 1.1,
    );
    glow.addColorStop(0, pal.haloMid);
    glow.addColorStop(1, pal.haloEdge);
    skyCtx.fillStyle = glow;
    skyCtx.fillRect(0, 0, W, H);
    const r = lcg(c.seed * 7 + 1);
    const n = Math.round(
      ((W * H) / (2600 * (canvas.width / Math.max(1, size.w)) ** 2)) *
        clamp01(c.stars),
    );
    for (let i = 0; i < n; i += 1) {
      const x = r() * W;
      const y = r() * H * 0.82;
      const a = 0.25 + r() * 0.6;
      const rad = (0.4 + r() * 0.9) * (canvas.width / Math.max(1, size.w));
      skyCtx.fillStyle = `rgba(236, 240, 255, ${r2(a * (1 - y / H))})`;
      skyCtx.beginPath();
      skyCtx.arc(x, y, rad, 0, Math.PI * 2);
      skyCtx.fill();
    }
  };

  const newLantern = (
    released: boolean,
    x: number,
    y: number,
    s0: number,
  ): Lantern => {
    const c = cfg;
    const wishes = c?.wishes.length ?? 0;
    let wish = -1;
    if (wishes > 0 && (released || rand() < 0.55)) {
      wish = wishNext % wishes;
      wishNext += 1;
    }
    return {
      x0: x,
      y0: y,
      s0,
      age: 0,
      phase: rand() * Math.PI * 2,
      freq: 0.35 + rand() * 0.35,
      sway: 0.5 + rand() * 0.8,
      rise: 0.8 + rand() * 0.45,
      wish,
      released,
      fade: released && !(c?.motionSafe ?? true) ? 0 : 1,
      alive: true,
      x,
      y,
      s: s0,
      tilt: 0,
      glow: released ? 0 : 1,
      fill: released ? 0.86 : 1,
    };
  };

  /** Where a lantern is at its age: a pure function, so a still frame and a moving one agree. */
  /**
   * How fast lanterns recede, set by the sky's height: a near lantern is a
   * pinpoint by the time it reaches the top, whatever the box.
   */
  const recede = () => {
    const c = cfg;
    const vref = 46 * clamp(c?.speed ?? 1, 0.25, 2) * (lanternH() / 64) * 0.75;
    return clamp((1.9 * vref) / Math.max(80, size.h), 0.04, 0.6);
  };

  const place = (l: Lantern) => {
    const c = cfg;
    if (!c) return;
    const H = lanternH();
    const RECEDE = recede();
    const drift = clamp01(c.drift);
    const v = 46 * clamp(c.speed, 0.25, 2) * l.rise * (H / 64);
    // A released lantern hangs a moment while the flame catches, dips, then lifts.
    const hold = l.released ? 0.42 : 0;
    const te = Math.max(0, l.age - hold);
    const tau = l.released ? 0.55 : 0.01;
    const eased = te - tau * (1 - Math.exp(-te / tau));
    const s = l.s0 / (1 + RECEDE * eased);
    const climb = ((v * l.s0) / RECEDE) * Math.log(1 + RECEDE * eased);
    const dip = l.released
      ? 5 * l.s0 * Math.sin(Math.PI * clamp01(l.age / 0.5))
      : 0;
    const wind = (14 + 46 * drift) * (drift - 0.15);
    const along = ((wind * l.s0) / RECEDE) * Math.log(1 + RECEDE * eased);
    const ph = l.age * l.freq * Math.PI * 2 + l.phase;
    const amp = H * (0.08 + 0.42 * drift) * l.sway;
    l.s = s;
    l.x = l.x0 + along + amp * s * Math.sin(ph);
    l.y = l.y0 - climb + dip;
    // It leans into its sway and into the wind.
    l.tilt = (0.04 + 0.16 * drift) * l.sway * Math.cos(ph) + wind * 0.0012;
    const flick =
      0.9 +
      0.06 * Math.sin(l.age * 7.3 + l.phase) +
      0.04 * Math.sin(l.age * 13.1 + l.phase * 2);
    l.glow = l.released
      ? smooth(0, 0.28, l.age) * flick + 0.35 * Math.exp(-l.age * 5)
      : flick;
  };

  /** The paper filling out on the snap spring after release: a damped cosine from 0.86. */
  const fillAt = (age: number) => {
    const wd = SNAP_W * Math.sqrt(1 - SNAP_Z * SNAP_Z);
    return 1 - 0.14 * Math.exp(-SNAP_Z * SNAP_W * age) * Math.cos(wd * age);
  };

  /** Where a new lantern starts: upwind of the middle when there is a breeze. */
  const spawnX = () => {
    const d = clamp01(cfg?.drift ?? 0.45);
    return (rand() * (1 + 0.3 * d) - 0.3 * d) * size.w;
  };

  const seedSky = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    rand = lcg(c.seed);
    lanterns.length = 0;
    wishNext = 0;
    const n = Math.round(clamp(c.count, 0, 60));
    const H = lanternH();
    const R = recede();
    for (let i = 0; i < n; i += 1) {
      const s0 = 0.5 + rand() * 0.5;
      const l = newLantern(false, spawnX(), size.h + H * s0 * 0.6, s0);
      // Warm start: everyone already part-way through a flight across this
      // sky (the time to climb out of it, from the same climb law as place).
      const v = 46 * clamp(c.speed, 0.25, 2) * l.rise * (H / 64);
      const out =
        (Math.exp(((size.h + H * 1.5) * R) / Math.max(1, v * s0)) - 1) / R;
      l.age = ((i + rand()) / Math.max(1, n)) * Math.min(out, 60);
      place(l);
      lanterns.push(l);
    }
    spawnIn = 0;
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || size.w < 1) return;
    const dpr = canvas.width / Math.max(1, size.w);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(sky, 0, 0);
    lanterns.sort(byScale);
    const H = lanternH();
    for (const l of lanterns) {
      if (!l.alive) continue;
      const scale = l.s * (l.released ? fillAt(l.age) : 1);
      const px = l.x * dpr;
      const py = l.y * dpr;
      const alpha =
        l.fade * smooth(0.02, 0.1, l.s) * smooth(-H, H * 0.6, l.y + H);
      if (alpha <= 0.002) continue;
      // The halo, added: it is light, so overlapping halos brighten.
      const hd = halo.width * scale * (0.8 + 0.4 * l.glow);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * clamp01(l.glow) * (0.55 + 0.45 * (1 - l.s));
      ctx.drawImage(halo, px - hd / 2, py - hd / 2, hd, hd);
      ctx.globalCompositeOperation = "source-over";
      // Far away, only the glow is left: the paper fades into its own light.
      const paper = smooth(0.1, 0.3, l.s);
      if (paper > 0.01) {
        // Sprites are drawn at a near lantern's size on this screen.
        const sp = sprite(l.wish);
        const w = sp.width * scale;
        const h = sp.height * scale;
        ctx.globalAlpha = alpha * paper * (0.75 + 0.25 * clamp01(l.glow));
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(l.tilt);
        ctx.drawImage(sp, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      // The pinpoint of a distant lantern.
      if (paper < 0.99) {
        ctx.globalAlpha = alpha * (1 - paper) * clamp01(l.glow);
        ctx.fillStyle = pal.flame;
        ctx.beginPath();
        ctx.arc(
          px,
          py,
          Math.max(0.8 * dpr, 2.2 * l.s * dpr * (H / 64)),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const H = lanternH();
    for (const l of lanterns) {
      if (!l.alive) continue;
      l.age += dt;
      if (l.fade < 1 && !c.motionSafe) l.fade = Math.min(1, l.fade + dt / 0.3);
      place(l);
      if (
        l.y < -H * 2 ||
        l.s < 0.07 ||
        l.x < -size.w * 0.3 ||
        l.x > size.w * 1.3
      ) {
        l.fade -= dt / 1.2;
        if (l.fade <= 0) l.alive = false;
      }
    }
    // Keep the sky at its count: a new lantern every so often from below.
    let living = 0;
    for (const l of lanterns) if (l.alive && !l.released) living += 1;
    const want = Math.round(clamp(c.count, 0, 60));
    spawnIn -= dt;
    if (living < want && spawnIn <= 0) {
      const s0 = 0.5 + rand() * 0.5;
      lanterns.push(newLantern(false, spawnX(), size.h + H * s0 * 0.7, s0));
      spawnIn = 16 / Math.max(1, want);
    }
    // Drop the finished ones without allocating in steady state.
    for (let i = lanterns.length - 1; i >= 0; i -= 1) {
      if (!lanterns[i]?.alive) lanterns.splice(i, 1);
    }
  };

  const moving = () => {
    const c = cfg;
    if (!c || c.paused) return false;
    if (c.motionSafe) return true;
    return lanterns.some((l) => l.fade < 1);
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    if (!cfg.paused) {
      if (cfg.motionSafe) step(dt);
      else {
        // Reduced motion: nothing climbs; a new lantern only fades in.
        for (const l of lanterns)
          if (l.fade < 1) l.fade = Math.min(1, l.fade + dt / 0.3);
      }
    }
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const refresh = () => {
    pal = palette(cfg?.warmth ?? 0.5);
    sprites.clear();
    paintHalo();
    paintSky();
  };

  const readColours = () => {
    const kids = carriers.children;
    const pick = (i: number, fallback: string) => {
      const el = kids[i];
      return el ? resolve(getComputedStyle(el).color, fallback) : fallback;
    };
    colours.top = pick(0, colours.top);
    colours.mid = pick(1, colours.mid);
    colours.low = pick(2, colours.low);
    paintSky();
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const first = size.w < 1;
    size.w = w;
    size.h = h;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    refresh();
    if (first || !lanterns.length) seedSky();
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
        resize();
        return;
      }
      if (
        was.warmth !== next.warmth ||
        was.size !== next.size ||
        was.wishes !== next.wishes
      )
        refresh();
      if (was.colorKey !== next.colorKey) readColours();
      if (was.seed !== next.seed || was.stars !== next.stars) {
        paintSky();
        if (was.seed !== next.seed) seedSky();
      }
      if (was.dpr !== next.dpr) resize();
      if (was.motionSafe !== next.motionSafe && !next.motionSafe) {
        // Reduced motion: the sky settles to a still frame where it is.
        for (const l of lanterns) l.fade = 1;
      }
      draw();
      kick();
    },
    release(x, y) {
      const c = cfg;
      if (!c) return -1;
      const s0 = clamp(0.75 + 0.25 * (y / Math.max(1, size.h)), 0.7, 1);
      const l = newLantern(true, x, y, s0);
      if (!c.motionSafe) {
        l.age = 0.6;
        l.glow = 1;
      }
      place(l);
      lanterns.push(l);
      draw();
      kick();
      return l.wish;
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
    setVisible(on) {
      visible = on;
      if (on) kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      sprites.clear();
      root.removeAttribute("data-live");
    },
  };
}

/** A seeded still for the server and the first paint: soft lights at fixed places. */
function stillLanterns(seed: number, count: number) {
  const r = lcg(seed * 13 + 5);
  const n = Math.min(12, Math.max(0, Math.round(count * 0.6)));
  return Array.from({ length: n }, () => {
    const depth = r();
    return {
      x: Math.round(8 + r() * 84),
      y: Math.round(18 + depth * 70),
      d: Math.round(4 + depth * 22),
    };
  });
}

const INTERACTIVE =
  "a,button,input,select,textarea,summary,[role=button],[role=link],[tabindex]:not([tabindex='-1'])";

/**
 * A night sky with paper lanterns rising through it, your content above.
 * Each lantern is lit from inside — a warm glow through the paper, a bright
 * flame in its opening, a halo added to the sky — and climbs from below the
 * frame, swaying on its own breeze, leaning into the sway, receding as it
 * rises until it is only a pinpoint of light. Click the sky to release one
 * from that spot: the flame catches, the paper fills out on the snap spring,
 * and it dips and lifts off. Wishes, when given, are written on the paper,
 * legible while a lantern is near.
 *
 * One Canvas 2D layer of pre-rendered sprites; nothing runs off screen or in
 * a hidden tab. The sky is focusable and Enter releases a lantern; clicks on
 * your own links and buttons never do. Under reduced motion the lanterns hang
 * still, and a released one fades in where you asked for it.
 */
export function LanternRise({
  children,
  wishes,
  count = 18,
  drift = 0.45,
  warmth = 0.5,
  speed = 1,
  size = 64,
  stars = 0.5,
  skyColor = "color-mix(in oklab, var(--accent-bright) 22%, black)",
  interactive = true,
  onRelease,
  paused = false,
  seed = 3,
  label = "Lantern sky",
  dpr = 2,
  className,
}: LanternRiseProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const releases = React.useRef(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const list = React.useMemo(() => wishes ?? [], [wishes]);

  const config: Config = {
    count,
    drift,
    warmth,
    speed,
    size,
    stars,
    paused,
    motionSafe,
    seed,
    dpr,
    wishes: list,
    colorKey: `${skyColor}|${warmth}`,
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
    const e = createEngine(root, canvas, carriers);
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
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

  const release = (x: number, y: number) => {
    const wish = engine.current?.release(x, y) ?? -1;
    const text = wish >= 0 ? (list[wish] ?? null) : null;
    releases.current += 1;
    setSaid((s) => ({
      n: s.n + 1,
      text: text ? `Released a lantern: ${text}` : "Released a lantern.",
    }));
    onRelease?.(text);
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const target = event.target as Element | null;
    const hit = target?.closest(INTERACTIVE);
    // Your own controls keep their clicks; only the sky releases.
    if (hit && hit !== event.currentTarget && event.currentTarget.contains(hit))
      return;
    if (event.detail === 0) return;
    const r = event.currentTarget.getBoundingClientRect();
    release(event.clientX - r.left, event.clientY - r.top);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const el = rootRef.current;
    if (!el) return;
    // From the foot of the sky, a little further along each time.
    const r = lcg(seed * 31 + releases.current);
    release(
      el.clientWidth * (0.18 + 0.64 * r()),
      el.clientHeight * (0.78 + 0.1 * r()),
    );
  };

  const still = React.useMemo(() => stillLanterns(seed, count), [seed, count]);
  const p = palette(warmth);

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="lantern sky"
      aria-label={label}
      aria-describedby={interactive ? `${uid}-hint` : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={cn(
        "group/lantern-rise relative isolate h-56 w-full overflow-clip rounded-3",
        interactive ? "cursor-pointer" : "cursor-default",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      {interactive ? (
        <span id={`${uid}-hint`} className="sr-only">
          Press Enter to release a lantern, or click anywhere on the sky.
        </span>
      ) : null}
      {/* The still: the server's frame and the first paint. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-live/lantern-rise:opacity-0"
        style={{
          background: `linear-gradient(to bottom, color-mix(in oklab, ${skyColor} 55%, black), ${skyColor} 62%, color-mix(in oklab, ${skyColor} 72%, ${p.cssPaper}))`,
        }}
      >
        {still.map((l, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: l.d * 3,
              height: l.d * 3,
              margin: -(l.d * 3) / 2,
              background: `radial-gradient(closest-side, ${p.cssCore} 0%, ${p.cssPaper} ${l.d > 12 ? 22 : 10}%, ${p.cssHalo} 34%, transparent 100%)`,
            }}
          />
        ))}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/lantern-rise:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[
          `color-mix(in oklab, ${skyColor} 55%, black)`,
          skyColor,
          `color-mix(in oklab, ${skyColor} 72%, ${p.cssPaper})`,
        ].map((c, i) => (
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
