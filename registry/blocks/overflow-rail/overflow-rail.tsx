"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RailAction = {
  id: string;
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

export type OverflowRailProps = {
  primary: RailAction[];
  secondary: RailAction[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
  className?: string;
};

/**
 * More actions, sprung from the dots: pressing ⋯ morphs the pill rail open
 * inline — the primaries yield with a recoil part while the secondaries
 * cascade in from the trigger side. Escape or leaving the rail folds it
 * shut.
 */
export function OverflowRail({
  primary,
  secondary,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  label = "Actions",
  className,
}: OverflowRailProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const secondaryId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean, announce = true) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
      if (announce) {
        setAnnouncement(
          next
            ? `${secondary.length} more actions shown`
            : "Extra actions hidden",
        );
      }
    },
    [controlledOpen, onOpenChange, secondary.length],
  );

  // Click/focus outside collapses.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, setOpen]);

  // Roving arrows across every visible button in the rail.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      if (event.key === "Home" || event.key === "End") {
        const buttons = [
          ...(rootRef.current?.querySelectorAll<HTMLButtonElement>(
            "button:not([disabled])",
          ) ?? []),
        ];
        event.preventDefault();
        (event.key === "Home"
          ? buttons[0]
          : buttons[buttons.length - 1]
        )?.focus();
      }
      return;
    }
    const buttons = [
      ...(rootRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ) ?? []),
    ];
    const current = buttons.findIndex((el) => el === document.activeElement);
    if (current === -1) return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const next = (current + delta + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  const interval = cascade(Math.max(secondary.length, 2));

  const renderAction = (action: RailAction) => (
    <button
      key={action.id}
      type="button"
      title={action.label}
      disabled={action.disabled}
      onClick={action.onSelect}
      className={cn(
        "hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:pointer-events-none disabled:opacity-40",
        action.destructive && "text-destructive",
      )}
    >
      <span aria-hidden className="[&>svg]:size-4">
        {action.icon}
      </span>
      <span className="sr-only">{action.label}</span>
    </button>
  );

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn("inline-flex", className)}
    >
      <motion.div
        layout={motionSafe}
        transition={springs.glide}
        className="border-border bg-card inline-flex items-center gap-1 rounded-full border p-1"
      >
        {primary.map((action, index) => (
          <motion.div
            key={action.id}
            layout={motionSafe}
            animate={
              motionSafe && open
                ? { x: [0, -3, 0], transition: { ...springs.recoil, delay: index * 0.03 } }
                : undefined
            }
            transition={springs.glide}
          >
            {renderAction(action)}
          </motion.div>
        ))}

        <AnimatePresence mode="popLayout">
          {open
            ? secondary.map((action, index) => (
                <motion.div
                  key={action.id}
                  layout={motionSafe}
                  initial={
                    motionSafe
                      ? { x: -distances.step, opacity: 0 }
                      : { opacity: 0 }
                  }
                  animate={{
                    x: 0,
                    opacity: 1,
                    transition: motionSafe
                      ? { ...springs.snap, delay: index * interval }
                      : { duration: durations.fast },
                  }}
                  exit={{
                    opacity: 0,
                    transition: {
                      ...exitFor(durations.fast),
                      delay:
                        (secondary.length - 1 - index) * (interval / 2),
                    },
                  }}
                >
                  {renderAction(action)}
                </motion.div>
              ))
            : null}
        </AnimatePresence>

        <motion.button
          ref={triggerRef}
          layout={motionSafe}
          type="button"
          aria-expanded={open}
          aria-controls={secondaryId}
          aria-label={open ? "Hide extra actions" : "Show extra actions"}
          onClick={() => setOpen(!open)}
          className="hover:bg-accent flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
        >
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
            className="flex items-center justify-center"
            aria-hidden
          >
            <MoreHorizontal className="size-4" />
          </motion.span>
        </motion.button>
      </motion.div>

      {/* live region + control target for aria-controls */}
      <span id={secondaryId} role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
