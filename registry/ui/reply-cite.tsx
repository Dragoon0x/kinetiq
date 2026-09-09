"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ReplyMessage = {
  id: string;
  /** "me" sits on the right and reads as "You"; anything else is the sender. */
  from: "me" | string;
  text: string;
  /** Printed beside the sender, already formatted. */
  time?: string;
  /** The id of the message this one answers; draws its cite line. */
  replyTo?: string;
};

export type ReplyCiteProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. Append the sent message here from `onSend`. */
  messages: ReplyMessage[];
  /** Controlled reply target. */
  replyTo?: string | null;
  /** Initial reply target for uncontrolled usage. @default null */
  defaultReplyTo?: string | null;
  /** Fires from a Reply press, a remove, Escape and a send. */
  onReplyToChange?: (id: string | null) => void;
  /** Fires from Enter or the Send button with the trimmed text. */
  onSend?: (text: string, replyTo: string | null) => void;
  /** @default "Message" */
  placeholder?: string;
  /** Names the thread and the composer for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const REPLY_ARROW = "M6.5 4 3 7.5 6.5 11M3 7.5h5.5a4 4 0 0 1 4 4V13";

const nameOf = (message: ReplyMessage) =>
  message.from === "me" ? "You" : message.from;

/** A cite is one line, so the first words stand in for the whole message. */
const firstWords = (text: string, count: number): string => {
  const words = text.trim().split(/\s+/);
  return words.length > count
    ? `${words.slice(0, count).join(" ")}…`
    : text.trim();
};

/**
 * A thread that can point at itself. Reply on any message slides a cite card
 * into the composer's head from `distances.step` above on `glide` while the
 * head's measured height glides open from nothing — measured, so no room is
 * held for a card that is not there. The original wears a cobalt bar that
 * draws down its side on `snap` for as long as it is the target, and pressing
 * the card carries the thread back to it: `scrollTop` is driven by `glide`
 * rather than jumped, and focus lands on the message itself, so the original
 * is both seen and read. Escape in the composer or on the card takes the
 * target away — the card leaves upward on the exit ease as the head glides
 * shut — and a send carries the target id out with the text, so the message
 * that lands quotes what it answered.
 *
 * Every message is a focusable item with its own Reply button, named after the
 * message it answers; Enter in the composer sends, Shift+Enter breaks the line.
 * A status region names the target once per change, never per keystroke. Under
 * reduced motion the card fades in place, the head's height swaps on a fast
 * tween, and the thread jumps to the original instead of gliding.
 */
export function ReplyCite({
  ref,
  messages,
  replyTo,
  defaultReplyTo = null,
  onReplyToChange,
  onSend,
  placeholder = "Message",
  label,
  className,
}: ReplyCiteProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultReplyTo,
  );
  const targetId = replyTo === undefined ? uncontrolled : replyTo;
  const [text, setText] = React.useState("");
  const [announce, setAnnounce] = React.useState("");
  const [headHeight, setHeadHeight] = React.useState(0);

  const boxRef = React.useRef<HTMLOListElement | null>(null);
  const headRef = React.useRef<HTMLDivElement | null>(null);
  const fieldRef = React.useRef<HTMLTextAreaElement | null>(null);
  const itemsRef = React.useRef(new Map<string, HTMLLIElement>());
  const scrollRef = React.useRef<AnimationPlaybackControls | null>(null);

  const byId = React.useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  // A target the thread no longer holds is no target at all: the head shuts
  // rather than citing a message nobody can be carried back to.
  const target = targetId === null ? undefined : byId.get(targetId);

  // The thread opens at its newest message and follows every arrival. A DOM
  // write rather than state, so the server markup and first paint are untouched.
  const count = messages.length;
  React.useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [count]);

  React.useEffect(() => () => scrollRef.current?.stop(), []);

  // The head is measured by its own border box, so the open glide knows the
  // card's real height and the closed state holds no room for it.
  React.useEffect(() => {
    const node = headRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const next = Math.round(node.offsetHeight);
      setHeadHeight((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const commitTarget = (id: string | null, sentence: string) => {
    if (replyTo === undefined) setUncontrolled(id);
    onReplyToChange?.(id);
    setAnnounce(sentence);
  };

  const clear = () => {
    if (targetId === null) return;
    commitTarget(null, "Reply removed");
    fieldRef.current?.focus();
  };

  const send = () => {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    setText("");
    if (replyTo === undefined) setUncontrolled(null);
    onReplyToChange?.(null);
    setAnnounce(target ? `Sent, replying to ${nameOf(target)}` : "Sent");
    onSend?.(trimmed, target?.id ?? null);
  };

  const showOriginal = () => {
    const box = boxRef.current;
    const node = target ? itemsRef.current.get(target.id) : undefined;
    if (!box || !node) return;
    const room = Math.max(0, box.scrollHeight - box.clientHeight);
    const centred = node.offsetTop - (box.clientHeight - node.offsetHeight) / 2;
    const dest = Math.round(Math.min(room, Math.max(0, centred)));
    // preventScroll: the browser's own scroll-into-view would land the message
    // at once and leave the glide chasing a box that had already moved.
    const land = () => node.focus({ preventScroll: true });
    scrollRef.current?.stop();
    if (!motionSafe) {
      box.scrollTop = dest;
      land();
      return;
    }
    scrollRef.current = animate(box.scrollTop, dest, {
      ...springs.glide,
      onUpdate: (value) => {
        box.scrollTop = value;
      },
      onComplete: land,
    });
  };

  const quiet =
    "flex items-center rounded-2 transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  const meta = "flex items-center gap-1.5 px-1 text-[11px] text-ink-3";
  const canSend = text.trim().length > 0;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <ol
        ref={boxRef}
        role="list"
        aria-label={label}
        className="relative flex max-h-56 flex-col gap-2.5 overflow-x-hidden overflow-y-auto px-0.5 py-0.5"
      >
        {messages.map((message) => {
          const own = message.from === "me";
          const cited = message.id === target?.id;
          const parent = message.replyTo
            ? byId.get(message.replyTo)
            : undefined;
          return (
            <li
              key={message.id}
              ref={(node) => {
                if (node) itemsRef.current.set(message.id, node);
                else itemsRef.current.delete(message.id);
              }}
              tabIndex={-1}
              aria-label={
                cited
                  ? `${nameOf(message)}: ${message.text}. Cited by your reply`
                  : undefined
              }
              className={cn(
                "flex flex-col gap-0.5 rounded-3 outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                own ? "items-end" : "items-start",
              )}
            >
              <span className={cn(meta, own && "flex-row-reverse")}>
                <span>{nameOf(message)}</span>
                {message.time ? (
                  <span className="font-mono tabular-nums">{message.time}</span>
                ) : null}
              </span>

              {parent ? (
                <span
                  className={cn(meta, "max-w-[82%]", own && "flex-row-reverse")}
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden
                    {...STROKE}
                    className="size-3 shrink-0"
                  >
                    <path d={REPLY_ARROW} />
                  </svg>
                  <span className="sr-only">Replying to </span>
                  <span className="min-w-0 truncate">
                    {`${nameOf(parent)}: ${firstWords(parent.text, 6)}`}
                  </span>
                </span>
              ) : null}

              <span
                className={cn(
                  "flex w-full items-end gap-1.5",
                  own ? "flex-row-reverse" : "flex-row",
                )}
              >
                <span
                  className={cn(
                    "flex max-w-[82%] min-w-0 items-stretch gap-1",
                    own && "flex-row-reverse",
                  )}
                >
                  {/* The cited edge keeps its gutter whether or not it is
                      drawn, so taking a target never nudges the bubble. */}
                  <motion.span
                    aria-hidden
                    initial={false}
                    animate={
                      motionSafe
                        ? { scaleY: cited ? 1 : 0, opacity: cited ? 1 : 0 }
                        : { scaleY: 1, opacity: cited ? 1 : 0 }
                    }
                    transition={
                      motionSafe ? { ...springs.snap, opacity: FADE } : FADE
                    }
                    className="w-0.5 shrink-0 origin-top rounded-full bg-cobalt-bright"
                  />
                  <span
                    className={cn(
                      "min-w-0 rounded-3 px-3 py-1.5 text-sm leading-5 wrap-break-word whitespace-pre-wrap text-foreground",
                      own
                        ? "rounded-br-1 bg-surface-2"
                        : "rounded-bl-1 border border-hairline bg-surface-1",
                    )}
                  >
                    {message.text}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => {
                    commitTarget(message.id, `Replying to ${nameOf(message)}`);
                    fieldRef.current?.focus();
                  }}
                  aria-label={`Reply to ${nameOf(message)}: ${firstWords(message.text, 6)}`}
                  className={cn(
                    quiet,
                    "h-6 shrink-0 px-1.5 text-[11px] font-medium hover:bg-accent hover:text-foreground",
                    cited ? "text-cobalt-bright" : "text-ink-3",
                  )}
                >
                  Reply
                </button>
              </span>
            </li>
          );
        })}
      </ol>

      <div
        // One handler for the whole composer: Escape drops the target whether
        // the caret is in the field or focus is on the card itself.
        onKeyDown={(event) => {
          if (event.key !== "Escape" || targetId === null) return;
          event.preventDefault();
          event.stopPropagation();
          clear();
        }}
        className="flex flex-col rounded-3 border border-input bg-surface-0 focus-within:border-hairline-strong"
      >
        <motion.div
          initial={false}
          animate={{ height: target ? headHeight : 0 }}
          transition={motionSafe ? springs.glide : { duration: durations.fast }}
          className="overflow-hidden"
        >
          <div ref={headRef} className="flex flex-col">
            <AnimatePresence initial={false}>
              {target ? (
                // One card for every target: switching messages swaps its
                // words rather than remounting, so an open head never blinks
                // and its measured height never doubles mid-exit.
                <motion.div
                  key="cite"
                  initial={
                    motionSafe
                      ? { opacity: 0, y: -distances.step }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? -distances.step : 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe ? { ...springs.glide, opacity: FADE } : FADE
                  }
                  className="flex items-center gap-1.5 p-1.5 pb-0"
                >
                  <button
                    type="button"
                    onClick={showOriginal}
                    aria-label={`Replying to ${nameOf(target)}: ${firstWords(target.text, 6)}. Show the original`}
                    className={cn(
                      quiet,
                      "h-8 min-w-0 flex-1 gap-2 bg-surface-1 px-2 text-left hover:bg-accent",
                    )}
                  >
                    <span
                      aria-hidden
                      className="h-4 w-0.5 shrink-0 rounded-full bg-cobalt-bright"
                    />
                    <span
                      aria-hidden
                      className="shrink-0 text-xs font-medium text-cobalt-bright"
                    >
                      {nameOf(target)}
                    </span>
                    <span
                      aria-hidden
                      className="min-w-0 flex-1 truncate text-xs text-ink-2"
                    >
                      {firstWords(target.text, 12)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={clear}
                    aria-label="Remove reply"
                    className={cn(
                      quiet,
                      "size-8 shrink-0 justify-center text-ink-3 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden
                      {...STROKE}
                      className="size-3.5 shrink-0"
                    >
                      <path d="m4.5 4.5 7 7m0-7-7 7" />
                    </svg>
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </motion.div>

        <textarea
          ref={fieldRef}
          value={text}
          rows={2}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={hintId}
          onChange={(event) => setText(event.target.value)}
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
          className="block w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3"
        />

        <div className="flex items-center justify-between gap-2 border-t border-hairline py-1.5 pr-1.5 pl-3">
          <span
            aria-hidden
            className="min-w-0 truncate font-mono text-[11px] text-ink-3"
          >
            {target ? "Escape drops the reply" : "Enter sends"}
          </span>
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
      </div>

      <span id={hintId} className="sr-only">
        Enter sends, Shift+Enter breaks the line, Escape removes the reply
        target
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
