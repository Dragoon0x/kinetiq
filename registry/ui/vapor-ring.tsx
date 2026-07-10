"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Fixed ring pool — a puff past this recycles the oldest slot. */
const MAX_RINGS = 8;
/** Seconds a ring lives before it fully dissipates. */
const RING_LIFE = 1.6;
/** px the ring's radius reaches at end of life (scaled by stage size). */
const MAX_RADIUS = 86;
/** px the ring drifts upward over its life — buoyant vapor. */
const DRIFT_UP = 34;
/** Segments per stroked ring — enough for the wobble harmonics to read smooth. */
const SEGMENTS = 48;
/** Wobble harmonics layered on the ring radius so the edge turbulently ripples. */
const HARMONICS = 3;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** ζ ~1 ease-out: fast opening bloom that settles — the ring's radius curve. */
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export type VaporRingProps = {
  /** Fires once per click/tap, with the stage-local point puffed. */
  onPuff?: (at: { x: number; y: number }) => void;
  /** px stage height. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A still stage of air. Click or tap anywhere and a vapor ring puffs out at
 * that point: a soft feathered torus that expands, blooms in thickness, drifts
 * gently upward as if rising toward the viewer, and dissipates over ~1.6s. A
 * handful of seeded wobble harmonics ride the ring's radius so its edge reads
 * as turbulent vapor rather than a clean drawn circle.
 *
 * Mirrors the canvas discipline of RippleSurface: the canvas is DPR-aware
 * (capped at 2) and sized by a ResizeObserver via setTransform; colors resolve
 * from CSS variables once per mount and re-resolve on theme flips; a single
 * rAF loop is gated by IntersectionObserver + visibilitychange with a rebased
 * clock, and is additionally idle-stopped whenever no ring is alive — the loop
 * only runs while the pool has an active member, and a fresh puff wakes it.
 * The ring pool is a fixed struct-of-arrays (capped at 8, round-robin
 * recycling the oldest on overflow) living entirely in refs.
 *
 * Perf: budget ≤2ms/frame at ~500×300 — at most 8 rings × 48 segments is a
 * single stroked path per ring, no per-frame allocation.
 *
 * Reduced motion: a click draws exactly one static ring at a mid expansion
 * (no growth, no rAF) which the next click simply replaces — onPuff still
 * fires, calm and immediate.
 */
export function VaporRing({
  onPuff,
  height = 300,
  className,
  "aria-label": ariaLabel = "Vapor ring surface",
}: VaporRingProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // The latest-ref pattern: onPuff is read from a ref inside the effect's
  // event handlers, kept current from an effect (never written in render).
  const onPuffRef = React.useRef(onPuff);
  React.useEffect(() => {
    onPuffRef.current = onPuff;
  });

  // Fixed ring pool as a struct-of-arrays — no per-frame or per-puff
  // allocation. `born` is the loop-clock time (seconds) a slot was spawned;
  // active is 0/1; each ring carries 3 seeded harmonic coefficients (freq,
  // phase, amplitude folded into one float per harmonic via amp*sin(phase)
  // packing — stored as separate arrays for clarity instead).
  const poolRef = React.useRef({
    x: new Float32Array(MAX_RINGS),
    y: new Float32Array(MAX_RINGS),
    born: new Float32Array(MAX_RINGS),
    active: new Uint8Array(MAX_RINGS),
    hFreq: new Float32Array(MAX_RINGS * HARMONICS),
    hPhase: new Float32Array(MAX_RINGS * HARMONICS),
    hAmp: new Float32Array(MAX_RINGS * HARMONICS),
    cursor: 0,
    seed: 0,
    // Latest clock time the loop has observed — read by the tap handler so a
    // spawned ring is birthed on the same clock the loop draws against.
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
    let ink2 = "";
    let ink3 = "";
    let signal = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      ink2 = read("--ink-2", "#a8adb8");
      ink3 = read("--ink-3", read("--hairline-strong", "#8a8f9b"));
      signal = read("--signal", read("--primary", "#6478f0"));
    };
    resolveColors();

    // --- geometry: stage size, rebuilt only on resize ----------------------
    let width = 0;
    let height2 = 0;

    // Spawn a puff into the round-robin slot, birthed on the loop clock so
    // its age is zero on the next drawn frame. Harmonics are seeded from the
    // pool's running seed folded with the slot index and puff count, so
    // repeated puffs at the same point still read as distinct vapor.
    const spawn = (x: number, y: number) => {
      const i = pool.cursor;
      pool.x[i] = x;
      pool.y[i] = y;
      pool.born[i] = pool.clock;
      pool.active[i] = 1;
      pool.seed += 1;
      const rand = seeded(djb2(`vapor:${pool.seed}:${i}`));
      for (let h = 0; h < HARMONICS; h++) {
        const slot = i * HARMONICS + h;
        // Low integer frequencies (2..6) so the wobble reads as a few lobes,
        // never noisy static.
        pool.hFreq[slot] = 2 + Math.floor(rand() * 5);
        pool.hPhase[slot] = rand() * TAU;
        // Higher harmonics contribute less — keeps the edge soft, not jagged.
        pool.hAmp[slot] = (1 / (h + 1)) * (0.35 + rand() * 0.65);
      }
      pool.cursor = (i + 1) % MAX_RINGS;
      return i;
    };

    // Wobbled radius at a given angle for ring slot `i`, as a fraction of the
    // ring's current base radius (roughly ±12% at full amplitude).
    const wobble = (i: number, angle: number): number => {
      let sum = 0;
      for (let h = 0; h < HARMONICS; h++) {
        const slot = i * HARMONICS + h;
        const freq = pool.hFreq[slot] ?? 0;
        const phase = pool.hPhase[slot] ?? 0;
        const amp = pool.hAmp[slot] ?? 0;
        sum += amp * Math.sin(angle * freq + phase);
      }
      return 1 + sum * 0.12;
    };

    // --- a single vapor ring ------------------------------------------------
    const drawRing = (i: number, clock: number, staticMid = false) => {
      const age = clock - (pool.born[i] ?? 0);
      if (!staticMid && (age < 0 || age > RING_LIFE)) {
        pool.active[i] = 0;
        return;
      }
      const life = staticMid ? 0.5 : clamp01(age / RING_LIFE);
      const grow = easeOutCubic(life);
      const cx = pool.x[i] ?? 0;
      // Buoyant drift: rises as the ring grows, never resets.
      const cy = (pool.y[i] ?? 0) - grow * DRIFT_UP;
      const scale = Math.min(width, height2) / 340;
      const baseRadius = 6 + grow * MAX_RADIUS * scale;
      // Thickness blooms early (coming toward the viewer) then thins as the
      // ring dissipates.
      const bloom = Math.sin(clamp01(life * 1.3) * Math.PI);
      const thickness = (3 + bloom * 7) * scale;
      // Fade: eases in fast, holds, then dissolves over the tail.
      const alpha = staticMid ? 0.55 : (1 - life) ** 1.4;
      if (alpha <= 0.004) {
        pool.active[i] = 0;
        return;
      }

      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineWidth = thickness;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      // Rotate through the vapor palette per slot so a burst of puffs reads
      // as varied mist rather than one repeated color.
      const palette = [ink2, ink3, signal] as const;
      ctx.strokeStyle = palette[i % palette.length] ?? ink2;
      ctx.beginPath();
      for (let s = 0; s <= SEGMENTS; s++) {
        const angle = (s / SEGMENTS) * TAU;
        const r = baseRadius * wobble(i, angle);
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      // Feathered edge: a soft outer stroke plus a fainter, wider echo reads
      // as a radial-alpha ring without a canvas radial-gradient per frame.
      ctx.globalAlpha = alpha * 0.9;
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = thickness * 2.1;
      ctx.stroke();
      ctx.restore();
    };

    // Reduced-motion motif: one static ring at a fixed mid expansion, cleared
    // on the next puff — no pool ageing, no clock.
    const drawStatic = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      const active = pool.active[0];
      if (active) drawRing(0, 0, true);
    };

    /** Draws one frame and returns how many rings are still alive after it. */
    const drawFrame = (t: number): number => {
      if (width <= 0 || height2 <= 0) return 0;
      pool.clock = t;
      ctx.clearRect(0, 0, width, height2);
      ctx.globalCompositeOperation = "lighter";
      let alive = 0;
      for (let i = 0; i < MAX_RINGS; i++) {
        if (pool.active[i]) {
          drawRing(i, t);
          if (pool.active[i]) alive += 1;
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      return alive;
    };

    // --- the one rAF loop, gated on visibility, intersection, and idle -----
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;
    // Set by syncLoop/spawn to indicate a frame should run; the loop itself
    // clears it once nothing remains alive after drawing.
    let dirty = false;

    const frame = (now: number) => {
      if (started === null) started = now;
      const alive = drawFrame((now - started) / 1000);
      if (alive > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        // Idle-stop: nothing left alive — cancel the loop until woken.
        raf = 0;
        dirty = false;
      }
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden && dirty;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so ages advance smoothly, not jump.
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

    // Sizing — DPR-aware (capped at 2); nothing else depends on stage size
    // besides the ring's max radius scale, computed per-draw.
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

    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();

    const puffAt = (x: number, y: number) => {
      onPuffRef.current?.({ x, y });
      setAnnouncement(`Puff at ${Math.round(x)}, ${Math.round(y)}`);
      if (motionSafe) {
        spawn(x, y);
        dirty = true;
        syncLoop();
      } else {
        // RM: exactly one static ring, always in slot 0, replaced each click.
        pool.x[0] = x;
        pool.y[0] = y;
        pool.active[0] = 1;
        drawStatic();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const box = container.getBoundingClientRect();
      puffAt(event.clientX - box.left, event.clientY - box.top);
    };

    container.addEventListener("pointerdown", onPointerDown);

    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
    }

    // Initial measure — under RM this paints an empty stage (no ring yet).
    measure();

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
      className={cn("relative touch-none select-none", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full"
      />
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <span aria-label={ariaLabel} className="sr-only">
        Click or tap anywhere to puff a vapor ring.
      </span>
    </div>
  );
}
