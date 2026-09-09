"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GoalPotProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled amount in the pot. */
  value?: number;
  /** Initial amount for uncontrolled usage. @default 0 */
  defaultValue?: number;
  /** Fires from the quick-add press that changed the amount. */
  onValueChange?: (value: number, added: number) => void;
  /** The target; the pot is full here and the lip glints when reached. */
  goal: number;
  /** Quick-add amounts rendered as buttons under the readout. @default [20, 50, 100] */
  steps?: number[];
  /** Formats every amount. */
  format?: (value: number) => string;
  /** Names the pot; printed above the readout and read as the meter's label. */
  label: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure the pot exists to show.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

const DEFAULT_STEPS = [20, 50, 100];

/** Pot geometry in px: the lane a coin starts in, the lip, the coin itself. */
const LANE = 24;
const LIP = 10;
const COIN = 20;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;

type Coin = { seq: number; from: number; target: number };

/**
 * A savings pot: a vessel whose liquid is the share of the goal already saved.
 * Every increase mounts a coin above the lip that drops through the mouth and
 * lands on the surface on `recoil` — ζ0.53, the two visible bounces of a coin
 * hitting water — and only when it lands does the level rise on `glide` and the
 * figure count up on the same spring, so the number moves because the coin
 * arrived, not on its own. A ripple blooms at the surface where it hit.
 *
 * Landing at or past the goal turns the lip success and glints it once, a band
 * of light travelling the rim on the enter ease. A withdrawal drops the level on
 * `glide` with no coin: nothing celebrates money leaving.
 *
 * The pot is a `role="meter"` whose value text says the whole sentence, the
 * quick-add buttons are real buttons, and a status line announces each add.
 * Under reduced motion the coin fades in on the surface instead of falling, the
 * level and the count move on a tween, and the lip changes colour without the
 * band — the fill still fills, because that is the information.
 */
export function GoalPot({
  ref,
  value,
  defaultValue = 0,
  onValueChange,
  goal,
  steps = DEFAULT_STEPS,
  format = defaultFormat,
  label,
  className,
}: GoalPotProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;

  // The committed value and the coins still falling toward it live in state
  // rather than a ref: a ref read during render is banned here, and the render
  // is exactly where an incoming value has to be compared with the last one.
  const [track, setTrack] = React.useState<{
    value: number;
    seq: number;
    coins: Coin[];
  }>({ value: current, seq: 0, coins: [] });
  if (track.value !== current) {
    const seq = track.seq + 1;
    setTrack({
      value: current,
      seq,
      coins:
        current > track.value
          ? [...track.coins, { seq, from: track.value, target: current }]
          : track.coins,
    });
  }

  // What the pot shows: the level and the figure wait for the coin to land.
  const [landed, setLanded] = React.useState({ value: current, seq: 0 });
  const [lastAdded, setLastAdded] = React.useState<{
    seq: number;
    amount: number;
  } | null>(null);
  // A withdrawal has no coin, so the level follows it at once.
  if (current < landed.value) {
    setLanded({ value: current, seq: landed.seq });
    setLastAdded(null);
  }

  const [splash, setSplash] = React.useState<{
    seq: number;
    at: number;
  } | null>(null);
  const [glint, setGlint] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // The coin has to know where the surface is in px, and the body's height is
  // the layout's to decide — so it is measured, never assumed.
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [bodyHeight, setBodyHeight] = React.useState(0);
  React.useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBodyHeight(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const span = goal > 0 ? goal : 1;
  const displayed = motionSafe ? landed.value : current;
  const filled = clamp(displayed / span, 0, 1);
  const reached = goal > 0 && displayed >= goal;

  // The readout counts on the same spring as the level, through a motion value
  // so the digits move without re-rendering the pot around them.
  const counted = useMotionValue(displayed);
  const readout = useTransform(counted, (amount) =>
    format(Math.max(0, amount)),
  );
  React.useEffect(() => {
    const controls = animate(
      counted,
      displayed,
      motionSafe
        ? springs.glide
        : { duration: durations.base, ease: easings.enter },
    );
    return () => controls.stop();
  }, [counted, displayed, motionSafe]);

  const add = (amount: number) => {
    const next = current + amount;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next, amount);
    setAnnouncement(
      `Added ${format(amount)}. ${format(next)} of ${format(goal)} saved.`,
    );
  };

  const land = (coin: Coin) => {
    // A withdrawal may have arrived while the coin was in the air; the level
    // never overshoots what the pot actually holds.
    const settled = Math.min(coin.target, current);
    setLanded((prev) =>
      prev.seq >= coin.seq ? prev : { value: settled, seq: coin.seq },
    );
    setTrack((prev) => ({
      ...prev,
      coins: prev.coins.filter((item) => item.seq !== coin.seq),
    }));
    setLastAdded({ seq: coin.seq, amount: coin.target - coin.from });
    setSplash({ seq: coin.seq, at: clamp(coin.from / span, 0, 1) });
    if (goal > 0 && coin.from < goal && settled >= goal) {
      if (motionSafe) setGlint(coin.seq);
      setAnnouncement(`Goal reached. ${format(settled)} saved.`);
    }
  };

  const remaining = Math.max(0, goal - displayed);
  const sentence = reached ? "Goal reached" : `${format(remaining)} to go`;
  const valueText =
    goal > 0 && current >= goal
      ? `Goal reached, ${format(current)} saved`
      : `${format(current)} of ${format(goal)} saved, ${format(
          Math.max(0, goal - current),
        )} to go`;

  const fillTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div
          role="meter"
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuenow={clamp(current, 0, goal)}
          aria-valuetext={valueText}
          style={{ paddingTop: LANE }}
          className="relative flex w-24 shrink-0 flex-col items-center"
        >
          {/* The lip: a ring seen edge-on, wider than the body. */}
          <span
            aria-hidden
            style={{ height: LIP }}
            className={cn(
              "relative z-10 w-24 overflow-hidden rounded-full border transition-colors",
              reached
                ? "border-success bg-success/25"
                : "border-hairline-strong bg-surface-2",
            )}
          >
            <AnimatePresence>
              {glint !== null ? (
                <motion.span
                  key={glint}
                  className="absolute inset-y-0 w-2/5 bg-linear-to-r from-transparent via-background/80 to-transparent"
                  initial={{ left: "-40%" }}
                  animate={{ left: "110%" }}
                  transition={{ duration: durations.page, ease: easings.enter }}
                  onAnimationComplete={() => setGlint(null)}
                />
              ) : null}
            </AnimatePresence>
          </span>

          <div
            ref={bodyRef}
            aria-hidden
            className="relative -mt-px h-28 w-20 rounded-t-[4px] rounded-b-[2rem] border border-hairline-strong bg-surface-2"
          >
            <span className="absolute inset-0 overflow-hidden rounded-t-[3px] rounded-b-[calc(2rem-1px)]">
              <motion.span
                className={cn(
                  "absolute inset-x-0 bottom-0 transition-colors",
                  reached ? "bg-success/70" : "bg-cobalt-bright/70",
                )}
                initial={{ height: "0%" }}
                animate={{ height: percent(filled) }}
                transition={fillTransition}
              >
                <span className="absolute inset-x-0 top-0 h-0.5 bg-background/50" />
              </motion.span>
            </span>

            {/* The ripple lives at the surface the coin hit, not the one the
                level rises to — it marks the impact, not the result. */}
            <AnimatePresence>
              {splash ? (
                <motion.span
                  key={splash.seq}
                  style={{ top: percent(1 - splash.at), marginTop: -3 }}
                  className="absolute left-1/2 -ml-5 h-1.5 w-10 rounded-full border border-background/70"
                  initial={{ opacity: 0.8, scaleX: motionSafe ? 0.4 : 1 }}
                  animate={{ opacity: 0, scaleX: 1 }}
                  transition={{ duration: durations.slow, ease: easings.enter }}
                  onAnimationComplete={() =>
                    setSplash((prev) =>
                      prev?.seq === splash.seq ? null : prev,
                    )
                  }
                />
              ) : null}
            </AnimatePresence>
          </div>

          {/* Coins start in the lane above the lip and rest on the surface as
              it stood when they were minted. The drop is on the inner span so
              its completion fires once; the outer only fades on exit. */}
          <AnimatePresence>
            {track.coins.map((coin) => {
              const rest =
                LANE +
                LIP +
                (1 - clamp(coin.from / span, 0, 1)) * bodyHeight -
                COIN / 2;
              return (
                <motion.span
                  key={coin.seq}
                  aria-hidden
                  style={{ width: COIN, height: COIN, marginLeft: -COIN / 2 }}
                  className="pointer-events-none absolute top-0 left-1/2 z-20"
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                >
                  <motion.span
                    className="relative block size-full rounded-full border-2 border-warn bg-warn/80 shadow-sm"
                    initial={
                      motionSafe
                        ? { y: -4, opacity: 0 }
                        : { y: rest, opacity: 0 }
                    }
                    animate={{ y: rest, opacity: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.recoil, opacity: fade }
                        : { duration: durations.fast }
                    }
                    onAnimationComplete={() => land(coin)}
                  >
                    <span className="absolute inset-1 rounded-full border border-background/60" />
                  </motion.span>
                </motion.span>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                "font-mono text-2xl leading-none font-medium tabular-nums transition-colors",
                reached ? "text-success" : "text-ink",
              )}
            >
              <span className="sr-only">{format(current)}</span>
              <motion.span aria-hidden>{readout}</motion.span>
            </span>
            <AnimatePresence>
              {lastAdded ? (
                <motion.span
                  key={lastAdded.seq}
                  aria-hidden
                  className="flex h-5 items-center rounded-full border border-success/30 bg-success/10 px-1.5 font-mono text-[10px] text-success tabular-nums"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  +{format(lastAdded.amount)}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            <span className="font-mono text-ink-3 tabular-nums">
              of {format(goal)}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={sentence}
                className={cn(
                  "font-medium",
                  reached ? "text-success" : "text-ink-2",
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                {sentence}
              </motion.span>
            </AnimatePresence>
          </div>

          {steps.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {steps.map((step) => (
                <button
                  key={step}
                  type="button"
                  aria-label={`Add ${format(step)}`}
                  onClick={() => add(step)}
                  className={cn(
                    "flex h-8 items-center rounded-2 border border-hairline-strong bg-surface-2 px-2.5 font-mono text-[11px] font-medium tabular-nums transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  +{format(step)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
