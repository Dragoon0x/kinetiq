"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BandClaim = {
  id: string;
  text: string;
  /** How sure the model is of this claim, 0 to 1. */
  confidence: number;
};

export type ConfidenceBandProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Claims in reading order. */
  claims: BandClaim[];
  /** Below this a band reads danger and pulses once on load. @default 0.5 */
  lowAt?: number;
  /** At or above this a band reads success. @default 0.8 */
  highAt?: number;
  /** Formats a confidence for the readout and descriptions. @default percent */
  format?: (confidence: number) => string;
  /** Whether low bands pulse once after the mount cascade. @default true */
  pulseLow?: boolean;
  /** Fires when the claim being read changes — by hover, focus or a hold. */
  onReadChange?: (id: string | null) => void;
  /** Fires from the press that held or released a claim. */
  onHoldChange?: (id: string | null) => void;
  /** Names the answer region for assistive technology. */
  label: string;
  className?: string;
};

type Tone = "confident" | "unsure" | "low";

const TONE_VAR: Record<Tone, string> = {
  confident: "var(--color-success)",
  unsure: "var(--color-warn)",
  low: "var(--color-danger)",
};
const TONE_BG: Record<Tone, string> = {
  confident: "bg-success",
  unsure: "bg-warn",
  low: "bg-danger",
};
const TONE_TEXT: Record<Tone, string> = {
  confident: "text-success",
  unsure: "text-warn",
  low: "text-danger",
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Band alpha while nothing is being read. */
const REST = 0.8;

const defaultFormat = (confidence: number) =>
  `${Math.round(Math.min(1, Math.max(0, confidence)) * 100)}%`;

/** Digits roll to their value on `snap`; other characters print in place. */
function Rolling({
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
        // Keyed from the right so the units column keeps its identity when
        // the number gains or loses a digit.
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

type ClaimProps = {
  claim: BandClaim;
  tone: Tone;
  /** Seconds before this band starts filling. */
  delay: number;
  /** Seconds after mount at which the low pulse may start. */
  pulseAt: number | null;
  /** Fires when this band's fill finishes — only wired on the last claim. */
  onSettled?: () => void;
  emphasis: number;
  read: boolean;
  held: boolean;
  motionSafe: boolean;
  describedBy: string;
  onEnter: () => void;
  onLeave: () => void;
  onToggle: () => void;
};

/**
 * One claim and its band. The band is a bottom-anchored background on the
 * inline text, so a wrapped claim gets the share on every line
 * (`box-decoration-break: clone`) rather than an absolute bar that could
 * only sit under the first. Width and alpha live in motion values: the fill
 * runs on `glide` after its cascade delay, the pulse is a three-keyframe
 * alpha tween, and emphasis follows on a fast tween.
 */
function Claim({
  claim,
  tone,
  delay,
  pulseAt,
  onSettled,
  emphasis,
  read,
  held,
  motionSafe,
  describedBy,
  onEnter,
  onLeave,
  onToggle,
}: ClaimProps) {
  const share = Math.min(1, Math.max(0, claim.confidence));
  const width = useMotionValue(0);
  const alpha = useMotionValue(emphasis);
  const backgroundSize = useTransform(
    width,
    (value) => `${Number((value * 100).toFixed(3))}% 3px`,
  );
  const backgroundImage = useTransform(alpha, (value) => {
    const percent = Number((value * 100).toFixed(3));
    const colour = `color-mix(in oklab, ${TONE_VAR[tone]} ${percent}%, transparent)`;
    return `linear-gradient(${colour}, ${colour})`;
  });

  // The fill is feedback, so it runs under reduced motion too — without the
  // stagger, because a wait with nothing moving reads as a stall.
  React.useEffect(() => {
    const controls = animate(width, share, {
      ...(motionSafe
        ? { ...springs.glide, delay }
        : { duration: durations.fast, ease: easings.enter }),
      onComplete: onSettled,
    });
    return () => controls.stop();
  }, [width, share, delay, motionSafe, onSettled]);

  // Declared before the pulse so that on mount the pulse is the later
  // animation on `alpha` and survives; a later read restarts this one and
  // ends any pulse still running, which is the right precedence.
  React.useEffect(() => {
    const controls = animate(alpha, emphasis, {
      duration: durations.fast,
      ease: easings.enter,
    });
    return () => controls.stop();
  }, [alpha, emphasis]);

  React.useEffect(() => {
    if (pulseAt === null) return;
    const controls = animate(alpha, [REST, 0.15, REST], {
      duration: durations.slow,
      ease: easings.move,
      delay: motionSafe ? pulseAt : durations.fast,
    });
    return () => controls.stop();
  }, [alpha, pulseAt, motionSafe]);

  return (
    <motion.span
      role="button"
      tabIndex={0}
      aria-pressed={held}
      aria-describedby={describedBy}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onToggle}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onToggle();
      }}
      style={{
        backgroundSize,
        backgroundImage,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "0 100%",
      }}
      className={cn(
        "cursor-pointer rounded-1 [box-decoration-break:clone] pb-px transition-colors outline-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        read ? "text-ink" : "text-ink-2",
      )}
    >
      {claim.text}
    </motion.span>
  );
}

/**
 * Every claim wears its confidence as a band. Bands fill left to right on
 * `glide` in a `cascade()` across the claims; once the last has settled,
 * every low-confidence band pulses once — a three-keyframe alpha tween on
 * the slow duration, never a loop — so the weakest claims announce
 * themselves and then rest. Hovering or focusing a claim reads it: the
 * readout row rolls its digits to the value on `snap` and names the tone,
 * while the other bands dim so the read band stands alone. Pressing holds
 * the reading after the pointer leaves; pressing again releases it.
 *
 * Each claim is an inline element with the button role, so it wraps with the
 * paragraph, described by an always-present line with its value and tone;
 * Tab reaches each in reading order, Enter or Space holds. The live region
 * reads the claim count once when the cascade settles. Under reduced motion
 * bands fill on a fast tween with no stagger, the pulse is still one blink,
 * and the digits swap in place.
 */
export function ConfidenceBand({
  ref,
  claims,
  lowAt = 0.5,
  highAt = 0.8,
  format = defaultFormat,
  pulseLow = true,
  onReadChange,
  onHoldChange,
  label,
  className,
}: ConfidenceBandProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [hover, setHover] = React.useState<string | null>(null);
  const [held, setHeld] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const toneOf = (confidence: number): Tone =>
    confidence < lowAt ? "low" : confidence < highAt ? "unsure" : "confident";

  const read = hover ?? held;
  const enter = (id: string) => {
    setHover(id);
    if (id !== read) onReadChange?.(id);
  };
  const leave = () => {
    setHover(null);
    if (held !== read) onReadChange?.(held);
  };
  const toggle = (id: string) => {
    const next = held === id ? null : id;
    setHeld(next);
    onHoldChange?.(next);
    const after = hover ?? next;
    if (after !== read) onReadChange?.(after);
  };

  const count = claims.length;
  const step = cascade(count);
  const lowCount = claims.filter((c) => c.confidence < lowAt).length;
  // The pulse waits for the whole cascade plus a glide to settle.
  const pulseAt = Number(((count - 1) * step + 0.5).toFixed(3));
  const summary = `${count} ${count === 1 ? "claim" : "claims"}, ${lowCount} low confidence`;
  const settle = React.useCallback(() => setAnnouncement(summary), [summary]);

  const readClaim = read ? claims.find((c) => c.id === read) : undefined;
  const readIndex = readClaim ? claims.indexOf(readClaim) + 1 : 0;
  const readTone = readClaim ? toneOf(readClaim.confidence) : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-labelledby={labelId}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      <span id={labelId} className="sr-only">
        {label}
      </span>

      <p className="text-sm leading-relaxed">
        {claims.map((claim, index) => {
          const tone = toneOf(claim.confidence);
          const isRead = read === claim.id;
          const emphasis = isRead ? 1 : read ? 0.3 : REST;
          return (
            <React.Fragment key={claim.id}>
              {index > 0 ? " " : null}
              <Claim
                claim={claim}
                tone={tone}
                delay={Number((index * step).toFixed(3))}
                pulseAt={pulseLow && tone === "low" ? pulseAt : null}
                onSettled={index === count - 1 ? settle : undefined}
                emphasis={emphasis}
                read={isRead}
                held={held === claim.id}
                motionSafe={motionSafe}
                describedBy={`${baseId}-desc-${claim.id}`}
                onEnter={() => enter(claim.id)}
                onLeave={leave}
                onToggle={() => toggle(claim.id)}
              />
            </React.Fragment>
          );
        })}
      </p>

      {/* The descriptions already carry every value, so the readout is
          decoration for sighted readers and stays out of the tree. */}
      <div
        aria-hidden
        className="flex h-8 items-center gap-2 rounded-2 border border-hairline bg-surface-1 px-3 font-mono text-[11px]"
      >
        <span
          className={cn(
            "flex items-center font-medium transition-colors",
            readTone ? TONE_TEXT[readTone] : "text-ink-3",
          )}
        >
          {readClaim ? (
            <Rolling
              value={format(readClaim.confidence)}
              motionSafe={motionSafe}
            />
          ) : (
            "—"
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-ink-3">
          {readClaim
            ? `${readTone} · claim ${readIndex} of ${count}${held === readClaim.id ? " · held" : ""}`
            : `${count} claims · hover one to read it`}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {(["confident", "unsure", "low"] as Tone[]).map((tone) => (
            <span
              key={tone}
              className={cn("h-1 w-3 rounded-full", TONE_BG[tone])}
            />
          ))}
        </span>
      </div>

      {claims.map((claim, index) => (
        <span
          key={claim.id}
          id={`${baseId}-desc-${claim.id}`}
          className="sr-only"
        >
          {format(claim.confidence)} confidence, {toneOf(claim.confidence)}.
          {` Claim ${index + 1} of ${count}.`}
          {held === claim.id ? " Held." : ""}
        </span>
      ))}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
