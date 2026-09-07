"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const TRACK_H = 48;
const THUMB = 40;
const PAD = 4;
/** Past this much of the track the slide has been meant, so it completes. */
const COMMIT = 0.85;
/** Pointer travel before capture: capturing on pointerdown eats plain clicks. */
const CAPTURE_PX = 4;

/** Same command structure, so motion can interpolate one into the other. */
const ARROW = "M9 7L14 12L9 17";
const CHECK = "M6 12L10 16L18 8";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export type SlideConfirmProps = {
  /** Fires once when the slide completes. */
  onConfirm?: () => void;
  /** Track copy while idle. */
  label?: string;
  /** Copy after confirming. */
  confirmedLabel?: string;
  /** Milliseconds before the thumb returns; omit to stay confirmed. */
  resetAfter?: number;
  /** Locks the track. */
  disabled?: boolean;
  /** Fires with the whole-percent position on every change. */
  onProgressChange?: (percent: number) => void;
  className?: string;
};

/**
 * A track that asks for the whole gesture. The thumb tracks the pointer 1:1
 * while the label fades out under it and a fill follows behind; past 85% it
 * slams home on `flick`, the arrow morphs into a check and the copy swaps.
 * Released short of that, it springs back on `snap` — the refusal has to feel
 * like the same spring that carried it, not a cut.
 *
 * The keyboard drives the same physics: ArrowRight nudges 10% per press,
 * ArrowLeft takes it back, End runs it to the top and Enter there confirms.
 * Reduced motion moves the thumb directly and fills without a spring, because
 * how far you have got is information.
 */
export function SlideConfirm({
  onConfirm,
  label = "Slide to confirm",
  confirmedLabel = "Confirmed",
  resetAfter,
  disabled = false,
  onProgressChange,
  className,
}: SlideConfirmProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const travelRef = React.useRef(0);
  const controls = React.useRef<AnimationPlaybackControls | null>(null);
  const grab = React.useRef<{ x: number; from: number } | null>(null);
  const captured = React.useRef(false);

  const [travel, setTravel] = React.useState(0);
  const [percent, setPercent] = React.useState(0);
  const [confirmed, setConfirmed] = React.useState(false);

  const x = useMotionValue(0);
  const fillWidth = useTransform(x, (v) => v + THUMB + PAD * 2);
  const labelOpacity = useTransform(x, (v) =>
    travelRef.current > 0 ? clamp(1 - v / (travelRef.current * 0.55), 0, 1) : 1,
  );

  useMotionValueEvent(x, "change", (v) => {
    const next =
      travelRef.current > 0 ? Math.round((v / travelRef.current) * 100) : 0;
    setPercent((prev) => (prev === next ? prev : next));
    onProgressChange?.(next);
  });

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // The observer's own callback carries the measurement, so the width never
    // has to be read synchronously inside the effect body.
    const observer = new ResizeObserver(() => {
      const next = Math.max(
        0,
        el.getBoundingClientRect().width - PAD * 2 - THUMB,
      );
      travelRef.current = next;
      setTravel(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => () => controls.current?.stop(), []);

  // A resize moves the finish line; a confirmed thumb keeps sitting on it.
  // Guarded on the width alone: running this when `confirmed` flipped would
  // jump the thumb home and swallow the flick that was already carrying it.
  const lastTravel = React.useRef(0);
  React.useEffect(() => {
    if (lastTravel.current === travel) return;
    lastTravel.current = travel;
    x.set(confirmed ? travel : Math.min(x.get(), travel));
  }, [travel, confirmed, x]);

  const settle = (to: number, transition: object) => {
    controls.current?.stop();
    if (!motionSafe) {
      x.set(to);
      return;
    }
    controls.current = animate(x, to, transition);
  };

  const complete = () => {
    if (confirmed) return;
    setConfirmed(true);
    settle(travelRef.current, springs.flick);
    onConfirm?.();
  };

  const release = () => {
    if (travelRef.current > 0 && x.get() / travelRef.current >= COMMIT) {
      complete();
      return;
    }
    settle(0, springs.snap);
  };

  React.useEffect(() => {
    if (!confirmed || resetAfter === undefined) return;
    const timer = window.setTimeout(() => {
      setConfirmed(false);
      controls.current?.stop();
      if (motionSafe) controls.current = animate(x, 0, springs.snap);
      else x.set(0);
    }, resetAfter);
    return () => window.clearTimeout(timer);
  }, [confirmed, resetAfter, motionSafe, x]);

  const nudge = (by: number) => {
    const to = clamp(x.get() + travelRef.current * by, 0, travelRef.current);
    settle(to, springs.snap);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || confirmed) return;
    const { key } = event;
    if (key === "ArrowRight" || key === "ArrowUp") nudge(0.1);
    else if (key === "ArrowLeft" || key === "ArrowDown") nudge(-0.1);
    else if (key === "Home" || key === "Escape") settle(0, springs.snap);
    else if (key === "End") nudge(1);
    else if (key === "Enter" || key === " ") {
      // Enter only lands the slide once it has actually been slid.
      if (travelRef.current > 0 && x.get() / travelRef.current >= COMMIT) {
        complete();
      }
    } else return;
    event.preventDefault();
  };

  const live = !disabled && !confirmed;

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative w-full rounded-full border border-hairline bg-surface-2 select-none",
        disabled && "opacity-50",
        className,
      )}
      style={{ height: TRACK_H }}
    >
      <motion.div
        aria-hidden
        className={cn(
          "absolute top-0 bottom-0 left-0 rounded-full transition-colors",
          confirmed ? "bg-success/15" : "bg-cobalt-wash",
        )}
        style={{ width: fillWidth }}
      />

      {/* Only the copy is clipped: overflow-hidden on the track itself would
          cut the thumb's focus ring off at the rail. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden px-14">
        <AnimatePresence initial={false} mode="wait">
          {confirmed ? (
            <motion.span
              key="done"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={{ duration: durations.fast, ease: easings.enter }}
              className="min-w-0 truncate font-mono text-xs tracking-[0.08em] text-success uppercase"
            >
              {confirmedLabel}
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              // The fade is the motion value's, not an exit's: by the time this
              // unmounts the label is already gone, and two owners of one
              // opacity would leave AnimatePresence waiting on a stalled exit.
              style={{ opacity: labelOpacity }}
              className="min-w-0 truncate font-mono text-xs tracking-[0.08em] text-muted-foreground uppercase"
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <motion.div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={confirmed ? confirmedLabel : `${percent} percent slid`}
        aria-disabled={disabled || undefined}
        aria-describedby={`${baseId}-hint`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (!live || event.button !== 0) return;
          grab.current = { x: event.clientX, from: x.get() };
          captured.current = false;
          controls.current?.stop();
          event.currentTarget.focus();
        }}
        onPointerMove={(event) => {
          const from = grab.current;
          if (!from || !live) return;
          const dx = event.clientX - from.x;
          if (!captured.current) {
            if (Math.abs(dx) < CAPTURE_PX) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            captured.current = true;
          }
          x.set(clamp(from.from + dx, 0, travelRef.current));
        }}
        onPointerUp={(event) => {
          if (!grab.current) return;
          if (
            captured.current &&
            event.currentTarget.hasPointerCapture(event.pointerId)
          ) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          const dragged = captured.current;
          grab.current = null;
          captured.current = false;
          if (dragged) release();
        }}
        onPointerCancel={() => {
          if (!grab.current) return;
          grab.current = null;
          captured.current = false;
          settle(0, springs.snap);
        }}
        style={{ x, width: THUMB, height: THUMB, top: PAD, left: PAD }}
        className={cn(
          "absolute flex items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          confirmed
            ? "bg-success text-background"
            : "bg-primary text-primary-foreground",
          live ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        )}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0">
          <motion.path
            initial={false}
            animate={{ d: confirmed ? CHECK : ARROW }}
            transition={{
              duration: motionSafe ? durations.fast : 0,
              ease: easings.enter,
            }}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>

      <span id={`${baseId}-hint`} className="sr-only">
        Arrow keys nudge the thumb ten percent; Enter at the end confirms.
      </span>
    </div>
  );
}
