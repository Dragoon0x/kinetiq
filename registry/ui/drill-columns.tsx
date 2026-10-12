"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  DraftingCompass,
  ExternalLink,
  FileCheck,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Sheet,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type DrillKind =
  "folder" | "drawing" | "permit" | "photo" | "sheet" | "doc";

export type DrillNode = {
  id: string;
  /** Shown as is, extension included: "Plan B-02.dwg". */
  name: string;
  kind: DrillKind;
  /** A folder's contents. Leave out with `lazy` to load them on open. */
  children?: DrillNode[];
  /** The contents arrive through `loadFolder` on first open. */
  lazy?: boolean;
  /** Bytes. */
  size?: number;
  /** Last change, ms since the epoch. */
  modified?: number;
  /** Who changed it last. */
  by?: string;
};

export type DrillIconStyle = "tile" | "line" | "label";
export type DrillAccent = "cobalt" | "signal" | "amber" | "graphite";
export type DrillStatus = "ready" | "loading" | "error";

export type DrillColumnsProps = {
  /** Width of each column in px; sets how far the track slides and how much of the path stays in view. @default 200 */
  columnWidth?: number;
  /** Type icons in tinted tiles, plain line icons, or mono type labels. @default "tile" */
  iconStyle?: DrillIconStyle;
  /** Highlight, connector and folder tint: a named token, or any CSS colour. @default "cobalt" */
  accent?: DrillAccent | (string & {});
  /** The root's contents. @default defaultDrillFolders */
  folders?: DrillNode[];
  /** The root column's heading and first crumb. @default "Basinworks" */
  rootLabel?: string;
  /** Controlled path: ids from the root; a file at the end is previewed. */
  path?: string[];
  /** Initial path when uncontrolled. @default defaultDrillPath */
  defaultPath?: string[];
  /** Fires from the press or key that moved along the path. */
  onPathChange?: (path: string[]) => void;
  /** A file was opened: Enter, Open, or a double-click. */
  onOpen?: (file: DrillNode, path: string[]) => void;
  /** An item was dropped on a folder (null is the root), by drag or with M then Enter. */
  onMove?: (item: DrillNode, folder: DrillNode | null) => void;
  /** An item was renamed with F2 or Rename. */
  onRename?: (item: DrillNode, name: string) => void;
  /** Loads a lazy folder's contents on first open; a rejection offers Retry in place. */
  loadFolder?: (folder: DrillNode) => Promise<DrillNode[]>;
  /** Now, for "modified" labels (Date or ms). @default defaultDrillNow */
  now?: number | Date;
  /** Whether the tree has arrived. @default "ready" */
  status?: DrillStatus;
  /** "Try again" was pressed after the tree failed to load. */
  onRetry?: () => void;
  /** The browser's accessible name. @default "<rootLabel> files" */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** Now on the Basinworks share: 14 October 2026, 09:30. */
export const defaultDrillNow = Date.UTC(2026, 9, 14, 9, 30);

const file = (
  id: string,
  name: string,
  kind: DrillKind,
  kb: number,
  daysAgo: number,
  by: string,
): DrillNode => ({
  id,
  name,
  kind,
  size: kb * 1024,
  modified: defaultDrillNow - daysAgo * DAY,
  by,
});

export const defaultDrillFolders: DrillNode[] = [
  {
    id: "drawings",
    name: "Drawings",
    kind: "folder",
    children: [
      {
        id: "site-a",
        name: "Site A",
        kind: "folder",
        children: [
          file("plan-a-01", "Plan A-01.dwg", "drawing", 2310, 9, "Rae Okafor"),
          file("levels-a", "Levels A.dwg", "drawing", 1420, 12, "Dev Malik"),
          file(
            "sections-a",
            "Sections A.pdf",
            "drawing",
            860,
            15,
            "Rae Okafor",
          ),
        ],
      },
      {
        id: "site-b",
        name: "Site B",
        kind: "folder",
        children: [
          {
            id: "elevations",
            name: "Elevations",
            kind: "folder",
            children: [
              file(
                "elev-n",
                "North elevation.dwg",
                "drawing",
                1980,
                4,
                "Nell Ashby",
              ),
              file(
                "elev-s",
                "South elevation.dwg",
                "drawing",
                2040,
                4,
                "Nell Ashby",
              ),
            ],
          },
          file("plan-b-01", "Plan B-01.dwg", "drawing", 2650, 2, "Rae Okafor"),
          file("plan-b-02", "Plan B-02.dwg", "drawing", 2880, 0, "Dev Malik"),
          file("sections-b", "Sections.pdf", "drawing", 940, 6, "Theo Grant"),
        ],
      },
      {
        id: "details",
        name: "Details",
        kind: "folder",
        children: [
          file("kerb", "Kerb detail.dwg", "drawing", 620, 21, "Uma Solis"),
          file("manhole", "Manhole cover.dwg", "drawing", 540, 30, "Uma Solis"),
        ],
      },
    ],
  },
  {
    id: "permits",
    name: "Permits",
    kind: "folder",
    children: [
      file(
        "excavation",
        "Excavation permit.pdf",
        "permit",
        310,
        3,
        "Bea Lorne",
      ),
      file("road", "Road closure.pdf", "permit", 280, 8, "Bea Lorne"),
      file("hot-works", "Hot works.pdf", "permit", 190, 1, "Gus Hollis"),
      { id: "archive", name: "Archive", kind: "folder", children: [] },
    ],
  },
  { id: "site-photos", name: "Site photos", kind: "folder", lazy: true },
  file("programme", "Programme.xlsx", "sheet", 148, 2, "Theo Grant"),
  file("handover", "Handover notes.docx", "doc", 64, 5, "Rae Okafor"),
];

/** The contents behind the lazy "Site photos" folder, for a host's `loadFolder`. */
export const defaultDrillLazyChildren: Record<string, DrillNode[]> = {
  "site-photos": [
    file("trench-n", "Trench north.jpg", "photo", 3120, 1, "Ivy Marsh"),
    file("pump-house", "Pump house.jpg", "photo", 2870, 1, "Ivy Marsh"),
    file("chamber", "Valve chamber.jpg", "photo", 2640, 2, "Max Tully"),
    file("backfill", "Backfill day 3.jpg", "photo", 3310, 3, "Max Tully"),
  ],
};

export const defaultDrillPath = ["drawings", "site-b", "plan-b-02"];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<DrillAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const HEADER_H = 32;
const ROW_H = 32;
const NARROW = 480;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const ROW_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const KIND_TINT: Record<DrillKind, string> = {
  folder: "var(--dc-accent)",
  drawing: "var(--accent-bright)",
  permit: "var(--warn)",
  photo: "var(--success)",
  sheet: "var(--signal)",
  doc: "var(--ink-2)",
};

const KIND_ICON: Record<DrillKind, typeof Folder> = {
  folder: Folder,
  drawing: DraftingCompass,
  permit: FileCheck,
  photo: Camera,
  sheet: Sheet,
  doc: FileText,
};

const KIND_NAME: Record<DrillKind, string> = {
  folder: "Folder",
  drawing: "Drawing",
  permit: "Permit",
  photo: "Photo",
  sheet: "Spreadsheet",
  doc: "Document",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const extOf = (node: DrillNode) =>
  node.kind === "folder"
    ? "DIR"
    : (node.name.split(".").pop() ?? node.kind).slice(0, 4).toUpperCase();

/** "2.8 MB" by hand: compact Intl formats differ between Node and browsers. */
const bytes = (n: number | undefined) => {
  if (n === undefined) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const when = (ms: number | undefined, now: number) => {
  if (ms === undefined) return "—";
  const days = Math.floor((now - ms) / DAY);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

/** Stable small hash for seeded preview art. Unsigned, as the lesson says. */
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const joinPath = (list: string[]) => list.join("/");

const sortItems = (items: DrillNode[]) => [
  ...items.filter((n) => n.kind === "folder"),
  ...items.filter((n) => n.kind !== "folder"),
];

const findNode = (
  list: DrillNode[],
  id: string,
  parent: DrillNode | null = null,
): { node: DrillNode; parent: DrillNode | null } | null => {
  for (const node of list) {
    if (node.id === id) return { node, parent };
    if (node.children) {
      const hit = findNode(node.children, id, node);
      if (hit) return hit;
    }
  }
  return null;
};

const mapTree = (
  list: DrillNode[],
  fn: (node: DrillNode) => DrillNode,
): DrillNode[] =>
  list.map((node) => {
    const next = fn(node);
    return next.children
      ? { ...next, children: mapTree(next.children, fn) }
      : next;
  });

const removeNode = (list: DrillNode[], id: string): DrillNode[] =>
  list
    .filter((n) => n.id !== id)
    .map((n) =>
      n.children ? { ...n, children: removeNode(n.children, id) } : n,
    );

const contains = (node: DrillNode, id: string): boolean =>
  node.id === id || (node.children ?? []).some((c) => contains(c, id));

/** An elbow from the row's edge, along the divider, into the next heading. */
const elbow = (y0: number, y1: number) => {
  if (Math.abs(y0 - y1) < 10) return `M4 ${y0} H24`;
  const s = y0 > y1 ? -1 : 1;
  return `M4 ${y0} H7 Q12 ${y0} 12 ${y0 + 5 * s} V${y1 - 5 * s} Q12 ${y1} 17 ${y1} H24`;
};

/* ----------------------------------------------------------------------- */
/*                                  Icons                                   */
/* ----------------------------------------------------------------------- */

function KindIcon({
  node,
  style,
  open,
}: {
  node: DrillNode;
  style: DrillIconStyle;
  open: boolean;
}) {
  const Icon =
    node.kind === "folder" && open ? FolderOpen : KIND_ICON[node.kind];
  const tint = KIND_TINT[node.kind];
  if (style === "label") {
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-1 border font-mono text-[9px] tracking-[0.04em]"
        style={{
          color: `color-mix(in oklab, ${tint} 80%, var(--ink-2))`,
          borderColor: `color-mix(in oklab, ${tint} 35%, transparent)`,
        }}
      >
        {extOf(node)}
      </span>
    );
  }
  if (style === "line") {
    return (
      <Icon
        aria-hidden
        className="size-4 shrink-0"
        style={{
          color: node.kind === "folder" ? "var(--dc-accent)" : "var(--ink-3)",
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-2"
      style={{
        backgroundColor: `color-mix(in oklab, ${tint} 15%, transparent)`,
        color: `color-mix(in oklab, ${tint} 85%, var(--ink))`,
      }}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Preview art                                */
/* ----------------------------------------------------------------------- */

/** A drawn stand-in for the file: never an image request. */
function PreviewArt({ node }: { node: DrillNode }) {
  const h = hash(node.id);
  const pick = (n: number, shift: number) => ((h >>> shift) % n) + 0;
  if (node.kind === "drawing") {
    const split = 60 + pick(50, 3);
    const door = 30 + pick(40, 9);
    return (
      <svg viewBox="0 0 240 180" className="block size-full" aria-hidden>
        <rect width="240" height="180" fill="var(--accent-wash)" />
        {Array.from({ length: 11 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={i * 24}
            x2={i * 24}
            y1="0"
            y2="180"
            stroke="var(--grid-major)"
          />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <line
            key={`h${i}`}
            y1={i * 24}
            y2={i * 24}
            x1="0"
            x2="240"
            stroke="var(--grid-major)"
          />
        ))}
        <g fill="none" stroke="var(--accent-bright)" strokeWidth="2">
          <rect x="34" y="30" width="172" height="112" />
          <line x1={34 + split} y1="30" x2={34 + split} y2="142" />
          <line
            x1={34 + split}
            y1={30 + door + 20}
            x2="206"
            y2={30 + door + 20}
          />
          <path d={`M34 ${142 - 26} A26 26 0 0 1 60 142`} strokeWidth="1.2" />
        </g>
        <g stroke="var(--ink-3)" strokeWidth="1">
          <line x1="34" y1="156" x2="206" y2="156" />
          <line x1="34" y1="151" x2="34" y2="161" />
          <line x1="206" y1="151" x2="206" y2="161" />
        </g>
        <text
          x="120"
          y="170"
          textAnchor="middle"
          fontSize="8"
          fontFamily="var(--font-mono)"
          fill="var(--ink-3)"
        >
          {(12 + pick(9, 5)) * 500} mm
        </text>
      </svg>
    );
  }
  if (node.kind === "permit" || node.kind === "doc") {
    const lines = 7 + pick(4, 2);
    return (
      <svg viewBox="0 0 240 180" className="block size-full" aria-hidden>
        <rect width="240" height="180" fill="var(--bg-2)" />
        <rect
          x="58"
          y="14"
          width="124"
          height="166"
          rx="3"
          fill="var(--bg-1)"
        />
        <rect x="70" y="26" width="58" height="7" rx="2" fill="var(--ink-2)" />
        {Array.from({ length: lines }, (_, i) => (
          <rect
            key={i}
            x="70"
            y={44 + i * 11}
            width={70 + ((h >>> (i * 3)) % 30)}
            height="4"
            rx="2"
            fill="var(--hairline-strong)"
          />
        ))}
        {node.kind === "permit" ? (
          <g transform="rotate(-14 150 140)">
            <circle
              cx="150"
              cy="140"
              r="20"
              fill="none"
              stroke="oklch(from var(--warn) 0.7 c h)"
              strokeWidth="2.5"
            />
            <text
              x="150"
              y="143"
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fill="oklch(from var(--warn) 0.7 c h)"
            >
              ISSUED
            </text>
          </g>
        ) : null}
      </svg>
    );
  }
  if (node.kind === "photo") {
    const ridge = 70 + pick(30, 4);
    return (
      <svg viewBox="0 0 240 180" className="block size-full" aria-hidden>
        <rect
          width="240"
          height="180"
          fill="oklch(from var(--accent-bright) 0.86 0.05 h)"
        />
        <circle
          cx={60 + pick(120, 7)}
          cy="42"
          r="14"
          fill="oklch(from var(--warn) 0.9 0.08 h)"
        />
        <path
          d={`M0 ${ridge + 30} Q60 ${ridge} 120 ${ridge + 18} T240 ${ridge + 6} V180 H0 Z`}
          fill="oklch(from var(--success) 0.72 0.08 h)"
        />
        <path
          d={`M0 ${ridge + 62} Q80 ${ridge + 40} 160 ${ridge + 60} T240 ${ridge + 50} V180 H0 Z`}
          fill="oklch(from var(--success) 0.6 0.09 h)"
        />
        <path
          d={`M20 172 L110 ${ridge + 70} L150 ${ridge + 70} L232 172 Z`}
          fill="oklch(from var(--warn) 0.62 0.06 h)"
        />
        <line
          x1="40"
          y1="170"
          x2="200"
          y2={ridge + 78}
          stroke="oklch(from var(--accent-bright) 0.45 0.04 h)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 240 180" className="block size-full" aria-hidden>
      <rect width="240" height="180" fill="var(--bg-2)" />
      {Array.from({ length: 6 }, (_, r) =>
        Array.from({ length: 5 }, (__, c) => (
          <rect
            key={`${r}-${c}`}
            x={22 + c * 40}
            y={22 + r * 24}
            width="38"
            height="22"
            fill={
              r === 0
                ? "color-mix(in oklab, var(--signal) 30%, var(--bg-1))"
                : (h >>> (r * 5 + c)) % 5 === 0
                  ? "color-mix(in oklab, var(--signal) 16%, var(--bg-1))"
                  : "var(--bg-1)"
            }
          />
        )),
      )}
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Column                                  */
/* ----------------------------------------------------------------------- */

type ColumnProps = {
  /** Scopes the selection highlight's shared layout to this column. */
  layoutKey: string;
  /** Folders whose contents are on their way. */
  loadingIds: string[];
  title: string;
  items: DrillNode[] | null;
  state: "ready" | "loading" | "error";
  width: number | null;
  selectedId: string | undefined;
  connected: boolean;
  focusId: string | null;
  inset: boolean;
  iconStyle: DrillIconStyle;
  motionSafe: boolean;
  renaming: string | null;
  draft: string;
  overId: string | null;
  bump: { id: string; seq: number } | null;
  moving: string | null;
  disabled: boolean;
  hintId: string;
  onDraft: (text: string) => void;
  onRenameDone: (commit: boolean) => void;
  onRowClick: (node: DrillNode) => void;
  onRowOpen: (node: DrillNode) => void;
  onRowKey: (event: React.KeyboardEvent, node: DrillNode) => void;
  onRowFocus: (node: DrillNode) => void;
  onRetry: () => void;
  rowRef: (id: string, node: HTMLDivElement | null) => void;
};

function Column({
  layoutKey,
  loadingIds,
  title,
  items,
  state,
  width,
  selectedId,
  connected,
  focusId,
  inset,
  iconStyle,
  motionSafe,
  renaming,
  draft,
  overId,
  bump,
  moving,
  disabled,
  hintId,
  onDraft,
  onRenameDone,
  onRowClick,
  onRowOpen,
  onRowKey,
  onRowFocus,
  onRetry,
  rowRef,
}: ColumnProps) {
  const [list, setList] = React.useState<HTMLDivElement | null>(null);
  const d = useMotionValue(`M4 ${HEADER_H / 2} H24`);
  const reach = useMotionValue(1);

  // The connector follows its row through the column's scroll; the path is
  // rebuilt from the row's place on read, never kept as React state.
  const recompute = React.useCallback(() => {
    if (!list || !selectedId) return;
    const row = list.querySelector<HTMLElement>(
      `[data-id="${CSS.escape(selectedId)}"]`,
    );
    if (!row) return;
    const top = row.offsetTop - list.scrollTop + HEADER_H + ROW_H / 2;
    const lo = HEADER_H + 6;
    const hi = HEADER_H + list.clientHeight - 6;
    reach.set(top < lo || top > hi ? 0.35 : 1);
    d.set(elbow(r1(clamp(top, lo, hi)), HEADER_H / 2));
  }, [list, selectedId, d, reach]);

  React.useLayoutEffect(() => {
    recompute();
  }, [recompute, items, connected]);

  React.useEffect(() => {
    if (!list || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recompute());
    ro.observe(list);
    return () => ro.disconnect();
  }, [list, recompute]);

  const label = `${title}, ${items ? `${items.length} ${items.length === 1 ? "item" : "items"}` : state === "loading" ? "loading" : "not loaded"}`;

  return (
    <div
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-hairline",
        width === null && "w-full border-r-0",
      )}
      style={width === null ? undefined : { width }}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2 pr-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
          inset ? "pl-7" : "pl-3",
        )}
        style={{ height: HEADER_H }}
      >
        <span className="truncate" title={title}>
          {title}
        </span>
        {items ? (
          <span className="ml-auto shrink-0 tabular-nums">{items.length}</span>
        ) : null}
      </div>
      <motion.div
        ref={setList}
        layoutScroll
        role="listbox"
        aria-label={label}
        aria-describedby={hintId}
        aria-busy={state === "loading" || undefined}
        onScroll={recompute}
        className="relative flex-1 overflow-y-auto overscroll-contain px-1 pb-2"
      >
        {state === "loading" ? (
          <div aria-hidden className="flex flex-col gap-1 px-2 pt-1">
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className="flex h-7 items-center gap-2">
                <span className="size-5 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: `${45 + ((i * 29) % 40)}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              </span>
            ))}
          </div>
        ) : state === "error" ? (
          <div className="flex flex-col items-start gap-2 px-2 pt-2 text-[12px] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <TriangleAlert aria-hidden className="size-3.5 text-danger" />
              Couldn&apos;t open {title}.
            </span>
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3" />
              Retry
            </button>
          </div>
        ) : items && items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-3 pt-6 text-center text-[12px] text-ink-3">
            <FolderOpen aria-hidden className="size-4" />
            This folder is empty
          </div>
        ) : (
          (items ?? []).map((node) => {
            const selected = node.id === selectedId;
            const folder = node.kind === "folder";
            const over = overId === node.id;
            return (
              <div
                key={node.id}
                ref={(el) => rowRef(node.id, el)}
                role="option"
                aria-selected={selected}
                aria-label={`${node.name}, ${KIND_NAME[node.kind].toLowerCase()}${folder && node.children ? `, ${node.children.length} ${node.children.length === 1 ? "item" : "items"}` : ""}${moving === node.id ? ", moving" : ""}`}
                aria-disabled={disabled || undefined}
                tabIndex={focusId === node.id ? 0 : -1}
                data-dc-row=""
                data-id={node.id}
                data-folder={folder ? "true" : undefined}
                onFocus={() => onRowFocus(node)}
                onClick={() => onRowClick(node)}
                onDoubleClick={() => onRowOpen(node)}
                onKeyDown={(event) => onRowKey(event, node)}
                className={cn(
                  "relative flex touch-pan-y items-center gap-2 rounded-2 pr-2 pl-2 text-[13px] select-none",
                  selected
                    ? "text-foreground"
                    : "text-ink-2 hover:bg-surface-2",
                  moving === node.id && "opacity-50",
                  disabled ? "cursor-default" : "cursor-pointer",
                  ROW_RING,
                )}
                style={{ height: ROW_H }}
              >
                {selected ? (
                  <motion.span
                    layoutId={motionSafe ? layoutKey : undefined}
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0.5 left-0",
                      connected ? "-right-1 rounded-l-2" : "right-0 rounded-2",
                    )}
                    style={{
                      backgroundColor:
                        "color-mix(in oklab, var(--dc-accent) 15%, transparent)",
                    }}
                    transition={springs.snap}
                  />
                ) : null}
                {over ? (
                  <span
                    aria-hidden
                    className="absolute inset-0.5 rounded-2 border border-dashed border-(--dc-accent) bg-[color-mix(in_oklab,var(--dc-accent)_8%,transparent)]"
                  />
                ) : null}
                <motion.span
                  key={bump?.id === node.id ? bump.seq : 0}
                  className="relative flex"
                  initial={
                    bump?.id === node.id && motionSafe ? { scale: 1.18 } : false
                  }
                  animate={{ scale: 1 }}
                  transition={springs.recoil}
                >
                  <KindIcon
                    node={node}
                    style={iconStyle}
                    open={selected && connected}
                  />
                </motion.span>
                {renaming === node.id ? (
                  <input
                    ref={(el) => {
                      if (el && document.activeElement !== el) {
                        el.focus();
                        el.select();
                      }
                    }}
                    aria-label={`Rename ${node.name}`}
                    value={draft}
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      onDraft(text);
                    }}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onRenameDone(true);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        onRenameDone(false);
                      }
                    }}
                    onBlur={() => onRenameDone(true)}
                    className="relative h-6 min-w-0 flex-1 rounded-1 border border-(--dc-accent) bg-surface-1 px-1.5 text-[13px] text-foreground outline-none"
                  />
                ) : (
                  <span
                    className="relative min-w-0 flex-1 truncate"
                    title={node.name}
                  >
                    {node.name}
                  </span>
                )}
                {folder && loadingIds.includes(node.id) ? (
                  <LoaderCircle
                    aria-hidden
                    className="relative size-3.5 shrink-0 text-ink-3 motion-safe:animate-spin"
                  />
                ) : folder ? (
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "relative size-3.5 shrink-0",
                      selected ? "text-(--dc-accent)" : "text-ink-3",
                    )}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </motion.div>

      {/* The reach: from the open row, along the divider, into the next
          column's heading. Drawn as a path (no non-scaling stroke), so its
          pathLength draw is exact. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 z-10 h-full overflow-visible"
        style={{ left: "calc(100% - 12px)", width: 36 }}
      >
        <AnimatePresence initial={false}>
          {connected && selectedId && width !== null ? (
            <motion.g key={selectedId} style={{ opacity: reach }}>
              <motion.path
                d={d}
                fill="none"
                stroke="var(--dc-accent)"
                strokeWidth={1.5}
                strokeLinecap="round"
                initial={{
                  pathLength: motionSafe ? 0 : 1,
                  opacity: motionSafe ? 1 : 0,
                }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{
                  pathLength: motionSafe ? 0 : 1,
                  opacity: motionSafe ? 1 : 0,
                  transition: exitFor(durations.base),
                }}
                transition={
                  motionSafe
                    ? { pathLength: springs.glide, opacity: { duration: 0 } }
                    : { duration: durations.fast }
                }
              />
              <motion.circle
                cx={24}
                cy={HEADER_H / 2}
                r={2.5}
                fill="var(--dc-accent)"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  duration: durations.fast,
                  delay: motionSafe ? durations.slow * 0.6 : 0,
                }}
              />
            </motion.g>
          ) : null}
        </AnimatePresence>
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type ColumnSpec = {
  key: string;
  folder: DrillNode | null;
  title: string;
  items: DrillNode[] | null;
  state: "ready" | "loading" | "error";
  selectedId: string | undefined;
};

/**
 * A column browser for deep folders. Every opened folder adds a column on the
 * right and the last column previews the selected file with drawn art. The
 * signature is the reach: opening a folder slides the column track left on
 * `springs.glide` while the selected row's highlight stretches out to its
 * column's edge and becomes a thin connector — along the divider and into the
 * new column's heading, drawn on glide. Stepping back retracts it on the exit
 * ease and the track glides home. The connector follows its column's scroll,
 * pinned and faded at the edge when its row scrolls out of view.
 *
 * Rows drag (after 5px, 1:1 under the pointer) onto any folder to move; the
 * folder lights a dashed outline and bumps on `springs.recoil` when it takes
 * the drop. Slow folders show skeleton rows, empty folders say so in place,
 * failed ones offer Retry where they stand. Below a 30rem container only the
 * current column shows, under a back crumb.
 *
 * One roving tab stop runs through every column: Up/Down move, Right steps in
 * (opening if needed), Left steps back and closes the column it left, Enter
 * opens, Space previews, F2 renames, M picks an item up and Enter on a folder
 * drops it. Under reduced motion nothing slides or draws — columns and the
 * connector appear in place — and the preview, path and moves all still work.
 */
export function DrillColumns({
  columnWidth = 200,
  iconStyle = "tile",
  accent = "cobalt",
  folders = defaultDrillFolders,
  rootLabel = "Basinworks",
  path,
  defaultPath = defaultDrillPath,
  onPathChange,
  onOpen,
  onMove,
  onRename,
  loadFolder,
  now = defaultDrillNow,
  status = "ready",
  onRetry,
  label,
  disabled = false,
  className,
}: DrillColumnsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const W = Math.round(clamp(columnWidth, 140, 320));
  const PW = Math.round(clamp(W * 1.3, 220, 300));
  const color = accent in ACCENTS ? ACCENTS[accent as DrillAccent] : accent;

  // The browser works on its own copy of the tree: moves, renames and loaded
  // folders land here, and a new `folders` prop starts it over.
  const [tree, setTree] = React.useState<DrillNode[]>(folders);
  const [seenFolders, setSeenFolders] = React.useState(folders);
  if (seenFolders !== folders) {
    setSeenFolders(folders);
    setTree(folders);
  }

  const [ownPath, setOwnPath] = React.useState<string[]>(defaultPath);
  const rawPath = path ?? ownPath;
  const [loadState, setLoadState] = React.useState<
    Record<string, "loading" | "error">
  >({});
  const [focus, setFocus] = React.useState<{ col: number; id: string } | null>(
    null,
  );
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [renaming, setRenaming] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [moving, setMoving] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState<{
    id: string;
    over: string | null;
  } | null>(null);
  const [bump, setBump] = React.useState<{ id: string; seq: number } | null>(
    null,
  );
  const [vw, setVw] = React.useState(0);
  const [dir, setDir] = React.useState(1);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const viewRef = React.useRef<HTMLDivElement | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLElement>());
  const dragRef = React.useRef<{
    id: string;
    over: string | null;
    home: { x: number; y: number };
  } | null>(null);
  const suppressClick = React.useRef(false);
  const trackX = useMotionValue(0);
  const ghostX = useMotionValue(0);
  const ghostY = useMotionValue(0);
  const ghostO = useMotionValue(0);
  // A soft shadow at the left edge says there are columns slid out of view.
  const edgeFade = useTransform(trackX, (x) => (x < -1 ? 1 : 0));

  const narrow = vw > 0 && vw < NARROW;

  /* -------------------------------- path ------------------------------- */

  const columns: ColumnSpec[] = [];
  let preview: DrillNode | null = null;
  const resolved: string[] = [];
  {
    let items: DrillNode[] | null = tree;
    let folder: DrillNode | null = null;
    let state: ColumnSpec["state"] = "ready";
    for (let depth = 0; ; depth += 1) {
      const id = rawPath[depth];
      const hit: DrillNode | undefined =
        items && id ? items.find((n) => n.id === id) : undefined;
      columns.push({
        key: folder?.id ?? "__root",
        folder,
        title: folder?.name ?? rootLabel,
        items: items ? sortItems(items) : null,
        state,
        selectedId: hit?.id,
      });
      if (!hit) break;
      resolved.push(hit.id);
      if (hit.kind !== "folder") {
        preview = hit;
        break;
      }
      folder = hit;
      items = hit.children ?? null;
      state = hit.children
        ? "ready"
        : loadState[hit.id] === "error"
          ? "error"
          : "loading";
    }
  }
  const lastCol = columns.length - 1;

  /* ----------------------------- measuring ----------------------------- */

  React.useEffect(() => {
    const view = viewRef.current;
    if (!view || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      setVw(Math.round(entries[0]?.contentRect.width ?? 0));
    });
    ro.observe(view);
    return () => ro.disconnect();
  }, [ready]);

  // The track slides by whole columns, so the leftmost visible column is
  // never cut through its rows; the preview takes up whatever is left over.
  const fits =
    vw > 0
      ? clamp(Math.floor((vw - (preview ? PW : 0)) / W), 1, columns.length)
      : columns.length;
  const hidden = narrow ? 0 : columns.length - fits;
  const target = vw > 0 && !narrow ? -hidden * W : 0;
  const previewWidth = vw > 0 ? Math.max(PW, vw - fits * W) : PW;
  const placed = React.useRef(false);
  React.useLayoutEffect(() => {
    // The first measurement places the track; later ones slide it.
    if (!placed.current || !motionSafe) {
      trackX.jump(target);
      if (vw > 0) placed.current = true;
      return;
    }
    const controls = animate(trackX, target, springs.glide);
    return () => controls.stop();
  }, [target, vw, motionSafe, trackX]);

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    rowNodes.current.get(focusReq.id)?.focus({ preventScroll: false });
  }, [focusReq]);

  /* ------------------------------ actions ------------------------------ */

  const say = (text: string) => setAnnouncement(text);

  const setPathTo = (next: string[], direction = 1) => {
    if (joinPath(next) === joinPath(resolved)) return;
    setDir(direction);
    if (path === undefined) setOwnPath(next);
    onPathChange?.(next);
  };

  const requestFocus = (id: string) =>
    setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));

  const load = (folder: DrillNode) => {
    if (folder.children || loadState[folder.id] === "loading") return;
    if (!loadFolder) {
      setTree((t) =>
        mapTree(t, (n) => (n.id === folder.id ? { ...n, children: [] } : n)),
      );
      return;
    }
    setLoadState((s) => ({ ...s, [folder.id]: "loading" }));
    loadFolder(folder).then(
      (kids) => {
        setTree((t) =>
          mapTree(t, (n) =>
            n.id === folder.id ? { ...n, lazy: false, children: kids } : n,
          ),
        );
        setLoadState((s) => {
          const rest = { ...s };
          delete rest[folder.id];
          return rest;
        });
        say(
          `${folder.name} opened, ${kids.length} ${kids.length === 1 ? "item" : "items"}.`,
        );
      },
      () => {
        setLoadState((s) => ({ ...s, [folder.id]: "error" }));
        say(`Couldn't open ${folder.name}.`);
      },
    );
  };

  /** Opens a folder in column `col`, or previews a file there. */
  const choose = (col: number, node: DrillNode, stepIn: boolean) => {
    if (inert) return;
    const next = [...resolved.slice(0, col), node.id];
    setPathTo(next, 1);
    if (node.kind === "folder") {
      load(node);
      const first = node.children ? sortItems(node.children)[0] : undefined;
      // In the narrow layout the row that was pressed leaves with its
      // column, so focus always follows into the new one.
      if ((stepIn || narrow) && first) {
        setFocus({ col: col + 1, id: first.id });
        requestFocus(first.id);
      }
      say(`${node.name} opened.`);
    } else {
      if (narrow) requestFocus("__open");
      say(`Previewing ${node.name}.`);
    }
  };

  const back = (col: number) => {
    if (col <= 0) return;
    const parentId = resolved[col - 1];
    setPathTo(resolved.slice(0, col - 1), -1);
    if (parentId) {
      setFocus({ col: col - 1, id: parentId });
      requestFocus(parentId);
    }
  };

  const openFile = (node: DrillNode, col: number) => {
    if (inert || node.kind === "folder") return;
    const at = [...resolved.slice(0, col), node.id];
    onOpen?.(node, at);
    say(`Opened ${node.name}.`);
  };

  const canDrop = (id: string, folderId: string | null) => {
    const item = findNode(tree, id);
    if (!item) return false;
    if (folderId === null) return item.parent !== null;
    const target = findNode(tree, folderId)?.node;
    if (!target || target.kind !== "folder" || !target.children) return false;
    if (contains(item.node, folderId)) return false;
    return item.parent?.id !== folderId;
  };

  const doMove = (id: string, folderId: string | null) => {
    if (!canDrop(id, folderId)) return false;
    const item = findNode(tree, id)?.node;
    const folder = folderId ? (findNode(tree, folderId)?.node ?? null) : null;
    if (!item) return false;
    setTree((t) => {
      const without = removeNode(t, id);
      if (folderId === null) return sortItems([...without, item]);
      return mapTree(without, (n) =>
        n.id === folderId
          ? { ...n, children: sortItems([...(n.children ?? []), item]) }
          : n,
      );
    });
    const cut = resolved.indexOf(id);
    if (cut >= 0) setPathTo(resolved.slice(0, cut), -1);
    if (folderId) setBump((b) => ({ id: folderId, seq: (b?.seq ?? 0) + 1 }));
    onMove?.(item, folder);
    say(`Moved ${item.name} to ${folder?.name ?? rootLabel}.`);
    return true;
  };

  const startRename = (node: DrillNode) => {
    if (inert) return;
    setRenaming(node.id);
    setDraft(node.name);
  };

  const finishRename = (commit: boolean) => {
    const id = renaming;
    if (!id) return;
    setRenaming(null);
    const node = findNode(tree, id)?.node;
    const name = draft.trim();
    if (commit && node && name && name !== node.name) {
      setTree((t) => mapTree(t, (n) => (n.id === id ? { ...n, name } : n)));
      onRename?.(node, name);
      say(`Renamed to ${name}.`);
    }
    requestFocus(id);
  };

  /* --------------------------------- drag ------------------------------ */

  const hitFolder = (x: number, y: number) => {
    const el = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-dc-row][data-folder]");
    if (!el || !viewRef.current?.contains(el)) return null;
    return el.dataset.id ?? null;
  };

  const dragHandlers = useDrag({
    threshold: 5,
    disabled: inert,
    onStart: ({ point, offset }) => {
      const sx = point.x - offset.x;
      const sy = point.y - offset.y;
      const row = document
        .elementFromPoint(sx, sy)
        ?.closest<HTMLElement>("[data-dc-row]");
      const root = rootRef.current;
      const id = row?.dataset.id;
      if (!row || !root || !id || renaming) return;
      const rr = root.getBoundingClientRect();
      const br = row.getBoundingClientRect();
      const home = { x: br.left - rr.left + 6, y: br.top - rr.top + 2 };
      // Track relative to the browser, so a sliding track never pulls the
      // chip out from under the pointer.
      ghostX.jump(point.x - rr.left - 18);
      ghostY.jump(point.y - rr.top - 14);
      ghostO.jump(1);
      dragRef.current = { id, over: null, home };
      setDrag({ id, over: null });
    },
    onMove: ({ point }) => {
      const s = dragRef.current;
      const root = rootRef.current;
      if (!s || !root) return;
      const rr = root.getBoundingClientRect();
      ghostX.set(Math.round(point.x - rr.left - 18));
      ghostY.set(Math.round(point.y - rr.top - 14));
      const hit = hitFolder(point.x, point.y);
      const over = hit && canDrop(s.id, hit) ? hit : null;
      if (over !== s.over) {
        s.over = over;
        setDrag({ id: s.id, over });
      }
    },
    onEnd: () => {
      const s = dragRef.current;
      dragRef.current = null;
      if (!s) return;
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (s.over && doMove(s.id, s.over)) {
        ghostO.jump(0);
        setDrag(null);
        return;
      }
      // A miss glides the chip home and lets it go.
      if (!motionSafe) {
        ghostO.jump(0);
        setDrag(null);
        return;
      }
      animate(ghostX, s.home.x, springs.glide);
      animate(ghostY, s.home.y, springs.glide);
      animate(ghostO, 0, { duration: durations.base, ease: easings.exit }).then(
        () => setDrag(null),
      );
    },
    onCancel: () => {
      dragRef.current = null;
      ghostO.jump(0);
      setDrag(null);
    },
  });

  /* ------------------------------ keyboard ----------------------------- */

  const colOf = (id: string) =>
    columns.findIndex((c) => c.items?.some((n) => n.id === id));

  const onRowKey = (event: React.KeyboardEvent, node: DrillNode) => {
    const col = colOf(node.id);
    const items = columns[col]?.items ?? [];
    const i = items.findIndex((n) => n.id === node.id);
    const go = (to: DrillNode | undefined, c = col) => {
      if (!to) return;
      setFocus({ col: c, id: to.id });
      rowNodes.current.get(to.id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(items[Math.min(items.length - 1, i + 1)]);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(items[Math.max(0, i - 1)]);
        return;
      case "Home":
        event.preventDefault();
        go(items[0]);
        return;
      case "End":
        event.preventDefault();
        go(items[items.length - 1]);
        return;
      case "ArrowRight": {
        event.preventDefault();
        if (node.kind !== "folder") {
          choose(col, node, false);
          return;
        }
        if (resolved[col] === node.id && node.children) {
          const nextCol = columns[col + 1];
          const to =
            nextCol?.items?.find((n) => n.id === nextCol.selectedId) ??
            nextCol?.items?.[0];
          if (to) go(to, col + 1);
          return;
        }
        choose(col, node, true);
        return;
      }
      case "ArrowLeft":
        event.preventDefault();
        if (narrow || col > 0) back(col);
        return;
      case "Enter":
        event.preventDefault();
        if (moving) {
          const into =
            node.kind === "folder"
              ? node.id
              : (columns[col]?.folder?.id ?? null);
          if (doMove(moving, into)) setMoving(null);
          else say("That folder can't take it.");
          return;
        }
        if (node.kind === "folder") choose(col, node, true);
        else openFile(node, col);
        return;
      case " ":
        event.preventDefault();
        choose(col, node, false);
        return;
      case "F2":
        event.preventDefault();
        startRename(node);
        return;
      case "m":
      case "M":
        if (event.ctrlKey || event.metaKey || event.altKey || inert) return;
        event.preventDefault();
        setMoving(node.id);
        say(
          `Moving ${node.name}. Go to a folder and press Enter to drop it, or Escape to cancel.`,
        );
        return;
      case "Escape":
        if (!moving) return;
        // Only an active move is ours to cancel; otherwise the stage closes.
        event.preventDefault();
        setMoving(null);
        say("Move cancelled.");
        return;
      default:
        return;
    }
  };

  /* ------------------------------- render ------------------------------ */

  const focusId =
    focus && columns[focus.col]?.items?.some((n) => n.id === focus.id)
      ? focus.id
      : (columns[lastCol]?.selectedId ??
        columns[lastCol]?.items?.[0]?.id ??
        columns[0]?.items?.[0]?.id ??
        null);

  const crumbs = [
    { id: null as string | null, name: rootLabel, col: 0 },
    ...resolved.map((id, i) => ({
      id,
      name:
        (i < columns.length - 1
          ? columns[i + 1]?.folder?.name
          : preview?.name) ?? id,
      col: i + 1,
    })),
  ];

  const renderColumn = (spec: ColumnSpec, i: number, full: boolean) => (
    <Column
      layoutKey={`${uid}-sel-${spec.key}`}
      loadingIds={Object.keys(loadState).filter(
        (id) => loadState[id] === "loading",
      )}
      title={spec.title}
      items={spec.items}
      state={spec.state}
      width={full ? null : W}
      selectedId={spec.selectedId}
      connected={!full && (i < lastCol || (i === lastCol && !!preview))}
      focusId={focusId}
      inset={!full && i > 0}
      iconStyle={iconStyle}
      motionSafe={motionSafe}
      renaming={renaming}
      draft={draft}
      overId={drag?.over ?? null}
      bump={bump}
      moving={moving ?? drag?.id ?? null}
      disabled={inert}
      hintId={hintId}
      onDraft={setDraft}
      onRenameDone={finishRename}
      onRowClick={(node) => {
        if (suppressClick.current) return;
        setFocus({ col: i, id: node.id });
        choose(i, node, false);
      }}
      onRowOpen={(node) => {
        if (node.kind === "folder") choose(i, node, true);
        else openFile(node, i);
      }}
      onRowKey={onRowKey}
      onRowFocus={(node) => setFocus({ col: i, id: node.id })}
      onRetry={() => {
        const folder = spec.folder;
        if (folder) {
          setLoadState((s) => {
            const rest = { ...s };
            delete rest[folder.id];
            return rest;
          });
          load({ ...folder, children: undefined });
        }
      }}
      rowRef={(id, node) => {
        if (node) rowNodes.current.set(id, node);
        else rowNodes.current.delete(id);
      }}
    />
  );

  const previewPane = (full: boolean) =>
    preview ? (
      <motion.div
        className={cn(
          "relative flex h-full shrink-0 flex-col",
          full && "w-full",
        )}
        initial={false}
        animate={full ? undefined : { width: previewWidth }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <div
          className={cn(
            "flex shrink-0 items-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
            full ? "pl-3" : "pl-7",
          )}
          style={{ height: HEADER_H }}
        >
          Preview
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          <div className="grid">
            <AnimatePresence initial={false}>
              <motion.div
                key={preview.id}
                className="col-start-1 row-start-1 flex max-w-80 flex-col gap-3"
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.base, ease: easings.enter }}
              >
                <div className="aspect-[4/3] overflow-hidden rounded-3 border border-hairline">
                  <PreviewArt node={preview} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p
                    className="truncate text-[13px] font-medium"
                    title={preview.name}
                  >
                    {preview.name}
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {KIND_NAME[preview.kind]} · {bytes(preview.size)}
                  </p>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                  <dt className="text-ink-3">Modified</dt>
                  <dd className="truncate text-ink-2">
                    {when(preview.modified, nowMs)}
                  </dd>
                  <dt className="text-ink-3">By</dt>
                  <dd className="truncate text-ink-2">{preview.by ?? "—"}</dd>
                  <dt className="text-ink-3">Where</dt>
                  <dd className="truncate text-ink-2">
                    {[rootLabel, ...columns.slice(1).map((c) => c.title)].join(
                      " / ",
                    )}
                  </dd>
                </dl>
                <div className="flex flex-wrap gap-2">
                  <button
                    ref={(el) => {
                      if (el) rowNodes.current.set("__open", el);
                      else rowNodes.current.delete("__open");
                    }}
                    type="button"
                    onClick={() => openFile(preview as DrillNode, lastCol)}
                    aria-disabled={inert || undefined}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                      FOCUS_RING,
                    )}
                  >
                    <ExternalLink aria-hidden className="size-3.5" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => startRename(preview as DrillNode)}
                    aria-disabled={inert || undefined}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    <Pencil aria-hidden className="size-3.5" />
                    Rename
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    ) : null;

  const current = preview ? "preview" : (columns[lastCol]?.key ?? "__root");
  const parentTitle = preview
    ? (columns[lastCol]?.title ?? rootLabel)
    : (columns[lastCol - 1]?.title ?? null);

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={label ?? `${rootLabel} files`}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ ["--dc-accent" as string]: color }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move. Right steps into a folder, Left steps back. Enter
        opens, Space previews, F2 renames, M moves.
      </p>

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-hairline px-3">
        {narrow ? (
          parentTitle !== null && resolved.length > 0 ? (
            <button
              type="button"
              onClick={() => setPathTo(resolved.slice(0, -1), -1)}
              className={cn(
                "inline-flex h-7 min-w-0 items-center gap-1 rounded-2 pr-2 pl-1 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <ChevronLeft aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{parentTitle}</span>
            </button>
          ) : (
            <span className="truncate pl-1 text-[13px] font-semibold">
              {rootLabel}
            </span>
          )
        ) : (
          <nav aria-label="Path" className="min-w-0 flex-1">
            <ol className="flex min-w-0 items-center gap-0.5 text-[13px]">
              {crumbs.map((crumb, i) => {
                const last = i === crumbs.length - 1;
                return (
                  <li
                    key={crumb.id ?? "__root"}
                    className="flex min-w-0 items-center gap-0.5"
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
                        className="truncate px-1.5 font-medium text-foreground"
                        title={crumb.name}
                      >
                        {crumb.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const keep = resolved.slice(0, crumb.col);
                          setPathTo(keep, -1);
                          const focusOn = keep[keep.length - 1];
                          if (focusOn) requestFocus(focusOn);
                        }}
                        className={cn(
                          "max-w-32 truncate rounded-1 px-1.5 py-0.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                          FOCUS_RING,
                        )}
                      >
                        {crumb.name}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {narrow ? null : (
          <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {columns.length} {columns.length === 1 ? "column" : "columns"}
          </span>
        )}
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The files didn&apos;t load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : status === "loading" ? (
        <div aria-hidden className="flex flex-1 overflow-hidden">
          {[0, 1, 2].map((c) => (
            <div
              key={c}
              className="flex shrink-0 flex-col gap-1.5 border-r border-hairline px-3 pt-10"
              style={{ width: W }}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: `${40 + ((i * 37 + c * 19) % 45)}%`,
                    animationDelay: `${(i + c) * 90}ms`,
                    marginTop: 12,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={viewRef}
          className="relative flex-1 overflow-hidden"
          {...dragHandlers}
        >
          {narrow ? (
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.div
                key={current}
                custom={dir}
                className="absolute inset-0 flex"
                variants={{
                  in: { x: 0, opacity: 1 },
                  from: (d: number) => ({
                    x: motionSafe ? d * distances.shift * 2 : 0,
                    opacity: 0,
                  }),
                  to: (d: number) => ({
                    x: motionSafe ? -d * distances.shift : 0,
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }),
                }}
                initial="from"
                animate="in"
                exit="to"
                transition={
                  motionSafe
                    ? {
                        x: springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.fast }
                }
              >
                {preview
                  ? previewPane(true)
                  : columns[lastCol]
                    ? renderColumn(
                        columns[lastCol] as ColumnSpec,
                        lastCol,
                        true,
                      )
                    : null}
              </motion.div>
            </AnimatePresence>
          ) : (
            <>
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 z-20 w-3 bg-linear-to-r from-[color-mix(in_oklab,black_14%,transparent)] to-transparent transition-opacity duration-300"
                style={{ opacity: edgeFade }}
              />
              <motion.div
                className="relative flex h-full"
                style={{ x: trackX }}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {columns.map((spec, i) => (
                    <motion.div
                      key={spec.key}
                      className="h-full shrink-0"
                      initial={{
                        opacity: 0,
                        x: motionSafe ? distances.shift : 0,
                      }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{
                        opacity: 0,
                        x: motionSafe ? distances.step : 0,
                        transition: exitFor(durations.base),
                      }}
                      transition={
                        motionSafe
                          ? {
                              x: springs.glide,
                              opacity: {
                                duration: durations.base,
                                ease: easings.enter,
                              },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {renderColumn(spec, i, false)}
                    </motion.div>
                  ))}
                  {preview ? (
                    <motion.div
                      key="__preview"
                      className="h-full shrink-0"
                      initial={{
                        opacity: 0,
                        x: motionSafe ? distances.shift : 0,
                      }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{
                        opacity: 0,
                        transition: exitFor(durations.base),
                      }}
                      transition={
                        motionSafe
                          ? {
                              x: springs.glide,
                              opacity: {
                                duration: durations.base,
                                ease: easings.enter,
                              },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {previewPane(false)}
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {moving ? (
          <motion.div
            key="moving"
            className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface-1 px-3 py-2 text-[12px] text-ink-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
          >
            <FolderInput
              aria-hidden
              className="size-3.5 shrink-0 text-(--dc-accent)"
            />
            <span className="min-w-0 truncate">
              Moving {findNode(tree, moving)?.node.name} · Enter on a folder
              drops it · Esc cancels
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {drag ? (
        <DragChip
          node={findNode(tree, drag.id)?.node ?? null}
          x={ghostX}
          y={ghostY}
          opacity={ghostO}
          iconStyle={iconStyle}
        />
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

function DragChip({
  node,
  x,
  y,
  opacity,
  iconStyle,
}: {
  node: DrillNode | null;
  x: MotionValue<number>;
  y: MotionValue<number>;
  opacity: MotionValue<number>;
  iconStyle: DrillIconStyle;
}) {
  if (!node) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-30 flex h-8 max-w-48 items-center gap-2 rounded-2 border border-hairline-strong bg-popover pr-3 pl-2 text-[13px] shadow-[0_10px_28px_-12px_color-mix(in_oklab,black_45%,transparent)]"
      style={{ x, y, opacity }}
    >
      <KindIcon node={node} style={iconStyle} open={false} />
      <span className="truncate">{node.name}</span>
    </motion.div>
  );
}
