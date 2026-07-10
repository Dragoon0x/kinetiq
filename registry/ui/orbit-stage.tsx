"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  angleDelta,
  clamp,
  mapRange,
  snapAngle,
  wrapAngle,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Three stations seat at 120° detents around the yaw. */
const STATION_STEP = 120;
/** Pointer travel → orbit, degrees per horizontal px. */
const DRAG_PER_PX = 0.45;
/** Horizontal travel (px) before a press becomes an orbit — protects plate clicks. */
const DRAG_THRESHOLD = 3;
/** Release momentum is clamped to a believable throw, deg/s. */
const MOMENTUM_CAP = 420;
/** Below this release speed (deg/s) the stage skips the drift and just snaps. */
const MOMENTUM_MIN = 30;
/** Drift travel = release velocity × this carry, seconds. */
const MOMENTUM_CARRY = 0.3;
/** Depth-mapped pose range: back plates recede, dim, and ride higher. */
const BACK_SCALE = 0.62;
const FRONT_SCALE = 1.05;
const BACK_OPACITY = 0.25;
/** The camera looks slightly down: back plates rise, the front plate settles low. */
const BACK_RISE = -14;
const FRONT_DROP = 6;
/** Reduced motion swaps poses in a single frame; CSS crossfades the opacity. */
const INSTANT: Transition = { duration: 0 };

const RAD = Math.PI / 180;

/** Which station rests at front for a detent yaw (front when yaw ≡ −120k). */
const frontIndexForYaw = (deg: number): number =>
  Math.round(wrapAngle(-deg) / STATION_STEP) % 3;

export type StagePlate = {
  /** Stable identity — also the value reported by `onStationChange`. */
  id: string;
  /** Mono station tag on the plate and the voice of the announcements. */
  label: string;
  /** Plate face. Live DOM while the plate is at front; inert behind. */
  node: React.ReactNode;
};

export type OrbitStageProps = {
  /** Stations on the turntable; exactly the first three are used. */
  plates: StagePlate[];
  /** Controlled front plate id. */
  station?: string;
  /** Initial front plate for uncontrolled usage. */
  defaultStation?: string;
  /** Fires with the front plate id once the orbit settles on a detent. */
  onStationChange?: (id: string) => void;
  /** Orbit radius, px. @default 110 */
  radius?: number;
  /** Stage height, px. @default 260 */
  height?: number;
  className?: string;
  /** Accessible name for the group. @default "Orbit stage" */
  "aria-label"?: string;
};

/**
 * A three-station specimen turntable: drag orbits the camera around the
 * staged group, releases glide on momentum and snap a station to the front.
 *
 * Geometry is billboarded — flat transforms only, no preserve-3d. One yaw
 * motion value holds the camera; plate k sits at base angle k×120° and each
 * plate derives its screen pose via `useTransform` off (yaw + base):
 * x = sin×radius, depth = cos (1 = front), then scale (0.62→1.05), opacity
 * (0.25→1), y (−14→6 — back plates ride higher, the camera looks slightly
 * down) and z-index all chain off depth. Plates always face the viewer; the
 * orbit reads purely through position, scale, and stacking.
 *
 * The pedestal underneath is the turntable cue: a hairline floor ellipse
 * with a soft radial shadow, three faint station ticks at 120°, and a
 * highlight dot that orbits opposite the yaw (derived, never animated on
 * its own clock).
 *
 * Drag: past a 3px horizontal threshold the pointer is captured and yaw
 * tracks at 0.45°/px with free wrap. Release hands the smoothed velocity
 * (capped at 420°/s) to a single two-keyframe `springs.drift` glide, and the
 * landing then snaps to the nearest 120° detent on `springs.snap`. The
 * settled front plate is announced politely ("label at front") and reported
 * through `onStationChange` (deduped against the last settle). Clicking a
 * back plate rotates it to front the short way on `springs.glide`; clicking
 * the front plate does nothing — its content is live.
 *
 * Keyboard: the stage frame itself is a focusable `role="group"`.
 * ArrowLeft/ArrowRight rotate one station on `springs.snap`, Home returns to
 * the first plate. Only the front plate's content is tabbable; back plates
 * are `aria-hidden` and `inert`.
 *
 * Reduced motion: no orbit animation — every gesture resolves its detent and
 * swaps the poses in a single frame while a fast CSS crossfade smooths the
 * opacity. Same detents, callbacks, and announcements.
 *
 * Cleanup: every in-flight `animate` control is tracked and stopped on
 * unmount; there are no rAF loops and nothing random or clock-derived.
 */
export function OrbitStage({
  plates,
  station: stationProp,
  defaultStation,
  onStationChange,
  radius = 110,
  height = 260,
  className,
  "aria-label": ariaLabel = "Orbit stage",
}: OrbitStageProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const roster = plates.slice(0, 3);
  const count = roster.length;

  // Station resolution: controlled prop wins; uncontrolled settles move state.
  const [uncontrolledStation, setUncontrolledStation] = React.useState<
    string | null
  >(defaultStation ?? null);
  const resolvedStation =
    stationProp ?? uncontrolledStation ?? roster[0]?.id ?? "";
  const resolvedIndex = roster.findIndex((p) => p.id === resolvedStation);
  const frontIndex = resolvedIndex === -1 ? 0 : resolvedIndex;

  // Announcements and settle ticks are written only from handlers/callbacks.
  const [announcement, setAnnouncement] = React.useState("");
  const [settleTick, setSettleTick] = React.useState(0);
  const [grabbing, setGrabbing] = React.useState(false);

  // The camera. Initialized on the resolved station's detent; only the first
  // render's argument is ever read.
  const yaw = useMotionValue(-STATION_STEP * frontIndex);

  const dragRef = React.useRef({
    id: -1,
    active: false,
    engaged: false,
    startX: 0,
    startYaw: 0,
    lastX: 0,
    lastT: 0,
    vYaw: 0,
  });
  /** In-flight drift/snap/glide controls — stopped by any seize and on unmount. */
  const flightsRef = React.useRef<Set<ReturnType<typeof animate>>>(new Set());
  /** Gesture generation: bumping it orphans every pending flight chain. */
  const epochRef = React.useRef(0);
  /** An engaged orbit's release click must not read as a plate pick. */
  const suppressClickRef = React.useRef(false);
  /** Last id reported through onStationChange — settles dedupe against it. */
  const lastReportedRef = React.useRef<string | null>(roster[frontIndex]?.id ?? null);

  /** A new owner takes the stage: invalidate pending chains, stop flights. */
  const seize = (): number => {
    epochRef.current += 1;
    const flights = flightsRef.current;
    flights.forEach((flight) => flight.stop());
    flights.clear();
    return epochRef.current;
  };

  /**
   * One tracked two-keyframe move of the yaw. `onDone` runs only when the
   * flight lands naturally inside its own epoch — a seize (grab, new gesture,
   * unmount) orphans the chain.
   */
  const launch = (
    target: number,
    transition: Transition,
    epoch: number,
    onDone?: () => void,
  ) => {
    const flights = flightsRef.current;
    const flight = animate(yaw, target, transition);
    flights.add(flight);
    const finish = () => {
      flights.delete(flight);
      if (epochRef.current !== epoch) return;
      onDone?.();
    };
    flight.then(finish, finish);
  };

  /** The yaw has landed on `targetYaw` (a detent): announce, store, report. */
  const settleAt = (targetYaw: number, report: boolean) => {
    const k = frontIndexForYaw(targetYaw);
    const plate = roster[k];
    if (!plate) return;
    if (stationProp === undefined) setUncontrolledStation(plate.id);
    setAnnouncement(`${plate.label} at front`);
    setSettleTick((t) => t + 1);
    const changed = lastReportedRef.current !== plate.id;
    lastReportedRef.current = plate.id;
    if (report && changed) onStationChange?.(plate.id);
  };

  /** Rotate station k to the front by the shortest path, then settle. */
  const rotateToStation = (k: number, report: boolean, spring: Transition) => {
    if (!roster[k]) return;
    const epoch = seize();
    const yawNow = yaw.get();
    const target = yawNow + angleDelta(yawNow, -STATION_STEP * k);
    launch(target, motionSafe ? spring : INSTANT, epoch, () =>
      settleAt(target, report),
    );
  };

  /** Back plates rotate to front on click; the front plate stays interactive. */
  const handlePlateClick = (k: number) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const plate = roster[k];
    if (!plate || plate.id === resolvedStation) return;
    rotateToStation(k, true, springs.glide);
  };

  /** The station the yaw currently rests at (or is nearest to). */
  const frontIndexNow = (): number => {
    const k = frontIndexForYaw(snapAngle(yaw.get(), STATION_STEP));
    return k < count ? k : 0;
  };

  /** Arrows rotate one station on the crisp detent spring; Home goes first. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // Only when the frame itself is focused — never while the user is
    // interacting with the front plate's own content.
    if (event.target !== event.currentTarget || count === 0) return;
    let k: number | null = null;
    if (event.key === "ArrowRight") k = (frontIndexNow() + 1) % count;
    else if (event.key === "ArrowLeft") k = (frontIndexNow() - 1 + count) % count;
    else if (event.key === "Home") k = 0;
    if (k === null) return;
    event.preventDefault();
    rotateToStation(k, true, springs.snap);
  };

  // --- drag: orbit live, drift on release, snap to the detent --------------
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const drag = dragRef.current;
    drag.id = event.pointerId;
    drag.active = true;
    drag.engaged = false;
    drag.startX = event.clientX;
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    drag.vYaw = 0;
    suppressClickRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag.active || event.pointerId !== drag.id) return;
    if (!drag.engaged) {
      if (Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD) return;
      // Crossed the threshold — this is an orbit. Seizing here (not on the
      // pointerdown) means a plain tap never strands a glide off its detent.
      drag.engaged = true;
      seize();
      drag.startX = event.clientX;
      drag.startYaw = yaw.get();
      drag.lastX = event.clientX;
      drag.lastT = event.timeStamp;
      event.currentTarget.setPointerCapture(event.pointerId);
      setGrabbing(true);
      return;
    }
    const dx = event.clientX - drag.lastX;
    const dt = (event.timeStamp - drag.lastT) / 1000;
    const dYaw = dx * DRAG_PER_PX;
    // Reduced motion tracks the travel silently and resolves it on release.
    if (motionSafe) yaw.set(yaw.get() + dYaw);
    // Smooth the angular velocity so the release fling reads intent.
    if (dt > 0) drag.vYaw = drag.vYaw * 0.4 + (dYaw / dt) * 0.6;
    drag.lastX = event.clientX;
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
    if (!engaged) return;
    setGrabbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // The click minted by this release is an orbit, not a pick; the stage's
    // own click handler clears the flag right after.
    suppressClickRef.current = true;
    const epoch = epochRef.current;
    if (!motionSafe) {
      // Nothing moved live; a cancel leaves the resting detent untouched.
      if (!fling) return;
      const target = snapAngle(
        drag.startYaw + (event.clientX - drag.startX) * DRAG_PER_PX,
        STATION_STEP,
      );
      launch(target, INSTANT, epoch, () => settleAt(target, true));
      return;
    }
    const snapPhase = () => {
      const target = snapAngle(yaw.get(), STATION_STEP);
      launch(target, springs.snap, epoch, () => settleAt(target, true));
    };
    const v = clamp(drag.vYaw, -MOMENTUM_CAP, MOMENTUM_CAP);
    if (fling && Math.abs(v) >= MOMENTUM_MIN) {
      // Momentum is one 2-keyframe drift glide seeded with the release
      // velocity; the detent snap chains only off a natural landing.
      launch(
        yaw.get() + v * MOMENTUM_CARRY,
        { ...springs.drift, velocity: v },
        epoch,
        snapPhase,
      );
    } else {
      snapPhase();
    }
  };

  // Controlled alignment: when the resolved station and the resting yaw
  // disagree (a `station` prop change, or a parent rejecting a settle), glide
  // the stage to the prop's detent. Settles bump `settleTick`, so a change
  // that arrived mid-gesture gets re-checked once the stage is at rest.
  React.useEffect(() => {
    const k = roster.findIndex((p) => p.id === resolvedStation);
    if (k === -1) return;
    if (dragRef.current.active || flightsRef.current.size > 0) return;
    const yawNow = yaw.get();
    const delta = angleDelta(yawNow, -STATION_STEP * k);
    if (Math.abs(delta) < 0.5) return;
    const epoch = seize();
    launch(yawNow + delta, motionSafe ? springs.glide : INSTANT, epoch, () =>
      settleAt(yawNow + delta, false),
    );
    // Alignment keys off the station identity and settles, not the roster
    // array identity — the closure reads fresh values on each qualifying run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedStation, settleTick, motionSafe, yaw]);

  // A flight in progress must never outlive the component.
  React.useEffect(() => {
    const flights = flightsRef.current;
    return () => {
      epochRef.current += 1;
      flights.forEach((flight) => flight.stop());
      flights.clear();
    };
  }, []);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => settleDrag(event, true)}
      onPointerCancel={(event) => settleDrag(event, false)}
      // Runs after any plate's click — clears an orbit's suppress flag.
      onClick={() => {
        suppressClickRef.current = false;
      }}
      className={cn(
        "relative w-full touch-none select-none rounded-4 outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        grabbing ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{ height }}
    >
      <Pedestal yaw={yaw} radius={radius} />

      {roster.map((plate, k) => (
        <OrbitPlate
          // Remount when the seat or radius changes so every useTransform
          // closure stays bound to fresh geometry.
          key={`${plate.id}:${k}:${radius}`}
          plate={plate}
          base={k * STATION_STEP}
          radius={radius}
          yaw={yaw}
          front={k === frontIndex}
          crossfade={!motionSafe}
          onActivate={() => handlePlateClick(k)}
        />
      ))}

      {/* Polite announcer for the settled station. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type OrbitPlateProps = {
  plate: StagePlate;
  /** Seat angle on the turntable, k × 120°. */
  base: number;
  radius: number;
  yaw: MotionValue<number>;
  front: boolean;
  /** Reduced motion: poses jump, opacity crossfades on a fast CSS tween. */
  crossfade: boolean;
  onActivate: () => void;
};

/**
 * One billboarded plate. Its pose is pure derivation off the shared yaw:
 * x = sin(yaw + base) × radius, depth = cos(yaw + base), and scale, opacity,
 * rise, and stacking all chain off depth. No per-frame setState anywhere;
 * the transform template centers the plate on its point. Back plates carry
 * `aria-hidden` + `inert`, so their content is unreachable until they settle
 * at the front.
 */
function OrbitPlate({
  plate,
  base,
  radius,
  yaw,
  front,
  crossfade,
  onActivate,
}: OrbitPlateProps) {
  const x = useTransform(yaw, (v) => Math.sin((v + base) * RAD) * radius);
  const depth = useTransform(yaw, (v) => Math.cos((v + base) * RAD));
  const y = useTransform(depth, (d) => mapRange(d, -1, 1, BACK_RISE, FRONT_DROP));
  const scale = useTransform(depth, (d) =>
    mapRange(d, -1, 1, BACK_SCALE, FRONT_SCALE),
  );
  const opacity = useTransform(depth, (d) =>
    mapRange(d, -1, 1, BACK_OPACITY, 1),
  );
  const zIndex = useTransform(depth, (d) => Math.round((d + 1) * 50) + 1);

  return (
    <motion.div
      onClick={onActivate}
      transformTemplate={(_, generated) => `translate(-50%, -50%) ${generated}`}
      className={cn(
        "absolute",
        !front && "cursor-pointer",
        crossfade && "transition-opacity duration-150",
      )}
      style={{ left: "50%", top: "50%", x, y, scale, opacity, zIndex }}
    >
      <div
        inert={!front}
        aria-hidden={!front}
        className={cn(
          "w-40 rounded-3 border bg-surface-2 p-4 transition-colors duration-200",
          front ? "border-[var(--accent)]" : "border-hairline",
        )}
      >
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.14em]",
            front ? "text-[var(--accent)]" : "text-ink-3",
          )}
        >
          {plate.label}
        </span>
        <div className="mt-2 text-ink">{plate.node}</div>
      </div>
    </motion.div>
  );
}

/**
 * The turntable floor: a hairline ellipse over a soft radial shadow, three
 * faint station ticks at 120°, and an accent highlight dot that orbits
 * opposite the yaw — derived off the same motion value, never on its own
 * clock. Purely decorative and inert.
 */
function Pedestal({ yaw, radius }: { yaw: MotionValue<number>; radius: number }) {
  const rx = radius * 1.2;
  const ry = clamp(radius * 0.28, 18, 44);
  const dotX = useTransform(yaw, (v) => Math.sin(-v * RAD) * rx);
  const dotY = useTransform(yaw, (v) => Math.cos(-v * RAD) * ry);
  const ticks = [0, 1, 2].map((k) => {
    const a = k * STATION_STEP * RAD;
    return { key: k, left: rx + Math.sin(a) * rx, top: ry + Math.cos(a) * ry };
  });

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{ bottom: 8, width: rx * 2, height: ry * 2 }}
    >
      {/* Soft grounding shadow, then the hairline turntable ring above it. */}
      <div
        className="absolute inset-0 rounded-[50%] opacity-70"
        style={{
          background:
            "radial-gradient(closest-side, var(--hairline-strong), transparent)",
        }}
      />
      <div className="absolute inset-0 rounded-[50%] border border-hairline" />
      {ticks.map((tick) => (
        <span
          key={tick.key}
          className="absolute size-1 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
          style={{
            left: tick.left,
            top: tick.top,
            background: "var(--hairline-strong)",
          }}
        />
      ))}
      <motion.span
        className="absolute size-1.5 rounded-full"
        transformTemplate={(_, generated) =>
          `translate(-50%, -50%) ${generated}`
        }
        style={{
          left: "50%",
          top: "50%",
          x: dotX,
          y: dotY,
          background: "var(--accent)",
        }}
      />
    </div>
  );
}
