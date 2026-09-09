"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PromptComposerProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Controlled draft. */
  value?: string;
  /** Initial draft for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Fires from Enter or the send button with the trimmed draft. */
  onSend?: (value: string) => void;
  /** Fires from the stop button while `live`. */
  onStop?: () => void;
  /** A run is in flight: send becomes stop and Enter is held. */
  live?: boolean;
  /** Printed beside the estimate. Invented names only. */
  model?: string;
  /** The estimate shown in the footer. @default Math.ceil(chars / 4) */
  estimateTokens?: (value: string) => number;
  /** Lines the field grows to before it scrolls. @default 6 */
  maxRows?: number;
  placeholder?: string;
  /** Names the textarea for assistive technology. */
  label: string;
  className?: string;
};

/** The field's typography is fixed so the row cap is arithmetic, not a read. */
const LINE_PX = 20;
const PAD_Y_PX = 10;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const defaultEstimate = (value: string) => Math.ceil(value.trim().length / 4);

/**
 * Digits roll to their new face on `snap`. Keyed from the right so the units
 * column keeps its identity when the number gains a digit.
 */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: string;
  motionSafe: boolean;
}) {
  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {value.split("").map((char, index) => {
        const digit = DIGITS.indexOf(char as (typeof DIGITS)[number]);
        const key = value.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block h-[1.25em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((face) => (
                <span
                  key={face}
                  className="flex h-[1.25em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A composer that grows with the thought. A hidden mirror carries the draft in
 * the field's own type and padding, so its border-box height — read by a
 * ResizeObserver, never during render — is the height the field needs, and the
 * wrapper glides there on `glide`: a surface changing size, no overshoot. Past
 * `maxRows` the wrapper holds and the textarea scrolls inside it.
 *
 * The footer's token estimate rolls its digits on `snap`, and the send control
 * is one button whose shape says what it does: round with an arrow while idle,
 * square with a stop mark while a run is `live`, the corners and glyph swapping
 * on `snap` so focus never has to move to a second control. Enter sends,
 * Shift+Enter breaks the line, and while live Enter is held so the draft stays.
 * Under reduced motion the height and glyph swap on fast tweens and the digits
 * change in place — the estimate and the stop are information, not flourish.
 */
export function PromptComposer({
  ref,
  value,
  defaultValue,
  onValueChange,
  onSend,
  onStop,
  live = false,
  model,
  estimateTokens = defaultEstimate,
  maxRows = 6,
  placeholder = "Ask anything",
  label,
  className,
}: PromptComposerProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const hintId = `${baseId}-hint`;
  const tokensId = `${baseId}-tokens`;

  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const draft = isControlled ? value : uncontrolled;
  const trimmed = draft.trim();

  const commit = (next: string) => {
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  // The mirror is in flow and invisible; the textarea floats over it. So the
  // wrapper's natural height is the mirror's, and the observer only ever hands
  // motion a number to glide to.
  const mirrorRef = React.useRef<HTMLDivElement | null>(null);
  const [measured, setMeasured] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = mirrorRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() =>
      setMeasured(Math.round(node.offsetHeight)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const cap = LINE_PX * Math.max(1, maxRows) + PAD_Y_PX * 2;
  const height = measured === null ? "auto" : Math.min(measured, cap);
  const scrolls = measured !== null && measured > cap;

  const tokens = Math.max(0, Math.round(estimateTokens(draft)));
  const tokensText = tokens.toLocaleString("en-US");

  // Announce the run's edges on settle. Held in state and adjusted during
  // render so the message belongs to the transition, not to a keystroke.
  const [seen, setSeen] = React.useState({ live, message: "" });
  if (seen.live !== live) {
    setSeen({ live, message: live ? "Run live, Enter held" : "Run ended" });
  }

  const canSend = trimmed.length > 0;

  const send = () => {
    if (live || !canSend) return;
    onSend?.(trimmed);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col rounded-3 border border-hairline bg-surface-1",
        "focus-within:border-hairline-strong",
        className,
      )}
    >
      <motion.div
        initial={false}
        animate={{ height }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="relative overflow-hidden"
      >
        {/* The trailing zero-width space makes a final newline count for a
            line, which a bare mirror would swallow. */}
        <div
          ref={mirrorRef}
          aria-hidden
          className="invisible px-3 py-2.5 text-sm leading-5 break-words whitespace-pre-wrap"
        >
          {draft || placeholder}
          {"\u200b"}
        </div>
        <textarea
          value={draft}
          onChange={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          aria-label={label}
          aria-describedby={`${hintId} ${tokensId}`}
          rows={1}
          className={cn(
            "absolute inset-0 size-full resize-none bg-transparent px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-ink-3",
            scrolls ? "overflow-y-auto" : "overflow-hidden",
          )}
        />
      </motion.div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline py-2 pr-2 pl-3">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-ink-3">
          {model ? (
            <span className="min-w-0 truncate" title={model}>
              {model}
            </span>
          ) : null}
          {model ? <span aria-hidden>·</span> : null}
          <span className="flex shrink-0 items-center gap-1">
            <span aria-hidden>≈</span>
            <span className="text-ink">
              <RollingNumber value={tokensText} motionSafe={motionSafe} />
            </span>
            <span aria-hidden>tokens</span>
          </span>
          <span id={tokensId} className="sr-only">
            About {tokensText} tokens
          </span>
          <span id={hintId} className="sr-only">
            Enter sends, Shift+Enter breaks the line
          </span>
        </div>

        <motion.button
          type="button"
          aria-label={live ? "Stop" : "Send"}
          aria-disabled={!live && !canSend ? true : undefined}
          onClick={() => {
            if (live) onStop?.();
            else send();
          }}
          initial={false}
          animate={{ borderRadius: live ? 8 : 18 }}
          transition={
            motionSafe
              ? springs.snap
              : { duration: durations.fast, ease: easings.move }
          }
          className={cn(
            "grid size-9 shrink-0 place-items-center bg-primary text-primary-foreground transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            !live && !canSend && "opacity-40",
          )}
        >
          <motion.svg
            viewBox="0 0 16 16"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="col-start-1 row-start-1 size-4"
            initial={false}
            animate={{
              scale: motionSafe ? (live ? 0.4 : 1) : 1,
              opacity: live ? 0 : 1,
            }}
            transition={motionSafe ? { ...springs.snap, opacity: fade } : fade}
          >
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
          </motion.svg>
          <motion.svg
            viewBox="0 0 16 16"
            aria-hidden
            className="col-start-1 row-start-1 size-4"
            initial={false}
            animate={{
              scale: motionSafe ? (live ? 1 : 0.4) : 1,
              opacity: live ? 1 : 0,
            }}
            transition={motionSafe ? { ...springs.snap, opacity: fade } : fade}
          >
            <rect
              x="3.5"
              y="3.5"
              width="9"
              height="9"
              rx="1.5"
              fill="currentColor"
            />
          </motion.svg>
        </motion.button>
      </div>

      <span role="status" className="sr-only">
        {seen.message}
      </span>
    </div>
  );
}
