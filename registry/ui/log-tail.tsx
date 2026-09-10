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

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogLine = {
  id: string;
  level: LogLevel;
  /** The service that wrote the line, e.g. "gate-relay". */
  service: string;
  /** Already formatted by the host — the component never reads a clock. */
  time: string;
  text: string;
};

export type LogTailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The buffer, oldest first. Cap it in the host; nothing here virtualises. */
  lines: LogLine[];
  /** Controlled follow state. */
  tailing?: boolean;
  /** Initial follow state for uncontrolled usage. @default true */
  defaultTailing?: boolean;
  /** Fires from the break, the strip, the Follow control, and End. */
  onTailingChange?: (tailing: boolean) => void;
  /** Fires when the count of lines that arrived while held changes. */
  onPendingChange?: (pending: number) => void;
  /** The sentence the polite region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** Scroll ceiling for the box, in px. @default 216 */
  maxHeight?: number;
  /** Names the log region. @default "Log" */
  label?: string;
  /** Printed while the buffer is empty. @default "Waiting for lines." */
  emptyLabel?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Within this many pixels of the bottom counts as the floor. */
const FLOOR_SLACK = 4;

/** Arrivals must stop for this long before the held count is spoken. */
const SETTLE_MS = 700;

const TONES: Record<
  LogLevel,
  { tag: string; word: string; rail: string; text: string }
> = {
  debug: { tag: "DBG", word: "Debug", rail: "bg-ink-3", text: "text-ink-3" },
  info: {
    tag: "INF",
    word: "Info",
    rail: "bg-cobalt-bright",
    text: "text-cobalt-bright",
  },
  warn: { tag: "WRN", word: "Warn", rail: "bg-warn", text: "text-warn" },
  error: { tag: "ERR", word: "Error", rail: "bg-danger", text: "text-danger" },
};

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** Only adds the stop the message does not already carry. */
const stop = (text: string): string =>
  /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

/** One string per row, so no accessible name is spliced from two text nodes. */
const rowSentence = (line: LogLine): string =>
  `${TONES[line.level].word}, ${line.service}, ${line.time}. ${stop(line.text)}`;

/** A prerender has no layout to read, so the pin runs as a plain effect there. */
const useIsoLayoutEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * One line. The level rail draws down beside it as it lands — the level is the
 * one thing worth animating about an arrival — and the whole row is spoken as a
 * single sentence, so the rail's colour is never the only signal.
 */
function LogRow({ line, motionSafe }: { line: LogLine; motionSafe: boolean }) {
  const tone = TONES[line.level];
  const enter = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.enter };
  return (
    <motion.li
      className="flex gap-2"
      initial={motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={enter}
    >
      <motion.span
        aria-hidden
        style={{ transformOrigin: "top" }}
        className={cn("w-[3px] shrink-0 self-stretch rounded-full", tone.rail)}
        initial={motionSafe ? { scaleY: 0 } : { opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={enter}
      />
      <span className="min-w-0 flex-1">
        <span className="sr-only">{rowSentence(line)}</span>
        <span
          aria-hidden
          className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] leading-[1.5]"
        >
          <span className="text-ink-3 tabular-nums">{line.time}</span>
          <span className={cn("font-semibold", tone.text)}>{tone.tag}</span>
          <span className="text-ink-2">{line.service}</span>
        </span>
        <span
          aria-hidden
          className="block font-mono text-[11px] leading-[1.5] break-words text-ink"
        >
          {line.text}
        </span>
      </span>
    </motion.li>
  );
}

/**
 * A log that follows its own floor. While it is tailing, every line handed to
 * it is pinned into view in a layout effect, so the newest one is already
 * seated on the frame it paints; the row travels `distances.step` up on `glide`
 * and its level rail draws down beside it, because a line arriving is a small
 * layout move and not a celebration.
 *
 * Scroll up and the tail breaks: the box holds where you left it while lines
 * land underneath, and an opaque strip rises off the floor on `snap` counting
 * what you have missed — its readings share one grid cell and cross-fade, so a
 * fast feed can never blank the count. The strip, End, and Follow all run the
 * box back down, `scrollTop` animated imperatively with every frame rounded
 * before it reaches the node; scrolling back to the floor by hand resumes it.
 *
 * The box is a `role="log"` whose live region is polite while it follows and
 * off while it is held, which is the honest reading of a paused tail. Each row
 * carries its own sentence, so the rail's colour is never the only signal, and
 * a second polite region speaks the held count on settle rather than once per
 * arrival. Under reduced motion lines still arrive and rails still mark the
 * level — arrival is information — but nothing travels and the jump is seated
 * in one step.
 */
export function LogTail({
  ref,
  lines,
  tailing,
  defaultTailing = true,
  onTailingChange,
  onPendingChange,
  onAnnounce,
  maxHeight = 216,
  label = "Log",
  emptyLabel = "Waiting for lines.",
  className,
}: LogTailProps) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const controlsRef = React.useRef<{ stop: () => void } | null>(null);
  /** A run back to the floor passes through every position on the way; those
   *  scroll events are the component's own and must not break the tail. */
  const jumpingRef = React.useRef(false);

  const [own, setOwn] = React.useState(defaultTailing);
  const isTailing = tailing ?? own;
  const [beat, setBeat] = React.useState({ sentence: "", stamp: 0 });

  const tailingRef = useLatest(isTailing);
  const lengthRef = useLatest(lines.length);

  // The anchor is the buffer length when the tail last held, so the pending
  // count is derived rather than accumulated — a clear cannot leave it stranded.
  const [anchor, setAnchor] = React.useState(lines.length);
  if (isTailing ? anchor !== lines.length : anchor > lines.length) {
    setAnchor(lines.length);
  }
  const pending = Math.max(0, lines.length - anchor);

  /** The stamp comes from the updater, so two sentences frozen in the same
   *  tick cannot collide and a repeat still reads as a new announcement. */
  const speak = React.useCallback((sentence: string) => {
    setBeat((prev) => ({ sentence, stamp: prev.stamp + 1 }));
  }, []);

  const tailChangeRef = useLatest(onTailingChange);
  const setTail = React.useCallback(
    (next: boolean) => {
      if (tailingRef.current === next) return;
      if (tailing === undefined) setOwn(next);
      tailChangeRef.current?.(next);
    },
    [tailing, tailChangeRef, tailingRef],
  );

  const seatFloor = React.useCallback(() => {
    const node = boxRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, []);

  /** The scroll handler is the only thing allowed to break the tail: a resize
   *  that opens a gap re-seats instead, or a shrinking box would read as the
   *  reader scrolling away. */
  const onScroll = React.useCallback(() => {
    const node = boxRef.current;
    if (!node) return;
    if (jumpingRef.current) return;
    const floor =
      node.scrollHeight - node.scrollTop - node.clientHeight <= FLOOR_SLACK;
    if (floor !== tailingRef.current) setTail(floor);
  }, [setTail, tailingRef]);

  React.useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    node.addEventListener("scroll", onScroll, { passive: true });
    // The observer also delivers the first measurement, which is why nothing
    // sets state in the effect body itself.
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (tailingRef.current) seatFloor();
            else onScroll();
          });
    observer?.observe(node);
    if (listRef.current) observer?.observe(listRef.current);
    return () => {
      node.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [onScroll, seatFloor, tailingRef]);

  // A box that is following stays on its floor when a line lands; one that is
  // held is left exactly where the reader put it.
  useIsoLayoutEffect(() => {
    if (isTailing) seatFloor();
  }, [lines.length, isTailing, seatFloor]);

  React.useEffect(() => () => controlsRef.current?.stop(), []);

  // A hidden tab paints nothing, so a run to the floor is finished rather than
  // played to an empty room.
  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) return;
      controlsRef.current?.stop();
      controlsRef.current = null;
      if (tailingRef.current) seatFloor();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [seatFloor, tailingRef]);

  // The latch is announced from the settled value, never from the press: under
  // a controlled host the tail has not actually changed until the host says so.
  const firstLatch = React.useRef(true);
  React.useEffect(() => {
    if (firstLatch.current) {
      firstLatch.current = false;
      return;
    }
    speak(
      isTailing
        ? "Tailing. Following new lines."
        : `Held at ${countPhrase(lengthRef.current, "line")}.`,
    );
  }, [isTailing, speak, lengthRef]);

  // Held arrivals are spoken on settle, not once per line: a feed that talks
  // over itself is a feed nobody can listen to.
  React.useEffect(() => {
    if (isTailing || pending <= 0) return;
    const timer = window.setTimeout(
      () => speak(`${countPhrase(pending, "new line")} below.`),
      SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [isTailing, pending, speak]);

  const pendingRef = useLatest(onPendingChange);
  const firstPending = React.useRef(true);
  React.useEffect(() => {
    if (firstPending.current) {
      firstPending.current = false;
      return;
    }
    pendingRef.current?.(pending);
  }, [pending, pendingRef]);

  const announceRef = useLatest(onAnnounce);
  React.useEffect(() => {
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const jumpToFloor = () => {
    const node = boxRef.current;
    if (!node) return;
    controlsRef.current?.stop();
    controlsRef.current = null;
    // The latch is set before the run and nothing on the way down can cancel
    // it: a press that reached the floor stays a press that reached the floor.
    setTail(true);
    const target = Math.max(0, node.scrollHeight - node.clientHeight);
    if (!motionSafe) {
      node.scrollTop = target;
      return;
    }
    jumpingRef.current = true;
    const controls = animate(node.scrollTop, target, {
      duration: durations.base,
      ease: easings.enter,
      onUpdate: (value) => {
        // Rounded before it reaches the node: a scroll offset is a layout
        // value, and a raw float only costs a repaint.
        node.scrollTop = Math.round(value);
      },
      onComplete: () => {
        jumpingRef.current = false;
        controlsRef.current = null;
        seatFloor();
      },
    });
    controlsRef.current = {
      stop: () => {
        jumpingRef.current = false;
        controls.stop();
      },
    };
  };

  const onBoxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "End") {
      event.preventDefault();
      jumpToFloor();
    } else if (event.key === "Home") {
      const node = boxRef.current;
      if (!node) return;
      event.preventDefault();
      controlsRef.current?.stop();
      controlsRef.current = null;
      node.scrollTop = 0;
      setTail(false);
    }
  };

  const followSentence = isTailing
    ? "Following new lines. Press to hold."
    : "Held. Press to follow new lines.";
  const stripSentence = `${countPhrase(pending, "new line")} below. Jump to the newest.`;
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const rise = motionSafe ? springs.snap : fade;
  const showStrip = !isTailing && pending > 0;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex h-7 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-[11px] tracking-[0.08em] text-ink-2 uppercase">
          {label}
        </span>
        {/* The region already names itself, so the running count stays out of
            the accessibility tree rather than being read on every arrival. */}
        <span
          aria-hidden
          className="ml-auto shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {lines.length}
        </span>
        <button
          type="button"
          aria-pressed={isTailing}
          aria-label={followSentence}
          onClick={() => (isTailing ? setTail(false) : jumpToFloor())}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors hover:bg-accent",
            isTailing ? "text-ink" : "text-ink-3",
            focusRing,
          )}
        >
          {/* The pulse is the only ambient motion here, and it runs only while
              the tail is actually live. */}
          <motion.span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              isTailing ? "bg-cobalt-bright" : "bg-ink-3",
            )}
            animate={
              motionSafe && isTailing
                ? { opacity: [1, 0.35, 1] }
                : { opacity: 1 }
            }
            transition={
              motionSafe && isTailing
                ? {
                    duration: durations.page * 2,
                    ease: easings.move,
                    repeat: Infinity,
                  }
                : fade
            }
          />
          Follow
        </button>
      </div>

      <div className="relative">
        <div
          ref={boxRef}
          role="log"
          aria-label={label}
          aria-live={isTailing ? "polite" : "off"}
          aria-relevant="additions"
          tabIndex={0}
          onKeyDown={onBoxKeyDown}
          style={{ maxHeight: Math.round(maxHeight) }}
          className={cn(
            "overflow-x-clip overflow-y-auto overscroll-contain rounded-2 border border-hairline bg-surface-0 p-1.5",
            focusRing,
          )}
        >
          {lines.length === 0 ? (
            <p className="px-1 py-1.5 font-mono text-[11px] text-ink-3">
              {emptyLabel}
            </p>
          ) : (
            <ol
              ref={listRef}
              role="list"
              // The strip is opaque, so the list makes room for it rather than
              // letting it sit on top of a line nobody can then read.
              className={cn("flex flex-col gap-1", showStrip && "pb-7")}
            >
              <AnimatePresence initial={false}>
                {lines.map((line) => (
                  <LogRow key={line.id} line={line} motionSafe={motionSafe} />
                ))}
              </AnimatePresence>
            </ol>
          )}
        </div>

        <AnimatePresence initial={false}>
          {showStrip ? (
            <motion.button
              key="held-strip"
              type="button"
              aria-label={stripSentence}
              onClick={jumpToFloor}
              // Opaque, and inside the component's own box: it covers the last
              // line of the log rather than floating over the host's page.
              className={cn(
                "absolute inset-x-0 bottom-0 flex h-7 items-center justify-between gap-2 rounded-b-2 border-t border-hairline-strong bg-popover px-2 text-popover-foreground",
                focusRing,
              )}
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={rise}
            >
              {/* Both readings stack in one cell and cross-fade, so a feed
                  arriving faster than the fade can never blank the count. */}
              <span aria-hidden className="grid min-w-0 text-left">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={pending}
                    className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink tabular-nums"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={fade}
                  >
                    {countPhrase(pending, "new line")}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span
                aria-hidden
                className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase"
              >
                Jump
              </span>
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
