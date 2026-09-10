"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FilterLevel = "debug" | "info" | "warn" | "error";

export type LevelLine = {
  id: string;
  level: FilterLevel;
  /** The service that wrote the line, e.g. "ledger-api". */
  service: string;
  /** Already formatted by the host — the component never reads a clock. */
  time: string;
  text: string;
};

export type LevelFilterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The buffer, oldest first. Cap it in the host; nothing here virtualises. */
  lines: LevelLine[];
  /** Controlled set of shown levels. */
  levels?: FilterLevel[];
  /** Initial set for uncontrolled usage. @default all four */
  defaultLevels?: FilterLevel[];
  /** Fires from a chip press with the new set, in level order. */
  onLevelsChange?: (levels: FilterLevel[]) => void;
  /** The sentence the polite region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** Scroll ceiling for the list box, in px. @default 216 */
  maxHeight?: number;
  /** Names the toolbar ("<label> levels") and the list ("<label> lines"). @default "Log" */
  label?: string;
  className?: string;
};

const ORDER: FilterLevel[] = ["debug", "info", "warn", "error"];

const TONES: Record<
  FilterLevel,
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

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** "debug", "debug and warn", "debug, warn and error" — one string, no splices. */
const joinWords = (words: string[]): string =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

const sentenceCase = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1);

type Slot =
  | { kind: "line"; key: string; line: LevelLine }
  | { kind: "gap"; key: string; total: number; sentence: string };

/**
 * A count whose digits roll a place at a time on `snap`, so 9 → 10 reads as the
 * same number moving rather than a new one blinking. The column is ten digits
 * tall, so a `y` of a tenth of its own height moves exactly one digit. It is
 * hidden from assistive technology because the chip already carries the count
 * in its own name.
 */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(value);
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = Math.max(
          0,
          DIGITS.indexOf(char as (typeof DIGITS)[number]),
        );
        // Keyed from the right, so the units column keeps its identity when the
        // number gains a place and only the new column mounts.
        return (
          <span
            key={text.length - index}
            className="relative inline-block h-[1.2em] w-[1ch] overflow-clip [contain:paint]"
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

/** One line, spoken as a single sentence so the rail's colour is never the only
 *  carrier of the level; `layout` is what moves it when a level is filtered. */
function FilterRow({
  line,
  motionSafe,
}: {
  line: LevelLine;
  motionSafe: boolean;
}) {
  const tone = TONES[line.level];
  return (
    <motion.li
      layout={motionSafe ? "position" : false}
      className="flex gap-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? springs.glide
          : { duration: durations.fast, ease: easings.enter }
      }
    >
      <span
        aria-hidden
        className={cn("w-[3px] shrink-0 self-stretch rounded-full", tone.rail)}
      />
      <span className="min-w-0 flex-1">
        <span className="sr-only">
          {`${tone.word}, ${line.service}, ${line.time}. ${line.text}`}
        </span>
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

/** The rule that opens where lines were removed. Its hairlines grow outward
 *  from the centre, so the gap reads as the list opening rather than a rule
 *  sliding in from one side. */
function GapRule({
  total,
  sentence,
  motionSafe,
}: {
  total: number;
  sentence: string;
  motionSafe: boolean;
}) {
  const snap = motionSafe
    ? springs.snap
    : { duration: durations.fast, ease: easings.enter };
  return (
    <motion.li
      layout={motionSafe ? "position" : false}
      className="flex items-center gap-2 py-0.5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={snap}
    >
      <span className="sr-only">{sentence}</span>
      <motion.span
        aria-hidden
        className="h-px flex-1 origin-right bg-hairline-strong"
        initial={motionSafe ? { scaleX: 0 } : false}
        animate={{ scaleX: 1 }}
        transition={snap}
      />
      <span
        aria-hidden
        className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {countPhrase(total, "line")} hidden
      </span>
      <motion.span
        aria-hidden
        className="h-px flex-1 origin-left bg-hairline-strong"
        initial={motionSafe ? { scaleX: 0 } : false}
        animate={{ scaleX: 1 }}
        transition={snap}
      />
    </motion.li>
  );
}

/**
 * Four chips and the lines they let through. Turn a level off and its lines
 * leave on `exitFor()` while everything below travels up under `layout` on
 * `glide` — a FLIP, because the list is not repainting, it is moving — and the
 * box's own height glides to a measured content height rather than snapping.
 * Each chip's count rolls a digit at a time on `snap`.
 *
 * Where a run of lines has been hidden, a rule opens in the gap and says what
 * is missing — "6 lines hidden here: 4 debug and 2 info." — its hairlines
 * growing outward from the centre, because a filtered list that closes over its
 * own gaps is a list that lies about being complete.
 *
 * The chips are a toolbar with one roving tabindex: Left and Right step without
 * wrapping past the ends, Home and End jump, Space and Enter toggle. Every
 * change is reported from the press that caused it, and the spoken sentence is
 * frozen from the settled set, so a controlled host is never announced ahead of
 * its answer. Under reduced motion nothing FLIPs and no digit rolls, but the
 * counts, the gaps and the list all still change — what is missing is
 * information, not flourish.
 */
export function LevelFilter({
  ref,
  lines,
  levels,
  defaultLevels,
  onLevelsChange,
  onAnnounce,
  maxHeight = 216,
  label = "Log",
  className,
}: LevelFilterProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const [own, setOwn] = React.useState<FilterLevel[]>(defaultLevels ?? ORDER);
  const shown = levels ?? own;
  const [focusAt, setFocusAt] = React.useState(0);
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);

  const isOn = (level: FilterLevel) => shown.includes(level);

  const counts = React.useMemo(() => {
    const tally: Record<FilterLevel, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };
    for (const line of lines) tally[line.level] += 1;
    return tally;
  }, [lines]);

  // The slots are the rendered list: every shown line, and one rule per run of
  // hidden lines, keyed by the first line of that run so no two siblings ever
  // share a key.
  const slots = React.useMemo<Slot[]>(() => {
    const out: Slot[] = [];
    let run: LevelLine[] = [];
    const flush = () => {
      const head = run[0];
      if (!head) return;
      const tally = ORDER.map((level) => ({
        level,
        count: run.filter((line) => line.level === level).length,
      })).filter((part) => part.count > 0);
      out.push({
        kind: "gap",
        key: `gap-${head.id}`,
        total: run.length,
        sentence: `${countPhrase(run.length, "line")} hidden here: ${joinWords(
          tally.map(
            (part) => `${part.count} ${TONES[part.level].word.toLowerCase()}`,
          ),
        )}.`,
      });
      run = [];
    };
    for (const line of lines) {
      if (shown.includes(line.level)) {
        flush();
        out.push({ kind: "line", key: line.id, line });
      } else {
        run.push(line);
      }
    }
    flush();
    return out;
  }, [lines, shown]);

  const visible = slots.filter((slot) => slot.kind === "line").length;

  const hiddenWords = ORDER.filter((level) => !isOn(level)).map((level) =>
    TONES[level].word.toLowerCase(),
  );
  const summary =
    hiddenWords.length === 0
      ? `All ${countPhrase(lines.length, "line")} shown.`
      : visible === 0
        ? "No lines shown. Every level is hidden."
        : `${visible} of ${countPhrase(lines.length, "line")} shown. ${sentenceCase(joinWords(hiddenWords))} hidden.`;

  // The sentence is frozen from the settled set during the render that carries
  // it, so the region speaks the new reading and never the one it replaced.
  const key = shown.join(",");
  const [spoken, setSpoken] = React.useState({ key, sentence: "", stamp: 0 });
  if (spoken.key !== key) {
    setSpoken({ key, sentence: summary, stamp: spoken.stamp + 1 });
  }

  const announceRef = React.useRef(onAnnounce);
  React.useEffect(() => {
    announceRef.current = onAnnounce;
  });
  React.useEffect(() => {
    if (spoken.sentence) announceRef.current?.(spoken.sentence);
  }, [spoken.stamp, spoken.sentence]);

  React.useEffect(() => {
    if (!inner || typeof ResizeObserver === "undefined") return;
    // The observer also delivers the first measurement, which is why nothing
    // sets state in the effect body itself.
    const observer = new ResizeObserver(() => {
      setContentHeight(Math.round(inner.getBoundingClientRect().height));
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [inner]);

  const toggle = (level: FilterLevel) => {
    const next = isOn(level)
      ? shown.filter((one) => one !== level)
      : ORDER.filter((one) => one === level || shown.includes(one));
    if (levels === undefined) setOwn(next);
    onLevelsChange?.(next);
  };

  const moveFocus = (index: number) => {
    const clamped = Math.min(ORDER.length - 1, Math.max(0, index));
    const level = ORDER[clamped];
    if (!level) return;
    setFocusAt(clamped);
    document.getElementById(`${baseId}-chip-${level}`)?.focus();
  };

  const onChipKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(ORDER.length - 1);
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const glide = motionSafe ? springs.glide : { duration: 0 };
  const height =
    contentHeight > 0
      ? Math.min(Math.round(maxHeight), contentHeight)
      : undefined;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label={`${label} levels`}
        className="flex flex-wrap gap-1.5"
      >
        {ORDER.map((level, index) => {
          const on = isOn(level);
          const tone = TONES[level];
          return (
            <button
              key={level}
              type="button"
              id={`${baseId}-chip-${level}`}
              aria-pressed={on}
              aria-label={`${tone.word}, ${countPhrase(counts[level], "line")}, ${on ? "shown" : "hidden"}.`}
              tabIndex={index === focusAt ? 0 : -1}
              onFocus={() => setFocusAt(index)}
              onClick={() => toggle(level)}
              onKeyDown={(event) => onChipKeyDown(event, index)}
              className={cn(
                "relative flex h-7 items-center gap-1.5 rounded-2 border px-2 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                on
                  ? "border-hairline-strong text-ink"
                  : "border-hairline text-ink-3 hover:text-ink-2",
                focusRing,
              )}
            >
              {/* The wash fades rather than sliding: a chip is a state, and the
                  motion that matters here belongs to the list underneath. */}
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-2 bg-accent"
                initial={false}
                animate={{ opacity: on ? 1 : 0 }}
                transition={fade}
              />
              <span
                aria-hidden
                className={cn(
                  "relative size-1.5 shrink-0 rounded-full transition-opacity",
                  tone.rail,
                  on ? "opacity-100" : "opacity-40",
                )}
              />
              <span aria-hidden className={cn("relative", on && tone.text)}>
                {tone.tag}
              </span>
              <span className="relative text-ink-3">
                <RollingCount value={counts[level]} motionSafe={motionSafe} />
              </span>
            </button>
          );
        })}
      </div>

      <motion.div
        role="region"
        aria-label={`${label} lines`}
        tabIndex={0}
        style={{ maxHeight: Math.round(maxHeight) }}
        className={cn(
          "overflow-x-clip overflow-y-auto overscroll-contain rounded-2 border border-hairline bg-surface-0",
          focusRing,
        )}
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={glide}
      >
        <div ref={setInner} className="p-1.5">
          <ol role="list" className="flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {slots.map((slot) =>
                slot.kind === "line" ? (
                  <FilterRow
                    key={slot.key}
                    line={slot.line}
                    motionSafe={motionSafe}
                  />
                ) : (
                  <GapRule
                    key={slot.key}
                    total={slot.total}
                    sentence={slot.sentence}
                    motionSafe={motionSafe}
                  />
                ),
              )}
            </AnimatePresence>
          </ol>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
