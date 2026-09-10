"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MicRingProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Input level, 0 to 1. Supplied by the host; this component never reads a device. */
  level: number;
  /** Controlled mute state. */
  muted?: boolean;
  /** Initial mute state for uncontrolled use. @default false */
  defaultMuted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  /** Fires when the held peak changes, as a rounded percentage 0–100. */
  onPeakChange?: (peak: number) => void;
  /** How fast a held peak falls back, in level per second. @default 0.6 */
  peakDecay?: number;
  /** Whose voice it is, used in the spoken sentences. @default "You" */
  name?: string;
  /** Draws the level and peak figures beside the button. @default true */
  showReadout?: boolean;
  /** Holds the button; the ring still shows the level. @default false */
  disabled?: boolean;
  className?: string;
};

/** Round anything that reaches an attribute or a motion string: Node and Chromium differ in the last digits. */
const trim = (value: number) => Number(value.toFixed(3));

const bandFor = (level: number) => {
  if (level < 0.08) return "silent";
  if (level < 0.3) return "quiet";
  if (level < 0.6) return "moderate";
  if (level < 0.85) return "loud";
  return "very loud";
};

/**
 * Your voice, as a ring. One motion value holds the level and everything reads
 * from it, so no two parts of the control can disagree. A halo behind the
 * button grows with that value on `flick` — a voice moves faster than anything
 * else in a product, and ζ0.99 at ~120ms is the only spring honest enough for
 * it — while the button's own rim fills a level arc by `strokeDashoffset` from
 * the same value and a thinner outer arc holds the highest recent level,
 * decaying back linearly so a shout leaves a mark that fades.
 *
 * Muting closes the ring: the halo collapses and the arc empties on `snap`,
 * while a slash draws across the glyph — one path whose command count never
 * changes, `pathLength` 0 → 1 on `flick`. Unmuting retracts the slash on the
 * exit ease and the ring reopens from wherever the level stands.
 *
 * There is no microphone here: `level` is a prop, and a host feeds it. The
 * button is a real `role="switch"`, so Space and Enter toggle it and nothing
 * else is stolen; the level sits beside it as a `role="meter"` that can be
 * queried but never announces, because a level read aloud every frame is
 * unusable. Under reduced motion the halo holds at one and carries the level as
 * opacity, the arcs still fill, and the slash swaps rather than drawing.
 */
export function MicRing({
  ref,
  level,
  muted,
  defaultMuted = false,
  onMutedChange,
  onPeakChange,
  peakDecay = 0.6,
  name = "You",
  showReadout = true,
  disabled = false,
  className,
}: MicRingProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultMuted);
  const isControlled = muted !== undefined;
  const isMuted = isControlled ? muted : uncontrolled;

  const clamped = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  const target = isMuted ? 0 : clamped;
  const whose = name === "You" ? "Your" : `${name}'s`;

  const levelValue = useMotionValue(0);
  const peakValue = useMotionValue(0);

  React.useEffect(() => {
    // Following on `flick` while live and closing on `snap` when muted: the
    // two moves mean different things, so they get different physics.
    const controls = animate(
      levelValue,
      target,
      motionSafe
        ? isMuted
          ? springs.snap
          : springs.flick
        : { duration: durations.fast, ease: easings.enter },
    );
    return () => controls.stop();
  }, [target, isMuted, motionSafe, levelValue]);

  React.useEffect(() => {
    if (isMuted) {
      // Muting closes the whole ring at once, so the peak goes with it rather
      // than draining on at its own rate behind a silent mic.
      const closing = animate(
        peakValue,
        0,
        motionSafe
          ? springs.snap
          : { duration: durations.fast, ease: easings.enter },
      );
      return () => closing.stop();
    }
    if (peakValue.get() < clamped) peakValue.set(clamped);
    const from = peakValue.get();
    // A peak falls back to the live level at a stated rate rather than on an
    // easing, so the mark a shout leaves means the same thing every time — and
    // it can never fall below the level it is the envelope of.
    if (from <= clamped) return;
    const controls = animate(peakValue, clamped, {
      duration: (from - clamped) / Math.max(0.05, peakDecay),
      ease: easings.linear,
    });
    return () => controls.stop();
  }, [clamped, isMuted, motionSafe, peakDecay, peakValue]);

  const [peakPercent, setPeakPercent] = React.useState(0);
  const peakOutRef = React.useRef(onPeakChange);
  React.useEffect(() => {
    peakOutRef.current = onPeakChange;
  });
  React.useEffect(() => {
    let last = Math.round(peakValue.get() * 100);
    return peakValue.on("change", (value) => {
      const next = Math.round(Math.min(1, Math.max(0, value)) * 100);
      if (next === last) return;
      last = next;
      setPeakPercent(next);
      peakOutRef.current?.(next);
    });
  }, [peakValue]);

  // The arcs sweep three quarters of the circle, so the level has somewhere to
  // grow into and the ring never reads as a full, finished ring.
  const SWEEP = 0.75;
  const levelOffset = useTransform(levelValue, (value) =>
    trim(1 - Math.min(1, Math.max(0, value)) * SWEEP),
  );
  const peakOffset = useTransform(peakValue, (value) =>
    trim(1 - Math.min(1, Math.max(0, value)) * SWEEP),
  );
  const haloScale = useTransform(levelValue, (value) =>
    trim(1 + Math.min(1, Math.max(0, value)) * 0.34),
  );
  const haloOpacity = useTransform(levelValue, (value) =>
    trim(0.12 + Math.min(1, Math.max(0, value)) * 0.48),
  );

  const levelPercent = Math.round(target * 100);
  const band = bandFor(target);

  // Frozen at the moment of the change, so a render that merely re-derives the
  // sentence cannot make the region repeat a past event.
  const [seen, setSeen] = React.useState(isMuted);
  const [spoken, setSpoken] = React.useState("");
  if (seen !== isMuted) {
    setSpoken(
      isMuted ? `${whose} microphone is muted.` : `${whose} microphone is on.`,
    );
    setSeen(isMuted);
  }

  const toggle = () => {
    const next = !isMuted;
    if (!isControlled) setUncontrolled(next);
    onMutedChange?.(next);
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full items-center gap-3 rounded-3 border border-hairline bg-surface-1 p-3",
        className,
      )}
    >
      <span className="relative grid size-16 shrink-0 place-items-center">
        <motion.span
          aria-hidden
          className="pointer-events-none col-start-1 row-start-1 size-14 rounded-full bg-cobalt-wash"
          // Reduced motion keeps the halo at one and carries the level as
          // opacity alone — a ring that grows is a transform that travels, and
          // `scale: 1` is written outright so no stale transform survives a
          // preference change mid-session.
          style={
            motionSafe
              ? { scale: haloScale, opacity: haloOpacity }
              : { scale: 1, opacity: haloOpacity }
          }
        />

        <svg
          viewBox="0 0 64 64"
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.14"
            strokeWidth="3"
            className="text-ink"
          />
          <motion.circle
            cx="32"
            cy="32"
            r="26"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            transform="rotate(-90 32 32)"
            className={cn(
              "transition-colors",
              isMuted ? "text-ink-3" : "text-cobalt-bright",
            )}
            style={{ strokeDashoffset: levelOffset }}
          />
          <motion.circle
            cx="32"
            cy="32"
            r="30.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray="1 1"
            transform="rotate(-90 32 32)"
            className="text-signal"
            style={{ strokeDashoffset: peakOffset }}
          />
        </svg>

        <button
          type="button"
          role="switch"
          aria-checked={!isMuted}
          aria-label={`${whose} microphone`}
          disabled={disabled}
          onClick={toggle}
          className={cn(
            "relative col-start-1 row-start-1 grid size-11 place-items-center rounded-full border transition-colors outline-none",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            isMuted
              ? "border-hairline-strong bg-surface-0 text-ink-3"
              : "border-hairline bg-surface-0 text-cobalt-bright hover:bg-cobalt-wash",
            disabled && "opacity-50",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 shrink-0"
          >
            <rect x="9" y="3" width="6" height="10.5" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
            <path d="M12 18v3" />
            {/* One path, one command pair, always the same count — motion can
                only draw what it can measure. */}
            <motion.path
              d="M5.5 4.5 18.5 19.5"
              className="text-warn"
              initial={false}
              animate={
                motionSafe
                  ? { pathLength: isMuted ? 1 : 0, opacity: 1 }
                  : { pathLength: 1, opacity: isMuted ? 1 : 0 }
              }
              transition={
                motionSafe
                  ? isMuted
                    ? springs.flick
                    : exitFor(durations.fast)
                  : { duration: durations.fast, ease: easings.enter }
              }
            />
          </svg>
        </button>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm leading-snug font-medium">
            Microphone
          </span>
          <span
            className={cn(
              "shrink-0 text-xs leading-snug font-medium transition-colors",
              isMuted ? "text-warn" : "text-ink-3",
            )}
          >
            {isMuted ? "Muted" : "On"}
          </span>
        </span>
        <span
          role="meter"
          aria-label={`${whose} microphone level`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={levelPercent}
          aria-valuetext={`${whose} level is ${band}, ${levelPercent} out of 100.`}
          className="truncate font-mono text-[11px] leading-snug text-ink-3 tabular-nums"
        >
          {showReadout
            ? `level ${levelPercent} · peak ${peakPercent}`
            : band.charAt(0).toUpperCase() + band.slice(1)}
        </span>
      </span>

      <span role="status" aria-live="polite" aria-atomic className="sr-only">
        {spoken}
      </span>
    </div>
  );
}
