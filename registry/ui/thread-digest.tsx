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

export type DigestThread = {
  id: string;
  name: string;
  /** The last line in the thread, already trimmed by the host. */
  preview?: string;
  /** How many messages arrived since you left. */
  unread: number;
  /** A monotonic rank from the host — higher is more recent. Never a clock. */
  activity: number;
  /** One number per bucket; every row should carry the same bucket count. */
  counts: number[];
};

export type ThreadDigestProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The threads. Sorted by `activity`; ties keep the array's order. */
  threads: DigestThread[];
  /** Names the buckets ("6 am", "7 am") for the row's spoken sentence. */
  bucketLabels?: string[];
  /** Fires from a row's press, and from Enter or Space on it. */
  onOpen?: (id: string) => void;
  /** Fires once per frozen change sentence. */
  onAnnounce?: (sentence: string) => void;
  /** Names the list for assistive technology. */
  label: string;
  /** The strip above the list. @default "While you were away" */
  heading?: string;
  /** Drawn when nothing moved. @default "Nothing moved" */
  emptyLabel?: string;
  /** How tall the list grows before it scrolls inside its own box. @default 280 */
  maxHeight?: number;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Sparkline geometry, in the column's own units. */
const BAR = 4;
const GAP = 2;
const CHART_H = 24;
const BASE = 23;
const TALLEST = 20;
/** What an empty bucket still draws, as a fraction of the tallest column. */
const STUB = 0.075;

const round3 = (value: number): number => Number(value.toFixed(3));

const newCount = (unread: number): string =>
  unread === 0
    ? "nothing new"
    : unread === 1
      ? "one new message"
      : `${unread} new messages`;

const busiestIndex = (counts: number[]): number => {
  let best = -1;
  let top = 0;
  counts.forEach((count, index) => {
    if (count > top) {
      top = count;
      best = index;
    }
  });
  return best;
};

const busiestLabel = (
  thread: DigestThread,
  bucketLabels: string[] | undefined,
): string | null => {
  if (!bucketLabels || thread.unread === 0) return null;
  const index = busiestIndex(thread.counts);
  if (index < 0) return null;
  return bucketLabels[index] ?? null;
};

/** One string per row, so no accessible name is spliced from two nodes. */
const rowSentence = (
  thread: DigestThread,
  bucketLabels: string[] | undefined,
): string => {
  const busiest = busiestLabel(thread, bucketLabels);
  const when = busiest === null ? "" : `, busiest around ${busiest}`;
  const last = thread.preview ? ` Last message: ${thread.preview}` : "";
  return `${thread.name}, ${newCount(thread.unread)}${when}.${last}`;
};

const movedSentence = (threads: DigestThread[]): string => {
  const moved = threads.filter((thread) => thread.unread > 0).length;
  const messages = threads.reduce((sum, thread) => sum + thread.unread, 0);
  if (moved === 0) return "Nothing moved";
  const first = moved === 1 ? "1 thread moved" : `${moved} threads moved`;
  return `${first}, ${messages === 1 ? "1 message" : `${messages} messages`}`;
};

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const signatureOf = (threads: DigestThread[]): string =>
  threads
    .map((one) => `${one.id}:${one.unread}:${one.counts.join(",")}`)
    .join("|");

const unreadMapOf = (threads: DigestThread[]): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const one of threads) map[one.id] = one.unread;
  return map;
};

/**
 * The shape of a thread's hour, drawn as columns rather than a line: a column
 * is a full-height bar scaled about its own foot, which is one rounded number a
 * spring can carry, where a polyline's `points` is a string motion can only
 * swap. `originY: 1` puts that foot on the baseline — only `origin*` keys
 * survive motion's transform-origin rewrite.
 */
function Sparkline({
  counts,
  active,
  motionSafe,
}: {
  counts: number[];
  active: boolean;
  motionSafe: boolean;
}) {
  const width = Math.max(BAR, counts.length * BAR + (counts.length - 1) * GAP);
  const top = Math.max(1, ...counts);
  const peak = busiestIndex(counts);
  return (
    <svg
      viewBox={`0 0 ${width} ${CHART_H}`}
      width={width}
      height={CHART_H}
      aria-hidden
      className="shrink-0"
    >
      {counts.map((count, index) => {
        // A bucket with nothing in it keeps a stub, so the row still reads as
        // six hours rather than as a gap.
        const ratio = round3(
          Math.max(STUB, (count / top) * (active ? 1 : 0.7)),
        );
        return (
          <motion.rect
            key={`bar-${index}`}
            x={index * (BAR + GAP)}
            y={BASE - TALLEST}
            width={BAR}
            height={TALLEST}
            style={{ originX: 0.5, originY: 1 }}
            initial={false}
            animate={{ scaleY: ratio }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            className={cn(
              "transition-colors",
              active && index === peak
                ? "fill-cobalt-bright"
                : active
                  ? "fill-cobalt-bright/40"
                  : "fill-ink-3/30",
            )}
          />
        );
      })}
    </svg>
  );
}

type RowProps = {
  thread: DigestThread;
  bucketLabels?: string[];
  rowId: string;
  tab: number;
  motionSafe: boolean;
  onOpen: () => void;
  onFocusRow: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

function DigestRow({
  thread,
  bucketLabels,
  rowId,
  tab,
  motionSafe,
  onOpen,
  onFocusRow,
  onKeyDown,
}: RowProps) {
  const active = thread.unread > 0;
  return (
    <motion.li
      // Position-only projection: the row's contents must not stretch while
      // the digest re-forms around it.
      layout={motionSafe ? "position" : false}
      initial={motionSafe ? { opacity: 0, x: distances.step } : { opacity: 0 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={motionSafe ? springs.glide : FADE}
    >
      <button
        type="button"
        id={rowId}
        tabIndex={tab}
        aria-label={rowSentence(thread, bucketLabels)}
        onFocus={onFocusRow}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-2 px-2.5 py-2 text-left transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex min-w-0 flex-1 flex-col transition-opacity",
            active ? "opacity-100" : "opacity-65",
          )}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-sm text-foreground",
                active ? "font-semibold" : "font-medium",
              )}
            >
              {thread.name}
            </span>
            {active ? (
              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-none font-medium text-primary-foreground tabular-nums">
                {thread.unread}
              </span>
            ) : null}
          </span>
          {thread.preview ? (
            <span className="truncate text-xs text-ink-3">
              {thread.preview}
            </span>
          ) : null}
        </span>

        <Sparkline
          counts={thread.counts}
          active={active}
          motionSafe={motionSafe}
        />
      </button>
    </motion.li>
  );
}

/**
 * What moved while you were away, ordered by what moved last. Each row carries
 * the thread's name, its last line, a count of what is new and a column
 * sparkline of when those messages actually landed — one column per bucket,
 * animated by its `y` and `height` rather than by a path, because those are two
 * rounded numbers a spring can carry. When a thread receives something its
 * newest column grows on `glide` and the row climbs, every row it passes
 * trading places on the same spring through position-only layout projection, so
 * the digest re-forms instead of jumping. The busiest column is tinted, which
 * is what makes the shape readable at six pixels of width.
 *
 * A thread with nothing new dims and keeps its sparkline, because quiet is not
 * the same as absent; the strip above holds the total and changes without a
 * flourish of its own, since the re-sort is the one motion idea here. Nothing
 * is sorted by a clock: `activity` is a rank the host raises.
 *
 * The list is an `<ol role="list">` of real buttons under a single-column
 * roving tabindex — Down and Up step, Home and End jump, Enter and Space open —
 * and each row's name is one whole sentence carrying the count, the busiest
 * hour and the preview, so the sparkline is decoration rather than the only
 * copy of the information. A status region says what changed as it changes,
 * frozen at the moment the threads differ. Under reduced motion no row travels:
 * the re-sort lands at once and the columns step to their new heights, because
 * what moved is the point.
 */
export function ThreadDigest({
  ref,
  threads,
  bucketLabels,
  onOpen,
  onAnnounce,
  label,
  heading = "While you were away",
  emptyLabel = "Nothing moved",
  maxHeight = 280,
  className,
}: ThreadDigestProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const rowId = (id: string) => `${uid}-row-${id}`;

  const sorted = React.useMemo(() => {
    const indexed = threads.map((thread, index) => ({ thread, index }));
    indexed.sort(
      (a, b) => b.thread.activity - a.thread.activity || a.index - b.index,
    );
    return indexed.map((entry) => entry.thread);
  }, [threads]);

  // The sentence is frozen the moment the threads differ, so it belongs to that
  // change and not to a later unrelated re-render.
  const signature = signatureOf(threads);
  const [beat, setBeat] = React.useState(() => ({
    signature,
    map: unreadMapOf(threads),
    sentence: "",
    stamp: 0,
  }));
  if (beat.signature !== signature) {
    const arrivals: DigestThread[] = [];
    let cleared: DigestThread | null = null;
    for (const thread of threads) {
      const before = beat.map[thread.id];
      if (before !== undefined && thread.unread > before) arrivals.push(thread);
      if (before !== undefined && before > 0 && thread.unread === 0) {
        cleared = thread;
      }
    }
    const first = arrivals[0];
    const sentence =
      arrivals.length === 1 && first
        ? `New in ${first.name}. ${first.unread === 1 ? "One new message" : `${first.unread} new messages`}.`
        : arrivals.length > 1
          ? `${arrivals.length} threads have new messages.`
          : cleared
            ? `${cleared.name} is read.`
            : beat.sentence;
    setBeat({
      signature,
      map: unreadMapOf(threads),
      sentence,
      stamp: beat.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  const firstBeat = React.useRef(true);
  React.useEffect(() => {
    if (firstBeat.current) {
      firstBeat.current = false;
      return;
    }
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  // The roving index follows the row's identity, not its position, so a row
  // that climbs while it holds focus keeps it.
  const [active, setActive] = React.useState<string | null>(null);
  const focusedId = active ?? sorted[0]?.id ?? "";
  const activeIndex = Math.max(
    0,
    sorted.findIndex((thread) => thread.id === focusedId),
  );

  const focusAt = (index: number) => {
    const clamped = Math.min(sorted.length - 1, Math.max(0, index));
    const thread = sorted[clamped];
    if (!thread) return;
    setActive(thread.id);
    document.getElementById(rowId(thread.id))?.focus();
  };

  const keyHandler =
    (index: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusAt(index + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        focusAt(index - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusAt(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusAt(sorted.length - 1);
      }
    };

  const total = movedSentence(threads);

  return (
    <div
      ref={ref}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div className="flex items-baseline gap-2 px-1.5 pb-2">
        <span className="min-w-0 truncate text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase">
          {heading}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-2 tabular-nums">
          {total}
        </span>
      </div>

      <div
        className="overflow-y-auto overscroll-contain"
        style={{ maxHeight: Math.round(maxHeight) }}
      >
        <ol role="list" aria-label={label} className="flex flex-col gap-0.5">
          <AnimatePresence initial={false}>
            {sorted.map((thread, index) => (
              <DigestRow
                key={thread.id}
                thread={thread}
                bucketLabels={bucketLabels}
                rowId={rowId(thread.id)}
                tab={index === activeIndex ? 0 : -1}
                motionSafe={motionSafe}
                onOpen={() => onOpen?.(thread.id)}
                onFocusRow={() => setActive(thread.id)}
                onKeyDown={keyHandler(index)}
              />
            ))}
          </AnimatePresence>
        </ol>

        {sorted.length === 0 ? (
          <p className="px-2.5 py-3 text-sm text-ink-3">{emptyLabel}</p>
        ) : null}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
