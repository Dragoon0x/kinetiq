"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { angleDelta, snapAngle, wrapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Eight-point rose: default detent grid and the cardinal/intercardinal names. */
const DEFAULT_DETENT = 45;
const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
/** Minor ticks printed every 15° around the degree ring. */
const TICK_STEP = 15;
/** Keyboard PageUp/PageDown move a quarter detent for finer control. */
const PAGE_FRACTION = 0.25;
/** Housing tokens dotting the rose between the cardinal points. */
const HOUSE_TOKENS = 16;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const pad3 = (n: number): string => String(Math.round(n)).padStart(3, "0");

/** Nearest 8-point cardinal name for a bearing. */
const cardinalOf = (deg: number): string => {
  const index = Math.round(wrapAngle(deg) / 45) % 8;
  return CARDINALS[index] ?? "N";
};

type DragState = {
  pointerId: number;
};

type Flights = {
  settle: ReturnType<typeof animate> | null;
};

export type CompassNeedleProps = {
  /** Controlled bearing, 0–359 (0 = N, clockwise). */
  value?: number;
  /** Initial bearing when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires the settled bearing (drag release, keys) — deduped. */
  onChange?: (deg: number) => void;
  /** Detent spacing in degrees. @default 45 (the 8-point rose) */
  detent?: number;
  /** Dial height, px (the face is drawn square within it). @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A magnetic compass. The needle tracks the pointer's live bearing around the
 * dial center — `atan2` converted so up is 0° and clockwise is positive — and
 * on release SETTLES onto the nearest detent (the 45° rose by default) on
 * `springs.recoil`, whose two visible bounces read as the needle swinging
 * past the point and being pulled magnetically back. The short way round is
 * always taken (`angleDelta`), so the needle never spins past 180° to land.
 *
 * One `needleAngle` motion value drives the render: the mono BEARING chip
 * derives from it via `useTransform` (rendered as motion spans), never a
 * per-frame `setState`; the sr-only announcement derives from the committed
 * (landed) bearing only, so it never fires mid-drag. An epoch counter guards
 * every settle animation — starting a new drag or committing a new settle
 * bumps it, so a superseded flight's completion callback becomes a no-op
 * instead of clobbering a fresher one, and the flight is stopped outright
 * on unmount.
 *
 * The dial is a slider: focus it and ArrowRight/Up step one detent
 * clockwise, ArrowLeft/Down one counter-clockwise, Home seats N, and
 * PageUp/PageDown nudge a quarter-detent for finer aim. Reduced motion drops
 * the wobble — dragging jumps the needle to the pointer bearing frame by
 * frame and release/keys jump straight to the target detent — while every
 * detent, callback, and announcement stays identical.
 */
export function CompassNeedle({
  value,
  defaultValue = 0,
  onChange,
  detent = DEFAULT_DETENT,
  height = 300,
  className,
  "aria-label": ariaLabel = "Compass bearing",
}: CompassNeedleProps) {
  const motionSafe = useMotionSafe();
  const isControlled = value !== undefined;
  const step = detent > 0 ? detent : DEFAULT_DETENT;

  const faceRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const flightsRef = React.useRef<Flights>({ settle: null });
  /** Bumped on every new drag/settle — an in-flight animation from a stale
   *  epoch no-ops its completion instead of committing a superseded value. */
  const epochRef = React.useRef(0);

  const [initial] = React.useState(() =>
    snapAngle(wrapAngle(value ?? defaultValue), step),
  );

  /** THE bearing — every visual and the readout derive from this one value. */
  const needleAngle = useMotionValue(initial);

  const [uncontrolled, setUncontrolled] = React.useState(initial);
  const landedRef = React.useRef(initial);
  const lastEmittedRef = React.useRef(initial);

  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  const stopFlights = () => {
    flightsRef.current.settle?.stop();
    flightsRef.current.settle = null;
  };

  // Nothing in flight may outlive the component.
  React.useEffect(() => stopFlights, []);

  const emit = (bearing: number) => {
    if (lastEmittedRef.current === bearing) return;
    lastEmittedRef.current = bearing;
    onChangeRef.current?.(bearing);
  };

  /** Commit a landed detent: dedupe, mirror uncontrolled state, notify. */
  const commitLand = (bearing: number) => {
    landedRef.current = bearing;
    if (!isControlled) setUncontrolled(bearing);
    emit(bearing);
  };

  /**
   * Animate the needle onto `target`, the short way round, on `recoil` —
   * its two-bounce settle IS the magnetic wobble. Reduced motion jumps
   * instantly. Guarded by `epochRef` so a superseded flight's completion
   * never overwrites a fresher land.
   */
  const settleTo = (target: number, andCommit: boolean) => {
    const epoch = (epochRef.current += 1);
    stopFlights();
    const from = needleAngle.get();
    const to = from + angleDelta(wrapAngle(from), target);
    if (!motionSafe) {
      needleAngle.set(to);
      if (andCommit) commitLand(wrapAngle(to));
      return;
    }
    flightsRef.current.settle = animate(needleAngle, to, {
      ...springs.recoil,
      onComplete: () => {
        if (epochRef.current !== epoch) return;
        if (andCommit) commitLand(wrapAngle(to));
      },
    });
  };

  // Controlled bearing steers the needle at rest — a motion op, not setState.
  React.useEffect(() => {
    if (value === undefined) return;
    const next = wrapAngle(value);
    if (landedRef.current === next) return;
    landedRef.current = next;
    lastEmittedRef.current = next;
    settleTo(next, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settleTo closes over refs only.
  }, [value]);

  /** Bearing (deg, 0=N, clockwise) of a client point around the dial center. */
  const bearingFromPointer = (clientX: number, clientY: number): number => {
    const face = faceRef.current;
    if (!face) return needleAngle.get();
    const rect = face.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    // atan2(dx, −dy): 0° points up (N), growing clockwise.
    return (Math.atan2(dx, -dy) * 180) / Math.PI;
  };

  /** Live-track the needle to a client point, the short way from wherever
   *  it currently sits — keeps the unwrapped motion value continuous so
   *  `recoil` never has to spin the long way round on the next settle. */
  const trackTo = (clientX: number, clientY: number) => {
    const bearing = wrapAngle(bearingFromPointer(clientX, clientY));
    const from = needleAngle.get();
    needleAngle.set(from + angleDelta(wrapAngle(from), bearing));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    epochRef.current += 1;
    stopFlights();
    dragRef.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    trackTo(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    trackTo(event.clientX, event.clientY);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const target = snapAngle(wrapAngle(needleAngle.get()), step);
    settleTo(wrapAngle(target), true);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = wrapAngle(landedRef.current);
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = snapAngle(current, step) + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = snapAngle(current, step) - step;
        break;
      case "Home":
        next = 0;
        break;
      case "PageUp":
        next = current + step * PAGE_FRACTION;
        break;
      case "PageDown":
        next = current - step * PAGE_FRACTION;
        break;
      default:
        return;
    }
    event.preventDefault();
    settleTo(wrapAngle(next), true);
  };

  const committed = isControlled ? wrapAngle(value) : uncontrolled;

  // == READOUT == derived from the needle motion value — no per-frame setState.
  const bearingLabel = useTransform(needleAngle, (deg) =>
    pad3(wrapAngle(deg)),
  );
  const cardinalLabel = useTransform(needleAngle, (deg) => cardinalOf(deg));
  const needleRotate = useTransform(needleAngle, (deg) => deg);

  // sr-only announcement — derived from the committed (landed) bearing only,
  // never live drag; `committed` already changes solely on settle/keys/
  // controlled updates, so this needs no state or effect of its own.
  const announced = `${cardinalOf(committed)} ${pad3(committed)} degrees`;

  const size = Math.max(120, height);
  const radius = size / 2;
  const ringInset = Math.round(size * 0.06);
  const tickR = radius - ringInset;
  const houseR = radius - ringInset * 1.9;
  const letterR = radius - ringInset * 3.1;
  const needleLen = radius - ringInset * 1.6;
  const needleW = Math.max(3, Math.round(size * 0.018));

  const ticks: number[] = [];
  for (let d = 0; d < 360; d += TICK_STEP) ticks.push(d);

  const houses: number[] = [];
  for (let i = 0; i < HOUSE_TOKENS; i += 1) houses.push((360 / HOUSE_TOKENS) * i);

  return (
    <div
      className={cn("w-full select-none", className)}
      style={{ maxWidth: size }}
    >
      <div
        ref={faceRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={committed}
        aria-valuetext={`${cardinalOf(committed)} ${pad3(committed)} degrees`}
        className="relative mx-auto touch-none rounded-full"
        style={{ width: size, height: size, cursor: "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onKeyDown={handleKeyDown}
      >
        {/* The dial face — degree ring, house tokens, cardinal letters. */}
        <div
          aria-hidden
          className="border-hairline-strong bg-surface-1 pointer-events-none absolute inset-0 rounded-full border"
          style={{ boxShadow: "inset 0 0 0 1px var(--hairline)" }}
        >
          {/* Minor degree ticks, every 15°. */}
          {ticks.map((deg) => {
            const major = deg % 90 === 0;
            const minor = deg % 45 === 0;
            const len = major ? ringInset * 0.62 : minor ? ringInset * 0.46 : ringInset * 0.3;
            return (
              <span
                key={deg}
                className="bg-ink-3 absolute top-1/2 left-1/2 origin-bottom rounded-full"
                style={{
                  width: major ? 2 : 1,
                  height: len,
                  marginLeft: major ? -1 : -0.5,
                  transform: `rotate(${deg}deg) translateY(${-tickR}px)`,
                  opacity: major ? 0.7 : minor ? 0.5 : 0.28,
                }}
              />
            );
          })}

          {/* House tokens — small dots between the cardinal points. */}
          {houses.map((deg) => {
            const x = radius + Math.sin(rad(deg)) * houseR;
            const y = radius - Math.cos(rad(deg)) * houseR;
            return (
              <span
                key={deg}
                className="bg-ink-3 absolute rounded-full"
                style={{
                  width: 3,
                  height: 3,
                  left: x - 1.5,
                  top: y - 1.5,
                  opacity: 0.4,
                }}
              />
            );
          })}

          {/* Cardinal + intercardinal letters, upright at each point. */}
          {CARDINALS.map((label, i) => {
            const deg = i * 45;
            const x = radius + Math.sin(rad(deg)) * letterR;
            const y = radius - Math.cos(rad(deg)) * letterR;
            const isMain = deg % 90 === 0;
            return (
              <span
                key={label}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 font-mono font-medium tabular-nums",
                  isMain ? "text-ink text-[13px]" : "text-ink-3 text-[10px]",
                )}
                style={{ left: x, top: y }}
              >
                {label}
              </span>
            );
          })}

          {/* Center pivot jewel. */}
          <span
            className="border-hairline-strong bg-card absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border"
            style={{ boxShadow: "0 1px 2px oklch(0.05 0.02 258 / 0.3)" }}
          />
        </div>

        {/* THE NEEDLE — red-north / pale-south, pinned at center, one rotate. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2"
          style={{ rotate: needleRotate }}
        >
          {/* North half — points up, accent red. */}
          <span
            className="absolute rounded-full"
            style={{
              width: needleW,
              height: needleLen,
              left: -needleW / 2,
              top: -needleLen,
              background:
                "linear-gradient(to top, var(--accent) 0%, var(--accent-bright) 100%)",
              clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
            }}
          />
          {/* South half — points down, pale. */}
          <span
            className="bg-ink-3 absolute rounded-full opacity-60"
            style={{
              width: needleW,
              height: needleLen,
              left: -needleW / 2,
              top: 0,
              clipPath: "polygon(0% 0%, 100% 0%, 50% 100%)",
            }}
          />
        </motion.div>
      </div>

      {/* Mono readout — derived from the needle motion value, no setState. */}
      <div className="mt-3 flex items-center justify-center gap-1.5 font-mono text-xs tabular-nums">
        <span className="text-ink-3">BEARING</span>
        <span className="text-ink-3">&middot;</span>
        <motion.span className="text-ink">{bearingLabel}</motion.span>
        <span className="text-ink">&deg;</span>
        <span className="text-ink-3">&middot;</span>
        <motion.span className="text-cobalt-bright">{cardinalLabel}</motion.span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
