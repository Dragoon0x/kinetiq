"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Pause,
  Pin,
  PinOff,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

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

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type CauseLinesCurveStyle = "arc" | "elbow" | "chevron";
export type CauseLinesAccentName = "cobalt" | "plum" | "mint" | "ink";
export type CauseLinesStatus =
  "live" | "paused" | "loading" | "empty" | "error";
export type CauseTone = "neutral" | "accent" | "warn" | "danger";

/** An agent writing into the feed. */
export type CauseAgent = {
  id: string;
  name: string;
  /** One letter drawn in the event's node. @default the name's first letter */
  initial?: string;
};

/** A severity level: its word and how strongly it is drawn. */
export type CauseSeverity = {
  id: string;
  /** The word shown and read out: "warning". */
  label: string;
  tone: CauseTone;
};

/** One thing an agent did or saw. */
export type CauseEvent = {
  id: string;
  /** When it happened, ms since the epoch. */
  at: number;
  /** An agent id. */
  agent: string;
  /** A severity id. */
  severity: string;
  title: string;
  detail?: string;
};

/** `from` set off `to`. */
export type CauseLink = { from: string; to: string };

export type CauseLinesProps = {
  /** The feed, any order; it is drawn oldest first so causes sit above effects. @default defaultCauseEvents */
  events?: CauseEvent[];
  /** Which event set off which. @default defaultCauseLinks */
  links?: CauseLink[];
  /** The agents writing into the feed, in filter order. @default defaultCauseAgents */
  agents?: CauseAgent[];
  /** The severity levels events use. @default defaultCauseSeverities */
  severities?: CauseSeverity[];
  /** Controlled selected event id, or null. */
  value?: string | null;
  /** Initial selected event when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click or key that selected an event (null when cleared). */
  onSelectEvent?: (id: string | null, event: CauseEvent | null) => void;
  /** Controlled pinned event: its chain stays lit while the selection moves. */
  pinned?: string | null;
  /** Initial pinned event when uncontrolled. @default null */
  defaultPinned?: string | null;
  /** Fires from P or the Pin button, with the pinned id (or null) and its lit chain in feed order. */
  onPinChain?: (id: string | null, chain: string[]) => void;
  /** Controlled agent filter: an agent id, or null for every agent. */
  agentFilter?: string | null;
  /** Initial agent filter when uncontrolled. @default null */
  defaultAgentFilter?: string | null;
  /** Fires from the chip that changed the filter. */
  onFilterAgent?: (agentId: string | null) => void;
  /** Whether the feed is streaming, held, or has nothing to show yet. @default "live" */
  status?: CauseLinesStatus;
  /** The Live / Paused button was pressed, with the state it asks for. Omit it and the pill is a label. */
  onLiveChange?: (live: boolean) => void;
  /** "Try again" was pressed after the feed failed to load. */
  onRetry?: () => void;
  /** The moment relative times count from, ms. @default defaultCauseNow */
  now?: number;
  /** How many hops of causes and effects light up each way, 1–6. @default 3 */
  reach?: number;
  /** The feed's heading. @default "Sync incident" */
  title?: string;
  /** Under the heading. @default "Fieldline · eu-west" */
  subtitle?: string;
  /** How a causal line bends: round bows, square brackets or angled chevrons. @default "arc" */
  curveStyle?: CauseLinesCurveStyle;
  /** Opacity of events outside the lit chain, 0.1–0.6. @default 0.3 */
  dimLevel?: number;
  /** The chain, the selection and Live: a named pigment or any CSS colour. @default "cobalt" */
  accent?: CauseLinesAccentName | (string & {});
  /** Read only: nothing can be selected, pinned or filtered. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** 09:58 UTC on 17 October 2026, a quarter hour into the incident. */
export const defaultCauseNow = Date.UTC(2026, 9, 17, 9, 58, 0);

const T = (m: number, s: number) => Date.UTC(2026, 9, 17, 9, m, s);

export const defaultCauseAgents: CauseAgent[] = [
  { id: "intake", name: "Intake" },
  { id: "ledger", name: "Ledger" },
  { id: "courier", name: "Courier" },
  { id: "warden", name: "Warden" },
];

export const defaultCauseSeverities: CauseSeverity[] = [
  { id: "info", label: "info", tone: "neutral" },
  { id: "notice", label: "notice", tone: "accent" },
  { id: "warn", label: "warning", tone: "warn" },
  { id: "error", label: "error", tone: "danger" },
];

/**
 * Fieldline's eu-west sync incident, minute by minute: a schema rollout
 * adds a field the ledger does not know, rows are parked, the courier's
 * retries turn into a storm, the warden throttles and pages, and the fix
 * drains the backlog.
 */
export const defaultCauseEvents: CauseEvent[] = [
  {
    id: "ev-01",
    at: T(40, 12),
    agent: "warden",
    severity: "notice",
    title: "Schema v12 rolled out to eu-west",
    detail: "Account payloads gain a region_code field.",
  },
  {
    id: "ev-02",
    at: T(40, 48),
    agent: "intake",
    severity: "info",
    title: "Webhooks now carry region_code",
    detail: "First payload with the new field from Basinworks billing.",
  },
  {
    id: "ev-03",
    at: T(41, 30),
    agent: "ledger",
    severity: "warn",
    title: "214 rows with an unknown field",
    detail: "region_code is not in the ledger’s v11 mapping.",
  },
  {
    id: "ev-04",
    at: T(41, 31),
    agent: "ledger",
    severity: "notice",
    title: "Rows parked in quarantine",
    detail: "214 rows held back from reconciliation.",
  },
  {
    id: "ev-05",
    at: T(42, 10),
    agent: "courier",
    severity: "warn",
    title: "Mirror push missing 214 rows",
    detail: "The Basinworks mirror rejects the batch as incomplete.",
  },
  {
    id: "ev-06",
    at: T(42, 14),
    agent: "courier",
    severity: "info",
    title: "Courier retries the batch",
    detail: "Retry 1 of 5 with a 2 s backoff.",
  },
  {
    id: "ev-07",
    at: T(43, 2),
    agent: "courier",
    severity: "error",
    title: "Retry storm on /sync",
    detail:
      "1,880 retries a minute from 9 workers; each 409 resets the backoff.",
  },
  {
    id: "ev-08",
    at: T(43, 20),
    agent: "warden",
    severity: "warn",
    title: "Sync latency p95 at 4.1 s",
    detail: "Up from 0.6 s; the API pool is saturated.",
  },
  {
    id: "ev-09",
    at: T(43, 41),
    agent: "intake",
    severity: "warn",
    title: "Webhook acks slow to 3.2 s",
    detail: "Basinworks billing starts resending payloads.",
  },
  {
    id: "ev-10",
    at: T(44, 5),
    agent: "intake",
    severity: "error",
    title: "Duplicate payloads stored",
    detail: "312 resent payloads were written twice.",
  },
  {
    id: "ev-11",
    at: T(44, 30),
    agent: "warden",
    severity: "error",
    title: "Throttle on /sync engaged",
    detail: "Courier held to 20 requests a second.",
  },
  {
    id: "ev-12",
    at: T(45, 0),
    agent: "warden",
    severity: "notice",
    title: "On-call paged: Ines Varga",
    detail: "Incident FL-2207 opened.",
  },
  {
    id: "ev-13",
    at: T(51, 18),
    agent: "ledger",
    severity: "notice",
    title: "Mapping v12 deployed",
    detail: "region_code now maps to territory.",
  },
  {
    id: "ev-14",
    at: T(52, 2),
    agent: "ledger",
    severity: "info",
    title: "Quarantine released",
    detail: "214 rows reconciled against the new mapping.",
  },
  {
    id: "ev-15",
    at: T(53, 40),
    agent: "courier",
    severity: "info",
    title: "Backlog draining",
    detail: "1,140 queued pushes at 90 a second.",
  },
  {
    id: "ev-16",
    at: T(56, 55),
    agent: "intake",
    severity: "notice",
    title: "Duplicates folded",
    detail: "312 duplicates merged by payload hash.",
  },
];

export const defaultCauseLinks: CauseLink[] = [
  { from: "ev-01", to: "ev-02" },
  { from: "ev-02", to: "ev-03" },
  { from: "ev-03", to: "ev-04" },
  { from: "ev-04", to: "ev-05" },
  { from: "ev-05", to: "ev-06" },
  { from: "ev-06", to: "ev-07" },
  { from: "ev-07", to: "ev-08" },
  { from: "ev-07", to: "ev-11" },
  { from: "ev-08", to: "ev-09" },
  { from: "ev-09", to: "ev-10" },
  { from: "ev-11", to: "ev-12" },
  { from: "ev-12", to: "ev-13" },
  { from: "ev-13", to: "ev-14" },
  { from: "ev-14", to: "ev-15" },
  { from: "ev-10", to: "ev-16" },
];

/* ----------------------------------------------------------------------- */
/*                                 Geometry                                 */
/* ----------------------------------------------------------------------- */

/** Every row is this tall, so the lines are drawn from the index alone and the server draws them too. */
const ROW_H = 52;
/** The causal gutter left of the nodes at card width. */
const GUTTER = 44;
const NODE = 18;
/** Rails: the node's right edge, and one indent step. */
const RAIL_X = 8 + NODE + 4;
const INDENT = 10;
/** Indents stop here, so a long chain never squeezes its titles away. */
const MAX_GEN = 4;
/** Delay between hops as the chain lights outward. */
const HOP = 0.09;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * A link from `ya` to `yb`, both on the node edge at `x0`, bent into the
 * gutter. It starts at `ya`, so a pathLength sweep grows it from that end.
 * The bend deepens with the span, so long links nest outside short ones.
 */
function linkPath(
  style: CauseLinesCurveStyle,
  x0: number,
  ya: number,
  yb: number,
): string {
  const span = Math.abs(yb - ya);
  const d = clamp(9 + span * 0.12, 10, x0 - 6);
  const s = yb >= ya ? 1 : -1;
  if (style === "elbow") {
    const r = Math.min(6, span / 2);
    const x = x0 - d;
    return [
      `M ${r2(x0)} ${r2(ya)}`,
      `H ${r2(x + r)}`,
      `Q ${r2(x)} ${r2(ya)} ${r2(x)} ${r2(ya + s * r)}`,
      `V ${r2(yb - s * r)}`,
      `Q ${r2(x)} ${r2(yb)} ${r2(x + r)} ${r2(yb)}`,
      `H ${r2(x0)}`,
    ].join(" ");
  }
  if (style === "chevron") {
    return `M ${r2(x0)} ${r2(ya)} L ${r2(x0 - d)} ${r2((ya + yb) / 2)} L ${r2(x0)} ${r2(yb)}`;
  }
  // A cubic whose two handles sit 4/3 of the depth out reaches exactly the
  // depth at its middle.
  const k = (d * 4) / 3;
  return `M ${r2(x0)} ${r2(ya)} C ${r2(x0 - k)} ${r2(ya)} ${r2(x0 - k)} ${r2(yb)} ${r2(x0)} ${r2(yb)}`;
}

/**
 * A tree guide: down the parent's indent, then across to the child's.
 * `fromChild` draws the same guide the other way round, so a cause's rail
 * grows up from the effect, outward from the selection like the arcs.
 */
function railPath(
  ya: number,
  ga: number,
  yb: number,
  gb: number,
  fromChild = false,
): string {
  const x = RAIL_X + ga * INDENT;
  const end = Math.max(x + 4, RAIL_X + gb * INDENT + INDENT - 1);
  const s = yb >= ya ? 1 : -1;
  const r = 4;
  if (fromChild) {
    return [
      `M ${r2(end)} ${r2(yb)}`,
      `H ${r2(x + r)}`,
      `Q ${r2(x)} ${r2(yb)} ${r2(x)} ${r2(yb - s * r)}`,
      `V ${r2(ya + s * 10)}`,
    ].join(" ");
  }
  return [
    `M ${r2(x)} ${r2(ya + s * 10)}`,
    `V ${r2(yb - s * r)}`,
    `Q ${r2(x)} ${r2(yb)} ${r2(x + r)} ${r2(yb)}`,
    `H ${r2(end)}`,
  ].join(" ");
}

/* ----------------------------------------------------------------------- */
/*                                  Graph                                   */
/* ----------------------------------------------------------------------- */

type Graph = {
  causes: Map<string, string[]>;
  effects: Map<string, string[]>;
};

function buildGraph(links: CauseLink[], ids: Set<string>): Graph {
  const causes = new Map<string, string[]>();
  const effects = new Map<string, string[]>();
  for (const { from, to } of links) {
    if (!ids.has(from) || !ids.has(to) || from === to) continue;
    causes.set(to, [...(causes.get(to) ?? []), from]);
    effects.set(from, [...(effects.get(from) ?? []), to]);
  }
  return { causes, effects };
}

/** Hops from `id`: 0 for itself, negative for causes, positive for effects. */
function chainHops(id: string, g: Graph, reach: number): Map<string, number> {
  const hops = new Map<string, number>([[id, 0]]);
  for (const [map, sign] of [
    [g.causes, -1],
    [g.effects, 1],
  ] as const) {
    let frontier = [id];
    for (let hop = 1; hop <= reach && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const node of frontier) {
        for (const other of map.get(node) ?? []) {
          if (hops.has(other)) continue;
          hops.set(other, sign * hop);
          next.push(other);
        }
      }
      frontier = next;
    }
  }
  return hops;
}

type ShownLink = { from: string; to: string; via: boolean };

/**
 * Links between the events on show. A link whose cause is hidden by the
 * agent filter is followed up through the hidden events to the nearest one
 * on show, and drawn dotted: the chain still reads, honestly marked.
 */
function shownLinks(visible: Set<string>, g: Graph): ShownLink[] {
  const out: ShownLink[] = [];
  const seen = new Set<string>();
  for (const to of visible) {
    const stack = (g.causes.get(to) ?? []).map((id) => ({ id, via: false }));
    const walked = new Set<string>();
    while (stack.length > 0) {
      const top = stack.pop();
      if (!top || walked.has(top.id)) continue;
      walked.add(top.id);
      if (visible.has(top.id)) {
        const key = `${top.id}>${to}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ from: top.id, to, via: top.via });
        }
      } else {
        for (const c of g.causes.get(top.id) ?? []) {
          stack.push({ id: c, via: true });
        }
      }
    }
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const pad2 = (n: number) => String(n).padStart(2, "0");
/** A fixed 24-hour UTC clock: a locale lookup in render would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
};
const ago = (ms: number, now: number) => {
  const mins = Math.round((now - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} h ago`;
};
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;
const unstop = (text: string) => text.replace(/[.!?…]+$/, "");

const ACCENTS: Record<CauseLinesAccentName, Record<string, string>> = {
  cobalt: { "--cl-ink": "var(--accent-bright)" },
  plum: { "--cl-ink": "oklch(from var(--accent-bright) l c 320)" },
  mint: { "--cl-ink": "var(--success)" },
  ink: { "--cl-ink": "var(--ink-2)" },
};

const accentVars = (accent: string): React.CSSProperties => {
  const named = ACCENTS[accent as CauseLinesAccentName];
  return {
    ...(named ?? { "--cl-ink": accent }),
    "--cl-wash": "color-mix(in oklab, var(--cl-ink) 11%, transparent)",
    "--cl-soft": "color-mix(in oklab, var(--cl-ink) 26%, transparent)",
  } as React.CSSProperties;
};

/**
 * Node discs are filled objects, so warn and danger are pigment: the
 * token's hue at a fixed lightness, the same in both themes.
 */
const NODE_TONE: Record<
  CauseTone,
  { className: string; style?: React.CSSProperties }
> = {
  neutral: {
    className: "border border-hairline-strong bg-surface-1 text-ink-2",
  },
  accent: {
    className:
      "border border-[var(--cl-ink)] bg-surface-1 text-[var(--cl-ink)]",
  },
  warn: {
    className: "border border-transparent",
    style: {
      backgroundColor: "oklch(from var(--warn) 0.82 0.13 h)",
      color: "oklch(from var(--warn) 0.3 0.06 h)",
    },
  },
  danger: {
    className: "border border-transparent",
    style: {
      backgroundColor: "oklch(from var(--danger) 0.64 0.19 h)",
      color: "oklch(from var(--danger) 0.98 0.01 h)",
    },
  },
};

const WORD_TONE: Record<CauseTone, string> = {
  neutral: "text-ink-3",
  accent: "text-[var(--cl-ink)]",
  warn: "text-warn",
  danger: "text-danger",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * Keeps a row in view inside the feed without ever scrolling the page:
 * `center` puts it mid-feed (the first frame), otherwise the least move.
 */
function revealIn(
  scroller: HTMLElement | null,
  el: HTMLElement | null,
  center = false,
) {
  if (!scroller || !el) return;
  const top =
    el.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top +
    scroller.scrollTop;
  const bottom = top + el.offsetHeight;
  if (center) {
    scroller.scrollTop = Math.max(
      0,
      Math.round(top - (scroller.clientHeight - el.offsetHeight) / 2),
    );
  } else if (top < scroller.scrollTop + 4) {
    scroller.scrollTop = Math.max(0, Math.round(top - 4));
  } else if (bottom > scroller.scrollTop + scroller.clientHeight - 4) {
    scroller.scrollTop = Math.round(bottom - scroller.clientHeight + 4);
  }
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An agent activity feed that traces cause and effect. Events from several
 * agents are drawn oldest first on a causal gutter; selecting one lights
 * its chain — lines start at the selected node and grow along their own
 * paths up to the events that caused it and down to the ones it caused, on
 * `glide`, hop after hop — while every unrelated event dims, so a chain
 * reaction reads at a glance. Every link is always there as a faint ghost,
 * so the incident's shape reads before anything is touched.
 *
 * The rows are a fixed height, so the lines are computed from the row index
 * alone and the server draws exactly what the browser does. In a narrow
 * container the gutter gives way to indented rails: the chain's rows step
 * in by generation and tree guides join parent to child.
 *
 * The feed is a listbox with one tab stop: Up and Down walk it, Home and
 * End jump, Shift with Up or Down jumps to the nearest cause or effect, P
 * pins the chain so it stays lit while the selection moves, and Escape
 * unpins. Under reduced motion the chain appears with a fade and the rows
 * re-indent in place: the chain is information, so it still shows.
 */
export function CauseLines({
  events = defaultCauseEvents,
  links = defaultCauseLinks,
  agents = defaultCauseAgents,
  severities = defaultCauseSeverities,
  value,
  defaultValue = null,
  onSelectEvent,
  pinned,
  defaultPinned = null,
  onPinChain,
  agentFilter,
  defaultAgentFilter = null,
  onFilterAgent,
  status = "live",
  onLiveChange,
  onRetry,
  now = defaultCauseNow,
  reach = 3,
  title = "Sync incident",
  subtitle = "Fieldline · eu-west",
  curveStyle = "arc",
  dimLevel = 0.3,
  accent = "cobalt",
  disabled = false,
  className,
}: CauseLinesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [ownSelected, setOwnSelected] = React.useState(defaultValue);
  const selected = value === undefined ? ownSelected : value;
  const [ownPinned, setOwnPinned] = React.useState(defaultPinned);
  const pin = pinned === undefined ? ownPinned : pinned;
  const [ownFilter, setOwnFilter] = React.useState(defaultAgentFilter);
  const filter = agentFilter === undefined ? ownFilter : agentFilter;
  const [announcement, setAnnouncement] = React.useState("");
  const [pinStamp, setPinStamp] = React.useState(0);

  // Events present on the first render arrive with the page; anything later
  // is a live arrival and gets the arrival motion.
  const [firstIds] = React.useState(() => new Set(events.map((e) => e.id)));

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  /** Rows are found by their data attribute when focus has to move, so no per-row ref changes identity. */
  const rowOf = (id: string) =>
    scrollerRef.current?.querySelector<HTMLElement>(
      `[data-cl-ev="${CSS.escape(id)}"]`,
    ) ?? null;

  const agentOf = React.useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );
  const severityOf = React.useMemo(
    () => new Map(severities.map((s) => [s.id, s])),
    [severities],
  );

  const ordered = React.useMemo(
    () =>
      events
        .map((e, i) => ({ e, i }))
        .sort((a, b) => a.e.at - b.e.at || a.i - b.i)
        .map(({ e }) => e),
    [events],
  );
  const graph = React.useMemo(
    () => buildGraph(links, new Set(ordered.map((e) => e.id))),
    [links, ordered],
  );
  const shown = React.useMemo(
    () => (filter ? ordered.filter((e) => e.agent === filter) : ordered),
    [ordered, filter],
  );
  const shownIds = React.useMemo(
    () => new Set(shown.map((e) => e.id)),
    [shown],
  );
  const indexOf = React.useMemo(
    () => new Map(shown.map((e, i) => [e.id, i])),
    [shown],
  );
  const visibleLinks = React.useMemo(
    () => shownLinks(shownIds, graph),
    [shownIds, graph],
  );

  const hops = Math.round(clamp(reach, 1, 6));
  const litFrom = pin && shownIds.has(pin) ? pin : selected;
  const lit = React.useMemo(() => {
    if (!litFrom || !shownIds.has(litFrom)) return null;
    return chainHops(litFrom, graph, hops);
  }, [litFrom, shownIds, graph, hops]);

  const litLinks = React.useMemo(() => {
    if (!lit) return [];
    return visibleLinks.filter((l) => lit.has(l.from) && lit.has(l.to));
  }, [lit, visibleLinks]);

  /** Generation of every lit row: root causes 0, each effect one further. */
  const gens = React.useMemo(() => {
    const out = new Map<string, number>();
    if (!lit) return out;
    const causesIn = new Map<string, string[]>();
    for (const l of litLinks) {
      causesIn.set(l.to, [...(causesIn.get(l.to) ?? []), l.from]);
    }
    const visit = (id: string, depth: number): number => {
      const known = out.get(id);
      if (known !== undefined) return known;
      if (depth > 64) return 0;
      let g = 0;
      for (const c of causesIn.get(id) ?? [])
        g = Math.max(g, visit(c, depth + 1) + 1);
      out.set(id, g);
      return g;
    };
    for (const id of lit.keys()) if (shownIds.has(id)) visit(id, 0);
    return out;
  }, [lit, litLinks, shownIds]);

  const directOf = React.useCallback(
    (id: string) => {
      const causes: string[] = [];
      const effects: string[] = [];
      for (const l of visibleLinks) {
        if (l.to === id) causes.push(l.from);
        if (l.from === id) effects.push(l.to);
      }
      const at = (x: string) => indexOf.get(x) ?? 0;
      causes.sort((a, b) => at(b) - at(a));
      effects.sort((a, b) => at(a) - at(b));
      return { causes, effects };
    },
    [visibleLinks, indexOf],
  );

  const selectedEvent = selected
    ? (ordered.find((e) => e.id === selected) ?? null)
    : null;
  const selectedShown = !!selected && shownIds.has(selected);
  const pinnedEvent = pin ? (ordered.find((e) => e.id === pin) ?? null) : null;

  const sentenceFor = React.useCallback(
    (e: CauseEvent) => {
      const { causes, effects } = directOf(e.id);
      return `${unstop(e.title)}. ${plural(causes.length, "cause")}, ${plural(effects.length, "effect")}.`;
    },
    [directOf],
  );

  /* ---------------------------- interactions ---------------------------- */

  const select = (id: string | null, focus = false) => {
    if (disabled) return;
    const event = id ? (ordered.find((e) => e.id === id) ?? null) : null;
    if (id !== selected) {
      if (value === undefined) setOwnSelected(id);
      onSelectEvent?.(id, event);
      setAnnouncement(event ? sentenceFor(event) : "Selection cleared.");
    }
    if (focus && id) {
      const node = rowOf(id);
      node?.focus({ preventScroll: true });
      revealIn(scrollerRef.current, node);
    }
  };

  const chainList = (id: string) => {
    const h = chainHops(id, graph, hops);
    return shown.filter((e) => h.has(e.id)).map((e) => e.id);
  };

  const togglePin = () => {
    if (disabled || !selected || !selectedShown) return;
    const next = pin === selected ? null : selected;
    if (pinned === undefined) setOwnPinned(next);
    onPinChain?.(next, next ? chainList(next) : []);
    if (next) setPinStamp((n) => n + 1);
    const ev = next ? ordered.find((e) => e.id === next) : null;
    setAnnouncement(
      ev ? `Chain pinned to ${unstop(ev.title)}.` : "Chain unpinned.",
    );
  };

  const unpin = () => {
    if (disabled || !pin) return;
    if (pinned === undefined) setOwnPinned(null);
    onPinChain?.(null, []);
    setAnnouncement("Chain unpinned.");
  };

  const setFilter = (agentId: string | null) => {
    if (disabled || agentId === filter) return;
    if (agentFilter === undefined) setOwnFilter(agentId);
    onFilterAgent?.(agentId);
    const name = agentId ? (agentOf.get(agentId)?.name ?? agentId) : null;
    const count = agentId
      ? ordered.filter((e) => e.agent === agentId).length
      : ordered.length;
    // A selection the filter hides is let go, from the press that hid it.
    const keep = selectedEvent && (!agentId || selectedEvent.agent === agentId);
    if (selected && !keep) {
      if (value === undefined) setOwnSelected(null);
      onSelectEvent?.(null, null);
    }
    setAnnouncement(
      `${name ? `Showing ${name}` : "Showing every agent"}: ${plural(count, "event")}.`,
    );
  };

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || shown.length === 0) return;
    const focusedId = (e.target as HTMLElement).dataset?.clEv;
    const from = focusedId && indexOf.has(focusedId) ? focusedId : selected;
    const at = from && indexOf.has(from) ? (indexOf.get(from) ?? 0) : -1;
    const go = (i: number) => {
      const target = shown[clamp(i, 0, shown.length - 1)];
      if (target) select(target.id, true);
    };
    if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (!from || at < 0) return go(0);
      const { causes, effects } = directOf(from);
      const target = e.key === "ArrowUp" ? causes[0] : effects[0];
      if (target) select(target, true);
      else
        setAnnouncement(
          e.key === "ArrowUp"
            ? "No earlier cause on show."
            : "No later effect on show.",
        );
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(at < 0 ? 0 : at + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        go(at < 0 ? 0 : at - 1);
        break;
      case "Home":
        e.preventDefault();
        go(0);
        break;
      case "End":
        e.preventDefault();
        go(shown.length - 1);
        break;
      case "p":
      case "P":
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        togglePin();
        break;
      case "Escape":
        if (pin) {
          e.preventDefault();
          unpin();
        }
        break;
      default:
        break;
    }
  };

  // A live feed follows its newest event while the reader is at the bottom.
  const lastId = shown[shown.length - 1]?.id;
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || status !== "live" || !lastId || firstIds.has(lastId))
      return;
    const gap =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    // Measured after the new row landed: the reader was within two rows.
    if (gap < ROW_H * 3) {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: motionSafe ? "smooth" : "auto",
      });
    }
  }, [lastId, status, motionSafe, firstIds]);

  // Arrivals the reader has not scrolled down to are counted, not forced
  // into view: a "new below" pill offers them.
  const [seenAt, setSeenAt] = React.useState(() =>
    events.reduce((m, e) => Math.max(m, e.at), 0),
  );
  const newestShown = shown.reduce((m, e) => Math.max(m, e.at), 0);
  const unseen = shown.filter(
    (e) => e.at > seenAt && !firstIds.has(e.id),
  ).length;
  const onFeedScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (gap < ROW_H / 2 && newestShown > seenAt) setSeenAt(newestShown);
  };

  // The first frame shows the selected event mid-feed, its chain around it.
  React.useEffect(() => {
    if (selected) revealIn(scrollerRef.current, rowOf(selected), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the first frame only; later selections reveal from the key or click that made them.
  }, []);

  /* -------------------------------- parts ------------------------------- */

  const step = Math.max(HOP, cascade(hops * 2 + 1));
  const dim = clamp(dimLevel, 0.1, 0.6);
  const listH = shown.length * ROW_H;
  const maxGen = Math.min(MAX_GEN, Math.max(0, ...gens.values()));
  const railW = RAIL_X + (maxGen + 1) * INDENT + 4;
  const drawKey = `${litFrom ?? "none"}-${filter ?? "all"}-${curveStyle}-${hops}`;

  const live = status === "live";
  const counts = new Map<string, number>();
  for (const e of ordered) counts.set(e.agent, (counts.get(e.agent) ?? 0) + 1);

  const header = (
    <header className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span
          aria-hidden
          className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--cl-wash)] text-[var(--cl-ink)] @min-[18.75rem]:flex"
        >
          <Activity className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2
            id={titleId}
            className="truncate text-[15px] leading-5 font-semibold"
          >
            {title}
          </h2>
          <p
            title={`${subtitle} · ${plural(ordered.length, "event")}`}
            className="truncate text-[12px] leading-4 text-ink-3"
          >
            {`${subtitle} · ${plural(ordered.length, "event")}`}
          </p>
        </div>
      </div>
      {status === "live" || status === "paused" ? (
        onLiveChange ? (
          <button
            type="button"
            aria-pressed={live}
            aria-disabled={disabled || undefined}
            onClick={() => {
              if (!disabled) onLiveChange(!live);
            }}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
              live
                ? "border-[var(--cl-soft)] bg-[var(--cl-wash)] text-[var(--cl-ink)]"
                : "border-hairline bg-surface-2 text-ink-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {live ? (
              <span aria-hidden className="size-1.5 rounded-full bg-signal" />
            ) : (
              <Pause aria-hidden className="size-3" />
            )}
            {live ? "Live" : "Paused"}
          </button>
        ) : (
          <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            {live ? (
              <span aria-hidden className="size-1.5 rounded-full bg-signal" />
            ) : (
              <Pause aria-hidden className="size-3" />
            )}
            {live ? "Live" : "Paused"}
          </span>
        )
      ) : null}
    </header>
  );

  const chips = (
    <div
      role="group"
      aria-label="Filter by agent"
      // One line that scrolls sideways under soft edges, so the feed keeps
      // its height on a phone instead of losing it to wrapped chips.
      className="flex shrink-0 [scrollbar-width:none] gap-1.5 overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%_-_14px),transparent)] px-4 py-1 pb-2.5 [&::-webkit-scrollbar]:hidden"
    >
      {[
        { id: null as string | null, name: "All", initial: undefined },
        ...agents,
      ].map((agent) => {
        const on = filter === agent.id;
        const count = agent.id ? (counts.get(agent.id) ?? 0) : ordered.length;
        return (
          <button
            key={agent.id ?? "all"}
            type="button"
            aria-pressed={on}
            aria-disabled={disabled || undefined}
            onClick={() => setFilter(agent.id)}
            className={cn(
              "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] whitespace-nowrap transition-colors",
              on
                ? "border-[var(--cl-soft)] text-foreground"
                : "border-hairline text-ink-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {on ? (
              <motion.span
                aria-hidden
                layoutId={`${uid}-chip`}
                className="absolute inset-0 rounded-full bg-[var(--cl-wash)]"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            {agent.id ? (
              <span
                aria-hidden
                className="relative flex size-4 items-center justify-center rounded-full border border-hairline-strong font-mono text-[8px] leading-none text-ink-2"
              >
                {(agent.initial ?? agent.name.charAt(0)).toUpperCase()}
              </span>
            ) : null}
            <span className="relative">{agent.name}</span>
            <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );

  const rows = shown.map((e, index) => {
    const agent = agentOf.get(e.agent);
    const sev = severityOf.get(e.severity) ?? {
      id: e.severity,
      label: e.severity,
      tone: "neutral" as CauseTone,
    };
    const tone = NODE_TONE[sev.tone];
    const isSelected = e.id === selected;
    const inChain = lit?.has(e.id) ?? false;
    const dimmed = !!lit && !inChain;
    const gen = inChain ? Math.min(MAX_GEN, gens.get(e.id) ?? 0) : 0;
    const { causes, effects } = directOf(e.id);
    const isNew = !firstIds.has(e.id);
    const tabbable = selected && selectedShown ? isSelected : index === 0;
    const name = `${clock(e.at)}, ${agent?.name ?? e.agent}, ${sev.label}: ${unstop(e.title)}. ${plural(causes.length, "cause")}, ${plural(effects.length, "effect")}.`;

    return (
      <motion.div
        key={e.id}
        data-cl-ev={e.id}
        role="option"
        id={`${uid}-ev-${e.id}`}
        aria-selected={isSelected}
        aria-label={name}
        tabIndex={disabled ? -1 : tabbable ? 0 : -1}
        onClick={() => select(e.id, true)}
        layout={motionSafe ? "position" : false}
        initial={isNew ? { opacity: 0 } : false}
        animate={{ opacity: dimmed ? dim : 1 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          layout: springs.glide,
          opacity: { duration: durations.base, ease: easings.enter },
        }}
        className={cn(
          "relative flex shrink-0 cursor-pointer items-center gap-2 pr-3 pl-2 select-none @min-[18.75rem]:pl-[44px]",
          isSelected ? "bg-[var(--cl-wash)]" : "hover:bg-surface-2/70",
          disabled && "cursor-default",
          FOCUS_IN,
        )}
        style={{ height: ROW_H }}
      >
        <motion.span
          aria-hidden
          className="relative flex shrink-0 items-center justify-center"
          initial={isNew && motionSafe ? { y: distances.step } : false}
          animate={{ y: 0 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
          style={{ width: NODE, height: NODE }}
        >
          <span
            className={cn(
              "relative z-[1] flex size-full items-center justify-center rounded-full font-mono text-[9px] leading-none font-semibold",
              tone.className,
            )}
            style={tone.style}
          >
            {(agent?.initial ?? agent?.name.charAt(0) ?? "?").toUpperCase()}
          </span>
          <motion.span
            className="absolute -inset-[3px] rounded-full border-2 border-[var(--cl-ink)]"
            initial={false}
            animate={{
              opacity: isSelected ? 1 : 0,
              scale: isSelected ? 1 : motionSafe ? 0.6 : 1,
            }}
            transition={{
              scale: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
          />
          {isNew && motionSafe ? (
            <motion.span
              className="absolute -inset-1 rounded-full border border-[var(--cl-ink)]"
              initial={{ scale: 0.5, opacity: 0.9 }}
              animate={{ scale: 1.4, opacity: 0 }}
              transition={{
                scale: springs.recoil,
                opacity: { duration: durations.page, ease: easings.exit },
              }}
            />
          ) : null}
        </motion.span>
        <span
          className="flex min-w-0 flex-1 pl-[calc(var(--cl-gen)*10px)] transition-[padding-left] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none @min-[18.75rem]:pl-0"
          style={{ "--cl-gen": gen } as React.CSSProperties}
        >
          <motion.span
            className="flex min-w-0 flex-1 flex-col"
            initial={isNew && motionSafe ? { y: distances.step } : false}
            animate={{ y: 0 }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <span
              title={e.title}
              className="truncate text-[13px] leading-[18px] font-medium text-foreground"
            >
              {e.title}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] leading-4 text-ink-3">
              <span className="truncate">{agent?.name ?? e.agent}</span>
              {sev.tone === "warn" || sev.tone === "danger" ? (
                <span className={cn("shrink-0", WORD_TONE[sev.tone])}>
                  {sev.label}
                </span>
              ) : null}
              <span className="shrink-0 tabular-nums">{clock(e.at)}</span>
              {pin === e.id ? (
                <Pin
                  aria-hidden
                  className="size-3 shrink-0 text-[var(--cl-ink)]"
                />
              ) : null}
            </span>
          </motion.span>
        </span>
      </motion.div>
    );
  });

  // Ghosts: every link, faint, so the incident's shape reads untouched.
  const ghosts = visibleLinks.map((l) => {
    const a = indexOf.get(l.from);
    const b = indexOf.get(l.to);
    if (a === undefined || b === undefined) return null;
    return (
      <path
        key={`${l.from}>${l.to}`}
        d={linkPath(
          curveStyle,
          GUTTER,
          a * ROW_H + ROW_H / 2,
          b * ROW_H + ROW_H / 2,
        )}
        fill="none"
        strokeWidth={1}
        strokeDasharray={l.via ? "2 3" : undefined}
        className="stroke-hairline-strong"
      />
    );
  });

  const lines = litLinks.map((l) => {
    const a = indexOf.get(l.from);
    const b = indexOf.get(l.to);
    if (a === undefined || b === undefined || !lit) return null;
    const ha = Math.abs(lit.get(l.from) ?? 0);
    const hb = Math.abs(lit.get(l.to) ?? 0);
    // Grow from the end nearer the selected event, so the chain lights outward.
    const fromCause = ha <= hb;
    const ya = (fromCause ? a : b) * ROW_H + ROW_H / 2;
    const yb = (fromCause ? b : a) * ROW_H + ROW_H / 2;
    const delay = Math.min(ha, hb) * step;
    return {
      key: `${l.from}>${l.to}`,
      ya,
      yb,
      via: l.via,
      delay,
      l,
      fromCause,
    };
  });

  const chainSvg = (
    <svg
      aria-hidden
      width={GUTTER + 2}
      height={listH}
      viewBox={`0 0 ${GUTTER + 2} ${Math.max(1, listH)}`}
      className="pointer-events-none absolute top-0 left-0 hidden overflow-visible @min-[18.75rem]:block"
    >
      <motion.g
        initial={false}
        animate={{ opacity: lit ? 0.45 : 1 }}
        transition={{ duration: durations.base }}
      >
        {ghosts}
      </motion.g>
      <g key={drawKey}>
        {lines.map((line) =>
          line ? (
            <motion.path
              key={line.key}
              d={linkPath(curveStyle, GUTTER, line.ya, line.yb)}
              fill="none"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={line.via ? "2 3.5" : undefined}
              className="stroke-[var(--cl-ink)]"
              initial={
                motionSafe && !line.via ? { pathLength: 0 } : { opacity: 0 }
              }
              animate={
                motionSafe && !line.via ? { pathLength: 1 } : { opacity: 1 }
              }
              transition={
                motionSafe && !line.via
                  ? { ...springs.glide, delay: line.delay }
                  : {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: motionSafe ? line.delay : 0,
                    }
              }
            />
          ) : null,
        )}
      </g>
    </svg>
  );

  const railSvg = (
    <svg
      aria-hidden
      width={railW}
      height={listH}
      viewBox={`0 0 ${railW} ${Math.max(1, listH)}`}
      className="pointer-events-none absolute top-0 left-0 block overflow-visible @min-[18.75rem]:hidden"
    >
      <g key={drawKey}>
        {lines.map((line) => {
          if (!line) return null;
          const a = indexOf.get(line.l.from) ?? 0;
          const b = indexOf.get(line.l.to) ?? 0;
          const ga = Math.min(MAX_GEN, gens.get(line.l.from) ?? 0);
          const gb = Math.min(MAX_GEN, gens.get(line.l.to) ?? 0);
          return (
            <motion.path
              key={line.key}
              d={railPath(
                a * ROW_H + ROW_H / 2,
                ga,
                b * ROW_H + ROW_H / 2,
                gb,
                !line.fromCause,
              )}
              fill="none"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={line.l.via ? "2 3.5" : undefined}
              className="stroke-[var(--cl-ink)]"
              initial={
                motionSafe && !line.l.via ? { pathLength: 0 } : { opacity: 0 }
              }
              animate={
                motionSafe && !line.l.via ? { pathLength: 1 } : { opacity: 1 }
              }
              transition={
                motionSafe && !line.l.via
                  ? { ...springs.glide, delay: line.delay }
                  : {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: motionSafe ? line.delay : 0,
                    }
              }
            />
          );
        })}
      </g>
    </svg>
  );

  const selectedDirect = selected && selectedShown ? directOf(selected) : null;

  const jumpClass = cn(
    "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 font-mono text-[11px] text-ink-2 tabular-nums transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
    FOCUS,
  );
  const isPinned = !!selectedEvent && pin === selectedEvent.id;

  const inspector = (
    <div className="shrink-0 border-t border-hairline px-4 py-3">
      {selectedEvent && selectedShown && selectedDirect ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 text-[13px] leading-[18px] font-medium text-foreground">
                {selectedEvent.title}
              </p>
              <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                {ago(selectedEvent.at, now)}
              </span>
            </div>
            {selectedEvent.detail ? (
              <p className="line-clamp-2 text-[12px] leading-4 text-ink-2">
                {selectedEvent.detail}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-label={`Jump to the nearest cause: ${plural(selectedDirect.causes.length, "cause")}`}
              aria-disabled={
                disabled || selectedDirect.causes.length === 0 || undefined
              }
              onClick={() => {
                const target = selectedDirect.causes[0];
                if (target) select(target, true);
              }}
              className={jumpClass}
            >
              <ArrowUp aria-hidden className="size-3" />
              {plural(selectedDirect.causes.length, "cause")}
            </button>
            <button
              type="button"
              aria-label={`Jump to the nearest effect: ${plural(selectedDirect.effects.length, "effect")}`}
              aria-disabled={
                disabled || selectedDirect.effects.length === 0 || undefined
              }
              onClick={() => {
                const target = selectedDirect.effects[0];
                if (target) select(target, true);
              }}
              className={jumpClass}
            >
              <ArrowDown aria-hidden className="size-3" />
              {plural(selectedDirect.effects.length, "effect")}
            </button>
            <button
              type="button"
              aria-pressed={isPinned}
              aria-label="Pin chain"
              aria-disabled={disabled || undefined}
              onClick={togglePin}
              className={cn(
                "ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border px-2 text-[12px] transition-colors",
                isPinned
                  ? "border-[var(--cl-soft)] bg-[var(--cl-wash)] text-[var(--cl-ink)]"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <motion.span
                key={isPinned ? `pin-${pinStamp}` : "unpin"}
                aria-hidden
                className="inline-flex"
                initial={isPinned && motionSafe ? { scale: 1.4 } : false}
                animate={{ scale: 1 }}
                transition={motionSafe ? springs.recoil : { duration: 0 }}
              >
                {isPinned ? (
                  <Pin className="size-3.5" />
                ) : (
                  <PinOff className="size-3.5" />
                )}
              </motion.span>
              <span className="hidden @min-[18.75rem]:inline">
                {isPinned ? "Pinned" : "Pin chain"}
              </span>
            </button>
          </div>
          {pinnedEvent && !isPinned ? (
            <p className="flex items-center gap-1.5 text-[12px] leading-4 text-ink-3">
              <Pin
                aria-hidden
                className="size-3 shrink-0 text-[var(--cl-ink)]"
              />
              <span
                title={pinnedEvent.title}
                className="min-w-0 truncate"
              >{`Lit: ${pinnedEvent.title}`}</span>
              <button
                type="button"
                onClick={unpin}
                className={cn(
                  "shrink-0 rounded-1 text-[var(--cl-ink)] underline-offset-2 hover:underline",
                  FOCUS,
                )}
              >
                Unpin
              </button>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[12px] leading-4 text-ink-3">
          Select an event to trace what set it off and what it set off.
        </p>
      )}
    </div>
  );

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-busy
        className="flex flex-col gap-0 px-2 py-1 @min-[18.75rem]:pl-[44px]"
      >
        <span className="sr-only">Loading events</span>
        {[0.7, 0.55, 0.8, 0.6, 0.72, 0.5].map((w, i) => (
          <div
            key={i}
            aria-hidden
            className="flex items-center gap-2"
            style={{ height: ROW_H }}
          >
            <span className="size-[18px] shrink-0 rounded-full bg-surface-2" />
            <span className="flex flex-1 flex-col gap-1.5">
              <span
                className="h-2.5 rounded-full bg-surface-2"
                style={{ width: `${Math.round(w * 100)}%` }}
              />
              <span className="h-2 w-1/3 rounded-full bg-surface-2" />
            </span>
          </div>
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-ink-2">The feed didn’t load.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (status === "empty" || ordered.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <Activity aria-hidden className="size-5 text-ink-3" />
        <p className="text-[13px] text-ink-2">No events yet.</p>
        <p className="text-[12px] text-ink-3">
          Agents write here as they work; causes link up as they arrive.
        </p>
      </div>
    );
  } else {
    body = (
      <div
        role="listbox"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        onKeyDown={onListKey}
        className="relative flex flex-col"
        style={{ height: listH }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {rows}
        </AnimatePresence>
        {chainSvg}
        {railSvg}
      </div>
    );
  }

  const ready = status === "live" || status === "paused";

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      {header}
      {ready && ordered.length > 0 ? chips : null}
      <div className="relative flex flex-1 flex-col overflow-hidden border-t border-hairline">
        <motion.div
          ref={scrollerRef}
          layoutScroll
          onScroll={onFeedScroll}
          className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain py-1"
        >
          {body}
        </motion.div>
        <AnimatePresence>
          {ready && unseen > 0 ? (
            <motion.button
              key="unseen"
              type="button"
              onClick={() => {
                const scroller = scrollerRef.current;
                scroller?.scrollTo({
                  top: scroller.scrollHeight,
                  behavior: motionSafe ? "smooth" : "auto",
                });
              }}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                y: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
              className={cn(
                "absolute bottom-2 left-1/2 inline-flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--cl-soft)] bg-background px-2.5 text-[12px] text-[var(--cl-ink)] shadow-sm",
                FOCUS,
              )}
            >
              <ArrowDown aria-hidden className="size-3" />
              {`${unseen} new below`}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
      {ready && ordered.length > 0 ? inspector : null}
      <p id={hintId} className="sr-only">
        Up and Down walk the feed. Shift with Up or Down jumps to the nearest
        cause or effect. P pins the chain, Escape unpins it.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
