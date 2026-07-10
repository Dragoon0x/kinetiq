"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Sheave radius, px — rope falls hang at the tangent lines, center ± R. */
const WHEEL_R = 20;
/** Frame top → wheel top. */
const PAD_TOP = 10;
/** Shaft floor clearance under the ground line. */
const PAD_BOT = 12;
/** Shaft inset: platform lane left edge and guide rails. */
const PAD_X = 12;
/** Rope left on the car side when parked at the top floor. */
const MIN_ROPE = 22;
/** The car plate is a fixed cabin height; content clips inside it. */
const PLAT_H = 88;
/** The rope hitches this far in from the platform's right edge. */
const ROPE_INSET = 18;
/** Counterweight block. */
const WEIGHT_W = 26;
const WEIGHT_H = 34;
/** Right-edge column reserved for the floor tabs. */
const TABS_W = 92;
const TAB_H = 24;
/** Invisible grab strip width centered on each rope fall. */
const ROPE_HIT_W = 18;
/** Overdrag past a terminal approaches this much T, asymptotically. */
const OVER_T = 0.07;
/** Elastic arrival: the platform dips this many px, the weight the inverse. */
const BOUNCE_PX = 4;
/** Ceiling on floors — beyond four the shaft stops reading as a lift. */
const MAX_FLOORS = 4;

/** Asymptotic end-stop: the overshoot approaches `limit`, never reaches it. */
const resist = (over: number, limit: number): number =>
  limit * (over / (over + limit));

const pad2 = (n: number): string => String(n).padStart(2, "0");

type DragState = {
  pointerId: number;
  lastY: number;
  /** Unresisted accumulated T — the end-stops map from this. */
  raw: number;
  /** +1: surface moves with the car (platform, left fall). −1: inverted. */
  sign: 1 | -1;
};

export type Floor = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export type PulleyLiftProps = {
  /** Floors, ground first. 2–4; only the first four are used. */
  floors: Floor[];
  /** Controlled floor id. Steers the car on change; drags stay live. */
  floor?: string;
  /** Initial floor id when uncontrolled. @default the first floor */
  defaultFloor?: string;
  /** Fires once per settled floor id — on arrival, never per pixel. */
  onFloorChange?: (id: string) => void;
  /** Frame height, px. @default 280 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A pulley elevator. A spoked sheave hangs at the top of the shaft with a
 * rope over it: the content platform is hitched to the left fall, a dense
 * counterweight to the right. One travel value T (0 ground .. 1 top) drives
 * the whole rig — platform y runs `ground − T·travel`, the weight mirrors it
 * (`top + T·travel`), each rope's height is the drop from the tangent line to
 * its load so the two always sum to the same constant (the rope is
 * conserved), and the wheel turns by the rope it pays out: `T·travel` px over
 * a circumference `2πR`, × 360°.
 *
 * Three grab surfaces, all pointer-captured: the platform, the counterweight,
 * and either rope fall. Vertical drag maps px to T through the travel span —
 * the platform and left fall move with the car, the counterweight and right
 * fall invert (the honest pulley feel) — and overdrag past a terminal is
 * resisted asymptotically. Release settles T to the nearest floor on `glide`;
 * on completion the elastic arrival plays — the platform dips 4px
 * (set the dip, recoil to 0: exactly two keyframes) while the counterweight
 * rides the same value inverted — and `onFloorChange` fires once per settled
 * floor id. Only the active floor's content is mounted on the platform,
 * swapped at settle under a fast opacity fade; the right-edge floor tabs
 * (real buttons, aria-current) describe the rest and glide the car over with
 * the same arrival. The frame is a vertical slider: ArrowUp/Down step one
 * floor, Home/End run to the ends, and a polite sr-only region announces
 * each arrival by label. The `floor` prop steers on change without echoing
 * `onFloorChange` back to its owner.
 *
 * Reduced motion: T jumps (duration-0 settle), no glide and no bounce; the
 * wheel and ropes stay consistent because they derive from T. All animation
 * controls stop on unmount; no rAF loops, no per-frame setState.
 */
export function PulleyLift({
  floors,
  floor,
  defaultFloor,
  onFloorChange,
  height = 280,
  className,
  "aria-label": ariaLabel = "Pulley lift",
}: PulleyLiftProps) {
  const motionSafe = useMotionSafe();

  const list = floors.slice(0, MAX_FLOORS);
  const count = list.length;
  const lastIndex = Math.max(count - 1, 1);
  /** A floor's position on the travel axis: ground 0 .. top 1. */
  const tOf = (i: number): number => i / lastIndex;

  // Vertical datum lines. Horizontal stays fluid via CSS calc off the shaft
  // center `(100% − TABS_W)/2`, so no width measurement is ever needed.
  const cy = PAD_TOP + WHEEL_R; // wheel center = rope tangent height
  const topPlatTop = cy + MIN_ROPE; // platform top, parked at the top floor
  const groundPlatTop = Math.max(height - PAD_BOT - PLAT_H, topPlatTop + 24);
  const travel = groundPlatTop - topPlatTop; // px the car and weight traverse
  const weightTop0 = topPlatTop; // weight parks high when the car is grounded
  const floorY = (i: number): number =>
    groundPlatTop + PLAT_H - tOf(i) * travel; // the car's sill line per floor
  const atShaft = (dx: number): string =>
    `calc((100% - ${TABS_W}px) / 2 + ${dx}px)`;

  const [initialIndex] = React.useState<number>(() => {
    const seed = floor ?? defaultFloor;
    const i = seed === undefined ? 0 : list.findIndex((f) => f.id === seed);
    return i >= 0 ? i : 0;
  });

  /** THE travel value. Everything below derives from T (and the bounce). */
  const t = useMotionValue(tOf(initialIndex));
  /** Arrival dip in px — platform rides +bounce, the counterweight −bounce. */
  const bounce = useMotionValue(0);
  /** Platform content fade, reset at each swap. */
  const contentOpacity = useMotionValue(1);

  const platY = useTransform(
    [t, bounce],
    ([tv = 0, b = 0]: number[]) => groundPlatTop - tv * travel + b,
  );
  const weightY = useTransform(
    [t, bounce],
    ([tv = 0, b = 0]: number[]) => weightTop0 + tv * travel - b,
  );
  // Rope falls, measured from the tangent line down to each load. Their sum
  // is (groundPlatTop + weightTop0 − 2cy) for every T and bounce — a fixed
  // length of rope, honestly redistributed over the wheel.
  const leftRopeH = useTransform([t, bounce], ([tv = 0, b = 0]: number[]) =>
    Math.max(groundPlatTop - tv * travel + b - cy, 2),
  );
  const rightRopeH = useTransform([t, bounce], ([tv = 0, b = 0]: number[]) =>
    Math.max(weightTop0 + tv * travel - b - cy, 2),
  );
  // Wheel spin: the rope pays out T·travel px over a circumference of
  // 2π·WHEEL_R, so turns = T·travel / (2πR) and degrees = turns × 360. The
  // car side (left tangent) rising drags the rim counterclockwise → negative.
  const wheelRotate = useTransform(
    t,
    (tv) => (-(tv * travel) / (2 * Math.PI * WHEEL_R)) * 360,
  );

  const [settledIndex, setSettledIndex] = React.useState(initialIndex);
  const [targetIndex, setTargetIndex] = React.useState(initialIndex);
  const [announce, setAnnounce] = React.useState("");

  const targetRef = React.useRef(initialIndex);
  const settledRef = React.useRef(initialIndex);
  const lastNotifiedRef = React.useRef<string | null>(
    list[initialIndex]?.id ?? null,
  );
  const prevFloorPropRef = React.useRef(floor);
  const dragRef = React.useRef<DragState | null>(null);
  const settleControl = React.useRef<ReturnType<typeof animate> | null>(null);
  const bounceControl = React.useRef<ReturnType<typeof animate> | null>(null);
  const fadeControl = React.useRef<ReturnType<typeof animate> | null>(null);

  const onFloorChangeRef = React.useRef(onFloorChange);
  React.useEffect(() => {
    onFloorChangeRef.current = onFloorChange;
  });

  // Nothing in flight may outlive the component.
  React.useEffect(
    () => () => {
      settleControl.current?.stop();
      bounceControl.current?.stop();
      fadeControl.current?.stop();
    },
    [],
  );

  /** Settle completion: elastic arrival, content swap, dedupe, notify. */
  const arrive = (index: number) => {
    const f = list[index];
    if (!f) return;
    if (motionSafe) {
      bounceControl.current?.stop();
      // Exactly two keyframes: set the landing dip, recoil back to rest.
      bounce.set(BOUNCE_PX);
      bounceControl.current = animate(bounce, 0, springs.recoil);
    }
    if (settledRef.current !== index) {
      settledRef.current = index;
      fadeControl.current?.stop();
      contentOpacity.set(0);
      fadeControl.current = animate(contentOpacity, 1, {
        duration: durations.fast,
        ease: easings.enter,
      });
    }
    setSettledIndex(index);
    setTargetIndex(index);
    setAnnounce(f.label);
    if (lastNotifiedRef.current !== f.id) {
      lastNotifiedRef.current = f.id;
      onFloorChangeRef.current?.(f.id);
    }
  };

  /** Send T to a floor — `glide` rich, an instant duration-0 hop under RM. */
  const glideTo = (index: number, velocity = 0) => {
    settleControl.current?.stop();
    const transition: Transition = motionSafe
      ? { ...springs.glide, velocity }
      : { duration: 0 };
    settleControl.current = animate(t, tOf(index), {
      ...transition,
      onComplete: () => arrive(index),
    });
  };

  /** Tab clicks and keyboard steps funnel here. */
  const commandTo = (index: number) => {
    if (index === targetRef.current) return;
    targetRef.current = index;
    setTargetIndex(index);
    glideTo(index);
  };

  // Controlled steering — only on an actual `floor` change, so a drag that
  // settles elsewhere is reported (not fought) until the owner responds.
  // Guarded and idempotent, so it runs dependency-free by design.
  React.useEffect(() => {
    if (floor === undefined || prevFloorPropRef.current === floor) return;
    prevFloorPropRef.current = floor;
    const index = list.findIndex((f) => f.id === floor);
    if (index < 0 || index === targetRef.current) return;
    targetRef.current = index;
    lastNotifiedRef.current = floor; // no echo back to the owner
    glideTo(index);
  });

  const beginDrag =
    (sign: 1 | -1) => (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (dragRef.current) return;
      settleControl.current?.stop();
      bounceControl.current?.stop();
      bounce.set(0); // any landing dip is absorbed by the grab
      dragRef.current = {
        pointerId: event.pointerId,
        lastY: event.clientY,
        raw: clamp(t.get(), 0, 1),
        sign,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const dragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    // Pointer up hoists the grabbed side: the car side raises the car (T+),
    // the counterweight side lowers it (T−) — the honest pulley inversion.
    drag.raw += (drag.sign * (drag.lastY - event.clientY)) / travel;
    // Cap the raw overshoot so the way back never feels like dead rope.
    drag.raw = clamp(drag.raw, -OVER_T * 3, 1 + OVER_T * 3);
    drag.lastY = event.clientY;
    const next =
      drag.raw > 1
        ? 1 + resist(drag.raw - 1, OVER_T)
        : drag.raw < 0
          ? -resist(-drag.raw, OVER_T)
          : drag.raw;
    t.set(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Uniform floor grid: the nearest detent is a straight round.
    const nearest = Math.round(clamp(t.get(), 0, 1) * lastIndex);
    targetRef.current = nearest;
    setTargetIndex(nearest);
    glideTo(nearest, t.getVelocity());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number;
    switch (event.key) {
      case "ArrowUp":
        next = Math.min(targetRef.current + 1, count - 1);
        break;
      case "ArrowDown":
        next = Math.max(targetRef.current - 1, 0);
        break;
      case "Home":
        next = 0; // ground
        break;
      case "End":
        next = count - 1; // top
        break;
      default:
        return;
    }
    event.preventDefault();
    commandTo(next);
  };

  const settledFloor = list[settledIndex];
  const grabHandlers = (sign: 1 | -1) => ({
    onPointerDown: beginDrag(sign),
    onPointerMove: dragMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={targetIndex}
      aria-valuetext={list[targetIndex]?.label}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative w-full overflow-hidden rounded-4 border border-hairline bg-surface-0 select-none",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        className,
      )}
      style={{ height }}
    >
      {/* Floor lines — the car's sill datum at every stop, across the shaft. */}
      {list.map((f, i) => (
        <span
          key={f.id}
          aria-hidden
          className="bg-hairline absolute h-px"
          style={{ left: PAD_X - 4, right: TABS_W - 4, top: floorY(i) }}
        />
      ))}

      {/* Car lane guide rails — the eccentric hitch leans on these. */}
      <span
        aria-hidden
        className="bg-hairline absolute w-px"
        style={{ left: PAD_X - 3, top: cy, height: height - cy - PAD_BOT }}
      />
      <span
        aria-hidden
        className="bg-hairline absolute w-px"
        style={{ left: atShaft(1), top: cy, height: height - cy - PAD_BOT }}
      />
      {/* Tabs column edge. */}
      <span
        aria-hidden
        className="bg-hairline absolute inset-y-2 w-px"
        style={{ left: `calc(100% - ${TABS_W}px)` }}
      />

      {/* Headgear mount stem, frame top down to the axle. */}
      <span
        aria-hidden
        className="bg-hairline-strong absolute top-0"
        style={{ left: atShaft(-1), width: 2, height: cy }}
      />

      {/* The rope: two vertical falls off the tangent lines. Complementary
          heights — as the car side shortens, the weight side lengthens. */}
      <motion.span
        aria-hidden
        className="bg-hairline-strong absolute w-px"
        style={{ left: atShaft(-WHEEL_R - 0.5), top: cy, height: leftRopeH }}
      />
      <motion.span
        aria-hidden
        className="bg-hairline-strong absolute w-px"
        style={{ left: atShaft(WHEEL_R - 0.5), top: cy, height: rightRopeH }}
      />

      {/* Rope grab strips — generous invisible hit targets over each fall. */}
      <div
        aria-hidden
        className="absolute cursor-grab touch-none active:cursor-grabbing"
        style={{
          left: atShaft(-WHEEL_R - ROPE_HIT_W / 2),
          top: cy,
          width: ROPE_HIT_W,
          height: height - cy - PAD_BOT,
        }}
        {...grabHandlers(1)}
      />
      <div
        aria-hidden
        className="absolute cursor-grab touch-none active:cursor-grabbing"
        style={{
          left: atShaft(WHEEL_R - ROPE_HIT_W / 2),
          top: cy,
          width: ROPE_HIT_W,
          height: height - cy - PAD_BOT,
        }}
        {...grabHandlers(-1)}
      />

      {/* Counterweight — a dense little block riding the right fall, always
          opposite the car (and opposite its bounce). */}
      <motion.div
        aria-hidden
        className="border-hairline-strong bg-surface-1 absolute flex cursor-grab touch-none flex-col justify-center gap-[3px] rounded-1 border px-1 active:cursor-grabbing"
        style={{
          left: atShaft(WHEEL_R - WEIGHT_W / 2),
          top: 0,
          y: weightY,
          width: WEIGHT_W,
          height: WEIGHT_H,
        }}
        {...grabHandlers(-1)}
      >
        <span className="bg-hairline-strong h-px w-full" />
        <span className="bg-hairline-strong h-px w-full" />
        <span className="bg-hairline-strong h-px w-full" />
      </motion.div>

      {/* The platform — the car plate on the left fall. Only the settled
          floor's content is mounted; it swaps at arrival under a fast fade. */}
      <motion.div
        className="border-hairline bg-surface-2 absolute cursor-grab touch-none overflow-hidden rounded-2 border active:cursor-grabbing"
        style={{
          left: PAD_X,
          top: 0,
          y: platY,
          width: `calc((100% - ${TABS_W}px) / 2 - ${WHEEL_R + PAD_X - ROPE_INSET}px)`,
          height: PLAT_H,
        }}
        {...grabHandlers(1)}
      >
        {/* Hitch pin, directly under the left fall. */}
        <span
          aria-hidden
          className="bg-hairline-strong pointer-events-none absolute top-0 h-1.5 w-px"
          style={{ right: ROPE_INSET - 0.5 }}
        />
        {settledFloor && (
          <motion.div
            key={settledFloor.id}
            className="flex h-full min-h-0 flex-col gap-1.5 p-2.5"
            style={{ opacity: contentOpacity }}
          >
            <p className="text-ink-3 truncate font-mono text-[10px] leading-none tracking-[0.1em] uppercase tabular-nums">
              {pad2(settledIndex)} &middot; {settledFloor.label}
            </p>
            <div className="min-h-0 flex-1">{settledFloor.content}</div>
          </motion.div>
        )}
      </motion.div>

      {/* The sheave: hairline-strong rim and groove, ink spokes, accent hub.
          Drawn over the loads so hard overdrag tucks them behind the gear. */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          left: atShaft(-(WHEEL_R + 2)),
          top: cy - (WHEEL_R + 2),
          width: (WHEEL_R + 2) * 2,
          height: (WHEEL_R + 2) * 2,
        }}
      >
        <motion.div className="h-full w-full" style={{ rotate: wheelRotate }}>
          <svg
            viewBox="0 0 44 44"
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx={22}
              cy={22}
              r={20}
              fill="var(--card)"
              stroke="var(--hairline-strong)"
              strokeWidth={2}
            />
            <circle
              cx={22}
              cy={22}
              r={16.5}
              fill="none"
              stroke="var(--hairline-strong)"
              strokeWidth={1}
            />
            {Array.from({ length: 6 }, (_, i) => {
              const a = (i * 60 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1={22 + Math.cos(a) * 5.5}
                  y1={22 + Math.sin(a) * 5.5}
                  x2={22 + Math.cos(a) * 15}
                  y2={22 + Math.sin(a) * 15}
                  stroke="var(--ink-3)"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              );
            })}
            <circle cx={22} cy={22} r={4} fill="var(--accent)" />
          </svg>
        </motion.div>
      </div>

      {/* Floor tabs — real buttons parked on their sill lines. */}
      {list.map((f, i) => {
        const current = i === targetIndex;
        return (
          <button
            key={f.id}
            type="button"
            aria-current={current ? "true" : undefined}
            onClick={() => commandTo(i)}
            className={cn(
              "absolute flex items-center gap-1.5 rounded-1 px-1.5",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              current ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
            style={{
              right: 8,
              width: TABS_W - 14,
              top: floorY(i) - TAB_H,
              height: TAB_H,
            }}
          >
            <span
              className={cn(
                "font-mono text-[10px] leading-none font-medium tabular-nums",
                current && "text-cobalt-bright",
              )}
            >
              {pad2(i)}
            </span>
            <span className="truncate font-mono text-[9px] leading-none tracking-[0.08em] uppercase">
              {f.label}
            </span>
          </button>
        );
      })}

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
