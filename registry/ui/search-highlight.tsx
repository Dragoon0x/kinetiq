"use client";

import * as React from "react";

import { animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SearchLine = {
  id: string;
  level: "debug" | "info" | "warn" | "error";
  /** The service that wrote the line, e.g. "dock-worker". */
  service: string;
  /** Already formatted by the host — the component never reads a clock. */
  time: string;
  text: string;
};

export type SearchHighlightProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The buffer, oldest first. Matches are found in each line's text. */
  lines: SearchLine[];
  /** Controlled query. */
  query?: string;
  /** Initial query for uncontrolled usage. @default "" */
  defaultQuery?: string;
  /** Fires from every keystroke and from the clear. */
  onQueryChange?: (query: string) => void;
  /** Controlled regex mode. */
  regex?: boolean;
  /** Initial regex mode for uncontrolled usage. @default false */
  defaultRegex?: boolean;
  /** Fires from the pattern chip. */
  onRegexChange?: (regex: boolean) => void;
  /** Fires when the number of matches changes. */
  onMatchesChange?: (count: number) => void;
  /** Fires when the cursor steps; -1 when there is nothing to step to. */
  onIndexChange?: (index: number) => void;
  /** The sentence the polite region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** Scroll ceiling for the log box, in px. @default 216 */
  maxHeight?: number;
  /** Names the search field. @default "Search log" */
  label?: string;
  className?: string;
};

const TONES: Record<
  SearchLine["level"],
  { tag: string; word: string; text: string; rail: string }
> = {
  debug: { tag: "DBG", word: "Debug", text: "text-ink-3", rail: "bg-ink-3" },
  info: {
    tag: "INF",
    word: "Info",
    text: "text-cobalt-bright",
    rail: "bg-cobalt-bright",
  },
  warn: { tag: "WRN", word: "Warn", text: "text-warn", rail: "bg-warn" },
  error: { tag: "ERR", word: "Error", text: "text-danger", rail: "bg-danger" },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Enough for a log this size; a pattern that matches everything stops here. */
const MAX_MATCHES = 200;

/** Typing must stop for this long before the count is spoken. */
const SETTLE_MS = 350;

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

type Piece = { key: string; text: string; at: number | null };

/**
 * A count whose digits roll a place at a time on `snap`, so 9 → 10 reads as the
 * same number moving. It is hidden from assistive technology because the field
 * already carries the count in its description.
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

/** Both steppers are the same control at two angles: `aria-disabled` rather
 *  than dropped from the tab order, so the pair never moves under the pointer. */
function StepButton({
  label,
  path,
  idle,
  onPress,
}: {
  label: string;
  path: string;
  idle: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={idle}
      onClick={onPress}
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline-strong transition-colors hover:bg-accent",
        idle ? "text-ink-3 opacity-50" : "text-ink",
        focusRing,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <path d={path} />
      </svg>
    </button>
  );
}

/**
 * One line, with its matches lit. Each `<mark>` sweeps its own background size
 * from nothing to full width rather than scaling, so the wash travels and the
 * text it is lighting never moves; the current match is ringed as well as
 * brighter, because a highlight told only in colour is no highlight at all.
 */
function HitRow({
  line,
  pieces,
  current,
  idFor,
  stagger,
  motionSafe,
}: {
  line: SearchLine;
  pieces: Piece[];
  current: number;
  idFor: (index: number) => string;
  stagger: number;
  motionSafe: boolean;
}) {
  const tone = TONES[line.level];
  return (
    <li className="flex gap-2">
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
          {pieces.map((piece) =>
            piece.at === null ? (
              <span key={piece.key}>{piece.text}</span>
            ) : (
              <motion.mark
                key={piece.key}
                id={idFor(piece.at)}
                aria-current={piece.at === current ? "true" : undefined}
                className={cn(
                  "rounded-1 bg-transparent text-ink",
                  piece.at === current &&
                    "font-semibold outline-1 outline-cobalt-bright",
                )}
                style={{
                  backgroundImage:
                    "linear-gradient(var(--color-cobalt-wash), var(--color-cobalt-wash))",
                  backgroundRepeat: "no-repeat",
                }}
                initial={{
                  backgroundSize: motionSafe ? "0% 100%" : "100% 100%",
                }}
                animate={{ backgroundSize: "100% 100%" }}
                transition={
                  motionSafe
                    ? {
                        ...springs.snap,
                        delay: Math.min(piece.at, 12) * stagger,
                      }
                    : { duration: 0 }
                }
              >
                {piece.text}
              </motion.mark>
            ),
          )}
        </span>
      </span>
    </li>
  );
}

/**
 * A search field over a log, and the log lights up under it. Every match
 * becomes a `<mark>` whose wash sweeps in from its left edge — the background's
 * own size, not a transform, so the text never scales with it — on `snap`,
 * staggered by `cascade()` so a screenful still lights inside the choreography
 * budget. The current match is ringed rather than merely brighter, and stepping
 * seats it into view by its own offset, animated imperatively with every frame
 * rounded before it reaches the node.
 *
 * The counter rolls a digit at a time, and it shares one grid cell with the
 * pattern error so a fast typist can never blank the readout: an unparseable
 * regular expression marks the field invalid and stops the highlighting rather
 * than throwing. Enter steps forward, Shift+Enter steps back, and Escape clears
 * the query where focus actually is, in the field.
 *
 * The field is a real `<input type="search">` described by the counter, the
 * steppers are `aria-disabled` rather than dropped from the tab order when
 * there is nothing to step to, and the log is an `<ol role="list">` whose
 * current match carries `aria-current`. A polite region speaks on settle — once
 * typing stops — rather than once per keystroke. Under reduced motion matches
 * still light, because a match is information, but the wash appears without the
 * sweep and the stepping seats in one move.
 */
export function SearchHighlight({
  ref,
  lines,
  query,
  defaultQuery = "",
  onQueryChange,
  regex,
  defaultRegex = false,
  onRegexChange,
  onMatchesChange,
  onIndexChange,
  onAnnounce,
  maxHeight = 216,
  label = "Search log",
  className,
}: SearchHighlightProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const boxRef = React.useRef<HTMLDivElement | null>(null);

  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const text = query ?? ownQuery;
  const [ownRegex, setOwnRegex] = React.useState(defaultRegex);
  const isRegex = regex ?? ownRegex;
  const [cursor, setCursor] = React.useState(0);
  const [beat, setBeat] = React.useState({ sentence: "", stamp: 0 });

  // One pass builds the regular expression and numbers every match in document
  // order, so the cursor, the ring and the scroll all speak about the same
  // thing — and the expression is local, so nothing a hook returned is mutated.
  const search = React.useMemo(() => {
    const trimmed = text.trim();
    let re: RegExp | null = null;
    let error = "";
    if (trimmed) {
      try {
        re = new RegExp(
          isRegex ? trimmed : trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "gi",
        );
      } catch {
        error = "Not a valid pattern.";
      }
    }
    const rows: { line: SearchLine; pieces: Piece[] }[] = [];
    let count = 0;
    for (const line of lines) {
      if (!re) {
        rows.push({
          line,
          pieces: [{ key: "p0", text: line.text, at: null }],
        });
        continue;
      }
      const pieces: Piece[] = [];
      re.lastIndex = 0;
      let last = 0;
      let hit = re.exec(line.text);
      while (hit !== null && count < MAX_MATCHES) {
        const body = hit[0];
        if (body.length === 0) {
          // A pattern that can match nothing would otherwise loop for ever.
          re.lastIndex += 1;
          hit = re.exec(line.text);
          continue;
        }
        if (hit.index > last) {
          pieces.push({
            key: `p${last}`,
            text: line.text.slice(last, hit.index),
            at: null,
          });
        }
        pieces.push({ key: `m${hit.index}`, text: body, at: count });
        count += 1;
        last = hit.index + body.length;
        hit = re.exec(line.text);
      }
      if (last < line.text.length) {
        pieces.push({ key: `p${last}`, text: line.text.slice(last), at: null });
      }
      rows.push({ line, pieces });
    }
    return { rows, total: count, error, query: trimmed };
  }, [lines, text, isRegex]);

  const total = search.total;
  const at = total === 0 ? -1 : Math.min(cursor, total - 1);

  // A new pattern starts at the first match again; the reset happens in the
  // render that carries the new query, not in an effect a frame later.
  const patternKey = `${text}|${isRegex}`;
  const [seenKey, setSeenKey] = React.useState(patternKey);
  if (seenKey !== patternKey) {
    setSeenKey(patternKey);
    setCursor(0);
  }

  const speak = React.useCallback((sentence: string) => {
    setBeat((prev) => ({ sentence, stamp: prev.stamp + 1 }));
  }, []);

  const announceRef = React.useRef(onAnnounce);
  const matchesRef = React.useRef(onMatchesChange);
  const indexRef = React.useRef(onIndexChange);
  React.useEffect(() => {
    announceRef.current = onAnnounce;
    matchesRef.current = onMatchesChange;
    indexRef.current = onIndexChange;
  });

  React.useEffect(() => {
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence]);

  // Both of these report a state, not an event, so they report it from the
  // first commit as well: a component that mounts with a query already in the
  // field has matches from the start, and a host told nothing about them shows
  // "no matches" over three lit words.
  React.useEffect(() => {
    matchesRef.current?.(total);
  }, [total]);

  React.useEffect(() => {
    indexRef.current?.(at);
  }, [at]);

  // Spoken on settle rather than per keystroke: a field that talks over every
  // letter is a field nobody can hear.
  React.useEffect(() => {
    const trimmed = search.query;
    if (!trimmed) return;
    const timer = window.setTimeout(() => {
      speak(
        search.error
          ? `${search.error} Nothing is highlighted.`
          : total === 0
            ? `No matches for ${trimmed}.`
            : `${countPhrase(total, "match")} for ${trimmed}. Showing 1.`,
      );
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [search.query, total, search.error, speak]);

  // The current match is seated into the middle of the box by its own offset,
  // which is why the box is the positioned ancestor the marks measure against.
  React.useEffect(() => {
    if (at < 0) return;
    const box = boxRef.current;
    const node = document.getElementById(`${baseId}-match-${at}`);
    if (!box || !node) return;
    const span = Math.max(0, box.scrollHeight - box.clientHeight);
    const target = Math.max(
      0,
      Math.min(
        span,
        Math.round(
          node.offsetTop - box.clientHeight / 2 + node.offsetHeight / 2,
        ),
      ),
    );
    if (!motionSafe) {
      box.scrollTop = target;
      return;
    }
    const controls = animate(box.scrollTop, target, {
      duration: durations.base,
      ease: easings.enter,
      onUpdate: (value) => {
        box.scrollTop = Math.round(value);
      },
    });
    return () => controls.stop();
  }, [at, patternKey, baseId, motionSafe]);

  const setQuery = (next: string) => {
    if (query === undefined) setOwnQuery(next);
    onQueryChange?.(next);
  };

  const step = (delta: number) => {
    if (total === 0) return;
    const next = (at + delta + total) % total;
    setCursor(next);
    // The cursor is the component's own, so the reading is settled the moment
    // it is set — nothing is being announced ahead of a host's answer.
    speak(`Match ${next + 1} of ${total}.`);
  };

  const onFieldKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape" && text) {
      event.preventDefault();
      setQuery("");
    }
  };

  const stagger = cascade(Math.max(total, 1));
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      <label
        htmlFor={`${baseId}-field`}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {label}
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <input
          id={`${baseId}-field`}
          type="search"
          value={text}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={search.error ? true : undefined}
          aria-describedby={`${baseId}-readout`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onFieldKeyDown}
          placeholder={isRegex ? "pattern" : "text"}
          className={cn(
            "h-8 min-w-0 flex-1 rounded-2 border bg-surface-0 px-2 font-mono text-[11px] text-ink placeholder:text-ink-3",
            search.error ? "border-danger" : "border-input",
            focusRing,
          )}
        />
        <button
          type="button"
          aria-pressed={isRegex}
          aria-label={`Regular expression, ${isRegex ? "on" : "off"}.`}
          onClick={() => {
            if (regex === undefined) setOwnRegex(!isRegex);
            onRegexChange?.(!isRegex);
          }}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 border px-2 font-mono text-[11px] transition-colors",
            isRegex
              ? "border-hairline-strong bg-accent text-ink"
              : "border-hairline text-ink-3 hover:text-ink-2",
            focusRing,
          )}
        >
          .*
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        {/* The count and the pattern error share one cell and cross-fade, so a
            fast typist never sees the readout blank between them. */}
        <span id={`${baseId}-readout`} className="grid min-w-0 flex-1">
          <motion.span
            aria-hidden={search.error ? true : undefined}
            className="col-start-1 row-start-1 flex items-center font-mono text-[11px] text-ink-2"
            animate={{ opacity: search.error ? 0 : 1 }}
            transition={fade}
          >
            <span className="sr-only">
              {total === 0 ? "No matches." : `Match ${at + 1} of ${total}.`}
            </span>
            <span aria-hidden className="flex items-center gap-1">
              <RollingCount value={at + 1} motionSafe={motionSafe} />
              <span className="text-ink-3">/</span>
              <RollingCount value={total} motionSafe={motionSafe} />
            </span>
          </motion.span>
          <motion.span
            aria-hidden={!search.error}
            className="col-start-1 row-start-1 truncate font-mono text-[11px] text-danger"
            animate={{ opacity: search.error ? 1 : 0 }}
            transition={fade}
          >
            {search.error}
          </motion.span>
        </span>

        <StepButton
          label="Previous match"
          path="m4 10 4-4 4 4"
          idle={total === 0}
          onPress={() => step(-1)}
        />
        <StepButton
          label="Next match"
          path="m4 6 4 4 4-4"
          idle={total === 0}
          onPress={() => step(1)}
        />
      </div>

      <div
        ref={boxRef}
        role="region"
        aria-label="Log lines"
        tabIndex={0}
        style={{ maxHeight: Math.round(maxHeight) }}
        className={cn(
          "relative overflow-x-clip overflow-y-auto overscroll-contain rounded-2 border border-hairline bg-surface-0 p-1.5",
          focusRing,
        )}
      >
        <ol role="list" className="flex flex-col gap-1">
          {search.rows.map(({ line, pieces }) => (
            <HitRow
              key={line.id}
              line={line}
              pieces={pieces}
              current={at}
              idFor={(index) => `${baseId}-match-${index}`}
              stagger={stagger}
              motionSafe={motionSafe}
            />
          ))}
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </span>
    </div>
  );
}
