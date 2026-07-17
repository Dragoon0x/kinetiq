"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ListOption = {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
};

export type ListboxRosterProps = {
  options: ListOption[];
  /** Controlled selection. */
  value?: string[];
  /** Initial selection for uncontrolled usage. */
  defaultValue?: string[];
  onValueChange?: (ids: string[]) => void;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/**
 * An always-open multi-select — a roster you scan rather than a menu you poke.
 * One highlight marker glides between rows as focus moves, keyed by a shared
 * `layoutId`, so the eye is led rather than blinked; ticking a row draws its
 * check, and a running count keeps score.
 *
 * It follows the listbox pattern with a roving tabindex: Up and Down walk the
 * options and wrap, Home and End jump to the ends, Space or Enter toggles the
 * focused row, and each option carries `aria-selected` under an
 * `aria-multiselectable` list. The count is announced politely. Reduced motion
 * drops the glide and the draw — the marker and checks are simply placed.
 */
export function ListboxRoster({
  options,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
  "aria-label": ariaLabel,
}: ListboxRosterProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const markerId = `${baseId}-marker`;

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    defaultValue ?? [],
  );
  const isControlled = value !== undefined;
  const selected = isControlled ? value : uncontrolled;
  const selectedSet = new Set(selected);
  const [activeId, setActiveId] = React.useState<string>(options[0]?.id ?? "");

  const commit = (next: string[]) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const toggle = (id: string) => {
    commit(
      selectedSet.has(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  };

  const focusAt = (index: number) => {
    const option = options[(index + options.length) % options.length];
    if (!option) return;
    setActiveId(option.id);
    document.getElementById(`${baseId}-opt-${option.id}`)?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    index: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(options.length - 1);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle(options[index]?.id ?? "");
    }
  };

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      {label && (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      )}

      <ul
        role="listbox"
        aria-multiselectable
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="border-hairline bg-surface-1 flex max-h-64 flex-col gap-0.5 overflow-auto rounded-3 border p-1"
      >
        {options.map((option, index) => {
          const isSelected = selectedSet.has(option.id);
          const isActive = option.id === activeId;
          return (
            <li
              key={option.id}
              role="option"
              aria-selected={isSelected}
              id={`${baseId}-opt-${option.id}`}
              tabIndex={isActive ? 0 : -1}
              onFocus={() => setActiveId(option.id)}
              onClick={() => {
                setActiveId(option.id);
                toggle(option.id);
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className="relative flex cursor-pointer items-center gap-2.5 rounded-2 px-2.5 py-2 outline-none focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              {isActive &&
                (motionSafe ? (
                  <motion.span
                    aria-hidden
                    layoutId={markerId}
                    transition={springs.snap}
                    className="bg-surface-2 absolute inset-0 rounded-2"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="bg-surface-2 absolute inset-0 rounded-2"
                  />
                ))}

              <span
                aria-hidden
                className={cn(
                  "relative flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-hairline-strong",
                )}
              >
                {isSelected && (
                  <svg viewBox="0 0 16 16" className="size-3" fill="none">
                    <motion.path
                      d="M3.5 8.4 L6.6 11.5 L12.5 4.5"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={
                        motionSafe
                          ? { duration: durations.fast, ease: easings.enter }
                          : { duration: 0 }
                      }
                    />
                  </svg>
                )}
              </span>

              <span className="relative min-w-0 flex-1">
                <span className="text-ink block truncate text-sm">
                  {option.label}
                </span>
                {option.hint && (
                  <span className="text-ink-3 block truncate text-xs">
                    {option.hint}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <p
        role="status"
        aria-live="polite"
        className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        <span className="text-[var(--signal,var(--primary))]">
          {selected.length}
        </span>{" "}
        of {options.length} selected
      </p>
    </div>
  );
}
