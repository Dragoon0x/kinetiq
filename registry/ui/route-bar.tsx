"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RouteBarHandle = {
  /** Latch the bar on and start the trickle. */
  start: () => void;
  /** Complete to 100% and fade out. */
  done: () => void;
};

export type RouteBarProps = {
  ref?: React.Ref<RouteBarHandle>;
  /** True while a navigation is pending. */
  active?: boolean;
  /** Bar height in px. */
  height?: number;
  /** CSS colour for the bar; defaults to the primary token. */
  color?: string;
  /** Names the progress bar for assistive technology. */
  label?: string;
  className?: string;
};

/** Where a navigation starts: enough bar to be seen, little enough to be honest. */
const START = 0.08;
/** The trickle's asymptote. Waiting never earns the last tenth. */
const CEILING = 0.9;
/** Fraction of the remaining gap eaten per tick — a decaying schedule, so a
 *  long wait keeps moving without ever arriving. */
const DECAY = 0.14;
const TICK = 0.4;

/**
 * The bar at the top of a page change. It appears at 8% and trickles toward 90%
 * on a decaying schedule — each tick takes a seventh of what is left, so a slow
 * route keeps moving and never lies about being nearly done. When the page
 * lands it completes on `glide`, the one spring for a distance being covered,
 * then leaves on the exit ease; springs are for arrivals, not departures.
 *
 * Purely presentational and driven either way: hold `active` true while a
 * navigation is pending, or call `start()` and `done()` on the ref. Repeated
 * starts reset to 8% rather than stacking, and every timer and animation is
 * stopped on unmount. Under reduced motion the head loses its glow but the bar
 * still moves, because progress is information.
 */
export function RouteBar({
  ref,
  active = false,
  height = 2,
  color = "var(--primary)",
  label = "Page loading",
  className,
}: RouteBarProps) {
  const motionSafe = useMotionSafe();
  const progress = useMotionValue(0);
  const opacity = useMotionValue(1);
  const width = useTransform(progress, (p) => `${p * 100}%`);

  // The ref's latch is OR'd with the prop so a component can be driven by
  // either without one silently overruling the other.
  const [latched, setLatched] = React.useState(false);
  const running = active || latched;

  const [percent, setPercent] = React.useState(0);

  React.useImperativeHandle(
    ref,
    () => ({
      start: () => setLatched(true),
      done: () => setLatched(false),
    }),
    [],
  );

  // aria-valuenow is React state, so it is rounded to whole percent: the bar
  // reports progress at the granularity a reader can use, not at frame rate.
  React.useEffect(() => {
    const sync = (value: number) => {
      const next = Math.round(value * 100);
      setPercent((prev) => (prev === next ? prev : next));
    };
    sync(progress.get());
    return progress.on("change", sync);
  }, [progress]);

  React.useEffect(() => {
    if (!running) return;
    // A repeated start resets rather than stacking on the previous run.
    opacity.set(1);
    progress.set(START);
    let crawl: ReturnType<typeof animate> | null = null;
    const timer = window.setInterval(() => {
      const from = progress.get();
      const next = from + (CEILING - from) * DECAY;
      crawl?.stop();
      crawl = animate(progress, next, {
        duration: TICK,
        ease: easings.linear,
      });
    }, TICK * 1000);
    return () => {
      window.clearInterval(timer);
      crawl?.stop();
    };
  }, [running, progress, opacity]);

  React.useEffect(() => {
    if (running) return;
    if (progress.get() === 0) return;
    let cancelled = false;
    let fade: ReturnType<typeof animate> | null = null;
    const complete = animate(
      progress,
      1,
      motionSafe ? springs.glide : { duration: durations.fast },
    );
    complete.then(() => {
      if (cancelled) return;
      fade = animate(opacity, 0, exitFor(durations.base));
      fade.then(() => {
        if (cancelled) return;
        progress.set(0);
      });
    });
    return () => {
      cancelled = true;
      complete.stop();
      fade?.stop();
    };
  }, [running, motionSafe, progress, opacity]);

  const idle = !running && percent === 0;

  return (
    <div
      aria-hidden={idle || undefined}
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-20 w-full overflow-hidden",
        className,
      )}
      style={{ height }}
    >
      {idle ? null : (
        <motion.div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          style={{ width, opacity, backgroundColor: color, height }}
          className="relative rounded-r-full"
        >
          {motionSafe ? (
            /* The head's glow is flourish, not information — reduced motion
               drops it and keeps the bar. */
            <span
              aria-hidden
              className="absolute inset-y-0 right-0 w-8 translate-x-1/2 rounded-full blur-[6px]"
              style={{ backgroundColor: color, opacity: 0.55 }}
            />
          ) : null}
        </motion.div>
      )}
    </div>
  );
}
