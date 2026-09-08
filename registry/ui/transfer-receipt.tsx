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

export type ReceiptLine = {
  id: string;
  label: string;
  /** Printed as-is. Ignore it and pass `amount` for money. */
  value?: string;
  /** Routed through `format`, so every figure on the sheet reads alike. */
  amount?: number;
  /** Draws the row in ink rather than muted — totals and arrival times. */
  emphasis?: boolean;
};

export type TransferReceiptProps = {
  /** Raise it once the send has gone through; the sheet unrolls. */
  open: boolean;
  /** The sum sent, printed at the head of the sheet. */
  amount: number;
  /** Formats the head figure and every line carrying an `amount`. */
  format?: (value: number) => string;
  /** Label and value pairs, printed in order. */
  lines?: ReceiptLine[];
  /** The reference number that types itself in. */
  reference: string;
  /** Sheet heading and the section's accessible name. @default "Transfer receipt" */
  title?: string;
  /** Milliseconds per typed character; 0 prints the reference at once. @default 45 */
  typeSpeedMs?: number;
  /** Fires from the copy press with whether the clipboard accepted it. */
  onCopy?: (reference: string, ok: boolean) => void;
  className?: string;
};

const MONEY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number): string => MONEY.format(value);

/** How long "Copied" stands before the glyph goes back to offering the action. */
const COPIED_MS = 1600;

const TEETH = 24;
const TEAR_TOP = 1;
const TEAR_BOTTOM = 5;

/**
 * The torn edge is drawn, not an asset: a zigzag in a 100-unit viewBox stretched
 * to whatever width the sheet has, with a non-scaling stroke so the tear stays a
 * hairline instead of thickening with the container.
 */
const TEAR_POINTS = Array.from({ length: TEETH + 1 }, (_, index) => ({
  x: (index / TEETH) * 100,
  y: index % 2 === 0 ? TEAR_TOP : TEAR_BOTTOM,
}));

const TEAR_FILL = `M0 0 L100 0 ${[...TEAR_POINTS]
  .reverse()
  .map((point) => `L${point.x.toFixed(3)} ${point.y}`)
  .join(" ")} Z`;

const TEAR_STROKE = `M0 0 ${TEAR_POINTS.map(
  (point) => `L${point.x.toFixed(3)} ${point.y}`,
).join(" ")} L100 0`;

type ReferenceStampProps = {
  reference: string;
  open: boolean;
  typeSpeedMs: number;
  motionSafe: boolean;
  onReady: () => void;
  onCopy?: (reference: string, ok: boolean) => void;
};

/**
 * Keyed on `open` by its parent, so re-opening the receipt remounts this and the
 * typing starts from nothing — a reset that needs no state written from an
 * effect body. While closed it renders the reference whole, which keeps the
 * sheet's measured height identical in both states.
 */
function ReferenceStamp({
  reference,
  open,
  typeSpeedMs,
  motionSafe,
  onReady,
  onCopy,
}: ReferenceStampProps) {
  const [typed, setTyped] = React.useState(0);
  const [copied, setCopied] = React.useState(false);
  const printed = React.useRef(0);
  const ready = React.useRef(onReady);
  const types = open && motionSafe && typeSpeedMs > 0;

  React.useEffect(() => {
    ready.current = onReady;
  });

  React.useEffect(() => {
    if (!types) return;
    const timer = window.setInterval(() => {
      // A hidden tab gets no letters: the interval keeps running but the
      // printing waits, so coming back finds a receipt still mid-print.
      if (document.hidden) return;
      // The count lives in a ref as well as state so the tick can tell it has
      // finished without reaching into a state updater to say so.
      const next = Math.min(reference.length, printed.current + 1);
      printed.current = next;
      setTyped(next);
      if (next < reference.length) return;
      window.clearInterval(timer);
      ready.current();
    }, typeSpeedMs);
    return () => window.clearInterval(timer);
  }, [types, typeSpeedMs, reference.length]);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const shown = types ? reference.slice(0, typed) : reference;
  const complete = shown.length === reference.length;

  const copy = () => {
    const settle = (ok: boolean) => {
      if (ok) setCopied(true);
      onCopy?.(reference, ok);
    };
    try {
      const clipboard =
        typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (clipboard?.writeText) {
        // A denied permission rejects rather than throws, so both paths report.
        clipboard.writeText(reference).then(
          () => settle(true),
          () => settle(false),
        );
        return;
      }
    } catch {
      // No clipboard in this context — fall through and say so honestly.
    }
    settle(false);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Reference
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy reference ${reference}`}
        className={cn(
          "flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline bg-surface-1 px-2 transition-colors outline-none",
          "hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <span
          aria-hidden
          className="min-w-0 truncate font-mono text-xs text-ink tabular-nums"
        >
          {shown}
        </span>
        {!complete && (
          <motion.span
            aria-hidden
            className="h-3.5 w-px shrink-0 bg-cobalt-bright"
            animate={{ opacity: 0.15 }}
            initial={{ opacity: 1 }}
            transition={{
              duration: durations.slow,
              ease: easings.linear,
              repeat: Infinity,
              repeatType: "mirror",
            }}
          />
        )}
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "size-3.5 shrink-0 transition-colors",
            copied ? "text-success" : "text-ink-3",
          )}
        >
          {copied ? (
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              pathLength={1}
              initial={{ pathLength: motionSafe ? 0 : 1 }}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          ) : (
            <>
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
              <path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7" />
            </>
          )}
        </svg>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Reference copied" : ""}
      </span>
    </div>
  );
}

/**
 * The receipt prints itself. A send raises `open` and the sheet unrolls from a
 * true zero to the height a ResizeObserver measured, on `glide` — the spring for
 * a surface finding its size — while `overflow-hidden` clips it so the lines
 * emerge from under the top edge rather than fading in place. Each line is timed
 * to the roll passing it with a `cascade()` stagger, and once the last one lands
 * the reference types itself in, one character per tick, pausing whenever the tab
 * is hidden. Pressing the reference copies it and the glyph draws a check on
 * `flick`. The torn bottom edge is a stretched SVG zigzag, not an image.
 *
 * The sheet is a labelled section whose lines are a real description list, the
 * reference is a real button one Tab away, and a single polite live region
 * announces the receipt on settle rather than per character. Under reduced motion
 * the sheet opens without a spring, the lines fade with no travel, and the
 * reference is printed whole from the first frame.
 */
export function TransferReceipt({
  open,
  amount,
  format = defaultFormat,
  lines = [],
  reference,
  title = "Transfer receipt",
  typeSpeedMs = 45,
  onCopy,
  className,
}: TransferReceiptProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;

  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const [sheetHeight, setSheetHeight] = React.useState<number | null>(null);

  // The announcement waits for the printing to finish, and resets with the
  // sheet. Derived from `open` in render rather than written from an effect, so
  // a receipt that closes cannot leave a stale sentence in the live region.
  const printing = open && motionSafe && typeSpeedMs > 0;
  const [session, setSession] = React.useState({ open, ready: false });
  if (session.open !== open) setSession({ open, ready: false });
  const announced = open && (printing ? session.ready : true);

  React.useEffect(() => {
    const node = sheetRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // Measured in the observer's callback, which fires once on observe() — the
    // height is never read synchronously from the effect body.
    const observer = new ResizeObserver(() =>
      setSheetHeight(node.offsetHeight),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rows = 2 + lines.length;
  const stagger = cascade(rows);

  const reveal = (index: number) => ({
    initial: motionSafe
      ? { opacity: 0, y: -distances.nudge }
      : { opacity: 0, y: 0 },
    animate: { opacity: open ? 1 : 0, y: 0 },
    transition: motionSafe
      ? { ...springs.glide, delay: open ? index * stagger : 0 }
      : { duration: durations.fast, ease: easings.enter },
  });

  return (
    <div className={cn("w-full", className)}>
      <motion.div
        inert={!open}
        aria-hidden={!open}
        initial={false}
        // "auto" only until the first measurement lands, so a receipt that
        // mounts already open shows its sheet instead of unrolling into nothing.
        animate={{ height: open ? (sheetHeight ?? "auto") : 0 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="w-full overflow-hidden"
      >
        <div ref={sheetRef} className="w-full pb-1">
          <section
            aria-labelledby={titleId}
            className="rounded-t-3 border border-b-0 border-hairline bg-card px-4 pt-3.5 pb-3 shadow-raised"
          >
            <motion.div
              {...reveal(0)}
              className="flex items-baseline justify-between gap-3"
            >
              <span
                id={titleId}
                className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                {title}
              </span>
              <span className="shrink-0 font-mono text-xl text-ink tabular-nums">
                {format(amount)}
              </span>
            </motion.div>

            <dl className="mt-3 flex flex-col gap-1.5">
              {lines.map((line, index) => (
                <motion.div
                  key={line.id}
                  {...reveal(index + 1)}
                  className="flex items-baseline justify-between gap-3 text-xs"
                >
                  <dt className="min-w-0 shrink-0 text-ink-3">{line.label}</dt>
                  <dd
                    title={line.value}
                    className={cn(
                      "min-w-0 truncate text-right font-mono tabular-nums",
                      line.emphasis ? "font-medium text-ink" : "text-ink-2",
                    )}
                  >
                    {line.amount === undefined
                      ? line.value
                      : format(line.amount)}
                  </dd>
                </motion.div>
              ))}
            </dl>

            <motion.div
              {...reveal(rows - 1)}
              className="mt-3 border-t border-dashed border-hairline pt-3"
            >
              <ReferenceStamp
                key={String(open)}
                reference={reference}
                open={open}
                typeSpeedMs={typeSpeedMs}
                motionSafe={motionSafe}
                onReady={() => setSession({ open: true, ready: true })}
                onCopy={onCopy}
              />
            </motion.div>
          </section>

          <svg
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
            aria-hidden
            className="block h-1.5 w-full"
          >
            <path d={TEAR_FILL} className="fill-card" />
            <path
              d={TEAR_STROKE}
              fill="none"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              className="stroke-current text-hairline-strong"
            />
          </svg>
        </div>
      </motion.div>

      {/* Outside the sheet: a live region has to be present, and not inside an
          aria-hidden subtree, before the sentence it will announce arrives. */}
      <span role="status" className="sr-only">
        {announced ? `Receipt ready, reference ${reference}` : ""}
      </span>
    </div>
  );
}
