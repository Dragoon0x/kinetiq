"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CometBorderTone = "cobalt" | "mint" | "amber" | "ink";
export type CometBorderDirection = "clockwise" | "counterclockwise";

export type CometBorderProps = {
  /** What the frame holds. It keeps every click, focus and key. */
  children?: React.ReactNode;
  /** The comet's pace along the border, in px per second. @default 140 */
  speed?: number;
  /** The tail's length, in px (never more than 45% of the frame). @default 160 */
  tail?: number;
  /** Its colour: a named token, or any CSS colour. @default "cobalt" */
  color?: CometBorderTone | (string & {});
  /** The head's thickness, in px. @default 2 */
  width?: number;
  /** How far its halo spreads and how bright, 0 to 1. @default 0.6 */
  glow?: number;
  /** How long the border stays lit after the comet passes, in ms; 0 leaves no trace. @default 1400 */
  afterglow?: number;
  /** How much faster it runs while the frame is hovered or holds focus, 1 to 5. @default 2.4 */
  hoverSpeed?: number;
  /** A second comet running the other way: always, never, or lit by hover and focus. @default "hover" */
  twin?: boolean | "hover";
  /** Which way round the frame it travels. @default "clockwise" */
  direction?: CometBorderDirection;
  /** Where it sets off (and rests under reduced motion), 0 to 1 round the frame from the top-left corner. @default 0.12 */
  start?: number;
  /** Hold the comet where it is and stop the frame loop. @default false */
  paused?: boolean;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires each time the comet completes a lap, with the count so far. */
  onLap?: (laps: number) => void;
  /** Fires when the twin and the comet cross and the border flares. */
  onCross?: () => void;
  /** Classes for the frame. It draws its own rounded hairline; any rounded-* and border-* class sets the path. */
  className?: string;
};

const TONES: Record<CometBorderTone, string> = {
  cobalt: "var(--accent-bright)",
  mint: "var(--signal)",
  amber: "var(--warn)",
  ink: "var(--ink)",
};

/** Perimeter samples per px of border. */
const STEP = 2;
/** Afterglow memory cells, each this many px of border. */
const CELL = 4;
const LEVELS = 8;
const FLARE_LIFE = 0.5;

type Rgb = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** One semi-implicit spring step toward `target`; returns the new velocity. */
function springStep(
  pos: number,
  vel: number,
  target: number,
  spring: { stiffness: number; damping: number; mass: number },
  dt: number,
): number {
  return (
    vel +
    ((spring.stiffness * (target - pos) - spring.damping * vel) / spring.mass) *
      dt
  );
}

/**
 * The border's centreline as a table of points every STEP px of arc length,
 * clockwise from the top-left corner's end, with each point's inward normal,
 * so a comet moves at an even pace straight through the corners.
 */
function buildPath(
  w: number,
  h: number,
  inset: number,
  radii: [number, number, number, number],
) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const lim = Math.max(0, Math.min(x1 - x0, y1 - y0) / 2);
  const [tl, tr, br, bl] = radii.map((r) => clamp(r - inset, 0, lim)) as [
    number,
    number,
    number,
    number,
  ];
  type Seg =
    | {
        kind: "line";
        ax: number;
        ay: number;
        bx: number;
        by: number;
        len: number;
      }
    | {
        kind: "arc";
        cx: number;
        cy: number;
        r: number;
        a0: number;
        len: number;
      };
  const segs: Seg[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) =>
    segs.push({
      kind: "line",
      ax,
      ay,
      bx,
      by,
      len: Math.hypot(bx - ax, by - ay),
    });
  const arc = (cx: number, cy: number, r: number, a0: number) =>
    segs.push({ kind: "arc", cx, cy, r, a0, len: (r * Math.PI) / 2 });
  line(x0 + tl, y0, x1 - tr, y0);
  arc(x1 - tr, y0 + tr, tr, -Math.PI / 2);
  line(x1, y0 + tr, x1, y1 - br);
  arc(x1 - br, y1 - br, br, 0);
  line(x1 - br, y1, x0 + bl, y1);
  arc(x0 + bl, y1 - bl, bl, Math.PI / 2);
  line(x0, y1 - bl, x0, y0 + tl);
  arc(x0 + tl, y0 + tl, tl, Math.PI);
  const total = segs.reduce((sum, s) => sum + s.len, 0);
  const count = Math.max(8, Math.ceil(total / STEP));
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const nx = new Float32Array(count);
  const ny = new Float32Array(count);
  const cx = w / 2;
  const cy = h / 2;
  let seg = 0;
  let segStart = 0;
  for (let i = 0; i < count; i += 1) {
    const s = (i / count) * total;
    while (seg < segs.length - 1 && s > segStart + (segs[seg]?.len ?? 0)) {
      segStart += segs[seg]?.len ?? 0;
      seg += 1;
    }
    const g = segs[seg];
    if (!g) continue;
    const u = g.len > 0 ? clamp((s - segStart) / g.len, 0, 1) : 0;
    let x: number;
    let y: number;
    if (g.kind === "line") {
      x = g.ax + (g.bx - g.ax) * u;
      y = g.ay + (g.by - g.ay) * u;
      // Inward is toward the frame's middle, square to the edge.
      const tx = g.bx - g.ax;
      const ty = g.by - g.ay;
      const tl2 = Math.hypot(tx, ty) || 1;
      const flip = (ty / tl2) * (cx - x) + (-tx / tl2) * (cy - y) < 0 ? -1 : 1;
      nx[i] = (flip * ty) / tl2;
      ny[i] = (-flip * tx) / tl2;
    } else {
      const a = g.a0 + (u * Math.PI) / 2;
      x = g.cx + Math.cos(a) * g.r;
      y = g.cy + Math.sin(a) * g.r;
      nx[i] = -Math.cos(a);
      ny[i] = -Math.sin(a);
    }
    xs[i] = x;
    ys[i] = y;
  }
  return { total, count, xs, ys, nx, ny };
}

type Path = ReturnType<typeof buildPath>;

/**
 * A frame for any children with a comet travelling its border: a bright head
 * and a tail that tapers in width and light behind it, drawn on a Canvas 2D
 * layer along the border's own centreline — read from the computed border
 * width and all four corner radii and sampled by arc length, so the pace is
 * even through the corners. The border just ahead of the head brightens as it
 * comes, and the border behind keeps a faint afterglow that fades over
 * `afterglow` ms.
 *
 * Hover, or focus anywhere inside, speeds the comet up by `hoverSpeed` on the
 * glide constants and lets it coast back down on drift. With `twin` a second
 * comet ignites at the opposite point and runs the other way, its tail
 * growing as it travels, and where the two heads cross the border flares.
 * The canvas never takes a pointer; the children keep their own focus order
 * and rings. Under reduced motion the comet rests at `start` with its tail
 * and a soft afterglow, and hover or focus brightens the frame instead.
 */
export function CometBorder({
  children,
  speed = 140,
  tail = 160,
  color = "cobalt",
  width = 2,
  glow = 0.6,
  afterglow = 1400,
  hoverSpeed = 2.4,
  twin = "hover",
  direction = "clockwise",
  start = 0.12,
  paused = false,
  dpr = 2,
  onLap,
  onCross,
  className,
}: CometBorderProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const api = React.useRef<{ recolour: () => void; wake: () => void } | null>(
    null,
  );

  const tone =
    typeof color === "string" && color in TONES
      ? TONES[color as CometBorderTone]
      : color;

  const params = React.useRef({
    speed,
    tail,
    tone,
    width,
    glow,
    afterglow,
    hoverSpeed,
    twin,
    direction,
    start,
    paused,
    dpr,
    motionSafe,
    onLap,
    onCross,
  });
  React.useEffect(() => {
    params.current = {
      speed,
      tail,
      tone,
      width,
      glow,
      afterglow,
      hoverSpeed,
      twin,
      direction,
      start,
      paused,
      dpr,
      motionSafe,
      onLap,
      onCross,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let path: Path | null = null;
    let glowCells = new Float32Array(1);
    let w = 0;
    let h = 0;
    let scale = 1;
    let bw = 1;
    let raf = 0;
    let last = 0;
    let inView = true;
    let laps = 0;
    let lift = 0;
    let liftGoal = 0;
    // The head's arc position, and the twin's.
    let head = -1;
    const twinState = { s: 0, alpha: 0, lit: false, travelled: 0 };
    const boost = { m: 1, v: 0 };
    const flare = { x: 0, y: 0, age: FLARE_LIFE };
    let hovered = false;
    let focused = false;
    let lastGap = -1;

    let colour = "rgb(80, 110, 230)";
    let core = "rgb(240, 244, 255)";
    let dark = true;
    const sprite = document.createElement("canvas");
    sprite.width = 64;
    sprite.height = 64;
    const spriteCtx = sprite.getContext("2d");

    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const rgba = (css: string): [number, number, number, number] => {
      const probe = probeRef.current;
      if (!probe || !reader) return [0.4, 0.5, 0.9, 1];
      probe.style.color = css;
      reader.clearRect(0, 0, 1, 1);
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = getComputedStyle(probe).color;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return [
        (d[0] ?? 128) / 255,
        (d[1] ?? 128) / 255,
        (d[2] ?? 128) / 255,
        (d[3] ?? 255) / 255,
      ];
    };
    const css = (c: Rgb) =>
      `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
    const recolour = () => {
      const c = rgba(params.current.tone);
      const rgb: Rgb = [c[0], c[1], c[2]];
      // Night or paper: the first opaque background behind the frame.
      let node: HTMLElement | null = root;
      let paper = [0, 0, 0, 1];
      while (node) {
        const v = rgba(getComputedStyle(node).backgroundColor);
        if (v[3] > 0.5) {
          paper = v;
          break;
        }
        node = node.parentElement;
      }
      dark =
        0.2126 * (paper[0] ?? 0) +
          0.7152 * (paper[1] ?? 0) +
          0.0722 * (paper[2] ?? 0) <
        0.5;
      colour = css(rgb);
      // A hot white core at night; on paper the colour itself is the brightest
      // thing the head can be.
      core = dark
        ? css([
            rgb[0] + (1 - rgb[0]) * 0.65,
            rgb[1] + (1 - rgb[1]) * 0.65,
            rgb[2] + (1 - rgb[2]) * 0.65,
          ])
        : css(rgb);
      if (spriteCtx) {
        spriteCtx.clearRect(0, 0, 64, 64);
        const g = spriteCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
        // A tight bright centre and a long soft shoulder, so the halo reads
        // as light rather than as a disc.
        g.addColorStop(0, colour);
        g.addColorStop(
          0.22,
          colour.replace("rgb(", "rgba(").replace(")", ", 0.45)"),
        );
        g.addColorStop(1, colour.replace("rgb(", "rgba(").replace(")", ", 0)"));
        spriteCtx.globalAlpha = 1;
        spriteCtx.fillStyle = g;
        spriteCtx.fillRect(0, 0, 64, 64);
      }
    };

    const pointAt = (
      s: number,
      out: { x: number; y: number; nx: number; ny: number },
    ) => {
      if (!path) return out;
      const p = path;
      const f = ((((s % p.total) + p.total) % p.total) / p.total) * p.count;
      const i = Math.floor(f) % p.count;
      const j = (i + 1) % p.count;
      const u = f - Math.floor(f);
      out.x = (p.xs[i] ?? 0) + ((p.xs[j] ?? 0) - (p.xs[i] ?? 0)) * u;
      out.y = (p.ys[i] ?? 0) + ((p.ys[j] ?? 0) - (p.ys[i] ?? 0)) * u;
      out.nx = (p.nx[i] ?? 0) + ((p.nx[j] ?? 0) - (p.nx[i] ?? 0)) * u;
      out.ny = (p.ny[i] ?? 0) + ((p.ny[j] ?? 0) - (p.ny[i] ?? 0)) * u;
      return out;
    };
    const a = { x: 0, y: 0, nx: 0, ny: 0 };
    const b = { x: 0, y: 0, nx: 0, ny: 0 };

    const measure = () => {
      const cs = getComputedStyle(root);
      bw = parseFloat(cs.borderTopWidth) || 0;
      const p = params.current;
      w = root.offsetWidth;
      h = root.offsetHeight;
      if (w < 2 || h < 2) return false;
      const radii: [number, number, number, number] = [
        parseFloat(cs.borderTopLeftRadius) || 0,
        parseFloat(cs.borderTopRightRadius) || 0,
        parseFloat(cs.borderBottomRightRadius) || 0,
        parseFloat(cs.borderBottomLeftRadius) || 0,
      ];
      // The comet runs on the border's centreline, but never so close to the
      // edge that half its core is cut off.
      const inset = Math.max(bw / 2, Math.max(1, p.width) / 2 + 0.5);
      path = buildPath(w, h, inset, radii);
      const cells = Math.max(1, Math.ceil(path.total / CELL));
      if (glowCells.length !== cells) glowCells = new Float32Array(cells);
      const holder = canvas.parentElement;
      if (holder) holder.style.inset = `${-bw}px`;
      scale = Math.min(window.devicePixelRatio || 1, clamp(p.dpr, 0.5, 2));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
      }
      if (head < 0) head = clamp(p.start, 0, 1) * path.total;
      return true;
    };

    const lit = () => {
      const p = params.current;
      return p.twin === true || (p.twin === "hover" && (hovered || focused));
    };

    /** Light the cells the head swept over this frame. */
    const sweep = (from: number, to: number) => {
      if (!path) return;
      const n = glowCells.length;
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      const first = Math.floor(lo / CELL);
      const end = Math.ceil(hi / CELL);
      for (let k = first; k <= end && k - first <= n; k += 1) {
        glowCells[((k % n) + n) % n] = 1;
      }
    };

    /** A strip along the border: the tail's glow or its core. */
    const strip = (
      s0: number,
      length: number,
      dir: number,
      thick: number,
      alpha: number,
      fade: number,
    ) => {
      const segs = clamp(Math.round(length / 4), 6, 90);
      for (let j = 0; j < segs; j += 1) {
        const u0 = j / segs;
        const u1 = (j + 1) / segs;
        pointAt(s0 - dir * u0 * length, a);
        pointAt(s0 - dir * u1 * length, b);
        const w0 = (thick * Math.pow(1 - u0, 0.9)) / 2 + 0.15;
        const w1 = (thick * Math.pow(1 - u1, 0.9)) / 2 + 0.15;
        ctx.globalAlpha = clamp(alpha * Math.pow(1 - u0, fade), 0, 1);
        ctx.beginPath();
        ctx.moveTo(a.x + a.nx * w0, a.y + a.ny * w0);
        ctx.lineTo(b.x + b.nx * w1, b.y + b.ny * w1);
        ctx.lineTo(b.x - b.nx * w1, b.y - b.ny * w1);
        ctx.lineTo(a.x - a.nx * w0, a.y - a.ny * w0);
        ctx.closePath();
        ctx.fill();
      }
    };

    const drawComet = (
      s: number,
      dir: number,
      length: number,
      alpha: number,
    ) => {
      const p = params.current;
      const g = clamp(p.glow, 0, 1);
      const thick = Math.max(0.5, p.width);
      ctx.fillStyle = colour;
      // Light on paper is a tint, not a glow: the halo is quieter there.
      const shine = dark ? 1 : 0.45;
      strip(
        s,
        length,
        dir,
        thick * (3 + 6 * g),
        alpha * 0.14 * (0.4 + g) * shine,
        1.4,
      );
      strip(s, length, dir, thick, alpha, 1.6);
      pointAt(s, a);
      const halo = (4 + 9 * g) * (1 + 0.25 * lift);
      ctx.globalAlpha = clamp(alpha * (0.5 + 0.4 * g) * shine, 0, 1);
      ctx.drawImage(sprite, a.x - halo, a.y - halo, halo * 2, halo * 2);
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(a.x, a.y, thick * 0.75, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = () => {
      if (!path) return;
      const p = params.current;
      const total = path.total;
      const dir = p.direction === "counterclockwise" ? -1 : 1;
      const length = Math.min(Math.max(8, p.tail), total * 0.45);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, w, h);
      // The border's memory: afterglow cells, plus the stretch just ahead of
      // the head that it lights as it comes. Batched into a few alpha levels
      // so a long frame is still a handful of strokes.
      ctx.strokeStyle = colour;
      ctx.lineWidth = Math.max(1, bw) + 0.5;
      ctx.lineCap = "round";
      const n = glowCells.length;
      const ahead = 36;
      for (let level = 1; level <= LEVELS; level += 1) {
        const lo = (level - 0.5) / LEVELS;
        const hi = (level + 0.5) / LEVELS;
        let any = false;
        ctx.beginPath();
        for (let k = 0; k < n; k += 1) {
          const sMid = (k + 0.5) * CELL;
          let ds = (sMid - head) * dir;
          ds = ((ds % total) + total) % total;
          const near = ds < ahead ? Math.exp(-((ds / (ahead * 0.5)) ** 2)) : 0;
          const v =
            Math.max((glowCells[k] ?? 0) * 0.55, near * 0.6) * (1 + 0.4 * lift);
          if (v < lo || v >= hi) continue;
          pointAt(k * CELL, a);
          pointAt((k + 1) * CELL, b);
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          any = true;
        }
        if (any) {
          ctx.globalAlpha = (level / LEVELS) * 0.9;
          ctx.stroke();
        }
      }
      if (twinState.alpha > 0.01) {
        drawComet(
          twinState.s,
          -dir,
          Math.min(length, twinState.travelled),
          twinState.alpha,
        );
      }
      drawComet(head, dir, length, 1);
      if (flare.age < FLARE_LIFE) {
        const t = flare.age;
        const swell = (1 - Math.exp(-t / 0.05)) * Math.exp(-t / 0.16);
        const r = (10 + 22 * clamp(p.glow, 0, 1)) * (0.6 + swell);
        ctx.globalAlpha = clamp(swell * 1.6 * (dark ? 1 : 0.6), 0, 1);
        ctx.drawImage(sprite, flare.x - r, flare.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    };

    /** Reduced motion: one designed frame, with its afterglow laid behind. */
    const still = () => {
      if (!path) return;
      const p = params.current;
      const total = path.total;
      const dir = p.direction === "counterclockwise" ? -1 : 1;
      head = clamp(p.start, 0, 1) * total;
      const length = Math.min(Math.max(8, p.tail), total * 0.45);
      const n = glowCells.length;
      for (let k = 0; k < n; k += 1) {
        let behind = (head - (k + 0.5) * CELL) * dir;
        behind = ((behind % total) + total) % total;
        glowCells[k] =
          behind < length * 2.5 ? Math.exp(-behind / (length * 1.2)) : 0;
      }
      twinState.s = head + total / 2;
      twinState.travelled = length;
      twinState.alpha = lit() ? 1 : 0;
      flare.age = FLARE_LIFE;
      draw();
    };

    const step = (dt: number) => {
      if (!path) return;
      const p = params.current;
      const total = path.total;
      const dir = p.direction === "counterclockwise" ? -1 : 1;
      const want = hovered || focused ? clamp(p.hoverSpeed, 1, 5) : 1;
      // Speeding up on the glide constants, easing back down on drift.
      boost.v = springStep(
        boost.m,
        boost.v,
        want,
        want > boost.m ? springs.glide : springs.drift,
        dt,
      );
      boost.m = Math.max(0.2, boost.m + boost.v * dt);
      const move = Math.max(0, p.speed) * boost.m * dt;
      const before = head;
      head += dir * move;
      sweep(before, head);
      if (head >= total || head < 0) {
        head = ((head % total) + total) % total;
        laps += 1;
        p.onLap?.(laps);
      }
      // The twin: ignites opposite the head, runs the other way, burns out.
      const on = lit();
      if (on && !twinState.lit) {
        twinState.s = head + total / 2;
        twinState.travelled = 0;
        lastGap = -1;
      }
      twinState.lit = on;
      const goal = on ? 1 : 0;
      twinState.alpha +=
        (goal - twinState.alpha) * (1 - Math.exp(-dt / (on ? 0.12 : 0.22)));
      if (twinState.alpha > 0.01) {
        const tb = twinState.s;
        twinState.s -= dir * move;
        twinState.travelled += move;
        sweep(tb, twinState.s);
        twinState.s = ((twinState.s % total) + total) % total;
        // Where the two heads meet, the border flares.
        let gap = (twinState.s - head) * dir;
        gap = ((gap % total) + total) % total;
        if (
          lastGap >= 0 &&
          gap > lastGap + total / 2 &&
          twinState.alpha > 0.5
        ) {
          pointAt(head, a);
          flare.x = a.x;
          flare.y = a.y;
          flare.age = 0;
          p.onCross?.();
        }
        lastGap = gap;
      } else {
        lastGap = -1;
      }
      flare.age += dt;
      const keep = p.afterglow > 0 ? Math.exp(-dt / (p.afterglow / 1000)) : 0;
      for (let k = 0; k < glowCells.length; k += 1) {
        glowCells[k] = (glowCells[k] ?? 0) * keep;
      }
      lift += (liftGoal - lift) * (1 - Math.exp(-dt / 0.1));
    };

    const canRun = () => inView && !document.hidden && !!path;
    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const p = params.current;
      if (p.motionSafe) {
        if (!p.paused) step(dt);
        draw();
        if (canRun() && !p.paused) raf = requestAnimationFrame(tick);
        return;
      }
      // Reduced motion: only the brightness eases (a tween, not travel).
      lift += (liftGoal - lift) * (1 - Math.exp(-dt / (durations.fast / 3)));
      if (Math.abs(liftGoal - lift) < 0.01) lift = liftGoal;
      still();
      if (canRun() && lift !== liftGoal) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (raf) return;
      if (!canRun()) {
        if (path) draw();
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const setHover = (on: boolean) => {
      hovered = on;
      liftGoal = hovered || focused ? 1 : 0;
      wake();
    };
    const onEnter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      setHover(true);
    };
    const onLeave = () => setHover(false);
    const onFocusIn = (event: FocusEvent) => {
      // Keyboard focus counts as hover; a click that focuses a button does not.
      const el = event.target;
      focused = el instanceof Element && el.matches(":focus-visible");
      liftGoal = hovered || focused ? 1 : 0;
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      focused = false;
      liftGoal = hovered ? 1 : 0;
      wake();
    };

    root.addEventListener("pointerenter", onEnter);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(() => {
      if (measure()) {
        if (params.current.motionSafe) draw();
        else still();
      }
      wake();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    recolour();
    if (measure()) {
      if (params.current.motionSafe) draw();
      else still();
    }
    api.current = {
      recolour: () => {
        recolour();
        if (!raf) {
          if (params.current.motionSafe) draw();
          else still();
        }
      },
      wake: () => {
        if (measure() && !raf) {
          if (params.current.motionSafe) draw();
          else still();
        }
        wake();
      },
    };

    return () => {
      halt();
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      root.removeEventListener("pointerenter", onEnter);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      api.current = null;
    };
  }, []);

  React.useEffect(() => {
    api.current?.recolour();
  }, [tone]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    speed,
    tail,
    width,
    glow,
    afterglow,
    hoverSpeed,
    twin,
    direction,
    start,
    paused,
    dpr,
    motionSafe,
  ]);

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate rounded-3 border border-hairline",
        className,
      )}
    >
      {children}
      {/* Over the border box itself (its inset is set to the border width),
          clipped to the frame's own corners. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px z-10 overflow-clip rounded-[inherit]"
      >
        <canvas ref={canvasRef} className="block size-full" />
      </div>
      {/* Colours are resolved on this probe, inside the component, so a
          themed wrapper's tokens are the ones read. */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.recolour()}
        className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
      />
    </div>
  );
}
