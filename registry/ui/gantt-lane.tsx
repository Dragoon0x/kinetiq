"use client";

import * as React from "react";

import { AnimatePresence, motion, type Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GanttTask = {
  id: string;
  label: string;
  /** Day offset from the chart start, inclusive. */
  start: number;
  /** Day offset from the chart start, exclusive. */
  end: number;
  /** Ids this task cannot begin before. */
  deps?: string[];
};

export type GanttLaneProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Seeds the lanes; the chart owns positions after that and reports via onChange. */
  tasks: GanttTask[];
  /** Columns in the grid. @default 21 */
  days?: number;
  /** Day offset the today line stands on. Omit it and no line is drawn. */
  today?: number;
  /** Fires with the whole plan after a drag or a keyboard nudge. */
  onChange?: (tasks: GanttTask[]) => void;
  /** Names a day offset for the header, bar descriptions and the live readout. */
  formatDay?: (day: number) => string;
  /** Fires with the hovered or focused task id, or null when nothing is lit. */
  onActiveChange?: (id: string | null) => void;
  /** Visible chart label. Omit it and pass `aria-label` to name it invisibly. */
  label?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

/** One day column: wide enough to grab, narrow enough for three weeks. */
const DAY_W = 26;
/** Lane pitch and the bar band inside it. */
const LANE_H = 30;
const BAR_H = 20;
/** Sticky task-name column, and the plate's padding around the grid. */
const LABEL_W = 92;
const HEADER_H = 22;
const PLATE_PAD = 8;
/** A day tick every week keeps the header readable at this column width. */
const TICK_EVERY = 7;
/** Travel before a press becomes a drag, so a click still lands. */
const DRAG_SLOP = 4;

const defaultFormatDay = (day: number): string => `Day ${day}`;

/** Capture throws on a synthetic pointer id; the drag works without it. */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // No active pointer to capture — dragging continues unconfined.
  }
};

const releasePointer = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released, or never captured.
  }
};

const clampTask = (task: GanttTask, days: number): GanttTask => {
  const length = Math.max(1, Math.round(task.end - task.start));
  const start = Math.min(Math.max(Math.round(task.start), 0), days - length);
  return { ...task, start, end: start + length };
};

const shiftTask = (
  list: GanttTask[],
  id: string,
  delta: number,
  days: number,
): GanttTask[] =>
  list.map((task) =>
    task.id === id
      ? clampTask(
          { ...task, start: task.start + delta, end: task.end + delta },
          days,
        )
      : task,
  );

/**
 * Pushes any dependent that would start before its dependency ends. The
 * anchor is never pushed — it is the bar under the hand — and the pass count
 * is bounded so a cyclic plan settles instead of spinning.
 */
const relax = (
  list: GanttTask[],
  anchorId: string | null,
  days: number,
): GanttTask[] => {
  const placed = new Map(list.map((task) => [task.id, clampTask(task, days)]));
  for (let pass = 0; pass <= list.length; pass += 1) {
    let moved = false;
    for (const task of list) {
      if (task.id === anchorId || !task.deps?.length) continue;
      const current = placed.get(task.id);
      if (!current) continue;
      let earliest = 0;
      for (const depId of task.deps) {
        const dep = placed.get(depId);
        if (dep) earliest = Math.max(earliest, dep.end);
      }
      if (current.start >= earliest) continue;
      const length = current.end - current.start;
      const start = Math.min(earliest, days - length);
      if (start <= current.start) continue;
      placed.set(task.id, { ...current, start, end: start + length });
      moved = true;
    }
    if (!moved) break;
  }
  return list.map((task) => placed.get(task.id) ?? task);
};

/** Everything a task waits on and everything waiting on it — the whole chain. */
const chainOf = (list: GanttTask[], id: string | null): Set<string> => {
  const chain = new Set<string>();
  if (!id) return chain;
  const edges = new Map<string, string[]>();
  const link = (a: string, b: string) =>
    edges.set(a, [...(edges.get(a) ?? []), b]);
  for (const task of list) {
    for (const depId of task.deps ?? []) {
      link(task.id, depId);
      link(depId, task.id);
    }
  }
  const queue = [id];
  for (let at = queue.pop(); at !== undefined; at = queue.pop()) {
    if (chain.has(at)) continue;
    chain.add(at);
    queue.push(...(edges.get(at) ?? []));
  }
  return chain;
};

/**
 * A plan on three weeks of grid. Bars arrive a `shift` from their lane in
 * `cascade()` order on `glide` — the spring for a layout settling into place —
 * so a six-task plan reads as one sweep rather than six blinks. Hovering or
 * focusing a bar lights its whole chain and draws the connectors with
 * `pathLength` on `flick`, quick enough that the link reads as a consequence
 * of the hover. Dragging a bar tracks the pointer 1:1, pushes any dependent it
 * would overrun, and settles onto the whole day on `snap`: one crisp overshoot
 * to say the day is committed.
 *
 * Bars are buttons carrying their dates through `aria-describedby`. Left and
 * Right nudge the focused bar a day, Up and Down walk the lanes, Home and End
 * jump to the ends, Enter pins the chain and Escape unpins it. The lanes
 * scroll under edge fades on a phone with the task names pinned. Under reduced
 * motion bars appear in place and connectors are drawn already complete.
 */
export function GanttLane({
  ref,
  tasks,
  days = 21,
  today,
  onChange,
  formatDay = defaultFormatDay,
  onActiveChange,
  label,
  className,
  "aria-label": ariaLabel,
}: GanttLaneProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const labelId = `${uid}-label`;

  const [items, setItems] = React.useState<GanttTask[]>(() =>
    relax(
      tasks.map((task) => clampTask(task, days)),
      null,
      days,
    ),
  );
  /** Raw pointer travel of the bar under the hand; null when nothing is held. */
  const [drag, setDrag] = React.useState<{ id: string; dx: number } | null>(
    null,
  );
  /** The last bar the user moved — the only one that settles on `snap`. */
  const [settleId, setSettleId] = React.useState<string | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);

  const dragRef = React.useRef<{
    id: string;
    pointerId: number;
    startX: number;
    engaged: boolean;
  } | null>(null);
  const barRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const activeRef = React.useRef<string | null>(null);
  const activeChangeRef = React.useRef(onActiveChange);
  React.useEffect(() => {
    activeChangeRef.current = onActiveChange;
  }, [onActiveChange]);

  const highlightId = hoverId ?? focusId ?? pinnedId;
  // Reported after the render that changed it, never from inside an updater —
  // a parent setState during another component's render is a crash.
  React.useEffect(() => {
    if (activeRef.current === highlightId) return;
    activeRef.current = highlightId;
    activeChangeRef.current?.(highlightId);
  }, [highlightId]);

  const dayDelta = drag ? Math.round(drag.dx / DAY_W) : 0;
  /** What the lanes show right now: the committed plan plus any live drag. */
  const shown = React.useMemo(
    () =>
      drag
        ? relax(shiftTask(items, drag.id, dayDelta, days), drag.id, days)
        : items,
    [items, drag, dayDelta, days],
  );

  const chain = React.useMemo(
    () => chainOf(shown, highlightId),
    [shown, highlightId],
  );

  const commit = (next: GanttTask[], id: string) => {
    const changed = next.some((task, index) => {
      const before = items[index];
      return !before || before.start !== task.start;
    });
    setItems(next);
    setSettleId(id);
    if (changed) onChange?.(next);
  };

  const nudge = (id: string, delta: number) => {
    commit(relax(shiftTask(items, id, delta, days), id, days), id);
  };

  const focusBar = (index: number) => {
    const clamped = Math.min(shown.length - 1, Math.max(0, index));
    barRefs.current[clamped]?.focus();
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    task: GanttTask,
    index: number,
  ) => {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        nudge(task.id, -1);
        break;
      case "ArrowRight":
        event.preventDefault();
        nudge(task.id, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusBar(index - 1);
        break;
      case "ArrowDown":
        event.preventDefault();
        focusBar(index + 1);
        break;
      case "Home":
        event.preventDefault();
        focusBar(0);
        break;
      case "End":
        event.preventDefault();
        focusBar(shown.length - 1);
        break;
      case "Escape":
        if (pinnedId) {
          event.preventDefault();
          setPinnedId(null);
        }
        break;
      default:
        break;
    }
  };

  // Edge fades appear only where there is more grid to reach; the observer
  // fires once on observe, so the first paint is already correct.
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [edges, setEdges] = React.useState({ start: false, end: false });
  React.useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const overflow = node.scrollWidth - node.clientWidth;
      setEdges((prev) => {
        const next = {
          start: node.scrollLeft > 1,
          end: node.scrollLeft < overflow - 1,
        };
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    };
    node.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  const gridW = days * DAY_W;
  const bodyH = shown.length * LANE_H;
  const step = cascade(shown.length);

  const connectors = React.useMemo(() => {
    if (!highlightId) return [];
    const laneY = (id: string) => {
      const index = shown.findIndex((task) => task.id === id);
      return index * LANE_H + LANE_H / 2;
    };
    const lines: { key: string; d: string; ax: number; ay: number }[] = [];
    for (const task of shown) {
      if (!chain.has(task.id)) continue;
      for (const depId of task.deps ?? []) {
        const dep = shown.find((candidate) => candidate.id === depId);
        if (!dep || !chain.has(depId)) continue;
        const x1 = dep.end * DAY_W;
        const y1 = laneY(dep.id);
        const x2 = task.start * DAY_W;
        const y2 = laneY(task.id);
        const elbow = Math.max(x1 + 6, x2 - 8);
        lines.push({
          key: `${dep.id}-${task.id}`,
          d: `M${x1} ${y1} H${elbow} V${y2} H${x2}`,
          ax: x2,
          ay: y2,
        });
      }
    }
    return lines;
  }, [shown, chain, highlightId]);

  const barTransition = (id: string): Transition => {
    if (!motionSafe) return { duration: 0 };
    if (drag?.id === id) return { duration: 0 };
    return id === settleId ? springs.snap : springs.glide;
  };

  /** Arrival: a `shift` of travel, staggered so the plan reads as one sweep. */
  const entrance = (index: number): Transition =>
    motionSafe
      ? {
          ...springs.glide,
          delay: index * step,
          opacity: {
            duration: durations.base,
            ease: easings.enter,
            delay: index * step,
          },
        }
      : { duration: durations.fast };

  const barClass = (id: string, lit: boolean, isSource: boolean) =>
    cn(
      "absolute top-0 left-0 cursor-grab touch-pan-y rounded-full border outline-none",
      "focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
      drag?.id === id && "shadow-raised cursor-grabbing",
      isSource
        ? "bg-primary border-cobalt-bright"
        : lit
          ? "bg-cobalt-wash border-cobalt-bright"
          : "bg-cobalt-wash border-hairline-strong hover:border-cobalt-bright/60",
    );

  const startDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (event.button !== 0) return;
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      engaged: false,
    };
  };

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const held = dragRef.current;
    if (!held || held.pointerId !== event.pointerId) return;
    const dx = event.clientX - held.startX;
    if (!held.engaged) {
      if (Math.abs(dx) <= DRAG_SLOP) return;
      held.engaged = true;
      // Captured only now: capturing on pointerdown swallows the click a
      // tap is made of, and a synthetic pointer id would throw.
      capturePointer(event.currentTarget, event.pointerId);
    }
    setDrag({ id: held.id, dx });
  };

  const endDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const held = dragRef.current;
    releasePointer(event.currentTarget, event.pointerId);
    dragRef.current = null;
    setDrag(null);
    if (!held?.engaged) return;
    const delta = Math.round((event.clientX - held.startX) / DAY_W);
    commit(
      relax(shiftTask(items, held.id, delta, days), held.id, days),
      held.id,
    );
  };

  const cancelDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    releasePointer(event.currentTarget, event.pointerId);
    dragRef.current = null;
    setDrag(null);
  };

  /** Both overlays cover exactly the lane grid, past the pinned name column. */
  const overlay = { left: LABEL_W, top: HEADER_H, width: gridW, height: bodyH };

  const settled = settleId
    ? shown.find((task) => task.id === settleId)
    : undefined;

  return (
    <div
      ref={ref}
      role="group"
      aria-labelledby={label ? labelId : undefined}
      aria-label={label ? undefined : ariaLabel}
      className={cn("flex w-full flex-col gap-3", className)}
    >
      {label ? (
        <div id={labelId} className="text-sm font-semibold">
          {label}
        </div>
      ) : null}

      <div className="relative rounded-3 border border-hairline bg-surface-1 p-2">
        <div ref={scrollerRef} className="overflow-x-auto">
          <div className="relative" style={{ width: LABEL_W + gridW }}>
            <div className="flex" style={{ height: HEADER_H }}>
              <div
                className="sticky left-0 z-20 shrink-0 bg-surface-1"
                style={{ width: LABEL_W }}
              />
              <div className="relative shrink-0" style={{ width: gridW }}>
                {Array.from(
                  { length: Math.ceil(days / TICK_EVERY) },
                  (_, tick) => tick * TICK_EVERY,
                ).map((day) => (
                  <span
                    key={day}
                    className="absolute top-0 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase"
                    style={{ left: day * DAY_W + 3 }}
                  >
                    {formatDay(day)}
                  </span>
                ))}
              </div>
            </div>

            {/* Grid and today line sit behind the lanes, which carry z-10. */}
            <div
              aria-hidden
              className="pointer-events-none absolute"
              style={overlay}
            >
              {Array.from({ length: days + 1 }, (_, day) => (
                <span
                  key={day}
                  className={cn(
                    "absolute top-0 bottom-0 w-px",
                    day % TICK_EVERY === 0
                      ? "bg-hairline-strong"
                      : "bg-hairline",
                  )}
                  style={{ left: day * DAY_W }}
                />
              ))}
              {today !== undefined && today >= 0 && today <= days ? (
                <>
                  <span
                    className="absolute top-0 bottom-0 w-px bg-cobalt-bright"
                    style={{ left: today * DAY_W }}
                  />
                  <span
                    className="absolute size-1.5 rounded-full bg-cobalt-bright"
                    style={{ left: today * DAY_W - 2.5, top: -3 }}
                  />
                </>
              ) : null}
            </div>

            <ul role="list" className="relative z-10 list-none">
              {shown.map((task, index) => {
                const width = Math.max((task.end - task.start) * DAY_W - 3, 8);
                const residual =
                  drag?.id === task.id ? drag.dx - dayDelta * DAY_W : 0;
                const x = task.start * DAY_W + 1.5 + residual;
                const lit = chain.has(task.id);
                const isSource = highlightId === task.id;
                const dateId = `${uid}-dates-${task.id}`;
                return (
                  <li
                    key={task.id}
                    className="flex items-center"
                    style={{ height: LANE_H }}
                  >
                    <span
                      className="sticky left-0 z-20 shrink-0 truncate bg-surface-1 pr-2 text-[11px] text-ink-2"
                      style={{ width: LABEL_W }}
                      title={task.label}
                    >
                      {task.label}
                    </span>
                    <span id={dateId} className="sr-only">
                      {formatDay(task.start)} to {formatDay(task.end)}
                    </span>
                    <div
                      className="relative shrink-0"
                      style={{ width: gridW, height: BAR_H }}
                    >
                      <motion.button
                        ref={(node) => {
                          barRefs.current[index] = node;
                        }}
                        type="button"
                        aria-label={task.label}
                        aria-describedby={dateId}
                        aria-pressed={pinnedId === task.id}
                        // Until a bar is moved its only travel is its arrival,
                        // so the cascade transition can live here; the first
                        // drag or nudge retires it for the settle spring.
                        initial={
                          motionSafe
                            ? { x: x - distances.shift, opacity: 0 }
                            : { x, opacity: 0 }
                        }
                        animate={{ x, opacity: 1 }}
                        transition={
                          settleId || drag
                            ? barTransition(task.id)
                            : entrance(index)
                        }
                        style={{ width, height: BAR_H }}
                        onPointerDown={(event) => startDrag(event, task.id)}
                        onPointerMove={moveDrag}
                        onPointerUp={endDrag}
                        onPointerCancel={cancelDrag}
                        onPointerEnter={() => setHoverId(task.id)}
                        onPointerLeave={() => setHoverId(null)}
                        onFocus={() => setFocusId(task.id)}
                        onBlur={() => setFocusId(null)}
                        onClick={() =>
                          setPinnedId((p) => (p === task.id ? null : task.id))
                        }
                        onKeyDown={(event) => handleKeyDown(event, task, index)}
                        className={barClass(task.id, lit, isSource)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Connectors ride above the bars but take no pointer events. */}
            <svg
              aria-hidden
              className="pointer-events-none absolute"
              style={overlay}
              viewBox={`0 0 ${gridW} ${bodyH}`}
            >
              <AnimatePresence>
                {connectors.map((line, index) => (
                  <motion.g
                    key={line.key}
                    initial={{ opacity: motionSafe ? 0 : 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{ duration: durations.blink }}
                  >
                    <motion.path
                      d={line.d}
                      fill="none"
                      stroke="var(--accent-bright)"
                      strokeWidth={1.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={motionSafe ? { pathLength: 0 } : false}
                      animate={{ pathLength: 1 }}
                      transition={
                        motionSafe
                          ? { ...springs.flick, delay: index * 0.03 }
                          : { duration: 0 }
                      }
                    />
                    <path
                      d={`M${line.ax - 4} ${line.ay - 3} L${line.ax} ${line.ay} L${line.ax - 4} ${line.ay + 3}`}
                      fill="none"
                      stroke="var(--accent-bright)"
                      strokeWidth={1.25}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.g>
                ))}
              </AnimatePresence>
            </svg>
          </div>
        </div>

        {edges.start ? (
          /* Offset past the pinned name column, so the fade veils the
             scrolling lanes and never the labels that stay put. */
          <span
            aria-hidden
            style={{ left: LABEL_W + PLATE_PAD }}
            className="pointer-events-none absolute inset-y-0 w-6 bg-linear-to-r from-surface-1 to-surface-1/0"
          />
        ) : null}
        {edges.end ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-surface-1 to-surface-1/0"
          />
        ) : null}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {settled
          ? `${settled.label} moved to ${formatDay(settled.start)} through ${formatDay(settled.end)}`
          : ""}
      </span>
    </div>
  );
}
