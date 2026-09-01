"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Bank size bounds — a compact panel never reads well outside this range. */
const MIN_MAX = 3;
const MAX_MAX = 10;

/** Refill dwell period, ms — the only clock the countdown advances on
 * (never Date.now). One tick equals one displayed second. */
const TICK_MS = 1000;
const TICK_S = TICK_MS / 1000;

/** Pip capsule footprint, px. */
const PIP_W = 10;
const PIP_H = 26;

/** Faint breathing loop on the leftmost pip while the bank sits at zero. */
const PULSE_S = 2.4;
/** How far the drain spark drops before it fades, px. */
const SPARK_DROP = 10;
/** Peak scale of the fill ring before it fades out. */
const RING_PEAK_SCALE = 1.7;

const ENERGY_COLOR =
  "color-mix(in oklab, var(--primary) 65%, var(--success, #047857))";
const ENERGY_RING_COLOR = `color-mix(in oklab, ${ENERGY_COLOR} 70%, transparent)`;

type PipStatus = "filled" | "hollow";

type PipProps = {
  status: PipStatus;
  motionSafe: boolean;
  pulse: boolean;
};

/** One pip: a fixed capsule holding a fill that grows from the bottom on
 * `glide` and drains to nothing on a tween, plus a one-shot pop + ring on
 * fill and a dropped spark on drain — all driven imperatively off a
 * status-change effect so the transient bursts never touch React state. */
function Pip({ status, motionSafe, pulse }: PipProps): React.JSX.Element {
  const capsuleScale = useMotionValue<number>(1);
  const sparkY = useMotionValue<number>(0);
  const sparkOpacity = useMotionValue<number>(0);
  const ringScale = useMotionValue<number>(1);
  const ringOpacity = useMotionValue<number>(0);

  const capsuleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const sparkYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const sparkOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const ringScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const ringOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevStatusRef = React.useRef<PipStatus>(status);

  React.useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === status || !motionSafe) return;

    capsuleAnim.current?.stop();

    if (status === "filled") {
      capsuleScale.jump(0.86);
      capsuleAnim.current = animate(capsuleScale, 1, springs.recoil);

      ringScaleAnim.current?.stop();
      ringOpacityAnim.current?.stop();
      ringScale.jump(0.6);
      ringOpacity.jump(0.9);
      ringScaleAnim.current = animate(ringScale, RING_PEAK_SCALE, {
        duration: durations.slow,
        ease: easings.exit,
      });
      ringOpacityAnim.current = animate(ringOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
      });
    } else {
      sparkYAnim.current?.stop();
      sparkOpacityAnim.current?.stop();
      sparkY.jump(0);
      sparkOpacity.jump(1);
      sparkYAnim.current = animate(sparkY, SPARK_DROP, {
        duration: durations.slow,
        ease: easings.exit,
      });
      sparkOpacityAnim.current = animate(sparkOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
      });
    }
  }, [
    status,
    motionSafe,
    capsuleScale,
    sparkY,
    sparkOpacity,
    ringScale,
    ringOpacity,
  ]);

  React.useEffect(() => {
    return () => {
      capsuleAnim.current?.stop();
      sparkYAnim.current?.stop();
      sparkOpacityAnim.current?.stop();
      ringScaleAnim.current?.stop();
      ringOpacityAnim.current?.stop();
    };
  }, []);

  return (
    <motion.div
      className={cn(
        "relative transition-opacity duration-300",
        status === "hollow" && "opacity-55",
      )}
      style={{ width: PIP_W, height: PIP_H, scale: capsuleScale }}
    >
      <div className="relative size-full overflow-hidden rounded-full border border-hairline-strong bg-surface-2">
        <motion.span
          aria-hidden
          className="absolute inset-x-0 bottom-0 rounded-full"
          style={{ transformOrigin: "50% 100%", background: ENERGY_COLOR }}
          initial={false}
          animate={{ scaleY: status === "filled" ? 1 : 0 }}
          transition={
            !motionSafe
              ? { duration: 0 }
              : status === "filled"
                ? springs.glide
                : { duration: durations.base, ease: easings.exit }
          }
        />
      </div>

      {pulse && motionSafe && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-1 rounded-full border"
          style={{ borderColor: ENERGY_RING_COLOR }}
          animate={{ opacity: [0.2, 0.65, 0.2], scale: [1, 1.08, 1] }}
          transition={{
            duration: PULSE_S,
            ease: easings.move,
            repeat: Infinity,
          }}
        />
      )}

      {motionSafe && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{
            borderColor: ENERGY_RING_COLOR,
            scale: ringScale,
            opacity: ringOpacity,
          }}
        />
      )}

      {motionSafe && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
        >
          <motion.span
            className="absolute size-[3px] rounded-full"
            style={{
              background: ENERGY_COLOR,
              y: sparkY,
              opacity: sparkOpacity,
            }}
          />
        </span>
      )}
    </motion.div>
  );
}

export type EnergyPipsProps = {
  /** Bank size. Clamped 3-10. @default 6 */
  max?: number;
  /** Pips available at mount. Clamped 0-max. @default 4 */
  start?: number;
  /** Seconds a single pip takes to refill. @default 6 */
  refillSeconds?: number;
  /** Fires after a successful spend with the pips left. */
  onSpend?: (remaining: number) => void;
  /** Fires the moment the bank reaches max and the timer stops. */
  onFull?: () => void;
  className?: string;
};

/**
 * A bank of energy pips (3-10 lozenges, 6 by default) that spends down on
 * click and refills on a loop. Pressing the spend button drains the
 * rightmost filled pip on an authored tween — it dims and drops a spark —
 * while the mono count rolls through a composed `Readout`; a fixed-rate
 * interval, paced by `refillSeconds` and only ever running below full, ticks
 * a refill bar forward and, on completion, fills the next hollow pip from
 * the bottom on `glide` with a small pop and a soft ring while the count
 * rolls back up. At zero the spend button disables and the returning pip
 * pulses faintly; at full the bar reads "full" and the interval stops
 * outright. The countdown ("next in 0:18") is derived purely from an
 * interval tick counter, never `Date.now()`, so the markup never depends on
 * the wall clock and renders identically on server and client. A small
 * "+1" button grants a pip instantly so the fill can be seen without waiting
 * out the clock.
 * Reduced motion: pips swap filled and hollow instantly with no sparks,
 * rings, or pulse; the refill bar steps once per tick instead of sweeping;
 * the countdown keeps counting exactly as before.
 */
export function EnergyPips({
  max: maxProp = 6,
  start: startProp = 4,
  refillSeconds: refillSecondsProp = 6,
  onSpend,
  onFull,
  className,
}: EnergyPipsProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const maxPips = Math.min(MAX_MAX, Math.max(MIN_MAX, Math.round(maxProp)));
  const refillS = Math.max(1, Math.round(refillSecondsProp));
  const clampedStart = Math.min(maxPips, Math.max(0, Math.round(startProp)));

  const [available, setAvailable] = React.useState(clampedStart);
  const [ticksElapsed, setTicksElapsed] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const availableRef = React.useRef(clampedStart);
  const ticksRef = React.useRef(0);
  const onFullRef = React.useRef(onFull);
  const onSpendRef = React.useRef(onSpend);

  React.useEffect(() => {
    onFullRef.current = onFull;
  }, [onFull]);
  React.useEffect(() => {
    onSpendRef.current = onSpend;
  }, [onSpend]);

  /** Shared fill funnel — used by both the natural refill tick and the
   * "+1" cheat button, so a granted pip always plays the same fill beat
   * and always restarts the countdown toward the pip after it. */
  const grantPip = () => {
    const current = availableRef.current;
    if (current >= maxPips) return;
    const next = current + 1;
    availableRef.current = next;
    setAvailable(next);
    ticksRef.current = 0;
    setTicksElapsed(0);
    setAnnounce(
      next >= maxPips
        ? `Energy full at ${next} of ${maxPips}.`
        : `Energy pip returned. ${next} of ${maxPips} available.`,
    );
    if (next >= maxPips) onFullRef.current?.();
  };

  const handleSpend = () => {
    const current = availableRef.current;
    if (current <= 0) return;
    const next = current - 1;
    availableRef.current = next;
    setAvailable(next);
    setAnnounce(`Spent one energy. ${next} of ${maxPips} remaining.`);
    onSpendRef.current?.(next);
  };

  const handleCheat = () => {
    grantPip();
  };

  // The refill interval only ever exists while the bank sits below full —
  // a full bank has nothing to count toward, so it must not tick.
  React.useEffect(() => {
    if (available >= maxPips) return;
    const id = window.setInterval(() => {
      ticksRef.current += 1;
      if (ticksRef.current >= refillS) {
        grantPip();
      } else {
        setTicksElapsed(ticksRef.current);
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [available, maxPips, refillS]);

  const isFull = available >= maxPips;
  const isEmpty = available <= 0;
  const barProgress = isFull ? 1 : Math.min(1, ticksElapsed / refillS);

  const remainingS = Math.max(0, refillS - ticksElapsed);
  const mm = Math.floor(remainingS / 60);
  const ss = remainingS % 60;
  const timeText = `${mm}:${String(ss).padStart(2, "0")}`;
  const caption = isFull
    ? "full"
    : isEmpty
      ? `out of energy · next in ${timeText}`
      : `next in ${timeText}`;

  const pips: PipStatus[] = Array.from({ length: maxPips }, (_, i) =>
    i < available ? "filled" : "hollow",
  );

  return (
    <div
      className={cn(
        "w-64 rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-label text-ink-3">energy</span>
        <button
          type="button"
          aria-label="Grant one energy (demo)"
          onClick={handleCheat}
          disabled={isFull}
          className={cn(
            "rounded-1 px-1 py-0.5 font-mono text-[10px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
            "hover:text-ink-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            isFull && "pointer-events-none opacity-40",
          )}
        >
          +1
        </button>
      </div>

      <div aria-hidden className="mt-3 flex items-end gap-1.5">
        {pips.map((status, i) => (
          <Pip
            key={i}
            status={status}
            motionSafe={motionSafe}
            pulse={isEmpty && i === 0}
          />
        ))}
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <Readout value={available} size="lg" />
        <span className="font-mono text-sm text-ink-3">/ {maxPips}</span>
      </div>

      <div
        aria-hidden
        className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          style={{ background: ENERGY_COLOR }}
          animate={{ scaleX: barProgress }}
          transition={
            motionSafe
              ? { duration: TICK_S, ease: easings.linear }
              : { duration: 0 }
          }
        />
      </div>

      <div className="mt-2 flex h-4 items-center">
        <span aria-hidden className="font-mono text-[11px] text-ink-3">
          {caption}
        </span>
      </div>

      <button
        type="button"
        aria-label="Spend one energy"
        onClick={handleSpend}
        disabled={isEmpty}
        className={cn(
          "mt-3 w-full rounded-2 bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
          "hover:brightness-110 active:brightness-95",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          isEmpty && "pointer-events-none opacity-50",
        )}
      >
        SPEND
      </button>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
