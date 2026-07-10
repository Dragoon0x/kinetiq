"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Simulation runs on a fixed 60Hz substep so settle tempo matches every display. */
const STEP = 1 / 60;
const MAX_SUBSTEPS = 4;
/** Gravity, px/step² at the fixed substep — a flake takes a slow second to cross the dome. */
const GRAVITY = 0.05;
/** Shell restitution: wall bounces spend energy, they never add it. */
const WALL_BOUNCE = 0.72;
/** Ground friction per step while a flake slides along the base. */
const FLOOR_FRICTION = 0.86;
/**
 * Total kinetic energy below which the scene counts as settled. Kept flat
 * (not per-flake): one airborne flake carries at least gravity's ~0.0025
 * px²/step² after damping, so the loop can never freeze snow mid-air.
 */
const SETTLE_EPS = 1e-3;
/** The dome travels at most this far under a drag, behind rubber resistance. */
const MAX_TRAVEL = 22;
/** Per-move kick caps, px/step — one wild pointer event cannot detonate the scene. */
const KICK_LATERAL_CAP = 2.8;
const KICK_UP_CAP = 2.4;
/** Flake count ceiling — comfortably inside the ≤3ms/frame budget. */
const MAX_FLAKES = 80;
/** Plinth height inside the stage, px (plate + nameplate). */
const PLINTH_H = 44;

/** Per-flake seeded constants: size, drag, scatter, mix, u, v, restU, lift. */
const A = 8;
/** Per-flake live state: x, y, vx, vy. */
const S = 4;

export type ShakerDomeProps = {
  /** The diorama under the glass. Defaults to a minted mono monument. */
  scene?: React.ReactNode;
  /** Flake count, capped at 80. @default 42 */
  flakes?: number;
  /** Nameplate content on the plinth. @default "MOTION LABORATORY · EST 2026" */
  label?: React.ReactNode;
  /** Stage height in px — dome plus plinth. @default 240 */
  height?: number;
  className?: string;
  /** Accessible name for the dome figure. @default "Shaker dome" */
  "aria-label"?: string;
};

/**
 * A keepsake glass dome on a machined plinth: `scene` stands under a
 * semicircular shell (DOM: hairline-strong `rounded-t-full` with a
 * translucent white/ink wash and a specular streak) while a canvas overlay
 * inside the glass drives `flakes` seeded specks through a tiny snow
 * simulation. Drag the dome sideways — it is pointer-captured and rides a
 * motion value through tanh rubber (travel saturates at ±22px), springing
 * home on release via springs.snap — and every pointermove throws the
 * dome's velocity delta into the flakes, sign-flipped (the glass moves,
 * the snow lags) plus an upward kick proportional to the jolt, both capped
 * per step. The STIR button is the keyboard path: one standard kick,
 * straight up with seeded lateral spread.
 *
 * Physics, per fixed 60Hz substep: gravity 0.05 px/step², per-flake drag
 * seeded around 0.985, floor rest on the dome base (impact spends into a
 * tiny seeded lateral scatter so landings spread into a drift), and wall
 * collision against the shell — for a flake outside the circle |p − c| = R
 * about the base center c, the outward unit normal is n = (p − c)/|p − c|,
 * velocity reflects with restitution as v′ = v − (1 + e)(v·n)n (only while
 * v·n > 0, so a re-entering flake is never re-launched), and the position
 * projects back onto the shell at c + n·R.
 *
 * Canvas discipline (Wavefield's, non-negotiable): DPR capped at 2 via
 * setTransform, ResizeObserver sizing, the one rAF loop gated by
 * IntersectionObserver + visibilitychange with a clock rebase over pauses,
 * and full teardown on unmount. On top of that it idle-stops
 * (HeightField's dirty flag): the loop runs only while total kinetic
 * energy stays above epsilon, so a settled dome costs nothing until the
 * next shake or stir wakes it. Flakes draw in --ink-3 — light snow on the
 * navy bench, dark motes on graph paper, one variable honest in both
 * themes — re-resolved when the html class flips. Budget ≤3ms/frame at
 * the default size: ≤80 flakes of arithmetic plus ≤80 fillRect/arc calls,
 * and the hot loop allocates nothing.
 *
 * Determinism: every flake attribute and position — including the
 * reduced-motion rest arc — draws from seeded(djb2(useId())). No
 * Math.random or Date.now anywhere; performance.now() only stamps the
 * loop clock. A resize re-mints the seeded scatter and lets it snow back
 * down.
 *
 * A11y: the whole figure is a single role="img" named by `aria-label`;
 * everything under it is presentational scenery. The STIR button is a
 * real button, and an sr-only polite region announces "Stirred" once per
 * stir or shake-start, deduped while the flakes are still settling.
 *
 * Reduced motion: exactly one static frame — flakes rendered settled
 * along the base from their seeded rest positions, no simulation, no dome
 * drag, STIR disabled with title "Reduced motion" — and the sr-only
 * description notes the scene is static.
 */
export function ShakerDome({
  scene,
  flakes = 42,
  label = "MOTION LABORATORY · EST 2026",
  height = 240,
  className,
  "aria-label": ariaLabel = "Shaker dome",
}: ShakerDomeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const descId = `${uid}desc`;

  const domeRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  /** Dome translate under drag; springs back to 0 on release. */
  const domeX = useMotionValue(0);
  const dragRef = React.useRef<{
    id: number;
    originX: number;
    grabbedAt: number;
  } | null>(null);
  const releaseRef = React.useRef<ReturnType<typeof animate> | null>(null);
  /** The sim's kick surface, assigned by the canvas effect. */
  const simRef = React.useRef<{
    shake: (delta: number) => void;
    stir: () => void;
  } | null>(null);

  /** Announcement counter — bumped once per settled→stirred transition. */
  const [stirCount, setStirCount] = React.useState(0);

  // A spring-back in flight must not outlive the component.
  React.useEffect(() => () => releaseRef.current?.stop(), []);

  // Re-seat the dome when the motion pathway switches to reduced.
  React.useEffect(() => {
    if (motionSafe) return;
    releaseRef.current?.stop();
    releaseRef.current = null;
    dragRef.current = null;
    domeX.jump(0);
  }, [motionSafe, domeX]);

  // All canvas work lives here: sizing, theming, the flakes, the one rAF loop.
  React.useEffect(() => {
    const dome = domeRef.current;
    const canvas = canvasRef.current;
    if (!dome || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const count = Math.round(clamp(flakes, 1, MAX_FLAKES));

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let flakeColor = "";
    const resolveColors = () => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--ink-3")
        .trim();
      flakeColor = value === "" ? "#7c828f" : value;
    };
    resolveColors();

    // --- per-flake constants: one seeded stream, identical every visit ----
    const attrs = new Float32Array(count * A);
    {
      const rng = seeded(djb2(`kq-124:${uid}`));
      for (let i = 0; i < count; i++) {
        const base = i * A;
        attrs[base] = 1 + rng() * 1.5; // size, 1–2.5 px
        attrs[base + 1] = 0.976 + rng() * 0.014; // drag (damping ~0.985)
        attrs[base + 2] = rng() * 2 - 1; // scatter: lateral personality
        attrs[base + 3] = rng(); // mix: kick-response variety
        attrs[base + 4] = rng(); // u: scatter angle fraction
        attrs[base + 5] = rng(); // v: scatter radius fraction
        attrs[base + 6] = (rng() + rng()) / 2; // restU: triangular → mound
        attrs[base + 7] = rng(); // lift: rest dusting height
      }
    }
    const state = new Float32Array(count * S);

    // --- geometry: set only in the ResizeObserver callback -----------------
    let width = 0;
    let domeH = 0;
    let radius = 0;

    /** Seeded mid-air scatter, uniform over the semicircle (√v de-biases). */
    const materializeScatter = () => {
      const cx = width / 2;
      for (let i = 0; i < count; i++) {
        const a = i * A;
        const s = i * S;
        const size = attrs[a] ?? 1.5;
        const u = attrs[a + 4] ?? 0.5;
        const v = attrs[a + 5] ?? 0.5;
        const reach = Math.max(2, radius - 2 - size / 2);
        const ang = Math.PI + u * Math.PI; // upper half in canvas coords
        const rad = Math.sqrt(v) * reach;
        state[s] = cx + Math.cos(ang) * rad;
        // Clamped to the resting line so no flake starts sunk in the base.
        state[s + 1] = Math.min(domeH + Math.sin(ang) * rad, domeH - size / 2);
        state[s + 2] = 0;
        state[s + 3] = 0;
      }
    };

    /** Seeded rest positions along the base — the reduced-motion frame. */
    const materializeRest = () => {
      const cx = width / 2;
      for (let i = 0; i < count; i++) {
        const a = i * A;
        const s = i * S;
        const size = attrs[a] ?? 1.5;
        const spread = (attrs[a + 6] ?? 0.5) * 2 - 1; // −1..1, mounded at 0
        const lift = attrs[a + 7] ?? 0;
        const chord = Math.max(2, radius - 2 - size);
        state[s] = cx + spread * chord;
        // A dusting, not a line: flakes near the middle sit a hair higher.
        state[s + 1] = domeH - size / 2 - lift * 2 * (1 - Math.abs(spread));
        state[s + 2] = 0;
        state[s + 3] = 0;
      }
    };

    // --- simulation: one fixed 60Hz step; returns total kinetic energy ----
    const simStep = (): number => {
      const cx = width / 2;
      const cy = domeH; // shell circle center sits at the base midpoint
      let energy = 0;
      for (let i = 0; i < count; i++) {
        const a = i * A;
        const s = i * S;
        let x = state[s] ?? 0;
        let y = state[s + 1] ?? 0;
        let vx = state[s + 2] ?? 0;
        let vy = state[s + 3] ?? 0;
        const size = attrs[a] ?? 1.5;
        const half = size / 2;
        const floorY = cy - half;
        // At rest on the base: free — contributes nothing and skips the math.
        if (vx === 0 && vy === 0 && y >= floorY - 1e-3) continue;
        // Integrate: gravity, then the flake's own seeded drag.
        vy += GRAVITY;
        const drag = attrs[a + 1] ?? 0.985;
        vx *= drag;
        vy *= drag;
        x += vx;
        y += vy;
        // WALL — the shell is the circle |p − c| = R about the base center c.
        // Outside it, the outward unit normal is n = (p − c)/|p − c|; the
        // velocity reflects across the tangent with restitution e,
        //   v′ = v − (1 + e)(v·n)n
        // applied only while v·n > 0 (an inbound flake is left alone), and
        // the position projects back onto the shell at c + n·bound.
        const bound = Math.max(2, radius - 1 - half);
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > bound * bound && d2 > 0) {
          const dist = Math.sqrt(d2);
          const nx = dx / dist;
          const ny = dy / dist;
          const vn = vx * nx + vy * ny;
          if (vn > 0) {
            vx -= (1 + WALL_BOUNCE) * vn * nx;
            vy -= (1 + WALL_BOUNCE) * vn * ny;
          }
          x = cx + nx * bound;
          y = cy + ny * bound;
        }
        // FLOOR — rest on the base; impact spends into a tiny seeded lateral
        // scatter so a landing spreads into a drift instead of a stack.
        if (y >= floorY) {
          if (vy > 0.35) vx += (attrs[a + 2] ?? 0) * vy * 0.3;
          y = floorY;
          vy = 0;
          vx *= FLOOR_FRICTION;
          if (vx > -0.02 && vx < 0.02) vx = 0;
        }
        state[s] = x;
        state[s + 1] = y;
        state[s + 2] = vx;
        state[s + 3] = vy;
        energy += vx * vx + vy * vy;
      }
      return energy;
    };

    // --- render: one fillStyle, fillRect for specks, arcs for the few big --
    const drawFlakes = () => {
      if (width <= 0 || domeH <= 0) return;
      ctx.clearRect(0, 0, width, domeH);
      ctx.fillStyle = flakeColor;
      for (let i = 0; i < count; i++) {
        const a = i * A;
        const s = i * S;
        const size = attrs[a] ?? 1.5;
        const half = size / 2;
        const x = state[s] ?? 0;
        const y = state[s + 1] ?? 0;
        // Bigger flakes read nearer — a touch more opacity sells the depth.
        ctx.globalAlpha = 0.45 + ((size - 1) / 1.5) * 0.4;
        if (size <= 2) {
          ctx.fillRect(x - half, y - half, size, size);
        } else {
          ctx.beginPath();
          ctx.arc(x, y, half, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop: gated on visibility, intersection, dirtiness ---
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let lastT: number | null = null;
    let acc = 0;
    let inView = false;
    let dirty = false;
    let settled = true;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      if (lastT === null) lastT = t;
      acc = Math.min(acc + (t - lastT), STEP * MAX_SUBSTEPS);
      lastT = t;
      let energy = -1;
      while (acc >= STEP) {
        energy = simStep();
        acc -= STEP;
      }
      if (energy < 0) return; // 120Hz frame between sim steps — nothing new.
      if (energy < SETTLE_EPS) {
        // Settled: park every flake, paint the resting scene once, and stop
        // — an idle dome costs nothing until the next shake or stir.
        for (let i = 0; i < count; i++) {
          state[i * S + 2] = 0;
          state[i * S + 3] = 0;
        }
        drawFlakes();
        settled = true;
        dirty = false;
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
        return;
      }
      drawFlakes();
    };

    const syncLoop = () => {
      const shouldRun = dirty && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the fall resumes, not jumps.
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

    /** Wakes the sim; user-driven wakes announce once per settle cycle. */
    const wake = (announce: boolean) => {
      if (announce && settled) setStirCount((n) => n + 1);
      settled = false;
      dirty = true;
      syncLoop();
    };

    const shake = (delta: number) => {
      // The glass moved by `delta`; in dome-local space the snow lags the
      // other way (sign flip) and the jolt itself lofts it. Both kicks are
      // capped per move, and each flake answers with its own seeded mix so
      // the cloud disperses instead of moving as one body.
      const lateral = clamp(-delta * 0.55, -KICK_LATERAL_CAP, KICK_LATERAL_CAP);
      const up = Math.min(Math.abs(delta) * 0.5, KICK_UP_CAP);
      for (let i = 0; i < count; i++) {
        const a = i * A;
        const s = i * S;
        const mix = attrs[a + 3] ?? 0.5;
        state[s + 2] = (state[s + 2] ?? 0) + lateral * (0.6 + mix * 0.8);
        state[s + 3] = (state[s + 3] ?? 0) - up * (0.6 + (1 - mix) * 0.8);
      }
      wake(true);
    };

    const stir = () => {
      // The keyboard path: one standard kick — up, spread sideways by each
      // flake's seeded scatter so the plume never rises as one body.
      for (let i = 0; i < count; i++) {
        const a = i * A;
        const s = i * S;
        const mix = attrs[a + 3] ?? 0.5;
        state[s + 2] = (state[s + 2] ?? 0) + (attrs[a + 2] ?? 0) * 2.2;
        state[s + 3] = (state[s + 3] ?? 0) - (2 + mix * 1.4);
      }
      wake(true);
    };
    simRef.current = { shake, stir };

    // Sizing — DPR-aware (capped at 2); geometry is set here only.
    const measure = () => {
      const cssW = dome.clientWidth;
      const cssH = dome.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      domeH = cssH;
      radius = Math.min(cssW / 2, cssH);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // setTransform, not scale — idempotent across repeated measures.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // A resize re-mints the seeded scene: flakes rematerialize at their
      // seeded spots and (motion permitting) snow back down to the base.
      // Reduced motion instead paints the seeded rest arc, once.
      if (motionSafe) {
        materializeScatter();
        settled = false;
        dirty = true;
      } else {
        materializeRest();
      }
      drawFlakes();
      syncLoop();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(dome);

    // Theme flips re-resolve the flake ink and repaint the current frame.
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      drawFlakes();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts — no gates to watch.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(dome);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      simRef.current = null;
    };
  }, [motionSafe, uid, flakes]);

  const handleDomePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current !== null) return;
    releaseRef.current?.stop();
    releaseRef.current = null;
    dragRef.current = {
      id: event.pointerId,
      originX: event.clientX,
      grabbedAt: domeX.get(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDomePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || event.pointerId !== drag.id) return;
    if (event.buttons === 0) {
      // Capture slipped away without a pointerup — spring home anyway.
      dragRef.current = null;
      releaseRef.current = animate(domeX, 0, springs.snap);
      return;
    }
    // Rubber resistance: the dome tracks the hand through tanh, so travel
    // saturates smoothly at ±MAX_TRAVEL instead of hitting a hard stop.
    const raw = drag.grabbedAt + (event.clientX - drag.originX);
    const next = MAX_TRAVEL * Math.tanh(raw / MAX_TRAVEL);
    const prev = domeX.get();
    if (next === prev) return;
    domeX.set(next);
    simRef.current?.shake(next - prev);
  };

  const handleDomePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag === null || event.pointerId !== drag.id) return;
    dragRef.current = null;
    releaseRef.current = animate(domeX, 0, springs.snap);
  };

  const handleStir = () => {
    simRef.current?.stir();
  };

  const sceneNode = scene === undefined ? <SerialObelisk /> : scene;
  // The dome is a true semicircle (aspect 2:1), so the stage column caps its
  // width at what the height allows once the plinth takes its share.
  const columnMax = Math.max(140, 2 * (height - PLINTH_H) + 24);

  return (
    <div className={cn("flex w-full flex-col items-center gap-3", className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        aria-describedby={descId}
        style={{ height }}
        className="flex w-full flex-col items-center justify-end"
      >
        <div
          aria-hidden
          className="flex w-full flex-col items-center"
          style={{ maxWidth: columnMax }}
        >
          {/* The dome itself rides the drag; the canvas travels inside it,
              so the flake sim stays in dome-local space throughout. */}
          <motion.div
            ref={domeRef}
            onPointerDown={handleDomePointerDown}
            onPointerMove={handleDomePointerMove}
            onPointerUp={handleDomePointerEnd}
            onPointerCancel={handleDomePointerEnd}
            style={{ x: domeX }}
            className={cn(
              "border-hairline-strong relative aspect-[2/1] w-[calc(100%-24px)] overflow-hidden rounded-t-full border border-b-0 select-none",
              motionSafe && "cursor-grab touch-none active:cursor-grabbing",
            )}
          >
            {/* The diorama, behind the snow. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
              {sceneNode}
            </div>
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 size-full"
            />
            {/* Glass: a low-alpha white/ink wash plus a specular streak pair,
                in front of the snow so flakes read as sealed inside. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(115% 100% at 32% 6%, oklch(1 0 0 / 0.12), transparent 58%), radial-gradient(150% 125% at 50% 108%, oklch(0.25 0.03 258 / 0.16), transparent 66%)",
                boxShadow: "inset 0 0 18px oklch(0.2 0.02 258 / 0.12)",
              }}
            />
            <div
              className="pointer-events-none absolute -rotate-[32deg] rounded-full"
              style={{
                left: "14%",
                top: "18%",
                width: "30%",
                height: 3,
                background:
                  "linear-gradient(90deg, transparent, oklch(0.93 0.01 258 / 0.5) 45%, transparent)",
              }}
            />
            <div
              className="pointer-events-none absolute -rotate-[32deg] rounded-full"
              style={{
                left: "21%",
                top: "31%",
                width: "12%",
                height: 2,
                background:
                  "linear-gradient(90deg, transparent, oklch(0.93 0.01 258 / 0.35) 50%, transparent)",
              }}
            />
          </motion.div>

          {/* The base plinth with its mono nameplate. */}
          <div className="border-hairline bg-surface-1 relative flex h-11 w-full items-center justify-center rounded-2 border px-3 shadow-[var(--edge-highlight)]">
            <span className="text-label text-ink-3 truncate">{label}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={!motionSafe}
        title={motionSafe ? undefined : "Reduced motion"}
        onClick={handleStir}
        className="border-hairline text-label text-ink-2 hover:border-hairline-strong hover:text-ink focus-visible:ring-cobalt-bright/50 rounded-full border px-3 py-1 transition-colors outline-none focus-visible:ring-2 disabled:opacity-40"
      >
        STIR
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {stirCount > 0 ? <span key={stirCount}>Stirred</span> : null}
      </span>

      <p id={descId} className="sr-only">
        {motionSafe
          ? "A glass keepsake dome. Drag the dome sideways or press stir to swirl the flakes; they drift back down and settle on the base."
          : "A static keepsake dome with its flakes settled along the base. Reduced motion is on, so shaking and stirring are disabled."}
      </p>
    </div>
  );
}

/**
 * The default diorama: a minted mono monument — diamond finial, serial
 * stele, and a two-step plate, all plain divs.
 */
function SerialObelisk() {
  return (
    <div aria-hidden className="pointer-events-none flex flex-col items-center">
      <div className="border-hairline-strong bg-surface-2 size-2.5 rotate-45 rounded-[1px] border" />
      <div className="border-hairline-strong bg-surface-2 -mt-1 flex h-14 w-4 items-center justify-center rounded-t-[2px] border">
        <span className="text-ink-3 font-mono text-[7px] font-medium tracking-[0.18em] uppercase [writing-mode:vertical-rl]">
          KQ-124
        </span>
      </div>
      <div className="border-hairline-strong bg-surface-2 h-1.5 w-9 border border-b-0" />
      <div className="border-hairline-strong bg-surface-2 h-2 w-14 rounded-t-[2px] border" />
    </div>
  );
}
