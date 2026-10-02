"use client";

import * as React from "react";

import {
  ChevronLeft,
  ChevronRight,
  FileArchive,
  FileAudio,
  FileCode,
  FileSpreadsheet,
  FileText,
  FolderInput,
  LayoutGrid,
  List,
  Presentation,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
  type Transition,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FileKind =
  | "folder"
  | "doc"
  | "sheet"
  | "slides"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code";

export type FileItem = {
  id: string;
  name: string;
  kind: FileKind;
  /** The folder it is in; the root's id for the top level. */
  parentId: string;
  /** Bytes. Files only. */
  size?: number;
  /** Epoch ms. */
  modified: number;
  owner?: string;
};

export type FileBrowserView = "grid" | "list";
/** How the lasso picks: items it touches, only items wholly inside it, or no lasso. */
export type FileBrowserLasso = "touch" | "contain" | "off";
/** The spring the morph, the navigation and every landing ride on. */
export type FileBrowserSpring = "snap" | "glide" | "recoil";
export type FileBrowserStatus = "ready" | "loading" | "error";

/**
 * Stores one file. Report progress from 0 to 1, honour the signal, and
 * resolve with anything the stored item should carry (an id, a name).
 */
export type FileUploader = (
  file: File,
  progress: (fraction: number) => void,
  signal: AbortSignal,
) => Promise<Partial<FileItem> | void>;

export type FileBrowserHandle = {
  /** Uploads files into the open folder, as a drop or the picker would. */
  upload: (files: File[] | FileList) => void;
};

export type FileBrowserProps = {
  /** Grid or list. Changing it morphs every item into the other layout; the toggle also switches it. @default the defaultView */
  view?: FileBrowserView;
  /** The first layout, when `view` is not given. @default "grid" */
  defaultView?: FileBrowserView;
  /** Fires from the toggle with the new layout. */
  onViewChange?: (view: FileBrowserView) => void;
  /** How the lasso picks: items it touches, only items wholly inside it, or off. @default "touch" */
  lasso?: FileBrowserLasso;
  /** The spring under the morph, the navigation and every landing: crisp, settled or bouncy. @default "glide" */
  spring?: FileBrowserSpring;
  /** Controlled items, every folder, linked by parentId. */
  files?: FileItem[];
  /** Initial items when uncontrolled. @default defaultFiles */
  defaultFiles?: FileItem[];
  /** Fires from the drop, paste, upload or delete that changed the items, with all of them. */
  onFilesChange?: (files: FileItem[]) => void;
  /** Controlled open folder id. */
  folder?: string;
  /** Initial folder when uncontrolled. @default the root */
  defaultFolder?: string;
  onFolderChange?: (folder: string) => void;
  /** Controlled selection, item ids. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultSelected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  /** The id items at the top level carry as parentId. @default "root" */
  rootId?: string;
  /** The top level's name in the breadcrumb and tree. @default "Files" */
  rootLabel?: string;
  /** How long a dragged stack must hover a folder before it springs open, in ms. @default 700 */
  openDelay?: number;
  /** Stores an uploaded file. Without one, a local simulation runs (for demos). */
  upload?: FileUploader;
  /** File types the upload takes, as an input's accept: ".pdf,image/*". */
  accept?: string;
  /** The largest file the upload takes, bytes. @default 25 MB */
  maxSize?: number;
  /** Storage on the meter, bytes. @default 15 GB */
  quota?: number;
  /** The moment modified dates are read against. @default defaultFilesNow */
  now?: Date | number;
  /** Minutes east of UTC that dates are shown in. @default 0 */
  zoneOffset?: number;
  /** A file was opened: double-click, Enter, or Open in the details. */
  onOpen?: (item: FileItem) => void;
  /** Items moved into a folder, by drop, paste or Move to. */
  onMove?: (ids: string[], folderId: string) => void;
  /** Items removed (with everything inside a removed folder). */
  onDelete?: (ids: string[]) => void;
  /** An upload resolved and landed. */
  onUploadComplete?: (item: FileItem) => void;
  /** The browser's accessible name. @default "Files" */
  label?: string;
  /** Loading draws placeholder tiles; error offers Retry. @default "ready" */
  status?: FileBrowserStatus;
  onRetry?: () => void;
  /** Uploads from outside: `ref.current.upload(files)`. */
  ref?: React.Ref<FileBrowserHandle>;
  /** Play the picks, drops and swishes. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Numbers and dates                                                    */
/* ------------------------------------------------------------------ */

const MIN = 60_000;
const DAY = 86_400_000;
const MB = 1024 * 1024;
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
const pad2 = (n: number) => String(n).padStart(2, "0");
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/** "84 KB", "2.4 MB", "1.18 GB": three figures at most. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  const text = v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return `${Number(text)} ${units[u] ?? "TB"}`;
}

function modifiedOf(ms: number, now: number, off: number): string {
  const d = new Date(ms + off * MIN);
  const days =
    Math.floor((now + off * MIN) / DAY) - Math.floor((ms + off * MIN) / DAY);
  const clock = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  if (days <= 0) return `Today, ${clock}`;
  if (days === 1) return `Yesterday, ${clock}`;
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
  const year = new Date(now + off * MIN).getUTCFullYear();
  return d.getUTCFullYear() === year ? date : `${date} ${d.getUTCFullYear()}`;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const KIND_LABEL: Record<FileKind, string> = {
  folder: "Folder",
  doc: "Document",
  sheet: "Sheet",
  slides: "Slides",
  pdf: "PDF",
  image: "Image",
  video: "Video",
  audio: "Audio",
  archive: "Archive",
  code: "Code",
};

const KIND_TINT: Record<FileKind, string> = {
  folder: "var(--accent-bright)",
  doc: "var(--accent-bright)",
  sheet: "var(--success)",
  slides: "var(--warn)",
  pdf: "var(--danger)",
  image: "var(--signal)",
  video: "var(--ink-2)",
  audio: "var(--signal)",
  archive: "var(--ink-3)",
  code: "var(--accent-bright)",
};

/** A kind from a file's name and type, for uploads. */
function kindOf(name: string, type: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (["zip", "tar", "gz", "7z"].includes(ext)) return "archive";
  if (["csv", "tsv"].includes(ext)) return "sheet";
  if (["ts", "tsx", "js", "json", "css", "html", "py", "go"].includes(ext)) {
    return "code";
  }
  return "doc";
}

/** Does the file pass an input-style accept list? */
function accepts(accept: string | undefined, file: File): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) =>
      a.startsWith(".")
        ? name.endsWith(a)
        : a.endsWith("/*")
          ? type.startsWith(a.slice(0, -1))
          : type === a,
    );
}

/* ------------------------------------------------------------------ */
/* Defaults: the Basinworks shared drive                                */
/* ------------------------------------------------------------------ */

/** Friday 2 October 2026, 09:41 UTC. */
export const defaultFilesNow = Date.UTC(2026, 9, 2, 9, 41);

const day = (d: number, h = 10, m = 0) => Date.UTC(2026, 8, d, h, m);
const f = (
  id: string,
  name: string,
  kind: FileKind,
  parentId: string,
  modified: number,
  size?: number,
  owner = "Lina Moreau",
): FileItem => ({ id, name, kind, parentId, modified, size, owner });

export const defaultFiles: FileItem[] = [
  f("q4", "Q4 launch", "folder", "root", day(32, 9, 12)),
  f("brand", "Brand", "folder", "root", day(21)),
  f(
    "finance",
    "Finance",
    "folder",
    "root",
    day(29),
    undefined,
    "Jonah Abernathy",
  ),
  f(
    "handbook",
    "Team handbook",
    "doc",
    "root",
    day(12),
    412_000,
    "Priya Raman",
  ),
  f("campaign", "Campaign", "folder", "q4", day(31, 16, 40)),
  f(
    "contracts",
    "Contracts",
    "folder",
    "q4",
    day(28),
    undefined,
    "Jonah Abernathy",
  ),
  f("footage", "Footage", "folder", "q4", day(30, 11, 5)),
  f("brief", "Launch brief", "doc", "q4", day(32, 8, 55), 248_000),
  f(
    "budget",
    "Q4 budget",
    "sheet",
    "q4",
    day(30, 17, 20),
    86_000,
    "Jonah Abernathy",
  ),
  f("deck", "Launch deck", "slides", "q4", day(31, 18, 2), 18_400_000),
  f(
    "render",
    "hero-render-01.png",
    "image",
    "q4",
    day(29, 14, 30),
    3_900_000,
    "Tobias Lindgren",
  ),
  f(
    "film",
    "product-film.mp4",
    "video",
    "q4",
    day(31, 21, 10),
    412_000_000,
    "Tobias Lindgren",
  ),
  f("vo", "voiceover-take-3.wav", "audio", "q4", day(27), 46_200_000),
  f("presskit", "press-kit.zip", "archive", "q4", day(26), 128_000_000),
  f(
    "banner",
    "banner-wide.png",
    "image",
    "campaign",
    day(31, 15, 2),
    2_100_000,
    "Tobias Lindgren",
  ),
  f(
    "social",
    "social-cut-15s.mp4",
    "video",
    "campaign",
    day(31, 16, 40),
    64_000_000,
    "Tobias Lindgren",
  ),
  f("copy", "Campaign copy", "doc", "campaign", day(30), 96_000),
  f(
    "msa",
    "basinworks-msa.pdf",
    "pdf",
    "contracts",
    day(28),
    1_240_000,
    "Jonah Abernathy",
  ),
  f(
    "sow",
    "coldbrook-sow.pdf",
    "pdf",
    "contracts",
    day(25),
    860_000,
    "Jonah Abernathy",
  ),
  f(
    "broll",
    "b-roll-dock.mp4",
    "video",
    "footage",
    day(30, 11, 5),
    920_000_000,
    "Tobias Lindgren",
  ),
  f(
    "drone",
    "drone-pass.mp4",
    "video",
    "footage",
    day(29),
    640_000_000,
    "Tobias Lindgren",
  ),
  f("stills", "Stills", "folder", "footage", day(29, 12)),
  f(
    "still1",
    "dock-dawn.png",
    "image",
    "stills",
    day(29, 12),
    5_200_000,
    "Tobias Lindgren",
  ),
  f(
    "still2",
    "crane-line.png",
    "image",
    "stills",
    day(29, 12, 4),
    4_800_000,
    "Tobias Lindgren",
  ),
  f("logo", "logo-mark.png", "image", "brand", day(21), 180_000),
  f("palette", "palette.json", "code", "brand", day(21), 4_000),
  f(
    "invoices",
    "invoices-sep.csv",
    "sheet",
    "finance",
    day(30),
    22_000,
    "Jonah Abernathy",
  ),
  f(
    "calc",
    "pricing-calc.ts",
    "code",
    "finance",
    day(29),
    9_800,
    "Jonah Abernathy",
  ),
];

/* ------------------------------------------------------------------ */
/* Look                                                                 */
/* ------------------------------------------------------------------ */

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const TOOL = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  RING,
);
const TEXT_BUTTON = cn(
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-[13px] text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  RING,
);

const SPRINGS: Record<FileBrowserSpring, Transition> = {
  snap: springs.snap,
  glide: springs.glide,
  recoil: springs.recoil,
};

/** A touch rests this long before it lassoes or lifts, so a swipe scrolls. */
const HOLD_MS = 350;

/* ------------------------------------------------------------------ */
/* Thumbnails, procedural                                               */
/* ------------------------------------------------------------------ */

/**
 * A folder whose front plate tips open as `open` runs from 0 to 1 — the
 * charge of a stack hovering it. Pigment colours (a fixed lightness of the
 * accent's hue) read the same on light and dark pages.
 */
function FolderGlyph({
  open,
  className,
}: {
  open?: MotionValue<number>;
  className?: string;
}) {
  const zero = useMotionValue(0);
  const o = open ?? zero;
  const scaleY = useTransform(o, (v) => r2(1 - 0.2 * v));
  const skewX = useTransform(o, (v) => r2(-10 * v));
  const paper = useTransform(o, (v) => r2(-3 * v));
  return (
    <svg aria-hidden viewBox="0 0 48 40" className={cn("block", className)}>
      <path
        d="M4 8a3 3 0 0 1 3-3h11l4 4h19a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
        style={{ fill: "oklch(from var(--accent-bright) 0.66 0.12 h)" }}
      />
      <motion.rect
        x={9}
        y={11}
        width={30}
        height={20}
        rx={1.5}
        className="fill-card"
        style={{ y: paper }}
      />
      <motion.path
        d="M4 15a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"
        style={{
          fill: "oklch(from var(--accent-bright) 0.78 0.1 h)",
          scaleY,
          skewX,
          originX: 0.5,
          originY: 1,
        }}
      />
    </svg>
  );
}

function ImageArt({ seed, className }: { seed: string; className?: string }) {
  const h = hash(seed);
  const tints = [
    "var(--accent-bright)",
    "var(--success)",
    "var(--warn)",
    "var(--signal)",
  ];
  const tint = tints[h % tints.length] ?? "var(--accent-bright)";
  const sun = 16 + ((h >>> 3) % 48);
  const a = 30 + ((h >>> 9) % 10);
  const b = 36 + ((h >>> 13) % 10);
  return (
    <svg
      aria-hidden
      viewBox="0 0 80 60"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block", className)}
    >
      <rect
        width={80}
        height={60}
        style={{ fill: `oklch(from ${tint} 0.9 0.04 h)` }}
      />
      <circle
        cx={sun}
        cy={18}
        r={7}
        style={{ fill: `oklch(from ${tint} 0.97 0.04 h)` }}
      />
      <path
        d={`M0 ${a} Q20 ${a - 10} 40 ${a} T80 ${a - 4} V60 H0Z`}
        style={{ fill: `oklch(from ${tint} 0.68 0.1 h)` }}
      />
      <path
        d={`M0 ${b + 8} Q24 ${b - 4} 52 ${b + 4} T80 ${b} V60 H0Z`}
        style={{ fill: `oklch(from ${tint} 0.5 0.1 h)` }}
      />
    </svg>
  );
}

function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const cls = cn("shrink-0", className);
  switch (kind) {
    case "sheet":
      return <FileSpreadsheet aria-hidden className={cls} />;
    case "slides":
      return <Presentation aria-hidden className={cls} />;
    case "audio":
      return <FileAudio aria-hidden className={cls} />;
    case "archive":
      return <FileArchive aria-hidden className={cls} />;
    case "code":
      return <FileCode aria-hidden className={cls} />;
    default:
      return <FileText aria-hidden className={cls} />;
  }
}

/** The picture for an item, filling its box. */
function Thumb({
  item,
  open,
  large = false,
}: {
  item: { name: string; kind: FileKind };
  open?: MotionValue<number>;
  large?: boolean;
}) {
  if (item.kind === "folder") {
    return (
      <span className="flex size-full items-center justify-center">
        <FolderGlyph open={open} className="h-[72%] w-auto max-w-[86%]" />
      </span>
    );
  }
  if (item.kind === "image") {
    return <ImageArt seed={item.name} className="size-full" />;
  }
  if (item.kind === "video") {
    // A film frame is dark on any page: pigment, not the foreground token.
    return (
      <span
        className="relative flex size-full items-center justify-center"
        style={{ background: "oklch(from var(--accent-bright) 0.27 0.02 h)" }}
      >
        <span
          className={cn(
            "flex items-center justify-center rounded-full",
            large ? "size-9" : "size-[38%] max-h-6 max-w-6",
          )}
          style={{ background: "oklch(from var(--accent-bright) 0.95 0.01 h)" }}
        >
          <svg aria-hidden viewBox="0 0 10 10" className="size-1/2">
            <path
              d="M3 2l5 3-5 3z"
              style={{ fill: "oklch(from var(--accent-bright) 0.27 0.02 h)" }}
            />
          </svg>
        </span>
      </span>
    );
  }
  const tint = KIND_TINT[item.kind];
  return (
    <span
      className="flex size-full items-center justify-center"
      style={{ background: `color-mix(in oklab, ${tint} 12%, var(--card))` }}
    >
      <span style={{ color: tint }} className="flex size-[46%] max-h-9 max-w-9">
        <KindIcon kind={item.kind} className="size-full" />
      </span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* One item, in either layout                                           */
/* ------------------------------------------------------------------ */

type TileProps = {
  item: FileItem;
  view: FileBrowserView;
  meta: string;
  modified: string;
  name: string;
  selected: boolean;
  tabbable: boolean;
  cut: boolean;
  carried: boolean;
  target: boolean;
  charge: MotionValue<number>;
  landing: number;
  bump: number;
  layoutId?: string;
  motionSafe: boolean;
  spring: Transition;
  disabled: boolean;
  bind: (node: HTMLDivElement | null) => void;
  onPress: (id: string, e: React.MouseEvent) => void;
  onOpen: (id: string) => void;
  onFocusItem: (id: string) => void;
  /** The press became a drag: the browser carries the selection from here, from the window. */
  onLift: (
    id: string,
    point: { x: number; y: number },
    pointerId: number,
  ) => void;
  lockTouch: (on: boolean) => void;
};

function Tile({
  item,
  view,
  meta,
  modified,
  name,
  selected,
  tabbable,
  cut,
  carried,
  target,
  charge,
  landing,
  bump,
  layoutId,
  motionSafe,
  spring,
  disabled,
  bind,
  onPress,
  onOpen,
  onFocusItem,
  onLift,
  lockTouch,
}: TileProps) {
  const grid = view === "grid";
  // Columns that belong to one layout fade in when the layout changes to
  // it, never on the first render (the server's markup is final).
  const [seenView, setSeenView] = React.useState(view);
  const [morphed, setMorphed] = React.useState(false);
  if (view !== seenView) {
    setSeenView(view);
    setMorphed(true);
  }
  const suppress = React.useRef(false);
  const hold = React.useRef<{
    armed: boolean;
    touch: boolean;
    timer: number;
    x: number;
    y: number;
    lifted: boolean;
  } | null>(null);
  const pop = useMotionValue(1);
  const shown = React.useRef(bump);

  // A drop into this folder bumps it on recoil: a landing, felt.
  React.useEffect(() => {
    if (shown.current === bump) return;
    shown.current = bump;
    if (!motionSafe) return;
    pop.set(1.1);
    const c = animate(pop, 1, springs.recoil);
    return () => c.stop();
  }, [bump, motionSafe, pop]);

  // A tile that lands (an upload, a drop) grows in from 0.7 on the spring.
  // Driven through the same value as the bump, not `initial`, so a StrictMode
  // re-run finishes the landing rather than freezing it.
  React.useEffect(() => {
    if (!landing || !motionSafe) return;
    pop.set(0.7);
    const c = animate(pop, 1, {
      ...spring,
      delay: Math.min(0.3, (landing - 1) * 0.04),
    });
    return () => c.stop();
    // The landing belongs to the tile's arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(
    () => () => {
      const h = hold.current;
      if (h) window.clearTimeout(h.timer);
    },
    [],
  );

  const drag = useDrag({
    threshold: 6,
    disabled,
    onStart: ({ point, event }) => {
      const h = hold.current;
      if (!h || !h.armed) {
        if (h) h.lifted = false;
        return;
      }
      h.lifted = true;
      suppress.current = true;
      onLift(item.id, point, event.pointerId);
    },
    onEnd: () => {
      const h = hold.current;
      if (h) h.lifted = false;
    },
    onCancel: () => {
      // The browser can take the capture back when the folder under the
      // finger springs open; the drag carries on from the window.
      lockTouch(false);
    },
  });

  return (
    <motion.div
      ref={bind}
      role="option"
      data-fb-item={item.id}
      data-fb-drop={item.kind === "folder" ? item.id : undefined}
      aria-selected={selected}
      aria-label={name}
      tabIndex={tabbable ? 0 : -1}
      layout={motionSafe}
      layoutId={layoutId}
      initial={landing ? { opacity: 0 } : false}
      animate={{ opacity: carried || cut ? 0.4 : 1 }}
      transition={{
        layout: motionSafe ? spring : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      onPointerDown={(e) => {
        suppress.current = false;
        if (disabled) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const old = hold.current;
        if (old) window.clearTimeout(old.timer);
        const touch = e.pointerType === "touch";
        const h = {
          armed: !touch,
          touch,
          timer: 0,
          x: e.clientX,
          y: e.clientY,
          lifted: false,
        };
        if (touch) {
          h.timer = window.setTimeout(() => {
            if (hold.current !== h) return;
            h.armed = true;
            lockTouch(true);
          }, HOLD_MS);
        }
        hold.current = h;
        drag.onPointerDown(e);
      }}
      onPointerMove={(e) => {
        const h = hold.current;
        if (h && h.touch && !h.armed) {
          if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > 8) {
            window.clearTimeout(h.timer);
          }
        }
        drag.onPointerMove(e);
      }}
      onPointerUp={(e) => {
        const h = hold.current;
        if (h) window.clearTimeout(h.timer);
        drag.onPointerUp(e);
      }}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onClick={(e) => {
        if (suppress.current) {
          suppress.current = false;
          return;
        }
        onPress(item.id, e);
      }}
      onDoubleClick={() => onOpen(item.id)}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusItem(item.id);
      }}
      className={cn(
        "group/file-browser-item relative cursor-default touch-pan-y select-none",
        grid
          ? "flex flex-col items-stretch gap-1.5 rounded-3 p-1.5"
          : "flex h-10 items-center gap-2.5 rounded-2 px-2",
        selected
          ? "bg-cobalt-wash"
          : target
            ? "bg-surface-2"
            : "hover:bg-surface-1",
        RING_IN,
      )}
      style={{ scale: pop }}
    >
      {target ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-cobalt-bright"
        />
      ) : null}
      <motion.span
        layout={motionSafe ? true : false}
        transition={{ layout: motionSafe ? spring : { duration: 0 } }}
        className={cn(
          "relative block shrink-0 overflow-clip border border-hairline",
          grid ? "aspect-[4/3] w-full rounded-2" : "h-7 w-9 rounded-1",
          item.kind === "folder"
            ? "border-transparent bg-transparent"
            : "bg-card",
        )}
      >
        <Thumb item={item} open={target ? charge : undefined} />
      </motion.span>
      <motion.span
        layout={motionSafe ? "position" : false}
        transition={{ layout: motionSafe ? spring : { duration: 0 } }}
        className={cn(
          "min-w-0",
          grid ? "block px-0.5 text-center" : "flex flex-1 items-center gap-3",
        )}
      >
        <span
          title={item.name}
          className={cn(
            "text-foreground",
            grid
              ? "line-clamp-2 text-xs leading-4 font-medium break-words"
              : "min-w-0 flex-1 truncate text-[13px]",
          )}
        >
          {item.name}
        </span>
        {grid ? (
          <motion.span
            initial={morphed ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{
              duration: durations.base,
              delay: motionSafe ? 0.1 : 0,
            }}
            className="mt-0.5 block truncate text-[11px] leading-4 text-ink-3 tabular-nums"
          >
            {meta}
          </motion.span>
        ) : (
          // The list's own columns arrive as the rows settle, not ahead of
          // the thumbnails still on their way.
          <>
            <motion.span
              initial={morphed ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{
                duration: durations.base,
                delay: motionSafe ? 0.1 : 0,
              }}
              className="hidden w-20 shrink-0 truncate text-xs text-ink-3 @min-[40rem]:block"
            >
              {KIND_LABEL[item.kind]}
            </motion.span>
            <motion.span
              initial={morphed ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{
                duration: durations.base,
                delay: motionSafe ? 0.1 : 0,
              }}
              className="w-16 shrink-0 truncate text-right font-mono text-[11px] text-ink-3 tabular-nums"
            >
              {meta}
            </motion.span>
            <motion.span
              initial={morphed ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={{
                duration: durations.base,
                delay: motionSafe ? 0.1 : 0,
              }}
              className="hidden w-28 shrink-0 truncate text-xs text-ink-3 @min-[48rem]:block"
            >
              {modified}
            </motion.span>
          </>
        )}
      </motion.span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* A local stand-in for an upload service                               */
/* ------------------------------------------------------------------ */

/**
 * Pretends to store a file: progress in seeded steps, slower for bigger
 * files, held while the page is hidden. For demos — pass `upload` to store
 * files for real.
 */
const simulateUpload: FileUploader = (file, progress, signal) =>
  new Promise((resolve, reject) => {
    const seed = hash(`${file.name}:${file.size}`);
    const total = 900 + (seed % 700) + Math.min(2000, (file.size / MB) * 160);
    let done = 0;
    let timer = 0;
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("The upload was cancelled.", "AbortError"));
    };
    const step = () => {
      if (signal.aborted) return;
      if (!document.hidden) {
        done +=
          90 * (0.55 + ((seed >>> (Math.floor(done / 90) % 24)) % 9) / 10);
        progress(Math.min(1, r2(done / total)));
      }
      if (done >= total) {
        signal.removeEventListener("abort", abort);
        resolve();
        return;
      }
      timer = window.setTimeout(step, 90);
    };
    signal.addEventListener("abort", abort);
    timer = window.setTimeout(step, 140);
  });

/* ------------------------------------------------------------------ */
/* The browser                                                          */
/* ------------------------------------------------------------------ */

type Upload = {
  id: string;
  name: string;
  size: number;
  kind: FileKind;
  folder: string;
  progress: number;
  status: "uploading" | "error";
  error?: string;
  file?: File;
};

type Carry = {
  ids: string[];
  from: string;
  pointerId: number;
  target: string | null;
  timer: number;
  detach: (() => void) | null;
};

type Last =
  | { kind: "move"; prev: Record<string, string>; to: string }
  | { kind: "delete"; items: FileItem[] };

type Press = {
  x: number;
  y: number;
  armed: boolean;
  touch: boolean;
  timer: number;
  ignored: boolean;
  additive: boolean;
};

type Api = {
  carryMove: (p: { x: number; y: number }) => void;
  carryEnd: (p: { x: number; y: number }, cancelled: boolean) => void;
  springOpen: (id: string) => void;
  land: (
    id: string,
    file: File,
    folder: string,
    extra: Partial<FileItem>,
  ) => void;
  fail: (id: string) => void;
  startUploads: (files: File[] | FileList) => void;
};

const byName = (a: FileItem, b: FileItem) => {
  if ((a.kind === "folder") !== (b.kind === "folder")) {
    return a.kind === "folder" ? -1 : 1;
  }
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * A file manager you work with your hands. Grid and list are the same items
 * laid out twice: the toggle morphs every tile into its row (and back) on
 * the `spring` you choose. Press empty space and drag to lasso — items join
 * the selection as the rectangle touches them, or only once they are inside
 * it. Drag a selection and it lifts into a stack under the pointer; hold it
 * over a folder and the folder's lid opens as the hover charges, until it
 * springs open and you are inside, still carrying the stack. Drop on a
 * folder and the stack shrinks into it while it bumps on recoil; drop on
 * the empty space of a folder you sprang into and the files land on their
 * places in the grid. Uploads (the picker, a drop from the desktop, or the
 * handle) run as rows with progress, and each one turns into its tile when
 * it lands.
 *
 * The items are a multi-select listbox: arrows move (in two dimensions in
 * the grid), Shift extends, Space toggles, Enter opens, Backspace goes up,
 * Ctrl or Cmd with X and V cut and paste, Delete removes, and every move or
 * delete can be undone. Under reduced motion the view swaps at once,
 * navigation cross-fades and every flight is a short fade; the lasso, the
 * stack and the progress still follow.
 */
export function FileBrowser({
  view,
  defaultView = "grid",
  onViewChange,
  lasso = "touch",
  spring = "glide",
  files,
  defaultFiles: initialFiles,
  onFilesChange,
  folder,
  defaultFolder,
  onFolderChange,
  selected,
  defaultSelected,
  onSelectedChange,
  rootId = "root",
  rootLabel = "Files",
  openDelay = 700,
  upload,
  accept,
  maxSize = 25 * MB,
  quota = 15 * 1024 * MB,
  now = defaultFilesNow,
  zoneOffset = 0,
  onOpen,
  onMove,
  onDelete,
  onUploadComplete,
  label = "Files",
  status = "ready",
  onRetry,
  ref,
  sound = false,
  disabled = false,
  className,
}: FileBrowserProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const listId = `${uid}-list`;
  const hintId = `${uid}-hint`;
  const nowMs = toMs(now);
  const ride = SPRINGS[spring] ?? springs.glide;

  /* -------------------------------- values ----------------------------- */

  const [ownFiles, setOwnFiles] = React.useState<FileItem[]>(
    () => initialFiles ?? defaultFiles,
  );
  const all = files ?? ownFiles;
  const [ownFolder, setOwnFolder] = React.useState(defaultFolder ?? rootId);
  const byId = new Map(all.map((x) => [x.id, x]));
  const isFolder = (id: string) =>
    id === rootId || byId.get(id)?.kind === "folder";
  const wanted = folder ?? ownFolder;
  const current = isFolder(wanted) ? wanted : rootId;
  const [ownSel, setOwnSel] = React.useState<string[]>(
    () => defaultSelected ?? [],
  );
  const picked = selected ?? ownSel;
  const [ownView, setOwnView] = React.useState<FileBrowserView>(
    view ?? defaultView,
  );
  const [seenView, setSeenView] = React.useState(view);
  if (view !== seenView) {
    setSeenView(view);
    if (view) setOwnView(view);
  }
  const layout = ownView;

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [anchorId, setAnchorId] = React.useState<string | null>(null);
  const [cut, setCut] = React.useState<string[]>([]);
  const [carry, setCarry] = React.useState<{
    ids: string[];
    from: string;
  } | null>(null);
  const [target, setTarget] = React.useState<string | null>(null);
  const [landing, setLanding] = React.useState<Record<string, number>>({});
  const [bumps, setBumps] = React.useState<Record<string, number>>({});
  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [fromUpload, setFromUpload] = React.useState<Record<string, string>>(
    {},
  );
  const [osDrag, setOsDrag] = React.useState(false);
  const [lassoOn, setLassoOn] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const [dir, setDir] = React.useState(1);
  const [toast, setToast] = React.useState<{
    key: number;
    text: string;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [expanded, setExpanded] = React.useState<string[]>(() => {
    const start = initialFiles ?? defaultFiles;
    const open = [rootId];
    let at = files ? (folder ?? defaultFolder) : (defaultFolder ?? folder);
    for (let guard = 0; at && at !== rootId && guard < 32; guard += 1) {
      open.push(at);
      at = (files ?? start).find((x) => x.id === at)?.parentId;
    }
    return open;
  });
  const [treeFocus, setTreeFocus] = React.useState<string | null>(null);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);

  const items = React.useRef(new Map<string, HTMLDivElement>());
  const treeNodes = React.useRef(new Map<string, HTMLDivElement>());
  const menuItems = React.useRef(new Map<string, HTMLButtonElement>());
  const menuButton = React.useRef<HTMLButtonElement | null>(null);
  const menuBox = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const carryRef = React.useRef<Carry | null>(null);
  const press = React.useRef<Press | null>(null);
  const lassoState = React.useRef<{
    x0: number;
    y0: number;
    base: string[];
    rects: { id: string; l: number; t: number; r: number; b: number }[];
    last: string;
  } | null>(null);
  const controllers = React.useRef(new Map<string, AbortController>());
  const filesOf = React.useRef(new Map<string, File>());
  const focusNext = React.useRef<string | null>(null);
  const lastAction = React.useRef<Last | null>(null);
  const seq = React.useRef(0);
  const toastSeq = React.useRef(0);
  const dragDepth = React.useRef(0);
  const touchLock = React.useRef(false);
  const auto = React.useRef<{
    raf: number;
    point: { x: number; y: number };
    update: (p: { x: number; y: number }) => void;
  } | null>(null);
  const api = React.useRef<Api | null>(null);
  const allRef = React.useRef(all);

  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gScale = useMotionValue(1);
  const gOpacity = useMotionValue(1);
  const charge = useMotionValue(0);
  const still = useMotionValue(0);
  const lx = useMotionValue(0);
  const ly = useMotionValue(0);
  const lw = useMotionValue(0);
  const lh = useMotionValue(0);
  const chargeAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const flight = React.useRef<AnimationPlaybackControls[]>([]);

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------- derived ----------------------------- */

  const childrenOf = (pid: string) =>
    all.filter((x) => x.parentId === pid && x.id !== pid);
  const descendants = (id: string): string[] => {
    const out: string[] = [];
    const walk = (pid: string) => {
      for (const c of childrenOf(pid)) {
        out.push(c.id);
        if (c.kind === "folder") walk(c.id);
      }
    };
    walk(id);
    return out;
  };
  const nameOf = (id: string) =>
    id === rootId ? rootLabel : (byId.get(id)?.name ?? rootLabel);
  const pathTo = (id: string) => {
    const out: string[] = [];
    let at: string | undefined = id;
    for (let guard = 0; at && guard < 32; guard += 1) {
      out.unshift(at);
      if (at === rootId) break;
      at = byId.get(at)?.parentId;
    }
    if (out[0] !== rootId) out.unshift(rootId);
    return out;
  };
  const visible = childrenOf(current).sort(byName);
  const visibleIds = visible.map((x) => x.id);
  const chosen = visible.filter((x) => picked.includes(x.id));
  const tabbableId =
    focusId && visibleIds.includes(focusId) ? focusId : (visibleIds[0] ?? null);
  const path = pathTo(current);
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const used = all.reduce((sum, x) => sum + (x.size ?? 0), 0);
  const sizeOfAll = (ids: string[]) =>
    ids.reduce(
      (sum, id) =>
        sum +
        (byId.get(id)?.size ?? 0) +
        descendants(id).reduce((s, d) => s + (byId.get(d)?.size ?? 0), 0),
      0,
    );
  const metaOf = (x: FileItem) =>
    x.kind === "folder"
      ? plural(childrenOf(x.id).length, "item")
      : formatBytes(x.size ?? 0);
  const nameFor = (x: FileItem) =>
    x.kind === "folder"
      ? `${x.name}, folder, ${plural(childrenOf(x.id).length, "item")}`
      : `${x.name}, ${KIND_LABEL[x.kind].toLowerCase()}, ${formatBytes(x.size ?? 0)}, modified ${modifiedOf(x.modified, nowMs, zoneOffset)}`;
  const validTarget = (to: string, ids: string[], from: string) =>
    isFolder(to) &&
    to !== from &&
    !ids.includes(to) &&
    !ids.some((id) => isFolder(id) && descendants(id).includes(to));

  /* -------------------------------- commits ---------------------------- */

  const commitFiles = (next: FileItem[]) => {
    // Uploads land on their own schedule, two in one frame at times: each
    // builds on the list the last one left, not the last render's.
    allRef.current = next;
    if (files === undefined) setOwnFiles(next);
    onFilesChange?.(next);
  };
  const commitSelected = (next: string[]) => {
    if (selected === undefined) setOwnSel(next);
    onSelectedChange?.(next);
  };
  const commitFolder = (next: string) => {
    if (folder === undefined) setOwnFolder(next);
    onFolderChange?.(next);
  };

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((x) => b.includes(x));

  /* ------------------------------ navigation --------------------------- */

  const navigate = (to: string, quiet = false) => {
    if (to === current || !isFolder(to)) return;
    const deeper = pathTo(to).includes(current);
    setDir(deeper ? 1 : -1);
    commitFolder(to);
    if (picked.length) commitSelected([]);
    setAnchorId(null);
    setLanding({});
    setMenu(false);
    // Going up, focus lands on the folder you came out of.
    const back = pathTo(current).find(
      (id) =>
        pathTo(to).length < pathTo(current).length &&
        byId.get(id)?.parentId === to,
    );
    const nextFocus = deeper
      ? (childrenOf(to).sort(byName)[0]?.id ?? null)
      : (back ?? null);
    setFocusId(nextFocus);
    const active = document.activeElement;
    if (rootNode && active && rootNode.contains(active) && !carryRef.current) {
      focusNext.current = nextFocus ?? "@list";
    }
    setExpanded((e) => [...new Set([...e, ...pathTo(to)])]);
    if (!quiet) audio.play("swish", { pitch: deeper ? 1.1 : 0.85, gain: 0.4 });
    say(`${nameOf(to)}, ${plural(childrenOf(to).length, "item")}.`);
  };

  const openItem = (id: string) => {
    const x = byId.get(id);
    if (!x || disabled) return;
    if (x.kind === "folder") {
      navigate(id);
      return;
    }
    onOpen?.(x);
    say(`Opened ${x.name}.`);
  };

  /* ------------------------------ selection ---------------------------- */

  const pressItem = (
    id: string,
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean },
  ) => {
    if (disabled) return;
    setFocusId(id);
    let next: string[];
    if (e.shiftKey && anchorId && visibleIds.includes(anchorId)) {
      const a = visibleIds.indexOf(anchorId);
      const b = visibleIds.indexOf(id);
      next = visibleIds.slice(Math.min(a, b), Math.max(a, b) + 1);
    } else if (e.metaKey || e.ctrlKey) {
      next = picked.includes(id)
        ? picked.filter((x) => x !== id)
        : [...picked, id];
      setAnchorId(id);
    } else {
      next = [id];
      setAnchorId(id);
    }
    if (!sameSet(next, picked)) {
      commitSelected(next);
      audio.play("pop", {
        pitch: r2(1 + Math.min(0.4, next.length * 0.04)),
        gain: 0.3,
      });
      say(
        next.length === 1
          ? `${byId.get(next[0] ?? "")?.name ?? ""} selected.`
          : `${next.length} selected.`,
      );
    }
  };

  /* ------------------------------ move & delete ------------------------ */

  const showToast = (text: string) => {
    toastSeq.current += 1;
    setToast({ key: toastSeq.current, text });
  };

  const applyMove = (ids: string[], to: string, from: string) => {
    const valid = ids.filter(
      (id) =>
        byId.get(id)?.parentId !== to &&
        validTarget(to, [id], byId.get(id)?.parentId ?? from),
    );
    if (!valid.length) {
      say(`Those items cannot go into ${nameOf(to)}.`);
      return false;
    }
    const prev: Record<string, string> = {};
    commitFiles(
      all.map((x) => {
        if (!valid.includes(x.id)) return x;
        prev[x.id] = x.parentId;
        return { ...x, parentId: to };
      }),
    );
    if (to !== current) {
      const left = picked.filter((id) => !valid.includes(id));
      if (left.length !== picked.length) commitSelected(left);
    }
    setCut((c) => c.filter((id) => !valid.includes(id)));
    lastAction.current = { kind: "move", prev, to };
    const what =
      valid.length === 1
        ? `“${byId.get(valid[0] ?? "")?.name ?? ""}”`
        : plural(valid.length, "item");
    showToast(`Moved ${what} to ${nameOf(to)}`);
    say(`Moved ${what} to ${nameOf(to)}.`);
    onMove?.(valid, to);
    return true;
  };

  const remove = (ids: string[]) => {
    if (!ids.length || disabled) return;
    const gone = new Set<string>();
    for (const id of ids) {
      gone.add(id);
      for (const d of descendants(id)) gone.add(d);
    }
    const removed = all.filter((x) => gone.has(x.id));
    const rest = visibleIds.filter((id) => !gone.has(id));
    const lastIdx = Math.max(...ids.map((id) => visibleIds.indexOf(id)));
    const next =
      visibleIds.slice(lastIdx + 1).find((id) => rest.includes(id)) ??
      [...visibleIds.slice(0, Math.max(0, lastIdx))]
        .reverse()
        .find((id) => rest.includes(id)) ??
      null;
    const active = document.activeElement;
    if (rootNode && active && rootNode.contains(active)) {
      setFocusId(next);
      if (next) items.current.get(next)?.focus();
      else focusNext.current = "@list";
    }
    commitFiles(all.filter((x) => !gone.has(x.id)));
    commitSelected(picked.filter((id) => !gone.has(id)));
    lastAction.current = { kind: "delete", items: removed };
    const what =
      ids.length === 1
        ? `“${byId.get(ids[0] ?? "")?.name ?? ""}”`
        : plural(ids.length, "item");
    showToast(`Deleted ${what}`);
    say(`Deleted ${what}.`);
    onDelete?.([...gone]);
  };

  const undo = () => {
    const last = lastAction.current;
    if (!last || disabled) return;
    lastAction.current = null;
    if (last.kind === "move") {
      commitFiles(
        all.map((x) =>
          last.prev[x.id]
            ? { ...x, parentId: last.prev[x.id] ?? x.parentId }
            : x,
        ),
      );
      onMove?.(Object.keys(last.prev), Object.values(last.prev)[0] ?? rootId);
    } else {
      const have = new Set(all.map((x) => x.id));
      commitFiles([...all, ...last.items.filter((x) => !have.has(x.id))]);
    }
    setToast(null);
    audio.play("swish", { pitch: 0.72, gain: 0.36 });
    say("Undone.");
  };

  const paste = () => {
    if (!cut.length) return;
    if (applyMove(cut, current, rootId)) {
      setCut([]);
      const order: Record<string, number> = {};
      cut.forEach((id, i) => {
        order[id] = i + 1;
      });
      setLanding(order);
      audio.play("pop", { pitch: 1.1, gain: 0.5 });
    }
  };

  /* ---------------------------- carrying files ------------------------- */

  const stopFlight = () => {
    for (const c of flight.current) c.stop();
    flight.current = [];
  };

  const setCarryTarget = (to: string | null) => {
    const c = carryRef.current;
    if (!c || c.target === to) return;
    c.target = to;
    setTarget(to);
    window.clearTimeout(c.timer);
    chargeAnim.current?.stop();
    charge.set(0);
    if (to && to !== current) {
      chargeAnim.current = animate(charge, 1, {
        duration: Math.max(0.1, openDelay / 1000),
        ease: "linear",
      });
      c.timer = window.setTimeout(
        () => api.current?.springOpen(to),
        Math.max(100, openDelay),
      );
    }
  };

  const hitTest = (p: { x: number; y: number }) => {
    const c = carryRef.current;
    if (!c || !rootNode) return null;
    for (const el of document.elementsFromPoint(p.x, p.y)) {
      if (!rootNode.contains(el)) continue;
      const drop = el.closest("[data-fb-drop]");
      if (!drop || !rootNode.contains(drop)) continue;
      const id = drop.getAttribute("data-fb-drop");
      if (!id) continue;
      return validTarget(id, c.ids, c.from) ? id : null;
    }
    return null;
  };

  const lift = (
    id: string,
    point: { x: number; y: number },
    pointerId: number,
  ) => {
    if (disabled || !rootNode) return;
    const ids = picked.includes(id) ? chosen.map((x) => x.id) : [id];
    if (!picked.includes(id)) {
      commitSelected([id]);
      setAnchorId(id);
    }
    const r = rootNode.getBoundingClientRect();
    stopFlight();
    gx.set(r2(point.x - r.left - 24));
    gy.set(r2(point.y - r.top - 20));
    gScale.set(1);
    gOpacity.set(1);
    const move = (e: PointerEvent) => {
      if (e.pointerId === pointerId)
        api.current?.carryMove({ x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === pointerId)
        api.current?.carryEnd({ x: e.clientX, y: e.clientY }, false);
    };
    const cancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId)
        api.current?.carryEnd({ x: e.clientX, y: e.clientY }, true);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      api.current?.carryEnd({ x: 0, y: 0 }, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    carryRef.current = {
      ids,
      from: current,
      pointerId,
      target: null,
      timer: 0,
      detach: () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key, true);
      },
    };
    touchLock.current = true;
    setCarry({ ids, from: current });
    audio.play("pop", { pitch: 0.9, gain: 0.34, pan: panFrom(point.x, null) });
    say(
      `Carrying ${plural(ids.length, "item")}. Hold over a folder to open it, release to drop.`,
    );
  };

  const carryMove = (p: { x: number; y: number }) => {
    const c = carryRef.current;
    if (!c || !rootNode) return;
    const r = rootNode.getBoundingClientRect();
    gx.set(r2(clamp(p.x - r.left - 24, -8, r.width - 40)));
    gy.set(r2(clamp(p.y - r.top - 20, -8, r.height - 24)));
    setCarryTarget(hitTest(p));
    autoScroll(p, (q) => setCarryTarget(hitTest(q)));
  };

  const finishCarry = () => {
    const c = carryRef.current;
    if (c) {
      window.clearTimeout(c.timer);
      c.detach?.();
    }
    carryRef.current = null;
    chargeAnim.current?.stop();
    charge.set(0);
    setTarget(null);
    stopAuto();
    touchLock.current = false;
  };

  const flyTo = (x: number, y: number, scale: number, then: () => void) => {
    stopFlight();
    const t: Transition = motionSafe ? ride : { duration: 0 };
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      then();
    };
    flight.current = [
      animate(gx, r2(x), t),
      animate(gy, r2(y), t),
      animate(gScale, scale, t),
      animate(gOpacity, 0, {
        duration: motionSafe ? durations.slow : durations.fast,
        ease: easings.exit,
        onComplete: end,
      }),
    ];
    window.setTimeout(end, 900);
  };

  const carryEnd = (p: { x: number; y: number }, cancelled: boolean) => {
    const c = carryRef.current;
    if (!c || !rootNode) return;
    const to = cancelled ? null : hitTest(p);
    const r = rootNode.getBoundingClientRect();
    finishCarry();
    if (to) {
      const el = rootNode.querySelector(`[data-fb-drop="${CSS.escape(to)}"]`);
      const er = el?.getBoundingClientRect();
      const intoCurrent = to === current;
      if (applyMove(c.ids, to, c.from)) {
        audio.play("pop", { pitch: 1.15, gain: 0.55, pan: panFrom(p.x, null) });
        if (intoCurrent) {
          const order: Record<string, number> = {};
          c.ids.forEach((id, i) => {
            order[id] = i + 1;
          });
          setLanding(order);
          // The stack heads for where the files appear (measured below).
          return;
        }
        setBumps((b) => ({ ...b, [to]: (b[to] ?? 0) + 1 }));
        if (er) {
          flyTo(
            er.left - r.left + er.width / 2 - 24,
            er.top - r.top + er.height / 2 - 20,
            0.3,
            () => setCarry(null),
          );
          return;
        }
      }
      setCarry(null);
      return;
    }
    // Nowhere to go: the stack glides home, or fades if home is out of view.
    const home = c.ids.map((id) => items.current.get(id)).find(Boolean);
    const hr = home?.getBoundingClientRect();
    if (hr && c.from === current) {
      flyTo(hr.left - r.left, hr.top - r.top, 0.8, () => setCarry(null));
    } else {
      flyTo(gx.get(), gy.get(), 0.9, () => setCarry(null));
    }
    if (cancelled) say("Drag cancelled.");
  };

  const springOpen = (id: string) => {
    const c = carryRef.current;
    if (!c) return;
    c.target = null;
    setTarget(null);
    chargeAnim.current?.stop();
    charge.set(0);
    audio.play("swish", { pitch: 1.2, gain: 0.42 });
    navigate(id, true);
  };

  /* --------------------------------- lasso ----------------------------- */

  const lassoTo = (p: { x: number; y: number }) => {
    const l = lassoState.current;
    const wrap = contentRef.current;
    if (!l || !wrap) return;
    const w = wrap.getBoundingClientRect();
    const x1 = clamp(p.x - w.left, 0, w.width);
    const y1 = clamp(p.y - w.top, 0, w.height);
    const left = Math.min(l.x0, x1);
    const top = Math.min(l.y0, y1);
    const right = Math.max(l.x0, x1);
    const bottom = Math.max(l.y0, y1);
    lx.set(r2(left));
    ly.set(r2(top));
    lw.set(r2(right - left));
    lh.set(r2(bottom - top));
    const hits = l.rects
      .filter((it) =>
        lasso === "contain"
          ? it.l >= left && it.r <= right && it.t >= top && it.b <= bottom
          : it.l < right && it.r > left && it.t < bottom && it.b > top,
      )
      .map((it) => it.id);
    const next = [...new Set([...l.base, ...hits])];
    const key = next.slice().sort().join("|");
    if (key === l.last) return;
    const grew = next.length > l.last.split("|").filter(Boolean).length;
    l.last = key;
    commitSelected(next);
    if (grew) {
      audio.play("pop", {
        pitch: r2(1 + Math.min(0.6, next.length * 0.05)),
        gain: 0.2,
      });
    }
  };

  const area = useDrag({
    threshold: 4,
    disabled: disabled || status !== "ready",
    onStart: () => {
      const pr = press.current;
      const wrap = contentRef.current;
      // With the lasso off, empty space still takes a press (it clears).
      if (!pr || !pr.armed || pr.ignored || !wrap || lasso === "off") {
        if (pr) pr.ignored = true;
        return;
      }
      const w = wrap.getBoundingClientRect();
      const rects = visibleIds.flatMap((id) => {
        const r = items.current.get(id)?.getBoundingClientRect();
        return r
          ? [
              {
                id,
                l: r.left - w.left,
                t: r.top - w.top,
                r: r.right - w.left,
                b: r.bottom - w.top,
              },
            ]
          : [];
      });
      lassoState.current = {
        x0: clamp(pr.x - w.left, 0, w.width),
        y0: clamp(pr.y - w.top, 0, w.height),
        base: pr.additive ? picked : [],
        rects,
        last: (pr.additive ? picked : []).slice().sort().join("|"),
      };
      touchLock.current = true;
      lx.set(r2(clamp(pr.x - w.left, 0, w.width)));
      ly.set(r2(clamp(pr.y - w.top, 0, w.height)));
      lw.set(0);
      lh.set(0);
      setLassoOn(true);
      if (!pr.additive && picked.length) commitSelected([]);
    },
    onMove: ({ point }) => {
      if (!lassoState.current) return;
      lassoTo(point);
      autoScroll(point, lassoTo);
    },
    onEnd: () => {
      const l = lassoState.current;
      lassoState.current = null;
      setLassoOn(false);
      stopAuto();
      touchLock.current = false;
      if (l) {
        const n = l.last ? l.last.split("|").length : 0;
        say(n ? `${plural(n, "item")} selected.` : "Nothing selected.");
      }
    },
    onCancel: () => {
      lassoState.current = null;
      setLassoOn(false);
      stopAuto();
      touchLock.current = false;
    },
    onTap: (e) => {
      if (e.shiftKey || e.metaKey || e.ctrlKey) return;
      if (picked.length) {
        commitSelected([]);
        say("Nothing selected.");
      }
    },
  });

  /* ------------------------------ auto-scroll -------------------------- */

  const stopAuto = () => {
    const a = auto.current;
    if (a?.raf) cancelAnimationFrame(a.raf);
    auto.current = null;
  };
  const autoScroll = (
    point: { x: number; y: number },
    apply: (p: { x: number; y: number }) => void,
  ) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const a = auto.current ?? { raf: 0, point, update: apply };
    a.point = point;
    a.update = apply;
    auto.current = a;
    const speedAt = (p: { x: number; y: number }) => {
      const r = sc.getBoundingClientRect();
      if (p.x < r.left || p.x > r.right) return 0;
      if (p.y < r.top + 24 && p.y > r.top - 40)
        return -Math.min(12, (r.top + 24 - p.y) * 0.4);
      if (p.y > r.bottom - 24 && p.y < r.bottom + 40)
        return Math.min(12, (p.y - (r.bottom - 24)) * 0.4);
      return 0;
    };
    if (!speedAt(point) || a.raf) return;
    const tick = () => {
      const cur = auto.current;
      if (!cur) return;
      const v = speedAt(cur.point);
      if (!v) {
        cur.raf = 0;
        return;
      }
      sc.scrollTop += v;
      cur.update(cur.point);
      cur.raf = requestAnimationFrame(tick);
    };
    a.raf = requestAnimationFrame(tick);
  };

  /* -------------------------------- uploads ---------------------------- */

  const runUpload = (id: string, file: File, into: string) => {
    const ctrl = new AbortController();
    controllers.current.set(id, ctrl);
    filesOf.current.set(id, file);
    const store = upload ?? simulateUpload;
    store(
      file,
      (fraction) => {
        if (ctrl.signal.aborted) return;
        setUploads((list) =>
          list.map((u) =>
            u.id === id ? { ...u, progress: clamp(fraction, 0, 1) } : u,
          ),
        );
      },
      ctrl.signal,
    )
      .then((extra) => {
        if (ctrl.signal.aborted) return;
        controllers.current.delete(id);
        api.current?.land(id, file, into, extra ?? {});
      })
      .catch(() => {
        if (ctrl.signal.aborted) return;
        controllers.current.delete(id);
        api.current?.fail(id);
      });
  };

  const startUploads = (list: File[] | FileList) => {
    if (disabled) return;
    const incoming = Array.from(list);
    if (!incoming.length) return;
    const rows: Upload[] = [];
    for (const file of incoming) {
      seq.current += 1;
      const id = `${safeId}-up${seq.current}`;
      const base = {
        id,
        name: file.name,
        size: file.size,
        kind: kindOf(file.name, file.type),
        folder: current,
        progress: 0,
      };
      if (!accepts(accept, file)) {
        rows.push({
          ...base,
          status: "error",
          error: "This folder takes another type",
        });
      } else if (file.size > maxSize) {
        rows.push({
          ...base,
          status: "error",
          error: `Larger than ${formatBytes(maxSize)}`,
        });
      } else {
        rows.push({ ...base, status: "uploading" });
        runUpload(id, file, current);
      }
    }
    setUploads((u) => [...u, ...rows]);
    say(
      `Uploading ${plural(rows.filter((r) => r.status === "uploading").length, "file")} to ${nameOf(current)}.`,
    );
  };

  const land = (
    id: string,
    file: File,
    into: string,
    extra: Partial<FileItem>,
  ) => {
    const made: FileItem = {
      id,
      name: file.name,
      kind: kindOf(file.name, file.type),
      parentId: into,
      size: file.size,
      modified: nowMs,
      ...extra,
    };
    filesOf.current.delete(id);
    commitFiles([...allRef.current.filter((x) => x.id !== made.id), made]);
    setFromUpload((m) => ({ ...m, [made.id]: id }));
    setUploads((list) => list.filter((u) => u.id !== id));
    onUploadComplete?.(made);
    say(`Uploaded ${made.name} to ${nameOf(into)}.`);
  };

  const fail = (id: string) => {
    setUploads((list) =>
      list.map((u) =>
        u.id === id ? { ...u, status: "error", error: "Upload failed" } : u,
      ),
    );
    say("An upload failed.");
  };

  const dropUpload = (id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    filesOf.current.delete(id);
    setUploads((list) => list.filter((u) => u.id !== id));
  };

  const retryUpload = (id: string) => {
    const file = filesOf.current.get(id);
    const row = uploads.find((u) => u.id === id);
    if (!file || !row) return;
    setUploads((list) =>
      list.map((u) =>
        u.id === id
          ? { ...u, status: "uploading", progress: 0, error: undefined }
          : u,
      ),
    );
    runUpload(id, file, row.folder);
  };

  /* ------------------------------- keyboard ---------------------------- */

  const columns = () => {
    if (layout === "list") return 1;
    const first = visibleIds[0] ? items.current.get(visibleIds[0]) : undefined;
    if (!first) return 1;
    const top = first.offsetTop;
    let n = 0;
    for (const id of visibleIds) {
      if (items.current.get(id)?.offsetTop === top) n += 1;
      else break;
    }
    return Math.max(1, n);
  };

  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.defaultPrevented) return;
    const mod = e.metaKey || e.ctrlKey;
    const idx = tabbableId ? visibleIds.indexOf(tabbableId) : -1;
    const go = (to: number) => {
      const i = clamp(to, 0, visibleIds.length - 1);
      const id = visibleIds[i];
      if (!id) return;
      e.preventDefault();
      setFocusId(id);
      items.current.get(id)?.focus();
      if (e.shiftKey) {
        const a =
          anchorId && visibleIds.includes(anchorId)
            ? visibleIds.indexOf(anchorId)
            : idx;
        commitSelected(visibleIds.slice(Math.min(a, i), Math.max(a, i) + 1));
        if (!anchorId) setAnchorId(visibleIds[idx] ?? id);
      } else if (!mod) {
        commitSelected([id]);
        setAnchorId(id);
      }
    };
    const key = e.key;
    if (mod && key.toLowerCase() === "a") {
      e.preventDefault();
      commitSelected(visibleIds);
      say(`All ${plural(visibleIds.length, "item")} selected.`);
      return;
    }
    if (mod && key.toLowerCase() === "x") {
      e.preventDefault();
      const ids = chosen.length
        ? chosen.map((x) => x.id)
        : tabbableId
          ? [tabbableId]
          : [];
      setCut(ids);
      say(`${plural(ids.length, "item")} cut. Open a folder and paste.`);
      return;
    }
    if (mod && key.toLowerCase() === "v") {
      e.preventDefault();
      paste();
      return;
    }
    if (e.altKey && key === "ArrowUp") {
      e.preventDefault();
      if (parent) navigate(parent);
      return;
    }
    switch (key) {
      case "ArrowRight":
        if (layout === "grid") go(idx + 1);
        return;
      case "ArrowLeft":
        if (layout === "grid") go(idx - 1);
        return;
      case "ArrowDown":
        go(idx + columns());
        return;
      case "ArrowUp":
        go(idx - columns());
        return;
      case "Home":
        go(0);
        return;
      case "End":
        go(visibleIds.length - 1);
        return;
      case " ":
        if (!tabbableId) return;
        e.preventDefault();
        pressItem(tabbableId, {
          shiftKey: e.shiftKey,
          metaKey: true,
          ctrlKey: false,
        });
        return;
      case "Enter":
        if (!tabbableId) return;
        e.preventDefault();
        openItem(tabbableId);
        return;
      case "Backspace":
        e.preventDefault();
        if (parent) navigate(parent);
        return;
      case "Delete":
        e.preventDefault();
        remove(
          chosen.length
            ? chosen.map((x) => x.id)
            : tabbableId
              ? [tabbableId]
              : [],
        );
        return;
      case "Escape":
        if (picked.length || cut.length) {
          e.preventDefault();
          if (picked.length) commitSelected([]);
          setCut([]);
          say("Selection cleared.");
        }
        return;
    }
  };

  /* ------------------------------- effects ----------------------------- */

  React.useEffect(() => {
    api.current = { carryMove, carryEnd, springOpen, land, fail, startUploads };
    allRef.current = all;
  });

  React.useImperativeHandle(
    ref,
    () => ({ upload: (list) => api.current?.startUploads(list) }),
    [],
  );

  // A drop into the open folder: the stack heads for the first file's new
  // place as the files grow into the grid.
  React.useLayoutEffect(() => {
    const first = Object.entries(landing).find(([, n]) => n === 1)?.[0];
    if (!first || !carry || !rootNode) return;
    const el = items.current.get(first);
    const r = rootNode.getBoundingClientRect();
    const er = el?.getBoundingClientRect();
    if (!er) {
      setCarry(null);
      return;
    }
    flyTo(er.left - r.left, er.top - r.top, 0.6, () => setCarry(null));
    // Runs once per landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing]);

  // Once a touch holds something (a stack, a lasso), the finger carries it
  // instead of scrolling.
  React.useEffect(() => {
    if (!rootNode) return;
    const onTouchMove = (e: TouchEvent) => {
      if (touchLock.current && e.cancelable) e.preventDefault();
    };
    rootNode.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => rootNode.removeEventListener("touchmove", onTouchMove);
  }, [rootNode]);

  const toastKey = toast?.key;
  React.useEffect(() => {
    if (toastKey === undefined) return;
    let left = 5000;
    let since = 0;
    let timer = 0;
    const start = () => {
      since = performance.now();
      timer = window.setTimeout(
        () => setToast((t) => (t && t.key === toastKey ? null : t)),
        left,
      );
    };
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        left = Math.max(0, left - (performance.now() - since));
      } else {
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [toastKey]);

  // The menu takes focus on its first folder as it opens, and a press
  // anywhere outside it closes it.
  React.useEffect(() => {
    if (!menu) return;
    const first = [...menuItems.current.values()].find((b) => !b.disabled);
    first?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (menuBox.current?.contains(t) || menuButton.current?.contains(t)) {
        return;
      }
      setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  React.useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const c of running.values()) c.abort();
      running.clear();
      const c = carryRef.current;
      if (c) {
        window.clearTimeout(c.timer);
        c.detach?.();
      }
      const a = auto.current;
      if (a?.raf) cancelAnimationFrame(a.raf);
      const pr = press.current;
      if (pr) window.clearTimeout(pr.timer);
    };
  }, []);

  /* --------------------------------- parts ----------------------------- */

  const bindItem = (id: string) => (node: HTMLDivElement | null) => {
    if (!node) {
      items.current.delete(id);
      return;
    }
    items.current.set(id, node);
    if (focusNext.current === id) {
      focusNext.current = null;
      node.focus({ preventScroll: true });
    }
  };

  const onContentPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || status !== "ready") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest("[role=option]"))
      return;
    const old = press.current;
    if (old) window.clearTimeout(old.timer);
    const touch = e.pointerType === "touch";
    const pr: Press = {
      x: e.clientX,
      y: e.clientY,
      armed: !touch,
      touch,
      timer: 0,
      ignored: false,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
    };
    if (touch) {
      pr.timer = window.setTimeout(() => {
        if (press.current !== pr || pr.ignored) return;
        pr.armed = true;
        touchLock.current = true;
      }, HOLD_MS);
    }
    press.current = pr;
    area.onPointerDown(e);
  };

  const folders = all.filter((x) => x.kind === "folder").sort(byName);
  const treeRows: { id: string; level: number; hasKids: boolean }[] = [];
  const walk = (pid: string, level: number) => {
    for (const x of folders.filter((y) => y.parentId === pid)) {
      const hasKids = folders.some((y) => y.parentId === x.id);
      treeRows.push({ id: x.id, level, hasKids });
      if (hasKids && expanded.includes(x.id)) walk(x.id, level + 1);
    }
  };
  treeRows.push({
    id: rootId,
    level: 1,
    hasKids: folders.some((y) => y.parentId === rootId),
  });
  if (expanded.includes(rootId)) walk(rootId, 2);
  const treeTab =
    treeFocus && treeRows.some((t) => t.id === treeFocus) ? treeFocus : current;
  const menuRows: { id: string; level: number }[] = [];
  const walkAll = (pid: string, level: number) => {
    for (const x of folders.filter((y) => y.parentId === pid)) {
      menuRows.push({ id: x.id, level });
      walkAll(x.id, level + 1);
    }
  };
  menuRows.push({ id: rootId, level: 0 });
  walkAll(rootId, 1);
  const moveIds = chosen.map((x) => x.id);

  const onTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const i = treeRows.findIndex((t) => t.id === treeTab);
    const row = treeRows[i];
    if (!row) return;
    const focusRow = (j: number) => {
      const t = treeRows[clamp(j, 0, treeRows.length - 1)];
      if (!t) return;
      e.preventDefault();
      setTreeFocus(t.id);
      treeNodes.current.get(t.id)?.focus();
    };
    switch (e.key) {
      case "ArrowDown":
        focusRow(i + 1);
        return;
      case "ArrowUp":
        focusRow(i - 1);
        return;
      case "Home":
        focusRow(0);
        return;
      case "End":
        focusRow(treeRows.length - 1);
        return;
      case "ArrowRight":
        e.preventDefault();
        if (row.hasKids && !expanded.includes(row.id))
          setExpanded((x) => [...x, row.id]);
        else if (row.hasKids) focusRow(i + 1);
        return;
      case "ArrowLeft": {
        e.preventDefault();
        if (row.hasKids && expanded.includes(row.id)) {
          setExpanded((x) => x.filter((y) => y !== row.id));
          return;
        }
        const up = byId.get(row.id)?.parentId;
        const j = treeRows.findIndex((t) => t.id === up);
        if (j !== -1) focusRow(j);
        return;
      }
      case "Enter":
      case " ":
        e.preventDefault();
        navigate(row.id);
        return;
    }
  };

  const selectionSize = sizeOfAll(chosen.map((x) => x.id));
  const detail =
    chosen.length === 1 ? chosen[0] : chosen.length === 0 ? undefined : null;
  const crumbs =
    path.length > 4 ? [path[0] ?? rootId, "…", ...path.slice(-2)] : path;

  return (
    <div
      ref={setRootNode}
      role="region"
      aria-label={label}
      onDragEnter={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes("Files"))
          return;
        e.preventDefault();
        dragDepth.current += 1;
        setOsDrag(true);
      }}
      onDragOver={(e) => {
        if (disabled || !Array.from(e.dataTransfer.types).includes("Files"))
          return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setOsDrag(false);
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        dragDepth.current = 0;
        setOsDrag(false);
        startUploads(e.dataTransfer.files);
      }}
      className={cn(
        "@container relative h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        inert={disabled}
        className="grid h-full grid-cols-1 grid-rows-[minmax(0,1fr)] @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[68rem]:grid-cols-[11rem_minmax(0,1fr)_18rem]"
      >
        {/* The folder tree and the storage meter. */}
        <div className="hidden grid-rows-[minmax(0,1fr)_auto] border-r border-hairline bg-surface-1 @min-[40rem]:grid">
          <div
            role="tree"
            aria-label="Folders"
            onKeyDown={onTreeKeyDown}
            className="[scrollbar-width:thin] overflow-y-auto overscroll-contain p-2"
          >
            {treeRows.map((t) => {
              const on = t.id === current;
              const open = expanded.includes(t.id);
              const isTarget = target === t.id;
              return (
                <div
                  key={t.id}
                  ref={(node) => {
                    if (node) treeNodes.current.set(t.id, node);
                    else treeNodes.current.delete(t.id);
                  }}
                  role="treeitem"
                  data-fb-drop={t.id}
                  aria-level={t.level}
                  aria-expanded={t.hasKids ? open : undefined}
                  aria-selected={on}
                  tabIndex={t.id === treeTab ? 0 : -1}
                  onFocus={() => setTreeFocus(t.id)}
                  onClick={() => navigate(t.id)}
                  className={cn(
                    "relative flex h-8 cursor-pointer items-center gap-1.5 rounded-2 pr-2 text-[13px] transition-colors",
                    on
                      ? "bg-cobalt-wash font-medium text-foreground"
                      : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    isTarget && "bg-surface-2",
                    RING_IN,
                  )}
                  style={{ paddingLeft: 4 + (t.level - 1) * 12 }}
                >
                  {isTarget ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-cobalt-bright"
                    />
                  ) : null}
                  <span
                    aria-hidden
                    onClick={(e) => {
                      if (!t.hasKids) return;
                      e.stopPropagation();
                      setExpanded((x) =>
                        open ? x.filter((y) => y !== t.id) : [...x, t.id],
                      );
                    }}
                    className="flex size-4 shrink-0 items-center justify-center text-ink-3"
                  >
                    {t.hasKids ? (
                      <ChevronRight
                        className={cn(
                          "size-3.5 transition-transform duration-150",
                          open && "rotate-90",
                        )}
                      />
                    ) : null}
                  </span>
                  <FolderGlyph className="h-3.5 w-auto shrink-0" />
                  <span className="truncate">{nameOf(t.id)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-hairline p-3">
            <div
              role="meter"
              aria-label="Storage used"
              aria-valuemin={0}
              aria-valuemax={quota}
              aria-valuenow={Math.min(quota, used)}
              aria-valuetext={`${formatBytes(used)} of ${formatBytes(quota)}`}
              className="h-1.5 overflow-clip rounded-full bg-surface-2"
            >
              <motion.span
                className="block h-full origin-left rounded-full bg-cobalt-bright"
                initial={false}
                animate={{ scaleX: r2(Math.min(1, used / Math.max(1, quota))) }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            </div>
            <p className="font-mono text-[10px] text-ink-3 tabular-nums">
              {formatBytes(used)} of {formatBytes(quota)}
            </p>
          </div>
        </div>

        {/* The open folder. */}
        <section
          aria-label={nameOf(current)}
          className="relative grid grid-rows-[auto_minmax(0,1fr)_auto]"
        >
          <div className="relative border-b border-hairline">
            <div className="grid [grid-template-areas:'bar'] *:[grid-area:bar]">
              <motion.div
                inert={chosen.length > 0}
                className="flex h-12 items-center gap-1 px-2"
                initial={false}
                animate={{
                  opacity: chosen.length ? 0 : 1,
                  y: chosen.length && motionSafe ? -distances.step : 0,
                }}
                transition={
                  chosen.length
                    ? { duration: durations.fast, ease: easings.exit }
                    : {
                        y: motionSafe ? springs.snap : { duration: 0 },
                        opacity: { duration: durations.fast },
                      }
                }
              >
                <button
                  type="button"
                  aria-label={parent ? `Up to ${nameOf(parent)}` : "At the top"}
                  disabled={!parent}
                  data-fb-drop={parent ?? undefined}
                  onClick={() => parent && navigate(parent)}
                  className={cn(TOOL, "@min-[40rem]:hidden")}
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
                <p className="min-w-0 flex-1 truncate pl-1 text-sm font-semibold text-foreground @min-[40rem]:hidden">
                  {nameOf(current)}
                </p>
                <nav
                  aria-label="Breadcrumb"
                  className="hidden min-w-0 flex-1 @min-[40rem]:block"
                >
                  <ol className="flex min-w-0 items-center gap-0.5">
                    <AnimatePresence initial={false} mode="popLayout">
                      {crumbs.map((id, i) => {
                        const last = i === crumbs.length - 1;
                        return (
                          <motion.li
                            key={`${id}-${i}`}
                            layout={motionSafe ? "position" : false}
                            className="flex min-w-0 items-center gap-0.5"
                            initial={{
                              opacity: 0,
                              x: motionSafe ? distances.step : 0,
                            }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={{
                              x: motionSafe ? springs.snap : { duration: 0 },
                              opacity: { duration: durations.fast },
                              layout: motionSafe
                                ? springs.snap
                                : { duration: 0 },
                            }}
                          >
                            {i > 0 ? (
                              <ChevronRight
                                aria-hidden
                                className="size-3.5 shrink-0 text-ink-3"
                              />
                            ) : null}
                            {id === "…" ? (
                              <span
                                className="px-1 text-[13px] text-ink-3"
                                title={path
                                  .slice(1, -2)
                                  .map(nameOf)
                                  .join(" / ")}
                              >
                                …
                              </span>
                            ) : (
                              <button
                                type="button"
                                data-fb-drop={last ? undefined : id}
                                aria-current={last ? "page" : undefined}
                                onClick={() => navigate(id)}
                                className={cn(
                                  "relative h-8 max-w-40 truncate rounded-2 px-2 text-[13px] transition-colors",
                                  last
                                    ? "font-semibold text-foreground"
                                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                                  target === id &&
                                    "bg-surface-2 ring-2 ring-cobalt-bright",
                                  RING_IN,
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
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={accept}
                  tabIndex={-1}
                  aria-hidden
                  className="sr-only"
                  onChange={(e) => {
                    const list = e.currentTarget.files;
                    if (list) startUploads(list);
                    e.currentTarget.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={status !== "ready"}
                  onClick={() => inputRef.current?.click()}
                  className={TEXT_BUTTON}
                >
                  <Upload aria-hidden className="size-4 shrink-0" />
                  <span className="hidden @min-[30rem]:inline">Upload</span>
                  <span className="sr-only @min-[30rem]:hidden">Upload</span>
                </button>
                <div
                  role="radiogroup"
                  aria-label="Layout"
                  className="flex h-8 items-center rounded-2 bg-surface-2 p-0.5"
                  onKeyDown={(e) => {
                    if (
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(e.key)
                    )
                      return;
                    e.preventDefault();
                    const next: FileBrowserView =
                      layout === "grid" ? "list" : "grid";
                    setOwnView(next);
                    onViewChange?.(next);
                    audio.play("swish", {
                      pitch: next === "grid" ? 1.1 : 0.9,
                      gain: 0.34,
                    });
                    const el = e.currentTarget.querySelector<HTMLButtonElement>(
                      `[data-view="${next}"]`,
                    );
                    el?.focus();
                  }}
                >
                  {(["grid", "list"] as const).map((v) => {
                    const on = layout === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        data-view={v}
                        aria-checked={on}
                        aria-label={v === "grid" ? "Grid" : "List"}
                        tabIndex={on ? 0 : -1}
                        onClick={() => {
                          if (on) return;
                          setOwnView(v);
                          onViewChange?.(v);
                          audio.play("swish", {
                            pitch: v === "grid" ? 1.1 : 0.9,
                            gain: 0.34,
                          });
                          say(v === "grid" ? "Grid view." : "List view.");
                        }}
                        className={cn(
                          "relative flex size-7 items-center justify-center rounded-[6px] transition-colors",
                          on
                            ? "text-foreground"
                            : "text-ink-3 hover:text-foreground",
                          RING_IN,
                        )}
                      >
                        {on ? (
                          <motion.span
                            layoutId={`${uid}-view`}
                            className="absolute inset-0 rounded-[6px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent)]"
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          />
                        ) : null}
                        {v === "grid" ? (
                          <LayoutGrid aria-hidden className="relative size-4" />
                        ) : (
                          <List aria-hidden className="relative size-4" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </motion.div>

              <motion.div
                role="toolbar"
                aria-label="Selection"
                inert={chosen.length === 0}
                className="flex h-12 items-center gap-1 bg-card px-2"
                initial={false}
                animate={{
                  opacity: chosen.length ? 1 : 0,
                  y: chosen.length || !motionSafe ? 0 : -distances.step,
                }}
                transition={
                  chosen.length
                    ? {
                        y: motionSafe ? springs.snap : { duration: 0 },
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast, ease: easings.exit }
                }
              >
                <button
                  type="button"
                  aria-label="Clear selection"
                  onClick={() => {
                    commitSelected([]);
                    const node = tabbableId
                      ? items.current.get(tabbableId)
                      : undefined;
                    node?.focus();
                  }}
                  className={TOOL}
                >
                  <X aria-hidden className="size-4" />
                </button>
                <span className="min-w-0 truncate text-[13px] font-medium text-foreground">
                  {plural(chosen.length, "item")} selected
                  <span className="ml-2 hidden font-normal text-ink-3 @min-[30rem]:inline">
                    {formatBytes(selectionSize)}
                  </span>
                </span>
                <span className="flex-1" />
                <div className="relative">
                  <button
                    ref={menuButton}
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={menu}
                    onClick={() => setMenu((m) => !m)}
                    className={TEXT_BUTTON}
                  >
                    <FolderInput aria-hidden className="size-4 shrink-0" />
                    <span className="hidden @min-[30rem]:inline">Move to…</span>
                    <span className="sr-only @min-[30rem]:hidden">
                      Move to…
                    </span>
                  </button>
                  <AnimatePresence>
                    {menu ? (
                      <motion.div
                        ref={menuBox}
                        role="menu"
                        aria-label="Move to folder"
                        className="absolute top-full right-0 z-40 mt-1 flex max-h-72 w-56 flex-col overflow-y-auto overscroll-contain rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_12px_32px_color-mix(in_oklab,black_20%,transparent)]"
                        initial={{
                          opacity: 0,
                          y: motionSafe ? -distances.nudge : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          y: motionSafe ? springs.snap : { duration: 0 },
                          opacity: { duration: durations.fast },
                        }}
                        onKeyDown={(e) => {
                          const list = menuRows
                            .map((m) => menuItems.current.get(m.id))
                            .filter(
                              (b): b is HTMLButtonElement => !!b && !b.disabled,
                            );
                          const i = list.findIndex(
                            (b) => b === document.activeElement,
                          );
                          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                            e.preventDefault();
                            const d = e.key === "ArrowDown" ? 1 : -1;
                            list[(i + d + list.length) % list.length]?.focus();
                          } else if (e.key === "Home" || e.key === "End") {
                            e.preventDefault();
                            (e.key === "Home"
                              ? list[0]
                              : list[list.length - 1]
                            )?.focus();
                          } else if (e.key === "Escape" || e.key === "Tab") {
                            e.preventDefault();
                            setMenu(false);
                            menuButton.current?.focus();
                          }
                        }}
                      >
                        {menuRows.map((m) => {
                          const ok = validTarget(m.id, moveIds, current);
                          return (
                            <button
                              key={m.id}
                              ref={(node) => {
                                if (node) menuItems.current.set(m.id, node);
                                else menuItems.current.delete(m.id);
                              }}
                              type="button"
                              role="menuitem"
                              tabIndex={-1}
                              disabled={!ok}
                              onClick={() => {
                                setMenu(false);
                                if (applyMove(moveIds, m.id, current)) {
                                  setBumps((b) => ({
                                    ...b,
                                    [m.id]: (b[m.id] ?? 0) + 1,
                                  }));
                                  audio.play("swish", { pitch: 1, gain: 0.4 });
                                }
                                const node = tabbableId
                                  ? items.current.get(tabbableId)
                                  : undefined;
                                node?.focus();
                              }}
                              className={cn(
                                "flex h-8 shrink-0 items-center gap-2 rounded-2 pr-2 text-left text-[13px] text-foreground transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-transparent",
                                RING_IN,
                              )}
                              style={{ paddingLeft: 8 + m.level * 12 }}
                            >
                              <FolderGlyph className="h-3.5 w-auto shrink-0" />
                              <span className="truncate">{nameOf(m.id)}</span>
                            </button>
                          );
                        })}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
                <button
                  type="button"
                  aria-label="Delete selected"
                  title="Delete"
                  onClick={() => remove(moveIds)}
                  className={cn(TOOL, "hover:text-danger")}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </motion.div>
            </div>
          </div>

          <motion.div
            ref={scrollRef}
            layoutScroll
            className="relative [scrollbar-width:thin] overflow-y-auto overscroll-contain"
          >
            <div
              ref={contentRef}
              data-fb-area=""
              data-fb-drop={current}
              onPointerDown={onContentPointerDown}
              onPointerMove={(e) => {
                const pr = press.current;
                if (pr && pr.touch && !pr.armed && !pr.ignored) {
                  if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 8) {
                    window.clearTimeout(pr.timer);
                    pr.ignored = true;
                  }
                }
                area.onPointerMove(e);
              }}
              onPointerUp={(e) => {
                const pr = press.current;
                if (pr) window.clearTimeout(pr.timer);
                if (!lassoState.current && !carryRef.current)
                  touchLock.current = false;
                area.onPointerUp(e);
              }}
              onPointerCancel={area.onPointerCancel}
              onLostPointerCapture={area.onLostPointerCapture}
              className={cn(
                "relative [min-height:100%] touch-pan-y select-none",
                target === current && carry && "bg-cobalt-wash/40",
              )}
            >
              {status === "loading" ? (
                <div
                  aria-busy="true"
                  aria-label="Loading files"
                  className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 p-3"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="flex flex-col gap-2 p-1.5">
                      <span className="aspect-[4/3] w-full rounded-2 bg-surface-2" />
                      <span className="mx-auto h-2.5 w-3/4 rounded-full bg-surface-2" />
                    </div>
                  ))}
                </div>
              ) : status === "error" ? (
                <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                  <p className="text-sm font-medium text-foreground">
                    The files did not load
                  </p>
                  <p className="text-xs text-ink-3">
                    Check the connection and try again.
                  </p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-[13px] text-foreground hover:bg-surface-2",
                      RING,
                    )}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <AnimatePresence initial={false} mode="popLayout" custom={dir}>
                  <motion.div
                    key={current}
                    ref={(node: HTMLDivElement | null) => {
                      if (node && focusNext.current === "@list") {
                        focusNext.current = null;
                        node.focus({ preventScroll: true });
                      }
                    }}
                    id={listId}
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label={nameOf(current)}
                    aria-describedby={hintId}
                    tabIndex={visible.length ? -1 : 0}
                    onKeyDown={onListKeyDown}
                    custom={dir}
                    variants={{
                      in: (d: number) => ({
                        opacity: 0,
                        x: motionSafe ? d * distances.shift : 0,
                      }),
                      at: { opacity: 1, x: 0 },
                      out: () => ({
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }),
                    }}
                    initial="in"
                    animate="at"
                    exit="out"
                    transition={{
                      x: motionSafe ? ride : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                    className={cn(
                      "outline-none",
                      layout === "grid"
                        ? "grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] content-start gap-1.5 p-3"
                        : "flex flex-col gap-0.5 p-2",
                    )}
                  >
                    {layout === "list" && visible.length ? (
                      <div
                        aria-hidden
                        className="hidden h-7 items-center gap-2.5 px-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase @min-[40rem]:flex"
                      >
                        <span className="w-9 shrink-0" />
                        <span className="flex flex-1 items-center gap-3">
                          <span className="flex-1">Name</span>
                          <span className="w-20 shrink-0">Kind</span>
                          <span className="w-16 shrink-0 text-right">Size</span>
                          <span className="hidden w-28 shrink-0 @min-[48rem]:block">
                            Modified
                          </span>
                        </span>
                      </div>
                    ) : null}
                    {visible.map((x) => (
                      <Tile
                        key={x.id}
                        item={x}
                        view={layout}
                        meta={metaOf(x)}
                        modified={modifiedOf(x.modified, nowMs, zoneOffset)}
                        name={nameFor(x)}
                        selected={picked.includes(x.id)}
                        tabbable={x.id === tabbableId}
                        cut={cut.includes(x.id)}
                        carried={
                          !!carry && carry.ids.includes(x.id) && !landing[x.id]
                        }
                        target={target === x.id}
                        charge={target === x.id ? charge : still}
                        landing={landing[x.id] ?? 0}
                        bump={bumps[x.id] ?? 0}
                        layoutId={
                          fromUpload[x.id]
                            ? `${uid}-up-${fromUpload[x.id]}`
                            : undefined
                        }
                        motionSafe={motionSafe}
                        spring={ride}
                        disabled={disabled}
                        bind={bindItem(x.id)}
                        onPress={pressItem}
                        onOpen={openItem}
                        onFocusItem={(id) => {
                          if (id !== focusId) setFocusId(id);
                        }}
                        onLift={lift}
                        lockTouch={(on) => {
                          touchLock.current = on;
                        }}
                      />
                    ))}
                    {visible.length === 0 ? (
                      <div className="col-span-full flex flex-col items-center gap-2 px-6 py-14 text-center">
                        <FolderGlyph className="h-10 w-auto opacity-60" />
                        <p className="text-sm font-medium text-foreground">
                          This folder is empty
                        </p>
                        <p className="max-w-60 text-xs text-ink-3">
                          Drop files here, or use Upload.
                        </p>
                      </div>
                    ) : null}
                  </motion.div>
                </AnimatePresence>
              )}
              {lassoOn ? (
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute top-0 left-0 z-20 rounded-1 border border-cobalt-bright bg-[color-mix(in_oklab,var(--accent-bright)_14%,transparent)]"
                  style={{ x: lx, y: ly, width: lw, height: lh }}
                />
              ) : null}
            </div>
          </motion.div>

          {/* Uploads, landing one by one into the grid. */}
          <AnimatePresence initial={false}>
            {uploads.length ? (
              <motion.div
                key="tray"
                className="overflow-clip border-t border-hairline bg-surface-1"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{
                  height: 0,
                  opacity: 0,
                  transition: exitFor(durations.base),
                }}
                transition={{
                  height: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                <p className="px-3 pt-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {uploads.some((u) => u.status === "uploading")
                    ? `Uploading ${plural(uploads.filter((u) => u.status === "uploading").length, "file")}`
                    : "Uploads"}
                </p>
                <div className="flex max-h-36 flex-col overflow-y-auto overscroll-contain px-1.5 pb-1.5">
                  <AnimatePresence initial={false}>
                    {uploads.map((u) => {
                      const pct = Math.round(u.progress * 100);
                      return (
                        <motion.div
                          key={u.id}
                          layoutId={
                            u.status === "uploading"
                              ? `${uid}-up-${u.id}`
                              : undefined
                          }
                          className="flex h-11 shrink-0 items-center gap-2.5 rounded-2 px-1.5"
                          initial={{
                            opacity: 0,
                            y: motionSafe ? distances.step : 0,
                          }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            height: 0,
                            transition: exitFor(durations.base),
                          }}
                          transition={{
                            y: motionSafe ? springs.snap : { duration: 0 },
                            opacity: { duration: durations.fast },
                            layout: motionSafe ? ride : { duration: 0 },
                          }}
                        >
                          <span className="relative h-7 w-9 shrink-0 overflow-clip rounded-1 border border-hairline bg-card">
                            <Thumb item={u} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className="block truncate text-[13px] text-foreground"
                              title={u.name}
                            >
                              {u.name}
                            </span>
                            <span
                              className={cn(
                                "block truncate text-[11px] tabular-nums",
                                u.status === "error"
                                  ? "text-danger"
                                  : "text-ink-3",
                              )}
                            >
                              {u.status === "error"
                                ? u.error
                                : `${formatBytes(Math.round(u.size * u.progress))} of ${formatBytes(u.size)}`}
                            </span>
                          </span>
                          {u.status === "uploading" ? (
                            <>
                              <span
                                role="progressbar"
                                aria-label={`Uploading ${u.name}`}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-valuenow={pct}
                                aria-valuetext={`${pct}%`}
                                className="hidden h-1 w-16 overflow-clip rounded-full bg-surface-2 @min-[30rem]:block"
                              >
                                <motion.span
                                  className="block h-full origin-left rounded-full bg-cobalt-bright"
                                  initial={false}
                                  animate={{ scaleX: r2(u.progress) }}
                                  transition={
                                    motionSafe ? springs.glide : { duration: 0 }
                                  }
                                />
                              </span>
                              <span className="w-9 shrink-0 text-right font-mono text-[11px] text-ink-2 tabular-nums">
                                {pct}%
                              </span>
                              <button
                                type="button"
                                aria-label={`Cancel ${u.name}`}
                                onClick={() => dropUpload(u.id)}
                                className={cn(TOOL, "size-7")}
                              >
                                <X aria-hidden className="size-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              {u.error === "Upload failed" ? (
                                <button
                                  type="button"
                                  onClick={() => retryUpload(u.id)}
                                  className={cn(
                                    TEXT_BUTTON,
                                    "h-7 px-2 text-xs",
                                  )}
                                >
                                  Retry
                                </button>
                              ) : null}
                              <button
                                type="button"
                                aria-label={`Dismiss ${u.name}`}
                                onClick={() => dropUpload(u.id)}
                                className={cn(TOOL, "size-7")}
                              >
                                <X aria-hidden className="size-3.5" />
                              </button>
                            </>
                          )}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Files from the desktop. */}
          <AnimatePresence>
            {osDrag ? (
              <motion.div
                key="drop"
                aria-hidden
                className="pointer-events-none absolute inset-2 top-14 z-30 flex items-center justify-center rounded-3 border-2 border-dashed border-cobalt-bright bg-[color-mix(in_oklab,var(--accent-bright)_10%,var(--card))]"
                initial={{ opacity: 0, scale: motionSafe ? 0.98 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{
                  scale: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Upload className="size-4 text-cobalt-bright" />
                  Drop to upload to {nameOf(current)}
                </span>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Undo. */}
          <AnimatePresence>
            {toast ? (
              <motion.div
                key={toast.key}
                className="absolute inset-x-3 bottom-3 z-30 mx-auto flex max-w-sm items-center gap-2 rounded-3 border border-hairline-strong bg-popover py-1.5 pr-1.5 pl-3 text-popover-foreground shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? distances.step : 0,
                  transition: exitFor(durations.base),
                }}
                transition={{
                  y: motionSafe ? springs.recoil : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-[18px]">
                  {toast.text}
                </span>
                <button
                  type="button"
                  onClick={undo}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-2 px-2.5 text-[13px] font-medium text-cobalt-bright hover:bg-surface-2",
                    RING,
                  )}
                >
                  Undo
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setToast(null)}
                  className={cn(TOOL, "size-8")}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* Details, once there is room. */}
        <aside
          aria-label="Details"
          className="hidden [scrollbar-width:thin] overflow-y-auto overscroll-contain border-l border-hairline bg-surface-1 p-4 @min-[68rem]:block"
        >
          {detail === null ? (
            <div className="flex flex-col gap-3">
              <div className="relative h-28">
                {chosen.slice(0, 3).map((x, i) => (
                  <span
                    key={x.id}
                    className="absolute top-2 left-1/2 h-20 w-28 overflow-clip rounded-2 border border-hairline bg-card shadow-[0_4px_12px_color-mix(in_oklab,black_12%,transparent)]"
                    style={{
                      transform: `translateX(-50%) translate(${(i - 1) * 14}px, ${i * 4}px) rotate(${(i - 1) * 4}deg)`,
                    }}
                  >
                    <Thumb item={x} large />
                  </span>
                ))}
              </div>
              <p className="text-sm font-semibold text-foreground">
                {plural(chosen.length, "item")}
              </p>
              <p className="font-mono text-xs text-ink-3 tabular-nums">
                {formatBytes(selectionSize)}
              </p>
              <ul
                role="list"
                className="flex flex-col gap-1 text-xs text-ink-2"
              >
                {chosen.slice(0, 6).map((x) => (
                  <li key={x.id} className="truncate">
                    {x.name}
                  </li>
                ))}
                {chosen.length > 6 ? (
                  <li className="text-ink-3">and {chosen.length - 6} more</li>
                ) : null}
              </ul>
            </div>
          ) : (
            (() => {
              const x = detail;
              if (!x) {
                return (
                  <div className="flex flex-col gap-3">
                    <span className="flex h-28 items-center justify-center rounded-3 bg-card">
                      <FolderGlyph className="h-14 w-auto" />
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      {nameOf(current)}
                    </p>
                    <p className="text-xs text-ink-3">
                      {plural(visible.length, "item")} ·{" "}
                      {formatBytes(sizeOfAll(visibleIds))}
                    </p>
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-3">
                  <span className="relative block aspect-[4/3] overflow-clip rounded-3 border border-hairline bg-card">
                    <Thumb item={x} large />
                  </span>
                  <p className="text-sm font-semibold break-words text-foreground">
                    {x.name}
                  </p>
                  <dl className="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs">
                    <dt className="text-ink-3">Kind</dt>
                    <dd className="text-foreground">{KIND_LABEL[x.kind]}</dd>
                    <dt className="text-ink-3">
                      {x.kind === "folder" ? "Contains" : "Size"}
                    </dt>
                    <dd className="text-foreground tabular-nums">
                      {metaOf(x)}
                    </dd>
                    <dt className="text-ink-3">Modified</dt>
                    <dd className="text-foreground">
                      {modifiedOf(x.modified, nowMs, zoneOffset)}
                    </dd>
                    {x.owner ? (
                      <>
                        <dt className="text-ink-3">Owner</dt>
                        <dd className="truncate text-foreground">{x.owner}</dd>
                      </>
                    ) : null}
                    <dt className="text-ink-3">Where</dt>
                    <dd
                      className="truncate text-foreground"
                      title={pathTo(x.parentId).map(nameOf).join(" / ")}
                    >
                      {pathTo(x.parentId).map(nameOf).join(" / ")}
                    </dd>
                  </dl>
                  <button
                    type="button"
                    onClick={() => openItem(x.id)}
                    className={cn(
                      "inline-flex h-8 items-center justify-center self-start rounded-2 border border-hairline-strong bg-card px-3 text-[13px] text-foreground hover:bg-surface-2",
                      RING,
                    )}
                  >
                    Open
                  </button>
                </div>
              );
            })()
          )}
        </aside>
      </div>

      {/* The carried stack, above everything, clipped to the browser. */}
      {carry ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-50"
          style={{
            x: gx,
            y: gy,
            scale: gScale,
            opacity: gOpacity,
            originX: 0,
            originY: 0,
          }}
        >
          {carry.ids.slice(0, 3).map((id, i) => {
            const x = byId.get(id);
            if (!x) return null;
            const tilt = ((hash(id) % 7) - 3) * (i === 0 ? 0.4 : 1);
            return (
              <span
                key={id}
                className="absolute top-0 left-0 flex h-10 w-44 items-center gap-2 rounded-2 border border-hairline-strong bg-popover px-2 shadow-[0_10px_24px_color-mix(in_oklab,black_22%,transparent)]"
                style={{
                  transform: `translate(${i * 4}px, ${i * 4}px) rotate(${tilt}deg)`,
                  zIndex: 3 - i,
                }}
              >
                <span className="relative h-7 w-9 shrink-0 overflow-clip rounded-1 border border-hairline bg-card">
                  <Thumb item={x} />
                </span>
                <span className="truncate text-[13px] text-foreground">
                  {x.name}
                </span>
              </span>
            );
          })}
          {carry.ids.length > 1 ? (
            <span className="absolute -top-2 left-40 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-cobalt-bright px-1.5 font-mono text-[11px] font-medium text-background tabular-nums">
              {carry.ids.length}
            </span>
          ) : null}
        </motion.div>
      ) : null}

      <p id={hintId} className="sr-only">
        Arrow keys move, Shift extends the selection, Space toggles, Enter
        opens, Backspace goes up, Control or Command with X and V cuts and
        pastes, Delete removes. Drag files onto a folder and hold to open it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
