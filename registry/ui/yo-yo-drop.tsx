"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Disc diameter in px. */
const DISC = 52;
/** Where the string ties on — the fingertip y inside the stage. */
const ANCHOR_Y = 24;
/** Extra string tucked behind the disc so the line never visibly detaches. */
const STRING_OVERLAP = 6;
/** Post-return settle: park the drop here, then recoil home. */
const SETTLE_PEAK = 10;

/** One fast revolution while sleeping. */
const SLEEP_TURN_S = 0.45;
/** The wind-down after release: one slower part-turn, then still. */
const DECEL_TURN_DEG = 420;
const DECEL_TURN_S = 0.9;

/** Sleeping string vibration — subtle. */
const VIB_AMP = 1.25;
const VIB_S = 0.08;
/** Overstayed-hold wobble — the yo-yo hinting it wants to come home. */
const WOBBLE_AMP = 2.5;
const WOBBLE_S = 0.12;
const WOBBLE_AFTER_MS = 4000;

/** How long the caption savors a clean return. */
const NICE_HOLD_MS = 1100;

const CAPTIONS = {
  rest: "hold to sleep",
  sleeping: "sleeping…",
  nice: "nice.",
} as const;

type Phase = keyof typeof CAPTIONS;

/** Two-tone paint: an accent rim around a paler face. */
const RIM_FILL = "color-mix(in oklab, var(--primary) 82%, var(--card))";
const FACE_FILL = "color-mix(in oklab, var(--primary) 26%, var(--card))";

export type YoYoDropProps = {
  /** Full string drop in px. @default 140 */
  stringLength?: number;
  /** Fires each time the yo-yo makes it back to the finger. */
  onReturn?: () => void;
  className?: string;
};

/**
 * A yo-yo hanging off a finger, begging for one good throw. Press and hold —
 * pointer, or Space/Enter held down — and it drops the full string on `glide`,
 * then sleeps at the bottom: a fast linear spin on the rim stripe with a faint
 * vibration in the string. Hold past four seconds and the vibration widens
 * into a wobble, the yo-yo hinting it wants to come home. Let go and it climbs
 * back on `snap`, the spin winds down through one slow final turn, and it
 * lands against the finger with a single recoil bounce while a mono caption
 * walks “hold to sleep” → “sleeping…” → “nice.”
 * Reduced motion: the yo-yo sits at the bottom the instant you press and back
 * at the finger the instant you release, the stripe never spins, and the
 * caption still cycles.
 */
export function YoYoDrop({
  stringLength = 140,
  onReturn,
  className,
}: YoYoDropProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const length = Math.max(24, stringLength);

  const [phase, setPhase] = React.useState<Phase>("rest");

  // How far the yo-yo has dropped, 0 (at the finger) → length (sleeping).
  // Springs are free to overshoot past 0; the clamp below reads it as the
  // disc smacking into the hand, which is exactly the physics we want.
  const drop = useMotionValue(0);
  const discY = useTransform(drop, (v) => Math.max(0, v));
  const stringHeight = useTransform(drop, (v) => Math.max(0, v) + STRING_OVERLAP);

  // Sleep-vibration x on the string, spin degrees on the rim stripe.
  const stringX = useMotionValue(0);
  const spin = useMotionValue(0);

  const held = React.useRef(false);
  const dropAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const spinAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const vibAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const wobbleTimer = React.useRef<number | null>(null);
  const niceTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      dropAnim.current?.stop();
      spinAnim.current?.stop();
      vibAnim.current?.stop();
      if (wobbleTimer.current !== null) window.clearTimeout(wobbleTimer.current);
      if (niceTimer.current !== null) window.clearTimeout(niceTimer.current);
    };
  }, []);

  /** Mirror-looped tween on the string x — the sleeping buzz. */
  const vibrate = (amp: number, dur: number) => {
    vibAnim.current?.stop();
    vibAnim.current = animate(stringX, [-amp, amp], {
      duration: dur,
      ease: easings.move,
      repeat: Infinity,
      repeatType: "mirror",
    });
  };

  /** After a clean return, savor it for a beat, then invite the next hold. */
  const scheduleRest = () => {
    setPhase("nice");
    if (niceTimer.current !== null) window.clearTimeout(niceTimer.current);
    niceTimer.current = window.setTimeout(() => setPhase("rest"), NICE_HOLD_MS);
  };

  const press = () => {
    if (held.current) return;
    held.current = true;

    if (niceTimer.current !== null) {
      window.clearTimeout(niceTimer.current);
      niceTimer.current = null;
    }
    setPhase("sleeping");

    if (motionSafe) {
      // Fast sleep spin: a seamless linear loop, one turn per repeat.
      spinAnim.current?.stop();
      const from = spin.get() % 360;
      spin.set(from);
      spinAnim.current = animate(spin, from + 360, {
        duration: SLEEP_TURN_S,
        ease: easings.linear,
        repeat: Infinity,
      });

      // Drop the full string; the buzz starts once it is truly sleeping.
      dropAnim.current = animate(drop, length, {
        ...springs.glide,
        onComplete: () => vibrate(VIB_AMP, VIB_S),
      });

      // Overstay the hold and the sleep grows restless.
      if (wobbleTimer.current !== null) window.clearTimeout(wobbleTimer.current);
      wobbleTimer.current = window.setTimeout(() => {
        if (held.current) vibrate(WOBBLE_AMP, WOBBLE_S);
      }, WOBBLE_AFTER_MS);
    } else {
      drop.set(length);
    }
  };

  const release = () => {
    if (!held.current) return;
    held.current = false;

    if (wobbleTimer.current !== null) {
      window.clearTimeout(wobbleTimer.current);
      wobbleTimer.current = null;
    }

    if (motionSafe) {
      // The string calms down — a quick exit tween back to plumb.
      vibAnim.current?.stop();
      vibAnim.current = animate(stringX, 0, {
        duration: durations.fast,
        ease: easings.exit,
      });

      // Spin decelerates: swap the loop for one slower final turn.
      spinAnim.current?.stop();
      spinAnim.current = animate(spin, spin.get() + DECEL_TURN_DEG, {
        duration: DECEL_TURN_S,
        ease: easings.enter,
      });

      // Climb home on snap; on arrival, one tiny settle bounce on recoil.
      dropAnim.current = animate(drop, 0, {
        ...springs.snap,
        onComplete: () => {
          onReturn?.();
          drop.set(SETTLE_PEAK);
          dropAnim.current = animate(drop, 0, {
            ...springs.recoil,
            onComplete: scheduleRest,
          });
        },
      });
    } else {
      drop.set(0);
      onReturn?.();
      scheduleRest();
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    press();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat) return;
    press();
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    release();
  };

  return (
    <button
      type="button"
      aria-label="Drop the yo-yo"
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={release}
      className={cn(
        "relative inline-flex touch-manipulation flex-col items-center gap-2 rounded-4 p-3 select-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        className,
      )}
    >
      <span
        aria-hidden
        className="relative block w-[88px]"
        style={{ height: ANCHOR_Y + length + DISC + 4 }}
      >
        {/* Finger anchor — a fist with one finger offered to the string */}
        <span className="absolute top-0 left-1/2 flex -translate-x-1/2 flex-col items-center">
          <span className="h-[16px] w-[28px] rounded-2 border border-hairline bg-surface-2" />
          <span className="-mt-[3px] h-[13px] w-[9px] rounded-b-full border border-hairline bg-surface-2" />
        </span>

        {/* String — height tracks the drop, x carries the sleep buzz */}
        <motion.span
          className="absolute left-1/2 -ml-px block w-[2px] rounded-full"
          style={{
            top: ANCHOR_Y,
            height: stringHeight,
            x: stringX,
            background: "var(--ink-3)",
          }}
        />

        {/* Disc yo-yo — accent rim, paler face, hub, painted rim stripe */}
        <motion.span
          className="absolute left-1/2 block"
          style={{
            top: ANCHOR_Y - 2,
            width: DISC,
            height: DISC,
            marginLeft: -DISC / 2,
            y: discY,
          }}
        >
          <span
            className="absolute inset-0 rounded-full border border-hairline shadow-raised"
            style={{ background: RIM_FILL }}
          />
          <span
            className="absolute inset-[7px] rounded-full border border-hairline"
            style={{ background: FACE_FILL }}
          />
          {/* The stripe rides a rotating layer so the sleep spin is legible */}
          <motion.span
            className="absolute inset-0 block rounded-full"
            style={{ rotate: spin }}
          >
            <span className="absolute top-[3px] left-1/2 -ml-[2px] h-[9px] w-[4px] rounded-full bg-surface-0" />
          </motion.span>
          <span className="absolute top-1/2 left-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline bg-surface-1" />
        </motion.span>
      </span>

      <span
        aria-hidden
        className="h-4 font-mono text-label leading-none text-ink-3"
      >
        {CAPTIONS[phase]}
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {phase === "sleeping" ? "sleeping" : phase === "nice" ? "returned" : ""}
      </span>
    </button>
  );
}
