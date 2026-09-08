"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FlowStream = {
  id: string;
  /** Keep it short — the diagram's gutters hold about nine characters. */
  label: string;
  amount: number;
};

export type CashflowRiverProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Income streams, top to bottom. */
  inflows: FlowStream[];
  /** Spend categories, top to bottom. */
  outflows: FlowStream[];
  /** Formats every figure on the diagram. */
  format?: (value: number) => string;
  /** Controlled pinned stream id. */
  value?: string | null;
  /** Initial pinned stream for uncontrolled use. */
  defaultValue?: string | null;
  /** Fires from the press, Enter/Space or Escape that pinned or released a stream. */
  onValueChange?: (id: string | null) => void;
  /** Fires from the pointer or focus that lit a stream. */
  onReadChange?: (stream: FlowStream | null, side: "in" | "out" | null) => void;
  /** Names the diagram for assistive technology. @default "Cashflow" */
  label?: string;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const defaultFormat = (value: number): string => MONEY.format(value);

/** Diagram frame, in viewBox units — the SVG is sized by its container, so
 *  these are proportions rather than pixels. */
const VIEW_W = 320;
const GUTTER = 62;
const NODE_IN_0 = 64;
const NODE_IN_1 = 71;
const TRUNK_0 = 150;
const TRUNK_1 = 170;
const NODE_OUT_0 = 257;
const NODE_OUT_1 = 264;
const PAD = 10;
/** The trunk's height stands for the larger of income and spend. */
const TRUNK_H = 120;
/** Space between two nodes on the same side — what gives the river its bend. */
const GAP = 8;
/** Hit stroke: a four-unit ribbon is still catchable. */
const HIT_W = 16;

/** Node and the browser can disagree in the last digits of a float; an
 *  attribute that differs is a hydration error, so coordinates are rounded. */
const round = (value: number): number => Number(value.toFixed(3));

type Lane = {
  id: string;
  label: string;
  amount: number;
  side: "in" | "out";
  /** `kept` and `short` are the balancing band, not a stream the caller gave. */
  kind: "stream" | "kept" | "short";
  d: string;
  width: number;
  /** Centre of the node, in viewBox units — the label rides it. */
  y: number;
};

type River = { height: number; lanes: Lane[]; trunkTop: number };

const sum = (streams: FlowStream[]): number =>
  streams.reduce((all, stream) => all + Math.max(0, stream.amount), 0);

/**
 * Both sides are stacked to the same total, so every ribbon keeps one
 * thickness from its own node to its band on the trunk — a proper Sankey
 * ribbon rather than a taper. Gaps between the nodes make the outer stacks
 * taller than the trunk, and that difference is the bend.
 */
function buildRiver(inflows: FlowStream[], outflows: FlowStream[]): River {
  const totalIn = sum(inflows);
  const totalOut = sum(outflows);
  const trunkTotal = Math.max(totalIn, totalOut, 1);

  const ins: { stream: FlowStream; kind: Lane["kind"] }[] = inflows.map(
    (stream) => ({ stream, kind: "stream" as const }),
  );
  const outs: { stream: FlowStream; kind: Lane["kind"] }[] = outflows.map(
    (stream) => ({ stream, kind: "stream" as const }),
  );
  if (totalIn > totalOut) {
    outs.push({
      stream: { id: "kept", label: "Kept", amount: totalIn - totalOut },
      kind: "kept",
    });
  } else if (totalOut > totalIn) {
    ins.push({
      stream: { id: "short", label: "Shortfall", amount: totalOut - totalIn },
      kind: "short",
    });
  }

  const unit = TRUNK_H / trunkTotal;
  const leftExtent = TRUNK_H + GAP * Math.max(0, ins.length - 1);
  const rightExtent = TRUNK_H + GAP * Math.max(0, outs.length - 1);
  const height = Math.max(leftExtent, rightExtent) + PAD * 2;
  const trunkTop = (height - TRUNK_H) / 2;

  const lanes: Lane[] = [];

  let leftCursor = (height - leftExtent) / 2;
  let trunkCursor = trunkTop;
  for (const entry of ins) {
    const width = Math.max(0, entry.stream.amount) * unit;
    const yNode = round(leftCursor + width / 2);
    const yTrunk = round(trunkCursor + width / 2);
    const c1 = round(NODE_IN_1 + (TRUNK_0 - NODE_IN_1) * 0.45);
    const c2 = round(NODE_IN_1 + (TRUNK_0 - NODE_IN_1) * 0.6);
    lanes.push({
      id: entry.stream.id,
      label: entry.stream.label,
      amount: entry.stream.amount,
      side: "in",
      kind: entry.kind,
      width: round(width),
      y: yNode,
      d: `M ${NODE_IN_0} ${yNode} L ${NODE_IN_1} ${yNode} C ${c1} ${yNode} ${c2} ${yTrunk} ${TRUNK_0} ${yTrunk}`,
    });
    leftCursor += width + GAP;
    trunkCursor += width;
  }

  let rightCursor = (height - rightExtent) / 2;
  trunkCursor = trunkTop;
  for (const entry of outs) {
    const width = Math.max(0, entry.stream.amount) * unit;
    const yNode = round(rightCursor + width / 2);
    const yTrunk = round(trunkCursor + width / 2);
    const c1 = round(TRUNK_1 + (NODE_OUT_0 - TRUNK_1) * 0.4);
    const c2 = round(TRUNK_1 + (NODE_OUT_0 - TRUNK_1) * 0.55);
    lanes.push({
      id: entry.stream.id,
      label: entry.stream.label,
      amount: entry.stream.amount,
      side: "out",
      kind: entry.kind,
      width: round(width),
      y: yNode,
      d: `M ${TRUNK_1} ${yTrunk} C ${c1} ${yTrunk} ${c2} ${yNode} ${NODE_OUT_0} ${yNode} L ${NODE_OUT_1} ${yNode}`,
    });
    rightCursor += width + GAP;
    trunkCursor += width;
  }

  return { height: round(height), lanes, trunkTop: round(trunkTop) };
}

const toneOf = (lane: Lane): string =>
  lane.kind === "kept"
    ? "text-signal"
    : lane.kind === "short"
      ? "text-danger"
      : lane.side === "in"
        ? "text-cobalt-bright"
        : "text-ink-2";

/**
 * Income enters from the left, merges into one balance trunk, and leaves to the
 * right as spend. Each ribbon is a stroked S-curve whose width is its share of
 * the month, so the fat one is the big one, and whatever spend does not take
 * stays as a "Kept" band in the signal tone (or a "Shortfall" band in danger
 * when spend wins). When the amounts change, the curve and its width re-form
 * together on `glide` — a layout settling into a new shape.
 *
 * Pointing at a ribbon reads its figure: the hit target is a fat transparent
 * stroke over the drawn one, so a four-unit ribbon is still catchable, and the
 * header swaps to that stream's label, amount and share while the ribbon
 * thickens and the rest dim. Pressing pins the reading so it survives the
 * pointer leaving; Escape releases it.
 *
 * The diagram is a `role="img"` with a written description, and every stream is
 * also a chip below it — real buttons with `aria-pressed` and a roving tabindex
 * where arrows step, Home and End jump, Enter and Space pin and Escape
 * releases — so the hover has a keyboard equal. Nothing is measured from the
 * DOM: the viewBox is scaled by its container and every coordinate is rounded
 * before it reaches an attribute. Under reduced motion the widths still re-form,
 * on a tween, and the lit ribbon brightens instead of thickening.
 */
export function CashflowRiver({
  ref,
  inflows,
  outflows,
  format = defaultFormat,
  value,
  defaultValue = null,
  onValueChange,
  onReadChange,
  label = "Cashflow",
  className,
}: CashflowRiverProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const pinned = isControlled ? value : uncontrolled;
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const chipRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const river = React.useMemo(
    () => buildRiver(inflows, outflows),
    [inflows, outflows],
  );
  const { lanes, height, trunkTop } = river;

  const totalIn = sum(inflows);
  const totalOut = sum(outflows);
  const kept = totalIn - totalOut;

  const activeId = pinned ?? hovered;
  const active = lanes.find((lane) => lane.id === activeId) ?? null;

  const report = (lane: Lane | null) => {
    onReadChange?.(
      lane ? { id: lane.id, label: lane.label, amount: lane.amount } : null,
      lane ? lane.side : null,
    );
  };

  const light = (lane: Lane | null) => {
    setHovered(lane ? lane.id : null);
    if (pinned === null) report(lane);
  };

  const pin = (lane: Lane) => {
    const next = pinned === lane.id ? null : lane.id;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
    report(next === null ? null : lane);
  };

  const release = () => {
    if (pinned === null) return;
    if (!isControlled) setUncontrolled(null);
    onValueChange?.(null);
    report(null);
  };

  const focusAt = (to: number) => {
    const clamped = Math.min(lanes.length - 1, Math.max(0, to));
    setFocusIndex(clamped);
    chipRefs.current[clamped]?.focus();
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
        focusAt(lanes.length - 1);
        break;
      case "Escape":
        if (pinned === null) break;
        event.preventDefault();
        release();
        break;
      default:
        break;
    }
  };

  const share = active
    ? active.side === "in"
      ? active.amount / Math.max(1, totalIn)
      : active.amount / Math.max(1, totalOut)
    : 0;
  const reading = active
    ? `${active.label} · ${format(active.amount)} · ${Math.round(share * 100)}% of ${
        active.side === "in" ? "income" : "spend"
      }`
    : `${format(totalIn)} in · ${format(totalOut)} out · ${
        kept >= 0 ? `${format(kept)} kept` : `${format(-kept)} short`
      }`;

  const description = `${label}. ${inflows.length} income streams totalling ${format(
    totalIn,
  )} merge into a balance and split into ${outflows.length} outgoings totalling ${format(
    totalOut,
  )}, leaving ${kept >= 0 ? `${format(kept)} kept` : `${format(-kept)} short`}.`;

  const flow = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.enter };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold">{label}</span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {kept >= 0 ? "surplus" : "deficit"}
        </span>
      </div>

      {/* The figure being read, announced once per stream. */}
      <div aria-live="polite" className="min-w-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={reading}
            className={cn(
              "font-mono text-xs font-medium tabular-nums",
              active ? toneOf(active) : "text-ink-2",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {reading}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="@container relative w-full">
        <svg
          role="img"
          aria-label={description}
          viewBox={`0 0 ${VIEW_W} ${height}`}
          className="block w-full"
        >
          <rect
            x={TRUNK_0}
            y={trunkTop}
            width={TRUNK_1 - TRUNK_0}
            height={TRUNK_H}
            rx="2"
            className="fill-surface-2 stroke-hairline-strong"
            strokeWidth="1"
          />

          {lanes.map((lane) => {
            const dim = activeId !== null && activeId !== lane.id;
            const lit = activeId === lane.id;
            return (
              <g key={lane.id} className={toneOf(lane)}>
                <motion.path
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="butt"
                  initial={false}
                  animate={{
                    d: lane.d,
                    strokeWidth:
                      lit && motionSafe ? lane.width * 1.12 : lane.width,
                    opacity: lit ? 0.95 : dim ? 0.24 : 0.62,
                  }}
                  transition={{
                    ...flow,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }}
                />
                <motion.path
                  fill="none"
                  stroke="transparent"
                  strokeWidth={HIT_W}
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  initial={false}
                  animate={{ d: lane.d }}
                  transition={flow}
                  onPointerEnter={() => light(lane)}
                  onPointerLeave={() => light(null)}
                  onClick={() => pin(lane)}
                />
              </g>
            );
          })}
        </svg>

        {/* Labels ride the nodes in HTML: the SVG's box and this overlay share
            one coordinate space, so a percentage of the height lands exactly. */}
        {lanes.map((lane) => {
          const isIn = lane.side === "in";
          return (
            <motion.span
              key={lane.id}
              aria-hidden
              className={cn(
                "pointer-events-none absolute -translate-y-1/2 truncate text-[9px] leading-none font-medium @[20rem]:text-[10px]",
                activeId === lane.id ? toneOf(lane) : "text-ink-3",
                isIn ? "text-right" : "text-left",
              )}
              style={{
                width: `${((isIn ? GUTTER - 4 : VIEW_W - NODE_OUT_1 - 4) / VIEW_W) * 100}%`,
                left: isIn ? 0 : `${((NODE_OUT_1 + 4) / VIEW_W) * 100}%`,
              }}
              initial={false}
              animate={{ top: `${((lane.y / height) * 100).toFixed(2)}%` }}
              transition={flow}
            >
              {lane.label}
            </motion.span>
          );
        })}
      </div>

      <ul
        role="list"
        aria-label={`${label} streams`}
        className="flex flex-wrap gap-1.5 border-t border-hairline pt-3"
      >
        {lanes.map((lane, index) => {
          const isActive = activeId === lane.id;
          return (
            <li key={lane.id}>
              <button
                ref={(node) => {
                  chipRefs.current[index] = node;
                }}
                type="button"
                tabIndex={index === focusIndex ? 0 : -1}
                aria-pressed={pinned === lane.id}
                aria-label={`${lane.label}, ${lane.side === "in" ? "in" : "out"}, ${format(
                  lane.amount,
                )}, ${Math.round(
                  (lane.amount /
                    Math.max(1, lane.side === "in" ? totalIn : totalOut)) *
                    100,
                )} percent of ${lane.side === "in" ? "income" : "spend"}`}
                onFocus={() => {
                  setFocusIndex(index);
                  light(lane);
                }}
                onBlur={() => light(null)}
                onPointerEnter={() => light(lane)}
                onPointerLeave={() => light(null)}
                onClick={() => pin(lane)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={cn(
                  "flex h-6 cursor-pointer items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isActive
                    ? "border-cobalt-bright bg-cobalt-wash text-foreground"
                    : "border-hairline bg-surface-2 text-ink-2 hover:border-hairline-strong",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full bg-current",
                    toneOf(lane),
                  )}
                />
                {lane.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
