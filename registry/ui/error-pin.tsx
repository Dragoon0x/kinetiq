"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PinLevel = "info" | "warn" | "error";

export type PinLine = {
  id: string;
  /** The printed clock for this line — the component never reads one itself. */
  at: string;
  level: PinLevel;
  message: string;
};

export type ErrorPinHandle = {
  /** Advances the current pin to the next error and scrolls to it. */
  jumpToNextError: () => void;
};

export type ErrorPinProps = {
  ref?: React.Ref<ErrorPinHandle>;
  /** The log in order. Every line at level "error" puts a pin on the rail. */
  lines: PinLine[];
  /** Controlled id of the pinned error the rail treats as current. */
  activeId?: string | null;
  /** Initial current pin for uncontrolled usage. */
  defaultActiveId?: string | null;
  /** Fires from the press that made a pin current. */
  onActiveChange?: (id: string | null) => void;
  /** Fires when a pin is activated, with its position among the errors. */
  onJump?: (id: string, index: number) => void;
  /** The scroller's height in pixels; the log scrolls inside it, never the page. @default 208 */
  maxHeight?: number;
  /** Names the scrollable log for assistive technology. @default "Log" */
  label?: string;
  className?: string;
};

const LEVEL_TONE: Record<PinLevel, string> = {
  info: "text-ink-3",
  warn: "text-warn",
  error: "text-danger",
};

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** Fractions reach `top` and `height`, so they are rounded to three places. */
const asPercent = (value: number): string =>
  `${Number((Math.min(1, Math.max(0, value)) * 100).toFixed(3))}%`;

/**
 * Errors, pinned in the scrollbar. Down the right edge of the log runs a rail
 * standing for the whole file: every error line puts a pin on it at its own
 * share of the length, and a translucent thumb tracks the slice you are looking
 * at, driven by motion values written from the scroll handler so scrolling
 * never re-renders the list. Pins inside that slice brighten, so the rail reads
 * as a map of what is off screen.
 *
 * A pin that arrives while you watch pops in on `snap` — one crisp overshoot,
 * never `recoil`, because an error is not a landing to celebrate. Pressing a
 * pin scrolls the box, its own box and never the page, to that line and washes
 * the row in `bg-cobalt-wash`: a three-keyframe tween, so it arrives fast and
 * leaves slowly without a spring dropping the middle.
 *
 * The log is an `<ol role="list">` of `<li>` and the rail is a group of real
 * buttons under a roving tabindex: Arrow Up and Down step between errors, Home
 * and End jump to the first and last, Enter and Space land. Under reduced
 * motion a pin fades in at full size and the jump scrolls without smoothing —
 * the pin still appears, because an error is information.
 */
export function ErrorPin({
  ref,
  lines,
  activeId,
  defaultActiveId = null,
  onActiveChange,
  onJump,
  maxHeight = 208,
  label = "Log",
  className,
}: ErrorPinProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolledActive, setUncontrolledActive] = React.useState<
    string | null
  >(defaultActiveId);
  const isControlled = activeId !== undefined;
  const current = isControlled ? activeId : uncontrolledActive;

  const [focusIndex, setFocusIndex] = React.useState(0);
  const [glow, setGlow] = React.useState<{ id: string; n: number } | null>(
    null,
  );
  const [announcement, setAnnouncement] = React.useState("");
  const [slice, setSlice] = React.useState({ top: 0, bottom: 1 });

  const listRef = React.useRef<HTMLOListElement | null>(null);

  const errors = React.useMemo(
    () =>
      lines
        .map((line, index) => ({ line, index }))
        .filter((entry) => entry.line.level === "error"),
    [lines],
  );

  // A new error should say so once, at the moment the prop brings it in. The
  // comparison lives in render off an anchor rather than in an effect, so the
  // sentence is frozen by the change itself and not by a pass that follows it.
  const [errorAnchor, setErrorAnchor] = React.useState(errors.length);
  if (errorAnchor !== errors.length) {
    const grew = errors.length > errorAnchor;
    setErrorAnchor(errors.length);
    setAnnouncement(
      grew
        ? `New error pinned, ${plural(errors.length, "error", "errors")} in this log.`
        : "",
    );
  }

  const thumbTop = useMotionValue(0);
  const thumbSize = useMotionValue(1);
  const topStyle = useTransform(thumbTop, asPercent);
  const heightStyle = useTransform(thumbSize, (value) =>
    asPercent(Math.max(0.1, value)),
  );

  const sync = React.useCallback(() => {
    const scroller = listRef.current;
    if (!scroller) return;
    const total = Math.max(1, scroller.scrollHeight);
    const top = scroller.scrollTop / total;
    const size = Math.min(1, scroller.clientHeight / total);
    thumbTop.set(top);
    thumbSize.set(size);
    // Coarse on purpose: the thumb itself rides motion values, so this state
    // only has to be good enough to decide which pins are inside the slice.
    setSlice((previous) =>
      Math.abs(previous.top - top) < 0.02 &&
      Math.abs(previous.bottom - (top + size)) < 0.02
        ? previous
        : { top, bottom: top + size },
    );
  }, [thumbSize, thumbTop]);

  // Re-observing on every change of `lines` is the point, not an accident: the
  // scroller is already at its maximum height, so appending a line changes
  // scrollHeight without changing the observed box and no callback would fire.
  // A fresh observe() reports once, asynchronously, which is also why the sync
  // never runs synchronously inside the effect body.
  React.useEffect(() => {
    const scroller = listRef.current;
    if (!scroller || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => sync());
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [sync, lines]);

  const jumpTo = React.useCallback(
    (entryIndex: number) => {
      const entry = errors[entryIndex];
      if (!entry) return;
      const scroller = listRef.current;
      const node = document.getElementById(`${baseId}-row-${entry.line.id}`);
      if (scroller && node) {
        scroller.scrollTo({
          top: Math.max(0, node.offsetTop - 8),
          behavior: motionSafe ? "smooth" : "auto",
        });
      }
      if (!isControlled) setUncontrolledActive(entry.line.id);
      onActiveChange?.(entry.line.id);
      setFocusIndex(entryIndex);
      setGlow((previous) => ({
        id: entry.line.id,
        n: (previous?.n ?? 0) + 1,
      }));
      // Frozen from the pin that was pressed: the sentence names the error the
      // press landed on, never the one it is replacing.
      setAnnouncement(
        `Jumped to error ${entryIndex + 1} of ${errors.length}, ${entry.line.message}.`,
      );
      onJump?.(entry.line.id, entryIndex);
    },
    [baseId, errors, isControlled, motionSafe, onActiveChange, onJump],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      jumpToNextError: () => {
        if (errors.length === 0) return;
        const at = errors.findIndex((entry) => entry.line.id === current);
        jumpTo((at + 1) % errors.length);
      },
    }),
    [current, errors, jumpTo],
  );

  const focusPin = (index: number) => {
    const clamped = Math.min(errors.length - 1, Math.max(0, index));
    const entry = errors[clamped];
    if (!entry) return;
    setFocusIndex(clamped);
    document.getElementById(`${baseId}-pin-${entry.line.id}`)?.focus();
  };

  const handlePinKeys = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusPin(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusPin(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusPin(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusPin(errors.length - 1);
    }
  };

  const count = Math.max(1, lines.length);
  const activePin = Math.min(focusIndex, Math.max(0, errors.length - 1));
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {label} · {plural(errors.length, "error", "errors")}
      </p>

      <div className="flex w-full items-stretch gap-1.5">
        <ol
          ref={listRef}
          role="list"
          aria-label={label}
          tabIndex={0}
          onScroll={sync}
          style={{ maxHeight }}
          className={cn(
            "relative flex min-w-0 flex-1 flex-col overflow-x-clip overflow-y-auto rounded-3 border border-hairline bg-surface-1 p-1.5 [contain:paint] focus-visible:outline-ring",
            "focus-visible:outline-2 focus-visible:-outline-offset-2",
          )}
        >
          {lines.map((line) => {
            const isCurrent = line.id === current;
            return (
              <li
                key={line.id}
                id={`${baseId}-row-${line.id}`}
                aria-current={isCurrent ? "true" : undefined}
                className="relative flex items-center gap-2 rounded-2 px-1.5 py-0.5"
              >
                {glow?.id === line.id ? (
                  <motion.span
                    key={`${line.id}-${glow.n}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash"
                    initial={{ opacity: 0 }}
                    // Three keyframes, so this is a tween: a spring would drop
                    // the middle one and the wash would never arrive.
                    animate={{ opacity: [0, 0.95, 0] }}
                    transition={{
                      duration: durations.page,
                      times: [0, 0.12, 1],
                      ease: easings.exit,
                    }}
                  />
                ) : null}
                <span className="relative w-[3.25rem] shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                  {line.at}
                </span>
                <span
                  className={cn(
                    "relative w-9 shrink-0 font-mono text-[10px] font-medium",
                    LEVEL_TONE[line.level],
                  )}
                >
                  {line.level}
                </span>
                <span
                  title={line.message}
                  className="relative min-w-0 flex-1 truncate font-mono text-[11px] text-ink"
                >
                  {line.message}
                </span>
              </li>
            );
          })}
        </ol>

        <div
          role="group"
          aria-label={`Errors in ${label}`}
          className="relative w-3 shrink-0 rounded-full border border-hairline bg-surface-2"
        >
          <motion.span
            aria-hidden
            style={{ top: topStyle, height: heightStyle }}
            className="pointer-events-none absolute inset-x-0.5 rounded-full bg-hairline-strong"
          />
          {/* initial={false} so pins already present at mount do not pop; a pin
              that arrives later still plays its entrance. */}
          <AnimatePresence initial={false}>
            {errors.map((entry, index) => {
              const at = (entry.index + 0.5) / count;
              const inView = at >= slice.top && at <= slice.bottom;
              const isCurrent = entry.line.id === current;
              return (
                <motion.button
                  key={entry.line.id}
                  type="button"
                  id={`${baseId}-pin-${entry.line.id}`}
                  tabIndex={index === activePin ? 0 : -1}
                  aria-label={`Error ${index + 1} of ${errors.length} at ${entry.line.at}, ${entry.line.message}. Jump to it.`}
                  onClick={() => jumpTo(index)}
                  onKeyDown={(event) => handlePinKeys(event, index)}
                  style={{ top: asPercent(at) }}
                  className="absolute inset-x-0 flex h-3 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-ring"
                  initial={{
                    opacity: 0,
                    scale: motionSafe ? 0.4 : 1,
                    y: "-50%",
                  }}
                  animate={{ opacity: 1, scale: 1, y: "-50%" }}
                  exit={{ opacity: 0, y: "-50%", transition: exitFor() }}
                  transition={motionSafe ? springs.snap : fade}
                >
                  <span
                    className={cn(
                      "block h-1.5 rounded-full bg-danger transition-all",
                      isCurrent ? "w-2.5" : inView ? "w-2" : "w-1.5 opacity-60",
                    )}
                  />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
