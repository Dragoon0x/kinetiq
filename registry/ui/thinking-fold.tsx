"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ThinkingFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The model is still reasoning: the strip pulses and the clock runs. @default false */
  thinking?: boolean;
  /** Reasoning lines that have arrived so far, in order. Append-only. */
  lines?: string[];
  /** Seconds of thinking owned by the host. Omit to count from the moment `thinking` turns true. */
  elapsed?: number;
  /** Controlled unfolded state. */
  open?: boolean;
  /** Initial unfolded state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Copy while thinking. @default "Thinking" */
  label?: string;
  /** Copy before any thinking has happened. @default "Reasoning" */
  idleLabel?: string;
  /** Copy once the answer has started. */
  settledLabel?: (seconds: number) => string;
  className?: string;
};

const NO_LINES: string[] = [];
const defaultSettled = (seconds: number) =>
  `Thought for ${seconds.toFixed(1)}s`;

/**
 * A collapsed strip that stands in for the reasoning while the model thinks.
 * While `thinking`, a `cobalt-wash` band breathes across the strip and the
 * lamp breathes with it — an ease-in-out loop at the ambient tempo of
 * `drift` — and a mono readout counts tenths from an interval that runs only
 * while thinking, pauses in a hidden tab, and never reads a clock. When the
 * answer starts the strip settles: the wash fades on `durations.slow`, the
 * lamp becomes a tick drawn on `flick`, and the label cross-fades to the time
 * it took.
 *
 * The strip can be unfolded at any time, because reasoning is available rather
 * than performed. The panel opens to a measured height on `glide`: a
 * ResizeObserver on the inner list reports its border box, so a line arriving
 * while the panel is open grows it smoothly instead of jumping. Lines mount
 * with a fade from `distances.nudge` on the enter ease.
 *
 * The strip is a disclosure button; the panel is a region that is inert while
 * folded. A polite live region says "Thinking" once and the settled sentence
 * once — never a tick, never a line. Under reduced motion the wash and lamp
 * hold at mid opacity, the settle is a colour swap, the height changes on a
 * tween, and the clock keeps counting, because elapsed time is information.
 */
export function ThinkingFold({
  ref,
  thinking = false,
  lines = NO_LINES,
  elapsed,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  label = "Thinking",
  idleLabel = "Reasoning",
  settledLabel = defaultSettled,
  className,
}: ThinkingFoldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;
  const regionLabelId = `${baseId}-region`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  // The clock restarts when thinking begins and holds where it stopped when
  // thinking ends; the previous flag lives in state so the restart is decided
  // during render from the committed value, not in an effect.
  const owned = elapsed === undefined;
  const [clock, setClock] = React.useState({ thinking, ticks: 0 });
  if (clock.thinking !== thinking) {
    setClock({ thinking, ticks: thinking ? 0 : clock.ticks });
  }

  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!owned || !thinking || !visible) return;
    const timer = window.setInterval(
      () => setClock((prev) => ({ ...prev, ticks: prev.ticks + 1 })),
      100,
    );
    return () => window.clearInterval(timer);
  }, [owned, thinking, visible]);

  const seconds = owned ? clock.ticks / 10 : elapsed;
  const idle = !thinking && seconds === 0 && lines.length === 0;
  const settledText = settledLabel(seconds);

  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // The observer fires once on observe, so the first height lands without
    // reading layout during render; it fires again for every line that lands.
    const observer = new ResizeObserver(() => setMeasured(node.offsetHeight));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const breath = (duration: number) => ({
    duration,
    ease: "easeInOut" as const,
    repeat: Infinity,
    repeatType: "reverse" as const,
  });
  const fade = { duration: durations.base, ease: easings.enter } as const;

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(
          "relative flex h-9 w-full items-center gap-2.5 rounded-2 border border-hairline bg-surface-1 px-3 text-left transition-colors outline-none hover:border-hairline-strong",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash"
          initial={false}
          animate={{
            opacity: thinking ? (motionSafe ? [0.35, 0.9] : 0.6) : 0,
          }}
          transition={
            thinking && motionSafe
              ? breath(1.6)
              : { duration: durations.slow, ease: easings.exit }
          }
        />

        <span className="relative grid size-4 shrink-0 place-items-center">
          <motion.span
            aria-hidden
            className="col-start-1 row-start-1 size-1.5 rounded-full bg-cobalt-bright"
            initial={false}
            animate={{
              opacity: thinking
                ? motionSafe
                  ? [1, 0.3]
                  : 0.7
                : idle
                  ? 0.5
                  : 0,
              scale: thinking && motionSafe ? [1, 1.5] : 1,
            }}
            transition={
              thinking && motionSafe
                ? breath(0.8)
                : { duration: durations.fast, ease: easings.exit }
            }
          />
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            className="col-start-1 row-start-1 size-3.5 text-success"
          >
            <motion.path
              d="M3.5 8.5 6.5 11.5 12.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              initial={false}
              animate={{
                pathLength: !thinking && !idle ? 1 : 0,
                opacity: !thinking && !idle ? 1 : 0,
              }}
              transition={
                motionSafe
                  ? { ...springs.flick, opacity: { duration: durations.blink } }
                  : { duration: 0 }
              }
            />
          </svg>
        </span>

        {/* Both labels share one grid cell so the cross-fade never reflows
            the strip and no height is reserved for the longer one. */}
        <span className="relative grid min-w-0 flex-1">
          <motion.span
            aria-hidden={!thinking}
            className="col-start-1 row-start-1 truncate text-sm text-foreground"
            initial={false}
            animate={{ opacity: thinking ? 1 : 0 }}
            transition={fade}
          >
            {label}
          </motion.span>
          <motion.span
            aria-hidden={thinking}
            className="col-start-1 row-start-1 truncate text-sm text-foreground"
            initial={false}
            animate={{ opacity: thinking ? 0 : 1 }}
            transition={fade}
          >
            {idle ? idleLabel : settledText}
          </motion.span>
        </span>

        {!idle ? (
          <span
            aria-hidden
            className="relative shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
          >
            {seconds.toFixed(1)}s
          </span>
        ) : null}

        <motion.span
          aria-hidden
          className="relative flex size-4 shrink-0 items-center justify-center text-ink-3"
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

      <span id={regionLabelId} className="sr-only">
        {idleLabel}
      </span>
      <motion.div
        id={panelId}
        role="region"
        aria-labelledby={regionLabelId}
        aria-hidden={!open}
        inert={!open}
        initial={false}
        animate={{ height: open ? measured : 0 }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef} className="pt-2">
          {lines.length === 0 ? (
            <p className="px-3 py-1.5 text-xs text-ink-3">
              {thinking
                ? "Nothing written down yet."
                : "No reasoning recorded."}
            </p>
          ) : (
            <ol className="ml-2 flex flex-col gap-1.5 border-l border-hairline py-1 pl-3">
              {lines.map((line, index) => (
                <motion.li
                  key={index}
                  className="text-xs leading-relaxed text-ink-2"
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={fade}
                >
                  {line}
                </motion.li>
              ))}
            </ol>
          )}
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {thinking
          ? label
          : idle
            ? ""
            : `${settledText}, ${lines.length} ${lines.length === 1 ? "line" : "lines"}`}
      </span>
    </div>
  );
}
