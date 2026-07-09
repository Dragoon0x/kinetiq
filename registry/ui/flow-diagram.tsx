"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** One node. `column` (0-based) places it left→right; ties stack vertically. */
export type FlowNode = { id: string; label: string; column: number };

/** A directed link. `value` sets its thickness and tint; ∝ quantity flowing. */
export type FlowLink = { source: string; target: string; value: number };

export type FlowDiagramProps = {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Stage height in px; the width is fluid and the viewBox fixed. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** Fixed viewBox width — the SVG scales to its container via `w-full`. */
const VIEW_W = 640;
/** Node column width in viewBox px. Labels sit inside this band. */
const NODE_W = 12;
/** Inset so the first/last columns and their labels never clip. */
const PAD_X = 8;
const PAD_Y = 10;
/** Minimum vertical gap between stacked nodes in a column (viewBox px). */
const NODE_GAP = 10;
/** Floor on a node's drawn height so single-link nodes stay grabbable. */
const MIN_NODE_H = 6;
/** Floor on a link's thickness so the thinnest flow is still visible. */
const MIN_LINK_W = 1.5;
/** Dash cell length (px) for the marching-flow stroke. */
const DASH = 10;
/** Seconds for one dash cell to march source→target. Subtle, not busy. */
const MARCH_S = 1.1;

/** A node resolved into viewBox space, with its running link offsets. */
type LaidNode = {
  id: string;
  label: string;
  column: number;
  x: number;
  y: number;
  h: number;
  /** max(inSum, outSum) — the node's throughput, drives `h`. */
  flow: number;
  /** Cursor down the node's right edge as outgoing links are attached. */
  outCursor: number;
  /** Cursor down the node's left edge as incoming links are attached. */
  inCursor: number;
};

/** A link resolved into a drawable cubic-bezier path with a thickness. */
type LaidLink = {
  key: string;
  source: string;
  target: string;
  value: number;
  d: string;
  width: number;
  /** 0..1 of the max link value — tints thin→thick from wash→cobalt. */
  intensity: number;
};

type Layout = {
  nodes: LaidNode[];
  links: LaidLink[];
  /** id → node, for O(1) lookup during highlight BFS and rendering. */
  byId: Map<string, LaidNode>;
  /** id → connected component (up+downstream) for highlight, memoized once. */
  reachable: Map<string, { nodes: Set<string>; links: Set<string> }>;
};

/** Smooth cubic with horizontal control handles at the column midpoint. */
function linkPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2;
  return (
    `M${x1.toFixed(2)} ${y1.toFixed(2)} ` +
    `C${mx.toFixed(2)} ${y1.toFixed(2)} ` +
    `${mx.toFixed(2)} ${y2.toFixed(2)} ` +
    `${x2.toFixed(2)} ${y2.toFixed(2)}`
  );
}

/**
 * A Sankey flow diagram. Nodes sit in columns; links between them are cubic
 * beziers whose stroke-width is proportional to their value, so the picture
 * reads as quantity moving left→right. Link strokes carry a marching dash that
 * conveys flow direction. Hovering or focusing a node highlights its entire
 * upstream+downstream path (BFS over links, both directions) in `--signal` and
 * dims the rest; keyboard users get the same by tabbing between nodes.
 *
 * Reduced motion: links render solid (no marching dash) and fully drawn on
 * first paint; the highlight still works — it is colour, not motion. An
 * always-present sr-only summary lists every flow so the diagram is meaningful
 * without interaction. Layout is computed in a useMemo from props against a
 * fixed viewBox, so nothing is measured and SSR is stable.
 */
export function FlowDiagram({
  nodes,
  links,
  height = 300,
  className,
  "aria-label": ariaLabel,
}: FlowDiagramProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  // Which node is being traced (hover or focus). null = nothing highlighted.
  const [active, setActive] = React.useState<string | null>(null);

  const layout = React.useMemo<Layout>(() => {
    const byId = new Map<string, LaidNode>();
    if (nodes.length === 0) {
      return { nodes: [], links: [], byId, reachable: new Map() };
    }

    // Keep only links whose endpoints both exist and carry positive value —
    // guards unknown ids and empty/degenerate inputs.
    const known = new Set(nodes.map((n) => n.id));
    const valid = links.filter(
      (l) =>
        known.has(l.source) &&
        known.has(l.target) &&
        l.source !== l.target &&
        l.value > 0,
    );

    // Throughput per node = max(sum of incoming, sum of outgoing).
    const inSum = new Map<string, number>();
    const outSum = new Map<string, number>();
    for (const l of valid) {
      outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.value);
      inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.value);
    }

    // Bucket nodes by column, preserving input order within each column.
    const maxCol = nodes.reduce((m, n) => Math.max(m, n.column), 0);
    const columns: FlowNode[][] = Array.from({ length: maxCol + 1 }, () => []);
    for (const n of nodes) {
      const col = columns[n.column];
      if (col) col.push(n);
    }

    // Scale throughput → px so the tallest column fills the stage minus gaps.
    const flowOf = (id: string) =>
      Math.max(inSum.get(id) ?? 0, outSum.get(id) ?? 0);
    let maxColFlow = 0;
    for (const col of columns) {
      let sum = 0;
      for (const n of col) sum += flowOf(n.id);
      if (sum > maxColFlow) maxColFlow = sum;
    }
    const tallest = columns.reduce((m, c) => Math.max(m, c.length), 0);
    const usableH = height - PAD_Y * 2;
    // Reserve gap space for the busiest column so nothing overflows the stage.
    const gapBudget = Math.max(0, (tallest - 1) * NODE_GAP);
    const flowToPx = maxColFlow > 0 ? (usableH - gapBudget) / maxColFlow : 0;

    // x per column: evenly spaced band centres across the inner width.
    const innerW = VIEW_W - PAD_X * 2 - NODE_W;
    const colX = (column: number) =>
      maxCol === 0 ? PAD_X : PAD_X + (column / maxCol) * innerW;

    const laid: LaidNode[] = [];
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c];
      if (!col || col.length === 0) continue;
      // Total drawn height of this column, then centre it vertically.
      let colH = 0;
      const heights = col.map((n) => {
        const h = Math.max(MIN_NODE_H, flowOf(n.id) * flowToPx);
        colH += h;
        return h;
      });
      colH += (col.length - 1) * NODE_GAP;
      let y = PAD_Y + Math.max(0, (usableH - colH) / 2);
      const x = colX(c);
      for (let i = 0; i < col.length; i++) {
        const n = col[i];
        const h = heights[i];
        if (!n || h === undefined) continue;
        const node: LaidNode = {
          id: n.id,
          label: n.label,
          column: n.column,
          x,
          y,
          h,
          flow: flowOf(n.id),
          outCursor: y,
          inCursor: y,
        };
        laid.push(node);
        byId.set(n.id, node);
        y += h + NODE_GAP;
      }
    }

    // Link thickness scales with the same flow→px factor so widths at a node
    // sum to (at most) its height and stack without overlapping.
    let maxValue = 0;
    for (const l of valid) if (l.value > maxValue) maxValue = l.value;

    // Order links by source-then-target vertical position so the stacking
    // order at each endpoint matches the visual top→bottom order (fewer
    // crossings). Endpoints are consumed via the per-node running cursors.
    const ordered = [...valid].sort((a, b) => {
      const sa = byId.get(a.source);
      const sb = byId.get(b.source);
      const ta = byId.get(a.target);
      const tb = byId.get(b.target);
      const say = sa ? sa.y : 0;
      const sby = sb ? sb.y : 0;
      if (say !== sby) return say - sby;
      return (ta ? ta.y : 0) - (tb ? tb.y : 0);
    });

    const laidLinks: LaidLink[] = [];
    for (let i = 0; i < ordered.length; i++) {
      const l = ordered[i];
      if (!l) continue;
      const s = byId.get(l.source);
      const t = byId.get(l.target);
      if (!s || !t) continue;
      const w = Math.max(MIN_LINK_W, l.value * flowToPx);
      // Attach to the running cursor + half-thickness so the stroke centre is
      // where the band belongs; advance the cursor by the full thickness.
      const y1 = s.outCursor + w / 2;
      const y2 = t.inCursor + w / 2;
      s.outCursor += w;
      t.inCursor += w;
      const x1 = s.x + NODE_W;
      const x2 = t.x;
      laidLinks.push({
        key: `${l.source} ${l.target} ${i}`,
        source: l.source,
        target: l.target,
        value: l.value,
        d: linkPath(x1, y1, x2, y2),
        width: w,
        intensity: maxValue > 0 ? l.value / maxValue : 0,
      });
    }

    // Undirected adjacency (link index list per node) for the highlight BFS.
    const adj = new Map<string, number[]>();
    const link = (id: string, index: number) => {
      const list = adj.get(id);
      if (list) list.push(index);
      else adj.set(id, [index]);
    };
    for (let i = 0; i < laidLinks.length; i++) {
      const l = laidLinks[i];
      if (!l) continue;
      link(l.source, i);
      link(l.target, i);
    }

    // Precompute each node's reachable component (both directions) once, so
    // hover/focus is a Map lookup rather than a per-event graph walk.
    const reachable = new Map<
      string,
      { nodes: Set<string>; links: Set<string> }
    >();
    for (const start of laid) {
      const seenNodes = new Set<string>([start.id]);
      const seenLinks = new Set<string>();
      const queue = [start.id];
      while (queue.length > 0) {
        const cur = queue.shift();
        if (cur === undefined) continue;
        const edges = adj.get(cur);
        if (!edges) continue;
        for (const ei of edges) {
          const l = laidLinks[ei];
          if (!l) continue;
          seenLinks.add(l.key);
          const other = l.source === cur ? l.target : l.source;
          if (!seenNodes.has(other)) {
            seenNodes.add(other);
            queue.push(other);
          }
        }
      }
      reachable.set(start.id, { nodes: seenNodes, links: seenLinks });
    }

    return { nodes: laid, links: laidLinks, byId, reachable };
  }, [nodes, links, height]);

  const activeSet =
    active !== null ? layout.reachable.get(active) : undefined;

  // sr-only summary: every flow spelled out, so the diagram is meaningful with
  // no interaction. Built from the same validated links the SVG draws.
  const summary = React.useMemo(() => {
    if (layout.links.length === 0) return "Flow diagram: no flows";
    const label = (id: string) => layout.byId.get(id)?.label ?? id;
    const parts = layout.links.map(
      (l) => `${label(l.source)} to ${label(l.target)}: ${l.value}`,
    );
    return `Flow diagram, ${layout.links.length} flow${
      layout.links.length === 1 ? "" : "s"
    }. ${parts.join("; ")}.`;
  }, [layout]);

  const groupLabel = ariaLabel ?? "Flow diagram";

  if (layout.nodes.length === 0) {
    return (
      <div
        role="group"
        aria-label={groupLabel}
        className={cn(
          "bg-surface-1 border-hairline text-ink-3 grid place-items-center rounded-2 border text-xs",
          className,
        )}
        style={{ height }}
      >
        <span className="sr-only">{summary}</span>
        No flows
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={groupLabel}
      aria-describedby={`${uid}-summary`}
      className={cn("w-full", className)}
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        preserveAspectRatio="none"
        style={{ height }}
        className="block w-full overflow-visible"
        aria-hidden
      >
        {/* Links first so nodes and labels sit on top of the strokes. */}
        <g fill="none">
          {layout.links.map((l) => {
            const on = activeSet ? activeSet.links.has(l.key) : true;
            const dimmed = active !== null && !on;
            // Thin flows sit in cobalt-wash; thick flows deepen toward cobalt.
            const base =
              active !== null && on ? "var(--signal)" : "var(--accent)";
            const opacity = dimmed ? 0.06 : 0.14 + l.intensity * 0.28;
            return (
              <motion.path
                key={l.key}
                d={l.d}
                stroke={base}
                strokeWidth={l.width}
                strokeLinecap="butt"
                vectorEffect="non-scaling-stroke"
                strokeDasharray={motionSafe ? `${DASH} ${DASH}` : undefined}
                style={{ opacity }}
                // Marching dash: offset ticks one full cell so dashes crawl
                // source→target. Solid (no dash) under reduced motion.
                animate={motionSafe ? { strokeDashoffset: [0, -DASH * 2] } : undefined}
                transition={
                  motionSafe
                    ? {
                        duration: MARCH_S,
                        ease: easings.linear,
                        repeat: Infinity,
                      }
                    : undefined
                }
              />
            );
          })}
        </g>

        {/* Nodes: rounded rects, each focusable so keyboard traces its path. */}
        <g>
          {layout.nodes.map((n) => {
            const on = activeSet ? activeSet.nodes.has(n.id) : true;
            const dimmed = active !== null && !on;
            const highlit = active !== null && on;
            const fill = highlit ? "var(--signal)" : "var(--accent-bright)";
            return (
              <rect
                key={n.id}
                x={n.x}
                y={n.y}
                width={NODE_W}
                height={n.h}
                rx={2}
                fill={fill}
                style={{
                  opacity: dimmed ? 0.2 : 1,
                  transition: "opacity 150ms linear, fill 150ms linear",
                }}
              />
            );
          })}
        </g>
      </svg>

      {/* Interaction + labels live in the DOM, not the SVG, so text never
          stretches with preserveAspectRatio="none". Absolutely positioned in
          percentages of the same viewBox so they track the drawn nodes. */}
      <div className="pointer-events-none relative" style={{ height, marginTop: -height }}>
        {layout.nodes.map((n) => {
          const on = activeSet ? activeSet.nodes.has(n.id) : true;
          const dimmed = active !== null && !on;
          // Last-column nodes label to the left so text stays on-canvas.
          const isLast = n.x + NODE_W > VIEW_W * 0.72;
          return (
            <button
              key={n.id}
              type="button"
              // A node is a trace trigger, not a navigation — button role.
              aria-label={`${n.label}, total flow ${n.flow}`}
              onPointerEnter={() => setActive(n.id)}
              onPointerLeave={() => setActive((cur) => (cur === n.id ? null : cur))}
              onFocus={() => setActive(n.id)}
              onBlur={() => setActive((cur) => (cur === n.id ? null : cur))}
              className={cn(
                "text-label pointer-events-auto absolute flex items-center whitespace-nowrap rounded-1 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring",
                isLast ? "flex-row-reverse" : "flex-row",
                dimmed ? "text-ink-3 opacity-40" : "text-ink-2",
              )}
              style={{
                left: `${((isLast ? n.x - 6 : n.x + NODE_W + 6) / VIEW_W) * 100}%`,
                top: `${((n.y + n.h / 2) / height) * 100}%`,
                transform: `translate(${isLast ? "-100%" : "0"}, -50%)`,
                // A generous hit target regardless of the drawn node height.
                minHeight: 16,
              }}
            >
              <span>{n.label}</span>
            </button>
          );
        })}
      </div>

      <span id={`${uid}-summary`} className="sr-only">
        {summary}
      </span>
    </div>
  );
}
