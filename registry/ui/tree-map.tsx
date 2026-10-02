"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  usePresence,
  usePresenceData,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { ChevronRight, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TreeMapLabels = "full" | "name" | "off";
export type TreeMapPalette = "category" | "size" | "change";
export type TreeMapStatus = "ready" | "loading" | "error";

export type TreeMapNode = {
  id: string;
  name: string;
  /** A leaf's amount. A parent's is the sum of its children. */
  value?: number;
  /** A leaf's amount in the period before, for the change palette and readout. */
  previous?: number;
  children?: TreeMapNode[];
  /** Any CSS colour for this node and its branch. Defaults to the palette. */
  color?: string;
};

export type TreeMapProps = {
  /** How many levels the view draws below the node in focus: 1 is flat tiles, 2 and 3 nest. @default 2 */
  depth?: number;
  /** Tile labels: name, amount and share where they fit; the name alone; or none. @default "full" */
  labels?: TreeMapLabels;
  /** How tiles are coloured: a hue per top-level category, one hue by share, or by change on the period before. @default "category" */
  palette?: TreeMapPalette;
  /** The tree of amounts. @default defaultTreeMapData */
  data?: TreeMapNode;
  /** Controlled focus: the id of the node the view is zoomed into. */
  value?: string;
  /** Initial focus when uncontrolled. @default the root */
  defaultValue?: string;
  /** Fires from the tile, crumb or key that zoomed, with the new focus id. */
  onValueChange?: (id: string) => void;
  /** A leaf was pressed, with the path from the root down to it. */
  onSelect?: (node: TreeMapNode, path: TreeMapNode[]) => void;
  /** How an amount reads. @default whole currency in `locale` */
  format?: (value: number) => string;
  /** The locale for amounts and shares. @default "en-US" */
  locale?: string;
  /** The currency for amounts. @default "USD" */
  currency?: string;
  /** The period the amounts cover, shown with the total. @default "Q3 2026" */
  period?: string;
  /** What the change is measured against, in the readout. @default "last quarter" */
  compareLabel?: string;
  /** Whether the numbers have arrived. @default "ready" */
  status?: TreeMapStatus;
  /** "Try again" was pressed after the numbers failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Spend" */
  title?: string;
  /** The accessible name. @default the title */
  label?: string;
  /** Play the zoom's swish and the clicks. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const leaf = (
  id: string,
  name: string,
  value: number,
  previous: number,
): TreeMapNode => ({ id, name, value, previous });

/** Fernworks' third-quarter spend, by category, down to the vendor. */
export const defaultTreeMapData: TreeMapNode = {
  id: "spend",
  name: "Fernworks spend",
  children: [
    {
      id: "cloud",
      name: "Cloud & hosting",
      children: [
        {
          id: "compute",
          name: "Compute",
          children: [
            leaf("basin-compute", "Basin Compute", 142000, 131400),
            leaf("gauge-edge", "Gauge Edge", 38400, 36200),
          ],
        },
        {
          id: "storage",
          name: "Storage",
          children: [
            leaf("coldbrook-storage", "Coldbrook Storage", 46200, 44800),
            leaf("archive", "Archive tier", 11800, 12600),
          ],
        },
        {
          id: "network",
          name: "Network",
          children: [
            leaf("delivery", "Edge delivery", 27600, 21900),
            leaf("links", "Private links", 14100, 14100),
          ],
        },
        {
          id: "databases",
          name: "Databases",
          children: [
            leaf("sql", "Managed SQL", 24300, 22000),
            leaf("cache", "Cache cluster", 8000, 8400),
          ],
        },
      ],
    },
    {
      id: "marketing",
      name: "Marketing",
      children: [
        {
          id: "paid",
          name: "Paid media",
          children: [
            leaf("search-ads", "Search ads", 64000, 58500),
            leaf("social-ads", "Social ads", 38200, 44100),
            leaf("retargeting", "Retargeting", 12400, 12900),
          ],
        },
        {
          id: "events",
          name: "Events",
          children: [
            leaf("summit", "Fieldline Summit booth", 42000, 18000),
            leaf("meetups", "Meetups", 9800, 7600),
          ],
        },
        {
          id: "content",
          name: "Content",
          children: [
            leaf("writers", "Freelance writers", 16400, 15100),
            leaf("video", "Video production", 21200, 9800),
          ],
        },
        leaf("brand", "Brand retainer", 18000, 18000),
      ],
    },
    {
      id: "contractors",
      name: "Contractors",
      children: [
        {
          id: "engineering",
          name: "Engineering",
          children: [
            leaf("platform", "Platform team", 86000, 92000),
            leaf("mobile", "Mobile team", 41000, 38500),
          ],
        },
        leaf("legal", "Legal counsel", 31500, 22400),
        leaf("agency", "Design agency", 24000, 24000),
        leaf("accounting", "Accounting", 14800, 14800),
      ],
    },
    {
      id: "software",
      name: "Software",
      children: [
        {
          id: "eng-tools",
          name: "Engineering tools",
          children: [
            leaf("build", "Build minutes", 21800, 16900),
            leaf("review", "Code review", 9600, 9600),
            leaf("errors", "Error tracking", 7400, 7000),
          ],
        },
        {
          id: "ops-tools",
          name: "Operations",
          children: [
            leaf("analytics", "Gaugeworks Analytics", 16200, 15800),
            leaf("desk", "Ticket desk", 11300, 10400),
            leaf("status", "Status pages", 2900, 2900),
          ],
        },
        {
          id: "collab",
          name: "Collaboration",
          children: [
            leaf("chat", "Chat & video", 14600, 14200),
            leaf("wiki", "Docs & wiki", 8800, 8800),
          ],
        },
        {
          id: "design-tools",
          name: "Design",
          children: [
            leaf("canvas", "Canvas seats", 18400, 17200),
            leaf("prototype", "Prototype seats", 6100, 6100),
          ],
        },
      ],
    },
    {
      id: "office",
      name: "Office",
      children: [
        {
          id: "rent",
          name: "Rent",
          children: [
            leaf("coldbrook-office", "Coldbrook office", 72000, 72000),
            leaf("fernmoor-desks", "Fernmoor desks", 9600, 9600),
          ],
        },
        leaf("furniture", "Furniture", 12600, 4100),
        leaf("utilities", "Utilities", 8300, 7900),
        leaf("coffee", "Coffee & snacks", 6400, 6100),
      ],
    },
    {
      id: "travel",
      name: "Travel",
      children: [
        leaf("flights", "Flights", 31800, 27400),
        leaf("hotels", "Hotels", 24600, 22100),
        leaf("meals", "Meals", 9900, 8800),
        leaf("ground", "Ground transport", 7200, 6900),
      ],
    },
    {
      id: "hardware",
      name: "Hardware",
      children: [
        leaf("laptops", "Laptops", 38400, 52800),
        leaf("monitors", "Monitors", 9200, 11600),
        leaf("peripherals", "Peripherals", 4100, 3900),
      ],
    },
  ],
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** The plot before it is measured: a 2:1 tablet plot. */
const DEFAULT_FRAME = { w: 720, h: 360 };
const HEADER = 18;
const PAD = 2;

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Categories are pigment: a token's hue at a fixed lightness, so a tile
 * reads the same on a light page and a dark one.
 */
const PIGMENT = [
  "oklch(from var(--accent-bright) 0.62 0.17 h)",
  "oklch(from var(--signal) 0.7 0.13 h)",
  "oklch(from var(--accent-bright) 0.64 0.15 calc(h + 55))",
  "oklch(from var(--warn) 0.78 0.14 h)",
  "oklch(from var(--danger) 0.66 0.16 h)",
  "oklch(from var(--accent-bright) 0.7 0.11 calc(h - 55))",
  "oklch(from var(--success) 0.68 0.13 h)",
];

type Rect = { x: number; y: number; w: number; h: number };

type Info = {
  node: TreeMapNode;
  parent: string | null;
  depth: number;
  total: number;
  previous: number;
  /** Preorder position: tiles keep this order in the document. */
  order: number;
  /** The top-level category this node sits under (itself for one). */
  category: number;
  kids: string[];
};

/** Totals, parents and order for every node, computed once per tree. */
function indexTree(root: TreeMapNode): Map<string, Info> {
  const out = new Map<string, Info>();
  let order = 0;
  const walk = (
    node: TreeMapNode,
    parent: string | null,
    depth: number,
    category: number,
  ): { total: number; previous: number } => {
    const info: Info = {
      node,
      parent,
      depth,
      total: 0,
      previous: 0,
      order: order++,
      category,
      kids: [],
    };
    out.set(node.id, info);
    const kids = node.children ?? [];
    if (kids.length === 0) {
      info.total = Math.max(0, node.value ?? 0);
      info.previous = Math.max(0, node.previous ?? info.total);
    } else {
      kids.forEach((k, i) => {
        const t = walk(k, node.id, depth + 1, depth === 0 ? i : category);
        info.total += t.total;
        info.previous += t.previous;
      });
      // Biggest first: squarify lays them out in this order, and Home/End
      // and the side table follow it.
      info.kids = kids
        .map((k) => k.id)
        .filter((id) => (out.get(id)?.total ?? 0) > 0)
        .sort(
          (a, b) =>
            (out.get(b)?.total ?? 0) - (out.get(a)?.total ?? 0) ||
            (out.get(a)?.order ?? 0) - (out.get(b)?.order ?? 0),
        );
    }
    return { total: info.total, previous: info.previous };
  };
  walk(root, null, 0, 0);
  return out;
}

/**
 * The squarified treemap: rows are filled along the short side for as long
 * as adding a tile improves the row's worst aspect ratio. Arithmetic only,
 * so the server and the browser cut the same rectangles.
 */
function squarify(
  items: { id: string; v: number }[],
  r: Rect,
  out: Map<string, Rect>,
) {
  const sum = items.reduce((s, it) => s + it.v, 0);
  if (sum <= 0 || r.w <= 0 || r.h <= 0) {
    for (const it of items) out.set(it.id, { x: r.x, y: r.y, w: 0, h: 0 });
    return;
  }
  const scale = (r.w * r.h) / sum;
  const areas = items.map((it) => ({ id: it.id, a: it.v * scale }));
  let rect = { ...r };
  let row: { id: string; a: number }[] = [];
  const worst = (list: { a: number }[], side: number) => {
    const s = list.reduce((t, x) => t + x.a, 0);
    let max = 0;
    for (const x of list) {
      if (x.a <= 0) continue;
      max = Math.max(
        max,
        (side * side * x.a) / (s * s),
        (s * s) / (side * side * x.a),
      );
    }
    return max;
  };
  const place = (list: { id: string; a: number }[]) => {
    const s = list.reduce((t, x) => t + x.a, 0);
    if (rect.w >= rect.h) {
      // A column on the left, as wide as the row's area needs.
      const w = rect.h > 0 ? s / rect.h : 0;
      let y = rect.y;
      for (const x of list) {
        const h = w > 0 ? x.a / w : 0;
        out.set(x.id, { x: rect.x, y, w, h });
        y += h;
      }
      rect = {
        x: rect.x + w,
        y: rect.y,
        w: Math.max(0, rect.w - w),
        h: rect.h,
      };
    } else {
      const h = rect.w > 0 ? s / rect.w : 0;
      let x0 = rect.x;
      for (const x of list) {
        const w = h > 0 ? x.a / h : 0;
        out.set(x.id, { x: x0, y: rect.y, w, h });
        x0 += w;
      }
      rect = {
        x: rect.x,
        y: rect.y + h,
        w: rect.w,
        h: Math.max(0, rect.h - h),
      };
    }
  };
  for (const item of areas) {
    const side = Math.min(rect.w, rect.h);
    if (row.length === 0 || worst([...row, item], side) <= worst(row, side)) {
      row.push(item);
    } else {
      place(row);
      row = [item];
    }
  }
  if (row.length > 0) place(row);
}

/** One view: every node's rectangle, in px of the plot, with `focus` filling it. */
function layoutView(
  index: Map<string, Info>,
  rootId: string,
  focus: string,
  depth: number,
  frame: { w: number; h: number },
): Map<string, Rect> {
  const nest = (id: string, r: Rect, rel: number, out: Map<string, Rect>) => {
    out.set(id, r);
    const info = index.get(id);
    if (!info || info.kids.length === 0) return;
    let inner = r;
    if (rel > 0 && rel < depth) {
      // A drawn parent: a header strip for its name, a hairline of padding.
      const head = r.h > HEADER + 14 && r.w > 28 ? HEADER : PAD;
      inner = {
        x: r.x + PAD,
        y: r.y + head,
        w: Math.max(0, r.w - 2 * PAD),
        h: Math.max(0, r.h - head - PAD),
      };
    }
    const placed = new Map<string, Rect>();
    squarify(
      info.kids.map((k) => ({ id: k, v: index.get(k)?.total ?? 0 })),
      inner,
      placed,
    );
    for (const k of info.kids) {
      const kr = placed.get(k);
      if (kr) nest(k, kr, rel + 1, out);
    }
  };
  const whole = { x: 0, y: 0, w: frame.w, h: frame.h };
  const out = new Map<string, Rect>();
  nest(focus, whole, 0, out);
  if (focus !== rootId) {
    // Outside the focus, the root's own layout seen through the camera
    // that frames the focus: the siblings sit beyond the plot's edges, in
    // the direction they really lie.
    const root = new Map<string, Rect>();
    nest(rootId, whole, 0, root);
    const f = root.get(focus);
    if (f && f.w > 0 && f.h > 0) {
      const sx = frame.w / f.w;
      const sy = frame.h / f.h;
      for (const [id, r] of root) {
        if (out.has(id)) continue;
        out.set(id, {
          x: (r.x - f.x) * sx,
          y: (r.y - f.y) * sy,
          w: r.w * sx,
          h: r.h * sy,
        });
      }
    }
  }
  return out;
}

const pathTo = (index: Map<string, Info>, id: string): string[] => {
  const out: string[] = [];
  let at: string | null = id;
  while (at) {
    out.unshift(at);
    at = index.get(at)?.parent ?? null;
  }
  return out;
};

/** Visible tiles in a view: the focus's descendants down to `depth` levels. */
function visibleIn(
  index: Map<string, Info>,
  focus: string,
  depth: number,
): { id: string; rel: number }[] {
  const out: { id: string; rel: number }[] = [];
  const walk = (id: string, rel: number) => {
    if (rel > depth) return;
    if (rel > 0) out.push({ id, rel });
    for (const k of index.get(id)?.kids ?? []) walk(k, rel + 1);
  };
  walk(focus, 0);
  return out.sort(
    (a, b) => (index.get(a.id)?.order ?? 0) - (index.get(b.id)?.order ?? 0),
  );
}

/** A deterministic width for a line of text: no measuring during render. */
const textWidth = (text: string, px: number) => text.length * px * 0.56;

type LabelMode = 3 | 2 | 1 | 0;

/* ----------------------------------------------------------------------- */
/*                                  A tile                                  */
/* ----------------------------------------------------------------------- */

type Frac = { x: number; y: number; w: number; h: number };

type TileProps = {
  id: string;
  /** Where the tile sits in this view, as shares of the plot. */
  to: Frac;
  /** Where it was in the view before (only read when it arrives). */
  from: Frac;
  entering: boolean;
  /** The plot was resized: go there at once. */
  sizeKey: string;
  motionSafe: boolean;
  children: (box: { leaving: boolean }) => React.ReactNode;
  className: string;
  style: React.CSSProperties;
  button: boolean;
  buttonProps?: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
    "data-tile"?: string;
  };
  divProps?: React.HTMLAttributes<HTMLDivElement> & { "data-tile"?: string };
};

/**
 * One tile. Its box is four motion values (shares of the plot) that glide to
 * each view's rectangle; a tile that leaves glides to where the new view puts
 * it — past the edges for siblings, into its parent for grandchildren — while
 * it fades on the exit ease, then lets AnimatePresence remove it.
 */
function Tile({
  id,
  to,
  from,
  entering,
  sizeKey,
  motionSafe,
  children,
  className,
  style,
  button,
  buttonProps,
  divProps,
}: TileProps) {
  const [isPresent, safeToRemove] = usePresence();
  const exitTo = usePresenceData() as Map<string, Frac> | undefined;
  const x = useMotionValue(from.x);
  const y = useMotionValue(from.y);
  const w = useMotionValue(from.w);
  const h = useMotionValue(from.h);
  const opacity = useMotionValue(entering ? 0 : 1);
  const left = useTransform(x, (v) => `${r2(v * 100)}%`);
  const top = useTransform(y, (v) => `${r2(v * 100)}%`);
  const width = useTransform(w, (v) => `${r2(Math.max(0, v) * 100)}%`);
  const height = useTransform(h, (v) => `${r2(Math.max(0, v) * 100)}%`);
  const lastSize = React.useRef(sizeKey);

  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    const go = (mv: typeof x, v: number, instant: boolean) => {
      if (instant || !motionSafe) mv.set(v);
      else if (Math.abs(mv.get() - v) > 1e-5) {
        running.push(animate(mv, v, springs.glide));
      }
    };
    if (!isPresent) {
      const target = exitTo?.get(id) ?? to;
      // Under reduced motion a leaving tile stays where it was and fades.
      if (motionSafe) {
        go(x, target.x, false);
        go(y, target.y, false);
        go(w, target.w, false);
        go(h, target.h, false);
      }
      running.push(
        animate(opacity, 0, {
          ...exitFor(durations.base),
          onComplete: () => safeToRemove?.(),
        }),
      );
      return () => running.forEach((c) => c.stop());
    }
    const resized = lastSize.current !== sizeKey;
    lastSize.current = sizeKey;
    go(x, to.x, resized);
    go(y, to.y, resized);
    go(w, to.w, resized);
    go(h, to.h, resized);
    if (opacity.get() < 1) {
      running.push(
        animate(opacity, 1, { duration: durations.base, ease: easings.enter }),
      );
    }
    return () => running.forEach((c) => c.stop());
    // The box is keyed by its numbers, not by the object that carries them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, to.x, to.y, to.w, to.h, sizeKey, motionSafe]);

  const motionStyle = { ...style, left, top, width, height, opacity };
  if (button) {
    return (
      <motion.button
        {...(buttonProps as React.ComponentProps<typeof motion.button>)}
        className={className}
        style={motionStyle}
        tabIndex={isPresent ? buttonProps?.tabIndex : -1}
        aria-hidden={isPresent ? undefined : true}
      >
        {children({ leaving: !isPresent })}
      </motion.button>
    );
  }
  return (
    <motion.div
      {...(divProps as React.ComponentProps<typeof motion.div>)}
      className={className}
      style={motionStyle}
    >
      {children({ leaving: !isPresent })}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The treemap                               */
/* ----------------------------------------------------------------------- */

type View = {
  focus: string;
  /** The view before the last change, for where arriving tiles come from. */
  prev: string;
  /** New on every change, so a zoom back to a view still animates. */
  n: number;
};

/**
 * A spending treemap you zoom into. Every node has a rectangle in every
 * view — inside the focus it is squarified fresh for the plot's own shape;
 * outside, it is the root's layout seen through the camera that frames the
 * focus — so a zoom is one relayout: each tile glides on glide from where it
 * was to where it goes. The chosen tile opens out to fill the plot while its
 * children re-squarify into the new shape, the siblings fly off past the
 * edges and fade on the exit ease, and grandchildren grow out of their
 * parent's old box. Breadcrumbs zoom back out the same way in reverse.
 *
 * Labels are decided from each tile's final size with a deterministic width
 * estimate — name, amount and share where they fit, fewer lines where they
 * do not, none on slivers — and fade on a fast tween as they change. A
 * readout under the plot names the tile under the pointer or the keyboard.
 *
 * The tiles are buttons with one roving tab stop: arrows move to the nearest
 * tile in that direction, Enter zooms in (or selects a leaf), Backspace and
 * Escape zoom out. Under reduced motion the views cross-fade in place.
 */
export function TreeMap({
  depth = 2,
  labels = "full",
  palette = "category",
  data = defaultTreeMapData,
  value,
  defaultValue,
  onValueChange,
  onSelect,
  format,
  locale = "en-US",
  currency = "USD",
  period = "Q3 2026",
  compareLabel = "last quarter",
  status = "ready",
  onRetry,
  title = "Spend",
  label,
  sound = false,
  disabled = false,
  className,
}: TreeMapProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const levels = clamp(Math.round(depth), 1, 3);
  const index = React.useMemo(() => indexTree(data), [data]);
  const rootId = data.id;

  const money = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [locale, currency],
  );
  const pct = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 1,
      }),
    [locale],
  );
  const amount = (v: number) => (format ? format(v) : money.format(v));

  /* -------------------------------- focus -------------------------------- */

  const [ownFocus, setOwnFocus] = React.useState(() => defaultValue ?? data.id);
  const wanted = value ?? ownFocus;
  // A focus that is not a parent in this tree falls back to the root.
  const focus = (index.get(wanted)?.kids.length ?? 0) > 0 ? wanted : rootId;

  const [view, setView] = React.useState<View>({
    focus,
    prev: focus,
    n: 0,
  });
  if (view.focus !== focus) {
    setView((v) => ({ focus, prev: v.focus, n: v.n + 1 }));
  }

  /* ------------------------------- the plot ------------------------------ */

  const [plotEl, setPlotEl] = React.useState<HTMLDivElement | null>(null);
  const [frame, setFrame] = React.useState(DEFAULT_FRAME);
  React.useEffect(() => {
    if (!plotEl) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(plotEl.clientWidth);
      const h = Math.round(plotEl.clientHeight);
      if (w < 4 || h < 4) return;
      setFrame((f) => (f.w === w && f.h === h ? f : { w, h }));
    });
    ro.observe(plotEl);
    return () => ro.disconnect();
  }, [plotEl]);
  const sizeKey = `${frame.w}x${frame.h}`;

  const now = layoutView(index, rootId, view.focus, levels, frame);
  const before =
    view.prev === view.focus
      ? now
      : layoutView(index, rootId, view.prev, levels, frame);
  const frac = (r: Rect | undefined): Frac =>
    r
      ? {
          x: r4(r.x / frame.w),
          y: r4(r.y / frame.h),
          w: r4(r.w / frame.w),
          h: r4(r.h / frame.h),
        }
      : { x: 0, y: 0, w: 0, h: 0 };
  const exits = new Map<string, Frac>();
  for (const [id, r] of now) exits.set(id, frac(r));

  const tiles = visibleIn(index, view.focus, levels);
  const shownBefore = new Set(
    visibleIn(index, view.prev, levels).map((t) => t.id),
  );

  /* ------------------------------ colouring ------------------------------ */

  const focusInfo = index.get(view.focus);
  const focusTotal = focusInfo?.total ?? 0;
  const largestShare = Math.max(
    1e-9,
    ...tiles.map(
      (t) => (index.get(t.id)?.total ?? 0) / Math.max(1e-9, focusTotal),
    ),
  );

  const changeOf = (id: string) => {
    const info = index.get(id);
    if (!info || info.previous <= 0) return 0;
    return (info.total - info.previous) / info.previous;
  };

  const fillOf = (id: string, rel: number, framed: boolean) => {
    const info = index.get(id);
    if (!info) return "var(--bg-2)";
    const own = info.node.color;
    if (palette === "size") {
      const share = info.total / Math.max(1e-9, focusTotal);
      const t = Math.sqrt(share / largestShare);
      const mixPct = Math.round((framed ? 14 : 22) + 58 * t);
      return `color-mix(in oklab, oklch(from var(--accent-bright) 0.6 0.18 h) ${mixPct}%, var(--card))`;
    }
    if (palette === "change") {
      const c = clamp(changeOf(id) / 0.4, -1, 1);
      const pigment =
        c > 0
          ? "oklch(from var(--danger) 0.64 0.18 h)"
          : "oklch(from var(--success) 0.64 0.14 h)";
      const mixPct = Math.round((framed ? 8 : 12) + 66 * Math.abs(c));
      return `color-mix(in oklab, ${pigment} ${mixPct}%, var(--card))`;
    }
    const pigment = own ?? PIGMENT[info.category % PIGMENT.length];
    // Siblings shade from strong to soft by rank, deeper levels sit lighter.
    const parent = info.parent ? index.get(info.parent) : undefined;
    const sib = parent ? parent.kids.indexOf(id) : 0;
    const count = parent ? parent.kids.length : 1;
    const rank = count > 1 ? sib / (count - 1) : 0;
    const mixPct = Math.round(
      (framed ? 34 : 70) -
        16 * (rel - 1) -
        22 * rank * (rel === 1 && view.focus === rootId ? 0 : 1),
    );
    return `color-mix(in oklab, ${pigment} ${clamp(mixPct, 12, 80)}%, var(--card))`;
  };

  /* -------------------------------- speech ------------------------------- */

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const shareText = (id: string) => {
    const info = index.get(id);
    const parent = info?.parent ? index.get(info.parent) : undefined;
    if (!info || !parent || parent.total <= 0) return "";
    return pct.format(info.total / parent.total);
  };
  const changeText = (id: string) => {
    const c = changeOf(id);
    if (Math.abs(c) < 0.0005) return `flat on ${compareLabel}`;
    return `${c > 0 ? "up" : "down"} ${pct.format(Math.abs(c))} on ${compareLabel}`;
  };
  const nameOf = (id: string) => index.get(id)?.node.name ?? id;
  const itemsText = (id: string) => {
    const k = index.get(id)?.kids.length ?? 0;
    return k === 0 ? "" : `${k} ${k === 1 ? "item" : "items"}`;
  };
  const tileName = (id: string) => {
    const info = index.get(id);
    if (!info) return id;
    const parent = info.parent ? nameOf(info.parent) : "";
    return [
      info.node.name,
      amount(info.total),
      parent ? `${shareText(id)} of ${parent}` : "",
      changeText(id),
      itemsText(id),
    ]
      .filter(Boolean)
      .join(", ");
  };

  /* -------------------------------- zooming ------------------------------ */

  const tileNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const plotHadFocus = React.useRef(false);
  const wantFocus = React.useRef<string | null>(null);
  const [focusNode, setFocusNode] = React.useState<HTMLButtonElement | null>(
    null,
  );
  const [active, setActive] = React.useState<string | null>(null);

  const panOf = (id: string | null) => {
    const rect = plotEl?.getBoundingClientRect();
    const r = id ? now.get(id) : undefined;
    if (!rect || !r) return 0;
    return panFrom(rect.left + ((r.x + r.w / 2) / frame.w) * rect.width, null);
  };

  const zoomTo = (id: string, comingOutOf?: string) => {
    if (disabled || id === focus) return;
    const going = (index.get(id)?.depth ?? 0) > (index.get(focus)?.depth ?? 0);
    audio.play("swish", {
      pitch: going ? 1.15 : 0.85,
      gain: 0.45,
      pan: panOf(going ? id : (comingOutOf ?? null)),
    });
    plotHadFocus.current =
      typeof document !== "undefined" &&
      !!plotEl?.contains(document.activeElement);
    const firstKid = index.get(id)?.kids[0];
    const next = comingOutOf ?? firstKid ?? null;
    wantFocus.current = next;
    setActive(next);
    if (value === undefined) setOwnFocus(id);
    onValueChange?.(id);
    say(
      `${nameOf(id)}: ${amount(index.get(id)?.total ?? 0)}, ${itemsText(id)}.`,
    );
  };

  const zoomOut = () => {
    const parent = index.get(focus)?.parent;
    if (parent) zoomTo(parent, focus);
  };

  const select = (id: string) => {
    const info = index.get(id);
    if (!info || disabled) return;
    audio.play("click", { pitch: 1.1, gain: 0.5, pan: panOf(id) });
    setActive(id);
    onSelect?.(
      info.node,
      pathTo(index, id).map((p) => index.get(p)?.node as TreeMapNode),
    );
    say(`Selected ${info.node.name}: ${amount(info.total)}.`);
  };

  /** A press anywhere in a top-level tile acts on that tile. */
  const activate = (id: string) => {
    const path = pathTo(index, id);
    const at = path.indexOf(view.focus);
    const top = at >= 0 ? path[at + 1] : undefined;
    if (!top) return;
    if ((index.get(top)?.kids.length ?? 0) > 0) zoomTo(top);
    else select(top);
  };

  // Focus that follows a zoom lands on its tile once that tile has arrived.
  React.useEffect(() => {
    focusNode?.focus({ preventScroll: true });
  }, [focusNode]);

  /* ------------------------------ keyboard ------------------------------- */

  const tops = tiles.filter((t) => t.rel === 1).map((t) => t.id);
  const ordered = [...tops].sort(
    (a, b) => (index.get(b)?.total ?? 0) - (index.get(a)?.total ?? 0),
  );
  const stop = active && tops.includes(active) ? active : (ordered[0] ?? null);

  const moveFocus = (id: string | undefined) => {
    if (!id) return;
    setActive(id);
    audio.play("click", { pitch: 1.35, gain: 0.22, pan: panOf(id) });
    tileNodes.current.get(id)?.focus();
  };

  const nearest = (from: string, dx: number, dy: number) => {
    const a = now.get(from);
    if (!a) return undefined;
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    let best: string | undefined;
    let bestScore = Infinity;
    for (const id of tops) {
      if (id === from) continue;
      const b = now.get(id);
      if (!b) continue;
      const along = (b.x + b.w / 2 - ax) * dx + (b.y + b.h / 2 - ay) * dy;
      if (along <= 1) continue;
      const across = Math.abs(
        (b.x + b.w / 2 - ax) * dy - (b.y + b.h / 2 - ay) * dx,
      );
      const score = along + 2 * across;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    }
    return best;
  };

  const onTileKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const dirs: Record<string, [number, number]> = {
      ArrowRight: [1, 0],
      ArrowLeft: [-1, 0],
      ArrowDown: [0, 1],
      ArrowUp: [0, -1],
    };
    const d = dirs[event.key];
    if (d) {
      event.preventDefault();
      moveFocus(nearest(id, d[0], d[1]));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveFocus(
        event.key === "Home" ? ordered[0] : ordered[ordered.length - 1],
      );
      return;
    }
    if (event.key === "Backspace" || event.key === "Escape") {
      if (focus === rootId) return;
      event.preventDefault();
      zoomOut();
    }
  };

  /* -------------------------------- hover -------------------------------- */

  const [hover, setHover] = React.useState<string | null>(null);
  const shown = hover ?? view.focus;

  /* -------------------------------- render ------------------------------- */

  const crumbs = pathTo(index, view.focus);

  const labelMode = (id: string, r: Rect, framed: boolean): LabelMode => {
    if (labels === "off") return 0;
    const name = nameOf(id);
    const w = r.w - 12;
    const h = r.h - (framed ? 4 : 10);
    if (framed) {
      if (r.h <= HEADER + 14 || w < 30) return 0;
      return textWidth(name, 11) +
        textWidth(amount(index.get(id)?.total ?? 0), 10) +
        12 <=
        w
        ? 2
        : 1;
    }
    const nameW = textWidth(name, 12);
    if (labels === "name") return h >= 16 && w >= Math.min(nameW, 44) ? 1 : 0;
    const amountW = textWidth(amount(index.get(id)?.total ?? 0), 11);
    const shareW = textWidth(
      `${shareText(id)} of ${nameOf(index.get(id)?.parent ?? "")}`,
      11,
    );
    if (
      h >= 50 &&
      w >= Math.max(Math.min(nameW, 90), amountW, Math.min(shareW, 96))
    )
      return 3;
    if (h >= 34 && w >= Math.max(Math.min(nameW, 60), amountW)) return 2;
    if (h >= 16 && w >= Math.min(nameW, 44)) return 1;
    return 0;
  };

  const tileLabel = (id: string, mode: LabelMode, framed: boolean) => {
    const info = index.get(id);
    if (!info || mode === 0) return null;
    if (framed) {
      return (
        <span className="flex h-[18px] items-center gap-1.5 px-1.5 text-[11px] leading-none">
          <span className="truncate font-medium text-foreground">
            {info.node.name}
          </span>
          {mode === 2 ? (
            <span className="ml-auto shrink-0 font-mono text-[10px] text-foreground/70 tabular-nums">
              {amount(info.total)}
            </span>
          ) : null}
        </span>
      );
    }
    return (
      <span className="flex flex-col gap-0.5 p-1.5 text-left">
        <span className="truncate text-[12px] leading-4 font-medium text-foreground">
          {info.node.name}
        </span>
        {mode >= 2 ? (
          <span className="truncate font-mono text-[11px] leading-[14px] text-foreground/80 tabular-nums">
            {amount(info.total)}
          </span>
        ) : null}
        {mode >= 3 ? (
          <span className="truncate text-[11px] leading-[14px] text-foreground/65">
            {shareText(id)} of {nameOf(info.parent ?? "")}
          </span>
        ) : null}
      </span>
    );
  };

  const renderTile = ({ id, rel }: { id: string; rel: number }) => {
    const info = index.get(id);
    const r = now.get(id);
    if (!info || !r) return null;
    const framed = rel < levels && info.kids.length > 0;
    const isTop = rel === 1;
    const mode = labelMode(id, r, framed);
    const entering = !shownBefore.has(id);
    const from = frac(before.get(id) ?? r);
    const hovered = hover === id;
    const body = () => (
      <>
        <span
          aria-hidden
          className={cn(
            "absolute inset-px rounded-[3px] transition-[background-color,box-shadow] duration-200",
            hovered &&
              "shadow-[inset_0_0_0_1.5px_color-mix(in_oklab,var(--foreground)_55%,transparent)]",
          )}
          style={{ background: fillOf(id, rel, framed) }}
        />
        <span className="absolute inset-px overflow-clip">
          <AnimatePresence initial={false}>
            <motion.span
              key={`${mode}`}
              className="absolute inset-x-0 top-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              {tileLabel(id, mode, framed)}
            </motion.span>
          </AnimatePresence>
        </span>
      </>
    );
    const common = {
      id,
      to: frac(r),
      from,
      entering,
      sizeKey,
      motionSafe,
      className: cn(
        "absolute block rounded-1 p-0 text-left select-none",
        isTop ? cn(FOCUS_IN, "cursor-pointer disabled:cursor-not-allowed") : "",
      ),
      style: { zIndex: rel },
    };
    if (isTop) {
      return (
        <Tile
          key={id}
          {...common}
          button
          buttonProps={{
            ref: (node: HTMLButtonElement | null) => {
              if (node) {
                tileNodes.current.set(id, node);
                if (wantFocus.current === id && plotHadFocus.current) {
                  wantFocus.current = null;
                  setFocusNode(node);
                }
              } else {
                tileNodes.current.delete(id);
              }
            },
            type: "button",
            "data-tile": id,
            disabled,
            tabIndex: stop === id ? 0 : -1,
            "aria-label": tileName(id),
            title: info.node.name,
            onFocus: () => {
              setActive(id);
              setHover(id);
            },
            onBlur: () => setHover(null),
            onKeyDown: (event) => onTileKey(event, id),
          }}
        >
          {body}
        </Tile>
      );
    }
    return (
      <Tile
        key={id}
        {...common}
        button={false}
        divProps={{ "data-tile": id, "aria-hidden": true }}
      >
        {body}
      </Tile>
    );
  };

  const shownInfo = index.get(shown);
  const readoutPath = pathTo(index, shown)
    .slice(1)
    .map((p) => nameOf(p))
    .join(" › ");

  const keyFor = () => {
    if (palette === "category") {
      return (
        <span className="text-[11px] text-ink-3">Coloured by category</span>
      );
    }
    if (palette === "size") {
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
          Smaller share
          <span
            aria-hidden
            className="h-2 w-16 rounded-full ring-1 ring-hairline ring-inset"
            style={{
              background:
                "linear-gradient(to right, color-mix(in oklab, oklch(from var(--accent-bright) 0.6 0.18 h) 22%, var(--card)), color-mix(in oklab, oklch(from var(--accent-bright) 0.6 0.18 h) 80%, var(--card)))",
            }}
          />
          Larger
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
        Spend down
        <span
          aria-hidden
          className="h-2 w-16 rounded-full ring-1 ring-hairline ring-inset"
          style={{
            background:
              "linear-gradient(to right, color-mix(in oklab, oklch(from var(--success) 0.64 0.14 h) 78%, var(--card)), var(--card), color-mix(in oklab, oklch(from var(--danger) 0.64 0.18 h) 78%, var(--card)))",
          }}
        />
        Up
      </span>
    );
  };

  const table = (
    <div className="hidden flex-col @min-[68rem]:flex">
      <p className="flex items-center justify-between px-1.5 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        <span>{nameOf(view.focus)}</span>
        <span>{ordered.length} items</span>
      </p>
      <ul role="list" className="flex flex-col">
        {ordered.map((id) => {
          const info = index.get(id);
          if (!info) return null;
          const share = info.total / Math.max(1e-9, focusTotal);
          const c = changeOf(id);
          return (
            <li key={id}>
              <button
                type="button"
                disabled={disabled}
                aria-label={tileName(id)}
                onPointerEnter={() => setHover(id)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(null)}
                onClick={() => activate(id)}
                className={cn(
                  "grid h-9 w-full grid-cols-[0.625rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-1.5 text-left text-[12px] transition-colors",
                  FOCUS_IN,
                  hover === id ? "bg-surface-2" : "enabled:hover:bg-surface-2",
                )}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-[3px]"
                  style={{ background: fillOf(id, 1, false) }}
                />
                <span className="min-w-0">
                  <span className="block truncate text-foreground">
                    {info.node.name}
                  </span>
                  <span
                    aria-hidden
                    className="mt-0.5 block h-0.5 rounded-full bg-surface-2"
                  >
                    <span
                      className="block h-full rounded-full bg-cobalt-bright/70 transition-[width] duration-300"
                      style={{ width: `${Math.round(share * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="flex flex-col items-end font-mono text-[11px] leading-tight tabular-nums">
                  <span className="text-foreground">{amount(info.total)}</span>
                  <span
                    className={cn(
                      c > 0.0005
                        ? "text-danger"
                        : c < -0.0005
                          ? "text-success"
                          : "text-ink-3",
                    )}
                  >
                    {c > 0.0005 ? "+" : c < -0.0005 ? "−" : "±"}
                    {pct.format(Math.abs(c))}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  let plotBody: React.ReactNode;
  if (status === "loading") {
    plotBody = (
      <div
        aria-hidden
        className="absolute inset-0 grid grid-cols-[3fr_2fr] gap-px"
      >
        <span className="bg-surface-2 motion-safe:animate-pulse" />
        <span className="grid grid-rows-[2fr_1fr] gap-px">
          <span className="bg-surface-2 motion-safe:animate-pulse" />
          <span className="bg-surface-2 motion-safe:animate-pulse" />
        </span>
      </div>
    );
  } else if (status === "error") {
    plotBody = (
      <div className="absolute inset-0 flex flex-col items-center-safe justify-center-safe gap-2 p-4 text-center">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn" />
          Spend didn&apos;t load.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors enabled:hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Try again
        </button>
      </div>
    );
  } else {
    plotBody = (
      <AnimatePresence custom={exits}>
        {tiles.map((t) => renderTile(t))}
      </AnimatePresence>
    );
  }

  return (
    <div
      role="region"
      aria-label={label ?? title}
      className={cn(
        "@container flex w-full flex-col gap-3 rounded-4 border border-hairline bg-card p-3 text-foreground @min-[40rem]:p-4",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-col gap-1 @min-[40rem]:flex-row @min-[40rem]:items-end @min-[40rem]:justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="truncate font-mono text-[11px] text-ink-3 tabular-nums">
            {amount(index.get(rootId)?.total ?? 0)} · {period}
          </p>
        </div>
        <div className="hidden @min-[40rem]:flex">{keyFor()}</div>
      </header>

      <nav
        aria-label="Breadcrumb"
        className="-mx-1 [scrollbar-width:none] overflow-x-auto px-1"
      >
        <ol
          role="list"
          className="flex h-7 items-center gap-0.5 whitespace-nowrap"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {crumbs.map((id, i) => {
              const last = i === crumbs.length - 1;
              return (
                <motion.li
                  key={id}
                  layout={motionSafe ? "position" : false}
                  className="flex shrink-0 items-center gap-0.5"
                  initial={{ opacity: 0, x: motionSafe ? -distances.step : 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    opacity: { duration: durations.base, ease: easings.enter },
                    x: motionSafe ? springs.glide : { duration: 0 },
                    layout: springs.glide,
                  }}
                >
                  {i > 0 ? (
                    <ChevronRight
                      aria-hidden
                      className="size-3.5 shrink-0 text-ink-3"
                    />
                  ) : null}
                  {last ? (
                    <span
                      aria-current="location"
                      className="inline-flex h-7 items-center px-1.5 text-xs font-medium text-foreground"
                    >
                      {nameOf(id)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={(event) => {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        audio.play("click", {
                          pitch: 0.95,
                          gain: 0.4,
                          pan: panFrom(rect.left + rect.width / 2, null),
                        });
                        zoomTo(id, crumbs[i + 1]);
                      }}
                      className={cn(
                        "inline-flex h-7 items-center rounded-2 px-1.5 text-xs text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground",
                        FOCUS_RING,
                      )}
                    >
                      {nameOf(id)}
                    </button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </nav>

      <div className="grid gap-3 @min-[68rem]:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-2">
          <div
            ref={setPlotEl}
            role="group"
            aria-label={`${nameOf(view.focus)}: ${itemsText(view.focus)}. Arrow keys move between tiles, Enter zooms in, Backspace zooms out.`}
            onClick={(event) => {
              const id = (event.target as Element)
                .closest("[data-tile]")
                ?.getAttribute("data-tile");
              if (id) activate(id);
            }}
            onPointerMove={(event) => {
              if (event.pointerType !== "mouse") return;
              const id =
                (event.target as Element)
                  .closest("[data-tile]")
                  ?.getAttribute("data-tile") ?? null;
              if (id !== hover) setHover(id);
            }}
            onPointerLeave={() => setHover(null)}
            className="relative aspect-[4/5] w-full touch-manipulation overflow-clip rounded-3 bg-surface-2 @min-[40rem]:aspect-[2/1]"
          >
            {plotBody}
          </div>

          <div className="grid text-[12px]" aria-hidden>
            <AnimatePresence initial={false}>
              <motion.div
                key={shown}
                className="flex flex-col gap-0.5 [grid-area:1/1] @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between @min-[40rem]:gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
              >
                <span className="truncate text-ink-2">
                  {readoutPath || nameOf(rootId)}
                </span>
                {shownInfo ? (
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    <span className="text-foreground">
                      {amount(shownInfo.total)}
                    </span>
                    {shownInfo.parent
                      ? ` · ${shareText(shown)} of ${nameOf(shownInfo.parent)}`
                      : ""}
                    {` · ${changeText(shown)}`}
                  </span>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        {status === "ready" ? table : null}
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
