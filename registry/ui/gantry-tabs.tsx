"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type GantryTabsVariant = "underline" | "segmented" | "enclosed";
type GantryTabsOrientation = "horizontal" | "vertical";
type GantryTabsActivationMode = "automatic" | "manual";

type GantryTabsContextValue = {
  value: string | null;
  setValue: (value: string) => void;
  variant: GantryTabsVariant;
  orientation: GantryTabsOrientation;
  activationMode: GantryTabsActivationMode;
  keepMounted: boolean;
  baseId: string;
  registerTrigger: (value: string, element: HTMLButtonElement | null) => void;
  getTrigger: (value: string) => HTMLButtonElement | undefined;
};

const GantryTabsContext = React.createContext<GantryTabsContextValue | null>(
  null,
);

function useGantryTabs(component: string): GantryTabsContextValue {
  const context = React.useContext(GantryTabsContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside <GantryTabs>.`);
  }
  return context;
}

/** Values become id fragments; strip anything unsafe for aria references. */
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

export type GantryTabsProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "defaultValue" | "onChange"
> & {
  /** Controlled active tab value. */
  value?: string;
  /** Initial tab for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  variant?: GantryTabsVariant;
  orientation?: GantryTabsOrientation;
  /** "automatic" activates on arrow-key focus; "manual" waits for Enter/Space. */
  activationMode?: GantryTabsActivationMode;
  /** Keep inactive panels mounted (hidden) so their DOM state survives. */
  keepMounted?: boolean;
};

/**
 * Tabs whose indicator rides a rail. On selection the edge facing the target
 * sets off on `glide` while the trailing edge lags 60ms behind, so the
 * indicator visibly stretches toward the destination, then contracts to fit
 * the new trigger. Panels crossfade with an 8px lift on `glide`; exits tween
 * out at 0.6× via `exitFor`. Under reduced motion the indicator teleports and
 * panels simply crossfade at `durations.fast`.
 */
export function GantryTabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  variant = "underline",
  orientation = "horizontal",
  activationMode = "automatic",
  keepMounted = false,
  className,
  children,
  ...props
}: GantryTabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | null
  >(defaultValue ?? null);
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;
  const baseId = React.useId();
  const triggersRef = React.useRef(new Map<string, HTMLButtonElement>());

  const setValue = React.useCallback(
    (next: string) => {
      if (next === value) return;
      if (!isControlled) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [isControlled, onValueChange, value],
  );

  const registerTrigger = React.useCallback(
    (triggerValue: string, element: HTMLButtonElement | null) => {
      if (element) triggersRef.current.set(triggerValue, element);
      else triggersRef.current.delete(triggerValue);
    },
    [],
  );

  const getTrigger = React.useCallback(
    (triggerValue: string) => triggersRef.current.get(triggerValue),
    [],
  );

  const context = React.useMemo<GantryTabsContextValue>(
    () => ({
      value,
      setValue,
      variant,
      orientation,
      activationMode,
      keepMounted,
      baseId,
      registerTrigger,
      getTrigger,
    }),
    [
      value,
      setValue,
      variant,
      orientation,
      activationMode,
      keepMounted,
      baseId,
      registerTrigger,
      getTrigger,
    ],
  );

  return (
    <div
      data-orientation={orientation}
      className={cn(
        orientation === "vertical" && "flex items-start gap-4",
        className,
      )}
      {...props}
    >
      <GantryTabsContext.Provider value={context}>
        {children}
      </GantryTabsContext.Provider>
    </div>
  );
}

export type GantryTabsListProps = React.ComponentPropsWithoutRef<"div">;

export function GantryTabsList({
  className,
  children,
  ...props
}: GantryTabsListProps) {
  const { value, variant, orientation, getTrigger } =
    useGantryTabs("GantryTabsList");
  const motionSafe = useMotionSafe();
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const startEdge = useMotionValue(0);
  const endEdge = useMotionValue(0);
  const [visible, setVisible] = React.useState(false);
  const lastRect = React.useRef<{ start: number; end: number } | null>(null);
  const horizontal = orientation === "horizontal";

  const measure = (animated: boolean) => {
    const list = listRef.current;
    const trigger = value !== null ? getTrigger(value) : undefined;
    if (!list || !trigger || !trigger.isConnected) {
      lastRect.current = null;
      setVisible(false);
      return;
    }
    const listRect = list.getBoundingClientRect();
    const rect = trigger.getBoundingClientRect();
    const start = horizontal
      ? rect.left - listRect.left
      : rect.top - listRect.top;
    const end = horizontal
      ? listRect.right - rect.right
      : listRect.bottom - rect.bottom;
    const previous = lastRect.current;
    lastRect.current = { start, end };
    if (previous && previous.start === start && previous.end === end) {
      setVisible(true);
      return;
    }
    if (!animated || !previous) {
      startEdge.jump(start);
      endEdge.jump(end);
    } else {
      // Two-phase glide: the edge facing the destination leads, the other
      // trails 60ms behind — the indicator stretches, then contracts to fit.
      const forward = start >= previous.start;
      animate(forward ? endEdge : startEdge, forward ? end : start, {
        ...springs.glide,
      });
      animate(forward ? startEdge : endEdge, forward ? start : end, {
        ...springs.glide,
        delay: 0.06,
      });
    }
    setVisible(true);
  };

  const measureRef = React.useRef(measure);
  React.useEffect(() => {
    measureRef.current = measure;
  });

  // Re-measure after every render; internal guards skip settled positions.
  React.useEffect(() => {
    measure(motionSafe);
  });

  React.useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureRef.current(false));
    observer.observe(list);
    for (const tab of list.querySelectorAll('[role="tab"]')) {
      observer.observe(tab);
    }
    return () => observer.disconnect();
  }, []);

  const listClass = {
    underline: horizontal
      ? "flex items-center gap-1 border-b border-border"
      : "flex flex-col gap-1 border-l border-border",
    segmented: horizontal
      ? "inline-flex items-center gap-1 rounded-3 bg-muted p-1"
      : "inline-flex flex-col gap-1 rounded-3 bg-muted p-1",
    enclosed: horizontal
      ? "flex items-end gap-1 border-b border-border"
      : "flex flex-col gap-1 border-r border-border",
  }[variant];

  const indicatorClass = {
    underline: horizontal
      ? "-bottom-px h-0.5 bg-primary"
      : "-left-px w-0.5 bg-primary",
    segmented: horizontal
      ? "inset-y-1 rounded-2 bg-background shadow-sm"
      : "inset-x-1 rounded-2 bg-background shadow-sm",
    enclosed: horizontal
      ? "top-0 -bottom-px rounded-t-2 border border-border border-b-transparent bg-background"
      : "left-0 -right-px rounded-l-2 border border-border border-r-transparent bg-background",
  }[variant];

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-orientation={orientation}
      className={cn("relative", listClass, className)}
      {...props}
    >
      <motion.div
        aria-hidden
        className={cn("pointer-events-none absolute", indicatorClass)}
        style={
          horizontal
            ? { left: startEdge, right: endEdge }
            : { top: startEdge, bottom: endEdge }
        }
        initial={false}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: durations.fast }}
      />
      {children}
    </div>
  );
}

export type GantryTabsTriggerProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "value"
> & {
  value: string;
};

export function GantryTabsTrigger({
  value,
  disabled,
  className,
  children,
  onClick,
  onFocus,
  onKeyDown,
  ...props
}: GantryTabsTriggerProps) {
  const context = useGantryTabs("GantryTabsTrigger");
  const { orientation, activationMode, variant, baseId } = context;
  const active = context.value === value;
  const horizontal = orientation === "horizontal";
  const tabId = `${baseId}-tab-${safeId(value)}`;
  const panelId = `${baseId}-panel-${safeId(value)}`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const list = event.currentTarget.closest('[role="tablist"]');
    if (!list) return;
    const nextKey = horizontal ? "ArrowRight" : "ArrowDown";
    const previousKey = horizontal ? "ArrowLeft" : "ArrowUp";
    const tabs = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const index = tabs.indexOf(event.currentTarget);
    if (index === -1 || tabs.length === 0) return;
    let target: HTMLButtonElement | undefined;
    if (event.key === nextKey) target = tabs[(index + 1) % tabs.length];
    else if (event.key === previousKey)
      target = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === "Home") target = tabs[0];
    else if (event.key === "End") target = tabs[tabs.length - 1];
    else return;
    event.preventDefault();
    target?.focus();
  };

  const variantClass = {
    underline: cn("px-3 py-2", !horizontal && "justify-start text-left"),
    segmented: "rounded-2 px-3 py-1.5",
    enclosed: cn("px-3 py-2", horizontal ? "rounded-t-2" : "rounded-l-2"),
  }[variant];

  return (
    <button
      ref={(element) => context.registerTrigger(value, element)}
      type="button"
      role="tab"
      id={tabId}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active || context.value === null ? 0 : -1}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setValue(value);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (activationMode === "automatic" && !event.defaultPrevented) {
          context.setValue(value);
        }
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative z-10 inline-flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors",
        "disabled:pointer-events-none disabled:opacity-50",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        variantClass,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export type GantryTabsContentProps = Omit<
  React.ComponentPropsWithoutRef<typeof motion.div>,
  "value"
> & {
  value: string;
};

export function GantryTabsContent({
  value,
  className,
  children,
  ...props
}: GantryTabsContentProps) {
  const context = useGantryTabs("GantryTabsContent");
  const motionSafe = useMotionSafe();
  const active = context.value === value;
  const tabId = `${context.baseId}-tab-${safeId(value)}`;
  const panelId = `${context.baseId}-panel-${safeId(value)}`;

  const enterTransition = motionSafe
    ? {
        y: { ...springs.glide },
        opacity: { duration: durations.base, ease: easings.enter },
      }
    : { duration: durations.fast };

  if (context.keepMounted) {
    // Kept panels hide instantly and rise back in when reselected.
    return (
      <motion.div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId}
        tabIndex={0}
        hidden={!active}
        initial={false}
        animate={
          active
            ? { opacity: 1, y: 0 }
            : { opacity: 0, y: motionSafe ? distances.step : 0 }
        }
        transition={active ? enterTransition : { duration: 0 }}
        className={className}
        {...props}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className="relative">
      <AnimatePresence mode="popLayout" initial={false}>
        {active && (
          <motion.div
            key={value}
            role="tabpanel"
            id={panelId}
            aria-labelledby={tabId}
            tabIndex={0}
            initial={
              motionSafe
                ? { opacity: 0, y: distances.step }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              transition: motionSafe
                ? exitFor(durations.base)
                : { duration: durations.fast },
            }}
            transition={enterTransition}
            className={className}
            {...props}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
