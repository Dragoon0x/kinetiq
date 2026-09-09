"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MoverAsset = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
};

export type MoverView = "gainers" | "losers";

export type MoverListProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The board. Changing an asset's price flashes its chip and re-sorts the rows. */
  assets: MoverAsset[];
  /** Controlled sort direction. */
  view?: MoverView;
  /** Initial sort direction for uncontrolled usage. @default "gainers" */
  defaultView?: MoverView;
  onViewChange?: (view: MoverView) => void;
  /** Rows shown; the rest leave on the exit ease. @default 5 */
  limit?: number;
  /** Turns a price into its printed string. */
  format?: (value: number) => string;
  /** How long a chip's flash takes to fade, and the quiet the live region waits for. @default 900 */
  flashMs?: number;
  /** Names the list and prints in the header. @default "Movers" */
  label?: string;
  /** Fires from the effect that observed a new order, with the visible ids top to bottom. */
  onOrderChange?: (ids: string[]) => void;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same price, which is a
 * hydration mismatch on every row.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => money.format(value);

const VIEWS: { value: MoverView; label: string }[] = [
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
];

/** Keeps a callback out of an effect's dependencies so a re-render cannot re-fire it. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

type Committed = Record<string, { price: number; generation: number }>;

const percentOf = (asset: MoverAsset) =>
  asset.previousClose === 0
    ? 0
    : ((asset.price - asset.previousClose) / asset.previousClose) * 100;

const chipOf = (percent: number) =>
  `${percent >= 0 ? "+" : "-"}${Math.abs(percent).toFixed(2)}%`;

const wordsOf = (percent: number) =>
  `${percent > 0 ? "up" : percent < 0 ? "down" : "unchanged"} ${Math.abs(
    percent,
  ).toFixed(2)} percent`;

/**
 * Who moved most today. Assets rank by percent change against the previous
 * close, and when prices tick every row that changes seat travels to its new
 * one — a `layout="position"` FLIP on `glide`, because a reorder is a layout
 * settling and must not overshoot — while the rank column re-reads in place so
 * the eye follows the row, not the number. Each chip mounts a fresh wash keyed
 * by the tick that updated it, flashing at 0.9 and fading on the exit ease, so a
 * burst of prints reads as a ripple of flashes over a list sorting itself out.
 *
 * Which chips flash is decided during render by comparing each incoming price
 * with the one last committed, never in an effect — so a chip only flashes when
 * its own price moved, and a re-render that changed nothing flashes nothing.
 * The view is a radio pair with a roving tabindex: Left and Right step, Home and
 * End jump, Space selects. A polite live region names the leader once the tape
 * has been quiet for `flashMs`, never per tick. Under reduced motion rows swap
 * seats without travel and chips still flash — an update is information.
 */
export function MoverList({
  ref,
  assets,
  view,
  defaultView = "gainers",
  onViewChange,
  limit = 5,
  format = defaultFormat,
  flashMs = 900,
  label = "Movers",
  onOrderChange,
  className,
}: MoverListProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;

  const [uncontrolledView, setUncontrolledView] = React.useState(defaultView);
  const isControlled = view !== undefined;
  const currentView = isControlled ? view : uncontrolledView;
  const viewIndex = Math.max(
    0,
    VIEWS.findIndex((option) => option.value === currentView),
  );

  const selectView = (next: MoverView) => {
    if (next === currentView) return;
    if (!isControlled) setUncontrolledView(next);
    onViewChange?.(next);
  };

  const focusView = (index: number) => {
    const option = VIEWS[Math.min(VIEWS.length - 1, Math.max(0, index))];
    if (!option) return;
    document.getElementById(`${baseId}-view-${option.value}`)?.focus();
    selectView(option.value);
  };

  const handleViewKey = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusView(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusView(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusView(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusView(VIEWS.length - 1);
    } else if (event.key === " ") {
      event.preventDefault();
      selectView(VIEWS[index]?.value ?? currentView);
    }
  };

  // The committed prices, adjusted during render rather than in an effect: the
  // flash needs to know which price moved on this very pass, and an effect
  // would paint the new figure once before the wash could be keyed to it.
  const [committed, setCommitted] = React.useState<Committed>(() =>
    Object.fromEntries(
      assets.map((asset) => [asset.id, { price: asset.price, generation: 0 }]),
    ),
  );
  let next: Committed | null = null;
  for (const asset of assets) {
    const previous = committed[asset.id];
    if (!previous || previous.price !== asset.price) {
      next ??= { ...committed };
      next[asset.id] = {
        price: asset.price,
        generation: previous ? previous.generation + 1 : 0,
      };
    }
  }
  if (next) setCommitted(next);

  const ranked = assets
    .map((asset) => ({ asset, percent: percentOf(asset) }))
    .sort((a, b) =>
      currentView === "gainers" ? b.percent - a.percent : a.percent - b.percent,
    )
    .slice(0, Math.max(0, limit));

  const orderKey = ranked.map((row) => row.asset.id).join(" ");
  const orderRef = useLatest(onOrderChange);
  const lastOrder = React.useRef(orderKey);
  React.useEffect(() => {
    if (lastOrder.current === orderKey) return;
    lastOrder.current = orderKey;
    orderRef.current?.(orderKey.split(" ").filter(Boolean));
  }, [orderKey, orderRef]);

  const leader = ranked[0];
  const sentence = leader
    ? `${currentView === "gainers" ? "Leading" : "Falling most"}: ${
        leader.asset.name
      } ${leader.asset.symbol}, ${wordsOf(leader.percent)}`
    : "No movers yet";

  // Written from the timer, not the render: a fast tape would otherwise
  // interrupt a screen reader on every print.
  const [announced, setAnnounced] = React.useState(sentence);
  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setAnnounced(sentence),
      Math.max(0, flashMs) + 80,
    );
    return () => window.clearTimeout(timer);
  }, [sentence, flashMs]);

  const rowTransition = motionSafe
    ? { ...springs.glide, opacity: { duration: durations.fast } }
    : { duration: durations.fast, ease: easings.move };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <div
          role="radiogroup"
          aria-label="Sort by"
          className="inline-flex h-8 shrink-0 items-stretch rounded-full border border-hairline bg-surface-2 p-0.5"
        >
          {VIEWS.map((option, index) => {
            const checked = option.value === currentView;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                id={`${baseId}-view-${option.value}`}
                tabIndex={index === viewIndex ? 0 : -1}
                onClick={() => selectView(option.value)}
                onKeyDown={(event) => handleViewKey(event, index)}
                className={cn(
                  "relative flex items-center justify-center rounded-full px-3 text-xs font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  checked
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {checked ? (
                  motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={knobId}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0 shadow-sm"
                    />
                  )
                ) : null}
                <span className="relative">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="text-xs text-ink-3">No movers yet.</p>
      ) : (
        <ol aria-labelledby={labelId} className="flex flex-col">
          <AnimatePresence initial={false}>
            {ranked.map(({ asset, percent }, index) => {
              const generation = committed[asset.id]?.generation ?? 0;
              const rising = percent > 0;
              const falling = percent < 0;
              const tone = rising
                ? "text-success"
                : falling
                  ? "text-danger"
                  : "text-ink-2";
              const wash = rising
                ? "bg-success/35"
                : falling
                  ? "bg-danger/35"
                  : "bg-ink/20";
              return (
                <motion.li
                  key={asset.id}
                  aria-label={`${index + 1}, ${asset.name} ${asset.symbol}, ${format(
                    asset.price,
                  )}, ${wordsOf(percent)}`}
                  // "position" animates the seat change only; a full layout
                  // animation would scale-correct cells that never resized.
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={rowTransition}
                  className="relative flex items-center gap-3 border-b border-hairline py-2 last:border-b-0"
                >
                  {/* Reduced motion swaps seats instead of travelling, so a
                      veil keyed by the seat fades off whichever row just
                      arrived in it — the cue that something moved, without
                      the movement. */}
                  {!motionSafe ? (
                    <motion.span
                      key={`seat-${index}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-surface-1"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: durations.fast,
                        ease: easings.enter,
                      }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="w-4 shrink-0 text-center font-mono text-[11px] text-ink-3 tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span aria-hidden className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm leading-tight font-medium">
                      {asset.symbol}
                    </span>
                    <span
                      title={asset.name}
                      className="truncate text-[11px] leading-tight text-ink-3"
                    >
                      {asset.name}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 font-mono text-xs text-ink tabular-nums"
                  >
                    {format(asset.price)}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "relative inline-flex h-6 w-[7.5ch] shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-2 font-mono text-[11px] font-medium tabular-nums transition-colors",
                      tone,
                    )}
                  >
                    {/* Keyed by the tick that updated it, so each print mounts
                        its own wash and fades it; an unkeyed layer would need a
                        second animation to reset. Generation 0 is the mount and
                        must not flash at a viewer who saw nothing change. */}
                    {generation > 0 ? (
                      <motion.span
                        key={generation}
                        className={cn("absolute inset-0", wash)}
                        initial={{ opacity: 0.9 }}
                        animate={{ opacity: 0 }}
                        transition={{
                          duration: Math.max(0, flashMs) / 1000,
                          ease: easings.exit,
                        }}
                      />
                    ) : null}
                    <span className="relative">{chipOf(percent)}</span>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}

      <span aria-live="polite" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
