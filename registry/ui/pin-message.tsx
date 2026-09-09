"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PinnedMessage = {
  id: string;
  author: string;
  text: string;
  /** Sent time, already formatted. */
  time: string;
};

export type PinMessageProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: PinnedMessage[];
  /** Controlled: pinned ids, most recently pinned first. */
  value?: string[];
  /** Initial pinned ids for uncontrolled usage. @default [] */
  defaultValue?: string[];
  onValueChange?: (ids: string[]) => void;
  /** Fires with the message that changed and its new state. */
  onPinChange?: (id: string, pinned: boolean) => void;
  /** Fires when a bar row sends focus down to its message. */
  onJump?: (id: string) => void;
  /** How many the bar holds before further pin controls refuse. @default 3 */
  maxPinned?: number;
  /** Names the thread list. @default "Thread" */
  label?: string;
  /** Names the pinned bar. @default "Pinned" */
  barLabel?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
/** A copy never flies further than this, however long the thread runs. */
const MAX_LIFT = 320;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** A drawn pin: head, collar, needle. The head fills once it holds something. */
function PinGlyph({
  filled,
  className,
}: {
  filled: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4", className)}>
      <circle
        {...STROKE}
        cx="8"
        cy="5.4"
        r="2.8"
        fill={filled ? "currentColor" : "none"}
      />
      <path {...STROKE} d="M4.6 8.4h6.8" />
      <path {...STROKE} d="M8 8.4V13.6" />
    </svg>
  );
}

const firstWords = (text: string, words = 7): string => {
  const parts = text.trim().split(/\s+/);
  return parts.length > words
    ? `${parts.slice(0, words).join(" ")}…`
    : text.trim();
};

type Beat = { signature: string; ids: string[]; message: string };

const describe = (
  previous: string[],
  next: string[],
  messages: PinnedMessage[],
): string => {
  const nameOf = (id: string) =>
    messages.find((message) => message.id === id)?.author ?? "the message";
  const added = next.find((id) => !previous.includes(id));
  const removed = previous.filter((id) => !next.includes(id));
  const count = `${next.length} pinned.`;
  if (added) return `Pinned ${nameOf(added)}'s message. ${count}`;
  if (removed.length === 1 && removed[0]) {
    return `Unpinned ${nameOf(removed[0])}'s message. ${count}`;
  }
  if (removed.length > 1) return "Pinned bar cleared.";
  return "";
};

/**
 * Pinned to the top. Pressing a message's pin measures the gap between that
 * row and the bar's floor at the moment of the press, and the copy enters the
 * bar from exactly there — `y` from the measured distance to zero on `glide` —
 * so it reads as lifted out of the thread rather than faded into a list.
 * Unpinning sends it back down the same distance as a tween, because exits
 * never spring, and the message keeps a pin badge that stamps in on `flick` so
 * the copy and the original stay tied.
 *
 * The bar's height is measured by a ResizeObserver bound to its content when
 * that content arrives, so an empty bar occupies nothing at all: no strip is
 * held open waiting for a pin. At the cap the remaining pin controls go
 * `aria-disabled` rather than leaving the tab order, and their names say why.
 * Under reduced motion nothing flies: the copy appears with a fade and the
 * bar's height changes on a fast tween, because what is pinned is information.
 */
export function PinMessage({
  ref,
  messages,
  value,
  defaultValue,
  onValueChange,
  onPinChange,
  onJump,
  maxPinned = 3,
  label = "Thread",
  barLabel = "Pinned",
  className,
}: PinMessageProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    () => defaultValue ?? [],
  );
  const pinned = value ?? uncontrolled;
  const pinnedRows = pinned
    .map((id) => messages.find((message) => message.id === id))
    .filter((message): message is PinnedMessage => message !== undefined);
  const full = pinnedRows.length >= maxPinned;

  /** How far each copy travelled, measured at the press and kept for its
   *  return: an exit animates from the props of its last render. */
  const [lifts, setLifts] = React.useState<Record<string, number>>({});
  const [jumped, setJumped] = React.useState<string | null>(null);
  /** While a copy is in the air the bar stops clipping, or the flight would
   *  be cut off at the bar's edge by the height animation's overflow. */
  const [flying, setFlying] = React.useState(false);

  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const barNode = React.useRef<HTMLDivElement | null>(null);

  const [barHeight, setBarHeight] = React.useState<number | null>(null);
  const observer = React.useRef<ResizeObserver | null>(null);
  const measureBar = React.useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    barNode.current = node;
    if (!node || typeof ResizeObserver === "undefined") return;
    const next = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setBarHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    next.observe(node);
    observer.current = next;
  }, []);
  React.useEffect(() => () => observer.current?.disconnect(), []);

  // The sentence is frozen the moment the set changes — from these controls or
  // from the host — so the region never re-reads a pin that is already old.
  const signature = pinned.join(",");
  const [beat, setBeat] = React.useState<Beat>(() => ({
    signature,
    ids: pinned,
    message: "",
  }));
  if (beat.signature !== signature) {
    setBeat({
      signature,
      ids: pinned,
      message: describe(beat.ids, pinned, messages),
    });
  }

  const liftFor = (id: string): number => {
    const row = rowNodes.current.get(id);
    const bar = barNode.current;
    if (!row || !bar) return distances.shift;
    const gap =
      row.getBoundingClientRect().top - bar.getBoundingClientRect().bottom;
    // Rounded before it reaches a motion target: a raw float serialised into a
    // transform is exactly the sort of number that fails to hydrate.
    return Number(
      Math.min(MAX_LIFT, Math.max(distances.shift, gap)).toFixed(3),
    );
  };

  const toggle = (message: PinnedMessage) => {
    const isPinned = pinned.includes(message.id);
    if (!isPinned && full) {
      setBeat((prev) => ({
        ...prev,
        message: `Pinned bar is full. Unpin one of ${maxPinned} first.`,
      }));
      return;
    }
    setLifts((prev) => ({ ...prev, [message.id]: liftFor(message.id) }));
    setFlying(true);
    const next = isPinned
      ? pinned.filter((id) => id !== message.id)
      : [message.id, ...pinned];
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
    onPinChange?.(message.id, !isPinned);
  };

  const jump = (message: PinnedMessage) => {
    setJumped(message.id);
    rowNodes.current.get(message.id)?.focus();
    onJump?.(message.id);
  };

  /** With one row left the bar itself is the copy, so its exit carries the same
   *  measured fall: a child inside an exiting parent never animates on its own. */
  const soleRow = pinnedRows.length === 1 ? pinnedRows[0] : undefined;
  const soleLift = soleRow
    ? (lifts[soleRow.id] ?? distances.shift)
    : distances.shift;

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <motion.div
        initial={false}
        animate={{ height: barHeight ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className={cn(
          "w-full",
          flying && motionSafe ? "overflow-visible" : "overflow-hidden",
        )}
      >
        {/* The measured box carries its own bottom gap, so an empty bar leaves
            no strip of dead space above the thread. */}
        <div ref={measureBar} className={cn(pinnedRows.length > 0 && "pb-3")}>
          <AnimatePresence
            initial={false}
            onExitComplete={() => setFlying(false)}
          >
            {pinnedRows.length > 0 ? (
              <motion.section
                key="bar"
                aria-label={barLabel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  ...(motionSafe ? { y: soleLift } : {}),
                  transition: exitFor(
                    motionSafe ? durations.page : durations.fast,
                  ),
                }}
                transition={FADE}
                className="rounded-3 border border-hairline bg-surface-1 p-1.5"
              >
                <h3 className="flex items-center gap-1.5 px-1.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                  <PinGlyph filled className="size-3 text-cobalt-bright" />
                  {barLabel}
                  <span className="tabular-nums">
                    {pinnedRows.length} of {maxPinned}
                  </span>
                </h3>
                <ul role="list" className="flex flex-col gap-0.5">
                  <AnimatePresence
                    initial={false}
                    onExitComplete={() => setFlying(false)}
                  >
                    {pinnedRows.map((message) => {
                      // The same measured distance carries the copy up and
                      // sends it back down.
                      const lift = lifts[message.id] ?? distances.shift;
                      return (
                        <motion.li
                          key={message.id}
                          layout={motionSafe}
                          initial={
                            motionSafe
                              ? { opacity: 0, y: lift }
                              : { opacity: 0 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          onAnimationComplete={() => setFlying(false)}
                          exit={{
                            opacity: 0,
                            ...(motionSafe ? { y: lift } : {}),
                            transition: exitFor(
                              motionSafe ? durations.page : durations.fast,
                            ),
                          }}
                          transition={motionSafe ? springs.glide : FADE}
                          className="flex items-center gap-1"
                        >
                          <button
                            type="button"
                            onClick={() => jump(message)}
                            title={message.text}
                            aria-label={`Go to ${message.author}'s message, sent ${message.time}`}
                            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-2 px-2 text-left transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <span className="shrink-0 text-[11px] font-medium text-ink-2">
                              {message.author}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
                              {firstWords(message.text)}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggle(message)}
                            aria-label={`Unpin ${message.author}'s message, sent ${message.time}`}
                            className="grid size-8 shrink-0 place-items-center rounded-2 text-cobalt-bright transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                          >
                            <PinGlyph filled />
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </motion.section>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <ol role="list" aria-label={label} className="flex flex-col gap-3">
        {messages.map((message) => {
          const isPinned = pinned.includes(message.id);
          const refused = !isPinned && full;
          return (
            <li
              key={message.id}
              id={`${baseId}-row-${message.id}`}
              ref={(node) => {
                if (node) rowNodes.current.set(message.id, node);
                else rowNodes.current.delete(message.id);
              }}
              tabIndex={-1}
              aria-current={jumped === message.id ? "true" : undefined}
              className="flex flex-col rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[11px] font-medium text-ink-2">
                  {message.author}
                </span>
                <span className="text-[11px] text-ink-3 tabular-nums">
                  {message.time}
                </span>
                <AnimatePresence initial={false}>
                  {isPinned ? (
                    <motion.span
                      key="badge"
                      aria-hidden
                      initial={
                        motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={motionSafe ? springs.flick : FADE}
                      className="flex items-center text-cobalt-bright"
                    >
                      <PinGlyph filled className="size-3" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                <span className="flex-1" />
                <button
                  type="button"
                  aria-pressed={isPinned}
                  aria-disabled={refused || undefined}
                  onClick={() => toggle(message)}
                  aria-label={
                    refused
                      ? `Bar full, unpin one first. ${message.author}'s message, sent ${message.time}`
                      : `${isPinned ? "Unpin" : "Pin"} ${message.author}'s message, sent ${message.time}`
                  }
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isPinned ? "text-cobalt-bright" : "text-ink-3",
                    refused && "opacity-50",
                  )}
                >
                  <PinGlyph filled={isPinned} />
                </button>
              </div>
              <div
                className={cn(
                  "mt-1 max-w-[92%] rounded-3 rounded-bl-1 px-3 py-2 text-sm leading-snug wrap-break-word transition-colors",
                  isPinned
                    ? "bg-cobalt-wash text-foreground"
                    : "bg-surface-2 text-foreground",
                )}
              >
                {message.text}
              </div>
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.message}
      </span>
    </div>
  );
}
