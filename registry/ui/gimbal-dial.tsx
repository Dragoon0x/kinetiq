"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { clamp, perspectives, snapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Ticks per ring — one per 5 value units, so default detents land on ticks. */
const TICK_COUNT = 20;
/** Ring spin per value unit: 0..100 maps onto one full 0..360° turn. */
const DEG_PER_UNIT = 3.6;
/** Drag ratio: one value unit per ~4px of pointer travel. */
const UNITS_PER_PX = 0.25;
/** Release momentum is projected this many seconds past the finger. */
const MOMENTUM_WINDOW = 0.25;
/** Momentum may carry at most this many value units past release. */
const MAX_CARRY = 25;
/** A release this long after the last move (ms) reads as a hold, not a flick. */
const STALE_VELOCITY_MS = 90;
/** Ring planes tip this far out of the screen. */
const TILT_DEG = 64;
/** Inner ring and hub cap diameters, as fractions of `size`. */
const INNER_RATIO = 0.66;
const HUB_RATIO = 0.36;

type Axis = "yaw" | "pitch";

const AXES: readonly Axis[] = ["yaw", "pitch"];

type DragState = {
  pointerId: number;
  /** Last pointer sample on this ring's drag axis, in px. */
  last: number;
  lastT: number;
  /** Smoothed drag velocity, value units/s. */
  velocity: number;
};

export type GimbalDialValue = {
  /** Outer ring, 0..100. */
  yaw: number;
  /** Inner ring, 0..100. */
  pitch: number;
};

export type GimbalDialProps = {
  /** Controlled two-axis value; each axis clamps to 0..100. */
  value?: GimbalDialValue;
  /** Initial value when uncontrolled. */
  defaultValue?: GimbalDialValue;
  /** Fires on every settled change (detent land) — never per pixel. */
  onValueChange?: (value: GimbalDialValue) => void;
  /** Detent size in value units. */
  step?: number;
  /** Outer diameter, px. */
  size?: number;
  /** Accessible names for the two ring sliders. */
  axisLabels?: { yaw: string; pitch: string };
  /** Accessible name for the dial group. */
  "aria-label"?: string;
  className?: string;
};

/**
 * A two-axis attitude picker. Two nested rings spin inside their own tilted
 * planes under the house perspective — the outer band (rotateX 64°) carries
 * yaw, the inner (rotateY 64°) pitch — each wearing 20 machined ticks that
 * rotate under a fixed cobalt index at 12 o'clock, 3.6° per value unit.
 * Depth is a painted composite: each ring renders twice, clipped to its far
 * and near halves around the hub cap, so the bands thread behind and in
 * front of the hub with no preserve-3d (and no overflow or filter anywhere
 * near the planes). Dragging spins a ring live (one value unit per ~4px,
 * pointer captured); release projects the smoothed flick velocity ~250ms
 * ahead — carry capped at 25 units — then settles on the nearest `step`
 * detent with `snap` seeded by that velocity. Each band is an independent
 * slider: outer steps on ArrowLeft/Right, inner on ArrowUp/Down, Home/End
 * run to the rails. The hub cap reads both values live in mono. Reduced
 * motion: flat concentric rings, 1:1 drags, no momentum — detents land on a
 * fast tween instead of a spring.
 */
export function GimbalDial({
  value,
  defaultValue,
  onValueChange,
  step = 5,
  size = 200,
  axisLabels = { yaw: "Yaw", pitch: "Pitch" },
  "aria-label": ariaLabel = "Gimbal dial",
  className,
}: GimbalDialProps) {
  const motionSafe = useMotionSafe();
  const isControlled = value !== undefined;
  const stepSafe = step > 0 ? step : 5;

  /** Nearest detent, kept inside the rails. */
  const toDetent = React.useCallback(
    (v: number): number => clamp(snapAngle(clamp(v, 0, 100), stepSafe), 0, 100),
    [stepSafe],
  );

  const [initial] = React.useState<GimbalDialValue>(() => {
    const source = value ?? defaultValue ?? { yaw: 50, pitch: 50 };
    return {
      yaw: clamp(source.yaw, 0, 100),
      pitch: clamp(source.pitch, 0, 100),
    };
  });

  /** The two sources of truth, in value units; rings derive their spin. */
  const yawMv = useMotionValue(initial.yaw);
  const pitchMv = useMotionValue(initial.pitch);
  const yawRotate = useTransform(yawMv, (v) => v * DEG_PER_UNIT);
  const pitchRotate = useTransform(pitchMv, (v) => v * DEG_PER_UNIT);

  const [uncontrolled, setUncontrolled] = React.useState(initial);
  /** Live hub readout — deduped per integer so a spin stays cheap. */
  const [hub, setHub] = React.useState(() => ({
    yaw: Math.round(initial.yaw),
    pitch: Math.round(initial.pitch),
  }));

  /** The detent each axis last settled on or is heading to. */
  const targetRef = React.useRef<GimbalDialValue>({ ...initial });
  const yawDrag = React.useRef<DragState | null>(null);
  const pitchDrag = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<
    Record<Axis, ReturnType<typeof animate> | null>
  >({ yaw: null, pitch: null });

  const onValueChangeRef = React.useRef(onValueChange);
  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
  });

  useMotionValueEvent(yawMv, "change", (v) => {
    const next = clamp(Math.round(v), 0, 100);
    setHub((prev) => (prev.yaw === next ? prev : { ...prev, yaw: next }));
  });
  useMotionValueEvent(pitchMv, "change", (v) => {
    const next = clamp(Math.round(v), 0, 100);
    setHub((prev) => (prev.pitch === next ? prev : { ...prev, pitch: next }));
  });

  const stopAll = React.useCallback(() => {
    controlsRef.current.yaw?.stop();
    controlsRef.current.pitch?.stop();
  }, []);

  // A settle in flight must not outlive the component.
  React.useEffect(() => stopAll, [stopAll]);

  const mvFor = (axis: Axis): MotionValue<number> =>
    axis === "yaw" ? yawMv : pitchMv;
  const dragFor = (axis: Axis) => (axis === "yaw" ? yawDrag : pitchDrag);

  /** Animate one axis onto a detent — `snap` rich, a fast tween under RM. */
  const settleAxis = React.useCallback(
    (axis: Axis, target: number, velocity = 0) => {
      const mv = axis === "yaw" ? yawMv : pitchMv;
      const transition: Transition = motionSafe
        ? { ...springs.snap, velocity }
        : { duration: durations.fast };
      controlsRef.current[axis]?.stop();
      controlsRef.current[axis] = animate(mv, target, transition);
    },
    [motionSafe, yawMv, pitchMv],
  );

  /** Commit a settled detent: dedupe, mirror to state, notify once. */
  const commit = React.useCallback(
    (axis: Axis, next: number) => {
      if (targetRef.current[axis] === next) return;
      const target = { ...targetRef.current, [axis]: next };
      targetRef.current = target;
      if (!isControlled) setUncontrolled(target);
      onValueChangeRef.current?.(target);
    },
    [isControlled],
  );

  // Controlled updates steer the rings without re-announcing them.
  const controlledYaw = value?.yaw;
  const controlledPitch = value?.pitch;
  React.useEffect(() => {
    if (controlledYaw === undefined || controlledPitch === undefined) return;
    const next = {
      yaw: clamp(controlledYaw, 0, 100),
      pitch: clamp(controlledPitch, 0, 100),
    };
    for (const axis of AXES) {
      if (targetRef.current[axis] === next[axis]) continue;
      targetRef.current = { ...targetRef.current, [axis]: next[axis] };
      settleAxis(axis, next[axis]);
    }
  }, [controlledYaw, controlledPitch, settleAxis]);

  const handlePointerDown =
    (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (dragFor(axis).current) return;
      controlsRef.current[axis]?.stop();
      dragFor(axis).current = {
        pointerId: event.pointerId,
        last: axis === "yaw" ? event.clientX : event.clientY,
        lastT: event.timeStamp,
        velocity: 0,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const handlePointerMove =
    (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragFor(axis).current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const coord = axis === "yaw" ? event.clientX : event.clientY;
      // Horizontal drag spins yaw; pulling upward raises pitch.
      const dUnits =
        (axis === "yaw" ? coord - drag.last : drag.last - coord) *
        UNITS_PER_PX;
      const dt = (event.timeStamp - drag.lastT) / 1000;
      if (dt > 0) {
        // Smooth the instantaneous velocity so the flick reads intent.
        drag.velocity = drag.velocity * 0.4 + (dUnits / dt) * 0.6;
      }
      drag.last = coord;
      drag.lastT = event.timeStamp;
      const mv = mvFor(axis);
      mv.set(clamp(mv.get() + dUnits, 0, 100));
    };

  const handlePointerEnd =
    (axis: Axis) => (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragFor(axis).current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragFor(axis).current = null;
      const mv = mvFor(axis);
      // A pause before release spends the flick; the ring settles nearest.
      const stale = event.timeStamp - drag.lastT > STALE_VELOCITY_MS;
      const maxVelocity = MAX_CARRY / MOMENTUM_WINDOW;
      const velocity =
        motionSafe && !stale
          ? clamp(drag.velocity, -maxVelocity, maxVelocity)
          : 0;
      const detent = toDetent(mv.get() + velocity * MOMENTUM_WINDOW);
      commit(axis, detent);
      settleAxis(axis, detent, velocity);
    };

  const handleKeyDown =
    (axis: Axis) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = targetRef.current[axis];
      const increase = axis === "yaw" ? "ArrowRight" : "ArrowUp";
      const decrease = axis === "yaw" ? "ArrowLeft" : "ArrowDown";
      let next: number;
      switch (event.key) {
        case increase:
          next = toDetent(current + stepSafe);
          break;
        case decrease:
          next = toDetent(current - stepSafe);
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = 100;
          break;
        default:
          return;
      }
      event.preventDefault();
      commit(axis, next);
      settleAxis(axis, next);
    };

  const committed = isControlled
    ? { yaw: clamp(value.yaw, 0, 100), pitch: clamp(value.pitch, 0, 100) }
    : uncontrolled;

  const innerD = Math.round(size * INNER_RATIO);
  const hubD = Math.round(size * HUB_RATIO);
  const hubFont = Math.max(9, Math.round(size * 0.055));

  const outerBox: React.CSSProperties = { inset: 0 };
  const innerBox: React.CSSProperties = {
    left: "50%",
    top: "50%",
    width: innerD,
    height: innerD,
    marginLeft: -innerD / 2,
    marginTop: -innerD / 2,
  };
  const yawTilt = motionSafe ? `rotateX(${TILT_DEG}deg)` : null;
  const pitchTilt = motionSafe ? `rotateY(${TILT_DEG}deg)` : null;

  const sliderProps = (axis: Axis) =>
    ({
      role: "slider",
      tabIndex: 0,
      "aria-label": axis === "yaw" ? axisLabels.yaw : axisLabels.pitch,
      "aria-orientation": axis === "yaw" ? "horizontal" : "vertical",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": Math.round(committed[axis]),
      onPointerDown: handlePointerDown(axis),
      onPointerMove: handlePointerMove(axis),
      onPointerUp: handlePointerEnd(axis),
      onPointerCancel: handlePointerEnd(axis),
      onKeyDown: handleKeyDown(axis),
    }) as const;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("relative select-none", className)}
      style={{ width: size, height: size }}
    >
      {/* Painted depth, back to front: outer far half → outer index → inner
          far half → hub cap → inner near half → inner index → outer near
          half. Under RM the near-half copies drop and everything lies flat. */}
      <RingPlane
        tilt={yawTilt}
        clip={motionSafe ? "inset(0 0 50% 0)" : undefined}
        style={outerBox}
      >
        <RingRotor diameter={size} rotate={yawRotate} />
      </RingPlane>
      <RingPlane tilt={yawTilt} style={outerBox}>
        <IndexTick diameter={size} />
      </RingPlane>

      <RingPlane
        tilt={pitchTilt}
        clip={motionSafe ? "inset(0 0 0 50%)" : undefined}
        style={innerBox}
      >
        <RingRotor diameter={innerD} rotate={pitchRotate} />
      </RingPlane>

      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border border-hairline-strong bg-surface-2"
        style={{
          width: hubD,
          height: hubD,
          boxShadow: "var(--edge-highlight)",
        }}
      >
        <span
          className="font-mono font-medium text-cobalt-bright tabular-nums"
          style={{ fontSize: hubFont, lineHeight: 1 }}
        >
          {String(hub.yaw).padStart(3, "0")}
        </span>
        <span className="h-px w-3 bg-hairline-strong" />
        <span
          className="font-mono font-medium text-cobalt-bright tabular-nums"
          style={{ fontSize: hubFont, lineHeight: 1 }}
        >
          {String(hub.pitch).padStart(3, "0")}
        </span>
      </div>

      {motionSafe && (
        <RingPlane tilt={pitchTilt} clip="inset(0 50% 0 0)" style={innerBox}>
          <RingRotor diameter={innerD} rotate={pitchRotate} />
        </RingPlane>
      )}
      <RingPlane tilt={pitchTilt} style={innerBox}>
        <IndexTick diameter={innerD} />
      </RingPlane>
      {motionSafe && (
        <RingPlane tilt={yawTilt} clip="inset(50% 0 0 0)" style={outerBox}>
          <RingRotor diameter={size} rotate={yawRotate} />
        </RingPlane>
      )}

      {/* Hit bands double as the focusable sliders: the outer disc takes the
          band annulus, the inner disc (stacked above) the middle. */}
      <div
        {...sliderProps("yaw")}
        className="absolute cursor-ew-resize touch-none rounded-full"
        style={outerBox}
      />
      <div
        {...sliderProps("pitch")}
        className="absolute cursor-ns-resize touch-none rounded-full"
        style={innerBox}
      />
    </div>
  );
}

type RingPlaneProps = {
  /** This plane's 3D attitude, e.g. `rotateX(64deg)`; null lies flat. */
  tilt: string | null;
  /** Screen-space half mask — the fixed window the ring spins through. */
  clip?: string;
  style: React.CSSProperties;
  children: React.ReactNode;
};

/**
 * One painted layer of the composite. The clip lives on an untransformed
 * wrapper (never on anything 3D), and the plane inside carries its own
 * `transformPerspective`-style prefix so both half copies project alike.
 */
function RingPlane({ tilt, clip, style, children }: RingPlaneProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ ...style, clipPath: clip }}
    >
      <div
        className="absolute inset-0"
        style={
          tilt
            ? { transform: `perspective(${perspectives.base}px) ${tilt}` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}

type RingRotorProps = {
  diameter: number;
  /** Spin within the ring's own plane, in degrees. */
  rotate: MotionValue<number>;
};

/**
 * The spinning band: a hairline circle wearing 20 surface ticks, all tips
 * registered to one line so cardinals simply reach further inward.
 */
function RingRotor({ diameter, rotate }: RingRotorProps) {
  const tickW = Math.max(2, Math.round(diameter * 0.015));
  const baseLen = Math.max(6, Math.round(diameter * 0.055));
  return (
    <motion.div className="absolute inset-0" style={{ rotate }}>
      <div
        className="absolute rounded-full border border-hairline-strong"
        style={{ inset: 2 }}
      />
      {Array.from({ length: TICK_COUNT }, (_, i) => {
        const cardinal = i % 5 === 0;
        const len = cardinal ? Math.round(baseLen * 1.5) : baseLen;
        const radius = diameter / 2 - 2 - len / 2;
        return (
          <span
            key={i}
            className="absolute top-1/2 left-1/2 rounded-1 bg-surface-2 shadow-[0_0_0_1px_var(--hairline)]"
            style={{
              width: tickW,
              height: len,
              marginLeft: -tickW / 2,
              marginTop: -len / 2,
              transform: `rotate(${(i * 360) / TICK_COUNT}deg) translateY(${-radius}px)`,
            }}
          />
        );
      })}
    </motion.div>
  );
}

/** The fixed accent index at 12 o'clock — the ring rotates under it. */
function IndexTick({ diameter }: { diameter: number }) {
  const w = Math.max(2, Math.round(diameter * 0.018));
  const len = Math.max(8, Math.round(diameter * 0.08));
  const radius = diameter / 2 - 2 - len / 2;
  return (
    <span
      className="absolute top-1/2 left-1/2 rounded-1 bg-cobalt-bright"
      style={{
        width: w,
        height: len,
        marginLeft: -w / 2,
        marginTop: -len / 2,
        transform: `translateY(${-radius}px)`,
      }}
    />
  );
}
