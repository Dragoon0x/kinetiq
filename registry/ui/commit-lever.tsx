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
import { angleDelta, clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Full travel, degrees — 0° straight up, 95° hard against the commit stop. */
const MAX_TRAVEL = 95;
/** The guard detent: free travel ends here, the armed band begins. */
const GUARD_ANGLE = 55;
/** Half-width of the stiffened band around the guard, degrees. */
const GUARD_ZONE = 6;
/** Drag gain inside the guard zone — pushing through costs real pointer arc. */
const GUARD_GAIN = 0.35;
/** End of the armed band; past here the final pull begins. */
const ARMED_END = 88;
/** Released anywhere past the guard, the lever settles into this detent. */
const ARMED_REST = 62;
/** Crossing this angle commits — just shy of the 95° stop. */
const COMMIT_CROSS = 93;
/** How far the guard flap swings aside as the lever pushes through, degrees. */
const FLAP_ASIDE = 48;
/** Pointer travel before a press counts as a drag, px. */
const DRAG_SLOP = 3;
/** Plate drop on the commit thunk, px. */
const THUNK_DROP = 2;
/** Armed-lamp blink half-period, s — an opacity tween, never a spring. */
const BLINK_PERIOD = 0.5;

/** Rig geometry, px — fixed, so the drag math never needs a layout read. */
const RIG_W = 192;
const RIG_H = 204;
const PIVOT_X = 28;
const PIVOT_Y = 168;
/** Pivot-to-grip-center reach. */
const SHAFT_LEN = 118;
const SHAFT_W = 6;
/** Grip knob diameter. */
const GRIP = 32;
/** Radius of the marked quadrant arc. */
const ARC_R = 142;
/** Minor graduations along the free zone. */
const FREE_TICKS = [0, 14, 28, 42] as const;

type Stage = "safe" | "armed" | "committed";

const STAGE_TEXT: Record<Stage, string> = {
  safe: "SAFE",
  armed: "ARMED",
  committed: "COMMITTED",
};

type Controls = ReturnType<typeof animate> | null;

type DragState = {
  pointerId: number;
  /** Pivot in client coordinates, sampled at grab. */
  pivotX: number;
  pivotY: number;
  /** Last pointer bearing about the pivot — deltas accumulate from here. */
  lastBearing: number;
  startX: number;
  startY: number;
};

/** Point at `deg` (0° up, clockwise) and radius `r` from the pivot. */
const polar = (deg: number, r: number): { x: number; y: number } => {
  const rad = (deg * Math.PI) / 180;
  return { x: PIVOT_X + Math.sin(rad) * r, y: PIVOT_Y - Math.cos(rad) * r };
};

/** SVG arc along the quadrant between two lever angles at radius `r`. */
const arcPath = (from: number, to: number, r: number): string => {
  const a = polar(from, r);
  const b = polar(to, r);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
};

/** Radial tick endpoints at `deg`, spanning radii `r0..r1`. */
const radial = (
  deg: number,
  r0: number,
  r1: number,
): { x1: number; y1: number; x2: number; y2: number } => {
  const a = polar(deg, r0);
  const b = polar(deg, r1);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
};

/** Pointer bearing about the pivot: 0° straight up, 90° due right. */
const bearing = (cx: number, cy: number, px: number, py: number): number =>
  (Math.atan2(cx - px, py - cy) * 180) / Math.PI;

export type CommitLeverProps = {
  /** Fires exactly once per full pull, the moment the lever crosses 93°. */
  onCommit: () => void;
  /** Mirrors the armed state: true past the guard, false on any return home. */
  onArmChange?: (armed: boolean) => void;
  /**
   * Action label printed on the plate; also the default accessible name.
   * @default "Commit"
   */
  commitLabel?: string;
  disabled?: boolean;
  /**
   * ms the lever holds the stop before gliding home and disarming;
   * 0 locks it at the stop until the next pull releases it.
   * @default 900
   */
  resetDelay?: number;
  className?: string;
  /** Accessible name for the grip. Defaults to `commitLabel`. */
  "aria-label"?: string;
};

/**
 * A two-stage action lever on a quadrant plate: pull past the guard detent
 * to arm, full travel to commit. The shaft swings about a bottom-left pivot
 * from 0° (up) to the 95° stop; the arc is marked FREE (0–55°), a guard
 * notch at 55°, an accent-washed ARMED band (55–88°), and the commit stop.
 *
 * Drag rides a pointer capture on the grip, pointer bearing accumulated
 * about the pivot. Below the guard the lever has return-weight — release
 * recoils it home on `springs.recoil`. Within ±6° of the guard the drag
 * gain drops to 0.35× (a real force bump) while the aria-hidden guard flap
 * swings aside, both read from the one angle motion value. Release past
 * the guard settles the 62° detent on `springs.snap` and ARMS —
 * `onArmChange(true)`, the band glows, the status lamp blinks. Crossing
 * 93° COMMITS exactly once: `onCommit` fires, the lever locks against the
 * stop on `springs.flick`, the plate thunks (2px drop, `springs.recoil`
 * back to 0) and the lamp goes solid. After `resetDelay` ms the lever
 * glides home on `springs.glide` and disarms; with `resetDelay` 0 it holds
 * the stop and the next pull (or press) releases it home first.
 *
 * The grip is a real button: first Enter/Space ARMS (glide to 62°), the
 * second COMMITS the full travel, Escape DISARMS home — every transition
 * announced by an sr-only status ("Armed" / "Committed" / "Disarmed"). The
 * mono STATE row on the plate is aria-hidden print. Reduced motion snaps
 * the lever between 0°/62°/95° on fast tweens — no thunk, no blink — with
 * the same two-stage activation contract and announcements.
 */
export function CommitLever({
  onCommit,
  onArmChange,
  commitLabel = "Commit",
  disabled = false,
  resetDelay = 900,
  className,
  "aria-label": ariaLabelProp,
}: CommitLeverProps) {
  const motionSafe = useMotionSafe();
  const ariaLabel = ariaLabelProp ?? commitLabel;

  const [stage, setStage] = React.useState<Stage>("safe");
  const [grabbed, setGrabbed] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  /** Lever angle, degrees — the one source the flap and rig read back. */
  const angle = useMotionValue(0);
  /** Plate thunk channel — dropped 2px when the lever hits the stop. */
  const baseY = useMotionValue(0);
  /** Status lamp intensity, 0..1 — blinks armed, solid committed. */
  const lamp = useMotionValue(0);

  /** The guard flap swings aside as the lever pushes through the notch. */
  const flapRotate = useTransform(
    angle,
    [GUARD_ANGLE - GUARD_ZONE, GUARD_ANGLE + GUARD_ZONE],
    [0, FLAP_ASIDE],
  );
  const lampGlow = useTransform(lamp, (v) =>
    v <= 0.02
      ? "none"
      : `0 0 ${Math.round(7 * v)}px 1px color-mix(in oklab, var(--accent-bright) ${Math.round(
          60 * v,
        )}%, transparent)`,
  );

  const rigRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<Stage>("safe");
  const armedRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const dragRef = React.useRef<DragState | null>(null);
  const angleControlsRef = React.useRef<Controls>(null);
  const baseControlsRef = React.useRef<Controls>(null);
  const lampControlsRef = React.useRef<Controls>(null);
  const timerRef = React.useRef(0);
  const onArmChangeRef = React.useRef(onArmChange);

  React.useEffect(() => {
    onArmChangeRef.current = onArmChange;
  });

  // Unmount hygiene only — no state is set here.
  React.useEffect(
    () => () => {
      window.clearTimeout(timerRef.current);
      angleControlsRef.current?.stop();
      baseControlsRef.current?.stop();
      lampControlsRef.current?.stop();
    },
    [],
  );

  const setStageBoth = (next: Stage) => {
    stageRef.current = next;
    setStage(next);
  };

  /** Notify `onArmChange` only on real transitions. */
  const emitArmed = (next: boolean) => {
    if (armedRef.current === next) return;
    armedRef.current = next;
    onArmChangeRef.current?.(next);
  };

  const settleAngle = (target: number, spring: Transition) => {
    angleControlsRef.current?.stop();
    angleControlsRef.current = animate(
      angle,
      target,
      motionSafe ? spring : { duration: durations.fast },
    );
  };

  const lampOff = () => {
    lampControlsRef.current?.stop();
    lampControlsRef.current = animate(lamp, 0, { duration: durations.fast });
  };

  /** Armed cue: a breathing blink; a steady lamp under reduced motion. */
  const lampArmed = () => {
    lampControlsRef.current?.stop();
    if (!motionSafe) {
      lampControlsRef.current = animate(lamp, 1, { duration: durations.fast });
      return;
    }
    lamp.set(0.15);
    lampControlsRef.current = animate(lamp, 1, {
      duration: BLINK_PERIOD,
      ease: easings.move,
      repeat: Infinity,
      repeatType: "reverse",
    });
  };

  const lampSolid = () => {
    lampControlsRef.current?.stop();
    lampControlsRef.current = animate(lamp, 1, { duration: durations.fast });
  };

  /** The commit thunk — the plate takes the hit and recoils. */
  const thunk = () => {
    baseControlsRef.current?.stop();
    baseY.set(THUNK_DROP);
    baseControlsRef.current = animate(baseY, 0, springs.recoil);
  };

  /** Send the lever home and stand down — the shared disarm/reset path. */
  const returnHome = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
    emitArmed(false);
    setStageBoth("safe");
    setAnnouncement("Disarmed");
    lampOff();
    settleAngle(0, springs.glide);
  };

  /** Crossing 93° (or the second press): fire once, lock against the stop. */
  const fireCommit = () => {
    if (stageRef.current === "committed") return;
    // A commit clears the guard by definition — keep the callback pair balanced.
    emitArmed(true);
    setStageBoth("committed");
    setAnnouncement("Committed");
    lampSolid();
    onCommit();
    angleControlsRef.current?.stop();
    angleControlsRef.current = motionSafe
      ? animate(angle, MAX_TRAVEL, { ...springs.flick, onComplete: thunk })
      : animate(angle, MAX_TRAVEL, { duration: durations.fast });
    if (resetDelay > 0) {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = 0;
        returnHome();
      }, resetDelay);
    }
  };

  /** Detent decision at release: settle armed past the guard, recoil home short. */
  const settleRelease = () => {
    if (angle.get() >= GUARD_ANGLE) {
      const wasArmed = armedRef.current;
      emitArmed(true);
      setStageBoth("armed");
      if (!wasArmed) setAnnouncement("Armed");
      lampArmed();
      settleAngle(ARMED_REST, springs.snap);
    } else {
      const wasArmed = armedRef.current;
      emitArmed(false);
      setStageBoth("safe");
      if (wasArmed) setAnnouncement("Disarmed");
      lampOff();
      settleAngle(0, springs.recoil);
    }
  };

  const handleGripPointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (disabled || !motionSafe) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    if (stageRef.current === "committed") {
      // Locked at the stop. A pending reset keeps it; with resetDelay 0 the
      // next pull releases the lever home first.
      if (resetDelay === 0) {
        draggedRef.current = true; // swallow the click this press will mint
        returnHome();
      }
      return;
    }
    const rig = rigRef.current;
    if (!rig) return;
    const rect = rig.getBoundingClientRect();
    const pivotX = rect.left + PIVOT_X;
    const pivotY = rect.top + PIVOT_Y;
    angleControlsRef.current?.stop();
    draggedRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      pivotX,
      pivotY,
      lastBearing: bearing(event.clientX, event.clientY, pivotX, pivotY),
      startX: event.clientX,
      startY: event.clientY,
    };
    setGrabbed(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleGripPointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (
      Math.abs(event.clientX - drag.startX) > DRAG_SLOP ||
      Math.abs(event.clientY - drag.startY) > DRAG_SLOP
    ) {
      draggedRef.current = true;
    }
    if (stageRef.current === "committed") return; // locked — the pull is spent
    const next = bearing(event.clientX, event.clientY, drag.pivotX, drag.pivotY);
    const step = angleDelta(drag.lastBearing, next);
    drag.lastBearing = next;
    const current = angle.get();
    // The guard is a force bump: within ±6° the drag gain drops to 0.35×,
    // so pushing through costs real pointer arc.
    const gain =
      Math.abs(current - GUARD_ANGLE) <= GUARD_ZONE ? GUARD_GAIN : 1;
    angle.set(clamp(current + step * gain, 0, MAX_TRAVEL));
    if (angle.get() >= COMMIT_CROSS) fireCommit();
  };

  const handleGripPointerUp = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setGrabbed(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!draggedRef.current) return; // the click that follows advances instead
    if (stageRef.current === "committed") return; // locked at the stop
    settleRelease();
  };

  const handleGripPointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setGrabbed(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const wasDragged = draggedRef.current;
    draggedRef.current = false;
    if (stageRef.current === "committed") return;
    if (wasDragged) {
      settleRelease();
      return;
    }
    // No meaningful pull — reseat on the current stage's detent.
    settleAngle(stageRef.current === "armed" ? ARMED_REST : 0, springs.snap);
  };

  /** Enter/Space (and plain clicks) walk the two stages; a drag swallows its click. */
  const handleGripClick = () => {
    if (disabled) return;
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    const now = stageRef.current;
    if (now === "safe") {
      emitArmed(true);
      setStageBoth("armed");
      setAnnouncement("Armed");
      lampArmed();
      settleAngle(ARMED_REST, springs.glide); // keyboard arm rides glide
      return;
    }
    if (now === "armed") {
      fireCommit();
      return;
    }
    // Committed hold (resetDelay 0): the next throw releases home first.
    if (resetDelay === 0) returnHome();
  };

  const handleGripKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (disabled) return;
    if (event.key === "Escape") {
      const now = stageRef.current;
      if (now === "armed" || (now === "committed" && resetDelay === 0)) {
        event.preventDefault();
        returnHome();
      }
      return;
    }
    // A held Enter must not machine-gun arm → commit.
    if (event.key === "Enter" && event.repeat) event.preventDefault();
  };

  return (
    <div className={cn("w-full", className)}>
      {/* The plate rides the thunk channel — it takes the commit hit. */}
      <motion.div
        style={{ y: baseY }}
        className={cn(
          "rounded-3 border border-hairline bg-surface-1 px-4 pt-4 pb-3 select-none",
          disabled && "opacity-50",
        )}
      >
        <div className="flex justify-center">
          {/* THE RIG — fixed-px quadrant, so bearing math never reads layout. */}
          <div
            ref={rigRef}
            className="relative shrink-0"
            style={{ width: RIG_W, height: RIG_H }}
          >
            <svg
              aria-hidden
              viewBox={`0 0 ${RIG_W} ${RIG_H}`}
              width={RIG_W}
              height={RIG_H}
              className="absolute inset-0"
            >
              {/* Quadrant arc — the full 0..95° slot. */}
              <path
                d={arcPath(0, MAX_TRAVEL, ARC_R)}
                fill="none"
                stroke="var(--hairline-strong)"
                strokeWidth={1.5}
              />
              {/* Armed band 55..88 — washed at rest, glowing past the guard. */}
              <path
                d={arcPath(GUARD_ANGLE, ARMED_END, ARC_R)}
                fill="none"
                stroke="var(--accent-wash)"
                strokeWidth={10}
              />
              <motion.path
                d={arcPath(GUARD_ANGLE, ARMED_END, ARC_R)}
                fill="none"
                stroke="var(--accent-bright)"
                strokeWidth={10}
                initial={false}
                animate={{ opacity: stage === "safe" ? 0 : 0.3 }}
                transition={{ duration: durations.fast }}
              />
              {FREE_TICKS.map((tick) => (
                <line
                  key={tick}
                  {...radial(tick, ARC_R - 4, ARC_R + 4)}
                  stroke="var(--hairline-strong)"
                  strokeWidth={1}
                />
              ))}
              {/* Guard notch, armed-band end, and the commit stop. */}
              <line
                {...radial(GUARD_ANGLE, ARC_R - 9, ARC_R + 9)}
                stroke="var(--ink-2)"
                strokeWidth={2}
              />
              <line
                {...radial(ARMED_END, ARC_R - 5, ARC_R + 5)}
                stroke="var(--hairline-strong)"
                strokeWidth={1.5}
              />
              <line
                {...radial(MAX_TRAVEL, ARC_R - 11, ARC_R + 7)}
                stroke="var(--ink-2)"
                strokeWidth={3.5}
              />
              {/* Zone print. */}
              <text
                {...polar(26, ARC_R - 26)}
                textAnchor="middle"
                className="font-mono uppercase"
                style={{ fontSize: 7, letterSpacing: "0.12em", fill: "var(--ink-3)" }}
              >
                FREE
              </text>
              <text
                {...polar(71.5, ARC_R - 26)}
                textAnchor="middle"
                className="font-mono uppercase"
                style={{ fontSize: 7, letterSpacing: "0.12em", fill: "var(--ink-3)" }}
              >
                ARMED
              </text>
              <text
                x={112}
                y={193}
                textAnchor="middle"
                className="font-mono uppercase"
                style={{ fontSize: 7, letterSpacing: "0.12em", fill: "var(--ink-3)" }}
              >
                COMMIT
              </text>
            </svg>

            {/* GUARD FLAP — a gate over the 55° notch, shouldered aside as the
                lever pushes through; pure read of the angle motion value. */}
            <div
              aria-hidden
              className="pointer-events-none absolute z-10"
              style={{
                left: PIVOT_X,
                top: PIVOT_Y,
                width: 0,
                height: 0,
                transform: `rotate(${GUARD_ANGLE}deg)`,
              }}
            >
              <motion.span
                className="absolute block rounded-1 border border-hairline-strong bg-surface-2"
                style={{
                  left: -2.5,
                  top: -(ARC_R + 12),
                  width: 5,
                  height: 24,
                  rotate: flapRotate,
                  transformOrigin: "2.5px 3px",
                }}
              />
            </div>

            {/* THE LEVER — a 0×0 wrapper at the pivot; rotate swings the lot. */}
            <motion.div
              className="absolute z-20"
              style={{
                left: PIVOT_X,
                top: PIVOT_Y,
                width: 0,
                height: 0,
                rotate: angle,
              }}
            >
              {/* Shaft — machined face inside hairline-strong edges. */}
              <span
                aria-hidden
                className="absolute rounded-full border border-hairline-strong bg-surface-2"
                style={{
                  left: -SHAFT_W / 2,
                  top: -SHAFT_LEN,
                  width: SHAFT_W,
                  height: SHAFT_LEN + 8,
                }}
              />
              {/* GRIP — the real button carrying drag, keys, and stages. */}
              <motion.button
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                initial={false}
                animate={{ scale: grabbed ? 1.06 : 1 }}
                transition={springs.flick}
                onPointerDown={handleGripPointerDown}
                onPointerMove={handleGripPointerMove}
                onPointerUp={handleGripPointerUp}
                onPointerCancel={handleGripPointerCancel}
                onClick={handleGripClick}
                onKeyDown={handleGripKeyDown}
                className={cn(
                  "absolute flex touch-none items-center justify-center rounded-full border border-hairline-strong bg-surface-2 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  disabled
                    ? "cursor-not-allowed"
                    : motionSafe
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-pointer",
                )}
                style={{
                  left: -GRIP / 2,
                  top: -(SHAFT_LEN + GRIP / 2),
                  width: GRIP,
                  height: GRIP,
                }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none flex flex-col gap-[3px]"
                >
                  <span className="h-px w-3.5 rounded-full bg-ink-3/70" />
                  <span className="h-px w-3.5 rounded-full bg-ink-3/70" />
                  <span className="h-px w-3.5 rounded-full bg-ink-3/70" />
                </span>
              </motion.button>
            </motion.div>

            {/* Pivot boss over the shaft heel. */}
            <span
              aria-hidden
              className="absolute z-30 rounded-full border border-hairline-strong bg-surface-2"
              style={{ left: PIVOT_X - 9, top: PIVOT_Y - 9, width: 18, height: 18 }}
            >
              <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3" />
            </span>
          </div>
        </div>

        {/* Plate print: the action label and the mono state row with its lamp.
            aria-hidden — the sr-only status below carries the semantics. */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-2.5">
          <span className="min-w-0 truncate text-label text-ink-2">
            {commitLabel}
          </span>
          <span
            aria-hidden
            className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] font-medium tracking-[0.12em] text-ink-3 uppercase tabular-nums"
          >
            <span className="relative flex size-2.5 items-center justify-center rounded-full border border-hairline-strong bg-surface-0">
              <motion.span
                className="size-1.5 rounded-full"
                style={{
                  opacity: lamp,
                  boxShadow: lampGlow,
                  backgroundColor: "var(--accent-bright)",
                }}
              />
            </span>
            <span>
              STATE &middot;{" "}
              <span
                className={stage === "safe" ? "text-ink-3" : "text-cobalt-bright"}
              >
                {STAGE_TEXT[stage]}
              </span>
            </span>
          </span>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
