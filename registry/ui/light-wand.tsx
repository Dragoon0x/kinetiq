"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type LightWandPalette = "spectrum" | "ember" | "ice" | "sodium";

export type LightWandProps = {
  /** The content standing in the room: a headline, a call to action. It stays fully interactive. */
  children?: React.ReactNode;
  /** How long the shutter stays open once the wand starts moving, seconds (0.5 to 30). @default 4 */
  exposure?: number;
  /** The colours the wand walks through along its stroke. @default "spectrum" */
  palette?: LightWandPalette;
  /** Two to eight CSS colours that replace `palette`. */
  colors?: string[];
  /** The tube's thickness at rest, px. @default 6 */
  thickness?: number;
  /** How much stroke one walk through the palette takes, px. @default 420 */
  colorLength?: number;
  /** How much speed thins the tube and burns its core whiter, 0 to 1. @default 0.6 */
  speedThinning?: number;
  /** How wide the glow round the tube spreads, 0 to 1. @default 0.6 */
  glow?: number;
  /** How long the light takes to fade from oldest to newest once the shutter closes, ms. @default 1200 */
  fadeTime?: number;
  /** A wand held still burns a brighter spot, as it would on film. @default true */
  dwell?: boolean;
  /** Show the shutter's readout in the corner. @default true */
  shutter?: boolean;
  /** When first seen, an unseen hand paints one stroke, so the room never opens empty. @default true */
  autoPaint?: boolean;
  /** The pointer and the keys paint. @default true */
  interactive?: boolean;
  /** Nothing paints and the keyboard's way in is off. @default false */
  disabled?: boolean;
  /** Hold the exposure where it is. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The room's accessible name, for the keyboard's way in. @default "Light painting" */
  label?: string;
  /** The shutter opened. */
  onExposureStart?: () => void;
  /** The shutter closed, with how much light was painted, px of stroke. */
  onExposureEnd?: (length: number) => void;
  /** Sizes the room. @default "h-56 w-full" */
  className?: string;
};

const turn = (deg: number) => (deg ? `calc(h + ${deg})` : "h");

/** Light, not pigment: bright, saturated, resolved in the room's own dark scope. */
const PALETTES: Record<LightWandPalette, string[]> = {
  spectrum: [0, 60, 120, 180, 240, 300].map(
    (d) => `oklch(from var(--accent-bright) 0.8 0.16 ${turn(d)})`,
  ),
  ember: [
    "oklch(from var(--warn) 0.84 0.15 h)",
    "oklch(from var(--danger) 0.72 0.2 calc(h + 18))",
    "oklch(from var(--danger) 0.66 0.21 calc(h - 22))",
    "oklch(from var(--warn) 0.78 0.16 calc(h - 25))",
  ],
  ice: [
    "oklch(from var(--accent-bright) 0.88 0.1 calc(h - 55))",
    "oklch(from var(--accent-bright) 0.74 0.17 h)",
    "oklch(from var(--accent-bright) 0.72 0.17 calc(h + 45))",
  ],
  sodium: [
    "oklch(from var(--warn) 0.84 0.15 calc(h - 12))",
    "oklch(from var(--warn) 0.8 0.16 calc(h - 22))",
  ],
};

const BUCKETS = 48;
const CAPACITY = 8000;
/** The shutter's blink as it closes, s. */
const BLINK = 0.07;
/** Reduced motion's crossfade out, s. */
const FADE_OUT = 0.4;
/** After the room goes dark the shutter can open again this soon, s. */
const RECOCK = 0.25;
const KEY_STEP = 20;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The unseen hand's stroke: a coiled swoosh across the room, in fractions of the box. */
function flourish(s: number): [number, number] {
  const loops = 4.5;
  const x = 0.1 + 0.8 * s - 0.045 * Math.sin(Math.PI * 2 * loops * s);
  const y =
    0.5 -
    0.16 * Math.cos(Math.PI * 2 * loops * s) * (0.75 + 0.25 * s) +
    0.08 * Math.sin(Math.PI * 2 * s);
  return [x, y];
}

/** Any CSS colour the canvas understands, as 0–255 sRGB. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [255, 255, 255];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

type Config = {
  colorKey: string;
  replay: boolean;
  exposure: number;
  thickness: number;
  colorLength: number;
  speedThinning: number;
  glow: number;
  fadeTime: number;
  dwell: boolean;
  interactive: boolean;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
};

type Phase = "dark" | "open" | "closing";

type Report = {
  open: () => void;
  close: (length: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  wand: (x: number, y: number, at: number) => void;
  away: () => void;
  keyMove: (dx: number, dy: number) => void;
  keyFocus: (on: boolean) => void;
  closeNow: () => void;
  autoPaint: () => void;
  dispose: () => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  tip: HTMLElement,
  readout: { text: HTMLElement | null; bar: HTMLElement | null },
  visible: { current: boolean },
  report: { current: Report },
): Engine {
  const ctx = canvas.getContext("2d");
  const read = rgbReader();
  let cfg: Config | null = null;
  const size = { w: 0, h: 0, dpr: 1 };
  let frame = 0;
  let last = 0;
  let t = 0;
  let disposed = false;
  let started = false;
  let phase: Phase = "dark";
  let openedAt = 0;
  let closedAt = 0;
  // Wall-clock, not the loop's clock: the loop sleeps once the room is dark.
  let darkAt = -1e6;
  const recocked = () => performance.now() - darkAt >= RECOCK * 1000;
  let lastStampAt = 0;

  // Stamps: where, how big, which colour, when, how bright.
  const sx = new Float32Array(CAPACITY);
  const sy = new Float32Array(CAPACITY);
  const sr = new Float32Array(CAPACITY);
  const sc = new Uint8Array(CAPACITY);
  const st = new Float32Array(CAPACITY);
  const sa = new Float32Array(CAPACITY);
  let count = 0;
  let drawn = 0;
  let pathLen = 0;

  const colours: [number, number, number][] = [];
  let sprites: HTMLCanvasElement[] = [];
  let spriteR = 1;

  // The wand: where it is, where it has been, how fast.
  const wandAt = { x: 0, y: 0, present: false, speed: 0, lastAt: 0 };
  const key = {
    on: false,
    tx: 0,
    ty: 0,
    vx: 0,
    vy: 0,
  };
  let auto: { s: number } | null = null;
  let replay = false;

  const bucketOf = (len: number) => {
    const k = (len / Math.max(40, cfg?.colorLength ?? 420)) % 1;
    return clamp(Math.floor(k * BUCKETS), 0, BUCKETS - 1);
  };

  const buildSprites = () => {
    const c = cfg;
    if (!c || colours.length === 0) return;
    const d = size.dpr;
    const glow = clamp(c.glow, 0, 1);
    const halo = 1.6 + 2.4 * glow;
    spriteR = Math.max(
      4,
      Math.ceil(clamp(c.thickness, 1, 40) * 0.5 * halo * d * 1.6),
    );
    const core = 1 / halo;
    const next: HTMLCanvasElement[] = [];
    for (let b = 0; b < BUCKETS; b += 1) {
      // Walk the palette round its cycle, interpolating neighbouring stops.
      const f = (b / BUCKETS) * colours.length;
      const i = Math.floor(f);
      const k = f - i;
      const a = colours[i % colours.length] ?? [255, 255, 255];
      const z = colours[(i + 1) % colours.length] ?? a;
      const rgb = [0, 1, 2].map((j) =>
        Math.round((a[j] ?? 0) + ((z[j] ?? 0) - (a[j] ?? 0)) * k),
      );
      const [r = 0, g = 0, bl = 0] = rgb;
      const hot = (v: number) => Math.round(v + (255 - v) * 0.78);
      const sp = sprites[b] ?? document.createElement("canvas");
      sp.width = spriteR * 2;
      sp.height = spriteR * 2;
      const x = sp.getContext("2d");
      if (!x) continue;
      x.clearRect(0, 0, sp.width, sp.height);
      const gr = x.createRadialGradient(
        spriteR,
        spriteR,
        0,
        spriteR,
        spriteR,
        spriteR,
      );
      gr.addColorStop(0, `rgba(${hot(r)}, ${hot(g)}, ${hot(bl)}, 1)`);
      gr.addColorStop(
        core * 0.45,
        `rgba(${hot(r)}, ${hot(g)}, ${hot(bl)}, 0.9)`,
      );
      gr.addColorStop(core, `rgba(${r}, ${g}, ${bl}, 0.55)`);
      gr.addColorStop(
        core + (1 - core) * 0.35,
        `rgba(${r}, ${g}, ${bl}, 0.14)`,
      );
      gr.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
      x.fillStyle = gr;
      x.fillRect(0, 0, sp.width, sp.height);
      next.push(sp);
    }
    sprites = next;
  };

  const readColours = () => {
    colours.length = 0;
    const kids = carriers.children;
    for (let i = 0; i < kids.length; i += 1) {
      const el = kids[i];
      if (el) colours.push(read(getComputedStyle(el).color));
    }
    buildSprites();
  };

  const stampAt = (
    x: number,
    y: number,
    radius: number,
    alpha: number,
    len: number,
  ) => {
    if (count >= CAPACITY) return false;
    sx[count] = x;
    sy[count] = y;
    sr[count] = radius;
    sc[count] = bucketOf(len);
    st[count] = t;
    sa[count] = alpha;
    count += 1;
    return true;
  };

  const open = () => {
    if (phase !== "dark" || !recocked()) return false;
    phase = "open";
    openedAt = t;
    count = 0;
    drawn = 0;
    pathLen = 0;
    lastStampAt = t;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.style.opacity = "1";
    canvas.style.transition = "none";
    report.current.open();
    return true;
  };

  const close = () => {
    if (phase !== "open") return;
    phase = "closing";
    closedAt = t;
    auto = null;
    report.current.close(Math.round(pathLen));
    if (!cfg?.motionSafe) {
      // Reduced motion: no blink and no wipe; the picture crossfades out.
      canvas.style.transition = `opacity ${Math.round(FADE_OUT * 1000)}ms ease-out`;
      canvas.style.opacity = "0";
    }
  };

  /** Stamps the tube along a segment: spacing a third of its radius, so a fast stroke never dots. */
  const segment = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    speed: number,
  ) => {
    const c = cfg;
    if (!c || phase !== "open") return;
    const thin = 1 / (1 + (speed * clamp(c.speedThinning, 0, 1)) / 900);
    const radius = Math.max(0.6, (clamp(c.thickness, 1, 40) / 2) * thin);
    const burn = 1 + 0.6 * (1 - thin) * clamp(c.speedThinning, 0, 1);
    const spacing = Math.max(0.6, radius * 0.33);
    const dist = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    // Each stamp carries a share of light in proportion to its spacing, so
    // the tube's brightness does not depend on how densely it was sampled.
    const alpha = clamp((0.22 * spacing) / radius, 0.01, 1) * burn;
    for (let i = 1; i <= steps; i += 1) {
      const k = i / steps;
      pathLen += dist / steps;
      if (
        !stampAt(ax + (bx - ax) * k, ay + (by - ay) * k, radius, alpha, pathLen)
      ) {
        close();
        return;
      }
    }
    lastStampAt = t;
  };

  const moveWand = (x: number, y: number, speed: number) => {
    const c = cfg;
    if (!c) return;
    const was = { x: wandAt.x, y: wandAt.y, present: wandAt.present };
    wandAt.x = x;
    wandAt.y = y;
    wandAt.present = true;
    wandAt.speed = wandAt.speed * 0.6 + speed * 0.4;
    placeTip();
    if (phase === "dark") {
      if (!open()) return;
      if (!was.present) return;
    }
    if (phase === "open" && was.present)
      segment(was.x, was.y, x, y, wandAt.speed);
  };

  const placeTip = () => {
    const b = sprites.length ? bucketOf(pathLen) : 0;
    const rgb = (() => {
      const f = (b / BUCKETS) * Math.max(1, colours.length);
      const a = colours[Math.floor(f) % Math.max(1, colours.length)] ?? [
        255, 255, 255,
      ];
      return a;
    })();
    tip.style.transform = `translate(${r3(wandAt.x)}px, ${r3(wandAt.y)}px)`;
    tip.style.color = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    tip.style.opacity = wandAt.present ? "1" : "0";
  };

  const fadeOf = (i: number) => {
    // The wipe: the shutter's timeline runs oldest to newest across the fade.
    const c = cfg;
    if (!c || phase !== "closing") return 1;
    const span = Math.max(1e-3, (st[count - 1] ?? 0) - openedAt);
    const u = ((st[i] ?? 0) - openedAt) / span;
    const soft = 0.22;
    const front =
      ((t - closedAt - BLINK) / Math.max(0.1, c.fadeTime / 1000)) * (1 + soft);
    return clamp((u - (front - soft)) / soft, 0, 1);
  };

  const drawStamp = (
    c2: CanvasRenderingContext2D,
    i: number,
    alpha: number,
  ) => {
    const sp = sprites[sc[i] ?? 0];
    if (!sp) return;
    const d = size.dpr;
    const glow = clamp(cfg?.glow ?? 0.6, 0, 1);
    const halo = (sr[i] ?? 1) * (1.6 + 2.4 * glow) * d;
    c2.globalAlpha = clamp((sa[i] ?? 0) * alpha, 0, 1);
    c2.drawImage(
      sp,
      (sx[i] ?? 0) * d - halo,
      (sy[i] ?? 0) * d - halo,
      halo * 2,
      halo * 2,
    );
  };

  const draw = () => {
    if (!ctx || size.w < 1) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "lighter";
    if (phase === "closing" && cfg?.motionSafe) {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < count; i += 1) {
        const f = fadeOf(i);
        if (f > 0.002) drawStamp(ctx, i, f);
      }
      drawn = count;
    } else {
      // An open shutter only adds light: draw what is new.
      for (let i = drawn; i < count; i += 1) drawStamp(ctx, i, 1);
      drawn = count;
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (!started) {
      started = true;
      root.setAttribute("data-live", "");
    }
  };

  const updateReadout = () => {
    const c = cfg;
    const text = readout.text;
    const bar = readout.bar;
    if (!c || !text || !bar) return;
    let label: string;
    let fill: number;
    if (phase === "open") {
      const left = Math.max(0, c.exposure - (t - openedAt));
      label = `${left.toFixed(1)} s`;
      fill = left / Math.max(0.1, c.exposure);
    } else if (phase === "closing") {
      label = "developing";
      fill = 0;
    } else {
      label = `${c.exposure.toFixed(1)} s`;
      fill = 1;
    }
    if (text.textContent !== label) text.textContent = label;
    bar.style.transform = `scaleX(${r3(fill)})`;
    root.setAttribute("data-shutter", phase);
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    t += dt;
    // The keyboard's wand glides to its target on the glide spring.
    if (key.on) {
      const sp = springs.glide;
      const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
      const h = dt / steps;
      let px = wandAt.x;
      let py = wandAt.y;
      for (let i = 0; i < steps; i += 1) {
        key.vx +=
          ((sp.stiffness * (key.tx - px) - sp.damping * key.vx) / sp.mass) * h;
        key.vy +=
          ((sp.stiffness * (key.ty - py) - sp.damping * key.vy) / sp.mass) * h;
        px += key.vx * h;
        py += key.vy * h;
      }
      if (!c.motionSafe) {
        px = key.tx;
        py = key.ty;
        key.vx = 0;
        key.vy = 0;
      }
      if (Math.hypot(px - wandAt.x, py - wandAt.y) > 0.05) {
        moveWand(px, py, Math.hypot(key.vx, key.vy));
      }
    }
    // The unseen hand.
    if (auto) {
      const dur = 1.9;
      auto.s = Math.min(1, auto.s + dt / dur);
      const [fx, fy] = flourish(auto.s);
      const x = fx * size.w;
      const y = fy * size.h;
      const speed = Math.hypot(x - wandAt.x, y - wandAt.y) / Math.max(dt, 1e-3);
      moveWand(x, y, wandAt.present ? speed : 0);
      if (auto.s >= 1) {
        auto = null;
        wandAt.present = false;
        placeTip();
      }
    }
    if (replay && phase === "dark" && !auto && recocked()) {
      replay = false;
      startAuto();
    }
    if (phase === "open") {
      // A still wand burns a spot: a dim stamp every 50 ms where it rests.
      if (c.dwell && wandAt.present && t - lastStampAt > 0.06) {
        const radius = (clamp(c.thickness, 1, 40) / 2) * 1.1;
        stampAt(wandAt.x, wandAt.y, radius, 0.05, pathLen);
        lastStampAt = t - 0.01;
      }
      if (t - openedAt >= c.exposure) close();
    }
    if (phase === "closing") {
      const total = c.motionSafe
        ? BLINK + c.fadeTime / 1000 + 0.05
        : FADE_OUT + 0.05;
      if (c.motionSafe) {
        // The blink: the whole picture dips once as the shutter closes.
        const b = (t - closedAt) / BLINK;
        canvas.style.opacity =
          b < 1 ? String(r3(1 - 0.65 * Math.sin(Math.PI * b))) : "1";
      }
      if (t - closedAt >= total) {
        phase = "dark";
        darkAt = performance.now();
        count = 0;
        drawn = 0;
        pathLen = 0;
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        canvas.style.transition = "none";
        canvas.style.opacity = "1";
      }
    }
  };

  const startAuto = () => {
    if (phase !== "dark" || auto || !cfg) return;
    wandAt.present = false;
    auto = { s: 0 };
    if (!cfg.motionSafe) {
      // Reduced motion: the stroke is simply there, then fades.
      open();
      let prev = flourish(0);
      for (let i = 1; i <= 160; i += 1) {
        const p = flourish(i / 160);
        segment(
          prev[0] * size.w,
          prev[1] * size.h,
          p[0] * size.w,
          p[1] * size.h,
          300,
        );
        prev = p;
      }
      auto = null;
    }
  };

  const busy = () =>
    phase !== "dark" ||
    auto !== null ||
    replay ||
    (key.on && Math.hypot(key.vx, key.vy) > 1);

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || c.paused) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt);
    draw();
    updateReadout();
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (cfg?.paused) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const d = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    const dprChanged = d !== size.dpr;
    size.w = w;
    size.h = h;
    size.dpr = d;
    const bw = Math.max(1, Math.round(w * d));
    const bh = Math.max(1, Math.round(h * d));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
      drawn = 0;
    }
    if (dprChanged) buildSprites();
    draw();
    updateReadout();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        readColours();
        resize();
        return;
      }
      const look =
        was.colorKey !== next.colorKey ||
        was.glow !== next.glow ||
        was.thickness !== next.thickness ||
        was.colorLength !== next.colorLength;
      if (was.colorKey !== next.colorKey) readColours();
      else if (was.glow !== next.glow || was.thickness !== next.thickness)
        buildSprites();
      // A new look is shown, not just stored: the unseen hand paints its
      // stroke again once the room is dark.
      if (look && next.replay && next.interactive) replay = true;
      if (was.dpr !== next.dpr) resize();
      if (!next.interactive && wandAt.present && !auto) {
        wandAt.present = false;
        placeTip();
      }
      updateReadout();
      kick();
    },
    resize,
    readColours() {
      readColours();
    },
    wake() {
      updateReadout();
      kick();
    },
    wand(x, y, at) {
      const c = cfg;
      if (!c?.interactive || c.paused) return;
      auto = null;
      key.on = false;
      const dtMs = Math.max(4, at - wandAt.lastAt);
      const speed = wandAt.present
        ? (Math.hypot(x - wandAt.x, y - wandAt.y) / dtMs) * 1000
        : 0;
      wandAt.lastAt = at;
      moveWand(x, y, Math.min(speed, 4000));
      kick();
    },
    away() {
      if (auto) return;
      wandAt.present = false;
      placeTip();
    },
    keyMove(dx, dy) {
      const c = cfg;
      if (!c?.interactive || c.paused) return;
      auto = null;
      if (!key.on || !wandAt.present) {
        key.on = true;
        if (!wandAt.present) {
          wandAt.x = size.w / 2;
          wandAt.y = size.h / 2;
          wandAt.present = true;
        }
        key.tx = wandAt.x;
        key.ty = wandAt.y;
        key.vx = 0;
        key.vy = 0;
        placeTip();
      }
      key.tx = clamp(key.tx + dx, 0, size.w);
      key.ty = clamp(key.ty + dy, 0, size.h);
      kick();
    },
    keyFocus(on) {
      if (on) {
        if (!wandAt.present) {
          wandAt.x = size.w / 2;
          wandAt.y = size.h / 2;
        }
        wandAt.present = true;
        key.on = true;
        key.tx = wandAt.x;
        key.ty = wandAt.y;
        placeTip();
      } else {
        key.on = false;
        if (!auto) {
          wandAt.present = false;
          placeTip();
        }
      }
    },
    closeNow() {
      close();
      kick();
    },
    autoPaint() {
      startAuto();
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

/** The server's still: a faint ghost of the unseen hand's stroke, as it was last exposed. */
function standIn(): string {
  const pts: string[] = [];
  for (let i = 0; i <= 140; i += 1) {
    const [x, y] = flourish(i / 140);
    pts.push(`${r3(x * 1000)} ${r3(y * 1000)}`);
  }
  return `M ${pts.join(" L ")}`;
}

/**
 * A dark room with your content standing in it, and the cursor a light wand:
 * moving it paints a glowing tube whose colour walks through the palette
 * along its length, a hot core in a coloured halo, built from additive
 * stamps so crossings over-expose toward white like film. The first
 * movement opens the shutter and a readout in the corner counts the
 * exposure down; every stroke holds while it is open, and a wand held still
 * burns a spot. When the exposure ends the shutter closes: the frame blinks
 * once, then the light fades from oldest to newest along the stroke's own
 * timeline, and the room is dark again. Fast strokes run thinner and hotter.
 *
 * The room is scoped to the dark tokens, so it is dark on either theme. The
 * keyboard's way in is a transparent button behind the content: arrow keys
 * move the wand on the glide spring and paint, Enter or Space closes the
 * shutter. Under reduced motion the light still answers the hand, and a
 * closing exposure crossfades out instead of wiping.
 */
export function LightWand({
  children,
  exposure = 4,
  palette = "spectrum",
  colors,
  thickness = 6,
  colorLength = 420,
  speedThinning = 0.6,
  glow = 0.6,
  fadeTime = 1200,
  dwell = true,
  shutter = true,
  autoPaint = true,
  interactive = true,
  disabled = false,
  paused = false,
  dpr = 2,
  label = "Light painting",
  onExposureStart,
  onExposureEnd,
  className,
}: LightWandProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const gradId = `lw${uid.replace(/[^a-zA-Z0-9]/g, "")}`;
  const live = interactive && !disabled;
  const lights = React.useMemo(() => {
    const custom = (colors ?? []).filter(Boolean).slice(0, 8);
    return custom.length >= 2
      ? custom
      : (PALETTES[palette] ?? PALETTES.spectrum);
  }, [colors, palette]);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const tipRef = React.useRef<HTMLSpanElement | null>(null);
  const textRef = React.useRef<HTMLSpanElement | null>(null);
  const barRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const painted = React.useRef(false);
  const wantsAuto = React.useRef(autoPaint && interactive && !disabled);
  const dragging = React.useRef(false);
  const visitor = React.useRef(false);
  const callbacks = React.useRef({ onExposureStart, onExposureEnd });
  const report = React.useRef<Report>({
    open: () => {
      if (visitor.current)
        setSaid((s) => ({ n: s.n + 1, text: "Shutter open." }));
      callbacks.current.onExposureStart?.();
    },
    close: (length) => {
      if (visitor.current)
        setSaid((s) => ({ n: s.n + 1, text: "Shutter closed." }));
      callbacks.current.onExposureEnd?.(length);
    },
  });

  const config: Config = {
    colorKey: lights.join("|"),
    replay: autoPaint,
    exposure: clamp(exposure, 0.5, 30),
    thickness,
    colorLength,
    speedThinning,
    glow,
    fadeTime: Math.max(200, fadeTime),
    dwell,
    interactive: live,
    paused,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    callbacks.current = { onExposureStart, onExposureEnd };
    wantsAuto.current = autoPaint && live;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    const tip = tipRef.current;
    if (!root || !canvas || !carriers || !tip) return;
    const e = createEngine(
      root,
      canvas,
      carriers,
      tip,
      { text: textRef.current, bar: barRef.current },
      visible,
      report,
    );
    engine.current = e;
    e.configure(latest.current);
    if (visible.current && wantsAuto.current && !painted.current) {
      painted.current = true;
      e.autoPaint();
    }
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
    const watcher = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (!visible.current) return;
        engine.current?.wake();
        if (wantsAuto.current && !painted.current && engine.current) {
          painted.current = true;
          engine.current.autoPaint();
        }
      },
      { threshold: 0.5 },
    );
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const paint = useDrag({
    threshold: 1,
    disabled: !live,
    onStart: ({ point, event }) => {
      dragging.current = true;
      visitor.current = true;
      const at = local(point.x, point.y);
      engine.current?.wand(at.x, at.y, event.timeStamp);
    },
    onMove: ({ point, event }) => {
      const at = local(point.x, point.y);
      engine.current?.wand(at.x, at.y, event.timeStamp);
    },
    onEnd: ({ event }) => {
      dragging.current = false;
      if (event.pointerType === "touch") engine.current?.away();
    },
    onCancel: () => {
      dragging.current = false;
      engine.current?.away();
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const by = event.shiftKey ? KEY_STEP * 3 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      visitor.current = true;
      engine.current?.keyMove(move[0], move[1]);
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      visitor.current = true;
      engine.current?.closeNow();
    }
  };

  const path = React.useMemo(() => standIn(), []);

  return (
    <div
      ref={bindRoot}
      {...(live ? paint : {})}
      onPointerMove={(event) => {
        if (live) paint.onPointerMove(event);
        if (!live || dragging.current || event.pointerType === "touch") return;
        visitor.current = true;
        const at = local(event.clientX, event.clientY);
        engine.current?.wand(at.x, at.y, event.timeStamp);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch" && !dragging.current) {
          engine.current?.away();
        }
      }}
      className={cn(
        "group/light-wand dark @container relative isolate h-56 w-full overflow-clip bg-background text-foreground select-none",
        live ? "cursor-crosshair touch-none" : "touch-auto",
        className,
      )}
    >
      {/* The room: a faint pool of light on the floor, darker at the edges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 105%, color-mix(in oklab, var(--bg-2) 90%, var(--accent-bright)) 0%, var(--bg-0) 62%, color-mix(in oklab, var(--bg-0) 70%, black) 100%)",
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 size-full opacity-40 group-data-live/light-wand:hidden"
      >
        <defs>
          <linearGradient id={`${gradId}-g`} x1="0" x2="1" y1="0" y2="0">
            {lights.map((c, i) => (
              <stop
                key={i}
                offset={`${r3((i / Math.max(1, lights.length - 1)) * 100)}%`}
                style={{ stopColor: c }}
              />
            ))}
          </linearGradient>
        </defs>
        <path
          d={path}
          fill="none"
          stroke={`url(#${gradId}-g)`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          opacity={0.45}
        />
        <path
          d={path}
          fill="none"
          stroke={`url(#${gradId}-g)`}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={tipRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-30 opacity-0 transition-opacity duration-150"
      >
        {/* The wand's own glow, the colour it is about to paint. */}
        <span className="absolute -top-2 -left-2 size-4 rounded-full bg-[radial-gradient(circle,var(--ink)_0%,currentColor_35%,transparent_70%)]" />
      </span>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {lights.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <button
        type="button"
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key === " ") event.preventDefault();
        }}
        onFocus={(event) => {
          if (live && event.currentTarget.matches(":focus-visible")) {
            engine.current?.keyFocus(true);
          }
        }}
        onBlur={() => engine.current?.keyFocus(false)}
        onClick={(event) => {
          if (event.detail === 0 && live) {
            visitor.current = true;
            engine.current?.closeNow();
          }
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="relative z-20 size-full">{children}</div>
      {shutter ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-3 right-3 z-30 hidden items-center gap-1.5 rounded-full border border-hairline bg-background/70 px-2 py-1 font-mono text-[10px] text-ink-2 tabular-nums backdrop-blur-sm @[240px]:flex"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-ink-3 group-data-[shutter=closing]/light-wand:bg-warn group-data-[shutter=open]/light-wand:bg-danger" />
          <span ref={textRef} className="min-w-[7em] text-right">
            {`${clamp(exposure, 0.5, 30).toFixed(1)} s`}
          </span>
          <span className="relative h-px w-8 overflow-hidden bg-hairline-strong">
            <span
              ref={barRef}
              className="absolute inset-0 origin-left bg-ink-2"
            />
          </span>
        </span>
      ) : null}
      {live ? (
        <p id={hintId} className="sr-only">
          Move the pointer to paint with light. Arrow keys move the wand and
          paint; Enter or Space closes the shutter.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
