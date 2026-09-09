"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ResultFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The tool's name, printed in mono. */
  name: string;
  /** The result so far, one line per `\n`. Append-only. */
  text?: string;
  /** Lines shown while folded. @default 3 */
  previewLines?: number;
  /** The gist; when present it arrives as a chip beside the name. */
  summary?: string;
  /** Controlled unfolded state. */
  open?: boolean;
  /** Initial unfolded state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/**
 * A tool result that shows what it can and folds the rest. The first
 * `previewLines` lines are always printed; everything after them lives in a
 * tail whose height is measured by a ResizeObserver and animated on `glide`
 * between zero and its full size, so unfolding is a surface extending rather
 * than a jump, and a line landing while the box is open grows it smoothly.
 * A fade sits over the last preview line while folded and lifts on a tween
 * when the fold opens. When the host passes a `summary` a gist chip arrives
 * beside the name from `distances.nudge` on `snap`, one crisp overshoot,
 * because the gist is the answer the reader was waiting for.
 *
 * The fold control names what it will do — "Show 15 more lines" or "Show
 * less" — and the tail is a region that is inert while folded, so a screen
 * reader reads exactly what is shown. Wide lines scroll inside the box. The
 * live region reads the summary once, never a line. Under reduced motion the
 * tail's height changes on a tween and the chip and lines fade in place.
 */
export function ResultFold({
  ref,
  name,
  text = "",
  previewLines = 3,
  summary,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
}: ResultFoldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const nameId = `${baseId}-name`;
  const tailId = `${baseId}-tail`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const tailRef = React.useRef<HTMLPreElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = tailRef.current;
    if (!node) return;
    // Fires once on observe and again for every line that lands in the tail,
    // so an open box grows with its result instead of clipping it.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const lines = text === "" ? [] : text.split("\n");
  const keep = Math.max(1, Math.floor(previewLines));
  const head = lines.slice(0, keep);
  const tail = lines.slice(keep);
  const hasTail = tail.length > 0;
  const lineWord = lines.length === 1 ? "line" : "lines";
  const unfolded = open && hasTail;

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const line = (value: string, index: number) => (
    <motion.span
      key={index}
      className="block"
      initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={fade}
    >
      {value === "" ? " " : value}
    </motion.span>
  );

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-2 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-hairline px-3">
        <span
          id={nameId}
          className="shrink-0 font-mono text-xs font-medium text-foreground"
        >
          {name}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {lines.length} {lineWord}
        </span>
        <AnimatePresence initial={false}>
          {summary ? (
            <motion.span
              key="gist"
              title={summary}
              className="ml-auto inline-flex h-6 min-w-0 items-center truncate rounded-full border border-cobalt-bright/50 bg-cobalt-wash px-2 text-[11px] font-medium text-cobalt-bright"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: fade }
                  : { duration: durations.fast }
              }
            >
              <span className="truncate">{summary}</span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {lines.length === 0 ? (
        <p className="px-3 py-2 text-[11px] text-ink-3">No result yet.</p>
      ) : (
        <div className="overflow-x-auto">
          {/* Sized to the widest line so the fade veils the whole row at any
              scroll position, never just the first viewport of it. */}
          <div className="relative w-max min-w-full">
            <pre className="px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground">
              {head.map(line)}
            </pre>
            <motion.div
              id={tailId}
              role="region"
              aria-labelledby={nameId}
              aria-hidden={!unfolded}
              inert={!unfolded}
              initial={false}
              animate={{ height: unfolded ? measured : 0 }}
              transition={
                motionSafe
                  ? springs.glide
                  : { duration: durations.fast, ease: easings.move }
              }
              className="overflow-hidden"
            >
              <pre
                ref={tailRef}
                className="px-3 pb-2 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground"
              >
                {tail.map(line)}
              </pre>
            </motion.div>
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-surface-1 to-surface-1/0"
              initial={false}
              animate={{ opacity: hasTail && !open ? 1 : 0 }}
              transition={{ duration: durations.base, ease: easings.enter }}
            />
          </div>
        </div>
      )}

      {hasTail ? (
        <div className="flex items-center border-t border-hairline px-2 py-1.5">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={tailId}
            onClick={toggle}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-2 px-2 text-xs font-medium text-foreground transition-colors outline-none hover:bg-accent",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            )}
          >
            <span>
              {open
                ? "Show less"
                : `Show ${tail.length} more ${tail.length === 1 ? "line" : "lines"}`}
            </span>
            <motion.span
              aria-hidden
              className="flex size-4 shrink-0 items-center justify-center text-ink-3"
              initial={false}
              animate={{ rotate: open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <svg
                viewBox="0 0 16 16"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m4 6 4 4 4-4" />
              </svg>
            </motion.span>
          </button>
        </div>
      ) : null}

      <span role="status" className="sr-only">
        {summary
          ? `${name} returned ${lines.length} ${lineWord}: ${summary}`
          : ""}
      </span>
    </div>
  );
}
