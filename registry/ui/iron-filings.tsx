"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Reduced motion draws exactly one resting frame — the calm lattice. */
const RESTING_ONLY = true;

/**
 * djb2 over a small integer tuple, folded to [0, 1). Every per-filing constant
 * (its ambient phase) derives from this — deterministic and SSR-safe, so there
 * is no Math.random anywhere near render.
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  // Bare djb2 stays nearly affine in sequential inputs — finish with a full
  // two-round avalanche so neighbouring grid indices decorrelate.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/**
 * Signed shortest delta between two angles, folded into (-π, π]. Filings align
 * to an *axis* (a dash has no head), so alignment lives on a half-turn — we
 * fold to (-π/2, π/2] before easing so a dash never spins the long way round.
 */
const shortestAxis = (from: number, to: number): number => {
  let delta = (to - from) % Math.PI;
  if (delta > Math.PI / 2) delta -= Math.PI;
  else if (delta < -Math.PI / 2) delta += Math.PI;
  return delta;
};

export type IronFilingsProps = {
  /** px between filings in the grid. @default 26, clamped to [16, 48]. */
  spacing?: number;
  className?: string;
  /** px stage height when standalone (no external sizing). @default 320 */
  height?: number;
  /** Overlay content, rendered in a layer above the canvas. */
  children?: React.ReactNode;
};

/**
 * A dense lattice of short dash "filings" that align to the cursor like iron
 * filings around a magnetic pole. Each dash points along the radial field to
 * the pointer and brightens toward `--signal` within a falloff radius; far
 * away it relaxes to a calm near-horizontal rest and dims to `--ink-3`. Every
 * dash eases toward its target each frame, so the field settles rather than
 * snapping, and the resting state (pointer absent) carries only a slow, cheap
 * ambient shimmer.
 *
 * Mirrors the canvas discipline of Wavefield: the canvas is DPR-aware (capped
 * at 2) and sized by a ResizeObserver; colors resolve from CSS variables once
 * per mount and re-resolve when the html class flips theme; the single rAF
 * loop pauses while the document is hidden or the stage is offscreen, and the
 * pointer is tracked in a ref updated by listeners — never React state.
 *
 * Perf: budget ≤3ms/frame at ~800×500. At spacing 26 that is ~31×20 ≈ 620
 * dashes, each a single moveTo/lineTo stroke; grid geometry and per-filing
 * phases rebuild only on resize, so the frame loop allocates nothing.
 *
 * Reduced motion: exactly one static frame — the resting lattice at its
 * default orientation, no pointer response and no loop (no observers beyond
 * resize/theme, which only ever repaint that single frame).
 */
export function IronFilings({
  spacing = 26,
  className,
  height = 320,
  children,
}: IronFilingsProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Pointer in canvas space; `active` is false until it enters / after it
  // leaves, which relaxes the whole field to rest.
  const pointerRef = React.useRef({ x: 0, y: 0, active: false });

  // All canvas work lives here: sizing, theming, geometry, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gap = clamp(spacing, 16, 48);
    const half = gap * 0.5;
    const pointer = pointerRef.current;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let rest = "";
    let signal = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      // Resting lattice reads from --ink-3 (falls back to the stronger
      // hairline); aligned/energized filings read from --signal.
      rest = read("--ink-3", read("--hairline-strong", "#8a8f9b"));
      signal = read("--signal", read("--primary", "#6478f0"));
    };
    resolveColors();

    // --- geometry: rebuilt only in the ResizeObserver callback ------------
    let width = 0;
    let height2 = 0;
    let cols = 0;
    let rows = 0;
    let originX = 0;
    let originY = 0;
    // Per-filing eased angle (current draw angle) and ambient phase seed.
    let angles = new Float32Array(0);
    let phases = new Float32Array(0);
    // The pole's reach — a filing inside this radius is fully aligned.
    let reach = 0;

    const rebuild = () => {
      cols = Math.max(1, Math.floor((width - half) / gap));
      rows = Math.max(1, Math.floor((height2 - half) / gap));
      // Centre the lattice so the margin is even on both edges.
      originX = (width - (cols - 1) * gap) / 2;
      originY = (height2 - (rows - 1) * gap) / 2;
      const count = cols * rows;
      const grew = angles.length < count;
      if (grew) {
        angles = new Float32Array(count);
        phases = new Float32Array(count);
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          phases[i] = djb2(c, r, 13) * TAU;
          // Seed the draw angle at rest so the first frame is already calm.
          if (grew) angles[i] = 0;
        }
      }
      // Falloff spans a few cells — wide enough to read as a field, tight
      // enough that the aligned core stays legible.
      reach = gap * 7;
    };

    // Resting target: near-horizontal with a slow ambient drift per filing so
    // the calm field breathes without ever looking busy.
    const restAngle = (i: number, t: number) =>
      Math.sin(t * 0.4 + (phases[i] ?? 0)) * 0.09;

    const drawFrame = (t: number) => {
      if (width <= 0 || height2 <= 0 || cols <= 0 || rows <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      ctx.lineWidth = 1;
      ctx.lineCap = "round";

      const px = pointer.x;
      const py = pointer.y;
      const active = pointer.active;
      const invReach = reach > 0 ? 1 / reach : 0;
      // Ease constant: fast enough to feel responsive, slow enough to settle.
      const ease = active ? 0.18 : 0.08;

      for (let r = 0; r < rows; r++) {
        const y = originY + r * gap;
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const x = originX + c * gap;

          let target: number;
          let strength = 0;
          if (active) {
            // Vector from the filing to the pole — the dash aligns along this
            // radial (pole-pointing) direction.
            const dx = px - x;
            const dy = py - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // Smooth falloff: 1 at the pole, 0 at/after reach.
            const f = clamp(1 - dist * invReach, 0, 1);
            strength = f * f * (3 - 2 * f);
            const poleAngle = Math.atan2(dy, dx);
            const relaxed = restAngle(i, t);
            // Blend the aligned axis toward the resting drift by strength, so
            // the transition across the field is continuous.
            const aligned = relaxed + shortestAxis(relaxed, poleAngle) * strength;
            target = aligned;
          } else {
            target = restAngle(i, t);
          }

          // Ease the drawn angle toward its target on the half-turn.
          const current = angles[i] ?? 0;
          const next = current + shortestAxis(current, target) * ease;
          angles[i] = next;

          // Alignment strength drives both length and color: aligned filings
          // reach a touch longer and brighten toward --signal.
          const len = half * (0.86 + strength * 0.32);
          const cos = Math.cos(next) * len;
          const sin = Math.sin(next) * len;

          ctx.strokeStyle = strength > 0.001 ? signal : rest;
          ctx.globalAlpha = 0.32 + strength * 0.62;
          ctx.beginPath();
          ctx.moveTo(x - cos, y - sin);
          ctx.lineTo(x + cos, y + sin);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

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
      rebuild();
      // Reduced motion redraws its single resting frame; the live loop simply
      // picks the new size up on its next frame.
      if (!motionSafe) drawFrame(0);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawFrame(0);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts and the pole is inert — no
    // gates and no pointer wiring to watch.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    const onPointerMove = (event: PointerEvent) => {
      const box = container.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };

    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerleave", onPointerLeave);
    } else if (RESTING_ONLY) {
      // One resting frame; measure() may have run before colors settled.
      drawFrame(0);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [spacing, motionSafe]);

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {children != null && (
        <div className="relative z-10 h-full">{children}</div>
      )}
    </div>
  );
}
