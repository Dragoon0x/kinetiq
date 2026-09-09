"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EchoPart = {
  /** Stable identity; the key the edits map uses. */
  id: string;
  /** The words as heard, carrying their own spaces and punctuation. */
  text: string;
  /** Alternatives that make the part a correctable assumption. */
  options?: string[];
};

export type PromptEchoProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The original prompt, printed as the quoted request. */
  request: string;
  /** The restatement in order. */
  parts: EchoPart[];
  /** Characters of the restatement revealed so far. Omit for a finished restatement. */
  typed?: number;
  /** Controlled corrections by part id. */
  edits?: Record<string, string>;
  /** Initial corrections for uncontrolled usage. */
  defaultEdits?: Record<string, string>;
  onEditsChange?: (edits: Record<string, string>) => void;
  /** Fires from the confirm control with the final sentence and how many parts were corrected. */
  onConfirm?: (text: string, editCount: number) => void;
  /** The invented model's name for the header chip. */
  model?: string;
  /** Names the region for assistive technology. */
  label: string;
  /** Copy on the confirm control. @default "Looks right" */
  confirmLabel?: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** A digit column that rolls to its value on `snap`; the footer copy carries the count for readers. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = value.length - index;
        if (digit < 0) return <span key={key}>{char}</span>;
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

/** Reduced motion reads in clauses: the last clause boundary at or before `typed`. */
function clauseCut(text: string, typed: number): number {
  for (let index = Math.min(typed, text.length); index > 0; index -= 1) {
    if (/[,.;:]/.test(text.charAt(index - 1))) return index;
  }
  return 0;
}

const chip =
  "flex h-7 items-center rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * What it heard you ask. The request sits at the top as a quoted line and
 * under it the model's restatement types itself: the host drives `typed` so
 * the component keeps no clock, and a caret rides the end of the text while
 * it grows. Parts with `options` are the assumptions the model made — dotted
 * underlines that are real buttons. Pressing one opens a row of alternatives
 * below the sentence: the row's height is measured and glides open on
 * `glide` while its chips arrive in a `cascade` on `snap`. Choosing one
 * slides the correction into the sentence — the old words leave upward on the
 * exit ease, the new ones arrive from `distances.step` below on `snap` — the
 * footer's edit count rolls, and the part keeps the cobalt wash so a changed
 * assumption stays visible. Confirm proceeds with the final sentence.
 *
 * The row is a listbox with a roving tabindex; Escape closes it and returns
 * focus to the part. The live region speaks the finished restatement once,
 * each correction once, and Confirmed once. Under reduced motion the text
 * appears clause by clause, the caret holds still, and corrections swap in
 * place on an opacity tween.
 */
export function PromptEcho({
  ref,
  request,
  parts,
  typed,
  edits,
  defaultEdits,
  onEditsChange,
  onConfirm,
  model,
  label,
  confirmLabel = "Looks right",
  className,
}: PromptEchoProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<
    Record<string, string>
  >(defaultEdits ?? {});
  const isControlled = edits !== undefined;
  const current = isControlled ? edits : uncontrolled;

  const wordsOf = (part: EchoPart) => current[part.id] ?? part.text;
  const text = parts.map(wordsOf).join("");
  const total = text.length;
  const complete = typed === undefined || typed >= total;
  // Reduced motion reads whole clauses rather than letters landing one at a time.
  const shown = complete
    ? total
    : motionSafe
      ? Math.max(0, typed)
      : clauseCut(text, typed);
  const editCount = parts.filter(
    (part) => current[part.id] !== undefined,
  ).length;

  const [open, setOpen] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const [confirmed, setConfirmed] = React.useState(false);
  const [spoken, setSpoken] = React.useState("");
  // A restatement that starts typing again is a new one: the confirm and
  // the last announcement belong to the old sentence.
  if (!complete && (confirmed || spoken !== "" || open !== null)) {
    setConfirmed(false);
    setSpoken("");
    setOpen(null);
  }

  const [row, attachRow] = React.useState<HTMLElement | null>(null);
  const [rowHeight, setRowHeight] = React.useState(0);
  React.useEffect(() => {
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setRowHeight(row.offsetHeight));
    observer.observe(row);
    return () => observer.disconnect();
  }, [row]);

  // Focus follows the row in: the current wording takes it so Arrow keys
  // work at once. Re-running on `active` refocuses the chip that already has
  // focus, which is harmless.
  React.useEffect(() => {
    if (!open) return;
    document.getElementById(`${uid}-opt-${open}-${active}`)?.focus();
  }, [open, active, uid]);

  const openPart = parts.find((part) => part.id === open);
  const choices = openPart ? [openPart.text, ...(openPart.options ?? [])] : [];

  const commit = (next: Record<string, string>) => {
    if (!isControlled) setUncontrolled(next);
    onEditsChange?.(next);
  };

  const close = (partId: string) => {
    setOpen(null);
    document.getElementById(`${uid}-part-${partId}`)?.focus();
  };

  const toggle = (part: EchoPart) => {
    if (open === part.id) {
      setOpen(null);
      return;
    }
    const choicesOf = [part.text, ...(part.options ?? [])];
    setActive(Math.max(0, choicesOf.indexOf(wordsOf(part))));
    setOpen(part.id);
  };

  const choose = (part: EchoPart, choice: string) => {
    const next = { ...current };
    if (choice === part.text) delete next[part.id];
    else next[part.id] = choice;
    commit(next);
    setSpoken(`Changed to ${choice.trim()}`);
    close(part.id);
  };

  const onRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!openPart) return;
    const last = choices.length - 1;
    const moveTo = (index: number) => {
      const clamped = Math.min(last, Math.max(0, index));
      setActive(clamped);
      document.getElementById(`${uid}-opt-${openPart.id}-${clamped}`)?.focus();
    };
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(active + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(active - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(last);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const choice = choices[active];
      if (choice !== undefined) choose(openPart, choice);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(openPart.id);
    }
  };

  const confirm = () => {
    if (!complete || confirmed) return;
    setConfirmed(true);
    setSpoken("Confirmed");
    onConfirm?.(text, editCount);
  };

  const announcement = confirmed
    ? "Confirmed"
    : spoken !== ""
      ? spoken
      : complete
        ? `Heard as: ${text}`
        : "";
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const stagger = cascade(choices.length);

  // Each part shows the slice of its words that `shown` has reached.
  const segments: { part: EchoPart; words: string; visible: string }[] = [];
  let offset = 0;
  for (const part of parts) {
    const words = wordsOf(part);
    const visible = words.slice(
      0,
      Math.max(0, Math.min(words.length, shown - offset)),
    );
    offset += words.length;
    segments.push({ part, words, visible });
  }

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={labelId}
      aria-busy={!complete || undefined}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-4",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        {model ? (
          <span className="flex h-6 shrink-0 items-center rounded-full bg-surface-2 px-2 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            {model}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          You asked
        </span>
        <p className="border-l-2 border-hairline-strong pl-3 text-sm leading-relaxed text-ink-2">
          {request}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Heard as
        </span>
        <p className="text-sm leading-relaxed text-foreground">
          {segments.map(({ part, words, visible }) => {
            if (visible === "") return null;
            const edited = current[part.id] !== undefined;
            const correctable = complete && (part.options?.length ?? 0) > 0;
            if (!correctable) {
              return (
                <span key={part.id} className="whitespace-pre-wrap">
                  {visible}
                </span>
              );
            }
            return (
              <button
                key={part.id}
                type="button"
                id={`${uid}-part-${part.id}`}
                aria-expanded={open === part.id}
                aria-controls={open === part.id ? `${uid}-row` : undefined}
                disabled={confirmed}
                onClick={() => toggle(part)}
                className={cn(
                  "inline-grid rounded-1 px-0.5 align-baseline transition-colors outline-none",
                  "underline decoration-dotted decoration-1 underline-offset-4",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  edited
                    ? "bg-cobalt-wash text-cobalt-bright decoration-cobalt-bright/60"
                    : "text-foreground decoration-ink-3 hover:bg-accent",
                  open === part.id && "bg-accent",
                )}
              >
                {/* Both wordings share one grid cell, so the swap never
                    collapses the sentence between them. */}
                <AnimatePresence initial={false}>
                  <motion.span
                    key={words}
                    className="col-start-1 row-start-1 whitespace-pre-wrap"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.step }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      y: motionSafe ? -distances.step : 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={
                      motionSafe
                        ? { ...springs.snap, opacity: fade }
                        : { duration: durations.fast }
                    }
                  >
                    {visible}
                  </motion.span>
                </AnimatePresence>
              </button>
            );
          })}
          {!complete ? (
            <motion.span
              aria-hidden
              className="ml-px inline-block h-[1em] w-0.5 rounded-full bg-cobalt-bright align-text-bottom"
              animate={motionSafe ? { opacity: [1, 0.25] } : { opacity: 0.7 }}
              transition={
                motionSafe
                  ? {
                      duration: 0.6,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatType: "reverse",
                    }
                  : { duration: 0 }
              }
            />
          ) : null}
        </p>

        {/* No room is reserved for the row: the wrapper exists at zero and
            glides to whatever the chips need. */}
        <motion.div
          className="overflow-hidden"
          initial={false}
          animate={{ height: open ? rowHeight : 0 }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.base, ease: easings.enter }
          }
        >
          <div ref={attachRow}>
            <AnimatePresence initial={false}>
              {openPart ? (
                <motion.div
                  key={openPart.id}
                  id={`${uid}-row`}
                  role="listbox"
                  aria-label={`Alternatives for ${openPart.text.trim()}`}
                  onKeyDown={onRowKeyDown}
                  onBlur={(event) => {
                    // Focus leaving the row closes it, unless it is heading for
                    // the part's own button, which toggles for itself.
                    const target = event.relatedTarget as HTMLElement | null;
                    if (
                      target &&
                      (event.currentTarget.contains(target) ||
                        target.id === `${uid}-part-${openPart.id}`)
                    )
                      return;
                    setOpen(null);
                  }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  className="flex flex-wrap gap-2 pt-2 pb-1"
                >
                  {choices.map((choice, index) => {
                    const selected = choice === wordsOf(openPart);
                    return (
                      <motion.button
                        key={choice}
                        type="button"
                        role="option"
                        id={`${uid}-opt-${openPart.id}-${index}`}
                        aria-selected={selected}
                        tabIndex={index === active ? 0 : -1}
                        onClick={() => choose(openPart, choice)}
                        onFocus={() => setActive(index)}
                        initial={
                          motionSafe
                            ? { opacity: 0, y: distances.nudge }
                            : { opacity: 0 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.snap,
                                delay: index * stagger,
                                opacity: { ...fade, delay: index * stagger },
                              }
                            : { duration: durations.fast }
                        }
                        className={cn(
                          chip,
                          selected
                            ? "border-cobalt-bright bg-cobalt-wash text-cobalt-bright"
                            : "border-hairline-strong text-foreground hover:bg-accent",
                        )}
                      >
                        {choice.trim()}
                      </motion.button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="flex items-center font-mono text-[11px] text-ink-3">
          <RollingNumber value={String(editCount)} motionSafe={motionSafe} />
          <span className="sr-only">{editCount}</span>
          &nbsp;{editCount === 1 ? "edit" : "edits"}
        </span>
        <button
          type="button"
          onClick={confirm}
          disabled={!complete || confirmed}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-2 border px-3 text-xs font-medium transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:cursor-default disabled:opacity-50",
            confirmed
              ? "border-success/40 bg-success/10 text-success disabled:opacity-100"
              : "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {confirmed ? (
            <svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              />
            </svg>
          ) : null}
          {confirmed ? "Confirmed" : confirmLabel}
        </button>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
