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

export type ConfidenceChipProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** How sure the model is of this answer, 0 to 1. */
  confidence: number;
  /** One sentence on why the value is what it is. */
  reasoning: string;
  /** The answer the chip belongs to. */
  answer: string;
  /** Whose answer it is; the header caption. */
  model: string;
  /** Below this the chip reads danger and pulses once on mount. @default 0.5 */
  lowAt?: number;
  /** At or above this the chip reads success. @default 0.8 */
  highAt?: number;
  /** Formats the value for the chip and its descriptions. @default percent */
  format?: (confidence: number) => string;
  /** Whether a low chip pulses once after its fill settles. @default true */
  pulseLow?: boolean;
  /** Fires when the reasoning starts or stops being read — by hover, focus or a pin. */
  onReadChange?: (reading: boolean) => void;
  /** Fires from the press or Escape that pinned or released the reading. */
  onPinChange?: (pinned: boolean) => void;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

type Tone = "confident" | "unsure" | "low";

const TONE_WORD: Record<Tone, string> = {
  confident: "confident",
  unsure: "unsure",
  low: "low",
};
const TONE_FILL: Record<Tone, string> = {
  confident: "bg-success/25",
  unsure: "bg-warn/25",
  low: "bg-danger/25",
};
const TONE_SOLID: Record<Tone, string> = {
  confident: "bg-success",
  unsure: "bg-warn",
  low: "bg-danger",
};
const TONE_TEXT: Record<Tone, string> = {
  confident: "text-success",
  unsure: "text-warn",
  low: "text-danger",
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const defaultFormat = (confidence: number) =>
  `${Math.round(clamp(confidence) * 100)}%`;

/**
 * An answer that wears one chip saying how sure the model is. The chip's
 * wash fills left to right to the confidence on `glide` — a quantity
 * settling, not a switch flipping — and takes the tone of its value. A low
 * chip pulses once after the fill has settled: a three-keyframe opacity
 * tween, never a spring, so the weakest answer announces itself without
 * looping.
 *
 * Hovering or focusing the chip reads the reasoning: a card drops from under
 * the chip on `snap` and lies over the answer's own text, inside the card's
 * bounds so nothing can clip it. Pressing pins the reading after the pointer
 * leaves; pressing again or Escape releases it. The chip is a real button
 * described by an sr-only line that carries the value and the reasoning
 * whether or not the card is showing, and a polite live region names the
 * value once when the fill settles. Under reduced motion the fill appears at
 * its width, the pulse is a single blink, and the card fades in place.
 */
export function ConfidenceChip({
  ref,
  confidence,
  reasoning,
  answer,
  model,
  lowAt = 0.5,
  highAt = 0.8,
  format = defaultFormat,
  pulseLow = true,
  onReadChange,
  onPinChange,
  label,
  className,
}: ConfidenceChipProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const descId = `${baseId}-desc`;
  const tipId = `${baseId}-tip`;

  const share = Number(clamp(confidence).toFixed(3));
  // The uncovered remainder as a percentage to one decimal: a rounded string
  // is what motion re-serialises on the server, so it hydrates cleanly.
  const rest = Math.round((1 - share) * 1000) / 10;
  const tone: Tone =
    share >= highAt ? "confident" : share < lowAt ? "low" : "unsure";
  const valueText = format(confidence);

  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [settled, setSettled] = React.useState(false);
  const reading = hovered || focused || pinned;

  // Reporting is decided in the handler from the committed value, so the
  // parent hears each change exactly once and never from a state updater.
  const report = (
    nextHovered: boolean,
    nextFocused: boolean,
    nextPinned: boolean,
  ) => {
    const next = nextHovered || nextFocused || nextPinned;
    if (next !== reading) onReadChange?.(next);
  };

  const enter = () => {
    setHovered(true);
    report(true, focused, pinned);
  };
  const leave = () => {
    setHovered(false);
    report(false, focused, pinned);
  };
  const focus = () => {
    setFocused(true);
    report(hovered, true, pinned);
  };
  const blur = () => {
    setFocused(false);
    report(hovered, false, pinned);
  };
  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    onPinChange?.(next);
    report(hovered, focused, next);
  };
  const dismiss = () => {
    if (pinned) onPinChange?.(false);
    setPinned(false);
    setHovered(false);
    setFocused(false);
    report(false, false, false);
  };

  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <div className="relative flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {model}
        </span>

        <button
          type="button"
          aria-pressed={pinned}
          aria-describedby={descId}
          onPointerEnter={enter}
          onPointerLeave={leave}
          onFocus={focus}
          onBlur={blur}
          onClick={togglePin}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              dismiss();
            }
          }}
          className={cn(
            "relative flex h-7 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-2.5 font-mono text-[11px] font-medium tabular-nums transition-colors outline-none",
            pinned ? "border-hairline-strong" : "border-hairline",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {/* The wash is clipped from the right rather than scaled, so the
              pill keeps its round end and the fill reads as a level. */}
          <motion.span
            aria-hidden
            className={cn("absolute inset-0 rounded-full", TONE_FILL[tone])}
            initial={{ clipPath: "inset(0 100% 0 0)" }}
            animate={{ clipPath: `inset(0 ${rest}% 0 0)` }}
            transition={
              motionSafe
                ? springs.glide
                : { duration: durations.fast, ease: easings.enter }
            }
            onAnimationComplete={() => setSettled(true)}
          />
          {/* Mounted only once the fill has settled, so the pulse is the
              second beat and never competes with the fill. */}
          {settled && pulseLow && tone === "low" ? (
            <motion.span
              aria-hidden
              className={cn("absolute inset-0 rounded-full", TONE_SOLID[tone])}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.45, 0] }}
              transition={{
                duration: durations.slow,
                ease: "easeInOut",
                times: [0, 0.5, 1],
              }}
            />
          ) : null}
          <span
            aria-hidden
            className={cn("relative size-1.5 rounded-full", TONE_SOLID[tone])}
          />
          <span className="relative text-foreground">{valueText}</span>
        </button>

        <AnimatePresence>
          {reading ? (
            <motion.div
              key="read"
              id={tipId}
              role="tooltip"
              aria-hidden
              initial={
                motionSafe
                  ? { opacity: 0, y: -distances.nudge }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? { ...springs.snap, opacity: fade } : fade
              }
              className="pointer-events-none absolute inset-x-0 top-full z-20 mt-1.5 rounded-2 border border-hairline-strong bg-popover p-2.5 text-popover-foreground shadow-raised"
            >
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] uppercase">
                <span className={cn("tabular-nums", TONE_TEXT[tone])}>
                  {valueText}
                </span>
                <span className="text-ink-3">{TONE_WORD[tone]}</span>
                {pinned ? <span className="text-ink-3">· pinned</span> : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-2">
                {reasoning}
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p className="text-sm leading-relaxed text-foreground">{answer}</p>

      <span id={descId} className="sr-only">
        {`${valueText} confidence, ${TONE_WORD[tone]}. Reasoning: ${reasoning}`}
      </span>
      <span role="status" className="sr-only">
        {settled ? `Confidence ${valueText}, ${TONE_WORD[tone]}` : ""}
      </span>
    </div>
  );
}
