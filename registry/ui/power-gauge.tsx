"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

type Shot = "weak" | "good" | "sweet" | "over";

/** Power (0-100) boundaries between bands. Sweet sits at 78-88, deliberately
 * short of the top, so chasing max power runs straight into overcharge. */
const WEAK_MAX = 40;
const GOOD_MAX = 78;
const SWEET_MAX = 88;

/** Scale the result readout and the result bar are drawn against — the best
 * possible sweet-spot hit fills the bar completely. */
const MAX_VALUE = 220;

/** One-way sweep duration; the needle mirrors this on the way back down. */
const CHARGE_SWEEP_S = 0.85;
/** How long a shot's caption (and its effects) hold before the next beat. */
const RESULT_HOLD_MS = 1150;
/** Reduced-motion step cadence while held. */
const REDUCED_STEP_MS = 140;
const REDUCED_POSITIONS = [0, 20, 40, 60, 80, 100] as const;

const SHAKE_S = 0.32;
const SHAKE_X = [-8, 7, 0] as const;
const SHAKE_TIMES = [0, 0.55, 1] as const;

const CAPTIONS: Record<Shot, string> = {
  weak: "weak",
  good: "good",
  sweet: "sweet spot",
  over: "overcharged",
};

/** Subtle tints for the permanent band segments in the track. */
const BAND_WASH: Record<Shot, string> = {
  weak: "color-mix(in oklab, var(--ink-2) 30%, transparent)",
  good: "color-mix(in oklab, var(--success, #047857) 32%, transparent)",
  sweet: "color-mix(in oklab, var(--warning, #b45309) 55%, transparent)",
  over: "color-mix(in oklab, var(--warning, #b45309) 22%, var(--ink-2))",
};

/** Vivid tones for transient celebration (flash/ring/sparks) and the result
 * bar fill — overcharge stays visibly duller than a good hit, never brighter. */
const RESULT_TONE: Record<Shot, string> = {
  weak: "var(--ink-2)",
  good: "color-mix(in oklab, var(--success, #047857) 75%, var(--card))",
  sweet: "var(--warning, #b45309)",
  over: "color-mix(in oklab, var(--warning, #b45309) 45%, var(--ink-2))",
};

const FLASH_PEAK: Record<Shot, number> = {
  weak: 0,
  good: 0.5,
  sweet: 0.85,
  over: 0.3,
};

const BAND_DEFS = [
  { key: "weak" as const, from: 0, to: WEAK_MAX },
  { key: "good" as const, from: WEAK_MAX, to: GOOD_MAX },
  { key: "sweet" as const, from: GOOD_MAX, to: SWEET_MAX },
  { key: "over" as const, from: SWEET_MAX, to: 100 },
];

const TICKS = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

const DEG = Math.PI / 180;

/** `count` fixed vectors fanned across the top 160° arc — no Math.random,
 * so every burst from a given band is identical. */
function sparkVectors(
  count: number,
  radius: number,
): { dx: number; dy: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const angle = (-170 + t * 160) * DEG;
    return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
  });
}

const SPARKS_SWEET = sparkVectors(8, 26);
const SPARKS_GOOD = sparkVectors(3, 18);

/** Renders fixed spark vectors as fading, radiating flecks. A plain helper
 * that returns elements — never a component reference held in a variable. */
function renderSparks(vectors: { dx: number; dy: number }[], color: string) {
  return vectors.map((v, i) => (
    <motion.span
      key={i}
      aria-hidden
      className="absolute top-1/2 left-1/2 size-1 rounded-full"
      style={{ background: color }}
      initial={{ x: 0, y: 0, opacity: 1 }}
      animate={{ x: v.dx, y: v.dy, opacity: 0 }}
      transition={{ duration: durations.slow, ease: easings.exit }}
    />
  ));
}

/** Clamped linear interpolation between two output ranges. */
const lerp = (v: number, a: number, b: number, outA: number, outB: number) =>
  outA + ((v - a) / (b - a)) * (outB - outA);

/** Judges a live power reading (0-100) into a band and a scored value.
 * Overcharge is built to score below a good hit, and to keep sliding worse
 * the further past the sweet spot it lands. */
function shotFor(power: number): { result: Shot; value: number } {
  const p = Math.max(0, Math.min(100, power));
  if (p < WEAK_MAX) {
    return { result: "weak", value: Math.round(lerp(p, 0, WEAK_MAX, 0, 55)) };
  }
  if (p < GOOD_MAX) {
    return {
      result: "good",
      value: Math.round(lerp(p, WEAK_MAX, GOOD_MAX, 55, 150)),
    };
  }
  if (p <= SWEET_MAX) {
    return {
      result: "sweet",
      value: Math.round(lerp(p, GOOD_MAX, SWEET_MAX, 175, 220)),
    };
  }
  return { result: "over", value: Math.round(lerp(p, SWEET_MAX, 100, 90, 30)) };
}

export type PowerGaugeProps = {
  /** Fires once per release with the judged band and its scored value. */
  onShot?: (result: Shot, value: number) => void;
  className?: string;
};

/**
 * A hold-to-charge power gauge for the golf-and-fishing swing-meter mechanic.
 * Hold the button and the needle sweeps across a graduated, banded scale on a
 * tween; hold past full and it does not stop — it oscillates back down and up
 * again on a mirrored repeat, so the loudest temptation, maximum power, is
 * deliberately a trap that sits past the narrow sweet spot rather than at the
 * end of the dial. Release reads the needle's live motion value directly,
 * never component state, and judges it against four bands — weak, a wide
 * good band, a narrow sweet spot, and an overcharge that scores worse than a
 * plain good hit — before firing `onShot`, flashing the gauge, and springing
 * the result bar to its new value while a best marker stays pinned to the
 * session high. Reduced motion: the needle steps through fixed positions on a
 * fixed interval instead of sweeping continuously, release still reads and
 * judges the same live value, and the sweet-spot flash, ring, sparks, and
 * overcharge shake are all skipped.
 */
export function PowerGauge({
  onShot,
  className,
}: PowerGaugeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [held, setHeld] = React.useState(false);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [lastShot, setLastShot] = React.useState<{
    result: Shot;
    value: number;
  } | null>(null);
  const [best, setBest] = React.useState(0);
  const [flashOrigin, setFlashOrigin] = React.useState(0);
  const [effectKey, setEffectKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  // Needle position (0-100), the result bar's fill (0-1), and the shake
  // offset — all driven imperatively so a press/release never waits on a
  // re-render. Static initial values only: useMotionSafe() reports true
  // during SSR, so seeding from it here would desync the first paint.
  const power = useMotionValue<number>(0);
  const resultFill = useMotionValue<number>(0);
  const shakeX = useMotionValue<number>(0);

  const heldRef = React.useRef(false);
  const sweepAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const resetAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const resultAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shakeAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const resultTimer = React.useRef<number | null>(null);
  const reducedStepTimer = React.useRef<number | null>(null);
  const reducedStepIndex = React.useRef(0);
  const reducedStepDir = React.useRef(1);

  // Latest-ref mirrors, so timer chains and animation callbacks started at
  // press time never act on a stale preference or callback.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onShotRef = React.useRef(onShot);
  React.useEffect(() => {
    onShotRef.current = onShot;
  }, [onShot]);

  const clearResultTimer = () => {
    if (resultTimer.current !== null) {
      window.clearTimeout(resultTimer.current);
      resultTimer.current = null;
    }
  };
  const clearReducedStepTimer = () => {
    if (reducedStepTimer.current !== null) {
      window.clearTimeout(reducedStepTimer.current);
      reducedStepTimer.current = null;
    }
  };

  /** One ping-pong step of the reduced-motion needle. */
  const stepReducedNeedle = () => {
    const rawIdx = reducedStepIndex.current + reducedStepDir.current;
    const idx = Math.max(0, Math.min(REDUCED_POSITIONS.length - 1, rawIdx));
    if (idx === REDUCED_POSITIONS.length - 1) reducedStepDir.current = -1;
    else if (idx === 0) reducedStepDir.current = 1;
    reducedStepIndex.current = idx;
    power.jump(REDUCED_POSITIONS[idx] ?? 0);
  };

  const scheduleReducedStep = () => {
    reducedStepTimer.current = window.setTimeout(() => {
      stepReducedNeedle();
      scheduleReducedStep();
    }, REDUCED_STEP_MS);
  };

  // Unmount teardown — every timer cleared, every in-flight animation stopped.
  React.useEffect(() => {
    return () => {
      clearResultTimer();
      clearReducedStepTimer();
      sweepAnim.current?.stop();
      resetAnim.current?.stop();
      resultAnim.current?.stop();
      shakeAnim.current?.stop();
    };
  }, []);

  const pressStart = () => {
    if (heldRef.current) return;
    heldRef.current = true;
    clearResultTimer();
    sweepAnim.current?.stop();
    resetAnim.current?.stop();
    setCaption(null);
    setHeld(true);
    power.jump(0);

    if (motionSafeRef.current) {
      sweepAnim.current = animate(power, 100, {
        duration: CHARGE_SWEEP_S,
        ease: easings.move,
        repeat: Infinity,
        repeatType: "reverse",
      });
    } else {
      reducedStepIndex.current = 0;
      reducedStepDir.current = 1;
      scheduleReducedStep();
    }
  };

  const pressEnd = () => {
    if (!heldRef.current) return;
    heldRef.current = false;
    setHeld(false);
    sweepAnim.current?.stop();
    clearReducedStepTimer();

    // The judgment reads the needle's live position — never React state.
    const raw = power.get();
    const { result, value } = shotFor(raw);

    onShotRef.current?.(result, value);
    setLastShot({ result, value });
    setBest((prev) => (value > prev ? value : prev));
    setCaption(CAPTIONS[result]);
    setFlashOrigin(Math.max(0, Math.min(100, raw)));
    setEffectKey((k) => k + 1);
    setAnnounce(`${CAPTIONS[result]}. ${value}.`);

    resultAnim.current?.stop();
    const targetFill = Math.min(1, value / MAX_VALUE);
    if (motionSafeRef.current) {
      resultAnim.current = animate(resultFill, targetFill, springs.recoil);
      if (result === "over") {
        shakeAnim.current?.stop();
        shakeX.jump(0);
        shakeAnim.current = animate(shakeX, [...SHAKE_X], {
          duration: SHAKE_S,
          ease: easings.move,
          times: [...SHAKE_TIMES],
        });
      }
    } else {
      resultFill.jump(targetFill);
    }

    resultTimer.current = window.setTimeout(() => {
      resultTimer.current = null;
      setCaption(null);
      if (motionSafeRef.current) {
        resetAnim.current?.stop();
        resetAnim.current = animate(power, 0, springs.glide);
      } else {
        power.jump(0);
      }
    }, RESULT_HOLD_MS);
  };

  const needleLeft = useTransform(power, (p) => `calc(${p}% - 1.5px)`);

  const idleCaption = held ? "charging" : "hold to charge";
  const captionText = caption ?? idleCaption;
  const resultColor = lastShot ? RESULT_TONE[lastShot.result] : "var(--ink-2)";
  const bestPct = Math.min(100, (best / MAX_VALUE) * 100);

  return (
    <div
      className={cn(
        "w-72 rounded-4 border border-border bg-card p-5",
        className,
      )}
    >
      <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
        power
      </span>

      <motion.div style={{ x: shakeX }} className="relative mt-3 h-9 w-full">
        <div className="absolute inset-x-0 top-1.5 bottom-1.5 overflow-hidden rounded-2 bg-surface-2">
          {BAND_DEFS.map((b) => (
            <span
              key={b.key}
              aria-hidden
              className="absolute inset-y-0"
              style={{
                left: `${b.from}%`,
                width: `${b.to - b.from}%`,
                background: BAND_WASH[b.key],
              }}
            />
          ))}
          {TICKS.map((t) => (
            <span
              key={t}
              aria-hidden
              className="absolute inset-y-0 w-px bg-[var(--hairline-strong)]"
              style={{ left: `${t}%` }}
            />
          ))}
          {motionSafe &&
            effectKey > 0 &&
            lastShot &&
            lastShot.result !== "weak" && (
              <motion.span
                key={effectKey}
                aria-hidden
                className="absolute inset-0"
                style={{ background: RESULT_TONE[lastShot.result] }}
                initial={{ opacity: FLASH_PEAK[lastShot.result] }}
                animate={{ opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            )}
        </div>

        <motion.span
          aria-hidden
          className="absolute inset-y-0 w-[3px] rounded-full bg-[var(--ink)] shadow-[0_0_6px_-1px_var(--ink)]"
          style={{ left: needleLeft }}
        />

        {motionSafe &&
          effectKey > 0 &&
          lastShot &&
          (lastShot.result === "sweet" || lastShot.result === "good") && (
            <span
              key={effectKey}
              aria-hidden
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${flashOrigin}%` }}
            >
              {lastShot.result === "sweet" && (
                <motion.span
                  aria-hidden
                  className="absolute top-1/2 left-1/2 size-2 rounded-full border-2"
                  style={{
                    marginLeft: "-4px",
                    marginTop: "-4px",
                    borderColor: RESULT_TONE.sweet,
                  }}
                  initial={{ scale: 0.6, opacity: 0.9 }}
                  animate={{ scale: 3.2, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              )}
              {renderSparks(
                lastShot.result === "sweet" ? SPARKS_SWEET : SPARKS_GOOD,
                RESULT_TONE[lastShot.result],
              )}
            </span>
          )}
      </motion.div>

      <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-3">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>

      <button
        type="button"
        aria-label="Hold to charge"
        onPointerDown={(e) => {
          if (!e.isPrimary) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pressStart();
        }}
        onPointerUp={pressEnd}
        onPointerCancel={pressEnd}
        onKeyDown={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          e.preventDefault();
          if (e.repeat) return;
          pressStart();
        }}
        onKeyUp={(e) => {
          if (e.key !== " " && e.key !== "Enter") return;
          e.preventDefault();
          pressEnd();
        }}
        onBlur={pressEnd}
        className={cn(
          "mt-4 w-full touch-none rounded-2 bg-primary py-2 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none select-none",
          "hover:brightness-110 active:brightness-95",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
      >
        HOLD
      </button>

      <div className="mt-3 flex h-4 items-center overflow-hidden font-mono text-[10px] tracking-[0.08em] text-ink-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionText}
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
            {captionText}
          </motion.span>
        </AnimatePresence>
      </div>

      <div
        aria-hidden
        className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          className="absolute inset-y-0 left-0 origin-left rounded-full"
          style={{ scaleX: resultFill, background: resultColor }}
        />
        {best > 0 && (
          <span
            aria-hidden
            className="absolute top-[-2px] bottom-[-2px] w-px bg-[var(--ink)]"
            style={{ left: `${bestPct}%` }}
          />
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5 font-mono text-xs text-ink-3">
        <Readout value={lastShot?.value ?? 0} size="md" />
        <span>· best {best}</span>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
