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

export type GlowMessage = {
  id: string;
  author: string;
  text: string;
  /** Clock time as `HH:mm`. */
  at: string;
  mine?: boolean;
  /** Id of the message this one answers; renders as a quote that jumps to it. */
  replyTo?: string;
};

export type MessageGlowProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread in order. */
  messages: GlowMessage[];
  /** Id of a message offered as a "Pinned" chip at the head of the thread. */
  pinned?: string;
  /** Fires from the press that starts a jump. */
  onJump?: (id: string) => void;
  /** Fires from the Back chip. */
  onBack?: () => void;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  className?: string;
};

type Glow = { id: string; nonce: number };

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A thread where a quote is a door. Pressing the quoted line in a reply, or
 * the pinned chip at the head, drives the box's `scrollTop` on `glide` — the
 * layout spring, no overshoot — until the target bubble sits centred, and on
 * settle the bubble glows once: a wash and a two-pixel ring at full strength
 * that fade on the exit ease, so the eye lands where the scroll did and
 * nothing lingers. The glow is keyed by a jump count, so jumping to the same
 * message twice glows twice. A Back chip then glides you to where you were.
 *
 * The target list item takes focus when the scroll settles, so a screen
 * reader lands on the message it jumped to, and a polite status names it.
 * Under reduced motion the scroll is set at once and the glow still fades,
 * because it is the confirmation that the jump landed.
 */
export function MessageGlow({
  ref,
  messages,
  pinned,
  onJump,
  onBack,
  label = "Thread",
  className,
}: MessageGlowProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const itemsRef = React.useRef(new Map<string, HTMLLIElement>());
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const scrollRef = React.useRef<{ stop: () => void } | null>(null);

  const [glow, setGlow] = React.useState<Glow | null>(null);
  const [back, setBack] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const byId = new Map(messages.map((message) => [message.id, message]));
  const pinnedMessage = pinned !== undefined ? byId.get(pinned) : undefined;

  // A thread opens at its newest message. A DOM write rather than state, so
  // the server markup and the first paint are untouched.
  React.useEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, []);

  React.useEffect(() => () => scrollRef.current?.stop(), []);

  const scrollTo = (dest: number, done: () => void) => {
    const box = boxRef.current;
    if (!box) return;
    scrollRef.current?.stop();
    if (!motionSafe) {
      box.scrollTop = dest;
      done();
      return;
    }
    scrollRef.current = animate(box.scrollTop, dest, {
      ...springs.glide,
      onUpdate: (value) => {
        box.scrollTop = value;
      },
      onComplete: done,
    });
  };

  const jumpTo = (id: string, trigger: HTMLElement | null) => {
    const box = boxRef.current;
    const target = itemsRef.current.get(id);
    const message = byId.get(id);
    if (!box || !target || !message) return;
    onJump?.(id);
    triggerRef.current = trigger;
    // Only the first jump of a run remembers where you were; a second jump
    // from the glowing message should still bring you back to the start.
    const from = box.scrollTop;
    setBack((prev) => prev ?? from);
    const centred =
      target.offsetTop - (box.clientHeight - target.offsetHeight) / 2;
    const dest = clamp(
      Math.round(centred),
      0,
      box.scrollHeight - box.clientHeight,
    );
    scrollTo(dest, () => {
      setGlow((prev) => ({ id, nonce: (prev?.nonce ?? 0) + 1 }));
      target.focus({ preventScroll: true });
      setAnnouncement(`Jumped to ${message.author}, ${message.at}`);
    });
  };

  const goBack = () => {
    if (back === null) return;
    onBack?.();
    const trigger = triggerRef.current;
    scrollTo(back, () => {
      setBack(null);
      setAnnouncement("Back where you were");
      const home = trigger?.isConnected ? trigger : boxRef.current;
      home?.focus({ preventScroll: true });
    });
  };

  const fade = { duration: durations.fast } as const;

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <div
        ref={boxRef}
        role="region"
        aria-labelledby={labelId}
        tabIndex={0}
        className={cn(
          "relative max-h-72 overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1",
          focusRing,
        )}
      >
        {pinnedMessage && (
          <div className="sticky top-0 z-10 bg-surface-1 px-3 pt-3 pb-2">
            <button
              type="button"
              onClick={(event) => jumpTo(pinnedMessage.id, event.currentTarget)}
              aria-label={`Jump to pinned message from ${pinnedMessage.author} at ${pinnedMessage.at}`}
              className={cn(
                "flex h-8 w-full items-center gap-2 rounded-2 border border-hairline bg-surface-2 px-2.5 text-left text-xs transition-colors hover:bg-accent",
                focusRing,
              )}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3.5 shrink-0 text-cobalt-bright"
              >
                <path d="M6 2.5h4l-.5 4 2.5 2.5v1H4v-1l2.5-2.5z M8 10v3.5" />
              </svg>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Pinned
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-2">
                {pinnedMessage.text}
              </span>
            </button>
          </div>
        )}

        <ol
          role="list"
          className={cn(
            "flex flex-col gap-1.5 px-3 pb-3",
            pinnedMessage ? "pt-1" : "pt-3",
          )}
        >
          {messages.map((message) => {
            const mine = message.mine === true;
            const quoted =
              message.replyTo !== undefined
                ? byId.get(message.replyTo)
                : undefined;
            const lit = glow?.id === message.id ? glow : null;
            return (
              <li
                key={message.id}
                ref={(node) => {
                  if (node) itemsRef.current.set(message.id, node);
                  else itemsRef.current.delete(message.id);
                }}
                tabIndex={-1}
                className={cn(
                  "flex items-end gap-2 rounded-3",
                  mine ? "flex-row-reverse" : "flex-row",
                  focusRing,
                )}
              >
                {!mine && (
                  <span
                    aria-hidden
                    className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[10px] text-ink-2"
                  >
                    {initialsOf(message.author)}
                  </span>
                )}
                <div
                  className={cn(
                    "relative max-w-[82%] rounded-3 px-3 py-2 text-sm leading-snug",
                    mine
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-foreground",
                  )}
                >
                  {quoted && (
                    <button
                      type="button"
                      onClick={(event) =>
                        jumpTo(quoted.id, event.currentTarget)
                      }
                      aria-label={`Jump to ${quoted.author}'s message at ${quoted.at}`}
                      className={cn(
                        "mb-1.5 flex w-full flex-col items-start gap-0.5 rounded-2 border-l-2 px-2 py-1 text-left transition-colors",
                        mine
                          ? "border-primary-foreground/60 bg-primary-foreground/10 hover:bg-primary-foreground/20"
                          : "border-cobalt-bright bg-surface-1 hover:bg-accent",
                        focusRing,
                      )}
                    >
                      <span
                        className={cn(
                          "font-mono text-[10px] tracking-[0.08em] uppercase",
                          mine ? "text-primary-foreground/80" : "text-ink-3",
                        )}
                      >
                        {quoted.author} · {quoted.at}
                      </span>
                      <span
                        className={cn(
                          "line-clamp-1 text-xs",
                          mine ? "text-primary-foreground" : "text-ink-2",
                        )}
                      >
                        {quoted.text}
                      </span>
                    </button>
                  )}
                  <span className="sr-only">
                    {message.author}, {message.at}.{" "}
                  </span>
                  {message.text}
                  <span
                    aria-hidden
                    className="ml-2 font-mono text-[10px] tabular-nums opacity-70"
                  >
                    {message.at}
                  </span>

                  {/* Keyed by the jump count so a repeat jump remounts a fresh
                      glow instead of topping up one that is still fading. */}
                  {lit && (
                    <motion.span
                      key={lit.nonce}
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-0 rounded-3 shadow-[0_0_0_2px_var(--accent-bright)]",
                        mine ? "bg-primary-foreground" : "bg-cobalt-bright",
                      )}
                      initial={{ opacity: 0.4 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        duration: durations.page,
                        ease: easings.exit,
                      }}
                      onAnimationComplete={() =>
                        setGlow((prev) =>
                          prev?.nonce === lit.nonce ? null : prev,
                        )
                      }
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <AnimatePresence>
        {back !== null && (
          <motion.div
            key="back"
            className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
            initial={
              motionSafe ? { opacity: 0, y: distances.step } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor() }}
            transition={motionSafe ? { ...springs.snap, opacity: fade } : fade}
          >
            <button
              type="button"
              onClick={goBack}
              className={cn(
                "pointer-events-auto flex h-8 items-center gap-1.5 rounded-full border border-hairline-strong bg-popover px-3 text-xs font-medium text-popover-foreground shadow-raised transition-colors hover:bg-accent",
                focusRing,
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
                className="size-3.5 shrink-0"
              >
                <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" />
              </svg>
              Back
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
