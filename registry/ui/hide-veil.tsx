"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VeilMessage = {
  id: string;
  author: string;
  /** Sent time, already formatted by the host. */
  time: string;
  text: string;
  /** Set it and the message is veiled. Written as a sentence. */
  hiddenReason?: string;
};

export type HideVeilProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** A callback ref for the scroll box, so a host can jump the thread from
   *  outside it. Called with the node on mount and with null on unmount. */
  scrollRef?: (node: HTMLDivElement | null) => void;
  /** The thread, oldest first. */
  messages: VeilMessage[];
  /** Controlled revealed ids. */
  revealed?: string[];
  /** Initial revealed ids for uncontrolled usage. @default [] */
  defaultRevealed?: string[];
  /** Fires with the next set from any change. */
  onRevealedChange?: (ids: string[]) => void;
  /** Fires once per change, saying which message moved and why. */
  onRevealChange?: (
    id: string,
    revealed: boolean,
    cause: "press" | "scroll",
  ) => void;
  /** Whether a revealed message re-veils when it leaves the box. @default true */
  reVeilOnScroll?: boolean;
  /** Tallest the thread grows before it scrolls. @default 240 */
  maxHeight?: number;
  /** The veil's control. @default "Show" */
  showLabel?: string;
  /** The revealed message's control. @default "Hide again" */
  hideLabel?: string;
  /** Names the thread for assistive technology. */
  label: string;
  className?: string;
};

const NONE: string[] = [];

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const FADE = { duration: durations.fast, ease: easings.enter } as const;

/** SVG ids must survive url(#…) parsing — strip useId's sigil characters. */
const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Never double a full stop the quoted words already carry. */
const endStop = (sentence: string): string =>
  /[.!?]$/.test(sentence.trim()) ? sentence.trim() : `${sentence.trim()}.`;

const rowSentence = (message: VeilMessage, shown: boolean): string => {
  if (!message.hiddenReason) return `${message.author}, ${message.time}.`;
  return shown
    ? `${message.author}, ${message.time}, hidden by a host and now showing.`
    : `${message.author}, ${message.time}, hidden by a host.`;
};

/** The bar's own material: hairlines at 45°, drawn rather than shipped, with an
 *  id no two instances can share. */
function Hatch({ id }: { id: string }) {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full text-ink-3"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern
          id={id}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="7"
            stroke="currentColor"
            strokeWidth="1.25"
            opacity="0.35"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

type VeilRowProps = {
  message: VeilMessage;
  shown: boolean;
  showId: string;
  hideId: string;
  hatchId: string;
  scroller: HTMLDivElement | null;
  reVeilOnScroll: boolean;
  motionSafe: boolean;
  showLabel: string;
  hideLabel: string;
  onPress: (message: VeilMessage, next: boolean) => void;
  awayRef: React.RefObject<(message: VeilMessage) => void>;
};

function VeilRow({
  message,
  shown,
  showId,
  hideId,
  hatchId,
  scroller,
  reVeilOnScroll,
  motionSafe,
  showLabel,
  hideLabel,
  onPress,
  awayRef,
}: VeilRowProps) {
  const rowRef = React.useRef<HTMLLIElement | null>(null);
  const reason = message.hiddenReason;

  // The observer waits for the scroll box to arrive rather than reading a ref
  // that is null on the frame the effect first runs, and it is only armed while
  // there is something revealed to take back.
  React.useEffect(() => {
    if (!reason || !shown || !reVeilOnScroll || !scroller) return;
    const node = rowRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) continue;
          // Somebody reading with a keyboard has not looked away.
          if (node.contains(document.activeElement)) continue;
          awayRef.current(message);
        }
      },
      { root: scroller, threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reason, shown, reVeilOnScroll, scroller, message, awayRef]);

  const wipe = motionSafe
    ? { duration: durations.base, ease: easings.move }
    : FADE;

  return (
    <li ref={rowRef} className="flex flex-col gap-1">
      <span className="sr-only">{rowSentence(message, shown)}</span>
      <div className="flex h-5 items-center gap-1.5 px-1">
        <span aria-hidden className="text-[11px] font-medium text-ink-2">
          {message.author}
        </span>
        <span aria-hidden className="text-[11px] text-ink-3 tabular-nums">
          {message.time}
        </span>
        {reason && (
          <motion.button
            type="button"
            id={hideId}
            tabIndex={shown ? 0 : -1}
            aria-hidden={!shown}
            aria-label={`Hide the message from ${message.author} again.`}
            onClick={() => onPress(message, false)}
            animate={{ opacity: shown ? 1 : 0 }}
            transition={FADE}
            className={cn(
              "flex h-5 items-center rounded-1 px-1.5 text-[10px] font-medium text-ink-3 transition-colors hover:bg-accent hover:text-accent-foreground",
              !shown && "pointer-events-none",
              focusRing,
            )}
          >
            {hideLabel}
          </motion.button>
        )}
      </div>

      <div className="relative max-w-[92%] overflow-hidden rounded-3 rounded-bl-1 bg-surface-2 px-3 py-2">
        <p
          aria-hidden={Boolean(reason) && !shown}
          className="text-sm leading-snug wrap-break-word text-foreground"
        >
          {message.text}
        </p>

        {reason && (
          <motion.div
            aria-hidden={shown}
            // Revealing wipes rather than fades: the left inset walks to 100%,
            // so the message is uncovered left to right like a hand pulled off
            // a page. A clip is a tween; it never springs.
            animate={{
              clipPath:
                motionSafe && shown
                  ? "inset(0% 0% 0% 100%)"
                  : "inset(0% 0% 0% 0%)",
              opacity: motionSafe ? 1 : shown ? 0 : 1,
            }}
            transition={wipe}
            className={cn(
              "absolute inset-0 flex items-center gap-1.5 bg-surface-1 px-2",
              shown && "pointer-events-none",
            )}
          >
            <Hatch id={hatchId} />
            {/* Two lines of reason, not one truncated to a stub: the bar is
                the only place the words appear before the message does. */}
            <span className="relative line-clamp-2 min-w-0 flex-1 text-[11px] leading-snug text-ink-3">
              {reason}
            </span>
            <button
              type="button"
              id={showId}
              tabIndex={shown ? -1 : 0}
              aria-label={`Show the message from ${message.author}. Hidden by a host: ${endStop(reason)}`}
              onClick={() => onPress(message, true)}
              className={cn(
                "relative flex h-6 shrink-0 items-center rounded-1 border border-hairline-strong bg-card px-2 text-[11px] font-medium text-ink-2 transition-colors hover:bg-accent hover:text-accent-foreground",
                focusRing,
              )}
            >
              {showLabel}
            </button>
          </motion.div>
        )}
      </div>
    </li>
  );
}

/**
 * A host has hidden a message, and the thread says so honestly: the bubble is
 * covered by a hatched bar — a procedural SVG pattern whose id is prefixed with
 * `useId()`, so two instances on a page never collide — carrying the reason in
 * plain words and a Show control. Revealing wipes the veil rather than fading
 * it: the clip's left inset walks from 0% to 100% on a `durations.base` tween on
 * the move ease, because a clip is a tween and never a spring, and the message
 * beneath is uncovered left to right. The veil re-veils on scroll away: an
 * IntersectionObserver rooted on the thread's own scroll box watches each
 * revealed bubble, and when one leaves the box the veil wipes back the way it
 * came — unless focus is still inside that message, because someone reading
 * with a keyboard has not looked away.
 *
 * Nothing here needs a scroll to work. Show and Hide again are both buttons,
 * they hand focus to each other so no key is ever stranded on a control that
 * has been clipped out of reach, the veiled text is `aria-hidden` while the eye
 * cannot see it, and a polite region speaks one frozen sentence per change that
 * names the cause. Under reduced motion the veil swaps on a fast opacity tween
 * with no clip travel, and the re-veil on scroll still happens, because what is
 * hidden is information.
 */
export function HideVeil({
  ref,
  scrollRef,
  messages,
  revealed,
  defaultRevealed = NONE,
  onRevealedChange,
  onRevealChange,
  reVeilOnScroll = true,
  maxHeight = 240,
  showLabel = "Show",
  hideLabel = "Hide again",
  label,
  className,
}: HideVeilProps) {
  const motionSafe = useMotionSafe();
  const baseId = safeId(React.useId());
  const [ownRevealed, setOwnRevealed] =
    React.useState<string[]>(defaultRevealed);
  const open = revealed ?? ownRevealed;
  const [said, setSaid] = React.useState("");
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const [focusWish, setFocusWish] = React.useState<{
    id: string;
    tick: number;
  } | null>(null);

  // A stable ref callback: an inline one is detached and re-attached on every
  // render, and the null it is handed between the two would spin the state it
  // writes into forever. The host's own callback is read from a ref for the
  // same reason.
  const scrollRefLatest = React.useRef(scrollRef);
  React.useEffect(() => {
    scrollRefLatest.current = scrollRef;
  });
  const setScrollNode = React.useCallback((node: HTMLDivElement | null) => {
    setScroller(node);
    scrollRefLatest.current?.(node);
  }, []);

  React.useEffect(() => {
    if (!focusWish) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(focusWish.id)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusWish]);

  const commit = (message: VeilMessage, next: boolean) => {
    const ids = next
      ? open.includes(message.id)
        ? open
        : [...open, message.id]
      : open.filter((id) => id !== message.id);
    if (revealed === undefined) setOwnRevealed(ids);
    onRevealedChange?.(ids);
  };

  const press = (message: VeilMessage, next: boolean) => {
    commit(message, next);
    setSaid(
      next
        ? `The message from ${message.author} is showing.`
        : `The message from ${message.author} is hidden again.`,
    );
    onRevealChange?.(message.id, next, "press");
    // The two controls hand focus to each other; a clipped button is out of
    // reach, so nothing is left standing on one.
    const to = next
      ? `${baseId}-hide-${message.id}`
      : `${baseId}-show-${message.id}`;
    setFocusWish((prev) => ({ id: to, tick: (prev?.tick ?? 0) + 1 }));
  };

  // Held in a ref so the row's observer never restarts on a parent re-render,
  // and so no parent callback is ever called from inside a state updater.
  const away = (message: VeilMessage) => {
    commit(message, false);
    setSaid(
      `The message from ${message.author} scrolled away and is hidden again.`,
    );
    onRevealChange?.(message.id, false, "scroll");
  };
  const awayRef = React.useRef(away);
  React.useEffect(() => {
    awayRef.current = away;
  });

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <div
        ref={setScrollNode}
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
            <VeilRow
              key={message.id}
              message={message}
              shown={open.includes(message.id)}
              showId={`${baseId}-show-${message.id}`}
              hideId={`${baseId}-hide-${message.id}`}
              hatchId={`${baseId}-hatch-${safeId(message.id)}`}
              scroller={scroller}
              reVeilOnScroll={reVeilOnScroll}
              motionSafe={motionSafe}
              showLabel={showLabel}
              hideLabel={hideLabel}
              onPress={press}
              awayRef={awayRef}
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
