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

export type PresetField = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Readout and `aria-valuetext`. @default the step's decimals */
  format?: (value: number) => string;
};

export type Preset = {
  id: string;
  name: string;
  /** A value per field id; a missing field keeps its current value. */
  values: Record<string, number>;
};

export type PresetDeckProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** One slider each, in order. */
  fields: PresetField[];
  /** Controlled slider values by field id. */
  values?: Record<string, number>;
  /** Initial values for uncontrolled usage. @default each field's minimum */
  defaultValues?: Record<string, number>;
  /** Fires from a slider or an applied preset. */
  onValuesChange?: (values: Record<string, number>) => void;
  /** Controlled deck. */
  presets?: Preset[];
  /** Initial deck for uncontrolled usage. */
  defaultPresets?: Preset[];
  /** Fires from a save with the new card at the front. */
  onPresetsChange?: (presets: Preset[]) => void;
  /** Fires from a card press or an arrow key. */
  onApply?: (preset: Preset) => void;
  /** Names the panel. */
  label: string;
  className?: string;
};

/** Pointer travel before a press becomes a drag. */
const SLOP = 4;
const NO_VALUES: Record<string, number> = {};
const NO_PRESETS: Preset[] = [];

const round3 = (n: number) => Number(n.toFixed(3));
const round6 = (n: number) => Number(n.toFixed(6));
const snapTo = (field: PresetField, v: number) => {
  const step = field.step > 0 ? field.step : 1;
  const stepped = field.min + Math.round((v - field.min) / step) * step;
  return round6(Math.min(field.max, Math.max(field.min, stepped)));
};
const formatFor = (field: PresetField) =>
  field.format ??
  ((v: number) =>
    v.toFixed(Math.min(6, (String(field.step).split(".")[1] ?? "").length)));

type FieldSliderProps = {
  field: PresetField;
  value: number;
  /** Seconds this slider waits before it moves, so an apply sweeps down. */
  delay: number;
  motionSafe: boolean;
  onCommit: (value: number) => void;
};

/**
 * One slider. It tracks the pointer 1:1 while dragging — captured only after
 * 4px of travel — and glides to a value set by a key or a preset on `glide`,
 * the fill following the thumb.
 */
function FieldSlider({
  field,
  value,
  delay,
  motionSafe,
  onCommit,
}: FieldSliderProps) {
  const labelId = React.useId();
  const [dragging, setDragging] = React.useState(false);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLSpanElement | null>(null);
  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
  } | null>(null);

  const span = Math.max(field.max - field.min, Number.EPSILON);
  const pct = round3(((value - field.min) / span) * 100);
  const fmt = formatFor(field);

  const valueFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return field.min + frac * span;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
    };
    onCommit(snapTo(field, valueFromClientX(event.clientX)));
    thumbRef.current?.focus({ preventScroll: true });
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      setDragging(true);
      try {
        // Capture only once the press is a drag, so a click is never
        // swallowed and a synthetic sweep cannot throw on the way in.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A pointer that already ended cannot be captured; carry on.
      }
    }
    onCommit(snapTo(field, valueFromClientX(event.clientX)));
  };
  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Nothing to release.
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    const step = field.step > 0 ? field.step : 1;
    const moves: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + step * 10,
      PageDown: value - step * 10,
      Home: field.min,
      End: field.max,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onCommit(snapTo(field, next));
  };

  // The fill still fills under reduced motion; the thumb, a thing that
  // travels, swaps to its place at once.
  const fillSettle = dragging
    ? { duration: 0 }
    : motionSafe
      ? { ...springs.glide, delay }
      : { duration: durations.fast, ease: easings.move };
  const thumbSettle =
    dragging || !motionSafe ? { duration: 0 } : { ...springs.glide, delay };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-5 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-xs font-medium">
          {field.label}
        </span>
        <span className="shrink-0 font-mono text-xs text-foreground tabular-nums">
          {fmt(value)}
        </span>
      </div>
      <div
        className="relative flex h-5 cursor-pointer touch-none items-center select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
      >
        <div
          ref={trackRef}
          aria-hidden
          className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full bg-cobalt-bright"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={fillSettle}
          />
        </div>
        <motion.span
          className="absolute top-1/2 left-0"
          initial={false}
          animate={{ left: `${pct}%` }}
          transition={thumbSettle}
        >
          <span
            ref={thumbRef}
            role="slider"
            tabIndex={0}
            aria-labelledby={labelId}
            aria-valuemin={field.min}
            aria-valuemax={field.max}
            aria-valuenow={value}
            aria-valuetext={fmt(value)}
            aria-orientation="horizontal"
            onKeyDown={handleKeyDown}
            className={cn(
              "block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-surface-0 shadow-sm outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          />
        </motion.span>
      </div>
    </div>
  );
}

/**
 * Settings you can name. One slider per field above a deck of preset cards.
 * Applying a card sends every slider to its values on `glide`, staggered by
 * `cascade()` so the panel reads as one gesture sweeping down; the card whose
 * values match is checked and a tick draws on `flick`. Nudging any slider
 * unchecks it and arms Save. Saving opens a name field inside the frame, and
 * Enter or Save mints a new card that slides in at the front from
 * `distances.shift` on `snap` while the others make room via `layout` on
 * `glide` — the new card is checked at once, because it is the current
 * values.
 *
 * Sliders are `role="slider"` with arrows, PageUp and PageDown, Home and End.
 * The deck is a radio group with a roving tabindex: arrows move and apply,
 * Home and End jump, Space and Enter apply. Escape in the name field cancels
 * and returns focus to Save. A status line speaks an apply and a save only.
 * Under reduced motion sliders tween without stagger, the new card fades in
 * place and the deck reflows at once.
 */
export function PresetDeck({
  ref,
  fields,
  values,
  defaultValues,
  onValuesChange,
  presets,
  defaultPresets,
  onPresetsChange,
  onApply,
  label,
  className,
}: PresetDeckProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const nameId = `${baseId}-name`;
  const saveRef = React.useRef<HTMLButtonElement | null>(null);

  const [uncontrolledValues, setUncontrolledValues] = React.useState(
    defaultValues ?? NO_VALUES,
  );
  const raw = values ?? uncontrolledValues;
  const current = Object.fromEntries(
    fields.map((field) => [
      field.id,
      snapTo(field, raw[field.id] ?? field.min),
    ]),
  );

  const [uncontrolledPresets, setUncontrolledPresets] = React.useState(
    defaultPresets ?? NO_PRESETS,
  );
  const deck = presets ?? uncontrolledPresets;

  // A preset's values in slider terms; a field it does not name keeps its own.
  const valuesOf = (preset: Preset) =>
    Object.fromEntries(
      fields.map((field) => [
        field.id,
        snapTo(
          field,
          preset.values[field.id] ?? current[field.id] ?? field.min,
        ),
      ]),
    );
  const matches = (preset: Preset) =>
    fields.every((field) => valuesOf(preset)[field.id] === current[field.id]);
  const checkedIndex = deck.findIndex(matches);

  // An apply sweeps the sliders in a cascade; a nudge moves one at once.
  const [sweeping, setSweeping] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [announce, setAnnounce] = React.useState("");

  const commitValues = (next: Record<string, number>) => {
    if (values === undefined) setUncontrolledValues(next);
    onValuesChange?.(next);
  };

  const nudge = (fieldId: string, value: number) => {
    if (current[fieldId] === value) return;
    setSweeping(false);
    commitValues({ ...current, [fieldId]: value });
  };

  const apply = (preset: Preset) => {
    setSweeping(true);
    setAnnounce(`Preset ${preset.name} applied`);
    onApply?.(preset);
    if (!matches(preset)) commitValues(valuesOf(preset));
  };

  const focusCard = (index: number) => {
    const clamped = Math.min(deck.length - 1, Math.max(0, index));
    const target = deck[clamped];
    if (!target) return;
    document.getElementById(`${baseId}-card-${clamped}`)?.focus();
    apply(target);
  };

  const handleCardKey = (event: React.KeyboardEvent, index: number) => {
    const jumps: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: deck.length - 1,
    };
    const to = jumps[event.key];
    if (to !== undefined) {
      event.preventDefault();
      focusCard(to);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const target = deck[index];
      if (target) apply(target);
    }
  };

  const closeForm = () => {
    setSaving(false);
    setName("");
    saveRef.current?.focus();
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const minted: Preset = {
      id: `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${deck.length}`,
      name: trimmed,
      values: { ...current },
    };
    const next = [minted, ...deck];
    if (presets === undefined) setUncontrolledPresets(next);
    onPresetsChange?.(next);
    setAnnounce(`Preset ${trimmed} saved`);
    closeForm();
  };

  const stagger = cascade(fields.length);
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const summary = (preset: Preset) => {
    const own = valuesOf(preset);
    return fields
      .map((field) => formatFor(field)(own[field.id] ?? field.min))
      .join(" · ");
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-4 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
            checkedIndex >= 0 ? "text-ink-3" : "text-warn",
          )}
        >
          {checkedIndex >= 0 ? deck[checkedIndex]?.name : "Modified"}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <FieldSlider
            key={field.id}
            field={field}
            value={current[field.id] ?? field.min}
            delay={sweeping ? index * stagger : 0}
            motionSafe={motionSafe}
            onCommit={(next) => nudge(field.id, next)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <div
          role="radiogroup"
          aria-label="Presets"
          className="grid grid-cols-2 gap-2"
        >
          <AnimatePresence initial={false}>
            {deck.map((preset, index) => {
              const checked = index === checkedIndex;
              const tabbable = checked || (checkedIndex < 0 && index === 0);
              return (
                <motion.button
                  key={preset.id}
                  type="button"
                  role="radio"
                  id={`${baseId}-card-${index}`}
                  aria-checked={checked}
                  aria-label={`${preset.name}: ${summary(preset)}`}
                  tabIndex={tabbable ? 0 : -1}
                  layout={motionSafe ? "position" : false}
                  initial={
                    motionSafe
                      ? { opacity: 0, x: -distances.shift }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          layout: springs.glide,
                          x: springs.snap,
                          opacity: fade,
                        }
                      : fade
                  }
                  onClick={() => apply(preset)}
                  onKeyDown={(event) => handleCardKey(event, index)}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-2 border px-2.5 py-2 text-left transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    checked
                      ? "border-cobalt-bright/50 bg-cobalt-wash"
                      : "border-hairline bg-surface-0 hover:bg-accent",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium text-foreground">
                      {preset.name}
                    </span>
                    <span className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
                      {summary(preset)}
                    </span>
                  </span>
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    className="size-3.5 shrink-0 text-cobalt-bright"
                  >
                    <motion.path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      initial={false}
                      animate={{ pathLength: checked ? 1 : 0 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        <div className="flex h-8 items-center gap-2">
          <AnimatePresence initial={false}>
            {saving ? (
              <motion.form
                key="name"
                className="flex min-w-0 flex-1 items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <label htmlFor={nameId} className="sr-only">
                  Preset name
                </label>
                <input
                  id={nameId}
                  autoFocus
                  value={name}
                  placeholder="Name this preset"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeForm();
                    }
                  }}
                  className="h-8 min-w-0 flex-1 rounded-2 border border-input bg-surface-0 px-2.5 text-xs text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <button
                  type="submit"
                  aria-disabled={!name.trim() || undefined}
                  className={cn(
                    "flex h-8 shrink-0 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    !name.trim() && "opacity-40",
                  )}
                >
                  Save
                </button>
              </motion.form>
            ) : null}
          </AnimatePresence>
          {/* Stays focusable while the values are already a card, so focus
              has somewhere to return to when the name field closes. */}
          <button
            ref={saveRef}
            type="button"
            aria-disabled={(!saving && checkedIndex >= 0) || undefined}
            onClick={() => {
              if (saving) closeForm();
              else if (checkedIndex < 0) setSaving(true);
            }}
            className={cn(
              "ml-auto flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong bg-surface-2 px-3 text-xs font-medium text-foreground transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              !saving && checkedIndex >= 0
                ? "cursor-default opacity-40"
                : "hover:bg-accent",
            )}
          >
            {saving ? "Cancel" : "Save preset"}
          </button>
        </div>
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
