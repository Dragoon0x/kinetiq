"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type ValueAnimationTransition,
} from "motion/react";
import {
  Activity,
  Gauge,
  GripHorizontal,
  Globe,
  Rocket,
  Timer,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SnapBoardItem = {
  /** The widget it places. */
  id: string;
  /** Column and row of the top-left cell, from 0. */
  x: number;
  y: number;
  /** Width in columns and height in rows. */
  w: number;
  h: number;
};

export type SnapBoardWidget = {
  /** Unique: matches a layout item's id. */
  id: string;
  /** The header's text, and the widget's accessible name. */
  title: string;
  /** 16px, drawn in currentColor, before the title. */
  icon?: React.ReactNode;
  /** The body. It sits in a container-query box, so it can lay itself out for the size it is given. */
  content?: React.ReactNode;
  /** Size limits in cells. @default 1 column, 2 rows, no maximum */
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
};

export type SnapBoardPush = "compact" | "free" | "swap";
export type SnapBoardGhost = "outline" | "tint" | "none";
export type SnapBoardMode = "move" | "resize";

export type SnapBoardDrag = {
  id: string;
  mode: SnapBoardMode;
  /** Where the widget would land now. */
  item: SnapBoardItem;
};

export type SnapBoardProps = {
  /** The widgets on the board. @default defaultBoardWidgets */
  widgets?: SnapBoardWidget[];
  /** Controlled layout: one item per widget. */
  layout?: SnapBoardItem[];
  /** The layout when uncontrolled. @default defaultBoardLayout(columns) */
  defaultLayout?: SnapBoardItem[];
  /** Fires from the drop, resize or key that changed the layout, with all of it. */
  onLayoutChange?: (layout: SnapBoardItem[]) => void;
  /** A drop that changed the layout: the widget dropped and the ids of the others that made way. */
  onMove?: (id: string, moved: string[]) => void;
  /** A widget picked up (by pointer or key), its landing cell as it changes, and null when it is put down. */
  onDragChange?: (drag: SnapBoardDrag | null) => void;
  /** The grid's columns; anything wider is clamped to fit. @default 12 */
  columns?: number;
  /** How the others make way: pushed and floated up ("compact"), pushed and left where they land ("free"), or the widget under the drop trades places ("swap"). @default "compact" */
  push?: SnapBoardPush;
  /** The landing preview: a dashed outline, an accent tint, or none. @default "outline" */
  ghost?: SnapBoardGhost;
  /** One row's height, px. @default 44 */
  rowHeight?: number;
  /** The space between cells, px. @default 8 */
  gap?: number;
  /** The tallest the board gets before it scrolls inside itself, px or any CSS length. @default none */
  maxHeight?: number | string;
  /** Off: no grips, no corners — a plain dashboard. @default true */
  editable?: boolean;
  /** The board's accessible name. @default "Dashboard layout" */
  label?: string;
  /** Each grip's accessible name. @default (title) => `Move ${title}` */
  moveLabel?: (title: string) => string;
  /** Each corner's accessible name. @default (title) => `Resize ${title}` */
  resizeLabel?: (title: string) => string;
  /** The ghost, the picked-up ring and the column guides; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Play a detent at every cell and a thock on every drop. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------- defaults -------------------------------- */

/** A small LCG: the same sparkline on the server and in the browser. */
function series(
  seed: number,
  count: number,
  base: number,
  swing: number,
): number[] {
  let s = seed >>> 0;
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < count; i += 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    v += ((s / 0xffffffff) * 2 - 1) * swing;
    v = Math.max(base - swing * 3, Math.min(base + swing * 3, v));
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

function Spark({ data, className }: { data: number[]; className?: string }) {
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const d = data
    .map((v, i) => {
      const x = Math.round((i / Math.max(1, data.length - 1)) * 1000) / 10;
      const y =
        Math.round((1 - (v - lo) / Math.max(1e-6, hi - lo)) * 280) / 10 + 1;
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={cn("h-8 w-full overflow-visible", className)}
    >
      <path
        d={d}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="stroke-[var(--snap-board-accent)]"
      />
    </svg>
  );
}

function Stat({
  value,
  unit,
  note,
  tone,
  children,
}: {
  value: string;
  unit?: string;
  note: string;
  tone?: "up" | "down";
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="font-mono text-lg leading-none text-foreground tabular-nums">
          {value}
        </span>
        {unit ? <span className="text-[11px] text-ink-3">{unit}</span> : null}
      </div>
      <p
        className={cn(
          "hidden truncate text-[11px] @min-[150px]:block",
          tone === "up"
            ? "text-success"
            : tone === "down"
              ? "text-warn"
              : "text-ink-3",
        )}
      >
        {note}
      </p>
      {children ? (
        <div className="hidden @min-[170px]:block">{children}</div>
      ) : null}
    </div>
  );
}

const ERR_BARS = series(7, 16, 0.4, 0.12);
const UPTIME = Array.from({ length: 30 }, (_, i) =>
  i === 11 ? 1 : i === 23 ? 2 : 0,
);

const ICON = "size-4";

export const defaultBoardWidgets: SnapBoardWidget[] = [
  {
    id: "requests",
    title: "Requests",
    icon: <Activity className={ICON} />,
    content: (
      <Stat value="48.2k" unit="/min" note="Up 6% on last week" tone="up">
        <Spark data={series(3, 24, 48, 3)} />
      </Stat>
    ),
  },
  {
    id: "errors",
    title: "Error rate",
    icon: <TriangleAlert className={ICON} />,
    content: (
      <Stat value="0.42" unit="%" note="Budget 1% · 58% left">
        <div className="flex h-8 items-end gap-px" aria-hidden>
          {ERR_BARS.map((v, i) => (
            <span
              key={i}
              className="flex-1 rounded-t-1 bg-[color-mix(in_oklab,var(--snap-board-accent)_55%,transparent)]"
              style={{
                height: `${Math.round(Math.max(0.1, Math.min(1, v / 0.8)) * 100)}%`,
              }}
            />
          ))}
        </div>
      </Stat>
    ),
  },
  {
    id: "latency",
    title: "p95 latency",
    icon: <Timer className={ICON} />,
    content: (
      <Stat value="184" unit="ms" note="Slower since 14:05" tone="down">
        <Spark data={series(11, 24, 180, 9)} />
      </Stat>
    ),
  },
  {
    id: "deploys",
    title: "Deploys",
    icon: <Rocket className={ICON} />,
    content: (
      <ul role="list" className="flex flex-col gap-1.5 text-[12px]">
        {[
          ["api 4.12.0", "12 min ago", "bg-success"],
          ["ingest 2.3.1", "1 h ago", "bg-success"],
          ["web 9.0.4", "rolled back", "bg-warn"],
          ["jobs 1.8.0", "yesterday", "bg-success"],
        ].map(([name, when, dot]) => (
          <li key={name} className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("size-1.5 shrink-0 rounded-full", dot)}
            />
            <span className="min-w-0 flex-1 truncate font-mono text-foreground">
              {name}
            </span>
            <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[180px]:inline">
              {when}
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "regions",
    title: "Regions",
    icon: <Globe className={ICON} />,
    content: (
      <ul role="list" className="flex flex-col gap-1.5 text-[12px]">
        {[
          ["North", 41],
          ["Coast", 27],
          ["Basin", 19],
          ["Hills", 13],
        ].map(([name, share]) => (
          <li key={name} className="flex items-center gap-2">
            <span className="w-11 shrink-0 truncate text-ink-2">{name}</span>
            <span className="relative h-1.5 min-w-0 flex-1 overflow-clip rounded-full bg-surface-2">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--snap-board-accent)]"
                style={{ width: `${share}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-[11px] text-ink-3 tabular-nums">
              {share}%
            </span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: "uptime",
    title: "Uptime, 30 days",
    icon: <Gauge className={ICON} />,
    content: (
      <div className="flex h-full flex-col justify-between gap-1.5">
        <div className="flex h-5 items-stretch gap-0.5" aria-hidden>
          {UPTIME.map((s, i) => (
            <span
              key={i}
              className={cn(
                "flex-1 rounded-[1px]",
                s === 0
                  ? "bg-[color-mix(in_oklab,var(--success)_70%,transparent)]"
                  : s === 1
                    ? "bg-warn"
                    : "bg-danger",
              )}
            />
          ))}
        </div>
        <p className="truncate text-[11px] text-ink-3">
          <span className="font-mono text-foreground tabular-nums">99.96%</span>{" "}
          · 2 incidents, 41 min down
        </p>
      </div>
    ),
  },
];

const BASE_LAYOUT: SnapBoardItem[] = [
  { id: "requests", x: 0, y: 0, w: 4, h: 2 },
  { id: "errors", x: 4, y: 0, w: 4, h: 2 },
  { id: "latency", x: 8, y: 0, w: 4, h: 2 },
  { id: "deploys", x: 0, y: 2, w: 5, h: 3 },
  { id: "regions", x: 5, y: 2, w: 7, h: 3 },
  { id: "uptime", x: 0, y: 5, w: 12, h: 2 },
];

/**
 * The default layout for any number of columns: the 12-column layout scaled
 * by its edges, so neighbours still meet exactly.
 */
export function defaultBoardLayout(columns = 12): SnapBoardItem[] {
  const c = Math.max(1, Math.round(columns));
  return BASE_LAYOUT.map((it) => {
    const x = Math.round((it.x * c) / 12);
    const right = Math.round(((it.x + it.w) * c) / 12);
    return { ...it, x, w: Math.max(1, right - x) };
  });
}

/* --------------------------------- grid ---------------------------------- */

type Rect = { x: number; y: number; w: number; h: number };

const collide = (a: SnapBoardItem, b: SnapBoardItem) =>
  a.id !== b.id &&
  a.x < b.x + b.w &&
  b.x < a.x + a.w &&
  a.y < b.y + b.h &&
  b.y < a.y + a.h;

const overlap = (a: SnapBoardItem, b: SnapBoardItem) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

const byPlace = (a: SnapBoardItem, b: SnapBoardItem) => a.y - b.y || a.x - b.x;

/**
 * Settles a layout around one fixed item: everything else, top to bottom,
 * moves down until it collides with nothing already placed. When the fixed
 * item is travelling down onto another, that one first tries to hop above
 * it, so a widget dragged down past a neighbour by the neighbour's height
 * trades places with it rather than shoving it to the bottom.
 */
function settle(
  list: SnapBoardItem[],
  fixedId: string | null,
  down: boolean,
): SnapBoardItem[] {
  const sorted = [...list].sort(byPlace);
  const fixed = sorted.find((it) => it.id === fixedId);
  const done: SnapBoardItem[] = fixed ? [fixed] : [];
  for (const it of sorted) {
    if (fixed && it.id === fixed.id) continue;
    let cur = { ...it };
    if (down && fixed && collide(cur, fixed)) {
      const up = { ...cur, y: fixed.y - cur.h };
      if (up.y >= 0 && !done.some((d) => collide(up, d))) cur = up;
    }
    for (let guard = 0; guard < 400; guard += 1) {
      const hit = done.find((d) => collide(cur, d));
      if (!hit) break;
      cur = { ...cur, y: hit.y + hit.h };
    }
    done.push(cur);
  }
  return done;
}

/** Everything floats up as far as it can, top to bottom. */
function compact(list: SnapBoardItem[]): SnapBoardItem[] {
  const done: SnapBoardItem[] = [];
  for (const it of [...list].sort(byPlace)) {
    const cur = { ...it };
    while (
      cur.y > 0 &&
      !done.some((d) => collide({ ...cur, y: cur.y - 1 }, d))
    ) {
      cur.y -= 1;
    }
    done.push(cur);
  }
  return done;
}

type Limits = { minW: number; minH: number; maxW: number; maxH: number };

const limitsOf = (w: SnapBoardWidget | undefined, columns: number): Limits => {
  const minW = Math.max(1, Math.min(columns, Math.round(w?.minW ?? 1)));
  const minH = Math.max(1, Math.round(w?.minH ?? 2));
  return {
    minW,
    minH,
    maxW: Math.max(minW, Math.min(columns, Math.round(w?.maxW ?? columns))),
    maxH: Math.max(minH, Math.round(w?.maxH ?? 99)),
  };
};

/** One item per widget, inside the columns, overlapping nothing. */
function normalize(
  layout: SnapBoardItem[],
  widgets: SnapBoardWidget[],
  columns: number,
  push: SnapBoardPush,
): SnapBoardItem[] {
  const byId = new Map(layout.map((it) => [it.id, it]));
  let bottom = layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  const list = widgets.map((wd) => {
    const lim = limitsOf(wd, columns);
    const it = byId.get(wd.id);
    const w = Math.min(
      lim.maxW,
      Math.max(lim.minW, Math.round(it?.w ?? Math.min(columns, 4))),
    );
    const h = Math.min(lim.maxH, Math.max(lim.minH, Math.round(it?.h ?? 2)));
    const x = Math.min(columns - w, Math.max(0, Math.round(it?.x ?? 0)));
    let y = Math.max(0, Math.round(it?.y ?? bottom));
    if (!it) {
      y = bottom;
      bottom += h;
    }
    return { id: wd.id, x, y, w, h };
  });
  const settled = settle(list, null, false);
  return push === "compact" ? compact(settled) : settled;
}

/** The layout with `target` in place of its widget, the others making way. */
function resolveLayout(
  origin: SnapBoardItem[],
  target: SnapBoardItem,
  push: SnapBoardPush,
  columns: number,
): SnapBoardItem[] {
  const from = origin.find((it) => it.id === target.id);
  let list = origin.map((it) =>
    it.id === target.id ? { ...target } : { ...it },
  );
  if (push === "swap" && from) {
    let best: SnapBoardItem | null = null;
    let area = 0;
    for (const it of list) {
      if (it.id === target.id) continue;
      const a = overlap(it, target);
      if (a > area) {
        area = a;
        best = it;
      }
    }
    if (best) {
      const other = best;
      const moved = {
        ...other,
        x: Math.min(columns - other.w, Math.max(0, from.x)),
        y: from.y,
      };
      const clear = list.every(
        (it) =>
          it.id === other.id || it.id === target.id || !collide(moved, it),
      );
      if (clear && !collide(moved, target)) {
        list = list.map((it) => (it.id === other.id ? moved : it));
      }
    }
  }
  const down = !!from && target.y > from.y;
  const settled = settle(list, target.id, down && push !== "swap");
  return push === "compact" ? compact(settled) : settled;
}

const sameLayout = (a: SnapBoardItem[], b: SnapBoardItem[]) =>
  a.length === b.length &&
  a.every((it) => {
    const o = b.find((x) => x.id === it.id);
    return !!o && o.x === it.x && o.y === it.y && o.w === it.w && o.h === it.h;
  });

const rowsOf = (list: SnapBoardItem[]) =>
  list.reduce((m, it) => Math.max(m, it.y + it.h), 0);

/* --------------------------------- tile ---------------------------------- */

const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r2 = (v: number) => Math.round(v * 100) / 100;

type Geometry = {
  columns: number;
  gap: number;
  rowHeight: number;
  /** One column's width, px; null until the board is measured. */
  col: number | null;
};

const rectOf = (it: SnapBoardItem, g: Geometry): Rect | null =>
  g.col === null
    ? null
    : {
        x: r2(it.x * (g.col + g.gap)),
        y: it.y * (g.rowHeight + g.gap),
        w: r2(it.w * g.col + (it.w - 1) * g.gap),
        h: it.h * g.rowHeight + (it.h - 1) * g.gap,
      };

/** Before the board is measured (and on the server): the same geometry in CSS. */
const cssOf = (it: SnapBoardItem, g: Geometry): React.CSSProperties => {
  const col = `((100% - ${(g.columns - 1) * g.gap}px) / ${g.columns})`;
  return {
    left: `calc(${col} * ${it.x} + ${it.x * g.gap}px)`,
    top: it.y * (g.rowHeight + g.gap),
    width: `calc(${col} * ${it.w} + ${(it.w - 1) * g.gap}px)`,
    height: it.h * g.rowHeight + (it.h - 1) * g.gap,
  };
};

type PointerGrab = {
  mode: SnapBoardMode;
  start: Rect;
  /** Where the board was when the finger took hold, so the widget stays
   * under the finger even if the board itself moves (it grows, the page
   * scrolls, a centred stage re-centres). */
  left: number;
  top: number;
};

type TileProps = {
  widget: SnapBoardWidget;
  item: SnapBoardItem;
  geometry: Geometry;
  boardW: number;
  /** The board's height, px: how far below its rows a widget may be pulled. */
  boardH: number;
  grabbed: SnapBoardMode | null;
  via: "pointer" | "key" | null;
  editable: boolean;
  disabled: boolean;
  motionSafe: boolean;
  limits: Limits;
  moveLabel: string;
  resizeLabel: string;
  hintId: string;
  onGrab: (id: string, mode: SnapBoardMode, via: "pointer" | "key") => boolean;
  onDragTo: (id: string, px: Rect, mode: SnapBoardMode) => void;
  onRelease: (id: string, travelled: number) => void;
  onCancel: (id: string) => void;
  onKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
    mode: SnapBoardMode,
  ) => void;
  onLanded: (id: string, gain: number) => void;
  onBlur: (id: string) => void;
  bindGrip: (node: HTMLButtonElement | null) => void;
};

/**
 * One widget. Its box is four motion values: while a finger holds it they
 * follow the finger 1:1; otherwise they glide (or, picked up by key, snap) to
 * the cell the board gives it, and a release flies there with the throw's own
 * velocity.
 */
function Tile({
  widget,
  item,
  geometry,
  boardW,
  boardH,
  grabbed,
  via,
  editable,
  disabled,
  motionSafe,
  limits,
  moveLabel,
  resizeLabel,
  hintId,
  onGrab,
  onDragTo,
  onRelease,
  onCancel,
  onKeyDown,
  onLanded,
  onBlur,
  bindGrip,
}: TileProps) {
  const rect = rectOf(item, geometry);
  const x = useMotionValue(rect?.x ?? 0);
  const y = useMotionValue(rect?.y ?? 0);
  const w = useMotionValue(rect?.w ?? 0);
  const h = useMotionValue(rect?.h ?? 0);
  const lift = useMotionValue(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const pointer = React.useRef<PointerGrab | null>(null);
  const placed = React.useRef(false);
  const width = React.useRef(boardW);
  const latest = React.useRef(rect);
  React.useEffect(() => {
    latest.current = rect;
  });

  const aimed = React.useRef(new Map<string, number>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  /** Starts a move unless one is already on its way to the same place. */
  const runTo = (
    key: string,
    mv: MotionValue<number>,
    target: number,
    options: ValueAnimationTransition<number>,
  ) => {
    if (aimed.current.get(key) === target && anims.current.has(key)) return;
    aimed.current.set(key, target);
    run(
      key,
      animate(mv, target, {
        ...options,
        onComplete: () => {
          if (aimed.current.get(key) === target) {
            aimed.current.delete(key);
            anims.current.delete(key);
          }
        },
      }),
    );
  };

  // The box goes where the board says, unless a finger is holding it. A
  // first placement or a resized board jumps; everything else moves.
  const rx = rect?.x;
  const ry = rect?.y;
  const rw = rect?.w;
  const rh = rect?.h;
  React.useEffect(() => {
    if (
      rx === undefined ||
      ry === undefined ||
      rw === undefined ||
      rh === undefined
    )
      return;
    if (pointer.current) {
      // Held by a finger; once the board has let go of it (Escape mid-drag)
      // the finger no longer holds it either.
      if (grabbed) return;
      pointer.current = null;
    }
    const resized = width.current !== boardW;
    width.current = boardW;
    if (!placed.current || resized || !motionSafe) {
      placed.current = true;
      for (const k of ["x", "y", "w", "h"]) {
        anims.current.get(k)?.stop();
        anims.current.delete(k);
        aimed.current.delete(k);
      }
      x.jump(rx);
      y.jump(ry);
      w.jump(rw);
      h.jump(rh);
      return;
    }
    const spring = grabbed && via === "key" ? springs.snap : springs.glide;
    const to: [string, MotionValue<number>, number][] = [
      ["x", x, rx],
      ["y", y, ry],
      ["w", w, rw],
      ["h", h, rh],
    ];
    for (const [k, mv, target] of to) {
      if (Math.abs(mv.get() - target) > 0.01) runTo(k, mv, target, spring);
    }
    // runTo reads only refs; the box follows the rect and the hold.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rx, ry, rw, rh, boardW, motionSafe, grabbed, via, x, y, w, h]);

  React.useEffect(() => {
    const target = grabbed ? 1 : 0;
    if (!motionSafe) {
      lift.jump(target);
      return;
    }
    run("lift", animate(lift, target, grabbed ? springs.flick : springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbed, motionSafe]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /** A release: fly to the cell with the throw's velocity, thock on arrival. */
  const land = (velocity: { x: number; y: number }) => {
    const r = latest.current;
    pointer.current = null;
    if (!r) return;
    const travelled = Math.hypot(
      x.get() - r.x,
      y.get() - r.y,
      w.get() - r.w,
      h.get() - r.h,
    );
    onRelease(widget.id, travelled);
    if (!motionSafe) {
      x.jump(r.x);
      y.jump(r.y);
      w.jump(r.w);
      h.jump(r.h);
      onLanded(widget.id, 0.5);
      return;
    }
    let heard = false;
    const gain = r2(Math.min(0.7, 0.3 + travelled / 600));
    const listen = () => {
      if (heard) return;
      if (
        Math.hypot(x.get() - r.x, y.get() - r.y) < 3 &&
        Math.hypot(w.get() - r.w, h.get() - r.h) < 3
      ) {
        heard = true;
        onLanded(widget.id, gain);
      }
    };
    for (const k of ["x", "y", "w", "h"]) aimed.current.delete(k);
    runTo("x", x, r.x, {
      ...springs.glide,
      velocity: velocity.x,
      onUpdate: listen,
    });
    runTo("y", y, r.y, {
      ...springs.glide,
      velocity: velocity.y,
      onUpdate: listen,
    });
    runTo("w", w, r.w, { ...springs.glide, onUpdate: listen });
    runTo("h", h, r.h, { ...springs.glide, onUpdate: listen });
    listen();
  };

  const sectionRef = React.useRef<HTMLElement | null>(null);
  const boardOf = () =>
    sectionRef.current?.parentElement?.getBoundingClientRect();
  /** The finger's travel in the board's own frame. */
  const travel = (p: PointerGrab, offset: { x: number; y: number }) => {
    const at = boardOf();
    return {
      x: offset.x - ((at?.left ?? p.left) - p.left),
      y: offset.y - ((at?.top ?? p.top) - p.top),
    };
  };

  const startGrab = (mode: SnapBoardMode) => {
    const r = latest.current;
    if (!r || !onGrab(widget.id, mode, "pointer")) return;
    for (const c of anims.current.values()) c.stop();
    anims.current.clear();
    aimed.current.clear();
    const at = boardOf();
    pointer.current = {
      mode,
      start: { x: x.get(), y: y.get(), w: w.get(), h: h.get() },
      left: at?.left ?? 0,
      top: at?.top ?? 0,
    };
  };

  const col = geometry.col ?? 0;
  const cellW = col + geometry.gap;
  const cellH = geometry.rowHeight + geometry.gap;

  const move = useDrag({
    threshold: 4,
    disabled: disabled || !editable,
    onStart: () => startGrab("move"),
    onMove: ({ offset }) => {
      const p = pointer.current;
      if (!p || p.mode !== "move" || grabbed !== "move") return;
      const d = travel(p, offset);
      const nx = rubberClamp(
        p.start.x + d.x,
        0,
        Math.max(0, boardW - p.start.w),
        p.start.w,
      );
      const ny = rubberClamp(
        p.start.y + d.y,
        0,
        Math.max(0, boardH - p.start.h + cellH),
        p.start.h,
      );
      x.set(r2(nx));
      y.set(r2(ny));
      onDragTo(widget.id, { x: nx, y: ny, w: p.start.w, h: p.start.h }, "move");
    },
    onEnd: ({ velocity }) => {
      if (!pointer.current) return;
      land(velocity);
    },
    onCancel: () => {
      if (!pointer.current) return;
      pointer.current = null;
      onCancel(widget.id);
    },
  });

  const resize = useDrag({
    threshold: 3,
    disabled: disabled || !editable,
    onStart: () => startGrab("resize"),
    onMove: ({ offset }) => {
      const p = pointer.current;
      if (!p || p.mode !== "resize" || grabbed !== "resize") return;
      const minW = limits.minW * col + (limits.minW - 1) * geometry.gap;
      const maxCols = Math.min(limits.maxW, geometry.columns - item.x);
      const maxW = maxCols * col + (maxCols - 1) * geometry.gap;
      const minH =
        limits.minH * geometry.rowHeight + (limits.minH - 1) * geometry.gap;
      const maxH =
        limits.maxH * geometry.rowHeight + (limits.maxH - 1) * geometry.gap;
      const d = travel(p, offset);
      const nw = rubberClamp(p.start.w + d.x, minW, maxW, cellW * 2);
      const nh = rubberClamp(p.start.h + d.y, minH, maxH, cellH * 2);
      w.set(r2(nw));
      h.set(r2(nh));
      onDragTo(
        widget.id,
        { x: p.start.x, y: p.start.y, w: nw, h: nh },
        "resize",
      );
    },
    onEnd: ({ velocity }) => {
      if (!pointer.current) return;
      // A resize lands where it was pulled; its corner carries no throw.
      void velocity;
      land({ x: 0, y: 0 });
    },
    onCancel: () => {
      if (!pointer.current) return;
      pointer.current = null;
      onCancel(widget.id);
    },
  });

  // The corner is small enough for a quick pull to leave it before the drag
  // takes hold, so its press listens on the window until it is let go.
  const cornerDetach = React.useRef<(() => void) | null>(null);
  const pressCorner = (event: React.PointerEvent<HTMLButtonElement>) => {
    resize.onPointerDown(event);
    if (disabled || !editable) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const id = event.pointerId;
    // The kit's handlers read only the pointer fields both kinds of event share.
    const asReact = (e: PointerEvent) => e as unknown as React.PointerEvent;
    const move = (e: PointerEvent) => {
      if (e.pointerId === id) resize.onPointerMove(asReact(e));
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach();
      resize.onPointerUp(asReact(e));
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      detach();
      resize.onPointerCancel(asReact(e));
    };
    const detach = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cornerDetach.current = null;
    };
    cornerDetach.current?.();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    cornerDetach.current = detach;
  };
  React.useEffect(() => () => cornerDetach.current?.(), []);

  const scale = useTransform(lift, (l) => r2(1 + 0.02 * l));
  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "0 1px 2px color-mix(in oklab, black 6%, transparent)"
      : `0 ${r2(2 + 10 * l)}px ${r2(4 + 24 * l)}px color-mix(in oklab, black ${Math.round(8 + 16 * l)}%, transparent)`,
  );
  const measured = rect !== null;
  const titleId = `${hintId}-${widget.id}`;

  return (
    <motion.section
      ref={sectionRef}
      aria-labelledby={titleId}
      className={cn(
        "group/snap-board-tile @container/snap-board-tile absolute top-0 left-0 flex flex-col overflow-clip rounded-3 border bg-card",
        grabbed
          ? "z-20 border-[var(--snap-board-accent)]"
          : "z-10 border-hairline",
      )}
      style={
        measured
          ? { x, y, width: w, height: h, scale, boxShadow: shadow }
          : {
              ...cssOf(item, geometry),
              boxShadow: "0 1px 2px color-mix(in oklab, black 6%, transparent)",
            }
      }
    >
      <div
        {...move}
        className={cn(
          "flex h-8 shrink-0 items-center gap-2 border-b border-hairline px-2.5 text-[12px] transition-colors select-none",
          editable && !disabled
            ? "cursor-grab touch-none group-hover/snap-board-tile:bg-surface-2 active:cursor-grabbing"
            : "",
        )}
      >
        <span
          aria-hidden
          className="flex size-4 shrink-0 items-center justify-center text-ink-3 @max-[127px]/snap-board-tile:hidden"
        >
          {widget.icon}
        </span>
        <h3
          id={titleId}
          className="min-w-0 flex-1 truncate font-medium text-foreground"
          title={widget.title}
        >
          {widget.title}
        </h3>
        {editable ? (
          <button
            ref={bindGrip}
            type="button"
            aria-label={moveLabel}
            aria-pressed={grabbed === "move"}
            aria-describedby={hintId}
            disabled={disabled}
            onKeyDown={(event) => onKeyDown(event, widget.id, "move")}
            onBlur={() => onBlur(widget.id)}
            className={cn(
              "-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors",
              "enabled:group-hover/snap-board-tile:text-foreground enabled:hover:bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] disabled:cursor-not-allowed",
              grabbed === "move" &&
                "bg-[color-mix(in_oklab,var(--snap-board-accent)_16%,transparent)] text-foreground",
              FOCUS_RING_IN,
            )}
          >
            <GripHorizontal aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      <div
        className="@container flex-1 overflow-clip p-2.5"
        style={{ minHeight: 0 }}
      >
        {widget.content}
      </div>
      {editable ? (
        <button
          type="button"
          aria-label={resizeLabel}
          aria-pressed={grabbed === "resize"}
          aria-describedby={hintId}
          disabled={disabled}
          onPointerDown={pressCorner}
          onLostPointerCapture={resize.onLostPointerCapture}
          onKeyDown={(event) => onKeyDown(event, widget.id, "resize")}
          onBlur={() => onBlur(widget.id)}
          className={cn(
            "absolute right-0 bottom-0 inline-flex size-5 touch-none items-end justify-end rounded-tl-2 p-1 text-ink-3 opacity-0 transition-opacity",
            "cursor-nwse-resize group-hover/snap-board-tile:opacity-100 focus-visible:opacity-100 disabled:cursor-not-allowed",
            grabbed === "resize" &&
              "text-[var(--snap-board-accent)] opacity-100",
            FOCUS_RING_IN,
          )}
        >
          <svg aria-hidden viewBox="0 0 10 10" className="size-2.5">
            <path
              d="M9 3 3 9M9 6.5 6.5 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </motion.section>
  );
}

/* ------------------------------- component ------------------------------- */

type Active = {
  id: string;
  mode: SnapBoardMode;
  via: "pointer" | "key";
  /** The committed layout when it was picked up. */
  origin: SnapBoardItem[];
  /** Where it is aimed: the cell under it, or the size it is pulled to. */
  target: SnapBoardItem;
};

/**
 * A dashboard layout editor. Widgets sit on a grid of `columns` columns and
 * fixed-height rows; each is dragged by its header and resized by its corner.
 * A dragged widget lifts on the flick spring and follows the finger 1:1,
 * rubber-banding past the board's edges. The cell under it is its target:
 * each time that changes a detent clicks, the board resolves where everything
 * would go, the ghost moves to the landing cell on the snap spring and every
 * widget in the way glides aside on glide. Let go, and it flies to the ghost
 * with the throw's own velocity and lands with a thock; the layout is
 * reported once, from the release.
 *
 * How the others make way is `push`: pushed out of the way and floated back
 * up into any gap ("compact"), pushed and left where they land ("free"), or
 * the widget under the drop trades places ("swap"). A widget dragged down onto
 * another by that one's height hops it above, so any order is reachable.
 *
 * Every grip is a real button: Space or Enter picks the widget up, arrows
 * move it a cell (Shift and arrows resize it), Enter drops, Escape puts
 * everything back, and each step is spoken once. Under reduced motion the
 * widgets and the ghost jump to their cells; the layout is unchanged.
 */
export function SnapBoard({
  widgets = defaultBoardWidgets,
  layout,
  defaultLayout,
  onLayoutChange,
  onMove,
  onDragChange,
  columns = 12,
  push = "compact",
  ghost = "outline",
  rowHeight = 44,
  gap = 8,
  maxHeight,
  editable = true,
  label = "Dashboard layout",
  moveLabel = (title) => `Move ${title}`,
  resizeLabel = (title) => `Resize ${title}`,
  accent = "var(--accent-bright)",
  sound = false,
  disabled = false,
  className,
}: SnapBoardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const cols = Math.max(1, Math.round(columns));

  const [own, setOwn] = React.useState<SnapBoardItem[]>(
    () => defaultLayout ?? defaultBoardLayout(cols),
  );
  const committed = React.useMemo(
    () => normalize(layout ?? own, widgets, cols, push),
    [layout, own, widgets, cols, push],
  );

  const [active, setActive] = React.useState<Active | null>(null);
  const preview = React.useMemo(
    () =>
      active
        ? resolveLayout(active.origin, active.target, push, cols)
        : committed,
    [active, committed, push, cols],
  );
  const landing = active
    ? (preview.find((it) => it.id === active.id) ?? null)
    : null;

  const [board, setBoard] = React.useState<HTMLDivElement | null>(null);
  const [boardW, setBoardW] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!board) return;
    const read = () => setBoardW(Math.round(board.clientWidth));
    read();
    const observer = new ResizeObserver(read);
    observer.observe(board);
    return () => observer.disconnect();
  }, [board]);

  const col =
    boardW === null ? null : Math.max(4, (boardW - (cols - 1) * gap) / cols);
  const geometry: Geometry = { columns: cols, gap, rowHeight, col };
  const rows = rowsOf(preview) + (active ? 1 : 0);
  const heightPx = Math.max(rowHeight, rows * rowHeight + (rows - 1) * gap);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const boardH = useMotionValue(heightPx);
  const guides = useMotionValue(0);
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gw = useMotionValue(0);
  const gh = useMotionValue(0);
  const ghostOpacity = useMotionValue(0);
  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const grips = React.useRef(new Map<string, HTMLButtonElement>());
  const latestActive = React.useRef<Active | null>(null);
  React.useEffect(() => {
    latestActive.current = active;
  });

  const widgetOf = (id: string) => widgets.find((wd) => wd.id === id);
  const titleOf = (id: string) => widgetOf(id)?.title ?? id;
  const where = (it: SnapBoardItem) => `column ${it.x + 1}, row ${it.y + 1}`;

  const panOf = (id: string) => {
    const rect = grips.current.get(id)?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  /* ------------------------------- actions ------------------------------- */

  const report = (next: Active | null) => {
    if (!next) {
      onDragChange?.(null);
      return;
    }
    const at = resolveLayout(next.origin, next.target, push, cols).find(
      (it) => it.id === next.id,
    );
    if (at) onDragChange?.({ id: next.id, mode: next.mode, item: at });
  };

  const grab = (id: string, mode: SnapBoardMode, via: "pointer" | "key") => {
    if (disabled || !editable) return false;
    if (latestActive.current && latestActive.current.id !== id) return false;
    const it = committed.find((x) => x.id === id);
    if (!it) return false;
    const next: Active = { id, mode, via, origin: committed, target: it };
    latestActive.current = next;
    setActive(next);
    report(next);
    audio.play("click", { pitch: 0.9, gain: 0.35, pan: panOf(id) });
    if (via === "key") {
      say(
        `${titleOf(id)} picked up, ${where(it)}, ${it.w} by ${it.h}. ${
          mode === "move" ? "Arrow keys move it" : "Arrow keys resize it"
        }, Enter drops, Escape cancels.`,
      );
    }
    return true;
  };

  const aim = (target: SnapBoardItem) => {
    const a = latestActive.current;
    if (!a) return;
    const t = a.target;
    if (
      t.x === target.x &&
      t.y === target.y &&
      t.w === target.w &&
      t.h === target.h
    )
      return;
    const next = { ...a, target };
    latestActive.current = next;
    setActive(next);
    report(next);
    const dir =
      target.x + target.y + target.w + target.h - (t.x + t.y + t.w + t.h);
    audio.play("click", {
      pitch: dir >= 0 ? 1.15 : 0.95,
      gain: 0.3,
      pan: panOf(a.id),
    });
  };

  const dragTo = (id: string, px: Rect, mode: SnapBoardMode) => {
    const a = latestActive.current;
    if (!a || a.id !== id || col === null) return;
    const cellW = col + gap;
    const cellH = rowHeight + gap;
    const lim = limitsOf(widgetOf(id), cols);
    const maxRow = rowsOf(a.origin);
    if (mode === "move") {
      const x = Math.min(
        cols - a.target.w,
        Math.max(0, Math.round(px.x / cellW)),
      );
      const y = Math.min(maxRow, Math.max(0, Math.round(px.y / cellH)));
      aim({ ...a.target, x, y });
    } else {
      const w = Math.min(
        Math.min(lim.maxW, cols - a.target.x),
        Math.max(lim.minW, Math.round((px.w + gap) / cellW)),
      );
      const h = Math.min(
        lim.maxH,
        Math.max(lim.minH, Math.round((px.h + gap) / cellH)),
      );
      aim({ ...a.target, w, h });
    }
  };

  const drop = (id: string, spoken: boolean) => {
    const a = latestActive.current;
    if (!a || a.id !== id) return;
    const final = resolveLayout(a.origin, a.target, push, cols);
    latestActive.current = null;
    setActive(null);
    onDragChange?.(null);
    const landed = final.find((it) => it.id === id);
    const moved = final
      .filter((it) => {
        if (it.id === id) return false;
        const o = a.origin.find((x) => x.id === it.id);
        return !!o && (o.x !== it.x || o.y !== it.y);
      })
      .map((it) => it.id);
    if (!sameLayout(final, a.origin)) {
      if (layout === undefined) setOwn(final);
      onLayoutChange?.(final);
      onMove?.(id, moved);
    }
    if (spoken && landed) {
      say(
        `${titleOf(id)} dropped at ${where(landed)}${
          a.mode === "resize" ? `, ${landed.w} by ${landed.h}` : ""
        }. ${moved.length === 0 ? "Nothing else moved" : `${moved.length} ${moved.length === 1 ? "widget" : "widgets"} moved`}.`,
      );
    } else if (landed) {
      say(`${titleOf(id)} dropped at ${where(landed)}.`);
    }
  };

  const cancel = (id: string) => {
    const a = latestActive.current;
    if (!a || a.id !== id) return;
    latestActive.current = null;
    setActive(null);
    onDragChange?.(null);
    say(`${titleOf(id)} put back.`);
  };

  const onGripKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
    mode: SnapBoardMode,
  ) => {
    const a = latestActive.current;
    const mine = a && a.id === id;
    if (!mine) {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        grab(id, mode, "key");
      }
      return;
    }
    const lim = limitsOf(widgetOf(id), cols);
    const t = a.target;
    const step = (dx: number, dy: number) => {
      const resizing = a.mode === "resize" || event.shiftKey;
      if (resizing) {
        const w = Math.min(
          Math.min(lim.maxW, cols - t.x),
          Math.max(lim.minW, t.w + dx),
        );
        const h = Math.min(lim.maxH, Math.max(lim.minH, t.h + dy));
        if (w === t.w && h === t.h) return;
        aim({ ...t, w, h });
        say(`${w} by ${h}.`);
      } else {
        const x = Math.min(cols - t.w, Math.max(0, t.x + dx));
        const y = Math.min(rowsOf(a.origin), Math.max(0, t.y + dy));
        if (x === t.x && y === t.y) return;
        const next = { ...t, x, y };
        aim(next);
        const at = resolveLayout(a.origin, next, push, cols).find(
          (it) => it.id === id,
        );
        if (at) say(`${where(at)}.`);
      }
    };
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        step(-1, 0);
        return;
      case "ArrowRight":
        event.preventDefault();
        step(1, 0);
        return;
      case "ArrowUp":
        event.preventDefault();
        step(0, -1);
        return;
      case "ArrowDown":
        event.preventDefault();
        step(0, 1);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        drop(id, true);
        audio.play("thock", { pitch: 1, gain: 0.5, pan: panOf(id) });
        return;
      case "Escape":
        // Handled here, where focus is; the stage must not also close.
        event.preventDefault();
        cancel(id);
        return;
    }
  };

  /* ------------------------------- effects ------------------------------- */

  // The board's height follows the rows in use (plus a spare one while a
  // widget is held), on glide.
  const shownH = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (shownH.current === null || !motionSafe) {
      shownH.current = heightPx;
      boardH.jump(heightPx);
      return;
    }
    if (shownH.current === heightPx) return;
    shownH.current = heightPx;
    run("boardH", animate(boardH, heightPx, springs.glide));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heightPx, motionSafe]);

  // The ghost snaps from landing cell to landing cell; the guides fade in
  // under everything while a widget is held.
  const ghostRect = landing ? rectOf(landing, geometry) : null;
  const ghostKey = ghostRect
    ? `${ghostRect.x},${ghostRect.y},${ghostRect.w},${ghostRect.h}`
    : "";
  React.useEffect(() => {
    const held = !!active;
    run(
      "guides",
      animate(guides, held ? 1 : 0, {
        duration: motionSafe ? durations.base : 0,
        ease: held ? easings.enter : easings.exit,
      }),
    );
    if (!ghostRect) {
      run(
        "ghost",
        animate(ghostOpacity, 0, {
          duration: durations.fast,
          ease: easings.exit,
        }),
      );
      return;
    }
    const fresh = ghostOpacity.get() < 0.05;
    if (fresh || !motionSafe) {
      gx.jump(ghostRect.x);
      gy.jump(ghostRect.y);
      gw.jump(ghostRect.w);
      gh.jump(ghostRect.h);
    } else {
      run("gx", animate(gx, ghostRect.x, springs.snap));
      run("gy", animate(gy, ghostRect.y, springs.snap));
      run("gw", animate(gw, ghostRect.w, springs.snap));
      run("gh", animate(gh, ghostRect.h, springs.snap));
    }
    run(
      "ghost",
      animate(ghostOpacity, 1, {
        duration: durations.fast,
        ease: easings.enter,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostKey, !!active, motionSafe]);

  // Escape puts a pointer drag back too, wherever focus is.
  const holding = active?.via === "pointer" ? active.id : null;
  React.useEffect(() => {
    if (!holding) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const a = latestActive.current;
      if (a) {
        latestActive.current = null;
        setActive(null);
        onDragChange?.(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [holding, onDragChange]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /* -------------------------------- render ------------------------------- */

  const ghostClass =
    ghost === "outline"
      ? "border-2 border-dashed border-[color-mix(in_oklab,var(--snap-board-accent)_70%,transparent)] bg-[color-mix(in_oklab,var(--snap-board-accent)_5%,transparent)]"
      : ghost === "tint"
        ? "border border-[var(--snap-board-accent)] bg-[color-mix(in_oklab,var(--snap-board-accent)_18%,transparent)]"
        : "hidden";

  return (
    <div
      role="region"
      aria-label={label}
      aria-describedby={hintId}
      className={cn(
        "w-full p-1.5",
        maxHeight !== undefined
          ? "overflow-x-clip overflow-y-auto overscroll-contain"
          : "overflow-clip",
        disabled && "opacity-60",
        className,
      )}
      style={
        { maxHeight, "--snap-board-accent": accent } as React.CSSProperties
      }
    >
      <motion.div
        ref={setBoard}
        className="relative w-full"
        style={{ height: boardH }}
      >
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 flex"
          style={{ opacity: guides, gap }}
        >
          {Array.from({ length: cols }, (_, i) => (
            <span
              key={i}
              className="h-full flex-1 rounded-2 bg-[color-mix(in_oklab,var(--snap-board-accent)_7%,transparent)]"
            />
          ))}
        </motion.div>
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-[5] rounded-3",
            ghostClass,
          )}
          style={{ x: gx, y: gy, width: gw, height: gh, opacity: ghostOpacity }}
        />
        {committed.map((base) => {
          const widget = widgetOf(base.id);
          if (!widget) return null;
          const it = preview.find((p) => p.id === base.id) ?? base;
          const mine = active?.id === base.id;
          return (
            <Tile
              key={base.id}
              widget={widget}
              item={it}
              geometry={geometry}
              boardW={boardW ?? 0}
              boardH={heightPx}
              grabbed={mine ? active.mode : null}
              via={mine ? active.via : null}
              editable={editable}
              disabled={disabled}
              motionSafe={motionSafe}
              limits={limitsOf(widget, cols)}
              moveLabel={moveLabel(widget.title)}
              resizeLabel={resizeLabel(widget.title)}
              hintId={hintId}
              onGrab={grab}
              onDragTo={dragTo}
              onRelease={(id) => drop(id, false)}
              onCancel={cancel}
              onKeyDown={onGripKeyDown}
              onLanded={(id, gain) =>
                audio.play("thock", { pitch: 1, gain, pan: panOf(id) })
              }
              onBlur={(id) => {
                // Tabbing away from a widget held by key puts it down there.
                const a = latestActive.current;
                if (a && a.id === id && a.via === "key") drop(id, true);
              }}
              bindGrip={(node) => {
                if (node) grips.current.set(base.id, node);
                else grips.current.delete(base.id);
              }}
            />
          );
        })}
      </motion.div>
      <p id={hintId} className="sr-only">
        Press Space or Enter on a widget&apos;s grip to pick it up. Arrow keys
        move it a cell, Shift and arrow keys resize it, Enter drops it and
        Escape puts it back.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
