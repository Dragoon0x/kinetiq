"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoldMessage = {
  id: string;
  author: string;
  /** The message; newlines are kept. */
  text: string;
  /** Clock time as `HH:mm`. */
  at: string;
  mine?: boolean;
};

export type LongFoldProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread in order. */
  messages: FoldMessage[];
  /** Lines shown while folded. @default 4 */
  lines?: number;
  /** Controlled ids of unfolded messages. */
  open?: string[];
  /** Initial unfolded ids for uncontrolled usage. @default [] */
  defaultOpen?: string[];
  /** Fires from the press that folds or unfolds a message. */
  onOpenChange?: (id: string, open: boolean) => void;
  /** Disclosure copy while folded. @default "Read more" */
  moreLabel?: string;
  /** Disclosure copy while open. @default "Show less" */
  lessLabel?: string;
  /** Names the thread for assistive technology. @default "Thread" */
  label?: string;
  className?: string;
};

type Box = { full: number; line: number };

const UNMEASURED: Box = { full: 0, line: 0 };
const NONE: string[] = [];

/** Breathing room kept above a bubble when the box scrolls back to its top. */
const KEEP_PAD = 12;

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

type BubbleProps = {
  message: FoldMessage;
  lines: number;
  open: boolean;
  onToggle: (open: boolean) => void;
  moreLabel: string;
  lessLabel: string;
  motionSafe: boolean;
  boxRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * One bubble that measures itself. The clamp is a height rather than a
 * `line-clamp`, so it can travel: folded is exactly `lines` line boxes, open
 * is the text's border box from a ResizeObserver, and the two are joined on
 * `glide`. Nothing is reserved and a message that fits shows no control.
 */
function FoldBubble({
  message,
  lines,
  open,
  onToggle,
  moreLabel,
  lessLabel,
  motionSafe,
  boxRef,
}: BubbleProps) {
  const regionId = React.useId();
  const itemRef = React.useRef<HTMLLIElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<Box>(UNMEASURED);
  const mine = message.mine === true;

  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    // Fires once on observe and again on reflow, so the open height stays
    // honest when the column narrows; nothing is measured during render.
    const observer = new ResizeObserver(() => {
      const styles = window.getComputedStyle(node);
      const parsed = Number.parseFloat(styles.lineHeight);
      const line = Number.isFinite(parsed)
        ? parsed
        : Number.parseFloat(styles.fontSize) * 1.5;
      const full = Math.ceil(node.getBoundingClientRect().height);
      setBox((prev) =>
        prev.full === full && prev.line === line ? prev : { full, line },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measured = box.line > 0;
  const folded = Math.round(box.line * lines);
  // Half a line of slack: a message that overruns by a rounding error is not
  // worth a control, and the fade would sit over nothing.
  const foldable = measured && box.full > folded + box.line * 0.5;
  const target: number | "auto" | null = !measured
    ? null
    : !foldable
      ? "auto"
      : open
        ? box.full
        : folded;

  // Before the first measurement the clamp is plain CSS — `1lh` is the line
  // box the text is about to lay out in — so the server's markup already
  // folds. The first number is written outright: given a first target after
  // mounting with a string, motion would treat it as current and paint
  // nothing. Every later change animates.
  const height = useMotionValue<number | string>(`calc(${lines} * 1lh)`);
  const seeded = React.useRef(false);
  React.useEffect(() => {
    if (target === null) return;
    if (!seeded.current || target === "auto") {
      seeded.current = true;
      height.set(target);
      return;
    }
    const controls = animate(
      height,
      target,
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => controls.stop();
  }, [target, height, motionSafe]);

  // Folding back is where a plain read-more loses you: the bottom of a long
  // message was under your eye, and the collapse leaves you somewhere above
  // it. If the bubble's top has scrolled out, the box glides to it alongside
  // the collapse so the message you closed is still in view.
  const wasOpen = React.useRef(open);
  React.useEffect(() => {
    const closing = wasOpen.current && !open;
    wasOpen.current = open;
    const box = boxRef.current;
    const item = itemRef.current;
    if (!closing || !box || !item) return;
    const top = Math.max(0, item.offsetTop - KEEP_PAD);
    if (box.scrollTop <= top) return;
    if (!motionSafe) {
      box.scrollTop = top;
      return;
    }
    const controls = animate(box.scrollTop, top, {
      ...springs.glide,
      onUpdate: (value) => {
        box.scrollTop = value;
      },
    });
    return () => controls.stop();
  }, [open, boxRef, motionSafe]);

  return (
    <li
      ref={itemRef}
      className={cn(
        "flex items-end gap-2",
        mine ? "flex-row-reverse" : "flex-row",
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
          "flex max-w-[88%] min-w-0 flex-col rounded-3 px-3 py-2 text-sm leading-snug",
          mine
            ? "bg-primary text-primary-foreground"
            : "bg-surface-2 text-foreground",
        )}
      >
        <span className="sr-only">
          {message.author}, {message.at}.{" "}
        </span>
        <span
          aria-hidden
          className="mb-1 font-mono text-[10px] tracking-[0.08em] uppercase opacity-70"
        >
          {message.author} · {message.at}
        </span>
        <motion.div
          id={regionId}
          className="relative overflow-hidden"
          style={{ height }}
        >
          <div ref={innerRef} className="whitespace-pre-line">
            {message.text}
          </div>
          {foldable && (
            <motion.span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t to-transparent",
                mine ? "from-primary" : "from-surface-2",
              )}
              initial={false}
              animate={{ opacity: open ? 0 : 1 }}
              transition={{ duration: durations.base, ease: easings.move }}
            />
          )}
        </motion.div>
        {foldable && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={regionId}
            onClick={() => onToggle(!open)}
            className={cn(
              "mt-1.5 flex h-6 items-center gap-1 self-start rounded-1 text-xs font-medium transition-colors",
              mine
                ? "text-primary-foreground/85 hover:text-primary-foreground"
                : "text-cobalt-bright hover:text-foreground",
              focusRing,
            )}
          >
            {open ? lessLabel : moreLabel}
            <motion.svg
              viewBox="0 0 16 16"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5 shrink-0"
              initial={false}
              animate={{ rotate: open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <path d="m4 6.5 4 4 4-4" />
            </motion.svg>
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * A thread where a long message arrives folded. Any bubble taller than
 * `lines` line boxes clamps to exactly that many, fades its last line out in
 * the bubble's own colour and offers a read-more; unfolding joins the folded
 * height to the measured one on `glide`, the layout spring, while the fade
 * lifts on a tween and the chevron turns on `snap`. Folding back runs the
 * same spring in reverse and, if the bubble's top has scrolled away, glides
 * the box to it at the same time, so the message you just closed stays under
 * your eye.
 *
 * The disclosure is a real button with `aria-expanded` and `aria-controls`,
 * and the folded text is never hidden from assistive technology, so a reader
 * can hear the whole message without unfolding it. Under reduced motion the
 * heights swap at once, the fade still lifts, and the scroll correction is
 * set without a glide.
 */
export function LongFold({
  ref,
  messages,
  lines = 4,
  open,
  defaultOpen = NONE,
  onOpenChange,
  moreLabel = "Read more",
  lessLabel = "Show less",
  label = "Thread",
  className,
}: LongFoldProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const [ownOpen, setOwnOpen] = React.useState<string[]>(defaultOpen);
  const [announcement, setAnnouncement] = React.useState("");
  const openIds = open ?? ownOpen;

  const toggle = (message: FoldMessage, next: boolean) => {
    if (open === undefined) {
      setOwnOpen((prev) =>
        next
          ? prev.includes(message.id)
            ? prev
            : [...prev, message.id]
          : prev.filter((id) => id !== message.id),
      );
    }
    setAnnouncement(
      `${message.author}'s message ${next ? "unfolded" : "folded"}`,
    );
    onOpenChange?.(message.id, next);
  };

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      {/* Scroll anchoring is off so the fold-back correction owns the scroll
          position instead of fighting the browser for it. */}
      <div
        ref={boxRef}
        role="region"
        aria-labelledby={labelId}
        tabIndex={0}
        className={cn(
          "relative max-h-80 overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-surface-1 p-3 [overflow-anchor:none]",
          focusRing,
        )}
      >
        <ol role="list" className="flex flex-col gap-1.5">
          {messages.map((message) => (
            <FoldBubble
              key={message.id}
              message={message}
              lines={lines}
              open={openIds.includes(message.id)}
              onToggle={(next) => toggle(message, next)}
              moreLabel={moreLabel}
              lessLabel={lessLabel}
              motionSafe={motionSafe}
              boxRef={boxRef}
            />
          ))}
        </ol>
      </div>
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
