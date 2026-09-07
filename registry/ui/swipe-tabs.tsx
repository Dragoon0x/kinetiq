"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SwipeTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

export type SwipeTabsProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Tabs and their panels, left to right. */
  tabs: SwipeTab[];
  /** Controlled tab id. */
  value?: string;
  /** Initial tab id for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  className?: string;
  "aria-label"?: string;
};

type Metric = { left: number; width: number };

/** Past the first and last panel the strip still moves, at a third of the
 *  pointer's travel, so the end of the row is felt rather than announced. */
const RESISTANCE = 0.35;

/** A gesture shorter than this fraction of the panel still counts as a flick
 *  in its direction; without it a quick, small swipe reads as a dead spot. */
const FLICK = 0.12;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const sameNumbers = (a: number[], b: number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i]);

/**
 * Tabs whose panels are a strip you can push. Dragging moves the strip with the
 * pointer and the underline moves proportionally — it is the same value, not a
 * follower — so the indicator is always exactly where your thumb has taken you.
 * Release settles to the nearest panel on `snap`, one crisp overshoot, and the
 * strip's height glides to the new panel's measured height on `glide`; height
 * tracks the drag itself, so a taller neighbour is never clipped mid-gesture.
 *
 * Pointer capture waits for 4px of horizontal travel and stands down when the
 * travel is vertical, so a tap stays a tap and the page under it still scrolls.
 * A real tablist: Left and Right move and activate without wrapping past the
 * ends, Home and End jump. Under reduced motion the panels simply swap.
 */
export function SwipeTabs({
  ref,
  tabs,
  value,
  defaultValue,
  onValueChange,
  className,
  "aria-label": ariaLabel,
}: SwipeTabsProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();

  const [uncontrolled, setUncontrolled] = React.useState(
    defaultValue ?? tabs[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const index = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === current),
  );

  const tabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const panelRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const tablistRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);

  const offset = useMotionValue(0);
  const height = useMotionValue(0);
  const indicatorX = useMotionValue(0);
  const indicatorWidth = useMotionValue(0);

  const [viewport, setViewport] = React.useState(0);
  const [heights, setHeights] = React.useState<number[]>([]);
  const [metrics, setMetrics] = React.useState<Metric[]>([]);
  // Bumped on release so the settle effect re-runs even when the drag ends on
  // the panel it started from (or a controlled parent refuses the change).
  const [settle, setSettle] = React.useState(0);

  // A stable key for the measure effect: callers commonly rebuild the tabs
  // array every render, and re-observing on each one would thrash the observer.
  const tabKey = tabs.map((tab) => tab.id).join("|");
  const count = tabs.length;

  const drag = React.useRef<{
    x: number;
    y: number;
    base: number;
    from: number;
    captured: boolean;
  } | null>(null);
  const lastViewport = React.useRef(-1);

  const select = (id: string) => {
    if (!isControlled) setUncontrolled(id);
    if (id !== current) onValueChange?.(id);
  };

  const focusTab = (to: number) => {
    const next = tabs[clamp(to, 0, tabs.length - 1)];
    if (!next) return;
    tabRefs.current[clamp(to, 0, tabs.length - 1)]?.focus();
    select(next.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusTab(0);
        break;
      case "End":
        event.preventDefault();
        focusTab(tabs.length - 1);
        break;
      default:
        break;
    }
  };

  // Measuring in observer callbacks (never during render) keeps the first paint
  // honest: ResizeObserver fires once on observe, so the numbers land before
  // anything animates.
  React.useEffect(() => {
    const strip = viewportRef.current;
    const list = tablistRef.current;
    if (!strip || !list) return;

    const measure = () => {
      setViewport(strip.clientWidth);
      setHeights((prev) => {
        const next = panelRefs.current
          .slice(0, count)
          .map((node) => node?.offsetHeight ?? 0);
        return sameNumbers(prev, next) ? prev : next;
      });
      setMetrics((prev) => {
        const next = tabRefs.current.slice(0, count).map((node) => ({
          left: node?.offsetLeft ?? 0,
          width: node?.offsetWidth ?? 0,
        }));
        const unchanged =
          prev.length === next.length &&
          prev.every(
            (m, i) => m.left === next[i]?.left && m.width === next[i]?.width,
          );
        return unchanged ? prev : next;
      });
    };

    // The tablist is the width reference, not the strip: the strip's height is
    // animated, and observing it would re-measure on every frame of a settle.
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    panelRefs.current.forEach((node) => node && observer.observe(node));
    return () => observer.disconnect();
  }, [tabKey, count]);

  // The underline is driven by the strip's own offset, so it rides the drag and
  // the settle spring alike instead of re-deriving the position on each render.
  React.useEffect(() => {
    if (metrics.length === 0 || viewport === 0) return;
    const apply = (x: number) => {
      const position = clamp(-x / viewport, 0, metrics.length - 1);
      const from = Math.floor(position);
      const a = metrics[from];
      const b = metrics[Math.min(from + 1, metrics.length - 1)];
      if (!a || !b) return;
      const t = position - from;
      indicatorX.set(lerp(a.left, b.left, t));
      indicatorWidth.set(lerp(a.width, b.width, t));
    };
    apply(offset.get());
    return offset.on("change", apply);
  }, [metrics, viewport, offset, indicatorX, indicatorWidth]);

  // Settle: an index change springs, a resize jumps. Reduced motion always
  // jumps — the panel still changes, it just does not travel.
  React.useEffect(() => {
    if (viewport === 0) return;
    if (drag.current) return;
    const target = -index * viewport;
    const jump = !motionSafe || lastViewport.current !== viewport;
    lastViewport.current = viewport;
    if (jump) {
      offset.set(target);
      return;
    }
    const animation = animate(offset, target, springs.snap);
    return () => animation.stop();
  }, [index, viewport, motionSafe, offset, settle]);

  React.useEffect(() => {
    const target = heights[index] ?? 0;
    if (target === 0) return;
    if (drag.current) return;
    if (!motionSafe || height.get() === 0) {
      height.set(target);
      return;
    }
    const animation = animate(height, target, springs.glide);
    return () => animation.stop();
  }, [heights, index, motionSafe, height, settle]);

  const trackHeight = (x: number) => {
    if (heights.length === 0 || viewport === 0) return;
    const position = clamp(-x / viewport, 0, heights.length - 1);
    const from = Math.floor(position);
    const a = heights[from];
    const b = heights[Math.min(from + 1, heights.length - 1)];
    if (a === undefined || b === undefined) return;
    height.set(lerp(a, b, position - from));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!motionSafe || event.button !== 0) return;
    if (viewport === 0 || tabs.length < 2) return;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      base: offset.get(),
      from: index,
      captured: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.x;
    const dy = event.clientY - state.y;
    if (!state.captured) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      // A vertical gesture belongs to whatever scrolls behind the strip.
      if (Math.abs(dy) >= Math.abs(dx)) {
        drag.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      state.captured = true;
    }
    const min = -(tabs.length - 1) * viewport;
    let next = state.base + dx;
    if (next > 0) next *= RESISTANCE;
    else if (next < min) next = min + (next - min) * RESISTANCE;
    offset.set(next);
    trackHeight(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (
      state.captured &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state.captured) return;
    const position = -offset.get() / viewport;
    let target = Math.round(position);
    const travelled = position - state.from;
    if (target === state.from && Math.abs(travelled) > FLICK) {
      target = state.from + Math.sign(travelled);
    }
    target = clamp(target, 0, tabs.length - 1);
    const next = tabs[target];
    if (next) select(next.id);
    setSettle((n) => n + 1);
  };

  return (
    <div ref={ref} className={cn("flex w-full flex-col", className)}>
      <div
        ref={tablistRef}
        role="tablist"
        aria-label={ariaLabel}
        className="relative flex border-b border-hairline"
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[i] = node;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.id}`}
            aria-selected={i === index}
            aria-controls={`${baseId}-panel-${tab.id}`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => select(tab.id)}
            onKeyDown={handleKeyDown}
            className={cn(
              "flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-t-2 px-3 text-sm font-medium outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              "transition-colors",
              i === index
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="block truncate">{tab.label}</span>
          </button>
        ))}
        <motion.span
          aria-hidden
          style={{ x: indicatorX, width: indicatorWidth }}
          className="absolute bottom-0 left-0 h-0.5 rounded-full bg-primary"
        />
      </div>

      <motion.div
        ref={viewportRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={heights.length > 0 ? { height } : undefined}
        className="relative touch-pan-y overflow-hidden"
      >
        <motion.div className="flex items-start" style={{ x: offset }}>
          {tabs.map((tab, i) => (
            <div
              key={tab.id}
              ref={(node) => {
                panelRefs.current[i] = node;
              }}
              role="tabpanel"
              id={`${baseId}-panel-${tab.id}`}
              aria-labelledby={`${baseId}-tab-${tab.id}`}
              tabIndex={i === index ? 0 : undefined}
              inert={i === index ? undefined : true}
              className="w-full shrink-0 outline-none"
            >
              {tab.content}
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
