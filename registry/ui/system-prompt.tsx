"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SystemPromptProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled prompt text. */
  value?: string;
  /** Initial text for uncontrolled usage. */
  defaultValue?: string;
  /** Fires from typing, and from the sweep when Reset restores the baseline. */
  onValueChange?: (value: string) => void;
  /** What Reset restores and what "modified" is measured against. @default defaultValue */
  baseline?: string;
  /** Controlled fold. */
  open?: boolean;
  /** Initial fold for uncontrolled usage. @default true */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Header text. @default "System prompt" */
  label?: string;
  /** @default "Rules the model follows before every message." */
  placeholder?: string;
  className?: string;
};

/** The sweep's travel time; the text swaps at its midpoint. */
const SWEEP_MS = 420;
/** How long typing must be still before the edit is spoken. */
const SETTLE_MS = 600;

/** Keeps callbacks out of effect dependencies so a re-render never restarts a timer. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * The rules, folded away. A card with a disclosure header and a real
 * textarea whose body is measured by a ResizeObserver and glides open and
 * shut on `glide` under `overflow-hidden`: open costs exactly the prompt's
 * height, and folded costs one preview line that cross-fades in beneath the
 * header. The chevron turns on `snap`. When the text differs from the
 * baseline a Modified badge lands on `flick` beside a mono character count
 * and Reset arms. Reset wipes the prompt back with a sweep: a soft band two
 * fifths of the body wide travels left to right on a symmetric tween, the
 * text swaps to the baseline at the band's midpoint, and the badge lifts out
 * on the exit ease.
 *
 * The header button carries `aria-expanded` and controls the body; the
 * textarea is labelled by the header; Reset is a real button, inert when
 * clean. The status line speaks a modification once typing has been still
 * for a beat, and the reset when the sweep lands — never per keystroke.
 * Under reduced motion the body swaps height on a fast tween, the sweep is
 * an opacity wash with the text swapped at once, and the badge fades.
 */
export function SystemPrompt({
  ref,
  value,
  defaultValue = "",
  onValueChange,
  baseline,
  open,
  defaultOpen = true,
  onOpenChange,
  label = "System prompt",
  placeholder = "Rules the model follows before every message.",
  className,
}: SystemPromptProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const bodyId = `${baseId}-body`;

  const [uncontrolledText, setUncontrolledText] = React.useState(defaultValue);
  const text = value ?? uncontrolledText;
  const base = baseline ?? defaultValue;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isOpen = open ?? uncontrolledOpen;

  const modified = text !== base;
  const delta = text.length - base.length;
  const rows = Math.min(12, Math.max(3, text.split("\n").length));
  const preview = (text.split("\n").find((line) => line.trim()) ?? "").trim();

  const [sweeping, setSweeping] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");

  const commit = (next: string) => {
    if (value === undefined) setUncontrolledText(next);
    onValueChange?.(next);
  };
  const commitRef = useLatest(commit);
  const baseRef = useLatest(base);

  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  // The swap happens from the sweep's own timer, at the band's midpoint —
  // or at once when the band has nothing to sweep across (reduced motion, a
  // hidden tab). Both timers are cleared if the card unmounts mid-sweep.
  React.useEffect(() => {
    if (!sweeping) return;
    const travel = document.hidden
      ? 0
      : motionSafe
        ? SWEEP_MS
        : durations.slow * 1000;
    const swap = window.setTimeout(
      () => commitRef.current(baseRef.current),
      motionSafe ? travel / 2 : 0,
    );
    const land = window.setTimeout(() => {
      setSweeping(false);
      setAnnounce("System prompt reset");
    }, travel);
    return () => {
      window.clearTimeout(swap);
      window.clearTimeout(land);
    };
  }, [sweeping, motionSafe, commitRef, baseRef]);

  // Spoken on settle: the timer restarts on every keystroke and only the
  // last one lands.
  React.useEffect(() => {
    if (!touched || !modified) return;
    const timer = window.setTimeout(
      () => setAnnounce(`System prompt modified, ${text.length} characters`),
      SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [touched, modified, text.length]);

  // Only the live panel is in flow — the outgoing one is absolute while it
  // fades — so the wrapper glides between the editor's height and the
  // preview's, and neither state reserves room for the other.
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = bodyRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const canReset = modified && !sweeping;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-7 items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={() => setOpen(!isOpen)}
          className={cn(
            "flex h-7 min-w-0 items-center gap-1.5 rounded-2 pr-2 text-sm font-semibold text-foreground outline-none",
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
            className="size-4 shrink-0 text-ink-3"
            initial={false}
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={
              motionSafe
                ? springs.snap
                : { duration: durations.fast, ease: easings.move }
            }
          >
            <path d="m6 3.5 4.5 4.5L6 12.5" />
          </motion.svg>
          <span id={labelId} className="truncate">
            {label}
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-2">
          <AnimatePresence initial={false}>
            {modified ? (
              <motion.span
                key="modified"
                className="flex h-5 items-center rounded-full border border-warn/40 bg-warn/10 px-1.5 font-mono text-[10px] tracking-[0.08em] text-warn uppercase"
                initial={
                  motionSafe ? { opacity: 0, scale: 0.8 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { ...springs.flick, opacity: fade } : fade
                }
              >
                Modified
              </motion.span>
            ) : null}
          </AnimatePresence>
          <span
            aria-hidden
            className="font-mono text-[11px] text-ink-3 tabular-nums"
          >
            {text.length}
            {modified ? ` (${delta >= 0 ? "+" : "−"}${Math.abs(delta)})` : ""}
          </span>
          <button
            type="button"
            aria-disabled={!canReset || undefined}
            onClick={() => {
              if (canReset) setSweeping(true);
            }}
            className={cn(
              "flex h-7 items-center rounded-2 border border-hairline-strong bg-surface-2 px-2 text-xs font-medium text-foreground transition-colors outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              canReset ? "hover:bg-accent" : "cursor-default opacity-40",
            )}
          >
            Reset
          </button>
        </span>
      </div>

      <motion.div
        id={bodyId}
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={bodyRef} className="relative">
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.div
                key="editor"
                className="relative pt-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  position: "absolute",
                  transition: exitFor(durations.fast),
                }}
                transition={fade}
              >
                <textarea
                  value={text}
                  rows={rows}
                  placeholder={placeholder}
                  aria-labelledby={labelId}
                  readOnly={sweeping}
                  onChange={(event) => {
                    setTouched(true);
                    commit(event.target.value);
                  }}
                  className={cn(
                    "block w-full resize-none rounded-2 border border-input bg-surface-0 px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none placeholder:text-ink-3",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                />
                {/* The band is a share of the body, so it can never overhang
                    a narrow card; it starts fully left and ends fully right. */}
                <AnimatePresence>
                  {sweeping && motionSafe ? (
                    <motion.span
                      key="sweep"
                      aria-hidden
                      className="pointer-events-none absolute top-3 bottom-0 left-0 w-2/5 rounded-2 bg-linear-to-r from-transparent via-cobalt-bright/25 to-transparent"
                      initial={{ x: "-100%" }}
                      animate={{ x: "250%" }}
                      transition={{
                        duration: SWEEP_MS / 1000,
                        ease: easings.move,
                      }}
                    />
                  ) : sweeping ? (
                    <motion.span
                      key="wash"
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-3 bottom-0 rounded-2 bg-cobalt-wash"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={fade}
                    />
                  ) : null}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.p
                key="preview"
                className="inset-x-0 top-0 truncate pt-2 text-xs text-ink-3"
                title={preview || undefined}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0,
                  position: "absolute",
                  transition: exitFor(durations.fast),
                }}
                transition={fade}
              >
                {preview || placeholder}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
