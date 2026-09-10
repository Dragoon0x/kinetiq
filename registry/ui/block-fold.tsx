"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BlockMember = { id: string; name: string };

export type BlockMessage = {
  id: string;
  authorId: string;
  /** Sent time, already formatted by the host. */
  time: string;
  text: string;
};

export type BlockFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The roster, in the order given. */
  members: BlockMember[];
  /** The thread, oldest first. */
  messages: BlockMessage[];
  /** Controlled blocked member ids. */
  blocked?: string[];
  /** Initial blocked ids for uncontrolled usage. @default [] */
  defaultBlocked?: string[];
  /** Fires with the next set from either switch direction. */
  onBlockedChange?: (ids: string[]) => void;
  /** Fires when a member is blocked. */
  onBlock?: (id: string) => void;
  /** Fires when a member is unblocked. */
  onUnblock?: (id: string) => void;
  /** Fires when a folded run is peeked open or folded back. */
  onPeekChange?: (runId: string, open: boolean) => void;
  /** Tallest the thread grows before it scrolls inside its own box. @default 280 */
  maxHeight?: number;
  /** The word the folded line counts. @default "message" */
  foldedNoun?: string;
  /** Names the thread for assistive technology. */
  label: string;
  /** Names the roster. @default "Room members" */
  rosterLabel?: string;
  className?: string;
};

const NONE: string[] = [];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const FADE = { duration: durations.fast, ease: easings.enter } as const;

type Run = {
  id: string;
  authorId: string;
  name: string;
  messages: BlockMessage[];
};

/**
 * One observer, one target. The run's box holds both faces — the folded line
 * and the messages — and whichever is out of flow is absolutely positioned, so
 * the measured content height is already the answer in all three states and
 * nothing is read during render. The first measurement is written outright, or
 * every run would fold itself on the frame it mounts.
 */
function useMeasuredHeight<T extends HTMLElement>(motionSafe: boolean) {
  const ref = React.useRef<T | null>(null);
  const [content, setContent] = React.useState<number | null>(null);
  const height = useMotionValue<number | string>("auto");
  const seeded = React.useRef(false);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      setContent((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (content === null) return;
    if (!seeded.current) {
      seeded.current = true;
      height.set(content);
      return;
    }
    const controls = animate(
      height,
      content,
      motionSafe ? springs.glide : { duration: durations.fast },
    );
    return () => controls.stop();
  }, [content, height, motionSafe]);

  return [ref, height] as const;
}

/** Every spoken line is built in one string, pluralised, and never assembled
 *  from two text nodes the name algorithm would join with a stray space. */
const countPhrase = (count: number, noun: string): string =>
  count === 1 ? `1 ${noun}` : `${count} ${noun}s`;

const foldSentence = (
  count: number,
  noun: string,
  name: string,
  peeked: boolean,
): string => {
  const subject = `${countPhrase(count, noun)} from ${name}`;
  const verb = count === 1 ? "is" : "are";
  const them = count === 1 ? "it" : "them";
  return peeked
    ? `${subject} ${verb} showing. Fold ${them} away.`
    : `${subject} ${verb} folded. Show ${them}.`;
};

function FoldGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d="M2.75 4.25h10.5 M4.75 7.75h6.5 M6.75 11.25h2.5" />
    </svg>
  );
}

type RunBlockProps = {
  run: Run;
  folded: boolean;
  peeked: boolean;
  noun: string;
  motionSafe: boolean;
  onPeek: (run: Run) => void;
};

/** One run of consecutive messages and the single line it folds into. */
function RunBlock({
  run,
  folded,
  peeked,
  noun,
  motionSafe,
  onPeek,
}: RunBlockProps) {
  const [contentRef, height] = useMeasuredHeight<HTMLDivElement>(motionSafe);
  const showLine = folded;
  const showMessages = !folded || peeked;
  const count = run.messages.length;

  return (
    <motion.div style={{ height }} className="overflow-hidden">
      <div ref={contentRef} className="relative flex flex-col gap-1.5">
        <motion.div
          aria-hidden={!showLine}
          animate={{ opacity: showLine ? 1 : 0 }}
          transition={showLine ? FADE : exitFor(durations.fast)}
          className={cn(
            !showLine && "pointer-events-none absolute inset-x-0 top-0",
          )}
        >
          <button
            type="button"
            tabIndex={showLine ? 0 : -1}
            aria-expanded={peeked}
            aria-label={foldSentence(count, noun, run.name, peeked)}
            onClick={() => onPeek(run)}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-2 border border-dashed border-hairline-strong bg-surface-2 px-2.5 text-left transition-colors hover:bg-accent",
              focusRing,
            )}
          >
            <FoldGlyph />
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-3">
              {run.name}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
              {peeked ? "showing" : countPhrase(count, noun)}
            </span>
          </button>
        </motion.div>

        <motion.ol
          role="list"
          aria-hidden={!showMessages}
          animate={{ opacity: showMessages ? 1 : 0 }}
          transition={showMessages ? FADE : exitFor(durations.fast)}
          className={cn(
            "flex flex-col gap-1.5",
            !showMessages && "pointer-events-none absolute inset-x-0 top-0",
          )}
        >
          {run.messages.map((message) => (
            <li key={message.id} className="flex flex-col gap-1">
              <span className="sr-only">{`${run.name}, ${message.time}.`}</span>
              <span
                aria-hidden
                className="flex items-center gap-1.5 px-1 text-ink-3"
              >
                <span className="text-[11px] font-medium text-ink-2">
                  {run.name}
                </span>
                <span className="text-[11px] tabular-nums">{message.time}</span>
              </span>
              <span className="max-w-[92%] rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2 text-sm leading-snug wrap-break-word text-foreground">
                {message.text}
              </span>
            </li>
          ))}
        </motion.ol>
      </div>
    </motion.div>
  );
}

/**
 * Blocking someone should not tear a hole in the thread; it should fold it.
 * Each member carries a `switch` in the roster, and blocking folds every run of
 * that member's consecutive messages into a single line. The fold is measured,
 * not guessed: one ResizeObserver watches the run's content, whichever face is
 * out of flow sits absolutely on top of the other, and the box glides between
 * the two heights on `glide` with `overflow-hidden`, so the thread closes at the
 * speed of a layout shift rather than snapping shut. The messages leave on the
 * exit ease as the box closes, because leaving never springs, and the folded
 * line arrives on the enter ease in their place.
 *
 * The folded line is itself a button: pressing it peeks that one run open
 * without unblocking anyone — the line stays above the messages, so the way back
 * is where you left it — and unblocking unfolds every run of that member at once
 * and drops the peeks. The thread is an `<ol role="list">` of `<li>` whose rows
 * name their own author and time, folded messages are `aria-hidden` while the
 * eye cannot see them, and a polite region speaks one frozen, pluralised
 * sentence per change. Under reduced motion the heights swap on a fast tween and
 * nothing travels; the counts still change, because what is hidden is
 * information.
 */
export function BlockFold({
  ref,
  members,
  messages,
  blocked,
  defaultBlocked = NONE,
  onBlockedChange,
  onBlock,
  onUnblock,
  onPeekChange,
  maxHeight = 280,
  foldedNoun = "message",
  label,
  rosterLabel = "Room members",
  className,
}: BlockFoldProps) {
  const motionSafe = useMotionSafe();
  const [ownBlocked, setOwnBlocked] = React.useState<string[]>(defaultBlocked);
  const shut = blocked ?? ownBlocked;
  const [peeks, setPeeks] = React.useState<string[]>(NONE);
  const [said, setSaid] = React.useState("");

  const runs = React.useMemo(() => {
    const named = new Map(members.map((member) => [member.id, member.name]));
    const out: Run[] = [];
    for (const message of messages) {
      const last = out[out.length - 1];
      if (last && last.authorId === message.authorId) {
        last.messages.push(message);
        continue;
      }
      out.push({
        id: `${message.authorId}::${message.id}`,
        authorId: message.authorId,
        name: named.get(message.authorId) ?? message.authorId,
        messages: [message],
      });
    }
    return out;
  }, [members, messages]);

  // A host that drives `blocked` itself still gets a clean fold: peeks that no
  // longer belong to a blocked member are dropped during render, keyed by the
  // set's contents so an inline array cannot spin the adjustment.
  const shutKey = shut.join("\u0000");
  const [lastShutKey, setLastShutKey] = React.useState(shutKey);
  if (lastShutKey !== shutKey) {
    setLastShutKey(shutKey);
    const alive = peeks.filter((id) =>
      shut.some((memberId) => id.startsWith(`${memberId}::`)),
    );
    if (alive.length !== peeks.length) setPeeks(alive);
  }

  const countFor = (memberId: string) =>
    messages.filter((message) => message.authorId === memberId).length;

  const toggleBlock = (member: BlockMember) => {
    const blocking = !shut.includes(member.id);
    const next = blocking
      ? [...shut, member.id]
      : shut.filter((id) => id !== member.id);
    if (blocked === undefined) setOwnBlocked(next);
    onBlockedChange?.(next);

    const count = countFor(member.id);
    const tail = count === 1 ? "message is" : "messages are";
    if (blocking) {
      setSaid(`${member.name} is blocked. ${count} ${tail} folded.`);
      onBlock?.(member.id);
      return;
    }
    // A run nobody can see any more has nothing to peek at. The dropped ids
    // are read before the updater and reported after it, so no parent callback
    // ever runs inside a state update.
    const dropped = peeks.filter((id) => id.startsWith(`${member.id}::`));
    setPeeks((prev) => prev.filter((id) => !id.startsWith(`${member.id}::`)));
    setSaid(`${member.name} is unblocked. ${count} ${tail} back.`);
    onUnblock?.(member.id);
    for (const id of dropped) onPeekChange?.(id, false);
  };

  const togglePeek = (run: Run) => {
    const open = !peeks.includes(run.id);
    setPeeks((prev) =>
      open ? [...prev, run.id] : prev.filter((id) => id !== run.id),
    );
    setSaid(foldSentence(run.messages.length, foldedNoun, run.name, open));
    onPeekChange?.(run.id, open);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div
        role="group"
        aria-label={rosterLabel}
        className="flex flex-wrap gap-1.5"
      >
        {members.map((member) => {
          const off = shut.includes(member.id);
          return (
            <button
              key={member.id}
              type="button"
              role="switch"
              aria-checked={off}
              aria-label={
                off ? `Unblock ${member.name}.` : `Block ${member.name}.`
              }
              onClick={() => toggleBlock(member)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
                off
                  ? "border-danger/40 bg-danger/12 text-danger"
                  : "border-hairline-strong text-ink-2 hover:bg-accent hover:text-accent-foreground",
                focusRing,
              )}
            >
              <motion.span
                aria-hidden
                // The dot is the switch's own state: it snaps to the smaller
                // ring when the member is shut out, one crisp overshoot.
                animate={{ scale: off ? 0.6 : 1 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  off ? "bg-danger" : "bg-cobalt-bright",
                )}
              />
              <span className={cn("truncate", off && "line-through")}>
                {member.name}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        style={{ maxHeight: Math.round(maxHeight) }}
        className={cn(
          "overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 p-3",
          focusRing,
        )}
      >
        <ol role="list" className="flex flex-col gap-3">
          {runs.map((run) => (
            <motion.li
              key={run.id}
              layout={motionSafe ? "position" : false}
              transition={motionSafe ? springs.glide : FADE}
            >
              <RunBlock
                run={run}
                folded={shut.includes(run.authorId)}
                peeked={peeks.includes(run.id)}
                noun={foldedNoun}
                motionSafe={motionSafe}
                onPeek={togglePeek}
              />
            </motion.li>
          ))}
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
