"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RatioLevel = "steady" | "elevated" | "breaking";

export type RatioSide = "good" | "bad";

export type ErrorRatioProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Requests answered successfully in this window. */
  good: number;
  /** Requests that failed in this window. */
  bad: number;
  /** Error ratio at which the level word becomes "elevated". @default 0.01 */
  warnAt?: number;
  /** Error ratio at which the level word becomes "breaking". @default 0.05 */
  failAt?: number;
  /** The window's printed name — the component never computes one. @default "last 60 s" */
  windowLabel?: string;
  /** Names the meter for assistive technology. @default "Requests" */
  label?: string;
  /** Controlled side the header reading is latched to. */
  held?: RatioSide | null;
  /** Initial latched side for uncontrolled usage. @default null */
  defaultHeld?: RatioSide | null;
  /** Fires from the press that latched or released the header. */
  onHeldChange?: (held: RatioSide | null) => void;
  /** The level is a reading: it reports from the first commit as well as every change. */
  onLevelChange?: (level: RatioLevel) => void;
  /** A settled event — a window whose bad share sits above the last one's. */
  onRise?: (ratio: number) => void;
  /** Renders every request count. @default grouped integer */
  format?: (value: number) => string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** A bad share thinner than this would draw as nothing; the words stay exact. */
const MIN_SHARE = 2;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Grouped by hand rather than by locale: a locale differs between the server
 *  and the browser, and a differing digit is a hydration error. */
const groupInt = (value: number): string =>
  String(Math.round(Math.max(0, value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const requestWord = (count: number): string =>
  count === 1 ? "request" : "requests";

/** Three decimals before any percentage reaches a style: motion re-serialises
 *  what it painted on the server, so an unrounded string never hydrates. */
const pct = (value: number): string =>
  `${Number(Math.min(100, Math.max(0, value)).toFixed(3))}%`;

/**
 * Digits that roll to their new value on `snap` — the same physics as any
 * other indicator changing position. The column is ten faces tall, so a `y` of
 * one tenth of its height moves exactly one digit. Hidden from assistive
 * technology because the meter already carries the figure in a sentence.
 */
function RollingFigure({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains a column, and only the new column mounts.
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-clip [contain:paint]"
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
                  className="flex h-[1.25em] items-center justify-center"
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

/**
 * Good against bad, on one rail. The two runs re-proportion on `glide` when a
 * window arrives — a proportion is a quantity settling, not a switch flipping —
 * and the error ratio's digits roll on `snap` beside them. A window whose bad
 * share sits above the last one's washes the bad run once on a three-keyframe
 * tween (a spring would silently drop the middle frame) and prints the word
 * "rising", so the fact survives reduced motion where the wash does not.
 *
 * The two legend controls are a roving-tabindex group: Left and Right step,
 * Home and End jump, Enter and Space latch the header reading to one side so
 * the eye can hold on `bad` while the windows keep arriving. The level is a
 * printed word as well as a colour, and every count arrives as a prop — this
 * meter never reads a clock.
 */
export function ErrorRatio({
  ref,
  good,
  bad,
  warnAt = 0.01,
  failAt = 0.05,
  windowLabel = "last 60 s",
  label = "Requests",
  held,
  defaultHeld = null,
  onHeldChange,
  onLevelChange,
  onRise,
  format = groupInt,
  className,
}: ErrorRatioProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const okCount = Math.max(0, Math.round(good));
  const badCount = Math.max(0, Math.round(bad));
  const total = okCount + badCount;
  const ratio = total > 0 ? Number((badCount / total).toFixed(6)) : 0;
  const badPercent = Number((ratio * 100).toFixed(2));
  const okPercent = total > 0 ? Number((100 - badPercent).toFixed(2)) : 0;
  const level: RatioLevel =
    ratio >= failAt ? "breaking" : ratio >= warnAt ? "elevated" : "steady";

  // The bad run keeps a floor so a sliver still reads; the sentence beside it
  // stays exact, so the drawing is generous and the words are not.
  const badWidth = badCount > 0 ? Math.max(MIN_SHARE, badPercent) : 0;
  const okWidth = total > 0 ? 100 - badWidth : 0;

  const [ownHeld, setOwnHeld] = React.useState<RatioSide | null>(defaultHeld);
  const isControlled = held !== undefined;
  const latched = isControlled ? held : ownHeld;

  const [hoverSide, setHoverSide] = React.useState<RatioSide | null>(null);
  const [rove, setRove] = React.useState<RatioSide>("bad");

  // The previous window's ratio lives in state, so the committed render knows
  // whether this one rose. Nothing is compared in an effect after the fact.
  const [seen, setSeen] = React.useState({ ratio, rising: false, rises: 0 });
  if (seen.ratio !== ratio) {
    const rising = ratio > seen.ratio;
    setSeen({ ratio, rising, rises: rising ? seen.rises + 1 : seen.rises });
  }
  const rising = seen.rising && badCount > 0;

  const levelRef = React.useRef(onLevelChange);
  const riseRef = React.useRef(onRise);
  React.useEffect(() => {
    levelRef.current = onLevelChange;
    riseRef.current = onRise;
  });
  // A level is a state, so it is reported from the first commit too: a host
  // that mounts already breaking must not read as steady.
  React.useEffect(() => {
    levelRef.current?.(level);
  }, [level]);
  const firstRise = React.useRef(true);
  React.useEffect(() => {
    if (firstRise.current) {
      firstRise.current = false;
      return;
    }
    if (seen.rises > 0) riseRef.current?.(seen.ratio);
  }, [seen.rises, seen.ratio]);

  const setLatched = (next: RatioSide | null) => {
    if (!isControlled) setOwnHeld(next);
    onHeldChange?.(next);
  };

  const sides: RatioSide[] = ["good", "bad"];
  const shown = hoverSide ?? latched;

  const sideCount = (side: RatioSide) => (side === "bad" ? badCount : okCount);
  const sidePercent = (side: RatioSide) =>
    side === "bad" ? badPercent : okPercent;
  const sideWord = (side: RatioSide) => (side === "bad" ? "Bad" : "Good");

  const reading =
    total === 0
      ? `No requests in the ${windowLabel}`
      : shown
        ? `${sideWord(shown)} · ${format(sideCount(shown))} ${requestWord(sideCount(shown))} · ${sidePercent(shown).toFixed(2)}%`
        : `${format(total)} ${requestWord(total)} · ${windowLabel}`;

  const valueText =
    total === 0
      ? `No requests in the ${windowLabel}.`
      : `${format(badCount)} of ${format(total)} ${requestWord(total)} failed in the ${windowLabel}, ${badPercent.toFixed(2)} percent, ${level}${rising ? ", rising" : ""}.`;

  // One frozen sentence per change, decided in the render that commits it — so
  // a flipped latch speaks the new latch rather than the one it replaced.
  const speechKey = `${level}|${latched ?? "none"}`;
  const [spoken, setSpoken] = React.useState({ key: speechKey, sentence: "" });
  if (spoken.key !== speechKey) {
    const previousLevel = spoken.key.split("|")[0];
    const sentence =
      previousLevel !== level
        ? `Error ratio ${level}, ${badPercent.toFixed(2)} percent.`
        : latched === null
          ? "Reading released."
          : `Reading held on ${latched === "bad" ? "failed" : "successful"} requests.`;
    setSpoken({ key: speechKey, sentence });
  }

  const moveTo = (side: RatioSide) => {
    setRove(side);
    document.getElementById(`${baseId}-${side}`)?.focus();
  };

  const onLegendKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(sides[Math.min(sides.length - 1, index + 1)] ?? "bad");
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(sides[Math.max(0, index - 1)] ?? "good");
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo("good");
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo("bad");
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const runTransition = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };
  const levelTone =
    level === "breaking"
      ? "text-danger"
      : level === "elevated"
        ? "text-warn"
        : "text-ink-3";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        {/* Both readings share one cell and cross-fade: travelling the legend
            on the arrow keys must never blank the line. */}
        <div aria-hidden className="grid h-4 min-w-0 flex-1 items-center">
          <AnimatePresence initial={false}>
            <motion.span
              key={reading}
              className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink tabular-nums"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
            >
              {reading}
            </motion.span>
          </AnimatePresence>
        </div>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span
            aria-hidden
            className={cn("font-mono text-sm font-medium", levelTone)}
          >
            <RollingFigure
              value={badPercent.toFixed(2)}
              motionSafe={motionSafe}
            />
            %
          </span>
        </span>
      </div>

      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={badPercent}
        aria-valuetext={valueText}
        className={cn(
          "relative flex h-3 w-full overflow-clip rounded-full bg-hairline [contain:paint]",
          total === 0 && "opacity-60",
        )}
      >
        <motion.span
          aria-hidden
          className={cn(
            "h-full shrink-0 bg-cobalt-bright transition-opacity",
            shown === "bad" && "opacity-45",
          )}
          initial={false}
          animate={{ width: pct(okWidth) }}
          transition={runTransition}
        />
        <motion.span
          aria-hidden
          className={cn(
            "relative h-full shrink-0 bg-danger transition-opacity",
            shown === "good" && "opacity-45",
          )}
          initial={false}
          animate={{ width: pct(badWidth) }}
          transition={runTransition}
        >
          {/* One wash per rise, keyed by the count so the same rise never
              replays. Three keyframes, therefore a tween — a spring would drop
              the middle one in production. Reduced motion drops the wash
              entirely and keeps the printed word instead. */}
          {motionSafe && rising && seen.rises > 0 ? (
            <motion.span
              key={seen.rises}
              className="pointer-events-none absolute inset-0 bg-ink"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.55, 0] }}
              transition={{
                duration: durations.page,
                times: [0, 0.14, 1],
                ease: easings.exit,
              }}
            />
          ) : null}
        </motion.span>
      </div>

      <div
        role="toolbar"
        aria-orientation="horizontal"
        aria-label={`${label} by outcome`}
        className="flex items-stretch gap-1.5"
      >
        {sides.map((side, index) => {
          const active = latched === side;
          return (
            <button
              key={side}
              id={`${baseId}-${side}`}
              type="button"
              aria-pressed={active}
              aria-label={`${sideWord(side)}, ${format(sideCount(side))} ${requestWord(sideCount(side))}, ${sidePercent(side).toFixed(2)} percent.`}
              tabIndex={side === rove ? 0 : -1}
              onFocus={() => {
                setRove(side);
                setHoverSide(side);
              }}
              onBlur={() =>
                setHoverSide((previous) =>
                  previous === side ? null : previous,
                )
              }
              onPointerEnter={() => setHoverSide(side)}
              onPointerLeave={() =>
                setHoverSide((previous) =>
                  previous === side ? null : previous,
                )
              }
              onClick={() => setLatched(active ? null : side)}
              onKeyDown={(event) => onLegendKeyDown(event, index)}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-2 border px-2 text-left transition-colors",
                active
                  ? "border-hairline-strong bg-surface-2"
                  : "border-hairline hover:bg-accent",
                focusRing,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  side === "bad" ? "bg-danger" : "bg-cobalt-bright",
                )}
              />
              <span
                aria-hidden
                className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2"
              >
                {sideWord(side)}
              </span>
              <span
                aria-hidden
                className="shrink-0 font-mono text-[11px] text-ink tabular-nums"
              >
                {format(sideCount(side))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] uppercase">
        <span className="min-w-0 truncate text-ink-3">{windowLabel}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* The rise is a word, not only a wash, so it survives reduced
              motion and never depends on a colour. */}
          {rising ? (
            <span className={cn("font-medium", levelTone)}>rising</span>
          ) : null}
          <span className={cn("font-medium", levelTone)}>{level}</span>
        </span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
