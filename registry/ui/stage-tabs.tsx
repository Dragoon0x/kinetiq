"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Revolve geometry: degrees a panel swings while passing through a wing… */
const REVOLVE_DEG = 28;
/** …and its lateral travel through that wing, in % of panel width. */
const REVOLVE_PCT = 18;
/** Mid-revolve squash of the stage-floor shadow. */
const FLOOR_SQUASH = 0.94;
/** Band under the panel reserved for the floor shadow, px. */
const FLOOR_GAP = 12;
/** Top/side inset of the stage viewport, px — keeps focus rings unclipped. */
const STAGE_INSET = 4;

/** Tab ids become aria reference fragments; strip anything unsafe. */
const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_");

export type StageTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export type StageTabsProps = {
  tabs: StageTab[];
  /** Controlled active tab id. */
  value?: string;
  /** Initial tab when uncontrolled; falls back to the first tab. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Stage floor in px — the panel viewport never collapses below it. */
  minHeight?: number;
  className?: string;
  /** Accessible name for the tab strip. */
  "aria-label"?: string;
};

/**
 * Tabs whose panels swap on a revolving stage. The strip stays flat
 * instrument chrome — mono index numerals under a floating underline that
 * glides between tabs on `snap` — while the panels live in a perspective
 * viewport (`perspectives.base` on the stage wrapper; panels are flat, so no
 * preserve-3d). Selecting a tab turns the stage: the outgoing panel revolves
 * out through one wing (rotateY/translateX toward it, fading on the `exitFor`
 * tween — exits never spring) while the incoming panel revolves in from the
 * opposite wing and settles on `glide`. Direction follows the tab-order
 * delta — a later tab sweeps the stage leftward, an earlier one rightward —
 * and rides AnimatePresence `custom`, so even a panel already leaving re-aims
 * when the direction flips mid-flight. Under the panel, a hairline floor
 * ellipse squashes to 0.94× and back per turn — a keyframed tween, never a
 * spring, so the house springs stay two-keyframe.
 *
 * AnimatePresence runs `mode="popLayout"`: the outgoing panel pops out of
 * layout to finish its revolve while the incoming one already holds the
 * stage, so both wings are busy at once and tab spam stays safe — panels key
 * on their tab id, an interrupted enter reverses into an exit, and
 * re-selecting a still-exiting panel revives it rather than duplicating it.
 *
 * A11y matches the house tab pattern: `tablist`/`tab`/`tabpanel` wiring with
 * roving tabindex (only the active tab is tabbable), ArrowLeft/ArrowRight
 * moving focus with wraparound and auto-activating on focus, Home/End for
 * the ends, and a focusable panel (tabIndex 0) so keyboard users can scroll
 * its content. On cramped viewports the strip scrolls horizontally with its
 * scrollbar hidden.
 *
 * Reduced motion: panels swap with an instant `durations.fast` crossfade,
 * the underline teleports, and the floor holds still.
 */
export function StageTabs({
  tabs,
  value: controlledValue,
  defaultValue,
  onValueChange,
  minHeight = 180,
  className,
  "aria-label": ariaLabel = "Stage tabs",
}: StageTabsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolledValue, setUncontrolledValue] = React.useState<
    string | undefined
  >(defaultValue);
  const isControlled = controlledValue !== undefined;
  const activeId =
    (isControlled ? controlledValue : uncontrolledValue) ?? tabs[0]?.id;
  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  const activeTab = activeIndex === -1 ? undefined : tabs[activeIndex];

  // Revolve direction and the floor-squash trigger derive from the previous
  // tab, tracked as state adjusted during render (the React previous-render
  // idiom — no effects, no refs read in render), so controlled and
  // uncontrolled changes share one path. Snapshot math keeps the adjustment
  // idempotent under StrictMode double-renders.
  const [lastId, setLastId] = React.useState(activeId);
  const [direction, setDirection] = React.useState(1);
  const [turnCount, setTurnCount] = React.useState(0);
  if (activeId !== lastId) {
    setLastId(activeId);
    const from = tabs.findIndex((tab) => tab.id === lastId);
    if (from !== -1 && activeIndex !== -1) {
      setDirection(activeIndex > from ? 1 : -1);
      setTurnCount(turnCount + 1);
    }
  }

  const setValue = React.useCallback(
    (next: string) => {
      if (next === activeId) return;
      if (!isControlled) setUncontrolledValue(next);
      onValueChange?.(next);
    },
    [activeId, isControlled, onValueChange],
  );

  /** Arrow keys move focus (wrapping); focus auto-activates via onFocus. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const list = event.currentTarget.closest('[role="tablist"]');
    if (!list) return;
    const items = Array.from(
      list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
    );
    const index = items.indexOf(event.currentTarget);
    if (index === -1 || items.length === 0) return;
    let target: HTMLButtonElement | undefined;
    if (event.key === "ArrowRight") target = items[(index + 1) % items.length];
    else if (event.key === "ArrowLeft")
      target = items[(index - 1 + items.length) % items.length];
    else if (event.key === "Home") target = items[0];
    else if (event.key === "End") target = items[items.length - 1];
    else return;
    event.preventDefault();
    target?.focus();
  };

  // Enter poses resolve against the child's `custom`; exits resolve against
  // the AnimatePresence-level `custom`, so an already-exiting panel re-aims
  // when a spammed selection flips the direction.
  const panelVariants: Variants = {
    enter: (dir: number) =>
      motionSafe
        ? { opacity: 0, x: `${REVOLVE_PCT * dir}%`, rotateY: REVOLVE_DEG * dir }
        : { opacity: 0 },
    center: {
      opacity: 1,
      x: "0%",
      rotateY: 0,
      transition: motionSafe ? springs.glide : { duration: durations.fast },
    },
    exit: (dir: number) =>
      motionSafe
        ? {
            opacity: 0,
            x: `${-REVOLVE_PCT * dir}%`,
            rotateY: -REVOLVE_DEG * dir,
            transition: exitFor(durations.base),
          }
        : { opacity: 0, transition: { duration: durations.fast } },
  };

  const panelMinHeight = Math.max(0, minHeight - FLOOR_GAP - STAGE_INSET);

  return (
    <div className={cn("w-full", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        className="flex items-center gap-1 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab, i) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${safeId(tab.id)}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${safeId(tab.id)}`}
              tabIndex={selected || (activeIndex === -1 && i === 0) ? 0 : -1}
              onClick={() => setValue(tab.id)}
              onFocus={() => setValue(tab.id)}
              onKeyDown={handleKeyDown}
              className={cn(
                "relative flex shrink-0 items-baseline gap-1.5 rounded-2 px-3 pt-1.5 pb-3 whitespace-nowrap transition-colors",
                selected ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  selected ? "text-primary" : "text-ink-3",
                )}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-label">{tab.label}</span>
              {selected && (
                <motion.span
                  aria-hidden
                  layoutId={`${baseId}-underline`}
                  className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-primary"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* The stage: a perspective viewport whose clipped overflow is the
          proscenium — panels revolving through the wings cut at its edge. */}
      <div
        className="relative overflow-hidden"
        style={{
          perspective: perspectives.base,
          minHeight,
          padding: `${STAGE_INSET}px ${STAGE_INSET}px ${FLOOR_GAP}px`,
        }}
      >
        {/* Stage floor — remounts each turn so the squash keyframes replay;
            at rest (and on first mount) it just holds scaleX 1. */}
        <motion.div
          key={`floor-${turnCount}`}
          aria-hidden
          className="pointer-events-none absolute inset-x-10 bottom-1 h-1.5"
          style={{
            background:
              "radial-gradient(50% 100% at 50% 50%, var(--hairline-strong), transparent 72%)",
          }}
          initial={{ scaleX: 1 }}
          animate={
            motionSafe && turnCount > 0
              ? { scaleX: [1, FLOOR_SQUASH, 1] }
              : { scaleX: 1 }
          }
          transition={{ duration: durations.slow, ease: easings.move }}
        />

        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          {activeTab && (
            <motion.div
              key={activeTab.id}
              role="tabpanel"
              id={`${baseId}-panel-${safeId(activeTab.id)}`}
              aria-labelledby={`${baseId}-tab-${safeId(activeTab.id)}`}
              tabIndex={0}
              custom={direction}
              variants={panelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              style={{ minHeight: panelMinHeight }}
              className="relative rounded-3 border border-hairline bg-surface-1 p-5"
            >
              {activeTab.content}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
