"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HistoryMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** A preformatted date label the host supplies, such as "Mon 2 Mar". */
  date: string;
};

export type HistoryScrubProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The conversation, oldest first. */
  messages: HistoryMessage[];
  /** Controlled index of the current message. */
  value?: number;
  /** Initial index for uncontrolled usage. @default the last message */
  defaultValue?: number;
  onValueChange?: (index: number) => void;
  /** Messages shown before the current one. @default 2 */
  window?: number;
  /** Name printed on assistant rows. @default "Assistant" */
  assistantName?: string;
  /** Names the slider for assistive technology. */
  label: string;
  className?: string;
};

/** Pointer travel before a press becomes a drag. */
const SLOP = 4;
/** Half the thumb in px: the inner track is inset by it (`inset-x-2`) so the ends stay inside. */
const INSET = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/**
 * A scrubber that walks a conversation one message at a time. The pane shows
 * the current message and the `window` before it; moving the thumb cross-fades
 * messages in and out on a fast opacity tween while the ones that stay glide
 * to their new rows with a `layout` move on `glide`, and the pane's height —
 * read by a ResizeObserver, never during render — follows on `glide`. The
 * track carries a mark per message, taller where the date changes; the thumb
 * glides to its stop on `snap` and a date tab rides on it, cross-fading when
 * the date changes. Every position is an index, so the thumb's left percentage
 * is rounded before it reaches motion.
 *
 * Pressing the track jumps to the nearest message; a drag past four pixels
 * captures the pointer and scrubs message by message. The track is a slider:
 * Left and Right step one message, PageUp and PageDown step five, Home and End
 * jump to the ends, and the value text carries the date, the position and the
 * speaker. Under reduced motion messages swap by opacity only and the thumb
 * moves instantly.
 */
export function HistoryScrub({
  ref,
  messages,
  value,
  defaultValue,
  onValueChange,
  window: windowSize = 2,
  assistantName = "Assistant",
  label,
  className,
}: HistoryScrubProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();

  const count = messages.length;
  const last = Math.max(0, count - 1);
  const [ownValue, setOwnValue] = React.useState(defaultValue ?? last);
  const index = clamp(value ?? ownValue, 0, last);
  const current = messages[index];

  const commit = (next: number) => {
    const clamped = clamp(next, 0, last);
    if (clamped === index) return;
    if (value === undefined) setOwnValue(clamped);
    onValueChange?.(clamped);
  };

  const paneRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = paneRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Keyboard users hear the value text; the status line speaks only when a
  // pointer lets go, so a drag does not chatter through every stop.
  const [released, setReleased] = React.useState("");

  const whoOf = (message: HistoryMessage) =>
    message.role === "assistant" ? assistantName : "You";
  const positionText = (at: number) => {
    const message = messages[at];
    return message
      ? `${message.date}, message ${at + 1} of ${count}, ${whoOf(message)}`
      : "";
  };

  const percent = (at: number) =>
    Number(((last > 0 ? at / last : 0) * 100).toFixed(3));

  const indexFromClientX = (node: HTMLElement, clientX: number) => {
    const rect = node.getBoundingClientRect();
    const span = Math.max(1, rect.width - INSET * 2);
    const ratio = clamp((clientX - rect.left - INSET) / span, 0, 1);
    return Math.round(ratio * last);
  };

  const gesture = React.useRef<{
    id: number;
    startX: number;
    dragging: boolean;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gesture.current = {
      id: event.pointerId,
      startX: event.clientX,
      dragging: false,
    };
    event.currentTarget.focus();
    commit(indexFromClientX(event.currentTarget, event.clientX));
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (!active.dragging) {
      if (Math.abs(event.clientX - active.startX) < SLOP) return;
      active.dragging = true;
      try {
        // Capture only once the press has become a drag, so a plain click is
        // never swallowed; a pointer that already ended cannot be captured.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Carry on uncaptured.
      }
    }
    commit(indexFromClientX(event.currentTarget, event.clientX));
  };

  // A cancel carries no trustworthy position, so only a release commits one.
  const endGesture = (
    event: React.PointerEvent<HTMLDivElement>,
    settled: boolean,
  ) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    gesture.current = null;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Releasing a capture the browser already dropped is not an error.
    }
    const at = settled
      ? indexFromClientX(event.currentTarget, event.clientX)
      : index;
    commit(at);
    setReleased(positionText(at));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const targets: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowDown: index - 1,
      ArrowRight: index + 1,
      ArrowUp: index + 1,
      PageDown: index - 5,
      PageUp: index + 5,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    commit(target);
  };

  const from = Math.max(0, index - Math.max(0, windowSize));
  const visible = messages.slice(from, index + 1);
  const left = `${percent(index)}%`;

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const settle = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };
  const thumbMove = motionSafe ? springs.snap : { duration: 0 };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div className="flex h-10 items-center justify-between gap-3 px-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span
          aria-hidden
          className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
        >
          {count === 0 ? "0 / 0" : `${index + 1} / ${count}`}
        </span>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={settle}
        className="overflow-hidden"
      >
        <div ref={paneRef} className="px-3 pb-2">
          <ol aria-live="off" className="relative flex flex-col gap-1.5">
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((message) => {
                const isCurrent = message.id === current?.id;
                return (
                  <motion.li
                    key={message.id}
                    layout={motionSafe ? "position" : false}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ opacity: fade, layout: springs.glide }}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-2 border px-2.5 py-2 transition-colors",
                      isCurrent
                        ? "border-hairline-strong bg-surface-2"
                        : "border-transparent",
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          message.role === "assistant"
                            ? "bg-cobalt-bright"
                            : "bg-ink-3",
                        )}
                      />
                      <span className="min-w-0 truncate">
                        {whoOf(message)} · {message.date}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "text-sm leading-5",
                        isCurrent ? "text-foreground" : "text-ink-2",
                      )}
                    >
                      {message.text}
                    </span>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ol>
        </div>
      </motion.div>

      <div className="border-t border-hairline px-3 pt-1 pb-2">
        <div
          role="slider"
          tabIndex={count > 0 ? 0 : -1}
          aria-labelledby={labelId}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={index}
          aria-valuetext={positionText(index)}
          aria-disabled={count === 0 ? true : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endGesture(event, true)}
          onPointerCancel={(event) => endGesture(event, false)}
          onKeyDown={onKeyDown}
          className={cn(
            "relative h-12 w-full cursor-pointer touch-none rounded-2 outline-none select-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <div className="absolute inset-x-2 inset-y-0">
            <span
              aria-hidden
              className="absolute top-8 right-0 left-0 h-px -translate-y-1/2 bg-hairline-strong"
            />
            {messages.map((message, at) => {
              const newDay =
                at === 0 || messages[at - 1]?.date !== message.date;
              return (
                <span
                  key={message.id}
                  aria-hidden
                  style={{ left: `${percent(at)}%` }}
                  className={cn(
                    "absolute top-8 w-px -translate-x-1/2 -translate-y-1/2 transition-colors",
                    newDay ? "h-3.5 bg-ink-2" : "h-1.5 bg-ink-3",
                    at <= index && "bg-cobalt-bright",
                  )}
                />
              );
            })}

            {/* The tab's own width slides against its position, so it hugs
                the track's ends instead of overhanging them. */}
            <motion.span
              aria-hidden
              initial={false}
              animate={{ left, x: `-${left}` }}
              transition={thumbMove}
              className="absolute top-1 grid h-5 items-center rounded-1 border border-hairline-strong bg-popover px-1.5 font-mono text-[10px] whitespace-nowrap text-popover-foreground tabular-nums"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={current?.date ?? "none"}
                  className="col-start-1 row-start-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  {current?.date ?? ""}
                </motion.span>
              </AnimatePresence>
            </motion.span>

            <motion.span
              aria-hidden
              initial={false}
              animate={{ left }}
              transition={thumbMove}
              className="absolute top-8 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-surface-0 shadow-raised"
            />
          </div>
        </div>
      </div>

      <span role="status" className="sr-only">
        {released}
      </span>
    </div>
  );
}
