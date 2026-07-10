"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { angleDelta, clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Only the first 16 tags join the sphere — past that the lattice crowds. */
const MAX_TAGS = 16;
/** Golden angle — the Fibonacci lattice's azimuthal step for even spacing. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Designed resting tilt (degrees) so the lattice reads as a sphere at rest. */
const REST_PITCH = -14;
/** Ambient idle spin — yaw drifts this many degrees per second. */
const AMBIENT_DEG_PER_S = 4;
/** Pointer travel (px) before a press becomes a spin — protects chip taps. */
const DRAG_THRESHOLD = 3;
/** Pointer travel → rotation, degrees per px. */
const DRAG_PER_PX = 0.5;
/** Pitch never crosses the poles — drag and glides both honor this bound. */
const PITCH_MAX = 58;
/** Release momentum is clamped to a believable throw, deg/s. */
const MOMENTUM_CAP = 180;
/** Fling travel = release velocity × this carry, seconds. */
const MOMENTUM_CARRY = 0.35;
/** Below this release speed (deg/s) the sphere simply rests — no glide. */
const MOMENTUM_MIN = 12;
/** Back-hemisphere pose: receded chips shrink, dim, and go pointer-inert. */
const BACK_SCALE = 0.62;
const BACK_OPACITY = 0.28;
/** rAF dt clamp so one janky frame never teleports the ambient spin. */
const MAX_DT = 0.064;

/** Chip voice shared by the sphere and the reduced-motion cloud. */
const CHIP_BASE =
  "cursor-pointer rounded-full border bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap";

const chipTone = (pressed: boolean): string =>
  pressed
    ? "border-[var(--accent-bright)] bg-[var(--accent-wash)] text-ink"
    : "border-hairline text-ink-2 hover:text-ink";

type UnitVec = { x: number; y: number; z: number };

/**
 * Point `index` of `count` on the unit Fibonacci sphere — latitude steps
 * evenly down the y axis while the golden angle walks the azimuth. Fully
 * determined by the index: no Math.random, identical on server and client.
 */
const fibonacciPoint = (index: number, count: number): UnitVec => {
  const denom = count > 1 ? count - 1 : 1;
  const y = count > 1 ? 1 - (index / denom) * 2 : 0;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * GOLDEN_ANGLE;
  return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
};

/**
 * Rotate `unit` by yaw (about Y) then pitch (about X) and project
 * orthographically: x/y in unit scale (screen y grows downward), depth the
 * rotated z in [−1, 1] — +1 nearest the viewer.
 */
const project = (
  unit: UnitVec,
  yawDeg: number,
  pitchDeg: number,
): { x: number; y: number; depth: number } => {
  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const xz = unit.x * cosY + unit.z * sinY;
  const zz = -unit.x * sinY + unit.z * cosY;
  const yz = unit.y * cosP - zz * sinP;
  const depth = unit.y * sinP + zz * cosP;
  return { x: xz, y: -yz, depth };
};

/** True when `el` gained focus via the keyboard; pauses on the safe side. */
const isKeyboardFocus = (el: HTMLElement): boolean => {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
};

export type OrbitTag = {
  /** Stable identity — also the value reported by `onValueChange`. */
  id: string;
  /** Chip face and the voice of the announcements. */
  label: string;
};

export type OrbitTagsProps = {
  /** Tags on the sphere; the first 16 are used. */
  tags: OrbitTag[];
  /** Controlled selection (`null` = nothing selected). */
  value?: string | null;
  /** Initial selection for uncontrolled usage. */
  defaultValue?: string | null;
  /** Fires with the selected id, or null when a click deselects. */
  onValueChange?: (id: string | null) => void;
  /** Sphere radius, px. @default 92 */
  radius?: number;
  /** Stage height, px (sphere mode; the reduced-motion cloud flows). @default 240 */
  height?: number;
  className?: string;
  /** Accessible name for the group. @default "Tag sphere" */
  "aria-label"?: string;
};

/**
 * A selectable tag sphere: drag spins it, click selects, roving tabindex
 * walks it. Every tag is a real DOM `<button>` (aria-pressed, focus ring) —
 * not a canvas dot — seated on a Fibonacci lattice (golden-angle azimuth over
 * even latitudes, deterministic from index).
 *
 * Geometry: sphere orientation lives in two motion values, yaw and pitch
 * (degrees). Each chip derives x/y/depth via `useTransform` off [yaw, pitch]
 * and its fixed unit vector, then chains scale (0.62→1), opacity (0.28→1),
 * z-index, and pointer-events (back hemisphere inert) off depth — projections
 * never touch React state, so a spin re-renders nothing.
 *
 * Ambient: one rAF loop drifts yaw at 4°/s with the full pause discipline —
 * document hidden, stage offscreen (IntersectionObserver), any tag
 * keyboard-focused (`:focus-visible`, orrery's rule), pointer hovering the
 * stage, an active drag, or any glide in flight all pause it. Resuming
 * rebases the loop clock (`last = null`, point-globe's pattern) so the spin
 * continues rather than jumps; the loop stops on unmount.
 *
 * Drag: past a 3px threshold the pointer is captured and spins yaw/pitch
 * live at 0.5°/px (pitch clamped ±58° so the poles never invert). Release
 * hands the smoothed velocity (capped at 180°/s) to a single two-keyframe
 * `springs.drift` glide — `animate(yaw, yaw + v·0.35, { ...drift,
 * velocity: v })` — so the fling decays on house physics instead of a
 * bespoke integrator. Grabbing the sphere stops any glide in flight.
 *
 * Select: clicking a front-hemisphere chip selects it (single-select;
 * clicking again deselects to null) and the sphere rotates that tag to
 * front-center — yaw target `atan2(−x, z)`, pitch target `atan2(y, √(x²+z²))`
 * clamped to ±58° (polar tags land just off vertical center), both gliding on
 * `springs.glide` with the yaw taking the short way around via `angleDelta`.
 *
 * Roving tabindex: exactly one chip is tabbable. ArrowRight/Left walk the
 * tag order (wrapping) — focus moves and the sphere glides the newly focused
 * tag to front; Enter/Space select (native button activation). An sr-only
 * polite region announces focus and selection ("label" / "label selected").
 *
 * Reduced motion: no sphere, no spin — the same buttons render as a flat
 * wrapped chip cloud with identical selection, roving keyboard order, and
 * announcements.
 *
 * Cleanup: the rAF, both observers, and every in-flight `animate` control are
 * torn down on unmount; selection/focus/announcements are set only in event
 * handlers, never in effect bodies.
 */
export function OrbitTags({
  tags,
  value: valueProp,
  defaultValue = null,
  onValueChange,
  radius = 92,
  height = 240,
  className,
  "aria-label": ariaLabel = "Tag sphere",
}: OrbitTagsProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const roster = tags.slice(0, MAX_TAGS);
  const count = roster.length;

  // Selection: controlled or uncontrolled, toggled only from click handlers.
  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | null
  >(defaultValue);
  const selected = valueProp !== undefined ? valueProp : uncontrolledValue;

  // Roving tab stop + polite announcements — both written by handlers only.
  const [rovingId, setRovingId] = React.useState<string | null>(
    () => valueProp ?? defaultValue ?? null,
  );
  const [announcement, setAnnouncement] = React.useState("");
  const [grabbing, setGrabbing] = React.useState(false);

  const tabStopId = roster.some((tag) => tag.id === rovingId)
    ? rovingId
    : (roster[0]?.id ?? null);

  // Sphere orientation — the only live state, and it is motion values.
  const yaw = useMotionValue(0);
  const pitch = useMotionValue(REST_PITCH);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const chipRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  /** Ambient-pause gates, all read by the loop's sync. */
  const hoverRef = React.useRef(false);
  const focusPauseRef = React.useRef(false);
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
  });
  /** In-flight momentum/rotate glides — gate the loop, stopped on unmount. */
  const flightsRef = React.useRef<Set<ReturnType<typeof animate>>>(new Set());
  /** The loop's gate re-check, exposed to event handlers (orrery pattern). */
  const syncRef = React.useRef<(() => void) | null>(null);
  /** An engaged spin's release click must not read as a chip pick. */
  const suppressClickRef = React.useRef(false);

  /** Keep a glide until it settles (or is stopped) so unmount can stop it. */
  const track = (flight: ReturnType<typeof animate>) => {
    const flights = flightsRef.current;
    flights.add(flight);
    syncRef.current?.();
    const done = () => {
      if (flights.delete(flight)) syncRef.current?.();
    };
    flight.then(done, done);
  };

  /** Stop every glide in flight — a grab or a fresh rotate owns the sphere. */
  const stopFlights = () => {
    const flights = flightsRef.current;
    flights.forEach((flight) => flight.stop());
    flights.clear();
    syncRef.current?.();
  };

  /**
   * Glide the orientation that brings `unit` to front-center (+z): yaw
   * `atan2(−x, z)` taking the short way via angleDelta, pitch `atan2(y, √(x²+z²))`
   * clamped to the drag envelope. Two 2-keyframe glides, one per axis.
   */
  const rotateToFront = (unit: UnitVec) => {
    stopFlights();
    const yawTargetAbs = (Math.atan2(-unit.x, unit.z) * 180) / Math.PI;
    const pitchTarget = clamp(
      (Math.atan2(unit.y, Math.hypot(unit.x, unit.z)) * 180) / Math.PI,
      -PITCH_MAX,
      PITCH_MAX,
    );
    const yawNow = yaw.get();
    track(animate(yaw, yawNow + angleDelta(yawNow, yawTargetAbs), springs.glide));
    track(animate(pitch, pitchTarget, springs.glide));
  };

  /** Toggle selection from a click/Enter/Space; select also rotates front. */
  const handleActivate = (tag: OrbitTag, unit: UnitVec | null) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const next = selected === tag.id ? null : tag.id;
    if (valueProp === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
    setRovingId(tag.id);
    setAnnouncement(next === null ? tag.label : `${tag.label} selected`);
    if (next !== null && unit !== null && motionSafe) rotateToFront(unit);
  };

  /** Arrow traversal: move the tab stop (wrapping), focus it, rotate it front. */
  const moveRoving = (currentId: string, dir: 1 | -1) => {
    if (count === 0) return;
    const index = roster.findIndex((tag) => tag.id === currentId);
    const nextIndex = ((index === -1 ? 0 : index) + dir + count) % count;
    const next = roster[nextIndex];
    if (!next) return;
    setRovingId(next.id);
    chipRefs.current.get(next.id)?.focus();
    if (motionSafe) rotateToFront(fibonacciPoint(nextIndex, count));
  };

  const handleChipKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    moveRoving(id, event.key === "ArrowRight" ? 1 : -1);
  };

  /** Focus carries the tab stop and announces; Enter/Space then activate. */
  const handleChipFocus = (tag: OrbitTag) => {
    setRovingId(tag.id);
    setAnnouncement(tag.label);
  };

  const registerChip = (id: string, node: HTMLButtonElement | null) => {
    const map = chipRefs.current;
    if (node) map.set(id, node);
    else map.delete(id);
  };

  // --- drag: spin live, fling on release (sphere mode only) ---------------
  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const drag = dragRef.current;
    drag.id = event.pointerId;
    drag.active = true;
    drag.engaged = false;
    drag.startX = event.clientX;
    drag.startY = event.clientY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    drag.vYaw = 0;
    suppressClickRef.current = false;
    // Seizing the sphere interrupts any momentum or rotate-to-front glide.
    stopFlights();
    syncRef.current?.();
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.id) return;
    if (!drag.engaged) {
      const travel = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );
      if (travel < DRAG_THRESHOLD) return;
      // Crossed the threshold — this is a spin. Capture now so a clean tap
      // on a chip still gets its own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    const dYaw = dx * DRAG_PER_PX;
    yaw.set(yaw.get() + dYaw);
    pitch.set(clamp(pitch.get() + dy * DRAG_PER_PX, -PITCH_MAX, PITCH_MAX));
    // Smooth the angular velocity so the release fling reads intent.
    if (dt > 0) drag.vYaw = drag.vYaw * 0.4 + (dYaw / dt) * 0.6;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
  };

  const settleDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    fling: boolean,
  ) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.id) return;
    const engaged = drag.engaged;
    drag.active = false;
    drag.engaged = false;
    drag.id = -1;
    if (engaged) {
      setGrabbing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (fling) {
        // The click minted by this release is a spin, not a pick; the stage's
        // own click handler clears the flag right after.
        suppressClickRef.current = true;
        const v = clamp(drag.vYaw, -MOMENTUM_CAP, MOMENTUM_CAP);
        if (Math.abs(v) >= MOMENTUM_MIN) {
          // Momentum is one 2-keyframe drift glide — current → current +
          // v·carry — seeded with the smoothed release velocity so the fling
          // decays on house physics rather than a hand-rolled integrator.
          track(
            animate(yaw, yaw.get() + v * MOMENTUM_CARRY, {
              ...springs.drift,
              velocity: v,
            }),
          );
        }
      }
    }
    syncRef.current?.();
  };

  // The one rAF loop: drift yaw, gated on every pause source. Sphere only.
  React.useEffect(() => {
    if (!motionSafe) return;
    const stage = stageRef.current;
    if (!stage) return;

    let raf = 0;
    let last: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (last === null) {
        // First frame after a resume — the clock rebases over the pause so
        // the spin continues from where it stopped rather than jumping.
        last = now;
        return;
      }
      const dt = Math.min((now - last) / 1000, MAX_DT);
      last = now;
      yaw.set(yaw.get() + AMBIENT_DEG_PER_S * dt);
    };

    const syncLoop = () => {
      const shouldRun =
        inView &&
        !document.hidden &&
        !hoverRef.current &&
        !focusPauseRef.current &&
        !dragRef.current.active &&
        flightsRef.current.size === 0;
      if (shouldRun && raf === 0) {
        last = null; // rebase on resume
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
    syncRef.current = syncLoop;

    const onVisibility = () => syncLoop();
    const intersection = new IntersectionObserver((entries) => {
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) inView = lastEntry.isIntersecting;
      syncLoop();
    });
    intersection.observe(stage);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      syncRef.current = null;
    };
  }, [motionSafe, yaw]);

  // A glide in progress must never outlive the component.
  React.useEffect(() => {
    const flights = flightsRef.current;
    return () => {
      flights.forEach((flight) => flight.stop());
      flights.clear();
    };
  }, []);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("relative", className)}
      // Keyboard focus on any chip holds the ambient spin still; pointer
      // focus (a click) must not — hover already owns that pause.
      onFocus={(event) => {
        focusPauseRef.current = isKeyboardFocus(event.target as HTMLElement);
        syncRef.current?.();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        focusPauseRef.current = false;
        syncRef.current?.();
      }}
    >
      {motionSafe ? (
        <div
          ref={stageRef}
          className={cn(
            "relative w-full touch-none select-none",
            grabbing ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{ height }}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={(event) => settleDrag(event, true)}
          onPointerCancel={(event) => settleDrag(event, false)}
          onPointerEnter={() => {
            hoverRef.current = true;
            syncRef.current?.();
          }}
          onPointerLeave={() => {
            hoverRef.current = false;
            syncRef.current?.();
          }}
          // Runs after any chip's click — clears a spin's suppress flag.
          onClick={() => {
            suppressClickRef.current = false;
          }}
        >
          {/* Faint radial floor shadow grounding the sphere on the stage. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: 10,
              width: radius * 1.7,
              height: 16,
              background:
                "radial-gradient(closest-side, var(--hairline-strong), transparent)",
            }}
          />
          {roster.map((tag, index) => {
            const unit = fibonacciPoint(index, count);
            return (
              <OrbitChip
                // Remount when the lattice or radius changes so every
                // useTransform closure stays bound to fresh geometry.
                key={`${tag.id}:${count}:${radius}`}
                tag={tag}
                unit={unit}
                radius={radius}
                yaw={yaw}
                pitch={pitch}
                pressed={selected === tag.id}
                tabStop={tag.id === tabStopId}
                register={registerChip}
                onActivate={() => handleActivate(tag, unit)}
                onChipFocus={() => handleChipFocus(tag)}
                onChipKeyDown={(event) => handleChipKeyDown(event, tag.id)}
              />
            );
          })}
        </div>
      ) : (
        /* Reduced motion: the same buttons as a flat wrapped chip cloud —
           identical selection, roving order, and announcements. */
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {roster.map((tag) => (
            <button
              key={tag.id}
              ref={(node) => registerChip(tag.id, node)}
              type="button"
              aria-pressed={selected === tag.id}
              tabIndex={tag.id === tabStopId ? 0 : -1}
              onClick={() => handleActivate(tag, null)}
              onFocus={() => handleChipFocus(tag)}
              onKeyDown={(event) => handleChipKeyDown(event, tag.id)}
              className={cn(CHIP_BASE, chipTone(selected === tag.id))}
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}

      {/* Polite announcer for focus and selection. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type OrbitChipProps = {
  tag: OrbitTag;
  unit: UnitVec;
  radius: number;
  yaw: MotionValue<number>;
  pitch: MotionValue<number>;
  pressed: boolean;
  tabStop: boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onActivate: () => void;
  onChipFocus: () => void;
  onChipKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * One tag chip on the lattice. Its pose is pure derivation: x/y/depth via
 * useTransform off [yaw, pitch] and the chip's fixed unit vector, with scale,
 * opacity, z-index, and pointer-events chained off depth — the back
 * hemisphere recedes (×0.62, 28% opacity) and goes inert. No per-frame
 * setState anywhere; the transform template centers the chip on its point.
 */
function OrbitChip({
  tag,
  unit,
  radius,
  yaw,
  pitch,
  pressed,
  tabStop,
  register,
  onActivate,
  onChipFocus,
  onChipKeyDown,
}: OrbitChipProps) {
  const x = useTransform(
    [yaw, pitch],
    ([yawDeg = 0, pitchDeg = 0]: number[]) =>
      project(unit, yawDeg, pitchDeg).x * radius,
  );
  const y = useTransform(
    [yaw, pitch],
    ([yawDeg = 0, pitchDeg = 0]: number[]) =>
      project(unit, yawDeg, pitchDeg).y * radius,
  );
  const depth = useTransform(
    [yaw, pitch],
    ([yawDeg = 0, pitchDeg = 0]: number[]) =>
      project(unit, yawDeg, pitchDeg).depth,
  );
  const scale = useTransform(depth, [-1, 1], [BACK_SCALE, 1]);
  const opacity = useTransform(depth, [-1, 1], [BACK_OPACITY, 1]);
  const zIndex = useTransform(depth, (d) => Math.round((d + 1) * 50) + 1);
  const pointerEvents = useTransform(depth, (d): string =>
    d < 0 ? "none" : "auto",
  );

  return (
    <motion.button
      ref={(node) => register(tag.id, node)}
      type="button"
      aria-pressed={pressed}
      tabIndex={tabStop ? 0 : -1}
      onClick={onActivate}
      onFocus={onChipFocus}
      onKeyDown={onChipKeyDown}
      transformTemplate={(_, generated) =>
        `translate(-50%, -50%) ${generated}`
      }
      className={cn(
        "absolute transition-colors duration-200",
        CHIP_BASE,
        chipTone(pressed),
      )}
      style={{
        left: "50%",
        top: "50%",
        x,
        y,
        scale,
        opacity,
        zIndex,
        pointerEvents,
      }}
    >
      {tag.label}
    </motion.button>
  );
}
