"use client";

import * as React from "react";

import { ChevronLeft, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RailItem = {
  id: string;
  label: string;
  /** Small trailing detail — a count, a state. */
  hint?: string;
};

export type RailQuota = {
  used: number;
  limit: number;
  label: string;
};

export type WorkbenchRailProps = {
  /** The workspace named at the head. */
  workspace?: string;
  primary?: RailItem[];
  /** The running conversations, under their own heading. */
  threads?: RailItem[];
  threadsHeading?: string;
  activeId?: string;
  onSelect?: (id: string) => void;
  newLabel?: string;
  onNew?: () => void;
  /** The honest seat meter, e.g. 3 of 10 invites used. */
  quota?: RailQuota;
  /** The footer action. */
  footerLabel?: string;
  onFooter?: () => void;
  defaultCollapsed?: boolean;
  className?: string;
};

const DEFAULT_PRIMARY: RailItem[] = [
  { id: "home", label: "Home" },
  { id: "boards", label: "Boards", hint: "4" },
  { id: "exports", label: "Exports" },
];

const DEFAULT_THREADS: RailItem[] = [
  { id: "t1", label: "Crane 2 hold, this morning" },
  { id: "t2", label: "Reorder list for the stores" },
  { id: "t3", label: "Crew B rest window" },
  { id: "t4", label: "Draft the handover note" },
];

/**
 * The workspace rail: primary destinations, then the running conversations,
 * with one gliding highlight that travels to whatever the pointer is over —
 * a single shared element, so the hover reads as one light moving rather
 * than many lighting up. The invite quota is a printed fraction, not a
 * paywall surprise, and the whole rail folds to a spine when the work needs
 * the width back.
 *
 * Selection is carried by state and an aria-current mark; the travelling
 * highlight is hover only. Reduced motion: the highlight appears in place
 * and the fold swaps instantly.
 */
export function WorkbenchRail({
  workspace = "North Basin Ops",
  primary = DEFAULT_PRIMARY,
  threads = DEFAULT_THREADS,
  threadsHeading = "Chats",
  activeId: activeProp,
  onSelect,
  newLabel = "New chat",
  onNew,
  quota = { used: 3, limit: 10, label: "invites used" },
  footerLabel = "Upgrade",
  onFooter,
  defaultCollapsed = false,
  className,
}: WorkbenchRailProps) {
  const motionSafe = useMotionSafe();
  const highlightId = React.useId();
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [ownActive, setOwnActive] = React.useState(
    activeProp ?? primary[0]?.id ?? "",
  );
  const active = activeProp ?? ownActive;
  const [hovered, setHovered] = React.useState<string | null>(null);

  const pick = (id: string) => {
    if (activeProp === undefined) setOwnActive(id);
    onSelect?.(id);
  };

  const renderItem = (item: RailItem) => {
    const current = item.id === active;
    return (
      <li key={item.id} className="relative">
        {hovered === item.id && (
          <motion.span
            layoutId={motionSafe ? highlightId : undefined}
            aria-hidden
            className="absolute inset-0 rounded-2 bg-surface-2"
            transition={motionSafe ? springs.snap : { duration: 0 }}
          />
        )}
        <button
          type="button"
          aria-current={current ? "true" : undefined}
          onClick={() => pick(item.id)}
          onMouseEnter={() => setHovered(item.id)}
          onMouseLeave={() => setHovered(null)}
          onFocus={() => setHovered(item.id)}
          onBlur={() => setHovered(null)}
          className={cn(
            "relative z-10 flex w-full min-w-0 items-baseline gap-2 rounded-2 px-2.5 py-1.5 text-left text-sm transition-colors",
            current ? "font-medium text-ink" : "text-ink-2",
          )}
        >
          {current && (
            <span
              aria-hidden
              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
            />
          )}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint && (
            <span className="shrink-0 font-mono text-[10px] text-ink-3">
              {item.hint}
            </span>
          )}
        </button>
      </li>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-4 border border-hairline bg-surface-1",
        collapsed ? "w-12 items-center py-3" : "w-60 p-3",
        className,
      )}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand the rail"
          aria-expanded={false}
          className="rounded-2 p-1.5 text-ink-3 transition-colors hover:text-ink"
        >
          <ChevronLeft aria-hidden className="size-4 rotate-180" />
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="min-w-0 truncate text-sm font-semibold text-ink">
              {workspace}
            </p>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse the rail"
              aria-expanded={true}
              className="shrink-0 rounded-2 p-1 text-ink-3 transition-colors hover:text-ink"
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onNew}
            className="mt-3 flex items-center gap-1.5 rounded-2 border border-dashed border-hairline px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:border-hairline-strong hover:text-ink"
          >
            <Plus aria-hidden className="size-3.5" />
            {newLabel}
          </button>

          <nav aria-label="Workspace" className="mt-3">
            <ul
              className="flex flex-col gap-0.5"
              onMouseLeave={() => setHovered(null)}
            >
              {primary.map(renderItem)}
            </ul>
          </nav>

          <nav aria-label={threadsHeading} className="mt-4 min-h-0 flex-1">
            <p className="px-1 text-label text-ink-3">{threadsHeading}</p>
            <ul
              className="mt-1.5 flex flex-col gap-0.5 overflow-y-auto"
              onMouseLeave={() => setHovered(null)}
            >
              {threads.map(renderItem)}
            </ul>
          </nav>

          <div className="mt-4 border-t border-hairline pt-3">
            {quota && (
              <p className="flex items-baseline justify-between px-1">
                <span className="flex items-baseline gap-1 font-mono text-[11px] text-ink-3">
                  <Readout value={quota.used} size="sm" />
                  <span className="opacity-70">/ {quota.limit}</span>
                </span>
                <span className="text-label text-ink-3">{quota.label}</span>
              </p>
            )}
            <AnimatePresence>
              {quota && quota.used >= quota.limit && (
                <motion.p
                  initial={{ opacity: motionSafe ? 0 : 1 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.fast },
                  }}
                  className="mt-1 px-1 text-[11px] text-ink-3"
                >
                  Every seat is taken.
                </motion.p>
              )}
            </AnimatePresence>
            <button
              type="button"
              onClick={onFooter}
              className="mt-2.5 w-full rounded-2 bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              {footerLabel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
