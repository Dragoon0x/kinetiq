"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type CashDenomination = {
  /** Face value in major units. */
  value: number;
  /** How many of them are in the tray. */
  count: number;
  /** @default "note" */
  kind?: "note" | "coin";
};

export type CashDrawerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** What is in the tray, largest first. */
  denominations: CashDenomination[];
  /** The float the drawer should hold; enables the variance line. */
  expected?: number;
  /** Controlled drawer state. */
  open?: boolean;
  /** Initial drawer state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the Open or Close press. */
  onOpenChange?: (open: boolean) => void;
  /** Fires from the Count press. */
  onCount?: () => void;
  /** Fires from the tick that finishes the count. */
  onTallied?: (total: number) => void;
  /** Fires from the Close press, with the tallied total (0 if uncounted). */
  onLock?: (total: number) => void;
  /** Turns an amount into its printed string. */
  format?: (value: number) => string;
  /** Names the drawer. @default "Cash drawer" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's, so server and client print the same
 * string for the same number and the figure never hydrates against itself.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const defaultFormat = (value: number) => currency.format(value);

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** One tick of the tally. Five ticks at most per slot keeps every slot under ~600ms. */
const TICK_MS = 110;
const TICKS_PER_SLOT = 5;

const CONTROL =
  "flex h-8 items-center justify-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45";

const toCents = (value: number) => Math.round(value * 100) / 100;

/** Keeps a callback out of an effect's dependencies so a re-render cannot restart the tally. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Digit columns that roll on `snap`. Each column is a ten-face strip moved by a
 * percentage of its own height, so one `y` step is exactly one face. Hidden
 * from assistive technology: the row already reads the figure as a sentence.
 */
function Digits({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains a digit and only the new column mounts.
        const key = text.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A till. The face plate stays put while the tray beneath it opens on `snap`:
 * the tray's measured height springs from zero with one crisp overshoot — the
 * latch popping — while the slots ride down from under the face. Count walks
 * the denominations top to bottom on a timed tick that lives in an effect and
 * stops while the tab is hidden; each slot climbs in steps so none takes longer
 * than ~600ms, its count, subtotal and the drawer total rolling on `snap`
 * together, because the total moves only because a slot did. Close slides the
 * tray back and the padlock's shackle drops on `flick`.
 *
 * The face is a labelled group of real buttons; the tray is a region that is
 * inert while closed, and each slot reads as one sentence. A status line
 * announces open, counting, counted with the variance, and locked — never a
 * tick. Under reduced motion the tray's height tweens with no travel, the
 * digits swap in place, and the shackle appears already dropped.
 */
export function CashDrawer({
  ref,
  denominations,
  expected,
  open,
  defaultOpen = false,
  onOpenChange,
  onCount,
  onTallied,
  onLock,
  format = defaultFormat,
  label = "Cash drawer",
  className,
}: CashDrawerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : uncontrolled;

  const [phase, setPhase] = React.useState<"idle" | "counting" | "counted">(
    "idle",
  );
  const [tally, setTally] = React.useState<number[]>(() =>
    denominations.map(() => 0),
  );
  const onTalliedRef = useLatest(onTallied);

  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [trayHeight, setTrayHeight] = React.useState(0);

  React.useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    // The observer fires once on observe, so the first open already knows its
    // height without reading layout during render.
    const observer = new ResizeObserver((entries) => {
      setTrayHeight(entries[0]?.contentRect.height ?? 0);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const totalOf = React.useCallback(
    (counts: number[]) =>
      toCents(
        denominations.reduce(
          (sum, slot, index) => sum + slot.value * (counts[index] ?? 0),
          0,
        ),
      ),
    [denominations],
  );

  React.useEffect(() => {
    if (phase !== "counting") return;
    const index = tally.findIndex(
      (counted, slot) => counted < (denominations[slot]?.count ?? 0),
    );
    if (index < 0) return;
    const slot = denominations[index];
    if (!slot) return;
    const step = Math.max(1, Math.ceil(slot.count / TICKS_PER_SLOT));

    let timer = 0;
    const start = () => {
      timer = window.setTimeout(() => {
        const next = tally.map((counted, position) =>
          position === index ? Math.min(slot.count, counted + step) : counted,
        );
        const finished = next.every(
          (counted, position) =>
            counted >= (denominations[position]?.count ?? 0),
        );
        setTally(next);
        if (finished) {
          setPhase("counted");
          onTalliedRef.current?.(totalOf(next));
        }
      }, TICK_MS);
    };
    // A tally nobody is watching stops with the tab and resumes from the same
    // slot when it returns, rather than racing through the tray unseen.
    const onVisibility = () => {
      window.clearTimeout(timer);
      if (!document.hidden) start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [phase, tally, denominations, totalOf, onTalliedRef]);

  const total = totalOf(tally);
  const fullTotal = totalOf(denominations.map((slot) => slot.count));
  const variance = expected === undefined ? null : toCents(total - expected);

  const openDrawer = () => {
    if (isOpen) return;
    setTally(denominations.map(() => 0));
    setPhase("idle");
    if (!isControlled) setUncontrolled(true);
    onOpenChange?.(true);
  };

  const count = () => {
    if (!isOpen || phase !== "idle") return;
    onCount?.();
    if (denominations.every((slot) => slot.count <= 0)) {
      setPhase("counted");
      onTallied?.(0);
      return;
    }
    setPhase("counting");
  };

  const close = () => {
    if (!isOpen) return;
    if (!isControlled) setUncontrolled(false);
    onOpenChange?.(false);
    onLock?.(phase === "counted" ? total : 0);
  };

  const varianceText =
    variance === null
      ? ""
      : variance === 0
        ? "Level"
        : variance > 0
          ? `Over ${format(variance)}`
          : `Short ${format(-variance)}`;

  const face = !isOpen
    ? "Locked"
    : phase === "idle"
      ? "Open"
      : phase === "counting"
        ? "Counting"
        : "Counted";
  const countedLine = `${format(total)}${varianceText ? `, ${varianceText.toLowerCase()}` : ""}`;
  const announcement = !isOpen
    ? phase === "counted"
      ? `Locked, ${format(total)}`
      : "Locked"
    : phase === "counted"
      ? `Counted, ${countedLine}`
      : phase === "counting"
        ? "Counting"
        : "Open, not counted";

  const controls = [
    { text: "Open", onClick: openDrawer, disabled: isOpen, primary: true },
    {
      text: "Count",
      onClick: count,
      disabled: !isOpen || phase === "counted",
      busy: phase === "counting",
    },
    { text: "Close", onClick: close, disabled: !isOpen },
  ];

  const heightTransition = motionSafe
    ? springs.snap
    : { duration: durations.base, ease: easings.move };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <span className="flex min-w-0 items-center gap-2">
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="size-4 shrink-0 text-ink-2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {/* The shackle drops on flick when the drawer locks — the click —
                and sits dropped from the start under reduced motion. */}
            <motion.path
              d="M5 7.5V5.5a3 3 0 0 1 6 0v2"
              style={{ originX: 0.5, originY: 0.5 }}
              initial={false}
              animate={{ y: isOpen ? -2.5 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
            <rect
              x="3"
              y="7.5"
              width="10"
              height="6.5"
              rx="1.5"
              fill="currentColor"
              stroke="none"
            />
          </svg>
          <span id={labelId} className="truncate text-sm font-semibold">
            {label}
          </span>
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {face}
        </span>
      </div>

      <div className="flex items-center gap-2 px-3 py-3">
        {controls.map((control) => (
          <button
            key={control.text}
            type="button"
            onClick={control.onClick}
            disabled={control.disabled}
            aria-disabled={control.busy || undefined}
            className={cn(
              CONTROL,
              control.primary
                ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                : "border-hairline-strong bg-surface-0 hover:bg-accent",
              control.busy && "cursor-default opacity-60",
            )}
          >
            {control.text}
          </button>
        ))}
      </div>

      <motion.div
        role="region"
        aria-labelledby={labelId}
        aria-hidden={!isOpen}
        inert={!isOpen || undefined}
        className="overflow-hidden border-t border-hairline bg-surface-2"
        initial={false}
        animate={{
          // "auto" only covers the frame before the observer has measured.
          height: isOpen ? (trayHeight > 0 ? trayHeight : "auto") : 0,
        }}
        transition={heightTransition}
      >
        <motion.div
          ref={contentRef}
          initial={false}
          animate={{ y: isOpen || !motionSafe ? 0 : -distances.shift }}
          transition={heightTransition}
        >
          <ul className="flex flex-col px-3 py-2">
            {denominations.map((slot, index) => {
              const counted = tally[index] ?? 0;
              const kind = slot.kind ?? "note";
              const subtotal = toCents(slot.value * counted);
              const finalSubtotal = toCents(slot.value * slot.count);
              return (
                <li
                  key={`${slot.value}-${kind}`}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-dashed border-hairline py-1.5 last:border-b-0"
                >
                  <span className="sr-only">
                    {`${format(slot.value)} ${kind}s, ${counted} counted, ${format(subtotal)}`}
                  </span>
                  <span aria-hidden className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "shrink-0 border border-ink-3/60",
                        kind === "note"
                          ? "h-3 w-5 rounded-1 bg-cobalt-wash"
                          : "size-3.5 rounded-full bg-surface-0",
                      )}
                    />
                    <span className="truncate font-mono text-xs text-foreground tabular-nums">
                      {format(slot.value)}
                    </span>
                    <span className="text-[11px] text-ink-3">{kind}</span>
                  </span>
                  <span
                    aria-hidden
                    className="flex items-center justify-end font-mono text-xs text-ink-2"
                    style={{ minWidth: `${String(slot.count).length + 2}ch` }}
                  >
                    <span className="mr-1">×</span>
                    <Digits text={String(counted)} motionSafe={motionSafe} />
                  </span>
                  <span
                    aria-hidden
                    className="flex items-center justify-end font-mono text-xs text-foreground"
                    style={{ minWidth: `${format(finalSubtotal).length}ch` }}
                  >
                    <Digits text={format(subtotal)} motionSafe={motionSafe} />
                  </span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      </motion.div>

      <div className="flex flex-col gap-1 border-t border-hairline px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-ink-2">Total</span>
          <span className="flex items-center justify-end font-mono text-sm font-semibold">
            <span className="sr-only">{format(total)}</span>
            <span
              aria-hidden
              className="flex justify-end"
              style={{ minWidth: `${format(fullTotal).length}ch` }}
            >
              <Digits text={format(total)} motionSafe={motionSafe} />
            </span>
          </span>
        </div>
        {expected !== undefined ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-ink-3">
              Expected{" "}
              <span className="font-mono tabular-nums">{format(expected)}</span>
            </span>
            <span
              className={cn(
                "text-[11px] font-medium transition-colors",
                phase !== "counted"
                  ? "text-ink-3"
                  : variance === 0
                    ? "text-success"
                    : variance !== null && variance > 0
                      ? "text-warn"
                      : "text-danger",
              )}
            >
              {phase === "counted" ? varianceText : "Not counted"}
            </span>
          </div>
        ) : null}
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
