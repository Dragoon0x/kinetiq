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

export type CodeScaffoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The complete code, one entry per line; the scaffold takes its shape from these. */
  lines: string[];
  /** Lines that have arrived, top to bottom. */
  arrived?: number;
  /** Generation is open: the scaffold shows and `aria-busy` is set. */
  generating?: boolean;
  /** Shown in the header rail. */
  filename?: string;
  /** Names the block for assistive technology. */
  label: string;
  /** Fires from the copy control with the full text. */
  onCopy?: (text: string) => void;
  /** Copy control text. @default "Copy" */
  copyLabel?: string;
  className?: string;
};

/** How long the Copied stamp stays before the control reads Copy again. */
const COPIED_HOLD_MS = 1600;

const OPEN = "inset(0 0% 0 0)";
const CLIPPED_RIGHT = "inset(0 100% 0 0)";

/** The dozen words of the house plan language that earn a colour. */
const KEYWORDS = new Set([
  "plan",
  "step",
  "when",
  "then",
  "else",
  "emit",
  "each",
  "let",
  "return",
  "from",
  "into",
  "retry",
  "done",
  "wait",
  "check",
  "run",
]);

/** One pass, no parser: comments, strings, numbers, then words. */
const PATTERN =
  /(--[^\n]*)|("(?:[^"\\]|\\.)*")|(\b\d[\w.]*\b)|([A-Za-z_][\w]*)/g;

type Piece = { text: string; tone?: string };

function tokenize(line: string): Piece[] {
  const pieces: Piece[] = [];
  let last = 0;
  for (const match of line.matchAll(PATTERN)) {
    const at = match.index ?? 0;
    if (at > last) pieces.push({ text: line.slice(last, at) });
    const [raw, comment, string, number, word] = match;
    if (comment) pieces.push({ text: raw, tone: "text-ink-3" });
    else if (string) pieces.push({ text: raw, tone: "text-success" });
    else if (number) pieces.push({ text: raw, tone: "text-warn" });
    else if (word)
      pieces.push({
        text: raw,
        tone: KEYWORDS.has(word) ? "text-cobalt-bright" : undefined,
      });
    last = at + raw.length;
  }
  if (last < line.length) pieces.push({ text: line.slice(last) });
  return pieces;
}

/**
 * A code block that shows its shape before its text. The moment generation
 * opens every line is present as a grey bar at the line's indentation and
 * exactly as long as its text in `ch`, so the scaffold has the finished
 * block's silhouette from the first frame. Bars cascade in top to bottom — a
 * fade with a `distances.nudge` rise on `glide`, staggered by `cascade()` —
 * and the frame's height glides to the measured scaffold. As each line
 * arrives its text is revealed left to right by a `clipPath` inset on a
 * `durations.base` tween while the bar fades beneath it, so the grey shape
 * develops into its own line rather than being replaced.
 *
 * The copy control mounts in the rail only once the last line has landed —
 * on `snap`, one crisp overshoot — so nothing partial can be copied; pressing
 * it copies the whole text and stamps a tick drawn on `flick`. The block is a
 * region holding a real `<pre>`; bars are hidden from assistive technology
 * and unarrived lines contribute no text. Under reduced motion bars and text
 * swap in opacity with no rise or clip travel, and the height tweens.
 */
export function CodeScaffold({
  ref,
  lines,
  arrived = 0,
  generating = false,
  filename,
  label,
  onCopy,
  copyLabel = "Copy",
  className,
}: CodeScaffoldProps) {
  const motionSafe = useMotionSafe();
  const count = lines.length;
  const got = Math.max(0, Math.min(count, Math.floor(arrived)));
  const complete = count > 0 && got >= count;
  const open = generating || got > 0;

  const [copied, setCopied] = React.useState(false);
  // A rewrite takes the stamp with it: the control returns as plain Copy.
  if (copied && !complete) setCopied(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState<number | null>(null);
  const [overflowing, setOverflowing] = React.useState(false);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // The observer fires once on observe, so the first height lands without
    // reading layout during render; it fires again as lines change the box.
    const observer = new ResizeObserver(() => {
      setMeasured(node.getBoundingClientRect().height);
      const scroller = node.querySelector<HTMLElement>("[data-scroller]");
      setOverflowing(
        scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false,
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const copy = () => {
    const text = lines.join("\n");
    try {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    } catch {
      // A page without clipboard access still reports the copy to the host.
    }
    setCopied(true);
    onCopy?.(text);
  };

  const gap = cascade(count);
  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const rowRise = (index: number) =>
    motionSafe
      ? { ...springs.glide, delay: index * gap }
      : { duration: durations.fast, delay: 0 };

  const announcement = copied
    ? "Copied"
    : complete
      ? `Code complete, ${count} lines`
      : open
        ? "Writing code"
        : "";

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      aria-busy={generating || undefined}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-9 items-center gap-3 border-b border-hairline px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {filename ? `${filename} · ` : ""}
          {count} {count === 1 ? "line" : "lines"}
        </span>
        <AnimatePresence initial={false}>
          {complete ? (
            <motion.button
              key="copy"
              type="button"
              onClick={copy}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.nudge }
                  : { opacity: 0, y: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: fade }
                  : { duration: durations.fast }
              }
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              <AnimatePresence initial={false}>
                {copied ? (
                  <motion.svg
                    key="tick"
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5 shrink-0 text-success"
                    exit={{ opacity: 0, transition: { duration: 0 } }}
                  >
                    <motion.path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      initial={
                        motionSafe
                          ? { pathLength: 0, opacity: 1 }
                          : { pathLength: 1, opacity: 0 }
                      }
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={motionSafe ? springs.flick : fade}
                    />
                  </motion.svg>
                ) : null}
              </AnimatePresence>
              {copied ? "Copied" : copyLabel}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <motion.div
        initial={false}
        animate={{ height: measured ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef}>
          {!open ? (
            <p className="px-3 py-2.5 text-xs text-ink-3">
              Nothing written yet
            </p>
          ) : (
            <div className="relative">
              <div data-scroller className="overflow-x-auto">
                <pre className="px-3 py-2.5 font-mono text-xs leading-5">
                  <code className="block">
                    {lines.map((line, index) => {
                      const landed = index < got;
                      const indent = line.length - line.trimStart().length;
                      const width = line.trim().length;
                      return (
                        <motion.span
                          key={index}
                          className="grid grid-cols-[1.5rem_1fr] gap-2"
                          initial={
                            motionSafe
                              ? { opacity: 0, y: distances.nudge }
                              : { opacity: 0, y: 0 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={rowRise(index)}
                        >
                          <span
                            aria-hidden
                            className="text-right text-ink-3 tabular-nums select-none"
                          >
                            {index + 1}
                          </span>
                          <span className="grid">
                            <span
                              aria-hidden
                              className="col-start-1 row-start-1 flex items-center"
                              style={{ paddingLeft: `${indent}ch` }}
                            >
                              {width > 0 ? (
                                <motion.span
                                  className="block h-[0.7em] max-w-full rounded-1 bg-hairline-strong"
                                  style={{ width: `${width}ch` }}
                                  initial={false}
                                  animate={{ opacity: landed ? 0 : 1 }}
                                  transition={{
                                    duration: durations.base,
                                    ease: easings.enter,
                                  }}
                                />
                              ) : null}
                            </span>
                            {/* The text stays mounted so the clip has something
                                to open over; it carries no characters to read
                                until its line has landed. */}
                            <motion.span
                              className="col-start-1 row-start-1 whitespace-pre"
                              initial={false}
                              animate={
                                motionSafe
                                  ? {
                                      clipPath: landed ? OPEN : CLIPPED_RIGHT,
                                      opacity: 1,
                                    }
                                  : { clipPath: OPEN, opacity: landed ? 1 : 0 }
                              }
                              transition={{
                                clipPath: {
                                  duration: durations.base,
                                  ease: easings.enter,
                                },
                                opacity: fade,
                              }}
                            >
                              {landed
                                ? tokenize(line).map((piece, at) => (
                                    <span key={at} className={piece.tone}>
                                      {piece.text}
                                    </span>
                                  ))
                                : " "}
                            </motion.span>
                          </span>
                        </motion.span>
                      );
                    })}
                  </code>
                </pre>
              </div>
              {overflowing ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-l from-surface-1 to-surface-1/0"
                />
              ) : null}
            </div>
          )}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
