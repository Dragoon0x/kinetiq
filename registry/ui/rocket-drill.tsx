"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage footprint, px. */
const STAGE_W = 240;
const STAGE_H = 300;

/** Launch pad slab. */
const PAD_W = 92;
const PAD_H = 14;
const PAD_LEFT = (STAGE_W - PAD_W) / 2;
const PAD_TOP = STAGE_H - 30;

/** Gantry mast + arm, hinged at its base beside the pad. */
const GANTRY_X = PAD_LEFT - 16;
const GANTRY_MAST_W = 6;
const GANTRY_HEIGHT = 70;
const GANTRY_ARM_LEN = 44;
const GANTRY_ARM_H = 6;
const GANTRY_ARM_TOP = 16;
const GANTRY_AWAY_DEG = -54;

/** Rocket / capsule bounding box, centered over the pad. */
const ROCKET_W = 28;
const ROCKET_BOX_H = 50;
const ROCKET_CENTER_X = STAGE_W / 2;
const ROCKET_BOX_LEFT = ROCKET_CENTER_X - ROCKET_W / 2;
const ROCKET_BOX_TOP = PAD_TOP - ROCKET_BOX_H;

const BODY_W = 22;
const BODY_H = 34;
const NOSE_H = 16;
const FIN_W = 12;
const FIN_H = 18;
const WINDOW_D = 9;

/** Parachute + capsule bounding box; PARA_BOX_TOP_REST is where a zero
 *  parachuteY offset sits the capsule's base right on the pad. */
const CANOPY_W = 54;
const CANOPY_H = 28;
const SHROUD_LEN = 18;
const PARA_BOX_W = CANOPY_W;
const PARA_BOX_H = CANOPY_H + SHROUD_LEN + BODY_H;
const PARA_BOX_LEFT = ROCKET_CENTER_X - PARA_BOX_W / 2;
const PARA_BOX_TOP_REST = PAD_TOP - PARA_BOX_H;

/** Three fixed clouds. */
const CLOUDS = [
  { left: 20, top: 26, w: 44, h: 16 },
  { left: 150, top: 16, w: 56, h: 18 },
  { left: 96, top: 58, w: 36, h: 13 },
] as const;

/** Five smoke puffs, fixed vectors from the pad. */
const SMOKE_ANCHOR_X = ROCKET_CENTER_X;
const SMOKE_ANCHOR_Y = PAD_TOP - 4;
const SMOKE_PUFF_SIZE = 11;
const SMOKE_PUFFS = [
  { dx: -36, dy: -6 },
  { dx: -18, dy: -24 },
  { dx: 0, dy: -32 },
  { dx: 19, dy: -23 },
  { dx: 37, dy: -8 },
] as const;
const SMOKE_STAGGER_S = 0.07;
const SMOKE_BLOOM_S = 0.55;

/** Rocket rise: accelerating up and slightly right, authored with times. */
const LIFT_TIMES = [0, 0.18, 0.42, 0.7, 1] as const;
const LIFT_Y = [0, -34, -120, -280, -380] as const;
const LIFT_X = [0, 2, 7, 13, 20] as const;
const LIFT_SCALE = [1, 0.98, 0.86, 0.72, 0.56] as const;

/** Parachute descent: a gentle S drift from just under the top edge down to
 *  a hair above the pad, so the settle spring has a few px left to cover. */
const DESCENT_TIMES = [0, 0.28, 0.55, 0.8, 1] as const;
const DESCENT_Y = [-180, -114, -56, -18, -8] as const;
const DESCENT_X = [0, -16, 12, -6, 0] as const;
const REDUCED_MID_DESCENT_Y = -56;

/** Beat lengths, ms. */
const COUNTDOWN_BEAT_MS = 600;
const LIFTOFF_MS = 1400;
const SMOKE_ARM_MS = 160;
const APOGEE_MS = 500;
const DESCENT_MS = 1800;
const LANDING_SETTLE_MS = 460;
const REDUCED_LIFTOFF_HOLD_MS = 420;
const REDUCED_APOGEE_HOLD_MS = 420;
const REDUCED_DESCENT_HOLD_MS = 520;

const SKY_BACKGROUND =
  "linear-gradient(to bottom, var(--color-surface-0) 0%, var(--color-surface-2) 100%)";
const SMOKE_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 28%, var(--ink-3))";

type DrillPhase =
  "idle" | "countdown" | "liftoff" | "apogee" | "descent" | "landed";

/**
 * A capsule body with a window — the shape shared by the standing rocket and
 * the thing hanging under the parachute. A plain function, not a component:
 * it takes no props and calls no hooks, so it is safe to invoke directly
 * inside JSX.
 */
function renderCapsuleBody(): React.JSX.Element {
  return (
    <>
      <span
        aria-hidden
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: BODY_W,
          height: BODY_H,
          borderRadius: "5px 5px 9px 9px",
          background: "var(--color-surface-1)",
          border: "1.5px solid var(--hairline-strong)",
        }}
      />
      <span
        aria-hidden
        className="absolute rounded-full"
        style={{
          left: (BODY_W - WINDOW_D) / 2,
          top: 10,
          width: WINDOW_D,
          height: WINDOW_D,
          background: "var(--ink-3)",
          border: "1px solid var(--hairline-strong)",
        }}
      />
    </>
  );
}

export type RocketDrillProps = {
  /** Fires the instant the rocket leaves the pad. */
  onLaunch?: () => void;
  /** Fires the instant the capsule touches back down. */
  onRecover?: () => void;
  className?: string;
};

/**
 * A launch you count down to, and a rocket that comes back. Click the pad —
 * a real button — and the drill runs itself: a large mono numeral counts 3,
 * 2, 1 while the rocket trembles harder with every beat, then the gantry
 * swings clear and the rocket rises on an authored, accelerating climb as
 * smoke puffs bloom from the pad, shrinking as it clears the top of the card
 * for a beat of empty sky. A parachute then drifts back down an authored
 * S-path, capsule swaying beneath it, and settles onto the pad with a soft
 * spring; the capsule crossfades back into the standing rocket, the gantry
 * swings home, and a mono caption tracks every beat: run the drill, 3, 2, 1,
 * liftoff, a pause, recovered. Clicks are ignored mid-drill — once it lands,
 * clicking the pad again, or the "again" button beneath it, reruns the whole
 * sequence, and every smoke puff and the descent path are fixed, never
 * randomized. Reduced motion: no tremble, no flight, no sway — the drill
 * steps instantly through stills (pad with rocket, countdown numerals, empty
 * sky, parachute mid-descent, landed capsule) on the same timed beats, and
 * the caption still cycles.
 */
export function RocketDrill({
  onLaunch,
  onRecover,
  className,
}: RocketDrillProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [phase, setPhase] = React.useState<DrillPhase>("idle");
  const [countdownValue, setCountdownValue] = React.useState<number | null>(
    null,
  );
  const [smokeOn, setSmokeOn] = React.useState(false);
  const [chuteDone, setChuteDone] = React.useState(false);

  const rocketX = useMotionValue(0);
  const rocketY = useMotionValue(0);
  const rocketScale = useMotionValue(1);
  const parachuteX = useMotionValue(0);
  const parachuteY = useMotionValue(0);
  const parachuteRotate = useMotionValue(0);
  const gantryRotate = useMotionValue(0);

  const rocketXAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const rocketYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const rocketScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const parachuteXAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const parachuteYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const parachuteRotateAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const gantryRotateAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );

  const timers = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((id) => window.clearTimeout(id));
      pending.clear();
      rocketXAnim.current?.stop();
      rocketYAnim.current?.stop();
      rocketScaleAnim.current?.stop();
      parachuteXAnim.current?.stop();
      parachuteYAnim.current?.stop();
      parachuteRotateAnim.current?.stop();
      gantryRotateAnim.current?.stop();
    };
  }, []);

  const scheduleTimer = (fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, delayMs);
    timers.current.add(id);
  };

  const swingGantry = (away: boolean) => {
    const target = away ? GANTRY_AWAY_DEG : 0;
    gantryRotateAnim.current?.stop();
    if (motionSafe) {
      gantryRotateAnim.current = animate(gantryRotate, target, springs.glide);
    } else {
      gantryRotate.set(target);
    }
  };

  const land = () => {
    setPhase("landed");
    onRecover?.();
    swingGantry(false);

    if (motionSafe) {
      parachuteRotateAnim.current?.stop();
      parachuteYAnim.current?.stop();
      parachuteXAnim.current?.stop();
      parachuteRotateAnim.current = animate(parachuteRotate, 0, springs.glide);
      parachuteYAnim.current = animate(parachuteY, 0, springs.glide);
      parachuteXAnim.current = animate(parachuteX, 0, springs.glide);
      scheduleTimer(() => setChuteDone(true), LANDING_SETTLE_MS);
    } else {
      parachuteRotate.set(0);
      parachuteY.set(0);
      parachuteX.set(0);
    }
  };

  const beginDescent = () => {
    setPhase("descent");
    // The rocket is long off-canvas by now; reset it in place, unseen, so
    // it is ready to crossfade back in at rest once the capsule lands.
    rocketX.set(0);
    rocketY.set(0);
    rocketScale.set(1);

    if (motionSafe) {
      parachuteYAnim.current?.stop();
      parachuteXAnim.current?.stop();
      parachuteRotateAnim.current?.stop();
      parachuteYAnim.current = animate(parachuteY, [...DESCENT_Y], {
        duration: DESCENT_MS / 1000,
        times: [...DESCENT_TIMES],
        ease: easings.move,
      });
      parachuteXAnim.current = animate(parachuteX, [...DESCENT_X], {
        duration: DESCENT_MS / 1000,
        times: [...DESCENT_TIMES],
        ease: easings.move,
      });
      parachuteRotateAnim.current = animate(parachuteRotate, [-6, 6], {
        duration: 1.05,
        repeat: Infinity,
        repeatType: "mirror",
        ease: easings.move,
      });
    } else {
      parachuteY.set(REDUCED_MID_DESCENT_Y);
      parachuteX.set(0);
      parachuteRotate.set(0);
    }

    scheduleTimer(land, motionSafe ? DESCENT_MS : REDUCED_DESCENT_HOLD_MS);
  };

  const beginApogee = () => {
    setPhase("apogee");
    scheduleTimer(
      beginDescent,
      motionSafe ? APOGEE_MS : REDUCED_APOGEE_HOLD_MS,
    );
  };

  const beginLiftoff = () => {
    setPhase("liftoff");
    setCountdownValue(null);
    onLaunch?.();
    swingGantry(true);

    if (motionSafe) {
      rocketXAnim.current?.stop();
      rocketYAnim.current?.stop();
      rocketScaleAnim.current?.stop();
      rocketXAnim.current = animate(rocketX, [...LIFT_X], {
        duration: LIFTOFF_MS / 1000,
        times: [...LIFT_TIMES],
        ease: easings.move,
      });
      rocketYAnim.current = animate(rocketY, [...LIFT_Y], {
        duration: LIFTOFF_MS / 1000,
        times: [...LIFT_TIMES],
        ease: easings.move,
      });
      rocketScaleAnim.current = animate(rocketScale, [...LIFT_SCALE], {
        duration: LIFTOFF_MS / 1000,
        times: [...LIFT_TIMES],
        ease: easings.move,
      });
      setSmokeOn(true);
      scheduleTimer(() => setSmokeOn(false), SMOKE_ARM_MS);
    }

    scheduleTimer(
      beginApogee,
      motionSafe ? LIFTOFF_MS : REDUCED_LIFTOFF_HOLD_MS,
    );
  };

  const start = () => {
    if (phase !== "idle" && phase !== "landed") return; // Ignore mid-drill.
    setChuteDone(false);
    setPhase("countdown");
    setCountdownValue(3);
    scheduleTimer(() => {
      setCountdownValue(2);
      scheduleTimer(() => {
        setCountdownValue(1);
        scheduleTimer(beginLiftoff, COUNTDOWN_BEAT_MS);
      }, COUNTDOWN_BEAT_MS);
    }, COUNTDOWN_BEAT_MS);
  };

  const trembleAmplitude =
    countdownValue === 3
      ? 1
      : countdownValue === 2
        ? 2
        : countdownValue === 1
          ? 3.2
          : 0;

  const rocketVisible =
    phase === "idle" ||
    phase === "countdown" ||
    (motionSafe && (phase === "liftoff" || phase === "apogee")) ||
    (phase === "landed" && chuteDone);

  const chuteVisible =
    phase === "descent" || (phase === "landed" && !chuteDone);

  const caption =
    phase === "idle"
      ? "run the drill"
      : phase === "countdown"
        ? String(countdownValue ?? "")
        : phase === "liftoff"
          ? "liftoff"
          : phase === "landed"
            ? "recovered."
            : "…";

  const captionKey = phase === "countdown" ? `count-${countdownValue}` : phase;

  const liveMessage =
    phase === "liftoff" ? "Liftoff." : phase === "landed" ? "Recovered." : "";

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 rounded-3 border border-hairline bg-surface-0 p-6 shadow-raised",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Run the launch drill"
        onClick={start}
        className="relative block overflow-hidden rounded-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
        style={{ width: STAGE_W, height: STAGE_H, background: SKY_BACKGROUND }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {CLOUDS.map((cloud, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                left: cloud.left,
                top: cloud.top,
                width: cloud.w,
                height: cloud.h,
                background:
                  "color-mix(in oklab, var(--color-surface-2) 70%, transparent)",
              }}
            />
          ))}
          <span
            className="absolute rounded-1"
            style={{
              left: PAD_LEFT,
              top: PAD_TOP,
              width: PAD_W,
              height: PAD_H,
              background: "var(--color-surface-2)",
              border: "1px solid var(--hairline-strong)",
            }}
          />
        </span>

        <motion.div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: GANTRY_X,
            top: PAD_TOP - GANTRY_HEIGHT,
            width: GANTRY_MAST_W,
            height: GANTRY_HEIGHT,
            transformOrigin: "50% 100%",
            rotate: gantryRotate,
          }}
        >
          <span
            className="absolute inset-0 rounded-1"
            style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--hairline-strong)",
            }}
          />
          <span
            className="absolute rounded-1"
            style={{
              left: GANTRY_MAST_W,
              top: GANTRY_ARM_TOP,
              width: GANTRY_ARM_LEN,
              height: GANTRY_ARM_H,
              background: "var(--color-surface-2)",
              border: "1px solid var(--hairline-strong)",
            }}
          />
        </motion.div>

        <AnimatePresence>
          {motionSafe &&
            smokeOn &&
            SMOKE_PUFFS.map((puff, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: SMOKE_ANCHOR_X,
                  top: SMOKE_ANCHOR_Y,
                  width: SMOKE_PUFF_SIZE,
                  height: SMOKE_PUFF_SIZE,
                  marginLeft: -SMOKE_PUFF_SIZE / 2,
                  marginTop: -SMOKE_PUFF_SIZE / 2,
                  background: SMOKE_FILL,
                }}
                initial={{ x: 0, y: 0, scale: 0.5, opacity: 0.85 }}
                animate={{ x: 0, y: 0, scale: 0.5, opacity: 0.85 }}
                exit={{
                  x: puff.dx,
                  y: puff.dy,
                  scale: 1.9,
                  opacity: 0,
                  transition: {
                    duration: SMOKE_BLOOM_S,
                    ease: easings.exit,
                    delay: i * SMOKE_STAGGER_S,
                  },
                }}
              />
            ))}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {rocketVisible && (
            <motion.div
              key="rocket-group"
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: ROCKET_BOX_LEFT,
                top: ROCKET_BOX_TOP,
                width: ROCKET_W,
                height: ROCKET_BOX_H,
                x: rocketX,
                y: rocketY,
                scale: rocketScale,
              }}
              initial={motionSafe ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={
                motionSafe
                  ? { duration: durations.slow, ease: easings.enter }
                  : { duration: 0 }
              }
              exit={{
                opacity: 0,
                transition: { duration: 0, ease: easings.exit },
              }}
            >
              <motion.div
                className="absolute inset-0"
                animate={{
                  x:
                    motionSafe && trembleAmplitude > 0
                      ? [-trembleAmplitude, trembleAmplitude]
                      : 0,
                }}
                transition={
                  motionSafe && trembleAmplitude > 0
                    ? {
                        duration: 0.1,
                        repeat: Infinity,
                        repeatType: "mirror",
                        ease: easings.move,
                      }
                    : { duration: durations.fast }
                }
              >
                <span
                  className="absolute"
                  style={{
                    left: (ROCKET_W - BODY_W) / 2,
                    top: 0,
                    width: BODY_W,
                    height: NOSE_H,
                    background: "var(--primary)",
                    clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
                  }}
                />
                <span
                  className="absolute"
                  style={{
                    left: (ROCKET_W - BODY_W) / 2,
                    top: NOSE_H,
                    width: BODY_W,
                    height: BODY_H,
                  }}
                >
                  {renderCapsuleBody()}
                </span>
                <span
                  className="absolute"
                  style={{
                    left: -2,
                    top: ROCKET_BOX_H - FIN_H,
                    width: FIN_W,
                    height: FIN_H,
                    background: "var(--primary)",
                    clipPath: "polygon(100% 0%, 100% 100%, 0% 100%)",
                  }}
                />
                <span
                  className="absolute"
                  style={{
                    left: ROCKET_W - FIN_W + 2,
                    top: ROCKET_BOX_H - FIN_H,
                    width: FIN_W,
                    height: FIN_H,
                    background: "var(--primary)",
                    clipPath: "polygon(0% 0%, 0% 100%, 100% 100%)",
                  }}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {chuteVisible && (
            <motion.div
              key="chute-group"
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: PARA_BOX_LEFT,
                top: PARA_BOX_TOP_REST,
                width: PARA_BOX_W,
                height: PARA_BOX_H,
                x: parachuteX,
                y: parachuteY,
                rotate: parachuteRotate,
                transformOrigin: "50% 0%",
              }}
              initial={motionSafe ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
              exit={{
                opacity: 0,
                transition: {
                  duration: motionSafe ? durations.slow : 0,
                  ease: easings.exit,
                },
              }}
            >
              <span
                className="absolute"
                style={{
                  left: 0,
                  top: 0,
                  width: CANOPY_W,
                  height: CANOPY_H,
                  borderRadius: "50% 50% 8% 8%",
                  background: "var(--success, #047857)",
                  border: "1.5px solid var(--hairline-strong)",
                }}
              />
              <span
                className="absolute"
                style={{
                  left: 8,
                  top: CANOPY_H - 2,
                  width: 1.5,
                  height: SHROUD_LEN,
                  background: "var(--ink-3)",
                  transform: "rotate(-9deg)",
                  transformOrigin: "top center",
                }}
              />
              <span
                className="absolute"
                style={{
                  left: PARA_BOX_W / 2 - 0.75,
                  top: CANOPY_H - 2,
                  width: 1.5,
                  height: SHROUD_LEN,
                  background: "var(--ink-3)",
                }}
              />
              <span
                className="absolute"
                style={{
                  left: PARA_BOX_W - 8 - 1.5,
                  top: CANOPY_H - 2,
                  width: 1.5,
                  height: SHROUD_LEN,
                  background: "var(--ink-3)",
                  transform: "rotate(9deg)",
                  transformOrigin: "top center",
                }}
              />
              <span
                className="absolute"
                style={{
                  left: (PARA_BOX_W - BODY_W) / 2,
                  top: CANOPY_H + SHROUD_LEN,
                  width: BODY_W,
                  height: BODY_H,
                }}
              >
                {renderCapsuleBody()}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {phase === "countdown" && countdownValue !== null && (
            <motion.span
              key={countdownValue}
              aria-hidden
              className="pointer-events-none absolute font-mono font-semibold text-ink tabular-nums select-none"
              style={{
                left: 0,
                top: 56,
                width: STAGE_W,
                textAlign: "center",
                fontSize: 56,
                lineHeight: 1,
              }}
              initial={motionSafe ? { opacity: 0, scale: 0.4 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
              exit={{
                opacity: 0,
                scale: 0.75,
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
      </button>

      <div className="flex h-5 items-center gap-3">
        <motion.span
          key={captionKey}
          aria-hidden
          className="text-label font-mono text-ink-3 normal-case"
          initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
        >
          {caption}
        </motion.span>

        {phase === "landed" && (
          <button
            type="button"
            onClick={start}
            aria-label="Run the drill again"
            className="text-label font-mono text-ink-3 normal-case underline underline-offset-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
          >
            again
          </button>
        )}
      </div>

      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </div>
  );
}
