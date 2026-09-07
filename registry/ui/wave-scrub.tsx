"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Pointer travel before capture: capturing on pointerdown eats plain taps. */
const CAPTURE_PX = 4;
/** One arrow press moves the head this many seconds. */
const STEP = 5;
/** The hover chip stays inside the track rather than hanging off its ends. */
const CHIP_EDGE = 0.08;

/** Both faces are four-point closed paths, so `d` interpolates between them. */
const PLAY_LEFT = "M5 3.5 L9 6 L9 10 L5 12.5 Z";
const PAUSE_LEFT = "M4.5 3.5 L7 3.5 L7 12.5 L4.5 12.5 Z";
const PLAY_RIGHT = "M9 6 L13 8 L13 8 L9 10 Z";
const PAUSE_RIGHT = "M9 3.5 L11.5 3.5 L11.5 12.5 L9 12.5 Z";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** mm:ss — the only shape a listener reads a position in. */
const mmss = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
};

export type WaveScrubProps = {
  /** Bar heights, 0–1, left to right. */
  peaks: number[];
  /** Length of the recording, in seconds. */
  duration: number;
  /** Controlled position, in seconds played. */
  position?: number;
  /** Initial position for uncontrolled usage. @default 0 */
  defaultPosition?: number;
  /** Fires on every scrub, tap, and arrow press. */
  onSeek?: (seconds: number) => void;
  /** Controlled transport state. */
  playing?: boolean;
  /** Initial transport state for uncontrolled usage. @default false */
  defaultPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  className?: string;
  "aria-label"?: string;
};

/**
 * A scrubber that shows the sound. The played part of the waveform is the same
 * bars in a second colour, revealed by a clip that advances with the position,
 * so the fill can never drift out of register with the bars beneath it. The
 * clip chases the clock on a short linear tween — a spring would overshoot the
 * present — and the elapsed readout is that same motion value formatted, so
 * the digits roll with the fill rather than beside it.
 *
 * Dragging scrubs, but capture waits for 4px of travel, so a plain tap stays a
 * tap and still seeks where it landed. Hovering floats the time under the
 * pointer. The transport morphs between play and pause on `snap` — two paths
 * of identical structure, so `d` interpolates instead of blinking.
 *
 * It is a real slider: Left and Right step five seconds, Home and End jump to
 * the ends, and `aria-valuetext` reads mm:ss of mm:ss. Under reduced motion the
 * fill steps to each new position instead of gliding, because how far you have
 * got is information.
 */
export function WaveScrub({
  peaks,
  duration,
  position,
  defaultPosition = 0,
  onSeek,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  className,
  "aria-label": ariaLabel,
}: WaveScrubProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const [uncontrolledPosition, setUncontrolledPosition] =
    React.useState(defaultPosition);
  const isPositionControlled = position !== undefined;
  const seconds = clamp(
    isPositionControlled ? position : uncontrolledPosition,
    0,
    duration,
  );

  const [uncontrolledPlaying, setUncontrolledPlaying] =
    React.useState(defaultPlaying);
  const isPlayingControlled = playing !== undefined;
  const isPlaying = isPlayingControlled ? playing : uncontrolledPlaying;

  /** Fraction of the track under the pointer, or null when it has left. */
  const [hoverAt, setHoverAt] = React.useState<number | null>(null);
  // Bumped on release so the sync effect re-runs even when the drag ended on
  // the second it started from.
  const [settle, setSettle] = React.useState(0);

  const grab = React.useRef<{ x: number; captured: boolean } | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const progress = useMotionValue(duration > 0 ? seconds / duration : 0);
  const clipPath = useTransform(
    progress,
    (value) => `inset(0 ${(1 - value) * 100}% 0 0)`,
  );
  const headLeft = useTransform(progress, (value) => `${value * 100}%`);
  const elapsedText = useTransform(progress, (value) => mmss(value * duration));

  const seek = (next: number) => {
    const target = clamp(next, 0, duration);
    if (!isPositionControlled) setUncontrolledPosition(target);
    onSeek?.(target);
  };

  const setPlaying = (next: boolean) => {
    if (!isPlayingControlled) setUncontrolledPlaying(next);
    onPlayingChange?.(next);
  };

  // The clip follows the clock; a drag owns it outright, so the sync stands
  // down until the pointer lets go.
  React.useEffect(() => {
    if (grab.current?.captured) return;
    const target = duration > 0 ? clamp(seconds / duration, 0, 1) : 0;
    if (!motionSafe) {
      progress.set(target);
      return;
    }
    const controls = animate(progress, target, {
      duration: durations.fast,
      ease: easings.linear,
    });
    return () => controls.stop();
  }, [seconds, duration, motionSafe, progress, settle]);

  const fractionAt = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    grab.current = { x: event.clientX, captured: false };
    event.currentTarget.focus();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = grab.current;
    if (event.pointerType === "mouse" || state) {
      setHoverAt(fractionAt(event.clientX));
    }
    if (!state) return;
    if (!state.captured) {
      if (Math.abs(event.clientX - state.x) < CAPTURE_PX) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      state.captured = true;
    }
    const fraction = fractionAt(event.clientX);
    // The drag is the truth while it lasts: the clip goes where the thumb is,
    // and the parent hears about it on the same frame.
    progress.set(fraction);
    seek(fraction * duration);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = grab.current;
    if (!state) return;
    grab.current = null;
    if (
      state.captured &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // A press that never travelled is a tap, and a tap seeks where it landed.
    if (!state.captured) seek(fractionAt(event.clientX) * duration);
    setSettle((n) => n + 1);
    if (event.pointerType !== "mouse") setHoverAt(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        seek(seconds + STEP);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        seek(seconds - STEP);
        break;
      case "Home":
        event.preventDefault();
        seek(0);
        break;
      case "End":
        event.preventDefault();
        seek(duration);
        break;
      default:
        break;
    }
  };

  // One memoised row of bars, rendered in both layers: identical element
  // references let React skip the whole strip while the pointer sweeps it.
  const bars = React.useMemo(
    () =>
      peaks.map((peak, index) => (
        <span
          key={index}
          className="min-w-px flex-1 rounded-full bg-current"
          style={{ height: `${clamp(peak, 0.08, 1) * 100}%` }}
        />
      )),
    [peaks],
  );

  const morph = motionSafe ? springs.snap : { duration: durations.blink };
  const chipAt =
    hoverAt === null ? 0 : clamp(hoverAt, CHIP_EDGE, 1 - CHIP_EDGE);

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel ?? "Position"}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.round(seconds)}
        aria-valuetext={`${mmss(seconds)} of ${mmss(duration)}`}
        aria-describedby={`${uid}-hint`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (!grab.current) setHoverAt(null);
        }}
        className="relative h-12 w-full cursor-pointer touch-pan-y rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <div
          aria-hidden
          className="absolute inset-0 flex items-center gap-px text-ink-3/45"
        >
          {bars}
        </div>

        {/* The played part is the same bars in another colour, revealed by a
            clip — one geometry, so the fill can never fall out of register. */}
        <motion.div
          aria-hidden
          style={{ clipPath }}
          className="absolute inset-0 flex items-center gap-px text-cobalt-bright"
        >
          {bars}
        </motion.div>

        <motion.span
          aria-hidden
          style={{ left: headLeft }}
          className="absolute top-0 bottom-0 -ml-px w-0.5 rounded-full bg-cobalt-bright"
        />

        <AnimatePresence>
          {hoverAt !== null ? (
            <motion.span
              key="chip"
              aria-hidden
              // The centring lives in the animation, not a utility class:
              // motion writes the whole transform, and -translate-x-1/2 would
              // simply be overwritten the moment the chip animates.
              initial={{ opacity: 0, y: motionSafe ? 4 : 0, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
              style={{ left: `${chipAt * 100}%` }}
              className="pointer-events-none absolute top-0 rounded-full border border-hairline-strong bg-surface-0/90 px-1.5 py-px font-mono text-[10px] text-ink-2 tabular-nums"
            >
              {mmss(hoverAt * duration)}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => setPlaying(!isPlaying)}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-4 shrink-0">
            <motion.path
              initial={false}
              animate={{ d: isPlaying ? PAUSE_LEFT : PLAY_LEFT }}
              transition={morph}
              fill="currentColor"
            />
            <motion.path
              initial={false}
              animate={{ d: isPlaying ? PAUSE_RIGHT : PLAY_RIGHT }}
              transition={morph}
              fill="currentColor"
            />
          </svg>
        </button>

        <p className="flex min-w-0 flex-1 items-center justify-between font-mono text-[11px] text-ink-2 tabular-nums">
          <span>
            <span className="sr-only">{mmss(seconds)}</span>
            <motion.span aria-hidden>{elapsedText}</motion.span>
          </span>
          <span className="text-ink-3">{mmss(duration)}</span>
        </p>
      </div>

      <span id={`${uid}-hint`} className="sr-only">
        Arrow keys on the waveform step five seconds; Home and End jump to the
        ends.
      </span>
    </div>
  );
}
