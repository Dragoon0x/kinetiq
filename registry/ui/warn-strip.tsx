"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type WarnMessage = {
  id: string;
  author: string;
  /** Sent time, already formatted by the host. */
  time: string;
  text: string;
  /** Set it and a strip covers the message. Written as a short phrase. */
  caution?: string;
};

export type WarnStripProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The thread, oldest first. */
  messages: WarnMessage[];
  /** Controlled ids whose strips are down. */
  shown?: string[];
  /** Initial ids for uncontrolled usage. @default [] */
  defaultShown?: string[];
  /** Fires with the next set from either direction. */
  onShownChange?: (ids: string[]) => void;
  /** Fires when a strip is lowered. */
  onShow?: (id: string) => void;
  /** Fires when a strip is raised again. */
  onCover?: (id: string) => void;
  /** The strip's control. @default "Show message" */
  showLabel?: string;
  /** The meta row's control. @default "Cover" */
  coverLabel?: string;
  /** The word before the reason on the strip. @default "Caution" */
  cautionLead?: string;
  /** Tallest the thread grows before it scrolls. @default 300 */
  maxHeight?: number;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const NONE: string[] = [];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** Never double a full stop the quoted words already carry. */
const endStop = (phrase: string): string =>
  /[.!?]$/.test(phrase.trim()) ? phrase.trim() : `${phrase.trim()}.`;

/**
 * One observer, one target. Whichever face is out of flow is absolutely
 * positioned, so the measured content height is already the right answer and
 * the box is correct on the very first paint — a caution must never flash the
 * message it is covering while a measurement lands. Nothing is read during
 * render, and the first measurement is written outright rather than animated.
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

  return [ref, height, content] as const;
}

function CautionGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("mt-px size-4 shrink-0", className)}
    >
      <path d="M8 2.5 14.5 13.5h-13z M8 6.75v3 M8 11.75h.01" />
    </svg>
  );
}

type WarnRowProps = {
  message: WarnMessage;
  down: boolean;
  coverId: string;
  showId: string;
  cautionLead: string;
  showLabel: string;
  coverLabel: string;
  motionSafe: boolean;
  onPress: (message: WarnMessage, next: boolean) => void;
};

function WarnRow({
  message,
  down,
  coverId,
  showId,
  cautionLead,
  showLabel,
  coverLabel,
  motionSafe,
  onPress,
}: WarnRowProps) {
  const [contentRef, height, contentHeight] =
    useMeasuredHeight<HTMLDivElement>(motionSafe);
  const caution = message.caution;
  const covered = Boolean(caution) && !down;

  return (
    <li className="flex flex-col gap-1">
      <span className="sr-only">
        {caution
          ? `${message.author}, ${message.time}, ${down ? "showing" : "covered by a caution"}.`
          : `${message.author}, ${message.time}.`}
      </span>
      <div className="flex h-5 items-center gap-1.5 px-1">
        <span aria-hidden className="text-[11px] font-medium text-ink-2">
          {message.author}
        </span>
        <span aria-hidden className="text-[11px] text-ink-3 tabular-nums">
          {message.time}
        </span>
        {caution && (
          <motion.button
            type="button"
            id={coverId}
            tabIndex={down ? 0 : -1}
            aria-hidden={!down}
            aria-label={`Cover the message from ${message.author} again.`}
            onClick={() => onPress(message, false)}
            animate={{ opacity: down ? 1 : 0 }}
            transition={FADE}
            className={cn(
              "flex h-5 items-center rounded-1 px-1.5 text-[10px] font-medium text-ink-3 transition-colors hover:bg-accent hover:text-accent-foreground",
              !down && "pointer-events-none",
              focusRing,
            )}
          >
            {coverLabel}
          </motion.button>
        )}
      </div>

      <motion.div
        style={{ height }}
        className="relative max-w-[92%] overflow-hidden rounded-3 rounded-bl-1 bg-surface-2"
      >
        <div ref={contentRef} className="relative">
          <p
            aria-hidden={covered}
            className={cn(
              "px-3 py-2 text-sm leading-snug wrap-break-word text-foreground",
              covered && "absolute inset-x-0 top-0",
            )}
          >
            {message.text}
          </p>

          {caution && (
            <motion.div
              aria-hidden={down}
              // The strip travels the measured height of the message while the
              // box glides to that same height, so the gap between the two is
              // exactly the strip still on screen: it leaves at a constant
              // read, from full to nothing, whichever is taller.
              animate={{
                y: motionSafe && down ? (contentHeight ?? 0) : 0,
                opacity: motionSafe ? 1 : down ? 0 : 1,
              }}
              transition={motionSafe ? springs.glide : FADE}
              className={cn(
                // Opaque: a caution the message reads straight through is no
                // cover at all. The surface carries the tint above it.
                "relative z-10 flex flex-col gap-1.5 bg-surface-2 px-3 py-2",
                down && "pointer-events-none absolute inset-x-0 top-0",
              )}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-warn/12"
              />
              <span className="relative flex items-start gap-1.5 text-[11px] leading-snug text-ink-2">
                <CautionGlyph className="text-warn" />
                <span>{`${cautionLead}: ${caution}`}</span>
              </span>
              <button
                type="button"
                id={showId}
                tabIndex={down ? -1 : 0}
                aria-expanded={down}
                aria-label={`Show the message from ${message.author}. ${cautionLead}: ${endStop(caution)}`}
                onClick={() => onPress(message, true)}
                className={cn(
                  "relative flex h-6 items-center self-start rounded-1 border border-hairline-strong bg-card px-2 text-[11px] font-medium text-ink-2 transition-colors hover:bg-accent hover:text-accent-foreground",
                  focusRing,
                )}
              >
                {showLabel}
              </button>
              {/* The one thing that fades: the line the strip casts on the
                  message thins as the strip drops. */}
              <motion.span
                aria-hidden
                animate={{ opacity: down ? 0 : 1 }}
                transition={FADE}
                className="absolute inset-x-0 bottom-0 h-px bg-warn/40"
              />
            </motion.div>
          )}
        </div>
      </motion.div>
    </li>
  );
}

/**
 * A caution is a door, not a fog. A warned message renders as a bubble that is
 * entirely strip — a warn-washed bar carrying the reason in words and a Show
 * control — and the bubble's height is the strip's height, measured by a
 * ResizeObserver rather than reserved. Pressing the control lowers the strip: it
 * slides down its own height on `glide` while the box glides in the same beat to
 * the height of the message underneath, so the strip does not vanish, it goes
 * down and the words are what is left. The line the strip casts thins on a tween
 * as it drops, which is the only thing here that fades. Covering raises it on
 * the same spring, from the same measurement.
 *
 * Whichever face is out of flow is the absolutely positioned one, so the box is
 * right on the first paint and no caution ever flashes the message it covers.
 * Every warned message keeps its own strip and its own reason, the covered text
 * is `aria-hidden` — a caution a screen reader reads straight past is not a
 * caution — the Show control names itself as a whole sentence carrying the
 * reason, and a polite region speaks one frozen sentence per change. Under
 * reduced motion the strip cross-fades instead of sliding and the box swaps on a
 * fast tween; the message still arrives and the box still fits it.
 */
export function WarnStrip({
  ref,
  messages,
  shown,
  defaultShown = NONE,
  onShownChange,
  onShow,
  onCover,
  showLabel = "Show message",
  coverLabel = "Cover",
  cautionLead = "Caution",
  maxHeight = 300,
  label,
  className,
}: WarnStripProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const [ownShown, setOwnShown] = React.useState<string[]>(defaultShown);
  const down = shown ?? ownShown;
  const [said, setSaid] = React.useState("");
  const [focusWish, setFocusWish] = React.useState<{
    id: string;
    tick: number;
  } | null>(null);

  React.useEffect(() => {
    if (!focusWish) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(focusWish.id)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusWish]);

  const press = (message: WarnMessage, next: boolean) => {
    const ids = next
      ? down.includes(message.id)
        ? down
        : [...down, message.id]
      : down.filter((id) => id !== message.id);
    if (shown === undefined) setOwnShown(ids);
    onShownChange?.(ids);
    setSaid(
      next
        ? `The message from ${message.author} is showing.`
        : `The message from ${message.author} is covered again.`,
    );
    if (next) onShow?.(message.id);
    else onCover?.(message.id);
    // The two controls hand focus to each other, so a press never leaves a key
    // standing on a control that has just slid out of the box.
    const to = next
      ? `${baseId}-cover-${message.id}`
      : `${baseId}-show-${message.id}`;
    setFocusWish((prev) => ({ id: to, tick: (prev?.tick ?? 0) + 1 }));
  };

  return (
    <div ref={ref} className={cn("w-full", className)}>
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
          {messages.map((message) => (
            <WarnRow
              key={message.id}
              message={message}
              down={down.includes(message.id)}
              coverId={`${baseId}-cover-${message.id}`}
              showId={`${baseId}-show-${message.id}`}
              cautionLead={cautionLead}
              showLabel={showLabel}
              coverLabel={coverLabel}
              motionSafe={motionSafe}
              onPress={press}
            />
          ))}
        </ol>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
