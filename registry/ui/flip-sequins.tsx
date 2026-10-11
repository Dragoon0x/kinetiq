"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FlipSequinsTone = "rose" | "gold" | "teal" | "ink";

export type FlipSequinsProps = {
  /** Sequin diameter, in px. @default 18 */
  sequin?: number;
  /** The colour of the other face: a named tone or any CSS colour. @default "rose" */
  flipColor?: FlipSequinsTone | (string & {});
  /** How glossy the faces are and how bright the glint is as one turns, 0 to 1. @default 0.6 */
  shine?: number;
  /** The home face's colour. @default a satin from --ink-2 */
  color?: string;
  /** The fabric showing between the sequins. @default the page, deepened */
  fabric?: string;
  /** The fabric's nap, in degrees: brushing along it turns sequins over, brushing against it smooths them home. @default 45 (down and to the right) */
  nap?: number;
  /** A mouse brushes on hover, or only while its button is down. Touch and pen always brush while pressed. @default "hover" */
  brushOn?: "hover" | "press";
  /** The brush's reach, in sequins. @default 1.1 */
  radius?: number;
  /** How loose each turn is, 0 (one crisp overshoot) to 1 (a fluttering settle). @default 0.25 */
  wobble?: number;
  /** How long a still press must be held to smooth the whole field, in ms. @default 550 */
  holdToSmooth?: number;
  /** A word turned over into the field when it is laid out, so the first frame says something. @default "" */
  text?: string;
  /** Fires from the stroke, press or key that changed the field, with how many sequins show their other face. */
  onFlipChange?: (flipped: number, total: number) => void;
  /** Fires when a long press or Backspace smooths the field. */
  onSmooth?: () => void;
  /** A shimmer as sequins turn, after a visitor's stroke or key. @default false */
  sound?: boolean;
  /** The field's accessible name. @default "Sequin panel" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the field but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the panel; it fills its parent by default. */
  className?: string;
};

/** Pigments at a fixed lightness, so a face is the same colour in either theme. */
const TONES: Record<FlipSequinsTone, string> = {
  rose: "oklch(from var(--danger) 0.66 0.15 calc(h - 4))",
  gold: "oklch(from var(--warn) 0.8 0.13 h)",
  teal: "oklch(from var(--signal) 0.66 0.1 calc(h + 24))",
  ink: "oklch(from var(--accent) 0.4 0.13 h)",
};

type Rgb = readonly [number, number, number];

const STEP = 1 / 120;
const GLOSS = 4;
/** Reduced motion: a face cross-fades instead of turning. */
const FADE_STROKE = 0.15;
const FADE_SMOOTH = 0.24;
/** A stroke this close to perpendicular to the nap changes nothing. */
const DEAD_ZONE = 0.15;
const SOUND_GAP = 90;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** The nap in words: which ways of brushing turn sequins over, and which smooth them. */
function napWords(nap: number): { over: string; home: string } {
  const a = (nap * Math.PI) / 180;
  const x = Math.cos(a);
  const y = Math.sin(a);
  const pick = (sx: number, sy: number) => {
    const ways: string[] = [];
    if (sx * x > DEAD_ZONE) ways.push(sx > 0 ? "right" : "left");
    if (sy * y > DEAD_ZONE) ways.push(sy > 0 ? "down" : "up");
    return ways.join(" or ");
  };
  return {
    over: pick(Math.sign(x), Math.sign(y)) || "along the nap",
    home: pick(-Math.sign(x), -Math.sign(y)) || "against it",
  };
}
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

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

const toward = (a: Rgb, b: Rgb, t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;

type Field = {
  w: number;
  h: number;
  dpr: number;
  size: number;
  px: number;
  py: number;
  cols: number;
  rows: number;
  x0: number;
  y0: number;
  n: number;
  cx: Float32Array;
  cy: Float32Array;
  /** The seeded tilt each sequin rests at, as a small normal offset. */
  tx: Float32Array;
  ty: Float32Array;
  /** 0 shows the home face, 1 the other: the logical state. */
  goal: Uint8Array;
  /** The turn, 0 (home face up) to π (other face up), and its rate. */
  phi: Float32Array;
  vel: Float32Array;
  /** The direction of the stroke that turned it, radians: the disc squashes along it. */
  axis: Float32Array;
  /** Seconds a smoothing sequin waits before it turns, for the ring to reach it. */
  wait: Float32Array;
  /** Reduced motion's cross-fade progress (1 is done) and its rate. */
  fade: Float32Array;
  fadeRate: Float32Array;
  atlas: HTMLCanvasElement | null;
  cell: number;
};

type Brush = {
  x: number;
  y: number;
  present: boolean;
  ring: boolean;
  source: "pointer" | "key" | null;
  /** The last hover point, for hover strokes. */
  hx: number;
  hy: number;
  hovering: boolean;
};

/**
 * A panel of fabric covered in round, two-faced sequins in overlapping rows.
 * Brushing across it turns the sequins under the brush over in the direction
 * of travel — each disc squashing along the stroke, changing face at 90°
 * and opening out again on its own spring, glinting while edge-on — so you
 * can draw pictures and words. Whether a stroke turns them over or home is
 * its direction against the fabric's nap: brush one way to draw, back the
 * other way to erase. A long, still press smooths the whole field: a ring
 * runs out from the finger and every turned sequin it reaches flips home.
 *
 * Each turn is a spring on the springs.snap constants (stiffness 640, ζ 0.83)
 * by default, with `wobble` loosening it toward the recoil spring's flutter;
 * the springs are integrated at 120 Hz while anything turns and the loop
 * stops when every sequin is seated. Canvas 2D from pre-rendered sprites.
 *
 * The keyboard's way in is a transparent button: arrow keys brush, Shift
 * lifts the brush, Enter or Space turns the sequins under it, Backspace or
 * Delete smooths the field. Under reduced motion faces cross-fade instead of
 * turning and the smoothing is one fade; drawing works exactly the same.
 */
export function FlipSequins({
  sequin = 18,
  flipColor = "rose",
  shine = 0.6,
  color = "color-mix(in oklab, var(--ink-2) 52%, var(--background))",
  fabric = "color-mix(in oklab, var(--background) 62%, black)",
  nap = 45,
  brushOn = "hover",
  radius = 1.1,
  wobble = 0.25,
  holdToSmooth = 550,
  text = "",
  onFlipChange,
  onSmooth,
  sound = false,
  label = "Sequin panel",
  dpr = 2,
  disabled = false,
  className,
}: FlipSequinsProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const other =
    flipColor in TONES
      ? TONES[flipColor as FlipSequinsTone]
      : (flipColor as string);

  const ways = napWords(nap);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const field = React.useRef<Field | null>(null);
  const colours = React.useRef<{
    home: Rgb;
    other: Rgb;
    fabric: string;
    ring: string;
  } | null>(null);
  const reader = React.useRef<((colour: string) => Rgb) | null>(null);
  const brush = React.useRef<Brush>({
    x: 0,
    y: 0,
    present: false,
    ring: false,
    source: null,
    hx: 0,
    hy: 0,
    hovering: false,
  });
  /** Where the light sits, which the pointer draws a little toward itself. */
  const lightAt = React.useRef({ x: -0.3, y: -0.4 });
  const smoothRing = React.useRef<{
    x: number;
    y: number;
    t: number;
    speed: number;
    reach: number;
  } | null>(null);
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const carry = React.useRef(0);
  const visible = React.useRef(false);
  const dirty = React.useRef(true);
  const drawn = React.useRef(false);
  const holdTimer = React.useRef<number | null>(null);
  const smoothed = React.useRef(false);
  const lastSound = React.useRef(0);
  const laidText = React.useRef<string | null>(null);

  const latest = React.useRef({
    sequin,
    shine,
    nap,
    brushOn,
    radius,
    wobble,
    holdToSmooth,
    text,
    onFlipChange,
    onSmooth,
    motionSafe,
    disabled,
    audio,
    dpr,
  });
  React.useEffect(() => {
    latest.current = {
      sequin,
      shine,
      nap,
      brushOn,
      radius,
      wobble,
      holdToSmooth,
      text,
      onFlipChange,
      onSmooth,
      motionSafe,
      disabled,
      audio,
      dpr,
    };
  });

  const readColours = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (!reader.current) reader.current = rgbReader();
    const read = reader.current;
    const s = getComputedStyle(canvas);
    return {
      home: read(s.color),
      other: read(s.borderTopColor),
      fabric: s.borderRightColor,
      ring: s.borderBottomColor,
    };
  };

  /** Both faces at every gloss level, drawn once per size and colour. */
  const buildAtlas = (f: Field) => {
    const c = colours.current;
    if (!c) return;
    const d = f.dpr;
    const R = (f.size / 2) * d;
    const cell = Math.ceil(f.size * 1.36 * d);
    const atlas = f.atlas ?? document.createElement("canvas");
    atlas.width = cell * GLOSS * 2;
    atlas.height = cell;
    const a = atlas.getContext("2d");
    f.atlas = atlas;
    f.cell = cell;
    if (!a) return;
    a.clearRect(0, 0, atlas.width, cell);
    const gloss = clamp(latest.current.shine);
    const white: Rgb = [255, 255, 255];
    const black: Rgb = [0, 0, 0];
    for (let face = 0; face < 2; face += 1) {
      const base = face === 0 ? c.home : c.other;
      for (let g = 0; g < GLOSS; g += 1) {
        const ox = (face * GLOSS + g) * cell + cell / 2;
        const oy = cell / 2;
        const lift = g / (GLOSS - 1);
        // The shadow it casts on the sequin below.
        const shadow = a.createRadialGradient(
          ox,
          oy + R * 0.26,
          R * 0.2,
          ox,
          oy + R * 0.26,
          R * 1.12,
        );
        shadow.addColorStop(0, "rgba(0, 0, 0, 0.34)");
        shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
        a.fillStyle = shadow;
        a.fillRect(ox - cell / 2, oy - cell / 2, cell, cell);
        // The cupped disc: lit at the top left, deepening to its rim.
        const body = a.createRadialGradient(
          ox - R * 0.36,
          oy - R * 0.42,
          0,
          ox,
          oy,
          R * 1.2,
        );
        body.addColorStop(
          0,
          toward(base, white, 0.18 + (0.18 + 0.3 * lift) * gloss),
        );
        body.addColorStop(0.5, toward(base, white, 0.04 * lift));
        body.addColorStop(1, toward(base, black, 0.34));
        a.fillStyle = body;
        a.beginPath();
        a.arc(ox, oy, R, 0, Math.PI * 2);
        a.fill();
        a.lineWidth = Math.max(1, d * 0.75);
        a.strokeStyle = toward(base, black, 0.5);
        a.globalAlpha = 0.7;
        a.stroke();
        a.globalAlpha = 0.22 + 0.2 * gloss;
        a.strokeStyle = toward(base, white, 0.5);
        a.beginPath();
        a.arc(ox, oy, R * 0.64, Math.PI * 0.95, Math.PI * 1.75);
        a.stroke();
        // The specular: a soft crescent whose strength is the gloss level.
        a.globalAlpha = (0.08 + 0.62 * lift) * (0.3 + 0.7 * gloss);
        a.fillStyle = "rgb(255, 255, 255)";
        a.beginPath();
        a.ellipse(
          ox - R * 0.3,
          oy - R * 0.32,
          R * 0.42,
          R * 0.2,
          -0.6,
          0,
          Math.PI * 2,
        );
        a.fill();
        // The stitch hole near the top, and its thread.
        a.globalAlpha = 0.85;
        a.fillStyle = toward(base, black, 0.72);
        a.beginPath();
        a.arc(ox, oy - R * 0.58, Math.max(d * 0.8, R * 0.12), 0, Math.PI * 2);
        a.fill();
        a.globalAlpha = 0.55;
        a.fillRect(
          ox - Math.max(0.5, d * 0.4),
          oy - R * 0.98,
          Math.max(1, d * 0.8),
          R * 0.4,
        );
        a.globalAlpha = 1;
      }
    }
  };

  const flippedCount = (f: Field) => {
    let n = 0;
    for (let i = 0; i < f.n; i += 1) n += f.goal[i] ?? 0;
    return n;
  };

  const report = (f: Field) => {
    latest.current.onFlipChange?.(flippedCount(f), f.n);
  };

  /** Gloss level 0–3 for sequin i under the current light. */
  const glossOf = (f: Field, i: number) => {
    const lx = lightAt.current.x * f.w - ((f.cx[i] ?? 0) - f.w / 2);
    const ly = lightAt.current.y * f.h - ((f.cy[i] ?? 0) - f.h / 2);
    const len = Math.hypot(lx, ly, f.w * 0.6) || 1;
    const facing = ((f.tx[i] ?? 0) * lx + (f.ty[i] ?? 0) * ly) / len;
    return Math.max(0, Math.min(GLOSS - 1, Math.round(1.4 + facing * 6)));
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const f = field.current;
    const c = colours.current;
    if (!canvas || !ctx || !f || !c || !f.atlas) return;
    if (!visible.current) {
      dirty.current = true;
      return;
    }
    dirty.current = false;
    const { dpr: d, w, h, cols, rows, cell, atlas } = f;
    const shineK = clamp(latest.current.shine);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.fabric;
    ctx.fillRect(0, 0, w, h);
    const half = cell / d / 2;
    const C = cell / d;
    // Each row hangs over the one below, so the rows are laid bottom up.
    for (let row = rows - 1; row >= 0; row -= 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const x = f.cx[i] ?? 0;
        const y = f.cy[i] ?? 0;
        const p = f.phi[i] ?? 0;
        const g = glossOf(f, i);
        const fade = f.fade[i] ?? 1;
        if (fade < 1) {
          const now = f.goal[i] ?? 0;
          ctx.globalAlpha = 1;
          ctx.drawImage(
            atlas,
            ((1 - now) * GLOSS + g) * cell,
            0,
            cell,
            cell,
            x - half,
            y - half,
            C,
            C,
          );
          ctx.globalAlpha = fade;
          ctx.drawImage(
            atlas,
            (now * GLOSS + g) * cell,
            0,
            cell,
            cell,
            x - half,
            y - half,
            C,
            C,
          );
          ctx.globalAlpha = 1;
          continue;
        }
        const face = p > Math.PI / 2 ? 1 : 0;
        const squash = Math.abs(Math.cos(p));
        if (squash > 0.999) {
          ctx.drawImage(
            atlas,
            (face * GLOSS + g) * cell,
            0,
            cell,
            cell,
            x - half,
            y - half,
            C,
            C,
          );
          continue;
        }
        // Turning: squashed along the stroke, pivoting about its stitch so
        // it lifts toward the way it is going.
        const a = f.axis[i] ?? 0;
        const s = Math.sin(p);
        const lean = s * f.size * 0.16;
        ctx.save();
        ctx.translate(x + Math.cos(a) * lean, y + Math.sin(a) * lean);
        ctx.rotate(a);
        ctx.scale(Math.max(0.04, squash), 1);
        ctx.rotate(-a);
        ctx.drawImage(
          atlas,
          (face * GLOSS + Math.min(GLOSS - 1, g + 1)) * cell,
          0,
          cell,
          cell,
          -half,
          -half,
          C,
          C,
        );
        ctx.restore();
        // The glint runs along the turning axis while it is edge-on.
        const glint = s * s * (0.35 + 0.65 * shineK);
        if (glint > 0.03) {
          ctx.save();
          ctx.translate(x + Math.cos(a) * lean, y + Math.sin(a) * lean);
          ctx.rotate(a);
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = glint;
          ctx.fillStyle = "rgb(255, 255, 255)";
          const r = f.size * 0.46;
          ctx.fillRect(-0.75 - squash * r * 0.4, -r, 1.5, r * 2);
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    const ring = smoothRing.current;
    if (ring && latest.current.motionSafe) {
      const rr = ring.t * ring.speed;
      const fadeOut = clamp(1 - rr / Math.max(1, ring.reach));
      if (fadeOut > 0) {
        ctx.globalAlpha = 0.35 * fadeOut;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgb(255, 255, 255)";
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, Math.max(1, rr), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    const b = brush.current;
    if (b.ring && b.present) {
      ctx.beginPath();
      ctx.arc(
        b.x,
        b.y,
        Math.max(8, latest.current.radius * f.size),
        0,
        Math.PI * 2,
      );
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = c.ring;
      ctx.stroke();
    }
    drawn.current = true;
    rootRef.current?.setAttribute("data-painted", "");
  };

  const integrate = (dt: number): boolean => {
    const f = field.current;
    if (!f) return false;
    const ms = latest.current.motionSafe;
    const k = springs.snap.stiffness;
    const zeta = 0.83 - 0.4 * clamp(latest.current.wobble);
    const damping = 2 * zeta * Math.sqrt(k);
    let moving = false;
    const ring = smoothRing.current;
    if (ring) {
      ring.t += dt;
      if (ring.t * ring.speed > ring.reach + 40) smoothRing.current = null;
      moving = true;
    }
    for (let i = 0; i < f.n; i += 1) {
      const fade = f.fade[i] ?? 1;
      if (fade < 1) {
        f.fade[i] = Math.min(1, fade + dt * (f.fadeRate[i] ?? 6));
        moving = true;
      }
      const wait = f.wait[i] ?? 0;
      if (wait > 0) {
        f.wait[i] = Math.max(0, wait - dt);
        moving = true;
        continue;
      }
      const target = (f.goal[i] ?? 0) * Math.PI;
      const p = f.phi[i] ?? 0;
      const v = f.vel[i] ?? 0;
      if (p === target && v === 0) continue;
      if (!ms) {
        f.phi[i] = target;
        f.vel[i] = 0;
        continue;
      }
      const acc = k * (target - p) - damping * v;
      const nv = v + acc * dt;
      const np = p + nv * dt;
      if (Math.abs(target - np) < 0.004 && Math.abs(nv) < 0.05) {
        f.phi[i] = target;
        f.vel[i] = 0;
      } else {
        f.phi[i] = np;
        f.vel[i] = nv;
        moving = true;
      }
    }
    return moving;
  };

  const tick = (now: number) => {
    frame.current = 0;
    if (!visible.current || document.hidden) {
      last.current = 0;
      return;
    }
    const dt = last.current
      ? Math.min(1 / 30, (now - last.current) / 1000)
      : 1 / 60;
    last.current = now;
    carry.current += dt;
    let moving = false;
    let steps = 0;
    while (carry.current >= STEP && steps < 6) {
      carry.current -= STEP;
      steps += 1;
      if (integrate(STEP)) moving = true;
    }
    if (steps === 0) moving = true;
    draw();
    if (moving) frame.current = window.requestAnimationFrame(tick);
    else {
      last.current = 0;
      carry.current = 0;
    }
  };

  const kick = () => {
    if (frame.current || !field.current) return;
    if (!visible.current || document.hidden) {
      dirty.current = true;
      return;
    }
    frame.current = window.requestAnimationFrame(tick);
  };

  /** Turns sequin i to `side`, along `axis`; true if it changed. */
  const setSide = (
    f: Field,
    i: number,
    side: 0 | 1,
    axis: number,
    fadeFor: number,
  ) => {
    if ((f.goal[i] ?? 0) === side) return false;
    f.goal[i] = side;
    f.axis[i] = axis;
    if (!latest.current.motionSafe) {
      f.phi[i] = side * Math.PI;
      f.vel[i] = 0;
      f.fade[i] = 0;
      f.fadeRate[i] = 1 / fadeFor;
    }
    return true;
  };

  /** Every sequin within `reach` of the segment a→b. */
  const forEachNear = (
    f: Field,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    reach: number,
    fn: (i: number) => void,
  ) => {
    const minX = Math.min(ax, bx) - reach;
    const maxX = Math.max(ax, bx) + reach;
    const minY = Math.min(ay, by) - reach;
    const maxY = Math.max(ay, by) + reach;
    const r0 = Math.max(0, Math.floor((minY - f.y0) / f.py) - 1);
    const r1 = Math.min(f.rows - 1, Math.ceil((maxY - f.y0) / f.py) + 1);
    const c0 = Math.max(0, Math.floor((minX - f.x0) / f.px) - 1);
    const c1 = Math.min(f.cols - 1, Math.ceil((maxX - f.x0) / f.px) + 1);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const reach2 = reach * reach;
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        const i = row * f.cols + col;
        const x = f.cx[i] ?? 0;
        const y = f.cy[i] ?? 0;
        const t = len2 > 0 ? clamp(((x - ax) * dx + (y - ay) * dy) / len2) : 0;
        const ex = ax + dx * t - x;
        const ey = ay + dy * t - y;
        if (ex * ex + ey * ey <= reach2) fn(i);
      }
    }
  };

  const chime = (count: number, over: boolean, clientX: number | null) => {
    if (count <= 0) return;
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & {
            userActivation?: { hasBeenActive: boolean };
          })
        : null;
    // Sound answers the visitor, and never before the page has had a click,
    // tap or key: a hover stroke on a fresh page stays silent.
    if (nav?.userActivation && !nav.userActivation.hasBeenActive) return;
    const now = performance.now();
    if (now - lastSound.current < SOUND_GAP) return;
    lastSound.current = now;
    latest.current.audio.play("shimmer", {
      pitch: r2((over ? 1.12 : 0.84) * (1 + Math.min(0.2, count * 0.01))),
      gain: r2(clamp(0.16 + count * 0.025, 0.16, 0.5)),
      pan: clientX === null ? 0 : panFrom(clientX, rootRef.current),
    });
  };

  /** A brush stroke from a to b: sequins under it turn by the stroke's direction against the nap. */
  const stroke = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    clientX: number | null,
  ) => {
    const f = field.current;
    if (!f || latest.current.disabled) return 0;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return 0;
    const napRad = (latest.current.nap * Math.PI) / 180;
    const along = (dx * Math.cos(napRad) + dy * Math.sin(napRad)) / len;
    if (Math.abs(along) < DEAD_ZONE) return 0;
    const side: 0 | 1 = along > 0 ? 1 : 0;
    const axis = Math.atan2(dy, dx);
    let changed = 0;
    forEachNear(f, ax, ay, bx, by, latest.current.radius * f.size, (i) => {
      if (setSide(f, i, side, axis, FADE_STROKE)) changed += 1;
    });
    if (changed > 0) {
      kick();
      report(f);
      chime(changed, side === 1, clientX);
    }
    return changed;
  };

  /** Turns the sequins under a point: over if most are home, home if most are over. */
  const toggleAt = (x: number, y: number, clientX: number | null) => {
    const f = field.current;
    if (!f) return 0;
    const near: number[] = [];
    forEachNear(f, x, y, x, y, latest.current.radius * f.size, (i) =>
      near.push(i),
    );
    if (!near.length) return 0;
    let over = 0;
    for (const i of near) over += f.goal[i] ?? 0;
    const side: 0 | 1 = over * 2 >= near.length ? 0 : 1;
    let changed = 0;
    for (const i of near) {
      if (setSide(f, i, side, Math.PI / 2, FADE_STROKE)) changed += 1;
    }
    if (changed > 0) {
      kick();
      report(f);
      chime(changed, side === 1, clientX);
    }
    return changed;
  };

  /** The whole field smoothed home, in a ring running out from (x, y). */
  const smoothFrom = (x: number, y: number, clientX: number | null) => {
    const f = field.current;
    if (!f) return;
    let reach = 0;
    let changed = 0;
    for (let i = 0; i < f.n; i += 1) {
      if ((f.goal[i] ?? 0) === 1) {
        reach = Math.max(
          reach,
          Math.hypot((f.cx[i] ?? 0) - x, (f.cy[i] ?? 0) - y),
        );
      }
    }
    // About 0.9 px a millisecond, quicker on a big field so the wave is
    // done inside the 600 ms beat.
    const speed = Math.max(900, reach / 0.6);
    for (let i = 0; i < f.n; i += 1) {
      if ((f.goal[i] ?? 0) !== 1) continue;
      const ex = (f.cx[i] ?? 0) - x;
      const ey = (f.cy[i] ?? 0) - y;
      setSide(f, i, 0, Math.atan2(ey, ex), FADE_SMOOTH);
      if (latest.current.motionSafe) f.wait[i] = Math.hypot(ex, ey) / speed;
      changed += 1;
    }
    if (latest.current.motionSafe)
      smoothRing.current = { x, y, t: 0, speed, reach: Math.max(reach, 24) };
    kick();
    report(f);
    latest.current.onSmooth?.();
    if (changed > 0) {
      const nav = navigator as Navigator & {
        userActivation?: { hasBeenActive: boolean };
      };
      if (!nav.userActivation || nav.userActivation.hasBeenActive) {
        lastSound.current = performance.now();
        latest.current.audio.play("shimmer", {
          pitch: 0.7,
          gain: r2(clamp(0.3 + changed * 0.004, 0.3, 0.6)),
          pan: clientX === null ? 0 : panFrom(clientX, rootRef.current),
        });
      }
    }
  };

  /** Turns the `text` prop's letters over into a fresh field. */
  const layText = (f: Field) => {
    const word = latest.current.text.trim();
    laidText.current = word;
    if (!word) return;
    const root = rootRef.current;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(f.w));
    c.height = Math.max(1, Math.round(f.h));
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx || !root) return;
    const family = getComputedStyle(root).fontFamily || "sans-serif";
    // Letters need air between them at sequin resolution, or an H and an I
    // run together.
    const spaced = (px: number) => {
      if ("letterSpacing" in ctx)
        ctx.letterSpacing = `${Math.round(px * 0.14)}px`;
    };
    ctx.font = `800 100px ${family}`;
    spaced(100);
    const wide = ctx.measureText(word).width || 1;
    const size = Math.min(f.h * 0.8, ((f.w * 0.9) / wide) * 100);
    ctx.font = `800 ${Math.round(size)}px ${family}`;
    spaced(size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgb(255, 255, 255)";
    ctx.fillText(word, f.w / 2, f.h / 2 + size * 0.04);
    // A stroke round the letters thickens hairline stems (a 1's, an I's)
    // to at least two sequins across.
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(f.size * 0.9, size * 0.06);
    ctx.strokeStyle = "rgb(255, 255, 255)";
    ctx.strokeText(word, f.w / 2, f.h / 2 + size * 0.04);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const inside = (x: number, y: number) => {
      const px = Math.round(x);
      const py = Math.round(y);
      if (px < 0 || py < 0 || px >= c.width || py >= c.height) return 0;
      return (data[(py * c.width + px) * 4 + 3] ?? 0) > 110 ? 1 : 0;
    };
    // A sequin is in a letter when its disc mostly is, not only its centre:
    // five samples across the disc keep thin strokes from breaking up.
    const o = f.size * 0.3;
    for (let i = 0; i < f.n; i += 1) {
      const x = f.cx[i] ?? 0;
      const y = f.cy[i] ?? 0;
      const hits =
        inside(x, y) * 2 +
        inside(x - o, y) +
        inside(x + o, y) +
        inside(x, y - o) +
        inside(x, y + o);
      if (hits >= 3) {
        f.goal[i] = 1;
        f.phi[i] = Math.PI;
      }
    }
  };

  const paint = () => {
    colours.current = readColours();
    const f = field.current;
    if (f) buildAtlas(f);
    draw();
  };

  const layout = (force = false) => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const l = latest.current;
    const d = Math.min(2, Math.max(0.5, l.dpr), window.devicePixelRatio || 1);
    const was = field.current;
    const size = clamp(Math.round(l.sequin), 8, 48);
    if (
      !force &&
      was &&
      was.w === w &&
      was.h === h &&
      was.dpr === d &&
      was.size === size
    )
      return;
    canvas.width = Math.round(w * d);
    canvas.height = Math.round(h * d);
    const px = size * 0.86;
    const py = size * 0.6;
    const cols = Math.ceil(w / px) + 2;
    const rows = Math.ceil(h / py) + 2;
    const n = cols * rows;
    const f: Field = {
      w,
      h,
      dpr: d,
      size,
      px,
      py,
      cols,
      rows,
      x0: (w - (cols - 1) * px) / 2,
      y0: (h - (rows - 1) * py) / 2,
      n,
      cx: new Float32Array(n),
      cy: new Float32Array(n),
      tx: new Float32Array(n),
      ty: new Float32Array(n),
      goal: new Uint8Array(n),
      phi: new Float32Array(n),
      vel: new Float32Array(n),
      axis: new Float32Array(n),
      wait: new Float32Array(n),
      fade: new Float32Array(n).fill(1),
      fadeRate: new Float32Array(n).fill(1 / FADE_STROKE),
      atlas: was?.atlas ?? null,
      cell: 1,
    };
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        f.cx[i] = f.x0 + col * px + (row % 2 ? px / 2 : 0) - px / 4;
        f.cy[i] = f.y0 + row * py;
        f.tx[i] = (hash(col, row, 1) - 0.5) * 0.5;
        f.ty[i] = (hash(col, row, 2) - 0.5) * 0.5;
      }
    }
    // A relaid field keeps what was drawn on it, by position; a fresh one
    // gets the word.
    const keep =
      was && laidText.current === l.text.trim() && flippedCount(was) > 0;
    if (keep && was) {
      for (let i = 0; i < n; i += 1) {
        const col = Math.round(((f.cx[i] ?? 0) - was.x0 + was.px / 4) / was.px);
        const row = Math.round(((f.cy[i] ?? 0) - was.y0) / was.py);
        if (col < 0 || row < 0 || col >= was.cols || row >= was.rows) continue;
        const side = was.goal[row * was.cols + col] ?? 0;
        f.goal[i] = side;
        f.phi[i] = side * Math.PI;
      }
    }
    field.current = f;
    if (!colours.current) colours.current = readColours();
    if (!keep) layText(f);
    buildAtlas(f);
    draw();
    if (!keep) report(f);
  };

  const api = React.useRef({ layout, paint, kick, draw });
  React.useEffect(() => {
    api.current = { layout, paint, kick, draw };
  });

  React.useEffect(() => {
    api.current.layout(true);
  }, [sequin, dpr, text]);

  React.useEffect(() => {
    api.current.paint();
  }, [shine, other, color, fabric]);

  React.useEffect(() => {
    if (motionSafe) return;
    const f = field.current;
    if (!f) return;
    smoothRing.current = null;
    for (let i = 0; i < f.n; i += 1) {
      f.phi[i] = (f.goal[i] ?? 0) * Math.PI;
      f.vel[i] = 0;
      f.wait[i] = 0;
    }
    api.current.draw();
  }, [motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) {
        if (dirty.current) api.current.paint();
        api.current.kick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    const loop = frame;
    const hold = holdTimer;
    return () => {
      if (loop.current) window.cancelAnimationFrame(loop.current);
      loop.current = 0;
      if (hold.current !== null) window.clearTimeout(hold.current);
      hold.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current.layout());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) {
        if (dirty.current) api.current.paint();
        api.current.kick();
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

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

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  /** The light leans toward the pointer, so moving across the field moves the glitter. */
  const leanLight = (x: number, y: number) => {
    const f = field.current;
    if (!f || !latest.current.motionSafe) return;
    lightAt.current = {
      x: clamp(x / f.w - 0.5, -0.8, 0.8) * 0.9,
      y: clamp(y / f.h - 0.5, -0.8, 0.8) * 0.9,
    };
  };

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const press = React.useRef({ x: 0, y: 0, lastX: 0, lastY: 0, clientX: 0 });

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: ({ point }) => {
      clearHold();
      const at = local(point.x, point.y);
      const p = press.current;
      if (!smoothed.current) stroke(p.x, p.y, at.x, at.y, point.x);
      p.lastX = at.x;
      p.lastY = at.y;
    },
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      const p = press.current;
      leanLight(at.x, at.y);
      if (!smoothed.current) stroke(p.lastX, p.lastY, at.x, at.y, point.x);
      else api.current.kick();
      p.lastX = at.x;
      p.lastY = at.y;
      if (!frame.current) draw();
    },
    onEnd: () => {
      clearHold();
      smoothed.current = false;
    },
    onCancel: () => {
      clearHold();
      smoothed.current = false;
    },
    onTap: (event) => {
      clearHold();
      if (smoothed.current) {
        smoothed.current = false;
        return;
      }
      const at = local(event.clientX, event.clientY);
      toggleAt(at.x, at.y, event.clientX);
    },
  });

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    press.current = {
      x: at.x,
      y: at.y,
      lastX: at.x,
      lastY: at.y,
      clientX: event.clientX,
    };
    smoothed.current = false;
    brush.current.hovering = false;
    clearHold();
    const startX = at.x;
    const startY = at.y;
    const clientX = event.clientX;
    holdTimer.current = window.setTimeout(
      () => {
        holdTimer.current = null;
        smoothed.current = true;
        smoothFrom(startX, startY, clientX);
        setSaid((s) => ({ n: s.n + 1, text: "Smoothed." }));
      },
      Math.max(200, latest.current.holdToSmooth),
    );
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (disabled) return;
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    const at = local(event.clientX, event.clientY);
    const b = brush.current;
    leanLight(at.x, at.y);
    if (latest.current.brushOn === "hover" && b.hovering) {
      stroke(b.hx, b.hy, at.x, at.y, event.clientX);
    }
    b.hx = at.x;
    b.hy = at.y;
    b.hovering = true;
    if (!frame.current) api.current.kick();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    clearHold();
    drag.onPointerUp(event);
    if (event.pointerType === "mouse") {
      const at = local(event.clientX, event.clientY);
      brush.current.hx = at.x;
      brush.current.hy = at.y;
      brush.current.hovering = true;
    }
  };

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const sayCount = () => {
    const f = field.current;
    if (!f) return;
    const n = flippedCount(f);
    say(`${n} of ${f.n} flipped.`);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const f = field.current;
    if (!f) return;
    const b = brush.current;
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      smoothFrom(b.present ? b.x : f.w / 2, b.present ? b.y : f.h / 2, null);
      say("Smoothed.");
      return;
    }
    const step = f.size;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const fromX = b.present ? b.x : f.w / 2;
    const fromY = b.present ? b.y : f.h / 2;
    const toX = clamp(fromX + move[0], 0, f.w);
    const toY = clamp(fromY + move[1], 0, f.h);
    b.x = toX;
    b.y = toY;
    b.present = true;
    b.ring = true;
    b.source = "key";
    const changed = event.shiftKey ? 0 : stroke(fromX, fromY, toX, toY, null);
    if (changed > 0) sayCount();
    api.current.kick();
    if (!frame.current) draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={(event) => {
        clearHold();
        drag.onPointerCancel(event);
      }}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") brush.current.hovering = false;
      }}
      className={cn(
        "group/flip-sequins relative isolate h-full w-full overflow-clip rounded-3 [contain:paint] select-none",
        disabled ? "touch-auto opacity-70" : "touch-none",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        onTransitionEnd={onColors}
        className="pointer-events-none absolute inset-0 size-full transition-colors duration-1"
        style={{
          color,
          borderTopColor: other,
          borderRightColor: fabric,
          borderBottomColor: "var(--ring)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-painted/flip-sequins:hidden"
        style={{
          backgroundColor: fabric,
          backgroundImage: `radial-gradient(circle at 40% 36%, color-mix(in oklab, ${color} 70%, white) 0, ${color} ${Math.round(sequin * 0.3)}px, color-mix(in oklab, ${color} 70%, black) ${Math.round(sequin * 0.48)}px, transparent ${Math.round(sequin * 0.5)}px)`,
          backgroundSize: `${r2(sequin * 0.86)}px ${r2(sequin * 1.2)}px`,
        }}
      />
      <button
        type="button"
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const f = field.current;
          if (!f || disabled || !event.currentTarget.matches(":focus-visible"))
            return;
          const b = brush.current;
          if (!b.present) {
            b.x = f.w / 2;
            b.y = f.h / 2;
          }
          b.present = true;
          b.ring = true;
          b.source = "key";
          draw();
        }}
        onBlur={() => {
          const b = brush.current;
          if (b.source !== "key") return;
          b.present = false;
          b.ring = false;
          b.source = null;
          draw();
        }}
        onClick={(event) => {
          // Pointer presses arrive through the field's own handlers; a click
          // with no pointer behind it is Enter, Space or assistive tech.
          if (event.detail !== 0 || disabled) return;
          const f = field.current;
          if (!f) return;
          const b = brush.current;
          if (!b.present) {
            b.x = f.w / 2;
            b.y = f.h / 2;
            b.present = true;
            b.ring = true;
            b.source = "key";
          }
          toggleAt(b.x, b.y, null);
          sayCount();
          if (!frame.current) draw();
        }}
        className={cn(
          "absolute inset-0 size-full rounded-[inherit] outline-none disabled:cursor-not-allowed",
          brushOn === "hover" ? "cursor-crosshair" : "cursor-pointer",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <p id={hintId} className="sr-only">
        {`Brush ${ways.over} to turn sequins over, ${ways.home} to smooth them home. Hold still to smooth the whole panel. Arrow keys brush, Shift with an arrow lifts the brush, Enter or Space turns the sequins under it, Backspace smooths the panel.`}
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
