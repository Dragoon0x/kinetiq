"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Status = "idle" | "checking" | "wrong" | "unlocked";

type Cell = { key: string; label: string; kind: "digit" | "clear" | "back" };

const CLEAR_CELL: Cell = { key: "clear", label: "Clear", kind: "clear" };
const BACK_CELL: Cell = { key: "back", label: "Delete", kind: "back" };

const CELLS: Cell[] = [
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => ({
    key: d,
    label: d,
    kind: "digit" as const,
  })),
  CLEAR_CELL,
  { key: "0", label: "0", kind: "digit" },
  BACK_CELL,
];

const COLUMNS = 3;
/** The row jumps here and the recoil spring rings it down — that is the shake. */
const SHAKE_FROM = -10;
/** The refused row holds still this long so the shake reads before it empties. */
const HOLD_BEFORE_EMPTY_MS = 340;
/** A typed key stays lit this long; a pressed key stays lit until release. */
const FLASH_MS = 140;

export type PinPadProps = {
  /** Code length. */
  length?: 4 | 5 | 6;
  /**
   * Called once every dot is filled. Return false — or a promise resolving to
   * false — to run the wrong-code sequence; the pad waits while it resolves.
   */
  onComplete?: (code: string) => Promise<boolean> | boolean;
  /** Announced group label. */
  label?: string;
  /** Show dots rather than the digits themselves. */
  mask?: boolean;
  className?: string;
};

/**
 * A keypad for codes. Keys pop on `flick` under the finger or under the
 * matching digit typed on a keyboard, and each dot lands on `snap`. A refused
 * code jumps the row and lets `recoil` ring it out — two visible bounces — then
 * empties the dots one at a time on a `cascade`; an accepted code seals the row
 * into one bar and stamps the check on `recoil`.
 *
 * Reduced motion trades the shake for a border flash and drops the pops, but
 * the dots still fill and still empty: entry progress is information.
 */
export function PinPad({
  length = 4,
  onComplete,
  label = "Passcode",
  mask = true,
  className,
}: PinPadProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [digits, setDigits] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<Status>("idle");
  const [heldKey, setHeldKey] = React.useState<string | null>(null);
  const [flashKey, setFlashKey] = React.useState<string | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);

  const keyRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const shakeX = useMotionValue(0);
  const mountedRef = React.useRef(true);
  /** Bumped on every submission and every clear, so a stale check is ignored. */
  const runRef = React.useRef(0);

  // Held in a ref so a fresh inline callback never re-triggers verification.
  const onCompleteRef = React.useRef(onComplete);
  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const entryLocked = status !== "idle";
  const clearLocked = status === "checking";

  const press = React.useCallback(
    (cell: Cell) => {
      if (clearLocked) return;
      if (cell.kind === "clear") {
        runRef.current += 1;
        setDigits([]);
        setStatus("idle");
        return;
      }
      if (entryLocked) return;
      if (cell.kind === "back") {
        setDigits((prev) => prev.slice(0, -1));
        return;
      }
      if (digits.length >= length) return;
      const next = [...digits, cell.key];
      setDigits(next);
      if (next.length < length) return;

      // Verification is fired from the gesture, never from an effect, so a
      // slow server answer can never cascade a second submission.
      const token = (runRef.current += 1);
      const settle = (ok: boolean) => {
        if (!mountedRef.current || runRef.current !== token) return;
        setStatus(ok ? "unlocked" : "wrong");
      };
      setStatus("checking");
      Promise.resolve(onCompleteRef.current?.(next.join("")) ?? true)
        .then(settle)
        .catch(() => settle(false));
    },
    [clearLocked, digits, entryLocked, length],
  );

  /** One self-scheduling timer empties the row from the end, a dot per tick. */
  React.useEffect(() => {
    if (status !== "wrong") return;
    if (digits.length === 0) {
      const done = window.setTimeout(() => setStatus("idle"), 80);
      return () => window.clearTimeout(done);
    }
    const delay =
      digits.length === length ? HOLD_BEFORE_EMPTY_MS : cascade(length) * 1000;
    const tick = window.setTimeout(
      () => setDigits((prev) => prev.slice(0, -1)),
      delay,
    );
    return () => window.clearTimeout(tick);
  }, [status, digits, length]);

  React.useEffect(() => {
    if (status !== "wrong" || !motionSafe) return;
    shakeX.set(SHAKE_FROM);
    const controls = animate(shakeX, 0, springs.recoil);
    return () => controls.stop();
  }, [status, motionSafe, shakeX]);

  React.useEffect(() => {
    if (!flashKey) return;
    const timer = window.setTimeout(() => setFlashKey(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flashKey]);

  const moveFocus = (index: number) => {
    const clamped = Math.min(CELLS.length - 1, Math.max(0, index));
    setFocusIndex(clamped);
    keyRefs.current[clamped]?.focus();
  };

  const typeCell = (cell: Cell) => {
    setFlashKey(cell.key);
    press(cell);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;
    // Space and Enter still click the focused key; this only lends them the
    // same light the pointer and the typed digit get.
    if (key === "Enter" || key === " ") {
      setFlashKey(CELLS[focusIndex]?.key ?? null);
      return;
    }
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      const cell = CELLS.find((c) => c.kind === "digit" && c.key === key);
      if (cell) typeCell(cell);
      return;
    }
    if (key === "Backspace" || key === "Delete") {
      event.preventDefault();
      typeCell(BACK_CELL);
      return;
    }
    if (key === "Escape") {
      event.preventDefault();
      typeCell(CLEAR_CELL);
      return;
    }
    const moves: Record<string, number> = {
      ArrowRight: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      ArrowDown: focusIndex + COLUMNS,
      ArrowUp: focusIndex - COLUMNS,
      Home: 0,
      End: CELLS.length - 1,
    };
    const target = moves[key];
    if (target !== undefined) {
      event.preventDefault();
      moveFocus(target);
    }
  };

  const caption =
    status === "unlocked"
      ? "Unlocked"
      : status === "wrong"
        ? "Incorrect code"
        : status === "checking"
          ? "Checking"
          : `${digits.length} of ${length} entered`;

  const dotIn = motionSafe ? springs.snap : { duration: durations.fast };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      onKeyDown={handleKeyDown}
      className={cn("mx-auto flex w-full max-w-[272px] flex-col", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <motion.div style={{ x: shakeX }} className="relative">
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
        >
          {Array.from({ length }, (_, index) => {
            const filled = index < digits.length;
            const active = index === digits.length && status === "idle";
            return (
              <motion.div
                key={index}
                animate={{ opacity: status === "unlocked" ? 0 : 1 }}
                transition={{ duration: durations.fast, ease: easings.exit }}
                className={cn(
                  "relative flex h-12 items-center justify-center rounded-2 border bg-surface-1 transition-colors",
                  status === "wrong"
                    ? "border-danger"
                    : active
                      ? "border-primary"
                      : "border-hairline",
                )}
              >
                <motion.span
                  aria-hidden
                  animate={{ opacity: filled ? 0 : 1 }}
                  transition={{ duration: durations.blink }}
                  className="size-1.5 rounded-full bg-ink-3/50"
                />
                <AnimatePresence initial={false}>
                  {filled && (
                    <motion.span
                      initial={
                        motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor() }}
                      transition={dotIn}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      {mask ? (
                        <span className="size-2.5 rounded-full bg-foreground" />
                      ) : (
                        <span className="font-mono text-base text-foreground tabular-nums">
                          {digits[index]}
                        </span>
                      )}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <AnimatePresence>
          {status === "unlocked" && (
            <motion.div
              initial={{ opacity: 0, scaleX: motionSafe ? 0.88 : 1 }}
              animate={{ opacity: 1, scaleX: 1 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="absolute inset-0 flex items-center justify-center gap-2 rounded-2 border border-success bg-success/12"
            >
              <motion.svg
                viewBox="0 0 24 24"
                aria-hidden
                initial={{ scale: motionSafe ? 0.5 : 1 }}
                animate={{ scale: 1 }}
                transition={{ ...springs.recoil, delay: 0.06 }}
                style={{ originX: 0.5, originY: 0.5 }}
                className="size-4 shrink-0 text-success"
              >
                <path
                  d="m5 12.5 4.5 4.5L19 7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </motion.svg>
              <span className="font-mono text-[11px] tracking-[0.08em] text-success uppercase">
                Unlocked
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <p
        role="status"
        className={cn(
          "mt-3 text-center font-mono text-[11px] tracking-[0.08em] uppercase transition-colors",
          status === "wrong"
            ? "text-danger"
            : status === "unlocked"
              ? "text-success"
              : "text-muted-foreground",
        )}
      >
        {caption}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {CELLS.map((cell, index) => {
          const lit = heldKey === cell.key || flashKey === cell.key;
          const inactive = cell.kind === "clear" ? clearLocked : entryLocked;
          return (
            <motion.button
              key={cell.key}
              ref={(node) => {
                keyRefs.current[index] = node;
              }}
              type="button"
              tabIndex={index === focusIndex ? 0 : -1}
              // aria-disabled, not disabled: a disabled key would drop focus
              // mid-verification and take the whole keyboard path with it.
              aria-disabled={inactive || undefined}
              aria-label={cell.kind === "digit" ? undefined : cell.label}
              onFocus={() => setFocusIndex(index)}
              onPointerDown={(event) => {
                if (event.button === 0 && !inactive) setHeldKey(cell.key);
              }}
              onPointerUp={() => setHeldKey(null)}
              onPointerLeave={() => setHeldKey(null)}
              onPointerCancel={() => setHeldKey(null)}
              onClick={() => press(cell)}
              animate={{ scale: motionSafe && lit && !inactive ? 0.93 : 1 }}
              transition={springs.flick}
              className={cn(
                "flex h-12 items-center justify-center rounded-2 border font-mono text-lg tabular-nums transition-colors outline-none select-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                inactive && "cursor-default opacity-40",
                lit && !inactive
                  ? "border-primary bg-cobalt-wash text-cobalt-bright"
                  : "border-hairline bg-surface-1 text-foreground",
                !inactive && !lit && "hover:bg-surface-2",
                cell.kind !== "digit" && "text-[11px] tracking-[0.08em]",
              )}
            >
              {cell.kind === "back" ? (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="size-4 shrink-0"
                >
                  <path
                    d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinejoin="round"
                  />
                  <path
                    d="m12 9.5 5 5m0-5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <span className={cell.kind === "clear" ? "uppercase" : ""}>
                  {cell.label}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
