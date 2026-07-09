"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Fixed ripple pool — spawning past this recycles the oldest slot. */
const MAX_RIPPLES = 12;
/** Crests per ripple: a short wave train so crossings read as interference. */
const CRESTS = 3;
/** px the leading crest travels per second. */
const WAVE_SPEED = 190;
/** px between successive crests in a ripple's train. */
const CREST_GAP = 26;
/** Seconds a ripple lives before it retires (leading crest fully faded). */
const RIPPLE_LIFE = 2.6;
/** Auto-ripple cadence (seconds) so the resting field is never dead. */
const AUTO_PERIOD = 3.4;

/**
 * djb2 over a small integer tuple, folded to [0, 1). Every deterministic
 * constant here (auto-ripple placement, the rest-shimmer phases) derives from
 * this — SSR-safe, with no Math.random anywhere near render or seeding.
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

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export type RippleSurfaceProps = {
  className?: string;
  /** px stage height. @default 320 */
  height?: number;
  /** Overlay content, rendered in a layer above the canvas. */
  children?: React.ReactNode;
};

/**
 * Tap (or click) anywhere and a circular wavefront propagates outward and
 * fades; tap again and the wave trains OVERLAP into interference, visibly
 * reinforcing where crests cross (rings composite additively). A calm resting
 * shimmer — a slow deterministic auto-ripple over a faint dot lattice — invites
 * the first tap without ever demanding attention.
 *
 * Mirrors the canvas discipline of Wavefield / IronFilings: the canvas is
 * DPR-aware (capped at 2) and sized by a ResizeObserver via setTransform;
 * colors resolve from CSS variables once per mount and re-resolve when the html
 * class flips theme; a single rAF loop pauses (with clock rebase) while the
 * document is hidden or the stage is offscreen; taps and the ripple pool live
 * entirely in refs — never React state.
 *
 * Perf: budget ≤3ms/frame at ~800×500. A fixed pool of 12 ripples × 3 crests
 * is at most 36 stroked arcs plus a static dot lattice rebuilt only on resize;
 * the hot loop allocates nothing (the pool is a preallocated struct-of-arrays).
 *
 * Reduced motion: exactly one static frame — a calm surface with two concentric
 * rings as a motif. No loop, and a tap does not animate (the pool stays inert).
 */
export function RippleSurface({
  className,
  height = 320,
  children,
}: RippleSurfaceProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Fixed ripple pool as a struct-of-arrays — no per-frame or per-tap
  // allocation. `born` is the loop-clock time (seconds) a slot was spawned;
  // active is 0/1. A cursor round-robins the pool so a burst of taps recycles
  // the oldest ring rather than dropping the newest.
  const poolRef = React.useRef({
    x: new Float32Array(MAX_RIPPLES),
    y: new Float32Array(MAX_RIPPLES),
    born: new Float32Array(MAX_RIPPLES),
    active: new Uint8Array(MAX_RIPPLES),
    cursor: 0,
    // Latest clock time the loop has observed — read by the tap handler so a
    // spawned ripple is birthed on the same clock the loop draws against.
    clock: 0,
  });

  // All canvas work lives here: sizing, theming, the pool, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pool = poolRef.current;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let signal = "";
    let ink3 = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      // Crests ride in --signal; the resting lattice and faint outer rings use
      // --ink-3 (falls back to the stronger hairline).
      signal = read("--signal", read("--primary", "#6478f0"));
      ink3 = read("--ink-3", read("--hairline-strong", "#8a8f9b"));
    };
    resolveColors();

    // --- geometry: the reference lattice, rebuilt only on resize ----------
    let width = 0;
    let height2 = 0;
    // Dot lattice positions (x, y stride 2) plus a per-dot shimmer phase.
    let dots = new Float32Array(0);
    let dotPhase = new Float32Array(0);
    let dotCount = 0;
    const DOT_GAP = 30;

    const rebuild = () => {
      const cols = Math.max(1, Math.floor((width - DOT_GAP) / DOT_GAP));
      const rows = Math.max(1, Math.floor((height2 - DOT_GAP) / DOT_GAP));
      const originX = (width - (cols - 1) * DOT_GAP) / 2;
      const originY = (height2 - (rows - 1) * DOT_GAP) / 2;
      dotCount = cols * rows;
      if (dots.length < dotCount * 2) {
        dots = new Float32Array(dotCount * 2);
        dotPhase = new Float32Array(dotCount);
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          dots[i * 2] = originX + c * DOT_GAP;
          dots[i * 2 + 1] = originY + r * DOT_GAP;
          dotPhase[i] = djb2(c, r, 19) * TAU;
        }
      }
    };

    // Spawn a ripple into the round-robin slot, birthed on the loop clock so
    // its age is zero on the next drawn frame.
    const spawn = (x: number, y: number) => {
      const i = pool.cursor;
      pool.x[i] = x;
      pool.y[i] = y;
      pool.born[i] = pool.clock;
      pool.active[i] = 1;
      pool.cursor = (i + 1) % MAX_RIPPLES;
    };

    // --- the resting lattice: a faint breathing dot field --------------
    const drawLattice = (t: number) => {
      ctx.fillStyle = ink3;
      for (let i = 0; i < dotCount; i++) {
        const shimmer = 0.5 + 0.5 * Math.sin(t * 0.9 + (dotPhase[i] ?? 0));
        // A dot near a passing crest brightens; base field is near-invisible.
        ctx.globalAlpha = 0.05 + shimmer * 0.05;
        const x = dots[i * 2] ?? 0;
        const y = dots[i * 2 + 1] ?? 0;
        ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      }
      ctx.globalAlpha = 1;
    };

    // --- a single ripple's wave train ----------------------------------
    // Each active ripple draws CRESTS concentric rings trailing the leading
    // edge by CREST_GAP; using "lighter" compositing, overlapping crests sum
    // in brightness so interference reads where two trains cross.
    const drawRipple = (i: number, clock: number) => {
      const age = clock - (pool.born[i] ?? 0);
      if (age < 0 || age > RIPPLE_LIFE) {
        pool.active[i] = 0;
        return;
      }
      const cx = pool.x[i] ?? 0;
      const cy = pool.y[i] ?? 0;
      const lead = age * WAVE_SPEED;
      // Global fade over the ripple's life — energy dissipates as it spreads.
      const life = 1 - age / RIPPLE_LIFE;
      const envelope = life * life;
      for (let cindex = 0; cindex < CRESTS; cindex++) {
        const radius = lead - cindex * CREST_GAP;
        if (radius <= 1) continue;
        // Trailing crests are dimmer; every crest thins as it expands so a
        // young tight ring is crisp and an old wide one is a whisper.
        const trail = 1 - cindex / CRESTS;
        const spread = clamp01(1 - radius / (WAVE_SPEED * RIPPLE_LIFE));
        const alpha = envelope * trail * spread * 0.5;
        if (alpha < 0.004) continue;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 0.75 + trail * 1.25;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, TAU);
        ctx.stroke();
      }
    };

    // Reduced-motion motif: a calm surface with two static concentric rings,
    // centred, at a fixed radius — legible at rest, no pool, no clock.
    const drawStatic = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      drawLattice(0);
      const cx = width / 2;
      const cy = height2 / 2;
      const base = Math.min(width, height2) * 0.22;
      ctx.strokeStyle = signal;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(cx, cy, base, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = ink3;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 1.7, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const drawFrame = (t: number) => {
      if (width <= 0 || height2 <= 0) return;
      pool.clock = t;
      ctx.clearRect(0, 0, width, height2);

      // A slow deterministic auto-ripple keeps the resting field alive without
      // any Math.random — placement steps through hash-derived points.
      const tick = Math.floor(t / AUTO_PERIOD);
      if (tick !== autoTick) {
        autoTick = tick;
        // Skip the very first tick so the surface opens calm, then breathe.
        if (tick > 0) {
          const ax = (0.2 + djb2(tick, 1, 23) * 0.6) * width;
          const ay = (0.2 + djb2(tick, 2, 23) * 0.6) * height2;
          spawn(ax, ay);
        }
      }

      drawLattice(t);

      // Crests composite additively so crossings reinforce into interference.
      ctx.strokeStyle = signal;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < MAX_RIPPLES; i++) {
        if (pool.active[i]) drawRipple(i, t);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;
    // Last auto-ripple tick emitted; -1 so tick 0 is observed (and skipped).
    let autoTick = -1;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      drawFrame((now - started) / 1000);
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
      height2 = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // setTransform, not scale — idempotent across repeated measures.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round";
      rebuild();
      // Reduced motion redraws its single motif; the live loop simply picks
      // the new size up on its next frame.
      if (!motionSafe) drawStatic();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawStatic();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts and taps are inert — no gates
    // and no pointer wiring to watch.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    const onPointerDown = (event: PointerEvent) => {
      const box = container.getBoundingClientRect();
      spawn(event.clientX - box.left, event.clientY - box.top);
    };

    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
      container.addEventListener("pointerdown", onPointerDown);
    } else {
      // One motif frame; measure() may have run before colors settled.
      drawStatic();
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointerdown", onPointerDown);
    };
  }, [motionSafe]);

  return (
    <div
      ref={containerRef}
      className={cn("relative touch-none", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full"
      />
      {children != null && (
        <div className="pointer-events-none relative z-10 h-full">
          {children}
        </div>
      )}
    </div>
  );
}
