"use client";

import * as React from "react";

import type { TactileAspect } from "@/content/tactile";

/**
 * Closes the gaps a mixed wall leaves. The gallery grid places cards in order
 * with dense auto-flow, but a set that mixes tall, wide and large cards can
 * still strand a cell (a tall card beside a wide one leaves the cell under
 * the wide one empty, and nothing later fits it). This plans the grid the way
 * the browser will, then grows a few cards (wider, or one row deeper) until
 * no cell sits empty inside the wall and the last row ends flush. The order
 * never changes: only spans do, and the demos already size to their card.
 */

/** Columns at each breakpoint: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4. */
const COLUMN_QUERIES: [query: string, cols: number][] = [
  ["(min-width: 96rem)", 4],
  ["(min-width: 64rem)", 3],
  ["(min-width: 40rem)", 2],
];

/** A card's span as its classes give it (SPAN in tactile-card.tsx and static-grid.tsx). */
export function baseSpan(aspect: TactileAspect, cols: number): Span {
  switch (aspect) {
    case "square":
      return [1, 1];
    case "wide":
      return [cols >= 2 ? 2 : 1, 1];
    case "tall":
      return [1, 2];
    case "large":
      return [cols >= 4 ? 2 : cols >= 3 ? 3 : cols >= 2 ? 2 : 1, 2];
  }
}

/** [columns, rows] a card spans. */
export type Span = readonly [number, number];

type Layout = {
  /** occ[row][col] = index of the card in that cell. */
  occ: (number | undefined)[][];
  /** [row, col, w, h] per card. */
  pos: [number, number, number, number][];
  holes: [number, number][];
};

/** Places cards exactly as CSS dense auto-flow does: each at the first cell that fits, from the top. */
function place(spans: readonly Span[], cols: number): Layout {
  const occ: (number | undefined)[][] = [];
  const pos: Layout["pos"] = [];
  const free = (r: number, c: number, w: number, h: number) => {
    for (let y = r; y < r + h; y++)
      for (let x = c; x < c + w; x++)
        if (occ[y]?.[x] !== undefined) return false;
    return true;
  };
  spans.forEach(([sw, h], i) => {
    const w = Math.min(sw, cols);
    for (let r = 0; ; r++) {
      let placed = false;
      for (let c = 0; c + w <= cols; c++) {
        if (!free(r, c, w, h)) continue;
        for (let y = r; y < r + h; y++) {
          const row = (occ[y] ??= []);
          for (let x = c; x < c + w; x++) row[x] = i;
        }
        pos.push([r, c, w, h]);
        placed = true;
        break;
      }
      if (placed) break;
    }
  });
  const holes: [number, number][] = [];
  for (let y = 0; y < occ.length; y++)
    for (let x = 0; x < cols; x++)
      if (occ[y]?.[x] === undefined) holes.push([y, x]);
  return { occ, pos, holes };
}

/**
 * Lower is better. A gap with a card somewhere below it sits inside the wall
 * and costs far more than one that only leaves the last row short.
 */
function score(spans: readonly Span[], cols: number) {
  const { occ, holes } = place(spans, cols);
  let inner = 0;
  for (const [r, c] of holes) {
    for (let y = r + 1; y < occ.length; y++) {
      if (occ[y]?.[c] !== undefined) {
        inner++;
        break;
      }
    }
  }
  return inner * 100 + holes.length;
}

const grow = (spans: readonly Span[], i: number, dw: number, dh: number) =>
  spans.map((s, j): Span => (j === i ? [s[0] + dw, s[1] + dh] : s));

/** Candidate fixes for the first gap that has any: grow a card beside it into it. */
function moves(spans: readonly Span[], cols: number): Span[][] {
  const { occ, pos, holes } = place(spans, cols);
  const out: Span[][] = [];
  for (const [r, c] of holes) {
    const left = c > 0 ? occ[r]?.[c - 1] : undefined;
    const leftPos = left === undefined ? undefined : pos[left];
    if (left !== undefined && leftPos) {
      const [lr, lc, lw, lh] = leftPos;
      let ok = lc + lw === c && lw < cols;
      for (let y = lr; y < lr + lh && ok; y++)
        if (occ[y]?.[c] !== undefined) ok = false;
      if (ok) out.push(grow(spans, left, 1, 0));
    }
    const above = r > 0 ? occ[r - 1]?.[c] : undefined;
    const abovePos = above === undefined ? undefined : pos[above];
    if (above !== undefined && abovePos) {
      const [ur, uc, uw, uh] = abovePos;
      let ok = uh < 2 && ur + uh === r;
      for (let x = uc; x < uc + uw && ok; x++)
        if (occ[r]?.[x] !== undefined) ok = false;
      if (ok) out.push(grow(spans, above, 0, 1));
    }
    // The card after it or below it can grow too; the reflow decides where it lands.
    const right = occ[r]?.[c + 1];
    const rightPos = right === undefined ? undefined : pos[right];
    if (right !== undefined && rightPos && rightPos[2] < cols)
      out.push(grow(spans, right, 1, 0));
    const below = occ[r + 1]?.[c];
    const belowPos = below === undefined ? undefined : pos[below];
    if (below !== undefined && belowPos && belowPos[3] < 2)
      out.push(grow(spans, below, 0, 1));
    if (out.length) break;
  }
  // Nothing beside the gap helps: widening an earlier card reflows the rows
  // between (a full-width wide card lets three tall ones line up under it).
  const now = score(spans, cols);
  if (out.every((m) => score(m, cols) >= now)) {
    spans.forEach(([w], i) => {
      if (w < cols) out.push(grow(spans, i, 1, 0));
    });
  }
  return out;
}

/**
 * The span each card should take so the wall has no gaps, or null where its
 * classes already give the right one. A small beam search over "grow this
 * card" moves, capped in time so a long wall never holds up a frame.
 */
export function fillGrid(
  aspects: readonly TactileAspect[],
  cols: number,
  budgetMs = 12,
): (Span | null)[] {
  const base = aspects.map((a) => baseSpan(a, cols));
  if (cols < 2 || base.length === 0) return base.map(() => null);
  const started = performance.now();
  const late = () => performance.now() - started > budgetMs;

  let best = { spans: base as readonly Span[], n: score(base, cols) };
  let frontier: (readonly Span[])[] = [base];
  const seen = new Set([base.join()]);
  for (
    let depth = 0;
    depth < 12 && frontier.length && best.n > 0 && !late();
    depth++
  ) {
    const next: { spans: Span[]; n: number }[] = [];
    for (const spans of frontier) {
      for (const m of moves(spans, cols)) {
        const key = m.join();
        if (seen.has(key)) continue;
        seen.add(key);
        next.push({ spans: m, n: score(m, cols) });
        if (late()) break;
      }
      if (late()) break;
    }
    next.sort((a, b) => a.n - b.n);
    if (next[0] && next[0].n < best.n) best = next[0];
    frontier = next.slice(0, 6).map((x) => x.spans);
  }
  return best.spans.map((s, i) => {
    const b = base[i];
    return b && s[0] === b[0] && s[1] === b[1] ? null : s;
  });
}

function subscribe(onChange: () => void) {
  const lists = COLUMN_QUERIES.map(([q]) => window.matchMedia(q));
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

function readColumns() {
  for (const [q, cols] of COLUMN_QUERIES)
    if (window.matchMedia(q).matches) return cols;
  return 1;
}

/** The gallery grid's column count, or 0 on the server (no fill there). */
export function useGridColumns() {
  return React.useSyncExternalStore(subscribe, readColumns, () => 0);
}
