"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useSpring } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type PuddingFlavor = "caramel" | "berry" | "matcha";

/** Press squash — base stays planted, dome spreads. */
const SQUASH_X = 1.16;
const SQUASH_Y = 0.72;
/** Reduced-motion "gently compressed" pose. */
const POSE_X = 1.04;
const POSE_Y = 0.93;

/** Three pokes inside this window make the pudding dizzy. */
const DIZZY_WINDOW_MS = 1500;
/** How long the wavy mouth holds before going back to content. */
const DIZZY_HOLD_MS = 950;

/** Fixed blink clock — deterministic, mount-driven. */
const BLINK_EVERY_MS = 3400;
const BLINK_HOLD_MS = 130;

/** Reduced motion: how long a poke reads as "wobbling" / stays compressed. */
const REDUCED_SETTLE_MS = 350;
const REDUCED_PRESS_MS = 220;

/** Flavor tints the caramel top layer; the custard body stays custard. */
const FLAVOR_TOP: Record<PuddingFlavor, string> = {
  caramel: "color-mix(in oklab, var(--warning, #b45309) 78%, var(--card))",
  berry: "color-mix(in oklab, var(--primary) 72%, var(--card))",
  matcha: "color-mix(in oklab, var(--success, #047857) 62%, var(--card))",
};

const BODY_FILL =
  "color-mix(in oklab, var(--warning, #b45309) 24%, var(--card))";

export type PokePuddingProps = {
  /** Tints the top layer. @default "caramel" */
  flavor?: PuddingFlavor;
  /** Fires on every poke with the running total. */
  onPoke?: (count: number) => void;
  className?: string;
};

/**
 * A wobbly pudding on a plate that begs to be poked. Pressing it squashes the
 * dome on `flick` from wherever the current wobble happens to be, and letting
 * go jiggles it back to rest on `recoil` — so rapid pokes stack up instead of
 * queueing. A minimal face sells the physics: slow deterministic blinks at
 * rest, wide eyes mid-wobble, and a wavy dizzy mouth after three pokes inside
 * a second and a half. Hovering tilts the whole dessert a hair toward the
 * cursor, and flavors retint the top layer between caramel, berry, and matcha.
 * Reduced motion: presses swap between two static poses (rest and gently
 * compressed) with no jiggle or tilt, and blinks become instant eye swaps.
 */
export function PokePudding({
  flavor = "caramel",
  onPoke,
  className,
}: PokePuddingProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [wobbling, setWobbling] = React.useState(false);
  const [dizzy, setDizzy] = React.useState(false);
  const [blink, setBlink] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);

  // Hover tilt: pointer math writes a raw value, a drift spring smooths it —
  // no refs are ever read in render.
  const rawTilt = useMotionValue(0);
  const tilt = useSpring(rawTilt, springs.drift);

  const pokes = React.useRef(0);
  const pokeStamps = React.useRef<number[]>([]);
  const pointerHeld = React.useRef(false);
  const dizzyTimer = React.useRef<number | null>(null);
  const calmTimer = React.useRef<number | null>(null);
  const pressTimer = React.useRef<number | null>(null);

  // Rest-state blink on a fixed clock. State only ever changes inside the
  // interval/timeout callbacks, never in the effect body itself.
  React.useEffect(() => {
    let hold = 0;
    const interval = window.setInterval(() => {
      setBlink(true);
      hold = window.setTimeout(() => setBlink(false), BLINK_HOLD_MS);
    }, BLINK_EVERY_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(hold);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (dizzyTimer.current !== null) window.clearTimeout(dizzyTimer.current);
      if (calmTimer.current !== null) window.clearTimeout(calmTimer.current);
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    };
  }, []);

  /** Count the poke, wake the face, and check the dizzy window. */
  const registerPoke = (stamp: number) => {
    pokes.current += 1;
    onPoke?.(pokes.current);

    const recent = pokeStamps.current.filter(
      (s) => stamp - s < DIZZY_WINDOW_MS,
    );
    recent.push(stamp);
    pokeStamps.current = recent;

    if (recent.length >= 3) {
      setDizzy(true);
      if (dizzyTimer.current !== null) window.clearTimeout(dizzyTimer.current);
      dizzyTimer.current = window.setTimeout(
        () => setDizzy(false),
        DIZZY_HOLD_MS,
      );
    }

    setWobbling(true);
    if (calmTimer.current !== null) {
      window.clearTimeout(calmTimer.current);
      calmTimer.current = null;
    }
  };

  /** Release back to rest — recoil jiggle, or an instant pose swap. */
  const settle = () => {
    setPressed(false);
    if (motionSafe) {
      animate(scaleX, 1, springs.recoil);
      animate(scaleY, 1, {
        ...springs.recoil,
        onComplete: () => setWobbling(false),
      });
    } else {
      if (calmTimer.current !== null) window.clearTimeout(calmTimer.current);
      calmTimer.current = window.setTimeout(
        () => setWobbling(false),
        REDUCED_SETTLE_MS,
      );
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    pointerHeld.current = true;
    registerPoke(event.timeStamp);
    setPressed(true);
    if (motionSafe) {
      animate(scaleX, SQUASH_X, springs.flick);
      animate(scaleY, SQUASH_Y, springs.flick);
    }
  };

  const releasePointer = () => {
    if (!pointerHeld.current) return;
    pointerHeld.current = false;
    settle();
  };

  // Keyboard pokes arrive as clicks with detail 0 (Enter/Space). Pointer pokes
  // were already handled down/up, so real clicks are ignored here.
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    registerPoke(event.timeStamp);
    if (motionSafe) {
      // Two keyframes total: park at the squash, spring home on recoil.
      scaleX.set(SQUASH_X);
      scaleY.set(SQUASH_Y);
      animate(scaleX, 1, springs.recoil);
      animate(scaleY, 1, {
        ...springs.recoil,
        onComplete: () => setWobbling(false),
      });
    } else {
      setPressed(true);
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(
        () => setPressed(false),
        REDUCED_PRESS_MS,
      );
      if (calmTimer.current !== null) window.clearTimeout(calmTimer.current);
      calmTimer.current = window.setTimeout(
        () => setWobbling(false),
        REDUCED_SETTLE_MS,
      );
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    rawTilt.set(Math.max(-0.5, Math.min(0.5, nx)) * 5);
  };

  const handlePointerLeave = () => {
    rawTilt.set(0);
    releasePointer();
  };

  const eyesWide = wobbling;
  const faceTween = {
    duration: motionSafe ? durations.fast : 0,
    ease: easings.enter,
  } as const;

  return (
    <button
      type="button"
      aria-label="Poke the pudding"
      onPointerDown={handlePointerDown}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      className={cn(
        "relative inline-flex touch-manipulation flex-col items-center rounded-4 p-3 select-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        className,
      )}
    >
      <span
        aria-hidden
        className="relative flex h-[112px] w-[176px] items-end justify-center"
      >
        {/* Plate */}
        <span className="absolute bottom-0 left-1/2 h-[22px] w-[160px] -translate-x-1/2 rounded-[50%] border border-hairline bg-surface-1 shadow-raised" />

        {/* Pudding — squashes about its base so it stays planted on the plate */}
        <motion.span
          className="relative mb-[9px] block h-[84px] w-[116px]"
          style={{
            scaleX: motionSafe ? scaleX : pressed ? POSE_X : 1,
            scaleY: motionSafe ? scaleY : pressed ? POSE_Y : 1,
            rotate: motionSafe ? tilt : 0,
            transformOrigin: "50% 100%",
          }}
        >
          {/* Custard body */}
          <span
            className="absolute inset-0 border border-hairline"
            style={{
              background: BODY_FILL,
              borderRadius: "50% 50% 47% 47% / 84% 84% 24% 24%",
            }}
          />

          {/* Flavor top layer, with two lazy drips */}
          <span
            className="absolute top-0 left-1/2 h-[36px] w-[98px] -translate-x-1/2"
            style={{
              background: FLAVOR_TOP[flavor],
              borderRadius: "50% 50% 45% 45% / 90% 90% 45% 45%",
            }}
          >
            <span
              className="absolute -bottom-[7px] left-[14px] h-[13px] w-[9px] rounded-b-full"
              style={{ background: FLAVOR_TOP[flavor] }}
            />
            <span
              className="absolute right-[20px] -bottom-[9px] h-[15px] w-[9px] rounded-b-full"
              style={{ background: FLAVOR_TOP[flavor] }}
            />
          </span>

          {/* Face */}
          <span className="absolute inset-x-0 top-[42px] flex flex-col items-center gap-[6px] text-ink">
            <span className="flex gap-[14px]">
              {[0, 1].map((eye) => (
                <motion.span
                  key={eye}
                  className="block h-[7px] w-[7px] rounded-full bg-current"
                  initial={false}
                  animate={{
                    scaleX: eyesWide ? 1.35 : 1,
                    scaleY: eyesWide ? 1.35 : blink ? 0.15 : 1,
                  }}
                  transition={{ duration: motionSafe ? durations.blink : 0 }}
                />
              ))}
            </span>
            <span className="relative h-[9px] w-[18px]">
              {/* Content smile */}
              <motion.span
                className="absolute top-0 left-1/2 h-[6px] w-[12px] -translate-x-1/2 rounded-b-full border-b-2 border-current"
                initial={false}
                animate={{ opacity: dizzy || wobbling ? 0 : 1 }}
                transition={faceTween}
              />
              {/* Surprised "o" while wobbling */}
              <motion.span
                className="absolute top-0 left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full border-2 border-current"
                initial={false}
                animate={{ opacity: wobbling && !dizzy ? 1 : 0 }}
                transition={faceTween}
              />
              {/* Dizzy wave */}
              <motion.span
                className="absolute top-0 left-1/2 flex -translate-x-1/2"
                initial={false}
                animate={{ opacity: dizzy ? 1 : 0 }}
                transition={faceTween}
              >
                <span className="-mr-[1px] h-[5px] w-[7px] translate-y-[3px] rounded-t-full border-t-2 border-current" />
                <span className="h-[5px] w-[7px] rounded-b-full border-b-2 border-current" />
              </motion.span>
            </span>
          </span>
        </motion.span>
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {wobbling ? "wobbling" : ""}
      </span>
    </button>
  );
}
