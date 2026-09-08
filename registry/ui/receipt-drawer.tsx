"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReceiptItem = { label: string; amount: number };

export type Receipt = {
  id: string;
  merchant: string;
  /** An already-formatted day label — the drawer never reads a clock. */
  date: string;
  /** The receipt's total in major units. */
  amount: number;
  items: ReceiptItem[];
  note?: string;
};

export type ReceiptDrawerProps = {
  ref?: React.Ref<HTMLDivElement>;
  receipts: Receipt[];
  /** Controlled drawer state. */
  open?: boolean;
  /** Initial drawer state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the press on the drawer front. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled search text. */
  query?: string;
  /** Initial search text for uncontrolled usage. @default "" */
  defaultQuery?: string;
  /** Fires from the input event that changed the search. */
  onQueryChange?: (query: string) => void;
  /** Controlled id of the receipt that is open, or null. */
  expandedId?: string | null;
  /** Initial open receipt for uncontrolled usage. @default null */
  defaultExpandedId?: string | null;
  /** Fires from the press or Escape that opened or closed a receipt. */
  onExpandedChange?: (id: string | null) => void;
  /** Formats every amount. */
  format?: (value: number) => string;
  /** The drawer's title and accessible name. @default "Receipts" */
  label?: string;
  /** Label for the search field. @default "Search receipts" */
  searchLabel?: string;
  /** Shown when the search matches nothing. @default "No receipts match." */
  emptyMessage?: string;
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

const FOCUS_INSET =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** True when the receipt's merchant, date, note or any line matches the query. */
export function matchReceipt(receipt: Receipt, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    receipt.merchant,
    receipt.date,
    receipt.note ?? "",
    ...receipt.items.map((item) => item.label),
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/**
 * Heights are measured, never reserved. The observer's first callback seeds
 * the number, so nothing is read during render and no state is set in the
 * effect body.
 */
function useMeasuredHeight() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.height ?? 0;
      setHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
}

function Chevron({
  turned,
  motionSafe,
}: {
  turned: boolean;
  motionSafe: boolean;
}) {
  return (
    // The rotation rides an HTML wrapper: motion rewrites transform-origin on
    // SVG nodes, and a chevron turning about anything but its centre wobbles.
    <motion.span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center text-ink-3"
      initial={false}
      animate={{ rotate: turned ? 180 : 0 }}
      transition={motionSafe ? springs.snap : { duration: 0 }}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3.5"
      >
        <path d="M4 6.5 8 10.5 12 6.5" />
      </svg>
    </motion.span>
  );
}

type CardProps = {
  ref?: React.Ref<HTMLLIElement>;
  receipt: Receipt;
  expanded: boolean;
  /** The order of the visible cards; only a change here re-measures for FLIP. */
  order: string;
  motionSafe: boolean;
  format: (value: number) => string;
  onToggle: () => void;
  onMove: (direction: -1 | 1) => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
};

/** One receipt: FLIPs to its new row when the search re-orders the list, and
 *  opens where it stands to a measured height. */
function ReceiptCard({
  ref,
  receipt,
  expanded,
  order,
  motionSafe,
  format,
  onToggle,
  onMove,
  buttonRef,
}: CardProps) {
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const panelId = `${baseId}-panel`;
  const [contentRef, contentHeight] = useMeasuredHeight();
  const ownButton = React.useRef<HTMLButtonElement | null>(null);
  const stagger = cascade(receipt.items.length + 1);
  const lines = receipt.items.length;

  return (
    <motion.li
      ref={ref}
      // Position only: the height change is the panel's own measured glide,
      // and letting layout animate size too would fight it. Re-measuring is
      // pinned to the filter order: while a neighbour's panel glides open the
      // drawer re-renders on every measured frame, and a FLIP on each of those
      // would drag the cards below a beat behind the push.
      layout={motionSafe ? "position" : false}
      layoutDependency={order}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? { ...springs.glide, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !expanded) return;
        event.preventDefault();
        onToggle();
        ownButton.current?.focus();
      }}
      className="w-full overflow-hidden rounded-2 border border-hairline bg-surface-0"
    >
      <button
        ref={(node) => {
          ownButton.current = node;
          buttonRef(node);
        }}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          onMove(event.key === "ArrowDown" ? 1 : -1);
        }}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent",
          FOCUS_INSET,
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            id={titleId}
            title={receipt.merchant}
            className="truncate text-sm font-medium text-foreground"
          >
            {receipt.merchant}
          </span>
          <span className="truncate font-mono text-[11px] text-ink-3">
            {receipt.date} · {lines} {lines === 1 ? "line" : "lines"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-sm text-foreground tabular-nums">
          {format(receipt.amount)}
        </span>
        <Chevron turned={expanded} motionSafe={motionSafe} />
      </button>

      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!expanded}
        className="overflow-hidden"
        initial={false}
        // "auto" only covers the frame before the observer has measured.
        animate={{
          height: expanded ? (contentHeight > 0 ? contentHeight : "auto") : 0,
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={contentRef}>
          <ul className="flex flex-col gap-1 border-t border-hairline px-3 py-2 text-xs">
            {receipt.items.map((item, index) => (
              <motion.li
                key={`${item.label}-${index}`}
                className="flex items-center justify-between gap-3 text-ink-2"
                initial={false}
                animate={{
                  opacity: expanded ? 1 : 0,
                  y: motionSafe && !expanded ? distances.nudge : 0,
                }}
                transition={
                  motionSafe
                    ? {
                        ...springs.glide,
                        delay: expanded ? index * stagger : 0,
                      }
                    : { duration: durations.fast, ease: easings.enter }
                }
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {format(item.amount)}
                </span>
              </motion.li>
            ))}
            {receipt.note ? (
              <li className="text-[11px] text-ink-3">{receipt.note}</li>
            ) : null}
            <li className="mt-1 flex items-center justify-between gap-3 border-t border-hairline pt-1.5 font-medium">
              <span>Total</span>
              <span className="font-mono tabular-nums">
                {format(receipt.amount)}
              </span>
            </li>
          </ul>
        </div>
      </motion.div>
    </motion.li>
  );
}

/**
 * A filing drawer for receipts. The front is a disclosure: pressing it pulls
 * the drawer open on `glide` to a height a ResizeObserver measured on the
 * contents — a layout shift that eases into place — while the tab's chevron
 * turns on `snap`. Inside, each receipt is a card that opens where it stands
 * on `glide`, again to a measured height, its lines arriving on a `cascade()`.
 * Searching filters the cards: survivors FLIP to their new rows on `glide`,
 * the ones that leave fade on the exit ease, and returning matches fade in.
 *
 * Nothing is reserved for a state that is not showing. The front and every
 * card are real `aria-expanded` buttons; the drawer body is a labelled region
 * that is inert while closed; Up and Down move between cards, Escape closes an
 * open card and returns focus to it, and Escape in a non-empty search clears
 * it. Under reduced motion heights swap instantly and filtering only fades.
 */
export function ReceiptDrawer({
  ref,
  receipts,
  open,
  defaultOpen = false,
  onOpenChange,
  query,
  defaultQuery = "",
  onQueryChange,
  expandedId,
  defaultExpandedId = null,
  onExpandedChange,
  format = defaultFormat,
  label = "Receipts",
  searchLabel = "Search receipts",
  emptyMessage = "No receipts match.",
  className,
}: ReceiptDrawerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const bodyId = `${baseId}-body`;
  const listId = `${baseId}-list`;
  const searchId = `${baseId}-search`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;
  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const currentQuery = query ?? ownQuery;
  const [ownExpanded, setOwnExpanded] = React.useState(defaultExpandedId);
  const expanded = expandedId === undefined ? ownExpanded : expandedId;

  const [bodyRef, bodyHeight] = useMeasuredHeight();
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());

  const setOpen = (next: boolean) => {
    if (next === isOpen) return;
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const setQuery = (next: string) => {
    if (next === currentQuery) return;
    if (query === undefined) setOwnQuery(next);
    onQueryChange?.(next);
  };
  const setExpanded = (next: string | null) => {
    if (next === expanded) return;
    if (expandedId === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
  };

  const shown = receipts.filter((receipt) =>
    matchReceipt(receipt, currentQuery),
  );
  const filtering = currentQuery.trim().length > 0;
  const order = shown.map((receipt) => receipt.id).join(" ");
  const openReceipt = receipts.find((receipt) => receipt.id === expanded);

  const moveFrom = (id: string, direction: -1 | 1) => {
    const index = shown.findIndex((receipt) => receipt.id === id);
    const target = shown[index + direction];
    if (target) buttons.current.get(target.id)?.focus();
  };

  const announce = [
    filtering ? `${shown.length} of ${receipts.length} receipts shown` : "",
    openReceipt ? `${openReceipt.merchant} open` : "",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <div
      ref={ref}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
          FOCUS_INSET,
        )}
      >
        {/* The pull tab: a drawer handle, not a folder icon. */}
        <span
          aria-hidden
          className="flex h-4 w-5 shrink-0 items-center justify-center"
        >
          <span className="h-1.5 w-full rounded-full border border-hairline-strong bg-surface-2" />
        </span>
        <span
          id={titleId}
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
        >
          {label}
        </span>
        <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[11px] tabular-nums">
          <motion.span
            key={filtering ? shown.length : -1}
            className="inline-block text-signal"
            initial={
              motionSafe ? { y: -distances.nudge, opacity: 0 } : { opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          >
            {filtering ? shown.length : receipts.length}
          </motion.span>
          {filtering ? (
            <span className="text-ink-3">/ {receipts.length}</span>
          ) : null}
        </span>
        <Chevron turned={isOpen} motionSafe={motionSafe} />
      </button>

      <motion.div
        id={bodyId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!isOpen}
        inert={!isOpen}
        className="overflow-hidden"
        initial={false}
        animate={{
          height: isOpen ? (bodyHeight > 0 ? bodyHeight : "auto") : 0,
        }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div ref={bodyRef}>
          <div className="flex flex-col gap-3 border-t border-hairline p-3">
            <div className="relative">
              <label htmlFor={searchId} className="sr-only">
                {searchLabel}
              </label>
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              >
                <circle cx="7" cy="7" r="4.5" />
                <path d="m10.5 10.5 3 3" />
              </svg>
              <input
                id={searchId}
                type="search"
                value={currentQuery}
                placeholder="Merchant, line or note"
                autoComplete="off"
                aria-controls={listId}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape" || !currentQuery) return;
                  event.preventDefault();
                  setQuery("");
                }}
                className={cn(
                  "h-9 w-full rounded-2 border border-input bg-surface-0 pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-ink-3",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              />
            </div>

            <ul id={listId} className="relative flex flex-col gap-2">
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((receipt) => (
                  <ReceiptCard
                    key={receipt.id}
                    receipt={receipt}
                    expanded={receipt.id === expanded}
                    order={order}
                    motionSafe={motionSafe}
                    format={format}
                    onToggle={() =>
                      setExpanded(receipt.id === expanded ? null : receipt.id)
                    }
                    onMove={(direction) => moveFrom(receipt.id, direction)}
                    buttonRef={(node) => {
                      if (node) buttons.current.set(receipt.id, node);
                      else buttons.current.delete(receipt.id);
                    }}
                  />
                ))}
              </AnimatePresence>
            </ul>

            {shown.length === 0 ? (
              <p className="py-1 text-center text-xs text-ink-3">
                {emptyMessage}
              </p>
            ) : null}
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
