"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { CornerDownLeft, FileText, Plus, RotateCcw } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type SigilGlyphStyle = "line" | "tile" | "keycap";
export type SigilAccent = "cobalt" | "plum" | "mint" | "ink";
export type SigilStatus = "ready" | "loading" | "error";
export type SigilIcon = "commands" | "people" | "projects" | "files";
export type SigilPresence = "available" | "busy" | "away" | "offline";

export type SigilMode = {
  id: string;
  /** The first character that enters the mode. */
  sigil: string;
  /** Named in hints, group headings and announcements. */
  label: string;
  /** Which icon the sigil morphs into. */
  icon: SigilIcon;
  /** The field's placeholder in this mode. */
  placeholder: string;
  /** The hint's words ("Run a command"). */
  hint: string;
  /** Degrees the mode's colour is turned from the accent's hue. */
  hue: number;
  /** The create row's verb when nothing matches ("Invite"). Omit for no create row. */
  createVerb?: string;
  /** Shown when nothing matches and there is no create row. */
  empty?: string;
};

export type SigilItem = {
  id: string;
  /** The mode it belongs to. */
  mode: string;
  label: string;
  /** A quiet line after the label: a role, a count, a folder. */
  detail?: string;
  keywords?: string[];
  /** Commands: keys shown at the row's end. Display only. */
  shortcut?: string[];
  /** People: whether they can be reached. */
  presence?: SigilPresence;
  /** Files: when it last changed, in ms. */
  updated?: number;
};

export type SigilPaletteProps = {
  /** How the glyph at the start of the field is drawn. @default "line" */
  glyphStyle?: SigilGlyphStyle;
  /** How strongly the field takes the mode's colour, in percent. @default 12 */
  tint?: number;
  /** The base hue every mode's colour is turned from. A name or any CSS colour. @default "cobalt" */
  accent?: SigilAccent | (string & {});
  /** The modes, in Tab order. @default defaultSigilModes */
  modes?: SigilMode[];
  /** Everything that can be found, each in its mode. @default defaultSigilItems */
  items?: SigilItem[];
  /** Ids shown under Recent while the field is empty, newest first. @default defaultSigilRecent */
  recent?: string[];
  /** Controlled mode: "all" or a mode id. */
  mode?: string;
  /** Initial mode when uncontrolled. @default "all" */
  defaultMode?: string;
  /** Fires from the key, Tab or click that changed the mode. */
  onModeChange?: (mode: string) => void;
  /** Controlled query (without the sigil). */
  query?: string;
  /** Initial query when uncontrolled. @default "" */
  defaultQuery?: string;
  /** Fires with every keystroke's new query. */
  onQueryChange?: (query: string) => void;
  /** A result was chosen, with the mode it was found in. */
  onSelect?: (item: SigilItem, mode: string) => void;
  /** The create row was chosen, with its mode and the query. */
  onCreate?: (mode: string, query: string) => void;
  /** Modes whose results are still arriving: skeleton rows. @default [] */
  loadingModes?: string[];
  /** Whether anything has arrived: a message with Try again on error. @default "ready" */
  status?: SigilStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The time file ages are read from, in ms. @default defaultSigilNow */
  now?: number;
  /** Most results listed for a query. @default 8 */
  maxResults?: number;
  /** The field's placeholder with no mode. @default "Search Coldbrook…" */
  placeholder?: string;
  /** The field's accessible name with no mode. @default "Search Coldbrook" */
  label?: string;
  /** Escape with nothing to clear and no mode. Without it Escape is left to the page. */
  onDismiss?: () => void;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

/** Friday 16 October 2026, 13:20 UTC. */
export const defaultSigilNow = Date.UTC(2026, 9, 16, 13, 20);
const HOUR = 3_600_000;

export const defaultSigilModes: SigilMode[] = [
  {
    id: "commands",
    sigil: ">",
    label: "Commands",
    icon: "commands",
    placeholder: "Run a command…",
    hint: "Run a command",
    hue: 0,
    empty: "No command by that name. Try “deploy” or “page”.",
  },
  {
    id: "people",
    sigil: "@",
    label: "People",
    icon: "people",
    placeholder: "Find a person…",
    hint: "Find a person",
    hue: 60,
    createVerb: "Invite",
  },
  {
    id: "projects",
    sigil: "#",
    label: "Projects",
    icon: "projects",
    placeholder: "Find a project…",
    hint: "Open a project",
    hue: 150,
    createVerb: "Create project",
  },
  {
    id: "files",
    sigil: "/",
    label: "Files",
    icon: "files",
    placeholder: "Find a file…",
    hint: "Open a file",
    hue: 250,
    createVerb: "New file",
  },
];

export const defaultSigilItems: SigilItem[] = [
  {
    id: "cmd-pause",
    mode: "commands",
    label: "Pause deploys",
    detail: "Holds every pipeline",
    shortcut: ["G", "P"],
    keywords: ["freeze", "stop"],
  },
  {
    id: "cmd-page",
    mode: "commands",
    label: "Page the on-call engineer",
    detail: "Ada Moreno is on call",
    shortcut: ["G", "O"],
    keywords: ["alert", "call"],
  },
  {
    id: "cmd-incident",
    mode: "commands",
    label: "Open an incident",
    detail: "Starts a channel and a timeline",
    shortcut: ["G", "I"],
    keywords: ["outage"],
  },
  {
    id: "cmd-banner",
    mode: "commands",
    label: "Toggle the maintenance banner",
    detail: "Shown to every customer",
    keywords: ["status"],
  },
  {
    id: "cmd-reconcile",
    mode: "commands",
    label: "Run the nightly reconcile now",
    detail: "About 4 minutes",
    keywords: ["ledger", "batch"],
  },
  {
    id: "cmd-rotate",
    mode: "commands",
    label: "Rotate the signing key",
    detail: "Needs a second approver",
    keywords: ["security", "secret"],
  },
  {
    id: "ada",
    mode: "people",
    label: "Ada Moreno",
    detail: "On call · Payments",
    presence: "available",
    keywords: ["payments", "oncall"],
  },
  {
    id: "kofi",
    mode: "people",
    label: "Kofi Mensah",
    detail: "Ledger",
    presence: "busy",
    keywords: ["ledger"],
  },
  {
    id: "juno",
    mode: "people",
    label: "Juno Vale",
    detail: "Support lead",
    presence: "away",
    keywords: ["support"],
  },
  {
    id: "ines",
    mode: "people",
    label: "Ines Park",
    detail: "Design",
    presence: "available",
    keywords: ["design"],
  },
  {
    id: "tomas",
    mode: "people",
    label: "Tomas Reyes",
    detail: "Platform",
    presence: "offline",
    keywords: ["platform", "infra"],
  },
  {
    id: "mara",
    mode: "people",
    label: "Mara Ilic",
    detail: "Risk",
    presence: "available",
    keywords: ["risk", "fraud"],
  },
  {
    id: "ledger-migration",
    mode: "projects",
    label: "ledger-migration",
    detail: "12 open · Kofi",
    keywords: ["ledger"],
  },
  {
    id: "vault-rotation",
    mode: "projects",
    label: "vault-rotation",
    detail: "3 open · Tomas",
    keywords: ["security"],
  },
  {
    id: "settlement-latency",
    mode: "projects",
    label: "settlement-latency",
    detail: "7 open · Ada",
    keywords: ["payments", "slow"],
  },
  {
    id: "dispute-flow",
    mode: "projects",
    label: "dispute-flow",
    detail: "5 open · Mara",
    keywords: ["risk"],
  },
  {
    id: "status-page",
    mode: "projects",
    label: "status-page",
    detail: "2 open · Juno",
    keywords: ["support"],
  },
  {
    id: "failover",
    mode: "files",
    label: "runbooks/failover.md",
    updated: defaultSigilNow - 3 * HOUR,
    keywords: ["outage", "runbook"],
  },
  {
    id: "pause-runbook",
    mode: "files",
    label: "runbooks/pause-deploys.md",
    updated: defaultSigilNow - 26 * HOUR,
    keywords: ["deploy"],
  },
  {
    id: "latency-board",
    mode: "files",
    label: "dashboards/settlement-latency.json",
    updated: defaultSigilNow - 5 * HOUR,
    keywords: ["payments"],
  },
  {
    id: "q3-incidents",
    mode: "files",
    label: "reports/q3-incidents.pdf",
    updated: defaultSigilNow - 9 * 24 * HOUR,
    keywords: ["report"],
  },
  {
    id: "access-review",
    mode: "files",
    label: "policies/access-review.md",
    updated: defaultSigilNow - 40 * HOUR,
    keywords: ["security"],
  },
];

export const defaultSigilRecent = [
  "cmd-pause",
  "ada",
  "ledger-migration",
  "failover",
];

const ACCENTS: Record<SigilAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const PRESENCE: Record<SigilPresence, string> = {
  available: "bg-success",
  busy: "bg-danger",
  away: "bg-warn",
  offline: "bg-ink-3",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ALL = "all";
const ROW_H = 40;
const MAX_BODY = 320;
const NARROW = 544;
const EMPTY: string[] = [];

/* ------------------------------ glyph shapes ------------------------------ */

type Pt = [number, number];
/** A stroke of nine points; `smooth` 0 is straight segments, 1 a full curve; `on` its opacity. */
type Stroke = { pts: Pt[]; smooth: number; closed: number; on: number };
type Shape = [Stroke, Stroke, Stroke, Stroke];

const N = 9;

/** Vertices kept, the longest segment split until there are nine points, so corners survive. */
const resample = (vertices: Pt[]): Pt[] => {
  const pts = vertices.map((p) => [p[0], p[1]] as Pt);
  while (pts.length < N) {
    let at = 0;
    let best = -1;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > best) {
        best = d;
        at = i;
      }
    }
    const a = pts[at];
    const b = pts[at + 1];
    if (!a || !b) break;
    pts.splice(at + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return pts.slice(0, N);
};

const line = (vertices: Pt[], smooth = 0, closed = 0): Stroke => ({
  pts: resample(vertices),
  smooth,
  closed,
  on: 1,
});

const ring = (
  cx: number,
  cy: number,
  rx: number,
  ry = rx,
  from = -90,
  to = 270,
  closed = 1,
): Stroke => ({
  pts: Array.from({ length: N }, (_, i) => {
    const a = ((from + ((to - from) * i) / (N - 1)) * Math.PI) / 180;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  }),
  smooth: 1,
  closed,
  on: 1,
});

const off = (x: number, y: number): Stroke => ({
  pts: Array.from({ length: N }, () => [x, y] as Pt),
  smooth: 0,
  closed: 0,
  on: 0,
});

const SEARCH: Shape = [
  ring(10.5, 10.5, 6.2),
  line([
    [15.2, 15.2],
    [20, 20],
  ]),
  off(17.5, 17.5),
  off(17.5, 17.5),
];

const SIGILS: Record<SigilIcon, Shape> = {
  commands: [
    line([
      [7.5, 5],
      [15.5, 12],
      [7.5, 19],
    ]),
    off(12, 12),
    off(12, 12),
    off(12, 12),
  ],
  people: [
    ring(12, 12, 3.4),
    ring(12, 12, 8.2, 8.2, 32, 322, 0),
    line(
      [
        [15.4, 8.6],
        [15.4, 13.4],
        [17.2, 15.6],
        [19.6, 14.9],
      ],
      0.7,
    ),
    off(12, 12),
  ],
  projects: [
    line([
      [10, 4],
      [8, 20],
    ]),
    line([
      [17, 4],
      [15, 20],
    ]),
    line([
      [4.5, 9],
      [20, 9],
    ]),
    line([
      [4, 15],
      [19.5, 15],
    ]),
  ],
  files: [
    line([
      [16.5, 4],
      [7.5, 20],
    ]),
    off(12, 12),
    off(12, 12),
    off(12, 12),
  ],
};

const ICONS: Record<SigilIcon, Shape> = {
  commands: [
    line(
      [
        [3.5, 5],
        [20.5, 5],
        [20.5, 19],
        [3.5, 19],
        [3.5, 5],
      ],
      0.18,
      1,
    ),
    line([
      [7.5, 9.5],
      [10.5, 12],
      [7.5, 14.5],
    ]),
    line([
      [12.5, 14.5],
      [16.5, 14.5],
    ]),
    off(14.5, 14.5),
  ],
  people: [
    ring(12, 8.4, 3.6),
    ring(12, 21, 7.6, 6.6, 180, 360, 0),
    off(12, 16),
    off(12, 16),
  ],
  projects: [
    line(
      [
        [3.5, 4.5],
        [20.5, 4.5],
        [20.5, 19.5],
        [3.5, 19.5],
        [3.5, 4.5],
      ],
      0.18,
      1,
    ),
    line([
      [8.5, 8.5],
      [8.5, 15.5],
    ]),
    line([
      [12, 8.5],
      [12, 12.5],
    ]),
    line([
      [15.5, 8.5],
      [15.5, 14],
    ]),
  ],
  files: [
    line(
      [
        [6, 3.5],
        [14, 3.5],
        [19, 8.5],
        [19, 20.5],
        [6, 20.5],
        [6, 3.5],
      ],
      0,
      1,
    ),
    line([
      [14, 3.5],
      [14, 8.5],
      [19, 8.5],
    ]),
    line([
      [9, 13],
      [16, 13],
    ]),
    line([
      [9, 16.5],
      [14, 16.5],
    ]),
  ],
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const f2 = (v: number) => Math.round(v * 100) / 100;

const mix = (a: Shape, b: Shape, t: number): Shape =>
  a.map((s, i) => {
    const e = b[i] ?? s;
    return {
      pts: s.pts.map((p, j) => {
        const q = e.pts[j] ?? p;
        return [lerp(p[0], q[0], t), lerp(p[1], q[1], t)] as Pt;
      }),
      smooth: lerp(s.smooth, e.smooth, Math.min(1, Math.max(0, t))),
      closed: lerp(s.closed, e.closed, Math.min(1, Math.max(0, t))),
      on: Math.min(1, Math.max(0, lerp(s.on, e.on, t))),
    };
  }) as Shape;

/**
 * A stroke as cubic segments through its points. Tangents come from the
 * neighbours (Catmull-Rom); a closed stroke borrows them across its seam, an
 * open one does not, and `closed` blends the two so a morph has no jump.
 */
const pathOf = (s: Stroke): string => {
  const p = s.pts;
  const first = p[0];
  if (!first) return "";
  let d = `M${f2(first[0])} ${f2(first[1])}`;
  const k = s.smooth / 6;
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[i] ?? first;
    const b = p[i + 1] ?? a;
    const prevOpen = p[i - 1] ?? a;
    const prevClosed = p[i - 1] ?? p[p.length - 2] ?? a;
    const nextOpen = p[i + 2] ?? b;
    const nextClosed = p[i + 2] ?? p[1] ?? b;
    const prev: Pt = [
      lerp(prevOpen[0], prevClosed[0], s.closed),
      lerp(prevOpen[1], prevClosed[1], s.closed),
    ];
    const next: Pt = [
      lerp(nextOpen[0], nextClosed[0], s.closed),
      lerp(nextOpen[1], nextClosed[1], s.closed),
    ];
    const c1: Pt = [a[0] + (b[0] - prev[0]) * k, a[1] + (b[1] - prev[1]) * k];
    const c2: Pt = [b[0] - (next[0] - a[0]) * k, b[1] - (next[1] - a[1]) * k];
    d += ` C${f2(c1[0])} ${f2(c1[1])} ${f2(c2[0])} ${f2(c2[1])} ${f2(b[0])} ${f2(b[1])}`;
  }
  return d;
};

/* -------------------------------- helpers -------------------------------- */

const matches = (item: SigilItem, query: string) => {
  const q = query.toLowerCase().trim();
  if (!q) return true;
  const hay = [item.label, item.detail ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
};

const ago = (now: number, at: number) => {
  const h = Math.round((now - at) / HOUR);
  if (h < 1) return "now";
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

type Row =
  | { key: string; kind: "item"; item: SigilItem; mode: string }
  | { key: string; kind: "create"; mode: string; query: string };

type Section = { id: string; label: string; rows: Row[]; note?: string };

/* --------------------------------- glyph --------------------------------- */

function Glyph({
  paths,
  opacities,
  x,
  fade,
}: {
  paths: MotionValue<string>[];
  opacities: MotionValue<number>[];
  x: MotionValue<number>;
  fade: MotionValue<number>;
}) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 24 24"
      className="block size-[18px] overflow-visible"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ x, opacity: fade }}
    >
      {paths.map((d, i) => (
        <motion.path key={i} d={d} style={{ opacity: opacities[i] }} />
      ))}
    </motion.svg>
  );
}

/* -------------------------------- component ------------------------------- */

/**
 * One field whose first character picks what it searches: > for commands, @
 * for people, # for projects, / for files. The symbol you type lands in the
 * glyph slot at the start of the field and morphs into that mode's icon on
 * the snap spring — four strokes of nine points each, interpolated and
 * rebuilt every frame — while the field takes the mode's colour, the caret
 * follows, and the results cross-fade to the mode's own list as its height
 * glides. Backspace on an empty query morphs the icon back into the
 * magnifier; Tab and Shift+Tab morph icon to icon through the modes.
 *
 * Every mode has its own empty state (most offer to create), its own loading
 * rows and its own recents. The field is a combobox; Escape clears, then
 * leaves the mode, then dismisses — and an Escape with nothing to do lets the
 * next Tab leave the field. Under reduced motion the glyph cross-fades.
 */
export function SigilPalette({
  glyphStyle = "line",
  tint = 12,
  accent = "cobalt",
  modes = defaultSigilModes,
  items = defaultSigilItems,
  recent = defaultSigilRecent,
  mode,
  defaultMode = ALL,
  onModeChange,
  query,
  defaultQuery = "",
  onQueryChange,
  onSelect,
  onCreate,
  loadingModes = EMPTY,
  status = "ready",
  onRetry,
  now = defaultSigilNow,
  maxResults = 8,
  placeholder = "Search Coldbrook…",
  label = "Search Coldbrook",
  onDismiss,
  className,
}: SigilPaletteProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;

  const [ownMode, setOwnMode] = React.useState(defaultMode);
  const current = mode ?? ownMode;
  const activeMode = modes.find((m) => m.id === current) ?? null;
  const modeId = activeMode ? activeMode.id : ALL;
  const [ownQuery, setOwnQuery] = React.useState(defaultQuery);
  const q = query ?? ownQuery;
  const [active, setActive] = React.useState(0);
  const [said, setSaid] = React.useState("");
  const [width, setWidth] = React.useState(0);
  const [rootEl, setRootEl] = React.useState<HTMLDivElement | null>(null);
  const [panelEl, setPanelEl] = React.useState<HTMLDivElement | null>(null);
  const [panelH, setPanelH] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const released = React.useRef(false);

  const narrow = width > 0 && width < NARROW;

  React.useEffect(() => {
    if (!rootEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(rootEl);
    return () => ro.disconnect();
  }, [rootEl]);

  // The height follows the panel that has just arrived, bound when it arrives.
  React.useEffect(() => {
    if (!panelEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setPanelH(Math.round(entry.borderBoxSize[0]?.blockSize ?? 0));
    });
    ro.observe(panelEl);
    return () => ro.disconnect();
  }, [panelEl]);

  /* ------------------------------- the glyph ------------------------------- */

  const shapeOf = (id: string): Shape => {
    const m = modes.find((x) => x.id === id);
    return m ? ICONS[m.icon] : SEARCH;
  };
  const initialShape = shapeOf(modeId);
  const p0 = useMotionValue(pathOf(initialShape[0]));
  const p1 = useMotionValue(pathOf(initialShape[1]));
  const p2 = useMotionValue(pathOf(initialShape[2]));
  const p3 = useMotionValue(pathOf(initialShape[3]));
  const o0 = useMotionValue(initialShape[0].on);
  const o1 = useMotionValue(initialShape[1].on);
  const o2 = useMotionValue(initialShape[2].on);
  const o3 = useMotionValue(initialShape[3].on);
  const glyphX = useMotionValue(0);
  const glyphFade = useMotionValue(1);
  const shown = React.useRef<{ mode: string; shape: Shape }>({
    mode: modeId,
    shape: initialShape,
  });
  const morphRun = React.useRef<AnimationPlaybackControls[]>([]);

  const paint = React.useCallback(
    (s: Shape) => {
      const ps = [p0, p1, p2, p3];
      const os = [o0, o1, o2, o3];
      s.forEach((stroke, i) => {
        ps[i]?.set(pathOf(stroke));
        os[i]?.set(f2(stroke.on));
      });
    },
    [p0, p1, p2, p3, o0, o1, o2, o3],
  );

  // One place morphs the glyph, whoever changed the mode: entering from no
  // mode starts on the typed symbol, slid in from where it was typed; leaving
  // goes back to the magnifier; Tab goes icon to icon. An interrupted morph
  // starts from the in-between shape it had reached.
  React.useEffect(() => {
    const before = shown.current;
    if (before.mode === modeId) return;
    const target = shapeOf(modeId);
    const entering = before.mode === ALL && activeMode;
    const from = entering ? SIGILS[activeMode.icon] : before.shape;
    shown.current = { mode: modeId, shape: target };
    for (const r of morphRun.current) r.stop();
    if (!motionSafe) {
      paint(target);
      glyphFade.jump(0.2);
      morphRun.current = [animate(glyphFade, 1, { duration: durations.fast })];
      return;
    }
    paint(from);
    if (entering) glyphX.jump(10);
    morphRun.current = [
      animate(0, 1, {
        ...springs.snap,
        onUpdate: (t) => {
          const s = mix(from, target, t);
          shown.current = { mode: modeId, shape: s };
          paint(s);
        },
        onComplete: () => {
          shown.current = { mode: modeId, shape: target };
        },
      }),
      animate(glyphX, 0, springs.snap),
    ];
    // Deliberately no cleanup: a rehearsal re-run must not freeze the morph.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeId, motionSafe]);

  React.useEffect(
    () => () => {
      for (const r of morphRun.current) r.stop();
    },
    [],
  );

  /* ------------------------------- the lists ------------------------------- */

  const sections = React.useMemo<Section[]>(() => {
    if (status !== "ready") return [];
    const trimmed = q.trim();
    const byId = new Map(items.map((it) => [it.id, it]));
    if (!activeMode) {
      if (!trimmed) {
        const rows = recent
          .map((id) => byId.get(id))
          .filter((it): it is SigilItem => Boolean(it))
          .map<Row>((item) => ({
            key: item.id,
            kind: "item",
            item,
            mode: item.mode,
          }));
        return rows.length ? [{ id: "recent", label: "Recent", rows }] : [];
      }
      return modes
        .map((m) => ({
          id: m.id,
          label: m.label,
          rows: items
            .filter((it) => it.mode === m.id && matches(it, trimmed))
            .slice(0, 3)
            .map<Row>((item) => ({
              key: item.id,
              kind: "item",
              item,
              mode: m.id,
            })),
        }))
        .filter((s) => s.rows.length);
    }
    const own = items.filter((it) => it.mode === activeMode.id);
    if (!trimmed) {
      const recents = recent
        .map((id) => byId.get(id))
        .filter(
          (it): it is SigilItem => Boolean(it) && it?.mode === activeMode.id,
        );
      const rest = own
        .filter((it) => !recents.includes(it))
        .slice(0, Math.max(0, maxResults - recents.length));
      return [
        {
          id: "recent",
          label: "Recent",
          rows: recents.map<Row>((item) => ({
            key: item.id,
            kind: "item",
            item,
            mode: activeMode.id,
          })),
        },
        {
          id: "all",
          label: activeMode.label,
          rows: rest.map<Row>((item) => ({
            key: item.id,
            kind: "item",
            item,
            mode: activeMode.id,
          })),
        },
      ].filter((s) => s.rows.length);
    }
    const found = own.filter((it) => matches(it, trimmed)).slice(0, maxResults);
    if (found.length) {
      return [
        {
          id: "found",
          label: activeMode.label,
          rows: found.map<Row>((item) => ({
            key: item.id,
            kind: "item",
            item,
            mode: activeMode.id,
          })),
        },
      ];
    }
    return [
      {
        id: "empty",
        label: "",
        note: activeMode.createVerb
          ? `No ${activeMode.label.toLowerCase()} match “${trimmed}”.`
          : (activeMode.empty ?? `Nothing matches “${trimmed}”.`),
        rows: activeMode.createVerb
          ? [
              {
                key: `create-${activeMode.id}`,
                kind: "create",
                mode: activeMode.id,
                query: trimmed,
              },
            ]
          : [],
      },
    ];
  }, [status, q, items, activeMode, modes, recent, maxResults]);
  const rows = sections.flatMap((s) => s.rows);
  const index = Math.min(active, Math.max(0, rows.length - 1));
  const activeRow = rows[index];
  const loading = loadingModes.includes(modeId);

  /* -------------------------------- changes -------------------------------- */

  const setMode = (next: string, how: "typed" | "tab" | "click" | "back") => {
    if (next === modeId) return;
    if (mode === undefined) setOwnMode(next);
    onModeChange?.(next);
    setActive(0);
    const m = modes.find((x) => x.id === next);
    setSaid(
      m
        ? `${m.label}. ${m.hint}.`
        : how === "back"
          ? "Searching everything."
          : "Searching everything.",
    );
  };

  const setQ = (value: string) => {
    if (query === undefined) setOwnQuery(value);
    onQueryChange?.(value);
    setActive(0);
  };

  const cycle = (dir: 1 | -1) => {
    const order = [ALL, ...modes.map((m) => m.id)];
    const at = order.indexOf(modeId);
    const next = order[(at + dir + order.length) % order.length] ?? ALL;
    setMode(next, "tab");
  };

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "create") {
      const m = modes.find((x) => x.id === row.mode);
      setSaid(`${m?.createVerb ?? "Create"} “${row.query}”.`);
      onCreate?.(row.mode, row.query);
      return;
    }
    setSaid(`Opened ${row.item.label}.`);
    onSelect?.(row.item, row.mode);
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    released.current = false;
    // A symbol typed at the start of an empty, modeless field is consumed: it
    // becomes the mode, and anything typed after it is the query.
    if (!activeMode && q === "") {
      const m = modes.find((x) => value.startsWith(x.sigil));
      if (m) {
        setQ(value.slice(m.sigil.length).trimStart());
        setMode(m.id, "typed");
        return;
      }
    }
    setQ(value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const field = event.currentTarget;
    if (event.key !== "Tab" && event.key !== "Escape") released.current = false;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive(Math.min(rows.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(Math.max(0, index - 1));
        break;
      case "Enter":
        if (!rows.length) return;
        event.preventDefault();
        choose(activeRow);
        break;
      case "Tab":
        if (released.current) {
          released.current = false;
          return;
        }
        event.preventDefault();
        cycle(event.shiftKey ? -1 : 1);
        break;
      case "Backspace":
        if (activeMode && field.value === "" && field.selectionStart === 0) {
          event.preventDefault();
          setMode(ALL, "back");
        }
        break;
      case "Escape":
        if (field.value) {
          event.preventDefault();
          setQ("");
        } else if (activeMode) {
          event.preventDefault();
          setMode(ALL, "back");
        } else if (onDismiss) {
          event.preventDefault();
          onDismiss();
        } else {
          // Nothing to do here: the next Tab may leave the field.
          released.current = true;
        }
        break;
      default:
        break;
    }
  };

  /* --------------------------------- render -------------------------------- */

  const accentVar = ACCENTS[accent as SigilAccent] ?? accent;
  const modeColour = (m: SigilMode | null) =>
    m ? `oklch(from var(--sp-accent) l c calc(h + ${m.hue}))` : "var(--ink-3)";
  const t = Math.min(40, Math.max(0, tint));
  const optionId = (key: string) => `${uid}-opt-${key}`;
  const fieldName = activeMode
    ? `Search ${activeMode.label.toLowerCase()}`
    : label;

  const hints = (
    <>
      {modes.map((m) => {
        const on = m.id === modeId;
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={on}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              setMode(on ? ALL : m.id, "click");
              inputRef.current?.focus();
            }}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs transition-colors",
              on
                ? "border-transparent text-foreground"
                : "border-hairline text-ink-2 hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] hover:text-foreground",
              FOCUS,
            )}
            style={
              on
                ? {
                    backgroundColor: `color-mix(in oklab, ${modeColour(m)} 16%, transparent)`,
                  }
                : undefined
            }
          >
            <kbd
              className="grid size-4 place-items-center rounded-[4px] font-mono text-[11px] leading-none font-semibold"
              style={{ color: modeColour(m) }}
            >
              {m.sigil}
            </kbd>
            {m.label}
          </button>
        );
      })}
    </>
  );

  const renderRow = (row: Row) => {
    const at = rows.indexOf(row);
    const on = at === index;
    const m = modes.find((x) => x.id === row.mode) ?? null;
    const colour = modeColour(m);
    if (row.kind === "create") {
      return (
        <div
          key={row.key}
          id={optionId(row.key)}
          role="option"
          aria-selected={on}
          aria-label={`${m?.createVerb ?? "Create"} “${row.query}”`}
          onPointerDown={(event) => event.preventDefault()}
          onPointerMove={() => !on && setActive(at)}
          onClick={() => choose(row)}
          className="relative mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-2 px-2.5 select-none"
          style={{ height: ROW_H }}
        >
          {on ? <Pill uid={uid} motionSafe={motionSafe} /> : null}
          <span
            aria-hidden
            className="relative grid size-6 shrink-0 place-items-center rounded-2 border border-dashed"
            style={{ borderColor: colour, color: colour }}
          >
            <Plus className="size-3.5" />
          </span>
          <span
            className="relative min-w-0 flex-1 truncate text-[13px]"
            style={{ color: colour }}
          >
            {`${m?.createVerb ?? "Create"} “${m?.id === "projects" ? "#" : m?.id === "files" ? "/" : ""}${row.query}”`}
          </span>
        </div>
      );
    }
    const item = row.item;
    const name = [
      item.label,
      item.detail,
      m && !activeMode ? m.label.replace(/s$/, "").toLowerCase() : null,
    ]
      .filter(Boolean)
      .join(", ");
    const slash = item.label.lastIndexOf("/");
    return (
      <div
        key={row.key}
        id={optionId(row.key)}
        role="option"
        aria-selected={on}
        aria-label={name}
        onPointerDown={(event) => event.preventDefault()}
        onPointerMove={() => !on && setActive(at)}
        onClick={() => {
          setActive(at);
          choose(row);
        }}
        className="relative mx-1.5 flex cursor-pointer items-center gap-2.5 rounded-2 px-2.5 select-none"
        style={{ height: ROW_H }}
      >
        {on ? <Pill uid={uid} motionSafe={motionSafe} /> : null}
        {m?.icon === "people" ? (
          <span
            aria-hidden
            className="relative grid size-6 shrink-0 place-items-center rounded-full text-[9.5px] font-semibold"
            style={{
              // Pigment at a fixed lightness, so the avatar reads in both themes.
              backgroundColor: `oklch(from ${colour} 0.84 0.06 h)`,
              color: `oklch(from ${colour} 0.36 0.08 h)`,
            }}
          >
            {initials(item.label)}
          </span>
        ) : (
          <span
            aria-hidden
            className="relative grid size-6 shrink-0 place-items-center rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] font-mono text-[12px] leading-none font-semibold"
            style={{ color: colour }}
          >
            {m?.icon === "files" ? (
              <FileText className="size-3.5" />
            ) : (
              (m?.sigil ?? "")
            )}
          </span>
        )}
        <span className="relative flex min-w-0 flex-1 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-[13px]",
              on ? "text-foreground" : "text-ink-2",
            )}
            title={item.label}
          >
            {m?.icon === "files" && slash > -1 ? (
              <>
                <span className="text-ink-3">
                  {item.label.slice(0, slash + 1)}
                </span>
                {item.label.slice(slash + 1)}
              </>
            ) : m?.icon === "projects" ? (
              `#${item.label}`
            ) : (
              item.label
            )}
          </span>
          {item.detail ? (
            <span className="hidden min-w-0 truncate text-[11px] text-ink-3 @min-[34rem]:inline">
              {item.detail}
            </span>
          ) : null}
        </span>
        {item.shortcut ? (
          <span
            aria-hidden
            className="relative hidden shrink-0 items-center gap-1 @min-[30rem]:flex"
          >
            {item.shortcut.map((k, i) => (
              <kbd
                key={i}
                className="grid h-5 min-w-5 place-items-center rounded-1 border border-hairline px-1 font-mono text-[10px] text-ink-3"
              >
                {k}
              </kbd>
            ))}
          </span>
        ) : null}
        {item.presence ? (
          <span
            aria-hidden
            className={cn(
              "relative size-2 shrink-0 rounded-full",
              PRESENCE[item.presence],
            )}
          />
        ) : null}
        {item.updated !== undefined ? (
          <span className="relative shrink-0 font-mono text-[10.5px] text-ink-3 tabular-nums">
            {ago(now, item.updated)}
          </span>
        ) : null}
        {!activeMode ? (
          <span
            aria-hidden
            className="relative hidden shrink-0 font-mono text-[10.5px] @min-[34rem]:inline"
            style={{ color: colour }}
          >
            {m?.sigil}
          </span>
        ) : null}
      </div>
    );
  };

  const panel = (
    <div
      // The leaving panel's null is ignored: the height follows the one
      // that has just arrived.
      ref={(node) => {
        if (node) setPanelEl(node);
      }}
      className="flex flex-col py-1.5"
    >
      {status === "error" ? (
        <div className="flex flex-col items-start gap-3 px-4 py-3">
          <p className="text-[13px] text-foreground">
            Coldbrook didn’t answer.
          </p>
          <button
            type="button"
            onClick={() => onRetry?.()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        </div>
      ) : loading || status === "loading" ? (
        <div aria-hidden className="flex flex-col px-3">
          {[62, 48, 70, 54].map((w, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5"
              style={{ height: ROW_H }}
            >
              <span className="size-6 shrink-0 rounded-2 bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]" />
              <span
                className={cn(
                  "h-2.5 rounded-full bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))]",
                  motionSafe && "animate-pulse",
                )}
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>
      ) : sections.length ? (
        sections.map((section) => (
          <div
            key={section.id}
            role="group"
            aria-labelledby={`${uid}-g-${modeId}-${section.id}`}
          >
            {section.note ? (
              <p
                id={`${uid}-g-${modeId}-${section.id}`}
                className="px-4 pt-2 pb-2 text-xs text-ink-3"
              >
                {section.note}
              </p>
            ) : (
              <p
                id={`${uid}-g-${modeId}-${section.id}`}
                className="px-4 pt-2 pb-1 text-[10.5px] font-medium tracking-[0.06em] text-ink-3 uppercase"
              >
                {section.label}
              </p>
            )}
            {section.rows.map(renderRow)}
          </div>
        ))
      ) : (
        <p className="px-4 py-3 text-xs text-ink-3">{`Nothing matches “${q.trim()}”. Try a symbol: > @ # /`}</p>
      )}
    </div>
  );

  return (
    <div
      ref={setRootEl}
      className={cn("@container w-full", className)}
      style={
        {
          "--sp-accent": accentVar,
          "--sp-mode": modeColour(activeMode),
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex w-full max-w-[36rem] flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_50px_color-mix(in_oklab,black_22%,transparent)]">
        <div
          className="flex h-12 shrink-0 items-center gap-2.5 border-b px-3"
          style={{
            backgroundColor: activeMode
              ? `color-mix(in oklab, var(--sp-mode) ${t}%, var(--popover))`
              : "var(--popover)",
            borderBottomColor: activeMode
              ? `color-mix(in oklab, var(--sp-mode) ${Math.min(60, t * 2.5 + 10)}%, var(--hairline))`
              : "var(--hairline)",
            transition:
              "background-color 240ms cubic-bezier(0.22,1,0.36,1), border-color 240ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <span
            aria-hidden
            className={cn(
              "grid size-7 shrink-0 place-items-center transition-[background-color,border-color,color,box-shadow] duration-200",
              glyphStyle === "tile" && "rounded-2",
              glyphStyle === "keycap" &&
                "rounded-[7px] border border-hairline-strong bg-surface-1",
              glyphStyle === "line"
                ? "text-[var(--sp-mode)]"
                : glyphStyle === "tile"
                  ? activeMode
                    ? "text-background"
                    : "bg-[color-mix(in_oklab,var(--ink)_7%,var(--popover))] text-ink-3"
                  : "text-foreground",
            )}
            style={
              glyphStyle === "tile" && activeMode
                ? { backgroundColor: "oklch(from var(--sp-mode) 0.62 c h)" }
                : glyphStyle === "keycap"
                  ? {
                      boxShadow: `0 2px 0 ${activeMode ? "var(--sp-mode)" : "var(--hairline-strong)"}`,
                    }
                  : undefined
            }
          >
            <Glyph
              paths={[p0, p1, p2, p3]}
              opacities={[o0, o1, o2, o3]}
              x={glyphX}
              fade={glyphFade}
            />
          </span>
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeRow && !loading ? optionId(activeRow.key) : undefined
            }
            aria-label={fieldName}
            aria-describedby={hintId}
            placeholder={activeMode ? activeMode.placeholder : placeholder}
            value={q}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={onChange}
            onKeyDown={onKeyDown}
            className="h-8 min-w-0 flex-1 rounded-2 bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:outline-1 focus-visible:outline-offset-0 focus-visible:outline-ring/25 focus-visible:outline-solid"
            style={{ caretColor: activeMode ? "var(--sp-mode)" : undefined }}
          />
          {activeMode ? (
            <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[30rem]:inline">
              {activeMode.label}
            </span>
          ) : null}
          <kbd
            aria-hidden
            className="hidden h-5 shrink-0 items-center rounded-1 border border-hairline px-1.5 font-mono text-[10px] text-ink-3 @min-[30rem]:inline-flex"
          >
            ⇥
          </kbd>
        </div>
        <p id={hintId} className="sr-only">
          {`Start with a symbol to pick what to search: ${modes.map((m) => `${m.sigil} for ${m.label.toLowerCase()}`).join(", ")}. Tab changes the mode, Backspace in an empty field leaves it. Press Escape, then Tab, to leave the field.`}
        </p>

        {narrow ? (
          <div
            className="flex [scrollbar-width:none] gap-1.5 overflow-x-auto border-b border-hairline px-3 py-2"
            style={{
              maskImage:
                "linear-gradient(to right, transparent, black 12px, black calc(100% - 16px), transparent)",
              WebkitMaskImage:
                "linear-gradient(to right, transparent, black 12px, black calc(100% - 16px), transparent)",
            }}
          >
            {hints}
          </div>
        ) : null}

        <motion.div
          className="relative overflow-hidden"
          initial={false}
          animate={{
            height: panelH === null ? "auto" : Math.min(MAX_BODY, panelH),
          }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <div
            id={listId}
            role="listbox"
            aria-label={fieldName}
            aria-busy={loading || status === "loading" || undefined}
            className="grid [&>*]:[grid-area:1/1]"
          >
            <AnimatePresence initial={false}>
              <motion.div
                key={modeId}
                className="overflow-y-auto overscroll-contain"
                style={{ maxHeight: MAX_BODY }}
                initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                {panel}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-hairline px-3 py-2 text-[11px] text-ink-3">
          {narrow ? (
            <>
              <span className="inline-flex items-center gap-1">
                <kbd className="font-mono text-[10px]">⇥</kbd>
                mode
              </span>
              <span className="inline-flex items-center gap-1">
                <CornerDownLeft aria-hidden className="size-3" />
                open
              </span>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">{hints}</div>
          )}
          <span className="ml-auto font-mono text-[10px] tabular-nums">
            {loading
              ? "loading"
              : `${rows.filter((r) => r.kind === "item").length} results`}
          </span>
        </div>
      </div>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}

function Pill({ uid, motionSafe }: { uid: string; motionSafe: boolean }) {
  return (
    <motion.span
      layoutId={`${uid}-pill`}
      aria-hidden
      className="absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--sp-mode)_13%,transparent)]"
      transition={motionSafe ? springs.snap : { duration: 0 }}
    />
  );
}
