"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

export type Team = {
  id: string;
  name: string;
  tint: string;
};

export type VersusBarProps = {
  left?: Team;
  right?: Team;
  /** Percent the seam moves per push, before streak multipliers. @default 6 */
  step?: number;
  onVictory?: (teamId: string) => void;
  className?: string;
};

/** `glide` without its discriminant — useSpring takes bare spring options. */
const GLIDE = {
  stiffness: springs.glide.stiffness,
  damping: springs.glide.damping,
  mass: springs.glide.mass,
} as const;

const DEFAULT_LEFT: Team = {
  id: "ravensworth",
  name: "Ravensworth",
  tint: "var(--primary)",
};
const DEFAULT_RIGHT: Team = {
  id: "fernworks",
  name: "Fernworks",
  tint: "var(--warning, #b45309)",
};

/** Consecutive same-side pushes before momentum kicks in. */
const SURGE_THRESHOLD = 3;
/** Seam-shift multiplier for the push that follows an already-surging streak,
 * indexed by (priorStreakCount - SURGE_THRESHOLD): the 4th push in a row
 * lands at 1.5x, the 5th at 1.75x, the 6th and beyond cap at 2x. */
const STREAK_MULTIPLIERS = [1.5, 1.75, 2] as const;
/** Seam position, in percent, past which the thinner side is in the brink zone. */
const CRITICAL_THRESHOLD = 80;

const LEAD_CAPTION_MS = 1400;

const PUSH_BURST_COUNT = 5;
const PUSH_BURST_SPREAD = 16;
/** Five fixed vectors thrown from the seam in a forward cone, evenly spread
 * from -45deg to 45deg — deterministic, so every burst throws identically. */
const PUSH_BURST_VECTORS = Array.from({ length: PUSH_BURST_COUNT }, (_, i) => {
  const t = i / (PUSH_BURST_COUNT - 1);
  const angle = (t - 0.5) * (Math.PI / 2);
  return {
    dx: Math.cos(angle) * PUSH_BURST_SPREAD,
    dy: Math.sin(angle) * PUSH_BURST_SPREAD * 0.6,
  };
});

const VICTORY_SPARK_COUNT = 8;
const VICTORY_SPARK_SPREAD = 24;
/** Eight fixed vectors thrown radially from the winning edge. */
const VICTORY_SPARK_VECTORS = Array.from(
  { length: VICTORY_SPARK_COUNT },
  (_, i) => {
    const angle = (i / VICTORY_SPARK_COUNT) * Math.PI * 2;
    return {
      dx: Math.cos(angle) * VICTORY_SPARK_SPREAD,
      dy: Math.sin(angle) * VICTORY_SPARK_SPREAD,
    };
  },
);

const SHEEN_GRADIENT =
  "linear-gradient(75deg, transparent, color-mix(in oklab, var(--primary-foreground) 65%, transparent), transparent)";

const crestColor = (tint: string): string =>
  `color-mix(in oklab, ${tint} 88%, var(--card))`;

const fillColor = (tint: string): string =>
  `color-mix(in oklab, ${tint} 78%, var(--card))`;

const flexColor = (tint: string): string =>
  `color-mix(in oklab, ${tint} 80%, var(--primary-foreground))`;

const multiplierForPriorStreak = (priorCount: number): number => {
  if (priorCount < SURGE_THRESHOLD) return 1;
  return (
    STREAK_MULTIPLIERS[priorCount - SURGE_THRESHOLD] ??
    STREAK_MULTIPLIERS[STREAK_MULTIPLIERS.length - 1] ??
    1
  );
};

const splitFor = (
  seamValue: number,
): { left: number; right: number; label: string } => {
  const left = Math.round(clamp(seamValue, 0, 100));
  const right = 100 - left;
  return { left, right, label: `${left} · ${right}` };
};

type Side = "left" | "right";
type Burst = { key: number; side: Side; atPercent: number };

/**
 * A tug-of-war meter between two teams, played out on one shared bar. Each
 * push moves the seam toward the pushed side on a `glide` spring, throws a
 * small burst in the push direction, and rolls both team scores through a
 * composed `Readout`. Three pushes in a row for one side raise a sheen across
 * that side's fill and a mono "surge" tag; every push after that lands
 * harder, off a fixed multiplier keyed to streak length, until the other side answers
 * and swings the tension back. Crossing the centre flashes a "leads" caption
 * and pulses the seam marker through a quick three-keyframe tween; past 80%
 * toward either edge the losing header pulses and a thin brink marker
 * appears. Reaching 100% sweeps the winning fill the full width, fires eight
 * sparks, and locks both push buttons behind a "rematch" button that springs
 * the seam back to centre and clears both scores. Reduced motion: the seam
 * jumps straight to its position instead of springing, pushes throw no
 * burst and streaks show no sheen, victory fires no sparks, and lead changes
 * and victory are caption-only state changes.
 */
export function VersusBar({
  left: leftTeam = DEFAULT_LEFT,
  right: rightTeam = DEFAULT_RIGHT,
  step = 6,
  onVictory,
  className,
}: VersusBarProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [seam, setSeam] = React.useState(50);
  const [leftScore, setLeftScore] = React.useState(0);
  const [rightScore, setRightScore] = React.useState(0);
  const [streakSide, setStreakSide] = React.useState<Side | null>(null);
  const [streakCount, setStreakCount] = React.useState(0);
  const [victoryId, setVictoryId] = React.useState<string | null>(null);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [burst, setBurst] = React.useState<Burst | null>(null);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth for the push/rematch handlers — reading
  // React state on a rapid click chain would race a stale closure.
  const seamRef = React.useRef(50);
  const leftScoreRef = React.useRef(0);
  const rightScoreRef = React.useRef(0);
  const streakSideRef = React.useRef<Side | null>(null);
  const streakCountRef = React.useRef(0);
  const victoryRef = React.useRef<string | null>(null);
  const burstKeyRef = React.useRef(0);

  const onVictoryRef = React.useRef(onVictory);
  React.useEffect(() => {
    onVictoryRef.current = onVictory;
  }, [onVictory]);

  const target = useMotionValue<number>(50);
  const spring = useSpring(target, GLIDE);
  const live = motionSafe ? spring : target;
  const pulseScale = useMotionValue<number>(1);
  const pulseAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      pulseAnim.current?.stop();
    };
  }, []);

  const leftFillWidth = useTransform(live, (v) => `${v}%`);
  const rightFillWidth = useTransform(live, (v) => `${100 - v}%`);
  const seamLeft = useTransform(live, (v) => `${v}%`);

  const flashCaption = (text: string, ms: number) => {
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    setCaption(text);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setCaption(null);
    }, ms);
  };

  const holdCaption = (text: string) => {
    if (captionTimer.current !== null) {
      window.clearTimeout(captionTimer.current);
      captionTimer.current = null;
    }
    setCaption(text);
  };

  const triggerLeadPulse = () => {
    pulseAnim.current?.stop();
    pulseAnim.current = animate(pulseScale, [1, 1.4, 1], {
      duration: durations.slow,
      ease: easings.move,
      times: [0, 0.45, 1],
    });
  };

  const push = (side: Side) => {
    if (victoryRef.current) return;

    const priorSide = streakSideRef.current;
    const priorCount = priorSide === side ? streakCountRef.current : 0;
    const multiplier = multiplierForPriorStreak(priorCount);
    const nextCount = priorCount + 1;
    streakSideRef.current = side;
    streakCountRef.current = nextCount;
    setStreakSide(side);
    setStreakCount(nextCount);

    const delta = step * multiplier;
    const prevSeam = seamRef.current;
    const nextSeam = clamp(
      side === "left" ? prevSeam + delta : prevSeam - delta,
      0,
      100,
    );
    seamRef.current = nextSeam;
    setSeam(nextSeam);
    target.set(nextSeam);

    const gained = Math.max(1, Math.round(delta));
    if (side === "left") {
      leftScoreRef.current += gained;
      setLeftScore(leftScoreRef.current);
    } else {
      rightScoreRef.current += gained;
      setRightScore(rightScoreRef.current);
    }

    if (motionSafe) {
      const key = burstKeyRef.current + 1;
      burstKeyRef.current = key;
      setBurst({ key, side, atPercent: nextSeam });
    }

    const team = side === "left" ? leftTeam : rightTeam;
    const split = splitFor(nextSeam);
    let announceText = `${team.name} pushes. Split ${split.label}.`;

    const crossed =
      (prevSeam <= 50 && nextSeam > 50) || (prevSeam >= 50 && nextSeam < 50);
    if (crossed && nextSeam !== 50) {
      const leader = nextSeam > 50 ? leftTeam : rightTeam;
      flashCaption(`${leader.name} leads`, LEAD_CAPTION_MS);
      if (motionSafe) triggerLeadPulse();
      announceText = `${leader.name} leads. Split ${split.label}.`;
    }

    if (nextSeam <= 0 || nextSeam >= 100) {
      const winner = nextSeam >= 100 ? leftTeam : rightTeam;
      victoryRef.current = winner.id;
      setVictoryId(winner.id);
      holdCaption(`${winner.name} takes it`);
      if (motionSafe) setSparkKey((k) => k + 1);
      onVictoryRef.current?.(winner.id);
      announceText = `${winner.name} takes it. Final split ${split.label}.`;
    }

    setAnnounce(announceText);
  };

  const rematch = () => {
    seamRef.current = 50;
    setSeam(50);
    target.set(50);
    streakSideRef.current = null;
    streakCountRef.current = 0;
    setStreakSide(null);
    setStreakCount(0);
    leftScoreRef.current = 0;
    rightScoreRef.current = 0;
    setLeftScore(0);
    setRightScore(0);
    victoryRef.current = null;
    setVictoryId(null);
    setBurst(null);
    if (captionTimer.current !== null) {
      window.clearTimeout(captionTimer.current);
      captionTimer.current = null;
    }
    setCaption(null);
    setAnnounce("Rematch. Seam reset to centre.");
  };

  const leftSurging = streakSide === "left" && streakCount >= SURGE_THRESHOLD;
  const rightSurging = streakSide === "right" && streakCount >= SURGE_THRESHOLD;
  const criticalSide: Side | null =
    seam <= 100 - CRITICAL_THRESHOLD
      ? "left"
      : seam >= CRITICAL_THRESHOLD
        ? "right"
        : null;
  const split = splitFor(seam);
  const disabled = victoryId !== null;

  return (
    <div
      role="group"
      aria-label={`Versus meter, ${leftTeam.name} against ${rightTeam.name}`}
      className={cn("w-full max-w-xl", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <motion.div
          className="flex flex-col gap-1"
          animate={
            motionSafe && criticalSide === "left"
              ? {
                  opacity: [1, 0.55, 1],
                  transition: {
                    duration: durations.page,
                    ease: easings.move,
                    times: [0, 0.5, 1],
                    repeat: Infinity,
                  },
                }
              : { opacity: 1 }
          }
        >
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: crestColor(leftTeam.tint) }}
            />
            <span className="text-ink-1 text-sm font-semibold">
              {leftTeam.name}
            </span>
          </span>
          <Readout value={leftScore} size="lg" />
          {leftSurging && (
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink-3 uppercase">
              surge
            </span>
          )}
        </motion.div>

        <motion.div
          className="flex flex-col items-end gap-1"
          animate={
            motionSafe && criticalSide === "right"
              ? {
                  opacity: [1, 0.55, 1],
                  transition: {
                    duration: durations.page,
                    ease: easings.move,
                    times: [0, 0.5, 1],
                    repeat: Infinity,
                  },
                }
              : { opacity: 1 }
          }
        >
          <span className="flex items-center gap-1.5">
            <span className="text-ink-1 text-sm font-semibold">
              {rightTeam.name}
            </span>
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ backgroundColor: crestColor(rightTeam.tint) }}
            />
          </span>
          <Readout value={rightScore} size="lg" />
          {rightSurging && (
            <span className="font-mono text-[10px] font-medium tracking-[0.14em] text-ink-3 uppercase">
              surge
            </span>
          )}
        </motion.div>
      </div>

      <div className="relative mt-3 h-10 overflow-hidden rounded-3 border border-hairline bg-surface-2">
        <motion.div
          aria-hidden
          style={{
            width: leftFillWidth,
            backgroundColor: fillColor(leftTeam.tint),
          }}
          className="absolute inset-y-0 left-0 overflow-hidden"
        >
          {motionSafe && leftSurging && (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 w-1/3"
              style={{ background: SHEEN_GRADIENT }}
              animate={{ left: ["-40%", "140%"] }}
              transition={{
                duration: durations.page,
                ease: easings.move,
                times: [0, 1],
                repeat: Infinity,
              }}
            />
          )}
        </motion.div>

        <motion.div
          aria-hidden
          style={{
            width: rightFillWidth,
            backgroundColor: fillColor(rightTeam.tint),
          }}
          className="absolute inset-y-0 right-0 overflow-hidden"
        >
          {motionSafe && rightSurging && (
            <motion.span
              aria-hidden
              className="absolute inset-y-0 w-1/3"
              style={{ background: SHEEN_GRADIENT }}
              animate={{ left: ["-40%", "140%"] }}
              transition={{
                duration: durations.page,
                ease: easings.move,
                times: [0, 1],
                repeat: Infinity,
              }}
            />
          )}
        </motion.div>

        {criticalSide && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-px bg-ink-3/70"
            style={{ left: criticalSide === "left" ? "20%" : "80%" }}
          />
        )}

        {motionSafe && burst && (
          <span
            key={burst.key}
            aria-hidden
            style={{ left: `${burst.atPercent}%` }}
            className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
          >
            {PUSH_BURST_VECTORS.map((v, i) => (
              <motion.span
                key={i}
                className="absolute size-[3px] rounded-full"
                style={{
                  background: flexColor(
                    burst.side === "left" ? leftTeam.tint : rightTeam.tint,
                  ),
                }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{
                  x: burst.side === "left" ? v.dx : -v.dx,
                  y: v.dy,
                  opacity: 0,
                }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}

        {motionSafe && victoryId && sparkKey > 0 && (
          <span
            key={sparkKey}
            aria-hidden
            style={{ left: victoryId === leftTeam.id ? "100%" : "0%" }}
            className="pointer-events-none absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
          >
            {VICTORY_SPARK_VECTORS.map((v, i) => (
              <motion.span
                key={i}
                className="absolute size-1 rounded-full"
                style={{
                  background: flexColor(
                    victoryId === leftTeam.id ? leftTeam.tint : rightTeam.tint,
                  ),
                }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: v.dx, y: v.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}

        <motion.div
          aria-hidden
          style={{ left: seamLeft, marginLeft: -9 }}
          className="absolute inset-y-0 z-10 flex w-[18px] items-center justify-center"
        >
          <motion.span
            style={{ scale: pulseScale }}
            className="rounded-full border border-hairline-strong bg-surface-0 px-1 font-mono text-[9px] leading-none text-ink-2 shadow-raised"
          >
            ‹›
          </motion.span>
        </motion.div>
      </div>

      <div className="mt-2 flex min-h-[1rem] items-center justify-between gap-3">
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

        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {split.label}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Push for ${leftTeam.name}`}
          onClick={() => push("left")}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-2 py-1.5 text-xs font-semibold shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
          style={{
            backgroundColor: `color-mix(in oklab, ${leftTeam.tint} 88%, var(--card))`,
            color: "var(--primary-foreground)",
          }}
        >
          Push {leftTeam.name}
        </button>
        <button
          type="button"
          aria-label={`Push for ${rightTeam.name}`}
          onClick={() => push("right")}
          disabled={disabled}
          className={cn(
            "flex-1 rounded-2 py-1.5 text-xs font-semibold shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
          style={{
            backgroundColor: `color-mix(in oklab, ${rightTeam.tint} 88%, var(--card))`,
            color: "var(--primary-foreground)",
          }}
        >
          Push {rightTeam.name}
        </button>
      </div>

      {victoryId && (
        <button
          type="button"
          onClick={rematch}
          className="hover:text-ink-1 mt-3 self-center font-mono text-xs font-medium text-ink-2 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
        >
          rematch
        </button>
      )}

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
