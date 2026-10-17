"use client";

import * as React from "react";

import { animate, motion } from "motion/react";
import { Download, RotateCcw, TriangleAlert, Waypoints, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type CostStreamsAccentName = "cobalt" | "plum" | "mint" | "ink";
export type CostStreamsStatus = "ready" | "loading" | "error";
export type CostNodeKind = "project" | "feature" | "model";

export type CostNode = { id: string; name: string };

/** A feature, and the project it belongs to (its streams take that colour). */
export type CostFeature = CostNode & { project?: string };

/** Money that went from a project, through a feature, to a model. */
export type CostFlow = {
  project: string;
  feature: string;
  model: string;
  amount: number;
};

export type CostMonth = {
  /** "2026-10". */
  id: string;
  /** Short tab label: "Oct". */
  label: string;
  flows: CostFlow[];
  /** The last day with data, "2026-10-17", when the month is still running. */
  partialThrough?: string;
};

export type CostStreamsProps = {
  /** Where spend starts, top to bottom. @default defaultCostProjects */
  projects?: CostNode[];
  /** What spends it, top to bottom. @default defaultCostFeatures */
  features?: CostFeature[];
  /** What bills it, top to bottom. @default defaultCostModels */
  models?: CostNode[];
  /** The months, oldest first, each with its flows. @default defaultCostMonths */
  months?: CostMonth[];
  /** Controlled month id. */
  month?: string;
  /** Initial month when uncontrolled. @default the last month */
  defaultMonth?: string;
  /** Fires from the tab or arrow key that changed the month. */
  onMonthChange?: (id: string, month: CostMonth) => void;
  /** Controlled isolated node id, or null for every flow. */
  isolated?: string | null;
  /** Initial isolated node when uncontrolled. @default null */
  defaultIsolated?: string | null;
  /** Fires when Enter or a click isolates a node, or with null when it is released. */
  onSelectNode?: (id: string | null, kind: CostNodeKind | null) => void;
  /** Export was pressed, with the month and its flows. Omit it and the button is not drawn. */
  onExport?: (monthId: string, flows: CostFlow[]) => void;
  /** Spend arrived, is on its way, or failed. @default "ready" */
  status?: CostStreamsStatus;
  /** Try again was pressed after the spend failed to load. */
  onRetry?: () => void;
  /** The panel's heading. @default "Gaugeworks · assistant spend" */
  title?: string;
  /** Under the heading. @default "Four products · by feature and model" */
  subtitle?: string;
  /** How money is printed. @default "$18,420" by hand */
  formatMoney?: (amount: number) => string;
  /** Project colours, in project order. @default pigments turned from the accent's hue */
  colors?: string[];
  /** The flow's height in px. @default 300 */
  plotHeight?: number;
  /** How far each stream's handles reach: 0 a straight band, 1 a deep S. @default 0.5 */
  curvature?: number;
  /** Thickness of the node bars, px. @default 10 */
  nodeWidth?: number;
  /** The tab indicator and isolation chip, and the hue the project colours turn from. @default "cobalt" */
  accent?: CostStreamsAccentName | (string & {});
  /** Read only: months and isolation cannot change. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultCostProjects: CostNode[] = [
  { id: "ledger", name: "Ledger" },
  { id: "field", name: "Field" },
  { id: "desk", name: "Desk" },
  { id: "docs", name: "Docs" },
];

export const defaultCostFeatures: CostFeature[] = [
  { id: "receipts", name: "Receipt reading", project: "ledger" },
  { id: "month-end", name: "Month-end notes", project: "ledger" },
  { id: "visits", name: "Visit summaries", project: "field" },
  { id: "job-notes", name: "Job notes", project: "field" },
  { id: "drafts", name: "Reply drafts", project: "desk" },
  { id: "triage", name: "Ticket triage", project: "desk" },
  { id: "answers", name: "Doc answers", project: "docs" },
  { id: "indexing", name: "Indexing", project: "docs" },
];

export const defaultCostModels: CostNode[] = [
  { id: "pro", name: "Waylight Pro" },
  { id: "lite", name: "Waylight Lite" },
  { id: "embed", name: "Waylight Embed" },
];

const FEATURE_PROJECT: Record<string, string> = Object.fromEntries(
  defaultCostFeatures.map((f) => [f.id, f.project ?? ""]),
);

/** Compact triples: feature, model, amount. The project comes from the feature. */
const month = (
  id: string,
  label: string,
  rows: [string, string, number][],
  partialThrough?: string,
): CostMonth => ({
  id,
  label,
  partialThrough,
  flows: rows.map(([feature, model, amount]) => ({
    project: FEATURE_PROJECT[feature] ?? "",
    feature,
    model,
    amount,
  })),
});

/**
 * Gaugeworks across four products, July to a still-running October: Desk's
 * reply drafts take off, Ledger moves receipt reading onto Lite in
 * September, Docs starts indexing in August.
 */
export const defaultCostMonths: CostMonth[] = [
  month("2026-07", "Jul", [
    ["receipts", "pro", 2100],
    ["receipts", "lite", 300],
    ["month-end", "pro", 900],
    ["visits", "pro", 1200],
    ["visits", "lite", 400],
    ["job-notes", "lite", 500],
    ["drafts", "pro", 1400],
    ["triage", "lite", 700],
    ["answers", "pro", 1600],
    ["answers", "embed", 200],
  ]),
  month("2026-08", "Aug", [
    ["receipts", "pro", 2300],
    ["receipts", "lite", 350],
    ["month-end", "pro", 700],
    ["visits", "pro", 1300],
    ["visits", "lite", 450],
    ["job-notes", "lite", 600],
    ["drafts", "pro", 2100],
    ["triage", "lite", 800],
    ["answers", "pro", 1800],
    ["answers", "embed", 250],
    ["indexing", "embed", 900],
  ]),
  month("2026-09", "Sep", [
    ["receipts", "pro", 600],
    ["receipts", "lite", 1100],
    ["month-end", "pro", 800],
    ["visits", "pro", 1400],
    ["visits", "lite", 500],
    ["job-notes", "lite", 650],
    ["drafts", "pro", 3600],
    ["triage", "lite", 900],
    ["answers", "pro", 2000],
    ["answers", "embed", 300],
    ["indexing", "embed", 600],
  ]),
  month(
    "2026-10",
    "Oct",
    [
      ["receipts", "pro", 300],
      ["receipts", "lite", 800],
      ["month-end", "pro", 400],
      ["visits", "pro", 900],
      ["visits", "lite", 400],
      ["job-notes", "lite", 420],
      ["drafts", "pro", 4200],
      ["drafts", "lite", 900],
      ["triage", "lite", 600],
      ["answers", "pro", 1500],
      ["answers", "embed", 220],
      ["indexing", "embed", 300],
    ],
    "2026-10-17",
  ),
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Money by hand: the same string in Node and every browser. */
const dollars = (amount: number): string => {
  const whole = String(Math.round(Math.abs(amount))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${amount < 0 ? "−" : ""}$${whole}`;
};

/** "$4.2k": compact by hand, since Intl's compact output differs in Node. */
const short = (amount: number): string => {
  const v = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (v >= 1000) return `${sign}$${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(v)}`;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const monthName = (m: CostMonth) => {
  const index = Number(m.id.split("-")[1]) - 1;
  return MONTH_NAMES[index] ?? m.label;
};

const daysIn = (m: CostMonth) => {
  const [y, mo] = m.id.split("-").map(Number);
  if (!y || !mo) return 30;
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
};

const dayOf = (iso: string) => Number(iso.split("-")[2]) || 0;

const ACCENTS: Record<CostStreamsAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const HUES = [0, 150, 60, 290, 210, 110];
const GREYS = [0.46, 0.6, 0.72, 0.54, 0.66, 0.78];

/** Streams are pigment: one lightness in both themes, hues turned from the accent. */
const projectColor = (i: number, accent: string) =>
  accent === "ink"
    ? `oklch(from var(--ink-2) ${GREYS[i % 6] ?? 0.6} 0.012 h)`
    : `oklch(from var(--cs-ink) 0.68 0.12 calc(h + ${HUES[i % 6] ?? 0}))`;

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--cs-ink": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as CostStreamsAccentName]
      : accent,
    "--cs-wash": "color-mix(in oklab, var(--cs-ink) 12%, transparent)",
    "--cs-soft": "color-mix(in oklab, var(--cs-ink) 30%, transparent)",
    "--cs-chip": "color-mix(in oklab, var(--card) 86%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/* ----------------------------------------------------------------------- */
/*                                  Layout                                  */
/* ----------------------------------------------------------------------- */

type NodeGeo = { y: number; h: number };
type RibbonGeo = { y0: number; y1: number; t: number };
type Geo = {
  nodes: Record<string, NodeGeo>;
  ribbons: Record<string, RibbonGeo>;
};

const GAP = 12;
const LABEL_H = 20;

/**
 * Stacks each column's nodes top to bottom with a gap between the ones that
 * carry money, centred in the plot, at one money-to-pixel scale for the
 * whole month (so an isolated node keeps its true size), then threads every
 * stream out of its source and into its target in node order.
 */
const computeGeo = (
  flows: CostFlow[],
  columns: [CostNode[], CostNode[], CostNode[]],
  height: number,
  scale: number,
  ribbonIds: string[],
): Geo => {
  const totals = [
    new Map<string, number>(),
    new Map<string, number>(),
    new Map<string, number>(),
  ];
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  for (const f of flows) {
    const a = Math.max(0, f.amount);
    totals[0]?.set(f.project, (totals[0].get(f.project) ?? 0) + a);
    totals[1]?.set(f.feature, (totals[1].get(f.feature) ?? 0) + a);
    totals[2]?.set(f.model, (totals[2].get(f.model) ?? 0) + a);
    const l = `L:${f.project}:${f.feature}`;
    const r = `R:${f.feature}:${f.model}`;
    left.set(l, (left.get(l) ?? 0) + a);
    right.set(r, (right.get(r) ?? 0) + a);
  }
  const nodes: Record<string, NodeGeo> = {};
  columns.forEach((col, ci) => {
    const t = totals[ci] ?? new Map<string, number>();
    const live = col.filter((n) => (t.get(n.id) ?? 0) > 0);
    const used =
      live.reduce((s, n) => s + (t.get(n.id) ?? 0), 0) * scale +
      Math.max(0, live.length - 1) * GAP;
    let y = (height - used) / 2;
    for (const n of col) {
      const h = (t.get(n.id) ?? 0) * scale;
      nodes[`${ci}:${n.id}`] = { y, h };
      if (h > 0) y += h + GAP;
    }
  });
  const ribbons: Record<string, RibbonGeo> = {};
  // Out of each source in target order, into each target in source order.
  const outCursor = new Map<string, number>();
  const inCursor = new Map<string, number>();
  const place = (
    id: string,
    srcKey: string,
    dstKey: string,
    amount: number,
  ) => {
    const src = nodes[srcKey];
    const dst = nodes[dstKey];
    const t = amount * scale;
    const y0 = outCursor.get(srcKey) ?? src?.y ?? height / 2;
    const y1 = inCursor.get(dstKey) ?? dst?.y ?? height / 2;
    ribbons[id] = { y0, y1, t };
    outCursor.set(srcKey, y0 + t);
    inCursor.set(dstKey, y1 + t);
  };
  const [projects, features, models] = columns;
  for (const p of projects) {
    for (const f of features) {
      const id = `L:${p.id}:${f.id}`;
      place(id, `0:${p.id}`, `1:${f.id}`, left.get(id) ?? 0);
    }
  }
  for (const f of features) {
    for (const m of models) {
      const id = `R:${f.id}:${m.id}`;
      place(id, `1:${f.id}`, `2:${m.id}`, right.get(id) ?? 0);
    }
  }
  // Streams never seen this month still need a place to grow from.
  for (const id of ribbonIds) {
    if (!ribbons[id]) ribbons[id] = { y0: height / 2, y1: height / 2, t: 0 };
  }
  return { nodes, ribbons };
};

const lerpGeo = (a: Geo, b: Geo, p: number): Geo => {
  const nodes: Record<string, NodeGeo> = {};
  for (const [k, v] of Object.entries(b.nodes)) {
    const f = a.nodes[k] ?? v;
    nodes[k] = { y: lerp(f.y, v.y, p), h: lerp(f.h, v.h, p) };
  }
  const ribbons: Record<string, RibbonGeo> = {};
  for (const [k, v] of Object.entries(b.ribbons)) {
    const f = a.ribbons[k] ?? v;
    ribbons[k] = {
      y0: lerp(f.y0, v.y0, p),
      y1: lerp(f.y1, v.y1, p),
      t: lerp(f.t, v.t, p),
    };
  }
  return { nodes, ribbons };
};

const ribbonPath = (
  x0: number,
  x1: number,
  g: RibbonGeo,
  curvature: number,
): string => {
  const dx = (x1 - x0) * 0.6 * clamp(curvature, 0, 1);
  const a = r2(x0);
  const b = r2(x1);
  const c0 = r2(x0 + dx);
  const c1 = r2(x1 - dx);
  const y0 = r2(g.y0);
  const y1 = r2(g.y1);
  const y0b = r2(g.y0 + g.t);
  const y1b = r2(g.y1 + g.t);
  return `M${a} ${y0}C${c0} ${y0} ${c1} ${y1} ${b} ${y1}L${b} ${y1b}C${c1} ${y1b} ${c0} ${y0b} ${a} ${y0b}Z`;
};

/* ----------------------------------------------------------------------- */
/*                               Rolling text                               */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  format,
  motionSafe,
  className,
}: {
  value: number;
  format: (v: number) => string;
  motionSafe: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [first] = React.useState(() => format(value));
  const shown = React.useRef(value);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = shown.current;
    if (!motionSafe || from === value) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const ctrl = animate(from, value, {
      ...springs.snap,
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = format(v);
      },
      onComplete: () => {
        shown.current = value;
        node.textContent = format(value);
      },
    });
    return () => ctrl.stop();
  }, [value, format, motionSafe]);
  return (
    <span ref={ref} className={className}>
      {first}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

const KINDS: CostNodeKind[] = ["project", "feature", "model"];

/**
 * Spend drawn as streams that flow from projects through the features that
 * spend it to the models that bill it. A stream's thickness is money and its
 * colour is the project it left, kept all the way to the model, so one
 * product's money can be followed end to end.
 *
 * Switching the month is the moment it is built for: one `glide` spring
 * drives every node's height and every stream's ends from where they are
 * now to the new month's layout at once — a second switch mid-flight carries
 * on from the frame it interrupted — so you watch money move between
 * features while the total rolls on `snap`. Hovering or focusing a node
 * lifts its streams and dims the rest; Enter or a click isolates it, and the
 * plot re-lays out with only the flows through it, at the same money scale,
 * on the same morph. Geometry is written straight into the paths and labels
 * per frame, never through React state.
 *
 * The months are a tablist; every node is a button in the tab order (Tab
 * moves node to node), Enter isolates and Escape releases. Below a 36rem
 * container the streams become a nested list of bars. Under reduced motion
 * the layouts swap without travel.
 */
export function CostStreams({
  projects = defaultCostProjects,
  features = defaultCostFeatures,
  models = defaultCostModels,
  months = defaultCostMonths,
  month: monthProp,
  defaultMonth,
  onMonthChange,
  isolated: isolatedProp,
  defaultIsolated = null,
  onSelectNode,
  onExport,
  status = "ready",
  onRetry,
  title = "Gaugeworks · assistant spend",
  subtitle = "Four products · by feature and model",
  formatMoney = dollars,
  colors,
  plotHeight = 300,
  curvature = 0.5,
  nodeWidth = 10,
  accent = "cobalt",
  disabled = false,
  className,
}: CostStreamsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const panelId = `${uid}-panel`;

  const [ownMonth, setOwnMonth] = React.useState<string | undefined>(
    defaultMonth ?? months[months.length - 1]?.id,
  );
  const monthId = monthProp ?? ownMonth ?? months[months.length - 1]?.id;
  const current =
    months.find((m) => m.id === monthId) ?? months[months.length - 1] ?? null;
  const currentIndex = current ? months.indexOf(current) : -1;
  const previous = currentIndex > 0 ? months[currentIndex - 1] : null;

  const [ownIsolated, setOwnIsolated] = React.useState<string | null>(
    defaultIsolated,
  );
  const isolatedKey = isolatedProp === undefined ? ownIsolated : isolatedProp;
  const [hot, setHot] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const H = Math.max(160, plotHeight);
  const nodeW = clamp(nodeWidth, 2, 32);
  const [width, setWidth] = React.useState(696);
  const [plotNode, setPlotNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!plotNode) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(plotNode.clientWidth);
      if (w > 0) setWidth(w);
    });
    ro.observe(plotNode);
    return () => ro.disconnect();
  }, [plotNode]);

  const colorOf = React.useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p, i) =>
      map.set(p.id, colors?.[i] ?? projectColor(i, accent)),
    );
    return map;
  }, [projects, colors, accent]);
  const featureProject = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const f of features) if (f.project) map.set(f.id, f.project);
    for (const m of months)
      for (const fl of m.flows)
        if (!map.has(fl.feature)) map.set(fl.feature, fl.project);
    return map;
  }, [features, months]);

  const kindOf = React.useCallback(
    (id: string): CostNodeKind | null => {
      if (projects.some((n) => n.id === id)) return "project";
      if (features.some((n) => n.id === id)) return "feature";
      if (models.some((n) => n.id === id)) return "model";
      return null;
    },
    [projects, features, models],
  );
  const isolatedKind = isolatedKey ? kindOf(isolatedKey) : null;
  const isolated = isolatedKind ? isolatedKey : null;

  const touches = React.useCallback(
    (f: CostFlow, id: string) =>
      f.project === id || f.feature === id || f.model === id,
    [],
  );

  const allFlows = React.useMemo(() => current?.flows ?? [], [current]);
  const flows = React.useMemo(
    () => (isolated ? allFlows.filter((f) => touches(f, isolated)) : allFlows),
    [allFlows, isolated, touches],
  );
  const total = React.useMemo(
    () => allFlows.reduce((s, f) => s + Math.max(0, f.amount), 0),
    [allFlows],
  );
  const shownTotal = React.useMemo(
    () => flows.reduce((s, f) => s + Math.max(0, f.amount), 0),
    [flows],
  );

  const ribbonIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const m of months)
      for (const f of m.flows) {
        ids.add(`L:${f.project}:${f.feature}`);
        ids.add(`R:${f.feature}:${f.model}`);
      }
    return [...ids];
  }, [months]);

  /** One money-to-pixel scale per month, from its fullest column. */
  const scale = React.useMemo(() => {
    if (total <= 0) return 0;
    const counts = [projects, features, models].map(
      (col, ci) =>
        col.filter((n) =>
          allFlows.some(
            (f) =>
              (ci === 0 ? f.project : ci === 1 ? f.feature : f.model) ===
                n.id && f.amount > 0,
          ),
        ).length,
    );
    const most = Math.max(1, ...counts);
    return Math.max(0, (H - (most - 1) * GAP) / total);
  }, [total, projects, features, models, allFlows, H]);

  const geo = React.useMemo(
    () => computeGeo(flows, [projects, features, models], H, scale, ribbonIds),
    [flows, projects, features, models, H, scale, ribbonIds],
  );

  // Model names are the longest labels, so the right gutter is the wider one.
  const gutterL = Math.round(clamp(width * 0.16, 88, 140));
  const gutterR = Math.round(clamp(width * 0.22, 104, 180));
  const xs = {
    p: gutterL,
    f: Math.round((gutterL + (width - gutterR - nodeW)) / 2 - nodeW / 2),
    m: width - gutterR - nodeW,
  };

  /* --------------------------- the morph engine -------------------------- */

  const ribbonEls = React.useRef(new Map<string, SVGPathElement>());
  const barEls = React.useRef(new Map<string, SVGRectElement>());
  const labelEls = React.useRef(new Map<string, HTMLElement>());
  const shown = React.useRef<Geo | null>(null);
  const lastKey = React.useRef<string | null>(null);

  const ribbonX = React.useCallback(
    (id: string): [number, number] =>
      id.startsWith("L:") ? [xs.p + nodeW, xs.f] : [xs.f + nodeW, xs.m],
    [xs.p, xs.f, xs.m, nodeW],
  );

  const draw = React.useCallback(
    (g: Geo) => {
      for (const [id, el] of ribbonEls.current) {
        const r = g.ribbons[id];
        if (!r) continue;
        const [x0, x1] = ribbonX(id);
        el.setAttribute("d", ribbonPath(x0, x1, r, curvature));
      }
      for (const [key, el] of barEls.current) {
        const n = g.nodes[key];
        if (!n) continue;
        el.setAttribute("y", String(r2(n.y)));
        el.setAttribute("height", String(r2(Math.max(0, n.h))));
      }
      for (const [key, el] of labelEls.current) {
        const n = g.nodes[key];
        if (!n) continue;
        el.style.transform = `translateY(${r2(n.y + n.h / 2 - LABEL_H / 2)}px)`;
      }
    },
    [ribbonX, curvature],
  );

  const morphKey = `${current?.id ?? ""}|${isolated ?? ""}`;
  React.useLayoutEffect(() => {
    const from = shown.current;
    const changed = lastKey.current !== null && lastKey.current !== morphKey;
    lastKey.current = morphKey;
    if (!from || !changed || !motionSafe) {
      shown.current = geo;
      draw(geo);
      return;
    }
    // React has just written the new layout; put the old one back before
    // the browser paints, then carry it across on one spring.
    draw(from);
    const ctrl = animate(0, 1, {
      ...springs.glide,
      onUpdate: (p) => {
        const g = lerpGeo(from, geo, clamp(p, 0, 1.02));
        shown.current = g;
        draw(g);
      },
      onComplete: () => {
        shown.current = geo;
        draw(geo);
      },
    });
    return () => ctrl.stop();
  }, [geo, draw, morphKey, motionSafe]);

  /* ---------------------------- interactions ---------------------------- */

  const nameOf = (id: string) =>
    [...projects, ...features, ...models].find((n) => n.id === id)?.name ?? id;

  const selectMonth = (m: CostMonth) => {
    if (disabled || m.id === current?.id) return;
    if (monthProp === undefined) setOwnMonth(m.id);
    onMonthChange?.(m.id, m);
    const t = m.flows.reduce((s, f) => s + Math.max(0, f.amount), 0);
    setAnnouncement(
      `${monthName(m)}, ${formatMoney(t)}${m.partialThrough ? `, through day ${dayOf(m.partialThrough)}` : ""}.`,
    );
  };

  const isolate = (id: string | null) => {
    if (disabled) return;
    const next = id === isolated ? null : id;
    if (isolatedProp === undefined) setOwnIsolated(next);
    onSelectNode?.(next, next ? kindOf(next) : null);
    setAnnouncement(
      next
        ? `Showing only flows through ${nameOf(next)}.`
        : "Showing every flow.",
    );
  };

  /** Streams and nodes connected to a node through the month's flows. */
  const connected = React.useMemo(() => {
    if (!hot) return null;
    const ribbons = new Set<string>();
    const nodes = new Set<string>();
    for (const f of flows) {
      if (!touches(f, hot)) continue;
      ribbons.add(`L:${f.project}:${f.feature}`);
      ribbons.add(`R:${f.feature}:${f.model}`);
      nodes.add(`0:${f.project}`);
      nodes.add(`1:${f.feature}`);
      nodes.add(`2:${f.model}`);
    }
    return { ribbons, nodes };
  }, [hot, flows, touches]);

  const amountOf = (key: string) => {
    const [ci, id] = key.split(":") as [string, string];
    const field = ci === "0" ? "project" : ci === "1" ? "feature" : "model";
    return flows.reduce(
      (s, f) => (f[field] === id ? s + Math.max(0, f.amount) : s),
      0,
    );
  };

  /* ----------------------------- summaries ------------------------------ */

  const partialDay = current?.partialThrough
    ? dayOf(current.partialThrough)
    : 0;
  const pace =
    current && partialDay > 0 ? (total * daysIn(current)) / partialDay : null;
  const prevTotal = previous
    ? previous.flows.reduce((s, f) => s + Math.max(0, f.amount), 0)
    : 0;
  const delta =
    previous && prevTotal > 0 && !current?.partialThrough
      ? Math.round(((total - prevTotal) / prevTotal) * 100)
      : null;

  const mover = React.useMemo(() => {
    if (!previous || !current) return null;
    const sumBy = (m: CostMonth) => {
      const map = new Map<string, number>();
      for (const f of m.flows)
        map.set(f.feature, (map.get(f.feature) ?? 0) + Math.max(0, f.amount));
      return map;
    };
    const a = sumBy(previous);
    const b = sumBy(current);
    let best: { id: string; d: number } | null = null;
    for (const f of features) {
      const d = (b.get(f.id) ?? 0) - (a.get(f.id) ?? 0);
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { id: f.id, d };
    }
    return best && Math.abs(best.d) > 0 ? best : null;
  }, [previous, current, features]);

  const moverLine =
    mover && previous && current
      ? mover.d > 0
        ? `${nameOf(mover.id)} ${current.partialThrough ? "is already" : "is"} ${short(mover.d)} above ${monthName(previous)}.`
        : `${nameOf(mover.id)} fell ${short(-mover.d)} on ${monthName(previous)}.`
      : null;

  /* ------------------------------- header ------------------------------- */

  const header = (
    <div className="flex flex-col gap-3 px-3 pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden
          className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--cs-wash)] text-[var(--cs-ink)] @[30rem]:inline-flex"
        >
          <Waypoints className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            id={titleId}
            title={title}
            className="truncate text-[14px] leading-5 font-semibold"
          >
            {title}
          </p>
          <p className="truncate text-[11.5px] leading-4 text-ink-3">
            {subtitle}
          </p>
        </div>
        {onExport && current ? (
          <motion.button
            type="button"
            aria-label={`Export ${monthName(current)}`}
            disabled={disabled || status !== "ready"}
            whileTap={motionSafe ? { scale: 0.96 } : undefined}
            transition={springs.flick}
            onClick={() => onExport(current.id, current.flows)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
              FOCUS,
            )}
          >
            <Download aria-hidden className="size-3.5" />
            <span className="hidden @[30rem]:inline">Export</span>
          </motion.button>
        ) : null}
      </div>
      {months.length > 0 ? (
        <div
          role="tablist"
          aria-label="Month"
          className="flex [scrollbar-width:none] gap-0.5 overflow-x-auto @[30rem]:gap-1"
          onKeyDown={(event) => {
            let next = -1;
            if (event.key === "ArrowRight")
              next = Math.min(months.length - 1, currentIndex + 1);
            else if (event.key === "ArrowLeft")
              next = Math.max(0, currentIndex - 1);
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = months.length - 1;
            else return;
            event.preventDefault();
            const m = months[next];
            if (!m) return;
            selectMonth(m);
            event.currentTarget
              .querySelector<HTMLElement>(
                `[data-cs-month="${CSS.escape(m.id)}"]`,
              )
              ?.focus();
          }}
        >
          {months.map((m) => {
            const on = m.id === current?.id;
            const t = m.flows.reduce((s, f) => s + Math.max(0, f.amount), 0);
            return (
              <button
                key={m.id}
                type="button"
                role="tab"
                data-cs-month={m.id}
                aria-selected={on}
                aria-controls={panelId}
                tabIndex={on ? 0 : -1}
                aria-disabled={disabled || undefined}
                onClick={() => selectMonth(m)}
                className={cn(
                  "relative flex h-11 min-w-14 flex-1 flex-col items-start justify-center rounded-2 px-2 text-left transition-colors @[30rem]:min-w-20 @[30rem]:flex-none @[30rem]:px-2.5",
                  on
                    ? "text-foreground"
                    : "text-ink-3 hover:bg-surface-1 hover:text-foreground",
                  FOCUS,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-tab`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 border border-[var(--cs-soft)] bg-[var(--cs-wash)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative flex items-center gap-1 text-[12px] leading-4 font-medium">
                  {m.label}
                  {m.partialThrough ? (
                    <>
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-warn"
                      />
                      <span className="sr-only">, partial</span>
                    </>
                  ) : null}
                </span>
                <span className="relative font-mono text-[10.5px] leading-4 tabular-nums opacity-80">
                  {short(t)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {status === "ready" && current ? (
        <div className="flex flex-col gap-0.5">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] text-ink-2">{monthName(current)}</span>
            <Roll
              value={total}
              format={formatMoney}
              motionSafe={motionSafe}
              className="font-mono text-[20px] leading-6 font-medium tracking-tight tabular-nums"
            />
            <span className="text-[12px] text-ink-3">
              {current.partialThrough
                ? `through day ${partialDay} · on pace for ${short(pace ?? total)}`
                : delta === null
                  ? ""
                  : `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}% on ${previous ? monthName(previous) : ""}`}
            </span>
          </p>
          {moverLine ? (
            <p className="truncate text-[12px] text-ink-3" title={moverLine}>
              {moverLine}
            </p>
          ) : null}
        </div>
      ) : null}
      {isolated && status === "ready" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => isolate(null)}
            aria-label={`Show every flow, not only ${nameOf(isolated)}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--cs-soft)] bg-[var(--cs-wash)] pr-2 pl-2.5 text-[12px] font-medium text-[var(--cs-ink)]",
              FOCUS,
            )}
          >
            {`Only ${nameOf(isolated)} · ${short(shownTotal)}`}
            <X aria-hidden className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );

  /* -------------------------------- flow -------------------------------- */

  const columns: [CostNode[], CostNode[], CostNode[]] = [
    projects,
    features,
    models,
  ];
  const partial = !!current?.partialThrough;
  const empty = total <= 0;

  const nodeColor = (ci: number, id: string) =>
    ci === 0
      ? (colorOf.get(id) ?? "var(--cs-ink)")
      : ci === 1
        ? (colorOf.get(featureProject.get(id) ?? "") ?? "var(--cs-ink)")
        : "var(--ink-2)";

  const flow = (
    <div
      ref={setPlotNode}
      className="relative hidden w-full @[36rem]:block"
      style={{ height: H }}
      onPointerLeave={() => setHot(null)}
    >
      <svg
        aria-hidden
        width="100%"
        height={H}
        className="absolute inset-0 block overflow-visible"
      >
        <g>
          {ribbonIds.map((id) => {
            const g = geo.ribbons[id];
            if (!g) return null;
            const [x0, x1] = ribbonX(id);
            const parts = id.split(":");
            const color = id.startsWith("L:")
              ? (colorOf.get(parts[1] ?? "") ?? "var(--cs-ink)")
              : (colorOf.get(featureProject.get(parts[1] ?? "") ?? "") ??
                "var(--cs-ink)");
            const lit = connected ? connected.ribbons.has(id) : null;
            return (
              <path
                key={id}
                ref={(el) => {
                  if (el) ribbonEls.current.set(id, el);
                  else ribbonEls.current.delete(id);
                }}
                d={ribbonPath(x0, x1, g, curvature)}
                strokeWidth={lit ? 1 : 0.75}
                strokeDasharray={partial ? "3 3" : undefined}
                style={{
                  fill: color,
                  stroke: color,
                  fillOpacity: lit === null ? 0.42 : lit ? 0.7 : 0.08,
                  strokeOpacity:
                    lit === null ? (partial ? 0.45 : 0) : lit ? 0.95 : 0,
                  transition:
                    "fill-opacity 200ms ease-out, stroke-opacity 200ms ease-out",
                }}
              />
            );
          })}
        </g>
        {columns.map((col, ci) =>
          col.map((n) => {
            const key = `${ci}:${n.id}`;
            const g = geo.nodes[key];
            if (!g) return null;
            const x = ci === 0 ? xs.p : ci === 1 ? xs.f : xs.m;
            const lit = connected ? connected.nodes.has(key) : null;
            return (
              <rect
                key={key}
                ref={(el) => {
                  if (el) barEls.current.set(key, el);
                  else barEls.current.delete(key);
                }}
                x={x}
                y={r2(g.y)}
                width={nodeW}
                height={r2(Math.max(0, g.h))}
                rx={Math.min(2, nodeW / 2)}
                onPointerEnter={() => setHot(n.id)}
                onClick={() => isolate(n.id)}
                className="cursor-pointer"
                style={{
                  fill: nodeColor(ci, n.id),
                  opacity: lit === false ? 0.3 : 1,
                  transition: "opacity 200ms ease-out",
                }}
              />
            );
          }),
        )}
      </svg>
      {empty ? (
        <p className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-3">
          {`No spend in ${current ? monthName(current) : "this month"}`}
        </p>
      ) : null}
      {columns.map((col, ci) =>
        col.map((n) => {
          const key = `${ci}:${n.id}`;
          const g = geo.nodes[key];
          if (!g) return null;
          const amount = amountOf(key);
          const visible = amount > 0;
          const lit = connected ? connected.nodes.has(key) : null;
          const share = total > 0 ? Math.round((amount / total) * 100) : 0;
          const pos: React.CSSProperties =
            ci === 0
              ? { left: 0, width: xs.p - 6, justifyContent: "flex-end" }
              : ci === 1
                ? {
                    left: xs.f + nodeW + 6,
                    maxWidth: Math.max(80, xs.m - xs.f - nodeW - 14),
                  }
                : { left: xs.m + nodeW + 6, right: 0 };
          return (
            <button
              key={key}
              ref={(el) => {
                if (el) labelEls.current.set(key, el);
                else labelEls.current.delete(key);
              }}
              type="button"
              tabIndex={visible ? 0 : -1}
              aria-hidden={!visible || undefined}
              aria-pressed={isolated === n.id}
              aria-label={`${n.name}, ${KINDS[ci]}, ${formatMoney(amount)}, ${share}% of ${current ? monthName(current) : "the month"}`}
              aria-describedby={hintId}
              onFocus={() => setHot(n.id)}
              onBlur={() => setHot(null)}
              onPointerEnter={() => setHot(n.id)}
              onClick={() => isolate(n.id)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && isolated) {
                  event.preventDefault();
                  isolate(null);
                }
              }}
              className={cn(
                "absolute top-0 flex items-center gap-1.5 rounded-1 px-1 whitespace-nowrap",
                ci === 1 && "bg-[var(--cs-chip)]",
                FOCUS,
              )}
              style={{
                ...pos,
                height: LABEL_H,
                transform: `translateY(${r2(g.y + g.h / 2 - LABEL_H / 2)}px)`,
                opacity: !visible ? 0 : lit === false ? 0.35 : 1,
                pointerEvents: visible ? "auto" : "none",
                transition: "opacity 200ms ease-out",
              }}
            >
              <span className="truncate text-[12px] leading-4 font-medium text-foreground">
                {n.name}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] leading-4 text-ink-3 tabular-nums">
                {short(amount)}
              </span>
            </button>
          );
        }),
      )}
    </div>
  );

  /* --------------------------- nested list ------------------------------ */

  const barT = motionSafe ? springs.glide : { duration: 0 };
  const listRow = (
    id: string,
    kind: CostNodeKind,
    amount: number,
    color: string,
    depth: number,
  ) => {
    const node = [...projects, ...features, ...models].find((n) => n.id === id);
    const share = total > 0 ? amount / total : 0;
    const dim = isolated !== null && amount <= 0;
    return (
      <button
        type="button"
        aria-pressed={isolated === id}
        aria-label={`${node?.name ?? id}, ${kind}, ${formatMoney(amount)}, ${Math.round(share * 100)}% of ${current ? monthName(current) : "the month"}`}
        onClick={() => isolate(id)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && isolated) {
            event.preventDefault();
            isolate(null);
          }
        }}
        className={cn(
          "flex w-full flex-col gap-1 rounded-2 px-2 py-1.5 text-left transition-[background-color,opacity] hover:bg-surface-1",
          isolated === id && "bg-[var(--cs-wash)]",
          dim && "opacity-40",
          FOCUS,
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <span className="flex w-full items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate leading-5",
              depth === 0
                ? "text-[13px] font-medium"
                : "text-[12px] text-ink-2",
            )}
          >
            {node?.name ?? id}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-foreground tabular-nums">
            {short(amount)}
          </span>
        </span>
        <span
          aria-hidden
          className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            className="block h-full w-full rounded-full"
            initial={false}
            animate={{ scaleX: Number(clamp(share, 0, 1).toFixed(3)) }}
            transition={barT}
            style={{ originX: 0, backgroundColor: color }}
          />
        </span>
      </button>
    );
  };

  const list = (
    <div className="flex flex-col gap-3 @[36rem]:hidden">
      {empty ? (
        <p className="px-2 py-6 text-center text-[13px] text-ink-3">
          {`No spend in ${current ? monthName(current) : "this month"}`}
        </p>
      ) : null}
      <ul
        className="flex flex-col gap-1"
        aria-label="Projects and their features"
      >
        {projects.map((p) => {
          const amount = amountOf(`0:${p.id}`);
          const own = features.filter(
            (f) => (featureProject.get(f.id) ?? "") === p.id,
          );
          return (
            <li key={p.id} className="flex flex-col gap-0.5">
              {listRow(
                p.id,
                "project",
                amount,
                colorOf.get(p.id) ?? "var(--cs-ink)",
                0,
              )}
              <ul className="flex flex-col">
                {own.map((f) => {
                  const fa = amountOf(`1:${f.id}`);
                  return (
                    <li key={f.id}>
                      {listRow(
                        f.id,
                        "feature",
                        fa,
                        colorOf.get(p.id) ?? "var(--cs-ink)",
                        1,
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1 border-t border-hairline pt-2">
        <p className="px-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          Billed to
        </p>
        <ul className="flex flex-col">
          {models.map((m) => (
            <li key={m.id}>
              {listRow(m.id, "model", amountOf(`2:${m.id}`), "var(--ink-2)", 0)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );

  /* -------------------------------- body -------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-hidden
        className="flex items-center justify-between gap-6 px-6 py-8"
        style={{ height: H }}
      >
        {[0, 1, 2].map((c) => (
          <div key={c} className="flex h-full w-2.5 flex-col gap-3">
            {[0.3, 0.2, 0.35].map((f, i) => (
              <span
                key={i}
                className="w-full rounded-1 bg-surface-2"
                style={{ height: `${f * 100}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 px-3 py-6">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-danger">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          Spend couldn’t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div
        id={panelId}
        role="tabpanel"
        aria-label={current ? `${monthName(current)} spend` : "Spend"}
        className="flex flex-col gap-2 px-3 pb-3"
      >
        {partial ? (
          <p className="flex items-start gap-1.5 text-[11.5px] leading-4 text-ink-3">
            <span
              aria-hidden
              className="mt-[5px] size-1.5 shrink-0 rounded-full bg-warn"
            />
            {`Partial month · data through ${current?.label ?? ""} ${partialDay} · dashed streams may still grow`}
          </p>
        ) : null}
        {flow}
        {list}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container flex max-h-[36rem] w-full [scrollbar-width:thin] flex-col gap-3 overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      {header}
      {body}
      <p id={hintId} className="sr-only">
        Enter shows only the flows through this node; Escape shows every flow.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
