"use client";

import * as React from "react";

import { ChevronRight, RotateCcw, TriangleAlert } from "lucide-react";
import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Checkpoint count is clamped to a legible range — fewer reads as trivial,
 * more crowds the posts past recognition. */
const CHECKPOINTS_BOUNDS = { min: 3, max: 7 } as const;
const DEFAULT_CHECKPOINTS = 5;
const DEFAULT_SEGMENTS_PER_LEG = 4;

/** Meters credited per covered segment — arbitrary but round, so the
 * readout always shows friendly numbers. */
const DISTANCE_PER_SEGMENT = 10;

/** Track geometry, px. 1 segment = 1 tick = SEGMENT_SPACING of horizontal
 * room; nothing here is measured. */
const SEGMENT_SPACING = 22;
const TRACK_PAD_X = 40;
const TRACK_Y = 84;
const STAGE_H = 168;
const TICK_H = 3;
const TICK_GAP = 5;
const POST_DOT = 10;
const POLE_H = 34;
const FLAG_W = 20;
const FLAG_H = 13;
const RING_SIZE = 26;
const RUNNER_SIZE = 22;

/** Forward hop: a small bob riding the glide spring over to the next tick. */
const BOB_PX = 5;
const BOB_S = 0.4;

/** Stumble tumble: an authored, unapologetically fast tween — losing ground
 * takes noticeably less time than earning it back one segment at a time. */
const TUMBLE_S = 0.28;
const TUMBLE_DIP_PX = 7;
const TUMBLE_HOP_PX = -3;
const TUMBLE_TILT_DEG = 9;

/** How long a transient caption holds before clearing back to idle. */
const CAPTION_MS = 1300;
/** How long a just-planted post's pulse ring plays before it unmounts. */
const RING_MS = 650;
/** How long the finish spark burst plays before it unmounts. */
const SPARK_MS = 850;

/** The flag's fabric starts its unfurl once the pole has roughly settled —
 * springs.flick's documented settle time — so the two reads as one motion
 * cut into two beats, not two unrelated animations. */
const POLE_SETTLE_S = 0.12;

const TAU = Math.PI * 2;
const SPARK_COUNT = 8;
const SPARK_SPREAD = 24;
/** Eight fixed spark vectors thrown from the finish post — deterministic,
 * no Math.random, so every finish throws an identical burst. */
const FINISH_SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

const targetXFor = (segment: number): number =>
  TRACK_PAD_X + segment * SEGMENT_SPACING;

type GoingDark = { from: number; to: number };

type CheckpointPostProps = {
  checkpointNumber: number;
  isFinish: boolean;
  x: number;
  planted: boolean;
  lowerDelay: number;
  showRing: boolean;
  motionSafe: boolean;
};

/** One post: a base dot always on the line, a pole that rises on `flick`,
 * and a flag that unfurls on `snap` a beat after — a pure lookup driven by
 * props, never a hook, safe to call from inside the post map. */
function CheckpointPost({
  checkpointNumber,
  isFinish,
  x,
  planted,
  lowerDelay,
  showRing,
  motionSafe,
}: CheckpointPostProps): React.JSX.Element {
  const poleTransition = motionSafe
    ? { ...springs.flick, delay: planted ? 0 : lowerDelay }
    : { duration: 0 };
  const flagTransition = motionSafe
    ? {
        ...springs.snap,
        delay: planted ? POLE_SETTLE_S : lowerDelay,
      }
    : { duration: 0 };

  return (
    <React.Fragment>
      <span
        aria-hidden
        className={cn(
          "absolute rounded-full border-2 transition-colors duration-300",
          planted
            ? "border-primary bg-primary"
            : "border-hairline-strong bg-surface-1",
        )}
        style={{
          left: x,
          top: TRACK_Y,
          width: POST_DOT,
          height: POST_DOT,
          marginLeft: -POST_DOT / 2,
          marginTop: -POST_DOT / 2,
        }}
      />

      <motion.span
        aria-hidden
        className="absolute origin-bottom rounded-full bg-ink-2"
        style={{
          left: x,
          top: TRACK_Y - POLE_H,
          width: 2,
          height: POLE_H,
          marginLeft: -1,
        }}
        initial={false}
        animate={{ scaleY: planted ? 1 : 0 }}
        transition={poleTransition}
      />

      <motion.span
        aria-hidden
        className={cn(
          "absolute origin-left rounded-[1px]",
          isFinish ? "bg-warn" : "bg-primary",
        )}
        style={{
          left: x + 1,
          top: TRACK_Y - POLE_H,
          width: FLAG_W,
          height: FLAG_H,
          marginTop: -1,
        }}
        initial={false}
        animate={{ scaleX: planted ? 1 : 0 }}
        transition={flagTransition}
      />

      {motionSafe && showRing && (
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute rounded-full border-2",
            isFinish ? "border-warn" : "border-primary",
          )}
          style={{
            left: x,
            top: TRACK_Y,
            width: RING_SIZE,
            height: RING_SIZE,
            marginLeft: -RING_SIZE / 2,
            marginTop: -RING_SIZE / 2,
          }}
          initial={{ scale: 0.5, opacity: 0.9 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        />
      )}

      <span
        aria-hidden
        className="absolute font-mono text-[9px] text-ink-3 tabular-nums"
        style={{
          left: x,
          top: TRACK_Y + 13,
          width: 16,
          marginLeft: -8,
          textAlign: "center",
        }}
      >
        {checkpointNumber}
      </span>
    </React.Fragment>
  );
}

export type CheckpointRunProps = {
  /** Number of checkpoint posts along the run, including the finish.
   * Clamped to 3–7. @default 5 */
  checkpoints?: number;
  /** Segment ticks between one post and the next. @default 4 */
  segmentsPerLeg?: number;
  /** Fires the moment a checkpoint's flag plants, with its 1-based index. */
  onCheckpoint?: (index: number) => void;
  /** Fires once, the instant the final flag plants. */
  onFinish?: () => void;
  className?: string;
};

/**
 * A horizontal run built around one argument: progress that cannot be lost
 * is not progress, it is a countdown. "Run forward" moves the runner one
 * segment at a time — a `glide` slide with a small bob, the crossed tick
 * lighting behind it, and the distance readout rolling up. Reaching a post
 * plants its flag (pole up on `flick`, fabric unfurling on `snap` a beat
 * later), rings a pulse, names the checkpoint in a mono caption, and moves
 * the run's safe point there — a small "saved" tag rides along to mark it.
 * "Stumble" is the whole point: the runner tumbles back to that safe point
 * on a fast authored tween, the segments between go dark in a reverse
 * cascade, and the readout rolls back down — ground already banked at a
 * checkpoint is the only ground that survives. The final post also unfurls a
 * banner, throws eight sparks, and updates the best distance if this run
 * beat it; that best persists across resets, because chasing it is the loop.
 * "Reset run" drops the runner back to the start with every flag lowering in
 * a cascade, best untouched. Reduced motion: the runner jumps straight
 * between segments, flags appear planted instantly with no rings, and a
 * stumble is an instant snap back to the safe point with its caption — no
 * tumble, no cascade, no sparks.
 */
export function CheckpointRun({
  checkpoints: checkpointsProp = DEFAULT_CHECKPOINTS,
  segmentsPerLeg: segmentsPerLegProp = DEFAULT_SEGMENTS_PER_LEG,
  onCheckpoint,
  onFinish,
  className,
}: CheckpointRunProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const checkpointsCount = clamp(
    Math.round(checkpointsProp),
    CHECKPOINTS_BOUNDS.min,
    CHECKPOINTS_BOUNDS.max,
  );
  const segmentsPerLeg = Math.max(1, Math.round(segmentsPerLegProp));
  const totalSegments = checkpointsCount * segmentsPerLeg;
  const postCascadeStep = cascade(checkpointsCount);

  const [currentSegment, setCurrentSegment] = React.useState(0);
  const [planted, setPlanted] = React.useState<boolean[]>(() =>
    Array.from({ length: checkpointsCount }, () => false),
  );
  const [finished, setFinished] = React.useState(false);
  const [best, setBest] = React.useState(0);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [plantIndex, setPlantIndex] = React.useState<number | null>(null);
  const [sparkToken, setSparkToken] = React.useState<number | null>(null);
  const [goingDark, setGoingDark] = React.useState<GoingDark | null>(null);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth for the handlers below — a rapid-click
  // chain reading React state directly would race a stale closure.
  const currentSegmentRef = React.useRef(0);
  const plantedRef = React.useRef<boolean[]>(planted);
  const finishedRef = React.useRef(false);
  const bestRef = React.useRef(0);

  // Latest-ref mirrors, so timers scheduled ahead of time never act on a
  // stale preference or callback.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onCheckpointRef = React.useRef(onCheckpoint);
  React.useEffect(() => {
    onCheckpointRef.current = onCheckpoint;
  }, [onCheckpoint]);
  const onFinishRef = React.useRef(onFinish);
  React.useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  const runnerX = useMotionValue<number>(targetXFor(0));
  const runnerY = useMotionValue<number>(0);
  const runnerRotate = useMotionValue<number>(0);

  const runnerXAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const runnerYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const runnerRotateAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  const captionTimer = React.useRef<number | null>(null);
  const plantTimer = React.useRef<number | null>(null);
  const sparkTimer = React.useRef<number | null>(null);
  const darkTimer = React.useRef<number | null>(null);
  const sparkKeyRef = React.useRef(0);

  // Unmount teardown — every timer cleared, every in-flight animation
  // stopped.
  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      if (plantTimer.current !== null) window.clearTimeout(plantTimer.current);
      if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
      if (darkTimer.current !== null) window.clearTimeout(darkTimer.current);
      runnerXAnim.current?.stop();
      runnerYAnim.current?.stop();
      runnerRotateAnim.current?.stop();
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

  const plantedCount = planted.filter(Boolean).length;
  const safeSegment = plantedCount * segmentsPerLeg;
  const safeX = targetXFor(safeSegment);
  const finishX = targetXFor(totalSegments);
  const idleCaption = `${checkpointsCount} checkpoints ahead`;
  const captionText = caption ?? idleCaption;

  const handleFinish = (segment: number) => {
    finishedRef.current = true;
    setFinished(true);
    onFinishRef.current?.();

    const distance = segment * DISTANCE_PER_SEGMENT;
    const beatBest = distance > bestRef.current;
    if (beatBest) {
      bestRef.current = distance;
      setBest(distance);
    }

    // Terminal caption — held for good, like a finish line, not flashed.
    if (captionTimer.current !== null) {
      window.clearTimeout(captionTimer.current);
      captionTimer.current = null;
    }
    setCaption("run complete");
    setAnnounce(
      `Run complete. Distance ${distance} m.${beatBest ? " New best." : ""}`,
    );

    if (motionSafeRef.current) {
      sparkKeyRef.current += 1;
      setSparkToken(sparkKeyRef.current);
      if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
      sparkTimer.current = window.setTimeout(() => {
        sparkTimer.current = null;
        setSparkToken(null);
      }, SPARK_MS);
    }
  };

  const handleReachCheckpoint = (checkpointNumber: number, segment: number) => {
    plantedRef.current = plantedRef.current.map((v, i) =>
      i === checkpointNumber - 1 ? true : v,
    );
    setPlanted([...plantedRef.current]);
    onCheckpointRef.current?.(checkpointNumber);

    if (motionSafeRef.current) {
      setPlantIndex(checkpointNumber - 1);
      if (plantTimer.current !== null) window.clearTimeout(plantTimer.current);
      plantTimer.current = window.setTimeout(() => {
        plantTimer.current = null;
        setPlantIndex(null);
      }, RING_MS);
    }

    if (checkpointNumber === checkpointsCount) {
      handleFinish(segment);
    } else {
      flashCaption(
        `checkpoint · ${checkpointNumber} of ${checkpointsCount}`,
        CAPTION_MS,
      );
      setAnnounce(
        `Checkpoint ${checkpointNumber} of ${checkpointsCount} planted.`,
      );
    }
  };

  const handleAdvance = () => {
    if (finishedRef.current) return;
    const from = currentSegmentRef.current;
    if (from >= totalSegments) return;
    const to = from + 1;
    currentSegmentRef.current = to;
    setCurrentSegment(to);

    // A fresh advance always wins over a stumble still mid-flight.
    if (darkTimer.current !== null) {
      window.clearTimeout(darkTimer.current);
      darkTimer.current = null;
    }
    setGoingDark(null);
    runnerXAnim.current?.stop();
    runnerYAnim.current?.stop();
    runnerRotateAnim.current?.stop();

    if (motionSafeRef.current) {
      runnerXAnim.current = animate(runnerX, targetXFor(to), springs.glide);
      runnerY.jump(0);
      runnerYAnim.current = animate(runnerY, [0, -BOB_PX, 0], {
        duration: BOB_S,
        ease: easings.move,
        times: [0, 0.5, 1],
      });
      runnerRotate.jump(0);
    } else {
      runnerX.jump(targetXFor(to));
      runnerY.jump(0);
      runnerRotate.jump(0);
    }

    setAnnounce(`Advanced. Distance ${to * DISTANCE_PER_SEGMENT} m.`);

    if (to % segmentsPerLeg === 0) {
      handleReachCheckpoint(to / segmentsPerLeg, to);
    }
  };

  const handleStumble = () => {
    if (finishedRef.current) return;
    const from = currentSegmentRef.current;
    const safe = plantedRef.current.filter(Boolean).length * segmentsPerLeg;
    if (from <= safe) return;

    currentSegmentRef.current = safe;
    setCurrentSegment(safe);

    const safeCheckpointNumber = safe / segmentsPerLeg;
    const captionMsg =
      safeCheckpointNumber === 0
        ? "back to start"
        : `back to checkpoint ${safeCheckpointNumber}`;
    flashCaption(captionMsg, CAPTION_MS);
    setAnnounce(
      `Stumbled. ${captionMsg}. Distance ${safe * DISTANCE_PER_SEGMENT} m.`,
    );

    runnerXAnim.current?.stop();
    runnerYAnim.current?.stop();
    runnerRotateAnim.current?.stop();

    if (motionSafeRef.current) {
      const fromX = targetXFor(from);
      const toX = targetXFor(safe);
      runnerXAnim.current = animate(runnerX, [fromX, toX - 6, toX + 3, toX], {
        duration: TUMBLE_S,
        ease: easings.move,
        times: [0, 0.55, 0.82, 1],
      });
      runnerY.jump(0);
      runnerYAnim.current = animate(
        runnerY,
        [0, TUMBLE_DIP_PX, TUMBLE_HOP_PX, 0],
        { duration: TUMBLE_S, ease: easings.move, times: [0, 0.4, 0.72, 1] },
      );
      runnerRotate.jump(0);
      runnerRotateAnim.current = animate(
        runnerRotate,
        [0, -TUMBLE_TILT_DEG, TUMBLE_TILT_DEG * 0.5, 0],
        { duration: TUMBLE_S, ease: easings.move, times: [0, 0.4, 0.75, 1] },
      );

      setGoingDark({ from, to: safe });
      if (darkTimer.current !== null) window.clearTimeout(darkTimer.current);
      const darkSpan = cascade(Math.max(from - safe, 1)) * (from - safe) * 1000;
      darkTimer.current = window.setTimeout(
        () => {
          darkTimer.current = null;
          setGoingDark(null);
        },
        Math.max(TUMBLE_S * 1000, darkSpan) + 200,
      );
    } else {
      runnerX.jump(targetXFor(safe));
      runnerY.jump(0);
      runnerRotate.jump(0);
    }
  };

  const handleReset = () => {
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    if (plantTimer.current !== null) window.clearTimeout(plantTimer.current);
    if (sparkTimer.current !== null) window.clearTimeout(sparkTimer.current);
    if (darkTimer.current !== null) window.clearTimeout(darkTimer.current);
    captionTimer.current = null;
    plantTimer.current = null;
    sparkTimer.current = null;
    darkTimer.current = null;

    runnerXAnim.current?.stop();
    runnerYAnim.current?.stop();
    runnerRotateAnim.current?.stop();

    currentSegmentRef.current = 0;
    setCurrentSegment(0);
    plantedRef.current = Array.from({ length: checkpointsCount }, () => false);
    setPlanted([...plantedRef.current]);
    finishedRef.current = false;
    setFinished(false);
    setCaption(null);
    setPlantIndex(null);
    setSparkToken(null);
    setGoingDark(null);
    setAnnounce("Run reset.");

    runnerX.jump(targetXFor(0));
    runnerY.jump(0);
    runnerRotate.jump(0);
  };

  const stageWidth = finishX + TRACK_PAD_X;
  const canAdvance = !finished && currentSegment < totalSegments;
  const canStumble = !finished && currentSegment > safeSegment;
  const canReset = currentSegment > 0 || plantedCount > 0 || finished;

  return (
    <div
      className={cn(
        "w-full max-w-2xl rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="text-label text-ink-3">checkpoint run</span>
        <div className="flex flex-col items-end gap-0.5">
          <Readout
            value={currentSegment * DISTANCE_PER_SEGMENT}
            format={(v) => `${v} m`}
            size="md"
          />
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            best {best} m
          </span>
        </div>
      </div>

      <div className="relative mt-4 overflow-x-auto">
        <div
          className="relative"
          style={{ width: stageWidth, height: STAGE_H }}
        >
          {Array.from({ length: totalSegments }, (_, i) => {
            const lit = i < currentSegment;
            const darkDelay =
              goingDark && i >= goingDark.to && i < goingDark.from
                ? (goingDark.from - 1 - i) *
                  cascade(Math.max(goingDark.from - goingDark.to, 1))
                : 0;
            const tickTransition = motionSafe
              ? lit
                ? { duration: durations.base, ease: easings.enter }
                : {
                    duration: durations.fast,
                    ease: easings.exit,
                    delay: darkDelay,
                  }
              : { duration: 0 };
            const left = TRACK_PAD_X + i * SEGMENT_SPACING + TICK_GAP / 2;
            const width = SEGMENT_SPACING - TICK_GAP;
            return (
              <React.Fragment key={i}>
                <span
                  aria-hidden
                  className="absolute rounded-full bg-hairline-strong"
                  style={{
                    left,
                    top: TRACK_Y - TICK_H / 2,
                    width,
                    height: TICK_H,
                  }}
                />
                <motion.span
                  aria-hidden
                  className="absolute rounded-full bg-primary"
                  style={{
                    left,
                    top: TRACK_Y - TICK_H / 2,
                    width,
                    height: TICK_H,
                  }}
                  initial={false}
                  animate={{ opacity: lit ? 1 : 0 }}
                  transition={tickTransition}
                />
              </React.Fragment>
            );
          })}

          {Array.from({ length: checkpointsCount }, (_, index) => {
            const checkpointNumber = index + 1;
            const isFinish = checkpointNumber === checkpointsCount;
            const x = targetXFor(checkpointNumber * segmentsPerLeg);
            const lowerDelay = (checkpointsCount - 1 - index) * postCascadeStep;
            return (
              <CheckpointPost
                key={index}
                checkpointNumber={checkpointNumber}
                isFinish={isFinish}
                x={x}
                planted={planted[index] ?? false}
                lowerDelay={lowerDelay}
                showRing={plantIndex === index}
                motionSafe={motionSafe}
              />
            );
          })}

          {plantedCount > 0 && (
            <motion.span
              aria-hidden
              className="absolute rounded-full border border-primary/50 bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide text-primary uppercase"
              style={{ top: TRACK_Y + 26, marginLeft: -16 }}
              initial={false}
              animate={{ left: safeX }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              saved
            </motion.span>
          )}

          <AnimatePresence>
            {finished && (
              <motion.div
                aria-hidden
                className="absolute origin-left rounded-1 border border-warn/50 bg-warn/15 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] text-warn uppercase"
                style={{
                  left: finishX,
                  top: TRACK_Y - POLE_H - 24,
                  marginLeft: -28,
                }}
                initial={motionSafe ? { scaleX: 0, opacity: 0 } : false}
                animate={{ scaleX: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.fast } }}
                transition={
                  motionSafe
                    ? {
                        scaleX: { ...springs.snap, delay: POLE_SETTLE_S * 2 },
                        opacity: {
                          duration: durations.fast,
                          delay: POLE_SETTLE_S * 2,
                        },
                      }
                    : { duration: 0 }
                }
              >
                finish
              </motion.div>
            )}
          </AnimatePresence>

          {motionSafe && sparkToken !== null && (
            <span
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: finishX, top: TRACK_Y }}
            >
              {FINISH_SPARKS.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute size-1 rounded-full bg-warn"
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}

          <motion.div
            aria-hidden
            className="absolute z-10 flex items-center justify-center rounded-full border-2 border-primary-foreground bg-primary shadow-raised"
            style={{
              left: 0,
              top: TRACK_Y,
              width: RUNNER_SIZE,
              height: RUNNER_SIZE,
              marginLeft: -RUNNER_SIZE / 2,
              marginTop: -RUNNER_SIZE / 2,
              x: runnerX,
              y: runnerY,
              rotate: runnerRotate,
            }}
          >
            <span className="block size-2 rounded-full bg-primary-foreground" />
          </motion.div>
        </div>
      </div>

      <div
        aria-hidden
        className="mt-3 flex h-4 items-center justify-center overflow-hidden font-mono text-[11px] text-ink-2"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionText}
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
            className="tracking-[0.04em]"
          >
            {captionText}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleReset}
          disabled={!canReset}
          className={cn(
            "inline-flex items-center gap-1 rounded-1 px-1.5 py-1 font-mono text-[11px] text-ink-3 transition-colors outline-none hover:text-ink-2",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            !canReset && "pointer-events-none opacity-40",
          )}
        >
          <RotateCcw aria-hidden className="size-3" />
          Reset run
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Stumble"
            onClick={handleStumble}
            disabled={!canStumble}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors outline-none",
              "hover:text-ink",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            <TriangleAlert aria-hidden className="size-3.5" />
            Stumble
          </button>
          <button
            type="button"
            aria-label="Run forward"
            onClick={handleAdvance}
            disabled={!canAdvance}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-2 border border-transparent bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
              "hover:brightness-110 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
          >
            Advance
            <ChevronRight aria-hidden className="size-3.5" />
          </button>
        </div>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
