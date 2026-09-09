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

export type RecallMemory = {
  id: string;
  /** The remembered fact, one short line. */
  fact: string;
};

export type RecallHintProps = {
  ref?: React.Ref<HTMLTextAreaElement>;
  /** The memory that applies to the draft, or null while none does. */
  memory?: RecallMemory | null;
  /** Controlled draft. */
  value?: string;
  /** Initial draft for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Controlled context: the memories already inserted. */
  context?: RecallMemory[];
  /** Initial context for uncontrolled usage. */
  defaultContext?: RecallMemory[];
  onContextChange?: (context: RecallMemory[]) => void;
  /** Fires from the hint press, after the memory joins the context. */
  onInsert?: (memory: RecallMemory) => void;
  /** Fires from Escape in the field or the hint's dismiss button. */
  onDismiss?: (memory: RecallMemory) => void;
  /** Fires from Enter or the send button with the trimmed draft and its context. */
  onSend?: (value: string, context: RecallMemory[]) => void;
  /** @default "Write a reply" */
  placeholder?: string;
  /** Names the textarea for assistive technology. */
  label: string;
  className?: string;
};

const NO_CONTEXT: RecallMemory[] = [];

/** A small ring with a dot: something held, ready to be recalled. */
function MemoryGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={cn("size-3.5 shrink-0", className)}
    >
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className="size-3 shrink-0"
    >
      <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
    </svg>
  );
}

/**
 * A composer with a memory beside it. When the host passes a memory that
 * applies to the draft, a hint chip rises in the toolbar row from
 * `distances.nudge` on `snap`, then breathes once — a single 1 → 1.04 → 1
 * scale tween on the move ease, timed to begin as the chip lands — and holds
 * still, so it asks for attention exactly once. Pressing it inserts the memory
 * as context: the chip travels up into the context row through a shared
 * `layoutId` on `snap`, so the hint becomes the context rather than a second
 * chip appearing, while the row's measured height glides open on `glide`.
 * Removing a context chip lets it leave on the exit ease and closes the row.
 *
 * Escape in the field dismisses the hint until the host passes a different
 * memory; Enter sends and Shift+Enter breaks the line. A polite status line
 * speaks once per event, never per keystroke. Under reduced motion the chip
 * fades in place, breathes as one opacity dip, and the insert is a cross-fade.
 */
export function RecallHint({
  ref,
  memory = null,
  value,
  defaultValue,
  onValueChange,
  context: contextProp,
  defaultContext,
  onContextChange,
  onInsert,
  onDismiss,
  onSend,
  placeholder = "Write a reply",
  label,
  className,
}: RecallHintProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const areaId = `${baseId}-area`;
  const noteId = `${baseId}-note`;
  const chipId = (id: string) => `${baseId}-chip-${id}`;

  const [ownValue, setOwnValue] = React.useState(defaultValue ?? "");
  const draft = value ?? ownValue;
  const commitValue = (next: string) => {
    if (value === undefined) setOwnValue(next);
    onValueChange?.(next);
  };

  const [ownContext, setOwnContext] = React.useState<RecallMemory[]>(
    defaultContext ?? NO_CONTEXT,
  );
  const context = contextProp ?? ownContext;
  const commitContext = (next: RecallMemory[]) => {
    if (contextProp === undefined) setOwnContext(next);
    onContextChange?.(next);
  };

  // A dismissal is remembered against the memory's id and forgotten the moment
  // the host passes a different one, so the same hint never nags twice in a
  // row but can return after something else applied.
  const [dismissed, setDismissed] = React.useState<{
    forId: string | null;
    id: string | null;
  }>({ forId: memory?.id ?? null, id: null });
  if (dismissed.forId !== (memory?.id ?? null)) {
    setDismissed({ forId: memory?.id ?? null, id: null });
  }

  const inContext = memory
    ? context.some((entry) => entry.id === memory.id)
    : false;
  const hint =
    memory && memory.id !== dismissed.id && !inContext ? memory : null;

  // "Memory available" is announced when a hint's id first shows, adjusted
  // during render so it belongs to that change and not to the keystroke after.
  const [seen, setSeen] = React.useState<{
    hintId: string | null;
    message: string;
  }>({ hintId: hint?.id ?? null, message: "" });
  if (seen.hintId !== (hint?.id ?? null)) {
    setSeen({
      hintId: hint?.id ?? null,
      message: hint ? `Memory available: ${hint.fact}` : seen.message,
    });
  }
  const announce = (message: string) =>
    setSeen((prev) => ({ ...prev, message }));

  const focusArea = () => document.getElementById(areaId)?.focus();

  const insert = () => {
    if (!hint) return;
    commitContext([...context, hint]);
    announce(`Added to context: ${hint.fact}`);
    onInsert?.(hint);
    focusArea();
  };

  const dismiss = (returnFocus: boolean) => {
    if (!hint) return;
    setDismissed({ forId: hint.id, id: hint.id });
    announce("Hint dismissed");
    onDismiss?.(hint);
    if (returnFocus) focusArea();
  };

  const remove = (entry: RecallMemory) => {
    commitContext(context.filter((item) => item.id !== entry.id));
    announce(`Removed from context: ${entry.fact}`);
    focusArea();
  };

  const trimmed = draft.trim();
  const send = () => {
    if (trimmed.length === 0) return;
    announce("Sent");
    onSend?.(trimmed, context);
  };

  const contextRef = React.useRef<HTMLDivElement | null>(null);
  const [contextHeight, setContextHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = contextRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setContextHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const smallButton =
    "grid size-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1 focus-within:border-hairline-strong",
        className,
      )}
    >
      {/* The row clips only while empty: a chip travelling in from the toolbar
          must not be cut off by the box it is arriving into. */}
      <motion.div
        initial={false}
        animate={{ height: contextHeight ?? "auto" }}
        transition={settle}
        className={cn(context.length === 0 && "overflow-hidden")}
      >
        <div ref={contextRef}>
          <ul
            aria-label="Context"
            className={cn(
              "flex flex-wrap gap-1.5",
              context.length > 0 && "px-3 pt-3",
            )}
          >
            <AnimatePresence initial={false}>
              {context.map((entry) => (
                <motion.li
                  key={entry.id}
                  layoutId={motionSafe ? chipId(entry.id) : undefined}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe ? { opacity: fade, layout: springs.snap } : fade
                  }
                  className="flex h-7 max-w-full items-center gap-1 rounded-full border border-hairline-strong bg-surface-2 pr-0.5 pl-2 text-xs text-foreground"
                >
                  <MemoryGlyph className="text-cobalt-bright" />
                  <span className="min-w-0 truncate" title={entry.fact}>
                    {entry.fact}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${entry.fact}`}
                    onClick={() => remove(entry)}
                    className={smallButton}
                  >
                    <CrossGlyph />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>

      <textarea
        ref={ref}
        id={areaId}
        value={draft}
        onChange={(event) => commitValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          } else if (event.key === "Escape" && hint) {
            event.preventDefault();
            dismiss(false);
          }
        }}
        rows={2}
        placeholder={placeholder}
        aria-label={label}
        aria-describedby={hint ? noteId : undefined}
        className="w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3"
      />
      <span id={noteId} className="sr-only">
        A memory applies; Tab to the hint to add it, Escape to dismiss
      </span>

      <div className="flex items-center justify-between gap-2 border-t border-hairline p-2">
        <div className="flex min-w-0 flex-1 items-center">
          <AnimatePresence initial={false}>
            {hint ? (
              <motion.span
                key={hint.id}
                layoutId={motionSafe ? chipId(hint.id) : undefined}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.nudge }
                    : { opacity: 0 }
                }
                animate={
                  motionSafe
                    ? { opacity: 1, y: 0, scale: [1, 1.04, 1] }
                    : { opacity: [0, 1, 0.55, 1] }
                }
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.snap,
                        opacity: fade,
                        layout: springs.snap,
                        // The breath waits for the landing.
                        scale: {
                          duration: durations.slow,
                          ease: easings.move,
                          delay: 0.3,
                          times: [0, 0.5, 1],
                        },
                      }
                    : {
                        duration: durations.slow + durations.fast,
                        ease: easings.move,
                        times: [0, 0.25, 0.6, 1],
                      }
                }
                className="flex h-8 max-w-full items-center gap-0.5 rounded-full border border-cobalt-bright/50 bg-cobalt-wash pr-1 pl-1"
              >
                <button
                  type="button"
                  aria-label={`Add memory: ${hint.fact}`}
                  onClick={insert}
                  className={cn(
                    "flex h-6 min-w-0 items-center gap-1.5 rounded-full pr-2 pl-1.5 text-xs font-medium text-foreground transition-colors outline-none hover:bg-surface-0/60",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  <MemoryGlyph className="text-cobalt-bright" />
                  <span className="min-w-0 truncate" title={hint.fact}>
                    {hint.fact}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Dismiss hint"
                  onClick={() => dismiss(true)}
                  className={smallButton}
                >
                  <CrossGlyph />
                </button>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          aria-label="Send"
          aria-disabled={trimmed.length === 0 ? true : undefined}
          onClick={send}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            trimmed.length === 0 && "opacity-40",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
          </svg>
        </button>
      </div>

      <span role="status" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
