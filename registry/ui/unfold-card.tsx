"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type UnfoldItem = {
  id: string;
  /** Always visible; the card's own label. */
  summary: React.ReactNode;
  /** Revealed beneath the summary when the card is open. */
  detail: React.ReactNode;
};

export type UnfoldCardProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The cards, in reading order. */
  items: UnfoldItem[];
  /** Controlled open id; null for all folded. */
  open?: string | null;
  /** Initial open id for uncontrolled usage. */
  defaultOpen?: string | null;
  /** Fires with the id that opened, or null when everything folds. */
  onOpenChange?: (id: string | null) => void;
  /** Visible list label. Omit it and pass `aria-label` to name the list invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** How far the folded cards fall back while one is open. */
const RECEDE = 0.55;

/**
 * A list of cards that open where they stand. Clicking one unfolds its detail
 * directly beneath its summary — the container animates to a height a
 * ResizeObserver actually measured, on `glide`, the spring for a layout finding
 * its new size — so nothing is reserved while the card is folded and nothing
 * below it jumps when it opens. The cards that stay folded ease back in opacity
 * on a tween, which is a lighting change rather than a movement, so the open
 * card is the only thing that has moved.
 *
 * Only one card is open: opening another folds the first in the same beat, so
 * the two heights cross rather than queue. The chevron turns on `snap` — one
 * crisp overshoot for a state that has flipped.
 *
 * Each summary is a real button carrying `aria-expanded` and `aria-controls`;
 * Up and Down walk the cards, Home and End jump to the ends, and Escape folds
 * the open card and returns the focus to its summary. Under reduced motion the
 * detail simply swaps in at its natural height, because the detail is the
 * information.
 */
export function UnfoldCard({
  ref,
  items,
  open,
  defaultOpen,
  onOpenChange,
  label,
  className,
  "aria-label": ariaLabel,
}: UnfoldCardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultOpen ?? null,
  );
  const isControlled = open !== undefined;
  const openId = isControlled ? open : uncontrolled;

  /**
   * The measurement is stamped with the id it belongs to, so a card that has
   * just opened animates from nothing rather than from the previous card's
   * height — and nothing has to be reset from inside an effect.
   */
  const [measured, setMeasured] = React.useState<{ id: string; h: number }>({
    id: "",
    h: 0,
  });

  const contentRefs = React.useRef(new Map<string, HTMLDivElement | null>());
  const triggerRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  React.useEffect(() => {
    if (!openId || typeof ResizeObserver === "undefined") return;
    const node = contentRefs.current.get(openId);
    if (!node) return;
    // Height comes from the observer's own callback — the effect body never
    // sets state, and the detail is never asked to fit a reserved box.
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      setMeasured({
        id: openId,
        h: entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height,
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [openId]);

  const setOpen = (next: string | null) => {
    if (!isControlled) setUncontrolled(next);
    // Reported from the handler, never from inside an updater.
    onOpenChange?.(next);
  };

  const focusTrigger = (index: number) => {
    const clamped = Math.min(items.length - 1, Math.max(0, index));
    triggerRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent,
    item: UnfoldItem,
    index: number,
  ) => {
    // Arrows walk the summaries and belong to the summaries; inside an open
    // detail they are the reader's own, for a scroll or a caret.
    const onSummary = event.target === triggerRefs.current[index];
    switch (event.key) {
      case "ArrowDown":
        if (!onSummary) break;
        event.preventDefault();
        focusTrigger(index + 1);
        break;
      case "ArrowUp":
        if (!onSummary) break;
        event.preventDefault();
        focusTrigger(index - 1);
        break;
      case "Home":
        if (!onSummary) break;
        event.preventDefault();
        focusTrigger(0);
        break;
      case "End":
        if (!onSummary) break;
        event.preventDefault();
        focusTrigger(items.length - 1);
        break;
      case "Escape":
        if (openId !== item.id) break;
        event.preventDefault();
        setOpen(null);
        // The summary is where the card came from, so that is where focus
        // belongs once the detail is gone.
        focusTrigger(index);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      {label ? (
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
      ) : null}

      <div
        role="group"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-col gap-2"
      >
        {items.map((item, index) => {
          const isOpen = openId === item.id;
          const panelId = `${uid}-panel-${item.id}`;
          const triggerId = `${uid}-trigger-${item.id}`;
          const height = isOpen && measured.id === item.id ? measured.h : 0;

          return (
            <motion.div
              key={item.id}
              // A lighting change, not a movement: the folded cards recede
              // while the open one keeps its full contrast.
              animate={{ opacity: openId && !isOpen ? RECEDE : 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className={cn(
                // No clipping here: the panel below does its own, and a card
                // that clipped would eat the summary's focus ring.
                "rounded-3 border transition-colors",
                isOpen
                  ? "border-cobalt-bright bg-surface-0"
                  : "border-hairline bg-surface-1 hover:border-hairline-strong",
              )}
              onKeyDown={(event) => handleKeyDown(event, item, index)}
            >
              <button
                ref={(node) => {
                  triggerRefs.current[index] = node;
                }}
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : item.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <span className="min-w-0 flex-1">{item.summary}</span>
                <motion.svg
                  aria-hidden
                  viewBox="0 0 16 16"
                  className={cn(
                    "size-4 shrink-0",
                    isOpen ? "text-cobalt-bright" : "text-ink-3",
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ rotate: isOpen ? 180 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  style={{ originX: 0.5, originY: 0.5 }}
                >
                  <path d="M4 6.5 8 10.5 12 6.5" />
                </motion.svg>
              </button>

              <motion.div
                id={panelId}
                role="region"
                aria-labelledby={triggerId}
                hidden={!motionSafe && !isOpen}
                aria-hidden={motionSafe ? !isOpen : undefined}
                inert={motionSafe ? !isOpen : undefined}
                initial={false}
                animate={{ height: motionSafe ? height : "auto" }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
                className="overflow-hidden"
              >
                <motion.div
                  ref={(node) => {
                    contentRefs.current.set(item.id, node);
                  }}
                  initial={false}
                  animate={{ opacity: isOpen ? 1 : 0 }}
                  transition={{
                    duration: isOpen ? durations.base : durations.fast,
                    ease: isOpen ? easings.enter : easings.exit,
                  }}
                  className="mx-3 border-t border-hairline pt-2.5 pb-3"
                >
                  {item.detail}
                </motion.div>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
