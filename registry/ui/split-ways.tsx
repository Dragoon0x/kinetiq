"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SplitMode = "count" | "item" | "amount";
export type SplitPerson = { id: string; name: string };
export type SplitItem = { id: string; label: string; amount: number };

export type SplitWaysProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The bill. */
  total: number;
  /** Who is at the table, in seat order. */
  people: SplitPerson[];
  /** What was ordered; the item mode hands these around. */
  items: SplitItem[];
  /** Controlled mode. */
  mode?: SplitMode;
  /** Initial mode for uncontrolled usage. @default "count" */
  defaultMode?: SplitMode;
  /** Fires from the radio that changed the mode. */
  onModeChange?: (mode: SplitMode) => void;
  /** Item id → person id for the item mode; unlisted items start with the first person. */
  defaultAssignments?: Record<string, string>;
  /** Person id → amount for the amount mode. @default an even split */
  defaultAmounts?: Record<string, number>;
  /** Fires from the event that changed any share, with every person's share. */
  onSharesChange?: (shares: Record<string, number>, mode: SplitMode) => void;
  /** Amount the stepper moves per press. @default 1 */
  step?: number;
  /** Formats every amount the control prints. */
  format?: (value: number) => string;
  /** Printed above the mode switch. @default "Split" */
  label?: string;
  className?: string;
};

/**
 * An explicit locale, not the visitor's: a server formatting in one locale and
 * a client in another print different text for the same figure, which is a
 * hydration mismatch on the number the table came for.
 */
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const defaultFormat = (value: number) => money.format(value);

const MODES: { value: SplitMode; label: string }[] = [
  { value: "count", label: "By count" },
  { value: "item", label: "By item" },
  { value: "amount", label: "By amount" },
];

const KEY_MOVES: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Equal shares in whole cents; the last seat absorbs the rounding so the sum holds. */
const evenSplit = (
  people: SplitPerson[],
  total: number,
): Record<string, number> => {
  const count = people.length;
  if (count === 0) return {};
  const each = Math.floor((total * 100) / count) / 100;
  const shares: Record<string, number> = {};
  let sum = 0;
  people.forEach((person, index) => {
    const share = index === count - 1 ? round2(total - sum) : each;
    shares[person.id] = share;
    sum = round2(sum + share);
  });
  return shares;
};

const itemShares = (
  people: SplitPerson[],
  items: SplitItem[],
  assignments: Record<string, string>,
): Record<string, number> => {
  const shares: Record<string, number> = {};
  for (const person of people) shares[person.id] = 0;
  const first = people[0]?.id;
  for (const item of items) {
    const owner = assignments[item.id] ?? first;
    if (owner !== undefined && owner in shares) {
      shares[owner] = round2((shares[owner] ?? 0) + item.amount);
    }
  }
  return shares;
};

type RolledMoneyProps = {
  value: number;
  format: (value: number) => string;
  motionSafe: boolean;
  className?: string;
};

/**
 * A figure that counts to its new value on `glide` through a motion value, so
 * the roll runs outside React and re-renders nothing. Hidden from assistive
 * technology: the status sentence already carries every figure, once.
 */
function RolledMoney({
  value,
  format,
  motionSafe,
  className,
}: RolledMoneyProps) {
  const progress = useMotionValue(value);
  const text = useTransform(progress, (latest) => format(latest));

  React.useEffect(() => {
    // Reduced motion still reports the figure — only the travel is dropped.
    if (!motionSafe) {
      progress.set(value);
      return;
    }
    const controls = animate(progress, value, springs.glide);
    return () => controls.stop();
  }, [motionSafe, progress, value]);

  return (
    <motion.span
      aria-hidden
      className={cn("font-mono tabular-nums", className)}
    >
      {text}
    </motion.span>
  );
}

type StepButtonProps = {
  label: string;
  direction: 1 | -1;
  disabled?: boolean;
  onClick: () => void;
};

/** One end of a stepper: a real button named for the person, minus or plus. */
function StepButton({ label, direction, disabled, onClick }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-full border border-hairline-strong bg-surface-0 text-ink transition-colors outline-none hover:bg-accent disabled:opacity-40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d={direction > 0 ? "M4 8h8M8 4v8" : "M4 8h8"} />
      </svg>
    </button>
  );
}

/**
 * One bill, three ways to divide it. A three-stop mode switch rides a track on
 * `snap`; beneath it the people at the table re-lay for each mode as FLIP —
 * every row is `layout` on `glide`, so by count the list is a two-column grid
 * of equal cards, by item it opens into full-width rows that hold the item
 * chips, and by amount each row grows a stepper, with cards becoming rows by
 * moving rather than blinking. Tapping an item chip hands the item to the next
 * seat and the chip itself travels between rows under a shared `layoutId`;
 * each share counts to its new figure on `glide` through a motion value, and
 * the list's height is measured, never reserved.
 *
 * The switch is a radio group with a roving tabindex; chips and steppers are
 * real buttons. Under reduced motion rows and chips swap position instantly
 * and every figure swaps in place — the shares still change, because the
 * shares are the information.
 */
export function SplitWays({
  ref,
  total,
  people,
  items,
  mode,
  defaultMode = "count",
  onModeChange,
  defaultAssignments,
  defaultAmounts,
  onSharesChange,
  step = 1,
  format = defaultFormat,
  label = "Split",
  className,
}: SplitWaysProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const knobId = `${baseId}-knob`;

  const [uncontrolledMode, setUncontrolledMode] =
    React.useState<SplitMode>(defaultMode);
  const isControlled = mode !== undefined;
  const current = isControlled ? mode : uncontrolledMode;
  const modeIndex = Math.max(
    0,
    MODES.findIndex((option) => option.value === current),
  );

  const [assignments, setAssignments] = React.useState<Record<string, string>>(
    () => defaultAssignments ?? {},
  );
  const [amounts, setAmounts] = React.useState<Record<string, number>>(
    () => defaultAmounts ?? evenSplit(people, total),
  );

  const sharesFor = (
    which: SplitMode,
    nextAssignments = assignments,
    nextAmounts = amounts,
  ): Record<string, number> =>
    which === "count"
      ? evenSplit(people, total)
      : which === "item"
        ? itemShares(people, items, nextAssignments)
        : Object.fromEntries(
            people.map((person) => [person.id, nextAmounts[person.id] ?? 0]),
          );

  const shares = sharesFor(current);
  const assigned = round2(
    people.reduce((sum, person) => sum + (shares[person.id] ?? 0), 0),
  );
  const gap = round2(total - assigned);

  const selectMode = (next: SplitMode) => {
    if (next === current) return;
    if (!isControlled) setUncontrolledMode(next);
    onModeChange?.(next);
    onSharesChange?.(sharesFor(next), next);
  };

  const focusMode = (index: number) => {
    const option = MODES[Math.min(MODES.length - 1, Math.max(0, index))];
    if (!option) return;
    document.getElementById(`${baseId}-mode-${option.value}`)?.focus();
    selectMode(option.value);
  };

  const handleModeKeyDown = (event: React.KeyboardEvent, index: number) => {
    const move = KEY_MOVES[event.key];
    const target =
      move !== undefined
        ? index + move
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? MODES.length - 1
            : event.key === " "
              ? index
              : null;
    if (target === null) return;
    event.preventDefault();
    if (target === index) selectMode(MODES[index]?.value ?? current);
    else focusMode(target);
  };

  const ownerOf = (item: SplitItem) =>
    people.find((person) => person.id === assignments[item.id]) ?? people[0];

  const nextSeat = (person: SplitPerson | undefined) => {
    const index = people.findIndex((seat) => seat.id === person?.id);
    return people[(index + 1) % Math.max(1, people.length)];
  };

  const moveItem = (item: SplitItem) => {
    const owner = ownerOf(item);
    const target = nextSeat(owner);
    if (!target || target.id === owner?.id) return;
    const next = { ...assignments, [item.id]: target.id };
    setAssignments(next);
    onSharesChange?.(sharesFor("item", next), "item");
  };

  const bump = (person: SplitPerson, direction: number) => {
    const before = amounts[person.id] ?? 0;
    const after = Math.max(0, round2(before + direction * step));
    if (after === before) return;
    const next = { ...amounts, [person.id]: after };
    setAmounts(next);
    onSharesChange?.(sharesFor("amount", assignments, next), "amount");
  };

  // The list's height is measured on its content and animated, so the mode
  // switch moves what sits below it instead of jumping.
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rowMove = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const fade = { duration: durations.fast, ease: easings.enter };
  const isGrid = current === "count";
  const odd = people.length % 2 === 1;

  const gapLine =
    gap > 0
      ? { text: "Unassigned", tone: "text-warn" }
      : gap < 0
        ? { text: "Over", tone: "text-danger" }
        : { text: "All assigned", tone: "text-success" };

  const announced = `${MODES[modeIndex]?.label ?? ""}: ${people
    .map((person) => `${person.name} ${format(shares[person.id] ?? 0)}`)
    .join(", ")}${
    isGrid
      ? ""
      : `, ${gapLine.text}${gap === 0 ? "" : ` ${format(Math.abs(gap))}`}`
  }`;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-medium">
          {label}
        </span>
        <span className="shrink-0 font-mono text-xs text-ink-3 tabular-nums">
          Bill {format(total)}
        </span>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="flex h-9 items-stretch rounded-2 border border-hairline bg-surface-2 p-1"
      >
        {MODES.map((option, index) => {
          const checked = index === modeIndex;
          return (
            <button
              key={option.value}
              id={`${baseId}-mode-${option.value}`}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => selectMode(option.value)}
              onKeyDown={(event) => handleModeKeyDown(event, index)}
              className={cn(
                "relative flex min-w-0 flex-1 items-center justify-center rounded-1 px-1 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                checked
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {checked ? (
                <motion.span
                  aria-hidden
                  // Without the layoutId the knob simply appears at its stop.
                  layoutId={motionSafe ? knobId : undefined}
                  transition={springs.snap}
                  className="absolute inset-0 rounded-1 border border-hairline bg-surface-0 shadow-sm"
                />
              ) : null}
              <span className="relative truncate">{option.label}</span>
            </button>
          );
        })}
      </div>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={rowMove}
      >
        <div ref={innerRef} className="flex flex-col gap-2">
          <ul
            aria-label="Shares"
            className={cn(
              isGrid ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2",
            )}
          >
            {people.map((person, index) => {
              const share = shares[person.id] ?? 0;
              const owned = items.filter(
                (item) => ownerOf(item)?.id === person.id,
              );
              const figure = (
                <motion.span
                  layoutId={
                    motionSafe ? `${baseId}-share-${person.id}` : undefined
                  }
                  transition={rowMove}
                  className="flex items-center"
                >
                  <RolledMoney
                    value={share}
                    format={format}
                    motionSafe={motionSafe}
                    className="text-sm font-semibold text-ink"
                  />
                </motion.span>
              );
              return (
                <motion.li
                  key={person.id}
                  layout={motionSafe}
                  transition={rowMove}
                  style={{
                    gridColumn:
                      isGrid && odd && index === people.length - 1
                        ? "span 2"
                        : undefined,
                  }}
                  className="flex flex-col gap-2 rounded-2 border border-hairline bg-surface-2 p-3"
                >
                  <div
                    className={cn(
                      "flex",
                      isGrid
                        ? "flex-col items-start gap-1"
                        : "h-7 items-center justify-between gap-3",
                    )}
                  >
                    <motion.span
                      layout={motionSafe ? "position" : false}
                      transition={rowMove}
                      className="min-w-0 truncate text-sm font-medium"
                    >
                      {person.name}
                    </motion.span>
                    <span className="sr-only">{format(share)}</span>
                    {current === "amount" ? (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <StepButton
                          label={`Less for ${person.name}`}
                          direction={-1}
                          disabled={share <= 0}
                          onClick={() => bump(person, -1)}
                        />
                        {figure}
                        <StepButton
                          label={`More for ${person.name}`}
                          direction={1}
                          onClick={() => bump(person, 1)}
                        />
                      </span>
                    ) : (
                      figure
                    )}
                  </div>

                  {current === "item" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {owned.length === 0 ? (
                        <span className="flex h-7 items-center text-xs text-ink-3">
                          Nothing yet
                        </span>
                      ) : null}
                      {owned.map((item) => {
                        const target = nextSeat(person);
                        return (
                          <motion.button
                            key={item.id}
                            type="button"
                            // The chip is one element that travels between rows.
                            layoutId={
                              motionSafe
                                ? `${baseId}-item-${item.id}`
                                : undefined
                            }
                            initial={motionSafe ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={motionSafe ? rowMove : fade}
                            aria-label={`${item.label} ${format(item.amount)}, with ${person.name}. Move to ${target?.name ?? person.name}`}
                            onClick={() => moveItem(item)}
                            className={cn(
                              "flex h-7 max-w-full items-center gap-1.5 rounded-full border border-hairline-strong bg-surface-0 pr-2 pl-2.5 text-xs text-ink transition-colors outline-none hover:bg-accent",
                              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            )}
                          >
                            <span className="truncate">{item.label}</span>
                            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                              {format(item.amount)}
                            </span>
                            <svg
                              viewBox="0 0 16 16"
                              aria-hidden
                              className="size-3 shrink-0 text-ink-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
                            </svg>
                          </motion.button>
                        );
                      })}
                    </div>
                  ) : null}
                </motion.li>
              );
            })}
          </ul>

          {isGrid ? null : (
            <div className="flex h-6 items-center justify-between gap-3 px-1 text-xs">
              <span className={cn("transition-colors", gapLine.tone)}>
                {gapLine.text}
              </span>
              {gap === 0 ? null : (
                <RolledMoney
                  value={Math.abs(gap)}
                  format={format}
                  motionSafe={motionSafe}
                  className={cn("text-xs font-medium", gapLine.tone)}
                />
              )}
            </div>
          )}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
