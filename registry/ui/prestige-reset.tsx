"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { Star } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

type StatId = "power" | "reach" | "yield";

type StatDef = { id: StatId; label: string; start: number; max: number };

/** Fixed trio — the level-1 baseline each stat refills to (`start`) and the
 * maxed value shown before any prestige (`max`). Never reordered. */
const STAT_DEFS: readonly StatDef[] = [
  { id: "power", label: "power", start: 12, max: 480 },
  { id: "reach", label: "reach", start: 8, max: 310 },
  { id: "yield", label: "yield", start: 4, max: 145 },
];

type StatRowState = {
  id: StatId;
  label: string;
  value: number;
  target: number;
};

const initialStatRows = (): StatRowState[] =>
  STAT_DEFS.map((d) => ({
    id: d.id,
    label: d.label,
    value: d.max,
    target: d.max,
  }));

/** Flat bonus each held star adds to a stat's starting value on refill. */
const STAR_BONUS = 0.05;

/** Drain — rows start one after another and each settles on its own. */
const ROW_DRAIN_STAGGER_MS = 220;
const ROW_SETTLE_MS = 480;

/** The hushed beat between the drained panel and the new star — deliberately
 * the longest hold in the sequence. */
const PAUSE_MS = 650;

/** Beat left for the ignite's ring and sparks to read before refill starts. */
const IGNITE_BEAT_MS = 300;

/** Level countdown — a fixed time budget spread across however many ticks
 * the current level has to lose, clamped to a sane minimum tick. */
const LEVEL_COUNTDOWN_BUDGET_MS = 750;
const MIN_TICK_MS = 12;
const LEVEL_SHRINK_SCALE = 0.88;

/** Star pop nudge on the stars already held, thrown the instant a new one
 * ignites — three keyframes, so a tween, never a spring. */
const STAR_NUDGE_KEYFRAMES = [0, -3, 2, 0] as const;
const STAR_NUDGE_TIMES = [0, 0.35, 0.7, 1] as const;
const STAR_NUDGE_S = 0.28;
const STAR_NUDGE_MS = Math.round(STAR_NUDGE_S * 1000);

const STAR_SIZE = 20;
const STAR_RING_PEAK = 2.4;

/** Ten fixed spark vectors thrown from the newly lit star. No Math.random —
 * every ignition throws identically. */
const STAR_SPARK_COUNT = 10;
const STAR_SPARK_SPREAD = 20;
const STAR_SPARKS: readonly { dx: number; dy: number }[] = Array.from(
  { length: STAR_SPARK_COUNT },
  (_, i) => {
    const angle = (i / STAR_SPARK_COUNT) * TAU - TAU / 4;
    return {
      dx: Math.cos(angle) * STAR_SPARK_SPREAD,
      dy: Math.sin(angle) * STAR_SPARK_SPREAD,
    };
  },
);

const captionFor = (starsHeld: number): string =>
  `prestige ${starsHeld} · everything back, but better`;

type StatRowProps = {
  label: string;
  value: number;
  fraction: number;
  dimmed: boolean;
  motionSafe: boolean;
};

/** One stat line — a mono label, a `Readout` value, and a thin bar beneath
 * it that tracks the value as a fraction of its current target. Pure props,
 * no state of its own, so it is safe to call from the panel's `.map`. */
function StatRow({
  label,
  value,
  fraction,
  dimmed,
  motionSafe,
}: StatRowProps): React.JSX.Element {
  return (
    <div
      className={cn("transition-opacity duration-300", dimmed && "opacity-40")}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-label text-ink-3">{label}</span>
        <Readout value={value} size="sm" className="text-ink" />
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.span
          className="block h-full origin-left rounded-full bg-primary"
          animate={{ scaleX: fraction }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </div>
    </div>
  );
}

type StarSlotProps = {
  filled: boolean;
  /** Nonzero only on the one slot that just lit up — a shared counter from
   * the parent, so this component never needs its own effect-driven
   * setState to know when to fire. */
  igniteToken: number;
  nudgeActive: boolean;
  motionSafe: boolean;
};

/** One star in the row. Filling it pops the mark in on `springs.flick` with
 * a ring and ten sparks, both driven imperatively off a change in
 * `igniteToken`; already-held neighbours instead take a brief declarative
 * nudge. */
function StarSlot({
  filled,
  igniteToken,
  nudgeActive,
  motionSafe,
}: StarSlotProps): React.JSX.Element {
  const scale = useMotionValue<number>(1);
  const ringScale = useMotionValue<number>(1);
  const ringOpacity = useMotionValue<number>(0);

  const scaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const ringScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const ringOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevTokenRef = React.useRef(igniteToken);

  React.useEffect(() => {
    const prevToken = prevTokenRef.current;
    prevTokenRef.current = igniteToken;
    if (igniteToken === 0 || prevToken === igniteToken || !motionSafe) return;

    scaleAnim.current?.stop();
    scale.jump(0);
    scaleAnim.current = animate(scale, 1, springs.flick);

    ringScaleAnim.current?.stop();
    ringOpacityAnim.current?.stop();
    ringScale.jump(0.5);
    ringOpacity.jump(0.9);
    ringScaleAnim.current = animate(ringScale, STAR_RING_PEAK, {
      duration: durations.slow,
      ease: easings.exit,
    });
    ringOpacityAnim.current = animate(ringOpacity, 0, {
      duration: durations.slow,
      ease: easings.exit,
    });
  }, [igniteToken, motionSafe, scale, ringScale, ringOpacity]);

  React.useEffect(() => {
    return () => {
      scaleAnim.current?.stop();
      ringScaleAnim.current?.stop();
      ringOpacityAnim.current?.stop();
    };
  }, []);

  return (
    <motion.span
      aria-hidden
      className="relative inline-flex items-center justify-center"
      style={{ width: STAR_SIZE, height: STAR_SIZE }}
      animate={
        motionSafe && nudgeActive ? { x: [...STAR_NUDGE_KEYFRAMES] } : { x: 0 }
      }
      transition={
        motionSafe && nudgeActive
          ? {
              duration: STAR_NUDGE_S,
              times: [...STAR_NUDGE_TIMES],
              ease: easings.move,
            }
          : { duration: durations.fast }
      }
    >
      {motionSafe && igniteToken > 0 && (
        <span
          key={igniteToken}
          className="pointer-events-none absolute inset-0"
        >
          {STAR_SPARKS.map((s, i) => (
            <motion.span
              key={i}
              className="absolute size-[3px] rounded-full"
              style={{
                left: "50%",
                top: "50%",
                marginLeft: -1.5,
                marginTop: -1.5,
                background: "var(--warn)",
              }}
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: s.dx, y: s.dy, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          ))}
        </span>
      )}

      {motionSafe && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{
            borderColor: "var(--warn)",
            scale: ringScale,
            opacity: ringOpacity,
          }}
        />
      )}

      <motion.span style={{ scale }} className="inline-flex">
        <Star
          className="size-4"
          strokeWidth={1.75}
          fill={filled ? "currentColor" : "none"}
          style={{
            color: filled ? "var(--warn)" : "var(--ink-3)",
            transition: "color 300ms ease",
          }}
        />
      </motion.span>
    </motion.span>
  );
}

export type PrestigeResetProps = {
  /** Level shown at rest before any prestige is confirmed. @default 50 */
  startLevel?: number;
  /** How many stars the row holds before prestige retires. @default 5 */
  maxStars?: number;
  /** Fires once, right as each new star ignites. */
  onPrestige?: (stars: number) => void;
  className?: string;
};

/**
 * A prestige ceremony: trade a maxed level for a permanent star. The panel
 * shows the current state — a big level numeral, three stat rows composed
 * from `Readout`, and the stars already banked — and PRESTIGE confirms
 * before it commits, because the confirmation is not friction bolted onto a
 * destructive button, it is the weight of the decision made visible: press
 * once to arm it, press "confirm — this resets everything" to mean it, or
 * "keep it" to walk away. Confirming drains the stats one after another,
 * counts the level numeral down fast on a stepped interval while it shrinks,
 * then holds — the quiet beat before the star is the most important frame
 * in the whole sequence, the instant the trade actually lands — before a new
 * star ignites on `springs.flick` with a ring and ten sparks, nudges its
 * predecessors aside, and the stats cascade back in at their starting
 * values, boosted a flat 5% per star held. At five stars the button reads
 * "max prestige" and retires.
 * Reduced motion: no drains, countdown animation, ignition, sparks, or
 * cascade — every value swaps to its resting number in one step, the star
 * appears in place, captions still update, and the two-step confirm still
 * applies.
 */
export function PrestigeReset({
  startLevel = 50,
  maxStars = 5,
  onPrestige,
  className,
}: PrestigeResetProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const startLevelClamped = Math.max(1, Math.round(startLevel));
  const maxStarsClamped = Math.max(1, Math.round(maxStars));

  const [level, setLevel] = React.useState(startLevelClamped);
  const [statRows, setStatRows] =
    React.useState<StatRowState[]>(initialStatRows);
  const [stars, setStars] = React.useState(0);
  const [nudgingCount, setNudgingCount] = React.useState(0);
  const [starIgniteToken, setStarIgniteToken] = React.useState(0);
  const [ceremonyActive, setCeremonyActive] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const levelRef = React.useRef(startLevelClamped);
  const starsRef = React.useRef(0);
  const phaseRef = React.useRef<"idle" | "ceremony">("idle");
  const motionSafeRef = React.useRef(motionSafe);
  const maxStarsRef = React.useRef(maxStarsClamped);
  const onPrestigeRef = React.useRef(onPrestige);

  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  React.useEffect(() => {
    maxStarsRef.current = maxStarsClamped;
  }, [maxStarsClamped]);
  React.useEffect(() => {
    onPrestigeRef.current = onPrestige;
  }, [onPrestige]);

  const levelScale = useMotionValue<number>(1);
  const levelScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const timersRef = React.useRef<number[]>([]);
  const levelIntervalRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
      timers.length = 0;
      if (levelIntervalRef.current !== null) {
        window.clearInterval(levelIntervalRef.current);
        levelIntervalRef.current = null;
      }
      levelScaleAnim.current?.stop();
    };
  }, []);

  const starsClamped = Math.min(stars, maxStarsClamped);
  const maxed = starsClamped >= maxStarsClamped;

  const runCeremony = () => {
    if (phaseRef.current !== "idle") return;
    if (starsRef.current >= maxStarsRef.current) return;

    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current.length = 0;
    if (levelIntervalRef.current !== null) {
      window.clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }

    phaseRef.current = "ceremony";
    setCeremonyActive(true);

    if (!motionSafeRef.current) {
      const nextStars = Math.min(starsRef.current + 1, maxStarsRef.current);
      starsRef.current = nextStars;
      setStars(nextStars);
      onPrestigeRef.current?.(nextStars);

      const bonusMultiplier = 1 + STAR_BONUS * nextStars;
      setStatRows((prev) =>
        prev.map((row) => {
          const def = STAT_DEFS.find((d) => d.id === row.id);
          const target = Math.round((def?.start ?? 0) * bonusMultiplier);
          return { ...row, value: target, target };
        }),
      );

      levelRef.current = 1;
      setLevel(1);
      levelScale.jump(1);

      setCaption(captionFor(nextStars));
      setAnnounce(
        `Prestiged. ${nextStars} of ${maxStarsRef.current} stars held.`,
      );

      phaseRef.current = "idle";
      setCeremonyActive(false);
      return;
    }

    // Step 1 — the three stat rows drain, one after another.
    for (let i = 0; i < STAT_DEFS.length; i += 1) {
      const id = window.setTimeout(() => {
        setStatRows((prev) =>
          prev.map((row, idx) => (idx === i ? { ...row, value: 0 } : row)),
        );
      }, i * ROW_DRAIN_STAGGER_MS);
      timersRef.current.push(id);
    }
    const drainDoneMs =
      (STAT_DEFS.length - 1) * ROW_DRAIN_STAGGER_MS + ROW_SETTLE_MS;

    const finishCeremony = (starsHeld: number) => {
      levelScaleAnim.current?.stop();
      levelScaleAnim.current = animate(levelScale, 1, springs.glide);
      setCaption(captionFor(starsHeld));
      phaseRef.current = "idle";
      setCeremonyActive(false);
    };

    const refillStats = (starsHeld: number) => {
      const bonusMultiplier = 1 + STAR_BONUS * starsHeld;
      setStatRows((prev) =>
        prev.map((row) => {
          const def = STAT_DEFS.find((d) => d.id === row.id);
          return {
            ...row,
            target: Math.round((def?.start ?? 0) * bonusMultiplier),
          };
        }),
      );

      const stepMs = cascade(STAT_DEFS.length) * 1000;
      for (let i = 0; i < STAT_DEFS.length; i += 1) {
        const id = window.setTimeout(() => {
          setStatRows((prev) =>
            prev.map((row, idx) =>
              idx === i ? { ...row, value: row.target } : row,
            ),
          );
        }, i * stepMs);
        timersRef.current.push(id);
      }

      const refillDoneMs = (STAT_DEFS.length - 1) * stepMs + ROW_SETTLE_MS;
      const id = window.setTimeout(() => {
        finishCeremony(starsHeld);
      }, refillDoneMs);
      timersRef.current.push(id);
    };

    const igniteStar = () => {
      const previousHeld = starsRef.current;
      const nextStars = Math.min(previousHeld + 1, maxStarsRef.current);
      starsRef.current = nextStars;
      setStars(nextStars);
      setStarIgniteToken((t) => t + 1);
      onPrestigeRef.current?.(nextStars);

      if (previousHeld > 0) {
        setNudgingCount(previousHeld);
        const id = window.setTimeout(() => {
          setNudgingCount(0);
        }, STAR_NUDGE_MS);
        timersRef.current.push(id);
      }

      setAnnounce(
        `New star earned. ${nextStars} of ${maxStarsRef.current} held.`,
      );

      const id = window.setTimeout(() => {
        refillStats(nextStars);
      }, IGNITE_BEAT_MS);
      timersRef.current.push(id);
    };

    const afterCountdown = () => {
      // Step 3 — the hushed pause. Nothing moves; this is the frame that
      // makes the trade feel real before the star answers it.
      const id = window.setTimeout(() => {
        igniteStar();
      }, PAUSE_MS);
      timersRef.current.push(id);
    };

    const proceedToCountdown = () => {
      // Step 2 — the level numeral counts down fast on a stepped interval.
      const fromLevel = levelRef.current;
      if (fromLevel <= 1) {
        afterCountdown();
        return;
      }
      const tickCount = fromLevel - 1;
      const tickMs = Math.max(
        MIN_TICK_MS,
        Math.round(LEVEL_COUNTDOWN_BUDGET_MS / tickCount),
      );

      levelScaleAnim.current?.stop();
      levelScaleAnim.current = animate(levelScale, LEVEL_SHRINK_SCALE, {
        duration: (tickMs * tickCount) / 1000,
        ease: easings.move,
      });

      levelIntervalRef.current = window.setInterval(() => {
        const next = levelRef.current - 1;
        levelRef.current = next;
        setLevel(next);
        if (next <= 1) {
          if (levelIntervalRef.current !== null) {
            window.clearInterval(levelIntervalRef.current);
            levelIntervalRef.current = null;
          }
          afterCountdown();
        }
      }, tickMs);
    };

    const startTimer = window.setTimeout(() => {
      proceedToCountdown();
    }, drainDoneMs);
    timersRef.current.push(startTimer);
  };

  const handleButtonClick = () => {
    if (ceremonyActive) return;
    if (starsRef.current >= maxStarsRef.current) return;
    if (!confirming) {
      setConfirming(true);
      setAnnounce(
        "Prestige armed. Press confirm to reset everything, or keep it to cancel.",
      );
      return;
    }
    setConfirming(false);
    runCeremony();
  };

  const handleKeepIt = () => {
    setConfirming(false);
    setAnnounce("Prestige cancelled. Nothing changed.");
  };

  const buttonLabel = maxed
    ? "max prestige"
    : confirming
      ? "confirm — this resets everything"
      : "prestige";

  return (
    <div
      role="group"
      aria-label="Prestige panel"
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape" && confirming) handleKeepIt();
      }}
    >
      <div className="text-label text-ink-3">prestige</div>

      <div className="mt-3 flex flex-col items-center">
        <span className="text-label text-ink-3">level</span>
        <motion.span
          aria-label={`Level ${level}`}
          style={{ scale: levelScale }}
          className="flex w-20 justify-center font-mono text-6xl font-bold text-ink tabular-nums"
        >
          {level}
        </motion.span>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {statRows.map((row) => (
          <StatRow
            key={row.id}
            label={row.label}
            value={row.value}
            fraction={
              row.target > 0
                ? Math.min(1, Math.max(0, row.value / row.target))
                : 0
            }
            dimmed={ceremonyActive && row.value === 0}
            motionSafe={motionSafe}
          />
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between">
          <span className="text-label text-ink-3">prestige stars</span>
          <span className="font-mono text-[10px] text-ink-3">+5% per star</span>
        </div>
        <div
          className="mt-2 flex items-center gap-1.5"
          role="img"
          aria-label={`${starsClamped} of ${maxStarsClamped} prestige stars held`}
        >
          {Array.from({ length: maxStarsClamped }, (_, i) => (
            <StarSlot
              key={i}
              filled={i < starsClamped}
              igniteToken={i === starsClamped - 1 ? starIgniteToken : 0}
              nudgeActive={i < nudgingCount}
              motionSafe={motionSafe}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex h-4 items-center justify-center overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {caption && (
            <motion.span
              key={caption}
              className="text-label text-ink-3"
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
              {caption}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <motion.button
          type="button"
          aria-label="Prestige"
          onClick={handleButtonClick}
          disabled={ceremonyActive || maxed}
          whileTap={
            motionSafe && !(ceremonyActive || maxed)
              ? { scale: 0.96 }
              : undefined
          }
          transition={springs.flick}
          className={cn(
            "flex-1 rounded-2 py-1.5 text-xs font-semibold shadow-raised transition-[filter] outline-none",
            confirming
              ? "bg-destructive text-destructive-foreground hover:brightness-110 active:brightness-95"
              : "bg-primary text-primary-foreground hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          {buttonLabel}
        </motion.button>

        <AnimatePresence initial={false}>
          {confirming && (
            <motion.button
              key="keep-it"
              type="button"
              onClick={handleKeepIt}
              initial={motionSafe ? { opacity: 0, x: -4 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      x: -4,
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
              className="shrink-0 rounded-1 px-2 py-1 text-xs text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
            >
              keep it
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {maxed && (
        <p className="mt-2 text-center text-label text-ink-3">
          max prestige — nothing left to trade
        </p>
      )}

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
