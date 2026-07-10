"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Doors met at center (shut) vs parted fully clear of the shaft window. */
const DOOR_SHUT = 0;
const DOOR_OPEN = 1;

type Controls = ReturnType<typeof animate> | null;
type Direction = "up" | "down" | "idle";

export type Floor = {
  id: string;
  label: string;
  node?: React.ReactNode;
};

export type ElevatorNavProps = {
  floors: Floor[];
  /** Controlled arrived floor id; changing it rides the car there. */
  value?: string;
  defaultValue?: string;
  /** Fires once per arrival (doors-open settle), deduped. */
  onArrive?: (id: string) => void;
  /** Shaft viewport height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * Section navigation staged as an elevator ride. Floors are indexed
 * top(0)..bottom(n-1) — the call panel lists them in that order, so its top
 * button is the highest floor. A single `carY` motion value (px) translates
 * the vertical floor stack: floor `i` rests at `−i · height`, so calling a
 * floor rides the stack until the target rests in the shaft window,
 * PASSING every intermediate floor through the frame on `springs.glide`.
 * The mono floor dial derives its live number from `carY` through
 * `useTransform` (rounded to the nearest floor) — no `setState` in the
 * loop. The riding flag and direction caret likewise derive off `carY`'s
 * change event (`useMotionValueEvent`), never set synchronously from the
 * controlled-value effect, so a programmatic ride reads identically to a
 * called one. Two doors (left/right panels) meet at center over the shaft
 * and part outward on `springs.snap`; the sequencing is doors shut → car
 * rides → on the ride's settle, doors part. A fresh call stops whatever is
 * in flight and shuts the doors first.
 *
 * Semantics: the call panel is a column of real buttons in tab order
 * (Enter/click calls a floor, focus-visible rings); ArrowUp/ArrowDown from
 * the panel or shaft call the adjacent floor. Arrival — the doors-open
 * settle — politely announces "Floor <n> — <label>" and fires `onArrive`
 * once per landing. Supports controlled `value` (rides there on change) and
 * uncontrolled `defaultValue`.
 *
 * Reduced motion: no ride, no doors — the floor swaps instantly, the dial
 * jumps straight to the target, doors read as already open. Callbacks,
 * announcements, and call-panel semantics are identical.
 */
export function ElevatorNav({
  floors,
  value: controlledValue,
  defaultValue,
  onArrive,
  height = 300,
  className,
  "aria-label": ariaLabel = "Floor navigation",
}: ElevatorNavProps) {
  const motionSafe = useMotionSafe();

  const count = floors.length;
  const lastIndex = Math.max(0, count - 1);
  const isControlled = controlledValue !== undefined;

  const indexOfId = (id: string | undefined) =>
    id === undefined ? -1 : floors.findIndex((floor) => floor.id === id);

  const [initialIndex] = React.useState(() => {
    const seed = controlledValue ?? defaultValue;
    const idx = indexOfId(seed);
    return clamp(idx >= 0 ? idx : 0, 0, Math.max(0, count - 1));
  });

  /** The one source of truth: car translateY in px (floor i rests at −i·height). */
  const carY = useMotionValue(-initialIndex * height);
  // Door leaves, 0 shut (met at center) .. 1 open (parted clear). No ride has
  // happened yet at mount — the car is simply already at the initial floor —
  // so both paths start with doors open on it; a call shuts them first.
  const doorL = useMotionValue(DOOR_OPEN);
  const doorR = useMotionValue(DOOR_OPEN);

  /** Floor whose content the shaft window shows at rest and announces. */
  const [arrivedIndex, setArrivedIndex] = React.useState(initialIndex);
  /** Mirrors whether the car is between floors — derived, never effect-set. */
  const [riding, setRiding] = React.useState(false);
  const [direction, setDirection] = React.useState<Direction>("idle");

  const carControlsRef = React.useRef<Controls>(null);
  const doorLControlsRef = React.useRef<Controls>(null);
  const doorRControlsRef = React.useRef<Controls>(null);
  /** The floor a ride is currently heading to, or just arrived at. */
  const targetRef = React.useRef(initialIndex);
  const arrivedRef = React.useRef(initialIndex);
  /** Direction the next tick should report the moment the car first moves. */
  const pendingDirectionRef = React.useRef<Direction>("idle");
  /** True from the instant a ride is kicked off until doors finish opening. */
  const ridingPhaseRef = React.useRef(false);
  const emittedRef = React.useRef<string | undefined>(floors[initialIndex]?.id);
  const shaftRef = React.useRef<HTMLDivElement | null>(null);

  const onArriveRef = React.useRef(onArrive);
  React.useEffect(() => {
    onArriveRef.current = onArrive;
  });

  // Mirrors the imperative ride phase into render-visible state, guarded by
  // refs (never a captured closure value). Fires only on an actual carY
  // tick — i.e. asynchronously, once an animation is already underway —
  // never synchronously inside the controlled-value effect, so a
  // programmatic ride surfaces riding/direction exactly like a called one.
  useMotionValueEvent(carY, "change", () => {
    setRiding(ridingPhaseRef.current);
    if (ridingPhaseRef.current) setDirection(pendingDirectionRef.current);
  });

  /** Announce + fire onArrive once per landing (deduped by floor id). */
  const emitArrival = (idx: number) => {
    arrivedRef.current = idx;
    ridingPhaseRef.current = false;
    pendingDirectionRef.current = "idle";
    setArrivedIndex(idx);
    setRiding(false);
    setDirection("idle");
    const floor = floors[idx];
    if (!floor || floor.id === emittedRef.current) return;
    emittedRef.current = floor.id;
    onArriveRef.current?.(floor.id);
  };

  /** Part the doors open — the final step once the car has settled. */
  const openDoors = (idx: number) => {
    doorLControlsRef.current?.stop();
    doorRControlsRef.current?.stop();
    if (!motionSafe) {
      doorL.jump(DOOR_OPEN);
      doorR.jump(DOOR_OPEN);
      emitArrival(idx);
      return;
    }
    let settled = 0;
    const onDoorSettle = () => {
      settled += 1;
      if (settled === 2) emitArrival(idx);
    };
    doorLControlsRef.current = animate(doorL, DOOR_OPEN, {
      ...springs.snap,
      onComplete: onDoorSettle,
    });
    doorRControlsRef.current = animate(doorR, DOOR_OPEN, {
      ...springs.snap,
      onComplete: onDoorSettle,
    });
  };

  /** Ride the car to `idx`, passing intermediate floors, then open doors. */
  const rideTo = (idx: number) => {
    carControlsRef.current?.stop();
    // Direction reads against the last SETTLED floor, not targetRef — call()
    // already advanced targetRef to idx before the doors finished closing.
    const from = arrivedRef.current;
    pendingDirectionRef.current =
      idx === from ? "idle" : idx < from ? "up" : "down";
    if (!motionSafe) {
      carY.jump(-idx * height);
      openDoors(idx);
      return;
    }
    ridingPhaseRef.current = true;
    carControlsRef.current = animate(carY, -idx * height, {
      ...springs.glide,
      onComplete: () => openDoors(idx),
    });
  };

  /** Shut the doors first (if not already), then start the ride. */
  const closeDoorsThenRide = (idx: number) => {
    doorLControlsRef.current?.stop();
    doorRControlsRef.current?.stop();
    if (!motionSafe) {
      rideTo(idx);
      return;
    }
    const alreadyShut = doorL.get() === DOOR_SHUT && doorR.get() === DOOR_SHUT;
    if (alreadyShut) {
      rideTo(idx);
      return;
    }
    let settled = 0;
    const onShutSettle = () => {
      settled += 1;
      if (settled === 2) rideTo(idx);
    };
    doorLControlsRef.current = animate(doorL, DOOR_SHUT, {
      ...springs.snap,
      onComplete: onShutSettle,
    });
    doorRControlsRef.current = animate(doorR, DOOR_SHUT, {
      ...springs.snap,
      onComplete: onShutSettle,
    });
  };

  /** Call a floor: stop everything in flight, shut doors, then ride. */
  const call = (idx: number) => {
    if (count === 0) return;
    const target = clamp(idx, 0, lastIndex);
    if (target === targetRef.current && target === arrivedRef.current) return;
    carControlsRef.current?.stop();
    targetRef.current = target;
    closeDoorsThenRide(target);
  };

  // Controlled value rides the car when it changes externally. Motion-value
  // and ref ops only — riding/direction state is mirrored later, off carY's
  // own change event, never set synchronously here.
  React.useEffect(() => {
    if (!isControlled || count === 0) return;
    const idx = indexOfId(controlledValue);
    if (idx < 0 || idx === targetRef.current) return;
    call(idx);
    // Only the external value identity should retrigger this ride.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledValue, isControlled, count]);

  // Nothing may outlive the component: car ride and both door flights.
  React.useEffect(
    () => () => {
      carControlsRef.current?.stop();
      doorLControlsRef.current?.stop();
      doorRControlsRef.current?.stop();
    },
    [],
  );

  const handleCall = (idx: number) => {
    shaftRef.current?.focus({ preventScroll: true });
    call(idx);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (count === 0) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      call(targetRef.current - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      call(targetRef.current + 1);
    }
  };

  const floorNumber = (idx: number) =>
    String(count === 0 ? 0 : lastIndex - idx + 1).padStart(2, "0");
  const caret = direction === "up" ? "▲" : direction === "down" ? "▼" : "•";
  const arrivedFloor = floors[arrivedIndex];
  const announcement =
    !riding && arrivedFloor
      ? `Floor ${floorNumber(arrivedIndex)} — ${arrivedFloor.label}`
      : "";

  return (
    <div className={cn("w-full", className)}>
      <div className="flex gap-3">
        {/* THE SHAFT — one floor's content visible at a time, doors over it. */}
        <div
          ref={shaftRef}
          role="region"
          aria-label={ariaLabel}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="relative min-w-0 flex-1 overflow-hidden rounded-2 border border-hairline bg-surface-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          style={{ height }}
        >
          {motionSafe ? (
            <div aria-hidden={riding} className="absolute inset-0">
              <FloorStack floors={floors} height={height} carY={carY} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
              {floors[arrivedIndex]?.node ?? (
                <span className="font-mono text-sm text-ink-2">
                  {floors[arrivedIndex]?.label}
                </span>
              )}
            </div>
          )}

          {/* THE DOORS — meet at center when shut, part outward on arrival. */}
          {motionSafe && (
            <>
              <Door side="left" progress={doorL} />
              <Door side="right" progress={doorR} />
            </>
          )}

          {/* THE FLOOR DIAL — live number while riding, arrived number at rest. */}
          <div
            aria-hidden
            className="pointer-events-none absolute top-2 right-2 z-30 flex items-center gap-1.5 rounded-1 border border-hairline-strong bg-surface-2 px-2 py-1"
          >
            <span className="font-mono text-xs text-cobalt-bright tabular-nums">
              {caret}
            </span>
            {motionSafe ? (
              <FloorDial carY={carY} height={height} lastIndex={lastIndex} />
            ) : (
              <span className="font-mono text-sm text-ink tabular-nums">
                {floorNumber(arrivedIndex)}
              </span>
            )}
          </div>
        </div>

        {/* THE CALL PANEL — top floor at the top, in tab order. */}
        <ol className="flex shrink-0 flex-col-reverse gap-1">
          {floors.map((floor, idx) => {
            const isArrived = !riding && idx === arrivedIndex;
            return (
              <li key={floor.id}>
                <button
                  type="button"
                  aria-current={isArrived ? "true" : undefined}
                  aria-label={`Call floor ${lastIndex - idx + 1}: ${floor.label}`}
                  onClick={() => handleCall(idx)}
                  onKeyDown={handleKeyDown}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-1 border font-mono text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    isArrived
                      ? "border-hairline-strong bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline bg-surface-1 text-ink-2 hover:text-ink",
                  )}
                >
                  {String(lastIndex - idx + 1).padStart(2, "0")}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type FloorStackProps = {
  floors: Floor[];
  height: number;
  carY: MotionValue<number>;
};

/** The vertical stack of floor content, translated as one unit by `carY`. */
function FloorStack({ floors, height, carY }: FloorStackProps) {
  return (
    <motion.div className="absolute inset-x-0 top-0" style={{ y: carY }}>
      {floors.map((floor) => (
        <div
          key={floor.id}
          className="flex items-center justify-center p-4 text-center"
          style={{ height }}
        >
          {floor.node ?? (
            <span className="font-mono text-sm text-ink-2">{floor.label}</span>
          )}
        </div>
      ))}
    </motion.div>
  );
}

type FloorDialProps = {
  carY: MotionValue<number>;
  height: number;
  lastIndex: number;
};

/**
 * The mono number: rounds `carY` to its nearest floor and formats it,
 * entirely inside the motion-value pipeline — one `useTransform`, no
 * `setState`, so it ticks through every passed floor at spring rate
 * without ever re-rendering React.
 */
function FloorDial({ carY, height, lastIndex }: FloorDialProps) {
  const label = useTransform(carY, (y) => {
    const idx = clamp(Math.round(-y / height), 0, lastIndex);
    return String(lastIndex - idx + 1).padStart(2, "0");
  });
  return (
    <motion.span className="font-mono text-sm text-ink tabular-nums">
      {label}
    </motion.span>
  );
}

type DoorProps = {
  side: "left" | "right";
  /** 0 shut (met at center) .. 1 open (parted clear of the window). */
  progress: MotionValue<number>;
};

/** One door leaf: slides from center-met to fully clear via translateX. */
function Door({ side, progress }: DoorProps) {
  const sign = side === "left" ? 1 : -1;
  const x = useTransform(
    progress,
    [DOOR_SHUT, DOOR_OPEN],
    ["0%", `${100 * sign}%`],
  );

  return (
    <motion.div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 z-20 w-1/2 border-hairline-strong bg-surface-2",
        side === "left" ? "left-0 border-r" : "right-0 border-l",
      )}
      style={{ x }}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 w-px bg-hairline-strong",
          side === "left" ? "right-0" : "left-0",
        )}
      />
    </motion.div>
  );
}
