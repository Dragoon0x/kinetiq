"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { Check } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Mirrors registry/ui/caliper-slider.tsx — avoids the "useLayoutEffect does
 * nothing on the server" warning while still priming the entrance before the
 * browser's first paint (a plain useEffect runs after paint, which would
 * flash the assembled panel for a frame before the sides slid in). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

export type Fighter = {
  id: string;
  name: string;
  rank: string;
  record: string;
  tint: string;
};

export type DuelReadyProps = {
  you?: Fighter;
  foe?: Fighter;
  /** Delay before the opponent locks in, ms. Fixed — never randomized. @default 1400 */
  foeDelayMs?: number;
  /** Fires once, the instant the countdown hits zero. */
  onFight?: () => void;
  className?: string;
};

const DEFAULT_YOU: Fighter = {
  id: "you",
  name: "KESTREL",
  rank: "CHALLENGER",
  record: "12–3",
  tint: "var(--primary)",
};
const DEFAULT_FOE: Fighter = {
  id: "foe",
  name: "VANTA",
  rank: "CONTENDER",
  record: "9–5",
  tint: "var(--warning, #b45309)",
};

/** Slide distance off either edge, px. */
const EDGE = 220;
const ENTRANCE_S = 0.5;
/** Lean-in on a solo lock. */
const LEAN_PX = 9;
/** Lunge on clash — further toward centre, stops well short of colliding. */
const LUNGE_PX = 32;
const LUNGE_S = 0.3;
const COUNTDOWN_BEAT_MS = 700;
const FLASH_S = 0.45;

/** Eight fixed spark vectors, evenly spaced. No Math.random. */
const FLARE_SPARK_COUNT = 8;
const FLARE_SPARK_SPREAD = 34;
const FLARE_SPARKS = Array.from({ length: FLARE_SPARK_COUNT }, (_, i) => {
  const angle = (i / FLARE_SPARK_COUNT) * Math.PI * 2;
  return {
    dx: Math.cos(angle) * FLARE_SPARK_SPREAD,
    dy: Math.sin(angle) * FLARE_SPARK_SPREAD,
  };
});

const SWEEP_GRADIENT =
  "linear-gradient(75deg, transparent, color-mix(in oklab, var(--ink) 55%, transparent), transparent)";

type Phase = "duel" | "clash" | "countdown" | "fight";
type Side = "you" | "foe";

/**
 * A tinted bust from simple shapes — a circle head over a clipped shoulder
 * slab — never a component, called directly so it carries no hooks of its
 * own.
 */
function renderBust(tint: string): React.JSX.Element {
  return (
    <span aria-hidden className="relative block size-full">
      <span
        className="absolute inset-x-0 bottom-0 mx-auto rounded-t-2 rounded-b-1"
        style={{
          width: "76%",
          height: "46%",
          background: `color-mix(in oklab, ${tint} 68%, var(--card))`,
        }}
      />
      <span
        className="absolute top-0 left-1/2 -translate-x-1/2 rounded-full"
        style={{
          width: "50%",
          height: "50%",
          background: `color-mix(in oklab, ${tint} 52%, var(--card))`,
        }}
      />
    </span>
  );
}

type FighterSideProps = {
  fighter: Fighter;
  locked: boolean;
  isYou: boolean;
  lunging: boolean;
  motionSafe: boolean;
  onLockIn?: () => void;
};

/**
 * One fighter's column: frame, bust, name, rank, record and the ready
 * control. A real child component rather than a render-time helper call —
 * the lock-in handler closes over refs, and only a JSX prop makes it plain
 * to the compiler that the closure runs on click, not during render.
 */
function FighterSide({
  fighter,
  locked,
  isYou,
  lunging,
  motionSafe,
  onLockIn,
}: FighterSideProps): React.JSX.Element {
  const lean = lunging ? LUNGE_PX : locked ? LEAN_PX : 0;
  const portraitX = isYou ? lean : -lean;
  const portraitTransition = !motionSafe
    ? { duration: 0 }
    : lunging
      ? { duration: LUNGE_S, ease: easings.move }
      : springs.snap;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <motion.div
        animate={{ x: portraitX }}
        transition={portraitTransition}
        className="relative"
      >
        <div
          className={cn(
            "relative size-16 rounded-2 border border-hairline p-1.5 sm:size-20",
            motionSafe && "transition-[border-color,box-shadow] duration-300",
          )}
          style={
            locked
              ? {
                  borderColor: fighter.tint,
                  boxShadow: `0 0 0 1px ${fighter.tint}, 0 0 18px -4px ${fighter.tint}`,
                }
              : undefined
          }
        >
          {renderBust(fighter.tint)}
        </div>
        {locked && (
          <motion.span
            aria-hidden
            initial={motionSafe ? { scale: 0, opacity: 0 } : false}
            animate={{ scale: 1, opacity: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border border-hairline-strong"
            style={{
              background: fighter.tint,
              color: "var(--primary-foreground)",
            }}
          >
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        )}
      </motion.div>

      <span className="font-mono text-sm font-bold tracking-wide text-ink uppercase sm:text-base">
        {fighter.name}
      </span>
      <span className="text-label text-ink-3">{fighter.rank}</span>
      <span className="font-mono text-[11px] text-ink-2">{fighter.record}</span>

      {isYou ? (
        <button
          type="button"
          aria-label="Lock in"
          onClick={onLockIn}
          disabled={locked}
          className={cn(
            "mt-1 rounded-2 px-3 py-1 font-mono text-[10px] font-semibold tracking-wide uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-60",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
          style={{
            backgroundColor: `color-mix(in oklab, ${fighter.tint} 88%, var(--card))`,
            color: "var(--primary-foreground)",
          }}
        >
          {locked ? "locked in" : "lock in"}
        </button>
      ) : (
        <span
          className={cn(
            "mt-1 flex items-center gap-1.5 rounded-2 px-3 py-1 font-mono text-[10px] font-semibold tracking-wide uppercase",
            locked ? "text-ink" : "text-ink-3",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              motionSafe && "transition-colors duration-300",
            )}
            style={{ background: locked ? fighter.tint : "var(--ink-3)" }}
          />
          {locked ? "locked in" : "standing by"}
        </span>
      )}
    </div>
  );
}

/**
 * The face-off screen a match opens on. On mount the two sides slide in from
 * opposite edges as the divider wipes down between them and a VS mark stamps
 * into the centre with a ring. Press Lock in — a real button — and your side
 * lights, your portrait leans toward the centre, and a caption holds at
 * "locked in · waiting"; the opponent locks in on a fixed delay (never
 * random, `foeDelayMs`) with the same treatment mirrored, regardless of
 * whether you were faster. Once both sides are in, the portraits lunge
 * toward the centre and stop just short, the VS mark flares with a ring,
 * eight sparks and a sweep of light, a 3 · 2 · 1 countdown pops over the
 * divider, and zero fires a single flash and a held "fight" caption — a
 * "rematch" button replays the whole sequence, and neither side can lock in
 * twice. Reduced motion: no slides, wipes, lunges, flares or sweeps — the
 * panel presents assembled, locking in and the clash are plain state
 * changes, the countdown still steps on its fixed timer, and the final state
 * swaps in with its caption.
 */
export function DuelReady({
  you = DEFAULT_YOU,
  foe = DEFAULT_FOE,
  foeDelayMs = 1400,
  onFight,
  className,
}: DuelReadyProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [phase, setPhase] = React.useState<Phase>("duel");
  const [youLocked, setYouLocked] = React.useState(false);
  const [foeLocked, setFoeLocked] = React.useState(false);
  const [countdownValue, setCountdownValue] = React.useState<number | null>(
    null,
  );
  const [flareKey, setFlareKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth inside the lock handlers — reading React
  // state right after calling its setter would race a stale closure.
  const youLockedRef = React.useRef(false);
  const foeLockedRef = React.useRef(false);

  const onFightRef = React.useRef(onFight);
  React.useEffect(() => {
    onFightRef.current = onFight;
  }, [onFight]);

  const leftX = useMotionValue<number>(-EDGE);
  const rightX = useMotionValue<number>(EDGE);
  const dividerScaleY = useMotionValue<number>(0);
  const vsScale = useMotionValue<number>(2.2);
  const ringScale = useMotionValue<number>(0.6);

  const timers = React.useRef<Set<number>>(new Set());
  const entranceAnims = React.useRef<ReturnType<typeof animate>[]>([]);

  const scheduleTimer = (fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, delayMs);
    timers.current.add(id);
  };

  const beginEntrance = () => {
    entranceAnims.current.forEach((a) => a.stop());
    entranceAnims.current.length = 0;

    if (motionSafe) {
      leftX.set(-EDGE);
      rightX.set(EDGE);
      dividerScaleY.set(0);
      vsScale.set(2.2);
      ringScale.set(0.6);

      entranceAnims.current.push(
        animate(leftX, 0, { duration: ENTRANCE_S, ease: easings.enter }),
        animate(rightX, 0, { duration: ENTRANCE_S, ease: easings.enter }),
        animate(dividerScaleY, 1, {
          duration: ENTRANCE_S * 0.8,
          ease: easings.move,
        }),
        animate(vsScale, 1, { ...springs.flick, delay: ENTRANCE_S * 0.5 }),
        animate(ringScale, 1, { ...springs.flick, delay: ENTRANCE_S * 0.55 }),
      );
    } else {
      leftX.set(0);
      rightX.set(0);
      dividerScaleY.set(1);
      vsScale.set(1);
      ringScale.set(1);
    }
  };

  const beginClash = () => {
    setPhase("clash");
    scheduleTimer(
      () => {
        setFlareKey((k) => k + 1);
        setPhase("countdown");
        setCountdownValue(3);
        scheduleTimer(() => {
          setCountdownValue(2);
          scheduleTimer(() => {
            setCountdownValue(1);
            scheduleTimer(() => {
              setPhase("fight");
              setCountdownValue(null);
              setAnnounce("Fight.");
              onFightRef.current?.();
            }, COUNTDOWN_BEAT_MS);
          }, COUNTDOWN_BEAT_MS);
        }, COUNTDOWN_BEAT_MS);
      },
      motionSafe ? LUNGE_S * 1000 : 0,
    );
  };

  const lockSide = (side: Side) => {
    if (side === "you") {
      if (youLockedRef.current) return;
      youLockedRef.current = true;
      setYouLocked(true);
      setAnnounce("You locked in.");
    } else {
      if (foeLockedRef.current) return;
      foeLockedRef.current = true;
      setFoeLocked(true);
      setAnnounce(`${foe.name} locked in.`);
    }
    if (youLockedRef.current && foeLockedRef.current) beginClash();
  };

  // The opponent's auto-lock is scheduled once, at mount, inside a layout
  // effect — that timer only ever fires long after this render, but it
  // still closes over *this* render's `lockSide`. Dispatching through a
  // ref that every render refreshes keeps that later call reading current
  // motionSafe/props instead of the stale mount-time closure.
  const lockSideRef = React.useRef(lockSide);
  React.useEffect(() => {
    lockSideRef.current = lockSide;
  });

  useIsomorphicLayoutEffect(() => {
    beginEntrance();
    scheduleTimer(() => lockSideRef.current("foe"), foeDelayMs);

    const pendingTimers = timers.current;
    const pendingAnims = entranceAnims.current;
    return () => {
      pendingTimers.forEach((id) => window.clearTimeout(id));
      pendingTimers.clear();
      pendingAnims.forEach((a) => a.stop());
      pendingAnims.length = 0;
    };
    // Mount-only: the opponent's delay is fixed for the life of a round;
    // rematch() below reschedules everything explicitly for the next one.
  }, []);

  const rematch = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current.clear();

    youLockedRef.current = false;
    foeLockedRef.current = false;
    setYouLocked(false);
    setFoeLocked(false);
    setPhase("duel");
    setCountdownValue(null);
    setFlareKey(0);
    setAnnounce("Rematch. Face off reset.");

    beginEntrance();
    scheduleTimer(() => lockSideRef.current("foe"), foeDelayMs);
  };

  const lunging =
    phase === "clash" || phase === "countdown" || phase === "fight";
  const bothLocked = youLocked && foeLocked;
  const captionText =
    phase === "fight"
      ? "fight"
      : bothLocked
        ? "face off"
        : youLocked || foeLocked
          ? "locked in · waiting"
          : "lock in to ready up";

  return (
    <div
      className={cn("flex w-full max-w-2xl flex-col items-center", className)}
    >
      <div
        role="group"
        aria-label={`Duel ready, ${you.name} versus ${foe.name}`}
        className="relative h-72 w-full overflow-hidden rounded-3 border border-hairline bg-surface-1 shadow-raised sm:h-80"
      >
        <div
          aria-hidden
          className="absolute inset-0 z-0"
          style={{
            background: `linear-gradient(90deg, color-mix(in oklab, ${you.tint} 14%, transparent), transparent 45%, transparent 55%, color-mix(in oklab, ${foe.tint} 14%, transparent))`,
          }}
        />

        <motion.div
          style={{ x: leftX }}
          className="absolute inset-y-0 left-0 flex w-1/2 items-center justify-center p-3 sm:p-5"
        >
          <FighterSide
            fighter={you}
            locked={youLocked}
            isYou
            lunging={lunging}
            motionSafe={motionSafe}
            onLockIn={() => lockSide("you")}
          />
        </motion.div>

        <motion.div
          style={{ x: rightX }}
          className="absolute inset-y-0 right-0 flex w-1/2 items-center justify-center p-3 sm:p-5"
        >
          <FighterSide
            fighter={foe}
            locked={foeLocked}
            isYou={false}
            lunging={lunging}
            motionSafe={motionSafe}
          />
        </motion.div>

        <motion.div
          aria-hidden
          style={{ scaleY: dividerScaleY, transformOrigin: "top" }}
          className="pointer-events-none absolute inset-0 z-10"
        >
          <div
            className="absolute inset-y-0 left-1/2 w-4"
            style={{
              transform: "translateX(-50%) skewX(-10deg)",
              background:
                "linear-gradient(180deg, transparent, var(--hairline-strong) 15%, var(--hairline-strong) 85%, transparent)",
            }}
          />
        </motion.div>

        <div className="pointer-events-none absolute inset-0 z-20">
          {/* Each centering wrapper below is a plain (non-motion) span so its
              -translate-x/y-1/2 classes never fight the motion.* child's own
              Motion-managed transform (scale). */}
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <motion.span
              aria-hidden
              style={{
                scale: ringScale,
                borderColor: "color-mix(in oklab, var(--ink) 28%, transparent)",
              }}
              className="inline-block size-16 rounded-full border-2 sm:size-20"
            />
          </span>
          {(phase === "duel" || phase === "clash") && (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.span
                aria-hidden
                style={{ scale: vsScale }}
                className="inline-block font-mono text-2xl font-black tracking-wide text-ink sm:text-3xl"
              >
                VS
              </motion.span>
            </span>
          )}
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <AnimatePresence mode="wait" initial={false}>
              {phase === "countdown" && countdownValue !== null && (
                <motion.span
                  key={countdownValue}
                  aria-hidden
                  className="inline-block font-mono text-6xl font-bold text-ink tabular-nums sm:text-7xl"
                  initial={motionSafe ? { opacity: 0, scale: 0.4 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.7,
                    transition: {
                      duration: motionSafe ? durations.fast : 0,
                      ease: easings.exit,
                    },
                  }}
                >
                  {countdownValue}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </div>

        {motionSafe && flareKey > 0 && (
          <span
            key={flareKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
          >
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <motion.span
                className="inline-block size-16 rounded-full border-2 sm:size-20"
                style={{
                  borderColor:
                    "color-mix(in oklab, var(--ink) 65%, transparent)",
                }}
                initial={{ scale: 0.9, opacity: 0.9 }}
                animate={{ scale: 3, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            </span>
            <span className="absolute top-1/2 left-1/2 size-0 -translate-x-1/2 -translate-y-1/2">
              {FLARE_SPARKS.map((v, i) => (
                <motion.span
                  key={i}
                  className="absolute size-1 rounded-full"
                  style={{ background: "var(--ink)" }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: v.dx, y: v.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
            <motion.span
              className="absolute inset-y-0 w-1/3"
              style={{ background: SWEEP_GRADIENT }}
              initial={{ left: "-40%" }}
              animate={{ left: "140%" }}
              transition={{ duration: durations.page, ease: easings.move }}
            />
          </span>
        )}

        {motionSafe && phase === "fight" && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30"
            style={{ background: "var(--ink)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0] }}
            transition={{
              duration: FLASH_S,
              times: [0, 0.2, 1],
              ease: easings.move,
            }}
          />
        )}
      </div>

      <div className="mt-3 flex h-5 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionText}
            className="font-mono text-xs tracking-wide text-ink-3 lowercase"
            initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    y: -distances.nudge,
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

      <button
        type="button"
        onClick={rematch}
        className="hover:text-ink-1 mt-2 font-mono text-xs font-medium text-ink-2 underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      >
        rematch
      </button>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
