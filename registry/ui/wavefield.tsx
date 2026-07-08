"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Reduced motion draws exactly one frame at this t — chosen for composition. */
const STATIC_T = 1.7;
/** Interference dots at or above this field value become signal crests. */
const CREST = 0.8;
const NOISE_SIZE = 16;

/**
 * djb2 over a small integer tuple, folded to [0, 1). All variance in the
 * field is derived from this — deterministic and SSR-safe (no Math.random
 * anywhere near render).
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  // Bare djb2 stays nearly affine in sequential inputs — finish with a full
  // two-round avalanche so neighbouring indices decorrelate.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** 16×16 hash lattice for the contour field, built once, deterministically. */
const NOISE = (() => {
  const table = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      table[y * NOISE_SIZE + x] = djb2(x, y, 5);
    }
  }
  return table;
})();

/** Smooth value noise: smoothstep-bilinear blend of the lattice, wrapping. */
const sampleNoise = (x: number, y: number): number => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
  const y0 = ((yi % NOISE_SIZE) + NOISE_SIZE) % NOISE_SIZE;
  const x1 = (x0 + 1) % NOISE_SIZE;
  const y1 = (y0 + 1) % NOISE_SIZE;
  const a = NOISE[y0 * NOISE_SIZE + x0] ?? 0;
  const b = NOISE[y0 * NOISE_SIZE + x1] ?? 0;
  const c = NOISE[y1 * NOISE_SIZE + x0] ?? 0;
  const d = NOISE[y1 * NOISE_SIZE + x1] ?? 0;
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
};

/**
 * Marching-squares lookup. For each 4-bit corner code (tl 8 · tr 4 · br 2 ·
 * bl 1), the pairs of edges (0 top, 1 right, 2 bottom, 3 left) the iso-line
 * crosses. Ambiguous saddles (5, 10) emit both segments.
 */
const CONTOUR_SEGMENTS: readonly (readonly number[])[] = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [0, 1],
  [0, 1, 3, 2],
  [0, 2],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 3, 2, 1],
  [0, 1],
  [3, 1],
  [2, 1],
  [3, 2],
  [],
];

const wrap = (value: number, max: number) => ((value % max) + max) % max;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export type WavefieldVariant = "interference" | "contour" | "lattice" | "drift";

export type WavefieldProps = {
  /** Which field study to draw. @default "interference" */
  variant?: WavefieldVariant;
  /** Field clock multiplier — t advances `speed` units per second. @default 0.5 */
  speed?: number;
  /** 0–1. Tightens dot/node spacing and raises particle/level counts. @default 0.5 */
  density?: number;
  /** CSS opacity on the canvas layer only — content is unaffected. @default 1 */
  opacity?: number;
  className?: string;
  /** Overlay slot, rendered above the field. It carries all the semantics. */
  children?: React.ReactNode;
};

/**
 * Ambient physics, drawn on canvas. Four field studies share one clock-based
 * rAF loop (t = seconds × speed — drift tempo, never urgent):
 * `"interference"` ripples a dot lattice against two slowly orbiting wave
 * sources (primary dots at low alpha, crests in signal), `"contour"` traces
 * iso-lines over a drifting value-noise field (border hairlines, one level
 * accented signal), `"lattice"` breathes a node grid on hash-derived phases,
 * and `"drift"` wanders sparse particles with short fading tails. The canvas
 * is DPR-aware (capped at 2) and sized by a ResizeObserver; colors resolve
 * from CSS variables once per mount and again when the html class flips
 * theme; the loop pauses while the document is hidden or the field is
 * offscreen.
 *
 * Perf: budget ≤3ms/frame at 800×500 — interference dot count at density 0.5
 * is on the order of 40×25 ≈ 1000 draws, kept cheap with fillRect for dots
 * ≤2px (arcs only for crests); contour segment count is bounded by the 48×30
 * sample grid. Geometry buffers are rebuilt only on resize — the frame loop
 * allocates nothing.
 *
 * Reduced motion: exactly one static frame at t = 1.7 — the loop never
 * starts, but resize and theme flips still redraw single frames.
 */
export function Wavefield({
  variant = "interference",
  speed = 0.5,
  density = 0.5,
  opacity = 1,
  className,
  children,
}: WavefieldProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // All canvas work lives here: sizing, theming, geometry, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tempo = Math.max(0, speed);
    const level = clamp01(density);

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let primary = "";
    let border = "";
    let muted = "";
    let signal = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      primary = read("--primary", "#6478f0");
      border = read("--border", "rgba(127, 127, 127, 0.3)");
      muted = read("--muted-foreground", "#8a8f9b");
      signal = read("--signal", primary);
    };
    resolveColors();

    // --- geometry: rebuilt only in the ResizeObserver callback ------------
    let width = 0;
    let height = 0;
    // interference + lattice share the grid; `values` is per-frame scratch.
    let cols = 0;
    let rows = 0;
    let spacing = 0;
    let offsetX = 0;
    let offsetY = 0;
    let values = new Float32Array(0);
    let phases = new Float32Array(0);
    // contour sample grid (bounded 48×30).
    let cellsX = 0;
    let cellsY = 0;
    let cellW = 0;
    let cellH = 0;
    let samples = new Float32Array(0);
    // drift particles: x0, y0, vx, vy, size, tail lag — stride 6.
    let particles = new Float32Array(0);
    let particleCount = 0;

    const rebuild = () => {
      if (variant === "interference" || variant === "lattice") {
        spacing =
          variant === "interference" ? 34 - level * 16 : 64 - level * 32;
        cols = Math.max(2, Math.floor(width / spacing) + 1);
        rows = Math.max(2, Math.floor(height / spacing) + 1);
        offsetX = (width - (cols - 1) * spacing) / 2;
        offsetY = (height - (rows - 1) * spacing) / 2;
        if (values.length < cols * rows) {
          values = new Float32Array(cols * rows);
        }
        if (variant === "lattice") {
          if (phases.length < cols * rows) {
            phases = new Float32Array(cols * rows);
          }
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              phases[r * cols + c] = djb2(c, r, 7) * TAU;
            }
          }
        }
      } else if (variant === "contour") {
        cellsX = Math.max(8, Math.min(48, Math.round(width / 16)));
        cellsY = Math.max(6, Math.min(30, Math.round(height / 16)));
        cellW = width / cellsX;
        cellH = height / cellsY;
        const needed = (cellsX + 1) * (cellsY + 1);
        if (samples.length < needed) samples = new Float32Array(needed);
      } else {
        const target = ((width * height) / 6000) * (0.35 + level * 1.3);
        particleCount = Math.max(8, Math.min(120, Math.round(target)));
        if (particles.length < particleCount * 6) {
          particles = new Float32Array(particleCount * 6);
        }
        for (let i = 0; i < particleCount; i++) {
          const base = i * 6;
          const angle = djb2(i, 3, 11) * TAU;
          const pace = 8 + djb2(i, 4, 11) * 22;
          particles[base] = djb2(i, 1, 11) * width;
          particles[base + 1] = djb2(i, 2, 11) * height;
          particles[base + 2] = Math.cos(angle) * pace;
          particles[base + 3] = Math.sin(angle) * pace;
          particles[base + 4] = 1 + djb2(i, 5, 11);
          particles[base + 5] = 0.5 + djb2(i, 6, 11) * 0.7;
        }
      }
    };

    // --- the four studies --------------------------------------------------
    const drawInterference = (t: number) => {
      const midX = width / 2;
      const midY = height / 2;
      const reach = Math.min(width, height);
      const s1x = midX + Math.cos(t * 0.32) * reach * 0.28;
      const s1y = midY + Math.sin(t * 0.41) * reach * 0.22;
      const s2x = midX + Math.cos(-t * 0.26 + 2.4) * reach * 0.33;
      const s2y = midY + Math.sin(-t * 0.21 + 1.1) * reach * 0.26;
      const k = TAU / 96;
      const phase = t * 2.2;
      // Pass 1: field values, so each draw pass keeps a single fillStyle.
      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * spacing;
        for (let c = 0; c < cols; c++) {
          const x = offsetX + c * spacing;
          const dx1 = x - s1x;
          const dy1 = y - s1y;
          const dx2 = x - s2x;
          const dy2 = y - s2y;
          const wave =
            Math.sin(Math.sqrt(dx1 * dx1 + dy1 * dy1) * k - phase) +
            Math.sin(Math.sqrt(dx2 * dx2 + dy2 * dy2) * k - phase);
          values[r * cols + c] = wave * 0.25 + 0.5;
        }
      }
      // Pass 2: the lattice in primary at low alpha.
      ctx.fillStyle = primary;
      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * spacing;
        for (let c = 0; c < cols; c++) {
          const v = values[r * cols + c] ?? 0;
          if (v >= CREST) continue;
          const x = offsetX + c * spacing;
          const radius = 0.4 + v * 1.6;
          ctx.globalAlpha = 0.06 + v * v * 0.45;
          if (radius <= 1) {
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
          } else {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TAU);
            ctx.fill();
          }
        }
      }
      // Pass 3: crests in signal, brighter.
      ctx.fillStyle = signal;
      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * spacing;
        for (let c = 0; c < cols; c++) {
          const v = values[r * cols + c] ?? 0;
          if (v < CREST) continue;
          const x = offsetX + c * spacing;
          ctx.globalAlpha = 0.35 + (v - CREST) * 2.5;
          ctx.beginPath();
          ctx.arc(x, y, 0.6 + v * 1.6, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    // Scratch for edgePoint, so the marching loop allocates nothing.
    let edgeX = 0;
    let edgeY = 0;
    const cut = (from: number, to: number, iso: number) => {
      const span = to - from;
      return span === 0 ? 0.5 : Math.min(1, Math.max(0, (iso - from) / span));
    };
    const edgePoint = (
      edge: number,
      x0: number,
      y0: number,
      a: number,
      b: number,
      c: number,
      d: number,
      iso: number,
    ) => {
      if (edge === 0) {
        edgeX = x0 + cut(a, b, iso) * cellW;
        edgeY = y0;
      } else if (edge === 1) {
        edgeX = x0 + cellW;
        edgeY = y0 + cut(b, c, iso) * cellH;
      } else if (edge === 2) {
        edgeX = x0 + cut(d, c, iso) * cellW;
        edgeY = y0 + cellH;
      } else {
        edgeX = x0;
        edgeY = y0 + cut(a, d, iso) * cellH;
      }
    };

    const drawContour = (t: number) => {
      const coarse = 1 / 150;
      const fine = 1 / 64;
      const driftX = t * 0.09;
      const driftY = t * 0.06;
      let index = 0;
      for (let r = 0; r <= cellsY; r++) {
        const y = r * cellH;
        for (let c = 0; c <= cellsX; c++) {
          const x = c * cellW;
          samples[index] =
            sampleNoise(x * coarse + driftX, y * coarse + driftY) * 0.68 +
            sampleNoise(x * fine + 37.2 - driftY, y * fine + driftX) * 0.32;
          index += 1;
        }
      }
      const stride = cellsX + 1;
      const levels = 5 + Math.round(level * 5);
      const accentAt = Math.floor(levels / 2);
      ctx.lineWidth = 1;
      for (let l = 0; l < levels; l++) {
        // Two-octave value noise concentrates around 0.5 — keep the iso band
        // inside its realistic range so every level actually draws.
        const iso = 0.32 + ((l + 0.5) * 0.36) / levels;
        const accent = l === accentAt;
        ctx.strokeStyle = accent ? signal : border;
        ctx.globalAlpha = accent ? 0.4 : 1;
        ctx.beginPath();
        for (let r = 0; r < cellsY; r++) {
          const y0 = r * cellH;
          for (let c = 0; c < cellsX; c++) {
            const a = samples[r * stride + c] ?? 0;
            const b = samples[r * stride + c + 1] ?? 0;
            const cc = samples[(r + 1) * stride + c + 1] ?? 0;
            const d = samples[(r + 1) * stride + c] ?? 0;
            const code =
              (a > iso ? 8 : 0) |
              (b > iso ? 4 : 0) |
              (cc > iso ? 2 : 0) |
              (d > iso ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const segments = CONTOUR_SEGMENTS[code];
            if (!segments) continue;
            const x0 = c * cellW;
            for (let s = 0; s + 1 < segments.length; s += 2) {
              const from = segments[s];
              const to = segments[s + 1];
              if (from === undefined || to === undefined) continue;
              edgePoint(from, x0, y0, a, b, cc, d, iso);
              ctx.moveTo(edgeX, edgeY);
              edgePoint(to, x0, y0, a, b, cc, d, iso);
              ctx.lineTo(edgeX, edgeY);
            }
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const drawLattice = (t: number) => {
      // Pass 1: every node's breath this frame.
      const count = cols * rows;
      for (let i = 0; i < count; i++) {
        values[i] = 0.5 + 0.5 * Math.sin(t * 1.7 + (phases[i] ?? 0));
      }
      // Pass 2: hairlines to right/down neighbours, alpha from both ends.
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * spacing;
        for (let c = 0; c < cols; c++) {
          const pulse = values[r * cols + c] ?? 0;
          const x = offsetX + c * spacing;
          if (c + 1 < cols) {
            ctx.globalAlpha =
              0.15 + pulse * (values[r * cols + c + 1] ?? 0) * 0.85;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + spacing, y);
            ctx.stroke();
          }
          if (r + 1 < rows) {
            ctx.globalAlpha =
              0.15 + pulse * (values[(r + 1) * cols + c] ?? 0) * 0.85;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + spacing);
            ctx.stroke();
          }
        }
      }
      // Pass 3: nodes breathing radius and alpha.
      ctx.fillStyle = primary;
      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * spacing;
        for (let c = 0; c < cols; c++) {
          const pulse = values[r * cols + c] ?? 0;
          const x = offsetX + c * spacing;
          const radius = 0.7 + pulse * 1.5;
          ctx.globalAlpha = 0.12 + pulse * 0.5;
          if (radius <= 1) {
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
          } else {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, TAU);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const drawDrift = (t: number) => {
      ctx.lineWidth = 1;
      for (let i = 0; i < particleCount; i++) {
        const base = i * 6;
        const x0 = particles[base] ?? 0;
        const y0 = particles[base + 1] ?? 0;
        const vx = particles[base + 2] ?? 0;
        const vy = particles[base + 3] ?? 0;
        const size = particles[base + 4] ?? 1;
        const lag = particles[base + 5] ?? 0.5;
        const x = wrap(x0 + vx * t, width);
        const y = wrap(y0 + vy * t, height);
        const prevX = wrap(x0 + vx * (t - lag), width);
        const prevY = wrap(y0 + vy * (t - lag), height);
        // A tail across the wrap seam would streak the whole canvas — skip.
        const seam =
          Math.abs(x - prevX) > width * 0.5 ||
          Math.abs(y - prevY) > height * 0.5;
        if (!seam) {
          const midX = (x + prevX) / 2;
          const midY = (y + prevY) / 2;
          ctx.strokeStyle = muted;
          ctx.globalAlpha = 0.08;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(midX, midY);
          ctx.stroke();
          ctx.globalAlpha = 0.2;
          ctx.beginPath();
          ctx.moveTo(midX, midY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.fillStyle = primary;
        ctx.globalAlpha = 0.65;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    };

    const drawFrame = (t: number) => {
      if (width <= 0 || height <= 0) return;
      ctx.clearRect(0, 0, width, height);
      if (variant === "interference") drawInterference(t);
      else if (variant === "contour") drawContour(t);
      else if (variant === "lattice") drawLattice(t);
      else drawDrift(t);
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      drawFrame(((now - started) / 1000) * tempo);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the field resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    // Sizing — DPR-aware (capped at 2); geometry rebuilds live here only.
    const measure = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      height = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // setTransform, not scale — idempotent across repeated measures.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
      // Reduced motion redraws its single designed frame; the live loop
      // simply picks the new size up on its next frame.
      if (!motionSafe) drawFrame(STATIC_T);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawFrame(STATIC_T);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts — no gates to watch.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [variant, speed, density, motionSafe]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        style={{ opacity }}
      />
      {children != null && (
        <div className="relative z-10 h-full">{children}</div>
      )}
    </div>
  );
}
