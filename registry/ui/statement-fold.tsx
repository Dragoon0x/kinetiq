"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StatementFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The statement's month, as printed. */
  month: string;
  /** Optional year beside the month. */
  year?: string | number;
  /** The account the statement belongs to. */
  accountName?: string;
  /** Money in, major units. */
  income: number;
  /** Money out, positive major units. */
  spend: number;
  /** Overrides the computed `income - spend`. */
  net?: number;
  /** Controlled fold state. */
  open?: boolean;
  /** Initial fold state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Formats an unsigned amount; the card composes the signs itself. */
  format?: (value: number) => string;
  className?: string;
};

/** An explicit locale keeps the server's string and the client's identical. */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

/** How far the outer bars of the glyph close in when the letter is folded. */
const GLYPH_CLOSE = 3.4;

/**
 * A month you can open like a letter. Pressing the header unfolds three panels —
 * income, spend, net — each rotating from `rotateX: -90deg` about its own top
 * edge on `glide`, in sequence on a `cascade()`, so the statement opens from the
 * top down instead of all at once. Folding back reverses the order on the exit
 * ease, because an exit accelerates away rather than springing. The card's height
 * comes from a `ResizeObserver` on the open content, so nothing is reserved for a
 * panel that is not showing.
 *
 * Each panel's bar draws with `scaleX` from its left edge, scaled against the
 * largest of the three figures so income and spend can be compared by eye. The
 * net colours by sign and never bounces: a month in deficit does not get a
 * celebration.
 *
 * The header is a real `aria-expanded` button — Enter and Space toggle it,
 * Escape folds the card and returns focus — and the panels are a labelled region
 * of `dt`/`dd` pairs, so the figures are read as labelled amounts. Under reduced
 * motion nothing rotates: the panels arrive in sequence by opacity alone and the
 * height changes instantly, while the bars still draw, because a proportion is
 * information.
 */
export function StatementFold({
  ref,
  month,
  year,
  accountName,
  income,
  spend,
  net,
  open,
  defaultOpen = false,
  onOpenChange,
  format = defaultFormat,
  className,
}: StatementFoldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const panelId = `${baseId}-panel`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    // setState lives in the observer callback, never in the effect body. The
    // measurement is unaffected by the panels' rotation, so it is always the
    // fully open height.
    const observer = new ResizeObserver((entries) => {
      setContentHeight(entries[0]?.contentRect.height ?? 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (!isControlled) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const netValue = net ?? income - spend;
  const netUp = netValue >= 0;
  // The widest figure sets the scale, so the three bars are comparable rather
  // than each filling its own track.
  const scale = Math.max(income, spend, Math.abs(netValue), 1);

  const panels = [
    {
      key: "income",
      term: "Income",
      printed: `+${format(income)}`,
      tone: "text-success",
      bar: "bg-success",
      share: income / scale,
    },
    {
      key: "spend",
      term: "Spend",
      printed: `-${format(spend)}`,
      tone: "text-ink",
      bar: "bg-cobalt-bright",
      share: spend / scale,
    },
    {
      key: "net",
      term: "Net",
      printed: `${netUp ? "+" : "-"}${format(Math.abs(netValue))}`,
      tone: netUp ? "text-success" : "text-danger",
      bar: netUp ? "bg-success" : "bg-danger",
      share: Math.abs(netValue) / scale,
    },
  ];
  const stagger = cascade(panels.length);

  const foldTransition = (index: number) => {
    if (!motionSafe) {
      return {
        duration: durations.fast,
        ease: easings.enter,
        delay: isOpen ? index * stagger : 0,
      };
    }
    if (isOpen) {
      return { ...springs.glide, delay: index * stagger };
    }
    // Folding is an exit: it accelerates away, and the bottom panel closes first
    // so the letter collapses the way a hand would fold it.
    return {
      duration: durations.base,
      ease: easings.exit,
      delay: (panels.length - 1 - index) * stagger,
    };
  };

  return (
    <div
      ref={ref}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isOpen) return;
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }}
      className={cn(
        "relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            id={titleId}
            className="truncate text-sm font-medium text-foreground"
          >
            {month}
            {year ? ` ${year}` : ""}
            <span className="sr-only"> statement</span>
          </span>
          {accountName ? (
            <span className="truncate text-[11px] text-ink-3">
              {accountName}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Net
          </span>
          <span
            className={cn(
              "font-mono text-sm tabular-nums",
              netUp ? "text-success" : "text-danger",
            )}
          >
            {netUp ? "+" : "-"}
            {format(Math.abs(netValue))}
          </span>
        </span>

        {/* The glyph is the fold itself: three leaves that close toward the
            middle when the letter is shut. */}
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-4 shrink-0 text-ink-3"
        >
          {[0, 1, 2].map((leaf) => (
            <motion.rect
              key={leaf}
              x="1.5"
              y={leaf * 5.2 + 2.2}
              width="13"
              height="1.6"
              rx="0.8"
              fill="currentColor"
              initial={false}
              animate={{
                y: isOpen ? 0 : (1 - leaf) * GLYPH_CLOSE,
                opacity: isOpen || leaf === 1 ? 1 : 0.55,
              }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          ))}
        </svg>
      </button>

      {/* A crease on the shut cover: the card looks folded before it is opened. */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-3 bottom-0 border-t border-dashed border-hairline-strong"
        initial={false}
        animate={{ opacity: isOpen ? 0 : 1 }}
        transition={{ duration: durations.fast, ease: easings.enter }}
      />

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!isOpen}
        className="overflow-hidden"
        initial={false}
        animate={{
          // "auto" only covers the frame before the observer has measured.
          height: isOpen ? (contentHeight > 0 ? contentHeight : "auto") : 0,
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        {/* The perspective sits on the panels' direct parent: a perspective
            set further up the tree does not reach a grandchild's rotation. */}
        <div ref={contentRef}>
          <dl className="flex flex-col" style={{ perspective: 900 }}>
            {panels.map((panel, index) => (
              <motion.div
                key={panel.key}
                style={{ transformOrigin: "top center" }}
                className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-t border-dashed border-hairline px-3 py-2.5"
                initial={false}
                animate={{
                  rotateX: motionSafe && !isOpen ? -90 : 0,
                  opacity: isOpen ? 1 : 0,
                }}
                transition={foldTransition(index)}
              >
                <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {panel.term}
                </dt>
                <dd className="flex min-w-0 flex-col items-end gap-1.5">
                  <span
                    className={cn("font-mono text-sm tabular-nums", panel.tone)}
                  >
                    {panel.printed}
                  </span>
                  <span
                    aria-hidden
                    className="block h-1 w-full overflow-hidden rounded-full bg-hairline-strong"
                  >
                    <motion.span
                      className={cn(
                        "block h-full origin-left rounded-full",
                        panel.bar,
                      )}
                      initial={false}
                      animate={{ scaleX: isOpen ? panel.share : 0 }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.glide,
                              delay: isOpen ? index * stagger : 0,
                            }
                          : { duration: durations.base, ease: easings.enter }
                      }
                    />
                  </span>
                </dd>
              </motion.div>
            ))}
          </dl>
        </div>
      </motion.div>
    </div>
  );
}
