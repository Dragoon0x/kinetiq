"use client";

import * as React from "react";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AlertSeverity = "info" | "success" | "warn" | "danger";

export type AlertBarProps = {
  /** Controlled visibility. */
  open?: boolean;
  /** Initial visibility for uncontrolled usage. @default true */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** @default "info" */
  severity?: AlertSeverity;
  title: string;
  children?: React.ReactNode;
  /** @default true */
  dismissible?: boolean;
  className?: string;
};

const STRIPE: Record<AlertSeverity, string> = {
  info: "bg-primary",
  success: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
};

const TITLE: Record<AlertSeverity, string> = {
  info: "text-ink",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
};

/**
 * An inline notice that takes its own space rather than floating over the work.
 * Opening glides the row down from zero height while a severity stripe draws
 * itself down the leading edge; dismissing collapses the row back and the space
 * closes behind it, so nothing below jumps.
 *
 * Severity decides how loudly it speaks: warnings and failures mount as an
 * assertive `alert`, while information and confirmations report politely through
 * `status` and wait their turn. Colour is paired with a title tone, never asked
 * to carry the meaning alone.
 *
 * Reduced motion: the row and its stripe are simply present or gone — same
 * states, same roles, same announcements.
 */
export function AlertBar({
  open,
  defaultOpen = true,
  onOpenChange,
  severity = "info",
  title,
  children,
  dismissible = true,
  className,
}: AlertBarProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isControlled = open !== undefined;
  const shown = isControlled ? open : uncontrolled;
  const loud = severity === "danger" || severity === "warn";

  const close = () => {
    if (!isControlled) setUncontrolled(false);
    onOpenChange?.(false);
  };

  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          key="alert"
          role={loud ? "alert" : "status"}
          aria-live={loud ? "assertive" : "polite"}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{
            height: 0,
            opacity: 0,
            transition: exitFor(durations.base),
          }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : { duration: 0 }
          }
          className={cn("w-full overflow-hidden", className)}
        >
          <div className="border-hairline bg-surface-1 relative flex items-start gap-3 rounded-3 border p-3 pl-4">
            <motion.span
              aria-hidden
              className={cn(
                "absolute inset-y-2 left-1.5 w-0.5 origin-top rounded-full",
                STRIPE[severity],
              )}
              initial={{ scaleY: motionSafe ? 0 : 1 }}
              animate={{ scaleY: 1 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: 0.04 }
                  : { duration: 0 }
              }
            />

            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", TITLE[severity])}>
                {title}
              </p>
              {children && (
                <div className="text-ink-2 mt-1 text-sm">{children}</div>
              )}
            </div>

            {dismissible && (
              <button
                type="button"
                onClick={close}
                aria-label={`Dismiss: ${title}`}
                className="text-ink-3 hover:text-ink hover:bg-surface-2 -m-1 shrink-0 rounded-2 p-1 transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
