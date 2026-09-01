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
import { cn } from "@/registry/lib/utils";

/** Stage box, in px — room for the button plus the dog peeking above it. */
const STAGE_W = 220;
const STAGE_H = 156;

const BUTTON_W = 172;
const BUTTON_H = 56;
/** Button top, measured from the stage top — the "fence line" the dog hides behind. */
const BUTTON_TOP = 80;

const RUMP_W = 132;
const RUMP_H = 66;
/** Crests 20px above the button's top edge; the rest is hidden behind it. */
const RUMP_TOP = BUTTON_TOP - 20;

const EAR_W = 30;
const EAR_H = 34;
/** Dips 8px behind the button so only the crest reads as "peeking". */
const EAR_BOTTOM = BUTTON_TOP + 8;
const EAR_OFFSET = 46;

const TAIL_W = 22;
const TAIL_H = 64;
/** Sprouts a little into the rump's crest, off-center like a real tail. */
const TAIL_BOTTOM = RUMP_TOP + 16;
const TAIL_OFFSET = 30;

/** Fur tones — warm and dog-colored, never the cobalt brand accent. */
const FUR = "color-mix(in oklab, var(--warn) 46%, var(--card))";
const FUR_DEEP = "color-mix(in oklab, var(--warn) 68%, var(--card))";

/** Proximity buckets, far to near — the boundaries between wag rates (px). */
const FAR_THRESHOLD = 520;
const MID_THRESHOLD = 320;
const NEAR_THRESHOLD = 160;

/** Tween duration per bucket (s) — a lazy sway far away, a happy blur up close. */
const WAG_DURATIONS_S = [1.6, 1.0, 0.55, 0.28] as const;
/** Reduced-motion: the same four buckets read as four fixed, instant angles. */
const REDUCED_TAIL_DEG = [6, 11, 16, 22] as const;
/** Reduced-motion click pose — distinct from any resting bucket angle. */
const WIGGLE_TAIL_DEG = 28;

const WAG_ANGLES = [-18, 18, -18] as const;
const WAG_TIMES = [0, 0.5, 1] as const;

const RUMP_SHIMMY_X = [0, -6, 6, -4, 4, 0] as const;
const RUMP_SHIMMY_TIMES = [0, 0.15, 0.4, 0.65, 0.85, 1] as const;

/** Ear rest tilt (outward, relaxed) vs. perked (raised, alert), in degrees. */
const EAR_REST_DEG = 24;
const EAR_PERK_DEG = 4;

/** How long the full-body wiggle (and its caption swap) holds after a pet. */
const WIGGLE_MS = 1200;
/** How long the popped glyph stays up before it fades. */
const GLYPH_MS = 900;

const wagDurationFor = (bucket: number): number =>
  WAG_DURATIONS_S[bucket] ?? 1.6;

const reducedAngleFor = (bucket: number): number =>
  REDUCED_TAIL_DEG[bucket] ?? 6;

/** Maps cursor distance from the component's center to one of four buckets. */
const bucketForDistance = (distance: number): number => {
  if (distance > FAR_THRESHOLD) return 0;
  if (distance > MID_THRESHOLD) return 1;
  if (distance > NEAR_THRESHOLD) return 2;
  return 3;
};

export type TailWagProps = {
  /** Fires every time the button is petted. */
  onPet?: () => void;
  className?: string;
};

/**
 * A dog hiding behind a "Good dog" button, only its rump, tail, and two ears
 * cresting the top edge. A window-level pointer listener measures distance
 * from the component's center and buckets it into one of four wag rates — far
 * is a lazy ~1.6s sway, close is a happy ~0.28s blur — restarting the tail's
 * looping tween only when the bucket changes, never on every pointer move.
 * Petting the button fires a full-body wiggle: the rump shimmies, the ears
 * perk on a spring, the tail maxes out its wag for a beat, and a small heart
 * pops and fades above while a dry mono caption flips from lowercase to
 * shouting and back. Reduced motion: the tail never loops, holding one of
 * the same four buckets as a fixed instant angle instead, and a pet swaps it
 * to a distinct still "wiggle" pose for the beat with the heart still shown.
 */
export function TailWag({ onPet, className }: TailWagProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const [rateBucket, setRateBucket] = React.useState(0);
  const [wiggling, setWiggling] = React.useState(false);
  const [pulseId, setPulseId] = React.useState(0);
  const [glyphVisible, setGlyphVisible] = React.useState(false);

  const wiggleTimer = React.useRef<number | null>(null);
  const earRelaxTimer = React.useRef<number | null>(null);
  const glyphTimer = React.useRef<number | null>(null);

  // Raw pointer distance, written every move; only the bucket derived from it
  // ever becomes React state, and only when it actually changes.
  const proximity = useMotionValue(9999);
  const aura = useTransform(proximity, [560, 60], [0, 0.35]);

  const tailRotate = useMotionValue(reducedAngleFor(0));
  const earLift = useMotionValue(0);
  const rumpX = useMotionValue(0);

  const leftEarRotate = useTransform(
    earLift,
    [0, 1],
    [-EAR_REST_DEG, -EAR_PERK_DEG],
  );
  const rightEarRotate = useTransform(
    earLift,
    [0, 1],
    [EAR_REST_DEG, EAR_PERK_DEG],
  );

  // Proximity tracking: a window listener (not a scoped onPointerMove) so the
  // wag reacts to how close the cursor is anywhere on the page, not just
  // hover. The handler writes the raw distance to a motion value every move
  // and only touches state when the bucket it maps to actually changes.
  React.useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(
        event.clientX - centerX,
        event.clientY - centerY,
      );
      proximity.set(distance);
      const bucket = bucketForDistance(distance);
      setRateBucket((current) => (current === bucket ? current : bucket));
    };
    window.addEventListener("pointermove", handleMove);
    return () => window.removeEventListener("pointermove", handleMove);
  }, [proximity]);

  // The wag itself: a looping multi-keyframe tween whose duration only swaps
  // on a bucket (or wiggle) change — never restarted per pointermove. Under
  // reduced motion there is no loop at all, just an instant angle jump.
  React.useEffect(() => {
    if (!motionSafe) {
      if (!wiggling) tailRotate.jump(reducedAngleFor(rateBucket));
      return;
    }
    const duration = wiggling ? wagDurationFor(3) : wagDurationFor(rateBucket);
    const controls = animate(tailRotate, [...WAG_ANGLES], {
      duration,
      times: [...WAG_TIMES],
      ease: easings.move,
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [motionSafe, rateBucket, wiggling, tailRotate]);

  // Clear every timer on unmount so nothing fires after teardown.
  React.useEffect(() => {
    return () => {
      if (wiggleTimer.current !== null)
        window.clearTimeout(wiggleTimer.current);
      if (earRelaxTimer.current !== null)
        window.clearTimeout(earRelaxTimer.current);
      if (glyphTimer.current !== null) window.clearTimeout(glyphTimer.current);
    };
  }, []);

  const handlePet = () => {
    onPet?.();
    setWiggling(true);
    setPulseId((id) => id + 1);
    setGlyphVisible(true);

    if (wiggleTimer.current !== null) window.clearTimeout(wiggleTimer.current);
    wiggleTimer.current = window.setTimeout(() => {
      setWiggling(false);
    }, WIGGLE_MS);

    if (glyphTimer.current !== null) window.clearTimeout(glyphTimer.current);
    glyphTimer.current = window.setTimeout(() => {
      setGlyphVisible(false);
    }, GLYPH_MS);

    if (earRelaxTimer.current !== null)
      window.clearTimeout(earRelaxTimer.current);

    if (motionSafe) {
      animate(earLift, 1, springs.snap);
      earRelaxTimer.current = window.setTimeout(() => {
        animate(earLift, 0, springs.glide);
      }, WIGGLE_MS);

      rumpX.set(0);
      animate(rumpX, [...RUMP_SHIMMY_X], {
        duration: 0.55,
        ease: easings.move,
        times: [...RUMP_SHIMMY_TIMES],
      });
    } else {
      tailRotate.jump(WIGGLE_TAIL_DEG);
      earLift.jump(1);
      earRelaxTimer.current = window.setTimeout(() => {
        earLift.jump(0);
      }, WIGGLE_MS);
    }
  };

  const caption = wiggling ? "GOOD DOG" : "good dog";

  return (
    <div
      ref={containerRef}
      className={cn(
        "inline-flex flex-col items-center gap-4 rounded-4 border border-hairline bg-card p-8",
        className,
      )}
    >
      <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
        {motionSafe && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: "50%",
              top: BUTTON_TOP + BUTTON_H / 2,
              width: BUTTON_W + 44,
              height: BUTTON_W + 44,
              marginLeft: -(BUTTON_W + 44) / 2,
              marginTop: -(BUTTON_W + 44) / 2,
              background:
                "radial-gradient(circle, var(--signal) 0%, transparent 70%)",
              opacity: aura,
            }}
          />
        )}

        {/* Rump — mostly hidden behind the button, just its crest visible. */}
        <motion.span
          aria-hidden
          className="absolute border border-hairline"
          style={{
            left: "50%",
            top: RUMP_TOP,
            width: RUMP_W,
            height: RUMP_H,
            marginLeft: -RUMP_W / 2,
            borderRadius: "62px 62px 24px 24px / 70px 70px 22px 22px",
            background: FUR,
            x: rumpX,
          }}
        />

        {/* Tail — pivots at its base; the transform-origin trap only bites
            motion SVG children, and this is a plain HTML element. */}
        <motion.span
          aria-hidden
          className="absolute flex flex-col-reverse items-center"
          style={{
            left: "50%",
            top: TAIL_BOTTOM - TAIL_H,
            width: TAIL_W,
            height: TAIL_H,
            marginLeft: TAIL_OFFSET - TAIL_W / 2,
            rotate: tailRotate,
            transformOrigin: "bottom center",
          }}
        >
          <span
            className="block rounded-full border border-hairline"
            style={{ width: 16, height: 28, background: FUR }}
          />
          <span
            className="block rounded-full border border-hairline"
            style={{ width: 12, height: 24, marginBottom: -8, background: FUR }}
          />
          <span
            className="block rounded-full border border-hairline"
            style={{
              width: 8,
              height: 20,
              marginBottom: -6,
              background: FUR_DEEP,
            }}
          />
        </motion.span>

        {/* Ears — crest above the button's top edge, perking up on a pet. */}
        <motion.span
          aria-hidden
          className="absolute border border-hairline"
          style={{
            left: "50%",
            top: EAR_BOTTOM - EAR_H,
            width: EAR_W,
            height: EAR_H,
            marginLeft: -EAR_OFFSET - EAR_W / 2,
            borderRadius: "60% 60% 20% 20% / 85% 85% 15% 15%",
            background: FUR,
            rotate: leftEarRotate,
            transformOrigin: "bottom center",
          }}
        />
        <motion.span
          aria-hidden
          className="absolute border border-hairline"
          style={{
            left: "50%",
            top: EAR_BOTTOM - EAR_H,
            width: EAR_W,
            height: EAR_H,
            marginLeft: EAR_OFFSET - EAR_W / 2,
            borderRadius: "60% 60% 20% 20% / 85% 85% 15% 15%",
            background: FUR,
            rotate: rightEarRotate,
            transformOrigin: "bottom center",
          }}
        />

        {/* Heart — pops on a pet, fades on an exit tween. */}
        <span
          aria-hidden
          className="pointer-events-none absolute flex items-center justify-center"
          style={{
            left: "50%",
            top: 0,
            width: 24,
            height: 24,
            marginLeft: -12,
          }}
        >
          <AnimatePresence>
            {glyphVisible && (
              <motion.span
                key={pulseId}
                className="absolute"
                initial={
                  motionSafe ? { opacity: 0, scale: 0.4, y: 4 } : { opacity: 0 }
                }
                animate={
                  motionSafe ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1 }
                }
                exit={{
                  opacity: 0,
                  transition: {
                    duration: motionSafe ? durations.fast : 0,
                    ease: easings.exit,
                  },
                }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.recoil,
                        y: springs.recoil,
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
                      }
                    : { duration: 0 }
                }
              >
                <Heart
                  className="size-5"
                  fill="var(--signal)"
                  stroke="var(--signal)"
                />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        {/* The button — a real, focusable control; everything above is aria-hidden. */}
        <button
          type="button"
          onClick={handlePet}
          className={cn(
            "absolute z-10 rounded-full border border-hairline-strong bg-surface-2 text-sm font-medium text-ink shadow-raised select-none",
            "transition-colors outline-none active:brightness-95",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2",
          )}
          style={{
            left: "50%",
            top: BUTTON_TOP,
            width: BUTTON_W,
            height: BUTTON_H,
            marginLeft: -BUTTON_W / 2,
          }}
        >
          Good dog
        </button>
      </div>

      <p className="min-h-[1em] font-mono text-[11px] tracking-[0.08em] text-ink-3">
        {caption}
      </p>

      <span aria-live="polite" className="sr-only">
        {wiggling ? "Good dog, wiggling with joy" : ""}
      </span>
    </div>
  );
}
