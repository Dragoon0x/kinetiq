"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const DEFAULT_REWARDS = [10, 10, 15, 15, 20, 20, 100] as const;
const MIN_TILES = 5;
const MAX_TILES = 7;

/** Slow breathing loop for the "today" call-to-action outline. */
const PULSE_S = 2.4;
/** Authored x/y flight from a claimed chip up to the header total. */
const FLY_DURATION_S = 0.6;
/** Light sweep across the strip on the day-7 payoff. */
const SWEEP_S = 0.6;
/** How long the "week complete" beat holds before the strip cascades back. */
const PAYOFF_HOLD_MS = 1200;

const TAU = Math.PI * 2;
const SPARK_COUNT = 8;
const SPARK_SPREAD = 34;

/** Eight fixed spark vectors, evenly spaced — deterministic, no Math.random. */
const PAYOFF_SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

type TileStatus = "claimed" | "today" | "upcoming" | "missed";

type FlyState = {
  key: number;
  amount: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  isLast: boolean;
};

function buildStatuses(count: number, todayIndex: number): TileStatus[] {
  return Array.from({ length: count }, (_, i) => {
    if (i < todayIndex) return "claimed";
    if (i === todayIndex) return "today";
    return "upcoming";
  });
}

export type DailyCheckProps = {
  /** Per-day rewards; the array length drives the strip (clamped 5-7 tiles).
   * @default [10, 10, 15, 15, 20, 20, 100] */
  rewards?: number[];
  /** Which day is "today" at mount, 1-indexed. @default 3 */
  startDay?: number;
  /** Fires once per claim with the 1-indexed day and its reward. */
  onClaim?: (day: number, reward: number) => void;
  className?: string;
};

/**
 * A seven-day check-in strip that turns a habit into a loop. Each tile holds
 * a day number and an escalating reward chip; claiming the outlined `today`
 * tile fills it from the centre on `glide`, stamps a check on `flick`, and
 * sends the reward chip flying up to the header `Readout` while the mono
 * streak line ticks over and the next tile lifts into `today` on `snap` —
 * the handoff that pulls a player back tomorrow. Claiming the final tile
 * pays off with a spark burst, a light sweep, and a "week complete" caption
 * before the strip cascades back to day one on `cascade()`, its streak total
 * left running. A "miss a day" affordance breaks the chain visibly: the tile
 * greys to a dash and the streak line reads "streak broken." Days are plain
 * indexes, never dates or timestamps — the component never reads the system
 * clock, so its markup is identical on server and client.
 * Reduced motion: no pulse, flight, sweep, or sparks — claims and misses
 * swap tile state and the total in place, and the week-complete moment is a
 * static ring plus the caption held for a beat.
 */
export function DailyCheck({
  rewards: rewardsProp,
  startDay: startDayProp = 3,
  onClaim,
  className,
}: DailyCheckProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const rewards = rewardsProp ?? DEFAULT_REWARDS;
  const tileCount = Math.min(MAX_TILES, Math.max(MIN_TILES, rewards.length));
  const rewardAt = (i: number): number => rewards[i] ?? DEFAULT_REWARDS[i] ?? 0;
  const startIndex = Math.min(
    tileCount - 1,
    Math.max(0, Math.round(startDayProp) - 1),
  );

  const [statuses, setStatuses] = React.useState<TileStatus[]>(() =>
    buildStatuses(tileCount, startIndex),
  );
  const [total, setTotal] = React.useState(() => {
    let sum = 0;
    for (let i = 0; i < startIndex; i += 1) sum += rewardAt(i);
    return sum;
  });
  const [totalStreak, setTotalStreak] = React.useState(startIndex);
  const [week, setWeek] = React.useState(1);
  const [streakBroken, setStreakBroken] = React.useState(false);
  const [payoff, setPayoff] = React.useState<{ key: number } | null>(null);
  const [flying, setFlying] = React.useState<FlyState | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const busyRef = React.useRef(false);
  const currentIndexRef = React.useRef(startIndex);
  const onClaimRef = React.useRef(onClaim);
  const flyKeyRef = React.useRef(0);
  const payoffKeyRef = React.useRef(0);
  const resetTimer = React.useRef<number | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const totalRef = React.useRef<HTMLDivElement>(null);
  const chipRefs = React.useRef<(HTMLSpanElement | null)[]>([]);

  React.useEffect(() => {
    onClaimRef.current = onClaim;
  }, [onClaim]);

  React.useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const setBusyState = (value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  };

  const scheduleReset = (showPayoff: boolean) => {
    setBusyState(true);
    if (showPayoff) {
      payoffKeyRef.current += 1;
      setPayoff({ key: payoffKeyRef.current });
      setAnnounce("Week complete.");
    }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      resetTimer.current = null;
      setPayoff(null);
      setWeek((w) => w + 1);
      setStatuses(buildStatuses(tileCount, 0));
      currentIndexRef.current = 0;
      setBusyState(false);
    }, PAYOFF_HOLD_MS);
  };

  /** Measures the claimed chip and the header total, and starts the flight.
   * Returns false when it instead settled the total synchronously (reduced
   * motion, or a layout that has not measured yet). */
  const beginFly = (
    index: number,
    reward: number,
    isLast: boolean,
  ): boolean => {
    const chipEl = chipRefs.current[index];
    const totalEl = totalRef.current;
    const containerEl = containerRef.current;
    if (!motionSafe || !chipEl || !totalEl || !containerEl) {
      setTotal((t) => t + reward);
      return false;
    }
    const chipRect = chipEl.getBoundingClientRect();
    const totalRect = totalEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    flyKeyRef.current += 1;
    setFlying({
      key: flyKeyRef.current,
      amount: reward,
      fromX: chipRect.left - containerRect.left + chipRect.width / 2,
      fromY: chipRect.top - containerRect.top + chipRect.height / 2,
      toX: totalRect.left - containerRect.left + totalRect.width / 2,
      toY: totalRect.top - containerRect.top + totalRect.height / 2,
      isLast,
    });
    return true;
  };

  const handleClaim = () => {
    if (busyRef.current) return;
    const index = currentIndexRef.current;
    if (index < 0 || index >= tileCount) return;
    const reward = rewardAt(index);
    const isLast = index === tileCount - 1;

    setBusyState(true);
    setStatuses((prev) => {
      const next = [...prev];
      next[index] = "claimed";
      if (!isLast) next[index + 1] = "today";
      return next;
    });
    setTotalStreak((s) => s + 1);
    setStreakBroken(false);
    setAnnounce(`Day ${index + 1} claimed. Plus ${reward}.`);
    onClaimRef.current?.(index + 1, reward);

    if (!isLast) {
      currentIndexRef.current = index + 1;
    }

    const flew = beginFly(index, reward, isLast);

    if (isLast) {
      scheduleReset(true);
    } else if (!flew) {
      setBusyState(false);
    }
  };

  const handleMiss = () => {
    if (busyRef.current) return;
    const index = currentIndexRef.current;
    if (index < 0 || index >= tileCount) return;
    const isLast = index === tileCount - 1;

    setBusyState(true);
    setStatuses((prev) => {
      const next = [...prev];
      next[index] = "missed";
      if (!isLast) next[index + 1] = "today";
      return next;
    });
    setTotalStreak(0);
    setStreakBroken(true);
    setAnnounce(`Day ${index + 1} missed. Streak broken.`);

    if (isLast) {
      scheduleReset(false);
    } else {
      currentIndexRef.current = index + 1;
      setBusyState(false);
    }
  };

  const streakText = streakBroken
    ? "streak broken"
    : `${totalStreak} day streak`;

  return (
    <div
      className={cn(
        "w-full max-w-md rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-label text-ink-3">check-in</span>
          <span className="font-mono text-xs text-ink-2">
            {streakText}
            {week > 1 && <span className="text-ink-3"> · week {week}</span>}
          </span>
        </div>
        <div ref={totalRef} className="flex flex-col items-end gap-0.5">
          <span className="text-label text-ink-3">total</span>
          <Readout value={total} size="lg" />
        </div>
      </div>

      <div ref={containerRef} className="relative mt-5">
        <div
          role="group"
          aria-label="Daily check-in"
          className="flex items-start"
        >
          {Array.from({ length: tileCount }, (_, index) => {
            const status = statuses[index] ?? "upcoming";
            const isPrize = index === tileCount - 1;
            const connectorVariant =
              status === "claimed"
                ? "claimed"
                : status === "missed"
                  ? "missed"
                  : "none";
            return (
              <React.Fragment key={index}>
                <DayTile
                  index={index}
                  dayNumber={index + 1}
                  reward={rewardAt(index)}
                  status={status}
                  isPrize={isPrize}
                  motionSafe={motionSafe}
                  tileCount={tileCount}
                  onClaim={handleClaim}
                  chipRef={(node) => {
                    chipRefs.current[index] = node;
                  }}
                />
                {index < tileCount - 1 && (
                  <Connector
                    variant={connectorVariant}
                    motionSafe={motionSafe}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {payoff && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-5 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {motionSafe ? (
              <>
                <motion.span
                  className="absolute rounded-full border-2 border-warn"
                  style={{ width: 64, height: 64, left: -32, top: -32 }}
                  initial={{ scale: 0.4, opacity: 0.9 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ duration: SWEEP_S, ease: easings.exit }}
                />
                {PAYOFF_SPARKS.map((spark, i) => (
                  <motion.span
                    key={i}
                    className="absolute size-1 rounded-full bg-warn"
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{ x: spark.dx, y: spark.dy, opacity: 0 }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.exit,
                    }}
                  />
                ))}
              </>
            ) : (
              <span className="block size-16 rounded-full border-2 border-warn" />
            )}
          </span>
        )}

        {motionSafe && payoff && (
          <motion.span
            key={payoff.key}
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-1/4"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary-foreground) 60%, transparent), transparent)",
            }}
            initial={{ left: "-25%" }}
            animate={{ left: "100%" }}
            transition={{ duration: SWEEP_S, ease: easings.move }}
          />
        )}

        {motionSafe && flying && (
          <motion.span
            key={flying.key}
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-full border border-hairline-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary"
            style={{
              left: flying.fromX,
              top: flying.fromY,
              marginLeft: -18,
              marginTop: -9,
            }}
            initial={{ opacity: 1, scale: 1 }}
            animate={{
              left: flying.toX,
              top: flying.toY,
              opacity: [1, 1, 0],
              scale: [1, 0.9, 0.55],
            }}
            transition={{
              duration: FLY_DURATION_S,
              ease: easings.move,
              times: [0, 0.7, 1],
            }}
            onAnimationComplete={() => {
              setTotal((t) => t + flying.amount);
              setFlying(null);
              if (!flying.isLast) setBusyState(false);
            }}
          >
            +{flying.amount}
          </motion.span>
        )}
      </div>

      <div className="mt-2 flex h-4 items-center justify-center">
        <AnimatePresence>
          {payoff && (
            <motion.span
              className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-2 uppercase"
              initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
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
              week complete
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={handleMiss}
          disabled={busy}
          className={cn(
            "rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors outline-none",
            "hover:text-ink-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            busy && "pointer-events-none opacity-50",
          )}
        >
          miss a day
        </button>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type ConnectorVariant = "claimed" | "missed" | "none";

function Connector({
  variant,
  motionSafe,
}: {
  variant: ConnectorVariant;
  motionSafe: boolean;
}): React.JSX.Element {
  return (
    <div className="relative mt-5 h-px min-w-2 flex-1 shrink bg-hairline-strong">
      <motion.span
        aria-hidden
        className={cn(
          "absolute inset-0 origin-left",
          variant === "missed" ? "bg-ink-3" : "bg-primary",
        )}
        initial={false}
        animate={{ scaleX: variant === "none" ? 0 : 1 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
    </div>
  );
}

type DayTileProps = {
  index: number;
  dayNumber: number;
  reward: number;
  status: TileStatus;
  isPrize: boolean;
  motionSafe: boolean;
  tileCount: number;
  onClaim: () => void;
  chipRef: (node: HTMLSpanElement | null) => void;
};

const BOX_BASE =
  "relative flex size-10 shrink-0 items-center justify-center rounded-2 border font-mono text-xs outline-none";

const BOX_STATUS_CLASSES: Record<TileStatus, string> = {
  claimed: "border-transparent bg-primary text-primary-foreground",
  today:
    "border-2 border-primary bg-surface-2 text-ink focus-visible:ring-ring focus-visible:ring-offset-surface-1 focus-visible:ring-2 focus-visible:ring-offset-2",
  upcoming: "border-hairline bg-surface-1 text-ink-3",
  missed: "border-hairline bg-surface-1 text-ink-3",
};

const REWARD_BASE =
  "rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums transition-opacity";
const REWARD_NORMAL = "border-hairline-strong bg-surface-2 text-ink-2";
const REWARD_PRIZE =
  "border-warn/50 bg-warn/15 text-warn px-2 text-[11px] font-bold";

/** Per-status enter recipe for the tile box — a pure lookup, never a hook,
 * safe to call from inside the tile rows map. */
function tileMotionFor(status: TileStatus, motionSafe: boolean, delay: number) {
  if (status === "claimed") {
    return {
      initial: motionSafe ? { scale: 0.35, opacity: 0.7 } : false,
      animate: { scale: 1, opacity: 1 },
      transition: motionSafe ? springs.glide : { duration: 0 },
    };
  }
  if (status === "today") {
    return {
      initial: motionSafe ? { y: distances.step, opacity: 0.6 } : false,
      animate: { y: 0, opacity: 1 },
      transition: motionSafe ? springs.snap : { duration: 0 },
    };
  }
  if (status === "missed") {
    return {
      initial: motionSafe ? { opacity: 0 } : false,
      animate: { opacity: 1 },
      transition: motionSafe
        ? { duration: durations.base, ease: easings.enter }
        : { duration: 0 },
    };
  }
  return {
    initial: motionSafe ? { opacity: 0, y: distances.nudge } : false,
    animate: { opacity: 1, y: 0 },
    transition: motionSafe
      ? { duration: durations.base, ease: easings.enter, delay }
      : { duration: 0 },
  };
}

function DayTile({
  index,
  dayNumber,
  reward,
  status,
  isPrize,
  motionSafe,
  tileCount,
  onClaim,
  chipRef,
}: DayTileProps): React.JSX.Element {
  const delay = status === "upcoming" ? index * cascade(tileCount) : 0;
  const { initial, animate, transition } = tileMotionFor(
    status,
    motionSafe,
    delay,
  );

  const ariaLabel =
    status === "today"
      ? `Claim day ${dayNumber}`
      : status === "claimed"
        ? `Day ${dayNumber}, claimed`
        : status === "missed"
          ? `Day ${dayNumber}, missed`
          : `Day ${dayNumber}, upcoming`;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      <motion.button
        key={`${index}-${status}`}
        type="button"
        aria-label={ariaLabel}
        disabled={status !== "today"}
        tabIndex={status === "today" ? 0 : -1}
        onClick={status === "today" ? onClaim : undefined}
        whileTap={
          status === "today" && motionSafe ? { scale: 0.93 } : undefined
        }
        whileHover={
          status === "today" && motionSafe ? { scale: 1.04 } : undefined
        }
        initial={initial}
        animate={animate}
        transition={transition}
        className={cn(BOX_BASE, BOX_STATUS_CLASSES[status])}
      >
        {status === "today" && motionSafe && (
          <motion.span
            aria-hidden
            className="absolute -inset-1 rounded-3 border border-primary"
            animate={{ opacity: [0.25, 0.8, 0.25], scale: [1, 1.06, 1] }}
            transition={{
              duration: PULSE_S,
              ease: easings.move,
              repeat: Infinity,
            }}
          />
        )}

        {status === "claimed" ? (
          <motion.svg
            viewBox="0 0 12 12"
            className="size-4"
            fill="none"
            aria-hidden
            initial={motionSafe ? { scale: 0, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              motionSafe ? { ...springs.flick, delay: 0.12 } : { duration: 0 }
            }
          >
            <path
              d="M2.5 6.4 L4.9 8.8 L9.5 3.4"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        ) : status === "missed" ? (
          <span aria-hidden>–</span>
        ) : (
          <span aria-hidden>{dayNumber}</span>
        )}
      </motion.button>

      <span
        ref={chipRef}
        className={cn(
          REWARD_BASE,
          isPrize ? REWARD_PRIZE : REWARD_NORMAL,
          status === "claimed" && "opacity-50",
          status === "upcoming" && "opacity-45",
          status === "missed" && "opacity-30",
        )}
      >
        +{reward}
      </span>
    </div>
  );
}
