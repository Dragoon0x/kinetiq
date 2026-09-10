"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type JumpMessage = {
  id: string;
  author: string;
  text: string;
  /** Sent time, already formatted by the host. */
  time: string;
  /** Puts the bubble on the right, as the reader's own. */
  own?: boolean;
};

export type JumpLatestProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: JumpMessage[];
  /** Fires when a jump starts, from the pill or from End. */
  onJump?: () => void;
  /** Fires when the count of messages that arrived while you were away changes. */
  onNewCountChange?: (count: number) => void;
  /** Fires as the box reaches or leaves its floor. */
  onAtBottomChange?: (atBottom: boolean) => void;
  /** Fires once per frozen change sentence ("3 new messages below."). */
  onAnnounce?: (sentence: string) => void;
  /** Names the thread for assistive technology. */
  label: string;
  /** The pill's word when nothing new has arrived. @default "Latest" */
  jumpLabel?: string;
  /** Pixels above the floor before the pill rises. @default 48 */
  revealDistance?: number;
  /** Tallest the thread grows before it scrolls inside its own box. @default 260 */
  maxHeight?: number;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** A prerender has no layout to read, so the pin runs as a plain effect there. */
const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/**
 * Digits roll one place at a time, so 9 → 10 reads as a count and not a redraw.
 * Each place owns an `AnimatePresence`: a nested one hands its children a fresh
 * presence context, which is what lets a digit animate even though the pill
 * above it mounted under `initial={false}` — that flag would otherwise block
 * every enter animation inside the subtree for the life of the pill.
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

const countSentence = (count: number): string =>
  count === 1 ? "1 new message below." : `${count} new messages below.`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The way back down. While the thread sits at its floor the component shows
 * nothing at all; scroll up past `revealDistance` and a pill rises from the
 * box's bottom edge on `snap` — one crisp overshoot — inside the component's own
 * box, never floated over whatever the host wrote around it. Messages that
 * arrive while you are away are counted, and the pill's two readings share one
 * grid cell and cross-fade, so its width never jumps and a fast arrival cannot
 * drop a reading behind another; the digits roll a place at a time.
 *
 * Pressing it, or pressing End inside the thread, slides the box to its floor:
 * `scrollTop` is animated imperatively on `glide` — this is the thread moving,
 * not a control — with every frame rounded before it reaches the node. The
 * animation stops on unmount, on a new press, and when the document is hidden.
 * The box is a `role="region"` with `tabIndex=0` so it can be scrolled from the
 * keyboard, each row names itself as a sentence, and a polite region speaks one
 * frozen line per change. Under reduced motion the pill fades in place and the
 * jump lands in one step, which is what a reader who asked for less motion wants
 * from a control that moves the page.
 */
export function JumpLatest({
  ref,
  messages,
  onJump,
  onNewCountChange,
  onAtBottomChange,
  onAnnounce,
  label,
  jumpLabel = "Latest",
  revealDistance = 48,
  maxHeight = 260,
  className,
}: JumpLatestProps) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLOListElement | null>(null);
  const controlsRef = React.useRef<{ stop: () => void } | null>(null);

  const [atBottom, setAtBottom] = React.useState(true);
  /** The floor test the pin and the jump read, without waiting for a render. */
  const atBottomRef = React.useRef(true);

  const measure = React.useCallback(() => {
    const node = boxRef.current;
    if (!node) return;
    const gap = node.scrollHeight - node.scrollTop - node.clientHeight;
    const next = gap <= revealDistance;
    atBottomRef.current = next;
    setAtBottom((prev) => (prev === next ? prev : next));
  }, [revealDistance]);

  React.useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    node.addEventListener("scroll", measure, { passive: true });
    // The observer also delivers the first measurement, which is why nothing
    // sets state in the effect body itself.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => measure());
    observer?.observe(node);
    if (innerRef.current) observer?.observe(innerRef.current);
    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure]);

  // A thread that was at its floor stays there when a message lands; one that
  // was scrolled up is left exactly where the reader put it.
  useIsoLayoutEffect(() => {
    const node = boxRef.current;
    if (node && atBottomRef.current) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  // The count and its sentence are frozen at the moment the thread changes, so
  // a later re-render can never re-read an arrival that has already been seen.
  const [beat, setBeat] = React.useState(() => ({
    length: messages.length,
    count: 0,
    sentence: "",
    stamp: 0,
  }));
  const grew = messages.length - beat.length;
  if (grew !== 0 || (atBottom && beat.count > 0)) {
    const count = atBottom ? 0 : beat.count + Math.max(0, grew);
    setBeat({
      length: messages.length,
      count,
      sentence:
        count > 0
          ? countSentence(count)
          : beat.count > 0
            ? "You are at the latest message."
            : beat.sentence,
      stamp: beat.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  const countRef = useLatest(onNewCountChange);
  const firstBeat = React.useRef(true);
  React.useEffect(() => {
    countRef.current?.(beat.count);
    if (firstBeat.current) {
      firstBeat.current = false;
      return;
    }
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.count, beat.sentence, announceRef, countRef]);

  const bottomRef = useLatest(onAtBottomChange);
  const firstFloor = React.useRef(true);
  React.useEffect(() => {
    if (firstFloor.current) {
      firstFloor.current = false;
      return;
    }
    bottomRef.current?.(atBottom);
  }, [atBottom, bottomRef]);

  const slideTo = React.useCallback(
    (target: number) => {
      const node = boxRef.current;
      if (!node) return;
      controlsRef.current?.stop();
      controlsRef.current = null;
      const to = Math.max(0, Math.round(target));
      if (!motionSafe) {
        node.scrollTop = to;
        measure();
        return;
      }
      const controls = animate(node.scrollTop, to, {
        ...springs.glide,
        onUpdate: (value) => {
          // Rounded before it reaches the node: a scroll offset is a layout
          // value, and a raw float only costs a repaint.
          node.scrollTop = Math.round(value);
        },
      });
      controlsRef.current = controls;
    },
    [measure, motionSafe],
  );

  // A hidden tab paints nothing, so a slide in progress is stopped rather than
  // finished against a document nobody is looking at.
  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) controlsRef.current?.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controlsRef.current?.stop();
    };
  }, []);

  const jump = () => {
    const node = boxRef.current;
    if (!node) return;
    onJump?.();
    slideTo(node.scrollHeight - node.clientHeight);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "End") {
      event.preventDefault();
      jump();
    } else if (event.key === "Home") {
      event.preventDefault();
      slideTo(0);
    }
  };

  const pillSentence =
    beat.count > 0
      ? `Jump to the latest, ${countSentence(beat.count).slice(0, -1)}.`
      : "Jump to the latest message.";

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <div
        ref={boxRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{ maxHeight: Math.round(maxHeight) }}
        className={cn(
          "overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 p-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <ol ref={innerRef} role="list" className="flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "flex flex-col gap-1",
                message.own ? "items-end" : "items-start",
              )}
            >
              <span className="sr-only">{`${message.author}, ${message.time}.`}</span>
              <span
                aria-hidden
                className="flex items-center gap-1.5 px-1 text-[11px] text-ink-3"
              >
                <span className="font-medium text-ink-2">{message.author}</span>
                <span className="tabular-nums">{message.time}</span>
              </span>
              <span
                className={cn(
                  "max-w-[86%] rounded-3 px-3 py-2 text-sm leading-snug wrap-break-word",
                  message.own
                    ? "rounded-br-1 bg-primary text-primary-foreground"
                    : "rounded-bl-1 bg-surface-2 text-foreground",
                )}
              >
                {message.text}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* The pill lives inside the component's own box: floating it above the
          component would cover whatever the host wrote there. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <AnimatePresence initial={false}>
          {atBottom ? null : (
            <motion.button
              key="jump"
              type="button"
              onClick={jump}
              aria-label={pillSentence}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.shift }
                  : { opacity: 0, y: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? distances.step : 0,
                transition: exitFor(durations.fast),
              }}
              transition={motionSafe ? springs.snap : FADE}
              className={cn(
                "pointer-events-auto border-hairline-strong bg-popover text-popover-foreground shadow-raised",
                "flex h-8 items-center gap-1.5 rounded-full border pr-3 pl-2.5 text-xs font-medium",
                "transition-colors outline-none hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
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
              {/* Both readings share one grid cell, so the pill keeps one width
                  and a burst of arrivals never leaves a reading behind. */}
              <span aria-hidden className="grid">
                <motion.span
                  className="col-start-1 row-start-1 text-left"
                  animate={{ opacity: beat.count > 0 ? 0 : 1 }}
                  transition={FADE}
                >
                  {jumpLabel}
                </motion.span>
                <motion.span
                  className="col-start-1 row-start-1 flex items-center gap-1 text-left text-cobalt-bright"
                  animate={{ opacity: beat.count > 0 ? 1 : 0 }}
                  transition={FADE}
                >
                  <Roll value={beat.count} motionSafe={motionSafe} />
                  <span>new</span>
                </motion.span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
