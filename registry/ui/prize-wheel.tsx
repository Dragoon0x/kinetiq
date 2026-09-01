"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { wrapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Wheel face geometry, in SVG user units (1 unit = 1px at render size). */
const WHEEL_D = 208;
const CX = WHEEL_D / 2;
const CY = WHEEL_D / 2;
const R = CX - 6;
/** Labels sit this far out from the hub as a fraction of the rim radius. */
const LABEL_R_FRACTION = 0.64;
/** The decorative hub-cap ring drawn just under the spin button. */
const HUB_BACK_R = 32;

/** The real spin button, centred over the hub cap, non-rotating. */
const HUB_D = 56;

/** Pointer triangle, pinned at twelve o'clock, tip biting into the rim. */
const POINTER_W = 20;
const POINTER_H = 16;
const POINTER_CLIP = "polygon(50% 100%, 0% 0%, 100% 0%)";

/** Shockwave ring, sized past the rim so the full pulse is visible. */
const RING_D = WHEEL_D + 28;

/** Wind-up counter-rotation before the wheel commits to a direction. */
const WINDUP_DEG = 9;
/** The long authored spin: duration and its own decelerating curve. */
const SPIN_DURATION_S = 3.4;
/**
 * A steep, hand-authored ease-out — fast off the wind-up, biting down hard
 * through the final half-second. `easings.exit` was tried first, but that
 * curve accelerates (it is built for things leaving the screen); a wheel
 * arriving at rest needs the opposite shape, so the spin gets its own.
 */
const SPIN_EASE = [0.16, 1, 0.3, 1] as const;
/** Extra full turns layered onto the landing offset, varied by spin index —
 * fixed and deterministic, never chance. */
const TURN_BASE = 5;
const TURN_VARIANTS = 3;
/** The landing push-past before the `snap` spring pulls the wheel back. */
const OVERSHOOT_DEG = 6;
/** How far the winning wedge grows once it lands. */
const LIFT_SCALE = 1.09;

/** Pointer tick: a small rotate-and-return, repeating for the whole spin.
 * Fed to `animate` as keyframes, so `as const` is spread at the call site. */
const TICK_DEG = 11;
const TICK_KEYFRAMES = [0, TICK_DEG, 0] as const;
const TICK_TIMES = [0, 0.35, 1] as const;
/** Three fixed tick speeds — wind-up, cruise, deceleration — swapped by
 * timers at two fixed points in the spin. No collision maths, just a clock. */
const TICK_DURATIONS = [0.24, 0.085, 0.28] as const;
const TICK_SWITCH_FRACTIONS = [0.15, 0.72] as const;

/** Wedge fill: a fixed 4-token cycle mixed toward the surface. */
const FILL_MIX_BASE = 40;
const FILL_MIX_WIN = 74;

/** How long the flashed prize caption holds before clearing. */
const CAPTION_HOLD_MS = 1700;

export type Segment = {
  id: string;
  label: string;
  tint: string;
  blank?: boolean;
};

const DEFAULT_SEGMENTS: Segment[] = [
  { id: "plus-50", label: "+50", tint: "var(--primary)" },
  { id: "x2", label: "x2", tint: "var(--success, #047857)" },
  {
    id: "nothing",
    label: "NOTHING",
    tint: "var(--warning, #b45309)",
    blank: true,
  },
  { id: "plus-10", label: "+10", tint: "var(--ink-2)" },
  { id: "spin-again", label: "SPIN AGAIN", tint: "var(--primary)" },
  { id: "plus-25", label: "+25", tint: "var(--success, #047857)" },
  { id: "rare", label: "RARE", tint: "var(--warning, #b45309)" },
  { id: "plus-5", label: "+5", tint: "var(--ink-2)" },
];

const FALLBACK_SEGMENT: Segment = {
  id: "fallback",
  label: "—",
  tint: "var(--ink-2)",
  blank: true,
};

type HistoryEntry = {
  key: number;
  index: number;
};

type Caption = {
  kind: "win" | "blank";
  text: string;
};

/** Smallest `angle + 360k` at or above `floor` — a spin only ever turns
 * forward, never backward into an earlier rest. */
const liftTo = (angle: number, floor: number): number =>
  angle + 360 * Math.ceil((floor - angle) / 360);

export type PrizeWheelProps = {
  /** The wheel; wedge angles derive from its length. Defaults to eight. */
  segments?: Segment[];
  /** Fires once per landing, including a blank result. */
  onLand?: (label: string) => void;
  className?: string;
};

/**
 * A segmented reward wheel: pie wedges drawn from index math alone (never
 * measured), tinted from a fixed four-token cycle, turning beneath a pinned
 * pointer and around a clickable hub. A press winds the wheel back a touch
 * on `flick` — the anticipation tell — then one long authored tween carries
 * it several full turns plus the exact offset that lands the next segment in
 * the cycle under the pointer, its own steep ease-out biting down through
 * the final half-second while the pointer ticks past each spoke on a tween
 * whose duration shortens then lengthens at two fixed points in the run.
 * Landing pushes the wheel a few degrees past rest and lets a `snap` spring
 * pull it back for the overshoot; the winning wedge brightens and lifts on
 * its own spring, a ring pulses out from the hub, and the prize flashes in
 * mono beneath. A blank result gets none of that ceremony — no lift, no
 * ring, just a flat, muted caption — because celebrating every spin teaches
 * nothing. Outcomes are never chance: spins cycle through the segment list
 * in a fixed order, a press mid-spin is ignored, and the last five results
 * collect as a strip of coloured pips beside the running spin count.
 * Reduced motion: no wind-up, spin, or ticking — the wheel jumps straight to
 * the result angle, the winning segment highlights and the prize flashes
 * with no motion, and the pointer sits still throughout.
 */
export function PrizeWheel({
  segments = DEFAULT_SEGMENTS,
  onLand,
  className,
}: PrizeWheelProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const count = segments.length;
  const wedgeDeg = count > 0 ? 360 / count : 0;

  const [spinning, setSpinning] = React.useState(false);
  const [winningIndex, setWinningIndex] = React.useState<number | null>(null);
  const [caption, setCaption] = React.useState<Caption | null>(null);
  const [ringKey, setRingKey] = React.useState(0);
  const [spinsCount, setSpinsCount] = React.useState(0);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [announce, setAnnounce] = React.useState("");

  const rotation = useMotionValue<number>(0);
  const pointerTick = useMotionValue<number>(0);
  const liftScale = useMotionValue<number>(1);

  const spinningRef = React.useRef(false);
  const spinIndexRef = React.useRef(0);

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);

  const onLandRef = React.useRef(onLand);
  React.useEffect(() => {
    onLandRef.current = onLand;
  });

  const rotationAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const liftScaleAnimRef = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const tickAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const tickTimersRef = React.useRef<number[]>([]);
  const captionTimerRef = React.useRef<number | null>(null);

  // Nothing in flight may outlive the component. `tickTimers` is aliased
  // here, in the effect body, so cleanup clears whatever the live array
  // holds at unmount time rather than a stale snapshot.
  React.useEffect(() => {
    const tickTimers = tickTimersRef.current;
    return () => {
      rotationAnimRef.current?.stop();
      liftScaleAnimRef.current?.stop();
      tickAnimRef.current?.stop();
      for (const id of tickTimers) window.clearTimeout(id);
      if (captionTimerRef.current !== null)
        window.clearTimeout(captionTimerRef.current);
    };
  }, []);

  const segmentAt = (index: number): Segment =>
    segments[index] ?? FALLBACK_SEGMENT;

  const flashCaption = (kind: Caption["kind"], text: string) => {
    setCaption({ kind, text });
    if (captionTimerRef.current !== null)
      window.clearTimeout(captionTimerRef.current);
    captionTimerRef.current = window.setTimeout(() => {
      captionTimerRef.current = null;
      setCaption(null);
    }, CAPTION_HOLD_MS);
  };

  const runTick = (duration: number) => {
    tickAnimRef.current?.stop();
    tickAnimRef.current = animate(pointerTick, [...TICK_KEYFRAMES], {
      duration,
      ease: easings.move,
      repeat: Infinity,
      times: [...TICK_TIMES],
    });
  };

  const stopTicking = () => {
    tickAnimRef.current?.stop();
    tickAnimRef.current = null;
    for (const id of tickTimersRef.current) window.clearTimeout(id);
    tickTimersRef.current.length = 0;
  };

  const startTicking = () => {
    stopTicking();
    runTick(TICK_DURATIONS[0] ?? 0.2);
    const cruise = TICK_DURATIONS[1] ?? 0.1;
    const decel = TICK_DURATIONS[2] ?? 0.25;
    const toCruise = TICK_SWITCH_FRACTIONS[0] ?? 0.15;
    const toDecel = TICK_SWITCH_FRACTIONS[1] ?? 0.72;
    tickTimersRef.current.push(
      window.setTimeout(
        () => runTick(cruise),
        toCruise * SPIN_DURATION_S * 1000,
      ),
    );
    tickTimersRef.current.push(
      window.setTimeout(() => runTick(decel), toDecel * SPIN_DURATION_S * 1000),
    );
  };

  /** Fires state, announcement, and callback for a landing; the celebratory
   * flourish (brighten, lift, ring) is skipped outright for a blank result. */
  const landSpin = (index: number, winner: Segment) => {
    spinningRef.current = false;
    setSpinning(false);
    setWinningIndex(index);
    setSpinsCount((n) => n + 1);

    const entryKey = spinIndexRef.current;
    setHistory((prev) => [...prev, { key: entryKey, index }].slice(-5));

    setAnnounce(`Landed on ${winner.label}.`);
    onLandRef.current?.(winner.label);

    if (winner.blank) {
      flashCaption("blank", "nothing. again?");
      return;
    }

    flashCaption("win", `${winner.label}!`);

    if (motionSafeRef.current) {
      liftScaleAnimRef.current?.stop();
      liftScale.jump(1);
      liftScaleAnimRef.current = animate(liftScale, LIFT_SCALE, springs.snap);
      setRingKey((k) => k + 1);
    }
  };

  /** The overshoot-and-return: push a few degrees past rest, then let the
   * `snap` spring's own overshoot pull it back onto the true landing angle. */
  const settleSpin = (target: number, index: number, winner: Segment) => {
    rotationAnimRef.current?.stop();
    rotation.set(target + OVERSHOOT_DEG);
    rotationAnimRef.current = animate(rotation, target, springs.snap);
    landSpin(index, winner);
  };

  const handleSpin = () => {
    if (spinningRef.current || count === 0) return;
    spinningRef.current = true;
    setSpinning(true);
    setWinningIndex(null);
    liftScaleAnimRef.current?.stop();
    liftScale.jump(1);

    const index = spinIndexRef.current % count;
    spinIndexRef.current += 1;
    const winner = segmentAt(index);
    const requiredOffset = wrapAngle(-(index + 0.5) * wedgeDeg);
    const turns = TURN_BASE + (index % TURN_VARIANTS);

    if (!motionSafeRef.current) {
      rotationAnimRef.current?.stop();
      rotation.jump(requiredOffset);
      landSpin(index, winner);
      return;
    }

    rotationAnimRef.current?.stop();
    rotationAnimRef.current = animate(rotation, rotation.get() - WINDUP_DEG, {
      ...springs.flick,
      onComplete: () => {
        const currentWrapped = wrapAngle(rotation.get());
        const target = liftTo(requiredOffset, currentWrapped) + 360 * turns;
        startTicking();
        rotationAnimRef.current = animate(rotation, target, {
          duration: SPIN_DURATION_S,
          ease: SPIN_EASE,
          onComplete: () => {
            stopTicking();
            pointerTick.jump(0);
            settleSpin(target, index, winner);
          },
        });
      },
    });
  };

  const wedges = Array.from({ length: count }, (_, i) => {
    const seg = segmentAt(i);
    const startDeg = -90 + i * wedgeDeg;
    const endDeg = -90 + (i + 1) * wedgeDeg;
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    const x1 = CX + R * Math.cos(startRad);
    const y1 = CY + R * Math.sin(startRad);
    const x2 = CX + R * Math.cos(endRad);
    const y2 = CY + R * Math.sin(endRad);
    const largeArc = wedgeDeg > 180 ? 1 : 0;
    const path = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    const midDeg = -90 + (i + 0.5) * wedgeDeg;
    const midRad = (midDeg * Math.PI) / 180;
    const labelR = R * LABEL_R_FRACTION;
    const lx = CX + labelR * Math.cos(midRad);
    const ly = CY + labelR * Math.sin(midRad);

    const fillPct =
      i === winningIndex && !seg.blank ? FILL_MIX_WIN : FILL_MIX_BASE;
    const fill = `color-mix(in oklab, ${seg.tint} ${fillPct}%, var(--surface-1))`;

    return { seg, path, lx, ly, rotate: midDeg + 90, fill };
  });

  const winningSegment = winningIndex !== null ? segmentAt(winningIndex) : null;
  const ringTint = winningSegment ? winningSegment.tint : "var(--ink-2)";

  return (
    <div className={cn("inline-flex flex-col items-center gap-4", className)}>
      <div className="relative" style={{ width: WHEEL_D, height: WHEEL_D }}>
        {/* Pointer — pinned at twelve o'clock, ticking past each spoke. */}
        <motion.div
          aria-hidden
          className="absolute left-1/2 z-20 -translate-x-1/2"
          style={{
            top: -6,
            width: POINTER_W,
            height: POINTER_H,
            background: "var(--ink)",
            clipPath: POINTER_CLIP,
            originX: 0.5,
            originY: 0,
            rotate: pointerTick,
          }}
        />

        {/* The wheel — one HTML wrapper carrying the rotation, an inert SVG
            inside it. Wedge angles are index math against `segments.length`,
            never measured. */}
        <motion.div className="absolute inset-0" style={{ rotate: rotation }}>
          <svg
            aria-hidden
            viewBox={`0 0 ${WHEEL_D} ${WHEEL_D}`}
            width={WHEEL_D}
            height={WHEEL_D}
          >
            {wedges.map(({ seg, path, lx, ly, rotate, fill }, i) => (
              <motion.g
                key={seg.id}
                style={{
                  scale: i === winningIndex ? liftScale : 1,
                  originX: `${CX}px`,
                  originY: `${CY}px`,
                }}
              >
                <path
                  d={path}
                  stroke="var(--surface-1)"
                  strokeWidth={2}
                  style={{ fill, transition: "fill 300ms ease" }}
                />
                <text
                  x={lx}
                  y={ly}
                  transform={`rotate(${rotate} ${lx} ${ly})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="pointer-events-none font-mono font-semibold uppercase select-none"
                  style={{
                    // Sized off the label's own length, never a DOM
                    // measurement — long prizes like "SPIN AGAIN" shrink a
                    // touch so they still clear their wedge.
                    fontSize: seg.label.length > 6 ? 5.5 : 7.5,
                    letterSpacing: "-0.02em",
                    fill: "var(--ink)",
                  }}
                >
                  {seg.label}
                </text>
              </motion.g>
            ))}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="var(--hairline-strong)"
              strokeWidth={2}
            />
            <circle
              cx={CX}
              cy={CY}
              r={HUB_BACK_R}
              fill="var(--surface-1)"
              stroke="var(--hairline-strong)"
              strokeWidth={2}
            />
          </svg>
        </motion.div>

        {/* Landing shockwave — rendered above the wheel so the full ring
            reads, skipped outright for a blank result. */}
        {motionSafe &&
          ringKey > 0 &&
          winningSegment &&
          !winningSegment.blank && (
            <motion.span
              key={ringKey}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                left: "50%",
                top: "50%",
                width: RING_D,
                height: RING_D,
                marginLeft: -(RING_D / 2),
                marginTop: -(RING_D / 2),
                border: `2px solid color-mix(in oklab, ${ringTint} 70%, transparent)`,
              }}
              initial={{ scale: 0.72, opacity: 0.85 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}

        {/* The hub cap doubles as the real control — it never rotates. */}
        <button
          type="button"
          aria-label="Spin the wheel"
          disabled={spinning || count === 0}
          onClick={handleSpin}
          className={cn(
            "absolute top-1/2 left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-hairline-strong bg-surface-1 font-mono text-[11px] font-bold tracking-wide text-ink uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-60",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
          style={{ width: HUB_D, height: HUB_D }}
        >
          Spin
        </button>
      </div>

      <div className="relative h-4 w-56 overflow-hidden text-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={caption ? caption.text : "idle"}
            className={cn(
              "absolute inset-x-0 font-mono text-[11px]",
              caption?.kind === "win" ? "font-semibold text-ink" : "text-ink-3",
            )}
            initial={motionSafe ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    y: -4,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {caption ? caption.text : ""}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
          spins {spinsCount}
        </span>
        <div className="flex items-center gap-1">
          {history.map((entry) => {
            const seg = segmentAt(entry.index);
            return (
              <span
                key={entry.key}
                aria-hidden
                className="size-2 rounded-full border border-hairline-strong"
                style={{
                  background: seg.blank
                    ? "transparent"
                    : `color-mix(in oklab, ${seg.tint} 70%, var(--surface-1))`,
                }}
              />
            );
          })}
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
