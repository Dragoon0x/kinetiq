"use client";

import * as React from "react";

import { Heart } from "lucide-react";
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

const TAU = Math.PI * 2;

/** SVG stage geometry — fixed pixel space, body baseline near the bottom so
 * every stage's body still "stands" on the same line as it grows taller. */
const VIEW_W = 140;
const VIEW_H = 120;
const STAGE_H = 128;
const CX = 70;
const BODY_BASELINE = 112;

/** Fixed shape parameters per stage — the body eases between these on
 * `glide`; ears, tail, and the elder mark simply switch on once their stage
 * arrives. */
type StageShape = {
  key: "hatchling" | "sprout" | "companion" | "elder";
  bodyRx: number;
  bodyRy: number;
  eyeR: number;
  eyeGap: number;
  hasEars: boolean;
  hasTail: boolean;
  mark: boolean;
};

const HATCHLING_SHAPE: StageShape = {
  key: "hatchling",
  bodyRx: 22,
  bodyRy: 20,
  eyeR: 6.5,
  eyeGap: 8,
  hasEars: false,
  hasTail: false,
  mark: false,
};

const STAGE_SHAPES: readonly StageShape[] = [
  HATCHLING_SHAPE,
  {
    key: "sprout",
    bodyRx: 25,
    bodyRy: 27,
    eyeR: 5.5,
    eyeGap: 9.5,
    hasEars: true,
    hasTail: false,
    mark: false,
  },
  {
    key: "companion",
    bodyRx: 31,
    bodyRy: 32,
    eyeR: 5,
    eyeGap: 11.5,
    hasEars: true,
    hasTail: true,
    mark: false,
  },
  {
    key: "elder",
    bodyRx: 37,
    bodyRy: 36,
    eyeR: 4.5,
    eyeGap: 13.5,
    hasEars: true,
    hasTail: true,
    mark: true,
  },
];

const shapeForStage = (idx: number): StageShape =>
  STAGE_SHAPES[idx] ?? HATCHLING_SHAPE;

/** Bond thresholds a stage turns over at — crossed upward, never re-walked
 * down; the pet just quietly follows bond in both directions. */
const STAGE_UP_AT = [25, 50, 80] as const;
const stageIndexForBond = (bond: number): number => {
  let idx = 0;
  for (const threshold of STAGE_UP_AT) {
    if (bond >= threshold) idx += 1;
  }
  return idx;
};

type Mood = "content" | "restless" | "lonely" | "forlorn";

const moodForBond = (bond: number): Mood => {
  if (bond < 12) return "forlorn";
  if (bond < 30) return "lonely";
  if (bond < 50) return "restless";
  return "content";
};

/** Same ladder as moodForBond, as an index — used only to test whether a
 * bond change actually crossed a mood boundary. */
const moodIndexForBond = (bond: number): number => {
  if (bond < 12) return 0;
  if (bond < 30) return 1;
  if (bond < 50) return 2;
  return 3;
};

/** Idle decay runs on its own tick, never the wall clock. */
const DECAY_INTERVAL_MS = 4000;

const BLINK_EVERY_MS = 3200;
const BLINK_HOLD_MS = 120;

const FEED_BOND = 12;
const PLAY_BOND = 8;

/** How long a happy pose (squint eyes) holds before reverting. */
const HAPPY_POSE_MS = 560;
const HEART_MS = 850;
const BALL_MS = 700;
const PLAY_DANCE_S = 0.5;
const BRIGHTEN_MS = 340;

const STAGEUP_CAPTION_MS = 1300;
const STAGEUP_RING_S = 0.6;
const STAGEUP_SPARK_S = durations.slow;
const STAGEUP_RING_SIZE = 92;

/** Two-hop dance — a multi-keyframe tween, never a spring. */
const HOP_Y = [0, -9, 0, -9, 0] as const;
const HOP_TIMES = [0, 0.22, 0.5, 0.78, 1] as const;

/** The tossed ball's arc — also a multi-keyframe tween. */
const BALL_X = [-32, 0, 32] as const;
const BALL_Y = [0, -22, 0] as const;
const BALL_TIMES = [0, 0.5, 1] as const;

/** How far the gaze drifts toward the card's edge once lonely. */
const GAZE_OFFSET = -8;

const STAGEUP_SPARK_COUNT = 6;
const STAGEUP_SPARK_SPREAD = 24;
/** Six fixed spark vectors — never random, every stage-up throws the same
 * burst. */
const STAGEUP_SPARKS = Array.from({ length: STAGEUP_SPARK_COUNT }, (_, i) => {
  const angle = (i / STAGEUP_SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * STAGEUP_SPARK_SPREAD,
    dy: Math.sin(angle) * STAGEUP_SPARK_SPREAD,
  };
});

/** Pet tint stays off the interactive cobalt accent — body warms from
 * `--primary`, everything vitality-related (bond fill, mark, sparks) from
 * `--success`. */
const PET_BODY = "color-mix(in oklab, var(--primary) 38%, var(--card))";
const PET_BODY_SHADE = "color-mix(in oklab, var(--primary) 56%, var(--card))";
const BOND_FILL =
  "color-mix(in oklab, var(--success, #047857) 65%, var(--card))";
const MARK_COLOR =
  "color-mix(in oklab, var(--success, #047857) 78%, var(--primary-foreground))";
const RING_COLOR =
  "color-mix(in oklab, var(--success, #047857) 55%, transparent)";
const SPARK_COLOR =
  "color-mix(in oklab, var(--success, #047857) 72%, var(--primary-foreground))";
const BALL_COLOR =
  "color-mix(in oklab, var(--success, #047857) 55%, var(--card))";
const HEART_COLOR =
  "color-mix(in oklab, var(--primary) 65%, var(--primary-foreground))";

export type PetCompanionProps = {
  /** Starting bond, 0-100. @default 46 */
  bond?: number;
  /** Bond lost per idle tick, applied every ~4s. @default 1 */
  decayPerTick?: number;
  /** Fires the moment bond crosses upward into a new growth stage. Never
   * fires on the way back down. */
  onStageUp?: (stage: string) => void;
  className?: string;
};

/**
 * A round creature that grows through four fixed stages — hatchling, sprout,
 * companion, elder — as bond climbs from 0 to 100, its body, eyes, ears,
 * tail, and elder mark each a fixed set of shape parameters the pet eases
 * toward on `glide`; crossing a stage boundary upward throws a brief
 * ring-and-spark celebration and fires `onStageUp`, though falling back down
 * through a boundary is quiet — no fanfare, just a smaller pet. FEED adds
 * bond with a `recoil` bounce, eyes that squint into a smile arc, and a heart
 * that floats off; PLAY adds a little less bond but earns a two-hop dance and
 * a tossed ball, and both instantly brighten a drooping, curled-up mood back
 * toward content. Left alone, a fixed-interval tick drains bond on its own
 * clock — never the wall clock — degrading the mood line through content,
 * restless, lonely, and forlorn: ears droop and the gaze drifts toward the
 * edge of the card at lonely, and the pet curls up and the card dims at
 * forlorn. A pet that cannot be neglected is a toy, not a companion. Both
 * eyes blink on a fixed clock, the cheapest tell that anything in here is
 * alive.
 * Reduced motion: no bounce, dance, hearts, sparks, ring, or blinking —
 * feeding and playing swap in a still happy pose for a beat instead, stage
 * changes swap size instantly (the caption still plays), and every mood
 * shift is an instant pose swap rather than a glide.
 */
export function PetCompanion({
  bond: bondProp = 46,
  decayPerTick = 1,
  onStageUp,
  className,
}: PetCompanionProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const startBond = clamp(bondProp, 0, 100);

  const [bond, setBond] = React.useState(startBond);
  const [happyPose, setHappyPose] = React.useState(false);
  const [moodOverride, setMoodOverride] = React.useState<"playing" | null>(
    null,
  );
  const [heartVisible, setHeartVisible] = React.useState(false);
  const [heartKey, setHeartKey] = React.useState(0);
  const [ballVisible, setBallVisible] = React.useState(false);
  const [ballKey, setBallKey] = React.useState(0);
  const [ringKey, setRingKey] = React.useState(0);
  const [stageUpCaption, setStageUpCaption] = React.useState<string | null>(
    null,
  );
  const [brighten, setBrighten] = React.useState(false);
  const [blink, setBlink] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth for the handlers — an interval tick or a
  // rapid double-click would otherwise race a stale closure.
  const bondRef = React.useRef(startBond);
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const decayPerTickRef = React.useRef(Math.max(0, decayPerTick));
  React.useEffect(() => {
    decayPerTickRef.current = Math.max(0, decayPerTick);
  }, [decayPerTick]);
  const onStageUpRef = React.useRef(onStageUp);
  React.useEffect(() => {
    onStageUpRef.current = onStageUp;
  }, [onStageUp]);

  const poseTimer = React.useRef<number | null>(null);
  const moodOverrideTimer = React.useRef<number | null>(null);
  const heartTimer = React.useRef<number | null>(null);
  const ballTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);
  const brightenTimer = React.useRef<number | null>(null);

  const bounceScale = useMotionValue<number>(1);
  const hopY = useMotionValue<number>(0);
  const fillValue = useMotionValue<number>(startBond);
  const fillWidth = useTransform(fillValue, (v) => `${v}%`);

  React.useEffect(() => {
    return () => {
      if (poseTimer.current !== null) window.clearTimeout(poseTimer.current);
      if (moodOverrideTimer.current !== null)
        window.clearTimeout(moodOverrideTimer.current);
      if (heartTimer.current !== null) window.clearTimeout(heartTimer.current);
      if (ballTimer.current !== null) window.clearTimeout(ballTimer.current);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      if (brightenTimer.current !== null)
        window.clearTimeout(brightenTimer.current);
    };
  }, []);

  // Fixed-clock blink — the cheapest aliveness cue, and entirely off under
  // reduced motion rather than merely un-eased.
  React.useEffect(() => {
    if (!motionSafe) return;
    let hold: number | null = null;
    const interval = window.setInterval(() => {
      setBlink(true);
      hold = window.setTimeout(() => setBlink(false), BLINK_HOLD_MS);
    }, BLINK_EVERY_MS);
    return () => {
      window.clearInterval(interval);
      if (hold !== null) window.clearTimeout(hold);
    };
  }, [motionSafe]);

  const triggerStageUp = (nextStageIdx: number) => {
    const label = shapeForStage(nextStageIdx).key;
    onStageUpRef.current?.(label);
    setStageUpCaption("grew up");
    setAnnounce(`Grew up. Now a ${label}.`);

    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setStageUpCaption(null);
    }, STAGEUP_CAPTION_MS);

    if (motionSafeRef.current) {
      setRingKey((k) => k + 1);
    }
  };

  /** Applies a bond change, tracks stage crossings, and keeps the fill meter
   * in sync. `actionLabel` is announced only for routine changes — a
   * stage-up announces itself, and idle decay stays quiet. */
  const applyBondDelta = (delta: number, actionLabel: string | null) => {
    const prevBond = bondRef.current;
    const nextBond = clamp(prevBond + delta, 0, 100);
    bondRef.current = nextBond;
    setBond(nextBond);

    if (motionSafeRef.current) {
      animate(fillValue, nextBond, springs.glide);
    } else {
      fillValue.jump(nextBond);
    }

    const prevStage = stageIndexForBond(prevBond);
    const nextStage = stageIndexForBond(nextBond);
    if (nextStage > prevStage) {
      triggerStageUp(nextStage);
    } else if (actionLabel) {
      setAnnounce(`${actionLabel}. Bond ${nextBond}.`);
    }

    return nextBond;
  };

  // A latest-ref mirror, refreshed after every render (no deps array) so the
  // decay interval below can call the freshest applyBondDelta without ever
  // needing to be torn down and restarted on it.
  const applyBondDeltaRef = React.useRef(applyBondDelta);
  React.useEffect(() => {
    applyBondDeltaRef.current = applyBondDelta;
  });

  // Idle decay — a fixed tick counter via setInterval, never Date.now(). The
  // callback only ever reads live refs, so the closure captured at mount
  // never goes stale.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (bondRef.current <= 0 || decayPerTickRef.current <= 0) return;
      applyBondDeltaRef.current(-decayPerTickRef.current, null);
    }, DECAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const handleFeed = () => {
    applyBondDelta(FEED_BOND, "Fed");

    setHappyPose(true);
    if (poseTimer.current !== null) window.clearTimeout(poseTimer.current);
    poseTimer.current = window.setTimeout(() => {
      poseTimer.current = null;
      setHappyPose(false);
    }, HAPPY_POSE_MS);

    setBrighten(true);
    if (brightenTimer.current !== null)
      window.clearTimeout(brightenTimer.current);
    brightenTimer.current = window.setTimeout(() => {
      brightenTimer.current = null;
      setBrighten(false);
    }, BRIGHTEN_MS);

    if (motionSafeRef.current) {
      bounceScale.set(1.14);
      animate(bounceScale, 1, springs.recoil);

      setHeartVisible(true);
      setHeartKey((k) => k + 1);
      if (heartTimer.current !== null) window.clearTimeout(heartTimer.current);
      heartTimer.current = window.setTimeout(() => {
        heartTimer.current = null;
        setHeartVisible(false);
      }, HEART_MS);
    }
  };

  const handlePlay = () => {
    applyBondDelta(PLAY_BOND, "Played");
    setMoodOverride("playing");

    const overrideMs = motionSafeRef.current
      ? PLAY_DANCE_S * 1000 + 150
      : HAPPY_POSE_MS;
    if (moodOverrideTimer.current !== null)
      window.clearTimeout(moodOverrideTimer.current);
    moodOverrideTimer.current = window.setTimeout(() => {
      moodOverrideTimer.current = null;
      setMoodOverride(null);
    }, overrideMs);

    setBrighten(true);
    if (brightenTimer.current !== null)
      window.clearTimeout(brightenTimer.current);
    brightenTimer.current = window.setTimeout(() => {
      brightenTimer.current = null;
      setBrighten(false);
    }, BRIGHTEN_MS);

    if (motionSafeRef.current) {
      hopY.set(0);
      animate(hopY, [...HOP_Y], {
        duration: PLAY_DANCE_S,
        ease: easings.move,
        times: [...HOP_TIMES],
      });

      setBallVisible(true);
      setBallKey((k) => k + 1);
      if (ballTimer.current !== null) window.clearTimeout(ballTimer.current);
      ballTimer.current = window.setTimeout(() => {
        ballTimer.current = null;
        setBallVisible(false);
      }, BALL_MS);
    } else {
      setHappyPose(true);
      if (poseTimer.current !== null) window.clearTimeout(poseTimer.current);
      poseTimer.current = window.setTimeout(() => {
        poseTimer.current = null;
        setHappyPose(false);
      }, HAPPY_POSE_MS);
    }
  };

  const stageIndex = stageIndexForBond(bond);
  const shape = shapeForStage(stageIndex);
  const moodIndex = moodIndexForBond(bond);
  const drooped = moodIndex <= 1;
  const forlorn = moodIndex === 0;
  const mood = moodOverride ?? moodForBond(bond);

  const stageTransition = motionSafe ? springs.glide : { duration: 0 };
  const poseTransition = { duration: motionSafe ? durations.fast : 0 };

  const bodyCy = BODY_BASELINE - shape.bodyRy;
  const headTopY = BODY_BASELINE - 2 * shape.bodyRy;
  const eyeY = bodyCy - 3;
  const eyeLx = CX - shape.eyeGap;
  const eyeRx = CX + shape.eyeGap;
  const mouthY = bodyCy + 9;
  const earLx = CX - shape.eyeGap - 6;
  const earRx = CX + shape.eyeGap + 6;
  const earTopY = headTopY + 6;
  const earRotL = drooped ? 24 : -6;
  const earRotR = drooped ? -24 : 6;
  const markY = headTopY - 10;
  const tailCx = CX + shape.bodyRx - 6;
  const tailCy = bodyCy + shape.bodyRy * 0.3;

  const popTransition = {
    scale: motionSafe ? springs.recoil : { duration: 0 },
    opacity: { duration: motionSafe ? durations.fast : 0 },
  };
  const popExit = motionSafe
    ? {
        scale: 0,
        opacity: 0,
        transition: { duration: durations.fast, ease: easings.exit },
      }
    : { opacity: 0, transition: { duration: 0 } };
  const popInitial = motionSafe ? { scale: 0, opacity: 0 } : false;

  return (
    <div
      className={cn(
        "w-72 rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
      style={{
        filter: brighten
          ? "brightness(1.08)"
          : forlorn
            ? "brightness(0.92)"
            : "none",
        transition: "filter 400ms ease",
      }}
    >
      <div
        className="relative flex items-center justify-center"
        style={{ height: STAGE_H }}
      >
        <motion.div
          animate={{ scaleY: forlorn ? 0.88 : 1, y: forlorn ? 5 : 0 }}
          transition={stageTransition}
          style={{ transformOrigin: "50% 100%" }}
        >
          <motion.div style={{ scale: bounceScale, y: hopY }}>
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              width={VIEW_W}
              height={VIEW_H}
              aria-hidden
              className="block overflow-visible"
            >
              {/* Tail — only from companion on, pops in with the stage. */}
              <AnimatePresence initial={false}>
                {shape.hasTail && (
                  <motion.ellipse
                    key="tail"
                    rx={9}
                    ry={14}
                    fill={PET_BODY_SHADE}
                    stroke="var(--hairline-strong)"
                    strokeWidth={1}
                    initial={
                      motionSafe
                        ? { scale: 0, opacity: 0, cx: tailCx, cy: tailCy }
                        : { cx: tailCx, cy: tailCy }
                    }
                    animate={{ cx: tailCx, cy: tailCy, scale: 1, opacity: 1 }}
                    exit={popExit}
                    transition={{
                      cx: stageTransition,
                      cy: stageTransition,
                      ...popTransition,
                    }}
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "center",
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Body */}
              <motion.ellipse
                cx={CX}
                fill={PET_BODY}
                stroke="var(--hairline-strong)"
                strokeWidth={1}
                // Geometry driven through `animate` has to be seeded in
                // `initial` as well: Motion only writes those attributes once
                // it has mounted, so without this the very first paint emits
                // cy/rx/ry as "undefined" and the browser rejects them.
                initial={{ cy: bodyCy, rx: shape.bodyRx, ry: shape.bodyRy }}
                animate={{ cy: bodyCy, rx: shape.bodyRx, ry: shape.bodyRy }}
                transition={stageTransition}
              />

              {/* Ears — sprout on, droop when lonely or forlorn. */}
              <AnimatePresence initial={false}>
                {shape.hasEars && [
                  <motion.g
                    key="ear-l"
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "center",
                    }}
                    initial={popInitial}
                    animate={{
                      x: earLx,
                      y: earTopY,
                      rotate: earRotL,
                      scale: 1,
                      opacity: 1,
                    }}
                    exit={popExit}
                    transition={{
                      x: stageTransition,
                      y: stageTransition,
                      rotate: stageTransition,
                      ...popTransition,
                    }}
                  >
                    <ellipse
                      cx={0}
                      cy={-6}
                      rx={6}
                      ry={9}
                      fill={PET_BODY_SHADE}
                      stroke="var(--hairline-strong)"
                      strokeWidth={1}
                    />
                  </motion.g>,
                  <motion.g
                    key="ear-r"
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "center",
                    }}
                    initial={popInitial}
                    animate={{
                      x: earRx,
                      y: earTopY,
                      rotate: earRotR,
                      scale: 1,
                      opacity: 1,
                    }}
                    exit={popExit}
                    transition={{
                      x: stageTransition,
                      y: stageTransition,
                      rotate: stageTransition,
                      ...popTransition,
                    }}
                  >
                    <ellipse
                      cx={0}
                      cy={-6}
                      rx={6}
                      ry={9}
                      fill={PET_BODY_SHADE}
                      stroke="var(--hairline-strong)"
                      strokeWidth={1}
                    />
                  </motion.g>,
                ]}
              </AnimatePresence>

              {/* Elder mark — a small diamond above the head, elder only. */}
              <AnimatePresence initial={false}>
                {shape.mark && (
                  <motion.path
                    key="mark"
                    d="M0 -5 L4 0 L0 5 L-4 0 Z"
                    fill={MARK_COLOR}
                    initial={popInitial}
                    animate={{ x: CX, y: markY, scale: 1, opacity: 1 }}
                    exit={popExit}
                    transition={{
                      x: stageTransition,
                      y: stageTransition,
                      ...popTransition,
                    }}
                    style={{
                      transformBox: "fill-box",
                      transformOrigin: "center",
                    }}
                  />
                )}
              </AnimatePresence>

              {/* Eyes — gaze drifts toward the edge when lonely, both blink
                  together on a fixed clock, and squint into arcs on a feed. */}
              <motion.g
                animate={{
                  x: drooped ? GAZE_OFFSET : 0,
                  scaleY: motionSafe && blink ? 0.15 : 1,
                }}
                transition={{
                  x: stageTransition,
                  scaleY: { duration: motionSafe ? durations.blink : 0 },
                }}
                style={{ originX: "50%", originY: "50%" }}
              >
                <motion.circle
                  fill="var(--ink)"
                  // Seeded for the same reason as the body ellipse — animated
                  // SVG geometry is undefined until Motion mounts.
                  initial={{
                    cx: eyeLx,
                    cy: eyeY,
                    r: shape.eyeR,
                    opacity: happyPose ? 0 : 1,
                  }}
                  animate={{
                    cx: eyeLx,
                    cy: eyeY,
                    r: shape.eyeR,
                    opacity: happyPose ? 0 : 1,
                  }}
                  transition={{
                    cx: stageTransition,
                    cy: stageTransition,
                    r: stageTransition,
                    opacity: poseTransition,
                  }}
                />
                <motion.circle
                  fill="var(--ink)"
                  initial={{
                    cx: eyeRx,
                    cy: eyeY,
                    r: shape.eyeR,
                    opacity: happyPose ? 0 : 1,
                  }}
                  animate={{
                    cx: eyeRx,
                    cy: eyeY,
                    r: shape.eyeR,
                    opacity: happyPose ? 0 : 1,
                  }}
                  transition={{
                    cx: stageTransition,
                    cy: stageTransition,
                    r: stageTransition,
                    opacity: poseTransition,
                  }}
                />
                <motion.path
                  d={`M${eyeLx - 6} ${eyeY + 2} q6 -8 12 0`}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  animate={{ opacity: happyPose ? 1 : 0 }}
                  transition={poseTransition}
                />
                <motion.path
                  d={`M${eyeRx - 6} ${eyeY + 2} q6 -8 12 0`}
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  animate={{ opacity: happyPose ? 1 : 0 }}
                  transition={poseTransition}
                />
              </motion.g>

              {/* Mouth — a small neutral curve, a frown only at forlorn. */}
              <motion.g
                animate={{ x: CX, y: mouthY }}
                transition={stageTransition}
              >
                <motion.path
                  d="M-5 0 Q0 3 5 0"
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  animate={{ opacity: forlorn ? 0 : 1 }}
                  transition={poseTransition}
                />
                <motion.path
                  d="M-5 3 Q0 -2 5 3"
                  fill="none"
                  stroke="var(--ink)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  animate={{ opacity: forlorn ? 1 : 0 }}
                  transition={poseTransition}
                />
              </motion.g>
            </svg>
          </motion.div>
        </motion.div>

        {/* Stage-up celebration — a ring and six sparks, motion-gated. */}
        {motionSafe && ringKey > 0 && (
          <span
            key={ringKey}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <motion.span
              className="absolute rounded-full"
              style={{
                width: STAGEUP_RING_SIZE,
                height: STAGEUP_RING_SIZE,
                left: -STAGEUP_RING_SIZE / 2,
                top: -STAGEUP_RING_SIZE / 2,
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: RING_COLOR,
              }}
              initial={{ scale: 0.5, opacity: 0.9 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: STAGEUP_RING_S, ease: easings.exit }}
            />
            {STAGEUP_SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute size-[3px] rounded-full"
                style={{ background: SPARK_COLOR }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                transition={{ duration: STAGEUP_SPARK_S, ease: easings.exit }}
              />
            ))}
          </span>
        )}

        {/* Heart — floats up on a feed, motion-gated. */}
        {motionSafe && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2"
          >
            <AnimatePresence>
              {heartVisible && (
                <motion.span
                  key={heartKey}
                  className="absolute"
                  initial={{ opacity: 0, scale: 0.4, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: -8 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }}
                  transition={{
                    scale: springs.recoil,
                    y: springs.recoil,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }}
                >
                  <Heart
                    className="size-4"
                    fill={HEART_COLOR}
                    stroke={HEART_COLOR}
                  />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        )}

        {/* Ball — arcs across on a play, motion-gated. */}
        {motionSafe && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-6 left-1/2"
          >
            <AnimatePresence>
              {ballVisible && (
                <motion.span
                  key={ballKey}
                  className="absolute rounded-full"
                  style={{
                    width: 10,
                    height: 10,
                    marginLeft: -5,
                    background: BALL_COLOR,
                  }}
                  initial={{
                    x: BALL_X[0] ?? -32,
                    y: BALL_Y[0] ?? 0,
                    opacity: 1,
                  }}
                  animate={{
                    x: [...BALL_X],
                    y: [...BALL_Y],
                    opacity: [1, 1, 0],
                  }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.fast },
                  }}
                  transition={{
                    duration: PLAY_DANCE_S,
                    ease: easings.move,
                    times: [...BALL_TIMES],
                  }}
                />
              )}
            </AnimatePresence>
          </span>
        )}
      </div>

      <span
        aria-hidden
        className="flex h-4 items-center justify-center overflow-hidden font-mono text-[11px] text-ink-3"
      >
        <AnimatePresence mode="wait" initial={false}>
          {stageUpCaption && (
            <motion.span
              key="grew"
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
              {stageUpCaption}
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-ink-2">
          {mood} · bond {Math.round(bond)}
        </span>
        <span className="font-mono text-[10px] tracking-wide text-ink-3 uppercase">
          {shape.key}
        </span>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.span
          className="block h-full rounded-full"
          style={{ width: fillWidth, background: BOND_FILL }}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <motion.button
          type="button"
          aria-label="Feed the companion"
          onClick={handleFeed}
          whileTap={motionSafe ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "flex-1 rounded-2 bg-primary py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Feed
        </motion.button>

        <motion.button
          type="button"
          aria-label="Play with the companion"
          onClick={handlePlay}
          whileTap={motionSafe ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "flex-1 rounded-2 border border-hairline-strong bg-surface-2 py-1.5 text-xs font-medium text-ink-2 transition-colors outline-none",
            "hover:text-ink",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Play
        </motion.button>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
