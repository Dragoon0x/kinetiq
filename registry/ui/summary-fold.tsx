"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoldMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type SummaryFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The older block, oldest first. */
  messages: FoldMessage[];
  /** The summary the host produced for the block. */
  summary: string;
  /** Controlled folded state. */
  folded?: boolean;
  /** Initial folded state for uncontrolled usage. @default true */
  defaultFolded?: boolean;
  onFoldedChange?: (folded: boolean) => void;
  /** Name printed on assistant rows and on the summary card. @default "Assistant" */
  assistantName?: string;
  /** Names the region for assistive technology. */
  label: string;
  className?: string;
};

/**
 * Reports a node's border-box height from a ResizeObserver, never from a read
 * during render. The observer fires once on observe, so the first height
 * lands after mount without a layout read of its own.
 */
function useMeasuredHeight(): [
  React.RefObject<HTMLDivElement | null>,
  number | null,
] {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, height];
}

/**
 * A block of older messages that folds into a summary card. The block and the
 * summary share one grid cell; each is measured by its own ResizeObserver and
 * the frame animates its height on `glide` between the two measurements while
 * the leaving face fades on the exit ease and the arriving face fades in on a
 * fast tween — a surface shrinking onto its summary rather than a swap. Two
 * hairline sheets under the card, each two pixels further down, say that
 * messages sit beneath it.
 *
 * The fold control is a disclosure button that names what it will do, and the
 * hidden face is `aria-hidden` and inert so only what is shown is read. The
 * status line announces the fold once the height has settled. Under reduced
 * motion the faces cross-fade and the height moves on a fast tween; the sheet
 * edge and the count still show.
 */
export function SummaryFold({
  ref,
  messages,
  summary,
  folded: foldedProp,
  defaultFolded = true,
  onFoldedChange,
  assistantName = "Assistant",
  label,
  className,
}: SummaryFoldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const facesId = `${baseId}-faces`;

  const [ownFolded, setOwnFolded] = React.useState(defaultFolded);
  const folded = foldedProp ?? ownFolded;
  const count = messages.length;

  // The announcement waits in `pending` until the height animation completes,
  // so it is spoken when the fold has visibly happened rather than when it was
  // asked for; a measurement at mount completes nothing pending.
  const [pending, setPending] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState("");

  const toggle = () => {
    const next = !folded;
    if (foldedProp === undefined) setOwnFolded(next);
    setPending(
      next
        ? `Folded ${count} messages into a summary`
        : `Unfolded ${count} messages`,
    );
    onFoldedChange?.(next);
  };

  const settled = () => {
    if (pending === null) return;
    setMessage(pending);
    setPending(null);
  };

  const [blockRef, blockHeight] = useMeasuredHeight();
  const [summaryRef, summaryHeight] = useMeasuredHeight();
  const target = folded ? summaryHeight : blockHeight;

  const settle = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const arrive = { duration: durations.fast, ease: easings.enter } as const;
  const leave = exitFor();

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={labelId}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between gap-3 px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <button
          type="button"
          aria-expanded={!folded}
          aria-controls={facesId}
          onClick={toggle}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 pr-2.5 pl-2 text-xs font-medium transition-colors outline-none hover:bg-accent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <motion.svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-3.5 shrink-0 text-ink-3"
            initial={false}
            animate={{ rotate: folded ? 0 : 180 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <path d="m4 6 4 4 4-4" />
          </motion.svg>
          {folded ? `Unfold ${count} messages` : `Fold ${count} older messages`}
        </button>
      </div>

      <motion.div
        id={facesId}
        initial={false}
        animate={{ height: target ?? "auto" }}
        transition={settle}
        onAnimationComplete={settled}
        className="overflow-hidden"
      >
        {/* Both faces live in one cell; the frame above decides which one's
            height shows, so neither reserves room for the other. */}
        <div className="grid px-3">
          <motion.div
            ref={blockRef}
            aria-hidden={folded}
            inert={folded}
            initial={false}
            animate={{ opacity: folded ? 0 : 1 }}
            transition={folded ? leave : arrive}
            className="col-start-1 row-start-1 self-start pb-3"
          >
            <ol className="flex flex-col gap-1.5">
              {messages.map((entry) => {
                const own = entry.role === "assistant";
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-2 border px-2.5 py-2",
                      own
                        ? "border-hairline-strong bg-surface-2"
                        : "border-hairline bg-surface-0",
                    )}
                  >
                    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {own ? assistantName : "You"}
                    </span>
                    <span className="text-sm leading-5 text-foreground">
                      {entry.text}
                    </span>
                  </li>
                );
              })}
            </ol>
          </motion.div>

          <motion.div
            ref={summaryRef}
            aria-hidden={!folded}
            inert={!folded}
            initial={false}
            animate={{ opacity: folded ? 1 : 0 }}
            transition={folded ? arrive : leave}
            className="col-start-1 row-start-1 self-start pb-3"
          >
            <div className="relative">
              <span
                aria-hidden
                className="absolute inset-x-2 -bottom-1 h-full rounded-2 border border-hairline bg-surface-2"
              />
              <span
                aria-hidden
                className="absolute inset-x-1 -bottom-0.5 h-full rounded-2 border border-hairline bg-surface-2"
              />
              <div className="relative flex flex-col gap-1.5 rounded-2 border border-hairline-strong bg-surface-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    Summarised by {assistantName}
                  </p>
                  <span className="flex h-5 shrink-0 items-center rounded-full bg-cobalt-wash px-2 font-mono text-[10px] text-cobalt-bright tabular-nums">
                    {count} {count === 1 ? "message" : "messages"}
                  </span>
                </div>
                <p className="text-sm leading-5 text-foreground">{summary}</p>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {message}
      </span>
    </div>
  );
}
