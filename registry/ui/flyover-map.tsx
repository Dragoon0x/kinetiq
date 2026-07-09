"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { clamp, liftShadowCss, perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Height budget the district plates share, px (pre-tilt). */
const MAP_STACK = 104;
/** Smallest district plate — a sliver stays clickable, px. */
const MIN_PLATE = 12;
/** Map plate width, px — clears content on a 375px viewport. */
const MAP_WIDTH = 72;
/** Hovered districts ride at altitude 0.3 off the map. */
const PLATE_LIFT = liftShadowCss(0.3);
/** Same shadow template at zero size and alpha, so the lift springs cleanly. */
const PLATE_REST =
  "0 0px 0px 0px color-mix(in oklab, oklch(0.05 0.02 258) 0%, transparent)";
/** Scrolling counts as settled after this quiet window, ms. */
const SETTLE_MS = 120;

export type FlyoverSection = {
  /** Stable id — becomes the fly-to handle and the arrival payload. */
  id: string;
  /** District label: names the map button, its hover chip, and announcements. */
  label: string;
  /** Section body, stacked in the scroll region. */
  content: React.ReactNode;
};

export type FlyoverMapProps = {
  /** Sections in scroll order — 3 to 6 read best. */
  sections: FlyoverSection[];
  /** Scroll viewport height, px. */
  height?: number;
  /** Fires when a fly touches down or free scrolling settles in a new section. */
  onArrive?: (id: string) => void;
  className?: string;
  /** Labels the scroll region. */
  "aria-label"?: string;
};

/**
 * A scroll region wearing its own aerial chart: a ResizeObserver measures each
 * section and renders it as a district plate on a rotateX(52°) miniature pinned
 * bottom-right — one flat `perspective(far) rotateX` transform, no preserve-3d —
 * plate heights proportional to the real estate below (min 12px). A translucent
 * viewport indicator (accent wash under an accent-bright hairline) overlays the
 * districts; its top/height are percent motion values written straight from the
 * scroll handler and scroll metrics — motion value writes only, no per-scroll
 * setState.
 *
 * Hovering a district (hover-capable pointers) lifts it toward the viewer —
 * translateY −3 + brightness on `snap`, `liftShadowCss(0.3)` — and floats its
 * label chip beside the map. Click or Enter flies the view: scrollTop rides a
 * motion value animated on `glide` (velocity 0), driving `element.scrollTop`
 * in onUpdate, so the indicator — a scroll derivative — glides in sync for
 * free. `onArrive` fires on touchdown; a second click mid-flight stops the
 * current flight before retargeting. Free scrolling settles through a 120ms
 * debounce that promotes the dominant visible section (endpoints bias to the
 * first/last district so the shallow ends stay reachable), firing `onArrive`
 * and moving aria-current exactly once per change.
 *
 * Semantics: the scroll region is a labelled role="region" with tabIndex 0
 * (keyboard scrollable); the map is role="navigation" ("Section map") of real
 * buttons — aria-current on the active district — sitting after the region in
 * tab order; an sr-only polite region announces arrivals by label.
 *
 * Reduced motion: the map renders flat (no tilt, no lift), clicks jump
 * scrollTop directly, and the indicator still tracks scroll.
 */
export function FlyoverMap({
  sections,
  height = 320,
  onArrive,
  className,
  "aria-label": ariaLabel = "Scroll region",
}: FlyoverMapProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const sectionEls = React.useRef(new Map<string, HTMLDivElement>());
  const observerRef = React.useRef<ResizeObserver | null>(null);
  const settleTimer = React.useRef<number | null>(null);
  const flightRef = React.useRef<ReturnType<typeof animate> | null>(null);

  /** Measured section heights by id — written only from the ResizeObserver. */
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [activeId, setActiveId] = React.useState<string>(
    () => sections[0]?.id ?? "",
  );
  const activeIdRef = React.useRef(activeId);
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  // Indicator geometry as pure scroll fractions: top = scrollTop/scrollHeight,
  // window = clientHeight/scrollHeight. Percent-positioned over the plate
  // stack, they hold whatever the plates measure.
  const topFrac = useMotionValue(0);
  const winFrac = useMotionValue(1);
  const indicatorTop = useMotionTemplate`${useTransform(topFrac, (v) => v * 100)}%`;
  const indicatorHeight = useMotionTemplate`${useTransform(winFrac, (v) => v * 100)}%`;
  /** The flight's subject — drives element.scrollTop from onUpdate. */
  const scrollMV = useMotionValue(0);

  const syncIndicator = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight <= 0) return;
    topFrac.set(el.scrollTop / el.scrollHeight);
    winFrac.set(Math.min(1, el.clientHeight / el.scrollHeight));
  }, [topFrac, winFrac]);

  const measureSections = React.useCallback(() => {
    const next: Record<string, number> = {};
    for (const [id, el] of sectionEls.current) next[id] = el.offsetHeight;
    // Dedupe: only commit when a height actually changed, so RO -> setState
    // -> layout can never loop.
    setHeights((prev) => {
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      const same =
        prevKeys.length === nextKeys.length &&
        nextKeys.every((key) => prev[key] === next[key]);
      return same ? prev : next;
    });
  }, []);

  // One observer watches every section (plate proportions) and the viewport
  // itself (indicator window). Refs attach before effects, so it adopts the
  // current roster at creation; later mounts observe via the callback ref.
  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      measureSections();
      syncIndicator();
    });
    observerRef.current = observer;
    const scrollEl = scrollRef.current;
    if (scrollEl) observer.observe(scrollEl);
    for (const el of sectionEls.current.values()) observer.observe(el);
    return () => {
      observerRef.current = null;
      observer.disconnect();
    };
  }, [measureSections, syncIndicator]);

  // First-paint indicator sync — motion value writes only.
  React.useEffect(() => {
    syncIndicator();
  }, [syncIndicator]);

  // Unmount: kill the settle debounce and any in-flight scroll animation.
  React.useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      flightRef.current?.stop();
      flightRef.current = null;
    },
    [],
  );

  const registerSection = React.useCallback(
    (el: HTMLDivElement | null): (() => void) | undefined => {
      if (el === null) return undefined;
      const id = el.dataset.flyoverSection ?? "";
      sectionEls.current.set(id, el);
      observerRef.current?.observe(el);
      return () => {
        observerRef.current?.unobserve(el);
        sectionEls.current.delete(id);
      };
    },
    [],
  );

  /** Single arrival gate: dedupes, moves aria-current, announces, notifies. */
  const commitArrival = (id: string) => {
    if (activeIdRef.current === id) return;
    activeIdRef.current = id;
    setActiveId(id);
    setAnnouncement(sections.find((s) => s.id === id)?.label ?? id);
    onArrive?.(id);
  };

  /** The section owning the most visible pixels; endpoints bias to the ends. */
  const dominantSection = (container: HTMLDivElement): string | null => {
    if (sections.length === 0) return null;
    const top = container.scrollTop;
    const bottom = top + container.clientHeight;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    if (top <= 2) return sections[0]?.id ?? null;
    if (top >= maxScroll - 2) return sections[sections.length - 1]?.id ?? null;
    let bestId: string | null = null;
    let bestPx = 0;
    for (const section of sections) {
      const el = sectionEls.current.get(section.id);
      if (!el) continue;
      const secTop = el.offsetTop;
      const visible =
        Math.min(bottom, secTop + el.offsetHeight) - Math.max(top, secTop);
      if (visible > bestPx) {
        bestPx = visible;
        bestId = section.id;
      }
    }
    return bestId;
  };

  const settleScroll = () => {
    settleTimer.current = null;
    // Mid-flight quiet frames never settle — touchdown owns that arrival.
    if (flightRef.current !== null) return;
    const container = scrollRef.current;
    if (!container) return;
    const id = dominantSection(container);
    if (id !== null) commitArrival(id);
  };

  const handleScroll = () => {
    syncIndicator();
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settleScroll, SETTLE_MS);
  };

  const flyTo = (id: string) => {
    const container = scrollRef.current;
    const target = sectionEls.current.get(id);
    if (!container || !target) return;
    const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
    const dest = clamp(target.offsetTop, 0, maxScroll);

    // Retarget safely: stop the current flight before boarding the next.
    flightRef.current?.stop();
    flightRef.current = null;

    if (!motionSafe) {
      container.scrollTop = dest;
      commitArrival(id);
      return;
    }

    scrollMV.set(container.scrollTop);
    flightRef.current = animate(scrollMV, dest, {
      ...springs.glide,
      velocity: 0,
      onUpdate: (latest) => {
        container.scrollTop = latest;
      },
      onComplete: () => {
        flightRef.current = null;
        commitArrival(id);
      },
    });
  };

  // District plates share MAP_STACK proportionally to measured heights;
  // unmeasured (first paint, no-RO environments) falls back to equal shares.
  const measured = sections.map((section) => heights[section.id] ?? 0);
  const totalMeasured = measured.reduce((sum, h) => sum + h, 0);
  const equalShare = sections.length > 0 ? MAP_STACK / sections.length : MAP_STACK;
  const plateHeights = measured.map((h) =>
    Math.max(
      MIN_PLATE,
      totalMeasured > 0 ? (h / totalMeasured) * MAP_STACK : equalShare,
    ),
  );

  const hoveredLabel =
    hoveredId !== null
      ? (sections.find((s) => s.id === hoveredId)?.label ?? null)
      : null;

  return (
    <div className={cn("relative w-full", className)}>
      {/* The instrument viewport — a plain 2D scroll region, keyboard reachable. */}
      <div
        ref={scrollRef}
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        onScroll={handleScroll}
        style={{ height }}
        className={cn(
          "relative w-full overflow-y-auto overscroll-y-contain rounded-4 border border-hairline bg-surface-0",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
          "[scrollbar-color:var(--hairline-strong)_transparent] [scrollbar-width:thin]",
        )}
      >
        {sections.map((section, index) => (
          <div
            key={section.id}
            ref={registerSection}
            data-flyover-section={section.id}
            className="border-b border-hairline px-5 py-6 last:border-b-0"
          >
            <div className="mb-3 flex items-baseline gap-3">
              <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="m-0 text-sm font-medium text-ink">
                {section.label}
              </h3>
            </div>
            <div className="text-sm text-ink-2">{section.content}</div>
          </div>
        ))}
      </div>

      {/* The minimap — after the region in DOM, so it tabs after the scroll. */}
      <nav
        role="navigation"
        aria-label="Section map"
        className="absolute right-3 bottom-3 z-10"
        style={{ width: MAP_WIDTH }}
      >
        {/* Hovered district's label chip, floated beside the map. */}
        <AnimatePresence>
          {hoveredLabel !== null ? (
            <motion.span
              aria-hidden
              initial={{ opacity: 0, x: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{
                opacity: 0,
                x: motionSafe ? distances.nudge : 0,
                transition: exitFor(durations.fast),
              }}
              transition={{
                x: springs.snap,
                opacity: { duration: durations.fast },
              }}
              className="pointer-events-none absolute right-full bottom-2 mr-2 rounded-2 border border-hairline bg-surface-2 px-2 py-1 text-label whitespace-nowrap text-ink-2"
            >
              {hoveredLabel}
            </motion.span>
          ) : null}
        </AnimatePresence>

        {/* One flat transform tilts the whole chart — no preserve-3d. */}
        <div
          className="relative flex flex-col gap-[2px]"
          style={
            motionSafe
              ? {
                  transform: `perspective(${perspectives.far}px) rotateX(52deg)`,
                  transformOrigin: "50% 100%",
                }
              : undefined
          }
        >
          {sections.map((section, index) => {
            const isActive = section.id === activeId;
            return (
              <motion.button
                key={section.id}
                type="button"
                aria-label={section.label}
                aria-current={isActive ? "true" : undefined}
                onClick={() => flyTo(section.id)}
                onHoverStart={() => setHoveredId(section.id)}
                onHoverEnd={() =>
                  setHoveredId((prev) => (prev === section.id ? null : prev))
                }
                initial={false}
                animate={{ y: 0, filter: "brightness(1)", boxShadow: PLATE_REST }}
                whileHover={
                  motionSafe
                    ? {
                        y: -3,
                        filter: "brightness(1.12)",
                        boxShadow: PLATE_LIFT,
                      }
                    : undefined
                }
                transition={springs.snap}
                style={{ height: plateHeights[index] ?? MIN_PLATE }}
                className={cn(
                  "w-full cursor-pointer rounded-1 border",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  isActive
                    ? "border-cobalt-bright/60 bg-cobalt-wash"
                    : "border-hairline bg-surface-2",
                )}
              />
            );
          })}

          {/* Viewport indicator — a scroll derivative, so flights carry it free. */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 rounded-1 border"
            style={{
              top: indicatorTop,
              height: indicatorHeight,
              background: "var(--accent-wash)",
              borderColor: "var(--accent-bright)",
            }}
          />
        </div>
      </nav>

      {/* Arrival announcements for screen readers. */}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
