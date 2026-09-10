"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SearchMessage = {
  id: string;
  author: string;
  text: string;
  /** Sent time, already formatted by the host. */
  time: string;
  /** Puts the bubble on the right, as the reader's own. */
  own?: boolean;
};

export type SearchInlineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: SearchMessage[];
  /** Controlled search term. */
  query?: string;
  /** Initial term for uncontrolled usage. @default "" */
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Fires when the current match or the total changes; `index` is 1-based, 0 for none. */
  onMatchChange?: (index: number, total: number) => void;
  /** Fires once per frozen change sentence ("Match 3 of 7, from Rui Baptista."). */
  onAnnounce?: (sentence: string) => void;
  /** Match case. @default false */
  caseSensitive?: boolean;
  /** Names the field. @default "Find in thread" */
  label?: string;
  /** @default "Find in thread" */
  placeholder?: string;
  /** Names the thread for assistive technology. */
  threadLabel: string;
  /** Tallest the thread grows before it scrolls inside its own box. @default 260 */
  maxHeight?: number;
  className?: string;
};

/** Past this the sweep is noise rather than information. */
const MATCH_CAP = 200;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/**
 * Digits roll one place at a time, so 9 → 10 reads as a count and not a redraw.
 * Each place owns an `AnimatePresence`, whose `initial={false}` holds the roll
 * back on first paint and hands every later digit a fresh presence context.
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

type Hit = { message: number; start: number };

/** Keeps a callback out of effect dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const STEP =
  "grid size-8 shrink-0 place-items-center rounded-2 border border-input text-ink-2 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40";

/** The two steps share one shell, so they share one height and one focus ring. */
function StepButton({
  label,
  d,
  disabled,
  onPress,
}: {
  label: string;
  d: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      className={STEP}
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
        <path d={d} />
      </svg>
    </button>
  );
}

/**
 * Find in the thread, without leaving it. Typing marks every occurrence with a
 * wash that sweeps in from its left edge — `scaleX` on a layer behind the words,
 * never on the words themselves, so nothing distorts — staggered by
 * `cascade(total)` and capped at the 600ms budget, so the highlight runs down
 * the thread however many it finds. Messages with no match recede to a quieter
 * ink on a tween, which is what makes the hits read as a set rather than as
 * scattered colour.
 *
 * One match is current: it deepens to the primary wash on a colour tween and
 * the scroll box slides to bring it into view, `scrollTop` animated imperatively on `glide` and
 * rounded before each frame reaches the node. Enter steps forward, Shift+Enter
 * back, Escape clears the term and keeps focus in the field, and the `3 / 7`
 * readout rolls a digit at a time so a step reads as a count. The field is a
 * real `<input type="search">`, the steps are real buttons that disable when
 * there is nothing to step to, and a polite region speaks one frozen sentence
 * per change. Under reduced motion nothing sweeps or slides: marks appear at
 * full wash and the step lands in one move, but the count still changes and the
 * unmatched still recede, because both are information.
 */
export function SearchInline({
  ref,
  messages,
  query,
  defaultQuery,
  onQueryChange,
  onMatchChange,
  onAnnounce,
  caseSensitive = false,
  label = "Find in thread",
  placeholder = "Find in thread",
  threadLabel,
  maxHeight = 260,
  className,
}: SearchInlineProps) {
  const motionSafe = useMotionSafe();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const fieldRef = React.useRef<HTMLInputElement | null>(null);
  const markRefs = React.useRef(new Map<number, HTMLElement>());
  const controlsRef = React.useRef<{ stop: () => void } | null>(null);

  const [uncontrolled, setUncontrolled] = React.useState(defaultQuery ?? "");
  const term = query ?? uncontrolled;

  const hits = React.useMemo(() => {
    const list: Hit[] = [];
    const needle = caseSensitive ? term : term.toLowerCase();
    if (!needle) return list;
    messages.forEach((message, index) => {
      const hay = caseSensitive ? message.text : message.text.toLowerCase();
      let from = 0;
      while (list.length < MATCH_CAP) {
        const at = hay.indexOf(needle, from);
        if (at === -1) break;
        list.push({ message: index, start: at });
        from = at + needle.length;
      }
    });
    return list;
  }, [messages, term, caseSensitive]);

  const total = hits.length;

  // The reading is frozen the moment the term or the position changes, so the
  // region never re-reads a match the reader has already stepped past.
  const [beat, setBeat] = React.useState(() => ({
    term,
    index: 0,
    sentence: "",
    stamp: 0,
  }));
  const index = total === 0 ? 0 : Math.min(beat.index, total - 1);

  const describe = React.useCallback(
    (at: number, count: number, text: string): string => {
      if (!text) return "Search cleared.";
      if (count === 0) return `No matches for ${text}.`;
      const hit = hits[at];
      const message = hit ? messages[hit.message] : undefined;
      return message
        ? `Match ${at + 1} of ${count}, from ${message.author}.`
        : `Match ${at + 1} of ${count}.`;
    },
    [hits, messages],
  );

  if (beat.term !== term) {
    // A new term restarts at the first match rather than keeping a position
    // that belonged to a different set.
    setBeat({
      term,
      index: 0,
      sentence: describe(0, total, term),
      stamp: beat.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  const matchRef = useLatest(onMatchChange);
  const firstRun = React.useRef(true);
  React.useEffect(() => {
    matchRef.current?.(total === 0 ? 0 : index + 1, total);
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, index, total, announceRef, matchRef]);

  const slideTo = React.useCallback(
    (target: number) => {
      const node = boxRef.current;
      if (!node) return;
      controlsRef.current?.stop();
      controlsRef.current = null;
      const to = Math.max(0, Math.round(target));
      if (!motionSafe) {
        node.scrollTop = to;
        return;
      }
      controlsRef.current = animate(node.scrollTop, to, {
        ...springs.glide,
        // Rounded before it reaches the node: a scroll offset is a layout
        // value, and a raw float only costs a repaint.
        onUpdate: (value) => {
          node.scrollTop = Math.round(value);
        },
      });
    },
    [motionSafe],
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

  // The current mark is brought into view from an effect, never from render:
  // the node it measures does not exist until the paint that follows the step.
  const firstScroll = React.useRef(true);
  React.useEffect(() => {
    if (firstScroll.current) {
      firstScroll.current = false;
      return;
    }
    const box = boxRef.current;
    const mark = markRefs.current.get(index);
    if (!box || !mark || total === 0) return;
    const boxBox = box.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    slideTo(
      box.scrollTop +
        (markBox.top - boxBox.top) -
        (boxBox.height - markBox.height) / 2,
    );
  }, [index, total, beat.stamp, slideTo]);

  const setTerm = (next: string) => {
    if (query === undefined) setUncontrolled(next);
    onQueryChange?.(next);
  };

  const step = (delta: number) => {
    if (total === 0) return;
    const next = (((index + delta) % total) + total) % total;
    setBeat({
      term,
      index: next,
      sentence: describe(next, total, term),
      stamp: beat.stamp + 1,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape" && term) {
      event.preventDefault();
      setTerm("");
      fieldRef.current?.focus();
    }
  };

  const marked = (message: SearchMessage, messageIndex: number) => {
    const pieces: React.ReactNode[] = [];
    let at = 0;
    hits.forEach((hit, position) => {
      if (hit.message !== messageIndex) return;
      if (hit.start > at) pieces.push(message.text.slice(at, hit.start));
      const end = hit.start + term.length;
      const current = position === index;
      // The cascade is capped rather than trusted: past ~30 matches the
      // interval floor would run the sweep well past the choreography budget.
      const delay = Number(Math.min(position * cascade(total), 0.6).toFixed(3));
      pieces.push(
        <mark
          // Keyed by the term as well as the place, so a changed term remounts
          // every mark and the sweep runs down the thread again.
          key={`${term}-${messageIndex}-${hit.start}`}
          ref={(node) => {
            if (node) markRefs.current.set(position, node);
            else markRefs.current.delete(position);
          }}
          aria-current={current ? "true" : undefined}
          className={cn(
            "relative inline-block bg-transparent align-baseline transition-colors",
            current ? "text-primary-foreground" : "text-foreground",
          )}
        >
          <motion.span
            aria-hidden
            // Colour is a tween, never a spring: the current match deepens
            // rather than jumping as the step moves through the thread.
            className={cn(
              "absolute inset-0 origin-left rounded-1 transition-colors",
              current ? "bg-primary" : "bg-cobalt-wash",
            )}
            initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter, delay }
                : { duration: durations.fast }
            }
          />
          <span className="relative">{message.text.slice(hit.start, end)}</span>
        </mark>,
      );
      at = end;
    });
    if (at < message.text.length) pieces.push(message.text.slice(at));
    return pieces.length === 0 ? message.text : pieces;
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <input
          ref={fieldRef}
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label={label}
          placeholder={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          className={cn(
            "h-8 min-w-0 flex-1 rounded-2 border border-input bg-surface-0 px-2.5 text-sm text-foreground placeholder:text-ink-3",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        />
        <span
          aria-hidden
          className="flex shrink-0 items-center gap-0.5 font-mono text-[11px] text-ink-3"
        >
          <Roll value={total === 0 ? 0 : index + 1} motionSafe={motionSafe} />
          <span>/</span>
          <Roll value={total} motionSafe={motionSafe} />
        </span>
        <StepButton
          label="Previous match"
          d="M4.5 10 8 6.5 11.5 10"
          disabled={total === 0}
          onPress={() => step(-1)}
        />
        <StepButton
          label="Next match"
          d="M4.5 6.5 8 10l3.5-3.5"
          disabled={total === 0}
          onPress={() => step(1)}
        />
      </div>

      <div
        ref={boxRef}
        role="region"
        aria-label={threadLabel}
        tabIndex={0}
        style={{ maxHeight: Math.round(maxHeight) }}
        className={cn(
          "overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 p-3 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <ol role="list" className="flex flex-col gap-3">
          {messages.map((message, messageIndex) => {
            const hasHit = hits.some((hit) => hit.message === messageIndex);
            return (
              <motion.li
                key={message.id}
                // Receding is a state, not a flourish, so it still happens
                // under reduced motion — only the spring goes.
                animate={{ opacity: term && !hasHit ? 0.45 : 1 }}
                transition={FADE}
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
                  <span className="font-medium text-ink-2">
                    {message.author}
                  </span>
                  <span className="tabular-nums">{message.time}</span>
                </span>
                {/* Both sides take the same ground: a filled own-bubble would
                    fight the primary wash the current match wears. */}
                <span
                  className={cn(
                    "max-w-[86%] rounded-3 bg-surface-2 px-3 py-2 text-sm leading-snug wrap-break-word text-foreground",
                    message.own ? "rounded-br-1" : "rounded-bl-1",
                  )}
                >
                  {marked(message, messageIndex)}
                </span>
              </motion.li>
            );
          })}
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
