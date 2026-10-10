"use client";

import * as React from "react";

import { animate, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ArcBorderColor = "cobalt" | "signal" | "ember" | "rose";

export type ArcBorderProps = {
  /** What the frame goes around. Fully interactive; the current never takes a click. */
  children?: React.ReactNode;
  /** The current's colour: a preset, or any CSS colour (tokens resolve on the element, so they follow the theme). @default "cobalt" */
  color?: ArcBorderColor | (string & {});
  /** The hot core down the middle of the arc. @default the colour mixed toward white */
  coreColor?: string;
  /** How far the edge jags, 0 (a nearly smooth live wire) to 1 (a ragged storm). @default 0.5 */
  jitter?: number;
  /** Width of the arc, px; the core is 40% of it. @default 1.5 */
  thickness?: number;
  /** How far the soft glow spreads, 0 to 1. @default 0.6 */
  glow?: number;
  /** Corner radius of the frame and the content box, px. @default 16 */
  radius?: number;
  /** How many times a second the arc re-strikes into a new shape at rest. @default 10 */
  rate?: number;
  /** How often a bright jump leaps across a corner, 0 (never) to 1 (often). @default 0.5 */
  jumps?: number;
  /** How far hover and focus inside lift the current, 0 to 1. @default 0.7 */
  surge?: number;
  /** Hold the frame charged, as if hovered. @default false */
  charged?: boolean;
  /** "always" crackles whenever it is on screen; "hover" rests as one still strike until a visitor arrives. @default "always" */
  live?: "always" | "hover";
  /** Hold the current still. @default false */
  paused?: boolean;
  /** Seed for the arc's shapes, so two frames on a page differ. @default 3 */
  seed?: number;
  /** Highest device pixel ratio the canvas renders at (capped at 2). @default 2 */
  dpr?: number;
  /** The frame charged or settled, from the hover or focus that caused it. */
  onChargeChange?: (charged: boolean) => void;
  /** Classes for the outer box (the frame's gutter is its padding). */
  className?: string;
  /** Classes for the content box inside the frame — its surface and padding. */
  contentClassName?: string;
};

const PRESETS: Record<ArcBorderColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ember: "var(--warn)",
  rose: "var(--danger)",
};

type Rgb = [number, number, number];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sample spacing along the frame, px. */
const STEP = 5;
/** Anchors of the coarse jag, in samples. */
const ANCHOR = 6;
/** Points in a corner jump bolt. */
const BOLT = 10;
/** How long a corner jump lives, ms. */
const JUMP_LIFE = 180;

/** A small seeded generator; its state is a number, so nothing allocates. */
function rand(state: { s: number }): number {
  state.s = (state.s + 0x6d2b79f5) | 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** How far the arc and its glow reach past the frame line, so the gutter holds them. */
function reachOf(
  jitter: number,
  thickness: number,
  glow: number,
  surge: number,
) {
  const amp = (1.5 + 5 * clamp01(jitter)) * (0.75 + 0.6 * clamp01(surge));
  const halo = (4 + 10 * clamp01(glow) * (0.6 + 0.8 * clamp01(surge))) * 0.8;
  return Math.ceil(amp + Math.max(0.5, thickness) + halo);
}

type Frame = {
  n: number;
  r: number;
  bx: Float32Array;
  by: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  main: Float32Array;
  ghost: Float32Array;
  anchors: Float32Array;
  /** Each corner's centre and its arc's start and end angles, clockwise. */
  corners: [number, number, number, number][];
};

/**
 * Samples the rounded rectangle every ~5 px with its outward normals. The
 * arrays are sized here, on resize, and reused for every strike.
 */
function buildFrame(
  x0: number,
  y0: number,
  w: number,
  h: number,
  radius: number,
): Frame {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const sw = Math.max(0, w - 2 * r);
  const sh = Math.max(0, h - 2 * r);
  const arc = (Math.PI / 2) * r;
  const total = 2 * sw + 2 * sh + 4 * arc;
  const n = Math.max(8, Math.ceil(total / STEP));
  const f: Frame = {
    n,
    r,
    bx: new Float32Array(n),
    by: new Float32Array(n),
    nx: new Float32Array(n),
    ny: new Float32Array(n),
    main: new Float32Array(n),
    ghost: new Float32Array(n),
    anchors: new Float32Array(Math.ceil(n / ANCHOR) + 1),
    corners: [
      [x0 + w - r, y0 + r, -Math.PI / 2, 0],
      [x0 + w - r, y0 + h - r, 0, Math.PI / 2],
      [x0 + r, y0 + h - r, Math.PI / 2, Math.PI],
      [x0 + r, y0 + r, Math.PI, (Math.PI * 3) / 2],
    ],
  };
  // Pieces in order, clockwise from the top-left end of the top edge.
  const pieces: (
    | {
        kind: "line";
        x: number;
        y: number;
        dx: number;
        dy: number;
        len: number;
        nx: number;
        ny: number;
      }
    | { kind: "arc"; cx: number; cy: number; a0: number; len: number }
  )[] = [
    { kind: "line", x: x0 + r, y: y0, dx: 1, dy: 0, len: sw, nx: 0, ny: -1 },
    { kind: "arc", cx: x0 + w - r, cy: y0 + r, a0: -Math.PI / 2, len: arc },
    { kind: "line", x: x0 + w, y: y0 + r, dx: 0, dy: 1, len: sh, nx: 1, ny: 0 },
    { kind: "arc", cx: x0 + w - r, cy: y0 + h - r, a0: 0, len: arc },
    {
      kind: "line",
      x: x0 + w - r,
      y: y0 + h,
      dx: -1,
      dy: 0,
      len: sw,
      nx: 0,
      ny: 1,
    },
    { kind: "arc", cx: x0 + r, cy: y0 + h - r, a0: Math.PI / 2, len: arc },
    {
      kind: "line",
      x: x0,
      y: y0 + h - r,
      dx: 0,
      dy: -1,
      len: sh,
      nx: -1,
      ny: 0,
    },
    { kind: "arc", cx: x0 + r, cy: y0 + r, a0: Math.PI, len: arc },
  ];
  for (let i = 0; i < n; i += 1) {
    let s = (i / n) * total;
    for (const piece of pieces) {
      if (s > piece.len && piece !== pieces[pieces.length - 1]) {
        s -= piece.len;
        continue;
      }
      if (piece.kind === "line") {
        f.bx[i] = piece.x + piece.dx * s;
        f.by[i] = piece.y + piece.dy * s;
        f.nx[i] = piece.nx;
        f.ny[i] = piece.ny;
      } else {
        const a = piece.a0 + (r > 0 ? s / r : 0);
        f.bx[i] = piece.cx + Math.cos(a) * r;
        f.by[i] = piece.cy + Math.sin(a) * r;
        f.nx[i] = Math.cos(a);
        f.ny[i] = Math.sin(a);
      }
      break;
    }
  }
  return f;
}

/**
 * One strike: coarse anchors every six samples, joined straight and
 * roughened with a finer jag on top — lightning, not a wave. The loop is
 * closed, so the last anchor wraps to the first.
 */
function strike(f: Frame, out: Float32Array, state: { s: number }) {
  const m = f.anchors.length - 1;
  for (let j = 0; j < m; j += 1) f.anchors[j] = rand(state) * 2 - 1;
  f.anchors[m] = f.anchors[0] ?? 0;
  for (let i = 0; i < f.n; i += 1) {
    const j = Math.floor(i / ANCHOR);
    const t = (i % ANCHOR) / ANCHOR;
    const coarse = lerp(f.anchors[j] ?? 0, f.anchors[j + 1] ?? 0, t);
    out[i] = coarse * 0.75 + (rand(state) * 2 - 1) * 0.35;
  }
}

/** Reads any CSS colour as sRGB bytes through a 1×1 canvas. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [120, 140, 255];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

/**
 * An electric frame around any children. A canvas over the box draws a
 * jagged current that hugs the content's rounded rectangle: the frame is
 * sampled every ~5 px with its outward normals, and every re-strike rebuilds
 * the displacements from seeded coarse anchors plus a finer jag, so the arc
 * re-forms rather than flows. Each strike is drawn as a faint ghost strand,
 * a glow pass, the coloured arc with a shadow halo, and a hot core. On a
 * seeded schedule a bright bolt jumps across a corner and dies in 180 ms.
 * Under it all a faint steady rail marks the track — and is what the
 * server renders.
 *
 * Hover or focus inside charges the frame on the snap spring (the jag
 * deepens, the glow swells, it strikes faster and jumps more) and lets it
 * settle on the drift spring. The children are untouched and interactive.
 * Reduced motion: one still strike, no jumps; hover and focus still
 * brighten it. The loop runs only on screen, in a visible tab, and — with
 * `live="hover"` — while charged.
 */
export function ArcBorder({
  children,
  color = "cobalt",
  coreColor,
  jitter = 0.5,
  thickness = 1.5,
  glow = 0.6,
  radius = 16,
  rate = 10,
  jumps = 0.5,
  surge = 0.7,
  charged = false,
  live = "always",
  paused = false,
  seed = 3,
  dpr = 2,
  onChargeChange,
  className,
  contentClassName,
}: ArcBorderProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const charge = useMotionValue(charged ? 1 : 0);
  const visitor = React.useRef({ hover: false, focus: false, lit: charged });
  const api = React.useRef<{ repaint: () => void; wake: () => void } | null>(
    null,
  );

  const paint = (PRESETS as Record<string, string>)[color] ?? color;
  const gutter = reachOf(jitter, thickness, glow, surge);
  const params = React.useRef({
    paint,
    coreColor,
    jitter,
    thickness,
    glow,
    radius,
    rate,
    jumps,
    surge,
    live,
    paused,
    seed,
    dpr,
    gutter,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      paint,
      coreColor,
      jitter,
      thickness,
      glow,
      radius,
      rate,
      jumps,
      surge,
      live,
      paused,
      seed,
      dpr,
      gutter,
      motionSafe,
    };
  });
  // A change to anything the strike is built from repaints it once; the
  // loop (if live) carries on from there.
  const signature = [
    paint,
    coreColor,
    jitter,
    thickness,
    glow,
    radius,
    rate,
    jumps,
    surge,
    live,
    paused,
    seed,
    dpr,
    gutter,
    motionSafe,
  ].join("|");
  React.useEffect(() => {
    api.current?.repaint();
  }, [signature]);

  const changeRef = React.useRef(onChargeChange);
  React.useEffect(() => {
    changeRef.current = onChargeChange;
  });

  // Charge rises like a switch (snap) and lets go slowly (drift): the hum
  // lingers a moment after the visitor leaves.
  const recharge = React.useCallback(() => {
    const v = visitor.current;
    const next = v.hover || v.focus || charged;
    if (next !== v.lit) {
      v.lit = next;
      changeRef.current?.(next);
    }
    if (!params.current.motionSafe) {
      charge.jump(next ? 1 : 0);
    } else {
      animate(charge, next ? 1 : 0, next ? springs.snap : springs.drift);
    }
    api.current?.wake();
  }, [charge, charged]);

  React.useEffect(() => {
    recharge();
  }, [charged, recharge]);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const probe = probeRef.current;
    if (!root || !canvas || !probe) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const read = rgbReader();
    const state = { s: 0 };
    let frame: Frame | null = null;
    let width = 0;
    let height = 0;
    let ratio = 1;
    let raf = 0;
    let inView = false;
    let lastStrike = -Infinity;
    let strikes = 0;
    let nextJump = 0;
    let jumpAt = -Infinity;
    let jumpCorner = 0;
    let jumpSeed = 0;
    const bolt = new Float32Array(BOLT * 2);
    const styles = { glow: "", main: "", ghost: "", core: "", shadow: "" };

    const resolve = () => {
      const p = params.current;
      probe.style.color = p.paint;
      const rgb = read(getComputedStyle(probe).color);
      let core: Rgb = [
        Math.round(rgb[0] + (255 - rgb[0]) * 0.72),
        Math.round(rgb[1] + (255 - rgb[1]) * 0.72),
        Math.round(rgb[2] + (255 - rgb[2]) * 0.72),
      ];
      if (p.coreColor) {
        probe.style.color = p.coreColor;
        core = read(getComputedStyle(probe).color);
      }
      const c = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
      styles.main = `rgb(${c})`;
      styles.glow = `rgba(${c}, 0.22)`;
      styles.ghost = `rgba(${c}, 0.4)`;
      styles.shadow = `rgba(${c}, 0.9)`;
      styles.core = `rgb(${core[0]}, ${core[1]}, ${core[2]})`;
    };

    const measure = () => {
      const p = params.current;
      const box = root.getBoundingClientRect();
      width = box.width;
      height = box.height;
      ratio = Math.min(2, Math.max(0.5, p.dpr), window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const g = p.gutter;
      frame = buildFrame(
        g,
        g,
        Math.max(1, width - 2 * g),
        Math.max(1, height - 2 * g),
        p.radius,
      );
    };

    const reform = (still: boolean) => {
      if (!frame) return;
      const p = params.current;
      strikes = still ? 0 : strikes + 1;
      state.s = (p.seed * 7919 + strikes * 104729) | 0;
      strike(frame, frame.main, state);
      strike(frame, frame.ghost, state);
    };

    const trace = (f: Frame, disp: Float32Array, amp: number) => {
      ctx.beginPath();
      for (let i = 0; i < f.n; i += 1) {
        const d = (disp[i] ?? 0) * amp;
        const x = (f.bx[i] ?? 0) + (f.nx[i] ?? 0) * d;
        const y = (f.by[i] ?? 0) + (f.ny[i] ?? 0) * d;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };

    const draw = (now: number) => {
      const f = frame;
      if (!f) return;
      const p = params.current;
      const c = clamp01(charge.get()) * clamp01(p.surge);
      const flash =
        now - jumpAt < JUMP_LIFE
          ? Math.pow(1 - (now - jumpAt) / JUMP_LIFE, 1.5)
          : 0;
      const amp = (1.5 + 5 * clamp01(p.jitter)) * (0.75 + 0.6 * c);
      const glowK = clamp01(p.glow) * (0.6 + 0.8 * c) * (1 + 0.5 * flash);
      const t = Math.max(0.5, p.thickness);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // The ghost: a second, fainter strand with its own jag.
      trace(f, f.ghost, amp * 0.8);
      ctx.globalAlpha = 0.5 + 0.3 * c;
      ctx.strokeStyle = styles.ghost;
      ctx.lineWidth = t * 0.6;
      ctx.stroke();

      trace(f, f.main, amp);
      ctx.globalAlpha = Math.min(1, glowK);
      ctx.strokeStyle = styles.glow;
      ctx.lineWidth = t * 3 + 6 * glowK;
      ctx.stroke();
      ctx.globalAlpha = Math.min(1, 0.8 + 0.2 * c + flash * 0.2);
      ctx.shadowColor = styles.shadow;
      ctx.shadowBlur = (4 + 10 * glowK) * ratio;
      ctx.strokeStyle = styles.main;
      ctx.lineWidth = t;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = styles.core;
      ctx.lineWidth = Math.max(0.6, t * 0.4);
      ctx.stroke();

      if (flash > 0) {
        // The jump: a bolt across the corner, from one edge to the next,
        // re-jagged every frame of its short life.
        const corner = f.corners[jumpCorner];
        if (corner) {
          const [cx, cy, a0, a1] = corner;
          const r = f.r;
          state.s = (jumpSeed + Math.floor(now / 40)) | 0;
          // Each end lands on a straight edge, 6–28 px back from where the
          // corner's arc begins: from the arc's ends, step back against (and
          // on along) the direction of travel.
          const back = 6 + rand(state) * 22;
          const on = 6 + rand(state) * 22;
          const ax = cx + Math.cos(a0) * r + Math.sin(a0) * back;
          const ay = cy + Math.sin(a0) * r - Math.cos(a0) * back;
          const bxp = cx + Math.cos(a1) * r - Math.sin(a1) * on;
          const byp = cy + Math.sin(a1) * r + Math.cos(a1) * on;
          const len = Math.hypot(bxp - ax, byp - ay);
          const px = -(byp - ay) / Math.max(1, len);
          const py = (bxp - ax) / Math.max(1, len);
          for (let i = 0; i < BOLT; i += 1) {
            const k = i / (BOLT - 1);
            const bend =
              i === 0 || i === BOLT - 1
                ? 0
                : (rand(state) * 2 - 1) * len * 0.16;
            bolt[i * 2] = lerp(ax, bxp, k) + px * bend;
            bolt[i * 2 + 1] = lerp(ay, byp, k) + py * bend;
          }
          ctx.beginPath();
          for (let i = 0; i < BOLT; i += 1) {
            const x = bolt[i * 2] ?? 0;
            const y = bolt[i * 2 + 1] ?? 0;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.globalAlpha = flash;
          ctx.shadowColor = styles.shadow;
          ctx.shadowBlur = 12 * ratio;
          ctx.strokeStyle = styles.main;
          ctx.lineWidth = t * 1.2;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = styles.core;
          ctx.lineWidth = Math.max(0.6, t * 0.5);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    const scheduleJump = (now: number) => {
      const p = params.current;
      const k = clamp01(p.jumps);
      if (k <= 0) {
        nextJump = Infinity;
        return;
      }
      const c = clamp01(charge.get()) * clamp01(p.surge);
      const gap = lerp(3200, 700, k) / (1 + 2 * c);
      state.s = (p.seed * 31 + Math.floor(now)) | 0;
      nextJump = now + gap * (0.6 + 0.8 * rand(state));
    };

    const isLive = () => {
      const p = params.current;
      if (!p.motionSafe || p.paused) return false;
      return p.live === "always" || charge.get() > 0.01 || visitor.current.lit;
    };

    const tick = (now: number) => {
      raf = 0;
      // Off screen or hidden: stop, and leave the last strike on the canvas.
      if (!inView || document.hidden) return;
      // Settled (paused, reduced motion, or a "hover" frame at rest): one
      // still strike, and no loop.
      if (!isLive()) {
        reform(true);
        draw(now);
        return;
      }
      const p = params.current;
      const c = clamp01(charge.get()) * clamp01(p.surge);
      const every = 1000 / Math.max(1, p.rate * (1 + 0.8 * c));
      if (nextJump === 0) scheduleJump(now);
      if (now >= nextJump) {
        jumpAt = now;
        state.s = (p.seed * 131 + Math.floor(now)) | 0;
        jumpCorner = Math.floor(rand(state) * 4) % 4;
        jumpSeed = Math.floor(rand(state) * 1e9);
        scheduleJump(now);
      }
      // Between strikes a frame draws nothing — unless a jump is dying.
      if (now - lastStrike >= every) {
        lastStrike = now;
        reform(false);
        draw(now);
      } else if (now - jumpAt < JUMP_LIFE + 20) {
        draw(now);
      }
      raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(tick);
    };

    const repaint = () => {
      resolve();
      measure();
      reform(true);
      draw(performance.now());
      wake();
    };
    api.current = { repaint, wake };

    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      if (inView) wake();
    });
    io.observe(root);
    const ro = new ResizeObserver(() => {
      measure();
      reform(true);
      draw(performance.now());
    });
    ro.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const unsub = charge.on("change", () => {
      if (raf === 0) draw(performance.now());
      wake();
    });

    repaint();

    return () => {
      api.current = null;
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      io.disconnect();
      ro.disconnect();
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [charge]);

  return (
    <div
      ref={rootRef}
      className={cn("relative isolate", className)}
      style={{ padding: gutter }}
      onPointerEnter={() => {
        visitor.current.hover = true;
        recharge();
      }}
      onPointerLeave={() => {
        visitor.current.hover = false;
        recharge();
      }}
      onFocus={() => {
        visitor.current.focus = true;
        recharge();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        visitor.current.focus = false;
        recharge();
      }}
    >
      {/* The rail: the still track under the current, and the frame the
          server renders before the canvas has drawn. */}
      <span
        aria-hidden
        className="pointer-events-none absolute block border"
        style={{
          inset: gutter,
          borderRadius: radius,
          borderColor: `color-mix(in oklab, ${paint} 38%, transparent)`,
          boxShadow: `0 0 ${Math.round(4 + glow * 10)}px color-mix(in oklab, ${paint} 22%, transparent)`,
        }}
      />
      <div
        className={cn("relative", contentClassName)}
        style={{ borderRadius: radius }}
      >
        {children}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        data-effect-canvas="arc-border"
        className="pointer-events-none absolute inset-0 block size-full"
      />
      {/* Colours are resolved on this probe, inside the component, so a
          themed wrapper's tokens are the ones read. */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1 ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.repaint()}
        className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
      />
    </div>
  );
}
