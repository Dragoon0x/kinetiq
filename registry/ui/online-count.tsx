"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OnlineCountProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Who is here now, in the order the list should read them. */
  names?: string[];
  /** The figure, when the host counts more people than it can name. */
  count?: number;
  /** Samples across the window, oldest first. */
  history?: number[];
  /** Bars kept in the graph. @default 12 */
  samples?: number;
  /** Names the graph's span. @default "last hour" */
  windowLabel?: string;
  /** Names the instrument for assistive technology. @default "Online now" */
  label?: string;
  /** Names listed before the rest become a "+N more" line. @default 6 */
  maxNames?: number;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fires once per change of the figure, with the signed step. */
  onCountChange?: (count: number, delta: number) => void;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

/**
 * One odometer wheel. A strip of ten beats swapping two keyed spans: a count
 * that revisits the same digit would collide keys with its own exit, and the
 * strip's direction is inherent — a bigger digit pulls the column up, a smaller
 * one lets it back down.
 */
function DigitWheel({
  digit,
  motionSafe,
}: {
  digit: number;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="block h-7 overflow-hidden">
      <motion.span
        className="flex flex-col"
        initial={false}
        animate={{ y: `${-digit * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: durations.fast }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((face) => (
          <span
            key={face}
            className="flex h-7 items-center justify-center text-[22px] leading-none font-semibold tabular-nums"
          >
            {face}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * How many are here now, and how that has moved. The figure is a row of
 * ten-face wheels, so only the place that changed travels — up when the count
 * rose, down when it fell, on `snap`'s single crisp overshoot. Beside it a small
 * graph of the window extends: one bar per sample, the newest growing in from
 * nothing on `snap` while the rest slide left on `glide` through `layout` and
 * the oldest is popped out on the exit ease. The bars are elements rather than
 * an SVG path on purpose — a path whose command count changes cannot be
 * interpolated at all — and every height is a percentage rounded before it
 * reaches a motion string.
 *
 * Pressing the figure, or pointing at the card, lists the names. The list opens
 * in flow inside the component's own box, in a ResizeObserver-measured height on
 * `glide`, so nothing floats over what the host wrote below and no room is held
 * for it while it is shut. A pointer opens it softly; the press pins it, so
 * moving the pointer away cannot snatch it back.
 *
 * The figure is a button whose accessible name is a sentence — the count, the
 * step and the window — and the graph's range is written out under it, so
 * neither the digits nor the bars are the only reading. A polite status region
 * speaks the count once per change. Under reduced motion the digits swap, the
 * bars take their height where they stand, and the list's room swaps on a tween.
 */
export function OnlineCount({
  ref,
  names = [],
  count,
  history = [],
  samples = 12,
  windowLabel = "last hour",
  label = "Online now",
  maxNames = 6,
  open,
  defaultOpen = false,
  onOpenChange,
  onCountChange,
  className,
}: OnlineCountProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-names`;

  const total = Math.max(0, Math.round(count ?? names.length));
  const keep = Math.max(2, Math.floor(samples));
  const shown = history.slice(-keep);
  // The absolute index in the host's history is what keys a bar, so a sample
  // scrolling out of the window never renames the ones still in it.
  const base = history.length - shown.length;
  const peak = Math.max(1, ...shown);
  const low = shown.length > 0 ? Math.min(...shown) : total;
  const high = shown.length > 0 ? Math.max(...shown) : total;
  const opening = shown[0] ?? total;
  const step = total - opening;
  const stepPhrase =
    step > 0 ? `up ${step}` : step < 0 ? `down ${Math.abs(step)}` : "level";

  const [pinned, setPinned] = React.useState(defaultOpen);
  const [hovered, setHovered] = React.useState(false);
  const openControlled = open !== undefined;
  const isOpen = openControlled ? open : pinned || hovered;

  const openRef = React.useRef(onOpenChange);
  const countRef = React.useRef(onCountChange);
  React.useEffect(() => {
    openRef.current = onOpenChange;
    countRef.current = onCountChange;
  });

  const firstRun = React.useRef(true);
  React.useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    openRef.current?.(isOpen);
  }, [isOpen]);

  // The spoken sentence is frozen at the moment the figure moved, so a quick
  // run of joins never leaves the announcement describing the wrong step.
  const [seen, setSeen] = React.useState(() => ({
    count: total,
    id: 0,
    delta: 0,
    text: "",
  }));
  if (seen.count !== total) {
    const delta = total - seen.count;
    setSeen({
      count: total,
      id: seen.id + 1,
      delta,
      text: `${total} here now, ${delta > 0 ? `up ${delta}` : `down ${Math.abs(delta)}`}`,
    });
  }
  React.useEffect(() => {
    if (seen.id === 0) return;
    countRef.current?.(seen.count, seen.delta);
  }, [seen.id, seen.count, seen.delta]);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const listed = names.slice(0, Math.max(1, Math.floor(maxNames)));
  const rest = names.length - listed.length;
  const digits = String(total).split("");

  return (
    <div
      ref={ref}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.preventDefault();
          setPinned(false);
          setHovered(false);
        }
      }}
      className={cn(
        "flex w-full flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={listId}
          aria-label={`${label}: ${total} here now, ${stepPhrase} in the ${windowLabel}. ${
            isOpen ? "Hide names" : "Show names"
          }`}
          onClick={() => setPinned(!pinned)}
          className={cn(
            "flex items-center gap-2 rounded-2 px-1 py-0.5 outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span aria-hidden className="flex items-center">
            {digits.map((digit, position) => (
              <DigitWheel
                // Keyed from the right, so 9 → 10 keeps the ones column.
                key={`place-${digits.length - 1 - position}`}
                digit={Number(digit)}
                motionSafe={motionSafe}
              />
            ))}
          </span>
          <span aria-hidden className="text-xs text-ink-3">
            here now
          </span>
        </button>

        <span
          aria-hidden
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] uppercase",
            step > 0
              ? "bg-success/15 text-success"
              : step < 0
                ? "bg-warn/15 text-warn"
                : "bg-surface-2 text-ink-3",
          )}
        >
          {step > 0 ? `+${step}` : step < 0 ? `−${Math.abs(step)}` : "level"}
        </span>
      </div>

      <div aria-hidden className="flex h-10 w-full items-end gap-px">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((value, position) => {
            const share = Math.max(6, Math.round((value / peak) * 1000) / 10);
            return (
              <motion.span
                key={`sample-${base + position}`}
                layout={motionSafe}
                initial={{ height: "0%", opacity: 0 }}
                animate={{ height: `${share}%`, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: FADE, layout: springs.glide }
                    : { duration: durations.fast }
                }
                className={cn(
                  "block min-w-0 flex-1 rounded-t-1 bg-cobalt-wash",
                  position === shown.length - 1 && "bg-cobalt-bright/70",
                )}
              />
            );
          })}
        </AnimatePresence>
      </div>

      <p className="text-[11px] leading-snug text-ink-3">
        {shown.length > 0
          ? `${windowLabel}, ${low} to ${high}`
          : `no ${windowLabel} yet`}
      </p>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef}>
          {isOpen ? (
            <ul
              role="list"
              id={listId}
              aria-label={`Here now in ${label}`}
              className="flex flex-col gap-1.5 border-t border-hairline pt-2.5"
            >
              {listed.map((name, seat) => (
                // Keyed by seat as well as name: two people can share a name,
                // and two siblings can never share a key.
                <li key={`${seat}-${name}`} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="grid size-5 shrink-0 place-items-center rounded-full bg-cobalt-wash text-[9px] font-semibold text-cobalt-bright"
                  >
                    {initialsOf(name)}
                  </span>
                  <span className="min-w-0 truncate text-xs">{name}</span>
                </li>
              ))}
              {rest > 0 ? (
                <li className="pl-7 text-[11px] text-ink-3">
                  and {rest} more here
                </li>
              ) : null}
              {names.length === 0 ? (
                <li className="text-[11px] text-ink-3">Nobody named yet</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      </motion.div>

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {seen.text}
      </span>
    </div>
  );
}
