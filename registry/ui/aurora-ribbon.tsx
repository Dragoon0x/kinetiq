"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Reduced motion draws exactly one resting frame — the ribbons at t=0. */
const STATIC_T = 0;
/** Column sample step in CSS px — the ribbon edge is a polyline this coarse. */
const STEP = 8;
/** Glow layers per band: each redraws the band thicker + fainter so it blooms. */
const GLOW_LAYERS = 3;
/** Hard clamp on band count, mirroring the documented [1, 6] range. */
const MAX_BANDS = 6;

/**
 * djb2 over a small integer tuple, folded to [0, 1). Every per-band constant
 * (baseY, amplitude, wavelength, speed, phase, tint) derives from this —
 * deterministic and SSR-safe, so there is no Math.random anywhere near render.
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  // Bare djb2 stays nearly affine in sequential inputs — finish with a full
  // two-round avalanche so neighbouring band indices decorrelate.
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
 * Resolve a CSS custom property to an [r, g, b] triple in 0–255. A hidden probe
 * lets the browser turn any color syntax (the tokens are oklch) into rgb() for
 * us, so we can numerically blend two tokens across the bands and feed the
 * result into gradient stops with our own alpha.
 */
const readRGB = (
  raw: string,
  fallback: readonly [number, number, number],
): [number, number, number] => {
  if (raw === "" || typeof document === "undefined") {
    return [fallback[0], fallback[1], fallback[2]];
  }
  const probe = document.createElement("span");
  probe.style.color = raw;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const parts = resolved.match(/[\d.]+/g);
  if (!parts || parts.length < 3) {
    return [fallback[0], fallback[1], fallback[2]];
  }
  return [
    Number(parts[0]) || 0,
    Number(parts[1]) || 0,
    Number(parts[2]) || 0,
  ];
};

export type AuroraRibbonProps = {
  /** Number of ribbons. @default 3, clamped to [1, 6]. */
  bands?: number;
  className?: string;
  /** px stage height when standalone (no external sizing). @default 320 */
  height?: number;
  /** Overlay content, rendered in a layer above the canvas. */
  children?: React.ReactNode;
};

/**
 * Slow sinusoidal ribbons of light that undulate across the field like an
 * aurora. Each band is a smooth sine curve `y = baseY + A·sin(k·x + speed·t +
 * phase)` swept across the width and filled as a soft vertical gradient that
 * fades top and bottom, so it reads as a glowing ribbon rather than a line;
 * bands are drawn under `lighter` compositing so where they overlap they bloom.
 * As the pointer moves each band's baseY (and amplitude) eases toward it with a
 * distance falloff, so the ribbons lean toward the cursor and relax back when
 * it leaves. A calm, premium atmospheric background — luminous, never noisy.
 *
 * Mirrors the canvas discipline of Wavefield / IronFilings: the canvas is
 * DPR-aware (capped at 2) and sized by a ResizeObserver (setTransform, not
 * scale); colors resolve from CSS variables once per mount and re-resolve when
 * the html class flips theme; the single rAF loop pauses while the document is
 * hidden or the stage is offscreen (clock rebased on resume); the pointer is
 * tracked in a ref updated by listeners — never React state.
 *
 * Perf: budget ≤3ms/frame at ~800×500. A handful of bands, each sampled every
 * STEP px into a reused buffer and painted in {@link GLOW_LAYERS} translucent
 * passes — the frame loop allocates only the few small gradients it paints.
 *
 * Reduced motion: exactly one static frame — the ribbons at t=0 in their
 * resting arrangement, with no pointer response and no loop.
 */
export function AuroraRibbon({
  bands = 3,
  className,
  height = 320,
  children,
}: AuroraRibbonProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Pointer in canvas space; `active` is false until it enters / after it
  // leaves, which relaxes every band back to its resting baseY.
  const pointerRef = React.useRef({ x: 0, y: 0, active: false });

  // All canvas work lives here: sizing, theming, geometry, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const count = Math.round(clamp(bands, 1, MAX_BANDS));
    const pointer = pointerRef.current;

    // --- per-band constants: seeded once, independent of size -------------
    // Layout stride is applied at draw time (fractions of height); everything
    // here is resolution-independent so only colors/geometry touch the DOM.
    const baseFrac = new Float32Array(count); // resting center, 0..1 of height
    const ampFrac = new Float32Array(count); // amplitude, fraction of height
    const waves = new Float32Array(count); // angular wavenumber k (per px)
    const speeds = new Float32Array(count); // radians/sec of phase advance
    const phases = new Float32Array(count); // static phase offset
    const tints = new Float32Array(count); // 0..1 blend signal↔cobalt
    // Eased pointer response per band (persisted across frames, never realloc).
    const easedBase = new Float32Array(count); // current center in px
    const easedAmp = new Float32Array(count); // current amplitude in px
    let seeded = false;

    for (let i = 0; i < count; i++) {
      // Spread resting centers across the field with a little jitter so the
      // bands never sit on an even comb.
      const slot = count === 1 ? 0.5 : 0.16 + (0.68 * i) / (count - 1);
      baseFrac[i] = slot + (djb2(i, 1, 17) - 0.5) * 0.08;
      ampFrac[i] = 0.07 + djb2(i, 2, 17) * 0.06;
      // Long wavelengths (½–1½ screens) keep the undulation slow and premium.
      const wavelengthPx = 520 + djb2(i, 3, 17) * 520;
      waves[i] = TAU / wavelengthPx;
      // Slow drift; alternate sign so neighbouring bands slide opposite ways.
      speeds[i] = (0.16 + djb2(i, 4, 17) * 0.16) * (i % 2 === 0 ? 1 : -1);
      phases[i] = djb2(i, 5, 17) * TAU;
      tints[i] = count === 1 ? 0.5 : i / (count - 1);
    }

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    // Two endpoint tints (signal → cobalt-bright); each band's color is the
    // blend at its tint fraction. Kept as flat RGB so blending is cheap.
    let sig: [number, number, number] = [138, 226, 190];
    let cob: [number, number, number] = [120, 130, 240];
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string) => style.getPropertyValue(name).trim();
      sig = readRGB(read("--signal"), [138, 226, 190]);
      // --cobalt-bright is aliased to --accent-bright; fall back through both.
      const cobRaw =
        read("--cobalt-bright") || read("--accent-bright") || read("--primary");
      cob = readRGB(cobRaw, [120, 130, 240]);
    };
    resolveColors();

    // --- geometry: only width/height, refreshed by the ResizeObserver -----
    let width = 0;
    let height2 = 0;

    // Seed the eased state to the resting arrangement once we know the height,
    // so the first frame is already composed rather than sliding up from zero.
    const seedEased = () => {
      for (let i = 0; i < count; i++) {
        easedBase[i] = (baseFrac[i] ?? 0.5) * height2;
        easedAmp[i] = (ampFrac[i] ?? 0.08) * height2;
      }
      seeded = true;
    };

    // Paint one band. `t` is seconds; when the pointer is inactive the eased
    // target is simply the resting center, so the field relaxes on its own.
    const drawBand = (i: number, t: number) => {
      const k = waves[i] ?? 0;
      const phase = (phases[i] ?? 0) + (speeds[i] ?? 0) * t;
      const restBase = (baseFrac[i] ?? 0.5) * height2;
      const restAmp = (ampFrac[i] ?? 0.08) * height2;

      // Pointer bend: pull this band's center toward the pointer with a
      // vertical falloff, and swell its amplitude a touch near the cursor.
      let targetBase = restBase;
      let targetAmp = restAmp;
      if (pointer.active) {
        const reach = height2 * 0.6;
        const dy = pointer.y - restBase;
        const f = clamp(1 - Math.abs(dy) / reach, 0, 1);
        const pull = f * f * (3 - 2 * f); // smoothstep falloff
        targetBase = restBase + dy * pull * 0.55;
        targetAmp = restAmp * (1 + pull * 0.5);
      }
      // Ease per frame (lerp) so bending and relaxing are both smooth.
      const cur = easedBase[i] ?? restBase;
      const curA = easedAmp[i] ?? restAmp;
      const nextBase = cur + (targetBase - cur) * 0.08;
      const nextAmp = curA + (targetAmp - curA) * 0.08;
      easedBase[i] = nextBase;
      easedAmp[i] = nextAmp;

      // Band color: blend the two endpoint tints at this band's fraction.
      const m = tints[i] ?? 0.5;
      const r = Math.round(sig[0] + (cob[0] - sig[0]) * m);
      const g = Math.round(sig[1] + (cob[1] - sig[1]) * m);
      const b = Math.round(sig[2] + (cob[2] - sig[2]) * m);

      // Trace the sine centerline once across the width into scratch; each glow
      // layer reuses these samples, extruded by its own half-thickness.
      // (Kept inline — a closure per band would allocate in the hot loop.)
      for (let layer = 0; layer < GLOW_LAYERS; layer++) {
        // Outer layers are thicker and fainter → a soft bloom around a bright
        // core; the vertical gradient inside fades the ribbon top and bottom.
        const spread = nextAmp * (0.5 + layer * 0.85) + 6;
        const alpha = 0.34 / (layer + 1);
        // A vertical gradient spanning the band's travel range makes the fill
        // glow-cored: opaque at the centerline band, transparent at the edges.
        const top = nextBase - nextAmp - spread;
        const bottom = nextBase + nextAmp + spread;
        const grad = ctx.createLinearGradient(0, top, 0, bottom);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = grad;

        ctx.beginPath();
        // Top edge, left → right.
        let first = true;
        for (let x = 0; x <= width; x += STEP) {
          const y = nextBase + Math.sin(k * x + phase) * nextAmp - spread;
          if (first) {
            ctx.moveTo(x, y);
            first = false;
          } else {
            ctx.lineTo(x, y);
          }
        }
        // Bottom edge, right → left, closing the ribbon into a filled band.
        for (let x = width; x >= 0; x -= STEP) {
          const y = nextBase + Math.sin(k * x + phase) * nextAmp + spread;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
    };

    const drawFrame = (t: number) => {
      if (width <= 0 || height2 <= 0) return;
      if (!seeded) seedEased();
      ctx.clearRect(0, 0, width, height2);
      // Additive compositing so overlapping ribbons bloom into brighter light.
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < count; i++) drawBand(i, t);
      ctx.globalCompositeOperation = "source-over";
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

    // Sizing — DPR-aware (capped at 2); geometry refreshes live here only.
    const measure = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      const prevH = height2;
      height2 = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // setTransform, not scale — idempotent across repeated measures.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-seed eased state on first measure or when the height changes, so the
      // resting layout tracks the new stage instead of drifting to reach it.
      if (!seeded || prevH !== height2) seedEased();
      // Reduced motion redraws its single resting frame; the live loop simply
      // picks the new size up on its next frame.
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

    // Under reduced motion the loop never starts and the field is inert — no
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
    } else {
      // One resting frame; measure() may have run before colors settled.
      drawFrame(STATIC_T);
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
  }, [bands, motionSafe]);

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
