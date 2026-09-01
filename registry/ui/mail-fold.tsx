"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry, px. */
const STAGE_W = 240;
const STAGE_H = 224;
/** The content row's own height — the rest of STAGE_H is padding, the gap,
 * and the fixed caption row, so the dashed trail's rest point stays exact. */
const CONTENT_H = 168;
/** Rest point for the body (and the trail's first point), stage-relative px. */
const REST_X = STAGE_W / 2;
const REST_Y = 16 + CONTENT_H / 2;

/** Flat letter, portrait — three equal panels stack to its full height. */
const LETTER_W = 108;
const LETTER_H = 138;
const PANEL_H = LETTER_H / 3;

/** The envelope the letter morphs into. */
const ENVELOPE_W = 128;
const ENVELOPE_H = 80;
const FLAP_H = ENVELOPE_H * 0.6;
const FLAP_CLIP = "polygon(0% 0%, 100% 0%, 50% 100%)";
const SEAL_SIZE = 16;
const SEAL_TOP = FLAP_H - SEAL_SIZE / 2 - 2;
/** Wax seal peak scale before it springs back to rest on `recoil`. */
const SEAL_PEAK = 1.4;

/** Corner radii, matching the --radius-2 / --radius-3 tokens in px. */
const RADIUS_LETTER = 6;
const RADIUS_ENVELOPE = 10;

/** How far above rest the fresh letter starts before it drops in. */
const ARRIVE_DROP = 40;

/** Each fold is one short authored tween. */
const FOLD_S = 0.28;
/** Border-radius + size morph into the envelope. */
const ENVELOPE_MORPH_S = 0.4;
/** The flap's sweep, delayed slightly behind the morph so it reads as landing on top of it. */
const FLAP_SWEEP_S = 0.3;
const FLAP_DELAY_S = 0.1;
/** The seal presses on once the flap has mostly settled. */
const SEAL_DELAY_S = 0.32;
/** Fly-off: ~0.9s, accelerating via uneven `times` plus an accelerating ease. */
const FLY_S = 0.9;

const SEAL_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 62%, var(--color-surface-0))";

/** Lifts, tilts, and accelerates up-right off the stage. */
const FLY_TIMES = [0, 0.22, 0.48, 0.72, 1] as const;
const FLY_X = [0, 10, 46, 120, 210] as const;
const FLY_Y = [0, -8, -34, -90, -170] as const;
const FLY_ROTATE = [0, -4, -9, -16, -22] as const;
const FLY_OPACITY = [1, 1, 1, 0.75, 0] as const;

/** Dashed trail, roughly matching the fly-off curve — absolute stage px. */
const TRAIL_D = `M${REST_X},${REST_Y} L${REST_X + 10},${REST_Y - 8} L${REST_X + 46},${REST_Y - 34} L${REST_X + 120},${REST_Y - 90} L${REST_X + 210},${REST_Y - 170}`;

const CAPTIONS = {
  letter: "send it",
  "fold-bottom": "folding",
  "fold-top": "folding",
  envelope: "sealed",
  flying: "gone.",
  empty: "gone.",
  arriving: "send it",
} as const;

type Phase = keyof typeof CAPTIONS;
type GuardPhase = Exclude<Phase, "letter">;

/** Motion-safe: how long each beat's own tween/spring needs before the next begins. */
const MOTION_GUARD_MS: Record<GuardPhase, number> = {
  "fold-bottom": 320,
  "fold-top": 320,
  envelope: 900,
  flying: 980,
  empty: 700,
  arriving: 500,
};

/** Reduced motion: timed holds between stills — no tween ever runs. */
const REDUCED_GUARD_MS: Record<GuardPhase, number> = {
  "fold-bottom": 260,
  "fold-top": 260,
  envelope: 550,
  flying: 160,
  empty: 700,
  arriving: 0,
};

export type MailFoldProps = {
  /** Fires once the envelope departs the stage. */
  onSent?: () => void;
  className?: string;
};

/**
 * A flat letter that becomes a mailed envelope in one press. The stage shows
 * a sheet with a heading bar, a few hairline text rules, and a signature
 * squiggle; clicking folds its lower third up and its upper third down —
 * both panels scaleY-collapsing toward their own outer edge — then the
 * folded shape morphs into an envelope as a clipped flap sweeps down over
 * the seam and a wax seal presses on with `recoil`. The finished envelope
 * lifts, tilts, and accelerates off the stage on an authored multi-keyframe
 * tween, trailing a dashed line that fades behind it. A fresh letter drops
 * back in on `glide` about 700ms later, ready for the next send, while a
 * mono caption cycles "send it" to "folding" to "sealed" to "gone." and back,
 * and clicks are ignored mid-sequence. Reduced motion: no folds or flight —
 * each click steps instantly through three stills (flat letter, sealed
 * envelope, empty stage) on timed beats before the fresh letter appears,
 * with the same captions and click-guard.
 */
export function MailFold({
  onSent,
  className,
}: MailFoldProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const [phase, setPhase] = React.useState<Phase>("letter");

  const timerRef = React.useRef<number | null>(null);
  const sealScale = useMotionValue(1);
  const sealAnimRef = React.useRef<ReturnType<typeof animate> | null>(null);
  // Kept current via its own effect (never a render-body write) so the
  // phase-advancing effect below doesn't need `onSent` as a dependency — an
  // inline callback identity must never reset an in-flight guard timer.
  const onSentRef = React.useRef(onSent);

  React.useEffect(() => {
    onSentRef.current = onSent;
  }, [onSent]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      sealAnimRef.current?.stop();
    };
  }, []);

  React.useEffect(() => {
    if (phase === "letter") return;

    if (phase === "envelope" && motionSafe) {
      sealAnimRef.current?.stop();
      sealScale.set(SEAL_PEAK);
      sealAnimRef.current = animate(sealScale, 1, {
        ...springs.recoil,
        delay: SEAL_DELAY_S,
      });
    }

    let next: Phase;
    switch (phase) {
      case "fold-bottom":
        next = "fold-top";
        break;
      case "fold-top":
        next = "envelope";
        break;
      case "envelope":
        next = "flying";
        break;
      case "flying":
        next = "empty";
        break;
      case "empty":
        next = motionSafe ? "arriving" : "letter";
        break;
      case "arriving":
        next = "letter";
        break;
    }

    const guard = motionSafe ? MOTION_GUARD_MS : REDUCED_GUARD_MS;
    const ms = guard[phase];

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (phase === "envelope") onSentRef.current?.();
      setPhase(next);
    }, ms);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [phase, motionSafe, sealScale]);

  const handleClick = () => {
    if (phase !== "letter") return;
    setPhase("fold-bottom");
  };

  const topFolded = motionSafe && phase === "fold-top";
  const bottomFolded =
    motionSafe && (phase === "fold-bottom" || phase === "fold-top");

  const showLetterContent =
    phase === "letter" ||
    phase === "fold-bottom" ||
    phase === "fold-top" ||
    phase === "arriving";
  const showEnvelopeContent = motionSafe
    ? phase === "envelope" || phase === "flying"
    : phase === "envelope";
  const showBody = showLetterContent || showEnvelopeContent;

  const restSize = showEnvelopeContent
    ? { width: ENVELOPE_W, height: ENVELOPE_H, borderRadius: RADIUS_ENVELOPE }
    : { width: LETTER_W, height: LETTER_H, borderRadius: RADIUS_LETTER };

  const bodyAnimate =
    phase === "flying"
      ? {
          x: [...FLY_X],
          y: [...FLY_Y],
          rotate: [...FLY_ROTATE],
          opacity: [...FLY_OPACITY],
          ...restSize,
        }
      : { x: 0, y: 0, rotate: 0, opacity: 1, ...restSize };

  const bodyTransition = !motionSafe
    ? { duration: 0 }
    : phase === "flying"
      ? { duration: FLY_S, ease: easings.exit, times: [...FLY_TIMES] }
      : phase === "envelope"
        ? {
            width: { duration: ENVELOPE_MORPH_S, ease: easings.move },
            height: { duration: ENVELOPE_MORPH_S, ease: easings.move },
            borderRadius: { duration: ENVELOPE_MORPH_S, ease: easings.move },
          }
        : phase === "arriving"
          ? springs.glide
          : { duration: 0 };

  const liveMessage =
    phase === "flying"
      ? "Sent."
      : phase === "arriving"
        ? "New letter ready."
        : "";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Send the letter"
      className={cn(
        "relative flex flex-col items-center overflow-hidden rounded-4 border border-hairline bg-surface-1 px-4 pt-4 pb-3 outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        !motionSafe && "active:brightness-95",
        className,
      )}
      style={{ width: STAGE_W, height: STAGE_H }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
        className="pointer-events-none absolute inset-0 size-full"
      >
        <motion.path
          d={TRAIL_D}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.25}
          strokeDasharray="4 4"
          strokeLinecap="round"
          initial={false}
          animate={
            motionSafe
              ? phase === "flying"
                ? { pathLength: 1, opacity: 0.7 }
                : phase === "empty" || phase === "arriving"
                  ? { pathLength: 1, opacity: 0 }
                  : { pathLength: 0, opacity: 0 }
              : { pathLength: 0, opacity: 0 }
          }
          transition={
            motionSafe
              ? phase === "flying"
                ? { duration: FLY_S, ease: "linear" }
                : { duration: durations.slow, ease: easings.exit }
              : { duration: 0 }
          }
        />
      </svg>

      <div
        className="relative z-10 flex w-full items-center justify-center gap-2"
        style={{ height: CONTENT_H }}
      >
        <AnimatePresence initial={false}>
          {showBody && (
            <motion.div
              key="mail-body"
              className="relative overflow-hidden border border-hairline-strong bg-surface-0 shadow-raised"
              style={{ transformOrigin: "50% 50%" }}
              initial={
                motionSafe
                  ? {
                      x: 0,
                      y: -ARRIVE_DROP,
                      rotate: 0,
                      opacity: 0,
                      width: LETTER_W,
                      height: LETTER_H,
                      borderRadius: RADIUS_LETTER,
                    }
                  : false
              }
              animate={bodyAnimate}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }
                  : { opacity: 0, transition: { duration: 0 } }
              }
              transition={bodyTransition}
            >
              {showLetterContent && (
                <div className="flex h-full w-full flex-col">
                  <motion.div
                    aria-hidden
                    className="flex items-start p-2"
                    style={{ height: PANEL_H, transformOrigin: "top center" }}
                    animate={{ scaleY: topFolded ? 0 : 1 }}
                    transition={
                      motionSafe
                        ? { duration: FOLD_S, ease: easings.move }
                        : { duration: 0 }
                    }
                  >
                    <span
                      className="block rounded-1 bg-surface-2"
                      style={{ width: 36, height: 6 }}
                    />
                  </motion.div>

                  <div
                    aria-hidden
                    className="flex flex-col justify-center gap-2 px-2"
                    style={{ height: PANEL_H }}
                  >
                    <span
                      className="block border-t border-hairline-strong"
                      style={{ width: "78%" }}
                    />
                    <span
                      className="block border-t border-hairline-strong"
                      style={{ width: "58%" }}
                    />
                  </div>

                  <motion.div
                    aria-hidden
                    className="flex flex-col justify-between p-2"
                    style={{
                      height: PANEL_H,
                      transformOrigin: "bottom center",
                    }}
                    animate={{ scaleY: bottomFolded ? 0 : 1 }}
                    transition={
                      motionSafe
                        ? { duration: FOLD_S, ease: easings.move }
                        : { duration: 0 }
                    }
                  >
                    <span
                      className="block border-t border-hairline-strong"
                      style={{ width: "66%" }}
                    />
                    <svg
                      viewBox="0 0 40 12"
                      width={40}
                      height={12}
                      className="text-ink-2"
                    >
                      <path
                        d="M2 9 Q8 2 14 9 T26 9 T38 5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.4}
                        strokeLinecap="round"
                      />
                    </svg>
                  </motion.div>
                </div>
              )}

              {showEnvelopeContent && (
                <>
                  <motion.div
                    aria-hidden
                    className="absolute inset-x-0 top-0 border-b border-hairline-strong bg-surface-2"
                    style={{
                      height: FLAP_H,
                      transformOrigin: "50% 0%",
                      clipPath: FLAP_CLIP,
                    }}
                    initial={motionSafe ? { scaleY: 0 } : false}
                    animate={{ scaleY: 1 }}
                    transition={
                      motionSafe
                        ? {
                            duration: FLAP_SWEEP_S,
                            ease: easings.move,
                            delay: FLAP_DELAY_S,
                          }
                        : { duration: 0 }
                    }
                  />
                  <motion.div
                    aria-hidden
                    className="absolute rounded-full border border-hairline-strong"
                    style={{
                      left: "50%",
                      top: SEAL_TOP,
                      width: SEAL_SIZE,
                      height: SEAL_SIZE,
                      marginLeft: -SEAL_SIZE / 2,
                      background: SEAL_FILL,
                      scale: sealScale,
                    }}
                    initial={motionSafe ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    transition={
                      motionSafe
                        ? { duration: durations.fast, delay: SEAL_DELAY_S }
                        : { duration: 0 }
                    }
                  />
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div aria-hidden className="relative z-10 flex h-5 items-center">
        <motion.span
          key={CAPTIONS[phase]}
          className="text-label font-mono text-ink-3"
          initial={motionSafe ? { opacity: 0, y: 3 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
        >
          {CAPTIONS[phase]}
        </motion.span>
      </div>

      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>
    </button>
  );
}
