"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TraceSpan = {
  id: string;
  /** The span this one ran inside; a missing parent makes it a root. */
  parentId?: string;
  name: string;
  service: string;
  /** Offset from the start of the trace, in ms. */
  start: number;
  /** How long the span took, in ms. */
  duration: number;
  /** @default "ok" */
  status?: "ok" | "error";
};

export type TraceWaterfallProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The trace, in start order. */
  spans: TraceSpan[];
  /** Controlled set of collapsed parent ids. */
  collapsed?: string[];
  /** Initial collapsed set for uncontrolled usage. @default [] */
  defaultCollapsed?: string[];
  /** Fires from a press, from Left and Right, and from a host's own control. */
  onCollapsedChange?: (ids: string[]) => void;
  /** Fires as hover or focus moves, and with null when both leave. */
  onActiveChange?: (id: string | null) => void;
  /** The sentence the polite region just spoke. */
  onAnnounce?: (sentence: string) => void;
  /** Printed after every duration. @default "ms" */
  unit?: string;
  /** Names the tree. @default "Trace" */
  label?: string;
  className?: string;
};

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** A span narrower than this would draw as nothing at all. */
const MIN_SHARE = 1.5;

const countPhrase = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

const childPhrase = (count: number): string =>
  `${count} ${count === 1 ? "child" : "children"}`;

/** Three decimals before any percentage reaches a style: an unrounded ratio
 *  serialises differently in Node and the browser, and that is a hydration
 *  error rather than a rounding one. */
const pct = (value: number): string =>
  `${Number(Math.min(100, Math.max(0, value)).toFixed(3))}%`;

type Row = {
  span: TraceSpan;
  depth: number;
  kids: number;
  posInSet: number;
  setSize: number;
  /** The extent of this span and everything under it, as shares of the trace. */
  subFrom: number;
  subTo: number;
};

/**
 * A request, drawn as the time each of its parts took. Every span is a bar on
 * one shared axis — left is its start as a share of the trace, width is its
 * duration — and each bar draws in from its own left edge on `glide`, staggered
 * by `cascade()`, so the trace reads top to bottom the way it ran. Every
 * percentage is rounded to three decimals before it reaches a style.
 *
 * Hover or focus a span and the header reads it back. The outgoing and incoming
 * readings stack in one grid cell and cross-fade rather than swapping through
 * `mode="wait"`, so travelling the tree on the arrow keys can never blank the
 * line. Collapse a parent and its descendants leave on `exitFor()` while the
 * rows below travel up under `layout` on `glide`; the collapsed parent grows a
 * quieter second bar spanning everything it now hides, because folding must
 * never hide time.
 *
 * It is a real `role="tree"`: one roving tabindex, Up and Down between visible
 * rows, Right to open a parent or step into it, Left to close it or step out,
 * Home and End to the ends, Enter and Space to fold. Each row names itself as
 * one sentence — duration, start, status, children — so a failed span says so
 * rather than merely turning red, and a polite region speaks each fold from the
 * settled set. Under reduced motion the bars are still drawn to full width,
 * because a duration is information, but they appear rather than draw and
 * nothing FLIPs.
 */
export function TraceWaterfall({
  ref,
  spans,
  collapsed,
  defaultCollapsed,
  onCollapsedChange,
  onActiveChange,
  onAnnounce,
  unit = "ms",
  label = "Trace",
  className,
}: TraceWaterfallProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const [own, setOwn] = React.useState<string[]>(defaultCollapsed ?? []);
  const folded = collapsed ?? own;
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);

  const tree = React.useMemo(() => {
    const byId = new Map(spans.map((span) => [span.id, span]));
    const kids = new Map<string, string[]>();
    const roots: string[] = [];
    for (const span of spans) {
      const parent =
        span.parentId && byId.has(span.parentId) && span.parentId !== span.id
          ? span.parentId
          : null;
      if (parent) kids.set(parent, [...(kids.get(parent) ?? []), span.id]);
      else roots.push(span.id);
    }

    const from = spans.reduce(
      (low, span) => Math.min(low, span.start),
      spans[0]?.start ?? 0,
    );
    const to = spans.reduce(
      (high, span) => Math.max(high, span.start + span.duration),
      from,
    );
    const width = to - from > 0 ? to - from : 1;

    // The extent of a subtree is what a collapsed parent still has to show.
    const extents = new Map<
      string,
      { from: number; to: number; count: number }
    >();
    const walk = (id: string, seen: Set<string>) => {
      const span = byId.get(id);
      if (!span || seen.has(id)) return { from, to: from, count: 0 };
      seen.add(id);
      let low = span.start;
      let high = span.start + span.duration;
      let count = 0;
      for (const kid of kids.get(id) ?? []) {
        const sub = walk(kid, seen);
        low = Math.min(low, sub.from);
        high = Math.max(high, sub.to);
        count += sub.count + 1;
      }
      const box = { from: low, to: high, count };
      extents.set(id, box);
      return box;
    };
    const seen = new Set<string>();
    for (const id of roots) walk(id, seen);

    return { byId, kids, roots, from, width, extents };
  }, [spans]);

  const rows = React.useMemo(() => {
    const out: Row[] = [];
    const push = (ids: string[], depth: number) => {
      ids.forEach((id, index) => {
        const span = tree.byId.get(id);
        const box = tree.extents.get(id);
        if (!span || !box) return;
        const children = tree.kids.get(id) ?? [];
        const shut = folded.includes(id) && children.length > 0;
        out.push({
          span,
          depth,
          kids: children.length,
          posInSet: index + 1,
          setSize: ids.length,
          subFrom: ((box.from - tree.from) / tree.width) * 100,
          subTo: ((box.to - tree.from) / tree.width) * 100,
        });
        if (!shut && children.length > 0) push(children, depth + 1);
      });
    };
    push(tree.roots, 0);
    return out;
  }, [tree, folded]);

  const visibleIds = rows.map((row) => row.span.id);
  const activeId =
    hoverId && visibleIds.includes(hoverId)
      ? hoverId
      : focusId && visibleIds.includes(focusId)
        ? focusId
        : null;
  const activeSpan = activeId ? tree.byId.get(activeId) : undefined;

  const total = Math.round(tree.width);
  const reading = activeSpan
    ? `${activeSpan.service} ${activeSpan.name} · ${Math.round(activeSpan.duration)} ${unit}`
    : spans.length === 0
      ? "No spans in this trace."
      : `${countPhrase(spans.length, "span")} · ${total} ${unit}`;

  // Both the fold sentence and the active id are read from settled values, so a
  // controlled host is never announced ahead of its own answer.
  const foldKey = folded.join(",");
  const [spoken, setSpoken] = React.useState({
    key: foldKey,
    sentence: "",
    stamp: 0,
  });
  if (spoken.key !== foldKey) {
    const before = spoken.key ? spoken.key.split(",") : [];
    const shut = folded.filter((id) => !before.includes(id));
    const open = before.filter((id) => !folded.includes(id));
    const one =
      shut.length === 1 ? shut[0] : open.length === 1 ? open[0] : null;
    const span = one ? tree.byId.get(one) : undefined;
    const hiddenCount = one ? (tree.extents.get(one)?.count ?? 0) : 0;
    const sentence = span
      ? shut.length === 1
        ? `${span.service} ${span.name} collapsed, ${countPhrase(hiddenCount, "span")} hidden.`
        : `${span.service} ${span.name} expanded.`
      : folded.length === 0
        ? `All ${countPhrase(spans.length, "span")} shown.`
        : `${countPhrase(folded.length, "parent")} collapsed, ${countPhrase(spans.length - rows.length, "span")} hidden.`;
    setSpoken({ key: foldKey, sentence, stamp: spoken.stamp + 1 });
  }

  const announceRef = React.useRef(onAnnounce);
  const activeRef = React.useRef(onActiveChange);
  React.useEffect(() => {
    announceRef.current = onAnnounce;
    activeRef.current = onActiveChange;
  });
  React.useEffect(() => {
    if (spoken.sentence) announceRef.current?.(spoken.sentence);
  }, [spoken.stamp, spoken.sentence]);
  const firstActive = React.useRef(true);
  React.useEffect(() => {
    if (firstActive.current) {
      firstActive.current = false;
      return;
    }
    activeRef.current?.(activeId);
  }, [activeId]);

  const setFolded = (next: string[]) => {
    if (collapsed === undefined) setOwn(next);
    onCollapsedChange?.(next);
  };

  const fold = (id: string, shut: boolean) => {
    const next = shut
      ? folded.includes(id)
        ? folded
        : [...folded, id]
      : folded.filter((one) => one !== id);
    if (next !== folded) setFolded(next);
  };

  const moveTo = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    document.getElementById(`${baseId}-row-${id}`)?.focus();
  };

  const onRowKeyDown = (
    event: React.KeyboardEvent<HTMLLIElement>,
    row: Row,
    index: number,
  ) => {
    const shut = folded.includes(row.span.id) && row.kids > 0;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveTo(rows[Math.min(rows.length - 1, index + 1)]?.span.id);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveTo(rows[Math.max(0, index - 1)]?.span.id);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (row.kids === 0) return;
      if (shut) fold(row.span.id, false);
      else moveTo(rows[index + 1]?.span.id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (row.kids > 0 && !shut) {
        fold(row.span.id, true);
        return;
      }
      const parent = row.span.parentId;
      if (parent && visibleIds.includes(parent)) moveTo(parent);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveTo(rows[0]?.span.id);
    } else if (event.key === "End") {
      event.preventDefault();
      moveTo(rows[rows.length - 1]?.span.id);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (row.kids > 0) fold(row.span.id, !shut);
    }
  };

  const focusRow =
    focusId && visibleIds.includes(focusId) ? focusId : visibleIds[0];
  const stagger = cascade(Math.max(rows.length, 1));
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full flex-col gap-2 rounded-3 border border-hairline bg-surface-1 p-2",
        className,
      )}
    >
      {/* The readings share one cell and cross-fade, so arrow-key travel
          through the tree never blanks the line. */}
      <div aria-hidden className="grid h-4 items-center">
        <AnimatePresence initial={false}>
          <motion.span
            key={reading}
            className="col-start-1 row-start-1 truncate font-mono text-[11px] text-ink tabular-nums"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={fade}
          >
            {reading}
          </motion.span>
        </AnimatePresence>
      </div>

      <div
        aria-hidden
        className="flex items-center justify-between font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        <span>0 {unit}</span>
        <span className="h-px flex-1 bg-hairline" />
        <span className="pl-2">
          {total} {unit}
        </span>
      </div>

      <ol role="tree" aria-label={label} className="flex flex-col gap-1">
        {/* Not `initial={false}`: the waterfall draws itself when it arrives —
            that is the whole motion idea — and rows that mount later, when a
            parent is opened, draw the same way. */}
        <AnimatePresence>
          {rows.map((row, index) => {
            const shut = folded.includes(row.span.id) && row.kids > 0;
            const failed = row.span.status === "error";
            const left = ((row.span.start - tree.from) / tree.width) * 100;
            const width = Math.max(
              MIN_SHARE,
              (row.span.duration / tree.width) * 100,
            );
            return (
              <motion.li
                key={row.span.id}
                id={`${baseId}-row-${row.span.id}`}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-posinset={row.posInSet}
                aria-setsize={row.setSize}
                aria-expanded={row.kids > 0 ? !shut : undefined}
                aria-label={`${row.span.service} ${row.span.name}, ${Math.round(row.span.duration)} milliseconds, starts at ${Math.round(row.span.start - tree.from)} milliseconds, ${failed ? "error" : "ok"}${row.kids > 0 ? `, ${childPhrase(row.kids)}, ${shut ? "collapsed" : "expanded"}` : ""}.`}
                tabIndex={row.span.id === focusRow ? 0 : -1}
                layout={motionSafe ? "position" : false}
                onFocus={() => setFocusId(row.span.id)}
                onPointerEnter={() => setHoverId(row.span.id)}
                // A row that leaves under the pointer would otherwise strand the
                // readout on a span that is no longer there.
                onPointerLeave={() =>
                  setHoverId((prev) => (prev === row.span.id ? null : prev))
                }
                onClick={() => {
                  if (row.kids > 0) fold(row.span.id, !shut);
                }}
                onKeyDown={(event) => onRowKeyDown(event, row, index)}
                className={cn(
                  "flex flex-col gap-1 rounded-2 px-1 py-1 transition-colors",
                  row.kids > 0 && "cursor-pointer",
                  row.span.id === activeId ? "bg-accent" : "hover:bg-accent",
                  focusRing,
                )}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={motionSafe ? springs.glide : fade}
              >
                <span
                  aria-hidden
                  className="flex items-baseline gap-1.5 font-mono text-[11px]"
                  style={{ paddingLeft: row.depth * 10 }}
                >
                  <span
                    className={cn(
                      "w-2 shrink-0 text-center text-ink-3",
                      row.kids === 0 && "opacity-0",
                    )}
                  >
                    {shut ? "+" : "−"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {row.span.name}
                  </span>
                  <span className="shrink-0 text-ink-3">
                    {row.span.service}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      failed ? "text-danger" : "text-ink-2",
                    )}
                  >
                    {Math.round(row.span.duration)}
                  </span>
                </span>

                <span
                  aria-hidden
                  className="relative block h-1.5 w-full overflow-clip rounded-full bg-hairline [contain:paint]"
                >
                  {/* A collapsed parent still shows the reach of everything it
                      is hiding: folding may not hide time. */}
                  <AnimatePresence initial={false}>
                    {shut ? (
                      <motion.span
                        key="subtree"
                        className="absolute inset-y-0 rounded-full bg-hairline-strong"
                        style={{
                          left: pct(row.subFrom),
                          width: pct(
                            Math.max(MIN_SHARE, row.subTo - row.subFrom),
                          ),
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={fade}
                      />
                    ) : null}
                  </AnimatePresence>
                  <motion.span
                    className={cn(
                      "absolute inset-y-0 origin-left rounded-full",
                      failed ? "bg-danger" : "bg-cobalt-bright",
                    )}
                    style={{ left: pct(left), width: pct(width) }}
                    initial={motionSafe ? { scaleX: 0 } : { opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, delay: index * stagger }
                        : fade
                    }
                  />
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>

      <span role="status" aria-live="polite" className="sr-only">
        {spoken.sentence}
      </span>
    </div>
  );
}
