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

export type Mention = {
  id: string;
  /** Who named you. */
  author: string;
  /** The room, without its hash. */
  room: string;
  /** Printed beside the room and spoken in the row's sentence. */
  time: string;
  /** The line you were named in; the handle inside it is marked. */
  text: string;
};

export type MentionListProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Newest first. */
  mentions: Mention[];
  /** The token marked inside each line. @default "@you" */
  handle?: string;
  /** Controlled open row. */
  openId?: string | null;
  /** Initial open row for uncontrolled usage. @default null */
  defaultOpenId?: string | null;
  /** Fires from the press or key that opened a row. */
  onOpenChange?: (id: string | null) => void;
  /** Fires with the whole mention, so the host can jump its thread. */
  onOpen?: (mention: Mention) => void;
  /** Controlled read set. */
  readIds?: string[];
  /** Initial read set for uncontrolled usage. @default [] */
  defaultReadIds?: string[];
  /** Fires from an open, or from the header action. */
  onReadIdsChange?: (ids: string[]) => void;
  /** The sentence the live region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** Heads the card and names the list. @default "Mentions" */
  label?: string;
  /** Copy for the header action. @default "Mark all read" */
  markAllLabel?: string;
  /** Scroll ceiling for the list, in px. @default 280 */
  maxHeight?: number;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** One string per reading, so the name algorithm never splices two nodes — and
 *  a line that already ends in a full stop never gains a second one. */
const rowSentence = (mention: Mention, read: boolean): string => {
  const said = mention.text.trim();
  const quoted = /[.!?]$/.test(said) ? said : `${said}.`;
  return `${mention.author} named you in #${mention.room}, ${mention.time}. ${quoted} ${
    read ? "Read." : "New."
  }`;
};

const countSentence = (count: number): string =>
  count === 0
    ? "Every mention is read."
    : count === 1
      ? "1 mention is new."
      : `${count} mentions are new.`;

/** Keeps a callback out of effect dependencies so a re-render cannot re-speak. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Splits a line around the handle so the token can be set as a chip. The
 *  spoken sentence comes from `aria-label`, so splitting text nodes here can
 *  never put a stray space inside the row's name. */
function markHandle(text: string, handle: string): React.ReactNode[] {
  const parts = text.split(handle);
  const nodes: React.ReactNode[] = [];
  parts.forEach((part, index) => {
    if (part) nodes.push(<span key={`t${index}`}>{part}</span>);
    if (index < parts.length - 1) {
      nodes.push(
        <span
          key={`h${index}`}
          className="rounded-1 bg-cobalt-wash px-1 font-medium text-cobalt-bright"
        >
          {handle}
        </span>,
      );
    }
  });
  return nodes;
}

/**
 * The inbox of every place your name came up. Each mention is a row carrying the
 * room, who said it, when, and the line itself with your handle set as a chip
 * inside the sentence — a mention without its context is only a notification.
 * Rows arrive from `distances.step` on `snap` in a `cascade()`, so a batch reads
 * as a list filling rather than a block appearing, and `layout` on `glide`
 * carries the rows already there down to make room for one that lands on top.
 *
 * Opening a row jumps to it: the row's own wash flares and drains over
 * `durations.page` on the exit ease, so the eye is told where it landed and the
 * glow then gets out of the way. The same press marks it read, which dims the
 * ink on a colour tween and takes the unread dot away on the exit ease, because
 * leaving never springs. The header's two readings share one grid cell and
 * cross-fade, so a fast run of presses cannot leave a stale count behind and no
 * height is reserved for either.
 *
 * The list is an `<ol role="list">` of `<li>` whose rows are real buttons named
 * as one sentence including their state in words; a roving tabindex moves with
 * Down and Up, Home and End jump, and Enter or Space opens. A polite region
 * speaks one frozen sentence per change. Under reduced motion nothing travels or
 * staggers and the glow still flares, briefly, because it is the answer to where
 * you just landed.
 */
export function MentionList({
  ref,
  mentions,
  handle = "@you",
  openId,
  defaultOpenId = null,
  onOpenChange,
  onOpen,
  readIds,
  defaultReadIds,
  onReadIdsChange,
  onAnnounce,
  label = "Mentions",
  markAllLabel = "Mark all read",
  maxHeight = 280,
  className,
}: MentionListProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const headingId = `${baseId}-heading`;

  const [ownOpen, setOwnOpen] = React.useState<string | null>(defaultOpenId);
  const current = openId !== undefined ? openId : ownOpen;

  const [ownRead, setOwnRead] = React.useState<string[]>(defaultReadIds ?? []);
  const readList = readIds ?? ownRead;
  const readSet = React.useMemo(() => new Set(readList), [readList]);

  const [glow, setGlow] = React.useState({ id: "", stamp: 0 });
  const [active, setActive] = React.useState(0);
  const index = Math.min(active, Math.max(0, mentions.length - 1));

  const unread = mentions.reduce(
    (total, mention) => total + (readSet.has(mention.id) ? 0 : 1),
    0,
  );

  // The sentence is frozen at the moment of the change and spoken once, so a
  // later re-render can never re-announce an arrival that has been seen.
  const signature = mentions.map((mention) => mention.id).join("|");
  const [beat, setBeat] = React.useState(() => ({
    signature,
    count: mentions.length,
    sentence: "",
    stamp: 0,
  }));
  if (beat.signature !== signature) {
    const arrival = mentions.length > beat.count ? mentions[0] : undefined;
    setBeat({
      signature,
      count: mentions.length,
      sentence: arrival
        ? `${arrival.author} named you in #${arrival.room}. ${countSentence(unread)}`
        : "",
      stamp: beat.stamp + 1,
    });
  }

  const announceRef = useLatest(onAnnounce);
  React.useEffect(() => {
    if (beat.sentence) announceRef.current?.(beat.sentence);
  }, [beat.stamp, beat.sentence, announceRef]);

  const speak = (sentence: string) => {
    setBeat({
      signature,
      count: mentions.length,
      sentence,
      stamp: beat.stamp + 1,
    });
  };

  const markRead = (ids: string[]) => {
    if (readIds === undefined) setOwnRead(ids);
    onReadIdsChange?.(ids);
  };

  const open = (mention: Mention, at: number) => {
    setActive(at);
    if (openId === undefined) setOwnOpen(mention.id);
    onOpenChange?.(mention.id);
    onOpen?.(mention);
    if (!readSet.has(mention.id)) markRead([...readList, mention.id]);
    setGlow({ id: mention.id, stamp: glow.stamp + 1 });
    speak(`Opened ${mention.author}'s mention in #${mention.room}.`);
  };

  const markAll = () => {
    if (unread === 0) return;
    markRead(mentions.map((mention) => mention.id));
    speak(countSentence(0));
  };

  const focusRow = (next: number) => {
    const clamped = Math.min(mentions.length - 1, Math.max(0, next));
    const mention = mentions[clamped];
    if (!mention) return;
    setActive(clamped);
    document.getElementById(`${baseId}-row-${mention.id}`)?.focus();
  };

  const onKeyDown = (
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
      focusRow(mentions.length - 1);
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const stagger = cascade(mentions.length);

  return (
    <section
      ref={ref}
      aria-labelledby={headingId}
      className={cn(
        "w-full rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-hairline px-3 py-2">
        <h3 id={headingId} className="text-sm font-semibold text-foreground">
          {label}
        </h3>
        {/* Both readings sit in one cell, so the header never changes height
            and a fast run of presses cannot leave a stale count showing. */}
        <span className="grid">
          <motion.span
            aria-hidden
            className="col-start-1 row-start-1 rounded-full bg-cobalt-wash px-1.5 py-0.5 font-mono text-[10px] font-medium text-cobalt-bright tabular-nums"
            initial={false}
            animate={{ opacity: unread > 0 ? 1 : 0 }}
            transition={fade}
          >
            {unread > 0 ? `${unread} new` : "0 new"}
          </motion.span>
          <motion.span
            aria-hidden
            className="col-start-1 row-start-1 px-1.5 py-0.5 font-mono text-[10px] text-ink-3"
            initial={false}
            animate={{ opacity: unread === 0 ? 1 : 0 }}
            transition={fade}
          >
            All read
          </motion.span>
        </span>
        <button
          type="button"
          aria-disabled={unread === 0}
          aria-label={
            unread === 0
              ? "Every mention is read."
              : `Mark ${unread === 1 ? "1 mention" : `${unread} mentions`} as read.`
          }
          onClick={markAll}
          className={cn(
            "ml-auto flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors hover:bg-accent",
            unread === 0 && "text-ink-3 hover:bg-transparent",
            focusRing,
          )}
        >
          {markAllLabel}
        </button>
      </div>

      <ol
        role="list"
        aria-label={label}
        style={{ maxHeight: Math.round(maxHeight) }}
        className="flex flex-col gap-1 overflow-y-auto overscroll-contain p-1.5"
      >
        <AnimatePresence>
          {mentions.map((mention, at) => {
            const read = readSet.has(mention.id);
            const isOpen = mention.id === current;
            return (
              <motion.li
                key={mention.id}
                layout={motionSafe ? "position" : false}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, delay: at * stagger, opacity: fade }
                    : fade
                }
              >
                <button
                  type="button"
                  id={`${baseId}-row-${mention.id}`}
                  tabIndex={at === index ? 0 : -1}
                  aria-current={isOpen ? true : undefined}
                  aria-label={rowSentence(mention, read)}
                  onClick={() => open(mention, at)}
                  onFocus={() => setActive(at)}
                  onKeyDown={(event) => onKeyDown(event, at)}
                  className={cn(
                    "relative flex w-full flex-col gap-1 rounded-2 px-2.5 py-2 text-left transition-colors hover:bg-accent",
                    isOpen && "bg-cobalt-wash/60",
                    focusRing,
                  )}
                >
                  {/* The flare sits under the content rather than over it, so
                      the line stays fully legible while it drains. */}
                  {isOpen && (
                    <motion.span
                      key={glow.stamp}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-bright"
                      initial={{ opacity: glow.id === mention.id ? 0.28 : 0 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: motionSafe ? durations.page : durations.fast,
                        ease: easings.exit,
                      }}
                    />
                  )}

                  <span className="relative flex items-center gap-1.5">
                    <AnimatePresence initial={false}>
                      {!read && (
                        <motion.span
                          key="dot"
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{
                            opacity: 0,
                            scale: motionSafe ? 0.4 : 1,
                            transition: exitFor(durations.fast),
                          }}
                          transition={fade}
                        />
                      )}
                    </AnimatePresence>
                    <span
                      className={cn(
                        "min-w-0 truncate text-xs font-medium transition-colors",
                        read ? "text-ink-3" : "text-cobalt-bright",
                      )}
                    >
                      #{mention.room}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                      {mention.time}
                    </span>
                  </span>

                  <span
                    aria-hidden
                    className={cn(
                      "relative line-clamp-2 text-xs leading-snug transition-colors",
                      read ? "text-ink-3" : "text-ink",
                    )}
                  >
                    <span
                      className={cn(
                        "font-medium",
                        read ? "text-ink-3" : "text-foreground",
                      )}
                    >
                      {mention.author}
                    </span>
                    {": "}
                    {markHandle(mention.text, handle)}
                  </span>
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      {mentions.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-ink-3">
          Nothing yet. Nobody has named you.
        </p>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {beat.sentence}
      </p>
    </section>
  );
}
