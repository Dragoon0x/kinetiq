"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThumbsValue = "up" | "down";

export type ThumbsReason = { id: string; label: string };

export type ThumbsMorphProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled verdict, or null while nothing is chosen. */
  value?: ThumbsValue | null;
  /** Initial verdict for uncontrolled usage. @default null */
  defaultValue?: ThumbsValue | null;
  /** Fires from the thumb press that changed the verdict. */
  onValueChange?: (value: ThumbsValue | null) => void;
  /** The chips offered after a down press. */
  reasons?: ThumbsReason[];
  /** Controlled chosen reason ids. */
  chosen?: string[];
  /** Initial chosen reasons for uncontrolled usage. @default [] */
  defaultChosen?: string[];
  /** Fires from the chip press that toggled a reason. */
  onChosenChange?: (ids: string[]) => void;
  /** Names what is being rated in the thumb labels. @default "answer" */
  subject?: string;
  className?: string;
};

const HOUSE_REASONS: ThumbsReason[] = [
  { id: "wrong", label: "Wrong" },
  { id: "unclear", label: "Unclear" },
  { id: "long", label: "Too long" },
  { id: "off-topic", label: "Off topic" },
  { id: "unsafe", label: "Unsafe" },
];

const NONE: string[] = [];

/** One thumb path, drawn as an outline and again as a solid to be revealed. */
const THUMB_PATH =
  "M7 10.5v9.1H4.6A1.6 1.6 0 0 1 3 18v-5.9a1.6 1.6 0 0 1 1.6-1.6H7Zm0 0 3.9-6.8a1.8 1.8 0 0 1 3.3 1.3l-.8 4.3h4.2a2.1 2.1 0 0 1 2.05 2.55l-1.3 5.8a2.4 2.4 0 0 1-2.35 1.95H7";

function ThumbGlyph({ down, solid }: { down: boolean; solid: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="block size-5"
      fill={solid ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g transform={down ? "translate(0 24) scale(1 -1)" : undefined}>
        <path d={THUMB_PATH} />
      </g>
    </svg>
  );
}

/**
 * Two outline thumbs; pressing one fills its glyph. The fill is a solid copy
 * of the same path inside a wrapper whose height grows from 0% to 100% on
 * `snap` — from the bottom for the up thumb, so the fill rises like a level,
 * and from the top for the down thumb, so it sinks. Pressing the same thumb
 * again drains it. A down press also unfolds a reason row beneath: the row's
 * box glides to its measured height (a ResizeObserver on the content, so the
 * fold is a real number) and the chips arrive on a `cascade` with a
 * four-pixel nudge on `snap`; up, or clearing, folds it back to zero. No
 * tally and no bounce: the fill is the confirmation, the row the follow-up.
 *
 * Both thumbs are toggle buttons with `aria-pressed`; the down thumb also
 * carries `aria-expanded` for the row, which is inert and out of the tab
 * order while folded. Under reduced motion the fill appears whole on a fade,
 * the row's height still opens on a tween because the question is
 * information, and the chips fade in without a nudge.
 */
export function ThumbsMorph({
  ref,
  value,
  defaultValue = null,
  onValueChange,
  reasons = HOUSE_REASONS,
  chosen,
  defaultChosen = NONE,
  onChosenChange,
  subject = "answer",
  className,
}: ThumbsMorphProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const groupId = `${baseId}-group`;
  const rowId = `${baseId}-reasons`;
  const whyId = `${baseId}-why`;

  const [uncontrolledValue, setUncontrolledValue] =
    React.useState<ThumbsValue | null>(defaultValue);
  const valueControlled = value !== undefined;
  const verdict = valueControlled ? value : uncontrolledValue;

  const [uncontrolledChosen, setUncontrolledChosen] =
    React.useState<string[]>(defaultChosen);
  const chosenControlled = chosen !== undefined;
  const picked = chosenControlled ? chosen : uncontrolledChosen;

  const [announcement, setAnnouncement] = React.useState("");

  const open = verdict === "down";

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      const next = box ? box.blockSize : node.getBoundingClientRect().height;
      setHeight(Math.ceil(next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const press = (side: ThumbsValue) => {
    const next: ThumbsValue | null = verdict === side ? null : side;
    if (!valueControlled) setUncontrolledValue(next);
    onValueChange?.(next);
    setAnnouncement(
      next === "up"
        ? "Marked good"
        : next === "down"
          ? "Marked poor, pick a reason"
          : "Verdict cleared",
    );
  };

  const toggleReason = (reason: ThumbsReason) => {
    const has = picked.includes(reason.id);
    const next = has
      ? picked.filter((id) => id !== reason.id)
      : [...picked, reason.id];
    if (!chosenControlled) setUncontrolledChosen(next);
    onChosenChange?.(next);
    setAnnouncement(`${reason.label} ${has ? "removed" : "added"}`);
  };

  const rise = motionSafe ? springs.snap : { duration: 0 };
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const stagger = cascade(reasons.length);
  const chosenCount = reasons.filter((reason) =>
    picked.includes(reason.id),
  ).length;

  const renderThumb = (side: ThumbsValue) => {
    const active = verdict === side;
    const down = side === "down";
    return (
      <button
        type="button"
        aria-pressed={active}
        aria-label={`${down ? "Poor" : "Good"} ${subject}`}
        aria-expanded={down ? open : undefined}
        aria-controls={down ? rowId : undefined}
        onClick={() => press(side)}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active && !down && "border-success/40 bg-success/10 text-success",
          active && down && "border-danger/40 bg-danger/10 text-danger",
          !active &&
            "border-hairline text-ink-3 hover:border-hairline-strong hover:text-foreground",
        )}
      >
        <span className="relative block size-5">
          <ThumbGlyph down={down} solid={false} />
          {/* The wrapper grows from the thumb's own base — bottom for up,
              top for down — and the solid glyph is pinned to that same
              edge, so growing the wrapper reveals rather than moves it. */}
          <motion.span
            aria-hidden
            className={cn(
              "absolute inset-x-0 overflow-hidden",
              down ? "top-0" : "bottom-0",
            )}
            initial={false}
            animate={
              motionSafe
                ? { height: active ? "100%" : "0%", opacity: 1 }
                : { height: "100%", opacity: active ? 1 : 0 }
            }
            transition={motionSafe ? rise : fade}
          >
            <span
              className={cn(
                "absolute inset-x-0 block size-5",
                down ? "top-0" : "bottom-0",
              )}
            >
              <ThumbGlyph down={down} solid />
            </span>
          </motion.span>
        </span>
      </button>
    );
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={groupId}
      className={cn("flex w-full flex-col", className)}
    >
      <div className="flex h-9 items-center gap-2">
        <span id={groupId} className="mr-auto text-xs text-ink-3">
          Rate this {subject}
        </span>
        {renderThumb("up")}
        {renderThumb("down")}
      </div>

      <motion.div
        id={rowId}
        role="group"
        aria-labelledby={whyId}
        aria-hidden={!open || undefined}
        inert={!open || undefined}
        className="overflow-hidden"
        initial={false}
        animate={{ height: open ? (height ?? "auto") : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
      >
        <div ref={innerRef} className="flex flex-col gap-2 pt-3">
          <span
            id={whyId}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Why
            {chosenCount > 0 ? ` · ${chosenCount} chosen` : ""}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((reason, index) => {
              const on = picked.includes(reason.id);
              return (
                <motion.button
                  key={reason.id}
                  type="button"
                  aria-pressed={on}
                  tabIndex={open ? 0 : -1}
                  onClick={() => toggleReason(reason)}
                  initial={false}
                  animate={
                    open
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                  }
                  transition={
                    open
                      ? {
                          ...(motionSafe ? springs.snap : { duration: 0 }),
                          opacity: fade,
                          delay: motionSafe ? index * stagger : 0,
                        }
                      : { duration: durations.fast, ease: easings.exit }
                  }
                  className={cn(
                    "flex h-7 items-center rounded-full border px-2.5 text-xs font-medium transition-colors duration-150 outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    on
                      ? "border-danger/40 bg-danger/10 text-danger"
                      : "border-hairline-strong bg-surface-1 text-ink-2 hover:bg-accent hover:text-foreground",
                  )}
                >
                  {reason.label}
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
