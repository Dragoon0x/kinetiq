"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ComposeBarProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled draft. */
  value?: string;
  /** Initial draft for uncontrolled usage. */
  defaultValue?: string;
  /** Fires from every keystroke and from the clear after a send. */
  onValueChange?: (value: string) => void;
  /** Fires from Enter or the Send control with the trimmed draft. */
  onSend?: (text: string) => void;
  /** Fires from the Attach control. */
  onAttach?: () => void;
  /** Fires from the observer whenever the measured line count changes. */
  onLinesChange?: (lines: number) => void;
  /** Fires as the textarea gains and loses focus. */
  onFocusChange?: (focused: boolean) => void;
  /** Lines the well grows to before the textarea scrolls. @default 6 */
  maxRows?: number;
  /** Keep it short: a placeholder that wraps reads as a second line. @default "Message" */
  placeholder?: string;
  /** Holds the composer and both controls. */
  disabled?: boolean;
  /** Names the textarea for assistive technology. */
  label: string;
  className?: string;
};

/** The field's typography is fixed so every height here is arithmetic. */
const LINE_PX = 20;
/** Vertical padding that centres one line on the 36px controls. */
const PAD_Y_PX = 14;
/** The controls' size plus their inset: the room the text leaves in block mode. */
const FOOTER_PX = 36 + 6;
/** Attach at rest sits 6px + 36px + 6px in from the right; its target is 6px in from the left. */
const ATTACH_REST_PX = 48;
const ATTACH_TRAVEL_BASE_PX = 6 + ATTACH_REST_PX + 36;

const FADE = { duration: durations.fast, ease: easings.enter } as const;

const wordCount = (text: string) =>
  text.trim() === "" ? 0 : text.trim().split(/\s+/).length;

/** Keeps a callback out of effect dependencies so a re-render never restarts the observer. */
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

type Box = { narrow: number; wide: number; width: number };

/**
 * A bar that makes room. One line in, the textarea shares a single row with
 * the attach and send controls, which sit together at its right end. Two
 * hidden mirrors carry the draft in the field's own type — one at the narrow
 * single-line column, one at the full column — and a ResizeObserver reads
 * their border boxes, never during render. The moment the narrow mirror wraps,
 * the bar switches to block mode: the well glides on `glide` to the wide
 * mirror's height plus a footer, the textarea takes the full column, and the
 * attach control slides on `glide` from beside send to the far left of the
 * footer while send stays anchored bottom-right — the two controls slide apart
 * to make room for the text between them. Past `maxRows` the well holds and
 * the textarea scrolls inside it.
 *
 * A dot beside the first line is dim while empty, cobalt while the draft is
 * being typed, and glows when the field is blurred with unsent text: a draft
 * you walked away from is the state worth flagging. Enter sends, Shift+Enter
 * breaks a line. Under reduced motion the well and the attach control swap on
 * fast tweens and the dot holds a steady ring instead of pulsing.
 */
export function ComposeBar({
  ref,
  value,
  defaultValue,
  onValueChange,
  onSend,
  onAttach,
  onLinesChange,
  onFocusChange,
  maxRows = 6,
  placeholder = "Message",
  disabled = false,
  label,
  className,
}: ComposeBarProps) {
  const motionSafe = useMotionSafe();
  const visible = React.useSyncExternalStore(
    subscribeVisibility,
    getVisible,
    getServerVisible,
  );
  const hintId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const draft = isControlled ? value : uncontrolled;
  const trimmed = draft.trim();
  const hasText = trimmed.length > 0;

  const [focused, setFocused] = React.useState(false);
  const [message, setMessage] = React.useState("");

  const commit = (next: string) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const barRef = React.useRef<HTMLDivElement | null>(null);
  const narrowRef = React.useRef<HTMLDivElement | null>(null);
  const wideRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<Box | null>(null);
  const linesRef = React.useRef(1);
  const latestLines = useLatest(onLinesChange);

  React.useEffect(() => {
    const bar = barRef.current;
    const narrow = narrowRef.current;
    const wide = wideRef.current;
    if (!bar || !narrow || !wide || typeof ResizeObserver === "undefined") {
      return;
    }
    // One observer for all three boxes: the mirrors give the two heights and
    // the bar's padding box gives the attach control its travel.
    const observer = new ResizeObserver(() => {
      const next: Box = {
        narrow: Math.round(narrow.offsetHeight),
        wide: Math.round(wide.offsetHeight),
        width: Math.round(bar.clientWidth),
      };
      setBox((prev) =>
        prev &&
        prev.narrow === next.narrow &&
        prev.wide === next.wide &&
        prev.width === next.width
          ? prev
          : next,
      );
      const lines = Math.max(
        1,
        Math.round((next.wide - PAD_Y_PX * 2) / LINE_PX),
      );
      if (lines !== linesRef.current) {
        linesRef.current = lines;
        latestLines.current?.(lines);
      }
    });
    observer.observe(bar);
    observer.observe(narrow);
    observer.observe(wide);
    return () => observer.disconnect();
  }, [latestLines]);

  // Block mode is decided by the narrow column alone, so the decision can
  // never feed back into the width that produced it.
  const oneLine = PAD_Y_PX * 2 + LINE_PX;
  const block = box !== null && box.narrow > oneLine;
  const cap = PAD_Y_PX * 2 + LINE_PX * Math.max(1, maxRows);
  const height =
    box === null
      ? "auto"
      : block
        ? Math.min(box.wide, cap) + FOOTER_PX
        : box.narrow;
  const scrolls = block && box.wide > cap;
  const attachX = block && box ? ATTACH_TRAVEL_BASE_PX - box.width : 0;

  const kept = hasText && !focused;
  const pulse = kept && motionSafe && visible;

  const submit = () => {
    if (!hasText || disabled) return;
    onSend?.(trimmed);
    commit("");
    setMessage("Message sent");
  };

  const move = motionSafe
    ? springs.glide
    : { duration: durations.fast, ease: easings.move };

  const control = cn(
    "absolute bottom-1.5 grid size-9 place-items-center rounded-2 transition-colors outline-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:opacity-50",
  );

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <div
        ref={barRef}
        className={cn(
          "relative w-full rounded-3 border border-hairline bg-surface-1 transition-colors",
          "focus-within:border-hairline-strong",
          "has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring",
        )}
      >
        <motion.div
          initial={false}
          animate={{ height }}
          transition={move}
          className="relative overflow-hidden"
        >
          {/* The narrow mirror is in flow, so the well has its one-line height
              before anything is measured; the wide mirror floats over it. A
              trailing zero-width space makes a final newline count. */}
          <div
            ref={narrowRef}
            aria-hidden
            className="invisible pr-[84px] pl-7 text-sm leading-5 break-words whitespace-pre-wrap"
            style={{ paddingTop: PAD_Y_PX, paddingBottom: PAD_Y_PX }}
          >
            {draft}
            {"\u200b"}
          </div>
          <div
            ref={wideRef}
            aria-hidden
            className="invisible absolute inset-x-0 top-0 pr-3 pl-7 text-sm leading-5 break-words whitespace-pre-wrap"
            style={{ paddingTop: PAD_Y_PX, paddingBottom: PAD_Y_PX }}
          >
            {draft}
            {"\u200b"}
          </div>
          <textarea
            value={draft}
            onChange={(event) => commit(event.target.value)}
            onFocus={() => {
              setFocused(true);
              onFocusChange?.(true);
            }}
            onBlur={() => {
              setFocused(false);
              onFocusChange?.(false);
              if (hasText) setMessage(`Draft kept, ${wordCount(draft)} words`);
            }}
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
            aria-label={label}
            aria-describedby={hintId}
            disabled={disabled}
            rows={1}
            className={cn(
              "absolute inset-0 size-full resize-none bg-transparent pl-7 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3",
              block ? "pr-3" : "pr-[84px]",
              scrolls ? "overflow-y-auto" : "overflow-hidden",
              "disabled:opacity-60",
            )}
            style={{
              paddingTop: PAD_Y_PX,
              paddingBottom: block ? PAD_Y_PX + FOOTER_PX : PAD_Y_PX,
            }}
          />
        </motion.div>

        {/* The draft dot: a fixed spot beside the first line in both modes. */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 size-1.5"
          style={{ top: PAD_Y_PX + LINE_PX / 2 - 3 }}
        >
          <motion.span
            className="absolute -inset-1 rounded-full bg-cobalt-bright"
            initial={false}
            animate={
              pulse
                ? { scale: [1, 2.2], opacity: [0.6, 0] }
                : { scale: 1, opacity: kept ? 0.35 : 0 }
            }
            transition={
              pulse
                ? {
                    duration: durations.page,
                    ease: easings.enter,
                    repeat: Infinity,
                    repeatDelay: 0.5,
                  }
                : FADE
            }
          />
          <span
            className={cn(
              "absolute inset-0 rounded-full transition-colors",
              hasText ? "bg-cobalt-bright" : "bg-hairline-strong",
            )}
          />
        </span>

        <motion.button
          type="button"
          aria-label="Attach"
          disabled={disabled}
          onClick={() => onAttach?.()}
          initial={false}
          animate={{ x: attachX }}
          transition={move}
          className={cn(
            control,
            "text-ink-2 hover:bg-accent hover:text-foreground active:bg-cobalt-wash",
          )}
          style={{ right: ATTACH_REST_PX }}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
          >
            <path d="m11 6.75-4.25 4.25a2.25 2.25 0 0 1-3.2-3.2l4.6-4.6a1.5 1.5 0 0 1 2.1 2.1L5.9 9.7a.75.75 0 0 1-1.06-1.06L8.5 5" />
          </svg>
        </motion.button>

        <button
          type="button"
          aria-label="Send"
          aria-disabled={!hasText ? true : undefined}
          disabled={disabled}
          onClick={submit}
          className={cn(
            control,
            "right-1.5 bg-primary text-primary-foreground hover:opacity-90",
            !hasText && "opacity-40",
          )}
        >
          <svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4 shrink-0"
          >
            <path d="M3 8h10M8.5 3.5 13 8l-4.5 4.5" />
          </svg>
        </button>
      </div>

      <span id={hintId} className="sr-only">
        Enter sends, Shift+Enter breaks the line
      </span>
      <span role="status" aria-live="polite" className="sr-only">
        {message}
      </span>
    </div>
  );
}
