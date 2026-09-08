"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NonceItem = {
  /** Position in the account's outgoing sequence. */
  nonce: number;
  /** Short or full hash; printed truncated. */
  hash: string;
  status: "confirmed" | "pending" | "failed";
  amount: number;
  /** Who it pays, for the detail line. */
  to?: string;
};

export type NonceLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The account's transactions. Order does not matter; the line sorts by nonce. */
  items: NonceItem[];
  /** Controlled focused nonce. */
  value?: number;
  /** Initial focused nonce for uncontrolled usage. */
  defaultValue?: number;
  onValueChange?: (nonce: number) => void;
  /** Fires from the press on a gap slot; the host inserts the missing transaction. */
  onFill?: (nonce: number) => void;
  /** Formats every amount on the rail and in the detail line. */
  format?: (value: number) => string;
  /** Ticker printed after each amount. @default "BSN" */
  asset?: string;
  /** Visible list label. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  /** Word inside a gap slot. @default "Fill" */
  fillLabel?: string;
  className?: string;
  "aria-label"?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

/** A rail is a window on a sequence, not the whole ledger. */
const MAX_SLOTS = 64;

/** Extra rail the blocked tail sits behind while a nonce is missing. */
const BREAK = 28;

const STATUS_WORD = {
  confirmed: "Confirmed",
  pending: "Pending",
  failed: "Failed",
} as const;

const STATUS_DOT = {
  confirmed: "bg-success",
  pending: "bg-cobalt-bright",
  failed: "bg-danger",
} as const;

type Slot = { nonce: number; item?: NonceItem; blocked: boolean };

const shorten = (hash: string): string =>
  hash.length > 13 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;

/**
 * Every transaction in order. The line is built from the nonces themselves, so
 * a missing number draws as a dashed empty slot rather than being silently
 * skipped, and everything behind it reads as blocked — because behind a gap is
 * exactly where those transactions are. The slot breathes on a three-keyframe
 * opacity tween (a spring may carry only two) and stands still while the
 * document is hidden.
 *
 * While a nonce is missing the rail carries a break behind its slot, so the
 * blocked tail visibly sits further along the line than it should. Filling the
 * gap is the whole interaction: the slot is a real button, pressing it hands
 * the missing nonce to the host, and when the host inserts it the break
 * collapses on `glide` and every tile behind it slides forward into the space
 * it gives back.
 *
 * The rail is an ordered list with a roving tabindex — Left and Right step,
 * Home and End jump, Enter and Space select or fill — and each tile's label
 * spells its state out in words, so blocked never rests on dimming alone. Under
 * reduced motion nothing breathes and nothing glides; the order still changes,
 * because the order is the information.
 */
export function NonceLine({
  ref,
  items,
  value,
  defaultValue,
  onValueChange,
  onFill,
  format = defaultFormat,
  asset = "BSN",
  label,
  fillLabel = "Fill",
  className,
  "aria-label": ariaLabel,
}: NonceLineProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const slots = React.useMemo<Slot[]>(() => {
    const sorted = [...items].sort((a, b) => a.nonce - b.nonce);
    const first = sorted[0]?.nonce;
    if (first === undefined) return [];
    const byNonce = new Map(sorted.map((item) => [item.nonce, item]));
    const last = Math.min(
      sorted[sorted.length - 1]?.nonce ?? first,
      first + MAX_SLOTS - 1,
    );
    const built: Slot[] = [];
    let gapSeen = false;
    for (let nonce = first; nonce <= last; nonce += 1) {
      const item = byNonce.get(nonce);
      if (!item) {
        built.push({ nonce, blocked: false });
        gapSeen = true;
        continue;
      }
      built.push({
        nonce,
        item,
        blocked: gapSeen && item.status === "pending",
      });
    }
    return built;
  }, [items]);

  const firstGap = slots.find((slot) => !slot.item)?.nonce;
  const blockedCount = slots.filter((slot) => slot.blocked).length;

  const [uncontrolled, setUncontrolled] = React.useState<number | undefined>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const fallback = slots[0]?.nonce ?? 0;
  const current = isControlled ? value : (uncontrolled ?? fallback);
  const activeIndex = Math.max(
    0,
    slots.findIndex((slot) => slot.nonce === current),
  );

  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);

  const select = (nonce: number) => {
    if (!isControlled) setUncontrolled(nonce);
    if (nonce !== current) onValueChange?.(nonce);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(slots.length - 1, Math.max(0, index));
    const slot = slots[clamped];
    if (!slot) return;
    select(slot.nonce);
    buttons.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const slot = slots[index];
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(slots.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!slot) break;
        select(slot.nonce);
        if (!slot.item) onFill?.(slot.nonce);
        break;
      default:
        break;
    }
  };

  // Edge fades only appear where there is more rail to reach. A ResizeObserver
  // fires once on observe, so the first paint is honest without reading layout
  // during render.
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const [list, attachList] = React.useState<HTMLOListElement | null>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !list || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const overflow = node.scrollWidth - node.clientWidth;
      setEdges({
        start: node.scrollLeft > 1,
        end: node.scrollLeft < overflow - 1,
      });
    };
    node.addEventListener("scroll", measure, { passive: true });
    // The rail is observed as well as its window: the break collapsing changes
    // the content's width without touching the scroller's own box.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    observer.observe(list);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [list]);

  const active = slots[activeIndex];
  const detail = !active
    ? "No transactions"
    : !active.item
      ? `Nonce ${active.nonce} · missing`
      : [
          `Nonce ${active.nonce}`,
          shorten(active.item.hash),
          `${format(active.item.amount)} ${asset}`,
          active.blocked
            ? `waiting on ${firstGap}`
            : STATUS_WORD[active.item.status],
        ].join(" · ");

  const health =
    firstGap === undefined
      ? "Line in order"
      : `${blockedCount} transaction${blockedCount === 1 ? "" : "s"} waiting on nonce ${firstGap}`;

  // The break is the gap made physical: while a nonce is missing the tiles
  // behind it sit a break's width further along the rail, and collapsing that
  // width on `glide` is what slides them forward when the gap is filled.
  const breakTransition = motionSafe ? springs.glide : { duration: 0 };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span
          className={cn(
            "shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase",
            firstGap === undefined ? "text-ink-3" : "text-warn",
          )}
        >
          {firstGap === undefined ? "In order" : `Gap at ${firstGap}`}
        </span>
      </div>

      <div className="relative">
        <div ref={scrollerRef} className="overflow-x-auto pb-1">
          <ol
            ref={attachList}
            role="list"
            aria-labelledby={label ? labelId : undefined}
            aria-label={label ? undefined : ariaLabel}
            className="flex items-stretch gap-1.5"
          >
            <AnimatePresence initial={false}>
              {slots.flatMap((slot, index) => {
                const isGap = !slot.item;
                const status = slot.item?.status ?? "pending";
                const word = slot.blocked ? "Blocked" : STATUS_WORD[status];
                const tileLabel = isGap
                  ? `Nonce ${slot.nonce} missing, fill it`
                  : `Nonce ${slot.nonce}, ${format(slot.item?.amount ?? 0)} ${asset}${
                      slot.item?.to ? ` to ${slot.item.to}` : ""
                    }, ${slot.blocked ? `waiting on nonce ${firstGap}` : word.toLowerCase()}`;

                const tile = (
                  <motion.li
                    key={slot.nonce}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                    }}
                    className="shrink-0"
                  >
                    <button
                      ref={(node) => {
                        buttons.current[index] = node;
                      }}
                      type="button"
                      tabIndex={index === activeIndex ? 0 : -1}
                      aria-label={tileLabel}
                      aria-current={index === activeIndex ? "true" : undefined}
                      onClick={() => {
                        select(slot.nonce);
                        if (isGap) onFill?.(slot.nonce);
                      }}
                      onKeyDown={(event) => handleKeyDown(event, index)}
                      className={cn(
                        "relative flex h-[62px] w-[88px] cursor-pointer flex-col justify-between rounded-2 border p-2 text-left transition-colors outline-none",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        isGap
                          ? "border-dashed border-hairline-strong bg-transparent hover:bg-accent"
                          : "border-hairline-strong bg-surface-2 hover:border-cobalt-bright/60",
                        slot.blocked && "opacity-70",
                      )}
                    >
                      {/* The pulse lives on its own ring so the label under it
                          never flickers, and it stops for a hidden tab. */}
                      {isGap && motionSafe && visible ? (
                        <motion.span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 rounded-2 border border-dashed border-cobalt-bright"
                          initial={{ opacity: 0.2 }}
                          animate={{ opacity: [0.2, 0.85, 0.2] }}
                          transition={{
                            duration: 1.8,
                            ease: easings.move,
                            repeat: Infinity,
                          }}
                        />
                      ) : null}

                      <span className="relative flex items-baseline justify-between gap-1">
                        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                          {slot.nonce}
                        </span>
                        {isGap ? null : (
                          <span className="truncate font-mono text-[9px] text-ink-3">
                            {shorten(slot.item?.hash ?? "")}
                          </span>
                        )}
                      </span>

                      <span className="relative block truncate font-mono text-[11px] font-medium text-foreground tabular-nums">
                        {isGap ? fillLabel : format(slot.item?.amount ?? 0)}
                      </span>

                      <span className="relative flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            isGap
                              ? "bg-warn"
                              : slot.blocked
                                ? "bg-warn"
                                : STATUS_DOT[status],
                          )}
                        />
                        <span className="truncate text-[10px] text-ink-3">
                          {isGap ? "Gap" : word}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                );

                if (!isGap) return [tile];
                return [
                  tile,
                  <motion.li
                    key={`break-${slot.nonce}`}
                    aria-hidden
                    className="shrink-0"
                    initial={{ width: 0 }}
                    animate={{ width: BREAK }}
                    exit={{ width: 0, transition: breakTransition }}
                    transition={breakTransition}
                  />,
                ];
              })}
            </AnimatePresence>
          </ol>
        </div>

        {edges.start ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-surface-1 to-surface-1/0"
          />
        ) : null}
        {edges.end ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-surface-1 to-surface-1/0"
          />
        ) : null}
      </div>

      <p
        aria-live="polite"
        className="flex min-w-0 border-t border-hairline pt-3 font-mono text-[11px] text-ink-3 tabular-nums"
      >
        <span className="truncate">{detail}</span>
      </p>

      <span role="status" className="sr-only">
        {health}
      </span>
    </div>
  );
}
