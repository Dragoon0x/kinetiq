"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Cadence = "daily" | "weekly" | "monthly" | "custom";

export type CadencePickProps = {
  /** Controlled cadence; `defaultValue` seeds the uncontrolled one. */
  value?: Cadence;
  defaultValue?: Cadence;
  /** Fires on change. Custom carries the interval it now means. */
  onValueChange?: (value: Cadence, everyDays?: number) => void;
  /** Controlled custom interval; `defaultEveryDays` seeds it. @default 3 */
  everyDays?: number;
  defaultEveryDays?: number;
  /** Visible group label. @default "Cadence" */
  label?: string;
  className?: string;
};

const OPTIONS: { value: Cadence; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom" },
];

const COLS = 7;
const ROWS = 5;
const PITCH = 15;
const INSET = 6;
const SLOTS = COLS * ROWS;
const GLYPH_W = INSET * 2 + (COLS - 1) * PITCH;
const GLYPH_H = INSET * 2 + (ROWS - 1) * PITCH;

/** Cell centres, laid out once: the grid is fixed, only the marks move. */
const CELLS = Array.from({ length: SLOTS }, (_, index) => ({
  x: INSET + (index % COLS) * PITCH,
  y: INSET + Math.floor(index / COLS) * PITCH,
}));

/** Fallback centre, so an out-of-range slot still resolves to a real point. */
const ORIGIN = { x: INSET, y: INSET };

/** Weekly lands mid-week so the column reads as a column, not as an edge. */
const WEEKLY_COLUMN = 2;

const MIN_DAYS = 1;
const MAX_DAYS = 30;

const clampDays = (days: number) =>
  Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(days)));

function marksFor(cadence: Cadence, everyDays: number): number[] {
  if (cadence === "daily") return CELLS.map((_, index) => index);
  if (cadence === "weekly")
    return Array.from({ length: ROWS }, (_, row) => row * COLS + WEEKLY_COLUMN);
  if (cadence === "monthly") return [WEEKLY_COLUMN];
  const stride = clampDays(everyDays);
  return CELLS.map((_, index) => index).filter((index) => index % stride === 0);
}

function describe(cadence: Cadence, everyDays: number): string {
  if (cadence === "daily") return "Every day";
  if (cadence === "weekly") return "Once a week";
  if (cadence === "monthly") return "Once a month";
  return `Every ${clampDays(everyDays)} days`;
}

/** Arrows wrap, Home and End jump, Space re-picks. Null: not our key. */
function rovingIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === " ") return index;
  return null;
}

/**
 * A rhythm picker that shows the rhythm. Four stops share one knob that glides
 * between them on `snap`, and beside them a 7×5 calendar glyph re-patterns
 * itself: each mark keeps its identity across cadences, so it travels to its
 * new cell on `glide` in a `cascade` rather than blinking out and back, and
 * marks with nowhere to go fade where they stand. Custom unfolds an interval
 * stepper over a measured height — no room is held for it while it is closed.
 * Arrows move and wrap, Home and End jump, Space selects; the stepper is a
 * spinbutton with its own arrows, Home, End, and Page keys. Under reduced
 * motion the marks swap instantly, because the pattern is the information.
 */
export function CadencePick({
  value,
  defaultValue,
  onValueChange,
  everyDays,
  defaultEveryDays = 3,
  label = "Cadence",
  className,
}: CadencePickProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState<Cadence>(
    () => defaultValue ?? "weekly",
  );
  const cadence = value ?? uncontrolledValue;

  const [uncontrolledDays, setUncontrolledDays] = React.useState(() =>
    clampDays(defaultEveryDays),
  );
  const days = clampDays(everyDays ?? uncontrolledDays);

  const isCustom = cadence === "custom";
  const activeIndex = Math.max(
    OPTIONS.findIndex((option) => option.value === cadence),
    0,
  );

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [panelHeight, setPanelHeight] = React.useState<number | null>(null);

  // The stepper's room is measured, never reserved: the closed panel is zero
  // tall and the open one is exactly as tall as the controls inside it.
  React.useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const read = () => setPanelHeight(node.offsetHeight);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const selectCadence = (next: Cadence) => {
    if (next === cadence) return;
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next, next === "custom" ? days : undefined);
  };

  const setDays = (next: number) => {
    const clamped = clampDays(next);
    if (clamped === days) return;
    if (everyDays === undefined) setUncontrolledDays(clamped);
    onValueChange?.("custom", clamped);
  };

  const handleRailKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next = rovingIndex(event.key, index, OPTIONS.length);
    const option = next === null ? undefined : OPTIONS[next];
    if (!option) return;
    event.preventDefault();
    selectCadence(option.value);
    document.getElementById(`${baseId}-stop-${next}`)?.focus();
  };

  const handleStepperKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const jump: Record<string, number> = {
      ArrowUp: 1,
      ArrowRight: 1,
      ArrowDown: -1,
      ArrowLeft: -1,
      PageUp: 7,
      PageDown: -7,
    };
    const delta = jump[event.key];
    if (delta !== undefined) {
      event.preventDefault();
      setDays(days + delta);
    } else if (event.key === "Home") {
      event.preventDefault();
      setDays(MIN_DAYS);
    } else if (event.key === "End") {
      event.preventDefault();
      setDays(MAX_DAYS);
    }
  };

  const marks = marksFor(cadence, days);
  // The stagger is capped at the 600ms choreography budget: a 35-mark daily
  // pattern would otherwise trail past it on cascade's floor alone.
  const step = cascade(SLOTS);
  const dotTransition = motionSafe ? springs.glide : { duration: 0 };

  return (
    // The panel sits outside the gapped column: a closed panel is zero tall
    // AND leaves no gap behind it, so nothing holds room for a shut drawer.
    <div className={cn("flex w-full flex-col", className)}>
      <div className="flex flex-col gap-3">
        <span id={labelId} className="text-sm font-semibold text-ink">
          {label}
        </span>

        <div className="flex flex-wrap items-center gap-4">
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="flex h-9 min-w-60 flex-1 items-stretch rounded-full border border-hairline bg-surface-2 p-1"
          >
            {OPTIONS.map((option, index) => {
              const selected = option.value === cadence;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  id={`${baseId}-stop-${index}`}
                  aria-checked={selected}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => selectCadence(option.value)}
                  onKeyDown={(event) => handleRailKeyDown(event, index)}
                  className={cn(
                    "relative flex flex-1 items-center justify-center rounded-full px-2 text-xs font-medium transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    selected ? "text-ink" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  {selected && (
                    // No layoutId under reduced motion: the knob swaps, never slides.
                    <motion.span
                      aria-hidden
                      layoutId={motionSafe ? `${baseId}-knob` : undefined}
                      transition={springs.snap}
                      className="absolute inset-0 rounded-full border border-hairline bg-surface-0"
                    />
                  )}
                  <span className="relative">{option.label}</span>
                </button>
              );
            })}
          </div>

          <svg
            role="img"
            aria-label={`${describe(cadence, days)}, shown on a five week calendar`}
            width={GLYPH_W}
            height={GLYPH_H}
            viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`}
            className="shrink-0"
          >
            {CELLS.map((cell, index) => (
              <circle
                key={`cell-${index}`}
                cx={cell.x}
                cy={cell.y}
                r={2}
                className="fill-ink-3/25"
              />
            ))}
            {CELLS.map((_, slot) => {
              // A slot with no mark parks on its own cell, so a mark that comes
              // back later fades in at home instead of flying in from elsewhere.
              const target = CELLS[marks[slot] ?? slot] ?? ORIGIN;
              const shown = slot < marks.length;
              const delay = Math.min(slot * step, 0.6);
              return (
                <motion.circle
                  key={`mark-${slot}`}
                  cx={0}
                  cy={0}
                  r={3.5}
                  className="fill-cobalt-bright"
                  style={{ originX: 0.5, originY: 0.5 }}
                  initial={false}
                  animate={{ x: target.x, y: target.y, opacity: shown ? 1 : 0 }}
                  transition={{
                    x: { ...dotTransition, delay },
                    y: { ...dotTransition, delay },
                    opacity: motionSafe
                      ? {
                          duration: durations.fast,
                          ease: shown ? easings.enter : easings.exit,
                          delay,
                        }
                      : { duration: 0 },
                  }}
                />
              );
            })}
          </svg>
        </div>
      </div>

      <motion.div
        inert={!isCustom}
        aria-hidden={!isCustom}
        initial={false}
        // "auto" only until the first measurement lands, so an instance that
        // mounts on custom opens at its true height instead of unfolding.
        animate={{ height: isCustom ? (panelHeight ?? "auto") : 0 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden"
      >
        {/* pb-1 is the focus ring's room: the wrapper clips to this height. */}
        <div ref={panelRef} className="flex items-center gap-2 pt-3 pb-1">
          <StepButton
            direction="down"
            disabled={days <= MIN_DAYS}
            onPress={() => setDays(days - 1)}
          />
          <div
            role="spinbutton"
            tabIndex={isCustom ? 0 : -1}
            aria-label="Interval in days"
            aria-valuenow={days}
            aria-valuemin={MIN_DAYS}
            aria-valuemax={MAX_DAYS}
            aria-valuetext={describe("custom", days)}
            onKeyDown={handleStepperKeyDown}
            className={cn(
              "flex h-9 flex-1 items-center justify-center rounded-full border border-hairline bg-surface-1 px-3 font-mono text-xs text-ink tabular-nums outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            {describe("custom", days)}
          </div>
          <StepButton
            direction="up"
            disabled={days >= MAX_DAYS}
            onPress={() => setDays(days + 1)}
          />
        </div>
      </motion.div>
    </div>
  );
}

function StepButton({
  direction,
  disabled,
  onPress,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      aria-label={direction === "up" ? "Longer interval" : "Shorter interval"}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-1 text-ink-2 transition-colors outline-none",
        "hover:border-hairline-strong hover:text-ink",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <svg viewBox="0 0 16 16" aria-hidden className="size-4">
        <path
          d={direction === "up" ? "M8 4v8M4 8h8" : "M4 8h8"}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
