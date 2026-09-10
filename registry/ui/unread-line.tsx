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

export type UnreadMessage = {
  id: string;
  author: string;
  text: string;
  /** Sent time, already formatted by the host. */
  time: string;
};

export type UnreadLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: UnreadMessage[];
  /** Controlled count of messages read from the top; the rule sits after them. */
  readCount?: number;
  /** Initial count for uncontrolled usage. @default messages.length */
  defaultReadCount?: number;
  /** Fires when the rule's own control advances the boundary. */
  onReadCountChange?: (count: number) => void;
  /** Fires from the pill, alongside `onReadCountChange`. */
  onMarkAllRead?: () => void;
  /** Fires once per frozen change sentence ("3 messages are new."). */
  onAnnounce?: (sentence: string) => void;
  /** Names the thread for assistive technology. */
  label: string;
  /** The pill's word. @default "New messages" */
  dividerLabel?: string;
  /** What the header reads when nothing is unread. @default "You are up to date" */
  upToDateLabel?: string;
  /** Tallest the thread grows before it scrolls inside its own box. @default 300 */
  maxHeight?: number;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/**
 * Digits roll one place at a time, so 4 → 3 reads as a count and not a redraw.
 * Each place owns an `AnimatePresence`: a nested one hands its children a fresh
 * presence context, which is what lets a digit animate even though the rule
 * above it mounted under `initial={false}` — that flag would otherwise block
 * every enter animation inside the subtree for the life of the divider.
 */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="inline-flex tabular-nums">
      {String(value)
        .split("")
        .map((char, place) => (
          <span
            key={place}
            className="relative inline-flex overflow-hidden leading-none"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={char}
                className="inline-block"
                initial={motionSafe ? { y: -8, opacity: 0 } : { opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? 8 : 0,
                  transition: exitFor(durations.fast),
                }}
                transition={motionSafe ? springs.snap : FADE}
              >
                {char}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
    </span>
  );
}

/** One string per reading, so no accessible name is spliced from two nodes.
 *  The bubble's own text follows it in the DOM and is never repeated here. */
const messageSentence = (message: UnreadMessage, read: boolean): string =>
  `${message.author}, ${message.time}, ${read ? "read" : "unread"}.`;

const countSentence = (unread: number): string =>
  unread === 0
    ? "You are up to date."
    : unread === 1
      ? "1 message is new."
      : `${unread} messages are new.`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The rule that says where you stopped. One separator sits between the last
 * message you have read and the first you have not: the rule scales from 0 with
 * its origin at the left on `glide` and the pill beside it arrives 4px up on
 * `flick`, so the line draws itself rather than appearing. As you read, the
 * boundary advances and the same element travels to its new seat — it keeps its
 * key inside one `AnimatePresence`, so it is the same rule moving under `layout`
 * while the messages re-seat around it — and the pill's count rolls a digit at a
 * time as it falls.
 *
 * When the last unread is read the rule does not spring away: it fades and lifts
 * `distances.step` on the exit ease, because leaving never celebrates, and the
 * header's two readings share one grid cell and cross-fade, so no height is held
 * for either. The pill is a real button that marks everything below it read, the
 * thread is an `<ol role="list">` whose rows name their own state ("Marta
 * Ferreira, 02:14, unread."), and a polite region speaks one frozen sentence per
 * change. Under reduced motion nothing draws or travels and the count still
 * changes, because what is unread is information.
 */
export function UnreadLine({
  ref,
  messages,
  readCount,
  defaultReadCount,
  onReadCountChange,
  onMarkAllRead,
  onAnnounce,
  label,
  dividerLabel = "New messages",
  upToDateLabel = "You are up to date",
  maxHeight = 300,
  className,
}: UnreadLineProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] = React.useState<number>(
    () => defaultReadCount ?? messages.length,
  );
  const raw = readCount ?? uncontrolled;
  const boundary = Math.min(messages.length, Math.max(0, raw));
  const unread = messages.length - boundary;

  // The sentence is frozen the moment the count changes — from this control or
  // from the host — so the region never re-reads a state that is already old.
  const [beat, setBeat] = React.useState(() => ({
    unread,
    sentence: "",
    stamp: 0,
  }));
  if (beat.unread !== unread) {
    setBeat({ unread, sentence: countSentence(unread), stamp: beat.stamp + 1 });
  }

  const announceRef = useLatest(onAnnounce);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const markAllRead = () => {
    if (unread === 0) return;
    if (readCount === undefined) setUncontrolled(messages.length);
    onReadCountChange?.(messages.length);
    onMarkAllRead?.();
  };

  const firstUnread = messages[boundary];
  const dividerSentence = firstUnread
    ? `${dividerLabel}, ${unread === 1 ? "1 unread" : `${unread} unread`}, starting with ${firstUnread.author}.`
    : `${dividerLabel}.`;

  // Built as one array so the divider keeps its key as it moves: the same
  // element travels between seats instead of one leaving and another arriving.
  const rows: React.ReactNode[] = [];
  messages.forEach((message, index) => {
    if (index === boundary && unread > 0) {
      rows.push(
        <motion.li
          key="divider"
          layout={motionSafe ? "position" : false}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{
            opacity: 0,
            y: motionSafe ? -distances.step : 0,
            transition: exitFor(),
          }}
          transition={motionSafe ? springs.glide : FADE}
          className="flex flex-col"
        >
          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={markAllRead}
              initial={
                motionSafe
                  ? { opacity: 0, y: -distances.nudge }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={motionSafe ? springs.flick : FADE}
              aria-label={`Mark ${unread === 1 ? "1 message" : `${unread} messages`} read`}
              className={cn(
                "flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-cobalt-bright/40 bg-cobalt-wash px-2.5 text-cobalt-bright",
                "text-[11px] font-medium transition-colors outline-none",
                "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <span>{dividerLabel}</span>
              <Roll value={unread} motionSafe={motionSafe} />
            </motion.button>
            {/* The rule draws itself out of the pill: scaleX from a left
                origin, so nothing inside it distorts. */}
            <motion.span
              role="separator"
              aria-label={dividerSentence}
              initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={motionSafe ? springs.glide : FADE}
              className="h-px flex-1 origin-left rounded-full bg-cobalt-bright/50"
            />
          </div>
        </motion.li>,
      );
    }
    rows.push(
      <motion.li
        key={message.id}
        layout={motionSafe ? "position" : false}
        transition={motionSafe ? springs.glide : FADE}
        className="flex flex-col gap-1"
      >
        {/* The state is spoken as one sentence rather than assembled from the
            visible parts, which is what keeps a comma from arriving with a
            stray space in front of it. */}
        <span className="sr-only">
          {messageSentence(message, index < boundary)}
        </span>
        <span aria-hidden className="flex items-center gap-1.5 px-1 text-ink-3">
          <span className="text-[11px] font-medium text-ink-2">
            {message.author}
          </span>
          <span className="text-[11px] tabular-nums">{message.time}</span>
        </span>
        {/* The bubble's own text is left readable: only the author and time
            are hidden, because the sr-only sentence already says them. */}
        <span className="max-w-[92%] rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2 text-sm leading-snug wrap-break-word text-foreground">
          {message.text}
        </span>
      </motion.li>,
    );
  });

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      {/* Both readings share one grid cell, so the header never changes height
          and a rapid change cannot drop one behind the other. */}
      <div className="grid h-5 items-center px-1">
        <motion.span
          aria-hidden={unread === 0}
          animate={{ opacity: unread > 0 ? 1 : 0 }}
          transition={FADE}
          className="col-start-1 row-start-1 font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase"
        >
          {unread === 1 ? "1 new message" : `${unread} new messages`}
        </motion.span>
        <motion.span
          aria-hidden={unread > 0}
          animate={{ opacity: unread === 0 ? 1 : 0 }}
          transition={FADE}
          className="col-start-1 row-start-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {upToDateLabel}
        </motion.span>
      </div>

      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        style={{ maxHeight: Math.round(maxHeight) }}
        className={cn(
          "overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 p-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <ol role="list" className="flex flex-col gap-3">
          <AnimatePresence initial={false}>{rows}</AnimatePresence>
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
