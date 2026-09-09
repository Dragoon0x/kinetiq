"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BudgetTool = {
  id: string;
  name: string;
  /** Calls this tool has made; printed beside its name. */
  calls?: number;
};

export type ToolBudgetProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Total calls allowed; one segment each. */
  budget: number;
  /** Calls spent so far. Clamped to `budget`. */
  used: number;
  /** The rail of tools that spend calls. */
  tools: BudgetTool[];
  /** Calls left at which the remaining segments start to pulse. @default 3 */
  warnAt?: number;
  /** Fires from a tool control while calls remain. */
  onCall?: (toolId: string) => void;
  /** Names the meter and the rail. */
  label: string;
  className?: string;
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Digits that roll on `snap`; hidden because the meter's value text carries the number. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const text = String(Math.max(0, Math.round(value)));
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {text.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        return (
          <span
            // Keyed from the right so the units column keeps its identity.
            key={text.length - index}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${Math.max(0, digit) * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span key={face} className="flex h-[1.25em] justify-center">
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** Locked is drawn, not merely dimmed — hatching survives both themes and colour blindness. */
const HATCH =
  "repeating-linear-gradient(-45deg, var(--hairline-strong) 0 1px, transparent 1px 7px)";

/**
 * A meter of tool calls and the rail that spends them. One segment per call,
 * filled from the left; each call drains the rightmost filled segment on
 * `glide` — a quantity settling, no overshoot — and the count of calls left
 * rolls its digits on `snap`. At `warnAt` or fewer the remaining segments
 * pulse, an opacity breath at the ambient tempo of `drift`, and the readout
 * gains the word "low" so colour never carries the warning alone. At zero the
 * meter turns danger and the rail locks: a hatch fades over it, a lock lands
 * on `flick` — firm, because a lock is not a celebration — and every tool
 * goes `aria-disabled` while staying focusable, so the keyboard can still
 * read what is locked.
 *
 * The host owns `used`; pressing a tool asks for a call through `onCall`.
 * The rail is a toolbar with a roving tabindex: arrows move, Home and End
 * jump, Enter and Space press. The status region speaks on threshold only —
 * running low, then locked — never per call. Under reduced motion segments
 * tween empty, digits swap, nothing pulses, and the hatch and lock appear.
 */
export function ToolBudget({
  ref,
  budget,
  used,
  tools,
  warnAt = 3,
  onCall,
  label,
  className,
}: ToolBudgetProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const toolRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const [focused, setFocused] = React.useState(0);

  const total = Math.max(1, Math.floor(budget));
  const remaining = Math.max(0, total - Math.max(0, Math.floor(used)));
  const locked = remaining === 0;
  const low = !locked && remaining <= warnAt;

  const valueText = locked
    ? "No calls left, tools locked"
    : `${remaining} of ${total} calls left${low ? ", running low" : ""}`;
  const announcement = locked
    ? "No calls left, tools locked"
    : low
      ? "Running low on calls"
      : "";

  const focusTool = (index: number) => {
    const clamped = Math.min(tools.length - 1, Math.max(0, index));
    const tool = tools[clamped];
    if (!tool) return;
    setFocused(clamped);
    toolRefs.current.get(tool.id)?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTool(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTool(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTool(0);
        break;
      case "End":
        event.preventDefault();
        focusTool(tools.length - 1);
        break;
      default:
        break;
    }
  };

  const tone = locked ? "bg-danger" : low ? "bg-warn" : "bg-cobalt-bright";
  const readoutTone = locked
    ? "text-danger"
    : low
      ? "text-warn"
      : "text-foreground";
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
          <span className={cn("font-medium transition-colors", readoutTone)}>
            <RollingNumber value={remaining} motionSafe={motionSafe} />
          </span>
          <span className="text-ink-3">/ {total} left</span>
          <AnimatePresence initial={false}>
            {locked ? (
              <motion.span
                key="lock"
                className="inline-flex h-5 items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-1.5 text-[10px] tracking-[0.08em] text-danger uppercase"
                initial={
                  motionSafe ? { opacity: 0, scale: 0.8 } : { opacity: 0 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? { ...springs.flick, opacity: fade } : fade
                }
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  className="size-3 shrink-0"
                >
                  <rect x="3.5" y="7" width="9" height="6" rx="1.5" />
                  <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
                </svg>
                Locked
              </motion.span>
            ) : low ? (
              <motion.span
                key="low"
                className="text-[10px] tracking-[0.08em] text-warn uppercase"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={fade}
              >
                low
              </motion.span>
            ) : null}
          </AnimatePresence>
        </span>
      </div>

      <div
        role="meter"
        aria-labelledby={labelId}
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={valueText}
        className="grid h-2 gap-[2px]"
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: total }, (_, index) => {
          const filled = index < remaining;
          return (
            <span
              key={index}
              aria-hidden
              className={cn(
                "relative overflow-hidden rounded-1 transition-colors",
                locked ? "bg-danger/20" : "bg-hairline-strong",
              )}
            >
              <motion.span
                className={cn(
                  "absolute inset-0 origin-left rounded-1 transition-colors",
                  tone,
                )}
                initial={false}
                animate={{
                  scaleX: filled ? 1 : 0,
                  opacity: filled && low && motionSafe ? [1, 0.35] : 1,
                }}
                // The drain settles on glide; the pulse is a slow breath, not
                // a blink, so a low budget reads as tension rather than alarm.
                transition={{
                  scaleX: motionSafe
                    ? springs.glide
                    : { duration: durations.fast, ease: easings.move },
                  opacity:
                    filled && low && motionSafe
                      ? {
                          duration: 0.8,
                          ease: "easeInOut",
                          repeat: Infinity,
                          repeatType: "reverse",
                        }
                      : fade,
                }}
              />
            </span>
          );
        })}
      </div>

      <div className="relative">
        <div
          role="toolbar"
          aria-label="Tools"
          aria-describedby={labelId}
          className="flex flex-wrap gap-1.5"
        >
          {tools.map((tool, index) => (
            <button
              key={tool.id}
              type="button"
              ref={(node) => {
                toolRefs.current.set(tool.id, node);
              }}
              tabIndex={index === focused ? 0 : -1}
              aria-disabled={locked || undefined}
              onFocus={() => setFocused(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => {
                if (!locked) onCall?.(tool.id);
              }}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-0 px-2.5 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                locked
                  ? "cursor-not-allowed text-ink-3"
                  : "text-foreground hover:bg-accent active:bg-cobalt-wash",
              )}
            >
              {tool.name}
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-2 px-1 font-mono text-[10px] text-ink-3 tabular-nums">
                <RollingNumber
                  value={tool.calls ?? 0}
                  motionSafe={motionSafe}
                />
                <span className="sr-only">{tool.calls ?? 0} calls</span>
              </span>
            </button>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {locked ? (
            <motion.span
              key="hatch"
              aria-hidden
              style={{ backgroundImage: HATCH }}
              className="pointer-events-none absolute -inset-1 rounded-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={{ duration: durations.base, ease: easings.enter }}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
