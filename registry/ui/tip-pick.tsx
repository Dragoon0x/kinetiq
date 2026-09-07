"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TipValue =
  | { kind: "percent"; value: number }
  | { kind: "amount"; value: number }
  | { kind: "none" };

export type TipPickProps = {
  /** Bill before tip. */
  subtotal: number;
  /** Percentages offered as chips. @default [10, 15, 20] */
  presets?: number[];
  /** Controlled tip. */
  value?: TipValue;
  /** Initial tip for uncontrolled usage. @default the middle preset */
  defaultValue?: TipValue;
  onValueChange?: (value: TipValue) => void;
  /** Money formatter — the control never invents a currency. */
  format?: (value: number) => string;
  /** Visible group label. */
  label?: string;
  className?: string;
};

const DEFAULT_PRESETS = [10, 15, 20];

const round2 = (value: number): number => Math.round(value * 100) / 100;

const tipOf = (tip: TipValue, subtotal: number): number => {
  if (tip.kind === "none") return 0;
  if (tip.kind === "amount") return Math.max(0, round2(tip.value));
  return Math.max(0, round2((subtotal * tip.value) / 100));
};

const sameTip = (a: TipValue, b: TipValue): boolean =>
  a.kind === b.kind &&
  (a.kind === "none" || b.kind === "none" || a.value === b.value);

/** Digits and at most one two-place decimal, so the field never holds junk. */
function cleanAmount(raw: string): string {
  const kept = raw.replace(/[^0-9.]/g, "");
  const dot = kept.indexOf(".");
  if (dot < 0) return kept.slice(0, 7);
  const head = kept.slice(0, dot).slice(0, 7);
  const tail = kept
    .slice(dot + 1)
    .replace(/\./g, "")
    .slice(0, 2);
  return `${head}.${tail}`;
}

type Chip = {
  id: string;
  label: string;
  kind: TipValue["kind"];
  percent: number;
};

/**
 * A money readout that rolls. Every glyph is one monospace cell, so a changed
 * character leaves in the direction the number moved while its replacement
 * arrives from the other side — an odometer rather than a blink. The cells are
 * `aria-hidden`; the caller pairs this with the plain text for assistive tech.
 */
function Roll({
  text,
  direction,
  motionSafe,
  className,
}: {
  text: string;
  direction: number;
  motionSafe: boolean;
  className?: string;
}) {
  const up = direction >= 0;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex font-mono leading-none tabular-nums",
        className,
      )}
    >
      {text.split("").map((char, index) => (
        <span
          key={index}
          className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={`${index}-${char}`}
              initial={
                motionSafe
                  ? { y: up ? "100%" : "-100%", opacity: 0 }
                  : { opacity: 0 }
              }
              animate={{ y: "0%", opacity: 1 }}
              exit={
                motionSafe
                  ? {
                      y: up ? "-100%" : "100%",
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }
                  : { opacity: 0, transition: exitFor(durations.blink) }
              }
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
              className="absolute inset-0 flex items-center justify-center"
            >
              {char}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/**
 * A tip selector that keeps the arithmetic visible. Choosing a chip slides one
 * shared fill across to it on `snap` — a single crisp overshoot, keyed by a
 * `useId()`-prefixed `layoutId` so two bills on one page never trade fills —
 * and the tip and total roll to their new figures in the direction they moved.
 *
 * Custom unfolds an amount field on `glide`: the panel's height is measured by
 * a ResizeObserver rather than guessed, so no dead space is reserved while it
 * is shut and the fold matches the field exactly. Committing Custom (click,
 * Enter or Space) moves focus into that field; arrowing onto it only unfolds,
 * so the arrow keys keep working. No tip is a real chip, not an absence.
 *
 * The chips are a radio group with a roving tabindex: Left and Right wrap,
 * Home and End jump to the ends. Under reduced motion the fill swaps and the
 * digits cross-fade — the figures still change, because the total is
 * information rather than flourish.
 */
export function TipPick({
  subtotal,
  presets = DEFAULT_PRESETS,
  value,
  defaultValue,
  onValueChange,
  format = (amount) => amount.toFixed(2),
  label = "Tip",
  className,
}: TipPickProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;
  const amountId = `${uid}-amount`;
  const hintId = `${uid}-hint`;

  const chips = React.useMemo<Chip[]>(
    () => [
      ...presets.map((percent) => ({
        id: `percent-${percent}`,
        label: `${percent}%`,
        kind: "percent" as const,
        percent,
      })),
      { id: "custom", label: "Custom", kind: "amount" as const, percent: 0 },
      { id: "none", label: "No tip", kind: "none" as const, percent: 0 },
    ],
    [presets],
  );

  const fallback = React.useMemo<TipValue>(() => {
    const middle = presets[Math.floor(presets.length / 2)];
    return middle === undefined
      ? { kind: "none" }
      : { kind: "percent", value: middle };
  }, [presets]);

  const [uncontrolled, setUncontrolled] = React.useState<TipValue>(
    defaultValue ?? fallback,
  );
  const isControlled = value !== undefined;
  const tip = isControlled ? value : uncontrolled;

  const [draft, setDraft] = React.useState(() => {
    const seed = defaultValue ?? value;
    return seed && seed.kind === "amount" ? seed.value.toFixed(2) : "";
  });

  const isCustom = tip.kind === "amount";
  const selectedId =
    tip.kind === "amount"
      ? "custom"
      : tip.kind === "none"
        ? "none"
        : `percent-${tip.value}`;
  const selectedIndex = chips.findIndex((chip) => chip.id === selectedId);
  const rovingIndex = selectedIndex < 0 ? 0 : selectedIndex;

  const tipAmount = tipOf(tip, subtotal);
  const total = round2(subtotal + tipAmount);
  const tipText = format(tipAmount);
  const totalText = format(total);

  /**
   * Which way the money moved, decided while rendering the figure it belongs
   * to. An effect would land a frame after the digits it is meant to direct.
   */
  const [rolled, setRolled] = React.useState({ amount: tipAmount, up: true });
  let up = rolled.up;
  if (rolled.amount !== tipAmount) {
    up = tipAmount >= rolled.amount;
    setRolled({ amount: tipAmount, up });
  }
  const direction = up ? 1 : -1;

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const amountRef = React.useRef<HTMLInputElement | null>(null);
  const wantsFocus = React.useRef(false);
  const [panelHeight, setPanelHeight] = React.useState(0);

  React.useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // The observer's own callback carries the measurement, so nothing has to be
    // read (and set) synchronously inside the effect body.
    const observer = new ResizeObserver(() => {
      setPanelHeight(node.offsetHeight);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (!isCustom || !wantsFocus.current) return;
    wantsFocus.current = false;
    // One frame after the fold starts, so the field is laid out before it takes
    // focus and the page does not jump to a zero-height box.
    const frame = requestAnimationFrame(() =>
      amountRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [isCustom]);

  const commit = (next: TipValue) => {
    if (sameTip(next, tip)) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const choose = (chip: Chip) => {
    if (chip.kind === "percent")
      commit({ kind: "percent", value: chip.percent });
    else if (chip.kind === "none") commit({ kind: "none" });
    else commit({ kind: "amount", value: Number(draft) || 0 });
  };

  const focusChip = (index: number) => {
    // Arrowing onto Custom unfolds it but keeps focus on the chip, so the
    // arrow keys keep working.
    wantsFocus.current = false;
    const count = chips.length;
    const chip = chips[((index % count) + count) % count];
    if (!chip) return;
    choose(chip);
    document.getElementById(`${uid}-chip-${chip.id}`)?.focus();
  };

  const onChipKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      focusChip(index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      focusChip(index - 1);
    else if (event.key === "Home") focusChip(0);
    else if (event.key === "End") focusChip(chips.length - 1);
    else return;
    event.preventDefault();
  };

  const handleAmount = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = cleanAmount(event.currentTarget.value);
    setDraft(next);
    commit({ kind: "amount", value: Number(next) || 0 });
  };

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-sm font-semibold text-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
          on {format(round2(subtotal))}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={hintId}
        className="flex flex-wrap gap-2"
      >
        {chips.map((chip, index) => {
          const checked = chip.id === selectedId;
          return (
            <button
              key={chip.id}
              id={`${uid}-chip-${chip.id}`}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={index === rovingIndex ? 0 : -1}
              onClick={() => {
                if (chip.kind === "amount") {
                  // Already open: nothing re-renders, so take focus by hand
                  // rather than leaving a stale intent for the next arrow key.
                  if (isCustom) amountRef.current?.focus();
                  else wantsFocus.current = true;
                }
                choose(chip);
              }}
              onKeyDown={(event) => onChipKeyDown(event, index)}
              className={cn(
                "relative flex h-9 min-w-0 grow basis-[calc(33.333%_-_0.334rem)] items-center justify-center rounded-2 border px-3 text-sm font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "border-transparent text-primary-foreground"
                  : "border-hairline-strong bg-surface-1 text-ink-2 hover:text-foreground",
              )}
            >
              {checked &&
                (motionSafe ? (
                  <motion.span
                    aria-hidden
                    layoutId={`${uid}-fill`}
                    transition={springs.snap}
                    className="absolute inset-0 rounded-2 bg-primary"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-2 bg-primary"
                  />
                ))}
              <span className="relative truncate">{chip.label}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        initial={false}
        animate={{
          height: isCustom ? panelHeight : 0,
          opacity: isCustom ? 1 : 0,
        }}
        transition={
          motionSafe
            ? {
                height: springs.glide,
                opacity: { duration: durations.fast },
              }
            : { duration: durations.fast }
        }
        className="overflow-hidden"
      >
        <div ref={panelRef} inert={!isCustom}>
          <label
            htmlFor={amountId}
            className="mb-1.5 block text-xs font-medium text-ink-2"
          >
            Custom tip
          </label>
          <input
            id={amountId}
            ref={amountRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={draft}
            onChange={handleAmount}
            className="h-9 w-full min-w-0 rounded-2 border border-input bg-surface-1 px-3 font-mono text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
      </motion.div>

      <dl className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <dt className="text-ink-2">Tip</dt>
          <dd className="text-foreground">
            <Roll
              text={tipText}
              direction={direction}
              motionSafe={motionSafe}
            />
            <span className="sr-only">{tipText}</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm font-semibold text-foreground">Total</dt>
          <dd className="text-base font-semibold text-foreground">
            <Roll
              text={totalText}
              direction={direction}
              motionSafe={motionSafe}
            />
            <span className="sr-only">{totalText}</span>
          </dd>
        </div>
      </dl>

      <span id={hintId} className="sr-only">
        Arrow keys move between tips; Enter or Space on Custom opens the amount
        field.
      </span>
      <span role="status" className="sr-only">
        {`Tip ${tipText}, total ${totalText}`}
      </span>
    </div>
  );
}
