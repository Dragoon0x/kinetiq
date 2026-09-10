"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ContextMatch = {
  id: string;
  /** The matched line's number in the file. */
  line: number;
  text: string;
  /** Lines above the match, in file order; the last one is its neighbour. */
  before: string[];
  /** Lines below the match, in file order. */
  after: string[];
};

export type ContextLinesProps = {
  ref?: React.Ref<HTMLOListElement>;
  /** The search results, each carrying its own neighbourhood. */
  matches: ContextMatch[];
  /** Controlled ids of the opened matches. */
  openIds?: string[];
  /** Initial opened matches for uncontrolled usage. */
  defaultOpenIds?: string[];
  /** Fires from the press that opened or folded a match. */
  onOpenChange?: (ids: string[]) => void;
  /** Controlled number of lines shown on each side. */
  context?: number;
  /** Initial context for uncontrolled usage. @default 2 */
  defaultContext?: number;
  /** Fires from the step that changed the count. */
  onContextChange?: (context: number) => void;
  /** The stepper's ceiling; the supplied arrays cap it further. @default 4 */
  maxContext?: number;
  /** The matched term, marked inside each row. */
  query: string;
  /** Names the list of matches. @default "Matches" */
  label?: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** Splits a line around the query so the hit can be marked without a regex. */
function markParts(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  if (query === "") return [{ text, hit: false }];
  const needle = query.toLowerCase();
  const hay = text.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  let found = hay.indexOf(needle, cursor);
  while (found >= 0) {
    if (found > cursor) {
      parts.push({ text: text.slice(cursor, found), hit: false });
    }
    parts.push({ text: text.slice(found, found + query.length), hit: true });
    cursor = found + query.length;
    found = hay.indexOf(needle, cursor);
  }
  if (cursor < text.length)
    parts.push({ text: text.slice(cursor), hit: false });
  return parts;
}

/** The context count, rolling on `snap` — one crisp overshoot, like any indicator. */
function ContextDigit({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const digit = Math.min(9, Math.max(0, Math.round(value)));
  return (
    <span
      aria-hidden
      className="relative inline-block h-[1.2em] w-[1ch] overflow-clip align-middle [contain:paint]"
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
}

function ContextRow({
  number,
  text,
  query,
  tone,
}: {
  number: number;
  text: string;
  query: string;
  tone: string;
}) {
  return (
    <>
      <span className="w-8 shrink-0 text-right font-mono text-[10px] text-ink-3 tabular-nums">
        {number}
      </span>
      <span
        title={text}
        className={cn("min-w-0 flex-1 truncate font-mono text-[11px]", tone)}
      >
        {markParts(text, query).map((part, index) =>
          part.hit ? (
            <mark
              key={index}
              className="rounded-1 bg-cobalt-wash px-0.5 text-ink"
            >
              {part.text}
            </mark>
          ) : (
            <React.Fragment key={index}>{part.text}</React.Fragment>
          ),
        )}
      </span>
    </>
  );
}

type SideProps = {
  id: string;
  lines: { number: number; text: string }[];
  open: boolean;
  motionSafe: boolean;
  /** Before lines hang from the bottom so trimming clips the far end, not the near one. */
  anchor: "top" | "bottom";
  delayOf: (index: number) => number;
};

function ContextSide({
  id,
  lines,
  open,
  motionSafe,
  anchor,
  delayOf,
}: SideProps) {
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setHeight(Math.round(entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const travel = anchor === "bottom" ? -distances.nudge : distances.nudge;

  return (
    <motion.div
      id={id}
      aria-hidden={!open}
      className="relative overflow-clip [contain:paint]"
      initial={false}
      animate={{ height: open ? height : 0 }}
      transition={
        motionSafe
          ? springs.glide
          : { duration: durations.base, ease: easings.enter }
      }
    >
      <ol
        ref={listRef}
        role="list"
        className={cn(
          "flex flex-col",
          anchor === "bottom" ? "absolute inset-x-0 bottom-0" : "",
        )}
      >
        <AnimatePresence initial={false}>
          {lines.map((line, index) => (
            <motion.li
              key={line.number}
              className="flex items-center gap-2 px-2 py-0.5"
              initial={{ opacity: 0, y: motionSafe ? travel : 0 }}
              animate={{
                opacity: open ? 1 : 0,
                y: open || !motionSafe ? 0 : travel,
              }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.glide, delay: open ? delayOf(index) : 0 }
                  : { duration: durations.base, ease: easings.enter }
              }
            >
              <ContextRow
                number={line.number}
                text={line.text}
                query=""
                tone="text-ink-2"
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </motion.div>
  );
}

/**
 * The lines around it. Each result prints as one row with its line number in a
 * mono gutter and the term marked inside the text; pressing it opens the
 * neighbourhood. A ResizeObserver measures each side and the two wrappers glide
 * to their own heights on `glide`, so nothing reserves room for lines that are
 * not there. The lines cascade outward from the match — nearest neighbour first
 * on both sides, `cascade()` keeping the reveal inside the budget — the ones
 * above arriving from overhead and the ones below from under, so the block
 * reads as unfolding rather than as two lists appearing.
 *
 * The stepper sets how many lines each side shows: stepping it grows or trims
 * both wrappers on the same `glide` while the count rolls on `snap`, and the
 * before block hangs from its bottom edge so trimming takes the far lines
 * rather than the neighbours. Folding runs the exit ease, because exits never
 * spring. Matches are an `<ol role="list">` of `<li>`, each side its own list,
 * and the stepper is a `role="spinbutton"`: Arrow Up and Right add a line,
 * Arrow Down and Left take one, Home goes to none, End to the ceiling. Under
 * reduced motion heights change on tweens and lines arrive on opacity alone.
 */
export function ContextLines({
  ref,
  matches,
  openIds,
  defaultOpenIds,
  onOpenChange,
  context,
  defaultContext = 2,
  onContextChange,
  maxContext = 4,
  query,
  label = "Matches",
  className,
}: ContextLinesProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState<string[]>(
    defaultOpenIds ?? [],
  );
  const isOpenControlled = openIds !== undefined;
  const open = isOpenControlled ? openIds : uncontrolledOpen;

  const [uncontrolledContext, setUncontrolledContext] =
    React.useState(defaultContext);
  const isContextControlled = context !== undefined;
  const ceiling = Math.max(0, maxContext);
  const shown = Math.min(
    ceiling,
    Math.max(0, isContextControlled ? context : uncontrolledContext),
  );

  const [announcement, setAnnouncement] = React.useState("");

  const toggle = (match: ContextMatch) => {
    const isOpen = !open.includes(match.id);
    const next = isOpen
      ? [...open, match.id]
      : open.filter((entry) => entry !== match.id);
    if (!isOpenControlled) setUncontrolledOpen(next);
    const around =
      Math.min(shown, match.before.length) +
      Math.min(shown, match.after.length);
    // Frozen here, from the press: a controlled host answers when it answers,
    // and an effect watching the derived list could never fire under one.
    setAnnouncement(
      isOpen
        ? around === 0
          ? `Match at line ${match.line} open, no context lines shown.`
          : `Match at line ${match.line} open, ${plural(around, "line", "lines")} of context.`
        : `Match at line ${match.line} folded.`,
    );
    onOpenChange?.(next);
  };

  const stepContext = (next: number) => {
    const clamped = Math.min(ceiling, Math.max(0, next));
    if (clamped === shown) return;
    if (!isContextControlled) setUncontrolledContext(clamped);
    setAnnouncement(
      clamped === 0
        ? "Context off, matches only."
        : `Context set to ${plural(clamped, "line", "lines")} either side.`,
    );
    onContextChange?.(clamped);
  };

  const handleStepperKeys = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "ArrowUp" || event.key === "ArrowRight") {
      event.preventDefault();
      stepContext(shown + 1);
    } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
      event.preventDefault();
      stepContext(shown - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      stepContext(0);
    } else if (event.key === "End") {
      event.preventDefault();
      stepContext(ceiling);
    }
  };

  const stepButton =
    "flex size-6 shrink-0 items-center justify-center rounded-1 font-mono text-xs text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {label} · {plural(matches.length, "hit", "hits")}
        </p>
        <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-2 border border-hairline-strong px-1">
          <button
            type="button"
            aria-label="Fewer context lines"
            disabled={shown <= 0}
            onClick={() => stepContext(shown - 1)}
            className={stepButton}
          >
            <span aria-hidden>−</span>
          </button>
          <span
            role="spinbutton"
            tabIndex={0}
            aria-label="Context lines"
            aria-valuenow={shown}
            aria-valuemin={0}
            aria-valuemax={ceiling}
            aria-valuetext={`${plural(shown, "line", "lines")} either side`}
            onKeyDown={handleStepperKeys}
            className="flex h-6 items-center rounded-1 px-1 font-mono text-[11px] font-medium text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span aria-hidden className="text-ink-3">
              ±
            </span>
            <ContextDigit value={shown} motionSafe={motionSafe} />
          </span>
          <button
            type="button"
            aria-label="More context lines"
            disabled={shown >= ceiling}
            onClick={() => stepContext(shown + 1)}
            className={stepButton}
          >
            <span aria-hidden>+</span>
          </button>
        </div>
      </div>

      <ol
        ref={ref}
        role="list"
        aria-label={label}
        className="flex flex-col gap-2"
      >
        {matches.map((match) => {
          const isOpen = open.includes(match.id);
          const beforeId = `${baseId}-before-${match.id}`;
          const afterId = `${baseId}-after-${match.id}`;
          const beforeLines = match.before
            .slice(Math.max(0, match.before.length - shown))
            .map((text, index) => ({
              number: match.line - Math.min(shown, match.before.length) + index,
              text,
            }));
          const afterLines = match.after.slice(0, shown).map((text, index) => ({
            number: match.line + index + 1,
            text,
          }));
          const around = beforeLines.length + afterLines.length;
          const stagger = cascade(Math.max(2, around));
          const sides =
            around === 0
              ? "No context lines to show."
              : `${isOpen ? "Hide" : "Show"} ${plural(around, "line", "lines")} of context.`;

          return (
            <li
              key={match.id}
              className="overflow-clip rounded-3 border border-hairline bg-surface-1 [contain:paint]"
            >
              <ContextSide
                id={beforeId}
                lines={beforeLines}
                open={isOpen}
                motionSafe={motionSafe}
                anchor="bottom"
                delayOf={(index) => (beforeLines.length - 1 - index) * stagger}
              />

              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`${beforeId} ${afterId}`}
                aria-label={`Line ${match.line}, ${match.text}. ${sides}`}
                onClick={() => toggle(match)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1 text-left transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  isOpen && "bg-surface-2",
                )}
              >
                <ContextRow
                  number={match.line}
                  text={match.text}
                  query={query}
                  tone="text-ink"
                />
              </button>

              <ContextSide
                id={afterId}
                lines={afterLines}
                open={isOpen}
                motionSafe={motionSafe}
                anchor="top"
                delayOf={(index) => index * stagger}
              />
            </li>
          );
        })}
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
