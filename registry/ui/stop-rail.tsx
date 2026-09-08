"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** The three prices a trade is planned with. */
export type StopRailValue = { stop: number; entry: number; target: number };

type HandleKey = keyof StopRailValue;

export type StopRailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled prices. */
  value?: StopRailValue;
  /** Initial prices for uncontrolled usage. */
  defaultValue?: StopRailValue;
  /** Fires from the drag or key that moved a handle. */
  onValueChange?: (value: StopRailValue) => void;
  /** Left end of the rail's price domain. */
  low: number;
  /** Right end of the rail's price domain. */
  high: number;
  /** Arrow-key increment; drags snap to it. @default 0.01 */
  step?: number;
  /** Which side of entry the stop sits on. @default "long" */
  side?: "long" | "short";
  /** Units, so risk and reward read as money. @default 1 */
  size?: number;
  /** Instrument code in the header. */
  symbol?: string;
  /** Formats the risk and reward money. */
  format?: (value: number) => string;
  /** Formats the three prices. */
  formatPrice?: (value: number) => string;
  /** R at which the ratio turns `success`. @default 2 */
  goodAt?: number;
  /** Smallest distance allowed between handles. @default step * 4 */
  minGap?: number;
  /** Names the group for assistive technology. @default "Risk" */
  label?: string;
  className?: string;
};

/** An explicit locale: the server and the client must print one same string. */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const decimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Pointer travel before a press becomes a drag, so plain taps still land. */
const DRAG_SLOP = 4;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** Capture throws on a synthetic pointer id; the gesture works without it. */
const setCapture = (element: Element, pointerId: number, on: boolean) => {
  try {
    if (on) element.setPointerCapture(pointerId);
    else if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // A sweep from the test suite has no capture target; dragging continues.
  }
};

const HANDLE_TONE: Record<HandleKey, string> = {
  stop: "bg-danger",
  entry: "bg-ink",
  target: "bg-success",
};

const HANDLE_LABEL: Record<HandleKey, string> = {
  stop: "Stop",
  entry: "Entry",
  target: "Target",
};

/**
 * A trade plan you can grab. Three handles — stop, entry, target — ride one
 * price rail, and the bands between them shade the loss and the gain. Both
 * bands animate their `left` and `width` on `glide`, except while a finger is
 * down, when the transition drops to zero so a band tracks the hand exactly
 * instead of trailing it: a risk figure that lags the gesture is a risk figure
 * that lies. The R multiple eases to its new value through a motion value on
 * `snap`, so the ratio re-reads without a render per frame, and crossing
 * `goodAt` turns it and the gain band `success` on a colour tween — the reward
 * is now worth the risk, and the rail says so without moving anything.
 *
 * Each handle is a real `slider` button: arrows step, Shift or Page steps ten
 * at a time, Home and End jump to the limits its neighbours leave it, and no
 * handle may cross another. Under reduced motion nothing springs, but the
 * bands, the ratio and its colour all still change, because that is the
 * information the rail exists to carry.
 */
export function StopRail({
  ref,
  value,
  defaultValue,
  onValueChange,
  low,
  high,
  step = 0.01,
  side = "long",
  size = 1,
  symbol,
  format = (amount) => money.format(amount),
  formatPrice = (amount) => decimal.format(amount),
  goodAt = 2,
  minGap,
  label = "Risk",
  className,
}: StopRailProps) {
  const motionSafe = useMotionSafe();
  const titleId = React.useId();

  const span = Math.max(high - low, step);
  const gap = minGap ?? step * 4;
  const round = (price: number) =>
    Number((Math.round(price / step) * step).toFixed(6));

  const [uncontrolled, setUncontrolled] = React.useState<StopRailValue>(
    () =>
      defaultValue ?? {
        entry: round(low + span * 0.45),
        stop: round(low + span * (side === "long" ? 0.2 : 0.75)),
        target: round(low + span * (side === "long" ? 0.85 : 0.1)),
      },
  );
  const prices = value ?? uncontrolled;

  const [active, setActive] = React.useState<HandleKey | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    key: HandleKey;
    pointerId: number;
    startX: number;
    node: Element;
    moved: boolean;
  } | null>(null);

  // Left to right on the rail. A short simply reverses which end is which, so
  // the geometry below never has to know the difference.
  const order: HandleKey[] =
    side === "long" ? ["stop", "entry", "target"] : ["target", "entry", "stop"];

  const limitsFor = (key: HandleKey) => {
    const index = order.indexOf(key);
    const before = order[index - 1];
    const after = order[index + 1];
    return {
      min: before ? prices[before] + gap : low,
      max: after ? prices[after] - gap : high,
    };
  };

  const commit = (key: HandleKey, price: number) => {
    const { min, max } = limitsFor(key);
    const next = { ...prices, [key]: round(clamp(price, min, max)) };
    if (next[key] === prices[key]) return;
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const priceAt = (clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    return low + ratio * span;
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    key: HandleKey,
  ) => {
    if (event.button !== 0) return;
    dragRef.current = {
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      node: event.currentTarget,
      moved: false,
    };
    setActive(key);
  };

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    if (!held.moved && Math.abs(event.clientX - held.startX) > DRAG_SLOP) {
      held.moved = true;
      setDragging(true);
      // Captured only once the press has become a drag; capturing on
      // pointerdown swallows the click a tap is made of.
      setCapture(held.node, event.pointerId, true);
    }
    if (!held.moved) return;
    const price = priceAt(event.clientX);
    if (price !== null) commit(held.key, price);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const held = dragRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    setCapture(held.node, event.pointerId, false);
    dragRef.current = null;
    setDragging(false);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: HandleKey,
  ) => {
    const { min, max } = limitsFor(key);
    const coarse = event.shiftKey ? 10 : 1;
    const at = prices[key];
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = at + step * coarse;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = at - step * coarse;
    } else if (event.key === "PageUp") {
      next = at + step * 10;
    } else if (event.key === "PageDown") {
      next = at - step * 10;
    } else if (event.key === "Home") {
      next = min;
    } else if (event.key === "End") {
      next = max;
    }
    if (next === null) return;
    event.preventDefault();
    commit(key, next);
  };

  const risk = Math.abs(prices.entry - prices.stop);
  const reward = Math.abs(prices.target - prices.entry);
  const ratio = risk === 0 ? 0 : reward / risk;
  const good = ratio >= goodAt;
  const riskMoney = risk * size;
  const rewardMoney = reward * size;

  // The ratio eases between readings on `snap` rather than jumping, but it
  // tracks the finger exactly while a handle is held — for the same reason the
  // bands do: a risk figure that trails the gesture is a risk figure that lies.
  const ratioMv = useMotionValue(ratio);
  const ratioText = useTransform(ratioMv, (at) => `${at.toFixed(2)}R`);
  React.useEffect(() => {
    if (!motionSafe || dragging) {
      ratioMv.set(ratio);
      return;
    }
    const controls = animate(ratioMv, ratio, springs.snap);
    return () => controls.stop();
  }, [ratio, motionSafe, dragging, ratioMv]);

  const pct = (price: number) => clamp(((price - low) / span) * 100, 0, 100);
  const band = (a: number, b: number) => ({
    left: `${Math.min(pct(a), pct(b))}%`,
    width: `${Math.abs(pct(a) - pct(b))}%`,
  });

  const move = dragging
    ? { duration: 0 }
    : motionSafe
      ? springs.glide
      : { duration: durations.fast, ease: easings.enter };

  const valueTextFor = (key: HandleKey) =>
    `${formatPrice(prices[key])}, risk ${format(riskMoney)}, reward ${format(
      rewardMoney,
    )}, ${ratio.toFixed(2)} R`;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={titleId}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <div className="flex items-center justify-between gap-3">
        <h3
          id={titleId}
          className="flex min-w-0 items-center gap-2 font-mono text-sm font-semibold"
        >
          <span className="truncate">{symbol ?? label}</span>
          <span className="flex h-5 shrink-0 items-center rounded-1 bg-muted px-1.5 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            {side}
          </span>
        </h3>
        <motion.span
          className={cn(
            "shrink-0 font-mono text-lg leading-none font-semibold tabular-nums transition-colors",
            good ? "text-success" : "text-ink",
          )}
        >
          {ratioText}
        </motion.span>
      </div>

      <div
        className="relative h-14 w-full rounded-2 border border-hairline bg-surface-1"
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Handles are positioned inside this inset frame, so one sitting at a
            domain end still cannot overhang the rail's own box. */}
        <div ref={frameRef} className="absolute inset-y-0 right-3 left-3">
          <motion.span
            aria-hidden
            className="absolute inset-y-1 rounded-1 bg-danger/16"
            initial={false}
            animate={band(prices.stop, prices.entry)}
            transition={move}
          />
          <motion.span
            aria-hidden
            className={cn(
              "absolute inset-y-1 rounded-1 transition-colors",
              good ? "bg-success/28" : "bg-success/14",
            )}
            initial={false}
            animate={band(prices.entry, prices.target)}
            transition={move}
          />

          {order.map((key) => {
            const { min, max } = limitsFor(key);
            return (
              <motion.button
                key={key}
                type="button"
                role="slider"
                aria-label={`${HANDLE_LABEL[key]} price`}
                aria-valuemin={Number(min.toFixed(6))}
                aria-valuemax={Number(max.toFixed(6))}
                aria-valuenow={prices[key]}
                aria-valuetext={valueTextFor(key)}
                aria-orientation="horizontal"
                onKeyDown={(event) => handleKeyDown(event, key)}
                onPointerDown={(event) => beginDrag(event, key)}
                onFocus={() => setActive(key)}
                onBlur={() => setActive(null)}
                style={{ touchAction: "pan-y" }}
                initial={false}
                animate={{ left: `${pct(prices[key])}%` }}
                transition={move}
                className={cn(
                  "absolute inset-y-0 -ml-3 flex w-6 cursor-grab flex-col items-center justify-start rounded-2 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  dragging && active === key && "cursor-grabbing",
                )}
              >
                <span
                  className={cn(
                    "mt-1 size-2.5 shrink-0 rounded-full transition-transform",
                    HANDLE_TONE[key],
                    active === key ? "scale-125" : "scale-100",
                  )}
                />
                <span
                  className={cn(
                    "mt-0.5 mb-1 w-[3px] flex-1 rounded-full",
                    HANDLE_TONE[key],
                  )}
                />
              </motion.button>
            );
          })}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {order.map((key) => (
          <div key={key} className="flex min-w-0 flex-col gap-0.5">
            <dt
              className={cn(
                "flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                active === key ? "text-ink" : "text-ink-3",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  HANDLE_TONE[key],
                )}
              />
              {HANDLE_LABEL[key]}
            </dt>
            <dd className="truncate font-mono text-xs tabular-nums">
              {formatPrice(prices[key])}
            </dd>
          </div>
        ))}
      </dl>

      <dl className="grid grid-cols-2 gap-2 border-t border-hairline pt-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Risk
          </dt>
          <dd className="truncate font-mono text-sm font-medium text-danger tabular-nums">
            {format(riskMoney)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Reward
          </dt>
          <dd className="truncate font-mono text-sm font-medium text-success tabular-nums">
            {format(rewardMoney)}
          </dd>
        </div>
      </dl>

      {/* Silent while a handle is under the finger; one sentence once the
          gesture settles, and one per key step. */}
      <p role="status" className="sr-only">
        {dragging
          ? ""
          : `Risk ${format(riskMoney)}, reward ${format(rewardMoney)}, ${ratio.toFixed(2)} R`}
      </p>
    </div>
  );
}
