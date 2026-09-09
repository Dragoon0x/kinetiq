"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
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

export type DeleteMessage = {
  id: string;
  /** A name, or "me" for the right-aligned own bubble. */
  from: string;
  text: string;
  /** Printed under the bubble, already formatted. */
  time?: string;
};

export type DeleteFadeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. Remove a message here from `onExpire`. */
  messages: DeleteMessage[];
  /** Milliseconds the ring drains before the delete is final. @default 5000 */
  undoWindow?: number;
  /** The delete press; the message stays in the thread as a pending chip. */
  onDelete?: (id: string) => void;
  /** Undo pressed; the bubble is back. */
  onUndo?: (id: string) => void;
  /** The ring ran out — drop the message from `messages` here. */
  onExpire?: (id: string) => void;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

const FADE = { duration: durations.base, ease: easings.enter } as const;

const firstWords = (text: string) => {
  const words = text.trim().split(/\s+/);
  return words.length > 5 ? `${words.slice(0, 5).join(" ")}…` : text.trim();
};

/** Keeps callbacks out of effect dependencies so a re-render never restarts the ring. */
function useLatest<T>(value: T) {
  const ref = React.useRef(value);
  React.useEffect(() => {
    ref.current = value;
  });
  return ref;
}

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const getVisible = () => !document.hidden;
const getServerVisible = () => true;

/** A hidden tab never paints, so the ring stops draining where nobody is. */
const useDocumentVisible = () =>
  React.useSyncExternalStore(subscribeVisibility, getVisible, getServerVisible);

/**
 * Focus that arrived by keyboard holds the ring; focus placed after a pointer
 * press must not, or the ring would never drain for a mouse user.
 */
const keyboardFocused = (target: EventTarget) => {
  try {
    return target instanceof Element && target.matches(":focus-visible");
  } catch {
    return false;
  }
};

type RowProps = {
  message: DeleteMessage;
  pending: boolean;
  undoWindow: number;
  motionSafe: boolean;
  onDelete: (id: string) => void;
  onUndo: (id: string) => void;
  onExpire: (id: string) => void;
  listRef: React.RefObject<HTMLOListElement | null>;
};

function DeleteRow({
  message,
  pending,
  undoWindow,
  motionSafe,
  onDelete,
  onUndo,
  onExpire,
  listRef,
}: RowProps) {
  const own = message.from === "me";
  const visible = useDocumentVisible();
  const [held, setHeld] = React.useState(false);
  const bubbleRef = React.useRef<HTMLDivElement | null>(null);
  const chipRef = React.useRef<HTMLDivElement | null>(null);
  const deleteRef = React.useRef<HTMLButtonElement | null>(null);
  const undoRef = React.useRef<HTMLButtonElement | null>(null);

  const expireRef = useLatest(() => {
    // The chip leaves with the message, so focus resting on it moves to the
    // list rather than falling to the body.
    if (chipRef.current?.contains(document.activeElement)) {
      listRef.current?.focus();
    }
    onExpire(message.id);
  });

  // 1 → 0 across the window. A motion value, not state, so holding the ring
  // is free: stop, then resume from what is left, with no re-render between.
  const remaining = useMotionValue(1);
  const ringOffset = useTransform(remaining, (value) => 1 - value);
  React.useEffect(() => {
    if (!pending || held || !visible) return;
    const controls = animate(remaining, 0, {
      // The countdown is information, so it drains at the same linear rate
      // under reduced motion.
      duration: (undoWindow / 1000) * remaining.get(),
      ease: easings.linear,
      onComplete: () => expireRef.current(),
    });
    return () => controls.stop();
  }, [pending, held, visible, undoWindow, remaining, expireRef]);

  // Measure whichever content is live, by border box, so the row glides
  // between the bubble's height and the chip's with nothing reserved.
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = pending ? chipRef.current : bubbleRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      setHeight(Math.round(box ? box.blockSize : node.offsetHeight));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [pending]);

  // Focus follows the action: to Undo on delete, back to the delete control
  // on restore, when the bubble also rises from `distances.step` on recoil.
  const wasPending = React.useRef(pending);
  React.useEffect(() => {
    const was = wasPending.current;
    wasPending.current = pending;
    if (pending) {
      undoRef.current?.focus();
      return;
    }
    if (!was) return;
    deleteRef.current?.focus();
    const node = bubbleRef.current;
    if (!node || !motionSafe) return;
    const controls = animate(node, { y: [distances.step, 0] }, springs.recoil);
    return () => controls.complete();
  }, [pending, motionSafe]);

  return (
    <motion.li
      exit={{ opacity: 0, height: 0, transition: exitFor() }}
      className="overflow-hidden"
    >
      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.base, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div className="grid">
          <motion.div
            ref={bubbleRef}
            inert={pending || undefined}
            initial={false}
            animate={{ opacity: pending ? 0.3 : 1 }}
            transition={FADE}
            className={cn(
              "col-start-1 row-start-1 flex items-start gap-2 py-1",
              own && "flex-row-reverse",
            )}
          >
            <div
              className={cn(
                "flex max-w-[82%] min-w-0 flex-col gap-1",
                own ? "items-end" : "items-start",
              )}
            >
              {own ? null : (
                <span className="px-1 text-[11px] font-medium text-ink-2">
                  {message.from}
                </span>
              )}
              <div
                className={cn(
                  "rounded-3 px-3 py-2 text-sm leading-snug wrap-break-word",
                  own
                    ? "rounded-br-1 bg-primary text-primary-foreground"
                    : "rounded-bl-1 bg-surface-2 text-foreground",
                )}
              >
                {message.text}
              </div>
              {message.time ? (
                <span className="px-1 text-[11px] text-ink-3 tabular-nums">
                  {message.time}
                </span>
              ) : null}
            </div>
            <button
              ref={deleteRef}
              type="button"
              aria-label={`Delete message from ${own ? "you" : message.from}: ${firstWords(message.text)}`}
              onClick={() => onDelete(message.id)}
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors outline-none hover:bg-accent hover:text-danger",
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
                className="size-3.5"
              >
                <path d="m4.5 4.5 7 7M11.5 4.5l-7 7" />
              </svg>
            </button>
          </motion.div>

          {pending ? (
            <div
              ref={chipRef}
              className="col-start-1 row-start-1 self-start py-1"
            >
              <div
                role="group"
                aria-label="Deleted message, undo available"
                onPointerEnter={() => setHeld(true)}
                onPointerLeave={() => setHeld(false)}
                onFocus={(event) => setHeld(keyboardFocused(event.target))}
                onBlur={(event) => {
                  const next = event.relatedTarget;
                  if (!(
                    next instanceof Node && event.currentTarget.contains(next)
                  )) {
                    setHeld(false);
                  }
                }}
                className="flex h-9 items-center gap-2 rounded-3 border border-hairline bg-surface-1 px-2.5"
              >
                {/* Neutral ink, never cobalt: a destructive countdown is not
                    a celebration. */}
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  className={cn(
                    "size-4 shrink-0 text-ink-2 transition-opacity",
                    held && "opacity-50",
                  )}
                >
                  <circle cx="12" cy="12" r="9" strokeOpacity="0.2" />
                  <motion.circle
                    cx="12"
                    cy="12"
                    r="9"
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray="1 1"
                    transform="rotate(-90 12 12)"
                    style={{ strokeDashoffset: ringOffset }}
                  />
                </svg>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-2">
                  Deleted
                </span>
                <button
                  ref={undoRef}
                  type="button"
                  onClick={() => {
                    remaining.set(1);
                    onUndo(message.id);
                  }}
                  className={cn(
                    "flex h-7 items-center rounded-2 border border-hairline-strong px-2.5 text-xs font-medium transition-colors outline-none hover:bg-accent active:bg-cobalt-wash",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  )}
                >
                  Undo
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </motion.div>
    </motion.li>
  );
}

/**
 * Gone, with a moment to undo. Deleting dims the bubble on a tween while the
 * row's measured height glides on `glide` down to a chip: a ring draining
 * linearly across `undoWindow`, the word Deleted, and Undo. Hovering or
 * keyboard-focusing the chip holds the ring, as does a hidden tab. Undo brings
 * the bubble back with a rise on `recoil`; when the ring runs out the parent
 * is told to drop the message and the row exits on the exit ease, because a
 * destructive action never bounces. Delete controls are buttons named by
 * sender and first words, the chip is a group with a real Undo button, focus
 * moves to Undo on delete and back on restore, and a status region speaks
 * deleted, restored and removed once each. Under reduced motion nothing
 * rises, heights swap on a tween, and the ring still drains.
 */
export function DeleteFade({
  ref,
  messages,
  undoWindow = 5000,
  onDelete,
  onUndo,
  onExpire,
  label,
  className,
}: DeleteFadeProps) {
  const motionSafe = useMotionSafe();
  const listRef = React.useRef<HTMLOListElement | null>(null);

  const [state, setState] = React.useState<{
    ids: string[];
    pending: string[];
    gone: string[];
    message: string;
  }>(() => ({
    ids: messages.map((m) => m.id),
    pending: [],
    gone: [],
    message: "",
  }));

  // Pending and gone marks follow the ids the parent shows, adjusted during
  // render, so a message that leaves and returns under the same id comes
  // back live. A gone message stays out of the list until the parent drops it.
  const ids = messages.map((message) => message.id);
  if (
    ids.length !== state.ids.length ||
    ids.some((id, i) => id !== state.ids[i])
  ) {
    setState({
      ...state,
      ids,
      pending: state.pending.filter((id) => ids.includes(id)),
      gone: state.gone.filter((id) => ids.includes(id)),
    });
  }

  const seconds = Math.max(1, Math.round(undoWindow / 1000));
  const nameOf = (id: string) =>
    firstWords(messages.find((message) => message.id === id)?.text ?? "");
  const settle = (id: string, gone: boolean, message: string) =>
    setState((prev) => ({
      ...prev,
      pending: prev.pending.filter((other) => other !== id),
      gone: gone ? [...prev.gone, id] : prev.gone,
      message,
    }));

  const remove = (id: string) => {
    setState((prev) => ({
      ...prev,
      pending: [...prev.pending.filter((other) => other !== id), id],
      message: `Deleted "${nameOf(id)}", undo for ${seconds} seconds`,
    }));
    onDelete?.(id);
  };
  const restore = (id: string) => {
    settle(id, false, `Restored "${nameOf(id)}"`);
    onUndo?.(id);
  };
  const expire = (id: string) => {
    settle(id, true, `Removed "${nameOf(id)}"`);
    onExpire?.(id);
  };
  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <ol
        ref={listRef}
        role="list"
        aria-label={label}
        tabIndex={-1}
        className="flex flex-col outline-none"
      >
        <AnimatePresence initial={false}>
          {messages
            .filter((message) => !state.gone.includes(message.id))
            .map((message) => (
              <DeleteRow
                key={message.id}
                message={message}
                pending={state.pending.includes(message.id)}
                undoWindow={undoWindow}
                motionSafe={motionSafe}
                onDelete={remove}
                onUndo={restore}
                onExpire={expire}
                listRef={listRef}
              />
            ))}
        </AnimatePresence>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {state.message}
      </span>
    </div>
  );
}
