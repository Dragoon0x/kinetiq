"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SizeTile = {
  value: string;
  label: string;
  available: boolean;
  /** Fit note shown beneath while this size is hovered, focused or chosen. */
  note?: string;
};

export type SizeTilesProps = {
  /** The sizes, in the order they are offered. */
  sizes: SizeTile[];
  /** Controlled chosen size; `defaultValue` seeds the uncontrolled one. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Visible group label. @default "Size" */
  label?: string;
  className?: string;
};

const OUT_OF_STOCK = "Out of stock";

/** Arrows wrap, Home and End jump, Space re-picks. Null: not our key. */
function rovingIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === " ") return index;
  return null;
}

/**
 * A size chooser that answers with weight, not with layout. The chosen tile
 * inflates to 1.06 on `snap` and its border thickens over the base hairline —
 * both transform and colour, so nothing beside it shifts a pixel. Unavailable
 * tiles draw a diagonal strike through themselves on `flick` when hovered or
 * focused, and carry "out of stock" for a screen reader rather than vanishing
 * from the group. The fit note beneath cross-fades between sizes over a
 * measured height, so it reserves no dead space when a size has nothing to
 * say. Arrows move and wrap, Home and End jump, Space selects. Under reduced
 * motion the tile keeps its border and drops the inflation.
 */
export function SizeTiles({
  sizes,
  value,
  defaultValue,
  onValueChange,
  label = "Size",
  className,
}: SizeTilesProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const stockId = `${baseId}-stock`;

  const [uncontrolled, setUncontrolled] = React.useState(
    () => defaultValue ?? "",
  );
  const current = value === undefined ? uncontrolled : value;
  const selectedIndex = sizes.findIndex((size) => size.value === current);

  const [hovered, setHovered] = React.useState<number | null>(null);
  const [focused, setFocused] = React.useState<number | null>(null);
  // The pointer wins over focus, and the choice speaks when neither is present.
  const activeIndex = hovered ?? focused ?? selectedIndex;
  const active = sizes[activeIndex];
  const noteText = active
    ? active.available
      ? (active.note ?? "")
      : OUT_OF_STOCK
    : "";

  // The note is measured, never reserved: one observer on the stable inner box
  // reports exactly the height the current line needs — including zero, when a
  // size has nothing to say — and the outer box glides to it.
  const noteRef = React.useRef<HTMLDivElement | null>(null);
  const [noteHeight, setNoteHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = noteRef.current;
    if (!node) return;
    const read = () => setNoteHeight(node.offsetHeight);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const select = (index: number) => {
    const size = sizes[index];
    if (!size || !size.available) return;
    if (value === undefined) setUncontrolled(size.value);
    if (size.value !== current) onValueChange?.(size.value);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = rovingIndex(event.key, index, sizes.length);
    if (next === null) return;
    event.preventDefault();
    select(next);
    document.getElementById(`${baseId}-tile-${next}`)?.focus();
  };

  return (
    // The note sits outside the gapped column: with nothing to say it is zero
    // tall AND leaves no gap behind it.
    <div className={cn("flex w-full flex-col", className)}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span id={labelId} className="text-sm font-semibold text-ink">
            {label}
          </span>
          <span className="font-mono text-xs text-ink-2 tabular-nums">
            {sizes[selectedIndex]?.label ?? "—"}
          </span>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className="flex flex-wrap gap-2"
        >
          {sizes.map((size, index) => {
            const selected = index === selectedIndex;
            const struck = !size.available && index === activeIndex;
            return (
              <motion.button
                key={size.value}
                type="button"
                role="radio"
                id={`${baseId}-tile-${index}`}
                aria-checked={selected}
                aria-disabled={size.available ? undefined : true}
                aria-describedby={size.available ? undefined : stockId}
                tabIndex={index === Math.max(selectedIndex, 0) ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onPointerEnter={() => setHovered(index)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setFocused(index)}
                onBlur={() => setFocused(null)}
                initial={false}
                // Scale, never size: the row's geometry is fixed so a choice
                // never nudges its neighbours.
                animate={{ scale: selected && motionSafe ? 1.06 : 1 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className={cn(
                  "relative flex h-11 flex-1 basis-12 items-center justify-center rounded-2 border text-sm font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  selected
                    ? "border-hairline-strong bg-surface-2 text-ink"
                    : "border-hairline bg-surface-1 text-ink-2 hover:text-ink",
                  !size.available && "text-ink-3 hover:text-ink-3",
                )}
              >
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ opacity: selected ? 1 : 0 }}
                  transition={{ duration: durations.fast, ease: easings.enter }}
                  className="pointer-events-none absolute inset-0 rounded-2 border-2 border-cobalt-bright"
                />

                {!size.available && (
                  <svg
                    aria-hidden
                    className="pointer-events-none absolute inset-0 h-full w-full text-ink-3"
                  >
                    {/* Percentage endpoints keep the strike undistorted at any
                      tile width — a stretched viewBox would shear the stroke. */}
                    <motion.line
                      x1="18%"
                      y1="82%"
                      x2="82%"
                      y2="18%"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray="1 1"
                      initial={false}
                      animate={{ strokeDashoffset: struck ? 0 : 1 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                )}

                <span className="relative">{size.label}</span>
              </motion.button>
            );
          })}
        </div>

        <span id={stockId} className="sr-only">
          {OUT_OF_STOCK}
        </span>
      </div>

      <motion.div
        aria-live="polite"
        initial={false}
        // "auto" until the first measurement lands, so the note box opens at
        // its true height instead of unfolding itself once on mount.
        animate={{ height: noteHeight ?? "auto" }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden"
      >
        <div ref={noteRef} className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            {noteText && (
              <motion.p
                key={noteText}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations.fast, ease: easings.enter }}
                className={cn(
                  // The gap belongs to the note, so an empty note is truly
                  // zero tall rather than a padded strip of nothing.
                  "pt-3 text-xs leading-relaxed",
                  active && !active.available ? "text-warn" : "text-ink-2",
                )}
              >
                {noteText}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
