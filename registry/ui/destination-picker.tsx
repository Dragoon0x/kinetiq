"use client";

import * as React from "react";

import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  RotateCcw,
  Star,
  TriangleAlert,
  X,
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

export type DriveKind = "folder" | "file";

export type DriveNode = {
  id: string;
  name: string;
  kind: DriveKind;
  /** A folder's contents, in display order. */
  children?: DriveNode[];
  /** A file's size in bytes. */
  size?: number;
  /** The folder's first load fails and offers Retry; the second succeeds. */
  failsOnce?: boolean;
};

/** One thing being moved or copied. */
export type DriveItem = {
  id: string;
  name: string;
  kind: DriveKind;
  /** The folder it lives in now: folder ids from the root down. */
  path: string[];
  size?: number;
};

/** Folder ids from the root down, e.g. ["root", "projects", "coldbrook"]. */
export type DrivePath = string[];
export type DriveMode = "move" | "copy";
export type DriveSlideStyle = "slide" | "fade" | "stack";
export type DriveDensity = "compact" | "cozy" | "roomy";
export type DriveStatus = "ready" | "loading" | "error";

export type DestinationPickerProps = {
  /** The drive, as a tree whose root is the drive itself. @default defaultDriveTree */
  tree?: DriveNode;
  /** The things being moved or copied, shown in the tray. @default defaultDriveItems */
  items?: DriveItem[];
  /** Controlled destination: the path of the chosen folder. */
  value?: DrivePath;
  /** Initial destination when uncontrolled; the picker opens on it. @default defaultDrivePath */
  defaultValue?: DrivePath;
  /** Fires whenever the destination changes: a folder opened, chosen, created or jumped to. */
  onChange?: (path: DrivePath, folder: DriveNode) => void;
  /** Controlled action. */
  mode?: DriveMode;
  /** Initial action when uncontrolled. @default "move" */
  defaultMode?: DriveMode;
  /** The segmented control was switched. */
  onModeChange?: (mode: DriveMode) => void;
  /** Move or Copy was pressed with a destination that is allowed. */
  onConfirm?: (
    destination: DrivePath,
    mode: DriveMode,
    items: DriveItem[],
  ) => void;
  /** A folder was created inline; it is already the destination. */
  onCreateFolder?: (folder: DriveNode, path: DrivePath) => void;
  /** Starred folders, shown as chips above the pane. @default defaultDriveFavourites */
  favourites?: DrivePath[];
  /** Recent destinations, shown as chips after the starred ones. @default defaultDriveRecent */
  recent?: DrivePath[];
  /** How one folder gives way to the next: a push sideways, a cross-fade, or a sheet rising over the last. @default "slide" */
  slideStyle?: DriveSlideStyle;
  /** Row height and type size. @default "cozy" */
  density?: DriveDensity;
  /** List files, greyed, among the folders. @default true */
  showFiles?: boolean;
  /** How long a folder takes to arrive after it is entered, in ms; 0 shows it at once. @default 420 */
  loadDelay?: number;
  /** Whether the drive itself has arrived. @default "ready" */
  status?: DriveStatus;
  /** "Try again" was pressed after the drive failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Move or copy" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the pane scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be opened, chosen or confirmed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const file = (id: string, name: string, size: number): DriveNode => ({
  id,
  name,
  kind: "file",
  size,
});

const folder = (
  id: string,
  name: string,
  children: DriveNode[],
  extra?: Partial<DriveNode>,
): DriveNode => ({ id, name, kind: "folder", children, ...extra });

/** Basinworks Drive: projects, a shared area, an archive and a team drive. */
export const defaultDriveTree: DriveNode = folder("root", "Basinworks Drive", [
  folder("projects", "Projects", [
    folder("fieldline", "Fieldline survey", [
      file("site-plan", "Site plan.pdf", 2_418_000),
      file("findings", "Findings.xlsx", 184_000),
      folder("photos", "Photos", [
        file("ph-north", "Plot north.jpg", 3_100_000),
        file("ph-south", "Plot south.jpg", 2_950_000),
      ]),
    ]),
    folder("coldbrook", "Coldbrook grant", [
      file("cb-draft", "Application draft.docx", 96_000),
      file("cb-budget", "Budget.xlsx", 142_000),
      folder("cb-letters", "Letters of support", []),
    ]),
    folder(
      "gaugeworks",
      "Gaugeworks rollout",
      [
        file("gw-timeline", "Timeline.pdf", 410_000),
        file("gw-risks", "Risks.md", 12_000),
        folder("gw-vendors", "Vendors", [
          file("gw-quotes", "Quotes.xlsx", 88_000),
        ]),
      ],
      { failsOnce: true },
    ),
  ]),
  folder("shared", "Shared with me", [
    folder("legal", "Legal", [file("nda", "NDA template.docx", 64_000)]),
    folder("finance", "Finance", [
      file("q3-close", "Q3 close.xlsx", 512_000),
      folder("invoices", "Invoices", [
        file("inv-0418", "INV-0418.pdf", 71_000),
        file("inv-0419", "INV-0419.pdf", 69_000),
      ]),
    ]),
  ]),
  folder("archive", "Archive", [
    folder("y2025", "2025", [file("ye-2025", "Year end.pdf", 1_040_000)]),
    folder("y2024", "2024", []),
  ]),
  folder("team", "Team drive", [
    file("onboarding", "Onboarding.md", 24_000),
    folder("templates", "Templates", [
      file("tpl-survey", "Survey template.docx", 58_000),
      file("tpl-report", "Report template.docx", 61_000),
    ]),
  ]),
  file("notes", "Meeting notes.md", 18_000),
  file("roadmap", "Roadmap 2027.pdf", 1_280_000),
]);

/** Two files and a folder from the Fieldline survey. */
export const defaultDriveItems: DriveItem[] = [
  {
    id: "findings",
    name: "Findings.xlsx",
    kind: "file",
    path: ["root", "projects", "fieldline"],
    size: 184_000,
  },
  {
    id: "photos",
    name: "Photos",
    kind: "folder",
    path: ["root", "projects", "fieldline"],
  },
  {
    id: "site-plan",
    name: "Site plan.pdf",
    kind: "file",
    path: ["root", "projects", "fieldline"],
    size: 2_418_000,
  },
];

export const defaultDrivePath: DrivePath = ["root"];

export const defaultDriveFavourites: DrivePath[] = [
  ["root", "team"],
  ["root", "projects", "fieldline"],
];

export const defaultDriveRecent: DrivePath[] = [
  ["root", "projects", "coldbrook"],
  ["root", "shared", "finance"],
  ["root", "archive", "y2025"],
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const SHAKE_MS = 520;
const DONE_MS = 2200;
const LAND_MS = 900;

const noopSubscribe = () => () => {};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const samePath = (a: DrivePath, b: DrivePath) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const startsWith = (path: DrivePath, prefix: DrivePath) =>
  prefix.length <= path.length && prefix.every((x, i) => path[i] === x);

const fmtSize = (bytes: number | undefined) => {
  if (bytes === undefined) return "";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1000) return `${Math.round(bytes / 1000)} KB`;
  return `${bytes} B`;
};

const contentsWords = (children: DriveNode[]) => {
  const folders = children.filter((c) => c.kind === "folder").length;
  const files = children.length - folders;
  if (children.length === 0) return "empty";
  const parts: string[] = [];
  if (folders) parts.push(`${folders} ${folders === 1 ? "folder" : "folders"}`);
  if (files) parts.push(`${files} ${files === 1 ? "file" : "files"}`);
  return parts.join(", ");
};

const capitalise = (s: string) =>
  s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const itemsWords = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

const uniqueName = (base: string, siblings: DriveNode[]) => {
  const names = new Set(siblings.map((s) => s.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let n = 2;
  while (names.has(`${base} ${n}`.toLowerCase())) n += 1;
  return `${base} ${n}`;
};

type Entry = { node: DriveNode; path: DrivePath; parent: string | null };
type LoadState = "loading" | "ready" | "error";

const childrenOf = (node: DriveNode, extra: Record<string, DriveNode[]>) => [
  ...(extra[node.id] ?? []),
  ...(node.children ?? []),
];

/** Every node by id, with its path, so a value is resolved by its last id. */
const indexTree = (tree: DriveNode, extra: Record<string, DriveNode[]>) => {
  const map = new Map<string, Entry>();
  const walk = (node: DriveNode, above: DrivePath, parent: string | null) => {
    const path = [...above, node.id];
    map.set(node.id, { node, path, parent });
    if (node.kind === "folder") {
      for (const child of childrenOf(node, extra)) walk(child, path, node.id);
    }
  };
  walk(tree, [], null);
  return map;
};

const DENSITY: Record<
  DriveDensity,
  { row: number; text: string; icon: string; pad: string }
> = {
  compact: { row: 30, text: "text-[12px]", icon: "size-3.5", pad: "px-2" },
  cozy: { row: 36, text: "text-[13px]", icon: "size-4", pad: "px-2.5" },
  roomy: { row: 44, text: "text-[13px]", icon: "size-4", pad: "px-3" },
};

const MODES: { id: DriveMode; label: string }[] = [
  { id: "move", label: "Move" },
  { id: "copy", label: "Copy" },
];

/**
 * How one folder gives way to the next. `d` is the direction: 1 deeper,
 * -1 back up. Exits always run on the exit tween, never a spring.
 */
const pageVariants = (
  style: DriveSlideStyle,
  motionSafe: boolean,
): Variants => {
  const still = { x: 0, y: 0, scale: 1 };
  if (!motionSafe || style === "fade") {
    return {
      enter: { ...still, opacity: 0 },
      center: { ...still, opacity: 1 },
      exit: { ...still, opacity: 0, transition: exitFor(durations.base) },
    };
  }
  if (style === "slide") {
    return {
      enter: (d: number) => ({
        ...still,
        opacity: d > 0 ? 1 : 0.6,
        x: d > 0 ? "100%" : "-30%",
      }),
      center: { ...still, opacity: 1 },
      exit: (d: number) => ({
        ...still,
        opacity: d > 0 ? 0.5 : 1,
        x: d > 0 ? "-30%" : "100%",
        transition: exitFor(durations.slow),
      }),
    };
  }
  return {
    enter: (d: number) =>
      d > 0
        ? { ...still, opacity: 0, y: distances.shift, scale: 0.985 }
        : { ...still, opacity: 0, scale: 0.97 },
    center: { ...still, opacity: 1 },
    exit: (d: number) =>
      d > 0
        ? {
            ...still,
            opacity: 0,
            scale: 0.97,
            transition: exitFor(durations.slow),
          }
        : {
            ...still,
            opacity: 0,
            y: distances.shift,
            transition: exitFor(durations.slow),
          },
  };
};

/* ----------------------------------------------------------------------- */
/*                               Subcomponents                              */
/* ----------------------------------------------------------------------- */

function Pulse({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-2 bg-surface-2 motion-safe:animate-pulse",
        className,
      )}
      style={style}
    />
  );
}

function Tick({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3.5", className)}>
      <motion.path
        d="M3 7.4 5.8 10 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

type RowProps = {
  node: DriveNode;
  contents: string;
  selected: boolean;
  moving: boolean;
  navigable: boolean;
  tabIndex: number;
  index: number;
  step: number;
  enter: boolean;
  landing: boolean;
  shaking: boolean;
  motionSafe: boolean;
  disabled: boolean;
  density: DriveDensity;
  modeWord: string;
  nodeRef: (node: HTMLLIElement | null) => void;
  onSelect: () => void;
  onEnter: () => void;
  onFocus: () => void;
};

function Row({
  node,
  contents,
  selected,
  moving,
  navigable,
  tabIndex,
  index,
  step,
  enter,
  landing,
  shaking,
  motionSafe,
  disabled,
  density,
  modeWord,
  nodeRef,
  onSelect,
  onEnter,
  onFocus,
}: RowProps) {
  const d = DENSITY[density];
  const isFolder = node.kind === "folder";
  const dim = !isFolder || moving;
  const initial = landing
    ? motionSafe
      ? { opacity: 0, scale: 0.96, y: -distances.nudge }
      : { opacity: 0 }
    : enter
      ? motionSafe
        ? { opacity: 0, y: distances.nudge }
        : { opacity: 0 }
      : false;
  return (
    <motion.li
      ref={nodeRef}
      role="option"
      aria-selected={isFolder ? selected : undefined}
      aria-disabled={!navigable || disabled || undefined}
      aria-label={`${node.name}, ${isFolder ? "folder" : "file"}${contents ? `, ${contents}` : ""}${moving ? `, being ${modeWord === "Move" ? "moved" : "copied"}` : ""}${selected ? ", destination" : ""}`}
      tabIndex={tabIndex}
      initial={initial}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        x: shaking && motionSafe ? [0, -6, 6, -4, 4, 0] : 0,
      }}
      transition={{
        opacity: { duration: durations.base, ease: easings.enter },
        y: landing
          ? springs.recoil
          : motionSafe
            ? { ...springs.glide, delay: Math.min(index, 12) * step }
            : { duration: 0 },
        scale: springs.recoil,
        x: { duration: durations.slow, ease: easings.move },
      }}
      onFocus={onFocus}
      onClick={(event) => {
        if (disabled || !isFolder) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-open]")) onEnter();
        else onSelect();
      }}
      onDoubleClick={() => {
        if (!disabled && isFolder) onEnter();
      }}
      style={{ height: d.row }}
      className={cn(
        "group relative mx-1.5 flex shrink-0 items-center gap-2 rounded-2 transition-colors duration-150 select-none",
        d.pad,
        d.text,
        isFolder && !disabled && !moving && "cursor-pointer",
        selected
          ? "bg-cobalt-wash text-cobalt-bright"
          : dim
            ? "text-ink-3"
            : "text-foreground hover:bg-surface-2",
        shaking &&
          "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger",
        FOCUS_RING,
      )}
    >
      {isFolder ? (
        <Folder
          aria-hidden
          className={cn(d.icon, "shrink-0", selected ? "fill-current/20" : "")}
        />
      ) : (
        <FileText aria-hidden className={cn(d.icon, "shrink-0 opacity-70")} />
      )}
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      {moving ? (
        <span className="shrink-0 rounded-1 border border-hairline px-1 font-mono text-[9px] tracking-[0.08em] uppercase">
          {modeWord === "Move" ? "Moving" : "Copying"}
        </span>
      ) : null}
      {selected ? (
        <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] tracking-[0.08em] uppercase @min-[30rem]:inline-flex">
          <Tick motionSafe={motionSafe} className="size-3" />
          Here
        </span>
      ) : contents ? (
        <span
          className={cn(
            "hidden shrink-0 font-mono text-[10px] tabular-nums @min-[26rem]:inline",
            selected ? "opacity-80" : "text-ink-3",
          )}
        >
          {contents}
        </span>
      ) : null}
      {isFolder ? (
        <span
          data-open
          aria-hidden
          title="Open"
          className={cn(
            "-mr-1 flex size-6 shrink-0 items-center justify-center rounded-1 transition-colors",
            !moving &&
              "hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)]",
          )}
        >
          <ChevronRight className="size-3.5 opacity-70" />
        </span>
      ) : null}
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A move-or-copy picker. A crumb strip tracks where you are; the pane lists
 * the folder's children, folders enterable and files greyed. Entering a
 * folder pushes the list left on `springs.glide` while the new one arrives
 * from the right, and the strip grows a crumb that lands on `springs.snap`;
 * Back pushes the other way and leaves the folder you came from selected as
 * the destination. Starred and recent folders sit as chips above the pane
 * for a direct jump. New folder opens a row inline on `springs.glide`, and
 * the folder it makes lands on `springs.recoil` as the chosen destination.
 *
 * The tray at the foot names the items, writes the destination in words
 * (the folder name swaps on `springs.snap` as the choice changes) and holds
 * a Move / Copy radio group whose indicator slides on snap. A folder that
 * would hold one of the moved folders inside itself is refused with a shake
 * and a spoken reason; a move into the folder the items already live in
 * is named and cannot be confirmed. Each folder loads on entry behind a row
 * skeleton; one that fails offers Retry in place.
 *
 * The pane is a listbox: Up/Down move among folders, Space chooses one,
 * Enter or Right opens it, Left or Backspace goes up, Home/End jump, Escape
 * drops the choice back to the folder itself. Crumbs are buttons, the chips
 * are one toolbar, the control is a radio group. Under reduced motion nothing
 * travels: folders cross-fade, the indicator is placed, the shake becomes a
 * red flash, and every change is still announced.
 */
export function DestinationPicker({
  tree = defaultDriveTree,
  items = defaultDriveItems,
  value,
  defaultValue = defaultDrivePath,
  onChange,
  mode,
  defaultMode = "move",
  onModeChange,
  onConfirm,
  onCreateFolder,
  favourites = defaultDriveFavourites,
  recent = defaultDriveRecent,
  slideStyle = "slide",
  density = "cozy",
  showFiles = true,
  loadDelay = 420,
  status = "ready",
  onRetry,
  title = "Move or copy",
  label,
  height = 540,
  disabled = false,
  className,
}: DestinationPickerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<DrivePath>(defaultValue);
  const current = value ?? own;
  const [ownMode, setOwnMode] = React.useState<DriveMode>(defaultMode);
  const currentMode = mode ?? ownMode;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [extra, setExtra] = React.useState<Record<string, DriveNode[]>>({});
  const [loads, setLoads] = React.useState<
    Record<string, LoadState | undefined>
  >({});
  const [viewPath, setViewPath] = React.useState<DrivePath>(defaultValue);
  const [dir, setDir] = React.useState<1 | -1>(1);
  const [composing, setComposing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [shake, setShake] = React.useState<{ id: string; seq: number } | null>(
    null,
  );
  const [done, setDone] = React.useState<{ text: string; seq: number } | null>(
    null,
  );
  const [landed, setLanded] = React.useState<string | null>(null);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [activeChip, setActiveChip] = React.useState<string | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so rows already on the page
  // never fade in; true for pages that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const attempts = React.useRef(new Map<string, number>());
  const timers = React.useRef(new Set<number>());
  const counter = React.useRef(0);
  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const listNodes = React.useRef(new Map<string, HTMLUListElement>());
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const newFolderRef = React.useRef<HTMLButtonElement | null>(null);

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  React.useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) window.clearTimeout(t);
      set.clear();
    };
  }, []);

  /* -------------------------------- data ------------------------------- */

  const index = React.useMemo(() => indexTree(tree, extra), [tree, extra]);
  const rootId = tree.id;
  const rootEntry: Entry = index.get(rootId) ?? {
    node: tree,
    path: [rootId],
    parent: null,
  };

  const resolve = (path: DrivePath): Entry => {
    const id = path[path.length - 1];
    const entry = id ? index.get(id) : undefined;
    return entry && entry.node.kind === "folder" ? entry : rootEntry;
  };

  const dest = resolve(current);
  // The pane shows the folder the destination is, or the one it sits in;
  // anything else (a host jump) opens the destination itself.
  const viewEntry = (() => {
    const v = resolve(viewPath);
    return samePath(dest.path, v.path) || dest.parent === v.node.id ? v : dest;
  })();
  const viewId = viewEntry.node.id;
  const selectedId = dest.parent === viewId ? dest.node.id : null;

  const children = childrenOf(viewEntry.node, extra);
  const rows = showFiles
    ? children
    : children.filter((c) => c.kind === "folder");
  const movingIds = new Set(items.map((i) => i.id));
  const navIds = rows.filter((r) => r.kind === "folder").map((r) => r.id);
  const activeId =
    activeRow && navIds.includes(activeRow)
      ? activeRow
      : selectedId && navIds.includes(selectedId)
        ? selectedId
        : (navIds[0] ?? null);

  const explicitLoad = loads[viewId];
  const viewLoad: LoadState =
    explicitLoad ?? (viewId === rootId || loadDelay <= 0 ? "ready" : "loading");
  const failsOnce = viewEntry.node.failsOnce === true;
  const viewName = viewEntry.node.name;
  const viewWords = contentsWords(children);

  const modeWord = currentMode === "move" ? "Move" : "Copy";

  /** Why a folder cannot take the items, or null when it can. */
  const blockedReason = (entry: Entry): string | null => {
    for (const item of items) {
      if (item.kind !== "folder") continue;
      const ownPath = [...item.path, item.id];
      if (!startsWith(entry.path, ownPath)) continue;
      return entry.node.id === item.id
        ? `Can't ${currentMode} ${item.name} into itself.`
        : `Can't ${currentMode} ${item.name} into ${entry.node.name}, which is inside it.`;
    }
    return null;
  };

  const sameFolder =
    currentMode === "move" &&
    items.length > 0 &&
    items.every((i) => samePath(i.path, dest.path));
  const canConfirm =
    !inert && items.length > 0 && !sameFolder && blockedReason(dest) === null;

  /* ------------------------------- loading ----------------------------- */

  React.useEffect(() => {
    if (explicitLoad !== undefined || viewId === rootId || loadDelay <= 0)
      return;
    const n = attempts.current.get(viewId) ?? 0;
    const t = window.setTimeout(() => {
      attempts.current.set(viewId, n + 1);
      const fail = failsOnce && n === 0;
      setLoads((prev) => ({ ...prev, [viewId]: fail ? "error" : "ready" }));
      setAnnouncement(
        fail ? `${viewName} didn't load.` : `${viewName}: ${viewWords}.`,
      );
      // The list kept focus while it loaded; hand it to the first folder.
      const ul = listNodes.current.get(viewId);
      if (!fail && ul && document.activeElement === ul) {
        setFocusReq((f) => ({ id: `first:${viewId}`, seq: (f?.seq ?? 0) + 1 }));
      }
    }, loadDelay);
    return () => window.clearTimeout(t);
  }, [explicitLoad, viewId, rootId, loadDelay, failsOnce, viewName, viewWords]);

  const retryFolder = () => {
    setLoads((prev) => {
      const next = { ...prev };
      delete next[viewId];
      return next;
    });
    setAnnouncement(`Loading ${viewName} again.`);
    setFocusReq((f) => ({ id: `list:${viewId}`, seq: (f?.seq ?? 0) + 1 }));
  };

  /* -------------------------------- focus ------------------------------ */

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const { id } = focusReq;
    let node: HTMLElement | undefined;
    if (id.startsWith("first:")) {
      const fid = id.slice(6);
      const first =
        fid === viewId && viewLoad === "ready" ? navIds[0] : undefined;
      node =
        (first && rowNodes.current.get(first)) || listNodes.current.get(fid);
    } else if (id.startsWith("list:")) {
      node = listNodes.current.get(id.slice(5));
    } else if (id.startsWith("mode:")) {
      node = chipNodes.current.get(id);
    } else if (id === "input") {
      node = inputRef.current ?? undefined;
    } else if (id === "new-folder") {
      node = newFolderRef.current ?? undefined;
    } else {
      node = rowNodes.current.get(id);
    }
    node?.focus({ preventScroll: true });
    if (node instanceof HTMLInputElement) node.select();
    // navIds/viewId/viewLoad are read for the resolution only; the request
    // itself is what should trigger a focus move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq]);

  const focusInList = () => {
    if (typeof document === "undefined") return false;
    const ul = listNodes.current.get(viewId);
    return !!ul && ul.contains(document.activeElement);
  };

  const request = (id: string) =>
    setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));

  /* ------------------------------- changes ----------------------------- */

  const commit = (path: DrivePath, node: DriveNode) => {
    if (samePath(path, dest.path)) return;
    if (value === undefined) setOwn(path);
    onChange?.(path, node);
  };

  const refuse = (id: string, reason: string) => {
    setShake((s) => ({ id, seq: (s?.seq ?? 0) + 1 }));
    setAnnouncement(reason);
    later(() => setShake((s) => (s?.id === id ? null : s)), SHAKE_MS);
  };

  const enter = (id: string) => {
    if (inert) return;
    const entry = index.get(id);
    if (!entry || entry.node.kind !== "folder") return;
    const reason = blockedReason(entry);
    if (reason) {
      refuse(id, reason);
      return;
    }
    const keep = focusInList();
    setDir(1);
    setViewPath(entry.path);
    setComposing(false);
    commit(entry.path, entry.node);
    setAnnouncement(
      `Opened ${entry.node.name}. Destination: ${entry.node.name}.`,
    );
    if (keep) request(`first:${id}`);
  };

  const select = (id: string) => {
    if (inert) return;
    const entry = index.get(id);
    if (!entry || entry.node.kind !== "folder") return;
    const reason = blockedReason(entry);
    if (reason) {
      refuse(id, reason);
      return;
    }
    if (samePath(entry.path, dest.path)) return;
    commit(entry.path, entry.node);
    setAnnouncement(`Destination: ${entry.node.name}.`);
  };

  const unselect = () => {
    if (inert || selectedId === null) return;
    commit(viewEntry.path, viewEntry.node);
    setAnnouncement(`Destination: ${viewName}.`);
  };

  const goUp = () => {
    if (inert || !viewEntry.parent) return;
    const parent = index.get(viewEntry.parent);
    if (!parent) return;
    const from = viewEntry;
    const keep = focusInList();
    setDir(-1);
    setViewPath(parent.path);
    setComposing(false);
    commit(from.path, from.node);
    setAnnouncement(
      `Back to ${parent.node.name}. Destination: ${from.node.name}.`,
    );
    if (keep) request(from.node.id);
  };

  const jump = (path: DrivePath, shakeKey: string) => {
    if (inert) return;
    const entry = resolve(path);
    const reason = blockedReason(entry);
    if (reason) {
      refuse(shakeKey, reason);
      return;
    }
    if (entry.node.id === viewId) {
      unselect();
      return;
    }
    setDir(entry.path.length >= viewEntry.path.length ? 1 : -1);
    setViewPath(entry.path);
    setComposing(false);
    commit(entry.path, entry.node);
    setAnnouncement(
      `Opened ${entry.node.name}. Destination: ${entry.node.name}.`,
    );
  };

  const setMode = (next: DriveMode) => {
    if (inert || next === currentMode) return;
    if (mode === undefined) setOwnMode(next);
    onModeChange?.(next);
    setAnnouncement(`${next === "move" ? "Move" : "Copy"} mode.`);
  };

  const openComposer = () => {
    if (inert || viewLoad !== "ready") return;
    if (composing) {
      request("input");
      return;
    }
    setDraft(uniqueName("New folder", children));
    setComposing(true);
    setAnnouncement(`Naming a new folder in ${viewName}.`);
    request("input");
  };

  const cancelComposer = () => {
    setComposing(false);
    request("new-folder");
  };

  const createFolder = () => {
    if (inert) return;
    const name = uniqueName(draft.trim() || "New folder", children);
    counter.current += 1;
    const id = `${viewId}-new-${counter.current}`;
    const node: DriveNode = { id, name, kind: "folder", children: [] };
    const path = [...viewEntry.path, id];
    setExtra((prev) => ({
      ...prev,
      [viewId]: [node, ...(prev[viewId] ?? [])],
    }));
    setLoads((prev) => ({ ...prev, [id]: "ready" }));
    setComposing(false);
    setLanded(id);
    later(() => setLanded((l) => (l === id ? null : l)), LAND_MS);
    if (value === undefined) setOwn(path);
    onChange?.(path, node);
    onCreateFolder?.(node, path);
    setAnnouncement(
      `Folder ${name} created in ${viewName}. Destination: ${name}.`,
    );
    request(id);
  };

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm?.(dest.path, currentMode, items);
    const text = `${currentMode === "move" ? "Moved" : "Copied"} ${itemsWords(items.length)} to ${dest.node.name}.`;
    setDone((d) => ({ text, seq: (d?.seq ?? 0) + 1 }));
    setAnnouncement(text);
    later(() => setDone((d) => (d?.text === text ? null : d)), DONE_MS);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onListKey = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    // The composer's input and buttons own their keys.
    if (target?.closest("[data-composer]")) return;
    const i = activeId ? navIds.indexOf(activeId) : -1;
    const key = event.key;
    let to = -1;
    if (key === "ArrowDown") to = i + 1;
    else if (key === "ArrowUp") to = i - 1;
    else if (key === "Home") to = 0;
    else if (key === "End") to = navIds.length - 1;
    else if (key === "ArrowRight" || key === "Enter") {
      event.preventDefault();
      if (activeId && activeId === target?.dataset.row) {
        enter(activeId);
      }
      return;
    } else if (key === "ArrowLeft" || key === "Backspace") {
      event.preventDefault();
      goUp();
      return;
    } else if (key === " ") {
      event.preventDefault();
      if (activeId) select(activeId);
      return;
    } else if (key === "Escape") {
      if (selectedId !== null) {
        event.preventDefault();
        unselect();
      }
      return;
    } else return;
    event.preventDefault();
    if (navIds.length === 0) return;
    const next = navIds[clamp(to, 0, navIds.length - 1)];
    if (next) rowNodes.current.get(next)?.focus();
  };

  const chips = [
    ...favourites.map((p) => ({ kind: "star" as const, entry: resolve(p) })),
    ...recent.map((p) => ({ kind: "recent" as const, entry: resolve(p) })),
  ]
    .filter((c) => c.entry.node.id !== rootId)
    .map((c) => ({ ...c, key: `${c.kind}:${c.entry.node.id}` }));
  const chipKeys = chips.map((c) => c.key);
  const activeChipKey =
    activeChip && chipKeys.includes(activeChip)
      ? activeChip
      : (chipKeys[0] ?? null);

  const onChipKey = (event: React.KeyboardEvent, key: string) => {
    const i = chipKeys.indexOf(key);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = chipKeys.length - 1;
    else return;
    event.preventDefault();
    const target = chipKeys[clamp(to, 0, chipKeys.length - 1)];
    if (target) chipNodes.current.get(target)?.focus();
  };

  const onModeKey = (event: React.KeyboardEvent) => {
    const i = MODES.findIndex((m) => m.id === currentMode);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = MODES.length - 1;
    else return;
    event.preventDefault();
    const next = MODES[(to + MODES.length) % MODES.length];
    if (next) {
      setMode(next.id);
      request(`mode:${next.id}`);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const crumbs = viewEntry.path
    .map((id) => index.get(id))
    .filter((e): e is Entry => e !== undefined);
  const collapsed = crumbs.length > 4;
  const shownCrumbs = collapsed
    ? [crumbs[0], crumbs[crumbs.length - 2], crumbs[crumbs.length - 1]].filter(
        (e): e is Entry => e !== undefined,
      )
    : crumbs;
  const hiddenCrumb = collapsed ? crumbs[crumbs.length - 3] : undefined;

  const variants = pageVariants(slideStyle, motionSafe);
  const step = cascade(Math.min(rows.length, 12));
  const d = DENSITY[density];
  const fileCount = children.length - navIds.length;

  const empty = ready && viewLoad === "ready" && rows.length === 0;

  const destWords = (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span className="shrink-0">
        {modeWord} {itemsWords(items.length)} to
      </span>
      <span className="relative inline-grid min-w-0 overflow-hidden align-baseline [grid-template-areas:'a']">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.strong
            key={dest.node.id}
            className="truncate font-semibold text-foreground [grid-area:a]"
            initial={
              motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {dest.node.name}
          </motion.strong>
        </AnimatePresence>
      </span>
    </span>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move among folders. Space chooses the folder as the
        destination. Enter or Right opens it. Left or Backspace goes up a
        folder. Escape chooses the folder you are in.
      </p>

      {/* ------------------------------ header ----------------------------- */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <button
          ref={newFolderRef}
          type="button"
          onClick={openComposer}
          aria-disabled={inert || viewLoad !== "ready" || undefined}
          aria-expanded={composing}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs transition-colors",
            !inert && viewLoad === "ready"
              ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
              : "cursor-default text-ink-3",
            FOCUS_RING,
          )}
        >
          <FolderPlus aria-hidden className="size-3.5" />
          <span className="hidden @min-[24rem]:inline">New folder</span>
          <span className="@min-[24rem]:hidden">New</span>
        </button>
      </header>

      {/* --------------------------- crumbs + chips ------------------------ */}
      {status === "loading" ? (
        <div aria-hidden className="flex shrink-0 flex-col gap-2.5 px-4 pb-3">
          <div className="flex items-center gap-2">
            <Pulse className="size-7 rounded-2" />
            <Pulse className="h-4 w-28" />
            <Pulse className="h-4 w-20" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Pulse
                key={i}
                className="h-6 rounded-full"
                style={{
                  width: 72 + ((i * 29) % 36),
                  animationDelay: `${i * 70}ms`,
                }}
              />
            ))}
          </div>
        </div>
      ) : status === "error" ? null : (
        <div className="flex shrink-0 flex-col gap-2 px-4 pb-2.5">
          <nav
            aria-label="Folder path"
            className="flex min-w-0 items-center gap-1"
          >
            <button
              type="button"
              onClick={goUp}
              aria-label="Up one folder"
              aria-disabled={inert || !viewEntry.parent || undefined}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-2 border border-hairline transition-colors",
                !inert && viewEntry.parent
                  ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                  : "cursor-default text-ink-3",
                FOCUS_RING,
              )}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1 text-[12px]">
              <AnimatePresence initial={false}>
                {shownCrumbs.map((entry, i) => {
                  const last = i === shownCrumbs.length - 1;
                  const afterGap = collapsed && i === 1;
                  return (
                    <motion.li
                      key={entry.node.id}
                      className="flex min-w-0 items-center gap-0.5"
                      initial={
                        live
                          ? motionSafe
                            ? { opacity: 0, x: -distances.step, scale: 0.92 }
                            : { opacity: 0 }
                          : false
                      }
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      {i > 0 ? (
                        <ChevronRight
                          aria-hidden
                          className="size-3 shrink-0 text-ink-3"
                        />
                      ) : null}
                      {afterGap && hiddenCrumb ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              jump(
                                hiddenCrumb.path,
                                `crumb:${hiddenCrumb.node.id}`,
                              )
                            }
                            aria-label={`${crumbs.length - 3} folders between, up to ${hiddenCrumb.node.name}`}
                            className={cn(
                              "rounded-1 px-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                              FOCUS_RING,
                            )}
                          >
                            &hellip;
                          </button>
                          <ChevronRight
                            aria-hidden
                            className="size-3 shrink-0 text-ink-3"
                          />
                        </>
                      ) : null}
                      {last ? (
                        <span
                          aria-current="location"
                          className="max-w-[12rem] truncate rounded-1 px-1 font-medium text-foreground"
                        >
                          {entry.node.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            jump(entry.path, `crumb:${entry.node.id}`)
                          }
                          aria-disabled={inert || undefined}
                          className={cn(
                            "max-w-[10rem] truncate rounded-1 px-1 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          {entry.node.name}
                        </button>
                      )}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          </nav>

          {chips.length > 0 ? (
            <div
              role="toolbar"
              aria-label="Starred and recent folders"
              className="flex flex-wrap items-center gap-1.5"
            >
              {chips.map((chip) => {
                const here = chip.entry.node.id === viewId;
                const shaking = shake?.id === chip.key;
                return (
                  <motion.button
                    key={chip.key}
                    ref={(node) => {
                      if (node) chipNodes.current.set(chip.key, node);
                      else chipNodes.current.delete(chip.key);
                    }}
                    type="button"
                    tabIndex={activeChipKey === chip.key ? 0 : -1}
                    aria-pressed={here}
                    aria-label={`${chip.entry.node.name}, ${chip.kind === "star" ? "starred" : "recent"}${here ? ", open" : ""}`}
                    aria-disabled={inert || undefined}
                    onFocus={() => setActiveChip(chip.key)}
                    onClick={() => jump(chip.entry.path, chip.key)}
                    onKeyDown={(event) => onChipKey(event, chip.key)}
                    animate={{
                      x: shaking && motionSafe ? [0, -5, 5, -3, 3, 0] : 0,
                    }}
                    transition={{
                      x: { duration: durations.slow, ease: easings.move },
                    }}
                    className={cn(
                      "inline-flex h-6 max-w-[11rem] items-center gap-1 rounded-full border px-2 text-[11px] whitespace-nowrap transition-colors duration-150",
                      here
                        ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
                        : "border-transparent bg-surface-2 text-ink-2 hover:text-foreground",
                      shaking &&
                        "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] text-danger",
                      inert ? "cursor-default" : "cursor-pointer",
                      FOCUS_RING,
                    )}
                  >
                    {chip.kind === "star" ? (
                      <Star
                        aria-hidden
                        className="size-3 shrink-0 fill-current/30"
                      />
                    ) : (
                      <Clock
                        aria-hidden
                        className="size-3 shrink-0 opacity-70"
                      />
                    )}
                    <span className="truncate">{chip.entry.node.name}</span>
                  </motion.button>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* -------------------------------- pane ----------------------------- */}
      <div className="relative min-h-0 flex-1 overflow-hidden border-t border-hairline bg-surface-0">
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The drive didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-1.5 px-3 py-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-2"
                style={{ height: d.row - 6 }}
              >
                <Pulse
                  className="size-4 rounded-1"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
                <Pulse
                  className="h-3.5"
                  style={{
                    width: `${34 + ((i * 17) % 30)}%`,
                    animationDelay: `${i * 90}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={viewId}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={
                motionSafe && slideStyle !== "fade"
                  ? {
                      ...springs.glide,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.base, ease: easings.enter }
              }
              style={{ zIndex: viewEntry.path.length }}
              className="absolute inset-0 flex flex-col bg-surface-0"
            >
              <ul
                ref={(node) => {
                  if (node) listNodes.current.set(viewId, node);
                  else listNodes.current.delete(viewId);
                }}
                role="listbox"
                aria-label={`${viewName}, ${viewLoad === "ready" ? viewWords : viewLoad}`}
                aria-describedby={hintId}
                aria-busy={viewLoad === "loading" || undefined}
                tabIndex={navIds.length === 0 || viewLoad !== "ready" ? 0 : -1}
                onKeyDown={onListKey}
                className={cn(
                  "flex h-full flex-col gap-px overflow-y-auto overscroll-contain py-1.5",
                  FOCUS_RING,
                  "focus-visible:-outline-offset-2",
                )}
              >
                <AnimatePresence initial={false}>
                  {composing ? (
                    <motion.li
                      key="composer"
                      role="presentation"
                      initial={
                        motionSafe ? { height: 0, opacity: 0 } : { opacity: 0 }
                      }
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{
                        height: motionSafe ? 0 : "auto",
                        opacity: 0,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.glide,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                      className="shrink-0 overflow-hidden"
                    >
                      <div
                        data-composer
                        className={cn(
                          "mx-1.5 flex items-center gap-2 rounded-2 border border-[color-mix(in_oklab,var(--accent-bright)_40%,transparent)] bg-card",
                          d.pad,
                          d.text,
                        )}
                        style={{ height: d.row }}
                      >
                        <FolderPlus
                          aria-hidden
                          className={cn(d.icon, "shrink-0 text-cobalt-bright")}
                        />
                        <input
                          ref={inputRef}
                          type="text"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              createFolder();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelComposer();
                            }
                          }}
                          aria-label={`New folder name in ${viewName}`}
                          spellCheck={false}
                          autoComplete="off"
                          className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-ink-3"
                          placeholder="Folder name"
                        />
                        <button
                          type="button"
                          onClick={createFolder}
                          className={cn(
                            "inline-flex h-6 shrink-0 items-center gap-1 rounded-1 bg-primary px-2 text-[11px] font-medium text-primary-foreground",
                            FOCUS_RING,
                          )}
                        >
                          <Check aria-hidden className="size-3" />
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={cancelComposer}
                          aria-label="Cancel new folder"
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          <X aria-hidden className="size-3.5" />
                        </button>
                      </div>
                    </motion.li>
                  ) : null}
                </AnimatePresence>

                {viewLoad === "loading" ? (
                  <li
                    role="presentation"
                    aria-hidden
                    className="flex flex-col gap-1.5 px-3 py-1"
                  >
                    {Array.from({ length: 5 }, (_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2"
                        style={{ height: d.row - 6 }}
                      >
                        <Pulse
                          className="size-4 rounded-1"
                          style={{ animationDelay: `${i * 90}ms` }}
                        />
                        <Pulse
                          className="h-3.5"
                          style={{
                            width: `${30 + ((i * 23) % 36)}%`,
                            animationDelay: `${i * 90}ms`,
                          }}
                        />
                      </div>
                    ))}
                  </li>
                ) : viewLoad === "error" ? (
                  <li
                    role="presentation"
                    className="flex flex-col items-center gap-3 px-6 py-8 text-center"
                  >
                    <TriangleAlert aria-hidden className="size-5 text-danger" />
                    <p className="text-sm text-foreground">
                      {viewName} didn&apos;t load.
                    </p>
                    <button
                      type="button"
                      onClick={retryFolder}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                        FOCUS_RING,
                      )}
                    >
                      <RotateCcw aria-hidden className="size-3.5" />
                      Retry
                    </button>
                  </li>
                ) : empty && !composing ? (
                  <li
                    role="presentation"
                    className="flex flex-col items-center gap-2 px-6 py-8 text-center"
                  >
                    <FolderOpen aria-hidden className="size-5 text-ink-3" />
                    <p className="text-sm text-ink-2">
                      {children.length === 0
                        ? "This folder is empty."
                        : `No folders here, ${fileCount} ${fileCount === 1 ? "file" : "files"} hidden.`}
                    </p>
                    <p className="text-[11px] text-ink-3">
                      The {itemsWords(items.length)} can still go here.
                    </p>
                  </li>
                ) : (
                  rows.map((node, i) => {
                    const sub =
                      node.kind === "folder" ? childrenOf(node, extra) : null;
                    const contents = sub
                      ? capitalise(contentsWords(sub))
                      : fmtSize(node.size);
                    const navigable = node.kind === "folder";
                    return (
                      <Row
                        key={node.id}
                        node={node}
                        contents={contents}
                        selected={node.id === selectedId}
                        moving={movingIds.has(node.id)}
                        navigable={navigable}
                        tabIndex={navigable && node.id === activeId ? 0 : -1}
                        index={i}
                        step={step}
                        enter={live}
                        landing={node.id === landed}
                        shaking={shake?.id === node.id}
                        motionSafe={motionSafe}
                        disabled={inert}
                        density={density}
                        modeWord={modeWord}
                        nodeRef={(el) => {
                          if (el) {
                            el.dataset.row = node.id;
                            rowNodes.current.set(node.id, el);
                          } else rowNodes.current.delete(node.id);
                        }}
                        onSelect={() => select(node.id)}
                        onEnter={() => enter(node.id)}
                        onFocus={() => setActiveRow(node.id)}
                      />
                    );
                  })
                )}
              </ul>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* -------------------------------- tray ----------------------------- */}
      <footer className="flex shrink-0 flex-col gap-2.5 border-t border-hairline px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="mr-1 shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {items.length === 0
              ? "Nothing selected"
              : modeWord === "Move"
                ? "Moving"
                : "Copying"}
          </span>
          {items.map((item) => (
            <span
              key={item.id}
              className="inline-flex h-6 max-w-[11rem] items-center gap-1 rounded-full border border-hairline px-2 text-[11px] text-ink-2"
            >
              {item.kind === "folder" ? (
                <Folder aria-hidden className="size-3 shrink-0" />
              ) : (
                <FileText aria-hidden className="size-3 shrink-0 opacity-70" />
              )}
              <span className="truncate">{item.name}</span>
              {item.size !== undefined ? (
                <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 @min-[40rem]:inline">
                  {fmtSize(item.size)}
                </span>
              ) : null}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-2 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between">
          <div className="relative min-w-0 flex-1">
            <AnimatePresence initial={false} mode="popLayout">
              {done ? (
                <motion.p
                  key={`done-${done.seq}`}
                  className="flex min-w-0 items-center gap-1.5 text-[13px] text-success"
                  initial={
                    motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 0 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <Tick motionSafe={motionSafe} className="size-4 shrink-0" />
                  <span className="truncate">{done.text}</span>
                </motion.p>
              ) : (
                <motion.div
                  key="sentence"
                  className="flex min-w-0 flex-col"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                >
                  {items.length === 0 ? (
                    <p className="text-[13px] text-ink-2">
                      Nothing to {currentMode}.
                    </p>
                  ) : sameFolder ? (
                    <p className="text-[13px] text-warn">
                      Already in{" "}
                      <strong className="font-semibold">
                        {dest.node.name}
                      </strong>
                      .
                    </p>
                  ) : (
                    <p className="truncate text-[13px] text-ink-2">
                      {destWords}
                    </p>
                  )}
                  <p className="truncate font-mono text-[10px] tracking-[0.04em] text-ink-3">
                    {dest.path
                      .map((id) => index.get(id)?.node.name)
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Action"
              className="relative grid h-8 w-36 grid-cols-2 rounded-2 bg-surface-2 p-0.5 text-xs"
            >
              <motion.span
                aria-hidden
                className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-[4px] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_18%,transparent)]"
                initial={false}
                animate={{ x: currentMode === "copy" ? "100%" : "0%" }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
              {MODES.map((m) => {
                const checked = currentMode === m.id;
                return (
                  <button
                    key={m.id}
                    ref={(node) => {
                      if (node) chipNodes.current.set(`mode:${m.id}`, node);
                      else chipNodes.current.delete(`mode:${m.id}`);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-disabled={inert || undefined}
                    tabIndex={checked ? 0 : -1}
                    onClick={() => setMode(m.id)}
                    onKeyDown={onModeKey}
                    className={cn(
                      "relative z-10 rounded-[4px] font-medium transition-colors duration-150",
                      checked
                        ? "text-foreground"
                        : "text-ink-3 hover:text-ink-2",
                      FOCUS_RING,
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <motion.button
              type="button"
              onClick={confirm}
              aria-disabled={!canConfirm || undefined}
              whileTap={canConfirm && motionSafe ? { scale: 0.97 } : undefined}
              transition={springs.flick}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3.5 text-xs font-medium transition-colors",
                canConfirm
                  ? "bg-primary text-primary-foreground"
                  : "cursor-default bg-surface-2 text-ink-3",
                FOCUS_RING,
              )}
            >
              {modeWord}
              <span className="sr-only">
                {" "}
                {itemsWords(items.length)} to {dest.node.name}
              </span>
            </motion.button>
          </div>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
