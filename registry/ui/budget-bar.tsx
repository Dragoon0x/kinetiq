"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BudgetSegment = {
  id: string;
  label: string;
  value: number;
  /** Segment colour; any CSS colour the caller trusts. */
  color: string;
};

export type BudgetBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Categories and amounts, left to right. */
  segments: BudgetSegment[];
  /** Formats amounts in the bar, the legend, and the total. */
  format?: (value: number) => string;
  /** Bar title. */
  label: string;
  /** Fires with the segment being read; null when the reading is dropped. */
  onActiveChange?: (segment: BudgetSegment | null) => void;
  className?: string;
};

const formatAmount = (value: number): string =>
  Math.round(value).toLocaleString("en-US");

/**
 * Extra flex-grow the read segment borrows, as a fraction of the whole bar —
 * enough room for a label and an amount without crushing its neighbours.
 */
const EXPAND = 0.75;

/** What caused the widths to change; each cause has its own physics. */
type Mode = "enter" | "expand" | "reflow";

type RolledNumberProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A number that rolls to its target on `glide`. The formatted text is a motion
 * value handed to the span as its child, so the roll runs outside React and
 * re-renders nothing; `tabular-nums` pins the cell width so moving digits can
 * never nudge the layout around them.
 */
function RolledNumber({
  value,
  format,
  motionSafe,
  className,
}: RolledNumberProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the total — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <span className={cn("font-mono tabular-nums", className)}>
      <span className="sr-only">{format(value)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  );
}

/**
 * A month's spending as one stacked bar. The segments grow to their share on
 * `glide` in a single cascade, then hold: reading one expands it on `snap` — a
 * switch throwing, one crisp overshoot — while its neighbours compress to make
 * room, and the label and amount surface inside the segment itself rather than
 * in a tooltip that would cover the bar. Turning a legend chip off drops its
 * category and the whole bar re-flows on `glide`, the spring for layout finding
 * a new arrangement.
 *
 * The segments are a group of buttons: arrows walk them, Home and End jump to
 * the ends, Enter and Space pin a reading so it survives the pointer leaving,
 * and each carries its label, amount, and share as its accessible name. Legend
 * chips are toggle buttons carrying `aria-pressed`. Under reduced motion the
 * widths are set without spring and only the labels fade.
 */
export function BudgetBar({
  ref,
  segments,
  format = formatAmount,
  label,
  onActiveChange,
  className,
}: BudgetBarProps) {
  const motionSafe = useMotionSafe();
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [pinned, setPinned] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>("enter");
  const [focusIndex, setFocusIndex] = React.useState(0);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const isHidden = (id: string) => hidden.includes(id);
  const active = hovered ?? focused ?? pinned;
  const total = segments.reduce(
    (sum, segment) => (isHidden(segment.id) ? sum : sum + segment.value),
    0,
  );
  const step = cascade(segments.length);

  const shown = segments
    .map((segment, index) => (isHidden(segment.id) ? -1 : index))
    .filter((index) => index >= 0);
  const anchor = shown.includes(focusIndex) ? focusIndex : (shown[0] ?? -1);

  const report = (id: string | null) => {
    onActiveChange?.(
      id === null ? null : (segments.find((s) => s.id === id) ?? null),
    );
  };

  // Reading a segment ends the entry cascade: an interaction must never wait
  // out a stagger delay that was meant for the first paint.
  const readHover = (id: string | null) => {
    setHovered(id);
    setMode("expand");
    report(id ?? focused ?? pinned);
  };

  const readFocus = (id: string | null) => {
    setFocused(id);
    setMode("expand");
    report(hovered ?? id ?? pinned);
  };

  const togglePin = (id: string) => {
    const next = pinned === id ? null : id;
    setPinned(next);
    setMode("expand");
    report(hovered ?? focused ?? next);
  };

  const toggleSegment = (id: string) => {
    setMode("reflow");
    const hiding = !isHidden(id);
    setHidden((current) =>
      current.includes(id)
        ? current.filter((held) => held !== id)
        : [...current, id],
    );
    // A category that leaves the bar takes its reading with it, rather than
    // leaving the caller holding a segment that is no longer drawn.
    if (hiding && active === id) {
      setHovered(null);
      setFocused(null);
      setPinned(null);
      report(null);
    }
  };

  const focusAt = (position: number) => {
    const clamped = Math.min(shown.length - 1, Math.max(0, position));
    const index = shown[clamped];
    if (index === undefined) return;
    setFocusIndex(index);
    buttonRefs.current[index]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const position = shown.indexOf(index);
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(position + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(position - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(shown.length - 1);
        break;
      default:
        break;
    }
  };

  const transitionFor = (index: number) => {
    if (!motionSafe) return { duration: 0 };
    if (mode === "expand") return springs.snap;
    if (mode === "reflow") return springs.glide;
    return { ...springs.glide, delay: index * step };
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm font-medium text-foreground">
          {label}
        </span>
        <RolledNumber
          value={total}
          format={format}
          motionSafe={motionSafe}
          className="shrink-0 text-sm text-ink-2"
        />
      </div>

      <div
        role="group"
        aria-label={label}
        className="relative flex h-10 w-full overflow-hidden rounded-2 border border-hairline bg-surface-2"
      >
        {segments.map((segment, index) => {
          const off = isHidden(segment.id);
          const isActive = !off && active === segment.id;
          const share = total === 0 ? 0 : segment.value / total;
          const grow = off
            ? 0
            : segment.value + (isActive ? total * EXPAND : 0);
          return (
            <motion.button
              key={segment.id}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              disabled={off}
              aria-pressed={pinned === segment.id}
              aria-label={
                off
                  ? `${segment.label}, ${format(segment.value)}, hidden`
                  : `${segment.label}, ${format(segment.value)}, ${Math.round(
                      share * 100,
                    )} percent`
              }
              tabIndex={index === anchor ? 0 : -1}
              onClick={() => togglePin(segment.id)}
              onFocus={() => {
                setFocusIndex(index);
                readFocus(segment.id);
              }}
              onBlur={() => readFocus(null)}
              onPointerEnter={() => readHover(segment.id)}
              onPointerLeave={() => readHover(null)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="relative flex h-full min-w-0 basis-0 cursor-pointer items-center overflow-hidden border-r outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              style={{
                // The wash is mixed into the surface, so the reading inside a
                // segment keeps its contrast in both themes.
                backgroundColor: `color-mix(in oklab, ${segment.color} 38%, var(--bg-2))`,
                borderRightColor: "var(--bg-1)",
                borderRightWidth: off ? 0 : 1,
              }}
              initial={{ flexGrow: 0 }}
              animate={{ flexGrow: grow }}
              transition={transitionFor(index)}
            >
              <motion.span
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ backgroundColor: segment.color }}
                initial={false}
                animate={{ opacity: isActive ? 0.34 : 0 }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              />
              <motion.span
                aria-hidden
                className="relative truncate px-2 font-mono text-[10px] tracking-[0.02em] whitespace-nowrap text-ink"
                initial={false}
                animate={{ opacity: isActive ? 1 : 0 }}
                transition={{
                  duration: durations.fast,
                  ease: isActive ? easings.enter : easings.exit,
                }}
              >
                {segment.label} · {format(segment.value)}
              </motion.span>
            </motion.button>
          );
        })}

        {total === 0 ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            No categories shown
          </span>
        ) : null}
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {segments.map((segment) => {
          const off = isHidden(segment.id);
          return (
            <li key={segment.id} className="flex">
              <button
                type="button"
                aria-pressed={!off}
                aria-label={`${segment.label}, ${format(segment.value)}`}
                onClick={() => toggleSegment(segment.id)}
                className={cn(
                  "flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-[11px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  off
                    ? "border-hairline text-ink-3"
                    : "border-hairline-strong text-ink-2 hover:text-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    off && "opacity-30",
                  )}
                  style={{ backgroundColor: segment.color }}
                />
                <span className="max-w-24 truncate">{segment.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
