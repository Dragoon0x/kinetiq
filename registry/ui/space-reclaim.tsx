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
  Archive,
  Database,
  ExternalLink,
  EyeOff,
  FileText,
  Film,
  Image as ImageIcon,
  Leaf,
  PenTool,
  RotateCcw,
  TriangleAlert,
  X,
  type LucideIcon,
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

export type SpaceReclaimType =
  "video" | "archive" | "image" | "design" | "data" | "doc";

export type SpaceReclaimFile = {
  id: string;
  /** File name, with its extension. */
  name: string;
  /** Where it lives, shown at roomy density and in the option's name. */
  folder: string;
  type: SpaceReclaimType;
  /** Bytes. */
  size: number;
  /** When it was last opened (ms), or null when it never was. */
  lastOpened: number | null;
};

export type SpaceReclaimQuota = {
  /** The drive's size in bytes. */
  total: number;
  /** Bytes in use, everything included — not only the files listed. */
  used: number;
};

export type SpaceReclaimStatus = "ready" | "scanning" | "error";
export type SpaceReclaimBarStyle = "bar" | "line" | "blocks";
export type SpaceReclaimDensity = "compact" | "cozy" | "roomy";
export type SpaceReclaimTone = "cobalt" | "moss" | "amber" | "ink";

export type SpaceReclaimProps = {
  /** The scan's candidates: the biggest files on the drive. @default defaultSpaceReclaimFiles */
  files?: SpaceReclaimFile[];
  /** The drive's size and what is in use. @default defaultSpaceReclaimQuota */
  quota?: SpaceReclaimQuota;
  /** Controlled selection: file ids chosen for removal. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultSelected?: string[];
  /** Fires from the click or key that changed the selection, with every chosen id. */
  onSelectedChange?: (ids: string[]) => void;
  /** Remove was confirmed. Return a promise to show the removal; a rejection keeps the selection. */
  onReclaim?: (ids: string[], bytes: number) => void | Promise<unknown>;
  /** A file was kept out of the suggestions (Keep, or K). It leaves the list; nothing is deleted. */
  onSkip?: (file: SpaceReclaimFile) => void;
  /** A file was opened (Open, or Enter). */
  onOpen?: (file: SpaceReclaimFile) => void;
  /** Rescan or Retry was pressed. */
  onRescan?: () => void;
  /** Whether the scan has finished, is running, or stopped short. @default "ready" */
  status?: SpaceReclaimStatus;
  /** How far a running scan has got, 0 to 1. @default 0 */
  scanProgress?: number;
  /** The folder a running scan is reading, or where a failed one stopped. */
  scanPath?: string;
  /** When the last scan finished, in ms. @default three minutes before `now` */
  scannedAt?: number;
  /** The moment ages count from, in ms — never read from the clock. @default defaultSpaceReclaimNow */
  now?: number;
  /** How bars are drawn: rounded bars, thin rules, or bars cut into cells. @default "bar" */
  barStyle?: SpaceReclaimBarStyle;
  /** Row height: one line, a meta line, or a meta line with the folder. @default "cozy" */
  density?: SpaceReclaimDensity;
  /** The hue the quota, the stripes, the checks and the size bars are drawn in. @default "cobalt" */
  tone?: SpaceReclaimTone;
  /** The workspace's name, and the surface's accessible name. @default "Coldbrook workspace" */
  title?: string;
  /** Height of the surface in px; the list scrolls inside it. @default 540 */
  height?: number;
  /** Nothing can be chosen, kept, opened or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const GB = 1e9;

/** Thursday 9 October 2026, 15:20 UTC — the scan's afternoon. */
export const defaultSpaceReclaimNow = Date.UTC(2026, 9, 9, 15, 20);

const daysAgo = (d: number) => defaultSpaceReclaimNow - Math.round(d * DAY);
const gb = (n: number) => Math.round(n * GB);

export const defaultSpaceReclaimQuota: SpaceReclaimQuota = {
  total: gb(200),
  used: gb(171.4),
};

/** Fourteen of the biggest files on Coldbrook's shared drive. */
export const defaultSpaceReclaimFiles: SpaceReclaimFile[] = [
  {
    id: "f-film",
    name: "launch-film-master.mov",
    folder: "Brand / Film",
    type: "video",
    size: gb(18.4),
    lastOpened: daysAgo(334),
  },
  {
    id: "f-shoot",
    name: "roastery-shoot-raw.tar",
    folder: "Photo / 2025",
    type: "archive",
    size: gb(12.9),
    lastOpened: daysAgo(580),
  },
  {
    id: "f-renders",
    name: "q3-site-renders.zip",
    folder: "Web / Renders",
    type: "archive",
    size: gb(8.7),
    lastOpened: daysAgo(212),
  },
  {
    id: "f-walk",
    name: "cafe-walkthrough-4k.mp4",
    folder: "Brand / Film",
    type: "video",
    size: gb(6.2),
    lastOpened: null,
  },
  {
    id: "f-orders",
    name: "orders-2024-export.parquet",
    folder: "Data / Exports",
    type: "data",
    size: gb(4.8),
    lastOpened: daysAgo(151),
  },
  {
    id: "f-prints",
    name: "packaging-final-prints.psd",
    folder: "Packaging",
    type: "image",
    size: gb(3.6),
    lastOpened: daysAgo(268),
  },
  {
    id: "f-menu",
    name: "menu-board-system.fig",
    folder: "Design",
    type: "design",
    size: gb(2.9),
    lastOpened: daysAgo(12),
  },
  {
    id: "f-training",
    name: "barista-training.mov",
    folder: "People / Training",
    type: "video",
    size: gb(2.4),
    lastOpened: daysAgo(425),
  },
  {
    id: "f-oldsite",
    name: "old-site-backup.tar.gz",
    folder: "Web / Archive",
    type: "archive",
    size: gb(1.9),
    lastOpened: daysAgo(790),
  },
  {
    id: "f-scans",
    name: "label-scans.tiff",
    folder: "Packaging / Scans",
    type: "image",
    size: gb(1.4),
    lastOpened: daysAgo(122),
  },
  {
    id: "f-logs",
    name: "pos-logs-2025.csv",
    folder: "Data / Logs",
    type: "data",
    size: gb(1.1),
    lastOpened: null,
  },
  {
    id: "f-book",
    name: "brand-book-v3.pdf",
    folder: "Brand",
    type: "doc",
    size: gb(0.82),
    lastOpened: daysAgo(96),
  },
  {
    id: "f-deck",
    name: "investor-deck-2024.key",
    folder: "Company",
    type: "doc",
    size: gb(0.64),
    lastOpened: daysAgo(390),
  },
  {
    id: "f-stickers",
    name: "sticker-sheet-mockups.fig",
    folder: "Design / Merch",
    type: "design",
    size: gb(0.48),
    lastOpened: daysAgo(241),
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const TYPES: Record<SpaceReclaimType, { label: string; Icon: LucideIcon }> = {
  video: { label: "Video", Icon: Film },
  archive: { label: "Archive", Icon: Archive },
  image: { label: "Image", Icon: ImageIcon },
  design: { label: "Design", Icon: PenTool },
  data: { label: "Data", Icon: Database },
  doc: { label: "Document", Icon: FileText },
};

const TONE_BASE: Record<SpaceReclaimTone, string> = {
  cobalt: "var(--accent-bright)",
  moss: "var(--success)",
  amber: "var(--warn)",
  ink: "var(--ink-2)",
};

/** Pigment steps for the type segments: one hue, darkest first. */
const STEPS = [0.5, 0.58, 0.66, 0.73, 0.8, 0.86];

/**
 * A filled shape is pigment, not text: the tone's hue and chroma at a fixed
 * lightness, so the bar reads the same on a light page and a dark one.
 */
const pigment = (tone: SpaceReclaimTone, lightness: number) =>
  tone === "ink"
    ? `oklch(from ${TONE_BASE.ink} ${lightness} 0.02 h)`
    : `oklch(from ${TONE_BASE[tone]} ${lightness} c h)`;

/** Card-coloured hatching: what is about to come back reads as cut away. */
const HATCH =
  "repeating-linear-gradient(-45deg, color-mix(in oklab, var(--card) 78%, transparent) 0 2px, transparent 2px 5px)";

const GEOMETRY: Record<
  SpaceReclaimBarStyle,
  {
    quota: number;
    row: number;
    radius: string;
    mask?: string;
    rowMask?: string;
  }
> = {
  bar: { quota: 10, row: 4, radius: "rounded-full" },
  line: { quota: 4, row: 2, radius: "rounded-none" },
  blocks: {
    quota: 12,
    row: 6,
    radius: "rounded-1",
    mask: "repeating-linear-gradient(to right, black 0 6px, transparent 6px 8px)",
    rowMask:
      "repeating-linear-gradient(to right, black 0 4px, transparent 4px 6px)",
  },
};

const DENSITY: Record<
  SpaceReclaimDensity,
  { row: number; meta: boolean; folder: boolean; glyph: string }
> = {
  compact: { row: 40, meta: false, folder: false, glyph: "size-6" },
  cozy: { row: 52, meta: true, folder: false, glyph: "size-7" },
  roomy: { row: 64, meta: true, folder: true, glyph: "size-8" },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Decimal units, one place, by hand: the server and the browser print the same. */
function formatSize(bytes: number): string {
  const b = Math.max(0, bytes);
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  if (b < 500) return "0 GB";
  return `${Math.max(1, Math.round(b / 1e3))} KB`;
}

function openedLabel(at: number | null, now: number): string {
  if (at === null) return "Never opened";
  const days = Math.max(0, (now - at) / DAY);
  if (days < 1) return "Opened today";
  if (days < 14) return `Opened ${Math.round(days)} d ago`;
  if (days < 60) return `Opened ${Math.round(days / 7)} wk ago`;
  if (days < 730) return `Opened ${Math.round(days / 30.4)} mo ago`;
  return `Opened ${Math.round(days / 365)} yr ago`;
}

function scannedLabel(at: number, now: number): string {
  const min = Math.max(0, Math.round((now - at) / 60_000));
  if (min < 1) return "Scanned just now";
  if (min < 60) return `Scanned ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Scanned ${h} h ago`;
  return `Scanned ${Math.round(h / 24)} d ago`;
}

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** A number that rolls to its new value on a spring, rendered as motion text. */
function useRoll(
  value: number,
  motionSafe: boolean,
  spring: typeof springs.glide | typeof springs.snap = springs.glide,
): MotionValue<number> {
  const mv = useMotionValue(value);
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, spring);
    return () => controls.stop();
  }, [value, motionSafe, mv, spring]);
  return mv;
}

function RolledSize({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const mv = useRoll(value, motionSafe);
  const text = useTransform(mv, formatSize);
  return <motion.span className={className}>{text}</motion.span>;
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
  const mv = useRoll(value, motionSafe, springs.snap);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  return <motion.span className={className}>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Tick({
  on,
  colour,
  motionSafe,
}: {
  on: boolean;
  colour: string;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors duration-150",
        on ? "border-transparent text-white" : "border-hairline-strong bg-card",
      )}
      style={on ? { backgroundColor: colour } : undefined}
    >
      <svg viewBox="0 0 16 16" className="size-3">
        <motion.path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={
            motionSafe ? springs.flick : { duration: durations.blink }
          }
        />
      </svg>
    </span>
  );
}

type Origin = { x: number; y: number; t: number };

/** Only ever called from handlers and effects: when a row was chosen. */
const stampNow = () => performance.now();

/**
 * A chosen file in the tray. It is born where its row's name sits — measured
 * the moment it was chosen — and travels to its slot on glide, so choosing
 * reads as lifting the file out of the list. Only a fresh origin flies: a
 * chip re-mounted later (the tray docking) simply appears.
 */
function TrayChip({
  file,
  colour,
  index,
  motionSafe,
  disabled,
  originOf,
  onPutBack,
}: {
  file: SpaceReclaimFile;
  colour: string;
  index: number;
  motionSafe: boolean;
  disabled: boolean;
  originOf: (id: string) => Origin | undefined;
  onPutBack: () => void;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  React.useLayoutEffect(() => {
    const node = ref.current;
    const origin = originOf(file.id);
    if (!node || !origin || !motionSafe) return;
    if (stampNow() - origin.t > 700) return;
    const me = node.getBoundingClientRect();
    if (me.width === 0) return;
    const dx = Math.round(origin.x - me.left);
    const dy = Math.round(origin.y - me.top);
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    const controls = animate(
      node,
      { x: [dx, 0], y: [dy, 0] },
      { ...springs.glide, delay: Math.min(index, 6) * cascade(8) },
    );
    // A re-run (StrictMode) lands this flight; the next run flies again.
    return () => controls.complete();
  }, [file.id, index, motionSafe, originOf]);

  return (
    <span
      ref={ref}
      className="relative z-[2] inline-flex h-7 w-full items-center gap-1.5 rounded-2 border border-hairline bg-surface-1 pr-0.5 pl-2 text-[12px] shadow-[0_2px_8px_color-mix(in_oklab,black_8%,transparent)]"
    >
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: colour }}
      />
      <span className="min-w-0 flex-1 truncate" title={file.name}>
        {file.name}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
        {formatSize(file.size)}
      </span>
      <button
        type="button"
        aria-label={`Put back ${file.name}`}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onPutBack();
        }}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
          FOCUS_IN,
        )}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

type Phase =
  | { kind: "idle" }
  | { kind: "removing"; ids: string[] }
  | { kind: "failed"; ids: string[] };

const TRAY_SHOWN = 5;
const DOCK_SHOWN = 4;

/**
 * A storage clean-up surface. A quota bar for the whole drive sits over the
 * scan's biggest files, ranked by size: each row has its own proportional
 * bar, its type and when it was last opened. Used space is drawn per file
 * type in one hue at stepped pigment lightness, so the bar is one quiet
 * family with the free track beside it.
 *
 * Choosing a file lifts its chip out of the row and flies it into the To
 * remove tray on glide; in the same beat a striped part grows at the right
 * end of that type's segment of the quota bar, the space it would give back.
 * Remove drains the bar: each segment shrinks by exactly its striped part on
 * glide, the used figure rolls down on the same spring, and the removed rows
 * fold away while the rows below close up. Nothing bounces — this is a
 * deletion, and it should feel calm.
 *
 * The list is a multi-select listbox with one tab stop: arrows move, Space
 * chooses, Shift extends a range from the anchor, Ctrl or Cmd with A chooses
 * all, Enter opens, K keeps a file out of the suggestions, Delete goes to
 * Remove and Escape clears. A scan shows its progress, an empty scan earns a
 * calm line, and a failed removal keeps the selection. Under reduced motion
 * nothing flies or folds: chips and rows fade, bars and figures change at
 * once, and every number still changes.
 */
export function SpaceReclaim({
  files = defaultSpaceReclaimFiles,
  quota = defaultSpaceReclaimQuota,
  selected,
  defaultSelected,
  onSelectedChange,
  onReclaim,
  onSkip,
  onOpen,
  onRescan,
  status = "ready",
  scanProgress = 0,
  scanPath,
  scannedAt,
  now = defaultSpaceReclaimNow,
  barStyle = "bar",
  density = "cozy",
  tone = "cobalt",
  title = "Coldbrook workspace",
  height = 540,
  disabled = false,
  className,
}: SpaceReclaimProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const listLabelId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const trayId = `${uid}-tray`;
  const dockPanelId = `${uid}-dock`;
  const geo = GEOMETRY[barStyle] ?? GEOMETRY.bar;
  const den = DENSITY[density] ?? DENSITY.cozy;
  const toneKey: SpaceReclaimTone = tone in TONE_BASE ? tone : "cobalt";
  const scanning = status === "scanning";
  const lastScan = scannedAt ?? now - 3 * 60_000;

  /* ------------------------------- state -------------------------------- */

  const [ownSelected, setOwnSelected] = React.useState<string[]>(
    () => defaultSelected ?? [],
  );
  const chosenRaw = selected ?? ownSelected;

  // What the surface did on its own since the host last spoke: files it
  // removed or was told to keep out. New data from the host replaces it.
  const [gone, setGone] = React.useState<ReadonlySet<string>>(() => new Set());
  const [kept, setKept] = React.useState<ReadonlySet<string>>(() => new Set());
  const [folded, setFolded] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [seen, setSeen] = React.useState({ files, quota });
  if (seen.files !== files || seen.quota !== quota) {
    setSeen({ files, quota });
    setGone(new Set());
    setKept(new Set());
    setFolded(new Set());
  }

  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const [active, setActive] = React.useState<string | null>(null);
  const [anchor, setAnchor] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState<string | null>(null);
  const [dockOpen, setDockOpen] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Scan progress is spoken in quarters, frozen in the render that crosses one.
  const quarter = scanning ? Math.floor(clamp01(scanProgress) * 4) : -1;
  const [spokenQuarter, setSpokenQuarter] = React.useState(quarter);
  if (spokenQuarter !== quarter) {
    setSpokenQuarter(quarter);
    if (quarter >= 0) {
      setSaid((s) => ({
        n: s.n + 1,
        text: `Scanning, ${Math.min(100, quarter * 25)} percent.`,
      }));
    }
  }

  const ranked = React.useMemo(
    () =>
      [...files].sort((a, b) => b.size - a.size || (a.name < b.name ? -1 : 1)),
    [files],
  );
  const byId = React.useMemo(
    () => new Map(files.map((f) => [f.id, f])),
    [files],
  );
  /** Rows still drawn: those leaving keep their place until they have folded. */
  const drawn = ranked.filter((f) => !folded.has(f.id));
  const leaving = (id: string) => gone.has(id) || kept.has(id);
  const live = drawn.filter((f) => !leaving(f.id));
  const liveIds = new Set(live.map((f) => f.id));
  const chosen = chosenRaw.filter((id) => liveIds.has(id));
  const chosenSet = new Set(chosen);
  const chosenFiles = chosen
    .map((id) => byId.get(id))
    .filter((f): f is SpaceReclaimFile => f !== undefined);
  const chosenBytes = chosenFiles.reduce((t, f) => t + f.size, 0);
  const maxSize = ranked.reduce((m, f) => Math.max(m, f.size), 1);
  const busy = phase.kind === "removing";
  const locked = disabled || busy || scanning;

  /* ------------------------------- quota -------------------------------- */

  const freed = ranked.reduce((t, f) => t + (gone.has(f.id) ? f.size : 0), 0);
  const used = Math.max(0, quota.used - freed);
  const total = Math.max(1, quota.total);

  const typeOrder = React.useMemo(() => {
    const sums = new Map<SpaceReclaimType, number>();
    for (const f of files) sums.set(f.type, (sums.get(f.type) ?? 0) + f.size);
    return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [files]);
  const colourOf = (type: SpaceReclaimType) =>
    pigment(
      toneKey,
      STEPS[Math.max(0, typeOrder.indexOf(type)) % STEPS.length] ?? 0.66,
    );

  const segments = typeOrder.map((type) => {
    const inType = ranked.filter((f) => f.type === type);
    const left = inType
      .filter((f) => !gone.has(f.id))
      .reduce((t, f) => t + f.size, 0);
    const picked = inType
      .filter((f) => chosenSet.has(f.id))
      .reduce((t, f) => t + f.size, 0);
    return { type, left, picked };
  });
  const listed = segments.reduce((t, s) => t + s.left, 0);
  const other = Math.max(0, used - listed);

  const usedMv = useRoll(used, motionSafe);
  const usedText = useTransform(usedMv, formatSize);
  const freeText = useTransform(usedMv, (v) => formatSize(total - v));

  /* --------------------------- flights & focus --------------------------- */

  const nameNodes = React.useRef(new Map<string, HTMLElement>());
  const rowNodes = React.useRef(new Map<string, HTMLElement>());
  const origins = React.useRef(new Map<string, Origin>());
  const originOf = React.useCallback(
    (id: string) => origins.current.get(id),
    [],
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [focusAsk, setFocusAsk] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  React.useEffect(() => {
    if (focusAsk) rowNodes.current.get(focusAsk.id)?.focus();
  }, [focusAsk]);

  const activeId =
    active && liveIds.has(active) ? active : (live[0]?.id ?? null);

  const focusRow = (id: string) => {
    setActive(id);
    setFocusAsk((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };

  /* ------------------------------ actions ------------------------------- */

  const commitSelection = (next: string[]) => {
    const stamp = stampNow();
    for (const id of next) {
      if (chosenSet.has(id)) continue;
      const node = nameNodes.current.get(id);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      origins.current.set(id, { x: r.left, y: r.top, t: stamp });
    }
    if (selected === undefined) setOwnSelected(next);
    onSelectedChange?.(next);
    if (phase.kind === "failed") setPhase({ kind: "idle" });
    const bytes = next.reduce((t, id) => t + (byId.get(id)?.size ?? 0), 0);
    say(
      next.length === 0
        ? "Nothing chosen."
        : `${plural(next.length, "file", "files")} chosen, ${formatSize(bytes)} to free.`,
    );
  };

  const toggle = (id: string) => {
    if (locked) return;
    setAnchor(id);
    commitSelection(
      chosenSet.has(id) ? chosen.filter((x) => x !== id) : [...chosen, id],
    );
  };

  const extendTo = (id: string, from?: string) => {
    if (locked) return;
    const start = anchor ?? from ?? id;
    const a = live.findIndex((f) => f.id === start);
    const b = live.findIndex((f) => f.id === id);
    if (a === -1 || b === -1) {
      toggle(id);
      return;
    }
    const span = live.slice(Math.min(a, b), Math.max(a, b) + 1);
    const added = span.filter((f) => !chosenSet.has(f.id)).map((f) => f.id);
    if (anchor === null) setAnchor(start);
    if (added.length > 0) commitSelection([...chosen, ...added]);
  };

  const keep = (file: SpaceReclaimFile) => {
    if (locked) return;
    setKept((k) => new Set(k).add(file.id));
    if (chosenSet.has(file.id)) {
      const next = chosen.filter((x) => x !== file.id);
      if (selected === undefined) setOwnSelected(next);
      onSelectedChange?.(next);
    }
    const at = live.findIndex((f) => f.id === file.id);
    const neighbour = live[at + 1] ?? live[at - 1];
    if (neighbour && activeId === file.id) focusRow(neighbour.id);
    say(`${file.name} kept. It won't be suggested again.`);
    onSkip?.(file);
  };

  const open = (file: SpaceReclaimFile) => {
    if (disabled) return;
    say(`Opening ${file.name}.`);
    onOpen?.(file);
  };

  const finish = (ids: string[]) => {
    const bytes = ids.reduce((t, id) => t + (byId.get(id)?.size ?? 0), 0);
    setGone((g) => {
      const n = new Set(g);
      for (const id of ids) n.add(id);
      return n;
    });
    const rest = chosen.filter((id) => !ids.includes(id));
    if (selected === undefined) setOwnSelected(rest);
    onSelectedChange?.(rest);
    setPhase({ kind: "idle" });
    setDockOpen(false);
    say(
      `Removed ${plural(ids.length, "file", "files")}. ${formatSize(bytes)} freed.`,
    );
  };

  const reclaim = () => {
    if (locked || chosen.length === 0) return;
    const ids = [...chosen];
    const result = onReclaim?.(ids, chosenBytes);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPhase({ kind: "removing", ids });
      say(`Removing ${plural(ids.length, "file", "files")}.`);
      (result as Promise<unknown>).then(
        () => finish(ids),
        () => {
          setPhase({ kind: "failed", ids });
          say("Nothing was removed. Your selection is kept.");
        },
      );
    } else {
      finish(ids);
    }
  };

  const focusRemove = () => {
    const nodes =
      rootRef.current?.querySelectorAll<HTMLElement>("[data-sr-remove]");
    for (const node of nodes ?? []) {
      if (node.offsetParent !== null) {
        node.focus();
        return;
      }
    }
  };

  /* ------------------------------ keyboard ------------------------------ */

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!activeId || scanning) return;
    const at = live.findIndex((f) => f.id === activeId);
    const file = live[at];
    if (!file) return;
    const go = (i: number) => {
      const target = live[Math.min(live.length - 1, Math.max(0, i))];
      if (target) focusRow(target.id);
      return target;
    };
    const mod = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const target = go(at + (event.key === "ArrowDown" ? 1 : -1));
        if (event.shiftKey && target) extendTo(target.id, file.id);
        return;
      }
      case "Home":
      case "End": {
        event.preventDefault();
        const target = go(event.key === "Home" ? 0 : live.length - 1);
        if (event.shiftKey && target) extendTo(target.id, file.id);
        return;
      }
      case " ":
        event.preventDefault();
        if (event.shiftKey) extendTo(file.id);
        else toggle(file.id);
        return;
      case "Enter":
        event.preventDefault();
        open(file);
        return;
      case "Delete":
      case "Backspace":
        if (chosen.length > 0) {
          event.preventDefault();
          focusRemove();
        }
        return;
      case "Escape":
        if (chosen.length > 0 && !locked) {
          // Ours: the selection clears, and nothing around the surface closes.
          event.preventDefault();
          commitSelection([]);
        }
        return;
      default:
        break;
    }
    if (mod && (event.key === "a" || event.key === "A")) {
      event.preventDefault();
      if (locked) return;
      const added = live.filter((f) => !chosenSet.has(f.id)).map((f) => f.id);
      if (added.length > 0) commitSelection([...chosen, ...added]);
      return;
    }
    if (!mod && !event.altKey && (event.key === "k" || event.key === "K")) {
      event.preventDefault();
      keep(file);
    }
  };

  /* ------------------------------- render ------------------------------- */

  const toneColour = pigment(toneKey, 0.6);
  const quotaLabel = `${formatSize(used)} of ${formatSize(total)} used${
    chosenBytes > 0 ? `, ${formatSize(chosenBytes)} chosen to free` : ""
  }`;
  const exitTween = { duration: durations.base, ease: easings.exit };
  const rowH = den.row;

  const sizeBar = (file: SpaceReclaimFile, picked: boolean) => (
    <span
      aria-hidden
      className={cn("relative block w-full bg-surface-2", geo.radius)}
      style={{ height: geo.row, maskImage: geo.rowMask }}
    >
      <span
        className={cn("absolute inset-y-0 left-0", geo.radius)}
        style={{
          width: `${r3((file.size / maxSize) * 100)}%`,
          backgroundColor: colourOf(file.type),
          backgroundImage: picked ? HATCH : undefined,
        }}
      />
    </span>
  );

  const rows = drawn.map((file) => {
    const isLeaving = leaving(file.id);
    const isChosen = chosenSet.has(file.id);
    const isActive = activeId === file.id;
    const { Icon, label } = TYPES[file.type] ?? TYPES.doc;
    const opened = openedLabel(file.lastOpened, now);
    const showActions = touched === file.id;
    return (
      <motion.div
        key={file.id}
        ref={(node: HTMLDivElement | null) => {
          if (node) rowNodes.current.set(file.id, node);
          else rowNodes.current.delete(file.id);
        }}
        role={isLeaving ? "presentation" : "option"}
        aria-selected={isLeaving ? undefined : isChosen}
        aria-label={
          isLeaving
            ? undefined
            : `${file.name}, ${label}, ${formatSize(file.size)}, ${opened.toLowerCase()}, in ${file.folder}`
        }
        aria-hidden={isLeaving || undefined}
        tabIndex={!isLeaving && isActive ? 0 : -1}
        initial={false}
        animate={{
          height: isLeaving ? 0 : rowH,
          opacity: isLeaving ? 0 : 1,
        }}
        transition={
          motionSafe
            ? { height: springs.glide, opacity: exitTween }
            : { duration: isLeaving ? durations.fast : 0 }
        }
        onAnimationComplete={() => {
          if (isLeaving) setFolded((f) => new Set(f).add(file.id));
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget && !isActive) {
            setActive(file.id);
          }
        }}
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault();
        }}
        onPointerUp={(event) => {
          if (event.pointerType !== "mouse") setTouched(file.id);
        }}
        onClick={(event) => {
          if (isLeaving || locked) return;
          setActive(file.id);
          if (event.shiftKey) extendTo(file.id);
          else toggle(file.id);
        }}
        className={cn(
          "group/space-reclaim-row relative shrink-0 overflow-hidden border-b border-hairline bg-(--sr-row) transition-colors duration-150",
          isChosen
            ? "[--sr-row:color-mix(in_oklab,var(--sr-tone)_8%,var(--card))]"
            : "[--sr-row:var(--card)]",
          !locked &&
            !isChosen &&
            "hover:[--sr-row:color-mix(in_oklab,var(--foreground)_4%,var(--card))]",
          locked ? "cursor-default" : "cursor-pointer",
          isLeaving && "pointer-events-none",
          FOCUS_IN,
        )}
      >
        <div className="flex items-center gap-3 px-4" style={{ height: rowH }}>
          <Tick on={isChosen} colour={toneColour} motionSafe={motionSafe} />
          <span
            aria-hidden
            className={cn(
              "hidden shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 @min-[24rem]:flex",
              den.glyph,
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
            <span
              ref={(node) => {
                if (node) nameNodes.current.set(file.id, node);
                else nameNodes.current.delete(file.id);
              }}
              className="block truncate text-[13px] leading-[18px] font-medium text-foreground"
              title={file.name}
            >
              {file.name}
            </span>
            {den.meta ? (
              <span className="block truncate text-[11px] leading-4 text-ink-3">
                {label} · {opened}
                {den.folder ? ` · ${file.folder}` : ""}
              </span>
            ) : null}
            <span className="mt-1 block @min-[34rem]:hidden">
              {sizeBar(file, isChosen)}
            </span>
          </span>
          <span
            className={cn(
              "hidden shrink-0 @min-[34rem]:block",
              density === "roomy" ? "w-32" : "w-24",
            )}
          >
            {sizeBar(file, isChosen)}
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-[12px] text-ink-2 tabular-nums @min-[30rem]:w-16">
            {formatSize(file.size)}
          </span>
        </div>
        {/* Pointer twins of Enter and K: the keys are the accessible path. */}
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 right-0 flex items-center gap-1 bg-linear-to-r from-transparent via-(--sr-row) via-35% to-(--sr-row) pr-3 pl-10 transition-opacity duration-150",
            showActions
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover/space-reclaim-row:pointer-events-auto group-hover/space-reclaim-row:opacity-100 group-focus-visible/space-reclaim-row:opacity-100",
            locked && "hidden",
          )}
        >
          <button
            type="button"
            tabIndex={-1}
            title="Open"
            onClick={(event) => {
              event.stopPropagation();
              open(file);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-2 border border-hairline bg-card px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span className="hidden @min-[30rem]:inline">Open</span>
          </button>
          <button
            type="button"
            tabIndex={-1}
            title="Keep — stop suggesting it"
            onClick={(event) => {
              event.stopPropagation();
              keep(file);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-2 border border-hairline bg-card px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <EyeOff className="size-3.5 shrink-0" />
            <span className="hidden @min-[30rem]:inline">Keep</span>
          </button>
        </span>
      </motion.div>
    );
  });

  const skeleton = Array.from({ length: 7 }, (_, i) => (
    <div
      key={`sk-${i}`}
      aria-hidden
      className="flex shrink-0 items-center gap-3 border-b border-hairline px-4"
      style={{ height: rowH }}
    >
      <span className="size-4 rounded-1 bg-surface-2" />
      <span className={cn("rounded-2 bg-surface-2", den.glyph)} />
      <span className="flex flex-1 flex-col gap-1.5">
        <span
          className="h-2.5 rounded-full bg-surface-2"
          style={{ width: `${44 + ((i * 29) % 40)}%` }}
        />
        {den.meta ? (
          <span
            className="h-2 rounded-full bg-surface-2/70"
            style={{ width: `${26 + ((i * 17) % 24)}%` }}
          />
        ) : null}
      </span>
      <span className="h-2.5 w-12 rounded-full bg-surface-2" />
    </div>
  ));

  const empty = live.length === 0 && !scanning;

  const removeButton = (where: "tray" | "dock") => {
    const failed = phase.kind === "failed";
    const off = locked || chosen.length === 0;
    return (
      <button
        type="button"
        data-sr-remove={where}
        aria-disabled={off || undefined}
        aria-busy={busy || undefined}
        onClick={reclaim}
        className={cn(
          "relative inline-flex h-9 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-2 px-3 text-[13px] font-medium transition-[background-color,color,opacity] duration-150",
          where === "tray" && "w-full",
          off && !busy
            ? "cursor-not-allowed bg-surface-2 text-ink-3"
            : "bg-primary text-primary-foreground hover:opacity-90",
          FOCUS_RING,
        )}
      >
        {busy ? (
          <>
            Removing…
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary-foreground/20"
            >
              {motionSafe ? (
                <motion.span
                  className="absolute inset-y-0 w-1/3 bg-primary-foreground/80"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{
                    duration: 1.1,
                    ease: "linear",
                    repeat: Infinity,
                  }}
                />
              ) : (
                <span className="absolute inset-0 bg-primary-foreground/50" />
              )}
            </span>
          </>
        ) : failed ? (
          "Try again"
        ) : chosen.length === 0 ? (
          "Remove"
        ) : where === "dock" ? (
          "Remove"
        ) : (
          `Remove ${plural(chosen.length, "file", "files")}`
        )}
      </button>
    );
  };

  const failedNote =
    phase.kind === "failed" ? (
      <p className="flex items-start gap-1.5 text-[12px] leading-4 text-danger">
        <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
        Nothing was removed. Your selection is kept.
      </p>
    ) : null;

  const newestFirst = [...chosenFiles].reverse();

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
      style={{ height, ["--sr-tone" as string]: TONE_BASE[toneKey] }}
    >
      {/* ------------------------------ header ------------------------------ */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Storage
          </p>
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {scanning
              ? "Scanning now"
              : `${scannedLabel(lastScan, now)} · ${plural(live.length, "suggestion", "suggestions")}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!disabled && !scanning) onRescan?.();
          }}
          aria-disabled={disabled || scanning || undefined}
          aria-label={scanning ? "Scanning" : "Rescan"}
          className={cn(
            "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-50 aria-disabled:hover:bg-transparent @min-[30rem]:px-2.5",
            FOCUS_RING,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          <span aria-hidden className="hidden @min-[30rem]:inline">
            {scanning ? "Scanning" : "Rescan"}
          </span>
        </button>
      </header>

      {/* ------------------------------- quota ------------------------------ */}
      <section
        aria-label="Quota"
        className="shrink-0 border-b border-hairline px-4 pt-3 pb-3"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-[13px] text-ink-2">
            <motion.span className="font-mono font-medium text-foreground tabular-nums">
              {usedText}
            </motion.span>{" "}
            of {formatSize(total)} used
          </p>
          <p className="text-[12px] text-ink-3">
            <motion.span className="font-mono text-ink-2 tabular-nums">
              {freeText}
            </motion.span>{" "}
            free
          </p>
        </div>
        <div
          role="meter"
          aria-label="Space used"
          aria-valuemin={0}
          aria-valuemax={Math.round(total / 1e8) / 10}
          aria-valuenow={Math.round(used / 1e8) / 10}
          aria-valuetext={quotaLabel}
          className={cn(
            "mt-2 flex w-full overflow-hidden bg-surface-2",
            geo.radius,
          )}
          style={{ height: geo.quota, maskImage: geo.mask }}
        >
          <motion.span
            className="h-full shrink-0 bg-[color-mix(in_oklab,var(--ink-3)_38%,transparent)] shadow-[inset_-1px_0_0_var(--card)]"
            initial={false}
            animate={{ width: `${r3((other / total) * 100)}%` }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
          {segments.map((s) => (
            <motion.span
              key={s.type}
              className="relative h-full shrink-0 overflow-hidden shadow-[inset_-1px_0_0_var(--card)]"
              style={{ backgroundColor: colourOf(s.type) }}
              initial={false}
              animate={{ width: `${r3((s.left / total) * 100)}%` }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            >
              <motion.span
                className="absolute inset-y-0 right-0"
                style={{ backgroundImage: HATCH }}
                initial={false}
                animate={{
                  width: `${s.left > 0 ? r3(Math.min(100, (s.picked / s.left) * 100)) : 0}%`,
                }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            </motion.span>
          ))}
        </div>
        <ul
          aria-label="By type"
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-2"
        >
          {segments.map((s) => (
            <li key={s.type} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: colourOf(s.type) }}
              />
              {TYPES[s.type]?.label ?? s.type}
              <span className="hidden font-mono text-ink-3 tabular-nums @min-[30rem]:inline">
                {formatSize(s.left)}
              </span>
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-[color-mix(in_oklab,var(--ink-3)_38%,transparent)]"
            />
            Everything else
          </li>
        </ul>
        {scanning ? (
          <div className="mt-3 flex flex-col gap-1.5">
            <p className="flex items-baseline justify-between gap-3 text-[11px] text-ink-3">
              <span className="min-w-0 truncate">
                Reading {scanPath ?? "the drive"}
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {Math.round(clamp01(scanProgress) * 100)}%
              </span>
            </p>
            <span
              aria-hidden
              className="relative block h-1 overflow-hidden rounded-full bg-surface-2"
            >
              <motion.span
                className="absolute inset-0 origin-left rounded-full"
                style={{ backgroundColor: toneColour }}
                initial={false}
                animate={{ scaleX: r3(clamp01(scanProgress)) }}
                transition={{
                  duration: motionSafe ? durations.slow : durations.fast,
                  ease: easings.enter,
                }}
              />
            </span>
          </div>
        ) : null}
      </section>

      {/* ------------------------------- body ------------------------------- */}
      <div className="relative flex flex-1 flex-col overflow-hidden @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_14rem] @min-[75rem]:grid-cols-[minmax(0,1fr)_16rem]">
        <section
          aria-labelledby={listLabelId}
          className="flex flex-1 flex-col overflow-hidden"
        >
          {status === "error" ? (
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline bg-[color-mix(in_oklab,var(--warn)_8%,var(--card))] px-4 py-2 text-[12px]">
              <TriangleAlert
                aria-hidden
                className="size-3.5 shrink-0 text-warn"
              />
              <span className="min-w-0 flex-1 text-ink-2">
                The scan stopped{scanPath ? ` at ${scanPath}` : ""}. These
                results may be incomplete.
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!disabled) onRescan?.();
                }}
                className={cn(
                  "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline bg-card px-2 text-[11px] text-foreground hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3" />
                Retry
              </button>
            </div>
          ) : null}
          <div className="flex h-8 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
            <p
              id={listLabelId}
              className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
            >
              Largest first
            </p>
            <p className="font-mono text-[10px] text-ink-3 tabular-nums">
              {scanning
                ? "…"
                : formatSize(live.reduce((t, f) => t + f.size, 0))}
            </p>
          </div>
          <p id={hintId} className="sr-only">
            Space chooses a file, Shift with Space or an arrow chooses a range.
            Enter opens it, K keeps it out of the suggestions, Delete goes to
            Remove, Escape clears.
          </p>
          <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
            {scanning ? (
              <div aria-busy="true">{skeleton}</div>
            ) : empty ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <Leaf aria-hidden className="size-5 text-success" />
                <p className="text-sm text-foreground">
                  Nothing worth clearing.
                </p>
                <p className="text-[12px] text-ink-3">
                  The workspace has {formatSize(total - used)} free.
                </p>
              </div>
            ) : (
              <div
                role="listbox"
                aria-multiselectable
                aria-labelledby={listLabelId}
                aria-describedby={hintId}
                aria-disabled={locked || undefined}
                onKeyDown={onListKeyDown}
                className="flex flex-col"
              >
                {rows}
              </div>
            )}
          </div>
        </section>

        {/* --------------------------- tray (wide) --------------------------- */}
        <aside
          id={trayId}
          aria-label="To remove"
          className="hidden flex-col gap-3 border-l border-hairline bg-surface-1 p-3 @min-[40rem]:flex"
        >
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              To remove
            </p>
            <p className="font-mono text-[10px] text-ink-3 tabular-nums">
              {plural(chosen.length, "file", "files")}
            </p>
          </div>
          <div>
            <RolledSize
              value={chosenBytes}
              motionSafe={motionSafe}
              className="block font-mono text-[22px] leading-7 font-medium tracking-tight tabular-nums"
            />
            <p className="text-[11px] text-ink-3">
              {chosen.length > 0
                ? "comes back when removed"
                : "Choose files to see what comes back."}
            </p>
          </div>
          <ol className="flex flex-col gap-1.5">
            {newestFirst.slice(0, TRAY_SHOWN).map((file, i) => (
              <motion.li
                key={file.id}
                layout={motionSafe ? "position" : false}
                transition={{ layout: springs.glide }}
              >
                <TrayChip
                  file={file}
                  colour={colourOf(file.type)}
                  index={i}
                  motionSafe={motionSafe}
                  disabled={locked}
                  originOf={originOf}
                  onPutBack={() => toggle(file.id)}
                />
              </motion.li>
            ))}
            {newestFirst.length > TRAY_SHOWN ? (
              <li className="px-1 text-[11px] text-ink-3">
                and {newestFirst.length - TRAY_SHOWN} more
              </li>
            ) : null}
          </ol>
          <div className="mt-auto flex flex-col gap-2">
            {failedNote}
            {removeButton("tray")}
          </div>
        </aside>

        {/* --------------------------- tray (docked) -------------------------- */}
        <div
          className="relative shrink-0 border-t border-hairline bg-surface-1 @min-[40rem]:hidden"
          onKeyDown={(event) => {
            // Handled wherever focus is in the dock — the panel, Review or
            // Remove — so the stage around the surface never sees it.
            if (event.key === "Escape" && dockOpen) {
              event.preventDefault();
              setDockOpen(false);
            }
          }}
        >
          <AnimatePresence initial={false}>
            {dockOpen && chosen.length > 0 ? (
              <motion.div
                key="dock-panel"
                id={dockPanelId}
                role="region"
                aria-label="To remove"
                className="absolute inset-x-0 bottom-full z-[3] border-t border-hairline bg-surface-1 px-3 pt-3 pb-2 shadow-[0_-8px_20px_color-mix(in_oklab,black_10%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitTween }}
                transition={
                  motionSafe
                    ? {
                        y: springs.glide,
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.fast }
                }
              >
                <ol className="flex flex-col gap-1.5">
                  {newestFirst.slice(0, DOCK_SHOWN).map((file, i) => (
                    <li key={file.id}>
                      <TrayChip
                        file={file}
                        colour={colourOf(file.type)}
                        index={i}
                        motionSafe={motionSafe}
                        disabled={locked}
                        originOf={originOf}
                        onPutBack={() => toggle(file.id)}
                      />
                    </li>
                  ))}
                  {newestFirst.length > DOCK_SHOWN ? (
                    <li className="px-1 text-[11px] text-ink-3">
                      and {newestFirst.length - DOCK_SHOWN} more
                    </li>
                  ) : null}
                </ol>
              </motion.div>
            ) : null}
          </AnimatePresence>
          {failedNote ? <div className="px-3 pt-2">{failedNote}</div> : null}
          <div className="flex h-13 items-center gap-2 px-3">
            <p className="flex min-w-0 flex-1 flex-col text-[12px] leading-4 text-ink-2">
              {chosen.length > 0 ? (
                <>
                  <span className="truncate">
                    <RolledCount
                      value={chosen.length}
                      motionSafe={motionSafe}
                      className="font-mono text-foreground tabular-nums"
                    />{" "}
                    {chosen.length === 1 ? "file" : "files"}
                  </span>
                  <RolledSize
                    value={chosenBytes}
                    motionSafe={motionSafe}
                    className="truncate font-mono text-foreground tabular-nums"
                  />
                </>
              ) : (
                <span className="truncate text-ink-3">Nothing chosen</span>
              )}
            </p>
            {chosen.length > 0 ? (
              <button
                type="button"
                aria-expanded={dockOpen}
                aria-controls={dockOpen ? dockPanelId : undefined}
                onClick={() => setDockOpen((o) => !o)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {dockOpen ? "Hide" : "Review"}
              </button>
            ) : null}
            {removeButton("dock")}
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
