"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;

/** Particle stride: x, y, vx, vy, trail-x, trail-y, size, tint select. */
const STRIDE = 8;

/** Softened inverse-square pull: F = G / (dist² + SOFTEN). */
const G = 5200;
const SOFTEN = 900;
/** Velocity retained per frame at 60fps-equivalent — light orbital damping. */
const DAMPING = 0.9985;
/** Particles beyond this fraction of the panel diagonal are recaptured. */
const ESCAPE_FRACTION = 0.62;

/** Pointer speed (px/s) that reads as a fling. */
const FLING_SPEED = 1400;
/** Mean field speed (px/s) below which a slung field reads as settled. */
const SETTLE_SPEED = 70;
/** Outward + tangential burst imparted to nearby bodies on a detected fling. */
const FLING_BURST = 620;
/** Fling burst reaches only particles within this radius of the well. */
const FLING_RADIUS = 150;

/** Reduced motion draws exactly one static frame — two concentric rings. */
const RM_RINGS = [0.34, 0.62] as const;

export type GravityWellProps = {
  /** Orbiting body count, capped at 200. @default 120 */
  count?: number;
  /** Fires true on a detected fling, false once the field re-settles (deduped). */
  onFling?: (flung: boolean) => void;
  /** Panel height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A field of bodies orbiting a gravity well. The well is the pointer while it
 * hovers the panel — a softened inverse-square pull plus tangential seeding
 * settles bodies into elliptical orbits rather than a straight infall — and
 * eases back to the panel center when the pointer leaves. A fast flick reads
 * as a fling: nearby bodies gain an outward+tangential burst and slingshot
 * onto a hyperbolic arc before the well's gravity slowly recaptures them.
 *
 * Canvas 2D, DPR-aware (capped at 2), sized by a ResizeObserver. The one rAF
 * loop runs on a rebasable clock, gated by IntersectionObserver and
 * visibilitychange so it never spins offscreen or in a hidden tab. Colors
 * resolve from CSS variables once per mount and again on theme flips via a
 * MutationObserver on `<html class>`. Reduced motion skips the loop entirely
 * and draws one static frame: bodies at rest on two concentric orbital rings
 * around the centered well.
 */
export function GravityWell({
  count = 120,
  onFling,
  height = 300,
  className,
  "aria-label": ariaLabel = "Gravity well orbit field",
}: GravityWellProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const bodyCount = Math.max(1, Math.min(200, Math.round(count)));

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [fieldState, setFieldState] = React.useState<"bound" | "slung">(
    "bound",
  );

  // Latest-ref: the onFling callback is read from rAF/event handlers, never
  // from render, so it must not be a render-time dependency of the effect.
  const onFlingRef = React.useRef(onFling);
  React.useEffect(() => {
    onFlingRef.current = onFling;
  });

  // All canvas work lives here: sizing, theming, seeding, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let inkTwo = "";
    let inkThree = "";
    let primary = "";
    let signal = "";
    let accentBright = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      inkTwo = read("--ink-2", "#a3a8b5");
      inkThree = read("--ink-3", "#7a7f8c");
      primary = read("--primary", "#6478f0");
      signal = read("--signal", primary);
      accentBright = read("--accent-bright", primary);
    };
    resolveColors();

    // --- geometry, rebuilt only in the ResizeObserver callback ------------
    let width = 0;
    let height2 = 0;
    let panelCx = 0;
    let panelCy = 0;
    let escapeRadius = 0;

    // Bodies: stride-8 scratch, rebuilt (reseeded) on resize.
    let bodies = new Float32Array(0);

    const seedBodies = () => {
      const rand = seeded(djb2(`gravity-well:${bodyCount}`));
      bodies = new Float32Array(bodyCount * STRIDE);
      for (let i = 0; i < bodyCount; i++) {
        const base = i * STRIDE;
        // Seed on a ring around the panel center with tangential velocity so
        // bodies start already orbiting rather than falling straight in.
        const angle = rand() * TAU;
        const radius = (0.18 + rand() * 0.42) * Math.min(width, height2 || 1);
        const x = panelCx + Math.cos(angle) * radius;
        const y = panelCy + Math.sin(angle) * radius;
        const speed = (60 + rand() * 90) * (rand() < 0.5 ? 1 : -1);
        const tx = -Math.sin(angle) * speed;
        const ty = Math.cos(angle) * speed;
        bodies[base] = x;
        bodies[base + 1] = y;
        bodies[base + 2] = tx;
        bodies[base + 3] = ty;
        bodies[base + 4] = x;
        bodies[base + 5] = y;
        bodies[base + 6] = 0.7 + rand() * 1.3;
        bodies[base + 7] = Math.floor(rand() * 4);
      }
    };

    const rebuild = () => {
      panelCx = width / 2;
      panelCy = height2 / 2;
      escapeRadius = Math.hypot(width, height2) * ESCAPE_FRACTION;
      seedBodies();
    };

    // --- well + pointer state ----------------------------------------------
    // Eased well center (the pointer while hovering, else the panel center).
    let wellX = 0;
    let wellY = 0;
    let wellTargetX = 0;
    let wellTargetY = 0;
    let pointerActive = false;

    // Pointer velocity, tracked from timestamped samples for fling detection.
    let lastPointerX = 0;
    let lastPointerY = 0;
    let lastPointerT = 0;
    let pointerVX = 0;
    let pointerVY = 0;

    let flung = false;
    let meanSpeed = 0;

    const setFlung = (value: boolean) => {
      if (flung === value) return;
      flung = value;
      onFlingRef.current?.(value);
      setFieldState(value ? "slung" : "bound");
    };

    const applyFlingBurst = () => {
      const speed = Math.hypot(pointerVX, pointerVY);
      if (speed < FLING_SPEED) return;
      const dirX = pointerVX / speed;
      const dirY = pointerVY / speed;
      for (let i = 0; i < bodyCount; i++) {
        const base = i * STRIDE;
        const bx = bodies[base] ?? 0;
        const by = bodies[base + 1] ?? 0;
        const dx = bx - wellX;
        const dy = by - wellY;
        const dist = Math.hypot(dx, dy);
        if (dist > FLING_RADIUS) continue;
        const falloff = 1 - dist / FLING_RADIUS;
        // Outward along the pointer's travel, plus a tangential kick so the
        // escaping stream arcs rather than firing in a straight line.
        const tangentX = -dirY;
        const tangentY = dirX;
        const burst = FLING_BURST * falloff;
        bodies[base + 2] = (bodies[base + 2] ?? 0) + dirX * burst + tangentX * burst * 0.5;
        bodies[base + 3] = (bodies[base + 3] ?? 0) + dirY * burst + tangentY * burst * 0.5;
      }
      setFlung(true);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const now = performance.now();
      const dt = lastPointerT === 0 ? 0 : (now - lastPointerT) / 1000;
      if (dt > 0 && dt < 0.2) {
        pointerVX = (x - lastPointerX) / dt;
        pointerVY = (y - lastPointerY) / dt;
      }
      lastPointerX = x;
      lastPointerY = y;
      lastPointerT = now;
      pointerActive = true;
      wellTargetX = x;
      wellTargetY = y;
      applyFlingBurst();
    };
    const handlePointerLeave = () => {
      pointerActive = false;
      pointerVX = 0;
      pointerVY = 0;
      lastPointerT = 0;
      wellTargetX = panelCx;
      wellTargetY = panelCy;
    };

    // --- physics: semi-implicit Euler, softened inverse-square pull -------
    const step = (dt: number) => {
      // Well eases toward its target (pointer, or panel center when idle).
      wellX += (wellTargetX - wellX) * Math.min(1, dt * 6);
      wellY += (wellTargetY - wellY) * Math.min(1, dt * 6);

      let speedSum = 0;
      for (let i = 0; i < bodyCount; i++) {
        const base = i * STRIDE;
        let x = bodies[base] ?? 0;
        let y = bodies[base + 1] ?? 0;
        let vx = bodies[base + 2] ?? 0;
        let vy = bodies[base + 3] ?? 0;

        const dx = wellX - x;
        const dy = wellY - y;
        const distSq = dx * dx + dy * dy + SOFTEN;
        const pull = G / distSq;
        const dist = Math.sqrt(distSq);
        vx += (dx / dist) * pull * dt;
        vy += (dy / dist) * pull * dt;
        vx *= DAMPING;
        vy *= DAMPING;

        x += vx * dt;
        y += vy * dt;

        // Recapture: bodies drifting far off-panel wrap back near the well
        // on the opposite side, re-entering the field instead of vanishing.
        const fromWellX = x - wellX;
        const fromWellY = y - wellY;
        if (Math.hypot(fromWellX, fromWellY) > escapeRadius) {
          x = wellX - fromWellX * 0.08;
          y = wellY - fromWellY * 0.08;
          vx *= 0.3;
          vy *= 0.3;
        }

        bodies[base + 4] = bodies[base] ?? x;
        bodies[base + 5] = bodies[base + 1] ?? y;
        bodies[base] = x;
        bodies[base + 1] = y;
        bodies[base + 2] = vx;
        bodies[base + 3] = vy;
        speedSum += Math.hypot(vx, vy);
      }
      meanSpeed = speedSum / bodyCount;
      if (flung && meanSpeed < SETTLE_SPEED) setFlung(false);
    };

    // --- draw ----------------------------------------------------------
    const TINTS = [inkTwo, inkThree, primary, signal] as const;

    const drawWell = () => {
      const coreRadius = pointerActive ? 7 : 5;
      const glow = ctx.createRadialGradient(
        wellX,
        wellY,
        0,
        wellX,
        wellY,
        coreRadius * 8,
      );
      glow.addColorStop(0, accentBright);
      glow.addColorStop(0.35, accentBright);
      glow.addColorStop(1, "transparent");
      ctx.globalAlpha = pointerActive ? 0.32 : 0.18;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(wellX, wellY, coreRadius * 8, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = accentBright;
      ctx.beginPath();
      ctx.arc(wellX, wellY, coreRadius, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    const drawFrame = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      drawWell();

      for (let i = 0; i < bodyCount; i++) {
        const base = i * STRIDE;
        const x = bodies[base] ?? 0;
        const y = bodies[base + 1] ?? 0;
        const px = bodies[base + 4] ?? x;
        const py = bodies[base + 5] ?? y;
        const size = bodies[base + 6] ?? 1;
        const tintIndex = bodies[base + 7] ?? 0;
        const tint = TINTS[tintIndex] ?? primary;

        // Short alpha-decayed trail segment for the orbital streak.
        ctx.strokeStyle = tint;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = Math.max(0.5, size * 0.6);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.globalAlpha = 0.85;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawStaticFrame = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      wellX = panelCx;
      wellY = panelCy;
      pointerActive = false;
      drawWell();

      const rand = seeded(djb2(`gravity-well:rm:${bodyCount}`));
      const minSpan = Math.min(width, height2);
      for (let i = 0; i < bodyCount; i++) {
        const ring = RM_RINGS[i % RM_RINGS.length] ?? 0.34;
        const radius = ring * minSpan * 0.5;
        const angle = (i / bodyCount) * TAU * (i % 2 === 0 ? 1 : -1) + rand() * 0.3;
        const x = panelCx + Math.cos(angle) * radius;
        const y = panelCy + Math.sin(angle) * radius;
        const size = 0.7 + rand() * 1.1;
        const tint = TINTS[Math.floor(rand() * 4)] ?? primary;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = tint;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let lastFrameT: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (lastFrameT === null) lastFrameT = now;
      const dt = Math.min(0.05, (now - lastFrameT) / 1000);
      lastFrameT = now;
      step(dt);
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase over the pause so the field resumes, not jumps.
        if (lastFrameT !== null && pausedAt !== null) {
          lastFrameT += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(tick);
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
      wellX = panelCx;
      wellY = panelCy;
      wellTargetX = panelCx;
      wellTargetY = panelCy;
      if (!motionSafe) drawStaticFrame();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawStaticFrame();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts — no gates, no pointer.
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
      container.addEventListener("pointermove", handlePointerMove);
      container.addEventListener("pointerleave", handlePointerLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [bodyCount, motionSafe]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span className="sr-only" role="status" aria-live="polite">
        {fieldState === "slung"
          ? "Field slung — bodies escaping the well"
          : "Field bound — bodies in orbit"}
        {" — "}
        {ariaLabel}
      </span>
    </div>
  );
}
