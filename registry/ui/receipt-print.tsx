"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReceiptLine = {
  id: string;
  label: string;
  amount?: number;
  /** Items print plain; the total sits under a rule; a note is centred small. @default "item" */
  kind?: "item" | "total" | "note";
};

export type ReceiptPrintProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The lines, top to bottom. */
  lines: ReceiptLine[];
  /** Turning it on prints from the first line; turning it off clears the mouth. */
  printing: boolean;
  /** Fires from the timer that printed the last line. */
  onPrinted?: () => void;
  /** Fires from the release or key that tore the receipt away. */
  onTear?: () => void;
  /** Milliseconds between lines. @default 160 */
  interval?: number;
  /** The merchant's name, at the head of the paper. @default "Receipt" */
  header?: string;
  /** Formats every amount the paper prints. */
  format?: (value: number) => string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same figure, which is a
 * hydration mismatch on the number at the foot of the receipt.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => money.format(value);

/** Pointer travel before a press on the paper becomes a pull. */
const SLOP = 4;
/** The pull, after resistance, at which the perforation gives. */
const TEAR_AT = 44;
/** Paper does not follow the hand one to one; it stretches, then goes. */
const RESISTANCE = 0.6;
/** Bars in the procedural barcode and the width each can take. */
const BARS = 30;

/**
 * A deterministic bar pattern from the header, laid out in integer units, so
 * the server and the browser print the same code.
 */
const barcodeOf = (seedText: string) => {
  let seed = 7;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = (seed * 31 + seedText.charCodeAt(index)) % 2147483647;
  }
  let cursor = 0;
  const rects = Array.from({ length: BARS }, () => {
    seed = (seed * 48271) % 2147483647;
    const width = 1 + (seed % 3);
    const rect = { x: cursor, width };
    cursor += width + 1;
    return rect;
  });
  const code = rects
    .slice(0, 12)
    .map((rect) => rect.width)
    .join("")
    .replace(/(\d{4})(?=\d)/g, "$1 ");
  return { rects, width: cursor, code };
};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => typeof document === "undefined" || !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the printer waits where nobody is watching. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
}

/** Keeps callbacks out of effect dependencies so a re-render never restarts the feed. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * A till receipt out of a printer mouth. When `printing` turns on, lines feed
 * out one at a time on a timer that pauses while the document is hidden: each
 * arrives from 4px above on `flick` and the paper's height grows with it,
 * measured by a ResizeObserver and animated on `glide`, so no paper is ever
 * reserved. The last line is a procedural barcode; once it has printed the
 * receipt becomes tearable. Pulling it down follows the hand with resistance
 * (capture only after 4px), and past the tear distance it comes away — the
 * sheet leaves on the exit ease, never a spring, because a tear does not
 * bounce. A short pull springs back on `snap`. A Tear off button tears by
 * keyboard. Under reduced motion lines still appear on the same timer, opacity
 * only, and a tear fades the sheet instead of dropping it.
 */
export function ReceiptPrint({
  ref,
  lines,
  printing,
  onPrinted,
  onTear,
  interval = 160,
  header = "Receipt",
  format = defaultFormat,
  className,
}: ReceiptPrintProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();
  const baseId = React.useId();
  const headerId = `${baseId}-header`;
  const onPrintedRef = useLatest(onPrinted);
  const onTearRef = useLatest(onTear);

  // The barcode counts as the last line, so "printed" means the code is out.
  const steps = lines.length + 1;
  const [printed, setPrinted] = React.useState(0);
  const [torn, setTorn] = React.useState(false);

  // A flip of `printing` in either direction starts a fresh sheet. Adjusting
  // state during render (not in an effect) keeps the reset in the same commit
  // as the prop that asked for it.
  const [seen, setSeen] = React.useState(printing);
  if (seen !== printing) {
    setSeen(printing);
    setPrinted(0);
    setTorn(false);
  }

  const done = printed >= steps;
  const ready = printing && done && !torn;

  // One timeout per line, re-armed by the count it just raised, so hiding the
  // tab simply stops arming the next one and showing it picks up where it was.
  React.useEffect(() => {
    if (!printing || torn || done || !visible) return;
    const timer = window.setTimeout(() => {
      const next = printed + 1;
      setPrinted(next);
      if (next >= steps) onPrintedRef.current?.();
    }, interval);
    return () => window.clearTimeout(timer);
  }, [printing, torn, done, visible, printed, steps, interval, onPrintedRef]);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pull = useMotionValue(0);
  const settling = React.useRef<AnimationPlaybackControls | null>(null);
  const gesture = React.useRef<{
    id: number;
    startY: number;
    dragging: boolean;
  } | null>(null);
  React.useEffect(() => () => settling.current?.stop(), []);

  const tear = () => {
    if (!ready) return;
    settling.current?.stop();
    setTorn(true);
    onTearRef.current?.();
  };

  const release = () => {
    settling.current?.stop();
    if (!motionSafe) {
      pull.set(0);
      return;
    }
    settling.current = animate(pull, 0, springs.snap);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !ready) return;
    settling.current?.stop();
    gesture.current = {
      id: event.pointerId,
      startY: event.clientY,
      dragging: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    const dy = event.clientY - active.startY;
    if (!active.dragging) {
      if (Math.abs(dy) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a pull — and never let a
        // synthetic sweep from a test suite throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    pull.set(Math.max(0, dy) * RESISTANCE);
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
    if (!active.dragging) return;
    if (pull.get() >= TEAR_AT) tear();
    else release();
  };

  const barcode = barcodeOf(header);

  const heightMove = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const lineEnter = motionSafe
    ? springs.flick
    : { duration: durations.fast, ease: easings.enter };

  const state = torn
    ? "Torn off"
    : ready
      ? "Printed"
      : printing
        ? "Printing"
        : "Ready";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div className="flex h-6 items-center justify-between gap-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span id={headerId} className="min-w-0 truncate">
          {header}
        </span>
        <span role="status" className="shrink-0">
          {state}
        </span>
      </div>

      {/* The mouth: the paper comes out from under it, so it sits above the
          sheet in the stack and the perforation is the first thing printed. */}
      <div className="relative z-10 h-4 rounded-2 bg-ink-2">
        <span
          aria-hidden
          className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-surface-0/40"
        />
      </div>

      {/* Pulled up under the mouth by the gap plus the inner padding, so the
          sheet's top edge sits exactly at the mouth's lip. */}
      <motion.div
        className="-mt-5 overflow-hidden px-2"
        initial={false}
        animate={{ height }}
        transition={heightMove}
      >
        <div ref={innerRef} className="pt-3">
          {/* The pull is reset once a torn sheet has left, so the next sheet
              never mounts already dragged down. */}
          <AnimatePresence initial={false} onExitComplete={() => pull.set(0)}>
            {printing && !torn ? (
              <motion.div
                key="sheet"
                role="region"
                aria-labelledby={headerId}
                style={{ y: pull }}
                exit={
                  motionSafe
                    ? {
                        y: distances.shift * 2,
                        opacity: 0,
                        rotate: 1.5,
                        transition: exitFor(durations.slow),
                      }
                    : { opacity: 0, transition: exitFor(durations.base) }
                }
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endGesture}
                onPointerCancel={endGesture}
                onLostPointerCapture={endGesture}
                onPointerLeave={() => {
                  if (gesture.current?.dragging === false)
                    gesture.current = null;
                }}
                className={cn(
                  "flex flex-col border-x border-t border-dashed border-hairline-strong bg-surface-0 pb-1 shadow-sm select-none",
                  ready && "cursor-grab touch-none active:cursor-grabbing",
                )}
              >
                <p className="px-3 pt-3 pb-1 text-center text-xs font-semibold tracking-[0.06em] text-ink uppercase">
                  {header}
                </p>
                <ul className="flex flex-col px-3 py-1">
                  {lines.slice(0, printed).map((line) => {
                    const kind = line.kind ?? "item";
                    return (
                      <motion.li
                        key={line.id}
                        initial={
                          motionSafe
                            ? { opacity: 0, y: -distances.nudge }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={lineEnter}
                        className={cn(
                          "flex items-baseline gap-3 font-mono text-[11px] leading-5 text-ink-2",
                          kind === "total" &&
                            "mt-1 border-t border-dashed border-hairline-strong pt-1 font-semibold text-ink",
                          kind === "note" && "justify-center pt-1 text-ink-3",
                          kind !== "note" && "justify-between",
                        )}
                      >
                        <span className="min-w-0 truncate">{line.label}</span>
                        {line.amount !== undefined ? (
                          <span className="shrink-0 tabular-nums">
                            {format(line.amount)}
                          </span>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </ul>

                {done ? (
                  <motion.div
                    aria-hidden
                    initial={
                      motionSafe
                        ? { opacity: 0, y: -distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={lineEnter}
                    className="flex flex-col items-center gap-1 px-6 pt-2 pb-1"
                  >
                    <svg
                      viewBox={`0 0 ${barcode.width} 10`}
                      preserveAspectRatio="none"
                      className="h-6 w-full text-ink"
                    >
                      {barcode.rects.map((rect, index) => (
                        <rect
                          key={index}
                          x={rect.x}
                          y={0}
                          width={rect.width}
                          height={10}
                          fill="currentColor"
                        />
                      ))}
                    </svg>
                    <span className="font-mono text-[10px] tracking-[0.12em] text-ink-3 tabular-nums">
                      {barcode.code}
                    </span>
                  </motion.div>
                ) : null}

                {/* The cut end: a serrated edge from integer points, so it is
                    the same on the server and in the browser. */}
                <svg
                  aria-hidden
                  viewBox="0 0 120 4"
                  preserveAspectRatio="none"
                  className="mt-1 h-1.5 w-full text-surface-0"
                >
                  <polygon
                    fill="currentColor"
                    points={`0,0 120,0 ${Array.from(
                      { length: 30 },
                      (_, index) =>
                        `${120 - index * 4 - 2},4 ${120 - index * 4 - 4},0`,
                    ).join(" ")}`}
                  />
                </svg>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </motion.div>

      <AnimatePresence initial={false}>
        {ready ? (
          <motion.div
            key="tear"
            className="flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <button
              type="button"
              onClick={tear}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-xs font-medium text-ink transition-colors outline-none hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 shrink-0"
              >
                <path d="M8 3v9M4.5 8.5 8 12l3.5-3.5" />
              </svg>
              Tear off
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
