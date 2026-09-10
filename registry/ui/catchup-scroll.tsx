"use client";

import * as React from "react";

import { animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CatchupMessage = {
  id: string;
  author: string;
  /** Printed beside the author and spoken in the row's sentence. */
  time: string;
  text: string;
};

export type CatchupScrollProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The backlog, oldest first. */
  messages: CatchupMessage[];
  /** Controlled run state. */
  playing?: boolean;
  /** Initial run state for uncontrolled usage. @default false */
  defaultPlaying?: boolean;
  /** Fires from the control, from an interruption, and from the finish. */
  onPlayingChange?: (playing: boolean) => void;
  /** Fires as the rail passes each message. */
  onProgressChange?: (readCount: number) => void;
  /** Fires once when the run reaches the floor. */
  onFinish?: () => void;
  /** The sentence the live region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** Reading pace; sets how long the run takes. @default 220 */
  wordsPerMinute?: number;
  /** Names the region and heads the card. @default "Catch up" */
  label?: string;
  /** Scroll ceiling for the thread, in px. @default 240 */
  maxHeight?: number;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Nothing reads faster than this, whatever the pace says. */
const MIN_STEP_MS = 400;

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

const wordsIn = (text: string): number =>
  text.trim().split(/\s+/).filter(Boolean).length;

/** One string per reading, so no accessible name is spliced from two nodes. */
const rowSentence = (message: CatchupMessage, read: boolean): string =>
  `${message.author}, ${message.time}, ${read ? "read" : "unread"}.`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Press it and the backlog reads itself to you. The run animates the box's own
 * `scrollTop` imperatively — every message's word count over `wordsPerMinute`
 * gives it its seconds — on `easings.linear`, because a reading speed that
 * accelerates is a lie, with each frame rounded before it reaches the node.
 * Beside the thread a rail shows how far you have come: a fill joined on
 * `glide` and a tick per message boundary, both measured from the rows
 * themselves and rounded to three decimals before they reach a percentage.
 * Messages the rail has passed dim to read and the count falls.
 *
 * Any touch stops it. A wheel, a pointer, or a key inside the box halts the run
 * where it stands and reports the stop from the handler that caused it, so a
 * host controlling `playing` sees it at once rather than waiting for a value
 * that cannot move on its own. The run also holds while the document is hidden
 * and picks up from where it stood, lives in an effect with cleanup, and never
 * reads a clock during render; reaching the floor stops it, says you are caught
 * up, and fires `onFinish`.
 *
 * The box is a `role="region"` with `tabIndex=0` so it scrolls from the
 * keyboard, Home and End jump to the top and the floor, the rail is a real
 * `role="progressbar"` with a spoken `aria-valuetext`, and each row carries its
 * own state as a sentence. A polite region speaks once per settle, never once
 * per row. Under reduced motion the catch-up still runs, but in steps: the box
 * is seated on the next message at that message's reading time, so progress
 * still happens and nothing travels.
 */
export function CatchupScroll({
  ref,
  messages,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  onProgressChange,
  onFinish,
  onAnnounce,
  wordsPerMinute = 220,
  label = "Catch up",
  maxHeight = 240,
  className,
}: CatchupScrollProps) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const bottomsRef = React.useRef<number[]>([]);

  const [own, setOwn] = React.useState(defaultPlaying);
  const isPlaying = playing ?? own;
  const [hidden, setHidden] = React.useState(false);
  const [beat, setBeat] = React.useState({ sentence: "", stamp: 0 });
  const [progress, setProgress] = React.useState({
    read: 0,
    fraction: 0,
    ticks: [] as number[],
  });

  const total = messages.length;
  const words = React.useMemo(
    () => messages.map((message) => wordsIn(message.text)),
    [messages],
  );
  const totalWords = words.reduce((sum, one) => sum + one, 0);
  const pace = Math.max(40, wordsPerMinute);

  // The rows are measured from their own boxes, so the rail's ticks are the
  // message boundaries rather than an even division of the track.
  const measure = React.useCallback(() => {
    const node = boxRef.current;
    const list = listRef.current;
    if (!node || !list) return;
    const span = node.scrollHeight - node.clientHeight;
    const line = node.scrollTop + node.clientHeight;
    const bottoms = Array.from(list.children).map((child) => {
      const row = child as HTMLElement;
      return row.offsetTop + row.offsetHeight;
    });
    bottomsRef.current = bottoms;
    const read = bottoms.filter((bottom) => bottom <= line + 1).length;
    // Rounded before it becomes a percentage: an unrounded ratio re-serialises
    // differently on the server and the client, and that is a hydration error.
    // The fill is held to whole percents as well, so a smooth run re-renders a
    // hundred times rather than once a frame; the spring covers the steps.
    const at = (value: number, places: number) =>
      Number(Math.min(1, Math.max(0, value)).toFixed(places));
    const fraction = span > 0 ? at(node.scrollTop / span, 2) : 1;
    const ticks = bottoms.map((bottom) =>
      span > 0 ? at((bottom - node.clientHeight) / span, 3) : 1,
    );
    setProgress((prev) =>
      prev.read === read &&
      prev.fraction === fraction &&
      prev.ticks.length === ticks.length &&
      prev.ticks.every((one, at2) => one === ticks[at2])
        ? prev
        : { read, fraction, ticks },
    );
  }, []);

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
    if (listRef.current) observer?.observe(listRef.current);
    return () => {
      node.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [measure]);

  // A hidden tab paints nothing and its timers are throttled, so the run holds
  // rather than racing through a backlog nobody is looking at.
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const announceRef = useLatest(onAnnounce);
  React.useEffect(() => {
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const progressRef = useLatest(onProgressChange);
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    progressRef.current?.(progress.read);
  }, [progress.read, progressRef]);

  /** The stamp comes from the updater, so a sentence frozen inside an
   *  animation's completion can never collide with one a render later. */
  const speak = React.useCallback((sentence: string) => {
    setBeat((prev) => ({ sentence, stamp: prev.stamp + 1 }));
  }, []);

  const setRunning = (next: boolean, sentence: string) => {
    if (playing === undefined) setOwn(next);
    onPlayingChange?.(next);
    speak(sentence);
  };

  const finishRef = useLatest(() => {
    if (playing === undefined) setOwn(false);
    onPlayingChange?.(false);
    onFinish?.();
    speak(`You are caught up. ${countPhrase(total, "message")} read.`);
  });

  const start = () => {
    const node = boxRef.current;
    if (!node) return;
    if (node.scrollHeight - node.clientHeight <= 0) {
      finishRef.current();
      return;
    }
    setRunning(true, `Catching up at ${pace} words a minute.`);
  };

  /** Every interruption comes from the handler that caused it, never from an
   *  effect watching the value: a controlled `playing` cannot change until the
   *  host answers, so a run that waited for it would never stop. */
  const interrupt = () => {
    if (!isPlaying) return;
    setRunning(false, `Stopped at ${progress.read} of ${total}.`);
  };

  // The smooth run: one linear tween across what is left of the scroll, whose
  // duration is the words still to be read at the given pace.
  React.useEffect(() => {
    if (!isPlaying || !motionSafe || hidden) return;
    const node = boxRef.current;
    if (!node) return;
    const span = node.scrollHeight - node.clientHeight;
    if (span <= 0) {
      const id = window.setTimeout(() => finishRef.current(), 0);
      return () => window.clearTimeout(id);
    }
    const left = Math.max(0, span - node.scrollTop) / span;
    const run = Math.max(
      MIN_STEP_MS / 1000,
      Number((((totalWords || 1) / pace) * 60 * left).toFixed(3)),
    );
    const controls = animate(node.scrollTop, span, {
      duration: run,
      ease: easings.linear,
      onUpdate: (value) => {
        // Rounded before it reaches the node: a scroll offset is a layout
        // value, and a raw float only costs a repaint.
        node.scrollTop = Math.round(value);
      },
      onComplete: () => finishRef.current(),
    });
    return () => controls.stop();
  }, [isPlaying, motionSafe, hidden, pace, totalWords, finishRef]);

  // The reduced-motion run: the same pace, seated one message at a time, so
  // progress still happens and nothing travels.
  React.useEffect(() => {
    if (!isPlaying || motionSafe || hidden) return;
    const node = boxRef.current;
    if (!node) return;
    let timer = 0;
    const rowSeconds = (index: number) =>
      Math.max(MIN_STEP_MS / 1000, ((words[index] ?? 1) / pace) * 60);
    /** The first row whose foot is still below the box, read from the DOM so
     *  the chain never has to depend on a count that changes every step. */
    const nextRow = () => {
      const line = node.scrollTop + node.clientHeight;
      return bottomsRef.current.findIndex((bottom) => bottom > line + 1);
    };
    const step = () => {
      const span = node.scrollHeight - node.clientHeight;
      const at = nextRow();
      const bottom = at < 0 ? undefined : bottomsRef.current[at];
      const target =
        bottom === undefined
          ? span
          : Math.min(span, Math.round(bottom - node.clientHeight));
      node.scrollTop = Math.max(0, target);
      measure();
      if (bottom === undefined || target >= span - 1) {
        finishRef.current();
        return;
      }
      const after = nextRow();
      timer = window.setTimeout(
        step,
        rowSeconds(after < 0 ? at : after) * 1000,
      );
    };
    timer = window.setTimeout(step, rowSeconds(Math.max(0, nextRow())) * 1000);
    return () => window.clearTimeout(timer);
  }, [isPlaying, motionSafe, hidden, pace, words, measure, finishRef]);

  const seat = (target: number) => {
    const node = boxRef.current;
    if (!node) return;
    node.scrollTop = Math.max(0, Math.round(target));
    measure();
  };

  const onBoxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const node = boxRef.current;
    if (event.key === "Home") {
      event.preventDefault();
      seat(0);
    } else if (event.key === "End") {
      event.preventDefault();
      if (node) seat(node.scrollHeight - node.clientHeight);
    }
    interrupt();
  };

  const percent = Number((progress.fraction * 100).toFixed(3));
  const readingLine = `${progress.read} of ${total} read.`;
  const controlSentence = isPlaying
    ? "Stop catching up."
    : `Catch up on ${countPhrase(total, "message")} at ${pace} words a minute.`;
  const glide = motionSafe ? springs.glide : { duration: 0 };
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={controlSentence}
          onClick={() => (isPlaying ? interrupt() : start())}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors hover:bg-accent",
            focusRing,
          )}
        >
          {/* Both marks share one box and cross-fade, so the control's width
              never jumps between playing and stopped. */}
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="currentColor"
            className="size-3.5 shrink-0 text-cobalt-bright"
          >
            <motion.path
              d="M5 3.4 12.4 8 5 12.6z"
              initial={false}
              animate={{ opacity: isPlaying ? 0 : 1 }}
              transition={fade}
            />
            <motion.path
              d="M4.6 3.4h2.4v9.2H4.6zM9 3.4h2.4v9.2H9z"
              initial={false}
              animate={{ opacity: isPlaying ? 1 : 0 }}
              transition={fade}
            />
          </svg>
          {/* Both words share one cell, so the control keeps one width and the
              readout beside it never shifts as the run starts and stops. */}
          <span aria-hidden className="grid">
            <motion.span
              className="col-start-1 row-start-1 text-center"
              initial={false}
              animate={{ opacity: isPlaying ? 0 : 1 }}
              transition={fade}
            >
              {label}
            </motion.span>
            <motion.span
              className="col-start-1 row-start-1 text-center"
              initial={false}
              animate={{ opacity: isPlaying ? 1 : 0 }}
              transition={fade}
            >
              Pause
            </motion.span>
          </span>
        </button>

        <span
          aria-hidden
          className="font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {progress.read} of {total}
        </span>
        {/* The pace already lives in the control's own name, so the readout
            beside it stays out of the accessibility tree. */}
        <span
          aria-hidden
          className="ml-auto shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {pace} wpm
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        <div
          role="progressbar"
          aria-label={`${label} progress`}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={progress.read}
          aria-valuetext={readingLine}
          className="relative w-1.5 shrink-0 overflow-clip rounded-full bg-hairline-strong [contain:paint]"
        >
          <motion.span
            aria-hidden
            className="absolute inset-x-0 top-0 rounded-full bg-cobalt-bright"
            initial={false}
            animate={{ height: `${percent}%` }}
            transition={glide}
          />
          {progress.ticks.slice(0, -1).map((tick, at) => (
            <span
              key={messages[at]?.id ?? at}
              aria-hidden
              className="absolute inset-x-0 h-px bg-surface-1"
              style={{ top: `${Number((tick * 100).toFixed(3))}%` }}
            />
          ))}
        </div>

        <div
          ref={boxRef}
          role="region"
          aria-label={label}
          tabIndex={0}
          style={{ maxHeight: Math.round(maxHeight) }}
          onKeyDown={onBoxKeyDown}
          onWheel={interrupt}
          onPointerDown={interrupt}
          className={cn(
            "relative min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-2 border border-hairline bg-surface-0 p-2",
            focusRing,
          )}
        >
          <ol ref={listRef} role="list" className="flex flex-col gap-2">
            {messages.map((message, at) => {
              const read = at < progress.read;
              return (
                <li key={message.id} className="flex flex-col gap-0.5">
                  {/* The state is spoken as one sentence rather than assembled
                      from the visible parts, which is what keeps a comma from
                      arriving with a stray space in front of it. */}
                  <span className="sr-only">{rowSentence(message, read)}</span>
                  <span
                    aria-hidden
                    className="flex items-center gap-1.5 text-[11px]"
                  >
                    <motion.span
                      className="min-w-0 truncate font-medium"
                      initial={false}
                      animate={{ opacity: read ? 0.55 : 1 }}
                      transition={fade}
                    >
                      {message.author}
                    </motion.span>
                    <span className="ml-auto shrink-0 font-mono text-ink-3 tabular-nums">
                      {message.time}
                    </span>
                  </span>
                  <motion.span
                    className="text-xs leading-snug wrap-break-word text-ink"
                    initial={false}
                    animate={{ opacity: read ? 0.55 : 1 }}
                    transition={fade}
                  >
                    {message.text}
                  </motion.span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </p>
    </div>
  );
}
