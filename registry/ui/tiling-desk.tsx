"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Building2, LayoutGrid, Package, RotateCcw, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type TilingRecordKind = "order" | "customer";
export type TilingTone = "ok" | "warn" | "danger" | "neutral";

export type TilingRecord = {
  id: string;
  kind: TilingRecordKind;
  /** "Order 3195", "Coldbrook Café". */
  title: string;
  /** One line under the title. */
  subtitle: string;
  status?: { label: string; tone: TilingTone };
  /** Label and value pairs, two to a row when the tile is wide. */
  fields?: { label: string; value: string }[];
  /** Order lines, or a customer's recent activity. */
  lines?: { label: string; qty?: number; amount: string }[];
  /** "£1,284.50". */
  total?: string;
  /** Ids of records this one links to; each is a button that opens it. */
  related?: string[];
};

export type TilingSide = "left" | "right" | "top" | "bottom";

export type TilingNode =
  | { kind: "leaf"; id: string }
  | {
      kind: "split";
      /** "row" puts `a` left of `b`; "column" puts `a` above `b`. */
      dir: "row" | "column";
      /** The share of the room `a` takes, 0 to 1. */
      ratio: number;
      a: TilingNode;
      b: TilingNode;
    };

export type TilingSplitRule = "longest" | "alternate" | "spiral";
export type TilingStatus = "ready" | "loading" | "error";

export type TilingDeskProps = {
  /** Everything that can be opened. @default defaultTilingRecords */
  records?: TilingRecord[];
  /** Controlled layout tree; its leaves are the open record ids. null is an empty desk. */
  layout?: TilingNode | null;
  /** Initial layout when uncontrolled. @default defaultTilingLayout */
  defaultLayout?: TilingNode | null;
  /** Fires with the whole tree after an open, a close, a drop, a swap or a dock. */
  onLayoutChange?: (layout: TilingNode | null) => void;
  /** Controlled focused window id. */
  focused?: string | null;
  /** Initial focused window when uncontrolled. @default the first window */
  defaultFocused?: string | null;
  /** Fires when another window becomes the focused one. */
  onFocusChange?: (id: string | null) => void;
  /** A record was opened as a new window (not when an open one is brought forward). */
  onOpenRecord?: (record: TilingRecord) => void;
  /** A window was closed. */
  onCloseWindow?: (id: string) => void;
  /** Record ids offered on an empty desk. @default three of the records */
  suggestions?: string[];
  /** Space between tiles and around the desk, px. @default 8 */
  gap?: number;
  /** Which side of the focused tile a new window takes: along its longer side, alternating right and below with each window, or spiralling a quarter turn with each. @default "longest" */
  splitRule?: TilingSplitRule;
  /** Focus, drop zones, the split rule and open markers — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The most windows the desk holds. @default 6 */
  maxWindows?: number;
  /** Draws a window's body in place of the built-in record card. */
  renderRecord?: (
    record: TilingRecord,
    size: { width: number; height: number; compact: boolean },
  ) => React.ReactNode;
  /** Whether the records have arrived. @default "ready" */
  status?: TilingStatus;
  /** "Try again" was pressed after the records failed to load. */
  onRetry?: () => void;
  /** The frame's title. @default "Desk" */
  title?: string;
  /** The workspace shown beside the title. @default "Basinworks" */
  workspace?: string;
  /** The frame's height, px. @default 520 */
  height?: number;
  /** Classes for the outer frame. */
  className?: string;
};

type Rect = { x: number; y: number; w: number; h: number };
type Zone =
  | { kind: "split"; target: string; side: TilingSide; rect: Rect }
  | { kind: "swap"; target: string; rect: Rect }
  | { kind: "dock"; side: TilingSide; rect: Rect };

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultTilingRecords: TilingRecord[] = [
  {
    id: "order-3195",
    kind: "order",
    title: "Order 3195",
    subtitle: "Coldbrook Café · due today",
    status: { label: "Packing", tone: "warn" },
    fields: [
      { label: "Ship by", value: "Today, 16:00" },
      { label: "Depot", value: "Leeds" },
      { label: "Carrier", value: "Basin Freight" },
      { label: "Items", value: "14" },
    ],
    lines: [
      { label: "Oat milk, 1 L", qty: 24, amount: "£86.40" },
      { label: "Espresso beans, 1 kg", qty: 12, amount: "£214.80" },
      { label: "Paper cups, 12 oz", qty: 2000, amount: "£168.00" },
      { label: "Cup lids", qty: 2000, amount: "£64.00" },
    ],
    total: "£1,284.50",
    related: ["cust-coldbrook"],
  },
  {
    id: "order-3188",
    kind: "order",
    title: "Order 3188",
    subtitle: "Fernworks Supply · shipped",
    status: { label: "Shipped", tone: "ok" },
    fields: [
      { label: "Shipped", value: "Yesterday" },
      { label: "Depot", value: "Hull" },
      { label: "Carrier", value: "Coldbrook Haulage" },
      { label: "Items", value: "6" },
    ],
    lines: [
      { label: "Pallet wrap", qty: 40, amount: "£120.00" },
      { label: "Strapping kit", qty: 6, amount: "£54.60" },
      { label: "Shipping labels", qty: 5000, amount: "£45.00" },
    ],
    total: "£219.60",
    related: ["cust-fernworks"],
  },
  {
    id: "order-3201",
    kind: "order",
    title: "Order 3201",
    subtitle: "Gaugeworks Depot · on hold",
    status: { label: "Awaiting stock", tone: "danger" },
    fields: [
      { label: "Ship by", value: "Thursday" },
      { label: "Depot", value: "York" },
      { label: "Carrier", value: "Basin Freight" },
      { label: "Items", value: "16" },
    ],
    lines: [
      { label: "Telematics unit", qty: 8, amount: "£1,560.00" },
      { label: "Wiring harness", qty: 8, amount: "£208.00" },
    ],
    total: "£1,768.00",
    related: ["cust-gaugeworks"],
  },
  {
    id: "order-3176",
    kind: "order",
    title: "Order 3176",
    subtitle: "Coldbrook Café · delivered",
    status: { label: "Delivered", tone: "neutral" },
    fields: [
      { label: "Delivered", value: "Mon 9:42" },
      { label: "Depot", value: "Leeds" },
      { label: "Carrier", value: "Basin Freight" },
      { label: "Items", value: "2" },
    ],
    lines: [{ label: "Display stand", qty: 2, amount: "£310.00" }],
    total: "£310.00",
    related: ["cust-coldbrook"],
  },
  {
    id: "cust-coldbrook",
    kind: "customer",
    title: "Coldbrook Café",
    subtitle: "Account BW-0412 · Leeds",
    status: { label: "Good standing", tone: "ok" },
    fields: [
      { label: "Customer since", value: "2021" },
      { label: "Orders", value: "148" },
      { label: "Lifetime", value: "£96,420" },
      { label: "Terms", value: "Net 30" },
    ],
    lines: [
      { label: "Order 3195 · packing", amount: "£1,284.50" },
      { label: "Order 3176 · delivered", amount: "£310.00" },
      { label: "Order 3142 · delivered", amount: "£1,102.75" },
    ],
    related: ["order-3195", "order-3176"],
  },
  {
    id: "cust-fernworks",
    kind: "customer",
    title: "Fernworks Supply",
    subtitle: "Account BW-0388 · Hull",
    status: { label: "Good standing", tone: "ok" },
    fields: [
      { label: "Customer since", value: "2019" },
      { label: "Orders", value: "312" },
      { label: "Lifetime", value: "£208,915" },
      { label: "Terms", value: "Net 45" },
    ],
    lines: [
      { label: "Order 3188 · shipped", amount: "£219.60" },
      { label: "Order 3160 · delivered", amount: "£2,440.00" },
    ],
    related: ["order-3188"],
  },
  {
    id: "cust-gaugeworks",
    kind: "customer",
    title: "Gaugeworks Depot",
    subtitle: "Account BW-0455 · York",
    status: { label: "Credit hold", tone: "danger" },
    fields: [
      { label: "Customer since", value: "2023" },
      { label: "Orders", value: "37" },
      { label: "Lifetime", value: "£41,060" },
      { label: "Terms", value: "Prepay" },
    ],
    lines: [{ label: "Order 3201 · awaiting stock", amount: "£1,768.00" }],
    related: ["order-3201"],
  },
];

export const defaultTilingLayout: TilingNode = {
  kind: "split",
  dir: "row",
  ratio: 0.5,
  a: { kind: "leaf", id: "order-3195" },
  b: {
    kind: "split",
    dir: "column",
    ratio: 0.5,
    a: { kind: "leaf", id: "cust-coldbrook" },
    b: { kind: "leaf", id: "order-3188" },
  },
};

const DEFAULT_SUGGESTIONS = ["order-3201", "order-3195", "cust-fernworks"];

/* ----------------------------------------------------------------------- */
/*                                The tree                                  */
/* ----------------------------------------------------------------------- */

const leaf = (id: string): TilingNode => ({ kind: "leaf", id });

export function tilingLeaves(node: TilingNode | null): string[] {
  if (!node) return [];
  return node.kind === "leaf"
    ? [node.id]
    : [...tilingLeaves(node.a), ...tilingLeaves(node.b)];
}

function removeLeaf(node: TilingNode | null, id: string): TilingNode | null {
  if (!node) return null;
  if (node.kind === "leaf") return node.id === id ? null : node;
  const a = removeLeaf(node.a, id);
  const b = removeLeaf(node.b, id);
  if (!a) return b;
  if (!b) return a;
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

/** Replaces the target leaf with a split holding it and the new window. */
function splitLeaf(
  node: TilingNode,
  target: string,
  id: string,
  side: TilingSide,
): TilingNode {
  if (node.kind === "leaf") {
    if (node.id !== target) return node;
    const dir = side === "left" || side === "right" ? "row" : "column";
    const first = side === "left" || side === "top";
    return {
      kind: "split",
      dir,
      ratio: 0.5,
      a: first ? leaf(id) : node,
      b: first ? node : leaf(id),
    };
  }
  return {
    ...node,
    a: splitLeaf(node.a, target, id, side),
    b: splitLeaf(node.b, target, id, side),
  };
}

/** A window along one whole edge of the desk, taking two fifths of it. */
function dockAt(node: TilingNode, id: string, side: TilingSide): TilingNode {
  const dir = side === "left" || side === "right" ? "row" : "column";
  const first = side === "left" || side === "top";
  return {
    kind: "split",
    dir,
    ratio: first ? 0.4 : 0.6,
    a: first ? leaf(id) : node,
    b: first ? node : leaf(id),
  };
}

function swapLeaves(node: TilingNode, x: string, y: string): TilingNode {
  if (node.kind === "leaf") {
    return node.id === x ? leaf(y) : node.id === y ? leaf(x) : node;
  }
  return { ...node, a: swapLeaves(node.a, x, y), b: swapLeaves(node.b, x, y) };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function tileRects(
  node: TilingNode | null,
  box: Rect,
  gap: number,
  out = new Map<string, Rect>(),
): Map<string, Rect> {
  if (!node) return out;
  if (node.kind === "leaf") {
    out.set(node.id, {
      x: r1(box.x),
      y: r1(box.y),
      w: r1(Math.max(0, box.w)),
      h: r1(Math.max(0, box.h)),
    });
    return out;
  }
  const ratio = Math.min(0.85, Math.max(0.15, node.ratio));
  if (node.dir === "row") {
    const wa = (box.w - gap) * ratio;
    tileRects(node.a, { ...box, w: wa }, gap, out);
    tileRects(
      node.b,
      { x: box.x + wa + gap, y: box.y, w: box.w - wa - gap, h: box.h },
      gap,
      out,
    );
  } else {
    const ha = (box.h - gap) * ratio;
    tileRects(node.a, { ...box, h: ha }, gap, out);
    tileRects(
      node.b,
      { x: box.x, y: box.y + ha + gap, w: box.w, h: box.h - ha - gap },
      gap,
      out,
    );
  }
  return out;
}

const CARD_H = 104;

function stackRects(ids: string[], width: number, gap: number) {
  const out = new Map<string, Rect>();
  ids.forEach((id, i) =>
    out.set(id, {
      x: gap,
      y: r1(gap + i * (CARD_H + gap)),
      w: r1(Math.max(0, width - gap * 2)),
      h: CARD_H,
    }),
  );
  return out;
}

const SPIRAL: TilingSide[] = ["right", "bottom", "left", "top"];

/**
 * Which side of the focused tile a new window takes. `longest` reads the
 * tile; `alternate` turns between right and below with every window opened;
 * `spiral` turns a quarter clockwise with every window, so a busy desk winds
 * inward.
 */
function sideFor(rule: TilingSplitRule, rect: Rect, count: number): TilingSide {
  if (rule === "alternate") return count % 2 === 1 ? "right" : "bottom";
  if (rule === "spiral") return SPIRAL[count % 4] ?? "right";
  return rect.w >= rect.h ? "right" : "bottom";
}

/** The window in a direction from a tile: nearest by its facing edge, then by alignment. */
function neighbour(
  from: Rect,
  dir: TilingSide,
  rects: Map<string, Rect>,
  except: string,
): string | null {
  let best: string | null = null;
  let score = Infinity;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  for (const [id, r] of rects) {
    if (id === except) continue;
    const rx = r.x + r.w / 2;
    const ry = r.y + r.h / 2;
    let primary: number;
    let secondary: number;
    if (dir === "right") {
      if (r.x < from.x + from.w - 1) continue;
      primary = r.x - (from.x + from.w);
      secondary = Math.abs(ry - cy);
    } else if (dir === "left") {
      if (r.x + r.w > from.x + 1) continue;
      primary = from.x - (r.x + r.w);
      secondary = Math.abs(ry - cy);
    } else if (dir === "bottom") {
      if (r.y < from.y + from.h - 1) continue;
      primary = r.y - (from.y + from.h);
      secondary = Math.abs(rx - cx);
    } else {
      if (r.y + r.h > from.y + 1) continue;
      primary = from.y - (r.y + r.h);
      secondary = Math.abs(rx - cx);
    }
    const s = primary + secondary * 0.5;
    if (s < score) {
      score = s;
      best = id;
    }
  }
  return best;
}

const ARROW: Record<string, TilingSide> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "top",
  ArrowDown: "bottom",
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_INSET =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const TONE: Record<TilingTone, string> = {
  ok: "text-success border-[color-mix(in_oklab,var(--success)_40%,transparent)]",
  warn: "text-warn border-[color-mix(in_oklab,var(--warn)_45%,transparent)]",
  danger:
    "text-danger border-[color-mix(in_oklab,var(--danger)_40%,transparent)]",
  neutral: "text-ink-2 border-hairline",
};

/** Thousands with commas, by hand: a locale lookup in render can differ between server and browser. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const KindIcon = ({
  kind,
  className,
}: {
  kind: TilingRecordKind;
  className?: string;
}) =>
  kind === "order" ? (
    <Package aria-hidden className={className} />
  ) : (
    <Building2 aria-hidden className={className} />
  );

/* ----------------------------------------------------------------------- */
/*                               Record body                                */
/* ----------------------------------------------------------------------- */

function RecordBody({
  record,
  size,
  records,
  onOpen,
}: {
  record: TilingRecord;
  size: { width: number; height: number; compact: boolean };
  records: TilingRecord[];
  onOpen: (id: string) => void;
}) {
  const wide = size.width >= 240;
  const tall = size.height >= 250;
  const status = record.status ? (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-1.5 text-[10.5px] leading-none font-medium",
        TONE[record.status.tone],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {record.status.label}
    </span>
  ) : null;

  if (size.compact) {
    return (
      <div className="flex flex-col gap-1.5 px-3 pt-1 pb-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[12px] text-ink-2">
            {record.subtitle}
          </span>
          {status}
        </div>
        {record.total || record.fields?.[0] ? (
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate text-ink-3">
              {record.fields?.[0]
                ? `${record.fields[0].label} ${record.fields[0].value}`
                : ""}
            </span>
            {record.total ? (
              <span className="shrink-0 font-mono font-medium text-foreground tabular-nums">
                {record.total}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const related = (record.related ?? [])
    .map((id) => records.find((r) => r.id === id))
    .filter((r): r is TilingRecord => Boolean(r));

  return (
    <div className="flex flex-col gap-3 px-3 pt-2 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 truncate text-[12px] text-ink-2">
          {record.subtitle}
        </span>
        {status}
      </div>
      {record.fields?.length ? (
        <dl
          className={cn(
            "grid gap-x-3 gap-y-2",
            wide ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {record.fields.slice(0, tall || wide ? 4 : 2).map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col">
              <dt className="truncate text-[10.5px] leading-4 text-ink-3">
                {f.label}
              </dt>
              <dd className="truncate text-[12.5px] leading-5 text-foreground">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {record.lines?.length && (tall || size.height >= 200) ? (
        <div className="flex flex-col">
          <p className="pb-1 font-mono text-[9.5px] tracking-[0.08em] text-ink-3 uppercase">
            {record.kind === "order" ? "Lines" : "Recent orders"}
          </p>
          <ul role="list" className="flex flex-col">
            {record.lines.slice(0, tall ? 4 : 2).map((line) => (
              <li
                key={line.label}
                className="flex items-baseline gap-2 border-t border-hairline py-1.5 text-[12px]"
              >
                <span className="min-w-0 flex-1 truncate text-ink-2">
                  {line.label}
                </span>
                {line.qty !== undefined ? (
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {`×${grouped(line.qty)}`}
                  </span>
                ) : null}
                <span className="shrink-0 font-mono text-[11.5px] text-foreground tabular-nums">
                  {line.amount}
                </span>
              </li>
            ))}
          </ul>
          {record.total ? (
            <div className="flex items-baseline justify-between border-t border-hairline-strong pt-1.5 text-[12.5px] font-medium">
              <span>Total</span>
              <span className="font-mono tabular-nums">{record.total}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      {related.length ? (
        <div className="flex flex-wrap gap-1.5">
          {related.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r.id)}
              onPointerDown={(event) => event.stopPropagation()}
              className={cn(
                "inline-flex h-7 max-w-full items-center gap-1.5 rounded-2 border border-hairline px-2 text-[11.5px] text-ink-2 transition-colors hover:border-(--td-line) hover:text-foreground",
                FOCUS,
              )}
            >
              <KindIcon kind={r.kind} className="size-3 shrink-0" />
              <span className="truncate">{`Open ${r.title}`}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                A window                                  */
/* ----------------------------------------------------------------------- */

type WindowProps = {
  uid: string;
  record: TilingRecord;
  records: TilingRecord[];
  rect: Rect;
  /** Born from a split this commit: wipes in from the split line. */
  spawn: TilingSide | null;
  focused: boolean;
  /** Focus arrived by a shortcut; modifier keys never set :focus-visible. */
  keyRing: boolean;
  tabbable: boolean;
  dragging: boolean;
  compact: boolean;
  motionSafe: boolean;
  renderRecord?: TilingDeskProps["renderRecord"];
  onFocusWindow: () => void;
  onClose: () => void;
  onOpen: (id: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLElement>) => void;
  onDragStart: () => void;
  onDragMove: (point: { x: number; y: number }) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
  register: (id: string, node: HTMLElement | null) => void;
};

function DeskWindow({
  uid,
  record,
  records,
  rect,
  spawn,
  focused,
  keyRing,
  tabbable,
  dragging,
  compact,
  motionSafe,
  renderRecord,
  onFocusWindow,
  onClose,
  onOpen,
  onKey,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  register,
}: WindowProps) {
  const x = useMotionValue(rect.x);
  const y = useMotionValue(rect.y);
  const w = useMotionValue(rect.w);
  const h = useMotionValue(rect.h);
  const reveal = useMotionValue(spawn ? 0 : 1);
  const clipPath = useTransform(reveal, (p) => {
    const cut = `${Math.round((1 - p) * 10000) / 100}%`;
    if (p >= 1) return "none";
    return spawn === "left"
      ? `inset(0 0 0 ${cut})`
      : spawn === "top"
        ? `inset(${cut} 0 0 0)`
        : spawn === "bottom"
          ? `inset(0 0 ${cut} 0)`
          : `inset(0 ${cut} 0 0)`;
  });
  const id = record.id;
  // One stable ref for the window's whole life: motion binds it once.
  const ref = React.useCallback(
    (node: HTMLElement | null) => register(id, node),
    [register, id],
  );
  const runs = React.useRef<AnimationPlaybackControls[]>([]);
  const velocity = React.useRef({ x: 0, y: 0 });
  const grab = React.useRef({ x: 0, y: 0 });

  // Tiles glide to their rectangles; a dropped window carries its release
  // velocity into the spring that lands it.
  React.useEffect(() => {
    if (dragging) return;
    for (const run of runs.current) run.stop();
    const v = velocity.current;
    velocity.current = { x: 0, y: 0 };
    if (!motionSafe) {
      x.jump(rect.x);
      y.jump(rect.y);
      w.jump(rect.w);
      h.jump(rect.h);
      runs.current = [];
      return;
    }
    runs.current = [
      animate(x, rect.x, { ...springs.glide, velocity: v.x }),
      animate(y, rect.y, { ...springs.glide, velocity: v.y }),
      animate(w, rect.w, springs.glide),
      animate(h, rect.h, springs.glide),
    ];
    const live = runs.current;
    return () => {
      for (const run of live) run.stop();
    };
  }, [rect.x, rect.y, rect.w, rect.h, dragging, motionSafe, x, y, w, h]);

  // The wipe finishes rather than freezes when a re-run interrupts it.
  React.useEffect(() => {
    if (!spawn) return;
    if (!motionSafe) {
      reveal.jump(1);
      return;
    }
    reveal.jump(0);
    const run = animate(reveal, 1, springs.glide);
    return () => {
      run.stop();
      reveal.jump(1);
    };
  }, [spawn, motionSafe, reveal]);

  const drag = useDrag({
    threshold: 4,
    axis: compact ? "y" : undefined,
    onStart: () => {
      for (const run of runs.current) run.stop();
      grab.current = { x: x.get(), y: y.get() };
      onDragStart();
    },
    onMove: ({ offset, point }) => {
      x.set(Math.round((grab.current.x + offset.x) * 10) / 10);
      y.set(Math.round((grab.current.y + offset.y) * 10) / 10);
      onDragMove(point);
    },
    onEnd: ({ velocity: v }) => {
      velocity.current = { x: compact ? 0 : v.x, y: v.y };
      onDragEnd();
    },
    onCancel: onDragCancel,
    onTap: onFocusWindow,
  });

  const size = { width: rect.w, height: rect.h - 32, compact };

  return (
    <motion.section
      ref={ref}
      role="group"
      aria-label={`${record.title}, ${record.subtitle}`}
      aria-describedby={`${uid}-window-hint`}
      tabIndex={tabbable ? 0 : -1}
      data-td-window={record.id}
      onKeyDown={onKey}
      onFocus={onFocusWindow}
      onPointerDownCapture={onFocusWindow}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.97 : 1,
        transition: exitFor(durations.base),
      }}
      className={cn(
        "absolute top-0 left-0 flex flex-col overflow-hidden rounded-3 border bg-card transition-[border-color,box-shadow] duration-150",
        focused
          ? "border-(--td-line) shadow-[0_0_0_1px_var(--td-line)]"
          : "border-hairline",
        dragging &&
          "shadow-[0_18px_40px_color-mix(in_oklab,black_22%,transparent)]",
        FOCUS,
        keyRing &&
          "focus:outline-2 focus:outline-offset-2 focus:outline-ring focus:outline-solid",
      )}
      style={{
        x,
        y,
        width: w,
        height: h,
        clipPath,
        zIndex: dragging ? 40 : focused ? 2 : 1,
      }}
    >
      <div
        {...drag}
        className={cn(
          "flex h-8 shrink-0 items-center gap-2 border-b pr-1 pl-2.5 select-none",
          compact ? "touch-pan-x" : "touch-none",
          focused
            ? "border-(--td-line) bg-(--td-wash)"
            : "border-hairline bg-surface-1",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <KindIcon
          kind={record.kind}
          className={cn(
            "size-3.5 shrink-0",
            focused ? "text-(--td-accent)" : "text-ink-3",
          )}
        />
        <span
          title={record.title}
          className="min-w-0 flex-1 truncate text-[12.5px] leading-4 font-medium text-foreground"
        >
          {record.title}
        </span>
        <button
          type="button"
          aria-label={`Close ${record.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {renderRecord ? (
          renderRecord(record, size)
        ) : (
          <RecordBody
            record={record}
            size={size}
            records={records}
            onOpen={onOpen}
          />
        )}
      </div>
    </motion.section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The desk                                  */
/* ----------------------------------------------------------------------- */

/**
 * An operations desk where opened records tile themselves. The layout is a
 * binary tree of splits whose leaves are windows; every rectangle is worked
 * out from the tree and the desk's measured size, so the windows never
 * overlap and never leave a hole.
 *
 * Opening a record splits the focused tile: it glides into its half on
 * `springs.glide` while the new window wipes in from the split line and a
 * hairline rule flashes along it — which way it splits is `splitRule`.
 * Closing a window fades it out on an exit tween while its neighbours glide
 * out to fill the room. A window's title bar drags it 1:1; the tile under the
 * pointer shows the drop zone it would take (a half, the whole tile for a
 * swap, or a strip along the desk's own edge) on `springs.snap`, and letting
 * go rebuilds the tree, the dropped window landing with its release velocity.
 *
 * Cmd or Ctrl with an arrow moves focus between tiles, with Shift swaps them,
 * with Alt docks the focused window along that edge of the desk; Delete closes
 * it. Under 30rem the tiles become a stack of cards. Under reduced motion
 * windows jump to their rectangles and the wipe and the zones fade.
 */
export function TilingDesk({
  records = defaultTilingRecords,
  layout: layoutProp,
  defaultLayout = defaultTilingLayout,
  onLayoutChange,
  focused: focusedProp,
  defaultFocused,
  onFocusChange,
  onOpenRecord,
  onCloseWindow,
  suggestions = DEFAULT_SUGGESTIONS,
  gap = 8,
  splitRule = "longest",
  accent = "var(--accent-bright)",
  maxWindows = 6,
  renderRecord,
  status = "ready",
  onRetry,
  title = "Desk",
  workspace = "Basinworks",
  height = 520,
  className,
}: TilingDeskProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const g = Math.max(0, Math.round(gap));

  /* ------------------------------- layout ------------------------------- */

  const [ownLayout, setOwnLayout] = React.useState<TilingNode | null>(
    defaultLayout,
  );
  const layout = layoutProp === undefined ? ownLayout : layoutProp;
  const open = tilingLeaves(layout).filter((id) =>
    records.some((r) => r.id === id),
  );

  const [ownFocused, setOwnFocused] = React.useState<string | null>(
    () => defaultFocused ?? tilingLeaves(defaultLayout)[0] ?? null,
  );
  const focusedRaw = focusedProp === undefined ? ownFocused : focusedProp;
  const focused =
    focusedRaw && open.includes(focusedRaw) ? focusedRaw : (open[0] ?? null);

  const [announcement, setAnnouncement] = React.useState("");
  const [spawned, setSpawned] = React.useState<{
    id: string;
    side: TilingSide;
  } | null>(null);
  const [flash, setFlash] = React.useState<{ n: number; rect: Rect } | null>(
    null,
  );

  const commitLayout = (next: TilingNode | null) => {
    if (layoutProp === undefined) setOwnLayout(next);
    onLayoutChange?.(next);
  };
  const focusOn = (id: string | null) => {
    if (id === focused) return;
    if (focusedProp === undefined) setOwnFocused(id);
    onFocusChange?.(id);
  };

  /* ------------------------------ measuring ----------------------------- */

  const [frame, setFrame] = React.useState<HTMLElement | null>(null);
  const [desk, setDesk] = React.useState<HTMLElement | null>(null);
  const [size, setSize] = React.useState({ fw: 720, w: 532, h: height - 44 });
  React.useLayoutEffect(() => {
    if (!frame || !desk) return;
    const read = () => {
      const fw = Math.round(frame.getBoundingClientRect().width);
      const w = desk.clientWidth;
      const h = desk.clientHeight;
      setSize((s) =>
        s.fw === fw && s.w === w && s.h === h ? s : { fw, w, h },
      );
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(frame);
    ro.observe(desk);
    return () => ro.disconnect();
  }, [frame, desk]);
  const compact = size.fw < 480;

  const box: Rect = { x: g, y: g, w: size.w - g * 2, h: size.h - g * 2 };
  const rects = compact
    ? stackRects(open, size.w, Math.max(6, g))
    : tileRects(layout, box, g);
  const stackHeight = compact
    ? Math.max(6, g) + open.length * (CARD_H + Math.max(6, g))
    : 0;

  /* ------------------------------ arrivals ------------------------------ */

  // DOM order is the order windows arrived in, never the tree order: a drop
  // or a swap moves windows with transforms, so no node ever changes places.
  const [arrival, setArrival] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(tilingLeaves(defaultLayout).map((id, i) => [id, i])),
  );
  const missing = open.filter((id) => arrival[id] === undefined);
  if (missing.length) {
    const top = Math.max(-1, ...Object.values(arrival));
    setArrival({
      ...arrival,
      ...Object.fromEntries(missing.map((id, i) => [id, top + 1 + i])),
    });
  }

  /* ------------------------------- focusing ----------------------------- */

  const windowEls = React.useRef(new Map<string, HTMLElement>());
  const register = React.useCallback((id: string, node: HTMLElement | null) => {
    if (node) windowEls.current.set(id, node);
    else windowEls.current.delete(id);
  }, []);

  const pendingFocus = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const node = windowEls.current.get(id);
    if (node?.isConnected) node.focus({ preventScroll: true });
  });

  /* ------------------------------ operations ---------------------------- */

  const recordOf = (id: string) => records.find((r) => r.id === id);

  const openRecord = (id: string) => {
    const record = recordOf(id);
    if (!record || status !== "ready") return;
    if (open.includes(id)) {
      focusOn(id);
      setFlash(null);
      setAnnouncement(`${record.title} is already open; focused.`);
      return;
    }
    if (open.length >= maxWindows) {
      setAnnouncement(
        `The desk holds ${maxWindows} windows. Close one to open another.`,
      );
      return;
    }
    let next: TilingNode;
    let side: TilingSide = "right";
    if (!layout) {
      next = leaf(id);
    } else {
      const target = focused ?? open[0] ?? "";
      const tr = tileRects(layout, box, g).get(target) ?? box;
      side = sideFor(splitRule, tr, open.length);
      next = splitLeaf(layout, target, id, side);
      const nr = tileRects(next, box, g).get(id);
      if (nr && !compact) {
        const line: Rect =
          side === "right"
            ? { x: nr.x - g / 2 - 1, y: nr.y, w: 2, h: nr.h }
            : side === "left"
              ? { x: nr.x + nr.w + g / 2 - 1, y: nr.y, w: 2, h: nr.h }
              : side === "bottom"
                ? { x: nr.x, y: nr.y - g / 2 - 1, w: nr.w, h: 2 }
                : { x: nr.x, y: nr.y + nr.h + g / 2 - 1, w: nr.w, h: 2 };
        setFlash((f) => ({ n: (f?.n ?? 0) + 1, rect: line }));
      }
    }
    setSpawned({ id, side });
    commitLayout(next);
    focusOn(id);
    onOpenRecord?.(record);
    setAnnouncement(
      `Opened ${record.title}. ${plural(open.length + 1, "window")} on the desk.`,
    );
  };

  const closeWindow = (id: string) => {
    const record = recordOf(id);
    const next = removeLeaf(layout, id);
    const rest = tilingLeaves(next);
    // Focus goes to the window that grew into the room.
    const at = open.indexOf(id);
    const heir = rest[Math.min(Math.max(0, at - 1), rest.length - 1)] ?? null;
    commitLayout(next);
    if (focused === id) focusOn(heir);
    if (heir) pendingFocus.current = heir;
    onCloseWindow?.(id);
    setAnnouncement(
      `Closed ${record?.title ?? "the window"}. ${rest.length ? plural(rest.length, "window") : "The desk is clear"}.`,
    );
  };

  const swapWith = (a: string, b: string) => {
    if (!layout) return;
    commitLayout(swapLeaves(layout, a, b));
    setAnnouncement(
      `Swapped ${recordOf(a)?.title ?? "window"} with ${recordOf(b)?.title ?? "window"}.`,
    );
  };

  const dock = (id: string, side: TilingSide) => {
    const rest = removeLeaf(layout, id);
    if (!rest) return;
    commitLayout(dockAt(rest, id, side));
    setAnnouncement(
      `Docked ${recordOf(id)?.title ?? "the window"} ${side === "top" ? "along the top" : side === "bottom" ? "along the bottom" : `on the ${side}`}.`,
    );
  };

  /* -------------------------------- drag -------------------------------- */

  const [dragId, setDragId] = React.useState<string | null>(null);
  const [zone, setZone] = React.useState<Zone | null>(null);
  const zoneRef = React.useRef<Zone | null>(null);
  React.useEffect(() => {
    zoneRef.current = zone;
  }, [zone]);

  const zoneAt = (px: number, py: number, id: string): Zone | null => {
    if (compact) {
      for (const [other, r] of rects) {
        if (other === id) continue;
        if (py >= r.y && py <= r.y + r.h)
          return { kind: "swap", target: other, rect: r };
      }
      return null;
    }
    if (open.length < 2) return null;
    const edge = 20;
    const dockRect = (side: TilingSide): Rect =>
      side === "left"
        ? { x: box.x, y: box.y, w: r1(box.w * 0.4), h: box.h }
        : side === "right"
          ? {
              x: r1(box.x + box.w * 0.6),
              y: box.y,
              w: r1(box.w * 0.4),
              h: box.h,
            }
          : side === "top"
            ? { x: box.x, y: box.y, w: box.w, h: r1(box.h * 0.4) }
            : {
                x: box.x,
                y: r1(box.y + box.h * 0.6),
                w: box.w,
                h: r1(box.h * 0.4),
              };
    if (px < edge)
      return { kind: "dock", side: "left", rect: dockRect("left") };
    if (px > size.w - edge)
      return { kind: "dock", side: "right", rect: dockRect("right") };
    if (py < edge) return { kind: "dock", side: "top", rect: dockRect("top") };
    if (py > size.h - edge)
      return { kind: "dock", side: "bottom", rect: dockRect("bottom") };
    for (const [other, r] of rects) {
      if (other === id) continue;
      if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
      const u = (px - r.x) / Math.max(1, r.w);
      const v = (py - r.y) / Math.max(1, r.h);
      const d = { left: u, right: 1 - u, top: v, bottom: 1 - v };
      const side = (Object.keys(d) as TilingSide[]).reduce((m, k) =>
        d[k] < d[m] ? k : m,
      );
      if (d[side] > 0.3) return { kind: "swap", target: other, rect: r };
      const half: Rect =
        side === "left"
          ? { ...r, w: r1(r.w / 2) }
          : side === "right"
            ? { ...r, x: r1(r.x + r.w / 2), w: r1(r.w / 2) }
            : side === "top"
              ? { ...r, h: r1(r.h / 2) }
              : { ...r, y: r1(r.y + r.h / 2), h: r1(r.h / 2) };
      return { kind: "split", target: other, side, rect: half };
    }
    return null;
  };

  const zoneKey = (z: Zone | null) =>
    !z
      ? ""
      : z.kind === "dock"
        ? `dock:${z.side}`
        : z.kind === "swap"
          ? `swap:${z.target}`
          : `split:${z.target}:${z.side}`;

  const dropOn = (id: string, z: Zone | null) => {
    if (!z || !layout) return;
    const title = recordOf(id)?.title ?? "the window";
    if (z.kind === "swap") {
      swapWith(id, z.target);
      return;
    }
    const rest = removeLeaf(layout, id);
    if (!rest) return;
    if (z.kind === "dock") {
      commitLayout(dockAt(rest, id, z.side));
      setAnnouncement(
        `Docked ${title} ${z.side === "top" ? "along the top" : z.side === "bottom" ? "along the bottom" : `on the ${z.side}`}.`,
      );
      return;
    }
    commitLayout(splitLeaf(rest, z.target, id, z.side));
    setAnnouncement(
      `Moved ${title} to the ${z.side} of ${recordOf(z.target)?.title ?? "the window"}.`,
    );
  };

  /* ------------------------------ keyboard ------------------------------ */

  const onWindowKey = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && ARROW[event.key]) setKeyRing(true);
    if (event.key === "Delete" && event.target === event.currentTarget) {
      event.preventDefault();
      closeWindow(id);
      return;
    }
    if (!mod) return;
    const dir = ARROW[event.key];
    if (!dir) return;
    event.preventDefault();
    if (compact) {
      if (dir === "left" || dir === "right") return;
      const at = open.indexOf(id);
      const to = open[at + (dir === "bottom" ? 1 : -1)];
      if (!to) return;
      if (event.shiftKey) {
        swapWith(id, to);
        pendingFocus.current = id;
      } else {
        focusOn(to);
        pendingFocus.current = to;
      }
      return;
    }
    if (event.altKey) {
      dock(id, dir);
      pendingFocus.current = id;
      return;
    }
    const from = rects.get(id);
    if (!from) return;
    const to = neighbour(from, dir, rects, id);
    if (!to) {
      setAnnouncement("No window that way.");
      return;
    }
    if (event.shiftKey) {
      swapWith(id, to);
      pendingFocus.current = id;
    } else {
      focusOn(to);
      pendingFocus.current = to;
    }
  };

  const [keyRing, setKeyRing] = React.useState(false);
  const [listFocus, setListFocus] = React.useState(0);
  const onListKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const n = records.length;
    const keys: Record<string, number> = {
      ArrowDown: (i + 1) % n,
      ArrowRight: (i + 1) % n,
      ArrowUp: (i - 1 + n) % n,
      ArrowLeft: (i - 1 + n) % n,
      Home: 0,
      End: n - 1,
    };
    const to = keys[event.key];
    if (to === undefined || event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    setListFocus(to);
    const id = records[to]?.id;
    if (id) {
      event.currentTarget
        .closest("nav")
        ?.querySelector<HTMLElement>(`[data-td-record="${CSS.escape(id)}"]`)
        ?.focus();
    }
  };

  /* -------------------------------- render ------------------------------ */

  const vars = {
    "--td-accent": accent,
    "--td-wash": `color-mix(in oklab, ${accent} 9%, transparent)`,
    "--td-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--td-zone": `color-mix(in oklab, ${accent} 12%, transparent)`,
    height,
  } as React.CSSProperties;

  const ordered = [...open].sort(
    (a, b) => (arrival[a] ?? 0) - (arrival[b] ?? 0),
  );
  const groups: { kind: TilingRecordKind; label: string }[] = [
    { kind: "order", label: "Orders" },
    { kind: "customer", label: "Customers" },
  ];
  const tabbableList = Math.min(listFocus, Math.max(0, records.length - 1));

  return (
    <section
      ref={setFrame}
      aria-labelledby={`${uid}-title`}
      className={cn(
        "@container/tiling-desk relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={vars}
    >
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
        <div className="flex min-w-0 items-center gap-2">
          <LayoutGrid
            aria-hidden
            className="size-4 shrink-0 text-(--td-accent)"
          />
          <h2
            id={`${uid}-title`}
            className="truncate text-[14px] font-semibold"
          >
            {title}
          </h2>
          <span className="truncate font-mono text-[10.5px] text-ink-3">
            {workspace}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">
          {`${open.length} / ${maxWindows}`}
        </span>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden @min-[30rem]/tiling-desk:flex-row">
        {/* Records: a column beside the desk, a row of chips on a phone. */}
        <nav
          aria-label="Records"
          className="relative shrink-0 border-b border-hairline @min-[30rem]/tiling-desk:w-46 @min-[30rem]/tiling-desk:border-r @min-[30rem]/tiling-desk:border-b-0"
        >
          <div className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-3 py-2 @min-[30rem]/tiling-desk:h-full @min-[30rem]/tiling-desk:flex-col @min-[30rem]/tiling-desk:gap-0.5 @min-[30rem]/tiling-desk:overflow-x-visible @min-[30rem]/tiling-desk:overflow-y-auto @min-[30rem]/tiling-desk:px-2 @min-[30rem]/tiling-desk:py-2.5">
            {status === "loading"
              ? Array.from({ length: 6 }, (_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="h-8 w-24 shrink-0 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[30rem]/tiling-desk:h-9 @min-[30rem]/tiling-desk:w-auto"
                  />
                ))
              : groups.map((group) => {
                  const items = records.filter((r) => r.kind === group.kind);
                  if (!items.length) return null;
                  return (
                    <React.Fragment key={group.kind}>
                      <p className="hidden px-2 pt-1.5 pb-1 font-mono text-[9.5px] tracking-[0.08em] text-ink-3 uppercase first:pt-0 @min-[30rem]/tiling-desk:block">
                        {group.label}
                      </p>
                      {items.map((r) => {
                        const i = records.indexOf(r);
                        const isOpen = open.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            data-td-record={r.id}
                            type="button"
                            tabIndex={i === tabbableList ? 0 : -1}
                            aria-label={`${r.title}, ${r.subtitle}${isOpen ? ", open" : ""}`}
                            onFocus={() => setListFocus(i)}
                            onKeyDown={(event) => onListKey(event, i)}
                            onClick={() => {
                              setListFocus(i);
                              openRecord(r.id);
                            }}
                            className={cn(
                              "relative flex h-8 shrink-0 items-center gap-2 rounded-2 border px-2.5 text-left transition-colors @min-[30rem]/tiling-desk:h-auto @min-[30rem]/tiling-desk:border-transparent @min-[30rem]/tiling-desk:py-1.5",
                              isOpen
                                ? "border-(--td-line) @min-[30rem]/tiling-desk:bg-(--td-wash)"
                                : "border-hairline hover:bg-surface-2",
                              FOCUS_INSET,
                            )}
                          >
                            <KindIcon
                              kind={r.kind}
                              className={cn(
                                "size-3.5 shrink-0",
                                isOpen ? "text-(--td-accent)" : "text-ink-3",
                              )}
                            />
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate text-[12.5px] leading-4 text-foreground">
                                {r.title}
                              </span>
                              <span className="hidden truncate text-[10.5px] leading-4 text-ink-3 @min-[30rem]/tiling-desk:block">
                                {r.subtitle}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-linear-to-l from-card to-transparent @min-[30rem]/tiling-desk:hidden"
          />
        </nav>

        {/* The desk. */}
        <div
          ref={setDesk}
          onPointerDown={() => {
            if (keyRing) setKeyRing(false);
          }}
          role="group"
          aria-label={`Desk, ${plural(open.length, "window")}`}
          className={cn(
            "relative flex-1 bg-surface-0",
            compact ? "overflow-y-auto overscroll-contain" : "overflow-hidden",
          )}
        >
          <div
            className="relative"
            style={{ height: compact ? stackHeight : "100%" }}
          >
            {status === "error" ? (
              <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 px-6 text-center">
                <p className="text-[13px] font-medium">
                  The records could not be loaded.
                </p>
                <p className="text-[12px] text-ink-3">
                  Your windows are as you left them.
                </p>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className={cn(
                      "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] hover:bg-surface-2",
                      FOCUS,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                    Try again
                  </button>
                ) : null}
              </div>
            ) : status === "loading" ? (
              <div
                aria-hidden
                className="absolute inset-0 grid grid-cols-2 gap-2 p-2"
              >
                <span className="rounded-3 bg-surface-2 motion-safe:animate-pulse" />
                <span className="grid grid-rows-2 gap-2">
                  <span className="rounded-3 bg-surface-2 motion-safe:animate-pulse" />
                  <span className="rounded-3 bg-surface-2 motion-safe:animate-pulse" />
                </span>
              </div>
            ) : open.length === 0 ? (
              <motion.div
                className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-3 px-6 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <span className="flex size-10 items-center justify-center rounded-3 border border-dashed border-hairline-strong text-ink-3">
                  <LayoutGrid aria-hidden className="size-4.5" />
                </span>
                <div>
                  <p className="text-[13.5px] font-medium">
                    Your desk is clear
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-3">
                    Open a record from the list, or start with one of these.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {suggestions
                    .map((id) => recordOf(id))
                    .filter((r): r is TilingRecord => Boolean(r))
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => openRecord(r.id)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] text-foreground transition-colors hover:border-(--td-line)",
                          FOCUS,
                        )}
                      >
                        <KindIcon
                          kind={r.kind}
                          className="size-3.5 text-ink-3"
                        />
                        {r.title}
                      </button>
                    ))}
                </div>
              </motion.div>
            ) : null}

            {/* Drop zone preview. */}
            <AnimatePresence>
              {zone && dragId ? (
                <motion.div
                  key="zone"
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 z-30 rounded-3 border-2 border-dashed border-(--td-line) bg-(--td-zone)"
                  initial={{
                    opacity: 0,
                    x: zone.rect.x,
                    y: zone.rect.y,
                    width: zone.rect.w,
                    height: zone.rect.h,
                  }}
                  animate={{
                    opacity: 1,
                    x: zone.rect.x,
                    y: zone.rect.y,
                    width: zone.rect.w,
                    height: zone.rect.h,
                  }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: 0, opacity: { duration: durations.fast } }
                  }
                />
              ) : null}
            </AnimatePresence>

            {/* The split rule, flashed along a fresh split. */}
            {flash && motionSafe ? (
              <motion.span
                key={flash.n}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-20 rounded-full bg-(--td-accent)"
                style={{
                  x: flash.rect.x,
                  y: flash.rect.y,
                  width: flash.rect.w,
                  height: flash.rect.h,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.9, 0] }}
                transition={{
                  duration: 0.7,
                  times: [0, 0.2, 1],
                  ease: easings.move,
                }}
              />
            ) : null}

            {status === "ready" ? (
              <AnimatePresence>
                {ordered.map((id) => {
                  const record = recordOf(id);
                  const rect = rects.get(id);
                  if (!record || !rect) return null;
                  return (
                    <DeskWindow
                      key={id}
                      uid={uid}
                      record={record}
                      records={records}
                      rect={rect}
                      spawn={spawned?.id === id ? spawned.side : null}
                      focused={focused === id}
                      keyRing={keyRing}
                      tabbable={focused === id}
                      dragging={dragId === id}
                      compact={compact}
                      motionSafe={motionSafe}
                      renderRecord={renderRecord}
                      onFocusWindow={() => focusOn(id)}
                      onClose={() => closeWindow(id)}
                      onOpen={openRecord}
                      onKey={(event) => onWindowKey(event, id)}
                      onDragStart={() => {
                        setDragId(id);
                        focusOn(id);
                      }}
                      onDragMove={(point) => {
                        if (!desk) return;
                        const r = desk.getBoundingClientRect();
                        const z = zoneAt(
                          point.x - r.left + desk.scrollLeft,
                          point.y - r.top + desk.scrollTop,
                          id,
                        );
                        if (zoneKey(z) !== zoneKey(zoneRef.current)) {
                          zoneRef.current = z;
                          setZone(z);
                        }
                      }}
                      onDragEnd={() => {
                        const z = zoneRef.current;
                        zoneRef.current = null;
                        setZone(null);
                        setDragId(null);
                        dropOn(id, z);
                      }}
                      onDragCancel={() => {
                        zoneRef.current = null;
                        setZone(null);
                        setDragId(null);
                      }}
                      register={register}
                    />
                  );
                })}
              </AnimatePresence>
            ) : null}
          </div>
        </div>
      </div>

      <p id={`${uid}-window-hint`} className="sr-only">
        Command or Control with an arrow moves between windows; add Shift to
        swap, or Alt to dock along that edge. Delete closes.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
