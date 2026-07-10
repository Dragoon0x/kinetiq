"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, djb2, mapRange, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Ambient drifter count, clamped so a dense hangar stays cheap. */
const MIN_COUNT = 3;
const MAX_COUNT = 14;
const DEFAULT_COUNT = 7;
/** Concurrent bezier flights — a burst of clicks recycles the oldest slot. */
const MAX_FLIGHTS = 6;
/** Seconds a launch takes to cross its full bezier arc. */
const FLIGHT_DURATION = 1.6;
/** Ambient drift speed range, normalized width units / second. */
const MIN_DRIFT = 0.028;
const MAX_DRIFT = 0.07;
/** Ambient glider size range, px half-length, before depth scale. */
const MIN_SIZE = 7;
const MAX_SIZE = 15;
/** Gentle vertical bob amplitude, px, riding on the drift heading. */
const BOB_AMPLITUDE = 5;
/** Reduced motion draws ambient gliders at this fixed drift phase. */
const STATIC_PHASE = 0.4;

const TAU = Math.PI * 2;

const rand = (value: number, lo: number, hi: number) => lo + value * (hi - lo);

/** Point on a cubic bezier at t, given four control points. */
const cubicPoint = (
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  t: number,
) => {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0x + b * p1x + c * p2x + d * p3x,
    y: a * p0y + b * p1y + c * p2y + d * p3y,
  };
};

/** Tangent (derivative) direction of a cubic bezier at t — used for heading. */
const cubicTangent = (
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  t: number,
) => {
  const mt = 1 - t;
  const dx =
    3 * mt * mt * (p1x - p0x) +
    6 * mt * t * (p2x - p1x) +
    3 * t * t * (p3x - p2x);
  const dy =
    3 * mt * mt * (p1y - p0y) +
    6 * mt * t * (p2y - p1y) +
    3 * t * t * (p3y - p2y);
  return Math.atan2(dy, dx);
};

export type PaperFlightProps = {
  /** Ambient drifting gliders. @default 7 — clamped to [3, 14]. */
  count?: number;
  /** Fires once per launch (ambient click, tap, or the Launch button). */
  onLaunch?: (index: number) => void;
  /** px stage height. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * Folded-paper gliders drift past the open hangar at seeded depths, each a
 * crisp dart silhouette (two swept wings and a center crease) heading
 * slowly across the panel with a gentle bob, wrapping at the edges on a
 * deterministic seed advance. Clicking anywhere on the panel — or pressing
 * the keyboard Launch control — sends one glider out of a small pool on a
 * cubic-bezier flight: it swoops from the launch point along a lifted arc,
 * rotating to face the curve's tangent, banking into turns, scaling by the
 * arc's implied depth, and fading out as it completes. `onLaunch` fires once
 * per launch with that flight's pool index.
 *
 * Canvas discipline mirrors Wavefield/RainPane: DPR-aware (capped at 2)
 * sizing via ResizeObserver + setTransform, a single rAF loop gated by
 * IntersectionObserver and visibilitychange with a rebased clock, colors
 * resolved from CSS variables (`--ink-2` / `--ink-3` for ambient bodies,
 * `--signal` / `--accent-bright` for the crease and flight highlight) once
 * per mount and re-resolved on theme flips via a MutationObserver on
 * <html class>, full teardown on unmount.
 *
 * Reduced motion: one static frame — a handful of ambient gliders posed
 * mid-drift at rest, no rAF. A click or the Launch control places exactly
 * one glider at a fixed mid-flight pose along its bezier (no animation) and
 * still fires `onLaunch`.
 */
export function PaperFlight({
  count = DEFAULT_COUNT,
  onLaunch,
  height = 300,
  className,
  "aria-label": ariaLabel = "Paper glider hangar",
}: PaperFlightProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [announcement, setAnnouncement] = React.useState("READY");

  // Bridge ref: lets the real keyboard/pointer Launch button reach the main
  // effect's closure state without lifting the sim into React state.
  const launchBridgeRef = React.useRef<(() => void) | null>(null);

  // LATEST-REF: onLaunch may be a fresh closure every render; the effect
  // below only depends on [motionSafe, driftTotal], so it's read through a
  // ref written in its own effect, never during render.
  const onLaunchRef = React.useRef(onLaunch);
  React.useEffect(() => {
    onLaunchRef.current = onLaunch;
  });

  const driftTotal = Math.round(clamp(count, MIN_COUNT, MAX_COUNT));

  // All canvas work lives here: sizing, theming, sim, pool, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let ink2 = "";
    let ink3 = "";
    let signal = "";
    let accentBright = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      ink2 = read("--ink-2", "#c4c9d4");
      ink3 = read("--ink-3", "#8a8f9b");
      signal = read("--signal", read("--accent-bright", "#7dd3a8"));
      accentBright = read("--accent-bright", signal);
    };
    resolveColors();

    // --- geometry: recomputed on resize ------------------------------------
    let width = 0;
    let height2 = 0;

    // --- ambient drifters: struct-of-arrays, seeded, stride-free -----------
    const n = driftTotal;
    const dx0 = new Float32Array(n); // normalized spawn x, 0..1
    const dy0 = new Float32Array(n); // normalized spawn y, 0..1
    const depth = new Float32Array(n); // 0 near .. 1 far
    const heading = new Float32Array(n); // radians, drift direction
    const driftSpeed = new Float32Array(n); // normalized width units/sec
    const bobPhase = new Float32Array(n); // radians, seeded bob offset
    const bobPeriod = new Float32Array(n); // seconds per bob cycle
    const seedState = new Uint32Array(n); // rolling seed for wrap respawn

    const baseSeed = djb2("paper-flight");

    const initGlider = (i: number) => {
      const gliderSeed = (baseSeed + i * 7919) >>> 0;
      const rnd = seeded(gliderSeed);
      const d = rnd();
      dx0[i] = rnd();
      dy0[i] = 0.12 + rnd() * 0.76;
      depth[i] = d;
      // Mostly left-to-right headings with mild vertical spread — reads as a
      // fleet drifting one way, never a chaotic swarm.
      heading[i] = rand(rnd(), -0.35, 0.35);
      driftSpeed[i] = rand(rnd(), MIN_DRIFT, MAX_DRIFT) * (1.5 - d * 0.9);
      bobPhase[i] = rnd() * TAU;
      bobPeriod[i] = rand(rnd(), 2.6, 4.4);
      seedState[i] = (gliderSeed + 0x9e3779b9) >>> 0;
    };
    for (let i = 0; i < n; i++) initGlider(i);

    // Respawn at the opposite edge with the seed advanced one step —
    // deterministic, never repeats the same reentry point twice running.
    const respawn = (i: number, fromRight: boolean) => {
      const rnd = seeded(seedState[i] ?? 0);
      dx0[i] = fromRight ? -0.06 : 1.06;
      dy0[i] = 0.12 + rnd() * 0.76;
      depth[i] = rnd();
      heading[i] = rand(rnd(), -0.35, 0.35);
      driftSpeed[i] = rand(rnd(), MIN_DRIFT, MAX_DRIFT) * (1.5 - (depth[i] ?? 0) * 0.9);
      bobPhase[i] = rnd() * TAU;
      seedState[i] = ((seedState[i] ?? 0) + 0x9e3779b9) >>> 0;
    };

    // Current ambient positions (px), advanced each frame from the seeded
    // spawn — kept separate from dx0/dy0 so respawn can reset the origin.
    const curX = new Float32Array(n);
    const curY = new Float32Array(n);
    const originT = new Float32Array(n); // clock time this glider last spawned
    let originSet = false;
    const resetOrigins = (t: number) => {
      for (let i = 0; i < n; i++) {
        curX[i] = (dx0[i] ?? 0) * width;
        curY[i] = (dy0[i] ?? 0) * height2;
        originT[i] = t;
      }
      originSet = true;
    };

    // --- flight pool: struct-of-arrays, fixed size, round-robin -----------
    const pool = {
      p0x: new Float32Array(MAX_FLIGHTS),
      p0y: new Float32Array(MAX_FLIGHTS),
      p1x: new Float32Array(MAX_FLIGHTS),
      p1y: new Float32Array(MAX_FLIGHTS),
      p2x: new Float32Array(MAX_FLIGHTS),
      p2y: new Float32Array(MAX_FLIGHTS),
      p3x: new Float32Array(MAX_FLIGHTS),
      p3y: new Float32Array(MAX_FLIGHTS),
      born: new Float32Array(MAX_FLIGHTS),
      depth: new Float32Array(MAX_FLIGHTS),
      active: new Uint8Array(MAX_FLIGHTS),
      cursor: 0,
      clock: 0,
    };
    let flightSeedTick = 0;
    let launchedCount = 0;

    /** Seeded bezier control points for a flight starting at (x, y). */
    const buildFlight = (x: number, y: number, seed: number) => {
      const rnd = seeded(seed);
      // Direction biases rightward like the ambient fleet, with a lifted arc:
      // the second control point rises well above the line to the endpoint,
      // reading as a swoop rather than a straight dash.
      const dir = rnd() < 0.5 ? 1 : -1;
      const reach = width * (0.34 + rnd() * 0.28);
      const endX = clamp(x + dir * reach, width * 0.05, width * 0.95);
      const endY = clamp(
        y + rand(rnd(), -0.3, 0.22) * height2,
        height2 * 0.08,
        height2 * 0.92,
      );
      const lift = height2 * (0.22 + rnd() * 0.2);
      const p1x = x + dir * reach * 0.32;
      const p1y = y - lift;
      const p2x = x + dir * reach * 0.68;
      const p2y = Math.min(endY, y) - lift * 0.55;
      return {
        p0x: x,
        p0y: y,
        p1x,
        p1y,
        p2x,
        p2y,
        p3x: endX,
        p3y: endY,
        depthSeed: rnd(),
      };
    };

    const spawnFlight = (x: number, y: number) => {
      const i = pool.cursor;
      flightSeedTick += 1;
      const flight = buildFlight(
        x,
        y,
        (baseSeed + flightSeedTick * 104729) >>> 0,
      );
      pool.p0x[i] = flight.p0x;
      pool.p0y[i] = flight.p0y;
      pool.p1x[i] = flight.p1x;
      pool.p1y[i] = flight.p1y;
      pool.p2x[i] = flight.p2x;
      pool.p2y[i] = flight.p2y;
      pool.p3x[i] = flight.p3x;
      pool.p3y[i] = flight.p3y;
      pool.born[i] = pool.clock;
      pool.depth[i] = flight.depthSeed;
      pool.active[i] = 1;
      pool.cursor = (i + 1) % MAX_FLIGHTS;
      launchedCount += 1;
      onLaunchRef.current?.(i);
      setAnnouncement(`LAUNCHED · ${launchedCount}`);
      return i;
    };

    // --- draw a folded-plane dart silhouette --------------------------------
    // Local-space outline (nose at +x): a swept dart with a center crease.
    // Coordinates are unit-length along the nose axis, scaled by `size`.
    const drawGlider = (
      x: number,
      y: number,
      facing: number,
      size: number,
      bank: number,
      alpha: number,
      body: string,
      crease: string,
    ) => {
      if (alpha <= 0.01) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(facing);
      // Bank reads as a vertical squash on the wingspan — a turning glider's
      // silhouette narrows toward the turn without any perspective matrix.
      ctx.scale(1, clamp(1 - Math.abs(bank) * 0.5, 0.45, 1));

      ctx.globalAlpha = alpha;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(size, 0); // nose
      ctx.lineTo(-size * 0.55, size * 0.62); // left wingtip
      ctx.lineTo(-size * 0.18, size * 0.14); // left tail notch
      ctx.lineTo(-size * 0.7, 0); // tail center
      ctx.lineTo(-size * 0.18, -size * 0.14); // right tail notch
      ctx.lineTo(-size * 0.55, -size * 0.62); // right wingtip
      ctx.closePath();
      ctx.fill();

      // Center crease + highlight edge — sells the fold.
      ctx.strokeStyle = crease;
      ctx.globalAlpha = alpha * 0.85;
      ctx.lineWidth = Math.max(0.6, size * 0.06);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.7, 0);
      ctx.stroke();

      ctx.restore();
    };

    // --- ambient drift step + draw ------------------------------------------
    const drawAmbient = (t: number) => {
      for (let i = 0; i < n; i++) {
        const dt = t - (originT[i] ?? t);
        const h = heading[i] ?? 0;
        const speed = (driftSpeed[i] ?? MIN_DRIFT) * width;
        let x = (curX[i] ?? 0) + Math.cos(h) * speed * dt;
        const bob =
          Math.sin(t * (TAU / (bobPeriod[i] ?? 3)) + (bobPhase[i] ?? 0)) *
          BOB_AMPLITUDE;
        const y = (curY[i] ?? 0) + Math.sin(h) * speed * dt + bob;

        const d = depth[i] ?? 0;
        const size = mapRange(d, 0, 1, MAX_SIZE, MIN_SIZE);
        const opacity = mapRange(d, 0, 1, 0.85, 0.32);

        // Wrapped past either edge: respawn deterministically off-screen on
        // the side it's heading toward, so the fleet keeps flowing.
        const margin = size * 2;
        if (x > width + margin && Math.cos(h) > 0) {
          respawn(i, false);
          curX[i] = (dx0[i] ?? 0) * width;
          curY[i] = (dy0[i] ?? 0) * height2;
          originT[i] = t;
          x = curX[i] ?? 0;
        } else if (x < -margin && Math.cos(h) < 0) {
          respawn(i, true);
          curX[i] = (dx0[i] ?? 0) * width;
          curY[i] = (dy0[i] ?? 0) * height2;
          originT[i] = t;
          x = curX[i] ?? 0;
        }

        drawGlider(x, y, h, size, 0, opacity, ink2, ink3);
      }
    };

    // --- flight pool step + draw --------------------------------------------
    const drawFlights = (clock: number) => {
      pool.clock = clock;
      for (let i = 0; i < MAX_FLIGHTS; i++) {
        if (!pool.active[i]) continue;
        const age = clock - (pool.born[i] ?? 0);
        const t = age / FLIGHT_DURATION;
        if (t >= 1) {
          pool.active[i] = 0;
          continue;
        }
        const p0x = pool.p0x[i] ?? 0;
        const p0y = pool.p0y[i] ?? 0;
        const p1x = pool.p1x[i] ?? 0;
        const p1y = pool.p1y[i] ?? 0;
        const p2x = pool.p2x[i] ?? 0;
        const p2y = pool.p2y[i] ?? 0;
        const p3x = pool.p3x[i] ?? 0;
        const p3y = pool.p3y[i] ?? 0;
        const pos = cubicPoint(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, t);
        const facing = cubicTangent(
          p0x,
          p0y,
          p1x,
          p1y,
          p2x,
          p2y,
          p3x,
          p3y,
          t,
        );
        // Bank from how fast the tangent is turning — sampled a short step
        // back so it reflects the curve the glider is actually flying.
        const prevT = Math.max(0, t - 0.02);
        const prevFacing = cubicTangent(
          p0x,
          p0y,
          p1x,
          p1y,
          p2x,
          p2y,
          p3x,
          p3y,
          prevT,
        );
        let bank = facing - prevFacing;
        if (bank > Math.PI) bank -= TAU;
        else if (bank < -Math.PI) bank += TAU;
        bank = clamp(bank * 6, -1, 1);

        const depthSeed = pool.depth[i] ?? 0.5;
        // Curve-implied depth: higher in its arc (more negative local lift)
        // reads as farther, so it scales down; combined with its seed so
        // concurrent flights still vary.
        const liftT = clamp(mapRange(pos.y, p0y - height2 * 0.4, p0y, 1, 0), 0, 1);
        const size = mapRange(
          liftT * 0.6 + depthSeed * 0.4,
          0,
          1,
          MAX_SIZE * 0.85,
          MAX_SIZE * 1.3,
        );
        // Fade in quickly, hold, then fade out over the final stretch.
        const fadeIn = clamp(t / 0.08, 0, 1);
        const fadeOut = 1 - clamp((t - 0.78) / 0.22, 0, 1);
        const alpha = fadeIn * fadeOut;

        drawGlider(
          pos.x,
          pos.y,
          facing,
          size,
          bank,
          alpha,
          accentBright,
          signal,
        );
      }
    };

    const drawFrame = (t: number) => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      drawAmbient(t);
      drawFlights(t);
      ctx.globalAlpha = 1;
    };

    // Reduced-motion motif: a handful of ambient gliders frozen at a fixed
    // drift phase, no loop. A launch adds exactly one static mid-flight pose.
    let staticFlight: number | null = null;
    const drawStatic = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      for (let i = 0; i < n; i++) {
        const h = heading[i] ?? 0;
        const speed = (driftSpeed[i] ?? MIN_DRIFT) * width;
        const x = (dx0[i] ?? 0) * width + Math.cos(h) * speed * STATIC_PHASE;
        const y = (dy0[i] ?? 0) * height2 + Math.sin(h) * speed * STATIC_PHASE;
        const d = depth[i] ?? 0;
        const size = mapRange(d, 0, 1, MAX_SIZE, MIN_SIZE);
        const opacity = mapRange(d, 0, 1, 0.85, 0.32);
        drawGlider(x, y, h, size, 0, opacity, ink2, ink3);
      }
      if (staticFlight !== null) {
        const i = staticFlight;
        const p0x = pool.p0x[i] ?? 0;
        const p0y = pool.p0y[i] ?? 0;
        const p1x = pool.p1x[i] ?? 0;
        const p1y = pool.p1y[i] ?? 0;
        const p2x = pool.p2x[i] ?? 0;
        const p2y = pool.p2y[i] ?? 0;
        const p3x = pool.p3x[i] ?? 0;
        const p3y = pool.p3y[i] ?? 0;
        const poseT = 0.5;
        const pos = cubicPoint(p0x, p0y, p1x, p1y, p2x, p2y, p3x, p3y, poseT);
        const facing = cubicTangent(
          p0x,
          p0y,
          p1x,
          p1y,
          p2x,
          p2y,
          p3x,
          p3y,
          poseT,
        );
        drawGlider(pos.x, pos.y, facing, MAX_SIZE, 0, 1, accentBright, signal);
      }
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop, gated on visibility and intersection ------------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      if (!originSet) resetOrigins(t);
      drawFrame(t);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase over the pause so the fleet resumes, never jumps.
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

    // Sizing — DPR-aware (capped at 2); origins reset on real size changes so
    // gliders never sit outside a freshly-shrunk stage.
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
      originSet = false;
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

    const pointToLocal = (clientX: number, clientY: number) => {
      const box = container.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    // Seeded start point under the Launch button (bottom-center) for
    // keyboard-triggered launches, which have no click coordinate.
    const buttonLaunchPoint = () => ({
      x: width * 0.5,
      y: height2 * 0.86,
    });

    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();

    if (motionSafe) {
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const { x, y } = pointToLocal(event.clientX, event.clientY);
        spawnFlight(x, y);
      };
      container.addEventListener("pointerdown", onPointerDown);

      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);

      launchBridgeRef.current = () => {
        const { x, y } = buttonLaunchPoint();
        spawnFlight(x, y);
      };

      measure();
      syncLoop();

      return () => {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        themeObserver.disconnect();
        intersection?.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        container.removeEventListener("pointerdown", onPointerDown);
        launchBridgeRef.current = null;
      };
    }

    // Reduced motion: one static frame; a click/Launch places exactly one
    // static mid-flight pose (no rAF) and still fires onLaunch.
    const launchStatic = (x: number, y: number) => {
      flightSeedTick += 1;
      const flight = buildFlight(
        x,
        y,
        (baseSeed + flightSeedTick * 104729) >>> 0,
      );
      const i = pool.cursor;
      pool.p0x[i] = flight.p0x;
      pool.p0y[i] = flight.p0y;
      pool.p1x[i] = flight.p1x;
      pool.p1y[i] = flight.p1y;
      pool.p2x[i] = flight.p2x;
      pool.p2y[i] = flight.p2y;
      pool.p3x[i] = flight.p3x;
      pool.p3y[i] = flight.p3y;
      pool.cursor = (i + 1) % MAX_FLIGHTS;
      staticFlight = i;
      launchedCount += 1;
      drawStatic();
      onLaunchRef.current?.(i);
      setAnnouncement(`LAUNCHED · ${launchedCount}`);
    };
    const onStaticTap = (event: PointerEvent) => {
      const { x, y } = pointToLocal(event.clientX, event.clientY);
      launchStatic(x, y);
    };
    container.addEventListener("pointerdown", onStaticTap);
    launchBridgeRef.current = () => {
      const { x, y } = buttonLaunchPoint();
      launchStatic(x, y);
    };

    measure();
    drawStatic();

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      container.removeEventListener("pointerdown", onStaticTap);
      launchBridgeRef.current = null;
    };
  }, [driftTotal, motionSafe]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-0 relative touch-none overflow-hidden rounded-3 border select-none",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full cursor-pointer"
      />
      <div className="absolute inset-x-0 bottom-2 flex justify-center">
        <button
          type="button"
          aria-label="Launch a paper glider"
          className={cn(
            "border-hairline bg-card/80 text-label text-ink-3 rounded-2 border px-3 py-1 backdrop-blur",
            "focus-visible:ring-accent focus-visible:ring-2 focus-visible:outline-none",
          )}
          onClick={() => launchBridgeRef.current?.()}
        >
          Launch
        </button>
      </div>
      <p role="status" className="sr-only" aria-live="polite">
        {ariaLabel}: {announcement}
      </p>
    </div>
  );
}
