"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GoalCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled amount saved. */
  value?: number;
  /** Initial amount saved for uncontrolled usage. @default 0 */
  defaultValue?: number;
  /** Fires from the Add press that changed the amount. */
  onValueChange?: (value: number, added: number) => void;
  /** The target; the ring closes here. */
  goal: number;
  /** The amount one Add press contributes. @default 25 */
  step?: number;
  /** Planned contribution per week; the panel projects the weeks left from it. @default step */
  weekly?: number;
  /** A quiet line in the panel ("By 30 Nov"). */
  deadline?: string;
  /** Controlled state of the details panel. */
  open?: boolean;
  /** Initial state of the details panel. @default false */
  defaultOpen?: boolean;
  /** Fires from the toggle press. */
  onOpenChange?: (open: boolean) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** The goal's name; heading and meter label. */
  label: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and a
 * client in another produce different text for the same number, and that is a
 * hydration mismatch on the figure the card exists to show.
 */
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/** The coin is minted at the ring's rim, in px above the hub. */
const DROP = 32;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * Digits that roll to their new value on `snap`, on the beat the coin lands.
 * Hidden from assistive technology: the meter's value text carries the share.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit, and only the new column mounts.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.2em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

type Coin = { seq: number; amount: number; to: number };

/**
 * One card for one goal. A ring on the left whose stroke is the share saved,
 * the goal's name and figure beside it, an add control, and a details toggle
 * that unfolds a panel underneath. Pressing Add mints a coin at the ring's rim
 * that drops into the hub on `recoil` — the two visible bounces of a coin
 * landing in a slot — and only when it lands does the ring grow to the new
 * share on `glide` and the hub's percentage roll on `snap`, so the ring moves
 * because the coin arrived. Reaching the goal turns the ring success and draws
 * a tick on `flick`. The panel's height is measured by a ResizeObserver on its
 * content and animated on `glide`; a lower value shrinks the ring with no coin.
 *
 * The ring is a meter that carries the share in words, the panel is inert
 * while closed so it never traps a Tab, and a status line announces each add
 * once. Under reduced motion the coin fades in at the hub and out again, the
 * ring and percentage move on a tween, and the tick appears complete.
 */
export function GoalCard({
  ref,
  value,
  defaultValue = 0,
  onValueChange,
  goal,
  step = 25,
  weekly = step,
  deadline,
  open,
  defaultOpen = false,
  onOpenChange,
  format = defaultFormat,
  label,
  className,
}: GoalCardProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const toggleId = `${baseId}-toggle`;
  const panelId = `${baseId}-panel`;

  const [uncontrolledValue, setUncontrolledValue] =
    React.useState(defaultValue);
  const saved = value ?? uncontrolledValue;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;

  // The ring shows what has landed, not what is incoming: an increase mints a
  // coin carrying the difference and the ring waits for it, while a decrease
  // is followed at once. The comparison happens in render against state, so
  // nothing is read from a ref and nothing is set from an effect body.
  const [track, setTrack] = React.useState<{
    seen: number;
    seq: number;
    coin: Coin | null;
    committed: number;
  }>({ seen: saved, seq: 0, coin: null, committed: saved });
  if (track.seen !== saved) {
    const seq = track.seq + 1;
    const coin =
      saved > track.seen
        ? { seq, amount: saved - track.seen, to: saved }
        : track.coin;
    setTrack({
      seen: saved,
      seq,
      coin,
      committed: saved < track.committed ? saved : track.committed,
    });
  }
  const coin = track.seen === saved ? track.coin : null;
  const committed = Math.min(track.committed, saved);
  const [announcement, setAnnouncement] = React.useState("");

  const span = goal > 0 ? goal : 1;
  const share = Math.min(1, Math.max(0, committed / span));
  const percent = Math.round(share * 100);
  const reached = committed >= goal && goal > 0;
  const remaining = Math.max(0, goal - committed);
  const weeksLeft = weekly > 0 ? Math.ceil(remaining / weekly) : null;
  const canAdd = saved < goal;

  const land = (seq: number) => {
    setTrack((prev) => {
      if (prev.coin?.seq !== seq) return prev;
      return { ...prev, coin: null, committed: prev.coin.to };
    });
    if (coin?.seq === seq && coin.to >= goal) setAnnouncement("Goal reached.");
  };

  const add = () => {
    if (!canAdd) return;
    const next = Math.min(goal, saved + step);
    const added = next - saved;
    if (added <= 0) return;
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next, added);
    setAnnouncement(
      `Added ${format(added)}. ${Math.round((next / span) * 100)} percent saved.`,
    );
  };

  const toggle = () => {
    const next = !isOpen;
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // The panel's height is measured, never reserved: the observer's own
  // callback reports it (it fires once on observe), so no layout is read
  // during render and a closed panel holds no dead space.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const valueText = reached
    ? `Goal reached, ${format(committed)} saved`
    : `${format(committed)} of ${format(goal)} saved, ${percent} percent`;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          role="meter"
          aria-labelledby={labelId}
          aria-valuenow={Math.min(goal, Math.max(0, committed))}
          aria-valuemin={0}
          aria-valuemax={goal}
          aria-valuetext={valueText}
          className="relative size-16 shrink-0"
        >
          <svg viewBox="0 0 64 64" aria-hidden className="size-full">
            <circle
              cx="32"
              cy="32"
              r="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              className="text-hairline-strong"
            />
            {/* The quarter turn lives on a group so the stroke starts at twelve
                o'clock without motion ever owning the circle's transform. */}
            <g transform="rotate(-90 32 32)">
              <motion.circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="round"
                className={cn(
                  "transition-colors duration-300",
                  reached ? "text-success" : "text-cobalt-bright",
                )}
                initial={false}
                animate={{ pathLength: share, opacity: share > 0 ? 1 : 0 }}
                transition={
                  motionSafe
                    ? springs.glide
                    : { duration: durations.base, ease: easings.move }
                }
              />
            </g>
          </svg>

          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center font-mono text-xs font-medium text-ink"
          >
            {reached ? (
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 text-success"
              >
                <motion.path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  pathLength={1}
                  // The tick is the acknowledgement: instant under reduced
                  // motion, never absent.
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
            ) : (
              <>
                <RollingNumber
                  value={String(percent)}
                  motionSafe={motionSafe}
                />
                <span>%</span>
              </>
            )}
          </span>

          <AnimatePresence>
            {coin ? (
              <motion.span
                key={coin.seq}
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-1/2 -mt-2 -ml-2 size-4 rounded-full border-2 border-primary-foreground/40 bg-cobalt-bright shadow-raised"
                initial={motionSafe ? { y: -DROP, opacity: 0 } : { opacity: 0 }}
                animate={motionSafe ? { y: 0, opacity: 1 } : { opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        y: springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
                onAnimationComplete={() => land(coin.seq)}
              />
            ) : null}
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
          <span className="font-mono text-lg leading-none font-medium text-ink tabular-nums">
            {format(committed)}
          </span>
          <span className="text-[11px] text-ink-3 tabular-nums">
            of {format(goal)}
            {reached ? " · reached" : ` · ${format(remaining)} to go`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        <button
          type="button"
          aria-label={canAdd ? `Add ${format(step)}` : "Goal reached"}
          aria-disabled={!canAdd || undefined}
          onClick={add}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-2 px-3 text-sm font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            canAdd
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/95"
              : "cursor-default border border-hairline-strong bg-surface-2 text-ink-2",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            className="size-4 shrink-0"
          >
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
          <span>{canAdd ? `Add ${format(step)}` : "Goal reached"}</span>
        </button>

        <button
          type="button"
          id={toggleId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={toggle}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 text-sm font-medium text-ink transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span>Details</span>
          <motion.svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0 text-ink-2"
            style={{ originX: 0.5, originY: 0.5 }}
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <path d="m4 6.5 4 4 4-4" />
          </motion.svg>
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{ height: isOpen ? (height ?? "auto") : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        // The card's own gap is cancelled here and restored inside the
        // measured content, so a closed panel leaves no dead space beneath
        // the controls.
        className="-mt-3 overflow-hidden"
      >
        <div ref={innerRef} className="pt-3">
          <section
            id={panelId}
            aria-labelledby={toggleId}
            inert={!isOpen}
            className="flex flex-col gap-2 border-t border-hairline pt-3"
          >
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {[
                ["Goal", format(goal)],
                ["Saved", format(committed)],
                ["Remaining", format(remaining)],
                [
                  "Weeks left",
                  weeksLeft === null
                    ? "—"
                    : `${weeksLeft} at ${format(weekly)} a week`,
                ],
              ].map(([term, detail]) => (
                <div key={term} className="contents">
                  <dt className="text-ink-3">{term}</dt>
                  <dd className="text-right font-mono text-ink tabular-nums">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
            {deadline ? (
              <p className="text-[11px] text-ink-3">{deadline}</p>
            ) : null}
          </section>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
