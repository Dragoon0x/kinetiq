"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { semitones, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CrossGridColumn = { id: string; label: string };
export type CrossGridRow = { id: string; label: string; values: number[] };
export type CrossGridCell = { row: string; column: string };
export type CrossGridDensity = "compact" | "cosy";
export type CrossGridHighlight = "bar" | "glow";

export type CrossGridProps = {
  /** The table's accessible name. */
  label: string;
  columns: CrossGridColumn[];
  /** One value per column, in column order. */
  rows: CrossGridRow[];
  /** Text for the top-left header cell, over the row labels. @default "" */
  corner?: string;
  /** How a value is printed. @default Intl.NumberFormat("en-US") */
  format?: (value: number) => string;
  /** Row height and type size. @default "cosy" */
  density?: CrossGridDensity;
  /** Copies of the column header and row label travel to sit beside the pointed cell. @default true */
  followLabels?: boolean;
  /** Uniform bands, or bands that glow brightest where they cross. @default "bar" */
  highlight?: CrossGridHighlight;
  /** Spring stiffness for the crosshair and the travelling labels, at the house snap ratio. @default 640 */
  stiffness?: number;
  /** Controlled crosshair cell, by row and column id; null for none. */
  active?: CrossGridCell | null;
  /** Initial crosshair cell when uncontrolled. @default null */
  defaultActive?: CrossGridCell | null;
  /** Fires from the pointer, tap or key that moved or cleared the crosshair. */
  onActiveChange?: (cell: CrossGridCell | null) => void;
  /** A tick per cell, its pitch rising with the column. Off unless asked for. @default false */
  sound?: boolean;
  className?: string;
};

type Layout = {
  width: number;
  height: number;
  /** Header row height and row-label column width. */
  head: number;
  labelWidth: number;
  cols: { x: number; w: number }[];
  rows: { y: number; h: number }[];
};

type Index = { r: number; c: number };

const DENSITY = {
  compact: {
    cell: "h-7 text-[11px]",
    head: "h-7",
    label: "h-7 text-[11px]",
  },
  cosy: {
    cell: "h-9 text-xs",
    head: "h-9",
    label: "h-9 text-xs",
  },
} as const;

/** Padding of the label column, and of a chip: at home the chip's text lands on the label's. */
const PAD_X = 8;
const CHIP_PAD_X = 6;
const GAP = 3;
/** A chip's height: a 16px line, 2px padding and a hairline top and bottom. */
const CHIP_H = 22;
/** The pentatonic steps a sweep across the columns climbs. */
const STEPS = [0, 2, 4, 7, 9];
const TICK_GAP = 30;
/** The house snap spring's damping ratio. */
const RATIO = 0.83;

const numbers = new Intl.NumberFormat("en-US");
const defaultFormat = (value: number) => numbers.format(value);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A hover sound waits for the page's first press, so hovering never wakes audio. */
const activated = () =>
  typeof navigator === "undefined" || !("userActivation" in navigator)
    ? true
    : navigator.userActivation.hasBeenActive;

const sameCell = (a: CrossGridCell | null, b: CrossGridCell | null) =>
  a === b || (!!a && !!b && a.row === b.row && a.column === b.column);

/**
 * A data table with a crosshair. Point at a cell and its row and its column
 * light as two bands that meet there; move and the bands slide after you on a
 * spring rather than jumping, so the eye keeps its place. With `followLabels`
 * the column header and the row label detach and travel: a copy of the header
 * slides down the column to sit just above the cell, a copy of the row label
 * slides along the row to sit just left of it, so a far corner of the table
 * reads without tracing back to either edge. They start from their home the
 * first time the crosshair appears, and spring from cell to cell after that.
 *
 * It is a real `role="grid"` table with column and row headers. One cell is
 * the tab stop; the arrow keys, Home/End, Ctrl+Home/End and PageUp/PageDown
 * move focus, and focus drives the same crosshair, labels and tick as the
 * pointer. On touch a tap puts the crosshair on a cell and a tap elsewhere
 * clears it. Under reduced motion nothing slides: the crosshair and the labels
 * appear at the cell and cross-fade.
 */
export function CrossGrid({
  label,
  columns,
  rows,
  corner = "",
  format = defaultFormat,
  density = "cosy",
  followLabels = true,
  highlight = "bar",
  stiffness = 640,
  active,
  defaultActive = null,
  onActiveChange,
  sound = false,
  className,
}: CrossGridProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const sizes = DENSITY[density] ?? DENSITY.cosy;

  const [own, setOwn] = React.useState<CrossGridCell | null>(defaultActive);
  const current = active !== undefined ? active : own;
  // The last cell shown, so the travelling labels keep their words while
  // they fade out after the crosshair has gone.
  const [held, setHeld] = React.useState<CrossGridCell | null>(current);
  if (current && !sameCell(current, held)) setHeld(current);
  const shownCell = current ?? held;

  const rowIndex = current ? rows.findIndex((r) => r.id === current.row) : -1;
  const colIndex = current
    ? columns.findIndex((c) => c.id === current.column)
    : -1;
  const on = rowIndex >= 0 && colIndex >= 0;
  const shownRow = rows.find((r) => r.id === shownCell?.row);
  const shownCol = columns.find((c) => c.id === shownCell?.column);

  const [stop, setStop] = React.useState<Index>({ r: 0, c: 0 });
  const tabRow = Math.min(stop.r, Math.max(0, rows.length - 1));
  const tabCol = Math.min(stop.c, Math.max(0, columns.length - 1));

  const [frame, setFrame] = React.useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = React.useState<Layout | null>(null);
  const headRefs = React.useRef(new Map<string, HTMLTableCellElement>());
  const rowRefs = React.useRef(new Map<string, HTMLTableRowElement>());
  const cellRefs = React.useRef(new Map<string, HTMLTableCellElement>());
  const cornerRef = React.useRef<HTMLTableCellElement | null>(null);
  const rowChipRef = React.useRef<HTMLDivElement | null>(null);

  const bandY = useMotionValue(0);
  const bandX = useMotionValue(0);
  const chipDown = useMotionValue(0);
  const chipAcross = useMotionValue(0);
  const lit = useMotionValue(on ? 1 : 0);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const wasOn = React.useRef(false);
  const hovering = React.useRef(false);
  const lastTick = React.useRef(-Infinity);

  const measure = React.useCallback(() => {
    if (!frame) return;
    const f = frame.getBoundingClientRect();
    const sx = (frame.offsetWidth > 0 ? f.width / frame.offsetWidth : 1) || 1;
    const sy =
      (frame.offsetHeight > 0 ? f.height / frame.offsetHeight : 1) || 1;
    const left = f.left + frame.clientLeft * sx;
    const top = f.top + frame.clientTop * sy;
    const cols: Layout["cols"] = [];
    for (const c of columns) {
      const el = headRefs.current.get(c.id);
      const r = el?.getBoundingClientRect();
      cols.push(
        r
          ? { x: r2((r.left - left) / sx), w: r2(r.width / sx) }
          : { x: 0, w: 0 },
      );
    }
    const rs: Layout["rows"] = [];
    for (const row of rows) {
      const r = rowRefs.current.get(row.id)?.getBoundingClientRect();
      rs.push(
        r
          ? { y: r2((r.top - top) / sy), h: r2(r.height / sy) }
          : { y: 0, h: 0 },
      );
    }
    const c = cornerRef.current?.getBoundingClientRect();
    const next: Layout = {
      width: frame.clientWidth,
      height: frame.clientHeight,
      head: c ? r2(c.height / sy) : 0,
      labelWidth: c ? r2(c.width / sx) : 0,
      cols,
      rows: rs,
    };
    // Same numbers, same object: a host that passes fresh arrays every
    // render must not turn each measurement into another render.
    setLayout((prev) =>
      prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, [columns, frame, rows]);

  React.useEffect(() => {
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frame, measure]);

  // A density change resizes every row; the observer above sees the frame
  // change, but a same-height swap of content would not, so measure again.
  React.useEffect(() => {
    if (!frame) return;
    const id = window.requestAnimationFrame(() => measure());
    return () => window.cancelAnimationFrame(id);
  }, [density, frame, measure]);

  const spring = React.useMemo(() => {
    const k = Math.min(2000, Math.max(50, stiffness));
    return {
      type: "spring" as const,
      stiffness: k,
      damping: 2 * RATIO * Math.sqrt(k),
      mass: 1,
    };
  }, [stiffness]);

  // Moves the crosshair to the current cell: slides from the last one, or —
  // the first time it appears — lights in place while the labels travel out
  // from their home in the header and the label column.
  React.useEffect(() => {
    if (!layout) return;
    for (const c of running.current) c.stop();
    running.current = [];
    if (!on) {
      if (wasOn.current) {
        running.current.push(animate(lit, 0, exitFor(durations.fast)));
      }
      wasOn.current = false;
      return;
    }
    const col = layout.cols[colIndex];
    const row = layout.rows[rowIndex];
    if (!col || !row) return;
    const chipWidth = rowChipRef.current?.offsetWidth ?? 0;
    // Home: the header chip centred on its header, the row chip's words on
    // the row label's words. A chip that would only half-cover its own
    // label (the first row, the first column) goes home instead.
    const homeDown = r2(layout.head / 2 + CHIP_H / 2);
    const homeAcross = PAD_X - CHIP_PAD_X - 1;
    const below = row.y - GAP;
    const beside = col.x - chipWidth - GAP;
    const down = below - CHIP_H < layout.head ? homeDown : r2(below);
    const across = beside < layout.labelWidth ? homeAcross : r2(beside);
    const appearing = !wasOn.current;
    wasOn.current = true;
    if (appearing || !motionSafe) {
      bandY.set(row.y);
      bandX.set(col.x);
    }
    if (appearing) {
      chipDown.set(motionSafe ? homeDown : down);
      chipAcross.set(motionSafe ? homeAcross : across);
    }
    // Every move stops what was running, the fade included, so the fade is
    // resumed whenever it has not finished — a quick second move must not
    // strand the crosshair half-lit.
    if (lit.get() < 1) {
      running.current.push(
        animate(lit, 1, { duration: durations.fast, ease: easings.enter }),
      );
    }
    if (!motionSafe) {
      chipDown.set(down);
      chipAcross.set(across);
      return;
    }
    running.current.push(
      animate(bandY, row.y, spring),
      animate(bandX, col.x, spring),
      animate(chipDown, down, spring),
      animate(chipAcross, across, spring),
    );
  }, [
    bandX,
    bandY,
    chipAcross,
    chipDown,
    colIndex,
    layout,
    lit,
    motionSafe,
    on,
    rowIndex,
    spring,
  ]);

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
    },
    [],
  );

  const tick = (c: number, fromHover: boolean) => {
    const now = performance.now();
    if (now - lastTick.current < TICK_GAP) return;
    if (fromHover && !activated()) return;
    lastTick.current = now;
    const step =
      (STEPS[c % STEPS.length] ?? 0) + 12 * Math.floor(c / STEPS.length);
    const n = Math.max(1, columns.length);
    audio.play("tick", {
      pitch: r3(semitones(step) * 0.8),
      gain: 0.3,
      pan: r3(((c + 0.5) / n) * 1.2 - 0.6),
    });
  };

  const commit = (next: CrossGridCell | null, fromHover: boolean) => {
    if (sameCell(next, current)) return;
    if (next) {
      const c = columns.findIndex((col) => col.id === next.column);
      if (c >= 0) tick(c, fromHover);
    }
    if (active === undefined) setOwn(next);
    onActiveChange?.(next);
  };

  const cellAt = (target: EventTarget | null): Index | null => {
    const el =
      target instanceof Element
        ? target.closest<HTMLElement>("[data-cross-cell]")
        : null;
    if (!el) return null;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    return Number.isInteger(r) && Number.isInteger(c) ? { r, c } : null;
  };

  const cellOf = ({ r, c }: Index): CrossGridCell | null => {
    const row = rows[r];
    const col = columns[c];
    return row && col ? { row: row.id, column: col.id } : null;
  };

  const focusCell = (r: number, c: number) => {
    const rr = Math.min(rows.length - 1, Math.max(0, r));
    const cc = Math.min(columns.length - 1, Math.max(0, c));
    const row = rows[rr];
    const col = columns[cc];
    if (!row || !col) return;
    cellRefs.current.get(`${row.id}\u0000${col.id}`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, r: number, c: number) => {
    const last = { r: rows.length - 1, c: columns.length - 1 };
    const moves: Record<string, Index | undefined> = {
      ArrowUp: { r: r - 1, c },
      ArrowDown: { r: r + 1, c },
      ArrowLeft: { r, c: c - 1 },
      ArrowRight: { r, c: c + 1 },
      Home: event.ctrlKey || event.metaKey ? { r: 0, c: 0 } : { r, c: 0 },
      End: event.ctrlKey || event.metaKey ? last : { r, c: last.c },
      PageUp: { r: 0, c },
      PageDown: { r: last.r, c },
    };
    const to = moves[event.key];
    if (!to) return;
    event.preventDefault();
    focusCell(to.r, to.c);
  };

  // Document listeners fire after renders they did not see.
  const latest = React.useRef(commit);
  React.useEffect(() => {
    latest.current = commit;
  });

  // A tap leaves the crosshair where it landed; a press anywhere else clears
  // it. The pointer leaving clears it too, unless focus is holding it.
  React.useEffect(() => {
    if (!on || !frame) return;
    const onDown = (event: PointerEvent) => {
      if (event.target instanceof Node && frame.contains(event.target)) return;
      if (frame.contains(document.activeElement)) return;
      latest.current(null, false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [frame, on]);

  const rowBandY = useTransform(bandY, (y) => r2(y));
  const colBandX = useTransform(bandX, (x) => r2(x));
  const glowRow = useTransform(bandX, (x) => {
    if (highlight !== "glow" || !layout) return "none";
    const w = layout.cols[colIndex]?.w ?? 0;
    const at = r2(((x + w / 2) / Math.max(1, layout.width)) * 100);
    return `linear-gradient(90deg, transparent ${r2(at - 38)}%, color-mix(in oklch, var(--accent) 24%, transparent) ${at}%, transparent ${r2(at + 38)}%)`;
  });
  const glowCol = useTransform(bandY, (y) => {
    if (highlight !== "glow" || !layout) return "none";
    const h = layout.rows[rowIndex]?.h ?? 0;
    const at = r2(((y + h / 2) / Math.max(1, layout.height)) * 100);
    return `linear-gradient(180deg, transparent ${r2(at - 45)}%, color-mix(in oklch, var(--accent) 24%, transparent) ${at}%, transparent ${r2(at + 45)}%)`;
  });
  const colChipX = useTransform(bandX, (x) =>
    r2(x + (layout?.cols[Math.max(0, colIndex)]?.w ?? 0) / 2),
  );
  const rowChipY = useTransform(bandY, (y) =>
    r2(y + (layout?.rows[Math.max(0, rowIndex)]?.h ?? 0) / 2),
  );
  const chipY = useTransform(chipDown, (v) => r2(v));
  const chipX = useTransform(chipAcross, (v) => r2(v));
  const chipsOpacity = useTransform(lit, (v) =>
    followLabels ? r3(clamp01(v)) : 0,
  );
  const bandOpacity = useTransform(lit, (v) => r3(clamp01(v)));

  const rowH = (layout?.rows[Math.max(0, rowIndex)]?.h ?? 0) || 0;
  const colW = (layout?.cols[Math.max(0, colIndex)]?.w ?? 0) || 0;

  return (
    <div
      ref={setFrame}
      className={cn(
        "relative w-full overflow-clip rounded-3 border border-hairline bg-card [contain:paint]",
        className,
      )}
      onPointerMove={(event) => {
        if (event.pointerType === "touch") return;
        hovering.current = true;
        const at = cellAt(event.target);
        if (at) commit(cellOf(at), true);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") return;
        const at = cellAt(event.target);
        if (at) commit(cellOf(at), false);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        hovering.current = false;
        if (frame && frame.contains(document.activeElement)) {
          // Focus is in the grid: the crosshair goes back to the focused cell.
          const at = cellAt(document.activeElement);
          commit(at ? cellOf(at) : null, false);
          return;
        }
        commit(null, false);
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && frame?.contains(next)) return;
        if (!hovering.current) commit(null, false);
      }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div
          className={cn(
            "absolute inset-x-0 top-0",
            highlight === "bar" && "bg-cobalt-wash",
          )}
          style={{
            height: rowH,
            y: rowBandY,
            opacity: bandOpacity,
            backgroundImage: glowRow,
          }}
        />
        <motion.div
          className={cn(
            "absolute inset-y-0 left-0",
            highlight === "bar" && "bg-cobalt-wash",
          )}
          style={{
            width: colW,
            x: colBandX,
            opacity: bandOpacity,
            backgroundImage: glowCol,
          }}
        />
      </div>

      <table
        role="grid"
        aria-label={label}
        className="relative w-full table-fixed border-collapse"
      >
        <colgroup>
          <col className="w-[28%]" />
          {columns.map((c) => (
            <col key={c.id} />
          ))}
        </colgroup>
        <thead>
          <tr role="row">
            <th
              ref={cornerRef}
              scope="col"
              role="columnheader"
              className={cn(
                sizes.head,
                "px-2 text-left align-middle font-mono text-[10px] font-normal tracking-[0.08em] text-ink-3 uppercase",
              )}
            >
              {corner}
            </th>
            {columns.map((c, ci) => (
              <th
                key={c.id}
                ref={(node) => {
                  if (node) headRefs.current.set(c.id, node);
                  else headRefs.current.delete(c.id);
                }}
                scope="col"
                role="columnheader"
                className={cn(
                  sizes.head,
                  "px-1 text-center align-middle font-mono text-[10px] font-normal tracking-[0.08em] uppercase transition-colors duration-150",
                  on && ci === colIndex ? "text-cobalt-bright" : "text-ink-3",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={row.id}
              ref={(node) => {
                if (node) rowRefs.current.set(row.id, node);
                else rowRefs.current.delete(row.id);
              }}
              role="row"
              className="border-t border-hairline"
            >
              <th
                scope="row"
                role="rowheader"
                className={cn(
                  sizes.label,
                  "px-2 text-left align-middle font-normal transition-colors duration-150",
                  on && ri === rowIndex ? "text-foreground" : "text-ink-2",
                )}
              >
                {row.label}
              </th>
              {columns.map((col, ci) => {
                const value = row.values[ci];
                const here = on && ri === rowIndex && ci === colIndex;
                return (
                  <td
                    key={col.id}
                    ref={(node) => {
                      const key = `${row.id}\u0000${col.id}`;
                      if (node) cellRefs.current.set(key, node);
                      else cellRefs.current.delete(key);
                    }}
                    role="gridcell"
                    data-cross-cell=""
                    data-r={ri}
                    data-c={ci}
                    tabIndex={ri === tabRow && ci === tabCol ? 0 : -1}
                    onFocus={() => {
                      setStop({ r: ri, c: ci });
                      commit({ row: row.id, column: col.id }, false);
                    }}
                    onKeyDown={(event) => onKeyDown(event, ri, ci)}
                    className={cn(
                      sizes.cell,
                      "px-1 text-center align-middle font-mono tabular-nums transition-colors duration-150 outline-none",
                      "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                      here ? "font-medium text-foreground" : "text-ink-2",
                    )}
                  >
                    {value === undefined ? "–" : format(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-10"
        style={{ x: colChipX, y: chipY, opacity: chipsOpacity }}
      >
        <div className="-translate-x-1/2 -translate-y-full rounded-1 border border-hairline-strong bg-popover px-1.5 py-0.5 font-mono text-[10px] leading-4 tracking-[0.08em] whitespace-nowrap text-cobalt-bright uppercase">
          {shownCol?.label ?? ""}
        </div>
      </motion.div>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-10"
        style={{ x: chipX, y: rowChipY, opacity: chipsOpacity }}
      >
        <div
          ref={rowChipRef}
          className={cn(
            "-translate-y-1/2 rounded-1 border border-hairline-strong bg-popover px-1.5 py-0.5 leading-4 whitespace-nowrap text-cobalt-bright",
            density === "compact" ? "text-[11px]" : "text-xs",
          )}
        >
          {shownRow?.label ?? ""}
        </div>
      </motion.div>
    </div>
  );
}
