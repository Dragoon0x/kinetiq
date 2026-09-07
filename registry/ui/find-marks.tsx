"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FindMarksProps = {
  /** The body to search. */
  text: string;
  /** Controlled search term. */
  query?: string;
  /** Initial search term for uncontrolled usage. */
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Match case. @default false */
  caseSensitive?: boolean;
  /** Fires when the current match or the total changes. Memoise it. */
  onMatchChange?: (index: number, total: number) => void;
  /** Tallest the passage grows before it scrolls, in px. @default 260 */
  maxHeight?: number;
  /** Field label, used as the accessible name. @default "Find in passage" */
  label?: string;
  className?: string;
};

/** More marks than this and the sweep is noise, not information. */
const MATCH_CAP = 400;

function findRanges(text: string, query: string, caseSensitive: boolean) {
  const ranges: number[] = [];
  if (!query) return ranges;
  const hay = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let from = 0;
  while (ranges.length < MATCH_CAP) {
    const at = hay.indexOf(needle, from);
    if (at === -1) break;
    ranges.push(at);
    from = at + needle.length;
  }
  return ranges;
}

/** Digits roll one place at a time, so 9 → 10 reads as a count, not a redraw. */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="inline-flex tabular-nums">
      {String(value)
        .split("")
        .map((char, place) => (
          <motion.span
            key={`${place}-${char}`}
            className="inline-block"
            initial={motionSafe ? { y: -6, opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          >
            {char}
          </motion.span>
        ))}
    </span>
  );
}

const STEP =
  "flex size-9 shrink-0 items-center justify-center rounded-2 border border-input text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

/**
 * Find in text, with the finding visible. Every match takes a wash that sweeps
 * in from its left edge — scaleX on a layer behind the words, never on the
 * words themselves, so nothing distorts — in a `cascade` capped at the 600ms
 * budget, so twelve matches light in order and four hundred still finish.
 *
 * One ring marks the current match and travels to the next on `glide` through a
 * shared `layoutId`, which is the point of the whole component: the reader
 * follows a ring that moves rather than one that blinks somewhere else. The
 * passage scrolls itself, never the page, and the counter rolls a digit at a
 * time on `snap`.
 *
 * The field is a real searchbox: Enter steps forward, Shift+Enter steps back,
 * and the same steps sit beside it as buttons for a pointer. Under reduced
 * motion the marks appear and the ring cuts to its match — the count and the
 * highlight are information, so they never go away.
 */
export function FindMarks({
  text,
  query,
  defaultQuery = "",
  onQueryChange,
  caseSensitive = false,
  onMatchChange,
  maxHeight = 260,
  label = "Find in passage",
  className,
}: FindMarksProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const countId = `${baseId}-count`;
  const ringId = `${baseId}-ring`;

  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const term = query ?? ownQuery;

  const starts = React.useMemo(
    () => findRanges(text, term, caseSensitive),
    [text, term, caseSensitive],
  );
  const total = starts.length;

  // The cursor carries the query it was set against, so a new search starts at
  // the first match without an effect reaching in to reset it.
  const [cursor, setCursor] = React.useState({ term: "", index: 0 });
  const index =
    total === 0
      ? -1
      : cursor.term === term
        ? Math.min(cursor.index, total - 1)
        : 0;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const marks = React.useRef(new Map<number, HTMLElement>());

  // Scrolling the passage, not the document: `scrollIntoView` would drag the
  // whole page to a match that is already in the reader's view.
  React.useEffect(() => {
    const box = scrollRef.current;
    const mark = marks.current.get(index);
    if (!box || !mark) return;
    const top = mark.offsetTop;
    const bottom = top + mark.offsetHeight;
    const pad = 16;
    const behavior = motionSafe ? "smooth" : "auto";
    if (top < box.scrollTop + pad) {
      box.scrollTo({ top: Math.max(0, top - pad), behavior });
    } else if (bottom > box.scrollTop + box.clientHeight - pad) {
      box.scrollTo({ top: bottom - box.clientHeight + pad, behavior });
    }
  }, [index, term, motionSafe]);

  React.useEffect(() => {
    onMatchChange?.(index, total);
  }, [index, total, onMatchChange]);

  const setQuery = (next: string) => {
    if (query === undefined) setOwnQuery(next);
    onQueryChange?.(next);
  };

  const step = (delta: number) => {
    if (total === 0) return;
    setCursor({ term, index: (index + delta + total) % total });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  };

  const pieces: React.ReactNode[] = [];
  let at = 0;
  starts.forEach((start, position) => {
    if (start > at) pieces.push(text.slice(at, start));
    const end = start + term.length;
    const current = position === index;
    // The cascade is capped rather than trusted: past ~30 matches the interval
    // floor would run the sweep well past the choreography budget.
    const delay = Math.min(position * cascade(total), 0.6);
    pieces.push(
      <mark
        key={`${start}-${term.length}`}
        ref={(node) => {
          if (node) marks.current.set(position, node);
          else marks.current.delete(position);
        }}
        className="relative inline-block bg-transparent align-baseline text-foreground"
      >
        <motion.span
          aria-hidden
          className={cn(
            "absolute inset-0 origin-left rounded-1",
            current ? "bg-cobalt-wash" : "bg-warn/30",
          )}
          initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter, delay }
              : { duration: durations.fast }
          }
        />
        {current &&
          (motionSafe ? (
            <motion.span
              aria-hidden
              layoutId={ringId}
              transition={springs.glide}
              className="absolute -inset-0.5 rounded-1 border border-cobalt-bright"
            />
          ) : (
            <span
              aria-hidden
              className="absolute -inset-0.5 rounded-1 border border-cobalt-bright"
            />
          ))}
        <span className="relative">{text.slice(start, end)}</span>
      </mark>,
    );
    at = end;
  });
  if (at < text.length) pieces.push(text.slice(at));

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <div className="flex h-9 min-w-0 flex-1 items-center rounded-2 border border-input bg-surface-1 transition-colors focus-within:border-cobalt-bright focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <svg
            aria-hidden
            viewBox="0 0 16 16"
            className="mx-2.5 size-4 shrink-0 text-ink-3"
          >
            <circle
              cx="7"
              cy="7"
              r="4.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M10.2 10.2 13.5 13.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            value={term}
            aria-label={label}
            aria-describedby={countId}
            placeholder={label}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          <span
            id={countId}
            className="mr-2.5 ml-2 shrink-0 font-mono text-[11px] text-ink-3"
          >
            {total === 0 ? (
              term ? (
                "no matches"
              ) : (
                "—"
              )
            ) : (
              <>
                <Roll value={index + 1} motionSafe={motionSafe} /> of{" "}
                <Roll value={total} motionSafe={motionSafe} />
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          className={STEP}
          disabled={total === 0}
          onClick={() => step(-1)}
          aria-label="Previous match"
        >
          <Chevron up />
        </button>
        <button
          type="button"
          className={STEP}
          disabled={total === 0}
          onClick={() => step(1)}
          aria-label="Next match"
        >
          <Chevron />
        </button>
      </div>

      <div
        ref={scrollRef}
        style={{ maxHeight }}
        className="relative overflow-y-auto rounded-2 border border-hairline bg-surface-1 p-3"
      >
        {/* pre-wrap so a passage keeps its own paragraph breaks; it still
            wraps, so nothing runs past the column on a phone. */}
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-2">
          {pieces}
        </p>
      </div>

      <span role="status" className="sr-only">
        {total === 0
          ? term
            ? `No matches for ${term}`
            : ""
          : `Match ${index + 1} of ${total}`}
      </span>
    </div>
  );
}

function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("size-4", up && "rotate-180")}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
