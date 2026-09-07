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

/** Splits a label around the typed span so the match can be inked differently. */
function partition(text: string, query: string): [string, string, string] {
  if (query.length === 0) return [text, "", ""];
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return [text, "", ""];
  return [
    text.slice(0, at),
    text.slice(at, at + query.length),
    text.slice(at + query.length),
  ];
}

export type TypeaheadFieldProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "value" | "defaultValue" | "onChange" | "onSelect"
> & {
  /** The vocabulary to complete from. */
  suggestions: string[];
  /** Controlled typed text. */
  value?: string;
  /** Initial typed text for uncontrolled usage. */
  defaultValue?: string;
  /** Fires on typing and on accept. */
  onValueChange?: (value: string) => void;
  /** Fires when a suggestion is accepted, by completion or by pick. */
  onAccept?: (value: string) => void;
  /** Suggestions shown under the field. @default 6 */
  maxItems?: number;
  /** Visible label. */
  label: string;
};

/**
 * A field that finishes the word for you. The best match's remainder sits in
 * grey just past the caret; Tab or ArrowRight takes it, and the grey copy wipes
 * left to right (`durations.base`) to reveal the committed ink underneath — the
 * completion is seen becoming real rather than swapped for real.
 *
 * Beneath, matches `cascade()` in and a marker rides between them on `snap`,
 * carried by one `layoutId` so a single bar travels rather than several
 * blinking. The field is a proper combobox: the input keeps focus and keeps the
 * caret, and `aria-activedescendant` points at whichever option the marker sits
 * on, so arrowing through the list never moves focus out of the text.
 *
 * Reduced motion drops the cascade and the sweep — the marker jumps, the
 * completion commits at once — and every match is still listed and still
 * emphasised, because that is information rather than flourish.
 */
export function TypeaheadField({
  suggestions,
  value,
  defaultValue,
  onValueChange,
  onAccept,
  maxItems = 6,
  label,
  className,
  disabled,
  id,
  onKeyDown,
  onBlur,
  ...props
}: TypeaheadFieldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const inputId = id ?? `${baseId}-input`;
  const labelId = `${baseId}-label`;
  const listId = `${baseId}-list`;
  const markerId = `${baseId}-marker`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const text = isControlled ? value : uncontrolled;

  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [sweep, setSweep] = React.useState<{
    head: string;
    tail: string;
  } | null>(null);

  const matches = React.useMemo(() => {
    if (text.length === 0) return [];
    const query = text.toLowerCase();
    const leading: string[] = [];
    const inner: string[] = [];
    for (const item of suggestions) {
      const lower = item.toLowerCase();
      if (lower.startsWith(query)) leading.push(item);
      else if (lower.includes(query)) inner.push(item);
    }
    return [...leading, ...inner].slice(0, Math.max(1, maxItems));
  }, [suggestions, text, maxItems]);

  const active = Math.min(activeIndex, Math.max(matches.length - 1, 0));
  const target = matches[active];
  const listOpen = open && matches.length > 0;

  // Only a match that continues what was typed can be shown ahead of the caret.
  const completion =
    target && target.toLowerCase().startsWith(text.toLowerCase())
      ? target.slice(text.length)
      : "";

  /**
   * The panel is measured rather than given room: an open list with two matches
   * is exactly two rows tall, and narrowing from six to two animates instead of
   * jumping, which `height: auto` alone cannot do while the list stays open.
   */
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = React.useState(0);
  React.useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      // The border box, not contentRect — the gap above the list is padding.
      setPanelHeight(node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const commit = (next: string) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const accept = (next: string) => {
    // The head comes from the accepted string, not from what was typed, so the
    // invisible spacer under the sweep matches the ink it is covering.
    if (next.toLowerCase().startsWith(text.toLowerCase()) && next !== text) {
      setSweep({
        head: next.slice(0, text.length),
        tail: next.slice(text.length),
      });
    } else {
      setSweep(null);
    }
    commit(next);
    setOpen(false);
    setActiveIndex(0);
    onAccept?.(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (matches.length > 0)
        setActiveIndex((index) => (index + 1) % matches.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      else if (matches.length > 0)
        setActiveIndex(
          (index) => (index - 1 + matches.length) % matches.length,
        );
      return;
    }
    if (event.key === "Enter" && listOpen && target) {
      event.preventDefault();
      accept(target);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    // Shift+Tab is the way back out of the field, never an accept. What is
    // accepted is the suggestion itself, never the typed prefix plus the
    // remainder: "brig" + Tab commits "Brightwater", exactly as Enter does.
    if (event.key === "Tab" && completion && target && !event.shiftKey) {
      event.preventDefault();
      accept(target);
      return;
    }
    if (event.key === "ArrowRight" && completion) {
      const node = event.currentTarget;
      // Only when the caret is parked at the end — mid-string, Right still moves.
      if (
        target &&
        node.selectionStart === text.length &&
        node.selectionEnd === text.length
      ) {
        event.preventDefault();
        accept(target);
      }
    }
  };

  const itemStep = cascade(matches.length);

  return (
    <div className={cn("w-full", className)}>
      <label
        id={labelId}
        htmlFor={inputId}
        className={cn(
          "mb-1.5 block text-sm font-medium text-foreground",
          disabled && "opacity-50",
        )}
      >
        {label}
      </label>

      <div
        className={cn(
          "relative flex h-11 items-center rounded-2 border border-input bg-surface-1 px-3",
          "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={text}
          aria-expanded={listOpen}
          aria-controls={listId}
          aria-autocomplete="both"
          aria-activedescendant={
            listOpen && target ? `${baseId}-option-${active}` : undefined
          }
          onChange={(event) => {
            setSweep(null);
            setActiveIndex(0);
            setOpen(true);
            commit(event.target.value);
          }}
          onKeyDown={handleKeyDown}
          onBlur={(event) => {
            setOpen(false);
            onBlur?.(event);
          }}
          className="relative z-10 h-full w-full min-w-0 bg-transparent text-sm text-foreground outline-none"
          {...props}
        />

        {/* The remainder, parked past the caret. An invisible copy of what was
            typed does the spacing, so this works in a proportional face. */}
        {completion && !sweep && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 left-3 z-0 flex items-center overflow-hidden text-sm whitespace-pre"
          >
            <span className="invisible">{text}</span>
            <span className="text-muted-foreground">{completion}</span>
          </span>
        )}

        {sweep && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3 left-3 z-20 flex items-center overflow-hidden text-sm whitespace-pre"
          >
            <span className="invisible">{sweep.head}</span>
            <motion.span
              className="bg-surface-1 text-muted-foreground"
              initial={{ clipPath: "inset(0 0 0 0)" }}
              animate={{ clipPath: "inset(0 0 0 100%)" }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
              onAnimationComplete={() => setSweep(null)}
            >
              {sweep.tail}
            </motion.span>
          </span>
        )}
      </div>

      <motion.div
        animate={{ height: listOpen ? panelHeight : 0 }}
        initial={false}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden"
      >
        <div ref={panelRef} className="pt-2">
          <AnimatePresence initial={false}>
            {listOpen && (
              <motion.div
                key="list"
                id={listId}
                role="listbox"
                aria-labelledby={labelId}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast }}
                className="flex flex-col gap-0.5 rounded-2 border border-hairline bg-surface-1 p-1"
              >
                {matches.map((item, index) => {
                  const [before, hit, after] = partition(item, text);
                  const selected = index === active;
                  return (
                    <motion.button
                      key={item}
                      type="button"
                      role="option"
                      id={`${baseId}-option-${index}`}
                      aria-selected={selected}
                      tabIndex={-1}
                      // Keeps focus (and the caret) in the input on a pick.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => accept(item)}
                      onPointerEnter={() => setActiveIndex(index)}
                      initial={
                        motionSafe
                          ? { opacity: 0, y: distances.nudge }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              duration: durations.base,
                              ease: easings.enter,
                              delay: index * itemStep,
                            }
                          : { duration: durations.fast }
                      }
                      className="relative flex h-9 items-center rounded-2 px-3 text-left text-sm outline-none"
                    >
                      {selected &&
                        (motionSafe ? (
                          <motion.span
                            aria-hidden
                            layoutId={markerId}
                            transition={springs.snap}
                            className="absolute inset-0 rounded-2 border border-hairline bg-cobalt-wash"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="absolute inset-0 rounded-2 border border-hairline bg-cobalt-wash"
                          />
                        ))}
                      <span
                        className={cn(
                          "relative truncate",
                          selected
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {before}
                        <span className="font-medium text-cobalt-bright">
                          {hit}
                        </span>
                        {after}
                      </span>
                    </motion.button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {listOpen ? `${matches.length} suggestions` : ""}
      </span>
    </div>
  );
}
