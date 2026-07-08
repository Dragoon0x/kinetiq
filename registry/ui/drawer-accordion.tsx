"use client";

import * as React from "react";

import { ChevronDown } from "lucide-react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type Nudge = { above: string | null; below: string | null };

type DrawerAccordionContextValue = {
  openValues: string[];
  toggle: (value: string) => void;
  focusMove: (
    current: HTMLButtonElement,
    to: "next" | "prev" | "first" | "last",
  ) => void;
  nudge: Nudge | null;
  motionSafe: boolean;
};

const DrawerAccordionContext =
  React.createContext<DrawerAccordionContextValue | null>(null);

type DrawerAccordionItemContextValue = {
  value: string;
  disabled: boolean;
  open: boolean;
  triggerId: string;
  contentId: string;
};

const DrawerAccordionItemContext =
  React.createContext<DrawerAccordionItemContextValue | null>(null);

function useDrawerAccordionContext(component: string) {
  const context = React.useContext(DrawerAccordionContext);
  if (context === null) {
    throw new Error(`<${component}> must be used within <DrawerAccordion>`);
  }
  return context;
}

function useDrawerAccordionItemContext(component: string) {
  const context = React.useContext(DrawerAccordionItemContext);
  if (context === null) {
    throw new Error(
      `<${component}> must be used within <DrawerAccordionItem>`,
    );
  }
  return context;
}

const toArray = (value: string | string[] | undefined): string[] => {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  return value === "" ? [] : [value];
};

export type DrawerAccordionProps = {
  className?: string;
  children: React.ReactNode;
} & (
  | {
      type?: "single";
      /** The open item's value. Empty string means none. */
      value?: string;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
      /** Whether the open item can be closed again. @default true */
      collapsible?: boolean;
    }
  | {
      type: "multiple";
      /** The open items' values. */
      value?: string[];
      defaultValue?: string[];
      onValueChange?: (value: string[]) => void;
    }
);

/**
 * Opens like a specimen cabinet: each drawer's height glides open on `glide`
 * while its contents lag 40ms behind, rising 8px into place like papers
 * settling in a pulled drawer. The chevron flips on `snap`, and adjacent
 * drawers yield a transient ±2px on `flick` as the cabinet shifts.
 */
export function DrawerAccordion(props: DrawerAccordionProps) {
  const { className, children } = props;
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [uncontrolledValues, setUncontrolledValues] = React.useState<string[]>(
    () => toArray(props.defaultValue),
  );
  const openValues =
    props.value !== undefined ? toArray(props.value) : uncontrolledValues;

  // Sibling yield: neighbors of a just-opened drawer get a transient nudge.
  const [nudge, setNudge] = React.useState<Nudge | null>(null);
  const nudgeTimer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
    },
    [],
  );

  const yieldNeighbors = (value: string) => {
    if (!motionSafe) return;
    const root = rootRef.current;
    if (!root) return;
    const items = Array.from(
      root.querySelectorAll<HTMLElement>("[data-drawer-accordion-item]"),
    );
    const index = items.findIndex(
      (element) => element.dataset.drawerAccordionItem === value,
    );
    if (index === -1) return;
    const above = items[index - 1]?.dataset.drawerAccordionItem ?? null;
    const below = items[index + 1]?.dataset.drawerAccordionItem ?? null;
    if (above === null && below === null) return;
    setNudge({ above, below });
    if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current);
    nudgeTimer.current = window.setTimeout(() => setNudge(null), 160);
  };

  const toggle = (value: string) => {
    const isOpen = openValues.includes(value);
    let next: string[];
    if (props.type === "multiple") {
      next = isOpen
        ? openValues.filter((open) => open !== value)
        : [...openValues, value];
    } else if (isOpen) {
      if (!(props.collapsible ?? true)) return;
      next = [];
    } else {
      next = [value];
    }
    if (props.value === undefined) setUncontrolledValues(next);
    if (props.type === "multiple") props.onValueChange?.(next);
    else props.onValueChange?.(next[0] ?? "");
    if (!isOpen) yieldNeighbors(value);
  };

  const focusMove = (
    current: HTMLButtonElement,
    to: "next" | "prev" | "first" | "last",
  ) => {
    const root = rootRef.current;
    if (!root) return;
    const triggers = Array.from(
      root.querySelectorAll<HTMLButtonElement>(
        "[data-drawer-accordion-trigger]",
      ),
    ).filter((trigger) => !trigger.disabled);
    if (triggers.length === 0) return;
    let target: HTMLButtonElement | undefined;
    if (to === "first") target = triggers[0];
    else if (to === "last") target = triggers[triggers.length - 1];
    else {
      const index = triggers.indexOf(current);
      if (index === -1) return;
      const offset = to === "next" ? 1 : -1;
      target = triggers[(index + offset + triggers.length) % triggers.length];
    }
    target?.focus();
  };

  return (
    <DrawerAccordionContext.Provider
      value={{ openValues, toggle, focusMove, nudge, motionSafe }}
    >
      <div
        ref={rootRef}
        className={cn(
          "border-border bg-card divide-border w-full divide-y overflow-hidden rounded-3 border",
          className,
        )}
      >
        {children}
      </div>
    </DrawerAccordionContext.Provider>
  );
}

export type DrawerAccordionItemProps = {
  /** Unique value identifying this drawer within the accordion. */
  value: string;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function DrawerAccordionItem({
  value,
  disabled = false,
  className,
  children,
}: DrawerAccordionItemProps) {
  const context = useDrawerAccordionContext("DrawerAccordionItem");
  const triggerId = React.useId();
  const contentId = React.useId();
  const open = context.openValues.includes(value);
  const nudgeY =
    context.nudge?.above === value ? -2 : context.nudge?.below === value ? 2 : 0;

  const itemContext = React.useMemo(
    () => ({ value, disabled, open, triggerId, contentId }),
    [value, disabled, open, triggerId, contentId],
  );

  return (
    <DrawerAccordionItemContext.Provider value={itemContext}>
      <motion.div
        data-drawer-accordion-item={value}
        initial={false}
        animate={{ y: nudgeY }}
        transition={context.motionSafe ? springs.flick : { duration: 0 }}
        className={className}
      >
        {children}
      </motion.div>
    </DrawerAccordionItemContext.Provider>
  );
}

const FOCUS_MOVES: Record<string, "next" | "prev" | "first" | "last"> = {
  ArrowDown: "next",
  ArrowUp: "prev",
  Home: "first",
  End: "last",
};

export type DrawerAccordionTriggerProps = {
  /** Optional leading icon, rendered before the label. */
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function DrawerAccordionTrigger({
  icon,
  className,
  children,
}: DrawerAccordionTriggerProps) {
  const context = useDrawerAccordionContext("DrawerAccordionTrigger");
  const item = useDrawerAccordionItemContext("DrawerAccordionTrigger");

  return (
    <h3 className="m-0">
      <button
        type="button"
        id={item.triggerId}
        data-drawer-accordion-trigger=""
        aria-expanded={item.open}
        aria-controls={item.contentId}
        disabled={item.disabled}
        onClick={() => context.toggle(item.value)}
        onKeyDown={(event) => {
          const to = FOCUS_MOVES[event.key];
          if (!to) return;
          event.preventDefault();
          context.focusMove(event.currentTarget, to);
        }}
        className={cn(
          "hover:bg-accent flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-medium transition-colors",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
      >
        {icon != null && (
          <span
            aria-hidden
            className="text-muted-foreground shrink-0 [&_svg]:size-4"
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 flex-1">{children}</span>
        <motion.span
          aria-hidden
          initial={false}
          animate={{ rotate: item.open ? 180 : 0 }}
          transition={context.motionSafe ? springs.snap : { duration: 0 }}
          className="text-muted-foreground shrink-0"
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
    </h3>
  );
}

export type DrawerAccordionContentProps = {
  className?: string;
  children: React.ReactNode;
};

export function DrawerAccordionContent({
  className,
  children,
}: DrawerAccordionContentProps) {
  const context = useDrawerAccordionContext("DrawerAccordionContent");
  const item = useDrawerAccordionItemContext("DrawerAccordionContent");
  const { motionSafe } = context;
  const { open } = item;

  return (
    <motion.div
      role="region"
      id={item.contentId}
      aria-labelledby={item.triggerId}
      aria-hidden={!open}
      inert={!open}
      initial={false}
      animate={{ height: open ? "auto" : 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className="overflow-hidden"
    >
      <motion.div
        initial={false}
        animate={
          open
            ? { y: 0, opacity: 1 }
            : { y: motionSafe ? distances.step : 0, opacity: 0 }
        }
        transition={
          motionSafe
            ? open
              ? {
                  // Contents lag the drawer by 40ms, rising into place.
                  y: { ...springs.glide, delay: 0.04 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: 0.04,
                  },
                }
              : { y: exitFor(durations.base), opacity: exitFor(durations.base) }
            : { duration: durations.fast }
        }
        className={cn("px-4 pb-4 text-sm", className)}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
