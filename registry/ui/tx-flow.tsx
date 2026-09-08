"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One side of the transaction. `kind: "fee"` marks the leg taken by the ledger. */
export type TxLeg = {
  id: string;
  address: string;
  amount: number;
  label?: string;
  kind?: "spend" | "fee";
};

export type TxFlowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Addresses the transaction spends from, top to bottom. */
  inputs: TxLeg[];
  /** Addresses it pays, top to bottom. One may carry `kind: "fee"`. */
  outputs: TxLeg[];
  /** Formats every amount on the diagram. @default four decimal places */
  format?: (value: number) => string;
  /** Asset ticker printed after amounts. @default "BSN" */
  asset?: string;
  /** Controlled pinned leg id. */
  value?: string | null;
  /** Initial pinned leg id for uncontrolled use. */
  defaultValue?: string | null;
  /** Fires from the press or Escape that pinned or released a leg. */
  onValueChange?: (id: string | null) => void;
  /** Fires from the pointer or focus that lit a leg. */
  onHoverChange?: (id: string | null) => void;
  /** Marches the dashes. Still gated by reduced motion and tab visibility. @default true */
  flowing?: boolean;
  /** Names the diagram for assistive technology. @default "Transaction" */
  label?: string;
  className?: string;
};

const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const defaultFormat = (value: number): string => AMOUNT.format(value);

/** Trigonometry-free, but rounded all the same: an attribute that differs in
 *  the last digit between the server and the browser is a hydration error. */
const round = (value: number): number => Number(value.toFixed(3));

/** Dash cell in px; one march moves the stroke exactly two cells. */
const DASH = 6;
/** Seconds for one march. Slow enough to read as flow, not as a barber pole. */
const MARCH_S = 1.1;
/** Half the hub's width in px. */
const HUB = 6;

type Geometry = { w: number; h: number; ins: number[]; outs: number[] };

const EMPTY: Geometry = { w: 0, h: 0, ins: [], outs: [] };

const sum = (legs: TxLeg[]): number =>
  legs.reduce((total, leg) => total + Math.max(0, leg.amount), 0);

/**
 * One transaction, drawn. Every input curves into the hub and every output
 * curves out of it, each edge weighted by that leg's share of the total, so the
 * fat curve is the big one. Value marches along the edges as a dashed stroke on
 * a linear tween — the only loop in the component, and it runs only while
 * `flowing` is set, the tab is visible, and motion is welcome.
 *
 * Pointing at an edge lights it: the hit area is a fat transparent stroke over
 * the drawn one, so a two-pixel curve is still catchable. The leg's row lights
 * with it and the readout beneath names the address and the amount, because the
 * edge and the row are one selection. Pressing a row pins it so the reading
 * survives the pointer leaving; Escape releases it.
 *
 * The geometry is measured, never assumed: a ResizeObserver reports the gutter's
 * box and each row's centre from its own callback, and every coordinate is
 * rounded before it reaches an attribute. Rows carry a roving tabindex — Up and
 * Down move within a column, Left and Right cross to the other column, Home and
 * End jump to the ends. Under reduced motion the dashes hold still and each
 * leg's share still reads in its stroke weight.
 */
export function TxFlow({
  ref,
  inputs,
  outputs,
  format = defaultFormat,
  asset = "BSN",
  value,
  defaultValue = null,
  onValueChange,
  onHoverChange,
  flowing = true,
  label = "Transaction",
  className,
}: TxFlowProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const pinned = isControlled ? value : uncontrolled;
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const [geom, setGeom] = React.useState<Geometry>(EMPTY);

  // Nothing marches to an empty room: the dashes stop while the tab is hidden.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const legs = React.useMemo(
    () => [
      ...inputs.map((leg) => ({ leg, side: "in" as const })),
      ...outputs.map((leg) => ({ leg, side: "out" as const })),
    ],
    [inputs, outputs],
  );

  const gutterRef = React.useRef<HTMLDivElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLLIElement>());
  const buttonRefs = React.useRef(new Map<string, HTMLButtonElement>());

  // A stable dependency: the caller may rebuild the arrays every render, and
  // re-observing on each of those would thrash the observer.
  const idKey = legs.map((entry) => entry.leg.id).join(" ");

  React.useEffect(() => {
    const gutter = gutterRef.current;
    if (!gutter) return;
    const ids = idKey.split(" ").filter(Boolean);

    // Measured in the observer's own callback, which is also what runs on the
    // first observe — so nothing reads layout during render or in an effect
    // body, and adding a row re-measures without a second code path.
    const measure = () => {
      const box = gutter.getBoundingClientRect();
      if (box.height <= 0 || box.width <= 0) return;
      const centre = (id: string): number | null => {
        const node = rowRefs.current.get(id);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return round(rect.top - box.top + rect.height / 2);
      };
      const inCount = inputs.length;
      const ys = ids.map(centre);
      if (ys.some((y) => y === null)) return;
      const next: Geometry = {
        w: round(box.width),
        h: round(box.height),
        ins: ys.slice(0, inCount) as number[],
        outs: ys.slice(inCount) as number[],
      };
      setGeom((current) =>
        current.w === next.w &&
        current.h === next.h &&
        current.ins.join() === next.ins.join() &&
        current.outs.join() === next.outs.join()
          ? current
          : next,
      );
    };

    const observer = new ResizeObserver(measure);
    observer.observe(gutter);
    for (const id of ids) {
      const node = rowRefs.current.get(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [idKey, inputs.length]);

  const activeId = pinned ?? hovered ?? focused;

  // Pointer and focus light a leg independently, so a keyboard reader keeps its
  // edge lit while the mouse wanders off, and the report is computed in the
  // handler that caused it rather than after the fact.
  const report = (
    nextHover: string | null | undefined,
    nextFocus: string | null | undefined,
  ) => {
    const h = nextHover === undefined ? hovered : nextHover;
    const f = nextFocus === undefined ? focused : nextFocus;
    const next = pinned ?? h ?? f;
    if (next !== activeId) onHoverChange?.(next);
  };

  const hover = (id: string | null) => {
    if (id === hovered) return;
    report(id, undefined);
    setHovered(id);
  };

  const pick = (id: string) => {
    const next = pinned === id ? null : id;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const release = () => {
    if (pinned === null) return;
    if (!isControlled) setUncontrolled(null);
    onValueChange?.(null);
  };

  const focusAt = (to: number) => {
    const clamped = Math.min(legs.length - 1, Math.max(0, to));
    const target = legs[clamped];
    if (!target) return;
    setFocusIndex(clamped);
    buttonRefs.current.get(target.leg.id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const inCount = inputs.length;
    const isInput = index < inCount;
    const row = isInput ? index : index - inCount;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(
          isInput
            ? Math.min(inCount - 1, index + 1)
            : Math.min(legs.length - 1, index + 1),
        );
        break;
      case "ArrowUp":
        event.preventDefault();
        focusAt(
          isInput ? Math.max(0, index - 1) : Math.max(inCount, index - 1),
        );
        break;
      case "ArrowRight":
        event.preventDefault();
        if (isInput && outputs.length > 0) {
          focusAt(inCount + Math.min(outputs.length - 1, row));
        }
        break;
      case "ArrowLeft":
        event.preventDefault();
        if (!isInput && inCount > 0) focusAt(Math.min(inCount - 1, row));
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(legs.length - 1);
        break;
      case "Escape":
        release();
        break;
      default:
        break;
    }
  };

  const totalIn = sum(inputs);
  const fee = sum(outputs.filter((leg) => leg.kind === "fee"));
  // Paid out, fee excluded: a transaction reconciles as in = out + fee, and a
  // footer that folded the fee into "out" could never show the drift.
  const totalOut = sum(outputs.filter((leg) => leg.kind !== "fee"));
  const drift = round(totalIn - totalOut - fee);
  const balanced = Math.abs(drift) < 0.00005;
  const scale = Math.max(totalIn, totalOut + fee, 1e-9);

  const weightOf = (leg: TxLeg) =>
    round(1.4 + Math.min(1, Math.max(0, leg.amount / scale)) * 4.2);

  const marching = motionSafe && flowing && visible;
  const ready = geom.w > 0 && geom.h > 0;
  const midY = round(geom.h / 2);
  const hubL = round(geom.w / 2 - HUB);
  const hubR = round(geom.w / 2 + HUB);

  const pathFor = (side: "in" | "out", y: number): string =>
    side === "in"
      ? `M0 ${y} C${round(geom.w * 0.3)} ${y} ${round(geom.w * 0.28)} ${midY} ${hubL} ${midY}`
      : `M${hubR} ${midY} C${round(geom.w * 0.72)} ${midY} ${round(geom.w * 0.7)} ${y} ${geom.w} ${y}`;

  const active = legs.find((entry) => entry.leg.id === activeId) ?? null;
  const activeRow = active
    ? active.side === "in"
      ? inputs.findIndex((leg) => leg.id === active.leg.id)
      : outputs.findIndex((leg) => leg.id === active.leg.id)
    : -1;

  const readout = active
    ? `${
        active.leg.kind === "fee"
          ? "Network fee"
          : `${active.side === "in" ? "Input" : "Output"} ${activeRow + 1}`
      } · ${active.leg.address} · ${format(active.leg.amount)} ${asset}`
    : `In ${format(totalIn)} · out ${format(totalOut)} · fee ${format(fee)} ${asset}`;

  const renderColumn = (side: "in" | "out", list: TxLeg[]) => (
    <ul
      aria-label={side === "in" ? `${label} inputs` : `${label} outputs`}
      className="flex min-w-0 flex-1 flex-col justify-center gap-1.5"
    >
      {list.map((leg, row) => {
        const index = side === "in" ? row : inputs.length + row;
        const isActive = activeId === leg.id;
        const isFee = leg.kind === "fee";
        const name =
          leg.label ??
          (isFee
            ? "Network fee"
            : `${side === "in" ? "Input" : "Output"} ${row + 1}`);
        return (
          <li
            key={leg.id}
            ref={(node) => {
              if (node) rowRefs.current.set(leg.id, node);
              else rowRefs.current.delete(leg.id);
            }}
          >
            <button
              type="button"
              ref={(node) => {
                if (node) buttonRefs.current.set(leg.id, node);
                else buttonRefs.current.delete(leg.id);
              }}
              tabIndex={
                index === Math.min(focusIndex, legs.length - 1) ? 0 : -1
              }
              aria-pressed={pinned === leg.id}
              aria-label={`${name}, ${leg.address}, ${format(leg.amount)} ${asset}`}
              onClick={() => pick(leg.id)}
              onFocus={() => {
                setFocusIndex(index);
                report(undefined, leg.id);
                setFocused(leg.id);
              }}
              onBlur={() => {
                report(undefined, null);
                setFocused(null);
              }}
              onKeyDown={(event) => onKeyDown(event, index)}
              onPointerEnter={() => hover(leg.id)}
              onPointerLeave={() => hover(null)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-2 border px-2 py-1.5 text-left transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                isActive
                  ? "border-cobalt-bright bg-cobalt-wash"
                  : "border-hairline-strong bg-surface-1 hover:bg-accent",
              )}
            >
              <span
                aria-hidden
                className="truncate font-mono text-[10px] text-ink-3"
              >
                {isFee ? name : leg.address}
              </span>
              <span
                aria-hidden
                className={cn(
                  "truncate font-mono text-[11px] font-medium tabular-nums",
                  isFee ? "text-ink-3" : "text-ink",
                )}
              >
                {format(leg.amount)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-card p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          id={labelId}
          className="min-w-0 truncate text-[11px] font-medium text-ink-2"
        >
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {asset}
        </span>
      </div>

      <div className="flex items-stretch gap-2">
        {renderColumn("in", inputs)}

        <div ref={gutterRef} className="relative w-14 shrink-0">
          {ready ? (
            <svg
              aria-hidden
              viewBox={`0 0 ${geom.w} ${geom.h}`}
              className="pointer-events-none absolute inset-0 size-full"
            >
              {legs.map(({ leg, side }, index) => {
                const y =
                  side === "in"
                    ? geom.ins[index]
                    : geom.outs[index - inputs.length];
                if (y === undefined) return null;
                const d = pathFor(side, y);
                const isActive = activeId === leg.id;
                const weight = weightOf(leg);
                return (
                  <g key={leg.id}>
                    <motion.path
                      d={d}
                      fill="none"
                      strokeLinecap="round"
                      stroke="currentColor"
                      strokeDasharray={marching ? `${DASH} ${DASH}` : undefined}
                      className={cn(
                        "transition-colors",
                        isActive
                          ? "text-cobalt-bright"
                          : leg.kind === "fee"
                            ? "text-ink-3"
                            : "text-hairline-strong",
                      )}
                      // Never initial={false} here: with a keyframe array that
                      // would seat the stroke at the last frame and the march
                      // would never start.
                      initial={{ opacity: 0 }}
                      animate={{
                        strokeWidth: isActive ? weight + 1.6 : weight,
                        opacity: activeId && !isActive ? 0.4 : 1,
                        strokeDashoffset: marching ? [0, -DASH * 2] : 0,
                      }}
                      transition={{
                        strokeWidth: motionSafe
                          ? springs.glide
                          : { duration: durations.fast },
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
                        strokeDashoffset: marching
                          ? {
                              duration: MARCH_S,
                              ease: easings.linear,
                              repeat: Infinity,
                            }
                          : { duration: 0 },
                      }}
                    />
                    {/* A fat transparent stroke over the drawn one: a 2px curve
                        is otherwise impossible to point at. */}
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={12}
                      style={{ pointerEvents: "stroke" }}
                      onPointerEnter={() => hover(leg.id)}
                      onPointerLeave={() => hover(null)}
                      onClick={() => pick(leg.id)}
                    />
                  </g>
                );
              })}
              <rect
                x={hubL}
                y={round(midY - HUB)}
                width={HUB * 2}
                height={HUB * 2}
                rx={3}
                className="fill-surface-2 stroke-hairline-strong"
                strokeWidth={1}
              />
            </svg>
          ) : null}
        </div>

        {renderColumn("out", outputs)}
      </div>

      <p
        aria-hidden
        className="truncate border-t border-hairline pt-2 font-mono text-[10px] text-ink-3"
        title={readout}
      >
        {readout}
      </p>

      {!balanced ? (
        <p className="font-mono text-[10px] text-danger">
          Unbalanced by {format(Math.abs(drift))} {asset}
        </p>
      ) : null}

      <span role="status" className="sr-only">
        {balanced
          ? `${label} balanced: in ${format(totalIn)} ${asset}, out ${format(totalOut)} ${asset}, fee ${format(fee)} ${asset}.`
          : `${label} unbalanced by ${format(Math.abs(drift))} ${asset}.`}
      </span>
    </div>
  );
}
