"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

/** How long the shine band takes to sweep the track, left to right. */
const SHINE_S = 0.6;
/** How long the caption holds "level up" before reverting to the xp count. */
const CAPTION_FLASH_MS = 1200;
/** Beat between draining one queued click and applying the next. */
const QUEUE_STEP_MS = 180;
/** A burst fires this many fixed sparks from the badge, evenly spaced. */
const SPARK_COUNT = 6;
/** Spark travel distance from the badge center, px. */
const SPARK_SPREAD = 20;

/**
 * Six fixed spark vectors, evenly spaced from twelve o'clock — precomputed
 * so every level-up burst is identical and SSR-safe. No Math.random.
 */
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

type Phase = "idle" | "leveling-up";

type Chip = { id: number; amount: number };

export type LevelChimeProps = {
  /** XP added per button press. @default 18 */
  perClick?: number;
  /** XP required to level up. @default 100 */
  levelUpAt?: number;
  /** Level the meter opens at. @default 3 */
  startLevel?: number;
  /** Fires once, the moment each level-up sequence starts. */
  onLevelUp?: (level: number) => void;
  className?: string;
};

/**
 * An XP bar that levels up properly. It composes the house `Readout` for the
 * level number and pairs it with a fixed track: every `+XP` press adds
 * `perClick` toward the next level on `springs.glide`, pops a floating
 * "+18" chip above the button, and ticks the leading edge with a brief
 * opacity pulse. Reaching full runs a five-beat sequence — a shine sweeps
 * the track, the bar drains to zero on a tween as `Readout` rolls the new
 * level, a small badge beside it flips (two chained tweens, not a spring)
 * to reveal the new mark, six fixed sparks burst from the badge, and the
 * mono caption flashes "level up" for about 1.2s before returning to the xp
 * count. Presses landed mid-sequence queue instead of dropping, draining one
 * at a time once the sequence settles, each capable of chaining into another
 * level-up. Reduced motion: bar width, level, and badge swap instantly with
 * no shine, float, or sparks, though the caption still flashes "level up".
 */
export function LevelChime({
  perClick = 18,
  levelUpAt = 100,
  startLevel = 3,
  onLevelUp,
  className,
}: LevelChimeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [level, setLevel] = React.useState(startLevel);
  const [badgeLevel, setBadgeLevel] = React.useState(startLevel);
  const [xp, setXp] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [chips, setChips] = React.useState<Chip[]>([]);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [shineKey, setShineKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  // Motion values, driven imperatively so each animation can pick its own
  // transition (glide for gains, a tween for the post-shine drain).
  const barPct = useMotionValue("0%");
  const capOpacity = useMotionValue(0);
  const badgeScaleX = useMotionValue(1);

  // Refs are the source of truth for the click-handling state machine —
  // reading React state inside chained timers would race stale closures.
  const levelRef = React.useRef(startLevel);
  const xpRef = React.useRef(0);
  const busyRef = React.useRef(false);
  const pendingRef = React.useRef(0);
  const chipIdRef = React.useRef(0);

  // Latest-ref mirrors so timers scheduled ahead of time never act on a
  // stale prop or preference.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const perClickRef = React.useRef(perClick);
  React.useEffect(() => {
    perClickRef.current = perClick;
  }, [perClick]);
  const levelUpAtRef = React.useRef(levelUpAt);
  React.useEffect(() => {
    levelUpAtRef.current = levelUpAt;
  }, [levelUpAt]);
  const onLevelUpRef = React.useRef(onLevelUp);
  React.useEffect(() => {
    onLevelUpRef.current = onLevelUp;
  }, [onLevelUp]);

  const barAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const capAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const badgeAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const shineTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);
  const queueTimer = React.useRef<number | null>(null);
  const chipTimers = React.useRef<Set<number>>(new Set());

  const clearAllTimers = () => {
    if (shineTimer.current !== null) window.clearTimeout(shineTimer.current);
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    if (queueTimer.current !== null) window.clearTimeout(queueTimer.current);
    shineTimer.current = null;
    captionTimer.current = null;
    queueTimer.current = null;
    for (const t of chipTimers.current) window.clearTimeout(t);
    chipTimers.current.clear();
  };

  React.useEffect(() => {
    return () => {
      clearAllTimers();
      barAnim.current?.stop();
      capAnim.current?.stop();
      badgeAnim.current?.stop();
    };
  }, []);

  const setBarFill = (targetPct: number, drain?: boolean) => {
    barAnim.current?.stop();
    const target = `${targetPct}%`;
    if (!motionSafeRef.current) {
      barPct.jump(target);
      return;
    }
    barAnim.current = animate(
      barPct,
      target,
      drain ? { duration: durations.slow, ease: easings.exit } : springs.glide,
    );
  };

  const pulseCap = () => {
    if (!motionSafeRef.current) return;
    capAnim.current?.stop();
    capAnim.current = animate(capOpacity, 1, {
      duration: durations.blink,
      ease: easings.enter,
      onComplete: () => {
        capAnim.current = animate(capOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        });
      },
    });
  };

  const spawnChip = (amount: number) => {
    if (!motionSafeRef.current) return;
    const id = chipIdRef.current;
    chipIdRef.current += 1;
    setChips((prev) => [...prev, { id, amount }]);
    const timer = window.setTimeout(() => {
      chipTimers.current.delete(timer);
      setChips((prev) => prev.filter((c) => c.id !== id));
    }, 600);
    chipTimers.current.add(timer);
  };

  /** Drains one queued click at a time; releases the lock once empty. */
  const settleOrContinue = () => {
    if (pendingRef.current > 0) {
      pendingRef.current -= 1;
      queueTimer.current = window.setTimeout(() => {
        queueTimer.current = null;
        applyGain();
      }, QUEUE_STEP_MS);
    } else {
      busyRef.current = false;
    }
  };

  const beginLevelUp = () => {
    setPhase("leveling-up");
    setShineKey((k) => k + 1);

    const finishFlash = () => {
      captionTimer.current = null;
      setPhase("idle");
      settleOrContinue();
    };

    if (!motionSafeRef.current) {
      const newLevel = levelRef.current + 1;
      levelRef.current = newLevel;
      xpRef.current = 0;
      setLevel(newLevel);
      setBadgeLevel(newLevel);
      setXp(0);
      barPct.jump("0%");
      setAnnounce(`Level up. Now level ${newLevel}.`);
      onLevelUpRef.current?.(newLevel);
      captionTimer.current = window.setTimeout(finishFlash, CAPTION_FLASH_MS);
      return;
    }

    shineTimer.current = window.setTimeout(() => {
      shineTimer.current = null;
      const newLevel = levelRef.current + 1;
      levelRef.current = newLevel;
      xpRef.current = 0;
      setLevel(newLevel);
      setXp(0);
      setBarFill(0, true);
      setAnnounce(`Level up. Now level ${newLevel}.`);
      onLevelUpRef.current?.(newLevel);

      badgeAnim.current = animate(badgeScaleX, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          setBadgeLevel(newLevel);
          setSparkKey((k) => k + 1);
          badgeAnim.current = animate(badgeScaleX, 1, {
            duration: durations.base,
            ease: easings.enter,
          });
        },
      });
    }, SHINE_S * 1000);

    captionTimer.current = window.setTimeout(finishFlash, CAPTION_FLASH_MS);
  };

  const applyGain = () => {
    const amount = perClickRef.current;
    const levelUpAtNow = levelUpAtRef.current;
    spawnChip(amount);
    pulseCap();
    const nextXp = xpRef.current + amount;
    if (nextXp >= levelUpAtNow) {
      xpRef.current = levelUpAtNow;
      setXp(levelUpAtNow);
      setBarFill(100);
      beginLevelUp();
    } else {
      xpRef.current = nextXp;
      setXp(nextXp);
      setBarFill((nextXp / levelUpAtNow) * 100);
      settleOrContinue();
    }
  };

  const handleClick = () => {
    if (busyRef.current) {
      pendingRef.current += 1;
      return;
    }
    busyRef.current = true;
    applyGain();
  };

  const captionText =
    phase === "leveling-up" ? "level up" : `${xp} / ${levelUpAt} xp`;

  return (
    <div
      className={cn(
        "w-72 rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
          Level
        </span>
        <Readout value={level} size="lg" />
        <span className="relative inline-flex h-6 min-w-6 items-center justify-center">
          <motion.span
            aria-hidden
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-2 bg-primary px-1.5 font-mono text-[10px] font-bold text-primary-foreground"
            style={{ scaleX: badgeScaleX }}
          >
            {badgeLevel}
          </motion.span>
          {motionSafe && sparkKey > 0 && (
            <span
              key={sparkKey}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              {SPARKS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute size-[3px] rounded-full bg-signal"
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Experience"
        aria-valuenow={xp}
        aria-valuemin={0}
        aria-valuemax={levelUpAt}
        className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-surface-2"
      >
        <motion.span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          style={{ width: barPct }}
        />
        <motion.span
          aria-hidden
          className="absolute top-1/2 -mt-[5px] size-2.5 -translate-y-1/2 rounded-full bg-primary-foreground shadow-[0_0_6px_1px_var(--primary)]"
          style={{ left: barPct, marginLeft: -5, opacity: capOpacity }}
        />
        {motionSafe && shineKey > 0 && (
          <motion.span
            key={shineKey}
            aria-hidden
            className="absolute inset-y-0 w-1/4 bg-primary-foreground/25"
            style={{ skewX: -14 }}
            initial={{ x: "-160%" }}
            animate={{ x: "420%" }}
            transition={{ duration: SHINE_S, ease: easings.linear }}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3 tabular-nums"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={phase === "leveling-up" ? "levelup" : "xp"}
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
        </span>

        <span className="relative inline-flex">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2"
          >
            <AnimatePresence>
              {chips.map((chip) => (
                <motion.span
                  key={chip.id}
                  className="absolute right-0 bottom-0 left-0 text-center font-mono text-xs font-semibold text-success"
                  initial={{ opacity: 0, y: 0, scale: 0.7 }}
                  animate={{ opacity: [0, 1, 0], y: -24, scale: 1 }}
                  transition={{
                    y: springs.glide,
                    scale: springs.flick,
                    opacity: { duration: durations.slow, ease: easings.exit },
                  }}
                >
                  +{chip.amount}
                </motion.span>
              ))}
            </AnimatePresence>
          </span>

          <motion.button
            type="button"
            aria-label="Gain experience"
            onClick={handleClick}
            whileTap={motionSafe ? { scale: 0.94 } : undefined}
            transition={springs.flick}
            className={cn(
              "rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            +XP
          </motion.button>
        </span>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
