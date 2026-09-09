"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HeatAsset = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  /** The day's prints, oldest first; drawn as a sparkline when the tile is open. */
  history?: number[];
};

export type HeatTilesProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The board. Changing a price re-tints its tile. */
  assets: HeatAsset[];
  /** Tiles per row; an open tile spans two. @default 4 */
  columns?: number;
  /** Controlled open tile id. */
  expanded?: string | null;
  /** Initial open tile for uncontrolled usage. @default null */
  defaultExpanded?: string | null;
  onExpandedChange?: (id: string | null) => void;
  /** Percent change at which a tile's tint saturates. @default 3 */
  scale?: number;
  /** Turns a price into its printed string. */
  format?: (value: number) => string;
  /** Names the grid for assistive technology. @default "Market heat" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same price, which is a
 * hydration mismatch inside every open tile.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

/** The strongest a tint gets, so the symbol stays legible over it. */
const MAX_TINT = 0.6;
const SPARK_W = 100;
const SPARK_H = 32;

/**
 * Node and the browser can disagree in the last digits of a float, and a
 * mismatched attribute is a hydration error — every coordinate is rounded
 * before it reaches the markup.
 */
const round3 = (value: number) => Number(value.toFixed(3));

const percentOf = (asset: HeatAsset) =>
  asset.previousClose === 0
    ? 0
    : ((asset.price - asset.previousClose) / asset.previousClose) * 100;

const wordsOf = (percent: number) =>
  `${percent > 0 ? "up" : percent < 0 ? "down" : "unchanged"} ${Math.abs(
    percent,
  ).toFixed(2)} percent`;

/** A day's prints as one line in a fixed box; the stroke keeps its weight when the box stretches. */
function Spark({ history }: { history: number[] }) {
  if (history.length < 2) return null;
  let low = Infinity;
  let high = -Infinity;
  for (const point of history) {
    if (point < low) low = point;
    if (point > high) high = point;
  }
  const span = high - low;
  const d = history
    .map((point, index) => {
      const x = round3((index / (history.length - 1)) * SPARK_W);
      const y = round3(
        span === 0
          ? SPARK_H / 2
          : 2 + (1 - (point - low) / span) * (SPARK_H - 4),
      );
      return `${index === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block h-8 w-full"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * The market as a grid of heat. Each tile is coloured by its percent change
 * against the previous close: a success layer and a danger layer sit under the
 * text and their opacities tween on the move ease — colour is a tween, never a
 * spring — so a tile warms as a gain grows and cools as it fades, and a sign
 * flip cross-fades one layer into the other. Intensity saturates at `scale`
 * percent so the grid reads at a glance.
 *
 * Pressing a tile opens it in place: it spans two columns and two rows and the
 * rest of the grid re-lays around it with `layout` on `glide`, dense-packed so
 * no hole opens, while the open tile reveals the name, the price, a sparkline
 * of the day and its high and low, fading in. Pressing again or Escape closes
 * it. Every tile stays coloured by its live change while one is open, so the
 * grid keeps ticking around the one being read.
 *
 * Tiles are real buttons with a roving tabindex: Left and Right move one tile,
 * Up and Down move a row, Home and End jump to the ends, Enter and Space toggle,
 * Escape closes and keeps focus. Under reduced motion tints still tween — the
 * colour is the information — but tiles swap seats without travel.
 */
export function HeatTiles({
  ref,
  assets,
  columns = 4,
  expanded,
  defaultExpanded = null,
  onExpandedChange,
  scale = 3,
  format = defaultFormat,
  label = "Market heat",
  className,
}: HeatTilesProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultExpanded,
  );
  const isControlled = expanded !== undefined;
  const open = isControlled ? expanded : uncontrolled;

  const [notice, setNotice] = React.useState("");
  const [focused, setFocused] = React.useState(0);
  // A board that shrank under the roving index would leave nothing tabbable.
  const focusIndex = Math.min(focused, Math.max(0, assets.length - 1));
  // Keyed by id, not index: motion memoises ref callbacks, and a tile that
  // changes seat must keep its own node.
  const tileRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const setOpen = (next: string | null) => {
    if (next === open) return;
    if (!isControlled) setUncontrolled(next);
    const asset = next ? assets.find((entry) => entry.id === next) : null;
    setNotice(asset ? `${asset.name} ${asset.symbol} open` : "Closed");
    onExpandedChange?.(next);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(assets.length - 1, Math.max(0, index));
    const asset = assets[clamped];
    if (!asset) return;
    setFocused(clamped);
    tileRefs.current.get(asset.id)?.focus();
  };

  const cols = Math.max(1, Math.floor(columns));

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + cols);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - cols);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(assets.length - 1);
        break;
      case "Escape":
        if (open !== null) {
          event.preventDefault();
          setOpen(null);
        }
        break;
      default:
        break;
    }
  };

  const saturate = Math.max(0.01, scale);
  const tint = { duration: durations.slow, ease: easings.move };
  const layoutTransition = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span id={labelId} className="text-sm font-semibold">
        {label}
      </span>

      {assets.length === 0 ? (
        <p className="text-xs text-ink-3">No assets on the board.</p>
      ) : (
        <div
          role="group"
          aria-labelledby={labelId}
          className="grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            // Dense packing lets the tiles after an open one backfill the row
            // it left, so opening never tears a hole in the board.
            gridAutoFlow: "dense",
          }}
        >
          {assets.map((asset, index) => {
            const percent = percentOf(asset);
            const isOpen = asset.id === open;
            const warm =
              Math.min(1, Math.max(0, percent / saturate)) * MAX_TINT;
            const cool =
              Math.min(1, Math.max(0, -percent / saturate)) * MAX_TINT;
            const tone =
              percent > 0
                ? "text-success"
                : percent < 0
                  ? "text-danger"
                  : "text-ink-2";
            const history = asset.history ?? [];
            let low = Infinity;
            let high = -Infinity;
            for (const point of history) {
              if (point < low) low = point;
              if (point > high) high = point;
            }
            // The open tile's figures join its name, so expanding reads them
            // out instead of leaving them behind the label.
            const sentence = `${asset.name} ${asset.symbol}, ${wordsOf(percent)}`;
            const details =
              history.length > 0
                ? `${format(asset.price)}, low ${format(low)}, high ${format(high)}`
                : format(asset.price);
            return (
              <motion.button
                key={asset.id}
                ref={(node) => {
                  if (node) tileRefs.current.set(asset.id, node);
                  else tileRefs.current.delete(asset.id);
                }}
                type="button"
                aria-expanded={isOpen}
                aria-label={isOpen ? `${sentence}, ${details}` : sentence}
                tabIndex={index === focusIndex ? 0 : -1}
                onFocus={() => setFocused(index)}
                onClick={() => setOpen(isOpen ? null : asset.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                layout={motionSafe}
                transition={layoutTransition}
                style={
                  isOpen
                    ? {
                        gridColumn: `span ${Math.min(2, cols)}`,
                        gridRow: "span 2",
                      }
                    : undefined
                }
                className={cn(
                  "relative flex aspect-square flex-col overflow-hidden rounded-2 border border-hairline bg-surface-2 text-left outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isOpen ? "p-3" : "p-2",
                )}
              >
                {/* Two layers under the text: a gain warms the first, a loss
                    cools the second, and a sign flip cross-fades them. */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 bg-success"
                  initial={false}
                  animate={{ opacity: warm }}
                  transition={tint}
                />
                <motion.span
                  aria-hidden
                  className="absolute inset-0 bg-danger"
                  initial={false}
                  animate={{ opacity: cool }}
                  transition={tint}
                />

                {/* Position-only layout on the text keeps it from being
                    scale-corrected while the tile's box grows or shrinks.
                    Closed tiles stack the symbol over the change: at phone
                    width a tile is too narrow to hold both on one line. */}
                <motion.span
                  layout={motionSafe ? "position" : false}
                  transition={layoutTransition}
                  className={cn(
                    "relative flex",
                    isOpen
                      ? "items-baseline justify-between gap-2"
                      : "flex-col",
                  )}
                >
                  <span className="truncate text-xs font-semibold text-foreground">
                    {asset.symbol}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[11px] font-medium tabular-nums transition-colors",
                      tone,
                    )}
                  >
                    {percent >= 0 ? "+" : "-"}
                    {Math.abs(percent).toFixed(2)}%
                  </span>
                </motion.span>

                {isOpen ? (
                  <motion.span
                    layout={motionSafe ? "position" : false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: durations.base,
                      ease: easings.enter,
                      delay: motionSafe ? 0.12 : 0,
                    }}
                    className="relative flex flex-1 flex-col justify-between gap-1 pt-1"
                  >
                    <span className="truncate text-[11px] text-ink-3">
                      {asset.name}
                    </span>
                    <span className="font-mono text-base leading-tight font-medium text-foreground tabular-nums">
                      {format(asset.price)}
                    </span>
                    <span className={cn("block", tone)}>
                      <Spark history={history} />
                    </span>
                    <span className="flex items-center justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums">
                      <span>L {history.length > 0 ? format(low) : "—"}</span>
                      <span>H {history.length > 0 ? format(high) : "—"}</span>
                    </span>
                  </motion.span>
                ) : null}
              </motion.button>
            );
          })}
        </div>
      )}

      <span role="status" className="sr-only">
        {notice}
      </span>
    </div>
  );
}
