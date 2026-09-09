"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StreamBranchItem = {
  id: string;
  /** An invented model name; labels the pane. */
  model: string;
  /** The full answer. Words are split on whitespace. */
  text: string;
  /** How many words have arrived. Clamped to the word count. */
  landed: number;
};

export type StreamBranchProps = {
  ref?: React.Ref<HTMLElement>;
  /** Exactly two branches racing. */
  branches: [StreamBranchItem, StreamBranchItem];
  /** Whether the streams are live; sets `aria-busy` on unfinished panes. */
  playing?: boolean;
  /** Controlled kept branch id, or null while comparing. */
  picked?: string | null;
  /** Initial kept branch id for uncontrolled usage. */
  defaultPicked?: string | null;
  /** Fires from the Keep press with the id, or from Compare again with null. */
  onPickedChange?: (id: string | null) => void;
  /** Names the pair for assistive technology. */
  label: string;
  className?: string;
};

const wordsOf = (text: string) => text.split(/\s+/).filter(Boolean);

type PaneProps = {
  branch: StreamBranchItem;
  motionSafe: boolean;
  playing: boolean;
  first: boolean;
  kept: boolean;
  folded: boolean;
  onKeep: () => void;
};

/**
 * One pane owns its own measurement so a fold is a real height, never a guess:
 * a ResizeObserver on the content drives the box on `glide`, and folding
 * animates that same box to zero.
 */
function Pane({
  branch,
  motionSafe,
  playing,
  first,
  kept,
  folded,
  onKeep,
}: PaneProps) {
  const modelId = React.useId();
  const words = React.useMemo(() => wordsOf(branch.text), [branch.text]);
  const total = words.length;
  const shown = Math.max(0, Math.min(total, Math.floor(branch.landed)));
  const done = shown >= total;
  const fraction = total > 0 ? Number((shown / total).toFixed(3)) : 0;

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

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const move = motionSafe
    ? springs.glide
    : { duration: durations.base, ease: easings.move };

  return (
    <motion.article
      aria-labelledby={modelId}
      aria-busy={(playing && !done) || undefined}
      aria-hidden={folded || undefined}
      inert={folded || undefined}
      // Position only: the fold animates height on its own, and a size layout
      // animation on the same element would fight it.
      layout={motionSafe ? "position" : false}
      initial={false}
      animate={{
        y: kept && motionSafe ? -2 : 0,
        opacity: folded ? 0 : 1,
      }}
      transition={{
        y: springs.snap,
        opacity: folded ? exitFor(durations.base) : fade,
        layout: move,
      }}
      className={cn(
        "relative min-w-0 overflow-hidden rounded-3 border bg-surface-1 transition-shadow",
        // Visual order only: reordering the DOM would blur a Keep button
        // pressed from the keyboard.
        kept
          ? "order-first border-hairline-strong shadow-raised"
          : "border-hairline shadow-none",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-hairline-strong"
      >
        {/* The rail is the race: it still fills under reduced motion. */}
        <motion.span
          className={cn(
            "absolute inset-0 origin-left",
            done ? "bg-success" : "bg-cobalt-bright",
          )}
          initial={false}
          animate={{ scaleX: fraction }}
          transition={
            motionSafe
              ? springs.glide
              : { duration: durations.fast, ease: easings.move }
          }
        />
      </span>

      <motion.div
        className="overflow-hidden"
        initial={false}
        animate={{ height: folded ? 0 : (height ?? "auto") }}
        transition={move}
      >
        <div ref={innerRef} className="flex flex-col gap-2 px-3 pt-3 pb-2.5">
          <div className="flex h-6 items-center justify-between gap-2">
            <span
              id={modelId}
              className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase"
              title={branch.model}
            >
              {branch.model}
            </span>
            <AnimatePresence initial={false}>
              {first ? (
                <motion.span
                  key="first"
                  className="inline-flex h-5 shrink-0 items-center rounded-full bg-success/15 px-1.5 font-mono text-[10px] tracking-[0.08em] text-success uppercase"
                  initial={
                    motionSafe ? { scale: 1.3, opacity: 0 } : { opacity: 0 }
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? { ...springs.recoil, opacity: fade } : fade
                  }
                >
                  First
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          <p className="text-xs leading-relaxed text-foreground">
            {words.slice(0, shown).map((word, index) => (
              <React.Fragment key={index}>
                {index > 0 ? " " : null}
                <motion.span
                  className="inline-block"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={fade}
                >
                  {word}
                </motion.span>
              </React.Fragment>
            ))}
          </p>

          <div className="flex h-7 items-center justify-between gap-2">
            <span
              aria-hidden
              className="font-mono text-[10px] text-ink-3 tabular-nums"
            >
              {shown} / {total}
            </span>
            <button
              type="button"
              aria-pressed={kept}
              aria-label={`Keep ${branch.model}`}
              tabIndex={folded ? -1 : 0}
              onClick={onKeep}
              className={cn(
                "flex h-7 items-center rounded-2 border px-2.5 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                kept
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-hairline-strong hover:bg-accent",
              )}
            >
              {kept ? "Kept" : "Keep"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.article>
  );
}

/**
 * Two answers to one prompt, racing. Each pane streams its own words behind a
 * rail that fills to its progress on `glide`; the pane whose rail lands first
 * takes a First stamp on `recoil`, the two bounces of something arriving, and
 * the component remembers that in derived state so a later tie cannot steal
 * it. Keep lifts the chosen pane two pixels on `snap` and folds the other
 * away: its measured height glides to zero while its opacity leaves on the
 * exit ease, and the grid closes from two columns to one. Compare again
 * unfolds it. Assistive technology hears the first finish, the pick, and the
 * unfold — never a word. Under reduced motion the rails still fill on a
 * tween, nothing lifts, and the fold is a fade with a tweened height.
 */
export function StreamBranch({
  ref,
  branches,
  playing = false,
  picked,
  defaultPicked = null,
  onPickedChange,
  label,
  className,
}: StreamBranchProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultPicked,
  );
  const isControlled = picked !== undefined;
  const current = isControlled ? picked : uncontrolled;

  const doneIds = branches
    .filter((branch) => branch.landed >= wordsOf(branch.text).length)
    .map((branch) => branch.id);
  const anyStarted = branches.some((branch) => branch.landed > 0);

  // Who finished first is a fact about the past, so it lives in state and is
  // set the render it happens; a rerun (both back to zero) clears it.
  const [first, setFirst] = React.useState<string | null>(null);
  if (first === null && doneIds.length > 0) setFirst(doneIds[0] ?? null);
  if (first !== null && !anyStarted) setFirst(null);

  const [track, setTrack] = React.useState({
    picked: current,
    unfolded: false,
  });
  if (track.picked !== current) {
    setTrack({
      picked: current,
      unfolded: current === null && track.picked !== null,
    });
  }
  if (track.unfolded && !anyStarted)
    setTrack({ picked: current, unfolded: false });

  const choose = (next: string | null) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onPickedChange?.(next);
  };

  const modelOf = (id: string | null) =>
    branches.find((branch) => branch.id === id)?.model ?? "";
  const announcement = current
    ? `Kept ${modelOf(current)}`
    : track.unfolded
      ? "Comparing again"
      : first
        ? `${modelOf(first)} finished first`
        : "";

  return (
    <section
      ref={ref}
      aria-labelledby={labelId}
      className={cn("@container flex w-full flex-col gap-3", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <div
        className={cn(
          "grid grid-cols-1 items-start gap-3",
          current === null && "@sm:grid-cols-2",
        )}
      >
        {branches.map((branch) => (
          <Pane
            key={branch.id}
            branch={branch}
            motionSafe={motionSafe}
            playing={playing}
            first={first === branch.id}
            kept={current === branch.id}
            folded={current !== null && current !== branch.id}
            onKeep={() => choose(branch.id)}
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {current !== null ? (
          <motion.div
            key="again"
            className="flex justify-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            <button
              type="button"
              onClick={() => choose(null)}
              className={cn(
                "flex h-7 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              Compare again
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </section>
  );
}
