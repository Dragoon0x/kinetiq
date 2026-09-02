"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FocusRailItem = {
  id: string;
  label: string;
  content?: React.ReactNode;
};

export type FocusRailProps = {
  items: FocusRailItem[];
  /** Controlled active panel id. */
  activeId?: string;
  /** Initial active panel for uncontrolled usage. @default first item */
  defaultActiveId?: string;
  /** Fires when a press or a keyboard move commits a new panel — a hover preview never fires it. */
  onActiveChange?: (id: string) => void;
  /** Flex-grow the active panel reaches for. @default 2.4 */
  grow?: number;
  /** Row that grows in width, or stack that grows in height. @default "horizontal" */
  orientation?: "horizontal" | "vertical";
  /** "hover" previews on pointerenter and commits on focus; "press" answers only to click, Enter, Space, and keyboard moves. @default "hover" */
  expandOn?: "hover" | "press";
  /** Custom panel face; receives the item and whether it is the expanded one. The default face renders the label and content. */
  renderPanel?: (
    item: FocusRailItem,
    state: { active: boolean },
  ) => React.ReactNode;
  /** Accessible name of the rail. @default "Focus rail" */
  label?: string;
  className?: string;
};

/** Keys the roving-tabindex handler answers to, resolved by orientation. */
type RailDirection = "next" | "prev" | "first" | "last";

/**
 * A row of panels where the active one expands on `glide` and every sibling
 * contracts in place — the primitive behind expanding galleries and team
 * panels, extracted from the flexGrow mechanic first proven inline in the
 * offer triptych. Hovering only previews the expansion; it never overwrites
 * the committed panel, so leaving the whole rail always restores the default
 * or last-pressed panel instead of collapsing to nothing. Press mode drops
 * the preview and answers only to click, Enter, Space, and roving-tabindex
 * keyboard moves, which commit in both modes because a focused panel is
 * always treated as intent. Each panel's label holds its place while its
 * detail crossfades in on `snap` and tweens out on `easings.exit`, clipped so
 * text never wraps mid-collapse.
 *
 * Reduced motion: panels resize instantly and the detail swaps without fades.
 */
export function FocusRail({
  items,
  activeId: activeIdProp,
  defaultActiveId,
  onActiveChange,
  grow = 2.4,
  orientation = "horizontal",
  expandOn = "hover",
  renderPanel,
  label = "Focus rail",
  className,
}: FocusRailProps) {
  const motionSafe = useMotionSafe();
  const [internalActive, setInternalActive] = React.useState(
    defaultActiveId ?? items[0]?.id ?? "",
  );
  const committed = activeIdProp ?? internalActive;

  /** Transient hover preview — never the source of truth, only its display. */
  const [hoverPreview, setHoverPreview] = React.useState<string | null>(null);
  const expandedId =
    expandOn === "hover" ? (hoverPreview ?? committed) : committed;

  const commit = (id: string) => {
    setHoverPreview(null);
    if (id === committed) return;
    if (activeIdProp === undefined) setInternalActive(id);
    onActiveChange?.(id);
  };

  const preview = (id: string) => {
    setHoverPreview((prev) => (prev === id ? prev : id));
  };

  const clearPreview = () => {
    setHoverPreview((prev) => (prev === null ? prev : null));
  };

  const moveFocus = (current: HTMLButtonElement, direction: RailDirection) => {
    const group = current.closest('[role="group"]');
    if (!group) return;
    const panels = Array.from(
      group.querySelectorAll<HTMLButtonElement>('[data-rail-panel="true"]'),
    );
    const index = panels.indexOf(current);
    if (index === -1 || panels.length === 0) return;
    let target: HTMLButtonElement | undefined;
    if (direction === "next") target = panels[(index + 1) % panels.length];
    else if (direction === "prev")
      target = panels[(index - 1 + panels.length) % panels.length];
    else if (direction === "first") target = panels[0];
    else target = panels[panels.length - 1];
    target?.focus();
  };

  return (
    <div
      role="group"
      aria-label={label}
      onPointerLeave={() => {
        if (expandOn === "hover") clearPreview();
      }}
      className={cn(
        "flex gap-3",
        orientation === "vertical" ? "flex-col" : "flex-row",
        className,
      )}
    >
      {items.map((item) => (
        <RailPanel
          key={item.id}
          item={item}
          active={item.id === expandedId}
          tabStop={item.id === committed}
          grow={grow}
          orientation={orientation}
          expandOn={expandOn}
          motionSafe={motionSafe}
          renderPanel={renderPanel}
          onCommit={commit}
          onPreview={preview}
          onMove={moveFocus}
        />
      ))}
    </div>
  );
}

type RailPanelProps = {
  item: FocusRailItem;
  active: boolean;
  tabStop: boolean;
  grow: number;
  orientation: "horizontal" | "vertical";
  expandOn: "hover" | "press";
  motionSafe: boolean;
  renderPanel?: (
    item: FocusRailItem,
    state: { active: boolean },
  ) => React.ReactNode;
  onCommit: (id: string) => void;
  onPreview: (id: string) => void;
  onMove: (current: HTMLButtonElement, direction: RailDirection) => void;
};

/** One panel of the rail — a real button so focus, click, and roving tabindex all fall out of native semantics. */
function RailPanel({
  item,
  active,
  tabStop,
  grow,
  orientation,
  expandOn,
  motionSafe,
  renderPanel,
  onCommit,
  onPreview,
  onMove,
}: RailPanelProps) {
  const horizontal = orientation === "horizontal";
  const nextKey = horizontal ? "ArrowRight" : "ArrowDown";
  const prevKey = horizontal ? "ArrowLeft" : "ArrowUp";

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    let direction: RailDirection | null = null;
    if (event.key === nextKey) direction = "next";
    else if (event.key === prevKey) direction = "prev";
    else if (event.key === "Home") direction = "first";
    else if (event.key === "End") direction = "last";
    if (!direction) return;
    event.preventDefault();
    onMove(event.currentTarget, direction);
  };

  return (
    <motion.button
      type="button"
      data-rail-panel="true"
      aria-pressed={active}
      tabIndex={tabStop ? 0 : -1}
      onClick={() => onCommit(item.id)}
      onFocus={() => onCommit(item.id)}
      onPointerEnter={() => {
        if (expandOn === "hover") onPreview(item.id);
      }}
      onKeyDown={handleKeyDown}
      initial={false}
      animate={{ flexGrow: active ? grow : 1 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      style={{ flexGrow: 1 }}
      className={cn(
        "relative flex min-h-0 min-w-0 basis-0 flex-col overflow-hidden rounded-3 border p-4 text-left transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-hairline-strong bg-surface-1 shadow-raised"
          : "border-hairline bg-surface-1 hover:border-hairline-strong",
      )}
    >
      {renderPanel ? (
        renderPanel(item, { active })
      ) : (
        <>
          <span className="block shrink-0 text-label whitespace-nowrap text-ink">
            {item.label}
          </span>
          <AnimatePresence initial={false}>
            {active && item.content ? (
              <motion.div
                key={item.id}
                initial={
                  motionSafe ? { opacity: 0, y: distances.nudge } : false
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  transition: motionSafe
                    ? exitFor(durations.base)
                    : { duration: 0 },
                }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className="mt-2 min-w-0 overflow-hidden"
              >
                {item.content}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      )}
    </motion.button>
  );
}
