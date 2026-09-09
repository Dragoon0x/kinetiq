"use client";

import * as React from "react";

import { AnimatePresence, animate, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BubbleDelivery =
  "sending" | "sent" | "delivered" | "read" | "failed";

export type BubbleMessage = {
  id: string;
  /** Own messages sit on the right and carry the delivery mark. */
  from: "me" | "peer";
  text: string;
  /** Printed under the bubble, already formatted. */
  time?: string;
  /** Read for own messages only. @default "sent" */
  delivery?: BubbleDelivery;
};

export type BubbleLandProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. Append the new message here from `onSend`. */
  messages: BubbleMessage[];
  /** The other person; the mark's sentences name them. @default "Them" */
  peerName?: string;
  /** Fires from Enter or the Send control with the trimmed draft. */
  onSend?: (text: string) => void;
  /** Fires from a failed bubble's Retry control. */
  onRetry?: (id: string) => void;
  /** @default "Message" */
  placeholder?: string;
  /** Holds the composer while the parent is busy. */
  disabled?: boolean;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const CHECK = "M1.5 8.5 4.5 11.5 10 5.5";

/** How far along the walk each state is; failure sits outside it. */
const RANK = { sending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const firstWords = (text: string) => {
  const words = text.trim().split(/\s+/);
  return words.length > 6 ? `${words.slice(0, 6).join(" ")}…` : text.trim();
};

const sentenceFor = (delivery: BubbleDelivery, peerName: string) =>
  ({
    sending: "Sending",
    sent: "Sent",
    delivered: `Delivered to ${peerName}`,
    read: `Read by ${peerName}`,
    failed: "Not sent",
  })[delivery];

const marksOf = (messages: BubbleMessage[]) => {
  const marks: Record<string, BubbleDelivery> = {};
  for (const message of messages) {
    if (message.from === "me") marks[message.id] = message.delivery ?? "sent";
  }
  return marks;
};

type MarkProps = {
  delivery: BubbleDelivery;
  peerName: string;
  motionSafe: boolean;
};

/**
 * One glyph that walks the states rather than four icons blinking. Every path
 * keeps its command count, so nothing asks motion to interpolate a `d`.
 */
function DeliveryMark({ delivery, peerName, motionSafe }: MarkProps) {
  const rank = RANK[delivery];
  const failed = delivery === "failed";
  const sentence = sentenceFor(delivery, peerName);

  return (
    <span
      role="img"
      aria-label={sentence}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center transition-colors",
        failed
          ? "text-danger"
          : rank >= 3
            ? "text-cobalt-bright"
            : "text-ink-3",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
      >
        <motion.circle
          cx="8"
          cy="8"
          r="5"
          initial={false}
          animate={{ opacity: delivery === "sending" ? 1 : 0 }}
          transition={FADE}
        />
        <motion.path
          d={CHECK}
          pathLength={1}
          strokeDasharray="1 1"
          initial={false}
          animate={{
            strokeDashoffset: rank >= 1 ? 0 : 1,
            opacity: rank >= 1 ? 1 : 0,
          }}
          transition={{
            strokeDashoffset: motionSafe ? springs.flick : { duration: 0 },
            opacity: FADE,
          }}
        />
        <motion.path
          d={CHECK}
          initial={false}
          animate={{ x: rank >= 2 ? 4 : 0, opacity: rank >= 2 ? 1 : 0 }}
          transition={{
            x: motionSafe ? springs.snap : { duration: 0 },
            opacity: FADE,
          }}
        />
        <motion.g
          initial={false}
          animate={{ opacity: failed ? 1 : 0 }}
          transition={FADE}
        >
          <path d="M8 3.25v5.5" />
          <circle cx="8" cy="12.25" r="0.6" fill="currentColor" stroke="none" />
        </motion.g>
      </svg>
    </span>
  );
}

type ItemProps = {
  message: BubbleMessage;
  peerName: string;
  motionSafe: boolean;
  onRetry?: (id: string) => void;
};

function BubbleItem({ message, peerName, motionSafe, onRetry }: ItemProps) {
  const own = message.from === "me";
  const delivery = own ? (message.delivery ?? "sent") : null;
  const failed = delivery === "failed";
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);

  // The shake is five keyframes, so it is a tween (a spring takes two), and it
  // runs imperatively so a parent re-render while still failed cannot replay
  // it. Completing on cleanup parks x at 0 rather than mid-shake.
  React.useEffect(() => {
    if (!failed || !motionSafe) return;
    const node = bubbleRef.current;
    if (!node) return;
    const controls = animate(
      node,
      { x: [0, -4, 4, -3, 3, 0] },
      { duration: durations.slow, ease: easings.move },
    );
    return () => controls.complete();
  }, [failed, motionSafe]);

  return (
    <motion.li
      initial={motionSafe ? { opacity: 0, y: distances.shift } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={motionSafe ? { y: springs.recoil, opacity: FADE } : FADE}
      className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}
    >
      <motion.div
        ref={bubbleRef}
        className={cn(
          "max-w-[82%] rounded-3 border px-3 py-2 text-sm leading-snug wrap-break-word transition-colors",
          own
            ? "rounded-br-1 bg-primary text-primary-foreground"
            : "rounded-bl-1 bg-surface-2 text-foreground",
          failed ? "border-danger" : "border-transparent",
        )}
      >
        {message.text}
      </motion.div>
      <span className="flex h-4 items-center gap-1 px-1 text-[11px] text-ink-3 tabular-nums">
        {message.time ? <span>{message.time}</span> : null}
        {delivery ? (
          <DeliveryMark
            delivery={delivery}
            peerName={peerName}
            motionSafe={motionSafe}
          />
        ) : null}
      </span>
      <AnimatePresence initial={false}>
        {failed ? (
          <motion.span
            key="retry"
            initial={
              motionSafe ? { opacity: 0, y: -distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={motionSafe ? springs.snap : FADE}
            className="flex items-center gap-2"
          >
            <span className="text-xs font-medium text-danger">Not sent</span>
            <button
              type="button"
              aria-label={`Retry sending: ${firstWords(message.text)}`}
              onClick={() => onRetry?.(message.id)}
              className={cn(
                "flex h-7 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              )}
            >
              Retry
            </button>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/**
 * Sent, and it shows. A bubble rises into the thread from the composer's side
 * on `recoil` — the two bounces of something landing — and its mark walks the
 * delivery states the parent reports: a ring while sending, one check drawn
 * on `flick` once sent, a second that walks out on `snap` when delivered, both
 * tinted cobalt when read. Failure shakes the bubble on a tween, tints its
 * edge danger and offers Retry beneath it. The list's height is measured so
 * arrivals glide the frame taller inside a capped scroll that follows the
 * newest bubble. Marks are images with sentences ("Delivered to Marta"), a
 * status region speaks delivered, read and failure once each, and the
 * composer is a textarea: Enter sends, Shift+Enter breaks a line. Reduced
 * motion fades the bubble in place and drops the draw, the walk and the shake.
 */
export function BubbleLand({
  ref,
  messages,
  peerName = "Them",
  onSend,
  onRetry,
  placeholder = "Message",
  disabled = false,
  label,
  className,
}: BubbleLandProps) {
  const motionSafe = useMotionSafe();
  const [draft, setDraft] = React.useState("");
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const listRef = React.useRef<HTMLOListElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = listRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Pin the scroll to the newest bubble. While the frame is still gliding
  // taller the browser clamps this back toward the top, which reads as the
  // thread rising to meet the arrival.
  const count = messages.length;
  React.useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [count]);

  // Announce delivery once per hop that matters. The seen map is adjusted
  // during render so the sentence belongs to the hop, not to a later
  // re-render; sending → sent is visible but not worth a voice.
  const [seen, setSeen] = React.useState<{
    marks: Record<string, BubbleDelivery>;
    message: string;
  }>(() => ({ marks: marksOf(messages), message: "" }));
  const marks = marksOf(messages);
  const ownIds = Object.keys(marks);
  const changed = ownIds.filter((id) => seen.marks[id] !== marks[id]);
  if (changed.length > 0 || ownIds.length !== Object.keys(seen.marks).length) {
    const last = changed
      .map((id) => marks[id])
      .filter((d) => d === "delivered" || d === "read" || d === "failed")
      .pop();
    setSeen({
      marks,
      message:
        last === undefined
          ? seen.message
          : last === "failed"
            ? "Message not sent, retry available"
            : sentenceFor(last, peerName),
    });
  }

  const submit = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend?.(text);
    setDraft("");
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <motion.div
        ref={scrollRef}
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className="max-h-72 overflow-x-hidden overflow-y-auto"
      >
        <ol
          ref={listRef}
          role="list"
          aria-label={label}
          className="flex flex-col gap-3 px-0.5 pb-0.5"
        >
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <BubbleItem
                key={message.id}
                message={message}
                peerName={peerName}
                motionSafe={motionSafe}
                onRetry={(id) => {
                  // The Retry control unmounts with the failure, so focus
                  // moves to the composer rather than falling to the body.
                  onRetry?.(id);
                  composerRef.current?.focus();
                }}
              />
            ))}
          </AnimatePresence>
        </ol>
      </motion.div>

      <span role="status" aria-live="polite" className="sr-only">
        {seen.message}
      </span>

      <div className="flex items-end gap-2">
        <textarea
          ref={composerRef}
          aria-label={`Message ${peerName}`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            "h-9 min-w-0 flex-1 resize-none rounded-3 border border-input bg-surface-0 px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            "disabled:opacity-60",
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || draft.trim().length === 0}
          className={cn(
            "flex h-9 shrink-0 items-center rounded-3 bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-opacity outline-none hover:opacity-90 disabled:opacity-50",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          Send
        </button>
      </div>
    </div>
  );
}
