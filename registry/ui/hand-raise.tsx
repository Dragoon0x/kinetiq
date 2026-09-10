"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RaisedHand = { id: string; name: string };

export type HandRaiseProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Everyone but you, in raise order. */
  queue: RaisedHand[];
  /** Controlled state of your own hand. */
  raised?: boolean;
  /** Initial state for uncontrolled use. @default false */
  defaultRaised?: boolean;
  onRaisedChange?: (raised: boolean) => void;
  /** Fires with your 1-based place in the queue, or 0 once your hand is down. */
  onPositionChange?: (position: number) => void;
  /** How you are listed. @default "You" */
  youName?: string;
  /** The id your entry carries, so a host can reconcile it. @default "you" */
  youId?: string;
  /** Hands drawn before the rail folds the rest into a count. @default 5 */
  maxVisible?: number;
  /** Holds the button; the rail still lists and still reads. @default false */
  disabled?: boolean;
  /** Names the group for assistive technology. @default "Raise your hand" */
  label?: string;
  className?: string;
};

const ordinal = (value: number) => {
  const hundred = value % 100;
  if (hundred >= 11 && hundred <= 13) return `${value}th`;
  const ten = value % 10;
  const suffix = ten === 1 ? "st" : ten === 2 ? "nd" : ten === 3 ? "rd" : "th";
  return `${value}${suffix}`;
};

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

function HandGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="M9 12V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M15 11V7.5a1.5 1.5 0 0 1 3 0V15a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-4.2-2.6L6 14.2a1.5 1.5 0 0 1 2.6-1.5l1 1.7" />
    </svg>
  );
}

type Entry = { id: string; name: string; mine: boolean };

/**
 * A hand, raised. Pressing the control sends the glyph out of the button and
 * into the queue rail below on a shared `layoutId` prefixed by `useId`, so one
 * hand travels rather than two blinking, and it travels on `recoil` — ζ0.53's
 * two visible bounces, the one place in a call bar allowed to celebrate,
 * because raising your hand is a small act of nerve. The button does not go
 * empty behind it: a chevron cross-fades into the same slot and the label
 * becomes Lower, with both readings stacked in one grid cell so the button's
 * width never jumps between them.
 *
 * The rail is an ordered list in flow whose height a ResizeObserver measures
 * and `glide` opens from zero, so an empty queue reserves nothing and a filling
 * one pushes the page rather than covering it. Your place is honest: at the
 * moment you raise, the component freezes the set of ids already ahead of you,
 * so later arrivals queue behind you and a hand lowering ahead of you moves you
 * up rather than reshuffling the room. Hands beyond `maxVisible` fold into a
 * count, but yours is never folded away.
 *
 * Nothing here reads a clock — the order comes from the props and one frozen
 * snapshot. Every entry prints its ordinal and carries it in a one-string
 * label, so a place in the queue never depends on reading order alone. Under
 * reduced motion the glyph does not fly: it cross-fades between the button and
 * the rail, while the rail still opens and the positions still renumber,
 * because a place in a queue is information.
 */
export function HandRaise({
  ref,
  queue,
  raised,
  defaultRaised = false,
  onRaisedChange,
  onPositionChange,
  youName = "You",
  youId = "you",
  maxVisible = 5,
  disabled = false,
  label = "Raise your hand",
  className,
}: HandRaiseProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const handId = `${baseId}-hand`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultRaised);
  const isControlled = raised !== undefined;
  const isRaised = isControlled ? raised : uncontrolled;

  // Frozen at the moment you raise, however the raise arrived: the ids already
  // ahead of you. Later arrivals queue behind you, and a hand lowering ahead of
  // you moves you up instead of reshuffling the room.
  const [snapshot, setSnapshot] = React.useState<{
    raised: boolean;
    ahead: string[];
  }>(() => ({
    raised: isRaised,
    ahead: isRaised ? queue.map((hand) => hand.id) : [],
  }));
  if (snapshot.raised !== isRaised) {
    setSnapshot({
      raised: isRaised,
      ahead: isRaised ? queue.map((hand) => hand.id) : [],
    });
  }

  const aheadIds = new Set(snapshot.ahead);
  const before = queue.filter((hand) => aheadIds.has(hand.id));
  const after = queue.filter((hand) => !aheadIds.has(hand.id));
  const mine: Entry = { id: youId, name: youName, mine: true };
  const entries: Entry[] = isRaised
    ? [
        ...before.map((hand) => ({ ...hand, mine: false })),
        mine,
        ...after.map((hand) => ({ ...hand, mine: false })),
      ]
    : queue.map((hand) => ({ ...hand, mine: false }));

  const position = isRaised ? before.length + 1 : 0;
  const positionOutRef = useLatest(onPositionChange);
  React.useEffect(() => {
    positionOutRef.current?.(position);
  }, [position, positionOutRef]);

  const cap = Math.max(1, Math.round(maxVisible));
  const shown = entries.slice(0, cap);
  let folded = entries.length - shown.length;
  // Your own hand is never folded away: if the cap pushed it out, it comes
  // back on the end and the fold count loses it.
  if (isRaised && !shown.some((entry) => entry.mine)) {
    shown.push(mine);
    folded -= 1;
  }

  // Frozen at the moment of the change, so a render that merely re-derives the
  // sentence cannot make the region repeat a past event.
  const [seen, setSeen] = React.useState(isRaised);
  const [spoken, setSpoken] = React.useState("");
  if (seen !== isRaised) {
    setSpoken(
      isRaised
        ? `Your hand is raised. You are ${ordinal(position)} in line.`
        : "Your hand is down.",
    );
    setSeen(isRaised);
  }

  const toggle = () => {
    const next = !isRaised;
    if (!isControlled) setUncontrolled(next);
    onRaisedChange?.(next);
  };

  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [railHeight, setRailHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = railRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The inner list is always mounted, so the observer binds to a node that
    // exists and the open height stays honest when the column narrows.
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setRailHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const railOpen = entries.length > 0;
  const glide = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  const raisedCount = entries.length;
  const flying = (
    <HandGlyph className={isRaised ? "text-cobalt-bright" : undefined} />
  );

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div
        role="group"
        aria-label={label}
        className="flex flex-wrap items-center gap-2"
      >
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          aria-pressed={isRaised}
          aria-label={
            isRaised
              ? `Lower your hand. You are ${ordinal(position)} in line.`
              : "Raise your hand."
          }
          className={cn(
            "flex h-8 shrink-0 items-center gap-2 rounded-2 border px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isRaised
              ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
              : "border-hairline-strong hover:bg-accent",
            disabled && "opacity-50",
          )}
        >
          <span className="grid size-4 shrink-0 place-items-center">
            {!isRaised &&
              (motionSafe ? (
                <motion.span
                  layoutId={handId}
                  transition={springs.recoil}
                  className="col-start-1 row-start-1 grid place-items-center"
                >
                  {flying}
                </motion.span>
              ) : (
                <span className="col-start-1 row-start-1 grid place-items-center">
                  {flying}
                </span>
              ))}
            <motion.span
              aria-hidden
              className="col-start-1 row-start-1 grid place-items-center"
              initial={false}
              animate={{ opacity: isRaised ? 1 : 0 }}
              transition={fade}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 shrink-0"
              >
                <path d="M8 3.5v9M4.5 9 8 12.5 11.5 9" />
              </svg>
            </motion.span>
          </span>

          {/* Both readings share one grid cell, so the button is as wide as the
              longer of them and its width never jumps mid-press. */}
          <span aria-hidden className="grid">
            <motion.span
              className="col-start-1 row-start-1 text-left"
              initial={false}
              animate={{ opacity: isRaised ? 0 : 1 }}
              transition={fade}
            >
              Raise hand
            </motion.span>
            <motion.span
              className="col-start-1 row-start-1 text-left"
              initial={false}
              animate={{ opacity: isRaised ? 1 : 0 }}
              transition={fade}
            >
              Lower hand
            </motion.span>
          </span>
        </button>

        <span className="flex h-8 shrink-0 items-center text-xs text-ink-3">
          {raisedCount === 0
            ? "No hands raised"
            : `${raisedCount} ${raisedCount === 1 ? "hand" : "hands"} raised`}
        </span>
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: railOpen ? (railHeight ?? "auto") : 0 }}
        transition={glide}
      >
        <div ref={railRef} className="pt-2">
          <ol role="list" className="flex flex-wrap items-center gap-1.5">
            <AnimatePresence initial={false}>
              {shown.map((entry, index) => (
                <motion.li
                  key={entry.id}
                  layout={motionSafe}
                  // Opacity only: a transform on the box motion is measuring
                  // fights the FLIP that re-lays its neighbours.
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={motionSafe ? springs.glide : fade}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-full border px-2 text-xs",
                    entry.mine
                      ? "border-cobalt-bright bg-cobalt-wash font-medium text-cobalt-bright"
                      : "border-hairline bg-surface-2 text-ink-2",
                  )}
                >
                  {/* One string for the reading, rather than an aria-label on
                      a listitem: the place and the name must never arrive as
                      two nodes a name algorithm joins with a stray space. */}
                  <span className="sr-only">
                    {`${ordinal(index + 1)} in line, ${entry.name}`}
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-[10px] tabular-nums opacity-70"
                  >
                    {ordinal(index + 1)}
                  </span>
                  {entry.mine ? (
                    <span className="grid size-4 shrink-0 place-items-center">
                      {motionSafe ? (
                        <motion.span
                          layoutId={handId}
                          transition={springs.recoil}
                          className="grid place-items-center"
                        >
                          {flying}
                        </motion.span>
                      ) : (
                        flying
                      )}
                    </span>
                  ) : null}
                  <span aria-hidden className="max-w-28 truncate">
                    {entry.name}
                  </span>
                </motion.li>
              ))}
              {folded > 0 ? (
                <motion.li
                  key="folded"
                  layout={motionSafe}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={motionSafe ? springs.glide : fade}
                  className="flex h-7 items-center rounded-full border border-dashed border-hairline px-2 text-xs text-ink-3"
                >
                  <span className="sr-only">
                    {`${folded} more ${folded === 1 ? "hand" : "hands"} waiting`}
                  </span>
                  <span aria-hidden>{`+${folded} more`}</span>
                </motion.li>
              ) : null}
            </AnimatePresence>
          </ol>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
