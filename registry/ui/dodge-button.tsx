"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage box, in px — enough room for the button to dodge to every fixed offset. */
const STAGE_W = 340;
const STAGE_H = 180;

const BUTTON_W = 160;
const BUTTON_H = 44;

/**
 * Proximity, in px, that triggers a dodge. Spec asks for "~70px", but that
 * has to clear the half-diagonal of the button itself (~83px at this size)
 * — a threshold smaller than the button lets a straight approach along its
 * horizontal midline reach the rectangle before the circle, defeating the
 * dodge. 90px keeps a safe margin over that half-diagonal instead.
 */
const DODGE_THRESHOLD = 90;

/** How far a dodge moves the button off-center, in px. Sized so every offset
 * below keeps the button fully inside the stage. */
const DODGE_DX = 70;
const DODGE_DY = 46;

/**
 * Fixed cycle of escape offsets, far to near in reading order — never random,
 * always this table, always this order. Four entries covers the max clamp of
 * four dodges without ever repeating a spot back-to-back.
 */
const DODGE_OFFSETS = [
  { x: -DODGE_DX, y: -DODGE_DY }, // up-left
  { x: DODGE_DX, y: DODGE_DY }, // down-right
  { x: DODGE_DX, y: -DODGE_DY }, // up-right
  { x: -DODGE_DX, y: DODGE_DY }, // down-left
] as const;

const FALLBACK_OFFSET = { x: 0, y: 0 } as const;

/** How long "you got me." holds before the toy resets for another round. */
const RESET_DELAY_MS = 1400;

export type DodgeButtonProps = {
  /** Button label — keep it dry. @default "Delete everything" */
  label?: string;
  /** How many times the button dodges before it relents. Clamped 0..4. @default 2 */
  dodges?: number;
  /** Fires once the button is actually clicked (never on a dodge). */
  onConfirm?: () => void;
  className?: string;
};

/**
 * A button that plays hard to get — exactly twice. Move the pointer within
 * reach of its center (a fixed proximity radius, wide enough to clear the
 * button itself) and it springs to the next spot in a fixed offset cycle on
 * `snap`; do that twice and, on the next approach, it gives up and
 * glides back to center on `glide` while the caption flips from "catch me"
 * to "fine." and it becomes an ordinary, clickable button. Clicking confirms
 * — `onConfirm` fires, the caption reads "you got me.", and after a beat the
 * whole toy resets so it can be replayed. Keyboard is never dodged: focus
 * never moves the button (only pointer proximity does), and any Enter/Space
 * activation — a click with `detail === 0` — confirms immediately no matter
 * how many dodges remain, because a control that flees from a keyboard user
 * is broken, not playful. Coarse pointers (touch, detected via
 * `(pointer: fine)`) skip proximity dodging entirely for the same reason.
 * Reduced motion: no dodging at all — the button stays put and is
 * immediately clickable, with the caption reading "fine." from the start.
 */
export function DodgeButton({
  label = "Delete everything",
  dodges = 2,
  onConfirm,
  className,
}: DodgeButtonProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const pointerFine = usePointerFine();

  const dodgeTarget = Math.max(0, Math.min(4, Math.round(dodges)));

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const resetTimer = React.useRef<number | null>(null);

  const [dodgeCount, setDodgeCount] = React.useState(0);
  const [relented, setRelented] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState(false);

  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);

  // Whether proximity dodging can happen at all this render: rich motion,
  // a real mouse/trackpad, and a nonzero dodge quota. Anything else means
  // the toy is effectively already relented — reduced motion and coarse
  // pointers both fall through to "fine." from the start.
  const dodgingActive = motionSafe && pointerFine && dodgeTarget > 0;
  const isRelented = relented || confirmed || !dodgingActive;
  const caption = confirmed ? "you got me." : isRelented ? "fine." : "catch me";

  React.useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const dodge = () => {
    const offset =
      DODGE_OFFSETS[dodgeCount % DODGE_OFFSETS.length] ?? FALLBACK_OFFSET;
    animate(offsetX, offset.x, springs.snap);
    animate(offsetY, offset.y, springs.snap);
    setDodgeCount((count) => count + 1);
  };

  const relent = () => {
    animate(offsetX, 0, springs.glide);
    animate(offsetY, 0, springs.glide);
    setRelented(true);
  };

  // The ONLY place a dodge can start. Pointer proximity over the stage is
  // the sole trigger — focus is never consulted here, so Tab-ing to the
  // button (or any focus-visible state) can never move it.
  const handleStagePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!dodgingActive || isRelented) return;
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) return;
    const centerX = stageRect.left + stageRect.width / 2 + offsetX.get();
    const centerY = stageRect.top + stageRect.height / 2 + offsetY.get();
    const distance = Math.hypot(
      event.clientX - centerX,
      event.clientY - centerY,
    );
    if (distance > DODGE_THRESHOLD) return;
    if (dodgeCount >= dodgeTarget) {
      relent();
      return;
    }
    dodge();
  };

  const confirmNow = () => {
    onConfirm?.();
    setConfirmed(true);
    setRelented(true);
    if (motionSafe) {
      animate(offsetX, 0, springs.glide);
      animate(offsetY, 0, springs.glide);
    } else {
      offsetX.jump(0);
      offsetY.jump(0);
    }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setConfirmed(false);
      setRelented(false);
      setDodgeCount(0);
    }, RESET_DELAY_MS);
  };

  // Keyboard activation (Enter/Space) arrives as a click with detail === 0 —
  // always honored, regardless of the dodge count so far. A pointer click
  // only confirms once the button has actually relented; landing one before
  // that would mean the dodge threshold somehow failed to fire, so the
  // click is dropped rather than rewarding the accident.
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const isKeyboardActivation = event.detail === 0;
    if (!isKeyboardActivation && !isRelented) return;
    confirmNow();
  };

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-4 rounded-4 border border-hairline bg-surface-1 p-8",
        className,
      )}
    >
      <div
        ref={stageRef}
        onPointerMove={handleStagePointerMove}
        className="relative"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        <motion.button
          type="button"
          onClick={handleClick}
          style={{
            left: "50%",
            top: "50%",
            marginLeft: -BUTTON_W / 2,
            marginTop: -BUTTON_H / 2,
            width: BUTTON_W,
            height: BUTTON_H,
            x: offsetX,
            y: offsetY,
          }}
          className={cn(
            "absolute flex items-center justify-center overflow-hidden rounded-2 border border-hairline-strong bg-surface-2 px-2 text-xs font-medium text-ellipsis whitespace-nowrap text-ink shadow-raised select-none",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          {label}
        </motion.button>
      </div>

      <p className="min-h-[1em] font-mono text-[11px] tracking-[0.08em] text-ink-3">
        {caption}
      </p>

      <span role="status" aria-live="polite" className="sr-only">
        {confirmed ? "Confirmed." : ""}
      </span>
    </div>
  );
}
