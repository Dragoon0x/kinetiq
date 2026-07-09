"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Golden angle — the Fibonacci lattice's azimuthal step for even spacing. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Reduced motion draws exactly one frame at these angles — chosen for pose. */
const STATIC_YAW = 0.6;
const STATIC_PITCH = -0.35;
/** Idle drift: a slow constant yaw so the resting planet turns, never rushes. */
const IDLE_YAW_VELOCITY = 0.16;
/** Release momentum bleeds off over this timescale, back toward idle drift. */
const MOMENTUM_TAU = 0.9;
/** Pointer travel (px) before a press becomes a spin — protects taps/overlay. */
const DRAG_THRESHOLD = 3;
/** Angular velocity is clamped to a believable throw (rad/s). */
const MAX_SPIN = 9;
/** Pitch is bounded so the poles never cross the camera and invert. */
const MAX_PITCH = 1.2;
/** px→radians on drag: a full stage width spins roughly this many turns. */
const DRAG_TO_YAW = 0.009;
const DRAG_TO_PITCH = 0.007;

/**
 * djb2 over a small integer tuple, folded to [0, 1). The lattice itself is
 * fully determined by the point index, so seeding is only needed for the
 * idle pitch phase — deterministic and SSR-safe, with no Math.random anywhere
 * near render.
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

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

export type PointGlobeProps = {
  /** Dots on the sphere. @default 520, clamped to [120, 700]. */
  points?: number;
  className?: string;
  /** px stage height. @default 340 */
  height?: number;
  /** Idle drift — a slow constant yaw when ungrabbed. @default true */
  autoRotate?: boolean;
  /** Overlay content, rendered in a layer above the canvas. */
  children?: React.ReactNode;
};

/**
 * A slowly rotating globe of points spread evenly over a sphere via the
 * Fibonacci lattice. It auto-drifts when idle; grab and spin it and it carries
 * angular momentum that decays exponentially back to the drift. Points nearer
 * the camera draw larger and brighter (the near cap in `--signal`), the far
 * hemisphere dims toward `--ink-3` — a crisp dotted planet with real depth.
 *
 * Mirrors the canvas discipline of IronFilings/Wavefield: the canvas is
 * DPR-aware (capped at 2) and sized by a ResizeObserver via setTransform;
 * colors resolve from CSS variables once per mount and re-resolve when the
 * html class flips theme; the single rAF loop pauses while the document is
 * hidden or the stage is offscreen (rebasing its clock over the pause so
 * rotation resumes rather than jumps); rotation, pointer and velocity all live
 * in refs and never touch React state.
 *
 * Perf: budget ≤3ms/frame at ~800×500 with up to ~700 points. The unit sphere
 * is precomputed once (rebuilt only when `points` changes); each frame rotates
 * every point with a couple of precomputed multiply-adds, projects it, and
 * fills one dot — no per-frame allocation (projected depth reuses a Float32
 * scratch, drawn back-to-front by a cached depth-sorted index order).
 *
 * Reduced motion: exactly one static frame — the globe at a fixed pleasing
 * rotation, no loop, no auto-rotate and no momentum. Resize and theme flips
 * still repaint that single frame.
 */
export function PointGlobe({
  points = 520,
  className,
  height = 340,
  autoRotate = true,
  children,
}: PointGlobeProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Rotation state + angular velocity, integrated imperatively each frame.
  const rotationRef = React.useRef({ yaw: STATIC_YAW, pitch: STATIC_PITCH });
  const velocityRef = React.useRef({ yaw: 0, pitch: 0 });
  // Drag bookkeeping: pointer id, last position/time, smoothed angular vel,
  // and whether the press has crossed the threshold into a spin.
  const dragRef = React.useRef({
    id: -1,
    active: false,
    engaged: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastT: 0,
    vYaw: 0,
    vPitch: 0,
  });
  const [grabbing, setGrabbing] = React.useState(false);

  // All canvas work lives here: sizing, theming, geometry, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const count = clamp(Math.round(points), 120, 700);
    const rotation = rotationRef.current;
    const velocity = velocityRef.current;
    const drag = dragRef.current;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let near = "";
    let mid = "";
    let far = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      // Near cap glows in --signal; the body reads --ink-2; the far hemisphere
      // dims to --ink-3 (falling back through the hairline like iron-filings).
      near = read("--signal", read("--primary", "#6478f0"));
      mid = read("--ink-2", read("--muted-foreground", "#b6bac2"));
      far = read("--ink-3", read("--hairline-strong", "#8a8f9b"));
    };
    resolveColors();

    // --- geometry: unit sphere precomputed once (rebuilt on `points`) ------
    // Layout: [x, y, z] per point on the unit sphere. `depth` is the per-frame
    // rotated-z scratch; `order` is the back-to-front draw order (cached and
    // re-sorted in place each frame). `projX`/`projY` hold projected screen
    // coords so the draw pass never recomputes the rotation.
    const sphere = new Float32Array(count * 3);
    const depth = new Float32Array(count);
    const projX = new Float32Array(count);
    const projY = new Float32Array(count);
    // A small deterministic per-point size scale (djb2, never Math.random) so
    // the lattice reads as scattered grains rather than a mechanical grid.
    const grain = new Float32Array(count);
    const order = new Int32Array(count);
    const denom = count > 1 ? count - 1 : 1;
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / denom) * 2; // top (+1) → bottom (−1)
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * GOLDEN_ANGLE;
      sphere[i * 3] = Math.cos(theta) * r;
      sphere[i * 3 + 1] = y;
      sphere[i * 3 + 2] = Math.sin(theta) * r;
      grain[i] = 0.82 + djb2(i, 1, 17) * 0.36;
      order[i] = i;
    }

    // --- stage metrics: recomputed only in the ResizeObserver callback ----
    let width = 0;
    let height2 = 0;
    let cx = 0;
    let cy = 0;
    let radius = 0;

    const drawFrame = (t: number) => {
      if (width <= 0 || height2 <= 0 || radius <= 0) return;
      ctx.clearRect(0, 0, width, height2);

      // Rotate about Y (yaw), then X (pitch). A faint clock-driven wobble folds
      // into the effective pitch so the resting planet never looks frozen; it
      // is derived from the clock, not accumulated, so it never fights the
      // momentum integrator. Precompute the frame's trig — each point then
      // costs only multiply-adds.
      const cosY = Math.cos(rotation.yaw);
      const sinY = Math.sin(rotation.yaw);
      const pitch = rotation.pitch + Math.sin(t * 0.5) * 0.02;
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      for (let i = 0; i < count; i++) {
        const x0 = sphere[i * 3] ?? 0;
        const y0 = sphere[i * 3 + 1] ?? 0;
        const z0 = sphere[i * 3 + 2] ?? 0;
        // Yaw around Y.
        const xz = x0 * cosY + z0 * sinY;
        const zz = -x0 * sinY + z0 * cosY;
        // Pitch around X.
        const yz = y0 * cosP - zz * sinP;
        const zRot = y0 * sinP + zz * cosP;
        depth[i] = zRot;
        // Orthographic projection at the globe radius (y flips: screen-down).
        projX[i] = cx + xz * radius;
        projY[i] = cy - yz * radius;
      }

      // Depth sort back-to-front (insertion sort — `order` is already nearly
      // sorted frame to frame, so this stays near O(n) and allocates nothing).
      for (let a = 1; a < count; a++) {
        const key = order[a] ?? 0;
        const kd = depth[key] ?? 0;
        let b = a - 1;
        while (b >= 0 && (depth[order[b] ?? 0] ?? 0) > kd) {
          order[b + 1] = order[b] ?? 0;
          b--;
        }
        order[b + 1] = key;
      }

      // Draw far→near. Radius and alpha scale with rotated z (front = bigger,
      // brighter); color steps ink-3 → ink-2 → signal across the depth.
      for (let k = 0; k < count; k++) {
        const i = order[k] ?? 0;
        const z = depth[i] ?? 0;
        // Map z ∈ [−1, 1] → f ∈ [0, 1] (0 far, 1 near).
        const f = z * 0.5 + 0.5;
        const rad = (0.6 + f * f * 1.9) * (grain[i] ?? 1);
        ctx.globalAlpha = 0.16 + f * 0.84;
        ctx.fillStyle = f > 0.72 ? near : f > 0.4 ? mid : far;
        const px = projX[i] ?? 0;
        const py = projY[i] ?? 0;
        if (rad <= 1) {
          ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let last: number | null = null;
    let clock = 0;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (last === null) {
        last = now;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      clock += dt;

      if (!drag.active) {
        // Idle target: the constant drift (or zero when auto-rotate is off).
        const targetYaw = autoRotate ? IDLE_YAW_VELOCITY : 0;
        // Framerate-independent exponential approach toward the idle drift.
        const decay = 1 - Math.exp(-dt / MOMENTUM_TAU);
        velocity.yaw += (targetYaw - velocity.yaw) * decay;
        velocity.pitch += (0 - velocity.pitch) * decay;
        rotation.yaw += velocity.yaw * dt;
        rotation.pitch = clamp(
          rotation.pitch + velocity.pitch * dt,
          -MAX_PITCH,
          MAX_PITCH,
        );
      }
      // While dragging, rotation is written directly by the move handler; the
      // loop only needs to keep repainting.
      drawFrame(clock);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so rotation resumes, not jumps.
        last = null;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // Sizing — DPR-aware (capped at 2); stage metrics recompute here only.
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
      cx = width / 2;
      cy = height2 / 2;
      // Leave a margin so the near-cap dots never clip the stage edge.
      radius = Math.min(width, height2) * 0.42;
      // Reduced motion redraws its single designed frame; the live loop simply
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

    // --- pointer: grab-and-spin with momentum on release -----------------
    // Under reduced motion the loop never starts; dragging rotates the static
    // pose with an immediate 1:1 redraw (no inertia), which stays legible.
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      drag.id = event.pointerId;
      drag.active = true;
      drag.engaged = false;
      drag.startX = event.clientX;
      drag.startY = event.clientY;
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastT = event.timeStamp;
      drag.vYaw = 0;
      drag.vPitch = 0;
      // Stop any inherited momentum the instant the globe is seized.
      velocity.yaw = 0;
      velocity.pitch = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.id) return;

      const totalDx = event.clientX - drag.startX;
      const totalDy = event.clientY - drag.startY;
      if (!drag.engaged) {
        if (Math.hypot(totalDx, totalDy) < DRAG_THRESHOLD) return;
        // Crossed the threshold — this is a spin. Capture now so taps on the
        // overlay still get their own click.
        drag.engaged = true;
        container.setPointerCapture(event.pointerId);
        setGrabbing(true);
      }

      const dx = event.clientX - drag.lastX;
      const dy = event.clientY - drag.lastY;
      const dt = (event.timeStamp - drag.lastT) / 1000;
      // Map pointer travel to rotation and write it straight into the angles.
      const dYaw = dx * DRAG_TO_YAW;
      const dPitch = dy * DRAG_TO_PITCH;
      rotation.yaw += dYaw;
      rotation.pitch = clamp(rotation.pitch + dPitch, -MAX_PITCH, MAX_PITCH);
      if (dt > 0) {
        // Smooth the angular velocity so the release fling reads intent.
        drag.vYaw = drag.vYaw * 0.4 + (dYaw / dt) * 0.6;
        drag.vPitch = drag.vPitch * 0.4 + (dPitch / dt) * 0.6;
      }
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastT = event.timeStamp;
      // Under RM there is no loop — redraw the moved pose immediately, 1:1.
      if (!motionSafe) drawFrame(0);
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== drag.id) return;
      const wasEngaged = drag.engaged;
      drag.active = false;
      drag.engaged = false;
      drag.id = -1;
      if (container.hasPointerCapture?.(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      if (!wasEngaged) return; // A tap — nothing to fling.
      setGrabbing(false);
      // Hand the smoothed pointer velocity to the momentum integrator; it will
      // decay back toward the idle drift.
      velocity.yaw = clamp(drag.vYaw, -MAX_SPIN, MAX_SPIN);
      velocity.pitch = clamp(drag.vPitch, -MAX_SPIN, MAX_SPIN);
    };

    // Under reduced motion the loop never starts — no gates to watch — but the
    // pointer wiring stays so the static pose can still be turned 1:1.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
    } else {
      // One static frame; measure() may have run before colors settled.
      drawFrame(0);
    }

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", onPointerEnd);
    container.addEventListener("pointercancel", onPointerEnd);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerEnd);
      container.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [points, autoRotate, motionSafe]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative touch-none select-none",
        motionSafe && (grabbing ? "cursor-grabbing" : "cursor-grab"),
        className,
      )}
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
