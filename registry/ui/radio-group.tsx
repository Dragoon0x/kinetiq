"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type RadioGroupContextValue = {
  value: string | null;
  select: (next: string) => void;
  armed: string | null;
  arm: (next: string) => void;
  /** Scoped clear that defers to an in-flight dot landing. */
  release: (target: string) => void;
  /** Scoped clear that ignores travel state. */
  disarm: (target: string) => void;
  /** The dot landed — rebound the receiving ring. */
  settle: () => void;
  name?: string;
  disabled: boolean;
  dotId: string;
  dotOpacity: MotionValue<number>;
};

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(
  null,
);

function useRadioGroupContext(component: string): RadioGroupContextValue {
  const context = React.useContext(RadioGroupContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside <RadioGroup>.`);
  }
  return context;
}

/** The dot glides in ~450ms; the timer is the landing's safety net. */
const SETTLE_FALLBACK_MS = 700;

export type RadioGroupProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "defaultValue" | "onChange"
> & {
  /** Controlled selection. */
  value?: string;
  /** Initial selection for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Renders a hidden native radio per item so plain forms post the selection. */
  name?: string;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
};

/**
 * Selection that travels, never teleports. The group owns a single dot — a
 * shared element keyed by one scoped `layoutId` — so changing the value
 * FLIP-glides it out of the old ring and into the new one on `glide`. The
 * receiving ring arms on pointer or key down, squashing to 0.9 on `flick`,
 * and rebounds on `snap` once the dot lands. Ring borders crossfade at
 * `durations.fast`; the very first selection fades the dot in instead of
 * traveling. Reduced motion: the dot swaps rings instantly, colors only.
 *
 * Keyboard follows the APG radio pattern: arrows move and select (wrapping,
 * disabled items skipped), Space selects the focused item, Home/End jump to
 * the ends. Roving tabindex — the selected item is the tab stop; before any
 * selection the group delegates focus to its first enabled item.
 */
export function RadioGroup({
  value: controlledValue,
  defaultValue,
  onValueChange,
  name,
  label,
  orientation = "vertical",
  disabled = false,
  className,
  children,
  onFocus,
  ...props
}: RadioGroupProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const dotId = `${baseId}-dot`;
  const labelId = `${baseId}-label`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | null
  >(defaultValue ?? null);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const [armed, setArmed] = React.useState<string | null>(null);
  const travelPending = React.useRef(false);
  const settleTimer = React.useRef(0);

  // The dot exists once; opacity rides a motion value so a travel between
  // rings (a remount to React) never replays the entrance fade.
  const dotOpacity = useMotionValue(value !== null ? 1 : 0);

  React.useEffect(() => {
    if (value === null || dotOpacity.get() === 1) return;
    const controls = animate(dotOpacity, 1, { duration: durations.fast });
    return () => controls.stop();
  }, [value, dotOpacity]);

  React.useEffect(
    () => () => window.clearTimeout(settleTimer.current),
    [],
  );

  const settle = React.useCallback(() => {
    travelPending.current = false;
    window.clearTimeout(settleTimer.current);
    setArmed(null);
  }, []);

  const arm = React.useCallback((next: string) => setArmed(next), []);

  const disarm = React.useCallback((target: string) => {
    setArmed((prev) => (prev === target ? null : prev));
  }, []);

  const release = React.useCallback((target: string) => {
    if (travelPending.current) return;
    setArmed((prev) => (prev === target ? null : prev));
  }, []);

  const select = React.useCallback(
    (next: string) => {
      if (disabled || next === value) return;
      if (motionSafe && value !== null) {
        // A travel is departing: hold the receiving ring's squash until the
        // dot lands (onLayoutAnimationComplete), with a timer as backstop.
        travelPending.current = true;
        window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(settle, SETTLE_FALLBACK_MS);
      } else {
        travelPending.current = false;
        setArmed(null);
      }
      if (!isControlled) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [disabled, isControlled, motionSafe, onValueChange, settle, value],
  );

  const context = React.useMemo<RadioGroupContextValue>(
    () => ({
      value,
      select,
      armed,
      arm,
      release,
      disarm,
      settle,
      name,
      disabled,
      dotId,
      dotOpacity,
    }),
    [
      value,
      select,
      armed,
      arm,
      release,
      disarm,
      settle,
      name,
      disabled,
      dotId,
      dotOpacity,
    ],
  );

  return (
    <div
      role="radiogroup"
      aria-labelledby={label ? labelId : undefined}
      aria-orientation={orientation}
      aria-disabled={disabled || undefined}
      // With no selection the group itself is the tab stop and hands focus
      // to its first enabled item.
      tabIndex={value === null && !disabled ? 0 : -1}
      onFocus={(event) => {
        onFocus?.(event);
        if (event.target !== event.currentTarget) return;
        event.currentTarget
          .querySelector<HTMLButtonElement>('[role="radio"]:not(:disabled)')
          ?.focus();
      }}
      className={cn("min-w-0", className)}
      {...props}
    >
      {label && (
        <div id={labelId} className="mb-3 text-sm font-semibold">
          {label}
        </div>
      )}
      <div
        className={
          orientation === "horizontal"
            ? "flex flex-wrap items-start gap-x-6 gap-y-2.5"
            : "flex flex-col gap-2.5"
        }
      >
        <RadioGroupContext.Provider value={context}>
          {children}
        </RadioGroupContext.Provider>
      </div>
    </div>
  );
}

export type RadioGroupItemProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "value" | "role" | "aria-checked"
> & {
  value: string;
  /** Muted line under the label. */
  description?: React.ReactNode;
};

/**
 * One selectable ring. Becoming the selection glides the group's shared dot
 * into it; pressing it squashes the ring on `flick` until the dot lands.
 */
export function RadioGroupItem({
  value,
  description,
  disabled,
  className,
  children,
  onClick,
  onPointerDown,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: RadioGroupItemProps) {
  const context = useRadioGroupContext("RadioGroupItem");
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const itemLabelId = `${baseId}-label`;
  const descriptionId = `${baseId}-description`;

  const checked = context.value === value;
  const isDisabled = context.disabled || disabled;
  const squashed = motionSafe && context.armed === value && !isDisabled;

  const activate = (target: HTMLButtonElement | undefined) => {
    const next = target?.dataset.radioValue;
    if (!target || next === undefined) return;
    // Focus before arming: the origin's blur only clears its own armament.
    target.focus();
    context.arm(next);
    context.select(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) context.arm(value);
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
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      target = radios[(index + 1) % radios.length];
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
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
        aria-labelledby={itemLabelId}
        aria-describedby={description ? descriptionId : undefined}
        data-radio-value={value}
        tabIndex={checked ? 0 : -1}
        disabled={isDisabled}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented) {
            context.disarm(value);
            return;
          }
          if (context.value !== value) context.select(value);
          else context.disarm(value);
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          if (event.defaultPrevented || event.button !== 0) return;
          context.arm(value);
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
          "group flex cursor-pointer items-start gap-2.5 rounded-2 text-left",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <motion.span
          aria-hidden
          initial={false}
          animate={{ scale: squashed ? 0.9 : 1 }}
          transition={context.armed === value ? springs.flick : springs.snap}
          className={cn(
            "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors",
            checked ? "border-primary" : "border-input",
          )}
        >
          {checked &&
            (motionSafe ? (
              <motion.span
                layoutId={context.dotId}
                transition={springs.glide}
                onLayoutAnimationComplete={context.settle}
                style={{ opacity: context.dotOpacity }}
                className="bg-primary size-2 rounded-full"
              />
            ) : (
              <span className="bg-primary size-2 rounded-full" />
            ))}
        </motion.span>
        <span className="min-w-0 flex-1">
          <span id={itemLabelId} className="block text-sm font-medium">
            {children}
          </span>
          {description && (
            <span
              id={descriptionId}
              className="text-muted-foreground mt-0.5 block text-xs"
            >
              {description}
            </span>
          )}
        </span>
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
