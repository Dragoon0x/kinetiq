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
import { clamp, mapRange, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type RailStation = {
  /** Stable identity — also the value reported by `onArrive`. */
  id: string;
  /** Mono label under the car and the voice of the arrival announcement. */
  label: string;
  node?: React.ReactNode;
};

export type CameraRailProps = {
  /** Station cars, evenly spaced along the track, in rail order. */
  stations: RailStation[];
  /** Controlled settled station id; glides there when it changes at rest. */
  value?: string;
  /** Initial settled station for uncontrolled usage. */
  defaultValue?: string;
  /** Fires once per new settle, deduped against the last arrival. */
  onArrive?: (id: string) => void;
  /** Stage height, px. */
  height?: number;
  className?: string;
  /** Accessible name for the rail group. */
  "aria-label"?: string;
};

/** Horizontal spacing between adjacent station cars, px. */
const SPACING = 132;
/** Distance (in stations) over which a car fully recedes. */
const RECEDE_SPAN = 2.4;
/** Scale floor at full recede. */
const MIN_SCALE = 0.62;
/** Opacity floor at full recede. */
const MIN_OPACITY = 0.22;
/** Integer z-push per station of distance, px (flat 2.5D — no preserve-3d). */
const Z_STEP = 14;
/** Pointer travel (px) before a press becomes a drag — protects car taps. */
const DRAG_THRESHOLD = 3;
/** Release velocity (station/s) is clamped to a believable throw. */
const MAX_FLING = 6;
/** Momentum carry: how far the drift leg projects ahead of the release. */
const DRIFT_CARRY = 0.24;
/** Below this release speed the rail skips the drift leg and just snaps. */
const DRIFT_MIN = 0.4;

type DragState = {
  pointerId: number;
  /** Pointer x where the press began — measures the tap threshold. */
  startX: number;
  /** `position` value when the press began. */
  startPosition: number;
  /** Last pointer x, for per-move deltas. */
  lastX: number;
  /** Last move timestamp (ms), for pointer velocity. */
  lastT: number;
  /** Smoothed velocity in station/s; positive drags ride toward later stations. */
  velocity: number;
  engaged: boolean;
};

/**
 * A horizontal monorail of station cars under a fixed camera. One `position`
 * motion value (station-units) is the single source of truth: the rail
 * translates so `position` sits at center, and every car derives its x,
 * scale, opacity, and z-push from its distance to `position` via
 * `useTransform` (flat 2.5D — no preserve-3d, just scale/opacity/integer
 * z-index by distance). A visible rail line runs beneath the cars with a
 * tick under every station and a fixed platform marker at center.
 *
 * Pointer-captured drag rides the rail 1:1 in station-units (a 3px threshold
 * tells a tap from a drag, so a car tap does not eat a click); release seeds
 * a short `springs.drift` leg with the release velocity — a fling that coasts
 * — then chains into a `springs.snap` leg onto the nearest station once that
 * leg lands, the detent settling under momentum. Slow releases skip the
 * drift and snap straight to the nearest station. An epoch/flights ref (a
 * `Set` of in-flight `animate` controls) is stopped on every new gesture and
 * on unmount, so nothing stray keeps driving `position`.
 *
 * The rail frame is a focusable `role="group"`; ArrowRight/Left ride one
 * station on `springs.snap`, Home/End jump to the ends. Station cars are
 * buttons that ride to center on click or focus. Arrivals announce politely
 * ("<label> at the platform") and fire `onArrive`, deduped against the last
 * settle; `value` glides to a controlled station when it changes at rest,
 * `defaultValue` seeds the uncontrolled start.
 *
 * Reduced motion: every gesture resolves its nearest station and jumps —
 * no drift, no snap — with the same detents, callbacks, and announcements.
 */
export function CameraRail({
  stations,
  value: controlledValue,
  defaultValue,
  onArrive,
  height = 280,
  className,
  "aria-label": ariaLabel = "Camera rail",
}: CameraRailProps) {
  const motionSafe = useMotionSafe();

  const count = stations.length;
  const lastIndex = Math.max(0, count - 1);
  const isControlled = controlledValue !== undefined;

  const indexOf = (id: string | undefined): number => {
    if (id === undefined) return 0;
    const i = stations.findIndex((s) => s.id === id);
    return i === -1 ? 0 : i;
  };
  const clampIndex = (i: number) => clamp(Math.round(i), 0, lastIndex);

  const [initialIndex] = React.useState(() =>
    clampIndex(indexOf(controlledValue ?? defaultValue)),
  );

  /** The one source of truth for the visuals: fractional rail position. */
  const position = useMotionValue(initialIndex);
  /** Local settled index for the uncontrolled case; ignored when controlled. */
  const [uncontrolledIndex, setUncontrolledIndex] =
    React.useState(initialIndex);
  // Settled index derived in render (never mirrored via setState) — mirrors
  // the coverflow controlled/uncontrolled convention.
  const settledIndex = isControlled
    ? clampIndex(indexOf(controlledValue))
    : uncontrolledIndex;

  const dragRef = React.useRef<DragState | null>(null);
  const [grabbing, setGrabbing] = React.useState(false);

  // Latest settled index for gesture math without re-binding handlers each
  // render — synced in an effect (never read during render).
  const settledRef = React.useRef(initialIndex);
  React.useEffect(() => {
    settledRef.current = settledIndex;
  });

  const onArriveRef = React.useRef(onArrive);
  React.useEffect(() => {
    onArriveRef.current = onArrive;
  });

  /** In-flight drift/snap controls — stopped by any new gesture and on unmount. */
  const flightsRef = React.useRef<Set<ReturnType<typeof animate>>>(new Set());

  const seize = () => {
    const flights = flightsRef.current;
    flights.forEach((flight) => flight.stop());
    flights.clear();
  };

  const track = (control: ReturnType<typeof animate>) => {
    const flights = flightsRef.current;
    flights.add(control);
    const drop = () => flights.delete(control);
    control.then(drop, drop);
  };

  /**
   * Commit a settled station: announce it (deduped) and, when uncontrolled,
   * advance our own state. Controlled callers reflect it back via `value`.
   */
  const commitIndex = (next: number) => {
    const clamped = clampIndex(next);
    if (clamped !== settledRef.current) {
      settledRef.current = clamped;
      const station = stations[clamped];
      if (station) onArriveRef.current?.(station.id);
    }
    if (!isControlled) setUncontrolledIndex(clamped);
  };

  /** Snap straight to a station — the reduced-motion and no-fling path. */
  const jumpTo = (target: number) => {
    const clamped = clampIndex(target);
    seize();
    position.jump(clamped);
    commitIndex(clamped);
  };

  /** Glide to a station on `springs.snap`, optionally seeded with velocity. */
  const settleTo = (target: number, velocity = 0) => {
    if (!motionSafe) {
      jumpTo(target);
      return;
    }
    const clamped = clampIndex(target);
    seize();
    commitIndex(clamped);
    track(animate(position, clamped, { ...springs.snap, velocity }));
  };

  /**
   * Release with momentum: a velocity-seeded `springs.drift` leg projects the
   * throw forward, then chains into a `springs.snap` leg onto the nearest
   * station once the drift lands — the fling settling into its detent.
   */
  const releaseWithMomentum = (from: number, velocity: number) => {
    if (!motionSafe || Math.abs(velocity) < DRIFT_MIN) {
      settleTo(Math.round(from), velocity);
      return;
    }
    const projected = clamp(from + velocity * DRIFT_CARRY, 0, lastIndex);
    const target = clampIndex(projected);
    seize();
    track(
      animate(position, projected, {
        ...springs.drift,
        velocity,
        onComplete: () => {
          commitIndex(target);
          track(animate(position, target, springs.snap));
        },
      }),
    );
  };

  // A gesture or animation in flight must not outlive the component.
  React.useEffect(() => seize, []);

  // Re-seat position when the reduced-motion path (re)activates.
  React.useEffect(() => {
    if (motionSafe) return;
    seize();
    position.jump(settledRef.current);
  }, [motionSafe, position]);

  // Controlled value drives the rail directly (motion-value ops, never
  // setState here). Glides to it at rest; jumps under reduced motion.
  React.useEffect(() => {
    if (!isControlled || count === 0) return;
    const target = clampIndex(indexOf(controlledValue));
    if (Math.round(position.get()) === target) return;
    if (motionSafe) {
      seize();
      track(animate(position, target, springs.snap));
    } else {
      seize();
      position.jump(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledValue, count, motionSafe]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    seize();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startPosition: position.get(),
      lastX: event.clientX,
      lastT: event.timeStamp,
      velocity: 0,
      engaged: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const totalDx = event.clientX - drag.startX;
    if (!drag.engaged) {
      if (Math.abs(totalDx) < DRAG_THRESHOLD) return;
      // Crossed the threshold — a drag, not a tap. Capture now so taps on
      // cars/controls still receive their own click.
      drag.engaged = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
    }

    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) {
      // Smooth the instantaneous velocity so the release reads intent.
      const instant = (event.clientX - drag.lastX) / SPACING / dt;
      drag.velocity = drag.velocity * 0.4 + instant * 0.6;
    }
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;

    // Drag right → rail rides toward earlier stations (camera pans left).
    const raw = drag.startPosition - totalDx / SPACING;
    // Soft ±0.5 overscroll past the end stations.
    position.set(clamp(raw, -0.5, lastIndex + 0.5));
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.engaged) return; // A tap — leave the click to its target.

    setGrabbing(false);
    if (!motionSafe) {
      jumpTo(Math.round(position.get()));
      return;
    }
    const velocity = clamp(drag.velocity, -MAX_FLING, MAX_FLING);
    releaseWithMomentum(position.get(), velocity);
  };

  const ride = (target: number) => {
    if (motionSafe) settleTo(target);
    else jumpTo(target);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    switch (event.key) {
      case "ArrowRight":
        ride(settledRef.current + 1);
        break;
      case "ArrowLeft":
        ride(settledRef.current - 1);
        break;
      case "Home":
        ride(0);
        break;
      case "End":
        ride(lastIndex);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const hudText = useTransform(position, (v) => {
    const idx = clampIndex(v);
    return `STATION · ${String(idx + 1).padStart(2, "0")} / ${String(
      Math.max(count, 1),
    ).padStart(2, "0")}`;
  });

  const settledStation = stations[settledIndex];
  const announcement = settledStation
    ? `${settledStation.label} at the platform`
    : "";

  const trackWidth = Math.max((count - 1) * SPACING, 0);

  return (
    <div
      className={cn(
        "relative w-full touch-pan-y overflow-hidden rounded-3 border border-hairline bg-surface-0 outline-none select-none",
        className,
      )}
      style={{ height, perspective: perspectives.near }}
    >
      <div
        role="group"
        aria-label={`${ariaLabel}, use arrow keys`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={cn(
          "relative flex h-full w-full items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-cobalt-bright/40",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        {/* The rail line: fixed under the cars, spanning the full track. */}
        <RailLine position={position} count={count} trackWidth={trackWidth} />

        {stations.map((station, i) => (
          <StationCar
            key={station.id}
            station={station}
            index={i}
            position={position}
            onRide={ride}
          />
        ))}

        {/* Fixed platform marker at the camera's center of frame. */}
        <span
          aria-hidden
          className="border-hairline-strong pointer-events-none absolute bottom-[38%] h-3 w-px -translate-x-1/2 border-l"
          style={{ left: "50%" }}
        />
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute top-2 left-2 rounded-2 border border-hairline bg-surface-0/80 px-2 py-1 font-mono text-[10px] tracking-wide text-ink-3 backdrop-blur-sm"
      >
        <motion.span className="tabular-nums">{hudText}</motion.span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type RailLineProps = {
  position: MotionValue<number>;
  count: number;
  trackWidth: number;
};

/** The track line and its per-station ticks — translate together with the rail. */
function RailLine({ position, count, trackWidth }: RailLineProps) {
  const x = useTransform(position, (v) => -v * SPACING);
  const ticks = Array.from({ length: count }, (_, i) => i);

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute bottom-[36%] h-px"
      style={{ width: Math.max(trackWidth, 1), x }}
    >
      <span className="bg-hairline-strong absolute inset-y-0 left-0 right-0" />
      {ticks.map((i) => (
        <span
          key={i}
          className="bg-hairline-strong absolute top-0 h-2 w-px"
          style={{ left: i * SPACING }}
        />
      ))}
    </motion.div>
  );
}

type StationCarProps = {
  station: RailStation;
  index: number;
  position: MotionValue<number>;
  onRide: (index: number) => void;
};

/**
 * One car on the rail. Every visual derives from its distance to the shared
 * `position`: x rides the track, while scale/opacity/z recede by distance
 * from center — flat 2.5D, no preserve-3d. The car is a button so a click or
 * focus rides it to center and the a11y tree stays operable.
 */
function StationCar({ station, index, position, onRide }: StationCarProps) {
  const offset = useTransform(position, (v) => index - v);

  const x = useTransform(offset, (o) => o * SPACING);
  const distance = useTransform(offset, (o) => Math.abs(o));
  const scale = useTransform(distance, (d) =>
    mapRange(d, 0, RECEDE_SPAN, 1, MIN_SCALE),
  );
  const opacity = useTransform(distance, (d) =>
    mapRange(d, 0, RECEDE_SPAN, 1, MIN_OPACITY),
  );
  // Integer z-push, capped at the recede span: depth never lands on a
  // subpixel seam and never reverses past full recede.
  const z = useTransform(
    distance,
    (d) => -Math.round(Math.min(d, RECEDE_SPAN) * Z_STEP),
  );
  const zIndex = useTransform(distance, (d) => 1000 - Math.round(Math.min(d, 99)));

  return (
    <motion.button
      type="button"
      aria-label={`Ride to ${station.label}`}
      onClick={() => onRide(index)}
      onFocus={() => onRide(index)}
      className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 rounded-3 outline-none focus-visible:ring-2 focus-visible:ring-cobalt-bright/70"
      style={{ x, z, scale, opacity, zIndex }}
    >
      <span className="border-hairline bg-surface-1 flex h-16 w-24 flex-col items-center justify-center rounded-2 border shadow-sm">
        {station.node ?? (
          <span aria-hidden className="bg-hairline-strong size-2 rounded-full" />
        )}
      </span>
      <span className="text-ink-3 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap uppercase">
        {station.label}
      </span>
    </motion.button>
  );
}
