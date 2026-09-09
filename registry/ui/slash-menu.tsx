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

export type SlashCommand = {
  id: string;
  label: string;
  /** Mono aside on the row's right — what the command does, in a few words. */
  hint?: string;
};

export type SlashMenuProps = {
  /** The text input, so a parent can focus it. */
  ref?: React.Ref<HTMLInputElement>;
  /** Offered after a leading slash. */
  commands: SlashCommand[];
  /** Controlled inserted command ids. */
  chips?: string[];
  /** Initial inserted command ids for uncontrolled usage. */
  defaultChips?: string[];
  onChipsChange?: (ids: string[]) => void;
  /** Controlled input text. */
  value?: string;
  /** Initial input text for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Fires from Enter or a click on an option. */
  onInsert?: (command: SlashCommand) => void;
  /** Fires from a chip's remove button or Backspace in an empty field. */
  onRemove?: (command: SlashCommand) => void;
  placeholder?: string;
  /** Names the combobox. */
  label: string;
  className?: string;
};

const NO_CHIPS: string[] = [];

/** The list's preferred width; it narrows to the composer when that is narrower. */
const MENU_WIDTH = 256;

/**
 * Type a slash; the commands rise. A leading `/` in the input opens a list
 * anchored above the caret — the input's offset inside the composer, measured
 * by a ResizeObserver so chips pushing the input along move the anchor with it,
 * and clamped so the list never overhangs the composer's edge. The list rises
 * from `distances.step` on `snap`, one crisp overshoot, and leaves on the exit
 * ease. Arrow keys move a single `layoutId` pill between rows on `snap` rather
 * than two rows blinking; Enter turns the active command into a chip that
 * scales in on `snap` while the slash text clears.
 *
 * It is a combobox: the input carries `aria-expanded` and
 * `aria-activedescendant`, the rows are options with `aria-selected`, chips are
 * a list with a real remove button each, and a status line announces inserts
 * and removals on settle — never the filtering, which changes per keystroke.
 * Under reduced motion the list fades in place, the pill swaps rows and chips
 * appear by opacity alone.
 */
export function SlashMenu({
  ref,
  commands,
  chips,
  defaultChips,
  onChipsChange,
  value,
  defaultValue,
  onValueChange,
  onInsert,
  onRemove,
  placeholder = "Type / for commands",
  label,
  className,
}: SlashMenuProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const listId = `${baseId}-list`;
  const pillId = `${baseId}-pill`;

  const [uncontrolledChips, setUncontrolledChips] = React.useState<string[]>(
    defaultChips ?? NO_CHIPS,
  );
  const chipIds = chips ?? uncontrolledChips;
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? "",
  );
  const text = value ?? uncontrolledValue;

  const [focused, setFocused] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");
  const [frame, setFrame] = React.useState({ left: 0, width: 0 });

  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const composerRef = React.useRef<HTMLDivElement | null>(null);

  const setInputNode = (node: HTMLInputElement | null) => {
    inputRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };

  // The anchor is the input's offset. Observing the input as well as the
  // composer catches every chip insert, because each one narrows the input.
  React.useEffect(() => {
    const composer = composerRef.current;
    const input = inputRef.current;
    if (!composer || !input || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setFrame({
        left: Math.round(input.offsetLeft),
        width: Math.round(composer.clientWidth),
      }),
    );
    observer.observe(composer);
    observer.observe(input);
    return () => observer.disconnect();
  }, []);

  const query = text.startsWith("/")
    ? text.slice(1).trim().toLowerCase()
    : null;
  const open = focused && query !== null && !dismissed;
  const matches =
    query === null
      ? []
      : commands.filter((command) =>
          command.label.toLowerCase().includes(query),
        );
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  const activeCommand = matches[activeIndex];
  const optionId = (command: SlashCommand) => `${baseId}-opt-${command.id}`;

  const commitText = (next: string) => {
    if (value === undefined) setUncontrolledValue(next);
    onValueChange?.(next);
  };
  const commitChips = (next: string[]) => {
    if (chips === undefined) setUncontrolledChips(next);
    onChipsChange?.(next);
  };

  const insert = (command: SlashCommand) => {
    commitText("");
    setDismissed(false);
    setActive(0);
    if (chipIds.includes(command.id)) {
      setAnnounce(`${command.label} already inserted`);
      return;
    }
    commitChips([...chipIds, command.id]);
    setAnnounce(`Inserted ${command.label}`);
    onInsert?.(command);
  };

  const remove = (index: number) => {
    const id = chipIds[index];
    if (id === undefined) return;
    const command = commands.find((candidate) => candidate.id === id);
    commitChips(chipIds.filter((_, at) => at !== index));
    setAnnounce(`Removed ${command?.label ?? id}`);
    if (command) onRemove?.(command);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          setActive(Math.max(0, Math.min(matches.length - 1, activeIndex + 1)));
          return;
        case "ArrowUp":
          event.preventDefault();
          setActive(Math.max(0, activeIndex - 1));
          return;
        case "Home":
          event.preventDefault();
          setActive(0);
          return;
        case "End":
          event.preventDefault();
          setActive(Math.max(0, matches.length - 1));
          return;
        case "Enter":
          event.preventDefault();
          if (activeCommand) insert(activeCommand);
          return;
        case "Escape":
          event.preventDefault();
          setDismissed(true);
          return;
        default:
          break;
      }
    }
    if (event.key === "Backspace" && text === "" && chipIds.length > 0) {
      event.preventDefault();
      remove(chipIds.length - 1);
    }
  };

  const menuWidth = frame.width > 0 ? Math.min(MENU_WIDTH, frame.width) : null;
  const menuStyle =
    menuWidth === null
      ? { left: 0, right: 0 }
      : {
          left: Math.max(0, Math.min(frame.left, frame.width - menuWidth)),
          width: menuWidth,
        };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div className={cn("flex w-full flex-col", className)}>
      <div
        ref={composerRef}
        className="relative rounded-3 border border-hairline bg-surface-1 p-1.5 focus-within:border-hairline-strong"
      >
        <AnimatePresence>
          {open ? (
            <motion.div
              key="menu"
              id={listId}
              role="listbox"
              aria-label="Commands"
              style={menuStyle}
              initial={
                motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? distances.nudge : 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
              className="absolute bottom-full z-20 mb-1.5 flex flex-col rounded-2 border border-hairline-strong bg-popover p-1 text-popover-foreground shadow-raised"
            >
              <div className="flex h-6 items-center justify-between px-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <span>Commands</span>
                <span className="tabular-nums">{matches.length}</span>
              </div>
              {matches.length === 0 ? (
                <div className="flex h-8 items-center px-2 text-xs text-ink-3">
                  No command matches
                </div>
              ) : (
                matches.map((command, index) => {
                  const selected = index === activeIndex;
                  return (
                    <div
                      key={command.id}
                      id={optionId(command)}
                      role="option"
                      aria-selected={selected}
                      // Keeps focus in the input, so the list survives the click
                      // long enough to take it.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (!selected) setActive(index);
                      }}
                      onClick={() => insert(command)}
                      className={cn(
                        "relative flex h-8 cursor-pointer items-center justify-between gap-3 rounded-2 px-2 text-sm",
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
                      <span className="relative flex min-w-0 items-center gap-1">
                        <span className="text-ink-3">/</span>
                        <span className="truncate font-medium">
                          {command.label}
                        </span>
                      </span>
                      {command.hint ? (
                        <span className="relative shrink-0 font-mono text-[10px] text-ink-3">
                          {command.hint}
                        </span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-1.5">
          {chipIds.length > 0 ? (
            <ul
              aria-label="Inserted commands"
              className="flex min-w-0 flex-wrap items-center gap-1.5"
            >
              <AnimatePresence initial={false}>
                {chipIds.map((id, index) => {
                  const command = commands.find(
                    (candidate) => candidate.id === id,
                  );
                  const chipLabel = command?.label ?? id;
                  return (
                    <motion.li
                      key={id}
                      layout={motionSafe ? "position" : false}
                      initial={
                        motionSafe ? { scale: 0.8, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{
                        opacity: 0,
                        scale: motionSafe ? 0.9 : 1,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe ? { ...springs.snap, opacity: fade } : fade
                      }
                      className="flex h-7 items-center gap-0.5 rounded-full border border-cobalt-bright/40 bg-cobalt-wash pr-0.5 pl-2 text-xs font-medium text-cobalt-bright"
                    >
                      <span className="whitespace-nowrap">/{chipLabel}</span>
                      <button
                        type="button"
                        aria-label={`Remove /${chipLabel}`}
                        onClick={() => remove(index)}
                        className="grid size-5 shrink-0 place-items-center rounded-full transition-colors outline-none hover:bg-cobalt-bright/15 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                      >
                        <svg
                          viewBox="0 0 16 16"
                          aria-hidden
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          className="size-3"
                        >
                          <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                        </svg>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          ) : null}
          <input
            ref={setInputNode}
            type="text"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open && activeCommand ? optionId(activeCommand) : undefined
            }
            autoComplete="off"
            value={text}
            placeholder={chipIds.length > 0 ? "" : placeholder}
            onChange={(event) => {
              commitText(event.target.value);
              setDismissed(false);
              setActive(0);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="h-7 min-w-[10ch] flex-1 bg-transparent px-1.5 text-sm text-foreground outline-none placeholder:text-ink-3"
          />
        </div>
      </div>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
