"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";

import { AlertBar } from "@/registry/ui/alert-bar";
import { MarqueeSwap } from "@/registry/ui/marquee-swap";
import { cn } from "@/registry/lib/utils";

export type AnnounceLaunchRailProps = {
  title?: string;
  /** The updates the slot rolls through, in order. */
  updates?: string[];
  /** Seconds each update holds. */
  interval?: number;
  actionLabel?: string;
  onAction?: () => void;
  /** Controlled visibility passthrough. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

const DEFAULT_UPDATES = [
  "Relay 2.0 is live — pipelines now roll out in one motion",
  "New: rehearsal mode for every policy before it enforces",
  "The winter maintenance window is retired — nothing stops anymore",
];

/**
 * A launch rail for the top of a page: the library's own alert bar carrying a
 * rolling slot of updates — one line at a time, each holding just long enough
 * to read. The bar owns the entrance, the severity stripe, and the dismissal
 * that closes the space behind it; the slot only rolls. Dismiss it and every
 * update goes at once, the way a rail should.
 */
export function AnnounceLaunchRail({
  title = "What's new",
  updates = DEFAULT_UPDATES,
  interval = 4,
  actionLabel = "See all updates",
  onAction,
  open,
  onOpenChange,
  className,
}: AnnounceLaunchRailProps) {
  return (
    <div className={cn("bg-surface-0 w-full", className)}>
      <AlertBar
        severity="info"
        title={title}
        open={open}
        onOpenChange={onOpenChange}
        className="rounded-none border-x-0"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
          <MarqueeSwap
            items={updates}
            interval={interval}
            className="text-ink-2 min-w-0 flex-1 text-sm"
          />
          <button
            type="button"
            onClick={onAction}
            className="text-ink-2 hover:text-ink inline-flex shrink-0 items-center gap-1 text-sm font-medium transition-colors"
          >
            {actionLabel}
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </div>
      </AlertBar>
    </div>
  );
}
