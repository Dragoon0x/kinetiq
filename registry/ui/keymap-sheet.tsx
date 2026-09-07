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

export type KeymapShortcut = {
  /** One keycap per entry: `["⌘", "K"]` draws two caps. */
  keys: string[];
  label: string;
};

export type KeymapGroup = {
  title: string;
  shortcuts: KeymapShortcut[];
};

export type KeymapSheetProps = {
  /** Sections of shortcuts, drawn in order. */
  groups: KeymapGroup[];
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The key that opens the sheet, matched against `event.key`. */
  hotkey?: string;
  /** Fires as the filter field is typed in, and with "" when the sheet opens. */
  onFilterChange?: (filter: string) => void;
  className?: string;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Rows and group headings fold between a known height and zero, so nothing
 *  reserves space for a state it is not in. */
const ROW_H = 32;
const HEAD_H = 30;

const isTypingTarget = (node: EventTarget | null): boolean => {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    node.isContentEditable
  );
};

/**
 * Press ? and the keys drop in. The sheet rises on `glide` — a surface moving,
 * not a switch — and every keycap pops from 0.7× on `flick` in a `cascade`, so
 * a long map still lands inside the 600ms budget. Typing in the filter folds
 * the rows that no longer match away on the exit ease, headings included, so
 * the sheet shrinks to exactly what matches.
 *
 * It is a modal dialog: the hotkey is ignored while focus is in an input,
 * textarea, select or contenteditable, the listener lives only as long as the
 * component is mounted, focus is trapped between the filter and the close
 * button, and Escape closes the sheet and returns focus to the trigger. Under
 * reduced motion the sheet fades and the keycaps simply appear.
 *
 * Fills the nearest positioned ancestor, so give the surface it sits on
 * `position: relative`.
 */
export function KeymapSheet({
  groups,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  hotkey = "?",
  onFilterChange,
  className,
}: KeymapSheetProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const [filter, setFilter] = React.useState("");

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const filterRef = React.useRef<HTMLInputElement | null>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  const openSheet = React.useCallback(() => {
    setFilter("");
    onFilterChange?.("");
    setOpen(true);
  }, [onFilterChange, setOpen]);

  const closeSheet = React.useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setOpen]);

  // The hotkey is a document listener, so it is added on mount and removed on
  // unmount — a sheet that has left the page never answers a keypress again.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== hotkey) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      openSheet();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hotkey, openSheet]);

  // Focus lands on the filter a frame after the panel mounts, so typing can
  // start immediately without the effect body touching state.
  React.useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => filterRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const query = filter.trim().toLowerCase();
  const matches = (shortcut: KeymapShortcut) =>
    query === "" ||
    shortcut.label.toLowerCase().includes(query) ||
    shortcut.keys.some((key) => key.toLowerCase().includes(query));

  const visible = groups.map((group) => ({
    title: group.title,
    rows: group.shortcuts.filter(matches),
  }));
  const capsIn = (rows: KeymapShortcut[]) =>
    rows.reduce((total, row) => total + row.keys.length, 0);

  // Keycaps stagger across the whole sheet rather than per group, so the
  // cascade reads as one sweep down the panel. Offsets are summed rather than
  // carried in a cursor: render stays pure, so a re-render cannot shift them.
  const sections = visible.map((group, groupIndex) => ({
    title: group.title,
    rows: group.rows.map((row, rowIndex) => ({
      ...row,
      start:
        capsIn(visible.slice(0, groupIndex).flatMap((prior) => prior.rows)) +
        capsIn(group.rows.slice(0, rowIndex)),
    })),
  }));
  const capCount = capsIn(visible.flatMap((group) => group.rows));
  const rowCount = visible.reduce(
    (total, group) => total + group.rows.length,
    0,
  );
  const stagger = cascade(capCount);

  const foldIn = { duration: durations.fast, ease: easings.enter };
  const foldOut = exitFor(durations.fast);

  const handlePanelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((node) => node.tabIndex >= 0);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-20", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSheet}
        className={cn(
          "pointer-events-auto absolute top-3 right-3 flex h-8 items-center gap-2 rounded-2 border border-hairline-strong bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors outline-none hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        Shortcuts
        <kbd className="flex h-5 min-w-5 items-center justify-center rounded-1 border border-hairline-strong bg-surface-2 px-1 font-mono text-[10px] leading-none text-ink-2">
          {hotkey}
        </kbd>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.button
            key="scrim"
            type="button"
            tabIndex={-1}
            aria-label="Close shortcuts"
            onClick={closeSheet}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: foldOut }}
            transition={{ duration: durations.fast }}
            className="pointer-events-auto absolute inset-0 cursor-default bg-background/60"
          />
        ) : null}

        {open ? (
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={handlePanelKeyDown}
            initial={
              motionSafe
                ? { y: distances.shift, opacity: 0 }
                : { y: 0, opacity: 0 }
            }
            animate={{ y: 0, opacity: 1 }}
            exit={{
              y: motionSafe ? distances.step : 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="pointer-events-auto absolute inset-x-3 bottom-3 flex max-h-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-3 border border-hairline-strong bg-popover text-popover-foreground shadow-lg"
          >
            <div className="flex items-center gap-3 border-b border-hairline px-3 py-2.5">
              <h2 id={titleId} className="min-w-0 flex-1 text-sm font-semibold">
                Keyboard shortcuts
              </h2>
              <button
                type="button"
                aria-label="Close shortcuts"
                onClick={closeSheet}
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors outline-none hover:bg-accent hover:text-accent-foreground",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  className="size-3.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="m4.5 4.5 7 7" />
                  <path d="m11.5 4.5-7 7" />
                </svg>
              </button>
            </div>

            <div className="px-3 pt-2.5">
              <input
                ref={filterRef}
                type="text"
                value={filter}
                aria-label="Filter shortcuts"
                placeholder="Filter shortcuts"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  setFilter(event.target.value);
                  onFilterChange?.(event.target.value);
                }}
                className={cn(
                  "h-8 w-full rounded-2 border border-hairline-strong bg-surface-2 px-2.5 text-xs outline-none placeholder:text-ink-3",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                )}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-3">
              {sections.map((section) => (
                <section
                  key={section.title}
                  aria-label={section.title}
                  // A group whose rows have all folded away leaves the
                  // accessibility tree too, rather than lingering as an
                  // empty named region.
                  aria-hidden={section.rows.length === 0}
                >
                  <motion.div
                    initial={false}
                    animate={{
                      height: section.rows.length > 0 ? HEAD_H : 0,
                      opacity: section.rows.length > 0 ? 1 : 0,
                    }}
                    transition={section.rows.length > 0 ? foldIn : foldOut}
                    className="overflow-hidden"
                  >
                    <h3 className="flex h-[30px] items-end pb-1 text-[10px] font-medium tracking-[0.08em] text-ink-3 uppercase">
                      {section.title}
                    </h3>
                  </motion.div>

                  <ul>
                    <AnimatePresence initial={false}>
                      {section.rows.map((row) => (
                        <motion.li
                          key={`${section.title}:${row.label}`}
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: ROW_H, opacity: 1 }}
                          exit={{
                            height: 0,
                            opacity: 0,
                            transition: foldOut,
                          }}
                          transition={foldIn}
                          className="overflow-hidden"
                        >
                          <div className="flex h-8 items-center justify-between gap-3">
                            <span
                              title={row.label}
                              className="min-w-0 truncate text-xs"
                            >
                              {row.label}
                            </span>
                            <span className="flex shrink-0 items-center gap-1">
                              {row.keys.map((key, keyIndex) => {
                                const delay = (row.start + keyIndex) * stagger;
                                return (
                                  <motion.kbd
                                    key={`${key}-${keyIndex}`}
                                    initial={
                                      motionSafe
                                        ? { scale: 0.7, opacity: 0 }
                                        : { scale: 1, opacity: 0 }
                                    }
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={
                                      motionSafe
                                        ? {
                                            ...springs.flick,
                                            delay,
                                            opacity: {
                                              duration: durations.blink,
                                              delay,
                                            },
                                          }
                                        : { duration: durations.fast }
                                    }
                                    className="flex h-5 min-w-5 items-center justify-center rounded-1 border border-hairline-strong bg-surface-2 px-1 font-mono text-[10px] leading-none text-ink-2"
                                  >
                                    {key}
                                  </motion.kbd>
                                );
                              })}
                            </span>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              ))}

              <AnimatePresence initial={false}>
                {rowCount === 0 ? (
                  <motion.p
                    key="empty"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: ROW_H, opacity: 1 }}
                    exit={{ height: 0, opacity: 0, transition: foldOut }}
                    transition={foldIn}
                    className="flex items-center overflow-hidden text-xs text-ink-3"
                  >
                    No shortcut matches that.
                  </motion.p>
                ) : null}
              </AnimatePresence>

              <span role="status" className="sr-only">
                {`${rowCount} shortcut${rowCount === 1 ? "" : "s"} listed`}
              </span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
