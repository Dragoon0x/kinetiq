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

export type PromptHistoryProps = {
  /** The text input, so a parent can focus it. */
  ref?: React.Ref<HTMLInputElement>;
  /** Previous prompts, most recent first. */
  prompts: string[];
  /** How many of them the stack shows. @default 5 */
  max?: number;
  /** Controlled field text. */
  value?: string;
  /** Initial field text for uncontrolled usage. */
  defaultValue?: string;
  /** Fires from every edit and from a pick. */
  onValueChange?: (value: string) => void;
  /** Fires when a card is picked, with its index in `prompts`. */
  onPick?: (prompt: string, index: number) => void;
  /** Fires from Enter with text, trimmed. */
  onSend?: (value: string) => void;
  /** Optional controlled open state of the stack. */
  open?: boolean;
  /** Fires when the stack opens or closes. */
  onOpenChange?: (open: boolean) => void;
  /** @default "Ask, or press Up for history" */
  placeholder?: string;
  /** Names the combobox. */
  label: string;
  className?: string;
};

/** How far a card dims and shrinks per step from the wheel's active card. */
const DIM_STEP = 0.22;
const SCALE_STEP = 0.03;

/**
 * A single-line composer with a memory. ArrowUp in the empty field opens a
 * stack of the previous prompts above it, most recent nearest the field: the
 * cards rise from `distances.step` on `snap` in a `cascade` stagger, so the
 * stack unfolds within the budget rather than appearing at once. It reads as a
 * wheel — the active card at full ink and scale, its neighbours dimmer and
 * smaller by their distance — and ArrowUp turns it toward older prompts,
 * ArrowDown toward newer; one step past the newest closes it. Enter picks: the
 * stack leaves on the exit ease and the prompt slides down into the field on
 * `snap`, caret at the end. A clock button opens the same stack for the
 * pointer, typing closes it (the stack only lives while the field is empty),
 * and Enter with text sends.
 *
 * It is a combobox: the input carries `aria-expanded` and the active
 * descendant, the cards are options with `aria-selected`, and a status line
 * announces picks and sends on settle — turning the wheel is carried by the
 * active descendant, never announced per step. Under reduced motion the stack
 * fades in place, the highlight swaps without scale, and the picked prompt
 * fades into the field.
 */
export function PromptHistory({
  ref,
  prompts,
  max = 5,
  value,
  defaultValue,
  onValueChange,
  onPick,
  onSend,
  open,
  onOpenChange,
  placeholder = "Ask, or press Up for history",
  label,
  className,
}: PromptHistoryProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-list`;
  const pillId = `${baseId}-pill`;
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? "",
  );
  const text = value ?? uncontrolledValue;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isOpen = open ?? uncontrolledOpen;

  const [active, setActive] = React.useState(0);
  const [landing, setLanding] = React.useState<{
    key: number;
    text: string;
  } | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const setInputNode = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  const shown = prompts.slice(0, Math.max(1, max));
  const count = shown.length;
  const stackOpen = isOpen && count > 0;
  const activeIndex = Math.min(active, count - 1);

  // The wheel starts at the newest card every time the stack opens, whether
  // a key or the parent opened it; adjusted during render so the first frame
  // already points at it.
  const [seenOpen, setSeenOpen] = React.useState(stackOpen);
  if (seenOpen !== stackOpen) {
    setSeenOpen(stackOpen);
    if (stackOpen) setActive(0);
  }

  // The caret follows a pick: the field is focused with the caret at the end
  // once the picked text is in it, which is the render after `landing` lands.
  React.useEffect(() => {
    if (!landing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, [landing]);

  const commit = (next: string) => {
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  };
  const setOpen = (next: boolean) => {
    if (open === undefined) setUncontrolledOpen(next);
    if (next !== isOpen) onOpenChange?.(next);
  };
  const openStack = () => {
    if (count === 0 || text !== "") return;
    setActive(0);
    setOpen(true);
  };
  const pick = (index: number) => {
    const prompt = shown[index];
    if (prompt === undefined) return;
    commit(prompt);
    setOpen(false);
    setLanding((prev) => ({ key: (prev?.key ?? 0) + 1, text: prompt }));
    setAnnounce(`Picked: ${prompt}`);
    onPick?.(prompt, index);
  };
  const send = () => {
    const trimmed = text.trim();
    if (trimmed === "") return;
    setAnnounce("Sent");
    onSend?.(trimmed);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (stackOpen) {
      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          setActive(Math.min(count - 1, activeIndex + 1));
          return;
        case "ArrowDown":
          event.preventDefault();
          if (activeIndex === 0) setOpen(false);
          else setActive(activeIndex - 1);
          return;
        case "Home":
          event.preventDefault();
          setActive(count - 1);
          return;
        case "End":
          event.preventDefault();
          setActive(0);
          return;
        case "Enter":
          event.preventDefault();
          pick(activeIndex);
          return;
        case "Escape":
          event.preventDefault();
          setOpen(false);
          return;
        case "Tab":
          setOpen(false);
          return;
        default:
          return;
      }
    }
    if (event.key === "ArrowUp" && text === "" && count > 0) {
      event.preventDefault();
      openStack();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  // DOM order is oldest at the top, newest beside the field, so Home and End
  // read as the ends of what is on screen; the cascade runs from the field up.
  const rows = shown.map((prompt, index) => ({ prompt, index })).reverse();
  const stagger = cascade(count);
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div ref={rootRef} className={cn("flex w-full flex-col", className)}>
      <div className="relative flex items-center gap-1 rounded-3 border border-hairline bg-surface-1 p-1.5 focus-within:border-hairline-strong">
        <AnimatePresence>
          {stackOpen ? (
            <motion.div
              key="stack"
              id={listId}
              role="listbox"
              aria-label="Previous prompts"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={fade}
              className="absolute inset-x-0 bottom-full z-20 mb-1.5 flex flex-col gap-0.5 rounded-2 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-raised"
            >
              <div className="flex h-6 items-center justify-between px-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span>Previous prompts</span>
                <span className="tabular-nums">
                  {activeIndex + 1} / {count}
                </span>
              </div>
              {rows.map(({ prompt, index }, domIndex) => {
                const selected = index === activeIndex;
                const distance = Math.abs(index - activeIndex);
                const dim = Number(
                  Math.max(0.35, 1 - DIM_STEP * distance).toFixed(3),
                );
                const scale = motionSafe
                  ? Number(Math.max(0.9, 1 - SCALE_STEP * distance).toFixed(3))
                  : 1;
                const delay = Number(
                  ((count - 1 - domIndex) * stagger).toFixed(3),
                );
                return (
                  // The rise is mount-only and staggered; the wheel's dim and
                  // scale live on an inner layer so a turn never waits on the
                  // stagger.
                  <motion.div
                    key={index}
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.step }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            delay,
                            opacity: { ...fade, delay },
                          }
                        : fade
                    }
                  >
                    <motion.div
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      initial={false}
                      animate={{ opacity: dim, scale }}
                      transition={motionSafe ? springs.snap : fade}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (!selected) setActive(index);
                      }}
                      onClick={() => pick(index)}
                      className={cn(
                        "relative flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2",
                        selected ? "text-foreground" : "text-ink-2",
                      )}
                    >
                      {selected ? (
                        motionSafe ? (
                          <motion.span
                            aria-hidden
                            layoutId={pillId}
                            transition={springs.snap}
                            className="absolute inset-0 rounded-2 bg-accent"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-2 bg-accent"
                          />
                        )
                      ) : null}
                      <span className="relative w-4 shrink-0 text-center font-mono text-[10px] text-ink-3 tabular-nums">
                        {index + 1}
                      </span>
                      <span className="relative min-w-0 truncate text-sm">
                        {prompt}
                      </span>
                    </motion.div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="relative min-w-0 flex-1">
          <input
            ref={setInputNode}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={stackOpen}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={stackOpen ? listId : undefined}
            aria-activedescendant={
              stackOpen ? optionId(activeIndex) : undefined
            }
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            onChange={(event) => {
              commit(event.target.value);
              if (event.target.value !== "") setOpen(false);
            }}
            onKeyDown={handleKeyDown}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (!next || !rootRef.current?.contains(next)) setOpen(false);
            }}
            className={cn(
              "h-8 w-full bg-transparent px-2 text-sm outline-none placeholder:text-ink-3",
              landing ? "text-transparent caret-foreground" : "text-foreground",
            )}
          />
          {landing ? (
            // The field's text layer: the input goes transparent while the
            // picked prompt slides down into place, then hands back.
            <motion.span
              key={landing.key}
              aria-hidden
              initial={
                motionSafe ? { opacity: 0, y: -distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
              onAnimationComplete={() => setLanding(null)}
              className="pointer-events-none absolute inset-y-0 left-0 flex max-w-full items-center px-2 text-sm text-foreground"
            >
              <span className="truncate">{landing.text}</span>
            </motion.span>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Previous prompts"
          aria-expanded={stackOpen}
          aria-controls={stackOpen ? listId : undefined}
          aria-disabled={count === 0 || text !== "" ? true : undefined}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (stackOpen) {
              setOpen(false);
              return;
            }
            openStack();
            inputRef.current?.focus();
          }}
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            (count === 0 || text !== "") && "opacity-40",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <circle cx="8" cy="8" r="6" />
            <path d="M8 4.75V8l2.25 1.5" />
          </svg>
        </button>
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
