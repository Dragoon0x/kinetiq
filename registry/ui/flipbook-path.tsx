"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type FlipbookPathSequence = "bounce" | "flap" | "bloom" | "orbit";

/**
 * Draws one page of your own sequence. The context is set so (0, 0) is the
 * top-left of a square drawing area `size` CSS px wide; `progress` runs 0 to
 * 1 across the cycle. Stroke and fill start as the ink colour.
 */
export type FlipbookPathRenderFrame = (
  ctx: CanvasRenderingContext2D,
  progress: number,
  size: number,
) => void;

export type FlipbookPathProps = {
  /** Pages in one cycle of the drawing (4 to 24). @default 12 */
  frames?: number;
  /** The built-in drawing the pages carry. @default "bounce" */
  sequence?: FlipbookPathSequence;
  /** Your own drawing for each page; replaces `sequence`. */
  renderFrame?: FlipbookPathRenderFrame;
  /** Travel between two laid pages, px (12 to 96). @default 30 */
  spacing?: number;
  /** Width of a page, px (24 to 96); pages are 4:5 landscape. @default 56 */
  frameSize?: number;
  /** Seconds a trail left alone takes to clear, oldest page first. @default 2.5 */
  fade?: number;
  /** Milliseconds a trail waits, left alone, before it starts to clear. @default 700 */
  hold?: number;
  /** How far the page under the pointer rises, as a scale (1 to 2). @default 1.5 */
  lift?: number;
  /** How far pages lean into the direction they were laid in, 0 to 1. @default 0.5 */
  tilt?: number;
  /** Most pages on the surface; past it the oldest fades. @default 36 */
  maxFrames?: number;
  /** Lay an S-curve of pages at rest, and again whenever the trail has cleared and the pointer has left. @default true */
  resting?: boolean;
  /** Page colour, any CSS colour. @default "var(--card)" */
  paper?: string;
  /** Drawing colour. @default "var(--foreground)" */
  ink?: string;
  /** The drawings' one fill colour, and the lifted page's edge. @default "var(--accent-bright)" */
  accent?: string;
  /** Freeze the pages where they are; nothing lays, lifts or fades. @default false */
  paused?: boolean;
  /** Seeds the pages' hand-laid jitter and the resting curve. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The surface ignores the pointer and the keys. @default false */
  disabled?: boolean;
  /** The surface's accessible name. @default "Flipbook path" */
  label?: string;
  /** Fires when the page under the pointer (or the keyboard's pen) changes, with its frame (1-based) and the cycle length. */
  onFrame?: (frame: number, of: number) => void;
  /** Fires when the number of pages on the surface changes; `resting` is true when the component laid them itself (the resting trail). */
  onTrail?: (count: number, resting: boolean) => void;
  /** Sizes and shapes the surface. @default "h-56 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const TAU = Math.PI * 2;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Ink = { paper: string; ink: string; accent: string; mono: string };

/** The built-in drawings, in a unit square; `lw` is one CSS px in that square. */
const SEQUENCES: Record<
  FlipbookPathSequence,
  (g: CanvasRenderingContext2D, t: number, lw: number, ink: Ink) => void
> = {
  bounce(g, t, lw, ink) {
    const ground = 0.88;
    const r = 0.13;
    const height = Math.abs(Math.sin(Math.PI * t));
    const contact = Math.max(0, 1 - height / 0.14);
    const speed = Math.abs(Math.cos(Math.PI * t));
    const stretch = (1 - contact) * speed * 0.2;
    const sy = (1 - 0.34 * contact) * (1 + stretch);
    const sx = (1 + 0.3 * contact) * (1 - stretch * 0.55);
    const cy = ground - r * sy - height * 0.58;
    g.globalAlpha = 0.16 + 0.22 * (1 - height);
    g.fillStyle = ink.ink;
    g.beginPath();
    g.ellipse(0.5, ground + 0.015, 0.17 * (1 - height * 0.5), 0.028, 0, 0, TAU);
    g.fill();
    g.globalAlpha = 0.4;
    g.strokeStyle = ink.ink;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(0.06, ground);
    g.lineTo(0.94, ground);
    g.stroke();
    g.globalAlpha = 1;
    g.fillStyle = ink.accent;
    g.beginPath();
    g.ellipse(0.5, cy, r * sx, r * sy, 0, 0, TAU);
    g.fill();
    g.lineWidth = lw * 1.2;
    g.stroke();
    // A highlight that squashes with the ball.
    g.globalAlpha = 0.5;
    g.fillStyle = ink.paper;
    g.beginPath();
    g.ellipse(
      0.46,
      cy - r * sy * 0.38,
      r * sx * 0.32,
      r * sy * 0.2,
      -0.5,
      0,
      TAU,
    );
    g.fill();
    g.globalAlpha = 1;
  },
  flap(g, t, lw, ink) {
    const w = Math.sin(TAU * t);
    const cx = 0.5;
    const cy = 0.5 - 0.05 * Math.sin(TAU * t + Math.PI * 0.85);
    g.globalAlpha = 0.3;
    g.strokeStyle = ink.ink;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(0.08, 0.86);
    g.lineTo(0.92, 0.86);
    g.stroke();
    g.globalAlpha = 1;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = lw * 2;
    for (const side of [-1, 1]) {
      const sx = cx + side * 0.03;
      const ex = cx + side * 0.19;
      const ey = cy - 0.13 * w - 0.02;
      const tx = cx + side * (0.38 - 0.05 * Math.abs(w));
      const ty = cy - 0.27 * w + 0.07 * (1 - Math.abs(w));
      g.beginPath();
      g.moveTo(sx, cy);
      g.quadraticCurveTo(ex, ey - 0.06 * (w > 0 ? 1 : -0.4), tx, ty);
      g.stroke();
    }
    g.fillStyle = ink.accent;
    g.beginPath();
    g.ellipse(cx, cy + 0.01, 0.075, 0.036, 0, 0, TAU);
    g.fill();
    g.lineWidth = lw;
    g.stroke();
    g.fillStyle = ink.ink;
    g.beginPath();
    g.arc(cx + 0.075, cy - 0.004, 0.026, 0, TAU);
    g.fill();
  },
  bloom(g, t, lw, ink) {
    const open = 0.5 - 0.5 * Math.cos(TAU * t);
    const cx = 0.5;
    const cy = 0.44;
    g.strokeStyle = ink.ink;
    g.lineWidth = lw * 1.4;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(cx, 0.94);
    g.quadraticCurveTo(cx - 0.04, 0.7, cx, cy + 0.04);
    g.stroke();
    g.fillStyle = ink.ink;
    g.globalAlpha = 0.75;
    g.beginPath();
    g.ellipse(cx - 0.08, 0.76, 0.07, 0.025, -0.5, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
    const length = 0.1 + 0.18 * open;
    const width = 0.045 + 0.05 * open;
    const turn = t * 0.5;
    for (let k = 0; k < 6; k += 1) {
      // A bud: petals clustered upward, fanning to a full ring as it opens.
      const rel = (k - 2.5) * (Math.PI / 3);
      const a = -Math.PI / 2 + rel * (0.16 + 0.84 * open) + turn * open;
      const px = cx + Math.cos(a) * length * 0.55;
      const py = cy + Math.sin(a) * length * 0.55;
      g.fillStyle = ink.accent;
      g.globalAlpha = 0.92;
      g.beginPath();
      g.ellipse(px, py, length * 0.55, width, a, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = lw;
      g.stroke();
    }
    g.fillStyle = ink.ink;
    g.beginPath();
    g.arc(cx, cy, 0.035 + 0.02 * open, 0, TAU);
    g.fill();
  },
  orbit(g, t, lw, ink) {
    const cx = 0.5;
    const cy = 0.5;
    const tiltA = -0.21;
    const phi = TAU * t;
    const ox = Math.cos(phi) * 0.38;
    const oy = Math.sin(phi) * 0.12;
    const mx = cx + ox * Math.cos(tiltA) - oy * Math.sin(tiltA);
    const my = cy + ox * Math.sin(tiltA) + oy * Math.cos(tiltA);
    const front = Math.sin(phi) > 0;
    const orbitHalf = (from: number) => {
      g.beginPath();
      g.ellipse(cx, cy, 0.38, 0.12, tiltA, from, from + Math.PI);
      g.stroke();
    };
    const moon = () => {
      g.fillStyle = ink.paper;
      g.beginPath();
      g.arc(mx, my, 0.05, 0, TAU);
      g.fill();
      g.lineWidth = lw * 1.1;
      g.strokeStyle = ink.ink;
      g.stroke();
    };
    g.strokeStyle = ink.ink;
    g.lineWidth = lw;
    g.globalAlpha = 0.3;
    orbitHalf(Math.PI);
    g.globalAlpha = 1;
    if (!front) moon();
    g.fillStyle = ink.accent;
    g.beginPath();
    g.arc(cx, cy, 0.17, 0, TAU);
    g.fill();
    // Night side: a crescent of ink on the side away from the moon's light.
    g.save();
    g.clip();
    g.globalAlpha = 0.28;
    g.fillStyle = ink.ink;
    g.beginPath();
    g.arc(cx + 0.09, cy + 0.05, 0.17, 0, TAU);
    g.fill();
    g.restore();
    g.globalAlpha = 1;
    g.lineWidth = lw * 1.2;
    g.strokeStyle = ink.ink;
    g.beginPath();
    g.arc(cx, cy, 0.17, 0, TAU);
    g.stroke();
    g.lineWidth = lw;
    g.globalAlpha = 0.45;
    orbitHalf(0);
    g.globalAlpha = 1;
    if (front) moon();
  },
};

type Page = {
  id: number;
  x: number;
  y: number;
  angle: number;
  frame: number;
  /** Landing: 0 (just dropped, high) to 1 (on the surface), on the snap spring. */
  land: number;
  landV: number;
  lift: number;
  liftV: number;
  liftTarget: number;
  alpha: number;
  /** Wall-clock second its fade starts, or Infinity. */
  fadeAt: number;
};

type Config = {
  frames: number;
  sequence: FlipbookPathSequence;
  renderFrame?: FlipbookPathRenderFrame;
  spacing: number;
  frameSize: number;
  fade: number;
  hold: number;
  lift: number;
  tilt: number;
  maxFrames: number;
  resting: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  disabled: boolean;
  motionSafe: boolean;
  colourKey: string;
};

type Hooks = {
  frame: (frame: number, of: number, source: Source) => void;
  trail: (count: number, resting: boolean) => void;
};

type Source = "pointer" | "key" | "pen";

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  move: (x: number, y: number, source: Source) => void;
  leave: (source: Source) => void;
  keyPen: (dx: number, dy: number) => void;
  hideKeyPen: () => void;
  clear: () => void;
  dispose: () => void;
};

const now = () => performance.now() / 1000;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLSpanElement,
  visible: React.RefObject<boolean>,
  hooks: React.RefObject<Hooks>,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let ink: Ink = {
    paper: "rgb(255 255 255)",
    ink: "rgb(30 30 30)",
    accent: "rgb(60 90 220)",
    mono: "monospace",
  };
  let W = 0;
  let H = 0;
  let dpr = 1;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let nextId = 1;
  let rand = lcg(3);
  let sprites: HTMLCanvasElement[] = [];
  let shadow: HTMLCanvasElement | null = null;
  let spriteKey = "";
  let pages: Page[] = [];
  let lastActivity = 0;
  let fading = false;
  /** The resting trail stays until the visitor has used the surface. */
  let used = false;
  let restTimer = 0;
  let holdTimer = 0;
  let restedFor = "";
  let playing = -1;
  let reported = -1;
  let count = -1;
  const pen = {
    x: 0,
    y: 0,
    inside: false,
    source: "pointer" as Source,
    travel: 0,
    heading: 0,
    laying: true,
    strokeFrom: 0,
    lastFrame: -1,
    keyShown: false,
  };
  /** The unseen hand's script: lay or sweep along a path. */
  const script = {
    on: false,
    phase: "lay" as "lay" | "rest" | "play",
    t: 0,
    path: [] as { x: number; y: number; s: number }[],
    length: 0,
  };

  const pageW = () => clamp(cfg?.frameSize ?? 56, 24, 96);
  const pageH = () => Math.round(pageW() * 0.8);
  const maxLift = () => clamp(cfg?.lift ?? 1.5, 1, 2);

  const readColours = () => {
    const kids = carriers.children;
    const read = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "";
    };
    const mono = kids[2] ? getComputedStyle(kids[2]).fontFamily : "monospace";
    ink = {
      paper: read(0) || ink.paper,
      ink: read(1) || ink.ink,
      accent: read(2) || ink.accent,
      mono: mono || "monospace",
    };
    spriteKey = "";
    draw();
  };

  /** Pages drawn once per size, ratio, colours and drawing: one drawImage each after that. */
  const ensureSprites = () => {
    const c = cfg;
    if (!c) return;
    const w = pageW();
    const h = pageH();
    const k = dpr * maxLift();
    const n = clamp(Math.round(c.frames), 4, 24);
    const key = `${n}|${c.sequence}|${w}|${k}|${ink.paper}|${ink.ink}|${ink.accent}`;
    if (key === spriteKey) return;
    spriteKey = key;
    const make = () => document.createElement("canvas");
    sprites = Array.from({ length: n }, (_, i) => sprites[i] ?? make());
    const r = Math.min(4, w * 0.08);
    for (let i = 0; i < n; i += 1) {
      const sprite = sprites[i];
      if (!sprite) continue;
      sprite.width = Math.ceil(w * k);
      sprite.height = Math.ceil(h * k);
      const g = sprite.getContext("2d");
      if (!g) continue;
      g.setTransform(k, 0, 0, k, 0, 0);
      g.clearRect(0, 0, w, h);
      g.fillStyle = ink.paper;
      g.beginPath();
      g.roundRect(0.5, 0.5, w - 1, h - 1, r);
      g.fill();
      // The binding: a darker strip down the left edge.
      g.save();
      g.clip();
      g.globalAlpha = 0.07;
      g.fillStyle = ink.ink;
      g.fillRect(0, 0, w * 0.1, h);
      g.globalAlpha = 0.18;
      g.fillRect(w * 0.1, 0, 0.75, h);
      g.restore();
      g.globalAlpha = 0.22;
      g.strokeStyle = ink.ink;
      g.lineWidth = 1;
      g.beginPath();
      g.roundRect(0.5, 0.5, w - 1, h - 1, r);
      g.stroke();
      g.globalAlpha = 1;
      // The drawing, in a square centred in the page's drawing area.
      const ax = w * 0.14;
      const ay = h * 0.06;
      const aw = w * 0.8;
      const ah = h * 0.76;
      const side = Math.min(aw, ah);
      g.save();
      g.translate(ax + (aw - side) / 2, ay + (ah - side) / 2);
      g.fillStyle = ink.ink;
      g.strokeStyle = ink.ink;
      const t = i / n;
      if (c.renderFrame) {
        c.renderFrame(g, t, side);
      } else {
        g.scale(side, side);
        const draw = SEQUENCES[c.sequence] ?? SEQUENCES.bounce;
        draw(g, t, 1 / side, ink);
      }
      g.restore();
      g.globalAlpha = 0.5;
      g.fillStyle = ink.ink;
      g.font = `${Math.max(5.5, Math.round(h * 0.14 * 10) / 10)}px ${ink.mono}`;
      g.textAlign = "right";
      g.textBaseline = "alphabetic";
      g.fillText(String(i + 1).padStart(2, "0"), w - w * 0.06, h - h * 0.06);
      g.globalAlpha = 1;
    }
    // One soft shadow for every page: a page-shaped blur, lifted by offset.
    shadow = shadow ?? make();
    const pad = 12;
    shadow.width = Math.ceil((w + pad * 2) * k);
    shadow.height = Math.ceil((h + pad * 2) * k);
    const sg = shadow.getContext("2d");
    if (sg) {
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.clearRect(0, 0, shadow.width, shadow.height);
      sg.setTransform(k, 0, 0, k, 0, 0);
      sg.shadowColor = "rgb(0 0 0 / 0.42)";
      sg.shadowBlur = 5 * k;
      sg.shadowOffsetX = 2000 * k;
      sg.fillStyle = "rgb(0 0 0)";
      sg.beginPath();
      sg.roundRect(pad - 2000, pad, w, h, r);
      sg.fill();
    }
  };

  /** Who is laying: the visitor, or the component's own unseen hand. */
  let layingBy: Source = "pointer";
  let batching = false;

  const reportTrail = () => {
    if (batching || pages.length === count) return;
    const grew = pages.length > count;
    count = pages.length;
    hooks.current.trail(count, grew && layingBy === "pen");
  };

  const measure = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    W = w;
    H = h;
    const nextDpr = Math.min(
      window.devicePixelRatio || 1,
      clamp(c?.dpr ?? 2, 0.5, 2),
    );
    if (nextDpr !== dpr) spriteKey = "";
    dpr = nextDpr;
    const cw = Math.round(W * dpr);
    const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    for (const p of pages) {
      p.x = clamp(p.x, 0, W);
      p.y = clamp(p.y, 0, H);
    }
  };

  /** Lays the next page at (x, y), leaning into `heading`. */
  const lay = (x: number, y: number, heading: number) => {
    const c = cfg;
    if (!c) return;
    const n = clamp(Math.round(c.frames), 4, 24);
    pen.lastFrame = (pen.lastFrame + 1) % n;
    // Lean into the direction of travel: a page laid moving right tips
    // clockwise as a hand would set it down, never more than 22°.
    let lean = Math.sin(heading) * 0.2 + Math.cos(heading) * 0.12;
    lean = clamp(lean * clamp(c.tilt, 0, 1) * 1.6, -0.38, 0.38);
    const jitter = (rand() - 0.5) * 0.08;
    const w = pageW();
    const h = pageH();
    pages.push({
      id: nextId,
      x: clamp(x, w * 0.5, W - w * 0.5),
      y: clamp(y, h * 0.5, H - h * 0.5),
      angle: lean + jitter,
      frame: pen.lastFrame,
      land: c.motionSafe ? 0 : 1,
      landV: 0,
      lift: 0,
      liftV: 0,
      liftTarget: 0,
      alpha: c.motionSafe ? 1 : 0,
      fadeAt: Infinity,
    });
    nextId += 1;
    // Past the cap, the oldest page starts to go at once.
    const over = pages.length - clamp(Math.round(c.maxFrames), 4, 120);
    for (let i = 0; i < over; i += 1) {
      const p = pages[i];
      if (p && p.fadeAt === Infinity) p.fadeAt = now();
    }
    reportTrail();
  };

  /** The page under (x, y), skipping the ones this stroke has just laid. */
  const hit = (x: number, y: number) => {
    const c = cfg;
    if (!c) return -1;
    const reach = Math.max(pageW() * 0.55, c.spacing * 0.6);
    const fresh = Math.ceil((pageW() * 1.1) / Math.max(8, c.spacing)) + 1;
    let best = -1;
    let bestD = reach;
    for (let i = 0; i < pages.length; i += 1) {
      const p = pages[i];
      if (!p || p.alpha < 0.35) continue;
      if (pen.laying && p.id > pen.strokeFrom && p.id >= nextId - fresh)
        continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  const setPlaying = (index: number, source: Source) => {
    const c = cfg;
    if (!c) return;
    playing = index;
    const target = index >= 0 ? pages[index] : undefined;
    for (let i = 0; i < pages.length; i += 1) {
      const p = pages[i];
      if (!p) continue;
      const gap = index >= 0 ? Math.abs(i - index) : 99;
      // Neighbours in the deck rise a little, if they lie next to it too
      // (a new stroke can start far from where the last one ended).
      const near =
        target !== undefined &&
        Math.hypot(p.x - target.x, p.y - target.y) <
          Math.max(c.spacing, pageW()) * 1.6;
      p.liftTarget =
        gap === 0 ? 1 : gap === 1 && c.motionSafe && near ? 0.25 : 0;
      if (!c.motionSafe) {
        p.lift = p.liftTarget;
        p.liftV = 0;
      }
    }
    const id = target ? target.id : -1;
    if (id !== reported) {
      reported = id;
      if (target) {
        hooks.current.frame(
          target.frame + 1,
          clamp(Math.round(c.frames), 4, 24),
          source,
        );
      }
    }
  };

  /** Any visitor movement: stop clearing, and bring half-faded pages back. */
  const touch = () => {
    lastActivity = now();
    used = true;
    window.clearTimeout(restTimer);
    restTimer = 0;
    if (fading) {
      fading = false;
      for (const p of pages) p.fadeAt = Infinity;
    }
  };

  const move = (x: number, y: number, source: Source) => {
    const c = cfg;
    if (!c || c.disabled || c.paused || W < 1) return;
    if (source !== "pen" && script.on) script.on = false;
    if (source !== "pen") touch();
    if (!pen.inside || pen.source !== source) {
      pen.inside = true;
      pen.source = source;
      pen.x = x;
      pen.y = y;
      pen.travel = 0;
      pen.laying = true;
      pen.strokeFrom = nextId - 1;
      const at = hit(x, y);
      if (at >= 0) {
        pen.laying = false;
        setPlaying(at, source);
      }
      kick();
      return;
    }
    const dx = x - pen.x;
    const dy = y - pen.y;
    const d = Math.hypot(dx, dy);
    pen.x = x;
    pen.y = y;
    const at = hit(x, y);
    if (at >= 0) {
      pen.laying = false;
      pen.travel = 0;
      setPlaying(at, source);
      kick();
      return;
    }
    if (playing >= 0) setPlaying(-1, source);
    const sweeping = source === "pen" && script.phase === "play";
    if (d < 0.01 || sweeping) {
      kick();
      return;
    }
    if (!pen.laying) {
      // Off the trail into open space: a new stroke starts here.
      pen.laying = true;
      pen.strokeFrom = nextId - 1;
      pen.travel = 0;
    }
    pen.heading = Math.atan2(dy, dx);
    pen.travel += d;
    layingBy = source;
    const step = clamp(c.spacing, 12, 96);
    while (pen.travel >= step) {
      pen.travel -= step;
      const back = pen.travel / d;
      lay(x - dx * back, y - dy * back, pen.heading);
    }
    kick();
  };

  const startScript = (phase: "lay" | "play") => {
    const c = cfg;
    if (!c || W < 1 || H < 1) return;
    const path = restingPath();
    script.path = path;
    script.length = path[path.length - 1]?.s ?? 0;
    script.phase = phase;
    script.t = 0;
    script.on = script.length > 0;
    // A fresh resting trail starts its numbering at the first page.
    if (phase === "lay") pen.lastFrame = -1;
    pen.inside = false;
    kick();
  };

  /** A seeded S across the surface, points every 4 px with arc length. */
  const restingPath = () => {
    const c = cfg;
    const out: { x: number; y: number; s: number }[] = [];
    if (!c) return out;
    const r = lcg(c.seed + 17);
    const x0 = Math.max(pageW() * 0.7, W * 0.1);
    const x1 = W - x0;
    const amp = Math.min(H * 0.2, 44) * (0.8 + r() * 0.3);
    const phase = r() * 0.6 - 0.3;
    let s = 0;
    let px = x0;
    let py = H / 2;
    const n = Math.max(8, Math.round((x1 - x0) / 4));
    for (let i = 0; i <= n; i += 1) {
      const u = i / n;
      const x = x0 + (x1 - x0) * u;
      const y = H / 2 + Math.sin(TAU * u + phase) * amp;
      if (i > 0) s += Math.hypot(x - px, y - py);
      out.push({ x, y, s });
      px = x;
      py = y;
    }
    return out;
  };

  const along = (path: typeof script.path, s: number) => {
    let lo = 0;
    let hi = path.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((path[mid]?.s ?? 0) < s) lo = mid;
      else hi = mid;
    }
    const a = path[lo];
    const b = path[hi];
    if (!a || !b) return { x: 0, y: 0 };
    const t = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };

  /** The resting trail, laid at once (first frame, reduced motion). */
  const layResting = () => {
    const c = cfg;
    if (!c || W < 1 || H < 1) return;
    const path = restingPath();
    const length = path[path.length - 1]?.s ?? 0;
    const step = clamp(c.spacing, 12, 96);
    const n = Math.min(
      Math.floor(length / step) + 1,
      clamp(Math.round(c.maxFrames), 4, 120) - 2,
    );
    pen.lastFrame = -1;
    rand = lcg(c.seed);
    layingBy = "pen";
    batching = true;
    for (let i = 0; i < n; i += 1) {
      const at = along(path, i * step);
      const ahead = along(path, Math.min(length, i * step + 4));
      lay(at.x, at.y, Math.atan2(ahead.y - at.y, ahead.x - at.x));
      const p = pages[pages.length - 1];
      if (p) {
        p.land = 1;
        p.alpha = 1;
      }
    }
    pen.strokeFrom = nextId - 1;
    batching = false;
    reportTrail();
  };

  const stepScript = (dt: number) => {
    const c = cfg;
    if (!c || !script.on) return;
    const n = Math.max(1, script.length / clamp(c.spacing, 12, 96));
    const layTime = clamp(n * 0.07, 0.6, 1.6);
    const playTime = clamp(n * 0.1, 0.9, 2.4);
    script.t += dt;
    if (script.phase === "lay") {
      const s = Math.min(1, script.t / layTime) * script.length;
      const at = along(script.path, s);
      move(at.x, at.y, "pen");
      if (script.t >= layTime) {
        script.phase = "rest";
        script.t = 0;
        pen.laying = false;
      }
    } else if (script.phase === "rest") {
      if (script.t >= 0.35) {
        script.phase = "play";
        script.t = 0;
        pen.laying = false;
      }
    } else {
      const u = Math.min(1, script.t / playTime);
      // Eased at both ends, as a hand starts and stops a sweep.
      const e = u * u * (3 - 2 * u);
      const at = along(script.path, (1 - e) * script.length);
      move(at.x, at.y, "pen");
      if (u >= 1) {
        script.on = false;
        pen.inside = false;
        setPlaying(-1, "pen");
        lastActivity = now();
      }
    }
  };

  // ---------------------------------------------------------------- drawing

  const drawPage = (g: CanvasRenderingContext2D, p: Page) => {
    const sprite = sprites[p.frame % Math.max(1, sprites.length)];
    if (!sprite || p.alpha <= 0) return;
    const w = pageW();
    const h = pageH();
    const lifted = 1 + (maxLift() - 1) * clamp(p.lift, 0, 1.2);
    const scale = lifted * (1 + (1 - clamp(p.land, 0, 1.3)) * 0.18);
    // A lifted page also straightens toward the reader.
    const angle = p.angle * (1 - clamp(p.lift, 0, 1) * 0.7);
    const cs = Math.cos(angle) * scale;
    const sn = Math.sin(angle) * scale;
    // Keep a lifted page inside the surface.
    const hw = (w * scale) / 2;
    const hh = (h * scale) / 2;
    const x = clamp(p.x, Math.min(hw, W / 2), Math.max(W - hw, W / 2));
    const y = clamp(p.y, Math.min(hh, H / 2), Math.max(H - hh, H / 2));
    const height = clamp(p.lift, 0, 1.2) * 4 + (1 - clamp(p.land, 0, 1)) * 6;
    if (shadow) {
      g.globalAlpha =
        clamp(p.alpha, 0, 1) * (0.22 + 0.26 * clamp(p.lift, 0, 1));
      g.setTransform(
        cs * dpr,
        sn * dpr,
        -sn * dpr,
        cs * dpr,
        (x + 0.6 + height * 0.4) * dpr,
        (y + 1 + height) * dpr,
      );
      g.drawImage(shadow, -w / 2 - 12, -h / 2 - 12, w + 24, h + 24);
    }
    g.globalAlpha = clamp(p.alpha, 0, 1);
    g.setTransform(cs * dpr, sn * dpr, -sn * dpr, cs * dpr, x * dpr, y * dpr);
    g.drawImage(sprite, -w / 2, -h / 2, w, h);
    if (p.lift > 0.02) {
      // The page being played: its edge turns accent.
      g.globalAlpha = clamp(p.alpha, 0, 1) * clamp(p.lift, 0, 1);
      g.strokeStyle = ink.accent;
      g.lineWidth = 1.5 / scale;
      g.beginPath();
      g.roundRect(
        -w / 2 + 0.5,
        -h / 2 + 0.5,
        w - 1,
        h - 1,
        Math.min(4, w * 0.08),
      );
      g.stroke();
    }
  };

  function draw() {
    if (!ctx || W < 1) return;
    ensureSprites();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Resting pages in laid order, then the lifted ones on top: neighbours
    // first, the page being played last.
    for (const p of pages) if (p.lift <= 0.02) drawPage(ctx, p);
    for (const p of pages) if (p.lift > 0.02 && p.lift <= 0.5) drawPage(ctx, p);
    for (const p of pages) if (p.lift > 0.5) drawPage(ctx, p);
    if (pen.keyShown && pen.inside && pen.source === "key") {
      // The keyboard's pen: a small ring with a dot, where the next page goes.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = ink.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pen.x, pen.y, 7, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = ink.accent;
      ctx.beginPath();
      ctx.arc(pen.x, pen.y, 1.75, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ------------------------------------------------------------------ loop

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return false;
    let busy = script.on;
    const t = now();
    // Clearing: left alone past `hold`, the oldest page goes first.
    if (
      used &&
      !fading &&
      !script.on &&
      !pen.inside &&
      pages.length > 0 &&
      t - lastActivity > clamp(c.hold, 0, 10000) / 1000
    ) {
      fading = true;
      const gap = clamp(c.fade, 0.2, 20) / Math.max(1, pages.length);
      for (let i = 0; i < pages.length; i += 1) {
        const p = pages[i];
        if (p) p.fadeAt = Math.min(p.fadeAt, t + i * gap);
      }
    }
    if (fading) busy = true;
    for (const p of pages) if (p.fadeAt !== Infinity) busy = true;
    const flick = springs.flick;
    const snap = springs.snap;
    for (let i = pages.length - 1; i >= 0; i -= 1) {
      const p = pages[i];
      if (!p) continue;
      if (c.motionSafe) {
        if (p.land < 1 || Math.abs(p.landV) > 0.01) {
          // Set down on the snap spring: one crisp overshoot.
          p.landV +=
            ((-snap.stiffness * (p.land - 1) - snap.damping * p.landV) /
              snap.mass) *
            dt;
          p.land += p.landV * dt;
          if (Math.abs(p.land - 1) < 0.002 && Math.abs(p.landV) < 0.02) {
            p.land = 1;
            p.landV = 0;
          } else busy = true;
        }
        if (
          Math.abs(p.lift - p.liftTarget) > 0.002 ||
          Math.abs(p.liftV) > 0.02
        ) {
          p.liftV +=
            ((-flick.stiffness * (p.lift - p.liftTarget) -
              flick.damping * p.liftV) /
              flick.mass) *
            dt;
          p.lift += p.liftV * dt;
          busy = true;
        } else {
          p.lift = p.liftTarget;
          p.liftV = 0;
        }
      } else if (p.fadeAt === Infinity && p.alpha < 1) {
        // Reduced motion: a page appears with a short fade instead of a landing.
        p.alpha = Math.min(1, p.alpha + dt / 0.12);
        busy = true;
      }
      if (p.fadeAt !== Infinity && t >= p.fadeAt) {
        p.alpha -= dt / 0.22;
        busy = true;
        if (p.alpha <= 0) {
          pages.splice(i, 1);
          if (playing >= 0) playing = -1;
        }
      } else if (p.fadeAt === Infinity && c.motionSafe && p.alpha < 1) {
        p.alpha = Math.min(1, p.alpha + dt / 0.15);
        busy = true;
      }
    }
    reportTrail();
    if (pages.length === 0 && fading) {
      fading = false;
      used = false;
      scheduleRest();
    }
    return busy;
  };

  /** Once the trail has cleared and the pointer is gone, lay the resting trail again. */
  const scheduleRest = () => {
    const c = cfg;
    window.clearTimeout(restTimer);
    restTimer = 0;
    if (!c || !c.resting || c.paused) return;
    restTimer = window.setTimeout(() => {
      restTimer = 0;
      const live = cfg;
      if (!live || pages.length > 0 || pen.inside) return;
      if (live.motionSafe) startScript("lay");
      else {
        layResting();
        draw();
      }
    }, 1200);
  };

  // A tick drives the pen, and the pen asks for frames: while a tick runs,
  // a request is only noted, or every tick would schedule two.
  let ticking = false;
  let wanted = false;

  const tick = (time: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.04, (time - last) / 1000) : 1 / 60;
    last = time;
    let busy = false;
    ticking = true;
    wanted = false;
    if (!c.paused) {
      stepScript(dt);
      busy = step(dt);
    }
    draw();
    ticking = false;
    if ((busy || wanted) && !c.paused) {
      frame = window.requestAnimationFrame(tick);
    } else {
      last = 0;
      holdWake();
    }
  };

  /** Asleep with a used trail on the surface: wake when `hold` runs out. */
  const holdWake = () => {
    const c = cfg;
    window.clearTimeout(holdTimer);
    holdTimer = 0;
    if (!c || !used || fading || pen.inside || pages.length === 0) return;
    const ms = Math.max(
      30,
      (lastActivity + clamp(c.hold, 0, 10000) / 1000 - now()) * 1000 + 20,
    );
    holdTimer = window.setTimeout(() => {
      holdTimer = 0;
      kick();
    }, ms);
  };

  function kick() {
    if (ticking) {
      wanted = true;
      return;
    }
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  }

  /** The first view: the resting trail is there; the unseen hand plays it once. */
  const arrive = () => {
    const c = cfg;
    if (!c || W < 1 || H < 1) return;
    const key = `${c.seed}|${c.spacing}|${c.frameSize}|${c.frames}|${c.resting}`;
    if (key === restedFor) return;
    restedFor = key;
    pages = [];
    nextId = 1;
    playing = -1;
    reported = -1;
    script.on = false;
    if (!c.resting) {
      reportTrail();
      return;
    }
    layResting();
    used = false;
    lastActivity = now();
    if (c.motionSafe) startScript("play");
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) return;
      if (!was || was.dpr !== next.dpr) measure();
      if (!was || was.colourKey !== next.colourKey) readColours();
      // A new drawing function redraws the pages (its identity is the key).
      if (was && was.renderFrame !== next.renderFrame) spriteKey = "";
      if (was && was.motionSafe !== next.motionSafe && !next.motionSafe) {
        script.on = false;
        for (const p of pages) {
          p.land = 1;
          p.landV = 0;
          p.lift = p.liftTarget;
          p.liftV = 0;
        }
      }
      if (visible.current) arrive();
      draw();
      kick();
    },
    resize() {
      measure();
      if (visible.current) arrive();
      draw();
      kick();
    },
    readColours,
    move,
    leave(source) {
      if (pen.source !== source) return;
      pen.inside = false;
      pen.keyShown = false;
      if (playing >= 0) setPlaying(-1, source);
      lastActivity = now();
      kick();
    },
    keyPen(dx, dy) {
      const c = cfg;
      if (!c || c.disabled || W < 1) return;
      const startX = pen.inside ? pen.x : W / 2;
      const startY = pen.inside ? pen.y : H / 2;
      if (!pen.inside || pen.source !== "key") {
        pen.keyShown = true;
        move(startX, startY, "key");
        return;
      }
      pen.keyShown = true;
      move(clamp(startX + dx, 4, W - 4), clamp(startY + dy, 4, H - 4), "key");
    },
    hideKeyPen() {
      if (pen.source === "key") {
        pen.inside = false;
        pen.keyShown = false;
        if (playing >= 0) setPlaying(-1, "key");
        lastActivity = now();
        draw();
        kick();
      }
    },
    clear() {
      touch();
      const t = now();
      script.on = false;
      for (let i = 0; i < pages.length; i += 1) {
        const p = pages[i];
        if (p) p.fadeAt = t + i * 0.02;
      }
      fading = true;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(restTimer);
      restTimer = 0;
      window.clearTimeout(holdTimer);
      holdTimer = 0;
      for (const s of sprites) {
        s.width = 0;
        s.height = 0;
      }
      sprites = [];
      if (shadow) {
        shadow.width = 0;
        shadow.height = 0;
      }
      pages = [];
    },
  };
}

/**
 * A surface that turns the pointer's path into a flipbook. Moving over open
 * space lays the next page of a drawn sequence every `spacing` px — a paper
 * card with a binding edge and its frame number — set down on the snap
 * spring and leaning into the direction it was laid in, so the path becomes
 * a fanned deck. Sweep back over the trail and the page under the pointer
 * lifts on the flick spring, its neighbours a little, so the drawing plays
 * in order under the pointer at the speed of the sweep, either way. Leave it
 * alone and the trail clears from its oldest page.
 *
 * Pages are drawn once into sprites (one `drawImage` each after that) and the
 * loop runs only while something lands, lifts or fades. The surface is one
 * tab stop: the arrow keys move a pen that lays and plays exactly as the
 * pointer does, and Backspace clears. Under reduced motion pages appear with
 * a short fade and the played page is raised at once.
 */
export function FlipbookPath({
  frames = 12,
  sequence = "bounce",
  renderFrame,
  spacing = 30,
  frameSize = 56,
  fade = 2.5,
  hold = 700,
  lift = 1.5,
  tilt = 0.5,
  maxFrames = 36,
  resting = true,
  paper = "var(--card)",
  ink = "var(--foreground)",
  accent = "var(--accent-bright)",
  paused = false,
  seed = 3,
  dpr = 2,
  disabled = false,
  label = "Flipbook path",
  onFrame,
  onTrail,
  className,
}: FlipbookPathProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const latestProps = React.useRef({ onFrame, onTrail });
  const hooks = React.useRef<Hooks>({
    frame: (f, of, source) => {
      // The unseen hand's sweep is the component showing itself, not news.
      if (source === "pen") return;
      latestProps.current.onFrame?.(f, of);
      if (source === "key") {
        setSaid((s) => ({ n: s.n + 1, text: `Frame ${f} of ${of}.` }));
      }
    },
    trail: (n, resting) => latestProps.current.onTrail?.(n, resting),
  });
  const colourKey = `${paper}|${ink}|${accent}`;

  const config: Config = {
    frames,
    sequence,
    renderFrame,
    spacing,
    frameSize,
    fade,
    hold,
    lift,
    tilt,
    maxFrames,
    resting,
    paused,
    seed,
    dpr,
    disabled,
    motionSafe,
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    latestProps.current = { onFrame, onTrail };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, hooks);
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

  // Touch: a drag lays and plays (the surface is touch-none). The shared
  // gesture captures only after a few px, so a tap is still a tap.
  const drag = useDrag({
    threshold: 2,
    disabled,
    onStart: ({ point }) => {
      const at = local(point.x, point.y);
      engine.current?.move(at.x, at.y, "pointer");
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      engine.current?.move(at.x, at.y, "pointer");
    },
    onEnd: () => engine.current?.leave("pointer"),
    onCancel: () => engine.current?.leave("pointer"),
  });

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "touch") {
      drag.onPointerMove(event);
      return;
    }
    const at = local(event.clientX, event.clientY);
    engine.current?.move(at.x, at.y, "pointer");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = Math.max(12, spacing) * (event.shiftKey ? 3 : 1);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[event.key];
    if (m) {
      event.preventDefault();
      engine.current?.keyPen(m[0], m[1]);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      engine.current?.clear();
      setSaid((s) => ({ n: s.n + 1, text: "Trail cleared." }));
    }
  };

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="flipbook"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? undefined : 0}
      onKeyDown={onKeyDown}
      onBlur={() => engine.current?.hideKeyPen()}
      onPointerDown={(event) => {
        if (!disabled && event.pointerType === "touch")
          drag.onPointerDown(event);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.leave("pointer");
      }}
      className={cn(
        "group/flipbook-path relative isolate h-56 w-full overflow-clip outline-none select-none",
        disabled ? "touch-auto" : "touch-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
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
        <span
          className="transition-colors duration-1"
          style={{ color: paper }}
        />
        <span className="transition-colors duration-1" style={{ color: ink }} />
        <span
          className="font-mono transition-colors duration-1"
          style={{ color: accent }}
        />
      </span>
      <span id={hintId} className="sr-only">
        Move over open space to lay pages; move back over the trail to play them
        in order. The arrow keys move a pen that does the same, Shift for longer
        steps; Backspace clears the trail.
      </span>
      <span aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
