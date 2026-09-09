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

export type ThreadReply = {
  id: string;
  /** "me" reads as "You"; anything else is the sender's name. */
  from: string;
  text: string;
  /** Already formatted — nothing here reads a clock. */
  time?: string;
};

export type ThreadMessage = ThreadReply & {
  /** The side conversation. An empty or missing list shows no count control. */
  replies?: ThreadReply[];
};

export type ThreadOpenProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: ThreadMessage[];
  /** Controlled id of the message whose side panel is open. */
  openId?: string | null;
  /** Initial open message for uncontrolled usage. @default null */
  defaultOpenId?: string | null;
  /** Fires from a count press, Escape, the close control and the scrim. */
  onOpenIdChange?: (id: string | null) => void;
  /** Fires from Enter or Send in the panel with the trimmed text. */
  onReply?: (parentId: string, text: string) => void;
  /** @default "Reply in thread" */
  placeholder?: string;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

const FOCUSABLE =
  'button:not([disabled]), textarea:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const nameOf = (message: ThreadReply) =>
  message.from === "me" ? "You" : message.from;

/** A count is one line, so the first words stand in for the whole message. */
const firstWords = (text: string, count: number): string => {
  const words = text.trim().split(/\s+/);
  return words.length > count
    ? `${words.slice(0, count).join(" ")}…`
    : text.trim();
};

/**
 * A thread that keeps its side conversations beside it. A message with replies
 * wears a count control; pressing it slides a panel in from the right edge of
 * the component's own frame on `glide` — the only long travel in the piece, and
 * it is a surface, not an element — while a scrim fades the thread behind it
 * and the replies cascade in from `distances.step` below on `snap` at
 * `cascade(count)`, so a deep side conversation still lands inside the budget.
 *
 * The panel is modal within the frame: Tab and Shift+Tab cycle inside it,
 * Escape closes, and closing folds it back to the right on the exit ease and
 * returns focus to the exact control that opened it — held by id and spent from
 * `onExitComplete`, never from a timer that might land early. It is
 * `absolute inset-0`, so it is sized by the thread it covers and scrolls
 * internally rather than reserving height nobody asked for.
 */
export function ThreadOpen({
  ref,
  messages,
  openId,
  defaultOpenId = null,
  onOpenIdChange,
  onReply,
  placeholder = "Reply in thread",
  label,
  className,
}: ThreadOpenProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const titleId = `${baseId}-title`;
  const hintId = `${baseId}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultOpenId,
  );
  const current = openId === undefined ? uncontrolled : openId;
  const [draft, setDraft] = React.useState("");
  const [announce, setAnnounce] = React.useState("");

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const countRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const lastOpenRef = React.useRef<string | null>(null);

  const open = React.useMemo(
    () => messages.find((message) => message.id === current) ?? null,
    [messages, current],
  );
  const replies = open?.replies ?? [];
  const step = cascade(Math.max(replies.length, 1));

  // The panel mounts in the same commit the id changes in, so its own effect is
  // where focus lands — no timer, and nothing focused before it exists.
  React.useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  // A landed reply is the newest thing in the panel, so the panel shows it. A
  // DOM write rather than state: the server markup and first paint are untouched.
  const replyCount = replies.length;
  React.useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [replyCount, current]);

  const setOpenId = (id: string | null, sentence: string) => {
    if (id !== null) lastOpenRef.current = id;
    if (openId === undefined) setUncontrolled(id);
    onOpenIdChange?.(id);
    setAnnounce(sentence);
  };

  const close = () => {
    if (!open) return;
    setDraft("");
    setOpenId(null, "Side conversation closed");
  };

  const send = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || !open) return;
    setDraft("");
    setAnnounce(`Reply sent to ${nameOf(open)}`);
    onReply?.(open.id, trimmed);
  };

  // Tab and Shift+Tab cycle within the panel; the panel itself is the fallback
  // when it holds nothing focusable.
  const trap = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const quiet =
    "flex items-center rounded-2 outline-none transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";
  const canSend = draft.trim().length > 0;

  return (
    <div
      ref={ref}
      className={cn("relative flex w-full flex-col overflow-hidden", className)}
    >
      <ol
        role="list"
        aria-label={label}
        className="flex max-h-72 flex-col gap-2.5 overflow-x-hidden overflow-y-auto px-0.5 py-0.5"
      >
        {messages.map((message) => {
          const own = message.from === "me";
          const count = message.replies?.length ?? 0;
          const last = message.replies?.[count - 1];
          return (
            <li
              key={message.id}
              className={cn(
                "flex flex-col gap-0.5",
                own ? "items-end" : "items-start",
              )}
            >
              <span
                className={cn(
                  "flex items-center gap-1.5 px-1 text-[11px] text-ink-3",
                  own && "flex-row-reverse",
                )}
              >
                <span>{nameOf(message)}</span>
                {message.time ? (
                  <span className="font-mono tabular-nums">{message.time}</span>
                ) : null}
              </span>

              <p
                className={cn(
                  "max-w-[88%] min-w-0 rounded-3 px-3 py-1.5 text-sm leading-5 wrap-break-word text-foreground",
                  own
                    ? "rounded-br-1 bg-surface-2"
                    : "rounded-bl-1 border border-hairline bg-surface-1",
                )}
              >
                {message.text}
              </p>

              {count > 0 ? (
                <button
                  type="button"
                  ref={(node) => {
                    if (node) countRefs.current.set(message.id, node);
                    else countRefs.current.delete(message.id);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={current === message.id}
                  aria-label={`${count} ${
                    count === 1 ? "reply" : "replies"
                  } to ${nameOf(message)}${
                    last ? `, last from ${nameOf(last)}` : ""
                  }. Opens the side conversation.`}
                  onClick={() =>
                    setOpenId(
                      message.id,
                      `Side conversation with ${nameOf(message)} open, ${count} ${
                        count === 1 ? "reply" : "replies"
                      }`,
                    )
                  }
                  className={cn(
                    quiet,
                    "mt-0.5 h-6 gap-1.5 px-1.5 text-[11px] font-medium text-cobalt-bright hover:bg-accent",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex size-4 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-[9px] font-semibold text-cobalt-bright"
                  >
                    {last ? nameOf(last).slice(0, 1) : "·"}
                  </span>
                  {/* One grid cell holds both numbers, so a landed reply rolls
                      the count instead of pushing the words sideways. */}
                  <span aria-hidden className="grid overflow-hidden">
                    <AnimatePresence initial={false}>
                      <motion.span
                        key={count}
                        initial={
                          motionSafe
                            ? { y: -distances.step, opacity: 0 }
                            : { opacity: 0 }
                        }
                        animate={{ y: 0, opacity: 1 }}
                        exit={
                          motionSafe
                            ? {
                                y: distances.step,
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }
                            : { opacity: 0, transition: { duration: 0 } }
                        }
                        transition={motionSafe ? springs.snap : fade}
                        className="col-start-1 row-start-1 font-mono tabular-nums"
                      >
                        {count}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span aria-hidden>{count === 1 ? "reply" : "replies"}</span>
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      <AnimatePresence
        onExitComplete={() => {
          const id = lastOpenRef.current;
          lastOpenRef.current = null;
          if (id) countRefs.current.get(id)?.focus({ preventScroll: true });
        }}
      >
        {open ? (
          <motion.div
            key="scrim"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
            className="absolute inset-0 z-10 bg-background/70"
          />
        ) : null}
        {open ? (
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={trap}
            initial={motionSafe ? { x: "100%" } : { opacity: 0 }}
            animate={motionSafe ? { x: "0%" } : { opacity: 1 }}
            exit={
              motionSafe
                ? { x: "100%", transition: exitFor(durations.base) }
                : { opacity: 0, transition: exitFor(durations.fast) }
            }
            transition={motionSafe ? springs.glide : fade}
            className="absolute inset-0 z-20 flex flex-col overflow-hidden rounded-3 border border-hairline-strong bg-surface-0 shadow-lg outline-none"
          >
            <div className="flex items-start gap-2 border-b border-hairline p-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <h2
                  id={titleId}
                  className="text-sm leading-tight font-semibold"
                >
                  {`Side conversation with ${nameOf(open)}`}
                </h2>
                <p className="truncate text-[11px] leading-4 text-ink-3">
                  {firstWords(open.text, 8)}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close the side conversation"
                className={cn(
                  quiet,
                  "size-7 shrink-0 justify-center text-ink-3 hover:bg-accent hover:text-foreground",
                )}
              >
                <svg
                  viewBox="0 0 16 16"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="size-3.5"
                >
                  <path d="m4.5 4.5 7 7m0-7-7 7" />
                </svg>
              </button>
            </div>

            <ol
              ref={listRef}
              role="list"
              aria-label={`Replies to ${nameOf(open)}`}
              className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5"
            >
              {replies.map((reply, index) => (
                <motion.li
                  key={reply.id}
                  initial={
                    motionSafe
                      ? { opacity: 0, y: distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe ? { ...springs.snap, delay: index * step } : fade
                  }
                  className={cn(
                    "flex flex-col gap-0.5",
                    reply.from === "me" ? "items-end" : "items-start",
                  )}
                >
                  <span
                    className={cn(
                      "flex items-center gap-1.5 px-1 text-[11px] text-ink-3",
                      reply.from === "me" && "flex-row-reverse",
                    )}
                  >
                    <span>{nameOf(reply)}</span>
                    {reply.time ? (
                      <span className="font-mono tabular-nums">
                        {reply.time}
                      </span>
                    ) : null}
                  </span>
                  <p
                    className={cn(
                      "max-w-[88%] min-w-0 rounded-3 px-3 py-1.5 text-sm leading-5 wrap-break-word text-foreground",
                      reply.from === "me"
                        ? "rounded-br-1 bg-surface-2"
                        : "rounded-bl-1 border border-hairline bg-surface-1",
                    )}
                  >
                    {reply.text}
                  </p>
                </motion.li>
              ))}
            </ol>

            <div className="flex items-end gap-2 border-t border-hairline p-2">
              <textarea
                value={draft}
                rows={1}
                placeholder={placeholder}
                aria-label={`Reply to ${nameOf(open)}`}
                aria-describedby={hintId}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    send();
                  }
                }}
                className="h-8 flex-1 resize-none rounded-2 border border-input bg-surface-1 px-2.5 py-0.5 text-sm leading-6 text-foreground outline-none placeholder:text-ink-3 focus-visible:border-hairline-strong"
              />
              <button
                type="button"
                onClick={send}
                aria-disabled={canSend ? undefined : true}
                className={cn(
                  quiet,
                  "h-8 shrink-0 bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90",
                  !canSend && "opacity-40",
                )}
              >
                Send
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <span id={hintId} className="sr-only">
        Enter sends, Shift+Enter breaks the line, Escape closes the side
        conversation
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
