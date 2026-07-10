"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { angleDelta, clamp, snapAngle, wrapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Degrees of yaw per horizontal pixel dragged. */
const DEG_PER_PX = 0.5;
/** Detent grid the yaw always settles onto. */
const DETENT_DEG = 15;
/** Platter tick spacing — one etched mark per 30° of the model space. */
const TICK_DEG = 30;
/** Release velocity carries this many seconds of extra travel into the glide. */
const MOMENTUM_WINDOW = 0.16;
/** A flick never carries more than 1¼ extra revolutions. */
const MAX_CARRY_DEG = 450;
/** Platter radius relative to the model's footprint radius. */
const PLATTER_RATIO = 1.3;
/** Ticks span from this fraction of the platter radius out to the rim. */
const TICK_INNER = 0.86;
/** Clear air inside the stage edges, px. */
const STAGE_PAD = 12;
/** Room reserved below the platter rim for the static index tick, px. */
const INDEX_GAP = 12;
/** Nearest vertices that carry an accent dot. */
const DOT_COUNT = 4;

export type TurnModelWireframe = {
  /** Model-space points, y up — the platter floor sits at y = 0. */
  vertices: [number, number, number][];
  /** Index pairs into `vertices`. */
  edges: [number, number][];
};

export type TurnModelProps = {
  /** Wireframe on the platter; defaults to the built-in minted monument. */
  model?: TurnModelWireframe;
  /** Controlled yaw in degrees (0–360). */
  angle?: number;
  /** Initial yaw when uncontrolled; lands on the nearest detent. */
  defaultAngle?: number;
  /** Fires once per settle with the snapped yaw, wrapped to 0–360, deduped. */
  onAngleChange?: (angle: number) => void;
  /** Stage edge, px. */
  size?: number;
  /** Fixed camera tilt above the platter plane, degrees. */
  elevationDeg?: number;
  className?: string;
  /** Accessible name for the slider. */
  "aria-label"?: string;
};

/**
 * The minted monument — a stepped obelisk: square plinth, a shoulder step,
 * a tapering shaft, and a pyramidion. 17 vertices, 28 edges, base centered
 * on the platter at y = 0. Module constants: every mount is identical.
 */
const MONUMENT: TurnModelWireframe = {
  vertices: [
    // Plinth base (y = 0)
    [-0.5, 0, -0.5],
    [0.5, 0, -0.5],
    [0.5, 0, 0.5],
    [-0.5, 0, 0.5],
    // Plinth cap (y = 0.26)
    [-0.5, 0.26, -0.5],
    [0.5, 0.26, -0.5],
    [0.5, 0.26, 0.5],
    [-0.5, 0.26, 0.5],
    // Shaft foot, stepped in on the cap plane
    [-0.28, 0.26, -0.28],
    [0.28, 0.26, -0.28],
    [0.28, 0.26, 0.28],
    [-0.28, 0.26, 0.28],
    // Shaft crown, tapered
    [-0.19, 1.18, -0.19],
    [0.19, 1.18, -0.19],
    [0.19, 1.18, 0.19],
    [-0.19, 1.18, 0.19],
    // Apex
    [0, 1.5, 0],
  ],
  edges: [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [0, 4], [1, 5], [2, 6], [3, 7],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [8, 9], [9, 10], [10, 11], [11, 8],
    [8, 12], [9, 13], [10, 14], [11, 15],
    [12, 13], [13, 14], [14, 15], [15, 12],
    [12, 16], [13, 16], [14, 16], [15, 16],
  ],
};

type Stage = {
  /** Model units → px. */
  scale: number;
  /** Platter center (floor origin) in stage px. */
  cx: number;
  cy: number;
  /** Platter radius in model units, and its projected ellipse radii in px. */
  platterR: number;
  platterRx: number;
  platterRy: number;
  sinE: number;
  cosE: number;
};

/**
 * Fit the model + platter into a `size`-px stage. Extents are worst-case
 * over every yaw (the horizontal footprint is the max ⌀√(x²+z²)), so the
 * scale never changes while the platter spins.
 */
const computeStage = (
  model: TurnModelWireframe,
  size: number,
  elevationDeg: number,
): Stage => {
  const e = (elevationDeg * Math.PI) / 180;
  const sinE = Math.sin(e);
  const cosE = Math.cos(e);
  // Extents include the floor origin, so a floating model still relates to it.
  let rXZ = 0;
  let yMin = 0;
  let yMax = 0;
  for (const [x, y, z] of model.vertices) {
    rXZ = Math.max(rXZ, Math.hypot(x, z));
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }
  const platterR = Math.max(rXZ, 0.1) * PLATTER_RATIO;
  // Worst-case screen half-extents in model units, above and below the floor.
  const top = Math.max(yMax * cosE + rXZ * sinE, platterR * sinE);
  const bottom = Math.max(platterR * sinE, rXZ * sinE - yMin * cosE);
  const scale = Math.max(
    0,
    Math.min(
      (size / 2 - STAGE_PAD) / platterR,
      (size - 2 * STAGE_PAD - INDEX_GAP) / Math.max(top + bottom, 1e-6),
    ),
  );
  return {
    scale,
    cx: size / 2,
    cy: STAGE_PAD + top * scale,
    platterR,
    platterRx: platterR * scale,
    platterRy: platterR * scale * sinE,
    sinE,
    cosE,
  };
};

type SceneStrings = {
  back: string;
  front: string;
  dots: string;
  ticks: string;
};

const r2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * One full projection pass for yaw θ (degrees) under fixed elevation φ:
 *
 *   x̃ =  x·cosθ + z·sinθ           — yaw about Y
 *   z̃ = −x·sinθ + z·cosθ           — depth after yaw (+z̃ toward the viewer)
 *   x′ = x̃                          — orthographic, no foreshortening
 *   y′ = y·cosφ − z̃·sinφ            — elevation tilt about X
 *   X  = cx + x′·s,  Y = cy − y′·s   — SVG y grows downward
 *
 * Edges split into BACK/FRONT `d` strings around the frame's mid-depth, the
 * four nearest vertices become round-cap dabs, and the platter ticks ride
 * the same yaw matrix — all four strings from this single pass.
 */
const projectScene = (
  deg: number,
  model: TurnModelWireframe,
  stage: Stage,
): SceneStrings => {
  const t = (deg * Math.PI) / 180;
  const cosT = Math.cos(t);
  const sinT = Math.sin(t);
  const { scale, cx, cy, sinE, cosE, platterR } = stage;

  const pts: { x: number; y: number; depth: number }[] = [];
  for (const [x, y, z] of model.vertices) {
    const rx = x * cosT + z * sinT;
    const rz = -x * sinT + z * cosT;
    pts.push({
      x: r2(cx + rx * scale),
      y: r2(cy - (y * cosE - rz * sinE) * scale),
      depth: rz,
    });
  }

  // Edge membership by average depth against this frame's mid-depth.
  let minD = Infinity;
  let maxD = -Infinity;
  const segs: { mid: number; d: string }[] = [];
  for (const [a, b] of model.edges) {
    const p = pts[a];
    const q = pts[b];
    if (!p || !q) continue;
    const mid = (p.depth + q.depth) / 2;
    if (mid < minD) minD = mid;
    if (mid > maxD) maxD = mid;
    segs.push({ mid, d: `M${p.x} ${p.y}L${q.x} ${q.y}` });
  }
  const split = (minD + maxD) / 2;
  let back = "";
  let front = "";
  for (const seg of segs) {
    if (seg.mid < split) back += seg.d;
    else front += seg.d;
  }

  // Accent dabs on the nearest vertices — hairline segments, round caps.
  const nearest = [...pts].sort((p, q) => q.depth - p.depth).slice(0, DOT_COUNT);
  let dots = "";
  for (const p of nearest) dots += `M${p.x} ${p.y}l0.01 0`;

  // Platter ticks live on the floor plane and turn through the same matrix.
  let ticks = "";
  const r0 = platterR * TICK_INNER;
  for (let i = 0; i < 360; i += TICK_DEG) {
    const a = (i * Math.PI) / 180;
    const mx = Math.cos(a);
    const mz = Math.sin(a);
    const ux = (mx * cosT + mz * sinT) * scale;
    const uy = (-mx * sinT + mz * cosT) * sinE * scale;
    ticks += `M${r2(cx + ux * r0)} ${r2(cy + uy * r0)}L${r2(cx + ux * platterR)} ${r2(cy + uy * platterR)}`;
  }

  return { back, front, dots, ticks };
};

type FlightControls = {
  glide: ReturnType<typeof animate> | null;
  snap: ReturnType<typeof animate> | null;
};

/**
 * An object turntable — drag scrubs the model around in place, drawn live
 * from projected geometry. One yaw motion value feeds a single projection
 * pass (documented at `projectScene`), so the wireframe is honest math, not
 * frames: edges split into a dim hairline back pass and a full-ink front
 * pass, the four nearest vertices carry accent dots, and the platter's 30°
 * ticks turn with the model under a static front index. Horizontal drags
 * scrub θ at 0.5°/px with free wrap; release carries momentum on one `drift`
 * glide, then the platter clicks onto the nearest 15° detent on `snap`, and
 * `onAngleChange` reports the settle wrapped to 0–360 and deduped. The stage
 * is a slider — arrows step a detent, PageUp/Down a quarter turn, Home
 * squares to zero — and reduced motion trades flights for instant jumps
 * while the projection still derives live under the pointer.
 */
export function TurnModel({
  model,
  angle,
  defaultAngle = 30,
  onAngleChange,
  size = 220,
  elevationDeg = 18,
  className,
  "aria-label": ariaLabel = "Object turntable",
}: TurnModelProps) {
  const motionSafe = useMotionSafe();
  const wire = model ?? MONUMENT;
  const stage = computeStage(wire, size, elevationDeg);

  /** Boot yaw: the controlled angle verbatim, else the snapped default. */
  const [initial] = React.useState(() =>
    angle !== undefined ? wrapAngle(angle) : snapAngle(defaultAngle, DETENT_DEG),
  );
  /** The one source of truth — unwrapped yaw in degrees. */
  const theta = useMotionValue(initial);

  // The single projection pass; the field reads below never re-project.
  const scene = useTransform(theta, (deg) => projectScene(deg, wire, stage));
  const backD = useTransform(scene, (s) => s.back);
  const frontD = useTransform(scene, (s) => s.front);
  const dotsD = useTransform(scene, (s) => s.dots);
  const ticksD = useTransform(scene, (s) => s.ticks);

  /** Live integer readout for the chip and slider aria, deduped per degree. */
  const [liveDeg, setLiveDeg] = React.useState(
    () => Math.round(wrapAngle(initial)) % 360,
  );
  useMotionValueEvent(theta, "change", (v) => {
    const next = Math.round(wrapAngle(v)) % 360;
    setLiveDeg((prev) => (prev === next ? prev : next));
  });

  /** Last announced settle, wrapped — the dedupe for `onAngleChange`. */
  const committedRef = React.useRef(wrapAngle(initial));
  /** The unwrapped yaw the platter is resting on (or steering toward). */
  const restRef = React.useRef(initial);
  const dragRef = React.useRef<{ pointerId: number; lastX: number } | null>(null);
  const controlsRef = React.useRef<FlightControls>({ glide: null, snap: null });

  const onAngleChangeRef = React.useRef(onAngleChange);
  React.useEffect(() => {
    onAngleChangeRef.current = onAngleChange;
  });

  // Nothing in flight may outlive the component.
  React.useEffect(() => {
    const controls = controlsRef.current;
    return () => {
      controls.glide?.stop();
      controls.snap?.stop();
    };
  }, []);

  const stopFlights = () => {
    controlsRef.current.glide?.stop();
    controlsRef.current.snap?.stop();
  };

  /** Register a settle: remember the rest, announce the wrapped yaw once. */
  const commit = (settled: number) => {
    restRef.current = settled;
    const wrapped = wrapAngle(settled);
    if (committedRef.current === wrapped) return;
    committedRef.current = wrapped;
    onAngleChangeRef.current?.(wrapped);
  };

  /** Steer the yaw onto a target — `snap` rich, an instant jump under RM. */
  const settleTo = (target: number) => {
    stopFlights();
    restRef.current = target;
    if (!motionSafe) {
      theta.jump(target);
      commit(target);
      return;
    }
    controlsRef.current.snap = animate(theta, target, {
      ...springs.snap,
      onComplete: () => commit(target),
    });
  };

  /** Release: one velocity-seeded drift glide, then the 15° detent click. */
  const releaseWithMomentum = () => {
    const current = theta.get();
    if (!motionSafe) {
      const detent = snapAngle(current, DETENT_DEG);
      theta.jump(detent);
      commit(detent);
      return;
    }
    const velocity = theta.getVelocity();
    const carry = clamp(velocity * MOMENTUM_WINDOW, -MAX_CARRY_DEG, MAX_CARRY_DEG);
    const glideTarget = current + carry;
    const detent = snapAngle(glideTarget, DETENT_DEG);
    stopFlights();
    restRef.current = detent;
    controlsRef.current.glide = animate(theta, glideTarget, {
      ...springs.drift,
      velocity,
      onComplete: () => {
        controlsRef.current.snap = animate(theta, detent, {
          ...springs.snap,
          onComplete: () => commit(detent),
        });
      },
    });
  };

  // Controlled updates steer the platter without re-announcing them.
  React.useEffect(() => {
    if (angle === undefined) return;
    const wrapped = wrapAngle(angle);
    if (committedRef.current === wrapped) return;
    committedRef.current = wrapped;
    const target = restRef.current + angleDelta(restRef.current, angle);
    restRef.current = target;
    controlsRef.current.glide?.stop();
    controlsRef.current.snap?.stop();
    if (motionSafe) {
      controlsRef.current.snap = animate(theta, target, springs.snap);
    } else {
      theta.jump(target);
    }
  }, [angle, motionSafe, theta]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    stopFlights();
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = (event.clientX - drag.lastX) * DEG_PER_PX;
    drag.lastX = event.clientX;
    if (delta !== 0) theta.set(theta.get() + delta);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    releaseWithMomentum();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const rest = snapAngle(restRef.current, DETENT_DEG);
    let target: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        target = rest + DETENT_DEG;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        target = rest - DETENT_DEG;
        break;
      case "PageUp":
        target = rest + 90;
        break;
      case "PageDown":
        target = rest - 90;
        break;
      case "Home":
        target = rest + angleDelta(rest, 0);
        break;
      default:
        return;
    }
    event.preventDefault();
    settleTo(target);
  };

  const padded = String(liveDeg).padStart(3, "0");

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-2 rounded-4 border border-hairline bg-surface-1 p-3 select-none",
        className,
      )}
    >
      {/* The stage — one slider; the focus ring lives on this frame. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={liveDeg}
        aria-valuetext={`${liveDeg} degrees`}
        className="relative touch-none cursor-ew-resize rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
        style={{ width: size, height: size }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        <svg
          aria-hidden="true"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block"
        >
          {/* The platter: floor ellipse, then its 30° ticks riding the yaw. */}
          <ellipse
            cx={stage.cx}
            cy={stage.cy}
            rx={stage.platterRx}
            ry={stage.platterRy}
            fill="var(--accent-wash)"
            stroke="var(--hairline)"
            strokeWidth={1}
          />
          <motion.path
            d={ticksD}
            fill="none"
            stroke="var(--ink-3)"
            strokeWidth={1}
          />
          {/* Static index tick at the front rim. */}
          <line
            x1={stage.cx}
            y1={stage.cy + stage.platterRy + 3}
            x2={stage.cx}
            y2={stage.cy + stage.platterRy + 9}
            stroke="var(--accent-bright)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {/* The wireframe: dim back pass under the full-ink front pass. */}
          <motion.path
            d={backD}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth={1}
            strokeLinejoin="round"
          />
          <motion.path
            d={frontD}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <motion.path
            d={dotsD}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Mono readout chip — the slider aria-valuetext speaks for it. */}
      <span
        aria-hidden="true"
        className="rounded-1 border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-label tracking-wide text-ink-2 tabular-nums"
      >
        YAW &middot; {padded}&deg;
      </span>
    </div>
  );
}
