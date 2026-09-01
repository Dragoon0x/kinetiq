"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

/** Combo counts at which the multiplier steps up: x1 -> x2 -> x3 -> x4. */
const DEFAULT_THRESHOLDS = [5, 12, 25] as const;

/** Full-to-empty decay time in seconds, indexed by multiplier - 1 — the
 * ladder tightens as the multiplier climbs so the pressure keeps rising. */
const DECAY_S_BY_MULT = [2.6, 2.0, 1.5, 1.1] as const;

/** Panel warmth as a color-mix percentage against the base card/border,
 * indexed by multiplier - 1. Motion cannot interpolate color-mix, so the
 * step is driven by a CSS transition instead of a motion value. */
const WARM_PCT_BY_MULT = [0, 20, 38, 56] as const;

/** Reduced motion steps the decay bar down in fixed increments on the same
 * interval instead of animating it continuously. */
const REDUCED_DECAY_STEPS = 8;

/** How far the number overshoots on a hit before `recoil` settles it. */
const POP_PEAK = 1.22;
/** How far the number blows up as it fades out on a break. */
const SHATTER_SCALE = 1.5;

/** How long the "x3!" threshold caption holds before clearing. */
const CAPTION_FLASH_MS = 1100;
/** How long "combo lost." holds before clearing. */
const BREAK_CAPTION_MS = 1300;

const FLECK_COUNT = 4;
const FLECK_SPREAD = 20;
/** Four fixed fleck vectors thrown at the number on every hit, evenly spaced
 * from twelve o'clock — precomputed so every burst is identical and
 * SSR-safe. No Math.random. */
const HIT_FLECKS = Array.from({ length: FLECK_COUNT }, (_, i) => {
  const angle = (i / FLECK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * FLECK_SPREAD,
    dy: Math.sin(angle) * FLECK_SPREAD,
  };
});

const FLECK_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 80%, var(--primary-foreground))";
const RING_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 62%, transparent)";

/** How many thresholds `combo` has cleared, counting up from x1. */
const multiplierFor = (combo: number, thresholds: number[]): number => {
  let mult = 1;
  for (const t of thresholds) {
    if (combo >= t) mult += 1;
  }
  return mult;
};

const decaySFor = (mult: number): number =>
  DECAY_S_BY_MULT[mult - 1] ??
  DECAY_S_BY_MULT[DECAY_S_BY_MULT.length - 1] ??
  2.6;

const warmPctFor = (mult: number): number =>
  WARM_PCT_BY_MULT[mult - 1] ??
  WARM_PCT_BY_MULT[WARM_PCT_BY_MULT.length - 1] ??
  0;

export type ComboMeterProps = {
  /** Combo counts at which the multiplier steps up. @default [5, 12, 25] */
  thresholds?: number[];
  /** Fires with the combo that was lost, the moment the decay bar empties. */
  onBreak?: (combo: number) => void;
  className?: string;
};

/**
 * A combo counter built to be lost. Every "Land a hit" press rolls the count
 * up through a composed `Readout`, snaps the decay bar back to full on a
 * `flick` spring — the refill is the relief — and pops the number with a
 * quick `recoil` overshoot while four fixed flecks throw off it. Crossing a
 * threshold (5/12/25 by default) flips the multiplier badge through two
 * chained tweens, rings a pulse past it, warms the panel a color-mix step via
 * CSS transition, and flashes a mono "x3!" caption. Left alone, the bar
 * drains on a fixed interval that tightens at each multiplier tier; when it
 * empties the combo breaks — the number blows up and fades, the badge drops
 * back to x1, the panel cools, "combo lost." holds for a beat, and `onBreak`
 * fires with the count that was lost, while a quiet "best" line keeps the
 * session high. Reduced motion: no pops, bursts, or shatter — the number and
 * badge swap instantly, the decay bar steps down in fixed increments on the
 * same interval instead of animating continuously, and a break is a state
 * swap with the caption.
 */
export function ComboMeter({
  thresholds = [...DEFAULT_THRESHOLDS],
  onBreak,
  className,
}: ComboMeterProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [combo, setCombo] = React.useState(0);
  const [best, setBest] = React.useState(0);
  const [badgeMultiplier, setBadgeMultiplier] = React.useState(1);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [burstKey, setBurstKey] = React.useState(0);
  const [ringKey, setRingKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const multiplier = multiplierFor(combo, thresholds);

  // Refs are the source of truth for the hit/break handlers — reading React
  // state inside a rapid-click chain or a timer fired later would race a
  // stale closure.
  const comboRef = React.useRef(0);
  const bestRef = React.useRef(0);

  // Latest-ref mirrors, so timers and animation callbacks scheduled ahead of
  // time never act on a stale preference or callback.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onBreakRef = React.useRef(onBreak);
  React.useEffect(() => {
    onBreakRef.current = onBreak;
  }, [onBreak]);

  // Motion values, driven imperatively so each phase — refill, drain, pop,
  // shatter, badge flip — can pick its own transition without re-rendering.
  const decayValue = useMotionValue<number>(0);
  const numberScale = useMotionValue<number>(1);
  const numberOpacity = useMotionValue<number>(1);
  const badgeScaleX = useMotionValue<number>(1);

  const refillAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const drainAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const numberScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const numberOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const badgeAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const captionTimer = React.useRef<number | null>(null);
  const reducedDecayTimer = React.useRef<number | null>(null);

  // Unmount teardown — every timer cleared, every in-flight animation stopped.
  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      if (reducedDecayTimer.current !== null)
        window.clearTimeout(reducedDecayTimer.current);
      refillAnim.current?.stop();
      drainAnim.current?.stop();
      numberScaleAnim.current?.stop();
      numberOpacityAnim.current?.stop();
      badgeAnim.current?.stop();
    };
  }, []);

  const flashCaption = (text: string, ms: number) => {
    setCaption(text);
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setCaption(null);
    }, ms);
  };

  /** The bar hit empty: shatter the number, drop the badge, cool the panel. */
  const handleBreak = () => {
    const lostCombo = comboRef.current;
    if (lostCombo <= 0) return;
    comboRef.current = 0;

    onBreakRef.current?.(lostCombo);
    setAnnounce(`Combo broken at ${lostCombo}.`);
    flashCaption("combo lost.", BREAK_CAPTION_MS);

    badgeAnim.current?.stop();
    badgeScaleX.jump(1);
    setBadgeMultiplier(1);

    if (motionSafeRef.current) {
      numberScaleAnim.current?.stop();
      numberOpacityAnim.current?.stop();
      numberScaleAnim.current = animate(numberScale, SHATTER_SCALE, {
        duration: durations.slow,
        ease: easings.exit,
      });
      numberOpacityAnim.current = animate(numberOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
        onComplete: () => {
          numberScale.jump(1);
          numberOpacity.jump(1);
          setCombo(0);
        },
      });
    } else {
      setCombo(0);
    }
  };

  /** Kicks off (or restarts) the countdown drain at the current multiplier. */
  const startDrain = (mult: number) => {
    drainAnim.current?.stop();
    drainAnim.current = animate(decayValue, 0, {
      duration: decaySFor(mult),
      ease: easings.linear,
      onComplete: handleBreak,
    });
  };

  /** Reduced-motion decay: step the bar down a fixed fraction at a time. */
  const scheduleReducedDecayStep = (mult: number) => {
    const stepMs = (decaySFor(mult) / REDUCED_DECAY_STEPS) * 1000;
    reducedDecayTimer.current = window.setTimeout(() => {
      reducedDecayTimer.current = null;
      const next = Math.max(0, decayValue.get() - 1 / REDUCED_DECAY_STEPS);
      decayValue.jump(next);
      if (next <= 0) {
        handleBreak();
      } else {
        scheduleReducedDecayStep(mult);
      }
    }, stepMs);
  };

  /** Badge flip: shrink on the old mark, swap it, pulse a ring, grow back. */
  const triggerThresholdCross = (mult: number) => {
    flashCaption(`x${mult}!`, CAPTION_FLASH_MS);
    badgeAnim.current?.stop();
    badgeAnim.current = animate(badgeScaleX, 0, {
      duration: durations.fast,
      ease: easings.exit,
      onComplete: () => {
        setBadgeMultiplier(mult);
        setRingKey((k) => k + 1);
        badgeAnim.current = animate(badgeScaleX, 1, {
          duration: durations.base,
          ease: easings.enter,
        });
      },
    });
  };

  const handleHit = () => {
    const nextCombo = comboRef.current + 1;
    comboRef.current = nextCombo;
    setCombo(nextCombo);

    if (nextCombo > bestRef.current) {
      bestRef.current = nextCombo;
      setBest(nextCombo);
    }

    const prevMultiplier = multiplierFor(nextCombo - 1, thresholds);
    const nextMultiplier = multiplierFor(nextCombo, thresholds);

    // A fresh hit always wins over whatever was mid-flight — including a
    // break's shatter — so that fade's delayed reset can never land after
    // this new combo and stomp it back to zero.
    refillAnim.current?.stop();
    drainAnim.current?.stop();
    numberScaleAnim.current?.stop();
    numberOpacityAnim.current?.stop();
    numberOpacity.jump(1);
    if (reducedDecayTimer.current !== null) {
      window.clearTimeout(reducedDecayTimer.current);
      reducedDecayTimer.current = null;
    }

    if (motionSafeRef.current) {
      numberScale.set(POP_PEAK);
      numberScaleAnim.current = animate(numberScale, 1, springs.recoil);
      setBurstKey((k) => k + 1);

      refillAnim.current = animate(decayValue, 1, {
        ...springs.flick,
        onComplete: () => startDrain(nextMultiplier),
      });

      if (nextMultiplier > prevMultiplier)
        triggerThresholdCross(nextMultiplier);
    } else {
      numberScale.jump(1);
      decayValue.jump(1);
      scheduleReducedDecayStep(nextMultiplier);

      if (nextMultiplier > prevMultiplier) {
        setBadgeMultiplier(nextMultiplier);
        flashCaption(`x${nextMultiplier}!`, CAPTION_FLASH_MS);
      }
    }

    setAnnounce(`Hit. Combo ${nextCombo}. Multiplier x${nextMultiplier}.`);
  };

  const warmPct = warmPctFor(multiplier);
  const panelStyle: React.CSSProperties = {
    borderColor: `color-mix(in oklab, var(--warning, #b45309) ${warmPct}%, var(--border))`,
    backgroundColor: `color-mix(in oklab, var(--warning, #b45309) ${Math.round(warmPct / 3)}%, var(--card))`,
  };

  return (
    <div
      className={cn(
        "w-64 rounded-4 border p-5 transition-colors duration-300",
        className,
      )}
      style={panelStyle}
    >
      <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
        combo
      </span>

      <div className="mt-1 flex items-center gap-2">
        <span className="relative inline-flex items-baseline gap-1">
          <span
            aria-hidden
            className="font-mono text-xl font-semibold text-ink-2"
          >
            x
          </span>
          <motion.span
            className="relative inline-flex"
            style={{ scale: numberScale, opacity: numberOpacity }}
          >
            <Readout value={combo} size="xl" />
            {motionSafe && burstKey > 0 && (
              <span
                key={burstKey}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                {HIT_FLECKS.map((f, i) => (
                  <motion.span
                    key={i}
                    className="absolute size-[3px] rounded-full"
                    style={{ background: FLECK_COLOR }}
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ x: f.dx, y: f.dy, opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  />
                ))}
              </span>
            )}
          </motion.span>
        </span>

        <span className="relative ml-auto inline-flex h-6 min-w-6 items-center justify-center">
          <motion.span
            aria-hidden
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-2 bg-primary px-1.5 font-mono text-[10px] font-bold text-primary-foreground"
            style={{ scaleX: badgeScaleX }}
          >
            x{badgeMultiplier}
          </motion.span>
          {motionSafe && ringKey > 0 && (
            <motion.span
              key={ringKey}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border-2"
              style={{ borderColor: RING_COLOR }}
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}
        </span>
      </div>

      <div
        aria-hidden
        className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          className="absolute inset-y-0 left-0 origin-left rounded-full bg-primary"
          style={{ scaleX: decayValue }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={caption ?? "idle"}
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
              {caption ?? ""}
            </motion.span>
          </AnimatePresence>
        </span>

        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          best {best}
        </span>
      </div>

      <button
        type="button"
        aria-label="Land a hit"
        onClick={handleHit}
        className={cn(
          "mt-3 w-full rounded-2 bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
          "hover:brightness-110 active:brightness-95",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
      >
        HIT
      </button>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
