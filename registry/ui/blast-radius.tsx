"use client";

import * as React from "react";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  BookOpen,
  Check,
  CornerDownRight,
  Crosshair,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BlastHealth = "healthy" | "degraded" | "down";

export type BlastService = {
  id: string;
  name: string;
  /** The team that owns it. */
  team: string;
  health: BlastHealth;
  /** Requests a second it serves. */
  rps: number;
};

export type BlastEdge = {
  /** The caller. */
  from: string;
  /** The service it leans on. If `to` falls over, `from` feels it. */
  to: string;
  /** Requests a second along this call: drawn as line weight. */
  traffic: number;
};

export type BlastStatus = "ready" | "loading" | "error";
export type BlastDirection = "right" | "down";
export type BlastShape = "pill" | "dot" | "card";

export type BlastRadiusProps = {
  /** The services on the map. @default defaultBlastServices */
  services?: BlastService[];
  /** Who calls whom. @default defaultBlastEdges */
  edges?: BlastEdge[];
  /** Controlled selection: the service asked about, or null. */
  value?: string | null;
  /** Initial selection when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click or key that changed the selection. */
  onValueChange?: (id: string | null) => void;
  /** Fires with the selected service and every service its fall would reach. */
  onSelect?: (service: BlastService | null, impacted: BlastService[]) => void;
  /** Acknowledge was pressed for the selected service. */
  onAcknowledge?: (service: BlastService, impacted: BlastService[]) => void;
  /** Open runbook was pressed for the selected service. */
  onOpenRunbook?: (service: BlastService) => void;
  /** Whether the map's data has arrived. @default "ready" */
  status?: BlastStatus;
  /** When the map's data was fetched, in ms; an error shows its age. @default six minutes before `now` */
  updatedAt?: number;
  /** The moment ages count from, in ms — never read from the clock. @default defaultBlastNow */
  now?: number;
  /** Retry was pressed after a failed refresh. */
  onRetry?: () => void;
  /** Layers run left to right, or top to bottom. @default "right" */
  layoutDirection?: BlastDirection;
  /** How long the blast takes to cross one hop, in ms. @default 400 */
  ringSpeed?: number;
  /** How a service is drawn: a pill, a dot with its name, or a small card. @default "pill" */
  nodeShape?: BlastShape;
  /** The heading and the map's accessible name. @default "Service map" */
  title?: string;
  /** Height of the surface in px. @default 540 */
  height?: number;
  /** Nothing can be selected or acknowledged. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Friday 9 October 2026, 09:12 UTC. */
export const defaultBlastNow = Date.UTC(2026, 9, 9, 9, 12);

export const defaultBlastServices: BlastService[] = [
  {
    id: "web",
    name: "Waylight web",
    team: "Storefront",
    health: "healthy",
    rps: 2400,
  },
  {
    id: "app",
    name: "Waylight app",
    team: "Storefront",
    health: "healthy",
    rps: 1800,
  },
  {
    id: "api",
    name: "Waylight API",
    team: "Platform",
    health: "healthy",
    rps: 4200,
  },
  {
    id: "auth",
    name: "Gaugeworks auth",
    team: "Identity",
    health: "healthy",
    rps: 3900,
  },
  {
    id: "search",
    name: "Fieldline search",
    team: "Discovery",
    health: "healthy",
    rps: 1300,
  },
  {
    id: "billing",
    name: "Coldbrook billing",
    team: "Payments",
    health: "degraded",
    rps: 620,
  },
  {
    id: "notify",
    name: "Waylight notify",
    team: "Messaging",
    health: "healthy",
    rps: 310,
  },
  {
    id: "cache",
    name: "Basinworks cache",
    team: "Platform",
    health: "healthy",
    rps: 5200,
  },
  {
    id: "index",
    name: "Fieldline index",
    team: "Discovery",
    health: "healthy",
    rps: 900,
  },
  {
    id: "queue",
    name: "Basinworks queue",
    team: "Platform",
    health: "down",
    rps: 1180,
  },
  {
    id: "ledger",
    name: "Fernworks ledger",
    team: "Payments",
    health: "healthy",
    rps: 540,
  },
];

export const defaultBlastEdges: BlastEdge[] = [
  { from: "web", to: "api", traffic: 2400 },
  { from: "app", to: "api", traffic: 1800 },
  { from: "api", to: "auth", traffic: 3900 },
  { from: "api", to: "search", traffic: 1300 },
  { from: "api", to: "billing", traffic: 620 },
  { from: "api", to: "notify", traffic: 310 },
  { from: "search", to: "index", traffic: 900 },
  { from: "search", to: "cache", traffic: 1200 },
  { from: "api", to: "cache", traffic: 2600 },
  { from: "billing", to: "queue", traffic: 600 },
  { from: "billing", to: "ledger", traffic: 540 },
  { from: "notify", to: "queue", traffic: 300 },
  { from: "auth", to: "cache", traffic: 1400 },
];

/* ----------------------------------------------------------------------- */
/*                                  Layout                                  */
/* ----------------------------------------------------------------------- */

type Placed = { id: string; layer: number; slot: number; count: number };

/**
 * Tidy layers: each service sits one layer after its furthest caller
 * (longest path), then three barycentre sweeps reorder every layer by where
 * its neighbours sit, which untangles most crossings. Deterministic, so the
 * server and the browser draw the same map.
 */
function layout(services: BlastService[], edges: BlastEdge[]) {
  const ids = services.map((s) => s.id);
  const known = new Set(ids);
  const valid = edges.filter(
    (e) => known.has(e.from) && known.has(e.to) && e.from !== e.to,
  );
  const layer = new Map(ids.map((id) => [id, 0]));
  // Relax n times: enough for any acyclic graph, and a cycle cannot hang it.
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false;
    for (const e of valid) {
      const next = (layer.get(e.from) ?? 0) + 1;
      if (next > (layer.get(e.to) ?? 0) && next < ids.length) {
        layer.set(e.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const depth = Math.max(0, ...layer.values()) + 1;
  const rows: string[][] = Array.from({ length: depth }, () => []);
  for (const id of ids) rows[layer.get(id) ?? 0]?.push(id);
  const at = (id: string) => {
    const l = layer.get(id) ?? 0;
    const row = rows[l] ?? [];
    return row.length <= 1 ? 0.5 : row.indexOf(id) / (row.length - 1);
  };
  const order = (l: number, neighbours: (id: string) => string[]) => {
    const row = rows[l];
    if (!row) return;
    const score = new Map(
      row.map((id, i) => {
        const ns = neighbours(id);
        return [
          id,
          ns.length
            ? ns.reduce((t, n) => t + at(n), 0) / ns.length
            : i / Math.max(1, row.length - 1),
        ];
      }),
    );
    row.sort(
      (a, b) =>
        (score.get(a) ?? 0) - (score.get(b) ?? 0) ||
        ids.indexOf(a) - ids.indexOf(b),
    );
  };
  for (let sweep = 0; sweep < 3; sweep += 1) {
    for (let l = 1; l < depth; l += 1) {
      order(l, (id) => valid.filter((e) => e.to === id).map((e) => e.from));
    }
    for (let l = depth - 2; l >= 0; l -= 1) {
      order(l, (id) => valid.filter((e) => e.from === id).map((e) => e.to));
    }
  }
  const placed = new Map<string, Placed>();
  rows.forEach((row, l) =>
    row.forEach((id, slot) =>
      placed.set(id, { id, layer: l, slot, count: row.length }),
    ),
  );
  return { placed, depth, rows, edges: valid };
}

/** Breadth-first up the calls: who feels it, and how many hops away. */
function blast(source: string | null, edges: BlastEdge[]) {
  const hops = new Map<string, number>();
  if (!source) return hops;
  hops.set(source, 0);
  let frontier = [source];
  let hop = 0;
  while (frontier.length > 0) {
    hop += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges) {
        if (e.to === id && !hops.has(e.from)) {
          hops.set(e.from, hop);
          next.push(e.from);
        }
      }
    }
    frontier = next;
  }
  return hops;
}

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

const HEALTH: Record<BlastHealth, { word: string; dot: string; text: string }> =
  {
    healthy: {
      word: "healthy",
      dot: "oklch(from var(--success) 0.7 0.13 h)",
      text: "text-success",
    },
    degraded: {
      word: "degraded",
      dot: "oklch(from var(--warn) 0.78 0.14 h)",
      text: "text-warn",
    },
    down: {
      word: "down",
      dot: "oklch(from var(--danger) 0.64 0.2 h)",
      text: "text-danger",
    },
  };

const DANGER = "oklch(from var(--danger) 0.64 0.2 h)";
const WHAT_IF = "oklch(from var(--accent-bright) 0.64 0.17 h)";

const SHAPE: Record<BlastShape, { w: number; h: number }> = {
  pill: { w: 132, h: 28 },
  dot: { w: 112, h: 34 },
  card: { w: 148, h: 46 },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const r2 = (v: number) => Math.round(v * 100) / 100;

const rate = (rps: number) =>
  rps >= 1000 ? `${(rps / 1000).toFixed(1)}k` : String(Math.round(rps));

function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

type Point = { x: number; y: number };

/** The control points of an edge's curve, from `a` to `b`, along the layout. */
function curve(a: Point, b: Point, dir: BlastDirection) {
  if (dir === "right") {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b] as const;
  }
  const my = (a.y + b.y) / 2;
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b] as const;
}

const pathOf = (a: Point, b: Point, dir: BlastDirection) => {
  const [p0, p1, p2, p3] = curve(a, b, dir);
  return `M ${r2(p0.x)} ${r2(p0.y)} C ${r2(p1.x)} ${r2(p1.y)} ${r2(p2.x)} ${r2(p2.y)} ${r2(p3.x)} ${r2(p3.y)}`;
};

function pointOn(a: Point, b: Point, dir: BlastDirection, t: number): Point {
  const [p0, p1, p2, p3] = curve(a, b, dir);
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return {
    x: r2(w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x),
    y: r2(w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y),
  };
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** The blast running along one edge: a dot that travels the curve once. */
function Pulse({
  from,
  to,
  dir,
  duration,
  colour,
}: {
  from: Point;
  to: Point;
  dir: BlastDirection;
  duration: number;
  colour: string;
}) {
  const ref = React.useRef<SVGCircleElement | null>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const controls = animate(0, 1, {
      duration,
      ease: easings.enter,
      onUpdate: (t) => {
        const p = pointOn(from, to, dir, t);
        node.setAttribute("cx", String(p.x));
        node.setAttribute("cy", String(p.y));
        node.setAttribute("opacity", String(r2(t < 0.85 ? 1 : (1 - t) / 0.15)));
      },
    });
    // A re-run (StrictMode) finishes this pass; the next run travels again.
    return () => controls.complete();
  }, [from, to, dir, duration]);
  return (
    <circle
      ref={ref}
      cx={from.x}
      cy={from.y}
      r={3.5}
      opacity={0}
      style={{ fill: colour }}
    />
  );
}

function RolledCount({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const mv = useMotionValue(value);
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, springs.snap);
    return () => controls.stop();
  }, [value, motionSafe, mv]);
  const text = useTransform(mv, (v) => String(Math.max(0, Math.round(v))));
  return <motion.span className={className}>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                 The map                                  */
/* ----------------------------------------------------------------------- */

/**
 * A service dependency map that answers "if this falls over, who feels it?"
 * Services sit in tidy layers computed from the calls between them — callers
 * first, the things they lean on further along — and every call is a curve
 * whose weight is its traffic.
 *
 * Selecting a service runs the blast backwards up the calls, one hop every
 * `ringSpeed`: a pulse travels each edge to the caller, and as it lands the
 * caller takes the impact tint and throws one ring that widens on drift and
 * fades, while the impacted count rolls on snap and the hop's rows rise into
 * the list on glide. Everything the blast never reaches dims. A service that
 * is down blasts in danger; a healthy one plays a what-if in the accent, so
 * exploring is safe to look at. Then it all settles; nothing loops.
 *
 * Every service is a button in the tab order, layer by layer; arrows move
 * across the map along its layout, Enter or Space selects and Escape clears.
 * A fetch error keeps the last map with its age, loading draws faint outlines
 * where the services will be, and below a 30rem container the map becomes an
 * indented tree of hops. Under reduced motion nothing travels or rings: the
 * hops still light in order, with fades, because the order is information.
 */
export function BlastRadius({
  services = defaultBlastServices,
  edges = defaultBlastEdges,
  value,
  defaultValue = null,
  onValueChange,
  onSelect,
  onAcknowledge,
  onOpenRunbook,
  status = "ready",
  updatedAt,
  now = defaultBlastNow,
  onRetry,
  layoutDirection = "right",
  ringSpeed = 400,
  nodeShape = "pill",
  title = "Service map",
  height = 540,
  disabled = false,
  className,
}: BlastRadiusProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const dir: BlastDirection = layoutDirection === "down" ? "down" : "right";
  const shape = SHAPE[nodeShape] ?? SHAPE.pill;
  const hopMs = Math.round(Math.min(2000, Math.max(120, ringSpeed)));
  const fetched = updatedAt ?? now - 6 * MIN;
  const ready = status === "ready";

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const selectedRaw = value !== undefined ? value : own;
  const byId = React.useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );
  const selected = selectedRaw && byId.has(selectedRaw) ? selectedRaw : null;
  const source = selected ? byId.get(selected) : undefined;

  const map = React.useMemo(() => layout(services, edges), [services, edges]);
  const hops = React.useMemo(() => blast(selected, map.edges), [selected, map]);
  const maxHop = Math.max(0, ...hops.values());
  const impacted = services.filter((s) => (hops.get(s.id) ?? 0) > 0);
  const tint = source?.health === "down" ? DANGER : WHAT_IF;
  const maxTraffic = Math.max(1, ...map.edges.map((e) => e.traffic));

  /* ------------------------------ measuring ------------------------------ */

  const [box, setBox] = React.useState({ w: 680, h: 300 });
  const [mapNode, setMapNode] = React.useState<HTMLDivElement | null>(null);
  React.useLayoutEffect(() => {
    if (!mapNode) return;
    const measure = () => {
      const w = Math.round(mapNode.clientWidth);
      const h = Math.round(mapNode.clientHeight);
      if (w > 0 && h > 0) {
        setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(mapNode);
    return () => ro.disconnect();
  }, [mapNode]);

  const pos = (id: string): Point => {
    const p = map.placed.get(id);
    if (!p) return { x: box.w / 2, y: box.h / 2 };
    const along = map.depth <= 1 ? 0.5 : p.layer / (map.depth - 1);
    const across = p.count <= 1 ? 0.5 : p.slot / (p.count - 1);
    const padX = shape.w / 2 + 10;
    const padY = shape.h / 2 + (nodeShape === "dot" ? 4 : 10);
    if (dir === "right") {
      return {
        x: Math.round(padX + along * Math.max(0, box.w - 2 * padX)),
        y: Math.round(padY + across * Math.max(0, box.h - 2 * padY)),
      };
    }
    return {
      x: Math.round(padX + across * Math.max(0, box.w - 2 * padX)),
      y: Math.round(padY + along * Math.max(0, box.h - 2 * padY)),
    };
  };

  /* ---------------------------- the choreography -------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { amount: 0.2 });
  const [run, setRun] = React.useState(0);
  // Every new selection — a press here or the host's own — is a new run.
  const [seenSelection, setSeenSelection] = React.useState(selected);
  if (seenSelection !== selected) {
    setSeenSelection(selected);
    setRun((r) => r + 1);
  }
  const [lit, setLit] = React.useState(() => ({ run: 0, hop: -1 }));
  // The source lights the moment the map is seen; each hop after it lands on
  // its own timer.
  const shownHop =
    lit.run === run
      ? lit.hop
      : selected !== null && inView && status === "ready"
        ? 0
        : -1;
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  // The blast plays once per selection, and only when the map can be seen.
  React.useEffect(() => {
    if (!selected || !inView || !ready) return;
    const timers: number[] = [];
    for (let h = 1; h <= maxHop; h += 1) {
      timers.push(window.setTimeout(() => setLit({ run, hop: h }), h * hopMs));
    }
    timers.push(
      window.setTimeout(
        () => {
          const name = byId.get(selected)?.name ?? selected;
          const n = [...hops.values()].filter((h) => h > 0).length;
          setSaid((s) => ({
            n: s.n + 1,
            text:
              n === 0
                ? `${name} selected. Nothing calls it.`
                : `${name} selected. ${plural(n, "service", "services")} impacted across ${plural(maxHop, "hop", "hops")}.`,
          }));
        },
        maxHop * hopMs + 60,
      ),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [selected, run, inView, ready, maxHop, hopMs, hops, byId]);

  const done = selected !== null && shownHop >= maxHop;
  const isLit = (id: string) => {
    const h = hops.get(id);
    return h !== undefined && h <= shownHop;
  };
  const counted = impacted.filter((s) => isLit(s.id)).length;

  /* ------------------------------- actions ------------------------------- */

  const [acked, setAcked] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const choose = (id: string | null) => {
    if (disabled || !ready) return;
    if (value === undefined) setOwn(id);
    onValueChange?.(id);
    const service = id ? (byId.get(id) ?? null) : null;
    const reach = id
      ? [...blast(id, map.edges).entries()]
          .filter(([, h]) => h > 0)
          .map(([s]) => byId.get(s))
          .filter((s): s is BlastService => s !== undefined)
      : [];
    if (!id) setSaid((s) => ({ n: s.n + 1, text: "Selection cleared." }));
    onSelect?.(service, reach);
  };

  const nodeRefs = React.useRef(new Map<string, HTMLElement>());
  const order = map.rows.flat();

  const onNodeKey = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    const p = map.placed.get(id);
    if (!p) return;
    const keyAlong =
      dir === "right"
        ? { next: "ArrowRight", prev: "ArrowLeft" }
        : { next: "ArrowDown", prev: "ArrowUp" };
    const keyAcross =
      dir === "right"
        ? { next: "ArrowDown", prev: "ArrowUp" }
        : { next: "ArrowRight", prev: "ArrowLeft" };
    let target: string | undefined;
    if (event.key === keyAlong.next || event.key === keyAlong.prev) {
      const l = p.layer + (event.key === keyAlong.next ? 1 : -1);
      const row = map.rows[l];
      if (row && row.length > 0) {
        const here = p.count <= 1 ? 0.5 : p.slot / (p.count - 1);
        target = [...row].sort((a, b) => {
          const pa = map.placed.get(a);
          const pb = map.placed.get(b);
          const fa = pa && pa.count > 1 ? pa.slot / (pa.count - 1) : 0.5;
          const fb = pb && pb.count > 1 ? pb.slot / (pb.count - 1) : 0.5;
          return Math.abs(fa - here) - Math.abs(fb - here);
        })[0];
      }
    } else if (event.key === keyAcross.next || event.key === keyAcross.prev) {
      const row = map.rows[p.layer] ?? [];
      target = row[p.slot + (event.key === keyAcross.next ? 1 : -1)];
    } else if (event.key === "Home") {
      target = order[0];
    } else if (event.key === "End") {
      target = order[order.length - 1];
    } else if (event.key === "Escape") {
      if (selected) {
        // Ours: the selection clears, and nothing around the map closes.
        event.preventDefault();
        choose(null);
      }
      return;
    } else {
      return;
    }
    event.preventDefault();
    if (target) nodeRefs.current.get(target)?.focus();
  };

  /* -------------------------------- render ------------------------------- */

  const loading = status === "loading";
  const failed = status === "error";
  const callers = (id: string) => map.edges.filter((e) => e.to === id).length;

  const nodeLabel = (s: BlastService) =>
    `${s.name}, ${HEALTH[s.health]?.word ?? s.health}, ${s.rps.toLocaleString("en-US")} requests a second, ${plural(callers(s.id), "caller", "callers")}`;

  const edgeLayer = (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-visible"
      width={box.w}
      height={box.h}
      viewBox={`0 0 ${box.w} ${box.h}`}
    >
      {map.edges.map((e) => {
        const a = pos(e.from);
        const b = pos(e.to);
        const hFrom = hops.get(e.from);
        const hTo = hops.get(e.to);
        const onPath =
          hFrom !== undefined && hTo !== undefined && hFrom === hTo + 1;
        const litEdge = onPath && (hFrom ?? 0) <= shownHop;
        const dim = selected !== null && !litEdge;
        const w = r2(1 + (4 * e.traffic) / maxTraffic);
        return (
          <path
            key={`${e.from}-${e.to}`}
            d={pathOf(a, b, dir)}
            fill="none"
            strokeLinecap="round"
            className={cn(
              "transition-[stroke,opacity,stroke-width] duration-300",
              litEdge ? "" : "stroke-ink-3",
            )}
            style={{
              stroke: litEdge ? tint : undefined,
              strokeWidth: litEdge ? r2(w + 1) : w,
              opacity: loading ? 0.15 : dim ? 0.18 : litEdge ? 0.9 : 0.42,
            }}
          />
        );
      })}
      {motionSafe && selected && !loading
        ? map.edges.map((e) => {
            const hFrom = hops.get(e.from);
            const hTo = hops.get(e.to);
            if (hFrom === undefined || hTo === undefined || hFrom !== hTo + 1)
              return null;
            // The pulse for hop h runs while the blast is crossing to it.
            if (shownHop !== hFrom - 1) return null;
            return (
              <Pulse
                key={`${run}-${e.from}-${e.to}`}
                from={pos(e.to)}
                to={pos(e.from)}
                dir={dir}
                duration={(hopMs / 1000) * 0.92}
                colour={tint}
              />
            );
          })
        : null}
      {motionSafe && selected && !loading
        ? services.map((s) => {
            if (!isLit(s.id)) return null;
            const p = pos(s.id);
            const base = nodeShape === "dot" ? 7 : shape.h / 2 + 2;
            return (
              <motion.circle
                key={`${run}-${s.id}`}
                cx={p.x}
                cy={p.y}
                fill="none"
                strokeWidth={1.5}
                style={{ stroke: tint }}
                initial={{ r: base, opacity: 0.6 }}
                animate={{ r: base + 26, opacity: 0 }}
                transition={{
                  r: springs.drift,
                  opacity: { duration: durations.page, ease: easings.enter },
                }}
              />
            );
          })
        : null}
    </svg>
  );

  const node = (s: BlastService) => {
    const p = pos(s.id);
    const h = HEALTH[s.health] ?? HEALTH.healthy;
    const isSource = s.id === selected;
    const hit = isLit(s.id);
    const dim = selected !== null && !hit && !isSource;
    const impactWash = `color-mix(in oklab, ${tint} 14%, var(--card))`;
    if (loading) {
      return (
        <span
          key={s.id}
          aria-hidden
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2 border border-dashed border-hairline-strong",
            nodeShape === "dot"
              ? "size-3 rounded-full"
              : nodeShape === "pill"
                ? "rounded-full"
                : "rounded-3",
          )}
          style={{
            left: p.x,
            top: p.y,
            width: nodeShape === "dot" ? undefined : shape.w - 16,
            height: nodeShape === "dot" ? undefined : shape.h,
          }}
        />
      );
    }
    return (
      <motion.button
        key={s.id}
        ref={(el: HTMLButtonElement | null) => {
          if (el) nodeRefs.current.set(s.id, el);
          else nodeRefs.current.delete(s.id);
        }}
        type="button"
        aria-pressed={isSource}
        aria-label={nodeLabel(s)}
        aria-describedby={hintId}
        aria-disabled={disabled || undefined}
        onClick={() => choose(isSource ? null : s.id)}
        onKeyDown={(event) => onNodeKey(event, s.id)}
        whileHover={motionSafe && !disabled ? { scale: 1.04 } : undefined}
        whileFocus={motionSafe ? { scale: 1.04 } : undefined}
        transition={motionSafe ? springs.flick : { duration: 0 }}
        className={cn(
          "absolute z-[2] -translate-x-1/2 -translate-y-1/2 transition-[opacity,background-color,border-color,box-shadow] duration-300",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          // The box stays opaque so dimmed services still hide the calls
          // behind them; only what is drawn inside it fades.
          dim && "[&>*]:opacity-35",
          nodeShape === "dot"
            ? "flex flex-col items-center gap-1 rounded-2 px-1 pt-0.5"
            : nodeShape === "pill"
              ? "inline-flex h-7 max-w-[8.5rem] items-center gap-1.5 rounded-full border bg-card px-2.5 shadow-[0_2px_8px_color-mix(in_oklab,black_8%,transparent)]"
              : "flex w-[9.25rem] flex-col rounded-3 border bg-card px-2.5 py-1.5 text-left shadow-[0_2px_10px_color-mix(in_oklab,black_8%,transparent)]",
          nodeShape !== "dot" &&
            (isSource || hit ? "border-transparent" : "border-hairline-strong"),
          FOCUS_RING,
        )}
        style={{
          left: p.x,
          top: p.y,
          backgroundColor:
            nodeShape !== "dot" && (isSource || hit) ? impactWash : undefined,
          boxShadow:
            nodeShape !== "dot" && isSource
              ? `0 0 0 2px ${tint}, 0 4px 14px color-mix(in oklab, black 12%, transparent)`
              : nodeShape !== "dot" && hit
                ? `0 0 0 1px ${tint}`
                : undefined,
        }}
      >
        {nodeShape === "dot" ? (
          <>
            <span
              aria-hidden
              className="size-3 rounded-full"
              style={{
                backgroundColor: hit || isSource ? tint : h.dot,
                boxShadow: isSource
                  ? `0 0 0 3px var(--card), 0 0 0 5px ${tint}`
                  : undefined,
              }}
            />
            <span className="rounded-1 bg-card/85 px-1 text-[11px] leading-4 font-medium whitespace-nowrap text-foreground">
              {s.name}
            </span>
          </>
        ) : nodeShape === "pill" ? (
          <>
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: h.dot }}
            />
            <span className="truncate text-[11px] font-medium text-foreground">
              {s.name}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: h.dot }}
              />
              <span className="truncate text-[12px] font-medium text-foreground">
                {s.name}
              </span>
            </span>
            <span className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
              {s.team} · {rate(s.rps)} rps
            </span>
          </>
        )}
      </motion.button>
    );
  };

  /* ------------------------------ hop list ------------------------------- */

  const byHop: BlastService[][] = [];
  for (const s of impacted) {
    const h = hops.get(s.id) ?? 0;
    (byHop[h - 1] ??= []).push(s);
  }

  const panel = (
    <div className="flex h-full flex-col">
      {source ? (
        <>
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5 @min-[56rem]:block @min-[56rem]:py-3">
            <p className="flex items-baseline gap-2 @min-[56rem]:justify-between">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                Impacted
              </span>
              <RolledCount
                value={counted}
                motionSafe={motionSafe}
                className="font-mono text-[16px] leading-6 font-medium tabular-nums @min-[56rem]:text-[20px]"
              />
            </p>
            <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-foreground @min-[56rem]:mt-1">
              <Crosshair
                aria-hidden
                className="size-3.5 shrink-0"
                style={{ color: tint }}
              />
              <span className="truncate">
                {source.name}{" "}
                <span
                  className={cn("text-[11px]", HEALTH[source.health]?.text)}
                >
                  {source.health === "down" ? "is down" : "what if"}
                </span>
              </span>
            </p>
            <div className="ml-auto flex flex-wrap gap-1.5 @min-[56rem]:mt-2.5 @min-[56rem]:ml-0">
              <button
                type="button"
                aria-disabled={acked.has(source.id) || disabled || undefined}
                onClick={() => {
                  if (acked.has(source.id) || disabled) return;
                  setAcked((a) => new Set(a).add(source.id));
                  setSaid((s) => ({
                    n: s.n + 1,
                    text: `${source.name} acknowledged.`,
                  }));
                  onAcknowledge?.(source, impacted);
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-[12px] font-medium transition-opacity",
                  acked.has(source.id)
                    ? "border border-hairline text-success"
                    : "bg-primary text-primary-foreground hover:opacity-90",
                  FOCUS_RING,
                )}
              >
                <Check aria-hidden className="size-3.5" />
                {acked.has(source.id) ? "Acknowledged" : "Acknowledge"}
              </button>
              <button
                type="button"
                aria-disabled={disabled || undefined}
                onClick={() => {
                  if (!disabled) onOpenRunbook?.(source);
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <BookOpen aria-hidden className="size-3.5" />
                Runbook
              </button>
            </div>
          </div>
          <ol className="flex flex-1 [scrollbar-width:thin] gap-6 overflow-x-auto overscroll-contain px-4 py-2 @min-[56rem]:flex-col @min-[56rem]:gap-0 @min-[56rem]:overflow-x-hidden @min-[56rem]:overflow-y-auto">
            {byHop.map((group, i) => {
              const hop = i + 1;
              if (hop > shownHop) return null;
              return (
                <motion.li
                  key={`${run}-${hop}`}
                  className="w-40 shrink-0 py-1.5 @min-[56rem]:w-auto"
                  initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.glide,
                          opacity: { duration: durations.base },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <p className="mb-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                    Hop {hop} · {plural(group.length, "service", "services")}
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {group.map((s, j) => (
                      <motion.li
                        key={s.id}
                        className="flex h-7 items-center gap-2 text-[12px]"
                        initial={{
                          opacity: 0,
                          x: motionSafe ? -distances.nudge : 0,
                        }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          delay: j * cascade(group.length),
                          duration: durations.base,
                          ease: easings.enter,
                        }}
                      >
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tint }}
                        />
                        <span className="min-w-0 flex-1 truncate text-foreground">
                          {s.name}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                          {rate(s.rps)}
                        </span>
                      </motion.li>
                    ))}
                  </ul>
                </motion.li>
              );
            })}
            {done && impacted.length === 0 ? (
              <li className="py-2 text-[12px] text-ink-3">
                Nothing calls {source.name}. Its fall stays with it.
              </li>
            ) : null}
          </ol>
        </>
      ) : (
        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          <p className="text-[13px] text-foreground">
            Select a service to see who feels it when it falls over.
          </p>
          <ul className="flex flex-col gap-1.5 text-[12px] text-ink-2">
            {(["down", "degraded", "healthy"] as BlastHealth[]).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: HEALTH[k].dot }}
                />
                <span className="capitalize">{HEALTH[k].word}</span>
                <span className="ml-auto font-mono text-[10px] text-ink-3 tabular-nums">
                  {services.filter((s) => s.health === k).length}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-ink-3">Line weight is traffic.</p>
        </div>
      )}
    </div>
  );

  /* ----------------------------- phone tree ------------------------------ */

  const treeOrder: { s: BlastService; level: number; hop: number | null }[] =
    source
      ? [
          ...services
            .filter((s) => hops.has(s.id))
            .sort(
              (a, b) =>
                (hops.get(a.id) ?? 0) - (hops.get(b.id) ?? 0) ||
                order.indexOf(a.id) - order.indexOf(b.id),
            )
            .map((s) => ({
              s,
              level: (hops.get(s.id) ?? 0) + 1,
              hop: hops.get(s.id) ?? 0,
            })),
          ...services
            .filter((s) => !hops.has(s.id))
            .map((s) => ({ s, level: 1, hop: null })),
        ]
      : order
          .map((id) => byId.get(id))
          .filter((s): s is BlastService => s !== undefined)
          .map((s) => ({ s, level: 1, hop: null }));

  const [treeActive, setTreeActive] = React.useState<string | null>(null);
  const activeTree =
    treeActive && byId.has(treeActive)
      ? treeActive
      : (treeOrder[0]?.s.id ?? null);
  const treeRefs = React.useRef(new Map<string, HTMLElement>());

  const onTreeKey = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    const at = treeOrder.findIndex((t) => t.s.id === id);
    let to: number | null = null;
    if (event.key === "ArrowDown") to = at + 1;
    else if (event.key === "ArrowUp") to = at - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = treeOrder.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(id === selected ? null : id);
      return;
    } else if (event.key === "Escape" && selected) {
      event.preventDefault();
      choose(null);
      return;
    }
    if (to === null) return;
    event.preventDefault();
    const target = treeOrder[Math.max(0, Math.min(treeOrder.length - 1, to))];
    if (!target) return;
    setTreeActive(target.s.id);
    treeRefs.current.get(target.s.id)?.focus();
  };

  const tree = (
    <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 py-2">
      {loading ? (
        <div aria-hidden className="flex flex-col gap-2 px-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-8 rounded-2 border border-dashed border-hairline-strong"
              style={{ marginLeft: (i % 3) * 14 }}
            />
          ))}
        </div>
      ) : (
        <ul
          role="tree"
          aria-label={title}
          aria-describedby={hintId}
          className="flex flex-col"
        >
          {treeOrder.map(({ s, level, hop }, i) => {
            const h = HEALTH[s.health] ?? HEALTH.healthy;
            const isSource = s.id === selected;
            const shownRow = hop === null || hop <= Math.max(0, shownHop);
            const firstUntouched =
              source && hop === null && treeOrder[i - 1]?.hop !== null;
            return (
              <React.Fragment key={s.id}>
                {firstUntouched ? (
                  <li
                    role="none"
                    className="mt-2 mb-1 px-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
                  >
                    Not affected
                  </li>
                ) : null}
                <motion.li
                  ref={(el: HTMLLIElement | null) => {
                    if (el) treeRefs.current.set(s.id, el);
                    else treeRefs.current.delete(s.id);
                  }}
                  role="treeitem"
                  aria-level={level}
                  aria-selected={isSource}
                  aria-label={`${nodeLabel(s)}${hop && hop > 0 ? `, hop ${hop}` : ""}`}
                  tabIndex={activeTree === s.id ? 0 : -1}
                  layout={motionSafe ? "position" : false}
                  onFocus={() => setTreeActive(s.id)}
                  onKeyDown={(event) => onTreeKey(event, s.id)}
                  onClick={() => choose(isSource ? null : s.id)}
                  initial={false}
                  animate={{
                    opacity: source && hop === null ? 0.45 : shownRow ? 1 : 0,
                  }}
                  transition={{
                    layout: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                  className={cn(
                    "relative flex h-9 cursor-pointer items-center gap-2 rounded-2 pr-2 text-[12px] hover:bg-surface-2",
                    isSource && "bg-surface-2",
                    FOCUS_IN,
                  )}
                  style={{ paddingLeft: 8 + (level - 1) * 16 }}
                >
                  {level > 1 ? (
                    <CornerDownRight
                      aria-hidden
                      className="size-3.5 shrink-0"
                      style={{ color: tint }}
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        hop !== null && shownRow && source ? tint : h.dot,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {s.name}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                    {hop !== null && hop > 0 ? `hop ${hop}` : `${rate(s.rps)}`}
                  </span>
                </motion.li>
              </React.Fragment>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {loading
              ? "Loading the map"
              : `${plural(services.length, "service", "services")} · ${plural(map.edges.length, "call", "calls")}`}
          </p>
        </div>
        {selected ? (
          <button
            type="button"
            onClick={() => choose(null)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Clear
          </button>
        ) : null}
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move across the map, Enter or Space selects a service, Escape
        clears.
      </p>

      {failed ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline bg-[color-mix(in_oklab,var(--warn)_8%,var(--card))] px-4 py-2 text-[12px]">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
          <span className="min-w-0 flex-1 text-ink-2">
            Couldn&apos;t refresh · map from {ago(now - fetched)}
          </span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline bg-card px-2 text-[11px] text-foreground hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RefreshCw aria-hidden className="size-3" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {services.length === 0 && !loading ? (
        <div className="flex flex-1 items-center-safe justify-center-safe p-6 text-center text-[13px] text-ink-3">
          No services to map yet.
        </div>
      ) : (
        <>
          {/* Tablet and up: the map, with the hop list beside or under it. */}
          <div className="hidden flex-1 flex-col overflow-hidden @min-[30rem]:flex @min-[56rem]:grid @min-[56rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[56rem]:grid-rows-[minmax(0,1fr)]">
            <div
              role="group"
              aria-label={title}
              aria-busy={loading || undefined}
              className={cn(
                "relative flex-1 overflow-hidden",
                failed && "saturate-[0.35]",
              )}
            >
              <div ref={setMapNode} className="absolute inset-3">
                {edgeLayer}
                {order
                  .map((id) => byId.get(id))
                  .filter((s): s is BlastService => s !== undefined)
                  .map(node)}
              </div>
            </div>
            <aside
              aria-label="Impacted services"
              className="h-44 shrink-0 border-t border-hairline @min-[56rem]:h-auto @min-[56rem]:border-t-0 @min-[56rem]:border-l"
            >
              {panel}
            </aside>
          </div>

          {/* Phone: an indented tree of hops. */}
          <div className="flex flex-1 flex-col overflow-hidden @min-[30rem]:hidden">
            {source ? (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-4 py-2 text-[12px]">
                <span className="min-w-0 truncate text-ink-2">
                  Impacted{" "}
                  <RolledCount
                    value={counted}
                    motionSafe={motionSafe}
                    className="font-mono font-medium text-foreground tabular-nums"
                  />
                </span>
                <button
                  type="button"
                  aria-disabled={acked.has(source.id) || disabled || undefined}
                  onClick={() => {
                    if (acked.has(source.id) || disabled) return;
                    setAcked((a) => new Set(a).add(source.id));
                    onAcknowledge?.(source, impacted);
                  }}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[11px] font-medium",
                    acked.has(source.id)
                      ? "border border-hairline text-success"
                      : "bg-primary text-primary-foreground",
                    FOCUS_RING,
                  )}
                >
                  <Check aria-hidden className="size-3" />
                  {acked.has(source.id) ? "Acknowledged" : "Acknowledge"}
                </button>
              </div>
            ) : null}
            {tree}
          </div>
        </>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
