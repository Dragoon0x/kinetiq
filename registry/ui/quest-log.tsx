"use client";

import * as React from "react";

import { Check, Lock } from "lucide-react";
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

/** How long the light sweeps a completing row, left to right. */
const SWEEP_S = 0.5;
/** How long the strikethrough line takes to scale in from the title's left edge. */
const STRIKE_S = 0.3;
/** How long the wide sweep takes to cross the whole panel once the log clears. */
const PANEL_SWEEP_S = 0.6;

/**
 * Authored, not measured: the XP chip's flight toward the header total uses a
 * fixed per-row step rather than a DOM measurement, so the arc is identical
 * and SSR-safe on every render.
 */
const FLIGHT_DX = -4;
const FLIGHT_HEADER_GAP_PX = 56;
const FLIGHT_ROW_STEP_PX = 78;

type QuestStatus = "locked" | "active" | "complete";

type CelebrateStage = "sweep" | "reveal";

type Celebrate = {
  index: number;
  stage: CelebrateStage;
  revealed: boolean;
  quest: QuestItem;
};

export type QuestItem = {
  id: string;
  title: string;
  objective: string;
  /** Presses required to complete the quest. */
  target: number;
  /** XP awarded on completion. */
  xp: number;
};

export type QuestLogProps = {
  /** The rows, in unlock order. @default five work-flavoured quests */
  quests?: QuestItem[];
  /** Fires once, the moment each quest's completion ceremony finishes. */
  onComplete?: (id: string) => void;
  className?: string;
};

const DEFAULT_QUESTS: QuestItem[] = [
  {
    id: "board",
    title: "Cut the morning board",
    objective: "Lock the crew list before the gate opens.",
    target: 5,
    xp: 40,
  },
  {
    id: "audit",
    title: "Answer the audit",
    objective: "Close every open finding in the ledger.",
    target: 4,
    xp: 60,
  },
  {
    id: "inbox",
    title: "Clear the inbox backlog",
    objective: "Triage everything older than a week.",
    target: 6,
    xp: 30,
  },
  {
    id: "notes",
    title: "Ship the release notes",
    objective: "Draft, review, and send to the list.",
    target: 3,
    xp: 50,
  },
  {
    id: "expenses",
    title: "Reconcile the expense report",
    objective: "Match receipts to the statement, line by line.",
    target: 5,
    xp: 45,
  },
];

/**
 * A quest list built to be finished, not admired. Only the frontier quest is
 * active — its real "+1" button rolls the count on `Readout` and fills the
 * bar on `glide` with every press, the row answering each click with a small
 * `flick` of give. Hitting the target runs the row's own ceremony: a light
 * sweep, the glyph flipping to a check across two chained tweens, the title
 * striking through, and the XP chip peeling off toward the header total on
 * an authored flight while the next locked quest brightens and lifts on
 * `snap` — the chain is the hook. Clear every row and the footer reads "log
 * cleared."; "new log" reopens the whole list with a `cascade()` stagger.
 * Reduced motion: bars and counts snap straight to value, no sweep or flight
 * plays (the chip simply disappears as the total updates), unlocks swap
 * state instantly, and every row still reads clearly through its glyph,
 * strikethrough, and dimming alone.
 */
export function QuestLog({
  quests = DEFAULT_QUESTS,
  onComplete,
  className,
}: QuestLogProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [progress, setProgress] = React.useState<number[]>(() =>
    quests.map(() => 0),
  );
  const [completedCount, setCompletedCount] = React.useState(0);
  const [totalXp, setTotalXp] = React.useState(0);
  const [celebrate, setCelebrate] = React.useState<Celebrate | null>(null);
  const [resetKey, setResetKey] = React.useState(0);
  const [panelSweepKey, setPanelSweepKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const sweepTimer = React.useRef<number | null>(null);
  const flipTimer = React.useRef<number | null>(null);
  const flightTimer = React.useRef<number | null>(null);

  const clearCelebrationTimers = () => {
    if (sweepTimer.current !== null) window.clearTimeout(sweepTimer.current);
    if (flipTimer.current !== null) window.clearTimeout(flipTimer.current);
    if (flightTimer.current !== null) window.clearTimeout(flightTimer.current);
    sweepTimer.current = null;
    flipTimer.current = null;
    flightTimer.current = null;
  };

  React.useEffect(() => {
    return () => clearCelebrationTimers();
  }, []);

  const cascadeStep = cascade(quests.length);
  const allComplete = completedCount >= quests.length;
  const remaining = Math.max(0, quests.length - completedCount);

  const finalizeCelebration = (index: number, quest: QuestItem) => {
    setCompletedCount((c) => c + 1);
    setTotalXp((t) => t + quest.xp);
    setCelebrate((c) => (c && c.index === index ? null : c));
    const isLast = index + 1 >= quests.length;
    const nextTitle = quests[index + 1]?.title ?? "the next quest";
    setAnnounce(
      `${quest.title} complete. Plus ${quest.xp} XP.` +
        (isLast ? " Log cleared." : ` ${nextTitle} unlocked.`),
    );
    if (isLast) setPanelSweepKey((k) => k + 1);
    onCompleteRef.current?.(quest.id);
  };

  const handleAdvance = (index: number) => {
    if (celebrate) return;
    const quest = quests[index];
    if (!quest) return;
    const current = progress[index] ?? 0;
    if (current >= quest.target) return;
    const next = current + 1;

    setProgress((prev) => prev.map((p, i) => (i === index ? next : p)));

    if (next < quest.target) return;

    if (!motionSafe) {
      setCompletedCount((c) => c + 1);
      setTotalXp((t) => t + quest.xp);
      const isLast = index + 1 >= quests.length;
      const nextTitle = quests[index + 1]?.title ?? "the next quest";
      setAnnounce(
        `${quest.title} complete. Plus ${quest.xp} XP.` +
          (isLast ? " Log cleared." : ` ${nextTitle} unlocked.`),
      );
      onCompleteRef.current?.(quest.id);
      return;
    }

    clearCelebrationTimers();
    setCelebrate({ index, stage: "sweep", revealed: false, quest });

    sweepTimer.current = window.setTimeout(() => {
      sweepTimer.current = null;
      setCelebrate((c) =>
        c && c.index === index ? { ...c, stage: "reveal" } : c,
      );

      flipTimer.current = window.setTimeout(() => {
        flipTimer.current = null;
        setCelebrate((c) =>
          c && c.index === index ? { ...c, revealed: true } : c,
        );
      }, durations.fast * 1000);

      flightTimer.current = window.setTimeout(() => {
        flightTimer.current = null;
        finalizeCelebration(index, quest);
      }, durations.page * 1000);
    }, SWEEP_S * 1000);
  };

  const handleReset = () => {
    clearCelebrationTimers();
    setResetKey((k) => k + 1);
    setProgress(quests.map(() => 0));
    setCompletedCount(0);
    setTotalXp(0);
    setCelebrate(null);
    setPanelSweepKey(0);
    setAnnounce("Log reset. Every quest reopened.");
  };

  return (
    <div
      className={cn(
        "relative w-full max-w-md rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
      aria-label="Quest log"
    >
      {panelSweepKey > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <motion.span
            key={panelSweepKey}
            className="absolute inset-y-0 w-1/4 bg-primary-foreground/10"
            style={{ skewX: -14 }}
            initial={{ x: "-160%" }}
            animate={{ x: "420%" }}
            transition={
              motionSafe
                ? { duration: PANEL_SWEEP_S, ease: easings.linear }
                : { duration: 0 }
            }
          />
        </span>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
          Quests · Today
        </span>
        <span className="flex items-baseline gap-1 font-mono text-[10px] text-ink-3">
          <span className="tracking-[0.06em] uppercase">xp</span>
          <Readout value={totalXp} size="sm" className="text-ink-2" />
        </span>
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {quests.map((quest, index) => {
          const progressValue = Math.min(quest.target, progress[index] ?? 0);
          const isComplete = index < completedCount;
          const rowCelebrate =
            celebrate && celebrate.index === index ? celebrate : null;
          const isCelebrating = rowCelebrate !== null;
          const showSweep = rowCelebrate?.stage === "sweep";
          const showReveal = rowCelebrate?.stage === "reveal";
          const revealed = rowCelebrate?.revealed ?? false;

          const status: QuestStatus =
            isComplete || isCelebrating
              ? "complete"
              : index === completedCount
                ? "active"
                : "locked";
          const isLocked = status === "locked";
          const showButton = status === "active";
          const showStrike = isComplete || showReveal;

          const glyphKind:
            "locked" | "ring" | "flip-out" | "flip-in" | "check" =
            status === "locked"
              ? "locked"
              : showReveal
                ? revealed
                  ? "flip-in"
                  : "flip-out"
                : isComplete
                  ? "check"
                  : "ring";

          const pct =
            quest.target > 0
              ? Math.min(100, (progressValue / quest.target) * 100)
              : 100;

          const phaseKey = status === "locked" ? "locked" : "open";

          const ariaStatus = isLocked
            ? "locked"
            : status === "complete"
              ? `complete, ${quest.xp} XP claimed`
              : `in progress, ${progressValue} of ${quest.target}`;

          return (
            <motion.li
              key={`${quest.id}:${resetKey}`}
              aria-label={`${quest.title}. ${ariaStatus}.`}
              initial={motionSafe ? { opacity: 0, y: distances.step } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * cascadeStep,
                    }
                  : { duration: 0 }
              }
              className="relative list-none"
            >
              <motion.div
                key={phaseKey}
                initial={
                  motionSafe && status === "active"
                    ? { opacity: 0.6, y: distances.nudge }
                    : false
                }
                animate={{ opacity: 1, y: 0 }}
                transition={
                  motionSafe
                    ? status === "active"
                      ? springs.snap
                      : { duration: durations.base, ease: easings.enter }
                    : { duration: 0 }
                }
                whileTap={
                  motionSafe && status === "active"
                    ? { scale: 0.99 }
                    : undefined
                }
                className={cn(
                  "relative overflow-visible rounded-3 border p-3.5",
                  status === "locked" &&
                    "border-hairline bg-surface-2 opacity-55",
                  status === "active" && "border-hairline-strong bg-surface-2",
                  status === "complete" && "border-hairline bg-surface-2",
                )}
              >
                {showSweep && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
                  >
                    <motion.span
                      className="absolute inset-y-0 w-1/3 bg-primary-foreground/20"
                      style={{ skewX: -14 }}
                      initial={{ x: "-160%" }}
                      animate={{ x: "420%" }}
                      transition={
                        motionSafe
                          ? { duration: SWEEP_S, ease: easings.linear }
                          : { duration: 0 }
                      }
                    />
                  </span>
                )}

                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                    {glyphKind === "locked" && (
                      <Lock aria-hidden className="size-3.5 text-ink-3" />
                    )}
                    {glyphKind === "ring" && (
                      <span
                        aria-hidden
                        className="block size-2.5 rounded-full bg-primary"
                      />
                    )}
                    {glyphKind === "flip-out" && (
                      <motion.span
                        aria-hidden
                        className="block size-2.5 rounded-full bg-primary"
                        initial={{ scaleX: 1 }}
                        animate={{ scaleX: 0 }}
                        transition={
                          motionSafe
                            ? { duration: durations.fast, ease: easings.exit }
                            : { duration: 0 }
                        }
                      />
                    )}
                    {glyphKind === "flip-in" && (
                      <motion.span
                        aria-hidden
                        className="flex"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={
                          motionSafe
                            ? { duration: durations.base, ease: easings.enter }
                            : { duration: 0 }
                        }
                      >
                        <Check className="size-3.5 text-[var(--success,#047857)]" />
                      </motion.span>
                    )}
                    {glyphKind === "check" && (
                      <Check
                        aria-hidden
                        className="size-3.5 text-[var(--success,#047857)]"
                      />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <span className="relative inline-block max-w-full truncate align-bottom">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isLocked
                            ? "text-ink-3"
                            : status === "complete"
                              ? "text-ink-2"
                              : "text-ink",
                        )}
                      >
                        {quest.title}
                      </span>
                      {showStrike && (
                        <motion.span
                          aria-hidden
                          className="absolute top-[0.6em] left-0 h-px w-full bg-current"
                          style={{ transformOrigin: "0% 50%" }}
                          initial={motionSafe ? { scaleX: 0 } : { scaleX: 1 }}
                          animate={{ scaleX: 1 }}
                          transition={
                            motionSafe
                              ? { duration: STRIKE_S, ease: easings.enter }
                              : { duration: 0 }
                          }
                        />
                      )}
                    </span>

                    <p
                      className={cn(
                        "mt-0.5 truncate text-xs",
                        isLocked ? "text-ink-3" : "text-ink-2",
                      )}
                    >
                      {quest.objective}
                    </p>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-1">
                        <motion.span
                          aria-hidden
                          className={cn(
                            "absolute inset-y-0 left-0 rounded-full transition-colors duration-300",
                            status === "complete"
                              ? "bg-[var(--success,#047857)]"
                              : "bg-primary",
                          )}
                          animate={{ width: `${pct}%` }}
                          transition={
                            motionSafe ? springs.glide : { duration: 0 }
                          }
                        />
                      </div>
                      <span className="flex shrink-0 items-baseline gap-0.5 font-mono text-[11px] text-ink-3 tabular-nums">
                        <Readout value={progressValue} size="sm" />
                        <span>/ {quest.target}</span>
                      </span>
                    </div>
                  </div>

                  <span className="relative flex shrink-0 flex-col items-end gap-1.5">
                    <span
                      className={cn(
                        "flex items-center gap-1 rounded-2 border px-1.5 py-0.5 font-mono text-[10px] font-semibold",
                        isLocked
                          ? "border-hairline text-ink-3"
                          : status === "complete"
                            ? "border-hairline bg-surface-1 text-ink-3"
                            : "border-hairline-strong text-ink-2",
                      )}
                    >
                      {status === "complete" && (
                        <Check
                          aria-hidden
                          className="size-2.5 text-[var(--success,#047857)]"
                        />
                      )}
                      +{quest.xp} XP
                    </span>

                    {showButton && (
                      <motion.button
                        type="button"
                        aria-label={`Advance the ${quest.title} quest`}
                        onClick={() => handleAdvance(index)}
                        whileTap={motionSafe ? { scale: 0.94 } : undefined}
                        transition={springs.flick}
                        className={cn(
                          "rounded-2 bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
                          "hover:brightness-110 active:brightness-95",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
                        )}
                      >
                        +1
                      </motion.button>
                    )}
                  </span>
                </div>

                {showReveal && (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute top-3 right-3 z-20 rounded-2 border border-hairline-strong bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-2"
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{
                      x: FLIGHT_DX,
                      y: -(FLIGHT_HEADER_GAP_PX + index * FLIGHT_ROW_STEP_PX),
                      opacity: 0,
                      scale: 0.85,
                    }}
                    transition={
                      motionSafe
                        ? { duration: durations.page, ease: easings.exit }
                        : { duration: 0 }
                    }
                  >
                    +{quest.xp} XP
                  </motion.span>
                )}
              </motion.div>
            </motion.li>
          );
        })}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={allComplete ? "cleared" : "remaining"}
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
              {allComplete
                ? "log cleared."
                : `${remaining} quest${remaining === 1 ? "" : "s"} left`}
            </motion.span>
          </AnimatePresence>
        </span>

        {allComplete && (
          <button
            type="button"
            onClick={handleReset}
            className="font-mono text-[11px] font-medium text-ink-2 underline underline-offset-2 transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
          >
            new log
          </button>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
