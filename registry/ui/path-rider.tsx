"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type PathRiderProps = {
  /** SVG path data the rider follows. */
  path: string;
  /** The coordinate space `path` is drawn in. @default "0 0 320 180" */
  viewBox?: string;
  /** Controlled position along the path, 0–1. Omit to follow `container`. */
  progress?: number;
  /** Scroll-link source; used when `progress` is omitted. */
  container?: React.RefObject<HTMLElement | null>;
  /** What travels. Defaults to a chevron badge. */
  rider?: React.ReactNode;
  /** Runs progress to the end on a linear tween. */
  playing?: boolean;
  /** Length of a full run, ms. @default 4000 */
  duration?: number;
  /** Fires with progress, 0–1, whenever the whole percent changes. */
  onProgressChange?: (progress: number) => void;
  /** Fires when a run reaches the end. */
  onPlayEnd?: () => void;
  /** Names the route. @default "Route" */
  label?: string;
  className?: string;
};

/** Reduced-motion playback lands on this many stops instead of gliding. */
const REDUCED_STEPS = 8;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const subscribeVisibility = (notify: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
};

const readVisibility = () =>
  typeof document === "undefined" || !document.hidden;

/** A prerender has no document to ask, and a hidden tab never sees first paint. */
const serverVisibility = () => true;

/** A run behind a hidden tab would finish unwatched; it holds and resumes. */
function useDocumentVisible(): boolean {
  return React.useSyncExternalStore(
    subscribeVisibility,
    readVisibility,
    serverVisibility,
  );
}

/**
 * Something that rides a path. One value between 0 and 1 places the rider at
 * that fraction of the path's length, using the browser's own geometry — a
 * point and the two points either side of it, which give the tangent the rider
 * turns to — so the route can be any path data without a table of coordinates
 * behind it. The travelled part of the route draws in behind the rider, sharing
 * the same value through `pathLength`, so the line and the rider cannot
 * disagree about where the journey has got to.
 *
 * Scroll-linked progress is mapped linearly from the container, never sprung: a
 * spring on a scroll-driven value lags the finger and reads as jank. Play runs
 * the same value on a linear tween that pauses with the tab and resumes from
 * where it stopped. The rider is decorative and hidden from assistive
 * technology; the caption carries the position as text instead. Under reduced
 * motion a run advances in eight jumps rather than gliding — the trip still
 * finishes, because progress is information.
 */
export function PathRider({
  path,
  viewBox = "0 0 320 180",
  progress,
  container,
  rider,
  playing = false,
  duration = 4000,
  onProgressChange,
  onPlayEnd,
  label = "Route",
  className,
}: PathRiderProps) {
  const motionSafe = useMotionSafe();
  const visible = useDocumentVisible();

  const routeRef = React.useRef<SVGPathElement | null>(null);
  const value = useMotionValue(0);
  const left = useMotionValue(0);
  const top = useMotionValue(0);
  const angle = useMotionValue(0);

  const trail = useTransform(value, [0, 1], [1, 0]);
  const riderLeft = useMotionTemplate`${left}%`;
  const riderTop = useMotionTemplate`${top}%`;
  // Rendered by motion straight into the text node, so the readout updates
  // every frame without re-rendering the component around it.
  const readout = useTransform(
    value,
    (v) => `${Math.round(clamp01(v) * 100)}%`,
  );

  const controlled = progress !== undefined;

  const box = React.useMemo(() => {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    return {
      x: parts[0] || 0,
      y: parts[1] || 0,
      w: parts[2] || 1,
      h: parts[3] || 1,
    };
  }, [viewBox]);

  const progressCallback = React.useRef(onProgressChange);
  const endCallback = React.useRef(onPlayEnd);
  React.useEffect(() => {
    progressCallback.current = onProgressChange;
    endCallback.current = onPlayEnd;
  }, [onProgressChange, onPlayEnd]);

  // Placement only ever writes motion values, so it can run synchronously here
  // to seed the first paint without touching React state.
  React.useEffect(() => {
    const route = routeRef.current;
    if (!route || typeof route.getTotalLength !== "function") return;
    let total = 0;
    try {
      total = route.getTotalLength();
    } catch {
      return;
    }
    if (!(total > 0)) return;

    const place = () => {
      const at = clamp01(value.get()) * total;
      const here = route.getPointAtLength(at);
      const behind = route.getPointAtLength(Math.max(0, at - 1));
      const ahead = route.getPointAtLength(Math.min(total, at + 1));
      left.set(((here.x - box.x) / box.w) * 100);
      top.set(((here.y - box.y) / box.h) * 100);
      angle.set(
        (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI,
      );
    };

    place();
    return value.on("change", place);
  }, [path, box, value, left, top, angle]);

  React.useEffect(() => {
    let last = -1;
    return value.on("change", (v) => {
      const percent = Math.round(clamp01(v) * 100);
      if (percent === last) return;
      last = percent;
      progressCallback.current?.(percent / 100);
    });
  }, [value]);

  // Play. Resuming from the current position, with the remaining duration,
  // is what makes a tab-hidden pause read as a pause rather than a restart.
  React.useEffect(() => {
    if (!playing || !visible) return;
    if (value.get() >= 1) value.set(0);
    const remaining = duration * (1 - value.get());
    if (!motionSafe) {
      const timer = window.setInterval(() => {
        const next = Math.min(1, value.get() + 1 / REDUCED_STEPS);
        value.set(next);
        if (next < 1) return;
        window.clearInterval(timer);
        endCallback.current?.();
      }, duration / REDUCED_STEPS);
      return () => window.clearInterval(timer);
    }
    const controls = animate(value, 1, {
      duration: remaining / 1000,
      ease: easings.linear,
      onComplete: () => endCallback.current?.(),
    });
    return () => controls.stop();
  }, [playing, visible, duration, motionSafe, value]);

  React.useEffect(() => {
    if (playing || progress === undefined) return;
    value.set(clamp01(progress));
  }, [playing, progress, value]);

  React.useEffect(() => {
    if (playing || controlled) return;
    const root = container?.current;
    if (!root) return;
    const measure = () => {
      const span = root.scrollHeight - root.clientHeight;
      value.set(span > 0 ? clamp01(root.scrollTop / span) : 0);
    };
    root.addEventListener("scroll", measure, { passive: true });
    // ResizeObserver fires once on observe, which seeds the first reading.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      root.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [playing, controlled, container, value]);

  return (
    <figure className={cn("flex w-full flex-col gap-2", className)}>
      {/* The frame carries the viewBox's own ratio, so the SVG never
          letterboxes and the rider's percentage placement stays true. */}
      <div
        className="relative w-full overflow-hidden rounded-3 border border-hairline bg-surface-1"
        style={{ aspectRatio: `${box.w} / ${box.h}` }}
      >
        <svg
          viewBox={viewBox}
          aria-hidden
          className="absolute inset-0 size-full"
        >
          <path
            ref={routeRef}
            d={path}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="3 5"
            className="stroke-current text-hairline-strong"
          />
          <motion.path
            d={path}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: trail }}
            className="stroke-current text-cobalt-bright"
          />
        </svg>

        <motion.div
          aria-hidden
          style={{
            left: riderLeft,
            top: riderTop,
            x: "-50%",
            y: "-50%",
            rotate: angle,
          }}
          className="absolute flex items-center justify-center"
        >
          {rider ?? (
            <span className="flex size-6 items-center justify-center rounded-full border border-hairline-strong bg-surface-0 text-signal shadow-raised">
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-3.5 shrink-0 fill-none stroke-current"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m10 6 6 6-6 6" />
              </svg>
            </span>
          )}
        </motion.div>
      </div>

      <figcaption className="flex items-center justify-between gap-3">
        <span
          title={label}
          className="min-w-0 truncate text-xs text-muted-foreground"
        >
          {label}
        </span>
        <motion.span className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums">
          {readout}
        </motion.span>
      </figcaption>
    </figure>
  );
}
