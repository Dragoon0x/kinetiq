"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** How far the plunger drives down per press, in px. */
const PLUNGER_TRAVEL = 13;

/** The beat between the pop and the next balloon arriving, in ms. */
const POP_BEAT_MS = 700;

/** Balloon body footprint at scale 1, in px. */
const BALLOON_W = 72;
const BALLOON_H = 92;

/** Scene geometry — hand-set so the hose meets the nozzle exactly. */
const SCENE_W = 236;
const SCENE_H = 148;
const HOSE_LEFT = 48;
const HOSE_WIDTH = 116;
const NOZZLE_X = 160;
const BALLOON_CENTER_X = 164;

/** Fixed color cycle the balloons rotate through, token palette only. */
const COLORS = [
  "var(--primary)",
  "var(--success, #047857)",
  "var(--warning, #b45309)",
  "var(--ink-2)",
] as const;

/**
 * Fixed scrap vectors — seven rubber shreds, thrown up and out, one per
 * index. Every pop flings the exact same debris: no randomness anywhere.
 */
const SCRAPS = [
  { dx: -44, dy: -38, fall: 34, rot: -160, w: 10, h: 5, dur: 0.62 },
  { dx: -26, dy: -56, fall: 40, rot: 130, w: 8, h: 4, dur: 0.58 },
  { dx: 2, dy: -62, fall: 44, rot: -110, w: 11, h: 5, dur: 0.66 },
  { dx: 30, dy: -52, fall: 38, rot: 150, w: 8, h: 4, dur: 0.6 },
  { dx: 48, dy: -30, fall: 32, rot: -140, w: 10, h: 5, dur: 0.56 },
  { dx: 36, dy: -6, fall: 26, rot: 120, w: 7, h: 4, dur: 0.52 },
  { dx: -38, dy: -10, fall: 24, rot: -120, w: 9, h: 4, dur: 0.54 },
] as const;

/**
 * The fixed size ladder. Width climbs linearly toward full; height picks up
 * a little extra stretch per stage, so a fuller balloon reads more taut.
 */
const stageScale = (
  stage: number,
  stageCount: number,
): { sx: number; sy: number } => {
  const sx = 0.28 + 0.72 * (stage / stageCount);
  return { sx, sy: sx * (1 + 0.05 * stage) };
};

export type BalloonPumpProps = {
  /** Presses until the pop. Clamped to 4–8. @default 6 */
  stages?: number;
  /** Fires the instant a balloon bursts, with the color that just died. */
  onPop?: (color: string) => void;
  className?: string;
};

/**
 * A hand pump inflating a balloon that will, inevitably, pop. Each press
 * drives the plunger down on `flick` and back on `snap`, sends an air puff
 * down the hose, and grows the balloon one fixed stage with a stretchy
 * `recoil` overshoot. At the penultimate stage the balloon trembles faintly,
 * so everyone braces; one press later it bursts into seven fixed rubber
 * scraps and a ring flash while the pump does a startled hop, and a beat
 * later a fresh balloon in the next palette color glides in deflated. The
 * whole toy is deterministic — hand-set scrap vectors and a fixed color
 * cycle — and a polite live region narrates each stage and the pop.
 * Reduced motion: presses swap balloon sizes instantly and the pop cuts
 * straight to the next deflated balloon behind a static caption beat — no
 * scraps, trembles, puffs, or hops.
 */
export function BalloonPump({
  stages = 6,
  onPop,
  className,
}: BalloonPumpProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const stageCount = Math.min(8, Math.max(4, Math.round(stages)));

  const [stage, setStage] = React.useState(0);
  const [popped, setPopped] = React.useState(false);
  const [colorIndex, setColorIndex] = React.useState(0);
  // A fresh key per press mounts a fresh puff dash on the hose.
  const [puffSerial, setPuffSerial] = React.useState(0);

  // Imperative motion values so a press can chain set-peak/animate-to-rest
  // springs: plunger down-and-back, balloon overshoot, startled pump hop.
  const plungerY = useMotionValue(0);
  const pumpY = useMotionValue(0);
  const initial = stageScale(0, stageCount);
  const balloonX = useMotionValue(initial.sx);
  const balloonY = useMotionValue(initial.sy);

  const plungerAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const hopAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const growXAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const growYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const popTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (popTimer.current !== null) window.clearTimeout(popTimer.current);
    };
  }, []);

  const color = COLORS[colorIndex % COLORS.length] ?? "var(--primary)";
  const shownStage = Math.min(stage, stageCount);
  const trembling = motionSafe && !popped && stage === stageCount - 1;

  const handlePump = () => {
    if (popped) return;

    if (motionSafe) {
      // Plunger drives down on flick, then releases back up on snap.
      plungerAnim.current?.stop();
      plungerAnim.current = animate(plungerY, PLUNGER_TRAVEL, {
        ...springs.flick,
        onComplete: () => {
          plungerAnim.current = animate(plungerY, 0, springs.snap);
        },
      });
      // One puff of air chases the press down the hose.
      setPuffSerial((s) => s + 1);
    }

    const next = stage + 1;

    if (next >= stageCount) {
      // POP. The scraps read the dying color, so advance it only afterward.
      onPop?.(color);
      setPopped(true);
      if (motionSafe) {
        hopAnim.current?.stop();
        pumpY.set(-6);
        hopAnim.current = animate(pumpY, 0, springs.recoil);
      } else {
        // Reduced motion: cut straight to the next deflated balloon and let
        // the caption hold its "POP" beat statically.
        const rest = stageScale(0, stageCount);
        balloonX.set(rest.sx);
        balloonY.set(rest.sy);
        setColorIndex((i) => i + 1);
        setStage(0);
      }
      if (popTimer.current !== null) window.clearTimeout(popTimer.current);
      popTimer.current = window.setTimeout(() => {
        if (motionSafe) {
          const rest = stageScale(0, stageCount);
          balloonX.set(rest.sx);
          balloonY.set(rest.sy);
          setColorIndex((i) => i + 1);
          setStage(0);
        }
        setPopped(false);
      }, POP_BEAT_MS);
      return;
    }

    setStage(next);
    const target = stageScale(next, stageCount);
    if (motionSafe) {
      // Set slightly past the stage — taller and a touch narrower, like air
      // just slammed in — then let recoil bounce it onto the stage size.
      growXAnim.current?.stop();
      growYAnim.current?.stop();
      balloonX.set(target.sx * 0.94);
      balloonY.set(target.sy * 1.08);
      growXAnim.current = animate(balloonX, target.sx, springs.recoil);
      growYAnim.current = animate(balloonY, target.sy, springs.recoil);
    } else {
      balloonX.set(target.sx);
      balloonY.set(target.sy);
    }
  };

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: SCENE_W, height: SCENE_H }}>
        {/* Pump — the one real control. The wrapper hops when startled. */}
        <motion.div className="absolute bottom-0 left-0" style={{ y: pumpY }}>
          <button
            type="button"
            aria-label="Pump"
            onClick={handlePump}
            className={cn(
              "relative flex w-16 cursor-pointer flex-col items-center rounded-2 outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60",
              !motionSafe && "active:brightness-95",
            )}
          >
            <motion.span
              aria-hidden
              className="relative z-0 flex flex-col items-center"
              style={{ y: plungerY }}
            >
              <span className="block h-2 w-12 rounded-full border border-hairline-strong bg-surface-2 shadow-raised" />
              <span
                className="block h-5 w-1.5"
                style={{ background: "var(--ink-3)" }}
              />
            </motion.span>
            <span className="relative z-10 block h-14 w-9 rounded-2 border border-hairline-strong bg-surface-2 shadow-raised">
              <span
                aria-hidden
                className="absolute inset-x-1 top-1.5 block h-px"
                style={{ background: "var(--hairline-strong)" }}
              />
            </span>
            <span className="block h-1.5 w-14 rounded-full border border-hairline bg-surface-1" />
          </button>
        </motion.div>

        {/* Hose, with the air puff dash that chases each press. */}
        <span
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: HOSE_LEFT,
            bottom: 8,
            width: HOSE_WIDTH,
            height: 3,
            background: "var(--hairline-strong)",
          }}
        >
          {motionSafe && puffSerial > 0 && (
            <motion.span
              key={puffSerial}
              className="absolute top-0 left-0 h-[3px] w-2.5 rounded-full"
              style={{ background: "var(--ink-2)" }}
              initial={{ x: 0, opacity: 0 }}
              animate={{ x: HOSE_WIDTH - 10, opacity: [0, 1, 0] }}
              transition={{
                x: { duration: durations.base, ease: easings.move },
                opacity: {
                  duration: durations.base,
                  ease: easings.exit,
                  times: [0, 0.25, 1],
                },
              }}
            />
          )}
        </span>

        {/* Nozzle. */}
        <span
          aria-hidden
          className="absolute rounded-t-sm"
          style={{
            left: NOZZLE_X,
            bottom: 6,
            width: 8,
            height: 16,
            background: "var(--ink-3)",
          }}
        />

        {/* Balloon — mount glides the fresh one in; the tremble layer only
            wiggles at the penultimate stage; the inner layer holds stage
            scale, anchored to the nozzle. */}
        <span
          aria-hidden
          className="absolute flex items-end justify-center"
          style={{ left: BALLOON_CENTER_X - 46, bottom: 22, width: 92 }}
        >
          {(!popped || !motionSafe) && (
            <motion.div
              key={colorIndex}
              className="origin-bottom"
              initial={
                motionSafe && colorIndex > 0
                  ? { opacity: 0, scaleX: 0.7, scaleY: 0.3 }
                  : false
              }
              animate={{ opacity: 1, scaleX: 1, scaleY: 1 }}
              transition={springs.glide}
            >
              <motion.div
                className="origin-bottom"
                animate={{ x: trembling ? [-0.7, 0.7] : 0 }}
                transition={
                  trembling
                    ? {
                        duration: 0.1,
                        repeat: Infinity,
                        repeatType: "mirror",
                        ease: easings.move,
                      }
                    : { duration: durations.fast }
                }
              >
                <motion.div
                  className="flex origin-bottom flex-col items-center"
                  style={{ scaleX: balloonX, scaleY: balloonY }}
                >
                  <span
                    className="relative block"
                    style={{
                      width: BALLOON_W,
                      height: BALLOON_H,
                      background: color,
                      borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                    }}
                  >
                    <span
                      className="absolute inset-0"
                      style={{
                        borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                        background:
                          "radial-gradient(circle at 32% 24%, var(--primary-foreground) 0%, transparent 42%)",
                        opacity: 0.4,
                      }}
                    />
                  </span>
                  <span
                    className="-mt-[3px] block"
                    style={{
                      width: 12,
                      height: 7,
                      background: color,
                      borderRadius: "30% 30% 50% 50%",
                    }}
                  />
                </motion.div>
              </motion.div>
            </motion.div>
          )}
        </span>

        {/* Pop debris: ring flash + seven fixed scraps, mounted per pop and
            ending invisible; the wrapper fades out at refill. */}
        <AnimatePresence>
          {motionSafe && popped && (
            <motion.span
              key="pop"
              aria-hidden
              className="pointer-events-none absolute"
              style={{ left: BALLOON_CENTER_X, bottom: 64 }}
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: durations.blink }}
            >
              <motion.span
                className="absolute rounded-full"
                style={{
                  width: 96,
                  height: 96,
                  left: -48,
                  top: -48,
                  borderWidth: 3,
                  borderStyle: "solid",
                  borderColor: color,
                }}
                initial={{ scale: 0.45, opacity: 0.9 }}
                animate={{ scale: 1.45, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
              {SCRAPS.map((scrap, i) => (
                <motion.span
                  key={i}
                  className="absolute top-0 left-0"
                  style={{
                    width: scrap.w,
                    height: scrap.h,
                    marginLeft: -scrap.w / 2,
                    marginTop: -scrap.h / 2,
                    background: color,
                    borderRadius: "40% 60% 55% 45%",
                  }}
                  initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                  animate={{
                    x: [0, scrap.dx, scrap.dx * 1.12],
                    y: [0, scrap.dy, scrap.dy + scrap.fall],
                    rotate: [0, scrap.rot * 0.6, scrap.rot],
                    opacity: [1, 1, 0],
                  }}
                  transition={{
                    duration: scrap.dur,
                    ease: easings.exit,
                    times: [0, 0.45, 1],
                  }}
                />
              ))}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <p aria-hidden className="font-mono text-xs text-ink-3 tabular-nums">
        {popped ? "POP" : `stage ${shownStage} of ${stageCount}`}
      </p>

      {/* Announce the story without leaning on the visible caption. */}
      <span aria-live="polite" className="sr-only">
        {popped
          ? "Balloon popped"
          : `Balloon at stage ${shownStage} of ${stageCount}`}
      </span>
    </div>
  );
}
