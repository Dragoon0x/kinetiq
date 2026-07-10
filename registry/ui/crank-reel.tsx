"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { angleDelta, clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** A full spool sweeps this much of the drum face; 20° stays open throat. */
const SPOOL_SWEEP = 340;
/** One pawl click per this much crank travel, deg. */
const TICK_STEP = 45;
/** The released crank settles onto quarter rests. */
const QUARTER = 90;
/** Pawl kick amplitude, deg — the click strike. */
const PAWL_KICK = 8;
/** Overdrag at a stop approaches this many degrees, asymptotically. */
const OVERDRAG_DEG = 26;
/** Pointer samples this close to the hub are dropped — atan2 flips too fast. */
const DEAD_ZONE_PX = 12;
/** The tick LED rests at this opacity between clicks. */
const LED_IDLE = 0.25;

/** Rig geometry, px. Fixed — the whole post stays under 375px wide. */
const DRUM = 120;
const SPOOL_R = 33;
const CRANK = 112;
const ORBIT_R = 38;
const KNOB = 22;
const SHAFT_W = 5;
const HUB = 30;
const GAP = 26;
const SPOOL_W_MIN = 3;
const SPOOL_W_MAX = 8;

/** `springs.glide` shaped as `useSpring` smoothing — the drum's trailing lag. */
const GLIDE_SMOOTHING = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

/** Asymptotic end-stop: the give approaches OVERDRAG_DEG, never reaches it. */
const resist = (over: number): number =>
  (OVERDRAG_DEG * over) / (over + OVERDRAG_DEG);

type DragState = {
  pointerId: number;
  /** Last pointer bearing around the crank hub, deg. */
  lastAngle: number;
  /** The crank's honest angle (overdrag give excluded), deg. */
  crankDeg: number;
  /** Raw degrees pressed past the full stop (+) or the zero stop (−). */
  over: number;
  /** Whether the current backward run already slipped (episode edge). */
  slipping: boolean;
};

export type CrankReelProps = {
  /** Controlled wound units. */
  value?: number;
  /** Initial wound units when uncontrolled. */
  defaultValue?: number;
  /** Fires once per unit gained or lost — never per degree. */
  onValueChange?: (value: number) => void;
  /** Fires when backward cranking slips on the freewheel (once per episode). */
  onSlip?: () => void;
  /** Spool capacity, in units. */
  max?: number;
  /** Units banked per full crank turn. */
  unitsPerTurn?: number;
  /** When false, backward cranking slips: clicks, no progress. */
  reversible?: boolean;
  /** What the reel winds — printed on the counter chip and read to SR. */
  spoolLabel?: string;
  className?: string;
  /** Accessible name for the slider. */
  "aria-label"?: string;
};

/**
 * A hand-crank input with a ratchet freewheel. The rig is a reel drum (left)
 * and a crank (right) on one axle: circular-drag the grip and the pointer's
 * bearing around the hub accumulates as continuous crank angle via
 * `angleDelta` — no wrap seams. Forward (clockwise) travel winds: every
 * 360/unitsPerTurn degrees banks one unit, the drum counter-rotates to
 * value/max × 340° through a `glide`-tuned `useSpring` so it trails the hand,
 * and the spool arc thickens and sweeps with it — the wound-line cue.
 * Backward travel slips on the freewheel: the crank turns, the drum holds,
 * nothing banks, and re-cranking forward resumes from the held progress
 * (`reversible` swaps the freewheel for a symmetric unwind with a resisted
 * zero stop). Every 45° of crank travel is a ratchet tick — the pawl kicks 8°
 * and springs home on `flick`, and the counter chip's LED blinks.
 *
 * At the full stop the crank stiffens (asymptotic overdrag give) and springs
 * back on release via `recoil`; any other release settles the arm to its
 * nearest quarter on `snap`, value already banked. The frame is a slider:
 * ArrowUp/Right winds +1 (the arm glides the matching turn, ticks fire),
 * ArrowDown/Left unwinds −1 only when reversible (else the freewheel is
 * announced), Home/End run the rails with one batched announcement. A polite
 * sr-only region reads unit changes ("7 of 12") and slips ("Freewheel").
 * `onValueChange` fires per unit gained or lost. Reduced motion keeps every
 * semantic but moves the crank and drum instantly and swaps the pawl kick for
 * an opacity blink. No rAF loops, no timers — everything derives from the
 * crank and value motion values, and all in-flight controls stop on unmount.
 */
export function CrankReel({
  value,
  defaultValue,
  onValueChange,
  onSlip,
  max = 12,
  unitsPerTurn = 2,
  reversible = false,
  spoolLabel = "Line",
  className,
  "aria-label": ariaLabel = "Crank reel",
}: CrankReelProps) {
  const motionSafe = useMotionSafe();
  const isControlled = value !== undefined;

  const maxUnits = Math.max(1, Math.round(max));
  const perTurn = unitsPerTurn > 0 ? unitsPerTurn : 2;
  const degPerUnit = 360 / perTurn;
  const maxDeg = maxUnits * degPerUnit;

  const [initial] = React.useState<number>(() =>
    Math.round(clamp(value ?? defaultValue ?? 0, 0, maxUnits)),
  );

  /** The crank arm's rendered angle, deg — 0 points the grip straight up. */
  const crankMv = useMotionValue(0);
  /** Banked units — the drum's source of truth. */
  const unitsMv = useMotionValue(initial);
  /** Units filtered through glide constants — the drum's trailing lag. */
  const unitsGlide = useSpring(unitsMv, GLIDE_SMOOTHING);
  /** What the drum renders: the sprung units, or the raw units under RM. */
  const drumUnits = useMotionValue(initial);

  const drumRotate = useTransform(
    drumUnits,
    (v) => -mapRange(v, 0, maxUnits, 0, SPOOL_SWEEP),
  );
  /** Dash trick: pathLength 1, dash "1 2" — visible where p < sweep/360. */
  const spoolOffset = useTransform(
    drumUnits,
    (v) => 1 - mapRange(v, 0, maxUnits, 0, SPOOL_SWEEP) / 360,
  );
  const spoolWidth = useTransform(
    drumUnits,
    (v) => SPOOL_W_MIN + mapRange(v, 0, maxUnits, 0, 1) * (SPOOL_W_MAX - SPOOL_W_MIN),
  );
  const pawlKick = useMotionValue(0);
  const pawlOpacity = useMotionValue(1);
  const ledOpacity = useMotionValue(LED_IDLE);

  const [committedValue, setCommittedValue] = React.useState(initial);
  const [message, setMessage] = React.useState("");

  /** Banked forward progress, deg ∈ [0, maxDeg] — the ratchet holds this. */
  const windRef = React.useRef(initial * degPerUnit);
  /** Banked whole units — floor of the wind. */
  const valueRef = React.useRef(initial);
  /** Where the idle crank rests or is heading (quarter-aligned), deg. */
  const crankTargetRef = React.useRef(0);
  /** Which 45° bucket the crank currently occupies. */
  const tickBucketRef = React.useRef(0);
  const dragRef = React.useRef<DragState | null>(null);
  const controlsRef = React.useRef<{
    settle: ReturnType<typeof animate> | null;
    pawl: ReturnType<typeof animate> | null;
    led: ReturnType<typeof animate> | null;
  }>({ settle: null, pawl: null, led: null });

  const onValueChangeRef = React.useRef(onValueChange);
  const onSlipRef = React.useRef(onSlip);
  React.useEffect(() => {
    onValueChangeRef.current = onValueChange;
    onSlipRef.current = onSlip;
  });

  // Nothing in flight may outlive the component.
  React.useEffect(() => {
    const controls = controlsRef.current;
    return () => {
      controls.settle?.stop();
      controls.pawl?.stop();
      controls.led?.stop();
    };
  }, []);

  // The drum follows the sprung units when motion is rich, raw units under RM
  // — instant, no trail. Same house pattern as the ring dial's display value.
  useMotionValueEvent(unitsGlide, "change", (v) => {
    if (motionSafe) drumUnits.set(v);
  });
  useMotionValueEvent(unitsMv, "change", (v) => {
    if (!motionSafe) drumUnits.set(v);
  });

  /** One ratchet click: the pawl kicks 8° (RM: opacity blink); LED blinks. */
  const kickPawl = () => {
    controlsRef.current.pawl?.stop();
    if (motionSafe) {
      pawlKick.set(PAWL_KICK);
      controlsRef.current.pawl = animate(pawlKick, 0, springs.flick);
    } else {
      pawlOpacity.set(0.25);
      controlsRef.current.pawl = animate(pawlOpacity, 1, {
        duration: durations.blink,
        ease: easings.enter,
      });
    }
    controlsRef.current.led?.stop();
    ledOpacity.set(1);
    controlsRef.current.led = animate(ledOpacity, LED_IDLE, {
      duration: durations.blink,
      ease: easings.enter,
    });
  };

  // Ratchet ticks derive from crank travel: whenever the arm crosses a 45°
  // bucket — dragging, gliding on keys, or settling — the pawl clicks once.
  // No timers, no rAF; the opacity cues survive reduced motion.
  useMotionValueEvent(crankMv, "change", (deg) => {
    const bucket = Math.floor(deg / TICK_STEP);
    if (bucket === tickBucketRef.current) return;
    tickBucketRef.current = bucket;
    kickPawl();
  });

  /** Report every whole unit between two banked values, in order. */
  const emitUnits = (from: number, to: number) => {
    const dir = to > from ? 1 : -1;
    for (let v = from + dir; dir > 0 ? v <= to : v >= to; v += dir) {
      onValueChangeRef.current?.(v);
    }
  };

  /** Re-floor the wind into whole units; mirror, notify and announce. */
  const bank = () => {
    const banked = Math.min(
      maxUnits,
      Math.floor(windRef.current / degPerUnit + 1e-4),
    );
    if (banked === valueRef.current) return;
    emitUnits(valueRef.current, banked);
    valueRef.current = banked;
    unitsMv.set(banked);
    if (!isControlled) setCommittedValue(banked);
    setMessage(`${banked} of ${maxUnits}`);
  };

  /**
   * Feed one pointer angle delta through the ratchet. Overdrag give is
   * relieved first; forward drive winds until the full stop and presses into
   * resisted give past it; backward either unwinds (reversible, with a
   * mirrored zero stop) or slips on the freewheel — the crank turns, the
   * drum holds, and the travel never banks.
   */
  const applyDelta = (drag: DragState, delta: number) => {
    let d = delta;
    if (drag.over > 0 && d < 0) {
      const relief = Math.min(-d, drag.over);
      drag.over -= relief;
      d += relief;
    } else if (drag.over < 0 && d > 0) {
      const relief = Math.min(d, -drag.over);
      drag.over += relief;
      d -= relief;
    }
    if (d > 0) {
      drag.slipping = false;
      const drive = Math.min(d, maxDeg - windRef.current);
      windRef.current += drive;
      drag.crankDeg += drive;
      const excess = d - drive;
      if (excess > 0) drag.over = Math.min(drag.over + excess, OVERDRAG_DEG * 3);
    } else if (d < 0) {
      const back = -d;
      if (reversible) {
        const drive = Math.min(back, windRef.current);
        windRef.current -= drive;
        drag.crankDeg -= drive;
        const excess = back - drive;
        if (excess > 0)
          drag.over = Math.max(drag.over - excess, -OVERDRAG_DEG * 3);
      } else {
        // Freewheel: the crank turns, the drum does not. Announce the slip
        // once per backward episode — winding forward re-arms it.
        drag.crankDeg -= back;
        if (!drag.slipping) {
          drag.slipping = true;
          onSlipRef.current?.();
          setMessage("Freewheel");
        }
      }
    }
    crankMv.set(drag.crankDeg + Math.sign(drag.over) * resist(Math.abs(drag.over)));
    bank();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current) return;
    controlsRef.current.settle?.stop();
    const rect = event.currentTarget.getBoundingClientRect();
    const angle =
      Math.atan2(
        event.clientY - (rect.top + rect.height / 2),
        event.clientX - (rect.left + rect.width / 2),
      ) *
      (180 / Math.PI);
    dragRef.current = {
      pointerId: event.pointerId,
      lastAngle: angle,
      crankDeg: crankMv.get(),
      over: 0,
      slipping: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (dx * dx + dy * dy < DEAD_ZONE_PX * DEAD_ZONE_PX) return;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const delta = angleDelta(drag.lastAngle, angle);
    drag.lastAngle = angle;
    applyDelta(drag, delta);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    // The arm settles to its nearest quarter; overdrag springs back on
    // recoil, a plain release lands on snap. Value is already banked.
    const rest = Math.round(drag.crankDeg / QUARTER) * QUARTER;
    crankTargetRef.current = rest;
    controlsRef.current.settle?.stop();
    if (motionSafe) {
      controlsRef.current.settle = animate(
        crankMv,
        rest,
        Math.abs(drag.over) > 0.5 ? springs.recoil : springs.snap,
      );
    } else {
      crankMv.set(rest);
    }
  };

  /** Keyboard landing: bank whole units and glide the arm the same turns. */
  const windTo = (next: number) => {
    const target = clamp(Math.round(next), 0, maxUnits);
    const current = valueRef.current;
    if (target === current) return;
    emitUnits(current, target);
    valueRef.current = target;
    windRef.current = target * degPerUnit;
    unitsMv.set(target);
    if (!isControlled) setCommittedValue(target);
    setMessage(`${target} of ${maxUnits}`);
    const crankTarget = crankTargetRef.current + (target - current) * degPerUnit;
    crankTargetRef.current = crankTarget;
    controlsRef.current.settle?.stop();
    if (motionSafe) {
      controlsRef.current.settle = animate(crankMv, crankTarget, springs.glide);
    } else {
      crankMv.set(crankTarget);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (dragRef.current) return;
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        windTo(valueRef.current + 1);
        break;
      case "ArrowDown":
      case "ArrowLeft":
        if (reversible) {
          windTo(valueRef.current - 1);
        } else {
          // The freewheel does not unwind: click, announce, hold the value.
          setMessage("Freewheel");
          onSlipRef.current?.();
          kickPawl();
        }
        break;
      case "Home":
        windTo(0);
        break;
      case "End":
        windTo(maxUnits);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  // Controlled updates steer the reel without re-announcing or echoing them.
  React.useEffect(() => {
    if (value === undefined) return;
    const next = Math.round(clamp(value, 0, maxUnits));
    if (valueRef.current === next) return;
    const turn = (next - valueRef.current) * degPerUnit;
    valueRef.current = next;
    windRef.current = next * degPerUnit;
    unitsMv.set(next);
    const crankTarget = crankTargetRef.current + turn;
    crankTargetRef.current = crankTarget;
    controlsRef.current.settle?.stop();
    if (motionSafe) {
      controlsRef.current.settle = animate(crankMv, crankTarget, springs.glide);
    } else {
      crankMv.set(crankTarget);
    }
  }, [value, maxUnits, degPerUnit, motionSafe, crankMv, unitsMv]);

  const committed = isControlled
    ? Math.round(clamp(value, 0, maxUnits))
    : committedValue;
  const padded = String(committed).padStart(String(maxUnits).length, "0");

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={maxUnits}
      aria-valuenow={committed}
      aria-valuetext={`${committed} of ${maxUnits} ${spoolLabel} units`}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative inline-flex select-none flex-col items-center gap-3 rounded-3",
        className,
      )}
    >
      <div className="relative flex items-center" style={{ gap: GAP }}>
        {/* The shared axle: crank drives drum through the ratchet. */}
        <div
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: DRUM / 2,
            width: DRUM / 2 + GAP + CRANK / 2,
            height: 3,
            background: "var(--hairline-strong)",
          }}
        />

        {/* THE DRUM — face, rotating spokes, spool arc, pawl. */}
        <div aria-hidden className="relative" style={{ width: DRUM, height: DRUM }}>
          <div className="absolute inset-0 rounded-full border border-hairline-strong bg-surface-2" />

          {/* Rotor: ratchet ring, web, spokes and keyed hub counter-rotate. */}
          <motion.div className="absolute inset-0" style={{ rotate: drumRotate }}>
            <svg viewBox="-60 -60 120 120" className="block size-full">
              {Array.from({ length: 16 }, (_, i) => {
                const a = (i * 22.5 * Math.PI) / 180;
                const cos = Math.cos(a);
                const sin = Math.sin(a);
                return (
                  <line
                    key={i}
                    x1={(cos * 52.5).toFixed(2)}
                    y1={(sin * 52.5).toFixed(2)}
                    x2={(cos * 57).toFixed(2)}
                    y2={(sin * 57).toFixed(2)}
                    stroke="var(--hairline-strong)"
                    strokeWidth={1.5}
                  />
                );
              })}
              <circle r={48} fill="none" stroke="var(--hairline)" />
              {[15, 105, 195, 285].map((deg) => {
                const a = (deg * Math.PI) / 180;
                const cos = Math.cos(a);
                const sin = Math.sin(a);
                return (
                  <line
                    key={deg}
                    x1={(cos * 14).toFixed(2)}
                    y1={(sin * 14).toFixed(2)}
                    x2={(cos * 48).toFixed(2)}
                    y2={(sin * 48).toFixed(2)}
                    stroke="var(--hairline-strong)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                );
              })}
              <circle
                r={13.5}
                fill="var(--card)"
                stroke="var(--hairline-strong)"
              />
              <line
                x1={0}
                y1={-6}
                x2={0}
                y2={-12.5}
                stroke="var(--ink-3)"
                strokeWidth={2}
                strokeLinecap="round"
              />
              <circle r={2.5} fill="var(--ink-3)" />
            </svg>
          </motion.div>

          {/* Spool gauge: sweep and thickness both carry the wound value. */}
          <svg viewBox="0 0 120 120" className="pointer-events-none absolute inset-0">
            <circle
              cx={60}
              cy={60}
              r={SPOOL_R}
              fill="none"
              stroke="var(--hairline)"
              strokeWidth={1}
            />
            <motion.circle
              cx={60}
              cy={60}
              r={SPOOL_R}
              fill="none"
              stroke="var(--accent-bright)"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 2"
              transform="rotate(-90 60 60)"
              style={{ strokeDashoffset: spoolOffset, strokeWidth: spoolWidth }}
            />
          </svg>

          {/* The pawl: a frame-mounted finger on the ring; kicks per click. */}
          <motion.div
            className="absolute"
            style={{
              left: 72,
              top: 8,
              width: 26,
              height: 26,
              rotate: pawlKick,
              opacity: pawlOpacity,
              transformOrigin: "85% 27%",
            }}
          >
            <svg viewBox="0 0 26 26" className="block size-full">
              <polygon points="22,4 25,10 6,22 3,18" fill="var(--ink-3)" />
            </svg>
          </motion.div>
          <span
            className="absolute rounded-full border border-hairline-strong bg-card"
            style={{ left: 90, top: 11, width: 8, height: 8 }}
          />
        </div>

        {/* THE CRANK — orbit track, hub, arm with grip, hit disc. */}
        <div className="relative" style={{ width: CRANK, height: CRANK }}>
          <svg
            aria-hidden
            viewBox={`0 0 ${CRANK} ${CRANK}`}
            className="pointer-events-none absolute inset-0"
          >
            <circle
              cx={CRANK / 2}
              cy={CRANK / 2}
              r={ORBIT_R}
              fill="none"
              stroke="var(--hairline)"
              strokeWidth={1}
              strokeDasharray="3 5"
            />
          </svg>
          <span
            aria-hidden
            className="absolute rounded-full border border-hairline-strong bg-surface-2"
            style={{
              left: (CRANK - HUB) / 2,
              top: (CRANK - HUB) / 2,
              width: HUB,
              height: HUB,
            }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-0"
            style={{ rotate: crankMv }}
          >
            <span
              className="absolute rounded-full"
              style={{
                left: (CRANK - SHAFT_W) / 2,
                top: CRANK / 2 - ORBIT_R,
                width: SHAFT_W,
                height: ORBIT_R,
                background: "var(--hairline-strong)",
              }}
            />
            <span
              className="absolute rounded-full border border-hairline-strong bg-surface-2"
              style={{
                left: (CRANK - KNOB) / 2,
                top: CRANK / 2 - ORBIT_R - KNOB / 2,
                width: KNOB,
                height: KNOB,
              }}
            >
              <span
                className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ background: "var(--accent-bright)" }}
              />
            </span>
          </motion.div>
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: CRANK / 2 - 4,
              top: CRANK / 2 - 4,
              width: 8,
              height: 8,
              background: "var(--ink-3)",
            }}
          />
          {/* Circular drag surface — pointer-captured, angle around the hub. */}
          <div
            aria-hidden
            className="absolute inset-0 cursor-grab touch-none rounded-full active:cursor-grabbing"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          />
        </div>
      </div>

      {/* Tick counter chip — the LED blinks once per ratchet click. */}
      <span
        aria-hidden
        className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-ink-2 uppercase tabular-nums"
      >
        <motion.span
          className="size-1.5 rounded-full"
          style={{ background: "var(--accent-bright)", opacity: ledOpacity }}
        />
        {spoolLabel} &middot; {padded}/{maxUnits}
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </div>
  );
}
