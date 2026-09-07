"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TypedConfirmProps = {
  /** What must be typed exactly before the button wakes. */
  phrase: string;
  /** Dialog heading. */
  title: string;
  /** Supporting copy under the heading — say what is lost. */
  description?: string;
  /** Button copy. @default "Delete" */
  confirmLabel?: string;
  /** Controlled open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires once, on a full match, when the button is pressed. */
  onConfirm?: () => void;
  /** Fires on every keystroke with the leading characters that match. */
  onMatchChange?: (matched: number, total: number) => void;
  className?: string;
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/** Leading characters of `typed` that agree with `phrase`. */
const matchLength = (typed: string, phrase: string): number => {
  let index = 0;
  while (
    index < typed.length &&
    index < phrase.length &&
    typed[index] === phrase[index]
  ) {
    index += 1;
  }
  return index;
};

/**
 * Type the word; the button wakes as you match. Each character that agrees with
 * the phrase lights where it stands — a `flick` on scale, ζ0.99, the shortest
 * spring in the set, so the light follows the caret with no lag — and the danger
 * button fills from the left in proportion to the match on a plain tween.
 * Nothing here springs on arrival and nothing overshoots: destruction does not
 * celebrate. A character that does not agree dims the fill instead of clearing
 * it, so a typo costs a keystroke rather than the whole phrase.
 *
 * Only an exact match enables the button. It is an `alertdialog` with a focus
 * trap, Escape cancels, and focus returns to whatever opened it. Under reduced
 * motion the letters and the fill swap to their new values with no travel, which
 * still shows the progress.
 *
 * The dialog is absolutely positioned inside the nearest positioned ancestor, so
 * give the surface it guards `relative`.
 */
export function TypedConfirm({
  phrase,
  title,
  description,
  confirmLabel = "Delete",
  open,
  onOpenChange,
  onConfirm,
  onMatchChange,
  className,
}: TypedConfirmProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const descriptionId = `${uid}-description`;
  const hintId = `${uid}-hint`;

  const [typed, setTyped] = React.useState("");
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const opener = React.useRef<HTMLElement | null>(null);

  const matched = matchLength(typed, phrase);
  const exact = typed === phrase;
  const mistyped = matched < typed.length;
  const ratio = phrase.length === 0 ? 0 : matched / phrase.length;

  // Remember the opener before focus moves into the panel.
  React.useEffect(() => {
    if (!open) return;
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [open]);

  const cancel = React.useCallback(() => onOpenChange(false), [onOpenChange]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, cancel]);

  const confirm = () => {
    if (!exact) return;
    onConfirm?.();
    onOpenChange(false);
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const swap = motionSafe
    ? { duration: durations.fast, ease: easings.move }
    : { duration: 0 };

  return (
    <AnimatePresence
      onExitComplete={() => {
        // Cleared here rather than on close, so the phrase stays lit through
        // the exit and a reopened dialog still starts from nothing.
        setTyped("");
        opener.current?.focus({ preventScroll: true });
      }}
    >
      {open ? (
        <div
          key="confirm"
          className={cn(
            "absolute inset-0 z-40 flex items-center justify-center p-3",
            className,
          )}
        >
          <motion.button
            type="button"
            aria-label="Cancel"
            onClick={cancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
          />

          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            onKeyDown={trapFocus}
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: motionSafe ? distances.nudge : 0,
              transition: exitFor(),
            }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="relative z-10 flex max-h-full w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-4 border border-hairline-strong bg-popover p-4 text-popover-foreground shadow-raised outline-none"
          >
            <div className="flex flex-col gap-1">
              <h2
                id={titleId}
                className="text-base leading-tight font-semibold text-danger"
              >
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="text-xs text-ink-2">
                  {description}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5 rounded-2 border border-hairline bg-surface-2 p-2.5">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Type to confirm
              </span>
              {/* Wraps by character, so a long phrase never pushes the dialog
                  past the edge on a narrow viewport. */}
              <p aria-hidden className="flex flex-wrap font-mono text-sm">
                {phrase.split("").map((character, index) => {
                  const lit = index < matched;
                  return (
                    <motion.span
                      key={`${character}-${index}`}
                      animate={{
                        opacity: lit ? 1 : 0.45,
                        scale: motionSafe && !lit ? 0.92 : 1,
                      }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                      className={cn(
                        "whitespace-pre transition-colors",
                        lit ? "text-foreground" : "text-ink-3",
                      )}
                    >
                      {character}
                    </motion.span>
                  );
                })}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={typed}
                autoComplete="off"
                spellCheck={false}
                aria-label={`Type ${phrase} to confirm`}
                aria-invalid={mistyped}
                aria-describedby={hintId}
                onChange={(event) => {
                  const next = event.target.value;
                  setTyped(next);
                  onMatchChange?.(matchLength(next, phrase), phrase.length);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirm();
                  }
                }}
                className="h-9 w-full rounded-2 border border-input bg-surface-0 px-2.5 font-mono text-sm outline-none focus-visible:border-cobalt-bright"
              />
              {/* One line holds both readings, so a typo adds no height. */}
              <span id={hintId} className="grid min-w-0">
                <motion.span
                  aria-hidden={mistyped}
                  animate={{ opacity: mistyped ? 0 : 1 }}
                  transition={swap}
                  className="col-start-1 row-start-1 truncate text-[11px] text-ink-3"
                >
                  {matched} of {phrase.length} characters match
                </motion.span>
                <motion.span
                  aria-hidden={!mistyped}
                  animate={{ opacity: mistyped ? 1 : 0 }}
                  transition={swap}
                  className="col-start-1 row-start-1 truncate text-[11px] text-danger"
                >
                  That is not the name
                </motion.span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancel}
                className="flex h-9 flex-1 items-center justify-center rounded-2 border border-hairline-strong text-sm font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!exact}
                onClick={confirm}
                className="relative flex h-9 flex-1 items-center justify-center overflow-hidden rounded-2 border border-danger/40 text-sm font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
              >
                {/* Fills from the left in proportion to the match. A tween, not
                    a spring: this button must never overshoot. */}
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{
                    scaleX: ratio,
                    opacity: mistyped ? 0.25 : exact ? 1 : 0.5,
                  }}
                  transition={swap}
                  className="absolute inset-0 origin-left bg-destructive"
                />
                <span
                  className={cn(
                    "relative z-10 transition-colors",
                    exact ? "text-destructive-foreground" : "text-ink-2",
                  )}
                >
                  {confirmLabel}
                </span>
              </button>
            </div>

            <span role="status" className="sr-only">
              {exact ? `Phrase matched, ${confirmLabel} enabled` : ""}
            </span>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
