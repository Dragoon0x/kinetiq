"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ModVerdict = "keep" | "hide" | "timeout";

export type ModQueueItem = {
  id: string;
  /** Who sent the reported message. */
  author: string;
  /** The reported line. */
  text: string;
  /** The house rule it was reported under. */
  reason: string;
  /** How many people reported it. */
  reports: number;
};

export type ModQueueProps = {
  ref?: React.Ref<HTMLElement>;
  /** The reported messages, front of the queue first. */
  items?: ModQueueItem[];
  /** The queue's heading. @default "Reported in Coldbrook" */
  label?: string;
  /** Controlled position in the queue. */
  index?: number;
  /** Initial position for uncontrolled use. @default 0 */
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Fires with the verdict and the item it was passed on. */
  onAct?: (verdict: ModVerdict, item: ModQueueItem) => void;
  /** Fires once when the last card leaves. */
  onEmpty?: () => void;
  /** The cleared line. @default "Queue clear. Nothing waiting." */
  emptyLabel?: string;
  /** Holds the toolbar; the queue still reads. @default false */
  disabled?: boolean;
  className?: string;
};

const DEFAULT_ITEMS: ModQueueItem[] = [
  {
    id: "cb-1",
    author: "Rui Santos",
    text: "Whoever packed this Waylight Pay box could not care less about it.",
    reason: "Room rule 3",
    reports: 2,
  },
  {
    id: "cb-2",
    author: "Marta Vieira",
    text: "Posting the Basinworks link again since nobody read it the first time.",
    reason: "Room rule 5",
    reports: 1,
  },
  {
    id: "cb-3",
    author: "Ines Rocha",
    text: "The courier is hopeless and so is whoever keeps sending him.",
    reason: "Room rule 3",
    reports: 3,
  },
  {
    id: "cb-4",
    author: "Tomas Beira",
    text: "Same argument about the delivery, fourth day running.",
    reason: "Room rule 1",
    reports: 1,
  },
];

const ACTIONS = [
  { verdict: "keep", label: "Keep", verb: "Keep", tone: "text-success" },
  { verdict: "hide", label: "Hide", verb: "Hide", tone: "text-ink" },
  {
    verdict: "timeout",
    label: "Time out",
    verb: "Time out",
    tone: "text-danger",
  },
] as const;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** A verdict has a direction, so the card leaves toward the side it was sent. */
const RICH: Variants = {
  enter: { opacity: 0, y: distances.step, x: 0 },
  centre: { opacity: 1, y: 0, x: 0 },
  leave: (dir: number) => ({
    opacity: 0,
    x: dir * distances.shift,
    transition: exitFor(),
  }),
};

const PLAIN: Variants = {
  enter: { opacity: 0 },
  centre: { opacity: 1 },
  leave: { opacity: 0, transition: exitFor(durations.fast) },
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * A figure whose digits step to their new value on `snap`. The column is ten
 * faces tall, so a y percentage of its own height moves exactly one digit, and
 * the keys run from the right so the units column keeps its identity when the
 * number loses a digit. Hidden from assistive technology: the sentence beside
 * it already carries the count in words.
 */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const text = String(Math.max(0, Math.round(value)));
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = text.length - index;
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

/**
 * Waiting for a moderator. Reported messages come one at a time with the rest
 * of the queue named underneath, and the trick is that the toolbar does not
 * move: passing a verdict slides the card out on the exit ease — right for
 * Keep, left for Hide and Time out, because a verdict has a direction — while
 * the next rises from 8px on `glide`, and the button you pressed is still under
 * your finger and still holds focus. A whole queue clears without ever
 * re-finding the control.
 *
 * The two figures roll on `snap`, ten faces to a column. Emptying the queue
 * leaves no hole: the card area is a ResizeObserver-measured height that closes
 * onto a single cleared line rather than reserving room with a minimum.
 *
 * The toolbar is a real `role="toolbar"` with a roving tabindex — Left and
 * Right step without wrapping, Home and End jump, Space and Enter act — and
 * each button's name is a whole sentence naming the member it would act on. A
 * polite region speaks one frozen sentence per verdict from a single node, so
 * three fast presses cannot drop a reading. Under reduced motion nothing slides
 * and the digits swap, but the queue still empties in front of you.
 */
export function ModQueue({
  ref,
  items = DEFAULT_ITEMS,
  label = "Reported in Coldbrook",
  index,
  defaultIndex = 0,
  onIndexChange,
  onAct,
  onEmpty,
  emptyLabel = "Queue clear. Nothing waiting.",
  disabled = false,
  className,
}: ModQueueProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const headId = `${baseId}-head`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultIndex);
  const isControlled = index !== undefined;
  const at = Math.max(
    0,
    Math.min(items.length, isControlled ? index : uncontrolled),
  );

  const item = items[at];
  const rest = items.slice(at + 1);
  const waiting = Math.max(0, items.length - at);

  // Tallies belong to a pass through one queue: a refill — a new list, or a
  // position that moves backwards — starts them again.
  const [tally, setTally] = React.useState(() => ({
    forItems: items,
    atIndex: at,
    keep: 0,
    hide: 0,
    timeout: 0,
  }));
  if (tally.forItems !== items || at < tally.atIndex) {
    setTally({ forItems: items, atIndex: at, keep: 0, hide: 0, timeout: 0 });
  }

  const inactive = disabled || !item;

  const [dir, setDir] = React.useState(1);
  const [spoken, setSpoken] = React.useState("");
  const [focusAt, setFocusAt] = React.useState(0);

  const act = (verdict: ModVerdict) => {
    if (disabled || !item) return;
    const next = at + 1;
    const left = Math.max(0, items.length - next);
    const following = items[next];
    const done =
      verdict === "keep" ? "Kept" : verdict === "hide" ? "Hidden" : "Timed out";

    setDir(verdict === "keep" ? 1 : -1);
    setTally((prev) => ({
      forItems: prev.forItems,
      atIndex: next,
      keep: prev.keep + (verdict === "keep" ? 1 : 0),
      hide: prev.hide + (verdict === "hide" ? 1 : 0),
      timeout: prev.timeout + (verdict === "timeout" ? 1 : 0),
    }));
    if (!isControlled) setUncontrolled(next);
    // One string, frozen here, so the reading belongs to the verdict that
    // caused it however fast the next one lands.
    setSpoken(
      `${done}. ${
        left === 0
          ? "Queue clear."
          : `${plural(left, "message", "messages")} waiting.`
      }${
        following
          ? ` Now showing ${following.author}, reported under ${following.reason}.`
          : ""
      }`,
    );

    onIndexChange?.(next);
    onAct?.(verdict, item);
    if (left === 0) onEmpty?.();
  };

  const moveFocus = (nextIndex: number) => {
    const clamped = Math.min(ACTIONS.length - 1, Math.max(0, nextIndex));
    setFocusAt(clamped);
    document.getElementById(`${baseId}-act-${clamped}`)?.focus();
  };

  const onToolbarKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    position: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(position + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(position - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(ACTIONS.length - 1);
    }
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      aria-labelledby={headId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={headId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </h3>
        <span className="flex shrink-0 items-center font-mono text-xs">
          <span className="sr-only">
            {`${plural(waiting, "message", "messages")} waiting.`}
          </span>
          <span aria-hidden className="flex items-center gap-1">
            <Roll value={waiting} motionSafe={motionSafe} />
            waiting
          </span>
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="-mx-1 overflow-hidden"
      >
        <div ref={innerRef} className="flex flex-col gap-2 px-1">
          <ol role="list" className="relative flex flex-col gap-2">
            <AnimatePresence custom={dir} initial={false} mode="popLayout">
              {item ? (
                <motion.li
                  key={item.id}
                  custom={dir}
                  variants={motionSafe ? RICH : PLAIN}
                  initial="enter"
                  animate="centre"
                  exit="leave"
                  transition={motionSafe ? springs.glide : FADE}
                  className="flex flex-col gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 p-2.5"
                >
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs leading-snug font-medium">
                      {item.author}
                    </span>
                    <span className="rounded-full border border-hairline-strong px-2 py-0.5 text-[10px] leading-none font-semibold tracking-[0.06em] text-ink-3 uppercase">
                      {item.reason}
                    </span>
                  </span>
                  <p className="text-sm leading-snug text-ink-2">{item.text}</p>
                  <span className="text-[11px] leading-snug text-ink-3">
                    {`Reported by ${plural(item.reports, "member", "members")}.`}
                  </span>
                </motion.li>
              ) : null}
            </AnimatePresence>

            {rest.map((waitingItem) => (
              <li
                key={waitingItem.id}
                className="flex items-center gap-2 px-0.5"
              >
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-ink-3/60"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] leading-snug text-ink-3">
                  {`${waitingItem.author} · ${waitingItem.reason}`}
                </span>
              </li>
            ))}
          </ol>

          {item ? null : (
            <p className="py-1 text-xs leading-snug text-ink-3">{emptyLabel}</p>
          )}
        </div>
      </motion.div>

      {/* aria-disabled rather than the disabled attribute: a disabled button
          is blurred by the browser, and the whole point of a fixed toolbar is
          that clearing the last card does not cost you your place. */}
      <div
        role="toolbar"
        aria-label={`Verdict for the message at the front of ${label}`}
        className="grid grid-cols-3 gap-2"
      >
        {ACTIONS.map((action, position) => (
          <button
            key={action.verdict}
            id={`${baseId}-act-${position}`}
            type="button"
            tabIndex={position === focusAt ? 0 : -1}
            aria-disabled={inactive}
            aria-label={
              item
                ? `${action.verb} ${item.author}'s message.`
                : `${action.verb}. The queue is clear.`
            }
            onFocus={() => setFocusAt(position)}
            onKeyDown={(event) => onToolbarKey(event, position)}
            onClick={() => act(action.verdict)}
            className={cn(
              "flex h-8 w-full items-center justify-center rounded-2 border border-hairline-strong text-xs font-medium transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              inactive
                ? "cursor-default text-ink-3 opacity-50"
                : cn("hover:bg-accent", action.tone),
            )}
          >
            {action.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-2 font-mono text-[10px] text-ink-3">
        <span className="sr-only">
          {`Kept ${tally.keep}, hidden ${tally.hide}, timed out ${tally.timeout}.`}
        </span>
        <span aria-hidden className="flex items-center gap-1">
          Kept <Roll value={tally.keep} motionSafe={motionSafe} />
        </span>
        <span aria-hidden className="flex items-center gap-1">
          Hidden <Roll value={tally.hide} motionSafe={motionSafe} />
        </span>
        <span aria-hidden className="flex items-center gap-1">
          Timed out <Roll value={tally.timeout} motionSafe={motionSafe} />
        </span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken}
      </span>
    </section>
  );
}
