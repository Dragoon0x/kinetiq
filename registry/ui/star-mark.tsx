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

export type StarMessage = {
  id: string;
  author: string;
  text: string;
  /** Sent time, already formatted. */
  time: string;
};

export type StarMarkProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: StarMessage[];
  /** Controlled: saved ids, most recently saved first. */
  value?: string[];
  /** Initial saved ids for uncontrolled usage. @default [] */
  defaultValue?: string[];
  onValueChange?: (ids: string[]) => void;
  /** Fires with the message that changed and its new state. */
  onSaveChange?: (id: string, saved: boolean) => void;
  /** Fires when a saved row sends focus back to its message. */
  onJump?: (id: string) => void;
  /** Names the saved list and heads it. @default "Saved" */
  savedLabel?: string;
  /** What the saved panel reads at zero. @default "Nothing saved yet" */
  emptyLabel?: string;
  /** Names the thread list. @default "Thread" */
  label?: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** A five-point star, its points solved once and rounded to three decimals:
 *  a raw trigonometric coordinate differs between Node and the browser in its
 *  last digits, and a mismatched `d` is a hydration error. */
const STAR =
  "M8 1.4L9.734 5.613L14.277 5.96L10.806 8.912L11.879 13.34L8 10.95L4.121 13.34L5.194 8.912L1.723 5.96L6.266 5.613Z";

const firstWords = (text: string, words = 6): string => {
  const parts = text.trim().split(/\s+/);
  return parts.length > words
    ? `${parts.slice(0, words).join(" ")}…`
    : text.trim();
};

type Beat = { signature: string; ids: string[]; message: string };

const describe = (
  previous: string[],
  next: string[],
  messages: StarMessage[],
): string => {
  const nameOf = (id: string) =>
    messages.find((message) => message.id === id)?.author ?? "the message";
  const added = next.find((id) => !previous.includes(id));
  const removed = previous.find((id) => !next.includes(id));
  const count = `${next.length} saved.`;
  if (added) return `Saved ${nameOf(added)}'s message. ${count}`;
  if (removed) return `Removed ${nameOf(removed)}'s message. ${count}`;
  return "";
};

/**
 * Saved for later. Pressing a message's star fills it: a solid star grows out
 * of the outline on `recoil`, two visible bounces, the one thing in here that
 * celebrates. The bubble takes a folded corner at the same instant, scaling
 * from its own corner on `flick` so the mark stamps rather than bounces, and
 * the saved list gains the message, sliding in from `distances.shift` on
 * `glide` with the newest save at the top. Unsaving reverses all three on the
 * exit ease, because nothing celebrates a removal.
 *
 * The saved panel's height is measured by a ResizeObserver bound to its
 * content when that content arrives, so the panel is only ever as tall as what
 * it holds. Every star is an `aria-pressed` button named for its message,
 * every saved row carries a jump that moves focus back to the thread, and
 * saved state never rests on colour alone. Under reduced motion the star fills
 * in colour, the corner mark appears without a stamp and the row cross-fades
 * in — the record still updates, only the travel is dropped.
 */
export function StarMark({
  ref,
  messages,
  value,
  defaultValue,
  onValueChange,
  onSaveChange,
  onJump,
  savedLabel = "Saved",
  emptyLabel = "Nothing saved yet",
  label = "Thread",
  className,
}: StarMarkProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState<string[]>(
    () => defaultValue ?? [],
  );
  const saved = value ?? uncontrolled;
  const savedRows = saved
    .map((id) => messages.find((message) => message.id === id))
    .filter((message): message is StarMessage => message !== undefined);

  const [jumped, setJumped] = React.useState<string | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());

  const [panelHeight, setPanelHeight] = React.useState<number | null>(null);
  const observer = React.useRef<ResizeObserver | null>(null);
  const measurePanel = React.useCallback((node: HTMLDivElement | null) => {
    // Bound to the node as it arrives rather than in a mount-only effect: the
    // panel's content is not there to measure until the list has something.
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const next = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setPanelHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    next.observe(node);
    observer.current = next;
  }, []);
  React.useEffect(() => () => observer.current?.disconnect(), []);

  // Frozen at the change — from these stars or from the host — so a later
  // rewrite of the set cannot make the region repeat a save already spoken.
  const signature = saved.join(",");
  const [beat, setBeat] = React.useState<Beat>(() => ({
    signature,
    ids: saved,
    message: "",
  }));
  if (beat.signature !== signature) {
    setBeat({
      signature,
      ids: saved,
      message: describe(beat.ids, saved, messages),
    });
  }

  const toggle = (message: StarMessage) => {
    const isSaved = saved.includes(message.id);
    const next = isSaved
      ? saved.filter((id) => id !== message.id)
      : [message.id, ...saved];
    if (value === undefined) setUncontrolled(next);
    onValueChange?.(next);
    onSaveChange?.(message.id, !isSaved);
  };

  const jump = (message: StarMessage) => {
    setJumped(message.id);
    rowNodes.current.get(message.id)?.focus();
    onJump?.(message.id);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol role="list" aria-label={label} className="flex flex-col gap-3">
        {messages.map((message) => {
          const isSaved = saved.includes(message.id);
          return (
            <li
              key={message.id}
              id={`${baseId}-row-${message.id}`}
              ref={(node) => {
                if (node) rowNodes.current.set(message.id, node);
                else rowNodes.current.delete(message.id);
              }}
              tabIndex={-1}
              aria-current={jumped === message.id ? "true" : undefined}
              className="flex flex-col rounded-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[11px] font-medium text-ink-2">
                  {message.author}
                </span>
                <span className="text-[11px] text-ink-3 tabular-nums">
                  {message.time}
                </span>
                <span className="flex-1" />
                <button
                  type="button"
                  aria-pressed={isSaved}
                  onClick={() => toggle(message)}
                  aria-label={
                    isSaved
                      ? `Remove ${message.author}'s message, sent ${message.time}, from saved`
                      : `Save ${message.author}'s message, sent ${message.time}`
                  }
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    isSaved ? "text-warn" : "text-ink-3",
                  )}
                >
                  <span className="grid size-4 place-items-center">
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      className="col-start-1 row-start-1 size-4"
                    >
                      <path
                        d={STAR}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <AnimatePresence initial={false}>
                      {isSaved ? (
                        // The fill scales as a wrapper rather than as the SVG
                        // itself, so the growth never argues with motion's
                        // transform-origin rewrite for SVG nodes.
                        <motion.span
                          key="fill"
                          aria-hidden
                          className="col-start-1 row-start-1 origin-center"
                          initial={
                            motionSafe
                              ? { scale: 0.35, opacity: 0 }
                              : { opacity: 0 }
                          }
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{
                            opacity: 0,
                            ...(motionSafe ? { scale: 0.6 } : {}),
                            transition: exitFor(durations.fast),
                          }}
                          transition={motionSafe ? springs.recoil : FADE}
                        >
                          <svg viewBox="0 0 16 16" className="size-4">
                            <path d={STAR} fill="currentColor" />
                          </svg>
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </span>
                </button>
              </div>

              <div
                className={cn(
                  "relative mt-1 max-w-[92%] overflow-hidden rounded-3 rounded-bl-1 px-3 py-2 text-sm leading-snug wrap-break-word transition-colors",
                  isSaved
                    ? "bg-surface-2 text-foreground ring-1 ring-warn"
                    : "bg-surface-2 text-foreground",
                )}
              >
                {message.text}
                <AnimatePresence initial={false}>
                  {isSaved ? (
                    <motion.span
                      key="corner"
                      aria-hidden
                      // Clipped by the bubble's own rounded corner, so the mark
                      // reads as a fold rather than a sticker.
                      className="absolute top-0 right-0 origin-top-right text-warn"
                      initial={motionSafe ? { scale: 0 } : { opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{
                        opacity: 0,
                        ...(motionSafe ? { scale: 0.4 } : {}),
                        transition: exitFor(durations.fast),
                      }}
                      transition={motionSafe ? springs.flick : FADE}
                    >
                      <svg viewBox="0 0 16 16" className="size-4">
                        <path d="M16 0V16L0 0Z" fill="currentColor" />
                      </svg>
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </div>
            </li>
          );
        })}
      </ol>

      <motion.div
        initial={false}
        animate={{ height: panelHeight ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className="w-full overflow-hidden"
      >
        <div ref={measurePanel}>
          <section
            aria-label={savedLabel}
            className="rounded-3 border border-hairline bg-surface-1 p-1.5"
          >
            <h3 className="flex items-center gap-1.5 px-1.5 pb-1 text-[10px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
              <svg viewBox="0 0 16 16" aria-hidden className="size-3 text-warn">
                <path d={STAR} fill="currentColor" />
              </svg>
              {savedLabel}
              <span className="tabular-nums">{savedRows.length}</span>
            </h3>

            {/* One list, always mounted, holding the rows and the empty line
                as siblings: popLayout takes the leaving row out of flow so the
                panel does not grow by a row before it shrinks. */}
            <ul role="list" className="relative flex flex-col gap-0.5">
              <AnimatePresence initial={false} mode="popLayout">
                {savedRows.length === 0 ? (
                  <motion.li
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={FADE}
                    className="flex h-8 items-center px-1.5 text-[11px] text-ink-3"
                  >
                    {emptyLabel}
                  </motion.li>
                ) : null}
                {savedRows.map((message) => (
                  <motion.li
                    key={message.id}
                    layout={motionSafe}
                    initial={
                      motionSafe
                        ? { opacity: 0, x: distances.shift }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, x: 0 }}
                    exit={
                      motionSafe
                        ? {
                            opacity: 0,
                            x: distances.shift,
                            transition: exitFor(durations.base),
                          }
                        : { opacity: 0, transition: exitFor(durations.fast) }
                    }
                    transition={motionSafe ? springs.glide : FADE}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      onClick={() => jump(message)}
                      title={message.text}
                      aria-label={`Go to ${message.author}'s message, sent ${message.time}`}
                      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-2 px-2 text-left transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="shrink-0 text-[11px] font-medium text-ink-2">
                        {message.author}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
                        {firstWords(message.text)}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
                        {message.time}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(message)}
                      aria-label={`Remove ${message.author}'s message, sent ${message.time}, from saved`}
                      className="grid size-8 shrink-0 place-items-center rounded-2 text-warn transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <svg viewBox="0 0 16 16" aria-hidden className="size-4">
                        <path d={STAR} fill="currentColor" />
                      </svg>
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        </div>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {beat.message}
      </span>
    </div>
  );
}
