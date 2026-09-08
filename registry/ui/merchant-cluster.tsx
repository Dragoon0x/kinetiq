"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MerchantTx = {
  id: string;
  /** Short date, already formatted — "12 Nov". */
  day: string;
  label: string;
  amount: number;
};

export type MerchantSpend = {
  id: string;
  name: string;
  /** Total taken by this merchant; bubbles are area-proportional to it. */
  amount: number;
  transactions: MerchantTx[];
};

export type MerchantClusterProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Merchants in any order; the cluster packs them largest first. */
  merchants: MerchantSpend[];
  /** Formats every amount in the cluster and the panel. */
  format?: (value: number) => string;
  /** Controlled expanded merchant id; `null` is the resting cluster. */
  value?: string | null;
  /** Initial expanded merchant for uncontrolled use. */
  defaultValue?: string | null;
  /** Fires from the press, Enter/Space, or Escape that expanded or collapsed a bubble. */
  onValueChange?: (id: string | null) => void;
  /** Names the cluster for assistive technology. @default "Spend by merchant" */
  label?: string;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/**
 * The stage is 4:3, so its height is 0.75 of its width. Working in width units
 * for both axes is what keeps a circle circular at every container size — the
 * bubbles are sized by the box they sit in, never by a fixed pixel width that
 * could overhang it.
 */
const ASPECT = 0.75;
const CX = 0.5;
const CY = ASPECT / 2;

/** Largest and smallest bubble radius, in width units. */
const R_MAX = 0.185;
const R_MIN = 0.058;
/** Breathing room between packed bubbles, and the margin the stage keeps so a
 *  focus outline is never clipped by its own overflow. */
const PAD = 0.012;
const EDGE = 0.02;

/** Golden-angle scan: deterministic, so the pack is identical on both renders. */
const GOLDEN = 2.39996323;
const SPIRAL_STEP = 0.03;
const CANDIDATES = 420;

/** The expanded bubble and the ellipse the rest part onto. The ring is an
 *  ellipse because the stage is wider than it is tall, and its radii leave
 *  room for a focus outline at every extreme. */
const FOCUS_R = 0.22;
const RING_X = 0.37;
const RING_Y = 0.3;
const SAT_SCALE = 0.45;
const SAT_MAX = 0.05;

/** Node and the browser can disagree in the last digits of sin/cos; a style
 *  that differs by 1e-16 is a hydration error, so every coordinate is rounded. */
const round = (value: number): number => Number(value.toFixed(3));

type Bubble = { id: string; x: number; y: number; r: number };

/**
 * Greedy pack along a golden-angle spiral: each bubble takes the first spot
 * outward from the centre that clears every bubble already down and stays
 * inside the stage. No randomness and no physics loop, so the layout is stable
 * across renders and costs nothing after the first pass.
 */
function packCluster(items: MerchantSpend[]): Bubble[] {
  const largest = items.reduce(
    (top, item) => Math.max(top, Math.max(0, item.amount)),
    0,
  );
  const scale = largest > 0 ? largest : 1;
  const placed: Bubble[] = [];

  for (const item of items) {
    const r = Math.max(
      R_MIN,
      Math.sqrt(Math.max(0, item.amount) / scale) * R_MAX,
    );
    let x = CX;
    let y = CY;
    for (let k = 0; k < CANDIDATES; k += 1) {
      const distance = SPIRAL_STEP * Math.sqrt(k);
      const angle = k * GOLDEN;
      const px = CX + Math.cos(angle) * distance;
      const py = CY + Math.sin(angle) * distance;
      if (px - r < EDGE || px + r > 1 - EDGE) continue;
      if (py - r < EDGE || py + r > ASPECT - EDGE) continue;
      const clash = placed.some(
        (other) => Math.hypot(other.x - px, other.y - py) < other.r + r + PAD,
      );
      if (clash) continue;
      x = px;
      y = py;
      break;
    }
    placed.push({ id: item.id, x: round(x), y: round(y), r: round(r) });
  }

  return placed;
}

/** The expanded arrangement: one bubble centred, the rest on an ellipse whose
 *  radii keep the satellites inside the shorter vertical axis. */
function partFor(cluster: Bubble[], index: number): Bubble[] {
  const others = Math.max(1, cluster.length - 1);
  return cluster.map((bubble, i) => {
    if (i === index) return { ...bubble, x: CX, y: CY, r: FOCUS_R };
    const slot = i < index ? i : i - 1;
    const angle = -Math.PI / 2 + (slot * 2 * Math.PI) / others;
    return {
      id: bubble.id,
      x: round(CX + Math.cos(angle) * RING_X),
      y: round(CY + Math.sin(angle) * RING_Y),
      r: round(Math.min(SAT_MAX, Math.max(0.024, bubble.r * SAT_SCALE))),
    };
  });
}

/**
 * A month's merchants as bubbles sized by what they took. The pack settles on
 * `snap` in a `cascade()` — each bubble grows out of the cluster's centre with
 * one crisp overshoot — and pressing one expands it: the chosen bubble glides
 * to the middle at up to four times its radius while the rest part onto a ring around it,
 * `glide` rather than `snap` because parting a cluster is a layout shift. The
 * panel underneath opens to that merchant's transactions, its height taken from
 * a ResizeObserver so a closed panel reserves nothing.
 *
 * Bubbles are real buttons carrying `aria-expanded` and a roving tabindex in
 * spend order: arrows step, Home and End reach the largest and smallest, Enter
 * and Space toggle, Escape collapses. Under reduced motion the pack appears in
 * place and the expansion swaps without travel, while the panel still opens —
 * the transactions are the reading, not the flourish.
 */
export function MerchantCluster({
  ref,
  merchants,
  format = defaultFormat,
  value,
  defaultValue = null,
  onValueChange,
  label = "Spend by merchant",
  className,
}: MerchantClusterProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const panelId = `${baseId}-panel`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const openId = isControlled ? value : uncontrolled;

  const [focusIndex, setFocusIndex] = React.useState(0);
  const buttonRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  // Spend order is the pack order and the tab order: the biggest bite first.
  const ordered = React.useMemo(
    () => [...merchants].sort((a, b) => b.amount - a.amount),
    [merchants],
  );
  const cluster = React.useMemo(() => packCluster(ordered), [ordered]);
  const openIndex = ordered.findIndex((merchant) => merchant.id === openId);
  const layout = React.useMemo(
    () => (openIndex < 0 ? cluster : partFor(cluster, openIndex)),
    [cluster, openIndex],
  );

  const total = ordered.reduce(
    (sum, merchant) => sum + Math.max(0, merchant.amount),
    0,
  );
  const open = openIndex >= 0 ? ordered[openIndex] : null;

  // The stage's width drives every circle. A ResizeObserver fires once on
  // observe, so the first paint is honest without reading layout during render.
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = React.useState(0);
  React.useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setStageWidth(node.clientWidth);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The panel's height is measured rather than reserved, so a shut panel takes
  // no room and an open one is exactly as tall as its rows.
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = React.useState(0);
  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setContentHeight(node.offsetHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // The cascade belongs to the arrival only; a later expansion must not inherit
  // a stagger delay. The flag flips from a timer callback, never inside the
  // effect body.
  const measured = stageWidth > 0;
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    if (!measured) return;
    const timer = window.setTimeout(() => setSettled(true), 700);
    return () => window.clearTimeout(timer);
  }, [measured]);

  const commit = (id: string | null) => {
    if (!isControlled) setUncontrolled(id);
    onValueChange?.(id);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(ordered.length - 1, Math.max(0, index));
    setFocusIndex(clamped);
    buttonRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
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
        focusAt(ordered.length - 1);
        break;
      case "Escape":
        if (openId === null) break;
        event.preventDefault();
        commit(null);
        break;
      default:
        break;
    }
  };

  const stagger = cascade(ordered.length);
  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
          {format(total)}
        </span>
      </div>

      <div
        ref={stageRef}
        role="group"
        aria-labelledby={labelId}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2 bg-surface-2"
      >
        {measured &&
          ordered.map((merchant, index) => {
            const spot = layout[index];
            if (!spot) return null;
            const isOpen = merchant.id === openId;
            const diameter = spot.r * 2 * stageWidth;
            const share = total > 0 ? merchant.amount / total : 0;
            const percent = Math.round(share * 100);
            const initials = merchant.name
              .split(" ")
              .map((word) => word.charAt(0))
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <motion.button
                key={merchant.id}
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                type="button"
                tabIndex={index === focusIndex ? 0 : -1}
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-label={`${merchant.name}, ${format(merchant.amount)}, ${percent} percent of spend, ${merchant.transactions.length} transactions`}
                onFocus={() => setFocusIndex(index)}
                onClick={() => commit(isOpen ? null : merchant.id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                initial={
                  motionSafe
                    ? {
                        x: CX * stageWidth,
                        y: CY * stageWidth,
                        width: 0,
                        height: 0,
                        opacity: 0,
                      }
                    : { opacity: 0 }
                }
                animate={{
                  x: (spot.x - spot.r) * stageWidth,
                  y: (spot.y - spot.r) * stageWidth,
                  width: diameter,
                  height: diameter,
                  opacity: 1,
                }}
                whileHover={motionSafe && !isOpen ? { scale: 1.04 } : undefined}
                transition={
                  motionSafe
                    ? {
                        ...(settled ? springs.glide : springs.snap),
                        delay: settled ? 0 : index * stagger,
                        opacity: fade,
                      }
                    : { duration: 0, opacity: fade }
                }
                className={cn(
                  "absolute top-0 left-0 flex cursor-pointer items-center justify-center rounded-full border text-center outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isOpen
                    ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                    : "border-hairline-strong bg-surface-0 text-ink-2 hover:border-cobalt-bright",
                )}
              >
                <span
                  aria-hidden
                  className="pointer-events-none flex flex-col items-center justify-center gap-0.5 px-2 leading-tight"
                >
                  {isOpen ? (
                    <>
                      <span className="text-xs font-semibold text-balance">
                        {merchant.name}
                      </span>
                      <span className="font-mono text-sm font-medium text-cobalt-bright tabular-nums">
                        {format(merchant.amount)}
                      </span>
                      <span className="text-[10px] text-ink-3">
                        {percent}% of spend
                      </span>
                    </>
                  ) : diameter >= 76 ? (
                    <>
                      <span className="text-[11px] font-medium text-balance">
                        {merchant.name}
                      </span>
                      <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                        {format(merchant.amount)}
                      </span>
                    </>
                  ) : diameter >= 52 ? (
                    <span className="text-[10px] font-medium">
                      {merchant.name.split(" ")[0]}
                    </span>
                  ) : (
                    <span className="font-mono text-[9px] font-medium">
                      {initials}
                    </span>
                  )}
                </span>
              </motion.button>
            );
          })}
      </div>

      <motion.div
        id={panelId}
        aria-hidden={open === null}
        className="overflow-hidden"
        initial={false}
        animate={{ height: open ? contentHeight : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.enter }
        }
      >
        <div ref={contentRef}>
          {open ? (
            <div className="flex flex-col gap-2 border-t border-hairline pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-xs font-semibold">
                  {open.name}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                  {open.transactions.length} transactions
                </span>
              </div>
              <ol className="flex flex-col gap-1.5">
                {open.transactions.map((tx, index) => (
                  <motion.li
                    key={tx.id}
                    className="flex items-center gap-2 text-[11px]"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            delay: index * cascade(open.transactions.length),
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <span className="w-12 shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                      {tx.day}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">
                      {tx.label}
                    </span>
                    <span className="shrink-0 font-mono font-medium tabular-nums">
                      {format(tx.amount)}
                    </span>
                  </motion.li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
