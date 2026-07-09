"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Size = "sm" | "md";

type SegmentedControlContextValue = {
  value: string | null;
  select: (next: string) => void;
  /** The pressed item, held on `flick` until pointer up / key up. */
  pressed: string | null;
  press: (target: string) => void;
  /** Scoped release — only clears the press if `target` still owns it. */
  release: (target: string) => void;
  name?: string;
  disabled: boolean;
  size: Size;
  thumbId: string;
  motionSafe: boolean;
};

const SegmentedControlContext =
  React.createContext<SegmentedControlContextValue | null>(null);

function useSegmentedControlContext(
  component: string,
): SegmentedControlContextValue {
  const context = React.useContext(SegmentedControlContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside <SegmentedControl>.`);
  }
  return context;
}

const sizeStyles = {
  sm: { track: "h-8 p-0.5", item: "px-2.5 text-xs" },
  md: { track: "h-9 p-1 text-sm", item: "px-3 text-sm" },
} as const satisfies Record<Size, { track: string; item: string }>;

export type SegmentedControlProps = {
  /** Controlled selection. */
  value?: string;
  /** Initial selection for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Renders a hidden native radio per item so plain forms post the selection. */
  name?: string;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  size?: Size;
  disabled?: boolean;
  className?: string;
  /** SegmentedControlItem elements. */
  children: React.ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<"div">,
  "defaultValue" | "onChange" | "children"
>;

/**
 * A compact horizontal value selector — semantically a radio group, not tabs.
 * The group owns one raised thumb, a shared element keyed by a scoped
 * `layoutId`, rendered inside the active segment. Changing the value
 * FLIP-glides the thumb from the old segment into the new one on `snap` — one
 * crisp overshoot. Labels crossfade at `durations.base`; pressing a segment
 * dips it to 0.97 on `flick`. Reduced motion: the thumb swaps segments
 * instantly (no travel), colors only, and the first paint never animates.
 *
 * Keyboard follows the APG radio pattern: arrows move and select (wrapping,
 * disabled items skipped), Space selects the focused item, Home/End jump to
 * the ends. Roving tabindex — the selected item is the tab stop; before any
 * selection the group delegates focus to its first enabled item.
 */
export function SegmentedControl({
  value: controlledValue,
  defaultValue,
  onValueChange,
  name,
  label,
  size = "md",
  disabled = false,
  className,
  children,
  onFocus,
  ...props
}: SegmentedControlProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const thumbId = `${baseId}-thumb`;
  const labelId = `${baseId}-label`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | null
  >(defaultValue ?? null);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const [pressed, setPressed] = React.useState<string | null>(null);

  const press = React.useCallback((target: string) => setPressed(target), []);

  const release = React.useCallback((target: string) => {
    setPressed((prev) => (prev === target ? null : prev));
  }, []);

  const select = React.useCallback(
    (next: string) => {
      if (disabled || next === value) return;
      if (!isControlled) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [disabled, isControlled, onValueChange, value],
  );

  const context = React.useMemo<SegmentedControlContextValue>(
    () => ({
      value,
      select,
      pressed,
      press,
      release,
      name,
      disabled,
      size,
      thumbId,
      motionSafe,
    }),
    [
      value,
      select,
      pressed,
      press,
      release,
      name,
      disabled,
      size,
      thumbId,
      motionSafe,
    ],
  );

  return (
    <div
      role="radiogroup"
      aria-labelledby={label ? labelId : undefined}
      aria-orientation="horizontal"
      aria-disabled={disabled || undefined}
      className={cn("inline-flex min-w-0 flex-col gap-2", className)}
      {...props}
    >
      {label && (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      )}
      <div
        // With no selection the track is the tab stop and hands focus to its
        // first enabled item.
        tabIndex={value === null && !disabled ? 0 : -1}
        onFocus={(event) => {
          onFocus?.(event);
          if (event.target !== event.currentTarget) return;
          event.currentTarget
            .querySelector<HTMLButtonElement>('[role="radio"]:not(:disabled)')
            ?.focus();
        }}
        className={cn(
          "bg-surface-2 border-hairline inline-flex items-stretch rounded-3 border",
          sizeStyles[size].track,
          disabled && "opacity-50",
        )}
      >
        <SegmentedControlContext.Provider value={context}>
          {children}
        </SegmentedControlContext.Provider>
      </div>
    </div>
  );
}

export type SegmentedControlItemProps = {
  value: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<"button">,
  "value" | "role" | "aria-checked" | "children"
>;

/**
 * One segment. Becoming the selection glides the group's shared thumb into it;
 * pressing it dips the label on `flick` until pointer up.
 */
export function SegmentedControlItem({
  value,
  disabled,
  className,
  children,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: SegmentedControlItemProps) {
  const context = useSegmentedControlContext("SegmentedControlItem");
  const motionSafe = context.motionSafe;

  const checked = context.value === value;
  const isDisabled = context.disabled || disabled;
  const isPressed = motionSafe && context.pressed === value && !isDisabled;

  const activate = (target: HTMLButtonElement | undefined) => {
    const next = target?.dataset.segmentValue;
    if (!target || next === undefined) return;
    target.focus();
    context.select(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) context.press(value);
      context.select(value);
      return;
    }
    const group = event.currentTarget.closest('[role="radiogroup"]');
    if (!group) return;
    const radios = Array.from(
      group.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
    );
    const index = radios.indexOf(event.currentTarget);
    if (index === -1 || radios.length === 0) return;
    let target: HTMLButtonElement | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      target = radios[(index + 1) % radios.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      target = radios[(index - 1 + radios.length) % radios.length];
    } else if (event.key === "Home") {
      target = radios[0];
    } else if (event.key === "End") {
      target = radios[radios.length - 1];
    } else {
      return;
    }
    event.preventDefault();
    activate(target);
  };

  return (
    <>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        data-segment-value={value}
        tabIndex={checked ? 0 : -1}
        disabled={isDisabled}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) {
            context.release(value);
            return;
          }
          context.select(value);
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.defaultPrevented || event.button !== 0) return;
          context.press(value);
        }}
        onPointerUp={(event) => {
          onPointerUp?.(event);
          context.release(value);
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          context.release(value);
        }}
        onPointerCancel={(event) => {
          onPointerCancel?.(event);
          context.release(value);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => {
          onKeyUp?.(event);
          context.release(value);
        }}
        onBlur={(event) => {
          onBlur?.(event);
          context.release(value);
        }}
        className={cn(
          "relative flex flex-1 cursor-pointer items-center justify-center rounded-2 font-medium whitespace-nowrap transition-colors",
          "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]",
          "disabled:pointer-events-none disabled:opacity-50",
          checked
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
          sizeStyles[context.size].item,
          className,
        )}
        {...props}
      >
        {checked &&
          (motionSafe ? (
            <motion.span
              aria-hidden
              layoutId={context.thumbId}
              transition={springs.snap}
              className="bg-surface-1 border-hairline absolute inset-0 rounded-2 border shadow-sm"
            />
          ) : (
            <span
              aria-hidden
              className="bg-surface-1 border-hairline absolute inset-0 rounded-2 border shadow-sm"
            />
          ))}
        <motion.span
          initial={false}
          animate={{ scale: isPressed ? 0.97 : 1 }}
          transition={springs.flick}
          className="relative"
        >
          {children}
        </motion.span>
      </button>
      {context.name !== undefined && (
        <input
          type="radio"
          name={context.name}
          value={value}
          checked={checked}
          disabled={isDisabled}
          readOnly
          tabIndex={-1}
          aria-hidden
          className="sr-only"
        />
      )}
    </>
  );
}
