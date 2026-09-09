"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FootnoteEntry = {
  id: string;
  /** The note itself — what the mark points at. */
  text: string;
  /** Where the note comes from. */
  source: { label: string; domain: string };
};

export type FootnoteDrawerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The answer. `[n]` marks the nth note; a blank line separates paragraphs. */
  text: string;
  /** The notes, in mark order. */
  notes: FootnoteEntry[];
  /** Controlled open note id; `null` keeps the drawer lowered. */
  value?: string | null;
  /** Initial open note id for uncontrolled usage. */
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

/** Splits a paragraph into prose runs and `[n]` marks, keeping both. */
const MARK = /(\[\d+\])/;

/**
 * Notes that rise from the bottom. The answer's `[n]` marks render as small
 * buttons; pressing one raises a drawer from the frame's bottom edge on
 * `glide` — no overshoot, because a drawer is a surface moving into place —
 * while a scrim fades over the prose. Inside, every note is listed, and the
 * list's scroll position is animated on `glide` so the pressed note comes
 * into view under a wash that fades once it has been seen. Pressing another
 * mark while the drawer is up keeps it up and scrolls to the new note.
 *
 * The drawer is a modal dialog: focus lands on the opened note so it is read
 * at once, Tab cycles between the close button and the notes, Escape or the
 * scrim lowers it on the exit ease, and focus returns to the mark that
 * opened it. Under reduced motion the drawer and scrim fade in place and the
 * list jumps to the note.
 */
export function FootnoteDrawer({
  ref,
  text,
  notes,
  value,
  defaultValue = null,
  onValueChange,
  label,
  className,
}: FootnoteDrawerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;
  const drawerId = `${baseId}-drawer`;
  const titleId = `${baseId}-title`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue,
  );
  const isControlled = value !== undefined;
  const open = isControlled ? value : uncontrolled;
  const openNote = notes.find((note) => note.id === open) ?? null;

  const [announce, setAnnounce] = React.useState("");
  // Counts presses, so pressing the mark that is already open scrolls and
  // washes again: the reader asked to see the note, not to be ignored.
  const [pressSeq, setPressSeq] = React.useState(0);
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const closeRef = React.useRef<HTMLButtonElement | null>(null);
  const noteNodes = React.useRef(new Map<string, HTMLLIElement>());
  const openerRef = React.useRef<HTMLElement | null>(null);

  const paragraphs = React.useMemo(() => text.split(/\n{2,}/), [text]);

  const setOpen = (next: string | null) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const raise = (note: FootnoteEntry, index: number, opener: HTMLElement) => {
    if (open === null) openerRef.current = opener;
    setOpen(note.id);
    setPressSeq((seq) => seq + 1);
    setAnnounce(`Note ${index + 1} open: ${note.source.label}`);
  };

  const lower = () => {
    if (open === null) return;
    setOpen(null);
    setAnnounce("Notes closed");
    const opener = openerRef.current;
    openerRef.current = null;
    opener?.focus();
  };

  // Bring the open note into view. The list is already at full height while
  // the drawer is still rising, so the scroll can travel alongside the lift
  // rather than after it. Focus lands on the note so it is read at once.
  React.useEffect(() => {
    if (open === null) return;
    const list = listRef.current;
    const node = noteNodes.current.get(open);
    if (!list || !node) return;
    const target = Math.max(
      0,
      Math.min(node.offsetTop - 8, list.scrollHeight - list.clientHeight),
    );
    node.focus({ preventScroll: true });
    if (!motionSafe) {
      list.scrollTop = target;
      return;
    }
    const controls = animate(list.scrollTop, target, {
      ...springs.glide,
      onUpdate: (top) => {
        list.scrollTop = top;
      },
    });
    return () => controls.stop();
  }, [open, pressSeq, motionSafe]);

  const trapTab = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      lower();
      return;
    }
    if (event.key !== "Tab") return;
    const stops: HTMLElement[] = [];
    if (closeRef.current) stops.push(closeRef.current);
    notes.forEach((note) => {
      const node = noteNodes.current.get(note.id);
      if (node) stops.push(node);
    });
    if (stops.length === 0) return;
    event.preventDefault();
    const current = stops.indexOf(document.activeElement as HTMLElement);
    const last = stops.length - 1;
    const next =
      current === -1
        ? event.shiftKey
          ? last
          : 0
        : (current + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
    stops[next]?.focus({ preventScroll: true });
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={labelId}
      className={cn(
        "relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-2">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {notes.length} {notes.length === 1 ? "note" : "notes"}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3">
        {paragraphs.map((paragraph, paragraphIndex) => (
          <p
            key={paragraphIndex}
            className="text-sm leading-relaxed text-ink-2"
          >
            {paragraph.split(MARK).map((run, runIndex) => {
              const match = /^\[(\d+)\]$/.exec(run);
              const index = match ? Number(match[1]) - 1 : -1;
              const note = index >= 0 ? notes[index] : undefined;
              if (!note) {
                return <React.Fragment key={runIndex}>{run}</React.Fragment>;
              }
              const isOpen = open === note.id;
              return (
                <button
                  key={runIndex}
                  type="button"
                  aria-label={`Note ${index + 1}`}
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? drawerId : undefined}
                  onClick={(event) => raise(note, index, event.currentTarget)}
                  className={cn(
                    "relative -top-px mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-1 border px-1 align-baseline font-mono text-[10px] leading-none transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isOpen
                      ? "border-cobalt-bright/60 bg-cobalt-wash text-cobalt-bright"
                      : "border-hairline bg-surface-0 text-cobalt-bright hover:bg-cobalt-wash",
                  )}
                >
                  {index + 1}
                </button>
              );
            })}
          </p>
        ))}
      </div>

      <AnimatePresence>
        {openNote ? (
          <React.Fragment key="drawer">
            <motion.div
              aria-hidden
              onClick={lower}
              className="absolute inset-0 bg-background/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            />
            <motion.div
              id={drawerId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              onKeyDown={trapTab}
              className="absolute inset-x-0 bottom-0 flex max-h-[calc(100%-24px)] flex-col rounded-t-3 border-t border-hairline-strong bg-popover text-popover-foreground shadow-raised"
              initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={
                motionSafe
                  ? { y: "100%", transition: exitFor() }
                  : { opacity: 0, transition: exitFor(durations.fast) }
              }
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-3 py-2">
                <span id={titleId} className="text-sm font-semibold">
                  Notes
                </span>
                <button
                  ref={closeRef}
                  type="button"
                  aria-label="Close notes"
                  onClick={lower}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-foreground",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    className="size-3.5 shrink-0"
                  >
                    <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
                  </svg>
                </button>
              </div>

              <ol
                ref={listRef}
                className="relative min-h-0 overflow-y-auto py-1"
              >
                {notes.map((note, index) => {
                  const isCurrent = note.id === open;
                  return (
                    <li
                      key={note.id}
                      ref={(node) => {
                        if (node) noteNodes.current.set(note.id, node);
                        else noteNodes.current.delete(note.id);
                      }}
                      tabIndex={-1}
                      aria-current={isCurrent ? "true" : undefined}
                      className={cn(
                        "relative flex gap-2.5 px-3 py-2 outline-none",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      )}
                    >
                      {isCurrent ? (
                        <motion.span
                          key={`wash-${pressSeq}`}
                          aria-hidden
                          className="pointer-events-none absolute inset-0 bg-cobalt-wash"
                          initial={{ opacity: 1 }}
                          animate={{ opacity: 0 }}
                          transition={{
                            duration: durations.slow,
                            delay: durations.slow,
                            ease: easings.exit,
                          }}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative mt-0.5 flex h-4 min-w-4 shrink-0 items-center justify-center rounded-1 border px-1 font-mono text-[10px] leading-none",
                          isCurrent
                            ? "border-cobalt-bright/60 text-cobalt-bright"
                            : "border-hairline text-ink-3",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="relative flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs leading-snug text-foreground">
                          {note.text}
                        </span>
                        <span className="flex min-w-0 items-baseline gap-1.5 text-[11px]">
                          <span className="truncate font-medium text-ink-2">
                            {note.source.label}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-ink-3">
                            {note.source.domain}
                          </span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </motion.div>
          </React.Fragment>
        ) : null}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
