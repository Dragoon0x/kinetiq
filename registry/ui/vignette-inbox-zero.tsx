"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry, px — the ~220×170 footprint the spec calls for. */
const STAGE_H = 170;
const ENV_W = 172;
const ENV_H = 116;
const FLAP_H = 46;
const FLAP_CLIP = "polygon(0% 0%, 100% 0%, 50% 100%)";
/** Where the front pocket panel begins — the flap covers above this line. */
const POCKET_TOP = 42;
const CARD_W = 94;
const CARD_H = 56;
/** How far a card rises before it is gone, px. */
const CARD_RISE_Y = -44;

/** One full loop, seconds — every tween below shares this and `repeat: Infinity`. */
const LOOP_S = 9;

/**
 * Loop beats as fractions of one cycle — the single source both the shared
 * clock's `times` arrays and the badge's own timers read from, so a card
 * finishing its rise and the badge dropping a digit stay the same instant.
 */
const T = {
  flapOpenEnd: 0.06,
  card0Start: 0.09,
  card0End: 0.23,
  card1Start: 0.26,
  card1End: 0.4,
  card2Start: 0.43,
  card2End: 0.57,
  flapCloseStart: 0.6,
  flapCloseEnd: 0.66,
  pipInStart: 0.68,
  pipInEnd: 0.76,
  pipOutStart: 0.94,
} as const;

const FLAP_TIMES = [
  0,
  T.flapOpenEnd,
  T.flapCloseStart,
  T.flapCloseEnd,
  1,
] as const;
const FLAP_ROTATE = [0, -160, -160, 0, 0] as const;

type CardSpec = {
  id: string;
  riseStart: number;
  riseEnd: number;
  /** Slight, fixed rotate on the way out — never randomized. */
  rotateTo: number;
  /** Fan spread and stagger so the stack reads as three, not one. */
  fanX: number;
  fanTop: number;
  z: number;
};

/** Fixed table, index 0 is the top card — it leaves first. */
const CARDS = [
  {
    id: "c1",
    riseStart: T.card0Start,
    riseEnd: T.card0End,
    rotateTo: -9,
    fanX: -10,
    fanTop: -6,
    z: 3,
  },
  {
    id: "c2",
    riseStart: T.card1Start,
    riseEnd: T.card1End,
    rotateTo: 6,
    fanX: 0,
    fanTop: -2,
    z: 2,
  },
  {
    id: "c3",
    riseStart: T.card2Start,
    riseEnd: T.card2End,
    rotateTo: -5,
    fanX: 10,
    fanTop: 2,
    z: 1,
  },
] as const satisfies readonly CardSpec[];

const PIP_TIMES = [0, T.pipInStart, T.pipInEnd, T.pipOutStart, 1] as const;
const PIP_OPACITY = [0, 0, 1, 1, 0] as const;
const PIP_SCALE = [0.7, 0.7, 1, 1, 0.85] as const;

const TICK_TIMES = [0, T.pipInStart, T.pipInEnd, 1] as const;
const TICK_PATH_LENGTH = [0, 0, 1, 1] as const;

/** "3" → "2" → "1" → "0", read off a tick counter rather than the clock. */
const BADGE_SEQUENCE = ["3", "2", "1", "0"] as const;
/** Seconds (as a fraction of one loop) from each step to the next. */
const STEP_DELAY_FRACTIONS = [
  T.card0End,
  T.card1End - T.card0End,
  T.card2End - T.card1End,
  1 - T.card2End,
] as const;

const DEFAULT_LABEL =
  "Three messages leaving an inbox, one by one, until the count reads zero.";

export type VignetteInboxZeroProps = {
  label?: string;
  className?: string;
};

/**
 * An inbox settling to zero. The flap tips back, and the three message cards
 * tucked in the slot lift out one at a time — rising, tilting a little,
 * fading as they clear the fold — while a mono badge counts the drop from
 * three down to zero on its own timer, so the loop never just shows an
 * empty envelope; it shows the emptying. The last card leaving is the beat
 * the scene is built around: the flap settles shut behind it and a small
 * check pip draws itself in, the zero on the badge meaning something because
 * the loop just watched it get there. One shared clock carries the flap,
 * every card, and the pip; the badge's timers read off the same beats and
 * stop the instant the envelope leaves view, picking back up from the top
 * rather than mid-count.
 *
 * Reduced motion: renders the final frame — flap closed, badge at zero, the
 * check pip already drawn in — nothing moves.
 */
export function VignetteInboxZero({
  label = DEFAULT_LABEL,
  className,
}: VignetteInboxZeroProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = React.useState(true);

  // Pause off-screen and when the tab is hidden — the observer and the
  // visibility listener both funnel through the same sync, mirroring how
  // the rest of Kinetiq's ambient loops gate their clock on visibility.
  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    let inView = true;
    const sync = () => {
      setPlaying(inView && document.visibilityState !== "hidden");
    };
    const observer = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1];
      if (last) inView = last.isIntersecting;
      sync();
    });
    observer.observe(node);
    const onVisibility = () => sync();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const active = motionSafe && playing;

  // Mode change: settle the badge's step during render, never in an effect —
  // paused or reduced motion always shows the resting "0"; resuming always
  // restarts the count at "3" rather than resuming mid-drop.
  const [step, setStep] = React.useState(active ? 0 : 3);
  const [modeKey, setModeKey] = React.useState(active);
  if (modeKey !== active) {
    setModeKey(active);
    setStep(active ? 0 : 3);
  }

  const timerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!active) return;
    const delayS = (STEP_DELAY_FRACTIONS[step] ?? 0) * LOOP_S;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setStep((s) => (s + 1) % BADGE_SEQUENCE.length);
    }, delayS * 1000);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active, step]);

  const run = { duration: LOOP_S, repeat: Infinity, ease: easings.move };
  const still = { duration: 0 };

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("w-full max-w-[220px]", className)}
    >
      <div
        ref={containerRef}
        aria-hidden
        className="mx-auto flex flex-col items-center justify-center gap-3"
        style={{ height: STAGE_H }}
      >
        <div
          className="relative rounded-2 border border-hairline-strong bg-surface-1 shadow-raised"
          style={{ width: ENV_W, height: ENV_H, perspective: 480 }}
        >
          {CARDS.map((card) => {
            const times = [0, card.riseStart, card.riseEnd, 1];
            return (
              <motion.div
                key={card.id}
                className="absolute rounded-1 border border-hairline bg-surface-0 shadow-raised"
                style={{
                  left: `calc(50% + ${card.fanX}px)`,
                  marginLeft: -CARD_W / 2,
                  top: POCKET_TOP - 16 + card.fanTop,
                  width: CARD_W,
                  height: CARD_H,
                  zIndex: card.z,
                }}
                animate={
                  active
                    ? {
                        y: [0, 0, CARD_RISE_Y, CARD_RISE_Y],
                        rotate: [0, 0, card.rotateTo, card.rotateTo],
                        opacity: [1, 1, 0, 0],
                      }
                    : { y: CARD_RISE_Y, rotate: card.rotateTo, opacity: 0 }
                }
                transition={active ? { ...run, times } : still}
              />
            );
          })}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-2 border-t border-hairline bg-surface-1"
            style={{ top: POCKET_TOP, zIndex: 5 }}
          />

          <motion.div
            className="absolute inset-x-0 top-0"
            style={{ height: FLAP_H, transformOrigin: "top", zIndex: 8 }}
            animate={active ? { rotateX: [...FLAP_ROTATE] } : { rotateX: 0 }}
            transition={active ? { ...run, times: [...FLAP_TIMES] } : still}
          >
            <div
              className="h-full w-full border-b border-hairline-strong bg-surface-2"
              style={{ clipPath: FLAP_CLIP }}
            />
          </motion.div>

          <span
            className="absolute -top-2 -right-2 min-w-[20px] rounded-full border border-hairline-strong bg-surface-0 px-1.5 py-0.5 text-center font-mono text-[10px] text-ink tabular-nums shadow-raised"
            style={{ zIndex: 10 }}
          >
            {BADGE_SEQUENCE[step] ?? "0"}
          </span>
        </div>

        <motion.div
          animate={
            active
              ? { opacity: [...PIP_OPACITY], scale: [...PIP_SCALE] }
              : { opacity: 1, scale: 1 }
          }
          transition={active ? { ...run, times: [...PIP_TIMES] } : still}
        >
          <svg width={26} height={26} viewBox="0 0 26 26" fill="none">
            <circle
              cx="13"
              cy="13"
              r="11"
              stroke="var(--success, #047857)"
              strokeWidth="1.75"
            />
            <motion.path
              d="M7.5 13.5l3.4 3.4L18.5 9"
              stroke="var(--success, #047857)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              animate={
                active
                  ? { pathLength: [...TICK_PATH_LENGTH] }
                  : { pathLength: 1 }
              }
              transition={active ? { ...run, times: [...TICK_TIMES] } : still}
            />
          </svg>
        </motion.div>
      </div>
    </div>
  );
}
