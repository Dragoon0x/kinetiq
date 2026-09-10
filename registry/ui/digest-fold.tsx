"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DigestMessage = {
  id: string;
  author: string;
  /** Printed beside the author and spoken in the row's sentence. */
  time: string;
  text: string;
};

export type DigestGroup = {
  id: string;
  /** The room, without its hash. */
  room: string;
  /** Oldest first. */
  messages: DigestMessage[];
};

export type DigestFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** What you missed, grouped by room. */
  groups: DigestGroup[];
  /** The time the digest starts from; printed and spoken. */
  since: string;
  /** Controlled fold state. */
  open?: boolean;
  /** Initial fold state for uncontrolled usage. @default false */
  defaultOpen?: boolean;
  /** Fires from the header press, Escape, or the disclosure key. */
  onOpenChange?: (open: boolean) => void;
  /** Fires with the pressed row and the room it came from. */
  onJump?: (message: DigestMessage, room: string) => void;
  /** The sentence the live region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** The card's heading. @default "While you were away" */
  title?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const MARK_INKS = [
  "text-cobalt-bright",
  "text-signal",
  "text-warn",
  "text-success",
] as const;

/**
 * A stable 32-bit hash, kept unsigned. `>>>` matters: a hash above 2^31 read
 * through `>>` is negative, and a negative bar height draws nothing at all.
 */
const hashOf = (text: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/** Every spoken line is built in one string, so no accessible name is spliced
 *  from two nodes, and a quoted line never gains a second full stop. */
const headerSentence = (
  title: string,
  messages: number,
  rooms: number,
  since: string,
  open: boolean,
): string =>
  `${title}, ${countPhrase(messages, "message")} in ${countPhrase(
    rooms,
    "room",
  )} since ${since}. ${open ? "Fold them away." : "Show them."}`;

const rowSentence = (
  message: DigestMessage,
  room: string,
  visited: boolean,
): string => {
  const said = message.text.trim();
  const quoted = /[.!?]$/.test(said) ? said : `${said}.`;
  return `${message.author}, ${message.time}, in #${room}. ${quoted} ${
    visited ? "Opened." : "Not opened."
  }`;
};

/** Keeps a callback out of effect dependencies so a re-render cannot re-speak. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** The author's mark: three bars whose heights and ink come from a hash of the
 *  name, so a digest needs no assets and every reader sees the same picture. */
function AuthorMark({ name }: { name: string }) {
  const hash = hashOf(name);
  const ink = MARK_INKS[(hash >>> 13) % MARK_INKS.length] ?? MARK_INKS[0];
  const bars = [0, 1, 2].map((slot) => 4 + ((hash >>> (slot * 5)) & 7));
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full border border-hairline bg-surface-0",
        ink,
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
        {bars.map((height, slot) => (
          <rect
            key={slot}
            x={3 + slot * 4}
            y={14 - height}
            width="2.4"
            height={height}
            rx="1.2"
            fill="currentColor"
          />
        ))}
      </svg>
    </span>
  );
}

/**
 * What you missed, folded into one line. Closed, the card is a summary — the
 * count, the rooms, the hour it starts from — beside a stack of procedural
 * author marks drawn from a hash of each name, with unsigned shifts throughout
 * so no bar is ever asked to be a negative height.
 *
 * Pressing the header unfolds the body against a height a ResizeObserver
 * measured from the content's own border box, joined on `glide`, the layout
 * spring, so the fold is exact at any width and no room is reserved for rows
 * that are not showing. The rows fade in on a tween with a `cascade()` delay so
 * the digest arrives in reading order rather than as one block, and the chevron
 * turns a quarter on `snap`. Pressing a row jumps to it: a tick draws beside it
 * on `flick`, the confirmation spring, and the row dims to opened. The header's
 * two readings share one grid cell and cross-fade, so the card's top never
 * changes height between them.
 *
 * The header is a real disclosure with `aria-expanded` and `aria-controls` and a
 * name that is one sentence; a folded body is inert and hidden from assistive
 * technology rather than merely clipped. Rows carry a roving tabindex — Down and
 * Up move, Home and End jump, Enter and Space jump to the message — and Escape
 * folds the card and returns focus to the header. Under reduced motion the
 * height swaps, nothing cascades and the tick appears rather than drawing.
 */
export function DigestFold({
  ref,
  groups,
  since,
  open,
  defaultOpen = false,
  onOpenChange,
  onJump,
  onAnnounce,
  title = "While you were away",
  className,
}: DigestFoldProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const bodyId = `${baseId}-body`;

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const isOpen = open ?? ownOpen;

  const [visited, setVisited] = React.useState<string[]>([]);
  const [active, setActive] = React.useState(0);
  const [beat, setBeat] = React.useState({ sentence: "", stamp: 0 });

  const headerRef = React.useRef<HTMLButtonElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);

  const rows = React.useMemo(
    () =>
      groups.flatMap((group) =>
        group.messages.map((message) => ({ group, message })),
      ),
    [groups],
  );
  const total = rows.length;
  const index = Math.min(active, Math.max(0, total - 1));
  /** Row id → its seat in the flattened order, so the roving tabindex never
   *  has to search the list once per row while rendering it. */
  const seats = React.useMemo(
    () => new Map(rows.map((row, at) => [row.message.id, at])),
    [rows],
  );
  const authors = React.useMemo(() => {
    const seen: string[] = [];
    for (const row of rows) {
      if (!seen.includes(row.message.author)) seen.push(row.message.author);
    }
    return seen;
  }, [rows]);

  const announceRef = useLatest(onAnnounce);
  React.useEffect(() => {
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const speak = (sentence: string) =>
    setBeat({ sentence, stamp: beat.stamp + 1 });

  const setOpen = (next: boolean) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    speak(
      next
        ? `${countPhrase(total, "message")} in ${countPhrase(
            groups.length,
            "room",
          )}, unfolded.`
        : "Folded away.",
    );
  };

  const foldToHeader = () => {
    setOpen(false);
    // The frame after the fold starts: the header is still mounted, so focus
    // lands on it rather than on the body being taken out of the order.
    requestAnimationFrame(() => headerRef.current?.focus());
  };

  const jump = (message: DigestMessage, room: string, at: number) => {
    setActive(at);
    if (!visited.includes(message.id)) setVisited([...visited, message.id]);
    onJump?.(message, room);
    speak(`Jumped to ${message.author} in #${room}.`);
  };

  const focusRow = (next: number) => {
    const clamped = Math.min(total - 1, Math.max(0, next));
    const row = rows[clamped];
    if (!row) return;
    setActive(clamped);
    document.getElementById(`${baseId}-row-${row.message.id}`)?.focus();
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    at: number,
  ) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(at + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(at - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(total - 1);
    }
  };

  // The body measures its own content, so the fold is exact at any column width
  // and nothing is read from a ref during render.
  const [content, setContent] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = useMotionValue<number | string>(
    (open ?? defaultOpen) ? "auto" : 0,
  );
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (content === null) return;
    const target = isOpen ? content : 0;
    // The first measurement is written outright, or the card would fold itself
    // on the frame it mounts.
    if (!seeded.current) {
      seeded.current = true;
      height.set(target);
      return;
    }
    const controls = animate(
      height,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [content, isOpen, height, motionSafe]);

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const stagger = cascade(total);
  const unopened = total - visited.length;

  return (
    <div
      ref={ref}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <button
        ref={headerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={bodyId}
        aria-label={headerSentence(title, total, groups.length, since, isOpen)}
        onClick={() => setOpen(!isOpen)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
          focusRing,
        )}
      >
        <span className="flex shrink-0 items-center">
          {authors.slice(0, 3).map((name, slot) => (
            <span key={name} className={cn(slot > 0 && "-ml-2")}>
              <AuthorMark name={name} />
            </span>
          ))}
        </span>

        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">
            {title}
          </span>
          {/* Both readings sit in one cell, so the card's top never changes
              height as the summary is replaced. */}
          <span className="grid">
            <motion.span
              aria-hidden
              className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink-3 tabular-nums"
              initial={false}
              animate={{ opacity: isOpen ? 0 : 1 }}
              transition={fade}
            >
              {countPhrase(total, "message")} in{" "}
              {countPhrase(groups.length, "room")} since {since}
            </motion.span>
            <motion.span
              aria-hidden
              className="col-start-1 row-start-1 truncate font-mono text-[11px] text-cobalt-bright tabular-nums"
              initial={false}
              animate={{ opacity: isOpen ? 1 : 0 }}
              transition={fade}
            >
              Oldest first, from {since} · {unopened} left
            </motion.span>
          </span>
        </span>

        <motion.span
          aria-hidden
          className="shrink-0 text-ink-3"
          initial={false}
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
          style={{ originX: 0.5, originY: 0.5 }}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m6.5 3.5 5 4.5-5 4.5" />
          </svg>
        </motion.span>
      </button>

      <motion.div
        id={bodyId}
        style={{ height }}
        aria-hidden={!isOpen}
        // `inert` as well as `aria-hidden`: a folded row must be out of reach
        // of the pointer and of programmatic focus, not merely clipped.
        inert={!isOpen}
        // `overflow-clip` rather than `hidden`: a hidden overflow is still a
        // scroll container, and a folded body must not become one.
        className="overflow-clip [contain:paint]"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          foldToHeader();
        }}
      >
        <div ref={innerRef} className="px-1.5 pb-1.5">
          <ol role="list" className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.id}>
                <p className="px-1.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  #{group.room} ·{" "}
                  {countPhrase(group.messages.length, "message")}
                </p>
                <ol role="list" className="flex flex-col gap-0.5">
                  {group.messages.map((message) => {
                    const at = seats.get(message.id) ?? 0;
                    const seen = visited.includes(message.id);
                    return (
                      <motion.li
                        key={message.id}
                        initial={false}
                        animate={{ opacity: isOpen ? 1 : 0 }}
                        transition={{
                          ...fade,
                          delay: isOpen && motionSafe ? at * stagger : 0,
                        }}
                      >
                        <button
                          type="button"
                          id={`${baseId}-row-${message.id}`}
                          tabIndex={isOpen && at === index ? 0 : -1}
                          aria-label={rowSentence(message, group.room, seen)}
                          onClick={() => jump(message, group.room, at)}
                          onFocus={() => setActive(at)}
                          onKeyDown={(event) => onRowKeyDown(event, at)}
                          className={cn(
                            "flex w-full flex-col gap-0.5 rounded-2 px-1.5 py-1.5 text-left transition-colors hover:bg-accent",
                            focusRing,
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                "min-w-0 truncate text-xs font-medium transition-colors",
                                seen ? "text-ink-3" : "text-foreground",
                              )}
                            >
                              {message.author}
                            </span>
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                              {message.time}
                            </span>
                            <svg
                              viewBox="0 0 16 16"
                              aria-hidden
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-3.5 shrink-0 text-success"
                            >
                              {/* One path whose length runs 0 → 1, so no `d` is
                                  ever interpolated. */}
                              <motion.path
                                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                                initial={false}
                                animate={{
                                  pathLength: seen ? 1 : 0,
                                  opacity: seen ? 1 : 0,
                                }}
                                transition={
                                  motionSafe
                                    ? { ...springs.flick, opacity: fade }
                                    : { duration: 0 }
                                }
                              />
                            </svg>
                          </span>
                          <span
                            className={cn(
                              "line-clamp-2 text-xs leading-snug transition-colors",
                              seen ? "text-ink-3" : "text-ink",
                            )}
                          >
                            {message.text}
                          </span>
                        </button>
                      </motion.li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      </motion.div>

      <p role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </p>
    </div>
  );
}
