"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** min..max sweeps this much band; the other 60° is the blank end-stop arc. */
const SWEEP_DEG = 300;
/** The lens plane tips this far out of the screen. */
const TILT_DEG = 55;
/** Knurl ticks machined around the full band — grip texture, so no gaps. */
const KNURL_COUNT = 48;
/** Fraction of a detent gap where the magnet engages (and a land registers). */
const PULL_ZONE = 0.35;
/** Share of the remaining offset the magnet claims at the detent center. */
const PULL_STRENGTH = 0.85;
/** Dragging `size × DRAG_RUN` px traverses the whole range. */
const DRAG_RUN = 1.8;
/** Overdrag past a rail approaches this fraction of the range, asymptotically. */
const OVERDRAG_RATIO = 0.05;
/** Band and hub proportions of `size`. */
const BAND_RATIO = 0.15;
const HUB_RATIO = 0.34;

/** `springs.glide`, shaped as the `useSpring` smoothing config. */
const GLIDE_SMOOTHING = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

const roundFloat = (n: number): number => Number(n.toFixed(5));

type DragState = {
  pointerId: number;
  lastX: number;
  /** Unresisted accumulated value — magnet and end-stop map from this. */
  raw: number;
};

type LandControls = {
  settle: ReturnType<typeof animate> | null;
  blink: ReturnType<typeof animate> | null;
  pulse: ReturnType<typeof animate> | null;
};

export type RingDialProps = {
  min?: number;
  max?: number;
  /** Controlled committed value. */
  value?: number;
  /** Initial value when uncontrolled; lands on the nearest detent. */
  defaultValue?: number;
  /** Fires once per detent land — never per pixel. */
  onValueChange?: (value: number) => void;
  /** Streams the live (pre-detent) value while dragging. */
  onInput?: (value: number) => void;
  /** Explicit stop values; wins over `step`. */
  detents?: number[];
  /** Detent spacing in value units when `detents` is not given. */
  step?: number;
  /** Outer diameter, px. */
  size?: number;
  /** Formats the hub readout, the band numerals and `aria-valuetext`. */
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
  /** Required accessible name for the slider. */
  "aria-label": string;
};

/**
 * A lens aperture ring in perspective. One wide knurled band tips out of the
 * screen — `rotateX(55°)` behind a single `perspective()` prefix, never
 * preserve-3d — and spins under a fixed cobalt index needle at front-center:
 * min..max sweeps 300° of band and the remaining 60° stays blank at the
 * back, the dead arc a real ring keeps past its stops. Knurl ticks,
 * graduations and mono numerals are printed on the band and rotate with it;
 * the untilted hub plate reads `format(value)` live.
 *
 * The detents are magnetic. Between stops the display value trails the
 * pointer on a `glide`-tuned `useSpring`; inside 35% of a gap the drag
 * target itself is pulled toward the stop (quadratic blend, documented at
 * `magnetize`), so crossing one reads as a soft click into a well. Release
 * settles the nearest detent on `snap` seeded with drag velocity, and the
 * rails resist overdrag asymptotically. Every land blinks the needle
 * (opacity, `durations.blink`) and pulses the hub scale on `flick`;
 * `onValueChange` fires once per land while `onInput` streams live values
 * during the drag. The frame is a slider: arrows step between detents,
 * Home/End run to the end stops. Reduced motion lies flat as a circular
 * dial — 1:1 drags, fast tweens, no magnetic lag — and keeps the needle
 * blink as its opacity-only landing cue.
 */
export function RingDial({
  min = 0,
  max = 100,
  value,
  defaultValue,
  onValueChange,
  onInput,
  detents,
  step = 10,
  size = 220,
  format,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: RingDialProps) {
  const motionSafe = useMotionSafe();
  const isControlled = value !== undefined;
  const span = Math.max(max - min, Number.EPSILON);
  const fmt = format ?? ((v: number) => String(Math.round(v)));

  /** Sorted, deduped stop values — explicit `detents`, else the step grid. */
  const stops = React.useMemo<number[]>(() => {
    if (detents && detents.length > 0) {
      const list = [...new Set(detents.map((d) => clamp(d, min, max)))].sort(
        (a, b) => a - b,
      );
      if (list.length > 0) return list;
    }
    const s = step > 0 ? step : 10;
    const count = Math.max(1, Math.floor(span / s + 1e-6));
    const grid: number[] = [];
    for (let i = 0; i < count; i += 1) grid.push(roundFloat(min + i * s));
    grid.push(max);
    return [...new Set(grid)];
  }, [detents, step, min, max, span]);

  const nearestIndex = React.useCallback(
    (x: number): number => {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < stops.length; i += 1) {
        const dist = Math.abs((stops[i] ?? min) - x);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      return best;
    },
    [stops, min],
  );

  /**
   * The detent field at a free value `x`: the nearest stop and the magnet
   * influence 0..1, ramping from the edge of the pull zone (35% of the gap
   * toward the neighbor on x's side) up to 1 at the stop itself.
   */
  const fieldAt = React.useCallback(
    (x: number): { detent: number; pull: number } => {
      const i = nearestIndex(x);
      const detent = stops[i] ?? min;
      const neighbor =
        x >= detent
          ? (stops[i + 1] ?? stops[i - 1])
          : (stops[i - 1] ?? stops[i + 1]);
      const gap = neighbor === undefined ? 0 : Math.abs(neighbor - detent);
      const pull =
        gap === 0
          ? 1
          : Math.max(0, 1 - Math.abs(x - detent) / (PULL_ZONE * gap));
      return { detent, pull };
    },
    [nearestIndex, stops, min],
  );

  /**
   * The magnetic blend, applied to the drag TARGET (the sprung display value
   * follows it, so the lag reads as suction rather than a snap grid). With
   * influence t from `fieldAt`, the target becomes
   *
   *   pulled = x + (d − x) · 0.85 · t²
   *
   * — free glide outside the zone (t = 0), a quadratically steepening pull
   * toward the well inside it, and a soft click as the pointer crosses the
   * stop, since the pull flips direction with the sign of (d − x).
   */
  const magnetize = React.useCallback(
    (x: number): number => {
      const { detent, pull } = fieldAt(x);
      return x + (detent - x) * (PULL_STRENGTH * pull * pull);
    },
    [fieldAt],
  );

  /** Boot on the nearest detent to the seed value. */
  const [initial] = React.useState<number>(() => {
    const seed = clamp(value ?? defaultValue ?? min, min, max);
    let best = seed;
    let bestDist = Infinity;
    for (const s of stops) {
      const dist = Math.abs(s - seed);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    return best;
  });

  /** Drag target in value units — the magnet works on this. */
  const targetMv = useMotionValue(initial);
  /** The target filtered through glide — the between-detent lag. */
  const glideMv = useSpring(targetMv, GLIDE_SMOOTHING);
  /** What the ring renders: the sprung value, or the raw target under RM. */
  const displayMv = useMotionValue(initial);
  const spin = useTransform(
    displayMv,
    (v) => -(((v - min) / span) * SWEEP_DEG - SWEEP_DEG / 2),
  );
  const needleOpacity = useMotionValue(1);
  const hubScale = useMotionValue(1);

  const [uncontrolled, setUncontrolled] = React.useState(initial);
  /** Live hub readout — deduped per formatted string, so spins stay cheap. */
  const [live, setLive] = React.useState(initial);

  /** The detent last landed on (or being steered to). */
  const landedRef = React.useRef(initial);
  const dragRef = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<LandControls>({
    settle: null,
    blink: null,
    pulse: null,
  });

  const onValueChangeRef = React.useRef(onValueChange);
  const onInputRef = React.useRef(onInput);
  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onInputRef.current = onInput;
  });

  useMotionValueEvent(glideMv, "change", (v) => {
    if (motionSafe) displayMv.set(v);
  });
  useMotionValueEvent(targetMv, "change", (v) => {
    if (!motionSafe) displayMv.set(v);
  });
  useMotionValueEvent(displayMv, "change", (v) => {
    const next = clamp(v, min, max);
    setLive((prev) => (fmt(prev) === fmt(next) ? prev : next));
  });

  const stopAll = React.useCallback(() => {
    controlsRef.current.settle?.stop();
    controlsRef.current.blink?.stop();
    controlsRef.current.pulse?.stop();
  }, []);

  // Nothing in flight may outlive the component.
  React.useEffect(() => stopAll, [stopAll]);

  /** The landing cue: needle blink always; hub pulse only with rich motion. */
  const blink = React.useCallback(() => {
    controlsRef.current.blink?.stop();
    needleOpacity.set(0.2);
    controlsRef.current.blink = animate(needleOpacity, 1, {
      duration: durations.blink,
      ease: easings.enter,
    });
    if (motionSafe) {
      controlsRef.current.pulse?.stop();
      hubScale.set(1.05);
      controlsRef.current.pulse = animate(hubScale, 1, springs.flick);
    }
  }, [motionSafe, needleOpacity, hubScale]);

  /** Register a land: dedupe, mirror to state, notify once, cue. */
  const commitLand = React.useCallback(
    (detent: number) => {
      if (landedRef.current === detent) return;
      landedRef.current = detent;
      if (!isControlled) setUncontrolled(detent);
      onValueChangeRef.current?.(detent);
      blink();
    },
    [isControlled, blink],
  );

  /** Animate the target onto a value — `snap` rich, a fast tween under RM. */
  const settleTo = React.useCallback(
    (target: number, velocity = 0) => {
      const transition: Transition = motionSafe
        ? { ...springs.snap, velocity }
        : { duration: durations.fast };
      controlsRef.current.settle?.stop();
      controlsRef.current.settle = animate(targetMv, target, transition);
    },
    [motionSafe, targetMv],
  );

  // Controlled updates steer the ring without re-announcing them.
  React.useEffect(() => {
    if (value === undefined) return;
    const next = clamp(value, min, max);
    if (landedRef.current === next) return;
    landedRef.current = next;
    settleTo(next);
  }, [value, min, max, settleTo]);

  /** Asymptotic end-stop: the overshoot approaches `limit`, never reaches it. */
  const resist = (over: number, limit: number): number =>
    limit * (over / (over + limit));

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    controlsRef.current.settle?.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      raw: clamp(targetMv.get(), min, max),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const overLimit = span * OVERDRAG_RATIO;
    drag.raw += (event.clientX - drag.lastX) * (span / (size * DRAG_RUN));
    // Cap the raw overshoot so the way back never feels like dead rope.
    drag.raw = clamp(drag.raw, min - overLimit * 3, max + overLimit * 3);
    drag.lastX = event.clientX;
    let next: number;
    if (drag.raw > max) {
      next = max + resist(drag.raw - max, overLimit);
    } else if (drag.raw < min) {
      next = min - resist(min - drag.raw, overLimit);
    } else {
      // The magnet is part of the rich feel; RM tracks the pointer 1:1.
      next = motionSafe ? magnetize(drag.raw) : drag.raw;
    }
    targetMv.set(next);
    const liveValue = clamp(next, min, max);
    onInputRef.current?.(liveValue);
    // Entering a stop's pull zone counts as landing in its well.
    const field = fieldAt(liveValue);
    if (field.pull > 0) commitLand(field.detent);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const x = clamp(targetMv.get(), min, max);
    const detent = stops[nearestIndex(x)] ?? min;
    commitLand(detent);
    settleTo(detent, targetMv.getVelocity());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const index = nearestIndex(landedRef.current);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        nextIndex = Math.min(index + 1, stops.length - 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        nextIndex = Math.max(index - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = stops.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const detent = stops[nextIndex] ?? min;
    commitLand(detent);
    settleTo(detent);
  };

  const committed = isControlled ? clamp(value, min, max) : uncontrolled;
  const activeIndex = nearestIndex(committed);

  // Geometry — everything scales off `size`.
  const radius = size / 2;
  const bandW = Math.round(size * BAND_RATIO);
  const hubD = Math.round(size * HUB_RATIO);
  const knurlW = Math.max(2, Math.round(size * 0.01));
  const knurlLen = Math.round(bandW * 0.62);
  const knurlR = radius - 1 - bandW / 2;
  const gradW = Math.max(2, Math.round(size * 0.012));
  const gradLen = Math.max(8, Math.round(size * 0.05));
  const gradR = radius - bandW - 2 - gradLen / 2;
  const numeralFont = Math.max(8, Math.round(size * 0.042));
  const numeralR = radius - bandW - gradLen - 8 - numeralFont / 2;
  const needleW = Math.max(3, Math.round(size * 0.016));
  const needleLen = bandW + Math.round(gradLen * 0.6);
  const needleR = radius - 1 - needleLen / 2;
  const hubFont = Math.max(10, Math.round(size * 0.06));

  /** A stop's fixed angle on the band; the front index sits at 180°. */
  const angleOf = (v: number): number =>
    180 + ((clamp(v, min, max) - min) / span) * SWEEP_DEG - SWEEP_DEG / 2;

  const tilt = motionSafe
    ? `perspective(${perspectives.base}px) rotateX(${TILT_DEG}deg)`
    : undefined;

  return (
    <div
      className={cn(
        "relative select-none",
        disabled && "opacity-50",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {/* The lens plane: one Safari-safe transform, no preserve-3d. Under RM
          the tilt drops and the same geometry reads as a flat circular dial. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ transform: tilt }}
      >
        {/* Band base — an annulus drawn as a fat border, hairline both edges. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            borderWidth: bandW,
            borderStyle: "solid",
            borderColor: "var(--bg-2)",
            boxShadow:
              "0 0 0 1px var(--hairline-strong), inset 0 0 0 1px var(--hairline-strong)",
          }}
        />

        {/* The rotor: knurl, graduations and numerals all spin together. */}
        <motion.div className="absolute inset-0" style={{ rotate: spin }}>
          {Array.from({ length: KNURL_COUNT }, (_, i) => (
            <span
              key={i}
              className="absolute top-1/2 left-1/2 rounded-1"
              style={{
                width: knurlW,
                height: knurlLen,
                marginLeft: -knurlW / 2,
                marginTop: -knurlLen / 2,
                background: "var(--ink-3)",
                opacity: 0.5,
                transform: `rotate(${(i * 360) / KNURL_COUNT}deg) translateY(${-knurlR}px)`,
              }}
            />
          ))}

          {stops.map((stop, i) => {
            const alpha = angleOf(stop);
            const active = i === activeIndex;
            return (
              <React.Fragment key={stop}>
                <span
                  className="absolute top-1/2 left-1/2 rounded-1"
                  style={{
                    width: gradW,
                    height: gradLen,
                    marginLeft: -gradW / 2,
                    marginTop: -gradLen / 2,
                    background: active
                      ? "var(--accent-bright)"
                      : "var(--ink-3)",
                    transform: `rotate(${alpha}deg) translateY(${-gradR}px)`,
                  }}
                />
                {/* Numerals are printed on the ring: rotated so each reads
                    upright the moment it arrives under the index. */}
                <span
                  className="absolute top-1/2 left-1/2"
                  style={{
                    width: 0,
                    height: 0,
                    transform: `rotate(${alpha}deg) translateY(${-numeralR}px) rotate(180deg)`,
                  }}
                >
                  <span
                    className="block -translate-x-1/2 -translate-y-1/2 font-mono font-medium whitespace-nowrap tabular-nums"
                    style={{
                      fontSize: numeralFont,
                      lineHeight: 1,
                      color: active ? "var(--accent-bright)" : "var(--ink-3)",
                    }}
                  >
                    {fmt(stop)}
                  </span>
                </span>
              </React.Fragment>
            );
          })}
        </motion.div>

        {/* The fixed index needle at front-center, pointing into the band. */}
        <motion.span
          className="absolute top-1/2 left-1/2 rounded-1"
          style={{
            width: needleW,
            height: needleLen,
            marginLeft: -needleW / 2,
            marginTop: -needleLen / 2,
            background: "var(--accent-bright)",
            opacity: needleOpacity,
            transform: `rotate(180deg) translateY(${-needleR}px)`,
          }}
        />
      </div>

      {/* Hub plate — flat, above the plane, reading the live value. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute flex items-center justify-center rounded-full border border-hairline-strong bg-surface-2"
        style={{
          width: hubD,
          height: hubD,
          left: "50%",
          top: "50%",
          marginLeft: -hubD / 2,
          marginTop: -hubD / 2,
          scale: hubScale,
          boxShadow: "var(--edge-highlight)",
        }}
      >
        <span
          className="font-mono font-medium text-cobalt-bright tabular-nums"
          style={{ fontSize: hubFont, lineHeight: 1 }}
        >
          {fmt(clamp(live, min, max))}
        </span>
      </motion.div>

      {/* The focusable frame — the whole dial is one slider. */}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={committed}
        aria-valuetext={fmt(committed)}
        aria-disabled={disabled || undefined}
        className={cn(
          "absolute inset-0 touch-none rounded-full",
          !disabled && "cursor-ew-resize",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
