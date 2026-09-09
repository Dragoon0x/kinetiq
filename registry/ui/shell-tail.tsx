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

export type ShellStream = "stdout" | "stderr";
export type ShellLine = string | { text: string; stream?: ShellStream };
export type ShellState = "idle" | "running" | "done";

export type ShellTailProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The command as typed, printed after the prompt. */
  command: string;
  /** Prompt glyph before the command. @default "$" */
  prompt?: string;
  /** A working-directory hint printed dim before the prompt. */
  cwd?: string;
  /** Output so far, append-only. A plain string is stdout. */
  lines: ShellLine[];
  /** Where the run is. @default "idle" */
  state?: ShellState;
  /** Read when `state` is done: 0 stamps success, anything else danger. @default 0 */
  exitCode?: number;
  /** Pixels the output box grows to before it scrolls inside itself. @default 192 */
  maxHeight?: number;
  /** Names the block for assistive technology. */
  label: string;
  className?: string;
};

const asLine = (line: ShellLine): { text: string; stream: ShellStream } =>
  typeof line === "string"
    ? { text: line, stream: "stdout" }
    : { text: line.text, stream: line.stream ?? "stdout" };

/** Closer than this to the bottom counts as reading the tail. */
const TAIL_GRACE = 4;

/**
 * A command block whose output tails in. The host owns the clock — it appends
 * `lines` and moves `state` — so the block never reads time. Each line lands
 * with a `durations.fast` fade and a 4px rise on `flick`: a line arriving is
 * an acknowledgement, not a journey. The box's height is measured from the
 * inner `<pre>` by a ResizeObserver and glides to the new size on `glide`,
 * until it reaches `maxHeight`; past that it scrolls inside itself and follows
 * the tail. Scrolling away from the end pauses the follow and raises a
 * "Jump to end" control, so reading an earlier line never fights new ones.
 *
 * While running, a ring with a gap turns on a linear loop in the header's
 * status well. Done stamps the exit code there: 0 lands on `recoil`, the two
 * bounces of a stamp on paper; anything else lands firmly on `flick`, because
 * a failure never celebrates. stderr lines tint warn and the stamp reads
 * "exit 2" in words, so colour never carries the result alone.
 *
 * Nothing is announced per line. The status region speaks on state change
 * only: running, then the exit code and line count. Under reduced motion
 * lines fade in place, the box tweens its height, the ring holds still as a
 * static arc, and the stamp appears whole.
 */
export function ShellTail({
  ref,
  command,
  prompt = "$",
  cwd,
  lines,
  state = "idle",
  exitCode = 0,
  maxHeight = 192,
  label,
  className,
}: ShellTailProps) {
  const motionSafe = useMotionSafe();
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLPreElement | null>(null);

  // Lines present at mount are history, not arrivals: they must not cascade in.
  const [baseline] = React.useState(lines.length);
  const [measured, setMeasured] = React.useState<number | null>(null);
  const [following, setFollowing] = React.useState(true);
  const [edges, setEdges] = React.useState({ start: false, end: false });

  const scrolls = measured !== null && measured > maxHeight;
  const boxHeight =
    measured === null ? undefined : Math.min(measured, maxHeight);

  const readScroller = React.useCallback((node: HTMLDivElement) => {
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    const overflow = node.scrollWidth - node.clientWidth;
    setEdges({
      start: node.scrollLeft > 1,
      end: node.scrollLeft < overflow - 1,
    });
    return remaining < TAIL_GRACE;
  }, []);

  React.useEffect(() => {
    const scroller = scrollerRef.current;
    const inner = innerRef.current;
    if (!scroller || !inner) return;
    const observer = new ResizeObserver(() => {
      setMeasured(inner.getBoundingClientRect().height);
      // Content that shrinks back under the fold re-arms the follow, so a
      // reset never strands the reader with a stale "Jump to end".
      if (readScroller(scroller)) setFollowing(true);
    });
    observer.observe(inner);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [readScroller]);

  // Following the tail is a DOM write, not state: the effect scrolls whenever
  // a line lands while the reader is at the end.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !following) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [following, lines.length, measured]);

  const errorLines = lines.filter(
    (line) => asLine(line).stream === "stderr",
  ).length;
  const ok = exitCode === 0;
  const announcement =
    state === "running"
      ? "Running"
      : state === "done"
        ? `Exited ${exitCode}, ${lines.length} ${lines.length === 1 ? "line" : "lines"}${
            errorLines > 0
              ? `, ${errorLines} error ${errorLines === 1 ? "line" : "lines"}`
              : ""
          }`
        : "";

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-hairline px-3">
        <code
          className="min-w-0 flex-1 truncate font-mono text-xs"
          title={command}
        >
          {cwd ? <span className="text-ink-3">{cwd} </span> : null}
          <span className="text-cobalt-bright">{prompt}</span>{" "}
          <span className="text-foreground">{command}</span>
        </code>

        {/* Ring and stamp share one grid cell so the swap never shifts the
            header, and no width is reserved for a state. */}
        <span className="grid h-6 shrink-0 place-items-center">
          <AnimatePresence initial={false}>
            {state === "running" ? (
              <motion.svg
                key="ring"
                viewBox="0 0 16 16"
                aria-hidden
                className="col-start-1 row-start-1 size-4 text-cobalt-bright"
                initial={{ opacity: 0 }}
                animate={
                  motionSafe ? { opacity: 1, rotate: 360 } : { opacity: 0.6 }
                }
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  opacity: fade,
                  rotate: { duration: 0.9, ease: "linear", repeat: Infinity },
                }}
              >
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="0.72 0.28"
                />
              </motion.svg>
            ) : null}
            {state === "done" ? (
              <motion.span
                key="stamp"
                className={cn(
                  "col-start-1 row-start-1 inline-flex h-5 items-center rounded-full border px-1.5 font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums",
                  ok
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-danger/40 bg-danger/10 text-danger",
                )}
                initial={
                  motionSafe ? { opacity: 0, scale: 1.3 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                // A pass lands like a stamp; a failure lands firmly and never bounces.
                transition={
                  motionSafe
                    ? {
                        ...(ok ? springs.recoil : springs.flick),
                        opacity: { duration: durations.blink },
                      }
                    : fade
                }
              >
                exit {exitCode}
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </div>

      <div className="relative">
        <motion.div
          ref={scrollerRef}
          role="region"
          aria-label="Output"
          tabIndex={0}
          onScroll={(event) => setFollowing(readScroller(event.currentTarget))}
          initial={false}
          animate={boxHeight === undefined ? undefined : { height: boxHeight }}
          transition={motionSafe ? springs.glide : { duration: durations.fast }}
          className={cn(
            "overflow-x-auto outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
            scrolls ? "overflow-y-auto" : "overflow-y-hidden",
          )}
        >
          <pre
            ref={innerRef}
            aria-live="off"
            className="px-3 py-2 font-mono text-xs leading-5"
          >
            {lines.length === 0 ? (
              <span className="block text-ink-3">
                {state === "running" ? "Waiting for output" : "No output yet"}
              </span>
            ) : (
              lines.map((line, index) => {
                const { text, stream } = asLine(line);
                return (
                  <motion.span
                    // Output is append-only, so the index is the line's identity.
                    key={index}
                    className={cn(
                      "block",
                      stream === "stderr" ? "text-warn" : "text-ink",
                    )}
                    initial={
                      index < baseline
                        ? false
                        : motionSafe
                          ? { opacity: 0, y: distances.nudge }
                          : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe ? { ...springs.flick, opacity: fade } : fade
                    }
                  >
                    {text}
                  </motion.span>
                );
              })
            )}
          </pre>
        </motion.div>

        {edges.start ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-surface-1 to-surface-1/0"
          />
        ) : null}
        {edges.end ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-surface-1 to-surface-1/0"
          />
        ) : null}

        <AnimatePresence initial={false}>
          {scrolls && !following ? (
            <motion.button
              key="jump"
              type="button"
              onClick={() => {
                setFollowing(true);
                const scroller = scrollerRef.current;
                if (scroller) scroller.scrollTop = scroller.scrollHeight;
              }}
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
              className={cn(
                "absolute right-3 bottom-2 flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong bg-popover px-2.5 text-xs font-medium text-popover-foreground shadow-raised transition-colors outline-none hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 shrink-0"
              >
                <path d="M8 3v9M4.5 8.5 8 12l3.5-3.5" />
              </svg>
              Jump to end
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
