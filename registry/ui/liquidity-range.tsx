"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LiquidityBin = {
  /** Price this sample sits at. */
  price: number;
  /** Liquidity at that price. */
  depth: number;
};

export type LiquidityRangeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Depth samples in ascending price; their ends set the axis. */
  bins: LiquidityBin[];
  /** The market price, drawn as the marker and compared against the band. */
  price: number;
  /** Controlled band, low then high. */
  value?: [number, number];
  /** Initial band for uncontrolled usage. Defaults to the whole axis. */
  defaultValue?: [number, number];
  /** Fires on every drag frame and every keyboard step. */
  onValueChange?: (band: [number, number]) => void;
  /** Formats every price, in the readouts and in `aria-valuetext`. */
  format?: (value: number) => string;
  /** Arrow-key step. Defaults to a two-hundredth of the axis. */
  step?: number;
  /** What a price is quoted in, e.g. "FRN per BSN". Spoken, not printed twice. */
  unit?: string;
  /** Plot height in px; the width is fluid and measured. @default 96 */
  height?: number;
  /** Visible heading. Omit it and pass `aria-label`. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** Travel before a press becomes a drag, so a click on the plot still lands. */
const DRAG_SLOP = 4;
/** Shift, PageUp and PageDown move ten steps at a time. */
const COARSE = 10;

const prices = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => prices.format(value);

/** Rounded before it reaches an attribute: Node and the browser can disagree in
 *  the last digits, and a mismatched attribute is a hydration error. */
const round = (value: number) => Number(value.toFixed(3));

const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointers have no capture target; the drag continues.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab has no rAF, so the pulse stops rather than burning frames. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/** One drawing of the depth curve, sized by its container. */
function Curve({
  d,
  width,
  height,
  className,
}: {
  d: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      viewBox={`0 0 ${round(width)} ${round(height)}`}
      className="absolute inset-0 block"
    >
      <path d={d} className={className} />
    </svg>
  );
}

/** Measured in the observer rather than read during render. */
function useBoxWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = node.offsetWidth;
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/**
 * A price axis with the pool's depth drawn as a filled curve, and two handles
 * that say where your capital sits. The curve is drawn twice — dim across the
 * whole axis, bright inside a clip keyed to the band — so the earning stretch is
 * literally the same curve lit. Dragging tracks the pointer 1:1 with no spring,
 * because a handle that lags the finger lies about where it will land, while a
 * keyboard step glides the band into place on `snap`.
 *
 * The market price is a marker across the plot: inside the band its halo
 * breathes on a slow reversing tween that stops with the document, and outside
 * it the halo goes out and the readout says the position has stopped earning.
 * The share of depth between the handles counts to its new figure from a motion
 * value on `snap`. A press captures the pointer only after 4px of travel, so a
 * plain click still moves the nearer handle, and the handles stop one step apart
 * rather than crossing. Under reduced motion the marker holds a steady halo and
 * nothing springs — the lit stretch still lights, because that is the point.
 */
export function LiquidityRange({
  ref,
  bins,
  price,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  step,
  unit,
  height = 96,
  label,
  className,
  "aria-label": ariaLabel,
}: LiquidityRangeProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const plotRef = React.useRef<HTMLDivElement>(null);
  const handleRefs = React.useRef<(HTMLSpanElement | null)[]>([]);
  const width = useBoxWidth(plotRef);

  const min = bins[0]?.price ?? 0;
  const max = bins[bins.length - 1]?.price ?? 1;
  const span = max - min || 1;
  const stepSafe = step && step > 0 ? step : span / 200;

  const clamp = React.useCallback(
    (raw: number) => Math.min(max, Math.max(min, raw)),
    [min, max],
  );
  const order = React.useCallback(
    (band: [number, number]): [number, number] => {
      const lo = clamp(Math.min(band[0], band[1]));
      const hi = clamp(Math.max(band[0], band[1]));
      return [lo, Math.max(hi, Math.min(max, lo + stepSafe))];
    },
    [clamp, max, stepSafe],
  );

  const [uncontrolled, setUncontrolled] = React.useState<[number, number]>(() =>
    order(defaultValue ?? [min, max]),
  );
  const isControlled = value !== undefined;
  const current = isControlled ? order(value) : uncontrolled;
  const [lo, hi] = current;

  const emit = (next: [number, number]) => {
    if (next[0] === lo && next[1] === hi) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  /** The handles stop one step apart: a band with no width earns nothing. */
  const setHandle = (index: number, raw: number) => {
    const at = clamp(raw);
    if (index === 0) emit([Math.min(at, hi - stepSafe), hi]);
    else emit([lo, Math.max(at, lo + stepSafe)]);
  };

  const inRange = price >= lo && price <= hi;

  const totalDepth = bins.reduce((sum, bin) => sum + Math.max(0, bin.depth), 0);
  const bandDepth = bins.reduce(
    (sum, bin) =>
      bin.price >= lo && bin.price <= hi ? sum + Math.max(0, bin.depth) : sum,
    0,
  );
  const depthShare = totalDepth > 0 ? bandDepth / totalDepth : 0;

  const shareMv = useMotionValue(depthShare);
  const shareText = useTransform(
    shareMv,
    (fraction) => `${Math.round(fraction * 100)}`,
  );
  React.useEffect(() => {
    if (!motionSafe) {
      shareMv.set(depthShare);
      return;
    }
    const controls = animate(shareMv, depthShare, springs.snap);
    return () => controls.stop();
  }, [depthShare, motionSafe, shareMv]);

  const pct = (at: number) => ((at - min) / span) * 100;

  const peak = bins.reduce((tallest, bin) => Math.max(tallest, bin.depth), 0);
  const curve = React.useMemo(() => {
    if (width <= 0 || bins.length === 0 || peak <= 0) return "";
    const scale = peak > 0 ? peak : 1;
    const points = bins.map((bin) => {
      const x = round(((bin.price - min) / span) * width);
      const y = round(height - (Math.max(0, bin.depth) / scale) * (height - 4));
      return `${x} ${y}`;
    });
    return `M 0 ${round(height)} L ${points.join(" L ")} L ${round(width)} ${round(
      height,
    )} Z`;
  }, [bins, width, peak, min, span, height]);

  const dragRef = React.useRef<{
    index: number;
    pointerId: number;
    startX: number;
    rect: DOMRect;
    engaged: boolean;
  } | null>(null);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const dragging = dragIndex !== null;

  const priceFromX = (clientX: number, rect: DOMRect) => {
    if (rect.width === 0) return min;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return min + t * span;
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const amount = stepSafe * (event.shiftKey ? COARSE : 1);
    const from = index === 0 ? lo : hi;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = from + amount;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = from - amount;
        break;
      case "PageUp":
        next = from + stepSafe * COARSE;
        break;
      case "PageDown":
        next = from - stepSafe * COARSE;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    setHandle(index, next);
  };

  // A dragged handle tracks the pointer with no transition at all, and reduced
  // motion gets the same: a slider that eases to its value is a slider that
  // travels, and the value is the only thing that has to arrive.
  const moveTransition =
    dragging || !motionSafe ? { duration: 0 } : springs.snap;

  const bandLeft = pct(lo);
  const bandWidth = Math.max(pct(hi) - pct(lo), 0);
  const bandLeftPx = round((bandLeft / 100) * width);
  const bandWidthPx = round((bandWidth / 100) * width);
  const pulsing = inRange && motionSafe && visible;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {label ? (
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        ) : null}
        <span className="flex shrink-0 items-baseline gap-1 font-mono text-xs font-medium tabular-nums">
          <motion.span>{shareText}</motion.span>%
          <span className="text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            depth
          </span>
        </span>
      </div>

      <div
        ref={plotRef}
        className="relative w-full touch-pan-y select-none"
        style={{ height }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const raw = priceFromX(event.clientX, rect);
          const index = Math.abs(raw - lo) <= Math.abs(raw - hi) ? 0 : 1;
          dragRef.current = {
            index,
            pointerId: event.pointerId,
            startX: event.clientX,
            rect,
            engaged: false,
          };
          setDragIndex(index);
          setHandle(index, raw);
          handleRefs.current[index]?.focus();
        }}
        onPointerMove={(event) => {
          const held = dragRef.current;
          if (!held || held.pointerId !== event.pointerId) return;
          if (!held.engaged) {
            if (Math.abs(event.clientX - held.startX) <= DRAG_SLOP) return;
            held.engaged = true;
            // Captured only now, so a plain click is never swallowed.
            capturePointer(event.currentTarget, event.pointerId);
          }
          setHandle(held.index, priceFromX(event.clientX, held.rect));
        }}
        onPointerUp={(event) => {
          releasePointer(event.currentTarget, event.pointerId);
          dragRef.current = null;
          setDragIndex(null);
        }}
        onPointerCancel={(event) => {
          releasePointer(event.currentTarget, event.pointerId);
          dragRef.current = null;
          setDragIndex(null);
        }}
      >
        <motion.span
          aria-hidden
          className="absolute inset-y-0 rounded-1 bg-cobalt-wash"
          initial={false}
          animate={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
          transition={moveTransition}
        />

        {width > 0 && curve ? (
          <>
            <Curve
              d={curve}
              width={width}
              height={height}
              className="fill-hairline-strong"
            />
            {/* The lit stretch is the same curve behind a window, not a second
                drawing: the window and the copy inside it run one identical
                transition in opposite directions, so they never shear apart —
                and nothing has to animate an SVG attribute to do it. */}
            <motion.span
              aria-hidden
              className="absolute inset-y-0 overflow-hidden"
              initial={false}
              animate={{ left: bandLeftPx, width: bandWidthPx }}
              transition={moveTransition}
            >
              <motion.span
                className="absolute inset-y-0 block"
                style={{ width }}
                initial={false}
                animate={{ left: -bandLeftPx }}
                transition={moveTransition}
              >
                <Curve
                  d={curve}
                  width={width}
                  height={height}
                  className={cn(
                    "transition-colors duration-150",
                    inRange ? "fill-cobalt-bright" : "fill-ink-3",
                  )}
                />
              </motion.span>
            </motion.span>
          </>
        ) : null}

        {/* The marker breathes only while it is earning; out of range it holds
            still, so the state is visible without reading the words. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-foreground"
          style={{ left: `${Math.min(100, Math.max(0, pct(price)))}%` }}
        >
          <motion.span
            className={cn(
              "absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full",
              inRange ? "bg-signal" : "bg-transparent",
            )}
            animate={
              pulsing
                ? { opacity: [0.55, 0.12] }
                : { opacity: inRange ? 0.4 : 0 }
            }
            transition={
              pulsing
                ? {
                    duration: 1.6,
                    ease: easings.move,
                    repeat: Infinity,
                    repeatType: "reverse",
                  }
                : { duration: durations.fast }
            }
          />
        </span>

        {([0, 1] as const).map((index) => {
          const at = index === 0 ? lo : hi;
          return (
            <motion.span
              key={index}
              ref={(node) => {
                handleRefs.current[index] = node;
              }}
              role="slider"
              tabIndex={0}
              aria-label={index === 0 ? "Range minimum" : "Range maximum"}
              aria-orientation="horizontal"
              aria-valuemin={index === 0 ? min : lo}
              aria-valuemax={index === 0 ? hi : max}
              aria-valuenow={Number(at.toFixed(4))}
              aria-valuetext={unit ? `${format(at)} ${unit}` : format(at)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 cursor-grab rounded-full bg-primary outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                dragIndex === index && "cursor-grabbing",
              )}
              initial={false}
              animate={{ left: `${pct(at)}%` }}
              transition={moveTransition}
            >
              <span
                aria-hidden
                className="absolute top-0 left-1/2 size-3.5 -translate-x-1/2 rounded-full border-2 border-primary bg-surface-0"
              />
            </motion.span>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>

      <div
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex items-center justify-between gap-2 border-t border-hairline pt-2.5 font-mono text-[11px] tabular-nums"
      >
        <span>
          {format(lo)}
          <span className="mx-1 text-ink-3">–</span>
          {format(hi)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 text-[10px] tracking-[0.08em] uppercase",
            inRange ? "text-success" : "text-warn",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              inRange ? "bg-success" : "bg-warn",
            )}
          />
          {inRange ? "In range" : "Out of range"}
        </span>
      </div>

      {/* Only the earning state is announced, and its wording holds still while
          a handle is dragged: the handles already speak through aria-valuetext,
          and a covered-depth figure in here would re-announce every frame. */}
      <span role="status" className="sr-only">
        {inRange
          ? `Price ${format(price)} is inside the band.`
          : `Price ${format(price)} is outside the band. The position is not earning.`}
      </span>
      <span className="sr-only">
        {Math.round(depthShare * 100)} percent of pool depth is covered by the
        band.
      </span>

      <ul className="sr-only">
        {bins.map((bin) => (
          <li key={bin.price}>
            {format(bin.price)}: {Math.round(bin.depth)}
          </li>
        ))}
      </ul>
    </div>
  );
}
