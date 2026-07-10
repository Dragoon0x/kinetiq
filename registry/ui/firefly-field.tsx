"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Clamp band for `count` — cheap enough for one glow gradient each. */
const MIN_COUNT = 6;
const MAX_COUNT = 90;
/** Wander speed range, px/s, before the depth parallax scale. */
const MIN_SPEED = 6;
const MAX_SPEED = 16;
/** Heading drifts by up to this many rad/s — gentle wander, never a spin. */
const HEADING_DRIFT = 0.6;
/** Blink period range, seconds — each fly keeps its own seeded cycle. */
const MIN_BLINK_S = 2.2;
const MAX_BLINK_S = 5.2;
/** Body size range, CSS px radius, before depth scale. */
const MIN_RADIUS = 1.1;
const MAX_RADIUS = 2.1;
/** Glow radius is this many body-radii wide at full brightness. */
const GLOW_SPAN = 7;
/** Pointer/button attraction radius — flies outside coast on wander alone. */
const GATHER_RADIUS = 260;
/** Steering accel toward the gather point, px/s², capped so it never snaps. */
const GATHER_ACCEL = 130;
/** Velocity damping per second while gathering — keeps them milling, not collapsing. */
const GATHER_DAMPING = 2.6;
/** How fast a released fly's gather velocity bleeds back to plain wander. */
const RELEASE_DAMPING = 1.8;
/** Clamp the frame dt so a long paused/background gap can't teleport flies. */
const MAX_DT = 1 / 30;
/** Stride of the fly buffer: x, y, depth, heading, gvx, gvy. */
const STRIDE = 6;

const rand = (value: number, lo: number, hi: number) => lo + value * (hi - lo);

export type FireflyFieldProps = {
  /** Firefly count. @default 48 — clamped to [6, 90]. */
  count?: number;
  /** Fires on gather start/stop (deduped — never repeats the same value). */
  onGather?: (gathering: boolean) => void;
  /** px stage height when standalone (no sizing parent). @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A meadow of fireflies drawn on canvas: each wanders on its own gently
 * drifting heading and blinks — a soft glow easing on and off — on its own
 * seeded cycle. Depth (0 near .. 1 far) sets size, brightness, and wander
 * speed, so the field reads with parallax at rest. While the pointer is held
 * (or the keyboard Gather control is held), every fly steers toward it with
 * a capped acceleration and velocity damping, so they mill around the hand
 * rather than collapse onto it; releasing lets them disperse back to
 * wandering. The inverse of Swarm Field's scatter-away.
 *
 * Mirrors the house canvas discipline: DPR-aware (capped at 2) and sized by
 * a ResizeObserver; one rAF loop, rebased over pauses, gated on
 * visibilitychange and an IntersectionObserver; colors resolve from CSS
 * variables (`--signal` / `--accent-bright` for glow, `--ink-3` for dim
 * bodies) once per mount and again on theme flips. The pointer and gather
 * flag live in plain closure state fed by listeners — never React state
 * inside the loop.
 *
 * Reduced motion: exactly one static frame — fireflies at rest, each frozen
 * at a fixed point of its own blink cycle. No loop, no wander, no gather
 * motion; the Gather control still fires `onGather` and redraws a calm,
 * slightly-pulled-together static pose.
 */
export function FireflyField({
  count = 48,
  onGather,
  height = 300,
  className,
  "aria-label": ariaLabel = "Firefly field",
}: FireflyFieldProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [swarmState, setSwarmState] = React.useState<"wandering" | "gathering">(
    "wandering",
  );

  // Bridge ref: lets the real keyboard/pointer Gather button reach the main
  // effect's closure state without lifting the sim into React state.
  const gatherBridgeRef = React.useRef<{
    begin: () => void;
    end: () => void;
  } | null>(null);
  const keyHeldRef = React.useRef(false);

  // LATEST-REF: the callback prop is read from inside the effect's closures
  // (event/animation callbacks), never during render.
  const onGatherRef = React.useRef(onGather);
  React.useEffect(() => {
    onGatherRef.current = onGather;
  });

  // All canvas work lives here: sizing, theming, the sim, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = Math.round(clamp(count, MIN_COUNT, MAX_COUNT));

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let glowColor = "";
    let dimColor = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      // Blink glow reaches for signal over accent-bright; bodies dim to ink-3.
      glowColor = read("--signal", read("--accent-bright", "#7dd3a8"));
      dimColor = read("--ink-3", "#8a8f9b");
    };
    resolveColors();

    // --- buffers: one fly per row, stride 6: x, y, depth, heading, gvx, gvy
    const flies = new Float32Array(n * STRIDE);
    // Per-fly seeded constants that never change after seeding.
    const speed = new Float32Array(n);
    const headingDrift = new Float32Array(n);
    const driftPhase = new Float32Array(n);
    const blinkPeriod = new Float32Array(n);
    const blinkPhase = new Float32Array(n);
    const radius = new Float32Array(n);
    let width = 0;
    let height2 = 0;

    /**
     * Seed flies into the current stage: deterministic djb2 positions,
     * depths, headings, and blink cycles. Called on every resize, but only
     * scatters the first time we have a real stage — afterwards it clamps
     * any fly a shrink left outside.
     */
    let seededOnce = false;
    const seedFlies = () => {
      if (width <= 0 || height2 <= 0) return;
      if (!seededOnce) {
        for (let i = 0; i < n; i++) {
          const base = i * STRIDE;
          const rnd = seeded(djb2(`firefly-${i}`));
          const depth = rnd();
          flies[base] = rnd() * width;
          flies[base + 1] = rnd() * height2;
          flies[base + 2] = depth;
          flies[base + 3] = rnd() * TAU;
          flies[base + 4] = 0;
          flies[base + 5] = 0;
          // Nearer (low depth) flies wander faster — parallax.
          speed[i] = rand(rnd(), MIN_SPEED, MAX_SPEED) * (1.4 - depth * 0.8);
          headingDrift[i] = rand(rnd(), -HEADING_DRIFT, HEADING_DRIFT);
          driftPhase[i] = rnd() * TAU;
          blinkPeriod[i] = rand(rnd(), MIN_BLINK_S, MAX_BLINK_S);
          blinkPhase[i] = rnd() * TAU;
          radius[i] = rand(rnd(), MIN_RADIUS, MAX_RADIUS);
        }
        seededOnce = true;
      } else {
        for (let i = 0; i < n; i++) {
          const base = i * STRIDE;
          flies[base] = clamp(flies[base] ?? 0, 0, width);
          flies[base + 1] = clamp(flies[base + 1] ?? 0, 0, height2);
        }
      }
    };

    // --- gather: plain closure state, fed by pointer + keyboard listeners -
    const gather = { x: 0, y: 0, active: false };
    let wasGathering = false;
    const fireGather = (active: boolean) => {
      if (wasGathering === active) return;
      wasGathering = active;
      onGatherRef.current?.(active);
      setSwarmState(active ? "gathering" : "wandering");
    };

    // --- one imperative simulation step -------------------------------------
    const step = (dt: number, t: number) => {
      const active = gather.active;
      for (let i = 0; i < n; i++) {
        const base = i * STRIDE;
        const depth = flies[base + 2] ?? 0;
        let baseHeading = flies[base + 3] ?? 0;
        let gvx = flies[base + 4] ?? 0;
        let gvy = flies[base + 5] ?? 0;
        let x = flies[base] ?? 0;
        let y = flies[base + 1] ?? 0;

        // The base heading turns slowly on its own seeded rate; a sine
        // wobble (seeded phase, off the rebased clock) rides on top so the
        // path reads as a gentle wander rather than a straight spiral.
        baseHeading += (headingDrift[i] ?? 0) * dt;
        const wobble = Math.sin(t * 0.5 + (driftPhase[i] ?? 0)) * 0.9;
        const heading = baseHeading + wobble;
        const wanderSpeed = (speed[i] ?? MIN_SPEED) * (1.1 - depth * 0.6);
        let vx = Math.cos(heading) * wanderSpeed;
        let vy = Math.sin(heading) * wanderSpeed;

        if (active) {
          // Steer toward the gather point: capped accel, falling off past
          // the gather radius so distant flies still wander in.
          const dx = gather.x - x;
          const dy = gather.y - y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1) {
            const pull = dist < GATHER_RADIUS ? 1 : GATHER_RADIUS / dist;
            const accel = GATHER_ACCEL * pull * (1.2 - depth * 0.5);
            gvx += (dx / dist) * accel * dt;
            gvy += (dy / dist) * accel * dt;
          }
          // Damping so flies mill around the point instead of collapsing.
          const damp = Math.max(0, 1 - GATHER_DAMPING * dt);
          gvx *= damp;
          gvy *= damp;
          vx += gvx;
          vy += gvy;
        } else if (gvx !== 0 || gvy !== 0) {
          // Released: bleed the gather velocity back out so dispersal is a
          // release, not an instant stop.
          const damp = Math.max(0, 1 - RELEASE_DAMPING * dt);
          gvx *= damp;
          gvy *= damp;
          if (Math.abs(gvx) < 0.05 && Math.abs(gvy) < 0.05) {
            gvx = 0;
            gvy = 0;
          }
          vx += gvx;
          vy += gvy;
        }

        x += vx * dt;
        y += vy * dt;

        // Soft wrap — a fly that wanders off one edge reappears on the other,
        // so the meadow always stays populated.
        const pad = 6;
        if (x < -pad) x += width + pad * 2;
        else if (x > width + pad) x -= width + pad * 2;
        if (y < -pad) y += height2 + pad * 2;
        else if (y > height2 + pad) y -= height2 + pad * 2;

        flies[base] = x;
        flies[base + 1] = y;
        flies[base + 3] = baseHeading;
        flies[base + 4] = gvx;
        flies[base + 5] = gvy;
      }
    };

    // --- draw the meadow -----------------------------------------------------
    /** Smooth 0..1 glow from a phase — eased, never a hard on/off toggle. */
    const glowAt = (phase: number) => {
      const raw = Math.sin(phase) * 0.5 + 0.5;
      return raw * raw * (3 - 2 * raw); // smoothstep — soft pulse in/out
    };

    const drawFrame = (t: number) => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      for (let i = 0; i < n; i++) {
        const base = i * STRIDE;
        const x = flies[base] ?? 0;
        const y = flies[base + 1] ?? 0;
        const depth = flies[base + 2] ?? 0;
        const r = (radius[i] ?? MIN_RADIUS) * (1.3 - depth * 0.6);
        const period = blinkPeriod[i] ?? MIN_BLINK_S;
        const phase = (blinkPhase[i] ?? 0) + (t / period) * TAU;
        const glow = glowAt(phase);
        const brightness = (1 - depth * 0.55) * (0.25 + glow * 0.75);

        // Dim resting body, always visible so depth/position read even
        // mid-blink-trough.
        ctx.globalAlpha = 0.14 + depth * -0.05 + 0.1;
        ctx.fillStyle = dimColor;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, r * 0.55), 0, TAU);
        ctx.fill();

        // Glow: soft radial gradient, brightness from the blink cycle.
        if (glow > 0.02) {
          const glowR = r * GLOW_SPAN * (0.5 + glow * 0.5);
          const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
          grad.addColorStop(0, glowColor);
          grad.addColorStop(1, "transparent");
          ctx.globalAlpha = clamp(brightness, 0, 1);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, glowR, 0, TAU);
          ctx.fill();

          // Bright core at the peak of the pulse.
          ctx.globalAlpha = clamp(brightness, 0, 1);
          ctx.fillStyle = glowColor;
          ctx.beginPath();
          ctx.arc(x, y, r * (0.4 + glow * 0.6), 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    /**
     * Settle flies into a calm, deterministic pose for the static (reduced
     * motion) frame — no loop, no wander. Positions/depths/blink phases stay
     * exactly as seeded (each fly frozen at its own seeded point in its
     * cycle); `gatherPull` nudges the resting positions partway toward the
     * gather point for the RM "gathered" pose without running the sim.
     */
    const settleStatic = (gatherPull: number) => {
      if (width <= 0 || height2 <= 0) return;
      if (gatherPull > 0) {
        for (let i = 0; i < n; i++) {
          const base = i * STRIDE;
          const x = flies[base] ?? 0;
          const y = flies[base + 1] ?? 0;
          const dx = gather.x - x;
          const dy = gather.y - y;
          drawX[i] = x + dx * gatherPull;
          drawY[i] = y + dy * gatherPull;
        }
        drawFrameStatic();
      } else {
        drawFrame(0);
      }
    };
    // Scratch positions used only by the RM gathered pose, so the seeded
    // rest positions themselves are never mutated.
    const drawX = new Float32Array(n);
    const drawY = new Float32Array(n);
    const drawFrameStatic = () => {
      ctx.clearRect(0, 0, width, height2);
      for (let i = 0; i < n; i++) {
        const x = drawX[i] ?? 0;
        const y = drawY[i] ?? 0;
        const depth = flies[(i * STRIDE) + 2] ?? 0;
        const r = (radius[i] ?? MIN_RADIUS) * (1.3 - depth * 0.6);
        const glow = glowAt(blinkPhase[i] ?? 0);
        const brightness = (1 - depth * 0.55) * (0.25 + glow * 0.75);
        ctx.globalAlpha = 0.19;
        ctx.fillStyle = dimColor;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, r * 0.55), 0, TAU);
        ctx.fill();
        if (glow > 0.02) {
          const glowR = r * GLOW_SPAN * (0.5 + glow * 0.5);
          const grad = ctx.createRadialGradient(x, y, 0, x, y, glowR);
          grad.addColorStop(0, glowColor);
          grad.addColorStop(1, "transparent");
          ctx.globalAlpha = clamp(brightness, 0, 1);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, glowR, 0, TAU);
          ctx.fill();
          ctx.fillStyle = glowColor;
          ctx.beginPath();
          ctx.arc(x, y, r * (0.4 + glow * 0.6), 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };
    /** Static gather-pull amount toward the RM "gathered" nudge pose. */
    let staticGatherPull = 0;

    // --- pointer: tracked in a plain object, updated by listeners ---------
    const setGatherPoint = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      gather.x = clientX - rect.left;
      gather.y = clientY - rect.top;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      setGatherPoint(e.clientX, e.clientY);
      gather.active = true;
      fireGather(true);
      if (!motionSafe) {
        staticGatherPull = 0.55;
        settleStatic(staticGatherPull);
      }
    };
    const onPointerMoveEvt = (e: PointerEvent) => {
      if (!gather.active) return;
      setGatherPoint(e.clientX, e.clientY);
    };
    const endGather = () => {
      if (!gather.active) return;
      gather.active = false;
      fireGather(false);
      if (!motionSafe) {
        staticGatherPull = 0;
        settleStatic(staticGatherPull);
      }
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const dt = Math.min(MAX_DT, (now - lastFrame) / 1000);
      lastFrame = now;
      const t = (now - started) / 1000;
      step(dt, t);
      drawFrame(t);
    };
    let lastFrame = 0;

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase over the pause so the meadow resumes rather than jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    // Sizing — DPR-aware (capped at 2). Geometry + seeding live here only.
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
      seedFlies();
      // Reduced motion redraws its single settled frame; the live loop just
      // picks the new size up on its next frame.
      if (!motionSafe) settleStatic(staticGatherPull);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) settleStatic(staticGatherPull);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Pointer-gather on the stage itself (the Gather button's own handlers,
    // defined in the JSX below, cover the keyboard/click path separately).
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    if (motionSafe) {
      container.addEventListener("pointerdown", onPointerDown);
      container.addEventListener("pointermove", onPointerMoveEvt);
      container.addEventListener("pointerup", endGather);
      container.addEventListener("pointerleave", endGather);
      container.addEventListener("pointercancel", endGather);
      intersection = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
    } else {
      // RM: pointer press still nudges the static gathered pose (no rAF).
      container.addEventListener("pointerdown", onPointerDown);
      container.addEventListener("pointerup", endGather);
      container.addEventListener("pointerleave", endGather);
      container.addEventListener("pointercancel", endGather);
    }

    // Expose the imperative gather entry points to the Gather button below
    // through gatherBridgeRef, so its own pointer/keyboard handlers can
    // reach this closure's state without re-running the effect.
    const bridge = {
      begin: () => {
        gather.x = width / 2;
        gather.y = height2 * 0.35;
        gather.active = true;
        fireGather(true);
        if (!motionSafe) {
          staticGatherPull = 0.55;
          settleStatic(staticGatherPull);
        }
      },
      end: endGather,
    };
    gatherBridgeRef.current = bridge;

    // Initial paint before the first resize fires, and the very first RM
    // frame if we mount already sized.
    measure();
    syncLoop();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMoveEvt);
      container.removeEventListener("pointerup", endGather);
      container.removeEventListener("pointerleave", endGather);
      container.removeEventListener("pointercancel", endGather);
      gatherBridgeRef.current = null;
    };
  }, [count, motionSafe]);

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={containerRef}
        style={{ height }}
        className="border-hairline bg-surface-0 relative touch-none overflow-hidden rounded-3 border select-none"
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
        <div className="absolute inset-x-0 bottom-2 flex justify-center">
          <button
            type="button"
            aria-label="Gather the fireflies — press and hold"
            aria-pressed={swarmState === "gathering"}
            className={cn(
              "border-hairline bg-card/80 text-label text-ink-3 rounded-2 border px-3 py-1 backdrop-blur",
              "focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none",
              swarmState === "gathering" && "text-cobalt-bright",
            )}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              gatherBridgeRef.current?.begin();
            }}
            onPointerUp={() => gatherBridgeRef.current?.end()}
            onPointerLeave={() => gatherBridgeRef.current?.end()}
            onPointerCancel={() => gatherBridgeRef.current?.end()}
            onKeyDown={(event) => {
              if ((event.key === " " || event.key === "Enter") && !keyHeldRef.current) {
                keyHeldRef.current = true;
                event.preventDefault();
                gatherBridgeRef.current?.begin();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") {
                keyHeldRef.current = false;
                gatherBridgeRef.current?.end();
              }
            }}
            onBlur={() => {
              if (keyHeldRef.current) {
                keyHeldRef.current = false;
                gatherBridgeRef.current?.end();
              }
            }}
          >
            Gather
          </button>
        </div>
      </div>
      <span className="sr-only" aria-live="polite" role="status">
        {swarmState === "gathering"
          ? `${ariaLabel}: gathering`
          : `${ariaLabel}: wandering`}
      </span>
    </div>
  );
}
