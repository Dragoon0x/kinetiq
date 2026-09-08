"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One bar. `label` is printed by the caller, so no clock is read here. */
export type Candle = {
  id: string;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

/** Inclusive candle indices, low end first. */
export type CandleRange = { start: number; end: number };

export type CandleBrushProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Bars, oldest first. */
  candles: Candle[];
  /** The instrument; names the plot for assistive technology. @default "BSN/USD" */
  symbol?: string;
  /** Plot height in px. The width is fluid and measured. @default 164 */
  height?: number;
  /** Turns a price into its printed string. */
  format?: (value: number) => string;
  /** Controlled brushed range. */
  selection?: CandleRange | null;
  /** Initial brushed range for uncontrolled usage. @default null */
  defaultSelection?: CandleRange | null;
  /** Fires from the pointer or key that changed the range. */
  onSelectionChange?: (selection: CandleRange | null) => void;
  /** Fires from the pointer or key that moved the crosshair. */
  onCursorChange?: (index: number | null) => void;
  className?: string;
};

/** Explicit locale: a server and a client formatting differently would be a
 *  hydration mismatch on every price the chart reads out. */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => money.format(value);

/** Pointer travel before a press counts as a brush — protects the tap. */
const CAPTURE_PX = 4;
/** Breathing room above and below the extremes so wicks never clip. */
const PAD_Y = 10;
const STILL = { duration: 0 } as const;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/**
 * Draw a range; read the move. Each candle grows out of its own open — the body
 * scales from nothing with its transform origin pinned to the open edge, so an
 * up bar rises and a down bar drops, the only honest direction for a candle to
 * draw — on `glide` in a `cascade()` that keeps the whole chart inside the
 * choreography budget.
 *
 * Pressing in the plot drops a brush anchor and dragging sweeps a range: the
 * band's edges snap to whole candles on `snap`, everything outside dims on a
 * tween, and the readout gives the range's open, close and percent. The
 * crosshair is the third layer and snaps to the bar under the pointer on
 * `flick` rather than riding free, because what you want under your finger on
 * an OHLC chart is a bar, not a coordinate. Capture is taken only after 4px of
 * travel, inside a try/catch, so a tap sets the crosshair instead of an empty
 * range and a synthetic sweep cannot throw.
 *
 * The plot is one focusable surface: Arrows walk the crosshair, Home and End
 * jump to the ends, Space drops or lifts the anchor, Shift with an arrow
 * extends the range, and Escape clears it — a complete equivalent of the drag.
 * A polite region reads the bar in full, so every value is reachable without a
 * pointer. Width is measured with a ResizeObserver; nothing but the plot's own
 * height is reserved. Under reduced motion the candles render drawn, the
 * crosshair jumps and the band moves without a spring, while the dimming, the
 * lit range and the readout all still work.
 */
export function CandleBrush({
  ref,
  candles,
  symbol = "BSN/USD",
  height = 164,
  format = defaultFormat,
  selection,
  defaultSelection = null,
  onSelectionChange,
  onCursorChange,
  className,
}: CandleBrushProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [width, setWidth] = React.useState(0);
  const [rangeState, setRangeState] = React.useState(defaultSelection);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [anchor, setAnchor] = React.useState<number | null>(null);
  // Only the keyboard speaks. A pointer sweep crosses a bar every few pixels,
  // and a live region that narrated all of them would be unusable.
  const [byKeyboard, setByKeyboard] = React.useState(false);

  const plotRef = React.useRef<HTMLDivElement | null>(null);
  const brush = React.useRef<{ x: number; from: number; held: boolean } | null>(
    null,
  );

  const range = selection === undefined ? rangeState : selection;
  const count = candles.length;

  React.useEffect(() => {
    const element = plotRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // The observer's own callback carries the measurement, so no width is ever
    // read synchronously inside an effect body.
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  let low = Infinity;
  let high = -Infinity;
  for (const candle of candles) {
    if (candle.low < low) low = candle.low;
    if (candle.high > high) high = candle.high;
  }
  if (!Number.isFinite(low)) {
    low = 0;
    high = 1;
  }
  const span = high - low || 1;
  const inner = Math.max(1, height - PAD_Y * 2);
  const yFor = (price: number) => PAD_Y + (1 - (price - low) / span) * inner;

  const step = count > 0 ? width / count : 0;
  const bodyWidth = Math.max(2, step * 0.62);
  const centreOf = (index: number) => step * (index + 0.5);

  const setRange = (next: CandleRange | null) => {
    if (selection === undefined) setRangeState(next);
    onSelectionChange?.(next);
  };

  const setCursorAt = (index: number | null) => {
    // Guarded: a hover sweep fires a pointermove a frame, and only the bar
    // actually changing is worth telling the parent about.
    if (index === cursor) return;
    setCursor(index);
    onCursorChange?.(index);
  };

  const indexAt = (clientX: number) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || count === 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    return clamp(Math.floor(ratio * count), 0, count - 1);
  };

  const walk = (to: number, extend: boolean) => {
    const next = clamp(to, 0, Math.max(0, count - 1));
    setCursorAt(next);
    if (!extend) return;
    const from = anchor ?? next;
    setAnchor(from);
    setRange({ start: Math.min(from, next), end: Math.max(from, next) });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (count === 0) return;
    setByKeyboard(true);
    const at = cursor ?? count - 1;
    const { key, shiftKey } = event;
    if (key === "ArrowRight" || key === "ArrowUp") walk(at + 1, shiftKey);
    else if (key === "ArrowLeft" || key === "ArrowDown") walk(at - 1, shiftKey);
    else if (key === "Home") walk(0, shiftKey);
    else if (key === "End") walk(count - 1, shiftKey);
    else if (key === " " || key === "Enter") {
      // Space is the anchor: drop it once, walk, and the range follows.
      if (anchor === null) {
        setAnchor(at);
        setCursorAt(at);
        setRange({ start: at, end: at });
      } else {
        setAnchor(null);
        setRange(null);
      }
    } else if (key === "Escape") {
      setAnchor(null);
      setRange(null);
    } else return;
    event.preventDefault();
  };

  const first = range ? candles[range.start] : undefined;
  const last = range ? candles[range.end] : undefined;
  const open = first?.open ?? 0;
  const close = last?.close ?? 0;
  const move = close - open;
  const percent = open === 0 ? 0 : (move / open) * 100;
  const bar = cursor === null ? undefined : candles[cursor];

  const sentence = range
    ? `Bars ${range.start + 1} to ${range.end + 1}, open ${format(open)}, close ${format(close)}, ${move >= 0 ? "up" : "down"} ${Math.abs(percent).toFixed(2)} percent`
    : bar
      ? `Bar ${(cursor ?? 0) + 1}, ${bar.label}. Open ${format(bar.open)}, high ${format(bar.high)}, low ${format(bar.low)}, close ${format(bar.close)}`
      : `${count} bars, ${symbol}`;

  const bandX = range ? centreOf(range.start) - step / 2 : 0;
  const bandWidth = range ? (range.end - range.start + 1) * step : 0;
  const stagger = cascade(count);

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          id={`${baseId}-title`}
          className="min-w-0 truncate text-sm font-medium"
        >
          {symbol}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {count} bars
        </span>
      </div>

      <div
        role="group"
        aria-labelledby={`${baseId}-title`}
        className="flex flex-col gap-2"
      >
        <div
          ref={plotRef}
          tabIndex={0}
          role="img"
          aria-label={`${symbol} candlestick chart, ${count} bars`}
          aria-describedby={`${baseId}-hint`}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (cursor === null && count > 0) setCursorAt(count - 1);
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            setByKeyboard(false);
            event.currentTarget.focus();
            const index = indexAt(event.clientX);
            if (index === null) return;
            brush.current = { x: event.clientX, from: index, held: false };
            setCursorAt(index);
          }}
          onPointerMove={(event) => {
            const grab = brush.current;
            const index = indexAt(event.clientX);
            if (index === null) return;
            if (index !== cursor) setByKeyboard(false);
            if (!grab) {
              setCursorAt(index);
              return;
            }
            if (!grab.held) {
              if (Math.abs(event.clientX - grab.x) < CAPTURE_PX) return;
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // A synthetic sweep has no live pointer to capture; the brush
                // still tracks, so this must never throw.
              }
              grab.held = true;
              setAnchor(grab.from);
            }
            setCursorAt(index);
            setRange({
              start: Math.min(grab.from, index),
              end: Math.max(grab.from, index),
            });
          }}
          onPointerUp={(event) => {
            const grab = brush.current;
            if (!grab) return;
            try {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            } catch {
              // Already released — nothing to give back.
            }
            brush.current = null;
            // A tap is a crosshair, not an empty range: it lifts the brush.
            if (!grab.held) {
              setAnchor(null);
              setRange(null);
            }
          }}
          onPointerCancel={() => {
            brush.current = null;
          }}
          onPointerLeave={() => {
            if (!brush.current) setCursorAt(null);
          }}
          style={{ height }}
          className={cn(
            "relative w-full touch-none overflow-hidden rounded-2 outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <motion.div
            aria-hidden
            className="absolute inset-y-0 left-0 border-x border-cobalt-bright/40 bg-cobalt-wash"
            initial={false}
            animate={{
              x: bandX,
              width: bandWidth,
              opacity: range ? 1 : 0,
            }}
            transition={motionSafe ? springs.snap : STILL}
          />

          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${Math.max(1, width)} ${height}`}
            aria-hidden
            className="absolute inset-0 block"
          >
            {step > 0 &&
              candles.map((candle, index) => {
                const rising = candle.close >= candle.open;
                const top = yFor(Math.max(candle.open, candle.close));
                const bottom = yFor(Math.min(candle.open, candle.close));
                const dim =
                  range !== null && (index < range.start || index > range.end);
                // Two transitions, deliberately: the draw-in carries the
                // cascade delay, while dimming is a plain tween — a brush must
                // dim the bars it excludes at once, not 600ms later.
                const draw = motionSafe
                  ? { ...springs.glide, delay: index * stagger }
                  : STILL;
                const origin = { originX: 0.5, originY: rising ? 1 : 0 };
                return (
                  <motion.g
                    key={candle.id}
                    initial={false}
                    animate={{ opacity: dim ? 0.24 : 1 }}
                    transition={{
                      duration: motionSafe ? durations.base : durations.fast,
                      ease: easings.enter,
                    }}
                  >
                    <motion.rect
                      x={centreOf(index) - 0.5}
                      y={yFor(candle.high)}
                      width={1}
                      height={Math.max(1, yFor(candle.low) - yFor(candle.high))}
                      style={origin}
                      initial={motionSafe ? { scaleY: 0 } : false}
                      animate={{ scaleY: 1 }}
                      transition={draw}
                      className={rising ? "fill-success" : "fill-danger"}
                    />
                    {/* The body grows out of its open: origin at the bottom for
                        a rising bar, the top for a falling one. Only origin*
                        keys survive motion's transform-origin rewrite on SVG. */}
                    <motion.rect
                      x={centreOf(index) - bodyWidth / 2}
                      y={top}
                      width={bodyWidth}
                      height={Math.max(1, bottom - top)}
                      style={origin}
                      initial={motionSafe ? { scaleY: 0 } : false}
                      animate={{ scaleY: 1 }}
                      transition={draw}
                      strokeWidth={1}
                      className={
                        rising
                          ? "fill-transparent stroke-success"
                          : "fill-danger stroke-danger"
                      }
                    />
                  </motion.g>
                );
              })}
          </svg>

          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 border-l border-dashed border-ink-3"
            initial={false}
            animate={{
              x: cursor === null ? 0 : centreOf(cursor),
              opacity: cursor === null ? 0 : 1,
            }}
            transition={motionSafe ? springs.flick : STILL}
          />

          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 rounded-1 bg-ink px-1 font-mono text-[10px] leading-4 text-background tabular-nums"
            style={{ marginTop: -8 }}
            initial={false}
            animate={{
              y: bar ? yFor(bar.close) : 0,
              opacity: bar ? 1 : 0,
            }}
            transition={motionSafe ? springs.flick : STILL}
          >
            {bar ? format(bar.close) : ""}
          </motion.div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-ink-2">
            {range
              ? `Bars ${range.start + 1}–${range.end + 1}`
              : bar
                ? `Bar ${(cursor ?? 0) + 1} · ${bar.label}`
                : "Drag to read a range"}
          </span>
          <span
            className={cn(
              "shrink-0 font-mono text-xs tabular-nums",
              !range
                ? "text-ink-3"
                : move >= 0
                  ? "text-success"
                  : "text-danger",
            )}
          >
            {range
              ? `${move >= 0 ? "+" : "-"}${Math.abs(percent).toFixed(2)}%`
              : "—"}
          </span>
        </div>

        <p className="font-mono text-[10px] text-ink-3 tabular-nums">
          {range
            ? `O ${format(open)}  C ${format(close)}  Δ ${move >= 0 ? "+" : "-"}${format(Math.abs(move))}`
            : bar
              ? `O ${format(bar.open)}  H ${format(bar.high)}  L ${format(bar.low)}  C ${format(bar.close)}`
              : `Range ${format(low)} – ${format(high)}`}
        </p>
      </div>

      <span id={`${baseId}-hint`} className="sr-only">
        Arrow keys move the crosshair a bar at a time, Home and End jump to the
        ends, Space drops the brush anchor, Shift with an arrow extends the
        range, and Escape clears it.
      </span>

      <span aria-live="polite" className="sr-only">
        {byKeyboard ? sentence : ""}
      </span>
    </div>
  );
}
