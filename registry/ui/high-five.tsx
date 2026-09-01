"use client";

import * as React from "react";

import { Hand } from "lucide-react";
import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;

/** Stage box, in px — room for the waiting hand plus the incoming swing. */
const STAGE_W = 260;
const STAGE_H = 100;
const HAND = 44;

/** Waiting hand's rest anchor, and the incoming hand's arrival anchor. */
const WAIT_BASE_LEFT = 60;
const MEET_LEFT = 152;
/** Where the ring and flecks originate — roughly the contact point. */
const CONTACT_LEFT = 140;
const RING_SIZE = 64;

const WAIT_REST_ROT = -16;
/** The waiting hand's small lean toward center, met on `flick`. */
const WAIT_LEAN = { x: 18, rot: -6 } as const;

/** Palm poses for the incoming hand, as x-offset from its MEET_LEFT anchor. */
const INCOMING_OFF = { x: 150, rot: 24 } as const;
const INCOMING_MEET = { x: 0, rot: -4 } as const;
/** Past the waiting hand's anchor — the whiff overshoots, it never lands. */
const INCOMING_WHIFF = { x: -96, rot: -30 } as const;

/** The meet: an authored multi-keyframe tween, x + rotate, ~0.28s. */
const APPROACH_S = 0.28;
const APPROACH_X = [
  INCOMING_OFF.x,
  INCOMING_OFF.x * 0.3,
  INCOMING_MEET.x,
] as const;
const APPROACH_ROT = [
  INCOMING_OFF.rot,
  INCOMING_OFF.rot * 0.35,
  INCOMING_MEET.rot,
] as const;
const APPROACH_TIMES = [0, 0.7, 1] as const;

/** The whiff: an alternate authored tween that overshoots past the meet. */
const WHIFF_S = 0.34;
const WHIFF_X = [
  INCOMING_OFF.x,
  INCOMING_OFF.x * 0.25,
  INCOMING_WHIFF.x,
] as const;
const WHIFF_ROT = [
  INCOMING_OFF.rot,
  INCOMING_OFF.rot * 0.2,
  INCOMING_WHIFF.rot,
] as const;
const WHIFF_TIMES = [0, 0.55, 1] as const;

const IMPACT_RING_S = 0.5;
/** How long the "nice." / "swing and a miss." caption holds before reverting. */
const CAPTION_HOLD_MS = 900;
/** Reduced motion: how long the still pose holds before snapping back. */
const REDUCED_STILL_MS = 400;
/** A second click inside this window of the last five reads as a double-tap. */
const MISS_WINDOW_MS = 250;

/**
 * Six flecks thrown once per five, evenly spaced from twelve o'clock —
 * precomputed so every burst is identical and SSR-safe.
 */
const FLECK_COUNT = 6;
const FLECK_REACH = 44;
const IMPACT_FLECKS = Array.from({ length: FLECK_COUNT }, (_, i) => {
  const angle = (i / FLECK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * FLECK_REACH,
    dy: Math.sin(angle) * FLECK_REACH,
    deg: (angle / TAU) * 360,
  };
});

type Flash = "five" | "miss" | null;

export type HighFiveProps = {
  /** Fires once when the hands actually meet — not on a whiffed double-tap. */
  onFive?: () => void;
  className?: string;
};

/**
 * An open hand that waits on the left side of the stage, tilted, breathing
 * with a faint looping scale-and-tilt and a tiny bob. A click sends a second
 * hand swinging in from the right on an authored multi-keyframe tween while
 * the waiting hand leans in on `flick`; at contact a shockwave ring expands,
 * six flecks throw outward, and both palms squash on `flick` before the
 * incoming hand withdraws off-frame on an exit tween and the waiting hand
 * settles back on `snap`. The caption flashes to "nice." for the beat, then
 * back to its resting invitation. Double-tap within ~250ms of the last five
 * and the incoming hand overshoots past the waiting hand instead — an
 * alternate tween, no ring, captioned "swing and a miss." — before
 * everything resets. Reduced motion: no travel — a click swaps straight to a
 * still (palms together, ring shown static) for ~400ms, or the missed pose
 * for a whiff, captions still flashing.
 */
export function HighFive({
  onFive,
  className,
}: HighFiveProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [flash, setFlash] = React.useState<Flash>(null);
  const [resting, setResting] = React.useState(true);
  // A fresh key per five mounts a fresh ring + fleck burst (and replays it).
  const [burst, setBurst] = React.useState(0);

  const waitX = useMotionValue(0);
  const waitY = useMotionValue(0);
  const waitRotate = useMotionValue(WAIT_REST_ROT);
  const waitScale = useMotionValue(1);
  const comeX = useMotionValue<number>(INCOMING_OFF.x);
  const comeRot = useMotionValue<number>(INCOMING_OFF.rot);
  const comeScale = useMotionValue(1);

  const lastFiveAtRef = React.useRef<number | null>(null);
  const revertTimer = React.useRef<number | null>(null);
  const handAnims = React.useRef<Array<ReturnType<typeof animate>>>([]);
  const breatheAnims = React.useRef<Array<ReturnType<typeof animate>>>([]);

  // Latest-ref mirror so the sequence always calls the current callback.
  const onFiveRef = React.useRef(onFive);
  React.useEffect(() => {
    onFiveRef.current = onFive;
  }, [onFive]);

  const run = (control: ReturnType<typeof animate>) => {
    handAnims.current.push(control);
    return control;
  };

  const stopHandAnims = () => {
    for (const a of handAnims.current) a.stop();
    handAnims.current = [];
  };

  const stopBreathing = () => {
    for (const a of breatheAnims.current) a.stop();
    breatheAnims.current = [];
  };

  const clearRevertTimer = () => {
    if (revertTimer.current !== null) {
      window.clearTimeout(revertTimer.current);
      revertTimer.current = null;
    }
  };

  // Idle ambient loop: a faint breathe (scale + tilt) and a tiny bob, only
  // while motion is safe and the waiting hand isn't mid-sequence. Restarts
  // fresh each time `resting` flips back true, from wherever it left off.
  React.useEffect(() => {
    if (!motionSafe || !resting) return;
    const scaleLoop = animate(waitScale, [1, 1.035, 1], {
      duration: 2.6,
      times: [0, 0.5, 1],
      ease: easings.move,
      repeat: Infinity,
    });
    const rotLoop = animate(
      waitRotate,
      [WAIT_REST_ROT, WAIT_REST_ROT - 5, WAIT_REST_ROT],
      {
        duration: 2.6,
        times: [0, 0.5, 1],
        ease: easings.move,
        repeat: Infinity,
      },
    );
    const bobLoop = animate(waitY, [0, -3, 0], {
      duration: 3.1,
      times: [0, 0.5, 1],
      ease: easings.move,
      repeat: Infinity,
    });
    breatheAnims.current = [scaleLoop, rotLoop, bobLoop];
    return () => {
      scaleLoop.stop();
      rotLoop.stop();
      bobLoop.stop();
      breatheAnims.current = [];
    };
  }, [motionSafe, resting, waitScale, waitRotate, waitY]);

  // Unmount teardown — timer cleared, every in-flight sequence animation
  // stopped (the breathing loop stops itself via its own effect cleanup).
  React.useEffect(() => {
    return () => {
      if (revertTimer.current !== null)
        window.clearTimeout(revertTimer.current);
      for (const a of handAnims.current) a.stop();
    };
  }, []);

  const onWaitSettled = () => {
    setResting(true);
  };

  /** Recoil: hands bounce apart, incoming withdraws, waiting settles on `snap`. */
  const onImpactSquashed = () => {
    run(animate(waitX, 0, { ...springs.snap, onComplete: onWaitSettled }));
    run(animate(waitRotate, WAIT_REST_ROT, springs.snap));
    run(
      animate(comeX, INCOMING_OFF.x, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
    run(
      animate(comeRot, INCOMING_OFF.rot, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
  };

  /** Impact: ring + flecks fire, both palms squash on `flick` (set-then-animate). */
  const onHandsMet = () => {
    setBurst((b) => b + 1);
    waitScale.jump(0.9);
    comeScale.jump(0.88);
    run(animate(waitScale, 1, springs.flick));
    run(
      animate(comeScale, 1, { ...springs.flick, onComplete: onImpactSquashed }),
    );
  };

  const playFive = () => {
    onFiveRef.current?.();
    stopHandAnims();
    stopBreathing();
    waitY.jump(0);
    setResting(false);
    setFlash("five");
    clearRevertTimer();
    revertTimer.current = window.setTimeout(
      () => setFlash(null),
      CAPTION_HOLD_MS,
    );

    run(
      animate(comeX, [...APPROACH_X], {
        duration: APPROACH_S,
        times: [...APPROACH_TIMES],
        ease: easings.enter,
        onComplete: onHandsMet,
      }),
    );
    run(
      animate(comeRot, [...APPROACH_ROT], {
        duration: APPROACH_S,
        times: [...APPROACH_TIMES],
        ease: easings.enter,
      }),
    );
    run(animate(waitX, WAIT_LEAN.x, springs.flick));
    run(animate(waitRotate, WAIT_LEAN.rot, springs.flick));
  };

  /** No contact — the incoming hand withdraws the same way it would after a five. */
  const onWhiffPeak = () => {
    run(
      animate(comeX, INCOMING_OFF.x, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
    run(
      animate(comeRot, INCOMING_OFF.rot, {
        duration: durations.slow,
        ease: easings.exit,
      }),
    );
  };

  const playMiss = () => {
    // The waiting hand is never touched — it keeps breathing, undisturbed.
    stopHandAnims();
    setFlash("miss");
    clearRevertTimer();
    revertTimer.current = window.setTimeout(
      () => setFlash(null),
      CAPTION_HOLD_MS,
    );

    run(
      animate(comeX, [...WHIFF_X], {
        duration: WHIFF_S,
        times: [...WHIFF_TIMES],
        ease: easings.enter,
        onComplete: onWhiffPeak,
      }),
    );
    run(
      animate(comeRot, [...WHIFF_ROT], {
        duration: WHIFF_S,
        times: [...WHIFF_TIMES],
        ease: easings.enter,
      }),
    );
  };

  /** Reduced motion: no travel, just an instant swap to a still and back. */
  const playReducedStill = (kind: "five" | "miss") => {
    if (kind === "five") onFiveRef.current?.();
    setFlash(kind);
    clearRevertTimer();

    if (kind === "five") {
      comeX.jump(INCOMING_MEET.x);
      comeRot.jump(INCOMING_MEET.rot);
      waitX.jump(WAIT_LEAN.x);
      waitRotate.jump(WAIT_LEAN.rot);
    } else {
      comeX.jump(INCOMING_WHIFF.x);
      comeRot.jump(INCOMING_WHIFF.rot);
    }

    revertTimer.current = window.setTimeout(() => {
      comeX.jump(INCOMING_OFF.x);
      comeRot.jump(INCOMING_OFF.rot);
      waitX.jump(0);
      waitRotate.jump(WAIT_REST_ROT);
      setFlash(null);
    }, REDUCED_STILL_MS);
  };

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const now = event.timeStamp;
    const previous = lastFiveAtRef.current;
    const isMiss = previous !== null && now - previous < MISS_WINDOW_MS;
    lastFiveAtRef.current = isMiss ? null : now;

    if (!motionSafe) {
      playReducedStill(isMiss ? "miss" : "five");
      return;
    }
    if (isMiss) playMiss();
    else playFive();
  };

  const caption =
    flash === "five"
      ? "nice."
      : flash === "miss"
        ? "swing and a miss."
        : "leave one hanging?";
  const announce =
    flash === "five" ? "High five." : flash === "miss" ? "Missed." : "";

  return (
    <motion.button
      type="button"
      aria-label="High five"
      onClick={handleClick}
      whileTap={motionSafe ? undefined : { scale: 0.97 }}
      className={cn(
        "group relative flex w-full max-w-xs flex-col items-center gap-5 overflow-hidden rounded-4 border border-border bg-card px-6 py-7 select-none",
        "transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        !motionSafe && "active:brightness-95",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none relative"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Waiting hand — left, tilted, breathing at rest. */}
        <span
          className="absolute"
          style={{ left: WAIT_BASE_LEFT, top: "50%", marginTop: -(HAND / 2) }}
        >
          <motion.span
            className="inline-flex"
            style={{ x: waitX, y: waitY, rotate: waitRotate, scale: waitScale }}
          >
            <Hand
              className="size-11 -scale-x-100 text-ink-2"
              strokeWidth={1.75}
            />
          </motion.span>
        </span>

        {/* Incoming hand — swings in from off-frame right on contact. */}
        <span
          className="absolute"
          style={{ left: MEET_LEFT, top: "50%", marginTop: -(HAND / 2) }}
        >
          <motion.span
            className="inline-flex"
            style={{ x: comeX, rotate: comeRot, scale: comeScale }}
          >
            <Hand className="size-11 text-ink-2" strokeWidth={1.75} />
          </motion.span>
        </span>

        {/* Shockwave ring — one-shot per successful five. */}
        {motionSafe && burst > 0 && (
          <motion.span
            key={burst}
            className="absolute rounded-full border-2"
            style={{
              left: CONTACT_LEFT,
              top: STAGE_H / 2,
              width: RING_SIZE,
              height: RING_SIZE,
              marginLeft: -(RING_SIZE / 2),
              marginTop: -(RING_SIZE / 2),
              borderColor: "var(--success,var(--primary))",
            }}
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: IMPACT_RING_S, ease: easings.exit }}
          />
        )}

        {/* Impact flecks — six fixed vectors, thrown once per five. */}
        {motionSafe && burst > 0 && (
          <span
            key={`flecks-${burst}`}
            className="absolute"
            style={{ left: CONTACT_LEFT, top: STAGE_H / 2 }}
          >
            {IMPACT_FLECKS.map((f, i) => (
              <motion.span
                key={i}
                className="absolute h-[3px] w-3.5 rounded-full"
                style={{
                  background: "var(--success,var(--primary))",
                  rotate: `${f.deg}deg`,
                  originX: 0,
                  originY: 0.5,
                }}
                initial={{ x: 0, y: 0, scaleX: 0.3, opacity: 0 }}
                animate={{ x: f.dx, y: f.dy, scaleX: 1, opacity: [0, 1, 0] }}
                transition={{
                  x: springs.recoil,
                  y: springs.recoil,
                  scaleX: springs.recoil,
                  opacity: { duration: durations.slow, ease: easings.exit },
                }}
              />
            ))}
          </span>
        )}

        {/* Reduced motion: a static ring stands in for the shockwave. */}
        {!motionSafe && flash === "five" && (
          <span
            className="absolute rounded-full border-2"
            style={{
              left: CONTACT_LEFT,
              top: STAGE_H / 2,
              width: RING_SIZE,
              height: RING_SIZE,
              marginLeft: -(RING_SIZE / 2),
              marginTop: -(RING_SIZE / 2),
              borderColor: "var(--success,var(--primary))",
              opacity: 0.85,
            }}
          />
        )}
      </span>

      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3">
        {caption}
      </span>

      {/* Announce the outcome without narrating every breath. */}
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </motion.button>
  );
}
