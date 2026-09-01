"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

const BOSS_NAME = "THE DREDGE";
const BOSS_TITLE = "tidewater colossus";

/** Phase thresholds, in percent of max health remaining. */
const DEFAULT_PHASES = [75, 50, 25] as const;

/** Roman numerals for phase numbers — guarded for a custom `phases` array
 * longer than this table; falls back to a plain digit past X. */
const ROMAN_NUMERALS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
] as const;
const romanFor = (n: number): string => ROMAN_NUMERALS[n - 1] ?? String(n);

/** Flavor line for each phase past the first, indexed by (phase - 2).
 * Guarded — a longer `phases` array just repeats the escalation line. */
const PHASE_FLAVOR = [
  "it opens the gates",
  "the tide turns violent",
  "the deep answers",
] as const;
const FALLBACK_FLAVOR = "the fight escalates";
const flavorFor = (phase: number): string =>
  PHASE_FLAVOR[phase - 2] ?? FALLBACK_FLAVOR;

/** How many thresholds `percent` has crossed, counting up from phase 1. */
const phaseForPercent = (percent: number, sorted: number[]): number =>
  1 + sorted.filter((t) => percent <= t).length;

/** Fill warmth as a color-mix percentage toward `--warning`, indexed by
 * phase - 1. Motion cannot interpolate color-mix, so the step runs on a
 * CSS transition instead of a motion value. Guarded past the table. */
const TINT_PCT_BY_PHASE = [0, 26, 55, 82, 100] as const;
const tintPctFor = (phase: number): number =>
  TINT_PCT_BY_PHASE[phase - 1] ??
  TINT_PCT_BY_PHASE[TINT_PCT_BY_PHASE.length - 1] ??
  100;
const fillColorForPhase = (phase: number): string =>
  `color-mix(in oklab, var(--warning, #b45309) ${tintPctFor(phase)}%, var(--ink-2))`;

const GHOST_COLOR = "color-mix(in oklab, var(--ink) 55%, transparent)";

/** Segment-band shading, indexed by band position — later bands (lower
 * health) shade darker. Guarded past the table. */
const BAND_TINT_PCT = [3, 9, 16, 25, 36] as const;
const bandTintFor = (i: number): number =>
  BAND_TINT_PCT[i] ?? BAND_TINT_PCT[BAND_TINT_PCT.length - 1] ?? 36;

type Band = { start: number; end: number };
const bandsFor = (sorted: number[]): Band[] => {
  const edges = [100, ...sorted, 0];
  const out: Band[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    out.push({ start: edges[i] ?? 0, end: edges[i + 1] ?? 0 });
  }
  return out;
};

/** Three-keyframe shudder on every non-lethal hit — a tween, never a
 * spring. */
const SHUDDER_X = [0, -4, 0] as const;
const SHUDDER_TIMES = [0, 0.5, 1] as const;
const SHUDDER_S = 0.22;

/** Chip-damage ghost: holds at the old edge for a beat, then drains on an
 * authored tween. */
const GHOST_LINGER_S = 0.35;
const GHOST_DRAIN_S = durations.slow;

const DAMAGE_FLOAT_S = 0.65;
const DAMAGE_LIFETIME_MS = 750;

const PAUSE_MS = 400;
const STAMP_HOLD_MS = 900;
const CAPTION_HOLD_MS = 1700;
const FLASH_S = 0.55;

const SPARK_COUNT = 8;
const SPARK_SPREAD = 22;
/** Eight fixed vectors thrown radially from the crossed marker. No
 * Math.random — every burst throws identically. */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

const SHARD_COUNT = 6;
const SHARD_SPREAD = 34;
/** Six fixed shard vectors the bar breaks into at defeat. */
const SHARDS = Array.from({ length: SHARD_COUNT }, (_, i) => {
  const angle = (i / SHARD_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SHARD_SPREAD,
    dy: Math.sin(angle) * SHARD_SPREAD * 0.7 - 6,
    rotate: (i % 2 === 0 ? 1 : -1) * (35 + i * 10),
  };
});

/** Label row + bar geometry, px — kept in sync with the h-3 / h-8 classes
 * below so the overlay layer (sparks, shards, stamp, damage numbers) can
 * anchor to the bar's true center without being clipped by its own
 * overflow-hidden. */
const LABEL_ROW_H = 12;
const BAR_H = 32;
const BAR_CENTER_Y = LABEL_ROW_H + BAR_H / 2;

type DamageNumber = { key: number; amount: number; atPercent: number };

export type BossMeterProps = {
  /** Boss max health. @default 1000 */
  max?: number;
  /** Fixed damage per STRIKE. @default 85 */
  hit?: number;
  /** Phase thresholds, in percent of health remaining. @default [75, 50, 25] */
  phases?: number[];
  /** Fires the moment a new phase is reached, once its pause beat ends. */
  onPhase?: (phase: number) => void;
  /** Fires once, the instant health reaches zero. */
  onDefeat?: () => void;
  className?: string;
};

/**
 * A wide boss bar built around its phase thresholds, because a boss fight
 * only reads as a fight if its escalations land. STRIKE deals a fixed
 * amount: the fill drops on `flick`, a chip-damage ghost lingers at the old
 * edge and drains on an authored tween a beat later, a damage number floats
 * off the impact point, and the bar takes a quick three-keyframe shudder.
 * Crossing a phase marker (75/50/25 by default) is its own event: everything
 * freezes for a beat — the device that keeps a long fight legible, so an
 * escalation is never lost in the noise of ordinary hits — before a
 * full-width flash sweeps the bar, the new phase numeral stamps in on
 * `flick` and fades, the fill steps one shade warmer via a CSS color-mix
 * transition, a mono caption names the phase, and eight sparks fire from the
 * crossed marker. The last phase adds a slow sustained pulse and an
 * "enraged" caption; hitting zero shatters the bar into six fixed shards,
 * desaturates the header, holds a defeat caption, and swaps STRIKE for an
 * AGAIN button that springs the fill back up from empty.
 * Reduced motion: no shudder, sweeps, sparks, or shatter — the fill snaps,
 * phase transitions are an instant tint + stamp shown for a beat, and
 * defeat is a static state.
 */
export function BossMeter({
  max = 1000,
  hit = 85,
  phases = [...DEFAULT_PHASES],
  onPhase,
  onDefeat,
  className,
}: BossMeterProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const sortedPhases = React.useMemo(
    () => [...phases].map((t) => clamp(t, 0, 100)).sort((a, b) => b - a),
    [phases],
  );

  const [health, setHealth] = React.useState(max);
  const [phase, setPhase] = React.useState(1);
  const [isPaused, setIsPaused] = React.useState(false);
  const [defeated, setDefeated] = React.useState(false);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [stampLabel, setStampLabel] = React.useState<string | null>(null);
  const [flashKey, setFlashKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [sparkAt, setSparkAt] = React.useState(50);
  const [shatterKey, setShatterKey] = React.useState(0);
  const [damageNumbers, setDamageNumbers] = React.useState<DamageNumber[]>([]);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth for the strike handler — reading React
  // state on a rapid click chain would race a stale closure.
  const healthRef = React.useRef(max);
  const defeatedRef = React.useRef(false);
  const isPausedRef = React.useRef(false);

  // Latest-ref mirrors, so timers scheduled ahead of time never act on a
  // stale prop or preference.
  const maxRef = React.useRef(max);
  React.useEffect(() => {
    maxRef.current = max;
  }, [max]);
  const hitRef = React.useRef(hit);
  React.useEffect(() => {
    hitRef.current = hit;
  }, [hit]);
  const sortedPhasesRef = React.useRef(sortedPhases);
  React.useEffect(() => {
    sortedPhasesRef.current = sortedPhases;
  }, [sortedPhases]);
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onPhaseRef = React.useRef(onPhase);
  React.useEffect(() => {
    onPhaseRef.current = onPhase;
  }, [onPhase]);
  const onDefeatRef = React.useRef(onDefeat);
  React.useEffect(() => {
    onDefeatRef.current = onDefeat;
  }, [onDefeat]);

  const damageKeyRef = React.useRef(0);
  const damageTimersRef = React.useRef<number[]>([]);
  const pauseTimer = React.useRef<number | null>(null);
  const stampTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);
  const flashKeyRef = React.useRef(0);
  const sparkKeyRef = React.useRef(0);
  const shatterKeyRef = React.useRef(0);

  const fillValue = useMotionValue<number>(100);
  const ghostValue = useMotionValue<number>(100);
  const shudderX = useMotionValue<number>(0);

  const fillAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const ghostAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const shudderAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const fillWidth = useTransform(fillValue, (v) => `${v}%`);
  const ghostWidth = useTransform(ghostValue, (v) => `${v}%`);

  React.useEffect(() => {
    const damageTimers = damageTimersRef.current;
    return () => {
      if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
      if (stampTimer.current !== null) window.clearTimeout(stampTimer.current);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      damageTimers.forEach((id) => window.clearTimeout(id));
      fillAnim.current?.stop();
      ghostAnim.current?.stop();
      shudderAnim.current?.stop();
    };
  }, []);

  const triggerDefeat = () => {
    if (pauseTimer.current !== null) {
      window.clearTimeout(pauseTimer.current);
      pauseTimer.current = null;
    }
    if (stampTimer.current !== null) {
      window.clearTimeout(stampTimer.current);
      stampTimer.current = null;
    }
    if (captionTimer.current !== null) {
      window.clearTimeout(captionTimer.current);
      captionTimer.current = null;
    }

    defeatedRef.current = true;
    setDefeated(true);
    isPausedRef.current = false;
    setIsPaused(false);
    setStampLabel(null);
    setCaption("the dredge is down");
    setAnnounce("The dredge is down.");
    onDefeatRef.current?.();

    if (motionSafeRef.current) {
      const key = shatterKeyRef.current + 1;
      shatterKeyRef.current = key;
      setShatterKey(key);
    }
  };

  const triggerPhaseTransition = (nextPhase: number) => {
    isPausedRef.current = true;
    setIsPaused(true);

    if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current);
    pauseTimer.current = window.setTimeout(() => {
      pauseTimer.current = null;

      setPhase(nextPhase);
      isPausedRef.current = false;
      setIsPaused(false);
      onPhaseRef.current?.(nextPhase);

      const roman = romanFor(nextPhase);
      setStampLabel(roman);
      if (stampTimer.current !== null) window.clearTimeout(stampTimer.current);
      stampTimer.current = window.setTimeout(() => {
        stampTimer.current = null;
        setStampLabel(null);
      }, STAMP_HOLD_MS);

      const captionText = `PHASE ${roman} · ${flavorFor(nextPhase)}`;
      setCaption(captionText);
      setAnnounce(`${captionText}.`);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      captionTimer.current = window.setTimeout(() => {
        captionTimer.current = null;
        const lastPhase = sortedPhasesRef.current.length + 1;
        setCaption(nextPhase === lastPhase && lastPhase > 1 ? "enraged" : null);
      }, CAPTION_HOLD_MS);

      if (motionSafeRef.current) {
        const at = sortedPhasesRef.current[nextPhase - 2] ?? 50;
        setSparkAt(at);

        const flashKeyNow = flashKeyRef.current + 1;
        flashKeyRef.current = flashKeyNow;
        setFlashKey(flashKeyNow);

        const sparkKeyNow = sparkKeyRef.current + 1;
        sparkKeyRef.current = sparkKeyNow;
        setSparkKey(sparkKeyNow);
      }
    }, PAUSE_MS);
  };

  const handleStrike = () => {
    if (defeatedRef.current || isPausedRef.current) return;

    const prevHealth = healthRef.current;
    const prevPercent = (prevHealth / maxRef.current) * 100;
    const nextHealth = Math.max(0, prevHealth - hitRef.current);
    const nextPercent = (nextHealth / maxRef.current) * 100;
    healthRef.current = nextHealth;
    setHealth(nextHealth);

    const prevPhase = phaseForPercent(prevPercent, sortedPhasesRef.current);
    const nextPhase = phaseForPercent(nextPercent, sortedPhasesRef.current);

    const dmgKey = damageKeyRef.current + 1;
    damageKeyRef.current = dmgKey;
    const atPercent = clamp(prevPercent, 8, 92);
    setDamageNumbers((list) => [
      ...list,
      { key: dmgKey, amount: hitRef.current, atPercent },
    ]);
    const timerId = window.setTimeout(() => {
      setDamageNumbers((list) => list.filter((d) => d.key !== dmgKey));
      const idx = damageTimersRef.current.indexOf(timerId);
      if (idx !== -1) damageTimersRef.current.splice(idx, 1);
    }, DAMAGE_LIFETIME_MS);
    damageTimersRef.current.push(timerId);

    fillAnim.current?.stop();
    ghostAnim.current?.stop();
    if (motionSafeRef.current) {
      fillAnim.current = animate(fillValue, nextPercent, springs.flick);
      ghostValue.jump(prevPercent);
      ghostAnim.current = animate(ghostValue, nextPercent, {
        duration: GHOST_DRAIN_S,
        ease: easings.move,
        delay: GHOST_LINGER_S,
      });
    } else {
      fillValue.jump(nextPercent);
      ghostValue.jump(nextPercent);
    }

    if (motionSafeRef.current && nextHealth > 0) {
      shudderAnim.current?.stop();
      shudderX.set(0);
      shudderAnim.current = animate(shudderX, [...SHUDDER_X], {
        duration: SHUDDER_S,
        ease: easings.move,
        times: [...SHUDDER_TIMES],
      });
    }

    setAnnounce(
      `Struck for ${hitRef.current}. ${nextHealth} of ${maxRef.current} health remaining.`,
    );

    if (nextHealth <= 0) {
      triggerDefeat();
      return;
    }

    if (nextPhase > prevPhase) {
      triggerPhaseTransition(nextPhase);
    }
  };

  const handleReset = () => {
    if (pauseTimer.current !== null) {
      window.clearTimeout(pauseTimer.current);
      pauseTimer.current = null;
    }
    if (stampTimer.current !== null) {
      window.clearTimeout(stampTimer.current);
      stampTimer.current = null;
    }
    if (captionTimer.current !== null) {
      window.clearTimeout(captionTimer.current);
      captionTimer.current = null;
    }
    damageTimersRef.current.forEach((id) => window.clearTimeout(id));
    damageTimersRef.current.length = 0;
    setDamageNumbers([]);

    healthRef.current = maxRef.current;
    setHealth(maxRef.current);
    setPhase(1);
    defeatedRef.current = false;
    setDefeated(false);
    isPausedRef.current = false;
    setIsPaused(false);
    setStampLabel(null);
    setCaption(null);
    setAnnounce("The dredge rises again, at full health.");

    fillAnim.current?.stop();
    ghostAnim.current?.stop();
    shudderAnim.current?.stop();
    fillValue.jump(0);
    ghostValue.jump(0);
    shudderX.jump(0);

    if (motionSafeRef.current) {
      fillAnim.current = animate(fillValue, 100, springs.glide);
      ghostAnim.current = animate(ghostValue, 100, springs.glide);
    } else {
      fillValue.jump(100);
      ghostValue.jump(100);
    }
  };

  const lastPhase = sortedPhases.length + 1;
  const isEnraged = sortedPhases.length > 0 && phase === lastPhase && !defeated;
  const bands = bandsFor(sortedPhases);
  const fillTint = fillColorForPhase(phase);

  const enrageAnimate =
    motionSafe && isEnraged
      ? {
          opacity: [1, 0.85, 1],
          transition: {
            duration: durations.page,
            ease: easings.move,
            times: [0, 0.5, 1],
            repeat: Infinity,
          },
        }
      : { opacity: 1 };

  return (
    <div
      role="group"
      aria-label={`${BOSS_NAME} boss meter`}
      className={cn("w-full max-w-2xl", className)}
    >
      <div
        style={{
          filter: defeated ? "grayscale(1) brightness(0.85)" : "none",
          transition: "filter 500ms ease",
        }}
      >
        <h2 className="font-mono text-2xl font-bold tracking-wide text-ink uppercase">
          {BOSS_NAME}
        </h2>
        <p className="font-mono text-xs text-ink-3">{BOSS_TITLE}</p>
      </div>

      <div className="relative mt-4 w-full">
        <div aria-hidden className="relative" style={{ height: LABEL_ROW_H }}>
          {sortedPhases.map((threshold, i) => (
            <span
              key={threshold}
              className="absolute bottom-0 font-mono text-[9px] font-medium tracking-wide text-ink-3"
              style={{ left: `${threshold}%`, marginLeft: -6 }}
            >
              {romanFor(i + 2)}
            </span>
          ))}
        </div>

        <motion.div
          aria-hidden
          className="relative w-full overflow-hidden rounded-2 border border-hairline bg-surface-2"
          style={{ height: BAR_H, x: shudderX }}
          animate={enrageAnimate}
        >
          {bands.map((band, i) => (
            <span
              key={i}
              className="absolute inset-y-0"
              style={{
                left: `${band.end}%`,
                width: `${band.start - band.end}%`,
                background: `color-mix(in oklab, var(--ink-3) ${bandTintFor(i)}%, transparent)`,
              }}
            />
          ))}

          <motion.span
            className="absolute inset-y-0 left-0"
            style={{ width: ghostWidth, background: GHOST_COLOR }}
          />

          <motion.span
            className="absolute inset-y-0 left-0 transition-colors duration-300"
            style={{ width: fillWidth, backgroundColor: fillTint }}
          />

          {sortedPhases.map((threshold) => (
            <span
              key={threshold}
              className="absolute inset-y-0 w-px bg-ink-3/60"
              style={{ left: `${threshold}%` }}
            />
          ))}

          {motionSafe && flashKey > 0 && (
            <motion.span
              key={flashKey}
              className="pointer-events-none absolute inset-y-0 w-1/4"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary-foreground) 70%, transparent), transparent)",
              }}
              initial={{ left: "-30%" }}
              animate={{ left: "110%" }}
              transition={{ duration: FLASH_S, ease: easings.move }}
            />
          )}
        </motion.div>

        <div aria-hidden className="pointer-events-none absolute inset-0">
          <AnimatePresence>
            {stampLabel && (
              <motion.div
                key={stampLabel}
                className="absolute inset-x-0 flex items-center justify-center"
                style={{ top: LABEL_ROW_H, height: BAR_H }}
                initial={motionSafe ? { opacity: 0, scale: 0.5 } : false}
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  motionSafe
                    ? {
                        opacity: 0,
                        transition: {
                          duration: durations.slow,
                          ease: easings.exit,
                        },
                      }
                    : { opacity: 0, transition: { duration: 0 } }
                }
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                <span className="font-mono text-3xl font-black text-ink drop-shadow-sm">
                  {stampLabel}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {motionSafe && sparkKey > 0 && (
            <span
              key={sparkKey}
              style={{ left: `${sparkAt}%`, top: BAR_CENTER_Y }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
            >
              {SPARKS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute size-[3px] rounded-full"
                  style={{ background: "var(--warning, #b45309)" }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}

          {motionSafe && shatterKey > 0 && (
            <span
              key={shatterKey}
              style={{ left: "50%", top: BAR_CENTER_Y }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
            >
              {SHARDS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute h-1.5 w-3 rounded-[1px]"
                  style={{ background: fillColorForPhase(lastPhase) }}
                  initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                  animate={{ x: s.dx, y: s.dy, rotate: s.rotate, opacity: 0 }}
                  transition={{ duration: durations.page, ease: easings.exit }}
                />
              ))}
            </span>
          )}

          {damageNumbers.map((d) => (
            <span
              key={d.key}
              className="absolute"
              style={{
                left: `${d.atPercent}%`,
                top: BAR_CENTER_Y,
                marginLeft: -14,
              }}
            >
              <motion.span
                className="font-mono text-xs font-bold"
                style={{ color: "var(--warning, #b45309)" }}
                initial={motionSafe ? { y: 0, opacity: 1 } : { opacity: 1 }}
                animate={motionSafe ? { y: -26, opacity: 0 } : { opacity: 0 }}
                transition={{
                  duration: motionSafe ? DAMAGE_FLOAT_S : durations.fast,
                  ease: easings.exit,
                }}
              >
                -{d.amount}
              </motion.span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-2"
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

        <span className="flex items-baseline gap-1.5 font-mono text-[11px] text-ink-3 tabular-nums">
          <Readout value={health} size="sm" />
          <span aria-hidden>
            / {max} · phase {romanFor(phase)}
          </span>
        </span>
      </div>

      {!defeated ? (
        <button
          type="button"
          aria-label="Strike the boss"
          onClick={handleStrike}
          disabled={isPaused}
          className={cn(
            "mt-3 w-full rounded-2 bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Strike
        </button>
      ) : (
        <button
          type="button"
          onClick={handleReset}
          className={cn(
            "mt-3 w-full rounded-2 bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Again
        </button>
      )}

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
