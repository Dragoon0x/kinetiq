"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, djb2, perspectives, wrapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Uncontrolled rolls cycle this fixed, varied order — never chance. */
const DEFAULT_SEQUENCE: readonly number[] = [4, 2, 6, 1, 5, 3];

/** The charge window: arc fill and swell both run this long, capped. */
const CHARGE_SECONDS = 1.2;
/** A charging die swells this far. */
const CHARGE_SCALE = 1.06;
/** Landing impact: the die steps here, then recoils to rest. */
const LAND_SCALE = 1.04;
/** Charge shiver amplitude, deg of rotateZ — a tense buzz, never a wobble. */
const SHIVER_DEG = 1.2;
/**
 * Clearance around the die per side, as a fraction of its edge. Mid-tumble a
 * cube's projected extent reaches ≈1.76× its edge (corner diagonal × house
 * perspective) and the charge swell adds 6% more, so the button pads itself
 * instead of clipping — overflow must never touch the 3D chassis.
 */
const CLEARANCE = 0.44;
/** Charge arc radius as a fraction of the edge — rings the swollen die. */
const ARC_RADIUS = 0.62;

/** Pip positions per face value on a 3×3 grid, row-major 0–8. */
const PIP_CELLS: Record<number, readonly number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/** Front-face machined light — the reduced-motion flat plate reuses it. */
const FLAT_SHADE =
  "linear-gradient(160deg, oklch(1 0 0 / 0.07) 0%, transparent 45%, oklch(0 0 0 / 0.08) 100%)";

type FaceDef = {
  /** Pip count shown on this face. */
  value: number;
  /** Parking rotation; `translateZ(half edge)` is appended at render. */
  transform: string;
  /** Static machined-light gradient: lit from above, undersides in shadow. */
  shade: string;
};

/**
 * Western die: opposite faces sum to seven — 1/6 front/back, 2/5 top/bottom,
 * 3/4 right/left.
 */
const FACES: readonly FaceDef[] = [
  { value: 1, transform: "rotateY(0deg)", shade: FLAT_SHADE },
  {
    value: 6,
    transform: "rotateY(180deg)",
    shade:
      "linear-gradient(160deg, oklch(0 0 0 / 0.06) 0%, oklch(0 0 0 / 0.14) 100%)",
  },
  {
    value: 3,
    transform: "rotateY(90deg)",
    shade:
      "linear-gradient(240deg, oklch(0 0 0 / 0.15) 0%, transparent 55%, oklch(1 0 0 / 0.04) 100%)",
  },
  {
    value: 4,
    transform: "rotateY(-90deg)",
    shade:
      "linear-gradient(120deg, oklch(0 0 0 / 0.15) 0%, transparent 55%, oklch(1 0 0 / 0.04) 100%)",
  },
  {
    value: 2,
    transform: "rotateX(90deg)",
    shade: "linear-gradient(180deg, oklch(1 0 0 / 0.1) 0%, transparent 60%)",
  },
  {
    value: 5,
    transform: "rotateX(-90deg)",
    shade: "linear-gradient(0deg, oklch(0 0 0 / 0.18) 0%, transparent 60%)",
  },
];

/** The detent orientation (deg) that lands `value` facing the viewer. */
const orientationFor = (value: number): { yaw: number; pitch: number } => {
  switch (value) {
    case 2:
      return { yaw: 0, pitch: -90 };
    case 3:
      return { yaw: -90, pitch: 0 };
    case 4:
      return { yaw: 90, pitch: 0 };
    case 5:
      return { yaw: 0, pitch: 90 };
    case 6:
      return { yaw: 180, pitch: 0 };
    default:
      return { yaw: 0, pitch: 0 };
  }
};

const clampFace = (value: number): number => clamp(Math.round(value), 1, 6);

/** Smallest `angle + 360k` at or above `floor` — rolls only spin forward. */
const liftTo = (angle: number, floor: number): number =>
  angle + 360 * Math.ceil((floor - angle) / 360);

export type DiceRollProps = {
  /** Controlled outcome (1–6): the NEXT roll lands on this face. */
  value?: number;
  /** Fires as a roll lands, with the face rolled. */
  onRoll?: (value: number) => void;
  /**
   * Uncontrolled outcomes, cycled in order roll after roll. Ignored while
   * `value` is set. Defaults to a fixed varied cycle — never random.
   */
  sequence?: number[];
  /** Die edge, px. The button pads itself so mid-tumble corners never clip. */
  size?: number;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the die button. */
  "aria-label"?: string;
};

/**
 * A pip die on a real CSS 3D chassis: six faces parked ±90/180° around the
 * center and pushed out half an edge (`backface-visibility: hidden`), one
 * `preserve-3d` element driven by yaw/pitch motion values, and the padded
 * button supplying the house perspective — no overflow or filter ever
 * touches the 3D node (Safari flattens).
 *
 * Hold (pointer, or Space/Enter) charges: the die swells toward 1.06 and
 * shivers ±1.2° while a thin accent arc fills over ~1.2s, capped. Release
 * rolls: yaw and pitch each tween (`durations.page`, `easings.enter`) to the
 * commanded face plus two-to-three full turns picked from the roll index —
 * multi-turn tumbles are tweens; a spring would fight this physics — then
 * the landing steps to 1.04 and recoils to rest, announces "Rolled N."
 * politely, and fires `onRoll`. Presses mid-flight are ignored, and the pips
 * on the face that just landed take the accent. Outcomes are never chance:
 * `value` commands the next roll, otherwise `sequence` cycles in order.
 *
 * Reduced motion: no shiver, no tumble — release swaps straight to the
 * outcome face under a fast fade, with the same announcement and callback.
 */
export function DiceRoll({
  value,
  onRoll,
  sequence,
  size = 88,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Roll the die",
}: DiceRollProps) {
  const motionSafe = useMotionSafe();

  /** Chassis orientation (deg) plus the charge-cycle values. */
  const yaw = useMotionValue(0);
  const pitch = useMotionValue(0);
  const shiver = useMotionValue(0);
  const scale = useMotionValue(1);
  const charge = useMotionValue(0);

  const arcOffset = useTransform(charge, [0, 1], [1, 0]);
  const arcOpacity = useTransform(charge, [0, 0.05], [0, 1]);

  const [rolling, setRolling] = React.useState(false);
  const [lastRoll, setLastRoll] = React.useState<{
    value: number;
    n: number;
  } | null>(null);

  /** Interaction truth lives in refs — handlers stay honest mid-render. */
  const chargingRef = React.useRef(false);
  const flightRef = React.useRef(false);
  const rollIndexRef = React.useRef(0);
  const pointerIdRef = React.useRef<number | null>(null);
  const keyHeldRef = React.useRef(false);
  const suppressClickRef = React.useRef(false);
  /** Resting detent — the chassis re-seats here on pathway switches. */
  const orientRef = React.useRef({ yaw: 0, pitch: 0 });

  const chargeControlsRef = React.useRef<ReturnType<typeof animate>[]>([]);
  const flightControlsRef = React.useRef<ReturnType<typeof animate>[]>([]);

  const onRollRef = React.useRef(onRoll);
  React.useEffect(() => {
    onRollRef.current = onRoll;
  });

  const stopChargeControls = React.useCallback(() => {
    for (const controls of chargeControlsRef.current) controls.stop();
    chargeControlsRef.current = [];
  }, []);

  const stopFlightControls = React.useCallback(() => {
    for (const controls of flightControlsRef.current) controls.stop();
    flightControlsRef.current = [];
  }, []);

  // A charge or tumble in flight must not outlive the component.
  React.useEffect(
    () => () => {
      stopChargeControls();
      stopFlightControls();
    },
    [stopChargeControls, stopFlightControls],
  );

  // Re-seat the chassis when the motion pathway switches — the other path
  // may have landed rolls while this one was unmounted. A tumble in flight
  // is left to finish; its landing callback still files the outcome.
  React.useEffect(() => {
    if (flightRef.current) return;
    stopChargeControls();
    yaw.jump(orientRef.current.yaw);
    pitch.jump(orientRef.current.pitch);
    shiver.jump(0);
    scale.jump(1);
    charge.jump(0);
  }, [motionSafe, yaw, pitch, shiver, scale, charge, stopChargeControls]);

  // Disabling mid-hold releases nothing — the charge stands down quietly.
  React.useEffect(() => {
    if (!disabled) return;
    pointerIdRef.current = null;
    keyHeldRef.current = false;
    if (!chargingRef.current) return;
    chargingRef.current = false;
    stopChargeControls();
    chargeControlsRef.current = [
      animate(scale, 1, springs.snap),
      animate(charge, 0, { duration: durations.fast }),
      animate(shiver, 0, { duration: durations.blink }),
    ];
  }, [disabled, scale, charge, shiver, stopChargeControls]);

  /** Outcome for roll `index`: the `value` command, or the sequence cycle. */
  const resolveOutcome = (index: number): number => {
    if (typeof value === "number") return clampFace(value);
    const cycle =
      sequence && sequence.length > 0 ? sequence : DEFAULT_SEQUENCE;
    return clampFace(cycle[index % cycle.length] ?? 1);
  };

  /** Files a landed roll: state, polite announcement, callback. */
  const land = (outcome: number) => {
    flightRef.current = false;
    setRolling(false);
    setLastRoll((prev) => ({ value: outcome, n: (prev?.n ?? 0) + 1 }));
    onRollRef.current?.(outcome);
  };

  const beginCharge = () => {
    if (disabled || flightRef.current || chargingRef.current) return;
    chargingRef.current = true;
    if (!motionSafe) return; // Still a pressed button — just no theatre.
    stopChargeControls();
    chargeControlsRef.current = [
      animate(scale, CHARGE_SCALE, {
        duration: CHARGE_SECONDS,
        ease: easings.enter,
      }),
      // Progress is feedback, not flourish: linear fill, capped at full.
      animate(charge, 1, { duration: CHARGE_SECONDS, ease: "linear" }),
      // The shiver is a tween loop — always stopped, never completed.
      animate(shiver, [-SHIVER_DEG, SHIVER_DEG], {
        duration: durations.blink,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "mirror",
      }),
    ];
  };

  const abortCharge = () => {
    if (!chargingRef.current) return;
    chargingRef.current = false;
    stopChargeControls();
    if (!motionSafe) return;
    chargeControlsRef.current = [
      animate(scale, 1, springs.snap),
      animate(charge, 0, { duration: durations.fast }),
      animate(shiver, 0, { duration: durations.blink }),
    ];
  };

  const releaseRoll = () => {
    if (!chargingRef.current || flightRef.current) return;
    chargingRef.current = false;
    stopChargeControls();

    const index = rollIndexRef.current;
    rollIndexRef.current += 1;
    const outcome = resolveOutcome(index);
    const target = orientationFor(outcome);
    orientRef.current = target;

    if (!motionSafe) {
      // Reduced motion: the release itself is the landing — instant swap.
      land(outcome);
      return;
    }

    flightRef.current = true;
    setRolling(true);

    // Extra full turns come from the roll index, not chance — djb2 splits
    // the index into a two-or-three-turn count per axis.
    const seed = djb2(`kq-074:${index}`);
    const yawTurns = 2 + (seed & 1);
    const pitchTurns = 2 + ((seed >> 1) & 1);

    // Normalize the parked angles so accumulated turns never compound.
    const yawFrom = wrapAngle(yaw.get());
    const pitchFrom = wrapAngle(pitch.get());
    yaw.jump(yawFrom);
    pitch.jump(pitchFrom);

    // Multi-turn tumbles are tweens — a spring would fight this physics.
    const tumble = { duration: durations.page, ease: easings.enter };
    stopFlightControls();
    flightControlsRef.current = [
      animate(yaw, liftTo(target.yaw, yawFrom) + 360 * yawTurns, {
        ...tumble,
        onComplete: () => {
          // Landing bump: step down from flight swell, recoil to rest.
          scale.set(LAND_SCALE);
          flightControlsRef.current.push(animate(scale, 1, springs.recoil));
          land(outcome);
        },
      }),
      animate(pitch, liftTo(target.pitch, pitchFrom) + 360 * pitchTurns, tumble),
      animate(charge, 0, { duration: durations.fast, ease: easings.exit }),
      animate(shiver, 0, { duration: durations.blink }),
    ];
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = event.pointerId;
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginCharge();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    suppressClickRef.current = true;
    releaseRoll();
  };

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    abortCharge(); // A hijacked pointer never throws the die.
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      keyHeldRef.current = false;
      abortCharge();
      return;
    }
    if (event.key !== " " && event.key !== "Enter") return;
    // Hold-to-roll owns activation — the native click must not double-fire.
    event.preventDefault();
    if (event.repeat || keyHeldRef.current || pointerIdRef.current !== null)
      return;
    keyHeldRef.current = true;
    beginCharge();
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    if (!keyHeldRef.current) return;
    keyHeldRef.current = false;
    if (pointerIdRef.current !== null) return; // The pointer owns this charge.
    releaseRoll();
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    // Assistive tech sends a bare click with no press to hold — charge and
    // release in one beat so the die still answers.
    if (disabled || flightRef.current || chargingRef.current) return;
    beginCharge();
    releaseRoll();
  };

  const half = Math.round(size / 2);
  const pad = Math.round(size * CLEARANCE);
  const box = size + pad * 2;
  const pip = Math.max(6, Math.round(size * 0.15));
  const arcRadius = size * ARC_RADIUS;
  const landedValue = lastRoll?.value ?? null;
  const restingValue = landedValue ?? 1;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled || rolling || undefined}
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onClick={handleClick}
      className={cn(
        "relative flex touch-none items-center justify-center rounded-3 outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60",
        "disabled:pointer-events-none disabled:opacity-50",
        !motionSafe && "active:brightness-90",
        className,
      )}
      style={{
        width: box,
        height: box,
        perspective: motionSafe ? perspectives.base : undefined,
      }}
    >
      {/* Charge meter: a thin accent arc ringing the die, filling from 12
          o'clock. Flat 2D chrome — it stays outside the 3D chassis. */}
      <motion.svg
        aria-hidden
        width={box}
        height={box}
        viewBox={`0 0 ${box} ${box}`}
        className="pointer-events-none absolute inset-0 -rotate-90"
        style={{ opacity: arcOpacity }}
      >
        <circle
          cx={box / 2}
          cy={box / 2}
          r={arcRadius}
          fill="none"
          stroke="var(--accent-wash)"
          strokeWidth={2}
        />
        <motion.circle
          cx={box / 2}
          cy={box / 2}
          r={arcRadius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          style={{ strokeDashoffset: arcOffset }}
        />
      </motion.svg>

      {motionSafe ? (
        // The chassis: one preserve-3d element, the only promoted layer.
        // No overflow or filter here — Safari would flatten the die.
        <motion.div
          aria-hidden
          className="relative"
          style={{
            width: size,
            height: size,
            rotateX: pitch,
            rotateY: yaw,
            rotateZ: shiver,
            scale,
            transformStyle: "preserve-3d",
            willChange: "transform",
          }}
        >
          {FACES.map((face) => (
            <DieFace
              key={face.value}
              value={face.value}
              shade={face.shade}
              landed={face.value === landedValue}
              size={size}
              pip={pip}
              style={{
                transform: `${face.transform} translateZ(${half}px)`,
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden",
              }}
            />
          ))}
        </motion.div>
      ) : (
        // Reduced motion: the outcome face as a flat plate; a remount fades
        // the incoming face in over durations.fast — no 3D anywhere.
        <motion.div
          key={restingValue}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: durations.fast }}
          className="relative"
          style={{ width: size, height: size }}
        >
          <DieFace
            value={restingValue}
            shade={FLAT_SHADE}
            landed={restingValue === landedValue}
            size={size}
            pip={pip}
          />
        </motion.div>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {lastRoll ? (
          // Keyed by roll count so an identical outcome still announces.
          <span key={lastRoll.n}>{`Rolled ${lastRoll.value}.`}</span>
        ) : null}
      </span>
    </button>
  );
}

type DieFaceProps = {
  value: number;
  shade: string;
  /** The face that just landed carries accent pips. */
  landed: boolean;
  size: number;
  /** Pip diameter, px. */
  pip: number;
  style?: React.CSSProperties;
};

/** One machined pip plate — classic dot grid, lit by its parked angle. */
function DieFace({ value, shade, landed, size, pip, style }: DieFaceProps) {
  const cells = PIP_CELLS[value] ?? [];
  return (
    <div
      className="absolute inset-0 overflow-hidden rounded-3 border border-hairline bg-surface-2"
      style={style}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: shade }}
      />
      <div
        className="relative grid h-full w-full grid-cols-3 grid-rows-3 place-items-center"
        style={{ padding: Math.round(size * 0.14) }}
      >
        {Array.from({ length: 9 }, (_, cell) => (
          <span key={cell} className="flex items-center justify-center">
            {cells.includes(cell) ? (
              <span
                className={cn(
                  "rounded-full",
                  landed ? "bg-cobalt" : "bg-ink",
                )}
                style={{ width: pip, height: pip }}
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
