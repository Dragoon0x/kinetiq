"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

/** Score total that rings a milestone: 5000, 10000, 15000, ... */
const MILESTONE_STEP = 5000;

/** A second press inside this window keeps the chain alive. */
const CHAIN_WINDOW_MS = 900;
/** Chain length that lights the sustained glow and tags gains "chained". */
const CHAIN_GLOW_THRESHOLD = 5;
/** Pips rendered in the chain row. */
const CHAIN_PIP_COUNT = 5;
/** Chain counts at which the chained multiplier steps up further. */
const CHAIN_MULT_THRESHOLDS = [5, 10, 15] as const;
/** Fixed multiplier table, indexed by thresholds cleared. */
const CHAIN_MULTIPLIERS = [1, 1.5, 2, 2.5] as const;

const BEST_CAPTION_MS = 1700;
const MILESTONE_CAPTION_MS = 1300;

type Tier = 0 | 1 | 2;

/** Value → tier, small/medium/large — the whole point being a +1000 press
 * should read as a heavier hit than a +50 one at every layer: chip, pop, flecks. */
const tierForValue = (value: number): Tier => {
  if (value >= 600) return 2;
  if (value >= 200) return 1;
  return 0;
};

/** How many of the fixed thresholds a count has cleared. */
const tierCount = (value: number, thresholds: readonly number[]): number => {
  let count = 0;
  for (const t of thresholds) {
    if (value >= t) count += 1;
  }
  return count;
};

const chainMultiplierFor = (chain: number): number =>
  CHAIN_MULTIPLIERS[tierCount(chain, CHAIN_MULT_THRESHOLDS)] ??
  CHAIN_MULTIPLIERS[CHAIN_MULTIPLIERS.length - 1] ??
  1;

const TIER_COLOR = [
  "color-mix(in oklab, var(--primary) 78%, transparent)",
  "color-mix(in oklab, var(--success, #047857) 78%, transparent)",
  "color-mix(in oklab, var(--warning, #b45309) 82%, transparent)",
] as const;

const TIER_CHIP_SIZE = ["text-xs", "text-sm", "text-lg"] as const;
const TIER_POP_PEAK = [1.1, 1.2, 1.36] as const;

const buildFlecks = (count: number, spread: number) =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * TAU - TAU / 4;
    return { dx: Math.cos(angle) * spread, dy: Math.sin(angle) * spread };
  });

/** Fixed fleck vectors per tier — 3 / 6 / 10, precomputed so every burst at a
 * given tier is identical and SSR-safe. No Math.random. */
const FLECKS_BY_TIER = [
  buildFlecks(3, 22),
  buildFlecks(6, 30),
  buildFlecks(10, 42),
] as const;

const FLECK_COLOR =
  "color-mix(in oklab, var(--primary-foreground) 20%, var(--primary))";
const CHAIN_GLOW_COLOR = "color-mix(in oklab, var(--primary) 55%, transparent)";
const MILESTONE_RING_COLOR =
  "color-mix(in oklab, var(--primary) 62%, transparent)";
const MILESTONE_FLASH_COLOR =
  "color-mix(in oklab, var(--primary) 30%, transparent)";
const SWEEP_GRADIENT =
  "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 55%, transparent), transparent)";

type GainChip = { key: number; tier: Tier; text: string; chained: boolean };
type FleckBurst = { key: number; tier: Tier };

export type ScoreTickProps = {
  /** The three ADD POINTS button values, small to large. @default [50, 250, 1000] */
  values?: number[];
  /** Starting high score the session must clear to celebrate. @default 12400 */
  startHigh?: number;
  /** Fires whenever the score sets a new high score — the one-time celebration and every quiet update after it. */
  onBest?: (score: number) => void;
  className?: string;
};

/**
 * The arcade scoreboard: press ADD POINTS and the score rolls through a
 * composed `Readout` while a floating gain chip pops above it, fixed flecks
 * throw off, and the number takes a `flick` scale pop sized to the value
 * tier. Consecutive presses within 900ms chain into pips; at five the chain
 * lights a sustained glow and tags gains "chained" off a fixed multiplier
 * table, then decays back to zero on its own timer. The first time the score
 * clears the high score is the one beat that matters — a chained scaleX
 * flip, a light sweep, and a "new best" caption — after which the high-score
 * line simply tracks the score, and every 5000 points rings its own
 * milestone flash and caption. RESET zeroes the score but leaves the high
 * score standing. Reduced motion: no pops, chips, flecks, sweeps, or glow —
 * the numerals still roll (Readout owns that), captions still flash, and the
 * chain still counts.
 */
export function ScoreTick({
  values = [50, 250, 1000],
  startHigh = 12400,
  onBest,
  className,
}: ScoreTickProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [score, setScore] = React.useState(0);
  const [highScore, setHighScore] = React.useState(startHigh);
  const [chain, setChain] = React.useState(0);
  const [gainChip, setGainChip] = React.useState<GainChip>({
    key: 0,
    tier: 0,
    text: "",
    chained: false,
  });
  const [fleckBurst, setFleckBurst] = React.useState<FleckBurst>({
    key: 0,
    tier: 0,
  });
  const [celebrateKey, setCelebrateKey] = React.useState(0);
  const [milestoneKey, setMilestoneKey] = React.useState(0);
  const [bestCaption, setBestCaption] = React.useState<string | null>(null);
  const [milestoneCaption, setMilestoneCaption] = React.useState<string | null>(
    null,
  );
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth read inside the press handler and timers —
  // state alone would race a rapid chain of clicks.
  const scoreRef = React.useRef(0);
  const highScoreRef = React.useRef(startHigh);
  const chainRef = React.useRef(0);
  const celebratedRef = React.useRef(false);
  const milestoneRef = React.useRef(0);
  const lastPressTimeRef = React.useRef<number | null>(null);

  const numberScale = useMotionValue<number>(1);
  const highFlipScaleX = useMotionValue<number>(1);

  const numberScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const highFlipAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const chainDecayTimer = React.useRef<number | null>(null);
  const bestCaptionTimer = React.useRef<number | null>(null);
  const milestoneCaptionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (chainDecayTimer.current !== null)
        window.clearTimeout(chainDecayTimer.current);
      if (bestCaptionTimer.current !== null)
        window.clearTimeout(bestCaptionTimer.current);
      if (milestoneCaptionTimer.current !== null)
        window.clearTimeout(milestoneCaptionTimer.current);
      numberScaleAnim.current?.stop();
      highFlipAnim.current?.stop();
    };
  }, []);

  const flashBestCaption = (text: string) => {
    setBestCaption(text);
    if (bestCaptionTimer.current !== null)
      window.clearTimeout(bestCaptionTimer.current);
    bestCaptionTimer.current = window.setTimeout(() => {
      bestCaptionTimer.current = null;
      setBestCaption(null);
    }, BEST_CAPTION_MS);
  };

  const flashMilestoneCaption = (text: string) => {
    setMilestoneCaption(text);
    if (milestoneCaptionTimer.current !== null)
      window.clearTimeout(milestoneCaptionTimer.current);
    milestoneCaptionTimer.current = window.setTimeout(() => {
      milestoneCaptionTimer.current = null;
      setMilestoneCaption(null);
    }, MILESTONE_CAPTION_MS);
  };

  const handleAdd = (
    value: number,
    tier: Tier,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const now = event.timeStamp;
    const last = lastPressTimeRef.current;
    const withinWindow = last !== null && now - last <= CHAIN_WINDOW_MS;
    const nextChain = withinWindow ? chainRef.current + 1 : 1;
    chainRef.current = nextChain;
    lastPressTimeRef.current = now;
    setChain(nextChain);

    if (chainDecayTimer.current !== null)
      window.clearTimeout(chainDecayTimer.current);
    chainDecayTimer.current = window.setTimeout(() => {
      chainDecayTimer.current = null;
      chainRef.current = 0;
      setChain(0);
    }, CHAIN_WINDOW_MS);

    const chained = nextChain >= CHAIN_GLOW_THRESHOLD;
    const multiplier = chained ? chainMultiplierFor(nextChain) : 1;
    const gain = Math.round(value * multiplier);

    const nextScore = scoreRef.current + gain;
    scoreRef.current = nextScore;
    setScore(nextScore);

    if (motionSafe) {
      numberScaleAnim.current?.stop();
      numberScale.set(TIER_POP_PEAK[tier] ?? 1.1);
      numberScaleAnim.current = animate(numberScale, 1, springs.flick);

      setFleckBurst((prev) => ({ key: prev.key + 1, tier }));
      setGainChip((prev) => ({
        key: prev.key + 1,
        tier,
        text: `+${gain.toLocaleString("en-US")}`,
        chained,
      }));
    }

    const prevMilestone = milestoneRef.current;
    const nextMilestone = Math.floor(nextScore / MILESTONE_STEP);
    if (nextMilestone > prevMilestone) {
      milestoneRef.current = nextMilestone;
      flashMilestoneCaption(
        `${(nextMilestone * MILESTONE_STEP).toLocaleString("en-US")} milestone!`,
      );
      if (motionSafe) setMilestoneKey((k) => k + 1);
    }

    if (nextScore > highScoreRef.current) {
      const alreadyCelebrated = celebratedRef.current;
      highScoreRef.current = nextScore;
      setHighScore(nextScore);
      onBest?.(nextScore);

      if (!alreadyCelebrated) {
        celebratedRef.current = true;
        flashBestCaption("new best");
        if (motionSafe) {
          setCelebrateKey((k) => k + 1);
          highFlipAnim.current?.stop();
          highFlipAnim.current = animate(highFlipScaleX, 0, {
            duration: durations.fast,
            ease: easings.exit,
            onComplete: () => {
              highFlipAnim.current = animate(highFlipScaleX, 1, {
                duration: durations.base,
                ease: easings.enter,
              });
            },
          });
        }
      }
    }

    setAnnounce(
      `Added ${gain.toLocaleString("en-US")} points. Score ${nextScore.toLocaleString("en-US")}.`,
    );
  };

  const handleReset = () => {
    scoreRef.current = 0;
    setScore(0);
    chainRef.current = 0;
    setChain(0);
    lastPressTimeRef.current = null;
    milestoneRef.current = 0;

    if (chainDecayTimer.current !== null) {
      window.clearTimeout(chainDecayTimer.current);
      chainDecayTimer.current = null;
    }

    numberScaleAnim.current?.stop();
    numberScale.jump(1);

    setAnnounce("Score reset. Best stands.");
  };

  const chainMultiplier = chainMultiplierFor(chain);

  return (
    <div
      className={cn(
        "w-72 rounded-4 border border-border bg-card p-5 shadow-raised",
        className,
      )}
    >
      <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
        score
      </span>

      <div className="relative mt-1 inline-flex">
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute -inset-3 rounded-4 blur-lg transition-opacity duration-300",
            motionSafe && chain >= CHAIN_GLOW_THRESHOLD
              ? "opacity-100"
              : "opacity-0",
          )}
          style={{ background: CHAIN_GLOW_COLOR }}
        />

        <motion.span
          className="relative inline-flex"
          style={{ scale: numberScale }}
        >
          <Readout value={score} size="xl" />
        </motion.span>

        {motionSafe && fleckBurst.key > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {(FLECKS_BY_TIER[fleckBurst.tier] ?? []).map((f, i) => (
              <motion.span
                key={`${fleckBurst.key}-${i}`}
                className="absolute size-[3px] rounded-full"
                style={{ background: FLECK_COLOR }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: f.dx, y: f.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}

        {motionSafe && gainChip.key > 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2"
          >
            <motion.span
              key={gainChip.key}
              className={cn(
                "block text-center font-mono font-bold whitespace-nowrap tabular-nums",
                TIER_CHIP_SIZE[gainChip.tier] ?? "text-sm",
              )}
              style={{ color: TIER_COLOR[gainChip.tier] ?? TIER_COLOR[0] }}
              initial={{ opacity: 0 }}
              animate={{ y: [-2, -10, -30], opacity: [0, 1, 1, 0] }}
              transition={{
                duration: 1.1,
                ease: easings.exit,
                times: [0, 0.18, 0.7, 1],
              }}
            >
              {gainChip.text}
              {gainChip.chained && (
                <span className="ml-1 align-middle text-[9px] font-semibold text-ink-3 uppercase">
                  chained
                </span>
              )}
            </motion.span>
          </span>
        )}

        {motionSafe && milestoneKey > 0 && (
          <motion.span
            key={`flash-${milestoneKey}`}
            aria-hidden
            className="pointer-events-none absolute -inset-2 rounded-3"
            style={{ background: MILESTONE_FLASH_COLOR }}
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}
        {motionSafe && milestoneKey > 0 && (
          <motion.span
            key={`ring-${milestoneKey}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2"
            style={{ borderColor: MILESTONE_RING_COLOR }}
            initial={{ scale: 0.7, opacity: 0.9 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}
      </div>

      <span
        aria-hidden
        className="flex h-4 items-center font-mono text-[11px] font-semibold text-ink-3"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={milestoneCaption ?? "idle"}
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
            {milestoneCaption ?? ""}
          </motion.span>
        </AnimatePresence>
      </span>

      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
          chain
        </span>
        <span className="flex items-center gap-1">
          {Array.from({ length: CHAIN_PIP_COUNT }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors duration-200",
                i < Math.min(chain, CHAIN_PIP_COUNT)
                  ? "bg-primary"
                  : "bg-surface-2",
              )}
            />
          ))}
        </span>
        {chain >= CHAIN_GLOW_THRESHOLD && (
          <span className="font-mono text-[10px] font-semibold text-primary tabular-nums">
            x{chainMultiplier}
          </span>
        )}
      </div>

      <div className="mt-4">
        <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
          high score
        </span>
        <div className="relative mt-0.5 overflow-hidden">
          <motion.span
            className="inline-block origin-center"
            style={{ scaleX: highFlipScaleX }}
          >
            <Readout value={highScore} size="md" />
          </motion.span>
          {motionSafe && celebrateKey > 0 && (
            <motion.span
              key={celebrateKey}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
              style={{ background: SWEEP_GRADIENT }}
              initial={{ x: "-120%", opacity: 0.9 }}
              animate={{ x: "260%", opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}
        </div>
        <span
          aria-hidden
          className="mt-0.5 flex h-4 items-center font-mono text-[11px] font-semibold text-primary"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={bestCaption ?? "idle"}
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
              {bestCaption ?? ""}
            </motion.span>
          </AnimatePresence>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {values.map((value, i) => {
          const tier = tierForValue(value);
          const color = TIER_COLOR[tier] ?? TIER_COLOR[0];
          return (
            <button
              key={`${value}-${i}`}
              type="button"
              aria-label={`Add ${value.toLocaleString("en-US")} points`}
              onClick={(event) => handleAdd(value, tier, event)}
              className={cn(
                "rounded-2 border py-1.5 font-mono text-xs font-bold tabular-nums shadow-raised transition-[filter] outline-none",
                "hover:brightness-110 active:brightness-95",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              )}
              style={{ borderColor: color, color }}
            >
              +{value.toLocaleString("en-US")}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleReset}
          className="font-mono text-[11px] font-semibold text-ink-3 outline-none hover:text-ink-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
        >
          RESET
        </button>
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          best {highScore.toLocaleString("en-US")} stands
        </span>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
