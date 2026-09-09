"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type EditVersion = {
  text: string;
  /** When this version was posted, already formatted. */
  at: string;
};

export type EditTraceProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Oldest first; the last entry is what the message says now. */
  versions: EditVersion[];
  /** Sender name above the bubble. @default "You" */
  author?: string;
  /** Controlled trace state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Names the thread list. @default "Thread" */
  label?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;
const WIPE = { duration: durations.base, ease: easings.enter } as const;

/**
 * Edited, and what it said before. The bubble shows the latest version; when
 * a new one lands its text wipes in over the old on a clip-path tween — a wipe
 * is a reveal, not a movement — and an Edited mark pops in on `flick`.
 * Pressing the mark unfolds the previous versions beneath the bubble, their
 * height measured and glided on `glide`, each with a strike that draws left
 * to right on the same spring; the current text replays its wipe over the
 * last version so the eye reads old, then new. Escape folds the trace and
 * returns focus to the mark.
 *
 * The mark is a button with `aria-expanded`; previous versions are `del`
 * elements in a real list; a status region speaks each edit once. Under
 * reduced motion the wipe becomes a cross-fade, strikes appear without
 * drawing, and the panel's height swaps on a tween.
 */
export function EditTrace({
  ref,
  versions,
  author = "You",
  open,
  defaultOpen = false,
  onOpenChange,
  label = "Thread",
  className,
}: EditTraceProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-trace`;
  const markRef = React.useRef<HTMLButtonElement | null>(null);

  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const isOpen = (open ?? uncontrolled) && versions.length > 1;
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const current = versions[versions.length - 1];
  const previous = versions.slice(0, -1).reverse();
  const edited = previous.length > 0;

  // A landing is noticed during render so the wipe and the announcement
  // belong to the render that brought the version. `under` is the text the
  // wipe reveals the new one over; it clears once the wipe has covered it.
  const [wipe, setWipe] = React.useState<{
    count: number;
    key: number;
    under: string | null;
    message: string;
  }>({ count: versions.length, key: 0, under: null, message: "" });
  if (wipe.count !== versions.length) {
    const landed = versions.length > wipe.count && current !== undefined;
    setWipe({
      count: versions.length,
      key: landed ? wipe.key + 1 : wipe.key,
      under: landed ? (versions[versions.length - 2]?.text ?? null) : null,
      message: landed ? `Edited: ${current.text}` : wipe.message,
    });
  }

  const toggle = () => {
    const next = !isOpen;
    setOpen(next);
    // Opening replays the wipe over the last version, so the trace and the
    // bubble tell the same story at the same moment.
    const last = previous[0];
    if (next && last) {
      setWipe((prev) => ({ ...prev, key: prev.key + 1, under: last.text }));
    }
  };

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (!current) return null;

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <ol role="list" aria-label={label} className="flex flex-col">
        <li
          className="flex flex-col items-start gap-1"
          onKeyDown={(event) => {
            if (event.key === "Escape" && isOpen) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              markRef.current?.focus();
            }
          }}
        >
          <span className="px-1 text-[11px] font-medium text-ink-2">
            {author}
          </span>
          <div className="grid max-w-[88%] rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2 text-sm leading-snug wrap-break-word text-foreground">
            {wipe.under !== null ? (
              <span
                aria-hidden
                className="col-start-1 row-start-1 text-ink-3 line-through decoration-ink-3"
              >
                {wipe.under}
              </span>
            ) : null}
            {/* The wiping layer carries the bubble's fill so it covers the
                old text as it advances; a bare glyph layer would let the old
                line show through between letters. */}
            <motion.span
              key={wipe.key}
              initial={
                wipe.key === 0
                  ? false
                  : motionSafe
                    ? { clipPath: "inset(0 100% 0 0)" }
                    : { opacity: 0 }
              }
              animate={
                motionSafe ? { clipPath: "inset(0 0% 0 0)" } : { opacity: 1 }
              }
              transition={motionSafe ? WIPE : FADE}
              onAnimationComplete={() =>
                setWipe((prev) =>
                  prev.under === null ? prev : { ...prev, under: null },
                )
              }
              className="col-start-1 row-start-1 bg-surface-2"
            >
              {current.text}
            </motion.span>
          </div>

          <span className="flex h-6 items-center gap-1.5 px-1 text-[11px] text-ink-3 tabular-nums">
            <span>{current.at}</span>
            <AnimatePresence initial={false}>
              {edited ? (
                <motion.button
                  key="mark"
                  ref={markRef}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? panelId : undefined}
                  aria-label={`Edited ${current.at}, ${isOpen ? "hide" : "show"} previous versions`}
                  onClick={toggle}
                  initial={
                    motionSafe ? { opacity: 0, scale: 0.6 } : { opacity: 0 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={motionSafe ? springs.flick : FADE}
                  className={cn(
                    "flex h-5 items-center gap-1 rounded-full border border-hairline-strong px-1.5 text-[10px] font-medium tracking-[0.04em] text-ink-2 uppercase transition-colors outline-none hover:bg-accent",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isOpen && "bg-accent text-foreground",
                  )}
                >
                  Edited
                  <svg
                    viewBox="0 0 12 12"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-2.5 shrink-0"
                  >
                    <motion.path
                      d="m3 4.5 3 3 3-3"
                      style={{ originX: 0.5, originY: 0.5 }}
                      initial={false}
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  </svg>
                </motion.button>
              ) : null}
            </AnimatePresence>
          </span>

          <motion.div
            initial={false}
            animate={{ height: height ?? (isOpen ? "auto" : 0) }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.base, ease: easings.move }
            }
            className="w-full max-w-[88%] overflow-hidden"
          >
            <div ref={innerRef}>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.ul
                    key="trace"
                    id={panelId}
                    role="list"
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    className="flex flex-col gap-1.5 pt-1 pb-0.5 pl-1"
                  >
                    {previous.map((version, index) => {
                      const replacedAt =
                        versions[versions.length - 1 - index]?.at ?? current.at;
                      return (
                        <motion.li
                          key={`${versions.length - 1 - index}`}
                          initial={
                            motionSafe
                              ? { opacity: 0, y: distances.nudge }
                              : { opacity: 0 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.snap,
                                  delay: index * cascade(previous.length),
                                }
                              : FADE
                          }
                          className="flex flex-col gap-0.5 text-xs leading-snug"
                        >
                          <span className="relative inline-block max-w-full">
                            <del className="text-ink-3 no-underline">
                              {version.text}
                            </del>
                            <motion.span
                              aria-hidden
                              initial={
                                motionSafe ? { scaleX: 0 } : { opacity: 0 }
                              }
                              animate={
                                motionSafe ? { scaleX: 1 } : { opacity: 1 }
                              }
                              transition={
                                motionSafe
                                  ? {
                                      ...springs.glide,
                                      delay: index * cascade(previous.length),
                                    }
                                  : FADE
                              }
                              className="pointer-events-none absolute inset-x-0 top-1/2 h-px origin-left bg-ink-3"
                            />
                          </span>
                          <span className="text-[11px] text-ink-3 tabular-nums">
                            {version.at} · replaced {replacedAt}
                          </span>
                        </motion.li>
                      );
                    })}
                  </motion.ul>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </li>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {wipe.message}
      </span>
    </div>
  );
}
