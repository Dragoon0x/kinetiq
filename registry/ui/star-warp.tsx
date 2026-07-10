"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, seeded, clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Stars respawn once they pass this near-plane distance. */
const NEAR_PLANE = 0.02;
/** Slow drift outward from center — the default resting speed. */
const CRUISE_SPEED = 0.06;
/** Fast advance toward the viewer while held. */
const WARP_SPEED = 1.35;
/** Per-frame lerp factor easing warpLevel toward its target (~2 frames to settle). */
const WARP_EASE = 0.42;
/** Per-frame lerp factor easing the vanishing point toward the pointer target. */
const STEER_EASE = 0.12;
/** Pointer offset from center is clamped to this fraction of the half-extent. */
const STEER_CLAMP = 0.6;
const TAU = Math.PI * 2;
const MAX_COUNT = 400;
const DEFAULT_COUNT = 180;

export type StarWarpProps = {
  /** Star population. @default 180, capped at 400. */
  count?: number;
  /** Fires on warp start/stop, deduped. */
  onWarp?: (warping: boolean) => void;
  /** Canvas height, px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

type Star = {
  x: number;
  y: number;
  z: number;
  /** Advances on every respawn so the reseed sequence never repeats. */
  gen: number;
};

/** Deterministic seed stream for star `index`'s `gen`-th spawn — no Math.random. */
const spawnStream = (index: number, gen: number) =>
  seeded(djb2(`star-warp:${index}:${gen}`));

/** Reseat a star at the far plane with a fresh deterministic (x, y). */
const respawn = (star: Star, index: number) => {
  star.gen += 1;
  const rand = spawnStream(index, star.gen);
  star.x = rand() * 2 - 1;
  star.y = rand() * 2 - 1;
  star.z = 1;
};

const makeStars = (count: number): Star[] => {
  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    const rand = spawnStream(i, 0);
    const star: Star = {
      x: rand() * 2 - 1,
      y: rand() * 2 - 1,
      // Spread initial depth across the whole cruise so stars don't arrive in a pulse.
      z: 0.05 + rand() * 0.95,
      gen: 0,
    };
    stars.push(star);
  }
  return stars;
};

/**
 * A starfield that streams past and warps to streaks while held; steer it
 * with the pointer. Reduced motion is a static sparse field.
 *
 * Stars are seeded deterministically (djb2 + seeded, no Math.random) with
 * (x, y, z): x/y in [-1, 1], z in (0, 1]. Each frame z advances toward the
 * viewer and (x/z, y/z) projects to screen space around a vanishing point
 * that eases toward the pointer. Holding the canvas, the Hold-to-warp
 * button, or Space ramps a warpLevel (plain per-frame lerp, no springs)
 * that speeds z's advance and switches stars from points to streaks drawn
 * from their previous projected position to their current one. Passing the
 * near plane reseeds a star deterministically at the far plane.
 *
 * Canvas discipline follows Wavefield: DPR capped at 2, a ResizeObserver
 * sizes the backing store, the one rAF loop is gated by an
 * IntersectionObserver (offscreen) and visibilitychange (hidden) and
 * rebases its clock on resume so motion never jumps, colors resolve from
 * CSS variables once at setup and again on a MutationObserver watching
 * `documentElement` class/data-theme, and everything tears down on unmount.
 */
export function StarWarp({
  count = DEFAULT_COUNT,
  onWarp,
  height = 300,
  className,
  "aria-label": ariaLabel = "Star warp field. Hold to jump to warp, move to steer.",
}: StarWarpProps) {
  const motionSafe = useMotionSafe();
  const starCount = Math.max(1, Math.min(MAX_COUNT, Math.round(count)));

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);

  // Held flags live in a ref so the rAF loop reads live intent without
  // rescheduling; only threshold crossings (warping true/false) hit state.
  const heldRef = React.useRef({ canvas: false, button: false, space: false });
  const onWarpRef = React.useRef(onWarp);
  React.useEffect(() => {
    onWarpRef.current = onWarp;
  });
  // Under RM there is no rAF loop polling heldRef every frame, so the Hold
  // button and Space need a way to force one static repaint on press/release.
  // Assigned inside the effect (closing over drawStatic/emitWarp), called
  // from the button handlers below — same "ref assigned in an effect" shape
  // as the rAF tick reschedule.
  const syncHeldRef = React.useRef<(() => void) | null>(null);

  const [warping, setWarping] = React.useState(false);
  const [statusText, setStatusText] = React.useState("Cruise");

  // All canvas work lives here: sizing, theming, star field, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    // Far stars in --ink-3 (the house's dimmest text tone), mid stars in
    // --ink-2, and near/warping stars in --accent-bright — cobalt reads as
    // "interactive," which a hand-steered warp is; --signal is reserved for
    // live data, never decoration, so it stays out of this palette.
    let dim = "";
    let mid = "";
    let hot = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      dim = read("--ink-3", "#8a8f9b");
      mid = read("--ink-2", "#c8ccd6");
      hot = read("--accent-bright", read("--primary", "#6478f0"));
    };
    resolveColors();

    // --- star field: seeded once per mount/count change --------------------
    const stars = makeStars(starCount);

    // --- geometry: rebuilt only in the ResizeObserver callback ------------
    let width = 0;
    let height2 = 0;
    let cx = 0;
    let cy = 0;
    let targetCx = 0;
    let targetCy = 0;

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
      if (cx === 0 && cy === 0) {
        cx = width / 2;
        cy = height2 / 2;
        targetCx = cx;
        targetCy = cy;
      }
      if (!motionSafe) drawStatic();
    };

    // --- pointer steering: target vanishing-point offset, clamped ---------
    const setSteerTarget = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = (clientX - rect.left) / rect.width - 0.5;
      const ny = (clientY - rect.top) / rect.height - 0.5;
      const maxX = (width / 2) * STEER_CLAMP;
      const maxY = (height2 / 2) * STEER_CLAMP;
      targetCx = width / 2 + clamp(nx * width, -maxX, maxX);
      targetCy = height2 / 2 + clamp(ny * height2, -maxY, maxY);
    };

    // --- warp level: plain per-frame lerp toward the held target ----------
    let warpLevel = 0;
    let wasWarping = false;

    const emitWarp = (next: boolean) => {
      if (next === wasWarping) return;
      wasWarping = next;
      setWarping(next);
      setStatusText(next ? "Warp" : "Cruise");
      onWarpRef.current?.(next);
    };

    // Streak length grows with warpLevel and how close the star already is —
    // trailLevel 0 draws a point; >0 draws a line back along the star's own
    // ray to where it was a moment ago, so no per-frame history is needed.
    const projectAndDraw = (star: Star, spread: number, trailLevel: number) => {
      const sx = cx + (star.x / star.z) * spread;
      const sy = cy + (star.y / star.z) * spread;
      const depth = clamp(1 - star.z, 0, 1);
      const radius = mapRange(depth, 0, 1, 0.5, 2.4);
      const alpha = mapRange(depth, 0, 1, 0.25, 1);
      const color = depth > 0.72 ? hot : depth > 0.4 ? mid : dim;
      ctx.globalAlpha = alpha;
      if (trailLevel > 0) {
        const trailZ = Math.min(1, star.z + trailLevel * (0.05 + star.z * 0.4));
        const psx = cx + (star.x / trailZ) * spread;
        const psy = cy + (star.y / trailZ) * spread;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(0.6, radius * 0.9);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(psx, psy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, TAU);
        ctx.fill();
      }
    };

    const drawFrame = (dt: number) => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);

      cx += (targetCx - cx) * STEER_EASE;
      cy += (targetCy - cy) * STEER_EASE;

      const held =
        heldRef.current.canvas || heldRef.current.button || heldRef.current.space;
      const target = held ? 1 : 0;
      warpLevel += (target - warpLevel) * WARP_EASE;
      if (warpLevel < 0.002) warpLevel = 0;
      if (warpLevel > 0.998) warpLevel = 1;
      emitWarp(warpLevel > 0.5);

      const speed = CRUISE_SPEED + (WARP_SPEED - CRUISE_SPEED) * warpLevel;
      const spread = Math.min(width, height2) * 0.46;
      const trailLevel = warpLevel > 0.08 ? warpLevel : 0;

      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i];
        if (!star) continue;
        star.z -= speed * dt;
        if (star.z <= NEAR_PLANE) {
          respawn(star, i);
        }
        projectAndDraw(star, spread, trailLevel);
      }
      ctx.globalAlpha = 1;
    };

    /** RM: one calm static frame — sparse points at rest, denser streak-hint when posed. */
    const drawStatic = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      const spread = Math.min(width, height2) * 0.46;
      const posed = heldRef.current.canvas || heldRef.current.button || heldRef.current.space;
      const stride = posed ? 1 : 2; // "warp pose" thins less — denser streak-hint
      const trailLevel = posed ? 0.6 : 0;
      for (let i = 0; i < stars.length; i += stride) {
        const star = stars[i];
        if (!star) continue;
        projectAndDraw(star, spread, trailLevel);
      }
      ctx.globalAlpha = 1;
    };

    // Lets the Hold button / Space (handled outside this effect) force a
    // static repaint + deduped onWarp under RM, where no rAF loop is polling.
    if (!motionSafe) {
      syncHeldRef.current = () => {
        const posed = heldRef.current.canvas || heldRef.current.button || heldRef.current.space;
        emitWarp(posed);
        drawStatic();
      };
    }

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let lastElapsed = 0;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const elapsed = (now - started) / 1000;
      const dt = Math.max(0, Math.min(0.1, elapsed - lastElapsed));
      lastElapsed = elapsed;
      drawFrame(dt);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the field resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        lastElapsed = started === null ? 0 : (performance.now() - started) / 1000;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    measure();

    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawStatic();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

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
      drawStatic(); // first paint before the loop's first rAF tick lands
    } else {
      drawStatic();
    }

    // --- pointer: steer always; canvas press also arms warp ---------------
    const onPointerMove = (event: PointerEvent) => {
      setSteerTarget(event.clientX, event.clientY);
      if (!motionSafe) drawStatic();
    };
    const onPointerDown = (event: PointerEvent) => {
      heldRef.current.canvas = true;
      setSteerTarget(event.clientX, event.clientY);
      if (!motionSafe) {
        emitWarp(true);
        drawStatic();
      }
    };
    const releaseCanvas = () => {
      if (!heldRef.current.canvas) return;
      heldRef.current.canvas = false;
      if (!motionSafe) {
        const stillHeld = heldRef.current.button || heldRef.current.space;
        emitWarp(stillHeld);
        drawStatic();
      }
    };
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerup", releaseCanvas);
    canvas.addEventListener("pointerleave", releaseCanvas);
    canvas.addEventListener("pointercancel", releaseCanvas);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", releaseCanvas);
      canvas.removeEventListener("pointerleave", releaseCanvas);
      canvas.removeEventListener("pointercancel", releaseCanvas);
      syncHeldRef.current = null;
    };
  }, [starCount, motionSafe]);

  // --- the Hold-to-warp button: pointer + Space, keyboard-operable -------
  // Under motion-safe the rAF loop polls heldRef every frame; under RM
  // there is no loop, so each mutation also pokes syncHeldRef to force one
  // static repaint (a no-op ref call when motion-safe, since it's only
  // assigned inside the effect when !motionSafe).
  const setButtonHeld = (held: boolean) => {
    heldRef.current.button = held;
    syncHeldRef.current?.();
  };
  const handleButtonPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setButtonHeld(true);
  };
  const releaseButton = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setButtonHeld(false);
  };
  const handleButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    if (event.repeat) return; // a held Space auto-repeats keydown; ignore the echo
    heldRef.current.space = true;
    syncHeldRef.current?.();
  };
  const handleButtonKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    heldRef.current.space = false;
    syncHeldRef.current?.();
  };
  /** Losing focus mid-hold (Tab away, window blur) must release both paths. */
  const handleButtonBlur = () => {
    heldRef.current.space = false;
    setButtonHeld(false);
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)} style={{ height }}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full touch-none rounded-2"
      />
      <button
        ref={buttonRef}
        type="button"
        aria-label="Hold to warp"
        aria-pressed={warping}
        className="border-hairline text-label text-ink-3 bg-card/70 absolute bottom-2 left-2 rounded-2 border px-2 py-1 backdrop-blur-sm select-none focus-visible:ring-2 focus-visible:ring-cobalt-bright/40 focus-visible:outline-none"
        onPointerDown={handleButtonPointerDown}
        onPointerUp={releaseButton}
        onPointerCancel={releaseButton}
        onKeyDown={handleButtonKeyDown}
        onKeyUp={handleButtonKeyUp}
        onBlur={handleButtonBlur}
      >
        HOLD TO WARP
      </button>
      <p
        aria-hidden
        className="text-label text-ink-3 bg-card/70 absolute top-2 right-2 rounded-2 px-2 py-1 backdrop-blur-sm"
      >
        DRIVE &middot; {warping ? "WARP" : "CRUISE"}
      </p>
      <span role="status" aria-live="polite" className="sr-only">
        {ariaLabel} {statusText}.
      </span>
    </div>
  );
}
