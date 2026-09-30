"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import {
  formatTweak,
  snapToStep,
  type RangeTweak,
} from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const pct = (spec: RangeTweak, value: number) =>
  Number(
    (
      ((Math.min(spec.max, Math.max(spec.min, value)) - spec.min) /
        (spec.max - spec.min || 1)) *
      100
    ).toFixed(3),
  );

/**
 * A range tweak as a scrub bar: the whole row is the control. Press anywhere
 * and the value jumps there and follows the pointer; arrows step, Shift steps
 * by ten, Home and End go to the ends, double-click puts the default back.
 * A small tick marks the default so a reader can find their way home.
 */
export function ScrubBar({
  label,
  spec,
  value,
  onChange,
}: {
  label: string;
  spec: RangeTweak;
  value: number;
  onChange: (value: number) => void;
}) {
  const motionSafe = useMotionSafe();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const fromPointer = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return snapToStep(spec, spec.min + t * (spec.max - spec.min));
  };

  const set = (next: number) => {
    const snapped = snapToStep(spec, next);
    if (snapped !== value) onChange(snapped);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const big = spec.step * 10;
    const step = event.shiftKey ? big : spec.step;
    const moves: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: spec.min,
      End: spec.max,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    set(next);
  };

  const at = pct(spec, value);
  const home = pct(spec, spec.default);
  const text = formatTweak(spec, value);
  const move = dragging || !motionSafe ? { duration: 0 } : springs.snap;

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={spec.min}
      aria-valuemax={spec.max}
      aria-valuenow={value}
      aria-valuetext={text}
      onKeyDown={onKeyDown}
      onDoubleClick={() => set(spec.default)}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // The pointer may already be gone; the press still sets the value.
        }
        setDragging(true);
        set(fromPointer(event.clientX));
      }}
      onPointerMove={(event) => {
        if (dragging) set(fromPointer(event.clientX));
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
      className={cn(
        "relative flex h-9 cursor-ew-resize touch-none items-center overflow-clip rounded-2 bg-surface-2 px-3 select-none",
        focusRing,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-cobalt-wash"
        initial={false}
        animate={{ width: `${at}%` }}
        transition={move}
      />
      <motion.span
        aria-hidden
        className="absolute inset-y-1.5 w-0.5 -translate-x-1/2 rounded-full bg-cobalt-bright"
        initial={false}
        animate={{ left: `${at}%` }}
        transition={move}
      />
      <span
        aria-hidden
        className="absolute bottom-0 h-1 w-px bg-ink-3"
        style={{ left: `${home}%` }}
      />
      <span className="relative text-xs text-ink-2">{label}</span>
      <span className="relative ml-auto font-mono text-xs text-foreground tabular-nums">
        {text}
      </span>
    </div>
  );
}

/**
 * A toggle or a choice as a segmented radio group: the thumb slides to the
 * pick, arrows move and select, and only the checked segment is a tab stop.
 */
export function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const motionSafe = useMotionSafe();
  const id = React.useId();
  const refs = React.useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    refs.current.get(next.value)?.focus();
  };

  return (
    <div className="flex h-9 items-center justify-between gap-3">
      <span id={`${id}-label`} className="text-xs text-ink-2">
        {label}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="relative flex rounded-2 bg-surface-2 p-0.5"
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              ref={(node) => {
                if (node) refs.current.set(option.value, node);
                else refs.current.delete(option.value);
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "relative h-7 rounded-[5px] px-2.5 text-xs transition-colors",
                checked ? "text-foreground" : "text-ink-3 hover:text-ink-2",
                focusRing,
              )}
            >
              {checked ? (
                <motion.span
                  layoutId={`${id}-thumb`}
                  aria-hidden
                  className="absolute inset-0 rounded-[5px] border border-hairline bg-card shadow-raised"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
