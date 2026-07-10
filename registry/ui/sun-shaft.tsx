"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
const MAX_MOTES = 160;
/** Reduced motion draws exactly one static frame — motes scattered at rest. */
const STATIC_T = 0;
/** Eddy influence eases toward its target this fraction of the gap per frame. */
const EDDY_EASE = 0.08;
/** Pointer eddy radius, px — motes inside get a tangential swirl pull. */
const EDDY_RADIUS = 90;
/** Per-mote seeded constants: x0, y0, driftX, driftY, size, phase, wrapSeed. */
const A = 7;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export type SunShaftProps = {
  /** Mote count, capped at 160. @default 70 */
  count?: number;
  /** Fires as the pointer enters / leaves the panel, deduped. */
  onStir?: (stirring: boolean) => void;
  /** Stage height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A diagonal god-ray crosses the panel — a soft brightness wedge from one top
 * corner to the opposite lower edge, built from two overlapping bands for a
 * volumetric feel — with `count` seeded dust motes drifting a lazy
 * downward-and-lateral wander through it. Each mote's brightness scales by
 * how deep it sits in the beam (perpendicular distance from the beam's own
 * axis, falling off toward the edges) so the shaft itself is painted purely
 * by motes lighting up as they cross it, alongside the gradient wedge. Motes
 * wrap deterministically at the stage edges: crossing an edge advances the
 * mote's seed index rather than drawing from Math.random, so the sequence
 * never repeats a cycle and stays identical across reloads.
 *
 * The pointer's x/y is tracked in a ref (never React state) and blended into
 * an eased `eddy` scalar (`EDDY_EASE` per frame) that ramps to 1 while the
 * pointer is active over the stage and back to 0 once it leaves. Motes within
 * `EDDY_RADIUS` of the pointer get a tangential (vortex) velocity — pull
 * perpendicular to the radius vector, scaled by the eased eddy and by how
 * close the mote sits to the pointer — so passing through the beam visibly
 * stirs the motes into a swirl that eases back to the plain drift once the
 * pointer leaves. `onStir` fires once as the pointer enters and once as it
 * leaves (deduped against the last reported state), called as a plain
 * function from inside the imperative loop — never a per-frame setState. An
 * sr-only polite region mirrors the same still/stirred state for anyone not
 * watching the canvas.
 *
 * Canvas discipline (Wavefield's, to the letter): DPR capped at 2 via
 * setTransform, ResizeObserver sizing, the one rAF loop gated by
 * IntersectionObserver + visibilitychange with a clock rebase over pauses,
 * theme colors resolved from CSS variables once per mount and re-resolved on
 * a MutationObserver watching the html class, and full teardown on unmount.
 * Palette: --accent-bright for the beam wedge and lit motes, --signal for the
 * brightest in-beam core, --ink-2 for faint out-of-beam motes. Budget
 * ≤3ms/frame: ≤160 motes, each a single filled circle, geometry rebuilt only
 * on resize.
 *
 * Reduced motion: exactly one static frame — the shaft lit, motes scattered
 * at their natural seeded rest positions in and around it, no rAF, no drift,
 * no eddy.
 */
export function SunShaft({
  count = 70,
  onStir,
  height = 300,
  className,
  "aria-label": ariaLabel = "Sun shaft",
}: SunShaftProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Pointer in canvas space; `active` false until entry / after leave, which
  // eases the eddy back out of the motes.
  const pointerRef = React.useRef({ x: 0, y: 0, active: false });
  const [airState, setAirState] = React.useState<"STILL" | "STIRRED">(
    "STILL",
  );

  // LATEST-REF: the callback prop, written from an effect — never read
  // during render, never written in the render body.
  const onStirRef = React.useRef(onStir);
  React.useEffect(() => {
    onStirRef.current = onStir;
  });

  const moteCount = Math.max(1, Math.min(MAX_MOTES, Math.round(count)));
  const uid = React.useId();

  // All canvas work lives here: sizing, theming, geometry, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let beam = "";
    let beamRgb: [number, number, number] = [132, 168, 232];
    let core = "";
    let coreRgb: [number, number, number] = [232, 226, 168];
    let dim = "";
    // A detached <canvas> normalises any CSS color (oklch, hex, rgb) into rgb
    // channels for building rgba() gradient stops — done only on mount and
    // theme flips, never in the frame loop (mirrors CometCursor's toRgb).
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    const toRgb = (
      color: string,
      fallback: [number, number, number],
    ): [number, number, number] => {
      if (!probeCtx) return fallback;
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = "#000";
      probeCtx.fillStyle = color;
      probeCtx.fillRect(0, 0, 1, 1);
      const d = probeCtx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? fallback[0], d[1] ?? fallback[1], d[2] ?? fallback[2]];
    };
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      beam = read("--accent-bright", "#84a8e8");
      core = read("--signal", read("--accent-bright", "#e8e2a8"));
      dim = read("--ink-2", "#8a8f9b");
      beamRgb = toRgb(beam, beamRgb);
      coreRgb = toRgb(core, coreRgb);
    };
    resolveColors();

    // --- geometry: rebuilt only in the ResizeObserver callback ------------
    let width = 0;
    let height2 = 0;
    // Beam axis: unit vector along the shaft, from top corner to the
    // opposite lower edge, plus its own perpendicular (normal) unit vector.
    let axisX = 0;
    let axisY = 0;
    let normalX = 0;
    let normalY = 0;
    let originX = 0;
    let originY = 0;
    let beamHalfWidth = 0;
    let beamLength = 0;
    // Per-mote seeded constants, stride A: x0, y0, driftX, driftY, size,
    // phase, wrapSeed (advances on every edge wrap for a fresh respawn spot).
    let seeds = new Float32Array(0);
    let wrapIndex = new Int32Array(0);

    const spawnMote = (index: number, seedBump: number) => {
      const b = index * A;
      const h = djb2(`sun-shaft:${uid}:${index}:${seedBump}`);
      const local = seeded(h);
      seeds[b] = local() * width; // x0
      seeds[b + 1] = local() * height2; // y0
      seeds[b + 2] = (local() * 2 - 1) * 6; // driftX px/s lateral wander
      seeds[b + 3] = 4 + local() * 10; // driftY px/s lazy downward
      seeds[b + 4] = 0.6 + local() * 1.5; // size
      seeds[b + 5] = local() * TAU; // phase (static-frame scatter)
      seeds[b + 6] = local() * 4 - 2; // reserved sway seed
    };

    const rebuild = () => {
      // Diagonal from the top-left corner across to the bottom-right edge —
      // a classic god-ray lean. Axis + normal are unit vectors so downstream
      // math (projection, perpendicular distance) stays cheap per mote.
      originX = 0;
      originY = 0;
      const dx = width;
      const dy = height2;
      beamLength = Math.hypot(dx, dy) || 1;
      axisX = dx / beamLength;
      axisY = dy / beamLength;
      normalX = -axisY;
      normalY = axisX;
      beamHalfWidth = Math.max(40, Math.min(width, height2) * 0.42);

      const needed = moteCount * A;
      if (seeds.length < needed) {
        seeds = new Float32Array(needed);
        wrapIndex = new Int32Array(moteCount);
      }
      for (let i = 0; i < moteCount; i++) {
        spawnMote(i, wrapIndex[i] ?? 0);
      }
    };

    // Eased pointer-eddy scalar: 0 none .. 1 fully swirling. Lives across
    // frames as plain closure state (not React), advanced once per frame.
    let eddy = 0;
    let lastReportedStir = false;

    const drawFrame = (t: number, live: boolean) => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);

      const pointer = pointerRef.current;
      if (live) {
        const target = pointer.active ? 1 : 0;
        eddy = lerp(eddy, target, EDDY_EASE);
        if (pointer.active !== lastReportedStir) {
          lastReportedStir = pointer.active;
          onStirRef.current?.(pointer.active);
        }
      } else {
        eddy = 0;
      }

      // --- the beam: two overlapping soft bands along the axis, painted as
      // linear gradients across the beam's own normal so the wedge reads as
      // a lit volume rather than a flat diagonal fade. ------------------
      const drawBand = (
        widthFrac: number,
        alpha: number,
        rgb: [number, number, number],
      ) => {
        const halfW = beamHalfWidth * widthFrac;
        const x0 = originX - normalX * halfW;
        const y0 = originY - normalY * halfW;
        const x1 = originX + normalX * halfW;
        const y1 = originY + normalY * halfW;
        const [r, g, bl] = rgb;
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${bl}, 0)`);
        grad.addColorStop(0.5, `rgba(${r}, ${g}, ${bl}, ${alpha})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${bl}, 0)`);
        ctx.fillStyle = grad;
        // A quad spanning the whole stage along the axis, clipped by the
        // canvas bounds naturally since axis runs corner-to-corner.
        const farX = axisX * beamLength;
        const farY = axisY * beamLength;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + farX, y0 + farY);
        ctx.lineTo(x1 + farX, y1 + farY);
        ctx.lineTo(x1, y1);
        ctx.closePath();
        ctx.fill();
      };
      drawBand(1, 0.22, beamRgb);
      drawBand(0.55, 0.16, coreRgb);

      // --- motes: drift, eddy, wrap, and brightness-by-beam-depth --------
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < moteCount; i++) {
        const b = i * A;
        const x0 = seeds[b] ?? 0;
        const y0 = seeds[b + 1] ?? 0;
        const driftX = seeds[b + 2] ?? 0;
        const driftY = seeds[b + 3] ?? 6;
        const size = seeds[b + 4] ?? 1;
        const phase = seeds[b + 5] ?? 0;

        let x: number;
        let y: number;
        if (live) {
          x = x0 + driftX * t;
          y = y0 + driftY * t;

          // Tangential eddy pull: within EDDY_RADIUS of the pointer, add a
          // velocity perpendicular to the radius vector (a vortex), scaled
          // by proximity and the eased `eddy` so it fades in/out smoothly
          // rather than snapping.
          if (pointer.active || eddy > 0.01) {
            const rx = x - pointer.x;
            const ry = y - pointer.y;
            const dist = Math.hypot(rx, ry);
            if (dist < EDDY_RADIUS && dist > 0.001) {
              const proximity = 1 - dist / EDDY_RADIUS;
              const swirl = proximity * proximity * eddy * 46;
              // Perpendicular to the radius vector = tangential direction.
              const tanX = -ry / dist;
              const tanY = rx / dist;
              x += tanX * swirl * 0.12;
              y += tanY * swirl * 0.12;
              // Slight inward suction so the swirl reads as an eddy, not a
              // straight-line push.
              x -= (rx / dist) * proximity * eddy * 4 * 0.12;
              y -= (ry / dist) * proximity * eddy * 4 * 0.12;
            }
          }

          // Deterministic wrap: crossing an edge respawns from a fresh
          // seeded spot (seed index bumped), never a random jump.
          if (x < -20 || x > width + 20 || y < -20 || y > height2 + 20) {
            const idx = (wrapIndex[i] ?? 0) + 1;
            wrapIndex[i] = idx;
            spawnMote(i, idx);
            continue;
          }
        } else {
          // Static frame: motes at rest at their seeded scatter, nudged by a
          // fixed per-mote phase so the layout doesn't read as a perfect
          // grid of spawn points.
          x = x0 + Math.cos(phase) * 3;
          y = y0 + Math.sin(phase) * 3;
        }

        // Perpendicular distance from the beam axis, in beam-half-widths:
        // 0 at the centerline, 1 at the soft edge — this is "how deep in
        // the beam" the mote sits, driving its brightness.
        const relX = x - originX;
        const relY = y - originY;
        const perp = relX * normalX + relY * normalY;
        const depth = clamp(1 - Math.abs(perp) / beamHalfWidth, 0, 1);

        const inBeam = depth > 0;
        ctx.fillStyle = depth > 0.6 ? core : inBeam ? beam : dim;
        ctx.globalAlpha = inBeam ? 0.25 + depth * 0.65 : 0.08;
        const radius = size * (0.7 + depth * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.4, radius), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;
    let lastAirState: "STILL" | "STIRRED" = "STILL";

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      drawFrame(t, true);
      const nextState: "STILL" | "STIRRED" = eddy > 0.15 ? "STIRRED" : "STILL";
      if (nextState !== lastAirState) {
        lastAirState = nextState;
        setAirState(nextState);
      }
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so drift resumes, not jumps.
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
      // If the pointer was mid-stir at unmount, report the panel settled.
      if (lastReportedStir) onStirRef.current?.(false);
    };
  }, [moteCount, motionSafe, uid]);

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
      <span role="status" aria-live="polite" className="sr-only">
        {`${ariaLabel}: air ${airState === "STIRRED" ? "stirred" : "still"}`}
      </span>
    </div>
  );
}
