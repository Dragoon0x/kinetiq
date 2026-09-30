"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  semitones,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ScratchCardFoil = "silver" | "gold";

export type ScratchCardProps = {
  /** The reward under the foil. It is unreachable until revealed. */
  children: React.ReactNode;
  /** What is under the foil, e.g. "Weekly reward". */
  label: string;
  /** Controlled: whether the foil is gone. */
  revealed?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultRevealed?: boolean;
  /** Fires from the scratch or key that cleared enough foil, with true. */
  onRevealedChange?: (revealed: boolean) => void;
  /** The share of foil cleared, 0 to 1, each time it moves by a whole percent. */
  onProgress?: (cleared: number) => void;
  /** Brush radius in px, 10 to 34. @default 18 */
  brush?: number;
  /** Percent cleared at which the rest dissolves by itself, 40 to 80. @default 60 */
  autoReveal?: number;
  /** Flakes of foil tumble off as it is scraped. @default true */
  flakes?: boolean;
  /** @default "silver" */
  foil?: ScratchCardFoil;
  /** Play the scrape and the reveal. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Pt = { x: number; y: number };

type Colors = { base: string; light: string; dark: string; ink: string };

type Flake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  flip: number;
  flipRate: number;
  size: number;
  life: number;
};

type Grid = {
  cols: number;
  rows: number;
  cells: Uint8Array;
  cleared: number;
};

/** Coverage is counted on a grid this fine, in px: exact enough, and cheap. */
const CELL = 6;
const MOST_FLAKES = 220;
const GRAVITY = 1100;

// The foil's colours live on the canvas element itself, as its text and
// border colours (the border is zero wide), so the canvas can read them back
// resolved from whatever theme the card sits in. Silver is the neutral ink
// pushed toward white and black; gold is the warning hue. Mixes toward white
// or black are in oklab, which keeps their hue.
const FOILS: Record<ScratchCardFoil, React.CSSProperties> = {
  silver: {
    color: "color-mix(in oklab, var(--ink-3) 40%, white)",
    borderTopColor: "color-mix(in oklab, var(--ink-3) 12%, white)",
    borderBottomColor: "color-mix(in oklab, var(--ink-3) 82%, black)",
    borderLeftColor: "color-mix(in oklab, var(--ink-3) 70%, black)",
  },
  gold: {
    color: "color-mix(in oklab, var(--warn) 74%, white)",
    borderTopColor: "color-mix(in oklab, var(--warn) 30%, white)",
    borderBottomColor: "color-mix(in oklab, var(--warn) 58%, black)",
    borderLeftColor: "color-mix(in oklab, var(--warn) 48%, black)",
  },
};

/** What stands in for the foil before the canvas has painted it. */
const coverOf = (f: React.CSSProperties) =>
  `linear-gradient(135deg, ${String(f.borderTopColor)}, ${String(f.color)} 40%, ${String(f.borderBottomColor)} 78%, ${String(f.color)})`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same foil, bites and flakes every time. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Distance from p to the segment ab. */
function toSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t =
    len2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/** Paints fresh foil: a banded metallic sweep, brushed grain, an embossed motif. */
function paintFoil(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: Colors,
  seed: number,
  font: string,
) {
  const rand = lcg(seed);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);
  const sweep = ctx.createLinearGradient(0, 0, w, h);
  sweep.addColorStop(0, c.light);
  sweep.addColorStop(0.22, c.base);
  sweep.addColorStop(0.44, c.light);
  sweep.addColorStop(0.63, c.base);
  sweep.addColorStop(0.84, c.dark);
  sweep.addColorStop(1, c.base);
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, w, h);

  // Brushed grain: fine horizontal hairlines, light and dark.
  const lines = Math.round(h * 1.1);
  for (let i = 0; i < lines; i += 1) {
    ctx.globalAlpha = 0.03 + rand() * 0.08;
    ctx.fillStyle = rand() > 0.5 ? c.light : c.dark;
    ctx.fillRect(0, rand() * h, w, 0.4 + rand() * 0.7);
  }

  // An embossed diamond motif, each one a dark and a light edge.
  const step = 22;
  for (let row = 0, y = step / 2; y < h + step; row += 1, y += step * 0.75) {
    for (let x = row % 2 ? step / 2 : 0; x < w + step; x += step) {
      for (const [dy, colour, alpha] of [
        [0.8, c.dark, 0.2],
        [-0.4, c.light, 0.35],
      ] as const) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.moveTo(x, y - 3.2 + dy);
        ctx.lineTo(x + 3.2, y + dy);
        ctx.lineTo(x, y + 3.2 + dy);
        ctx.lineTo(x - 3.2, y + dy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // The instruction, stamped into the foil.
  const size = clamp(Math.round(Math.min(w, h) * 0.085), 11, 15);
  ctx.font = `600 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = "SCRATCH HERE";
  const pad = size * 1.1;
  const tw = ctx.measureText(text).width + pad * 2;
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = c.base;
  ctx.beginPath();
  ctx.roundRect(w / 2 - tw / 2, h / 2 - size, tw, size * 2, size);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = c.light;
  ctx.fillText(text, w / 2, h / 2 + 0.8);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = c.ink;
  ctx.fillText(text, w / 2, h / 2);

  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = c.light;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  ctx.globalAlpha = 1;
}

/**
 * One stroke of the brush: a round scrape from a to b, and a ragged edge of
 * small seeded bites along both sides, the way foil tears rather than wipes.
 */
function scrape(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  r: number,
  rand: () => number,
) {
  ctx.globalCompositeOperation = "destination-out";
  ctx.globalAlpha = 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = r * 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x + 0.01, b.y);
  ctx.stroke();
  const len = dist(a, b);
  const ux = len > 0 ? (b.x - a.x) / len : 1;
  const uy = len > 0 ? (b.y - a.y) / len : 0;
  // Many small bites hugging the edge, not a few big ones: at this size they
  // read as a torn rim rather than as dots.
  const n = Math.max(2, Math.ceil(len / (r * 0.3)));
  ctx.beginPath();
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    for (const side of [-1, 1]) {
      if (rand() > 0.6) continue;
      const off = r * (0.9 + rand() * 0.1);
      const bite = r * (0.04 + rand() * 0.08);
      const bx = px - uy * side * off + ux * (rand() - 0.5) * r * 0.3;
      const by = py + ux * side * off + uy * (rand() - 0.5) * r * 0.3;
      ctx.moveTo(bx + bite, by);
      ctx.arc(bx, by, bite, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

/**
 * A reward under scratch-off foil. The pointer scrapes the foil away with a
 * ragged brush, and only foil that actually comes off throws flakes, which
 * tumble — light face, dark face — and fall out of the card. Once enough is
 * cleared, a glint crosses the card and the rest of the foil crumbles behind
 * it, and the reward settles into place on a recoil spring with a chime.
 *
 * The foil is a canvas whose colours are read from its own computed style, so
 * it follows the theme it sits in (a colour transition on the canvas tells it
 * when to repaint, and the scratches are replayed). Coverage is counted on a
 * coarse grid, never by reading pixels back. The flake loop runs only while
 * flakes are falling, only on screen, only in a visible page. Before the
 * reveal the foil is a real button: Enter or Space sweeps the same brush
 * across the card with the same sound. Under reduced motion there are no
 * flakes and no glint: the rest of the foil fades and the chime still plays.
 */
export function ScratchCard({
  children,
  label,
  revealed,
  defaultRevealed = false,
  onRevealedChange,
  onProgress,
  brush = 18,
  autoReveal = 60,
  flakes = true,
  foil = "silver",
  sound = false,
  disabled = false,
  className,
}: ScratchCardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const seed = hash(uid);

  const [own, setOwn] = React.useState(defaultRevealed);
  const isRevealed = revealed ?? own;
  const [said, setSaid] = React.useState({ n: 0, key: isRevealed, text: "" });
  if (said.key !== isRevealed) {
    setSaid({
      n: said.n + 1,
      key: isRevealed,
      text: isRevealed ? `${label} revealed.` : `${label} is under foil again.`,
    });
  }

  const radius = clamp(brush, 10, 34);
  const threshold = clamp(autoReveal, 40, 80) / 100;
  const withFlakes = flakes && motionSafe;
  const foilStyle = FOILS[foil] ?? FOILS.silver;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const foilRef = React.useRef<HTMLCanvasElement | null>(null);
  const flakeRef = React.useRef<HTMLCanvasElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const size = React.useRef({ w: 0, h: 0, dpr: 1 });
  const grid = React.useRef<Grid>({
    cols: 0,
    rows: 0,
    cells: new Uint8Array(0),
    cleared: 0,
  });
  const strokes = React.useRef<{ a: Pt; b: Pt; r: number }[]>([]);
  const colors = React.useRef<Colors | null>(null);
  const falling = React.useRef<Flake[]>([]);
  const frame = React.useRef(0);
  const lastFrame = React.useRef(0);
  const visible = React.useRef(true);
  const dirty = React.useRef(true);
  const random = React.useRef(lcg(seed));
  const phase = React.useRef<"foil" | "revealing" | "revealed">(
    isRevealed ? "revealed" : "foil",
  );
  const asked = React.useRef(false);
  const reported = React.useRef(-1);
  const pen = React.useRef<{ at: Pt; t: number } | null>(null);
  const loop = React.useRef<LoopHandle | null>(null);
  const hush = React.useRef<number | null>(null);
  const refocus = React.useRef(false);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const sweeping = React.useRef<AnimationPlaybackControls | null>(null);

  const settle = useMotionValue(1);
  const glint = useMotionValue(0);
  const glintOn = useMotionValue(0);
  const foilOpacity = useMotionValue(isRevealed ? 0 : 1);
  const glintLeft = useTransform(glint, (p) => `${r2(-60 + p * 170)}%`);

  const quiet = React.useCallback(() => {
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = null;
    loop.current?.stop();
    loop.current = null;
  }, []);

  const stopFlakes = React.useCallback(() => {
    if (frame.current) window.cancelAnimationFrame(frame.current);
    frame.current = 0;
    falling.current = [];
    const canvas = flakeRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  /** One frame of falling flakes; the loop ends itself when none are left. */
  const tick = React.useCallback(
    (now: number) => {
      frame.current = 0;
      const canvas = flakeRef.current;
      const ctx = canvas?.getContext("2d");
      const c = colors.current;
      if (!canvas || !ctx || !c) return;
      if (!visible.current || document.hidden) {
        stopFlakes();
        return;
      }
      const { w, h, dpr } = size.current;
      const dt = Math.min(0.05, (now - (lastFrame.current || now)) / 1000);
      lastFrame.current = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const alive: Flake[] = [];
      for (const f of falling.current) {
        f.vy += GRAVITY * dt;
        f.vx *= 0.985;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.angle += f.spin * dt;
        f.flip += f.flipRate * dt;
        f.life += dt;
        if (f.y > h + 12 || f.life > 2.4) continue;
        alive.push(f);
        const face = Math.cos(f.flip);
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.angle);
        ctx.scale(Math.max(0.12, Math.abs(face)), 1);
        ctx.globalAlpha = Math.min(1, (2.4 - f.life) * 2);
        ctx.fillStyle = face > 0 ? c.light : c.dark;
        ctx.fillRect(-f.size / 2, -f.size * 0.35, f.size, f.size * 0.7);
        ctx.restore();
      }
      falling.current = alive;
      if (alive.length > 0) {
        frame.current = window.requestAnimationFrame(tick);
      } else {
        lastFrame.current = 0;
      }
    },
    [stopFlakes],
  );

  const spawn = (x: number, y: number, vx: number) => {
    const rand = random.current;
    if (falling.current.length >= MOST_FLAKES) return;
    falling.current.push({
      x,
      y,
      vx: vx * 0.1 + (rand() - 0.5) * 90,
      vy: -(50 + rand() * 150),
      angle: rand() * Math.PI,
      spin: (rand() - 0.5) * 14,
      flip: rand() * Math.PI,
      flipRate: 8 + rand() * 16,
      size: 1.8 + rand() * 2.8,
      life: 0,
    });
    if (!frame.current && visible.current && !document.hidden) {
      frame.current = window.requestAnimationFrame(tick);
    }
  };

  /** Marks the cells a stroke cleared; returns the newly cleared centres. */
  const mark = (a: Pt, b: Pt, r: number): Pt[] => {
    const g = grid.current;
    const fresh: Pt[] = [];
    const reach = r * 0.92;
    const x0 = clamp(
      Math.floor((Math.min(a.x, b.x) - r) / CELL),
      0,
      g.cols - 1,
    );
    const x1 = clamp(
      Math.floor((Math.max(a.x, b.x) + r) / CELL),
      0,
      g.cols - 1,
    );
    const y0 = clamp(
      Math.floor((Math.min(a.y, b.y) - r) / CELL),
      0,
      g.rows - 1,
    );
    const y1 = clamp(
      Math.floor((Math.max(a.y, b.y) + r) / CELL),
      0,
      g.rows - 1,
    );
    for (let j = y0; j <= y1; j += 1) {
      for (let i = x0; i <= x1; i += 1) {
        const index = j * g.cols + i;
        if (g.cells[index]) continue;
        const centre = { x: (i + 0.5) * CELL, y: (j + 0.5) * CELL };
        if (toSegment(centre, a, b) <= reach) {
          g.cells[index] = 1;
          g.cleared += 1;
          fresh.push(centre);
        }
      }
    }
    return fresh;
  };

  const share = () => {
    const g = grid.current;
    return g.cells.length ? g.cleared / g.cells.length : 0;
  };

  const readColors = () => {
    const canvas = foilRef.current;
    if (!canvas) return null;
    const style = getComputedStyle(canvas);
    return {
      base: style.color,
      light: style.borderTopColor,
      dark: style.borderBottomColor,
      ink: style.borderLeftColor,
      font: style.fontFamily || "sans-serif",
    };
  };

  /** Fresh foil, with every scratch so far scraped back into it. */
  const paint = () => {
    const canvas = foilRef.current;
    const ctx = canvas?.getContext("2d");
    const read = readColors();
    if (!canvas || !ctx || !read) return;
    if (!visible.current) {
      dirty.current = true;
      return;
    }
    dirty.current = false;
    colors.current = read;
    const { w, h, dpr } = size.current;
    if (w < 1 || h < 1) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (phase.current === "revealed") {
      ctx.clearRect(0, 0, w, h);
      return;
    }
    // Mid-dissolve the foil is already going; a repaint would bring it back.
    if (phase.current === "revealing") return;
    paintFoil(ctx, w, h, read, seed, read.font);
    const rand = lcg(seed ^ 0x5bd1e995);
    for (const s of strokes.current) {
      scrape(
        ctx,
        { x: s.a.x * w, y: s.a.y * h },
        { x: s.b.x * w, y: s.b.y * h },
        s.r,
        rand,
      );
    }
    rootRef.current?.setAttribute("data-painted", "");
  };

  /** Sizes both canvases and the coverage grid to the card. */
  const resize = () => {
    const root = rootRef.current;
    const canvas = foilRef.current;
    const flakeCanvas = flakeRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    size.current = { w, h, dpr };
    for (const c of [canvas, flakeCanvas]) {
      if (!c) continue;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const cols = Math.ceil(w / CELL);
    const rows = Math.ceil(h / CELL);
    grid.current = {
      cols,
      rows,
      cells: new Uint8Array(cols * rows),
      cleared: 0,
    };
    for (const s of strokes.current) {
      mark({ x: s.a.x * w, y: s.a.y * h }, { x: s.b.x * w, y: s.b.y * h }, s.r);
    }
    paint();
  };

  const report = () => {
    const now = share();
    const whole = Math.floor(now * 100);
    if (whole !== reported.current) {
      reported.current = whole;
      onProgress?.(r2(now));
    }
    return now;
  };

  const stopSweep = () => {
    sweeping.current?.stop();
    sweeping.current = null;
  };

  const ask = () => {
    if (asked.current || phase.current !== "foil") return;
    asked.current = true;
    stopSweep();
    quiet();
    if (revealed === undefined) setOwn(true);
    onRevealedChange?.(true);
  };

  /** One segment of scratching, from a pointer or from the sweep. */
  const scratch = (a: Pt, b: Pt, vx: number) => {
    const canvas = foilRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || phase.current !== "foil") return;
    const { w, h, dpr } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scrape(ctx, a, b, radius, random.current);
    strokes.current.push({
      a: { x: a.x / w, y: a.y / h },
      b: { x: b.x / w, y: b.y / h },
      r: radius,
    });
    const fresh = mark(a, b, radius);
    if (withFlakes) {
      const rand = random.current;
      for (const centre of fresh) {
        if (rand() < 0.45) spawn(centre.x, centre.y, vx);
      }
    }
    if (report() >= threshold) ask();
  };

  /** The scrape's voice follows the brush's speed and hushes when it stops. */
  const voice = (speed: number, clientX: number) => {
    loop.current?.set({
      pitch: r2(0.7 + Math.min(1.3, speed * 0.5)),
      gain: r2(Math.min(0.6, 0.15 + speed * 0.35)),
      pan: panFrom(clientX, rootRef.current),
    });
    if (hush.current !== null) window.clearTimeout(hush.current);
    hush.current = window.setTimeout(() => {
      loop.current?.set({ gain: 0 });
    }, 60);
  };

  const local = (x: number, y: number): Pt => {
    const rect = rootRef.current?.getBoundingClientRect();
    const root = rootRef.current;
    if (!rect || !root) return { x: 0, y: 0 };
    return {
      x: x - rect.left - root.clientLeft,
      y: y - rect.top - root.clientTop,
    };
  };

  const drag = useDrag({
    disabled: disabled || isRevealed,
    onStart: ({ point, offset, event }) => {
      stopSweep();
      asked.current = false;
      const from = local(point.x - offset.x, point.y - offset.y);
      pen.current = { at: from, t: event.timeStamp };
      quiet();
      loop.current = audio.start("scratch", {
        pitch: 0.9,
        gain: 0,
        pan: panFrom(point.x, rootRef.current),
      });
    },
    onMove: ({ point, event }) => {
      const p = pen.current;
      if (!p) return;
      const at = local(point.x, point.y);
      const moved = dist(at, p.at);
      if (moved < 1) return;
      const dt = Math.max(8, event.timeStamp - p.t);
      scratch(p.at, at, ((at.x - p.at.x) / dt) * 1000);
      voice(moved / dt, point.x);
      pen.current = { at, t: event.timeStamp };
    },
    onEnd: () => {
      pen.current = null;
      quiet();
      if (share() >= threshold) ask();
    },
    onCancel: () => {
      pen.current = null;
      quiet();
    },
    onTap: (event) => {
      asked.current = false;
      const at = local(event.clientX, event.clientY);
      scratch(at, { x: at.x + 0.5, y: at.y }, 0);
      audio.play("paper", {
        gain: 0.3,
        pan: panFrom(event.clientX, rootRef.current),
      });
    },
  });

  /** The keyboard's reveal: the same brush, swept across in rows. */
  const sweep = () => {
    if (disabled || phase.current !== "foil") return;
    asked.current = false;
    const { w, h } = size.current;
    if (w < 1 || h < 1) return;
    const rect = rootRef.current?.getBoundingClientRect();
    const panAt = (x: number) =>
      rect ? panFrom(rect.left + x, rootRef.current) : 0;
    quiet();
    loop.current = audio.start("scratch", { pitch: 1.4, gain: 0.4 });
    if (!motionSafe) {
      hush.current = window.setTimeout(() => {
        quiet();
        ask();
      }, 150);
      return;
    }
    const path: Pt[] = [];
    const gap = radius * 1.5;
    for (
      let row = 0, y = radius * 0.8;
      y < h + radius * 0.5;
      row += 1, y += gap
    ) {
      const left = -radius * 0.2;
      const right = w + radius * 0.2;
      path.push(
        { x: row % 2 ? right : left, y },
        { x: row % 2 ? left : right, y },
      );
    }
    const along = [0];
    for (let i = 1; i < path.length; i += 1) {
      along.push(
        (along[i - 1] as number) + dist(path[i - 1] as Pt, path[i] as Pt),
      );
    }
    const total = along[along.length - 1] as number;
    const at = (d: number): Pt => {
      let i = 1;
      while (i < path.length - 1 && (along[i] as number) < d) i += 1;
      const a0 = along[i - 1] as number;
      const a1 = along[i] as number;
      const t = a1 > a0 ? (d - a0) / (a1 - a0) : 0;
      const p0 = path[i - 1] as Pt;
      const p1 = path[i] as Pt;
      return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t };
    };
    let prev = path[0] as Pt;
    const duration = clamp(total / 1100, 0.6, 1.2);
    stopSweep();
    sweeping.current = animate(0, 1, {
      duration,
      ease: easings.linear,
      onUpdate: (t) => {
        const next = at(t * total);
        scratch(prev, next, ((next.x - prev.x) / duration) * 60);
        loop.current?.set({ pan: panAt(next.x) });
        prev = next;
      },
      onComplete: () => {
        sweeping.current = null;
        quiet();
        ask();
      },
    });
  };

  /** The rest of the foil crumbles behind a glint, and the reward lands. */
  const dissolve = () => {
    phase.current = "revealing";
    stopSweep();
    quiet();
    for (const a of anims.current) a.stop();
    anims.current = [];
    audio.play("chime", {
      pitch: foil === "gold" ? r2(semitones(5)) : 1,
      gain: 0.55,
    });
    audio.play("shimmer", { gain: 0.3 });
    const done = () => {
      phase.current = "revealed";
      const canvas = foilRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    if (!motionSafe) {
      anims.current = [
        animate(foilOpacity, 0, {
          duration: durations.base,
          ease: easings.exit,
          onComplete: done,
        }),
      ];
      return;
    }
    const canvas = foilRef.current;
    const ctx = canvas?.getContext("2d");
    const { w, h, dpr } = size.current;
    const g = grid.current;
    const rand = lcg(seed ^ 0x27d4eb2d);
    // Every cell still covered, in the order the glint's front reaches it.
    const left: { x: number; y: number; at: number }[] = [];
    for (let j = 0; j < g.rows; j += 1) {
      for (let i = 0; i < g.cols; i += 1) {
        if (g.cells[j * g.cols + i]) continue;
        const x = (i + 0.5) * CELL;
        const y = (j + 0.5) * CELL;
        left.push({ x, y, at: x + y * 0.6 + (rand() - 0.5) * 36 });
      }
    }
    left.sort((p, q) => p.at - q.at);
    const span = w + h * 0.6 + 40;
    let cursor = 0;
    settle.set(0.965);
    glintOn.set(1);
    anims.current = [
      animate(glint, 1, {
        duration: 0.6,
        ease: easings.move,
        onUpdate: (p) => {
          if (!ctx) return;
          const front = p * span - 20;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.globalCompositeOperation = "destination-out";
          ctx.beginPath();
          while (
            cursor < left.length &&
            (left[cursor]?.at ?? Infinity) <= front
          ) {
            const cell = left[cursor] as { x: number; y: number };
            cursor += 1;
            ctx.moveTo(cell.x + CELL, cell.y);
            ctx.arc(
              cell.x,
              cell.y,
              CELL * (0.9 + rand() * 0.5),
              0,
              Math.PI * 2,
            );
            if (withFlakes && rand() < 0.3) spawn(cell.x, cell.y, 260);
          }
          ctx.fill();
          ctx.globalCompositeOperation = "source-over";
        },
        onComplete: () => {
          done();
          glintOn.set(0);
        },
      }),
      animate(settle, 1, springs.recoil),
    ];
  };

  /** New foil: the host asked for the card back under. */
  const reset = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
    stopSweep();
    quiet();
    stopFlakes();
    phase.current = "foil";
    asked.current = false;
    reported.current = -1;
    strokes.current = [];
    const g = grid.current;
    grid.current = { ...g, cells: new Uint8Array(g.cols * g.rows), cleared: 0 };
    settle.set(1);
    glint.set(0);
    glintOn.set(0);
    foilOpacity.set(1);
    paint();
  };

  const api = React.useRef({ resize, paint, dissolve, reset });
  React.useEffect(() => {
    api.current = { resize, paint, dissolve, reset };
  });

  // A value that changes — from the scratching or the host — dissolves the
  // foil or lays fresh foil, the same way either way. Before paint: a card
  // going back under foil must never show its new reward for a frame.
  const shown = React.useRef(isRevealed);
  React.useLayoutEffect(() => {
    if (shown.current === isRevealed) return;
    shown.current = isRevealed;
    if (isRevealed) api.current.dissolve();
    else api.current.reset();
  }, [isRevealed]);

  // Focus that was on the foil button goes to the reward once it is live.
  React.useEffect(() => {
    if (!isRevealed || !refocus.current) return;
    refocus.current = false;
    contentRef.current?.focus({ preventScroll: true });
  }, [isRevealed]);

  // The button leaves when the foil does; if it held focus as it left, the
  // reward takes it (above), rather than the page.
  const bindButton = React.useCallback((node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (!node) return;
    return () => {
      if (document.activeElement === node) refocus.current = true;
    };
  }, []);

  // The card's size and whether it is on screen, bound to the node when it
  // arrives. Off screen nothing runs: a repaint waits, falling flakes drop.
  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const sizer = new ResizeObserver(() => api.current.resize());
      sizer.observe(node);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        visible.current = Boolean(entry?.isIntersecting);
        if (!visible.current) stopFlakes();
        else if (dirty.current) api.current.paint();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
      };
    },
    [stopFlakes],
  );

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) stopFlakes();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [stopFlakes]);

  React.useEffect(
    () => () => {
      for (const a of anims.current) a.stop();
      anims.current = [];
      sweeping.current?.stop();
      sweeping.current = null;
      quiet();
      stopFlakes();
    },
    [quiet, stopFlakes],
  );

  // A new theme or foil changes the canvas's colours; the 1ms colour
  // transition says when, and the foil is painted again from them.
  const repaintSoon = React.useRef(0);
  const onColors = () => {
    if (repaintSoon.current) return;
    repaintSoon.current = window.requestAnimationFrame(() => {
      repaintSoon.current = 0;
      api.current.paint();
    });
  };
  React.useEffect(
    () => () => {
      if (repaintSoon.current) window.cancelAnimationFrame(repaintSoon.current);
      repaintSoon.current = 0;
    },
    [],
  );

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/scratch-card relative isolate overflow-clip rounded-3",
        disabled && "opacity-50",
        className,
      )}
    >
      <motion.div
        ref={contentRef}
        role="group"
        aria-label={label}
        aria-hidden={!isRevealed || undefined}
        inert={!isRevealed}
        tabIndex={-1}
        style={{ scale: settle }}
        className="rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        {children}
      </motion.div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/scratch-card:hidden"
        style={{ background: isRevealed ? "none" : coverOf(foilStyle) }}
      />
      <motion.canvas
        ref={foilRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={{ ...foilStyle, opacity: foilOpacity }}
      />
      <canvas
        ref={flakeRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
        style={{
          left: glintLeft,
          opacity: glintOn,
          background: `linear-gradient(90deg, transparent, color-mix(in oklab, ${String(foilStyle.borderTopColor)} 38%, transparent), transparent)`,
        }}
      />

      {isRevealed ? null : (
        <button
          ref={bindButton}
          type="button"
          aria-label={`Scratch to reveal: ${label}`}
          aria-describedby={hintId}
          disabled={disabled}
          onClick={(event) => {
            // Pointer scratching arrives through the drag. A click with no
            // pointer behind it — Space, Enter, assistive technology — sweeps.
            if (event.detail === 0) sweep();
          }}
          {...drag}
          className={cn(
            "absolute inset-0 size-full touch-none rounded-[inherit] outline-none select-none [-webkit-touch-callout:none]",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-not-allowed" : "cursor-crosshair",
          )}
        />
      )}

      <p id={hintId} className="sr-only">
        Drag across the foil to scratch it off, or press Enter to sweep it all
        away.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
