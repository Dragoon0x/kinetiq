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

export type LineMessage = {
  id: string;
  /** "me" reads as "You"; anything else is the sender's name. */
  from: string;
  text: string;
  /** Already formatted — nothing here reads a clock. */
  time?: string;
  /** The message this one answers. */
  replyTo?: string;
};

export type ReplyThreadLineProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: LineMessage[];
  /** Controlled id of the reply whose line is drawn. */
  activeId?: string | null;
  /** Initial drawn reply for uncontrolled usage. @default null */
  defaultActiveId?: string | null;
  /** Fires from hover, focus, blur and Escape. */
  onActiveChange?: (id: string | null) => void;
  /** Fires when Enter on a reply moves focus to the message it answers. */
  onJumpToParent?: (parentId: string, replyId: string) => void;
  /** Names the thread list for assistive technology. */
  label: string;
  className?: string;
};

/** The gutter the riser runs in, and the lift the answered message takes. */
const GUTTER = 5;
const LIFT = distances.nudge;

type Row = { top: number; left: number; height: number };
type Geometry = { width: number; height: number; rows: Record<string, Row> };

const EMPTY: Geometry = { width: 0, height: 0, rows: {} };

/** Trig and layout floats are rounded before they reach an SVG attribute. */
const round = (value: number): number => Number(value.toFixed(3));

const nameOf = (message: LineMessage) =>
  message.from === "me" ? "You" : message.from;

const stamp = (message: LineMessage) =>
  message.time ? `${nameOf(message)} at ${message.time}` : nameOf(message);

/**
 * A thread that can show what a reply answers. Pointing at a reply — or walking
 * to it with the arrow keys — draws a line from its own edge up to the message
 * it replies to: one path of a fixed command count (elbow, riser, elbow,
 * whether the parent is one message above or six) whose `pathLength` runs 0 to
 * 1 on `glide`, so the stroke is drawn upward rather than appearing whole. The
 * answered message lifts by `distances.nudge` on `snap` and takes a hairline
 * ring — enough to say "this one", not enough to disturb the column. Leaving
 * fades the line on the exit ease rather than un-drawing it, because rewinding
 * a stroke reads as an undo of something you did.
 *
 * The geometry is measured, never assumed: the frame is held in state so a
 * ResizeObserver can bind to it the moment it arrives, every bubble registers
 * itself, and each coordinate is rounded to three decimals before it reaches
 * the `d` attribute so the server and the browser agree on every digit. Under
 * reduced motion the line appears at full length with a fade and the answered
 * message takes the ring without travelling.
 */
export function ReplyThreadLine({
  ref,
  messages,
  activeId,
  defaultActiveId = null,
  onActiveChange,
  onJumpToParent,
  label,
  className,
}: ReplyThreadLineProps) {
  const motionSafe = useMotionSafe();

  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultActiveId,
  );
  const current = activeId === undefined ? uncontrolled : activeId;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");
  const [frame, setFrame] = React.useState<HTMLDivElement | null>(null);
  const [geometry, setGeometry] = React.useState<Geometry>(EMPTY);

  const itemRefs = React.useRef(new Map<string, HTMLLIElement>());
  const bubbleRefs = React.useRef(new Map<string, HTMLElement>());

  const byId = React.useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );

  // Bound to the frame the moment it arrives — not in a mount-only effect
  // reading a ref that is still null — and to every bubble, because a bubble
  // that rewraps moves the line's ends as surely as a resized column does.
  React.useEffect(() => {
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const rows: Record<string, Row> = {};
      // offsetTop, not a client rect: the answered message is lifted by a
      // transform while its line is drawn, and a rect would measure the lift
      // and then have it subtracted a second time.
      for (const [id, node] of bubbleRefs.current) {
        rows[id] = {
          top: round(node.offsetTop),
          left: round(node.offsetLeft),
          height: round(node.offsetHeight),
        };
      }
      const next: Geometry = {
        width: round(frame.offsetWidth),
        height: round(frame.offsetHeight),
        rows,
      };
      setGeometry((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
      );
    });
    observer.observe(frame);
    for (const node of bubbleRefs.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [frame, messages]);

  const setActive = (id: string | null) => {
    if (id === current) return;
    if (activeId === undefined) setUncontrolled(id);
    onActiveChange?.(id);
    const reply = id === null ? undefined : byId.get(id);
    const parent = reply?.replyTo ? byId.get(reply.replyTo) : undefined;
    // Frozen here, at the change: a host that edits the thread afterwards
    // cannot make the region read a connection that has stopped being true.
    setAnnounce(
      reply && parent ? `${stamp(reply)} answers ${stamp(parent)}` : "",
    );
  };

  const activeReply = current === null ? undefined : byId.get(current);
  const activeParent = activeReply?.replyTo
    ? byId.get(activeReply.replyTo)
    : undefined;

  const from = activeReply ? geometry.rows[activeReply.id] : undefined;
  const to = activeParent ? geometry.rows[activeParent.id] : undefined;
  // Four commands whatever the distance: motion cannot interpolate a `d` whose
  // command count changes, and a connector that is sometimes three segments
  // and sometimes four is exactly that trap.
  // The answered message has already lifted by the time the line lands on it,
  // so the landing point is lifted with it.
  const endY =
    to === undefined
      ? 0
      : round(to.top + to.height / 2 - (motionSafe ? LIFT : 0));
  const path =
    from && to
      ? `M ${round(from.left)} ${round(Math.max(0, from.top - 4))} H ${GUTTER} V ${endY} H ${round(to.left)}`
      : null;

  const ids = messages.map((message) => message.id);
  const known = focusId === null ? -1 : ids.indexOf(focusId);
  const currentIndex = known === -1 ? 0 : known;

  const focusAt = (index: number) => {
    const clamped = Math.min(ids.length - 1, Math.max(0, index));
    const id = ids[clamped];
    if (!id) return;
    itemRefs.current.get(id)?.focus({ preventScroll: true });
  };

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    message: LineMessage,
    index: number,
  ) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(ids.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActive(null);
    } else if (event.key === "Enter" && message.replyTo) {
      event.preventDefault();
      const parent = byId.get(message.replyTo);
      if (!parent) return;
      onJumpToParent?.(parent.id, message.id);
      itemRefs.current.get(parent.id)?.focus({ preventScroll: true });
    }
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;
  const reading =
    activeReply && activeParent
      ? `${stamp(activeReply)} answers ${stamp(activeParent)}`
      : "No line drawn";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-2", className)}>
      <div ref={setFrame} className="relative">
        <ol
          role="list"
          aria-label={label}
          onPointerLeave={() => {
            // Focus outranks the pointer: walking away from a message the
            // keyboard is still on must not take its line with it.
            const active = document.activeElement;
            if (active instanceof Node && frame?.contains(active)) return;
            setActive(null);
          }}
          onBlur={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next))
              return;
            setActive(null);
          }}
          className="flex flex-col gap-2.5 py-0.5 pr-0.5 pl-4"
        >
          {messages.map((message, index) => {
            const own = message.from === "me";
            const parent = message.replyTo
              ? byId.get(message.replyTo)
              : undefined;
            const isReply = Boolean(parent);
            const lit = activeParent?.id === message.id;
            const drawn = activeReply?.id === message.id;

            return (
              <li
                key={message.id}
                ref={(node) => {
                  if (node) itemRefs.current.set(message.id, node);
                  else itemRefs.current.delete(message.id);
                }}
                tabIndex={index === currentIndex ? 0 : -1}
                aria-label={`${stamp(message)}${
                  parent ? `, replying to ${stamp(parent)}` : ""
                }: ${message.text}${lit ? `. Answered by ${activeReply ? stamp(activeReply) : ""}` : ""}`}
                onKeyDown={(event) => onKeyDown(event, message, index)}
                onFocus={() => {
                  setFocusId(message.id);
                  setActive(isReply ? message.id : null);
                }}
                onPointerEnter={() => setActive(isReply ? message.id : null)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-3 outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
                    <span className="font-mono tabular-nums">
                      {message.time}
                    </span>
                  ) : null}
                  {isReply ? (
                    <span aria-hidden className="text-ink-3/80">
                      reply
                    </span>
                  ) : null}
                </span>

                <motion.p
                  ref={(node) => {
                    if (node) bubbleRefs.current.set(message.id, node);
                    else bubbleRefs.current.delete(message.id);
                  }}
                  initial={false}
                  animate={{ y: lit && motionSafe ? -LIFT : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  className={cn(
                    "relative max-w-[86%] min-w-0 rounded-3 px-3 py-1.5 text-sm leading-5 wrap-break-word text-foreground transition-colors",
                    own
                      ? "rounded-br-1 bg-surface-2"
                      : "rounded-bl-1 border border-hairline bg-surface-1",
                    lit && "bg-cobalt-wash ring-1 ring-cobalt-bright/60",
                    drawn && "ring-1 ring-cobalt-bright/30",
                  )}
                >
                  {message.text}
                </motion.p>
              </li>
            );
          })}
        </ol>

        {/* Sized by the frame it covers, so the drawing is measured rather than
            guessed and never drifts from the column it belongs to. Nothing is
            drawn before the first measurement, so the server and the first
            client render agree on an empty overlay. */}
        {geometry.width > 0 ? (
          <svg
            aria-hidden
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-cobalt-bright"
          >
            <AnimatePresence initial={false}>
              {path && to ? (
                <motion.g
                  key={`${activeReply?.id}-${activeParent?.id}`}
                  initial={{ opacity: motionSafe ? 1 : 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={fade}
                >
                  <motion.path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: motionSafe ? 0 : 1 }}
                    animate={{ pathLength: 1 }}
                    transition={motionSafe ? springs.glide : { duration: 0 }}
                  />
                  <motion.circle
                    cx={round(to.left)}
                    cy={endY}
                    r={2.5}
                    fill="currentColor"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: durations.fast,
                      ease: easings.enter,
                      delay: motionSafe ? durations.base : 0,
                    }}
                  />
                </motion.g>
              ) : null}
            </AnimatePresence>
          </svg>
        ) : null}
      </div>

      {/* Both readings live in one grid cell and cross-fade: a reading that
          waited for the previous one to leave would never catch rapid keys. */}
      <div className="grid border-t border-hairline pt-2 text-[11px] leading-4 text-ink-3">
        <AnimatePresence initial={false}>
          <motion.span
            key={reading}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
            className="col-start-1 row-start-1 truncate"
          >
            {reading}
          </motion.span>
        </AnimatePresence>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
