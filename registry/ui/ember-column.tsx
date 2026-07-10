"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
const MAX_EMBERS = 160;
/** Reduced motion draws exactly one static frame — embers frozen mid-rise. */
const STATIC_T = 0;
/** Seconds an ember takes to cross the full column, before jitter. @see rebuild */
const BASE_LIFESPAN = 3.4;
/** Pointer influence eases toward its target this fraction of the gap per frame. */
const BEND_EASE = 0.06;
/** onEmberPass rate bucket window, seconds — coarse enough to stay cheap. */
const RATE_WINDOW = 0.5;

/** Per-ember seeded constants: spawnT, x0, swayFreq, swayAmp, swaySeed, size, speed. */
const A = 7;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export type EmberColumnProps = {
  /** Ember count, capped at 160. @default 90 */
  count?: number;
  /** Fires with a coarse, deduped embers-per-second rate as the column runs. */
  onEmberPass?: (rate: number) => void;
  /** Stage height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A buoyant column of seeded embers rising and flickering out of a forge
 * flue; the pointer bends the whole stream toward it, easing back to
 * vertical once it leaves. Each ember loops on its own deterministic
 * lifespan (`spawnT` staggers starts so the column never pulses in unison):
 * it climbs at a per-ember `speed`, brightens quickly off the base then
 * fades and shrinks approaching the top, and carries a seeded horizontal
 * sway whose amplitude grows with height (turbulence increases as the
 * plume thins). On respawn its seed index advances, so the sequence never
 * repeats a cycle.
 *
 * The pointer's x/y is tracked in a ref (never React state) and blended
 * into a `bend` scalar eased toward 1 while the pointer is active over the
 * stage and 0 once it leaves (`BEND_EASE` per frame). Each ember's x pull
 * toward the pointer's x falls off by vertical distance between the ember
 * and the pointer's own y, so the sway reads as one coherent flow leaning
 * over — not a scatter — and the lean relaxes smoothly rather than
 * snapping.
 *
 * Canvas discipline (Wavefield's, to the letter): DPR capped at 2 via
 * setTransform, ResizeObserver sizing, the one rAF loop gated by
 * IntersectionObserver + visibilitychange with a clock rebase over pauses,
 * theme colors resolved from CSS variables once per mount and re-resolved
 * on a MutationObserver watching the html class, and full teardown on
 * unmount. Palette: hot core near the base fading toward cooler, dimmer
 * tones climbing the column, using only --accent-bright / --signal /
 * --ink-2; glow is a cheap "lighter" composite pass, not a shadow blur.
 * Budget ≤3ms/frame: ≤160 embers, each a single lighter-composite arc,
 * geometry rebuilt only on resize.
 *
 * `onEmberPass` streams a coarse embers-per-second rate, bucketed over a
 * half-second window and only invoked when the bucket value changes — a
 * plain ref-held counter and a function call from inside the rAF loop,
 * never a per-frame setState. An sr-only polite region mirrors the coarser
 * DRAFT state (steady vs bent) for anyone not watching the canvas.
 *
 * Reduced motion: exactly one static frame — embers frozen at their
 * natural scattered heights up the column (each at its seeded resting
 * phase), no rAF, no rise, no pointer response.
 */
export function EmberColumn({
  count = 90,
  onEmberPass,
  height = 300,
  className,
  "aria-label": ariaLabel = "Ember column",
}: EmberColumnProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Pointer in canvas space; `active` false until entry / after leave, which
  // eases the whole column back to vertical.
  const pointerRef = React.useRef({ x: 0, y: 0, active: false });
  const [draftState, setDraftState] = React.useState<"STEADY" | "BENT">(
    "STEADY",
  );

  // LATEST-REF: the callback prop, written from an effect — never read
  // during render, never written in the render body.
  const onEmberPassRef = React.useRef(onEmberPass);
  React.useEffect(() => {
    onEmberPassRef.current = onEmberPass;
  });

  const emberCount = Math.max(1, Math.min(MAX_EMBERS, Math.round(count)));
  const uid = React.useId();

  // All canvas work lives here: sizing, theming, geometry, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rand = seeded(djb2(`ember-column:${uid}`));

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let hot = "";
    let cool = "";
    let ember = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      hot = read("--accent-bright", "#e8935a");
      cool = read("--signal", read("--accent-bright", "#84e8a8"));
      ember = read("--ink-2", "#8a8f9b");
    };
    resolveColors();

    // --- geometry: rebuilt only in the ResizeObserver callback ------------
    let width = 0;
    let height2 = 0;
    let baseY = 0;
    let centerX = 0;
    let spread = 0;
    // Per-ember seeded constants, stride A: spawnT, x0, swayFreq, swayAmp,
    // swaySeed, size, speed.
    let seeds = new Float32Array(0);
    let lifespans = new Float32Array(0);

    const rebuild = () => {
      baseY = height2;
      centerX = width / 2;
      spread = Math.min(width * 0.32, 64);
      const needed = emberCount * A;
      if (seeds.length < needed) {
        seeds = new Float32Array(needed);
        lifespans = new Float32Array(emberCount);
      }
      for (let i = 0; i < emberCount; i++) {
        const b = i * A;
        seeds[b] = rand(); // spawnT: staggers each ember's phase in [0,1)
        seeds[b + 1] = (rand() * 2 - 1) * spread; // x0
        seeds[b + 2] = 0.6 + rand() * 1.1; // swayFreq
        seeds[b + 3] = 6 + rand() * 16; // swayAmp
        seeds[b + 4] = rand() * TAU; // swaySeed
        seeds[b + 5] = 1.4 + rand() * 2.2; // size
        seeds[b + 6] = 0.75 + rand() * 0.5; // speed multiplier
        lifespans[i] = BASE_LIFESPAN / (seeds[b + 6] ?? 1);
      }
    };

    // Eased pointer-bend scalar: 0 vertical .. 1 fully leaning. Lives across
    // frames as plain closure state (not React), advanced once per frame.
    let bend = 0;

    // Coarse pass-rate bucketing for onEmberPass, ref-held — no React state.
    let bucketStart = 0;
    let bucketCount = 0;
    let lastRate = -1;
    let lastRespawnCycle = new Float32Array(0);

    const drawFrame = (t: number, live: boolean) => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);

      const pointer = pointerRef.current;
      if (live) {
        const target = pointer.active ? 1 : 0;
        bend = lerp(bend, target, BEND_EASE);
      } else {
        bend = 0;
      }
      const pointerX = pointer.active ? pointer.x : centerX;
      const pointerBandY = pointer.active ? pointer.y : baseY;

      let passes = 0;
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < emberCount; i++) {
        const b = i * A;
        const spawnT = seeds[b] ?? 0;
        const x0 = seeds[b + 1] ?? 0;
        const swayFreq = seeds[b + 2] ?? 1;
        const swayAmp = seeds[b + 3] ?? 10;
        const swaySeed = seeds[b + 4] ?? 0;
        const size = seeds[b + 5] ?? 2;
        const lifespan = lifespans[i] ?? BASE_LIFESPAN;

        // Local cycle position in [0,1): staggered by spawnT, looping on the
        // ember's own lifespan — a pure function of the rebasable clock, so
        // respawn is a deterministic phase wrap, never a setState edge.
        const cyclePos = live
          ? (((t / lifespan + spawnT) % 1) + 1) % 1
          : spawnT;

        // Detect a wrap (respawn) for the coarse pass-rate counter only.
        if (live) {
          const prev = lastRespawnCycle[i] ?? cyclePos;
          if (cyclePos < prev) passes += 1;
          lastRespawnCycle[i] = cyclePos;
        }

        const rise = cyclePos; // 0 at base, 1 at the top
        const y = baseY - rise * height2;

        // Turbulence grows as the plume thins near the top.
        const swayPhase = live ? t : STATIC_T;
        const sway =
          Math.sin(swayPhase * swayFreq + swaySeed) * swayAmp * (0.25 + rise * 0.85);

        // Pointer pull: embers nearer the pointer's own height lean hardest
        // (falloff by vertical distance from the pointer band, in units of
        // the stage height), tapering to a soft floor so the whole column
        // still drifts together; the term is scaled by the eased `bend`, so
        // it fades in and out with pointer presence rather than snapping.
        const bandFalloff = 1 - Math.min(1, Math.abs(y - pointerBandY) / (height2 * 0.7));
        const pull = (pointerX - centerX) * bend * (0.3 + bandFalloff * 0.7);

        const x = centerX + x0 + sway + pull;

        // Brightness/size envelope: quick ramp off the base, slow fade near
        // the top. Kept as a simple smoothstep-ish curve, cheap per ember.
        const envelope =
          rise < 0.12
            ? rise / 0.12
            : rise > 0.55
              ? Math.max(0, 1 - (rise - 0.55) / 0.45)
              : 1;
        if (envelope <= 0.01) continue;

        const radius = size * (0.55 + envelope * 0.7) * (1 - rise * 0.35);
        const heat = clamp(1 - rise * 1.05, 0, 1);
        ctx.fillStyle = heat > 0.5 ? hot : heat > 0.18 ? ember : cool;
        ctx.globalAlpha = envelope * (0.35 + heat * 0.55);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.4, radius), 0, TAU);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (live) {
        // Coarse, deduped pass-rate callback — a plain function call from
        // inside the imperative loop, never a per-frame React setState.
        bucketCount += passes;
        if (t - bucketStart >= RATE_WINDOW) {
          const rate = bucketCount / Math.max(t - bucketStart, RATE_WINDOW);
          bucketStart = t;
          bucketCount = 0;
          if (Math.round(rate * 10) !== lastRate) {
            lastRate = Math.round(rate * 10);
            onEmberPassRef.current?.(rate);
          }
        }
      }
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;
    let lastBendState: "STEADY" | "BENT" = "STEADY";

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      drawFrame(t, true);
      const nextState: "STEADY" | "BENT" = bend > 0.15 ? "BENT" : "STEADY";
      if (nextState !== lastBendState) {
        lastBendState = nextState;
        setDraftState(nextState);
      }
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the column resumes, not jumps.
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
      if (lastRespawnCycle.length < emberCount) {
        lastRespawnCycle = new Float32Array(emberCount);
      }
      // Reduced motion redraws its single designed frame; the live loop
      // simply picks the new size up on its next frame.
      if (!motionSafe) drawFrame(STATIC_T, false);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawFrame(STATIC_T, false);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts and the pointer does
    // nothing — no gates or pointer wiring to watch.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    const onPointerMove = (event: PointerEvent) => {
      const box = container.getBoundingClientRect();
      pointerRef.current.x = event.clientX - box.left;
      pointerRef.current.y = event.clientY - box.top;
      pointerRef.current.active = true;
    };
    const onPointerLeave = () => {
      pointerRef.current.active = false;
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
  }, [emberCount, motionSafe, uid]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span role="status" aria-live="polite" className="sr-only">
        {`${ariaLabel}: draft ${draftState === "BENT" ? "bent" : "steady"}`}
      </span>
    </div>
  );
}
