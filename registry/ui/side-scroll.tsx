"use client";

import * as React from "react";

import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type SideScrollProps = {
  /** The panels, left to right. */
  panels: React.ReactNode[];
  /** The scrolling element whose travel drives the track. */
  container: React.RefObject<HTMLElement | null>;
  /** Width of one panel, px. @default 280 */
  panelWidth?: number;
  /** Fires with whole-percent progress, 0–100, when the percent changes. */
  onProgressChange?: (percent: number) => void;
  /** Names the pinned section. @default "Pinned track" */
  label?: string;
  /** Text of the control that jumps past the pinned run. @default "Skip the track" */
  skipLabel?: string;
  className?: string;
};

/** Gap between panels, px. It lives in code because the travel maths needs it. */
const GAP = 12;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A section that pins itself while the track inside it moves sideways. The
 * container's vertical travel maps straight onto the track's horizontal travel
 * — one linear mapping, no spring, because a scroll-linked value that springs
 * lags the finger and reads as lag rather than physics. The section reserves
 * exactly `frame height + track travel`, so the pin lasts precisely as long as
 * there is track left and not a pixel longer.
 *
 * The track is a list: an `<ol>` whose panels carry their own index, and the
 * index lights as its panel reaches the middle of the frame. Because the whole
 * thing rides native scroll, Page Down, Space and the arrow keys already work;
 * a skip control at the top of the pin jumps a keyboard past the run and puts
 * focus on the far side of it. Under reduced motion the track stacks into a
 * column and scrolls the ordinary way — the rail still fills, because progress
 * is information rather than decoration.
 */
export function SideScroll({
  panels,
  container,
  panelWidth = 280,
  onProgressChange,
  label = "Pinned track",
  skipLabel = "Skip the track",
  className,
}: SideScrollProps) {
  const motionSafe = useMotionSafe();

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLOListElement | null>(null);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  const x = useMotionValue(0);
  const fill = useMotionValue(0);

  const [travel, setTravel] = React.useState(0);
  const [frameHeight, setFrameHeight] = React.useState(0);
  // The scrollport's own height: the pin can only reach the end of its travel
  // if the section is at least a scrollport tall past the travel, or the
  // container's maximum scroll lands short of progress 1 whenever the frame
  // and whatever follows it are together shorter than the scrollport.
  const [rootHeight, setRootHeight] = React.useState(0);
  const [active, setActive] = React.useState(0);
  // The scroll handler decides against this ref rather than inside a state
  // updater: an updater may run during render, and reporting to a parent from
  // there is a cross-component update React refuses.
  const activeRef = React.useRef(0);

  const count = panels.length;

  const progressCallback = React.useRef(onProgressChange);
  React.useEffect(() => {
    progressCallback.current = onProgressChange;
  }, [onProgressChange]);

  // Measuring in an observer callback keeps the first paint honest:
  // ResizeObserver fires once on observe, so the numbers land before the
  // section ever needs its reserved height.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    const frame = frameRef.current;
    const root = container.current;
    if (!viewport || !track || !frame) return;

    const measure = () => {
      const span = Math.max(0, track.scrollWidth - viewport.clientWidth);
      setTravel((prev) => (prev === span ? prev : span));
      const height = frame.offsetHeight;
      setFrameHeight((prev) => (prev === height ? prev : height));
      const port = root?.clientHeight ?? 0;
      setRootHeight((prev) => (prev === port ? prev : port));
    };

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(track);
    if (root) observer.observe(root);
    return () => observer.disconnect();
  }, [container, count, panelWidth, motionSafe]);

  React.useEffect(() => {
    const root = container.current;
    const section = sectionRef.current;
    const viewport = viewportRef.current;
    if (!root || !section || !viewport) return;
    let lastPercent = -1;

    const measure = () => {
      const top =
        section.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop;
      // With no horizontal travel — reduced motion, or a frame wide enough to
      // hold every panel — progress falls back to the section's own extent, so
      // the readout stays truthful instead of pinning at zero.
      const span =
        travel > 0
          ? travel
          : Math.max(0, section.offsetHeight - root.clientHeight);
      const progress =
        span > 0 ? clamp((root.scrollTop - top) / span, 0, 1) : 0;

      x.set(-progress * travel);
      fill.set(progress);

      const percent = Math.round(progress * 100);
      if (percent !== lastPercent) {
        lastPercent = percent;
        progressCallback.current?.(percent);
      }

      const centre = progress * travel + viewport.clientWidth / 2;
      const index =
        travel > 0
          ? clamp(Math.floor(centre / (panelWidth + GAP)), 0, count - 1)
          : clamp(Math.round(progress * (count - 1)), 0, count - 1);
      if (index !== activeRef.current) {
        activeRef.current = index;
        setActive(index);
      }
    };

    root.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      root.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [container, travel, panelWidth, count, x, fill]);

  const skip = () => {
    const root = container.current;
    const section = sectionRef.current;
    if (!root || !section) return;
    const top =
      section.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop +
      section.offsetHeight;
    root.scrollTo({ top, behavior: motionSafe ? "smooth" : "auto" });
    // preventScroll, or the focus call would fight the scroll it just asked for.
    endRef.current?.focus({ preventScroll: true });
  };

  return (
    <section
      ref={sectionRef}
      aria-label={label}
      className={cn("relative w-full", className)}
      style={
        travel > 0
          ? { height: Math.max(frameHeight, rootHeight) + travel }
          : undefined
      }
    >
      <div
        ref={frameRef}
        className={cn(
          "flex flex-col gap-3 px-4 py-3",
          travel > 0 ? "sticky top-0" : "static",
        )}
      >
        <button
          type="button"
          onClick={skip}
          className="sr-only rounded-2 border border-hairline-strong bg-surface-1 px-3 py-1.5 text-xs font-medium text-ink outline-none focus-visible:not-sr-only focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {skipLabel}
        </button>

        <div ref={viewportRef} className="overflow-hidden">
          <motion.ol
            ref={trackRef}
            // The gap is inline so the travel maths and the paint agree on it.
            style={{ x, gap: GAP }}
            className={cn(
              "flex",
              motionSafe ? "flex-row items-stretch" : "flex-col",
            )}
          >
            {panels.map((panel, index) => {
              const isActive = index === active;
              return (
                <li
                  key={index}
                  aria-current={isActive ? "true" : undefined}
                  style={motionSafe ? { width: panelWidth } : undefined}
                  className={cn(
                    "flex min-w-0 shrink-0 flex-col gap-2 rounded-3 border p-3 transition-colors",
                    motionSafe ? "" : "w-full",
                    isActive
                      ? "border-hairline-strong bg-surface-1"
                      : "border-hairline bg-surface-0",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums transition-colors",
                      isActive ? "text-signal" : "text-ink-3",
                    )}
                  >
                    {pad(index + 1)}
                  </span>
                  <div className="min-w-0">{panel}</div>
                </li>
              );
            })}
          </motion.ol>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-hairline">
            <motion.div
              style={{ scaleX: fill }}
              className="h-full origin-left rounded-full bg-primary"
            />
          </div>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase tabular-nums">
            {pad(active + 1)} / {pad(count)}
          </span>
        </div>
      </div>

      {/* Where the skip control lands. It is pinned to the bottom of the
          reserved height, so focus arrives on the far side of the run rather
          than beside the frame the reader has just been sent past. */}
      <div
        ref={endRef}
        tabIndex={-1}
        className="absolute bottom-0 left-0 h-px w-full outline-none"
      />
    </section>
  );
}
