"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WellOption = {
  id: string;
  label: string;
  /** Mono aside on the right of the row — a path, a type, a shortcut. */
  hint?: string;
};

export type PromptWellProps = {
  ref?: React.Ref<HTMLDivElement>;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Offered after `@`, anywhere a word can start. */
  sources?: WellOption[];
  /** Offered after `/`, and only when it leads the prompt. */
  commands?: WellOption[];
  onSubmit?: (value: string) => void;
  /** Swaps send for stop and blocks submission while a reply is forming. */
  busy?: boolean;
  onStop?: () => void;
  placeholder?: string;
  /** Rows the well grows to before it starts scrolling. @default 6 */
  maxRows?: number;
  /**
   * Models the composer can address. With two or more, a picker chip joins
   * the footer; clicking it cycles, so switching is one tap and the current
   * choice is always printed rather than hidden in a menu.
   */
  models?: string[];
  /** Controlled model selection. */
  model?: string;
  onModelChange?: (model: string) => void;
  /** Offer a dictation control beside send; the well never records audio itself. */
  onDictate?: () => void;
  /** The container's silhouette. @default "well" */
  shape?: "well" | "pill";
  label?: React.ReactNode;
  "aria-label"?: string;
  className?: string;
};

type Trigger = {
  kind: "source" | "command";
  query: string;
  /** Index of the trigger character itself. */
  start: number;
};

/**
 * Reads the token being typed at the caret. A trigger only counts at the start
 * of a word, and a space closes it — so an address in prose never opens the
 * source list. Commands are stricter still: `/` only counts leading the prompt,
 * which is the difference between asking for one and mentioning one.
 */
function findTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  const slash = before.lastIndexOf("/");
  const pick = Math.max(at, slash);
  if (pick === -1) return null;
  if (pick > 0 && !/\s/.test(before[pick - 1] ?? "")) return null;
  const query = before.slice(pick + 1);
  if (/\s/.test(query)) return null;
  if (pick === slash) {
    if (pick !== 0) return null;
    return { kind: "command", query, start: pick };
  }
  return { kind: "source", query, start: pick };
}

const matches = (options: WellOption[], query: string): WellOption[] => {
  if (!query) return options;
  const needle = query.toLowerCase();
  return options.filter((o) => o.label.toLowerCase().includes(needle));
};

/**
 * A composer that deepens as the thought gets longer. The field grows line by
 * line to `maxRows` and then holds and scrolls, so the send control never walks
 * away down the page.
 *
 * Typing `@` opens the sources it can draw on and `/` opens the commands it can
 * run — filtered as you type, arrow keys to move, Enter or Tab to take one,
 * Escape to dismiss. The list rises on `snap` from the edge it is anchored to.
 * Enter sends, Shift+Enter breaks the line, and while a reply is forming the
 * send control becomes stop.
 *
 * The field is a combobox over that list with an active-descendant, so the
 * highlighted row is announced without the caret ever leaving the text. Under
 * reduced motion the list appears in place and the control swaps without travel.
 */
export function PromptWell({
  ref,
  value: controlledValue,
  defaultValue = "",
  onValueChange,
  sources = [],
  commands = [],
  onSubmit,
  busy = false,
  onStop,
  placeholder = "Ask anything…",
  maxRows = 6,
  models,
  model: modelProp,
  onModelChange,
  onDictate,
  shape = "well",
  label,
  "aria-label": ariaLabel,
  className,
}: PromptWellProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const areaRef = React.useRef<HTMLTextAreaElement | null>(null);

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const value = controlledValue ?? uncontrolled;

  const [trigger, setTrigger] = React.useState<Trigger | null>(null);
  const [ownModel, setOwnModel] = React.useState(models?.[0]);
  const activeModel = modelProp ?? ownModel;

  const cycleModel = () => {
    if (!models || models.length < 2) return;
    const at = Math.max(0, models.indexOf(activeModel ?? models[0]!));
    const next = models[(at + 1) % models.length]!;
    if (modelProp === undefined) setOwnModel(next);
    onModelChange?.(next);
  };
  const [active, setActive] = React.useState(0);

  const pool = trigger?.kind === "command" ? commands : sources;
  const options = trigger ? matches(pool, trigger.query) : [];
  const open = trigger !== null && options.length > 0;
  const listId = `${baseId}-list`;
  const labelId = label ? `${baseId}-label` : undefined;

  // Grow to fit, then hold. Height is written straight to the node so no render
  // depends on a measurement — the DOM carries it.
  React.useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
    const padding = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight, line * maxRows + padding)}px`;
  }, [value, maxRows]);

  const commit = (next: string) => {
    if (controlledValue === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  /**
   * Which trigger the reader dismissed, by the index of its character. Every
   * keystroke re-reads the caret, so without this an Escape would be undone by
   * its own keyup — the text still holds the `@`, so the list would reopen
   * before the key was released. Cleared once that trigger is gone, so deleting
   * the character and typing it again offers the list afresh.
   */
  const dismissedRef = React.useRef<number | null>(null);

  const sync = (next: string, caret: number) => {
    const found = findTrigger(next, caret);
    if (!found) {
      dismissedRef.current = null;
      setTrigger(null);
      return;
    }
    if (dismissedRef.current === found.start) {
      setTrigger(null);
      return;
    }
    dismissedRef.current = null;
    setTrigger(found);
    setActive(0);
  };

  const take = (option: WellOption) => {
    const el = areaRef.current;
    if (!el || !trigger) return;
    const caret = el.selectionStart ?? value.length;
    const mark = trigger.kind === "command" ? "/" : "@";
    const next = `${value.slice(0, trigger.start)}${mark}${option.label} ${value.slice(caret)}`;
    const at = trigger.start + mark.length + option.label.length + 1;
    commit(next);
    setTrigger(null);
    // Restore the caret after React writes the new value.
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
    });
  };

  const send = () => {
    const text = value.trim();
    if (!text || busy) return;
    onSubmit?.(text);
    commit("");
    setTrigger(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % options.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const option = options[active];
        if (option) {
          event.preventDefault();
          take(option);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dismissedRef.current = trigger?.start ?? null;
        setTrigger(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div
      ref={ref}
      className={cn("flex w-full flex-col gap-2", className)}
      role="group"
      aria-label={labelId ? undefined : (ariaLabel ?? "Prompt")}
      aria-labelledby={labelId}
    >
      {label && (
        <span id={labelId} className="text-label text-ink-3">
          {label}
        </span>
      )}

      <div
        className={cn(
          "relative border border-hairline bg-surface-1",
          shape === "pill" ? "rounded-[26px]" : "rounded-3",
        )}
      >
        <AnimatePresence>
          {open && (
            <motion.ul
              id={listId}
              role="listbox"
              aria-label={trigger?.kind === "command" ? "Commands" : "Sources"}
              className="absolute bottom-[calc(100%+6px)] left-0 z-20 max-h-56 w-full overflow-y-auto rounded-2 border border-hairline bg-surface-2 p-1 shadow-raised"
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.nudge, scale: 0.98 }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                motionSafe
                  ? { opacity: 0, y: distances.nudge / 2 }
                  : { opacity: 0 }
              }
              transition={
                motionSafe
                  ? springs.snap
                  : { duration: durations.fast, ease: easings.enter }
              }
            >
              {options.map((option, index) => (
                <li
                  key={option.id}
                  id={`${baseId}-option-${option.id}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => {
                    // Keep the caret; the field must not blur before we insert.
                    event.preventDefault();
                    take(option);
                  }}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-1 px-2 py-1.5 text-sm",
                    index === active ? "text-ink" : "text-ink-2",
                  )}
                  style={
                    index === active
                      ? { background: "var(--accent-wash)" }
                      : undefined
                  }
                >
                  <span className="truncate">{option.label}</span>
                  {option.hint && (
                    <span className="shrink-0 text-label text-ink-3">
                      {option.hint}
                    </span>
                  )}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <textarea
          ref={areaRef}
          rows={1}
          value={value}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={
            open ? `${baseId}-option-${options[active]?.id ?? ""}` : undefined
          }
          aria-label={ariaLabel ?? (label ? undefined : "Prompt")}
          aria-labelledby={labelId}
          onChange={(event) => {
            commit(event.target.value);
            sync(event.target.value, event.target.selectionStart ?? 0);
          }}
          onKeyUp={(event) => {
            const el = event.currentTarget;
            sync(el.value, el.selectionStart ?? 0);
          }}
          onClick={(event) => {
            const el = event.currentTarget;
            sync(el.value, el.selectionStart ?? 0);
          }}
          onBlur={() => setTrigger(null)}
          onKeyDown={handleKeyDown}
          className="block w-full resize-none bg-transparent px-3 pt-3 pb-1 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-3"
        />

        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate px-1 text-label text-ink-3">
              {trigger?.kind === "command"
                ? "Enter to run"
                : trigger
                  ? "Enter to attach"
                  : "@ sources · / commands"}
            </span>
            {models && models.length > 0 && activeModel && (
              <button
                type="button"
                onClick={cycleModel}
                aria-label={`Model: ${activeModel}.${
                  models.length > 1 ? " Click to switch." : ""
                }`}
                className="shrink-0 rounded-full border border-hairline px-2 py-0.5 font-mono text-[10px] tracking-[0.04em] text-ink-2 transition-colors hover:text-ink"
              >
                {activeModel}
              </button>
            )}
          </span>

          {onDictate && !busy && (
            <button
              type="button"
              onClick={onDictate}
              aria-label="Dictate"
              className="mr-1.5 rounded-2 border border-hairline px-2 py-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="size-3.5 fill-none stroke-current"
                strokeWidth="1.4"
                strokeLinecap="round"
              >
                <rect x="6" y="1.5" width="4" height="7.5" rx="2" />
                <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" />
              </svg>
            </button>
          )}
          {busy ? (
            <motion.button
              type="button"
              onClick={onStop}
              initial={motionSafe ? { scale: 0.9 } : false}
              animate={{ scale: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
              className="rounded-2 border border-hairline px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Stop
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={send}
              disabled={!value.trim()}
              whileTap={
                motionSafe && value.trim() ? { scale: 0.94 } : undefined
              }
              transition={motionSafe ? springs.flick : { duration: 0 }}
              className="rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40"
            >
              Send
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
