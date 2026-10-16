"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  Ban,
  Check,
  ChevronRight,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderKanban,
  FolderPlus,
  LoaderCircle,
  RotateCcw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
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

export type DestinationKind = "pdf" | "image" | "sheet" | "doc";

export type DestinationItem = {
  /** The file's name with its extension. */
  name: string;
  /** Picks the glyph on the chip. @default "doc" */
  kind?: DestinationKind;
  /** Shown beside the name in the listing, e.g. "1.4 MB". */
  size?: string;
};

export type DestinationFolder = {
  id: string;
  name: string;
  /** Files inside, shown at the row's end. */
  count?: number;
  /** Projects carry a different glyph and sit at the top level. */
  project?: boolean;
  /** Known children. Leave undefined with `hasChildren` to load them on expand. */
  children?: DestinationFolder[];
  /** The folder has children that are not loaded yet. */
  hasChildren?: boolean;
  /** Why nothing can be moved here. The row stays reachable and says so. */
  forbidden?: string;
};

export type DestinationChipStyle = "pill" | "tag" | "icon";
export type DestinationStatus = "ready" | "loading" | "error";

export type DestinationPickerProps = {
  /** The file being moved; it rides as the chip. @default defaultDestinationItem */
  item?: DestinationItem;
  /** The project tree. @default defaultDestinationFolders */
  folders?: DestinationFolder[];
  /** Folder ids offered as one-press destinations. @default defaultDestinationRecent */
  recent?: string[];
  /** Controlled destination: the folder the chip rests on. */
  value?: string | null;
  /** Initial destination when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the arrow key, press or type-ahead that changed the destination. */
  onValueChange?: (id: string | null) => void;
  /** Move was pressed (or Enter). Return a promise to hold the dialog until it lands. */
  onMove?: (folder: DestinationFolder, path: string[]) => void | Promise<void>;
  /** A new folder was named. Return the folder (or a promise of it) to add it to the tree. */
  onCreateFolder?: (
    parent: DestinationFolder,
    name: string,
  ) => DestinationFolder | Promise<DestinationFolder>;
  /** Loads the children of a folder that has `hasChildren` and no `children`. */
  onLoadChildren?: (folder: DestinationFolder) => Promise<DestinationFolder[]>;
  /** Controlled open state. */
  open?: boolean;
  /** Initial open state when uncontrolled. @default true */
  defaultOpen?: boolean;
  /** Fires when Move…, Cancel, the close button, the scrim, Escape or a finished move opens or closes it. */
  onOpenChange?: (open: boolean) => void;
  /** The folder the file is in now; moving there is refused. @default "inbox" */
  currentFolder?: string;
  /** Whether the tree has loaded. @default "ready" */
  status?: DestinationStatus;
  /** "Try again" was pressed after the tree failed to load. */
  onRetry?: () => void;
  /** How the riding file looks: a pill with its name, a folded tag, or just its glyph. @default "pill" */
  chipStyle?: DestinationChipStyle;
  /** The apex of the hop in px; 0 slides straight across. @default 20 */
  arcHeight?: number;
  /** The chip, the active row and Move, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The dialog's heading. @default "Move" */
  title?: string;
  /** Height of the frame in px; the tree scrolls inside the dialog. @default 540 */
  height?: number;
  /** Nothing can be moved or created. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultDestinationItem: DestinationItem = {
  name: "Pump curve – Rev C.pdf",
  kind: "pdf",
  size: "1.4 MB",
};

/** Fernworks' projects: two live ones, a read-only library and an archive. */
export const defaultDestinationFolders: DestinationFolder[] = [
  { id: "inbox", name: "Inbox", count: 6 },
  {
    id: "riverside",
    name: "Riverside upgrade",
    project: true,
    children: [
      {
        id: "rs-drawings",
        name: "Drawings",
        count: 14,
        children: [
          { id: "rs-pumps", name: "Pumps", count: 6 },
          { id: "rs-electrical", name: "Electrical", count: 8 },
        ],
      },
      { id: "rs-photos", name: "Site photos", count: 212 },
      { id: "rs-commissioning", name: "Commissioning", hasChildren: true },
      { id: "rs-handover", name: "Handover pack", count: 9 },
    ],
  },
  {
    id: "weir",
    name: "Weir survey",
    project: true,
    children: [
      { id: "weir-notes", name: "Field notes", count: 31 },
      { id: "weir-sonar", name: "Sonar passes", hasChildren: true },
    ],
  },
  {
    id: "curves",
    name: "Curve library",
    project: true,
    count: 48,
    forbidden: "Read only. The controls team keeps this library.",
  },
  {
    id: "archive",
    name: "Archive 2025",
    project: true,
    count: 304,
    forbidden: "Archived projects take no new files.",
  },
];

export const defaultDestinationRecent = [
  "rs-drawings",
  "rs-pumps",
  "weir-notes",
  "rs-handover",
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const KIND_ICON = {
  pdf: FileText,
  doc: FileText,
  image: FileImage,
  sheet: FileSpreadsheet,
} as const;

const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : "FILE";
};
const stemOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
};

const ROW_H = 32;

type Row =
  | {
      kind: "folder";
      id: string;
      folder: DestinationFolder;
      level: number;
      parent: string | null;
      setsize: number;
      posinset: number;
    }
  | {
      kind: "loading" | "failed" | "empty" | "new";
      id: string;
      level: number;
      parent: string;
    };

type Target = { id: string; where: "row" | "recent" | "result" } | null;

/* ----------------------------------------------------------------------- */
/*                                 The chip                                 */
/* ----------------------------------------------------------------------- */

function ChipFace({
  item,
  chipStyle,
  refused,
}: {
  item: DestinationItem;
  chipStyle: DestinationChipStyle;
  refused: boolean;
}) {
  const Icon = refused ? Ban : KIND_ICON[item.kind ?? "doc"];
  if (chipStyle === "icon") {
    return (
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full border transition-colors duration-150",
          refused
            ? "border-dashed border-ink-3 bg-surface-2 text-ink-3"
            : "border-transparent bg-[var(--dp-accent)] [color:var(--dp-on-accent)]",
        )}
      >
        <Icon className="size-4" />
      </span>
    );
  }
  if (chipStyle === "tag") {
    return (
      <span
        className={cn(
          "relative flex h-7 items-center gap-1.5 rounded-l-2 border py-0 pr-3.5 pl-2 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors duration-150 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,0_100%)]",
          refused
            ? "border-dashed border-ink-3 bg-surface-2 text-ink-3"
            : "border-[var(--dp-accent)] bg-[color-mix(in_oklab,var(--dp-accent)_16%,var(--popover))] text-foreground",
        )}
      >
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            refused ? "" : "[color:var(--dp-accent)]",
          )}
        />
        <span className="font-semibold">{extOf(item.name)}</span>
        <span
          aria-hidden
          className="absolute top-0 right-0 size-2 rounded-bl-1 bg-[color-mix(in_oklab,var(--dp-accent)_45%,var(--popover))]"
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex h-7 max-w-[7.5rem] items-center gap-1.5 rounded-full border pr-3 pl-2 text-[12px] font-medium transition-colors duration-150 @min-[30rem]:max-w-[11rem]",
        refused
          ? "border-dashed border-ink-3 bg-surface-2 text-ink-3"
          : "border-[var(--dp-accent)] bg-[color-mix(in_oklab,var(--dp-accent)_16%,var(--popover))] text-foreground",
      )}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          refused ? "" : "[color:var(--dp-accent)]",
        )}
      />
      <span className="truncate">{stemOf(item.name)}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

/**
 * A move dialog whose file rides along. The item sits as a chip in the
 * header; hover or arrow onto a destination and it hops there on a short arc —
 * one progress spring on `springs.snap` carries it in a straight line plus a
 * parabola of `arcHeight`, landing with a small settle in the row's end slot,
 * so the target is never in doubt. A hop interrupted by the next key leaves
 * from wherever the chip is, so fast arrowing reads as one fluid skip; the chip
 * follows its row while the tree scrolls and pins to the tree's edge when its
 * row leaves view. Over a refused folder it lands greyed with a ⊘ and the
 * reason opens under the row; Enter there shakes it on flick. Moving dives the
 * chip into the folder's glyph on glide before the dialog leaves on the exit
 * ease.
 *
 * The tree is a real treeview (one tab stop; Up and Down, Right opens or
 * enters, Left closes or climbs, Home and End, type-ahead, Enter moves);
 * branches open to their measured rows on glide and load lazily behind a
 * spinner row. Search turns the tree into a listbox of matching folders with
 * their paths. It is a modal dialog — the listing behind goes inert, Tab
 * wraps, Escape clears the search first and then closes — and in a narrow
 * container it becomes a full sheet. Under reduced motion the chip fades from
 * slot to slot without travelling; every reason and label still shows.
 */
export function DestinationPicker({
  item = defaultDestinationItem,
  folders = defaultDestinationFolders,
  recent = defaultDestinationRecent,
  value,
  defaultValue = null,
  onValueChange,
  onMove,
  onCreateFolder,
  onLoadChildren,
  open: openProp,
  defaultOpen = true,
  onOpenChange,
  currentFolder = "inbox",
  status = "ready",
  onRetry,
  chipStyle = "pill",
  arcHeight = 20,
  accent = "var(--accent-bright)",
  title = "Move",
  height = 540,
  disabled = false,
  className,
}: DestinationPickerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();

  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const open = openProp ?? ownOpen;
  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const selected = value === undefined ? own : value;

  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(["riverside"]),
  );
  const [loaded, setLoaded] = React.useState<
    Record<string, DestinationFolder[]>
  >({});
  const [loading, setLoading] = React.useState<Set<string>>(() => new Set());
  const [failed, setFailed] = React.useState<Set<string>>(() => new Set());
  const [extra, setExtra] = React.useState<Record<string, DestinationFolder[]>>(
    {},
  );
  const [creatingIn, setCreatingIn] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");
  const [createError, setCreateError] = React.useState("");
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<Target>(null);
  const [query, setQuery] = React.useState("");
  const [activeResult, setActiveResult] = React.useState(0);
  const [moving, setMoving] = React.useState(false);
  const [moveError, setMoveError] = React.useState("");
  const [moved, setMoved] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [readyNode, setReadyNode] = React.useState<HTMLElement | null>(null);
  const [dialogNode, setDialogNode] = React.useState<HTMLDivElement | null>(
    null,
  );
  // Ready once this dialog's chip has been measured: each opening starts
  // with the chip placed, never flown in from where the last one left it.
  const ready = readyNode !== null && readyNode === dialogNode;

  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const bindDialog = React.useCallback((node: HTMLDivElement | null) => {
    dialogRef.current = node;
    setDialogNode(node);
  }, []);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const homeRef = React.useRef<HTMLSpanElement | null>(null);
  const chipRef = React.useRef<HTMLDivElement | null>(null);
  const opener = React.useRef<HTMLButtonElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLElement | null>());
  const timers = React.useRef<number[]>([]);
  const typeahead = React.useRef({ text: "", at: 0 });
  const restoreFocus = React.useRef(false);

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  const shakeX = useMotionValue(0);
  const dest = React.useRef({ x: 0, y: 0 });
  const hopping = React.useRef<AnimationPlaybackControls | null>(null);
  const extras = React.useRef<AnimationPlaybackControls[]>([]);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      hopping.current?.stop();
      for (const c of extras.current) c.stop();
    },
    [],
  );

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /* ------------------------------ the tree ---------------------------- */

  const childrenOf = (
    f: DestinationFolder,
  ): DestinationFolder[] | undefined => {
    const base = f.children ?? loaded[f.id];
    const added = extra[f.id] ?? [];
    if (!base && f.hasChildren && added.length === 0) return undefined;
    return [...(base ?? []), ...added];
  };
  const hasKids = (f: DestinationFolder) =>
    Boolean(f.hasChildren) ||
    (f.children?.length ?? 0) > 0 ||
    (loaded[f.id]?.length ?? 0) > 0 ||
    (extra[f.id]?.length ?? 0) > 0;

  const index = new Map<
    string,
    { folder: DestinationFolder; parent: string | null; path: string[] }
  >();
  const walk = (
    list: DestinationFolder[],
    parent: string | null,
    path: string[],
  ) => {
    for (const f of list) {
      const p = [...path, f.name];
      index.set(f.id, { folder: f, parent, path: p });
      const kids = childrenOf(f);
      if (kids) walk(kids, f.id, p);
    }
  };
  walk(folders, null, []);

  const reasonOf = (f: DestinationFolder | undefined) =>
    !f
      ? undefined
      : (f.forbidden ??
        (f.id === currentFolder ? "The file is already here." : undefined));

  const rows: Row[] = [];
  const flatten = (
    list: DestinationFolder[],
    level: number,
    parent: string | null,
  ) => {
    list.forEach((f, i) => {
      rows.push({
        kind: "folder",
        id: f.id,
        folder: f,
        level,
        parent,
        setsize: list.length,
        posinset: i + 1,
      });
      if (!expanded.has(f.id)) return;
      if (creatingIn === f.id) {
        rows.push({
          kind: "new",
          id: `${f.id}::new`,
          level: level + 1,
          parent: f.id,
        });
      }
      const kids = childrenOf(f);
      if (kids === undefined) {
        rows.push({
          kind: failed.has(f.id) ? "failed" : "loading",
          id: `${f.id}::${failed.has(f.id) ? "failed" : "loading"}`,
          level: level + 1,
          parent: f.id,
        });
      } else if (kids.length === 0 && creatingIn !== f.id) {
        rows.push({
          kind: "empty",
          id: `${f.id}::empty`,
          level: level + 1,
          parent: f.id,
        });
      } else {
        flatten(kids, level + 1, f.id);
      }
    });
  };
  flatten(folders, 1, null);
  const folderRows = rows.filter(
    (r): r is Extract<Row, { kind: "folder" }> => r.kind === "folder",
  );

  const q = query.trim().toLowerCase();
  const results = q
    ? [...index.values()]
        .filter((e) => e.folder.name.toLowerCase().includes(q))
        .slice(0, 8)
    : [];
  const searching = q.length > 0;
  const activeIndex = Math.min(activeResult, Math.max(0, results.length - 1));
  const activeResultId = results[activeIndex]?.folder.id ?? null;

  const tabStop =
    (focusId && folderRows.some((r) => r.id === focusId) && focusId) ||
    (selected && folderRows.some((r) => r.id === selected) && selected) ||
    folderRows[0]?.id ||
    null;

  /* ------------------------------ targeting --------------------------- */

  const target: Target =
    hover ??
    (searching
      ? activeResultId
        ? { id: activeResultId, where: "result" }
        : null
      : selected
        ? { id: selected, where: "row" }
        : null);
  const targetFolder = target ? index.get(target.id)?.folder : undefined;
  const refused = Boolean(reasonOf(targetFolder));
  const targetKey = target ? `${target.where}:${target.id}` : "home";

  const targetRef = React.useRef<Target>(null);
  React.useLayoutEffect(() => {
    targetRef.current = target;
  });

  /** Where the chip should sit for the current target, in the dialog's frame. */
  const measure = React.useCallback((): { x: number; y: number } | null => {
    const box = dialogRef.current;
    const chip = chipRef.current;
    if (!box || !chip) return null;
    const b = box.getBoundingClientRect();
    const w = chip.offsetWidth;
    const h = chip.offsetHeight;
    const t = targetRef.current;
    const el = t
      ? box.querySelector<HTMLElement>(
          t.where === "recent"
            ? `[data-recent="${CSS.escape(t.id)}"]`
            : t.where === "result"
              ? `[data-result="${CSS.escape(t.id)}"]`
              : `[data-row="${CSS.escape(t.id)}"]`,
        )
      : homeRef.current;
    if (!el) {
      const home = homeRef.current?.getBoundingClientRect();
      return home
        ? { x: r2(home.left - b.left), y: r2(home.top - b.top) }
        : null;
    }
    const r = el.getBoundingClientRect();
    let px: number;
    let py = r.top - b.top + (r.height - h) / 2;
    if (!t) px = r.left - b.left;
    else if (t.where === "recent") px = r.left - b.left + (r.width - w) / 2;
    else px = r.right - b.left - w - 8;
    if (t && t.where !== "recent") {
      // Pinned to the tree's edge while its row is scrolled out of view.
      const s = scrollerRef.current?.getBoundingClientRect();
      if (s)
        py = Math.min(
          Math.max(py, s.top - b.top + 2),
          s.bottom - b.top - h - 2,
        );
    }
    return { x: r2(px), y: r2(py) };
  }, []);

  /** The chip goes to wherever its target now is, without a hop. */
  const follow = React.useCallback(() => {
    const at = measure();
    if (!at) return;
    dest.current = at;
    if (!hopping.current) {
      x.jump(at.x);
      y.jump(at.y);
    }
  }, [measure, x, y]);

  const hop = React.useCallback(() => {
    const to = measure();
    if (!to) return;
    dest.current = to;
    hopping.current?.stop();
    hopping.current = null;
    if (!motionSafe) {
      // Reduced motion: the chip leaves one slot and appears in the next.
      extras.current.push(animate(opacity, 0, { duration: durations.blink }));
      later(
        () => {
          x.jump(dest.current.x);
          y.jump(dest.current.y);
          extras.current.push(
            animate(opacity, 1, {
              duration: durations.fast,
              ease: easings.enter,
            }),
          );
        },
        Math.round(durations.blink * 1000),
      );
      return;
    }
    const from = { x: x.get(), y: y.get() };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 0.5) return;
    // Short hops stay low; a long one reaches the full apex.
    const apex = Math.min(Math.max(0, arcHeight), dist * 0.6);
    const run = animate(0, 1, {
      ...springs.snap,
      onUpdate: (p) => {
        const t = dest.current;
        x.set(r2(from.x + (t.x - from.x) * p));
        y.set(r2(from.y + (t.y - from.y) * p - apex * 4 * p * (1 - p)));
      },
      onComplete: () => {
        if (hopping.current === run) hopping.current = null;
        x.set(dest.current.x);
        y.set(dest.current.y);
      },
    });
    hopping.current = run;
  }, [arcHeight, measure, motionSafe, opacity, x, y]);

  // A new target is a hop; everything else (scroll, a branch opening, a
  // resize) is the chip keeping its place.
  React.useLayoutEffect(() => {
    if (!open || !ready) return;
    hop();
  }, [targetKey, open, ready, hop, chipStyle]);

  React.useEffect(() => {
    const box = dialogNode;
    const scroller = scrollerRef.current;
    if (!box) return;
    const ro = new ResizeObserver(() => {
      follow();
      setReadyNode(box);
    });
    ro.observe(box);
    const content = scroller?.firstElementChild;
    if (content) ro.observe(content);
    if (chipRef.current) ro.observe(chipRef.current);
    scroller?.addEventListener("scroll", follow, { passive: true });
    return () => {
      ro.disconnect();
      scroller?.removeEventListener("scroll", follow);
    };
  }, [dialogNode, follow, searching]);

  /* ------------------------------ focus ------------------------------- */

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    const node = rowRefs.current.get(id);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: "nearest" });
  };

  // Focus starts on the tree when the dialog arrives…
  React.useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      const box = dialogRef.current;
      const node = box?.querySelector<HTMLElement>(
        '[role="treeitem"][tabindex="0"]',
      );
      node?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // …and returns to the listing's Move button once it is no longer inert.
  React.useEffect(() => {
    if (open || !restoreFocus.current) return;
    restoreFocus.current = false;
    if (opener.current?.isConnected) opener.current.focus();
  }, [open]);

  const setOpen = (next: boolean) => {
    if (!next) restoreFocus.current = true;
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
    if (next) {
      setMoved(null);
      setMoveError("");
      // The chip starts whole for the next opening.
      scale.jump(1);
      opacity.jump(1);
    } else {
      setQuery("");
      setHover(null);
      setCreatingIn(null);
    }
  };

  /* ----------------------------- choosing ----------------------------- */

  const choose = (id: string | null, say = true) => {
    if (value === undefined) setOwn(id);
    setMoveError("");
    if (id !== selected) onValueChange?.(id);
    if (!say || !id) return;
    const f = index.get(id)?.folder;
    const reason = reasonOf(f);
    setAnnouncement(
      reason
        ? `${f?.name}: ${reason}`
        : `${f?.name}${f?.count !== undefined ? `, ${f.count} ${f.count === 1 ? "file" : "files"}` : ""}.`,
    );
  };

  const toggle = (f: DestinationFolder, to?: boolean) => {
    const isOpen = expanded.has(f.id);
    const next = to ?? !isOpen;
    if (next === isOpen) return;
    setExpanded((s) => {
      const n = new Set(s);
      if (next) n.add(f.id);
      else n.delete(f.id);
      return n;
    });
    if (
      next &&
      f.hasChildren &&
      !f.children &&
      !loaded[f.id] &&
      !loading.has(f.id)
    ) {
      load(f);
    }
  };

  const load = (f: DestinationFolder) => {
    if (!onLoadChildren) {
      setLoaded((l) => ({ ...l, [f.id]: [] }));
      return;
    }
    setLoading((s) => new Set(s).add(f.id));
    setFailed((s) => {
      const n = new Set(s);
      n.delete(f.id);
      return n;
    });
    setAnnouncement(`Loading ${f.name}.`);
    onLoadChildren(f).then(
      (kids) => {
        setLoaded((l) => ({ ...l, [f.id]: kids }));
        setLoading((s) => {
          const n = new Set(s);
          n.delete(f.id);
          return n;
        });
        setAnnouncement(
          `${f.name}: ${kids.length} ${kids.length === 1 ? "folder" : "folders"}.`,
        );
      },
      () => {
        setLoading((s) => {
          const n = new Set(s);
          n.delete(f.id);
          return n;
        });
        setFailed((s) => new Set(s).add(f.id));
        setAnnouncement(`${f.name} did not load.`);
      },
    );
  };

  const refuse = (reason: string, name: string) => {
    setAnnouncement(`Cannot move to ${name}. ${reason}`);
    if (!motionSafe) return;
    // A refusal is a short shake — out and back with one overshoot, never a
    // bounce that could read as a welcome.
    shakeX.jump(0);
    const run = animate(shakeX, 0, { ...springs.snap, velocity: 520 });
    extras.current.push(run);
  };

  const commitMove = (id: string | null) => {
    if (disabled || moving || !id) return;
    const entry = index.get(id);
    if (!entry) return;
    const reason = reasonOf(entry.folder);
    if (reason) {
      refuse(reason, entry.folder.name);
      return;
    }
    const finish = () => {
      setMoving(false);
      setMoved(entry.path.join(" / "));
      setAnnouncement(`Moved to ${entry.path.join(", ")}.`);
      const glyph = dialogRef.current?.querySelector<HTMLElement>(
        `[data-row="${CSS.escape(id)}"] [data-glyph], [data-result="${CSS.escape(id)}"] [data-glyph]`,
      );
      const box = dialogRef.current?.getBoundingClientRect();
      const chip = chipRef.current;
      if (motionSafe && glyph && box && chip) {
        // The dive: the chip sinks into the folder's glyph on glide.
        const g = glyph.getBoundingClientRect();
        hopping.current?.stop();
        hopping.current = null;
        const to = {
          x: r2(g.left - box.left + g.width / 2 - chip.offsetWidth / 2),
          y: r2(g.top - box.top + g.height / 2 - chip.offsetHeight / 2),
        };
        extras.current.push(
          animate(x, to.x, springs.glide),
          animate(y, to.y, springs.glide),
          animate(scale, 0.4, springs.glide),
          animate(opacity, 0, {
            duration: durations.base,
            ease: easings.exit,
            delay: 0.12,
          }),
        );
        later(() => setOpen(false), 380);
      } else {
        extras.current.push(animate(opacity, 0, { duration: durations.fast }));
        later(() => setOpen(false), 160);
      }
    };
    const result = onMove?.(entry.folder, entry.path);
    if (result && typeof (result as Promise<void>).then === "function") {
      setMoving(true);
      setAnnouncement(`Moving to ${entry.folder.name}.`);
      (result as Promise<void>).then(finish, (error: unknown) => {
        setMoving(false);
        const message =
          error instanceof Error && error.message
            ? error.message
            : "The move did not go through.";
        setMoveError(message);
        setAnnouncement(message);
      });
    } else {
      finish();
    }
  };

  const startFolder = () => {
    const parentId = selected ?? folderRows[0]?.id;
    const parent = parentId ? index.get(parentId)?.folder : undefined;
    if (!parent || disabled) return;
    if (reasonOf(parent) && parent.id !== currentFolder) {
      setCreateError(`Cannot add a folder here. ${reasonOf(parent)}`);
      return;
    }
    setCreateError("");
    setNewName("");
    setCreatingIn(parent.id);
    setExpanded((s) => new Set(s).add(parent.id));
    if (parent.hasChildren && !parent.children && !loaded[parent.id])
      load(parent);
  };

  const finishFolder = () => {
    const parent = creatingIn ? index.get(creatingIn)?.folder : undefined;
    const name = newName.trim();
    if (!parent) return;
    if (!name) {
      setCreateError("Give the folder a name.");
      return;
    }
    const siblings = childrenOf(parent) ?? [];
    if (siblings.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setCreateError(`${parent.name} already has a folder called ${name}.`);
      return;
    }
    const made =
      onCreateFolder?.(parent, name) ??
      ({
        id: `${parent.id}/${name.toLowerCase().replace(/\s+/g, "-")}`,
        name,
        count: 0,
      } as DestinationFolder);
    const place = (folder: DestinationFolder) => {
      setExtra((e) => ({
        ...e,
        [parent.id]: [...(e[parent.id] ?? []), folder],
      }));
      setCreatingIn(null);
      setCreateError("");
      choose(folder.id, false);
      setAnnouncement(`Created ${folder.name} in ${parent.name}.`);
      later(() => focusRow(folder.id), 0);
    };
    if (typeof (made as Promise<DestinationFolder>).then === "function") {
      (made as Promise<DestinationFolder>).then(place, () =>
        setCreateError("The folder was not created. Try again."),
      );
    } else place(made as DestinationFolder);
  };

  /* ----------------------------- keyboard ----------------------------- */

  const onTreeKey = (
    event: React.KeyboardEvent,
    row: Extract<Row, { kind: "folder" }>,
  ) => {
    const i = folderRows.findIndex((r) => r.id === row.id);
    const go = (r: (typeof folderRows)[number] | undefined) => {
      if (!r) return;
      focusRow(r.id);
      choose(r.id);
    };
    const f = row.folder;
    switch (event.key) {
      case "ArrowDown":
        go(folderRows[i + 1]);
        break;
      case "ArrowUp":
        go(folderRows[i - 1]);
        break;
      case "Home":
        go(folderRows[0]);
        break;
      case "End":
        go(folderRows[folderRows.length - 1]);
        break;
      case "ArrowRight":
        if (hasKids(f) && !expanded.has(f.id)) toggle(f, true);
        else if (expanded.has(f.id)) {
          const kid = folderRows[i + 1];
          if (kid && kid.parent === f.id) go(kid);
        }
        break;
      case "ArrowLeft":
        if (expanded.has(f.id)) toggle(f, false);
        else if (row.parent) go(folderRows.find((r) => r.id === row.parent));
        break;
      case "Enter":
        commitMove(row.id);
        break;
      default: {
        if (
          event.key.length !== 1 ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return;
        if (!/\S/.test(event.key)) return;
        // Type-ahead: letters typed close together build one prefix.
        const now = event.timeStamp;
        const t = typeahead.current;
        t.text =
          now - t.at < 700
            ? t.text + event.key.toLowerCase()
            : event.key.toLowerCase();
        t.at = now;
        const n = folderRows.length;
        const start = t.text.length > 1 ? i : i + 1;
        for (let k = 0; k < n; k++) {
          const r = folderRows[(start + k) % n];
          if (r?.folder.name.toLowerCase().startsWith(t.text)) {
            go(r);
            break;
          }
        }
      }
    }
    event.preventDefault();
  };

  const onSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!searching) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusRow(tabStop ?? undefined);
        }
        return;
      }
      event.preventDefault();
      const n = results.length;
      if (n === 0) return;
      setActiveResult(
        (((event.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1) % n) +
          n) %
          n,
      );
    } else if (event.key === "Enter" && searching) {
      event.preventDefault();
      if (activeResultId) {
        choose(activeResultId);
        commitMove(activeResultId);
      }
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    }
  };

  const onDialogKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== "Tab") return;
    const box = dialogRef.current;
    if (!box) return;
    const nodes = Array.from(
      box.querySelectorAll<HTMLElement>(TABBABLE),
    ).filter((n) => n.offsetParent !== null && n.tabIndex >= 0);
    const first = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    if (!first || !lastNode) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      lastNode.focus();
    } else if (!event.shiftKey && document.activeElement === lastNode) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ---------------------------- rendering ----------------------------- */

  const accentStyle = {
    "--dp-accent": accent,
    "--dp-on-accent": `oklch(from ${accent} clamp(0.18, (0.72 - l) * 100, 0.99) 0.01 h)`,
  } as React.CSSProperties;
  const selectedEntry = selected ? index.get(selected) : undefined;
  const selectedReason = reasonOf(selectedEntry?.folder);
  const ItemIcon = KIND_ICON[item.kind ?? "doc"];
  const recentFolders = recent
    .map((id) => index.get(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));
  const rowTransition = motionSafe
    ? { height: springs.glide, opacity: { duration: durations.fast } }
    : { duration: 0 };

  const renderRow = (row: Row) => {
    const pad = { paddingLeft: 8 + (row.level - 1) * 16 };
    if (row.kind !== "folder") {
      const parent = index.get(row.parent)?.folder;
      return (
        <motion.div
          key={row.id}
          role="none"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: row.kind === "new" ? "auto" : ROW_H, opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: exitFor(durations.fast) }}
          transition={rowTransition}
          className="overflow-clip [overflow-clip-margin:4px]"
        >
          {row.kind === "new" ? (
            <div className="flex flex-col gap-1 py-1 pr-2" style={pad}>
              <div className="flex items-center gap-2">
                <span className="w-4 shrink-0" />
                <FolderPlus
                  aria-hidden
                  className="size-4 shrink-0 [color:var(--dp-accent)]"
                />
                <input
                  autoFocus
                  value={newName}
                  aria-label={`New folder in ${parent?.name ?? "the folder"}`}
                  aria-invalid={createError ? true : undefined}
                  aria-describedby={
                    createError ? `${uid}-create-error` : undefined
                  }
                  placeholder="Folder name"
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    setNewName(text);
                    setCreateError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      finishFolder();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      event.stopPropagation();
                      setCreatingIn(null);
                      setCreateError("");
                      later(() => focusRow(parent?.id), 0);
                    }
                  }}
                  className="h-7 min-w-0 flex-1 rounded-2 border border-input bg-surface-0 px-2 text-[12px] text-foreground placeholder:text-ink-3 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
                />
              </div>
            </div>
          ) : (
            <div
              className="flex h-8 items-center gap-2 pr-2 text-[12px] text-ink-3"
              style={pad}
            >
              <span className="w-4 shrink-0" />
              {row.kind === "loading" ? (
                <>
                  <LoaderCircle
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0",
                      motionSafe && "animate-spin",
                    )}
                  />
                  <span>Loading {parent?.name}…</span>
                </>
              ) : row.kind === "failed" ? (
                <>
                  <TriangleAlert
                    aria-hidden
                    className="size-4 shrink-0 text-danger"
                  />
                  <span className="truncate">{parent?.name} did not load.</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => parent && load(parent)}
                    className={cn(
                      "ml-auto inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[11px] text-foreground hover:bg-surface-2",
                      FOCUS,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3" />
                    Retry
                  </button>
                </>
              ) : (
                <span className="italic">Empty</span>
              )}
            </div>
          )}
        </motion.div>
      );
    }
    const f = row.folder;
    const isOpen = expanded.has(f.id);
    const kids = hasKids(f);
    const reason = reasonOf(f);
    const isSelected = selected === f.id;
    const isTarget = target?.id === f.id && target.where === "row";
    const Glyph = f.project ? FolderKanban : Folder;
    return (
      <motion.div
        key={row.id}
        role="none"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0, transition: exitFor(durations.fast) }}
        transition={rowTransition}
        className="overflow-clip [overflow-clip-margin:4px]"
      >
        <div
          ref={(node) => {
            rowRefs.current.set(f.id, node);
          }}
          data-row={f.id}
          role="treeitem"
          aria-level={row.level}
          aria-setsize={row.setsize}
          aria-posinset={row.posinset}
          aria-expanded={kids ? isOpen : undefined}
          aria-selected={isSelected}
          aria-disabled={reason ? true : undefined}
          aria-describedby={reason && isSelected ? `${uid}-reason` : undefined}
          tabIndex={f.id === tabStop ? 0 : -1}
          onKeyDown={(event) => onTreeKey(event, row)}
          onFocus={() => setFocusId(f.id)}
          onClick={() => {
            focusRow(f.id);
            choose(f.id);
          }}
          onDoubleClick={() => commitMove(f.id)}
          onPointerEnter={() => setHover({ id: f.id, where: "row" })}
          onPointerLeave={() =>
            setHover((h) => (h?.id === f.id && h.where === "row" ? null : h))
          }
          className={cn(
            "relative mx-1 flex h-8 cursor-default items-center gap-2 rounded-2 pr-2 text-[13px] transition-colors select-none",
            FOCUS_IN,
            isSelected
              ? reason
                ? "bg-surface-2 text-ink-2"
                : "bg-[color-mix(in_oklab,var(--dp-accent)_12%,transparent)] text-foreground"
              : "text-foreground hover:bg-surface-2",
          )}
          style={{ paddingLeft: 4 + (row.level - 1) * 16 }}
        >
          <span
            aria-hidden
            onClick={(event) => {
              if (!kids) return;
              event.stopPropagation();
              toggle(f);
              focusRow(f.id);
            }}
            className={cn(
              "flex size-4 shrink-0 items-center justify-center text-ink-3",
              kids && "cursor-pointer hover:text-foreground",
            )}
          >
            {kids ? (
              <motion.span
                className="inline-flex"
                initial={false}
                animate={{ rotate: isOpen ? 90 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <ChevronRight className="size-3.5" />
              </motion.span>
            ) : null}
          </span>
          <motion.span
            data-glyph=""
            className={cn(
              "inline-flex shrink-0",
              reason
                ? "text-ink-3"
                : isSelected
                  ? "[color:var(--dp-accent)]"
                  : "text-ink-2",
            )}
            initial={false}
            animate={{ scale: moved && isSelected ? 1.18 : 1 }}
            transition={motionSafe ? springs.recoil : { duration: 0 }}
          >
            <Glyph aria-hidden className="size-4" />
          </motion.span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              f.project && "font-medium",
            )}
          >
            {f.name}
          </span>
          {reason ? (
            <Ban aria-hidden className="size-3.5 shrink-0 text-ink-3" />
          ) : null}
          <span
            aria-hidden
            className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums transition-opacity duration-150"
            style={{ opacity: isTarget ? 0 : 1 }}
          >
            {f.count ?? ""}
          </span>
        </div>
        <AnimatePresence initial={false}>
          {reason && isTarget ? (
            <motion.p
              key="why"
              id={isSelected ? `${uid}-reason` : undefined}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.fast),
              }}
              transition={rowTransition}
              onAnimationComplete={() => {
                // A reason reached by the keyboard is brought into view once
                // it has opened; one under a passing pointer is left alone.
                if (!isSelected || hover) return;
                const node = dialogRef.current?.querySelector(
                  `#${CSS.escape(`${uid}-reason`)}`,
                );
                node?.scrollIntoView({ block: "nearest" });
              }}
              className="overflow-hidden"
            >
              <span
                className="flex items-start gap-1.5 pt-0.5 pr-3 pb-1.5 text-[11px] leading-4 text-ink-2"
                style={{ paddingLeft: 30 + (row.level - 1) * 16 }}
              >
                {reason}
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <div
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{ height, ...accentStyle }}
    >
      {/* The listing the file lives in. */}
      <div inert={open} className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Fernworks / {index.get(currentFolder)?.folder.name ?? "Inbox"}
            </span>
            <span className="truncate text-sm font-semibold">
              {index.get(currentFolder)?.folder.name ?? "Inbox"}
            </span>
          </div>
          <button
            ref={opener}
            type="button"
            aria-haspopup="dialog"
            onClick={() => {
              if (!moved) setOpen(true);
            }}
            // Focus comes back here after a move, so it stays focusable and
            // says it is done rather than going dead.
            aria-disabled={moved ? true : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2 border border-input bg-surface-1 px-3 text-[13px] font-medium text-foreground transition-colors",
              FOCUS,
              moved ? "cursor-default text-ink-2" : "hover:bg-surface-2",
            )}
          >
            {moved ? (
              <Check aria-hidden className="size-4 text-success" />
            ) : (
              <FolderPlus aria-hidden className="size-4 text-ink-3" />
            )}
            {moved ? "Moved" : "Move…"}
          </button>
        </div>
        <ul role="list" className="flex flex-col px-2 py-2 text-[13px]">
          {[
            { name: item.name, size: item.size ?? "", mine: true },
            { name: "Valve schedule.xlsx", size: "88 KB", mine: false },
            { name: "Site walk – 9 Oct.jpg", size: "3.1 MB", mine: false },
            { name: "Crane lift plan.pdf", size: "640 KB", mine: false },
          ].map((row) => (
            <li
              key={row.name}
              className={cn(
                "flex h-10 items-center gap-3 rounded-2 px-2",
                row.mine && !moved && "bg-surface-2",
              )}
            >
              {row.mine && moved ? (
                <Check aria-hidden className="size-4 shrink-0 text-success" />
              ) : (
                <ItemIcon aria-hidden className="size-4 shrink-0 text-ink-3" />
              )}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  row.mine && moved && "text-ink-3",
                )}
              >
                {row.mine && moved ? `Moved to ${moved}` : row.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                {row.mine && moved ? "" : row.size}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Open on arrival, the dialog is simply there: the first frame —
          server-rendered included — shows it, not an empty scrim. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="overlay"
            className="absolute inset-0 z-20 flex items-stretch justify-center @min-[30rem]:items-center @min-[30rem]:p-4"
          >
            <motion.div
              aria-hidden
              className="absolute inset-0 bg-background/70"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            />
            <motion.div
              ref={bindDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${uid}-title`}
              aria-describedby={`${uid}-item`}
              onKeyDown={onDialogKey}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={
                motionSafe
                  ? { y: springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="relative flex w-full flex-col overflow-hidden bg-popover text-popover-foreground shadow-raised @min-[30rem]:h-full @min-[30rem]:max-h-[34rem] @min-[30rem]:w-[28rem] @min-[30rem]:rounded-4 @min-[30rem]:border @min-[30rem]:border-hairline-strong"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h2 id={`${uid}-title`} className="text-sm font-semibold">
                    {title}
                  </h2>
                  <p
                    id={`${uid}-item`}
                    className="flex min-w-0 items-center gap-2 text-[12px] text-ink-3"
                  >
                    <span className="shrink-0">Moving</span>
                    <span ref={homeRef} className="relative inline-flex">
                      <span
                        aria-hidden
                        className={cn(
                          "transition-opacity duration-150",
                          ready && "opacity-0",
                        )}
                      >
                        <ChipFace
                          item={item}
                          chipStyle={chipStyle}
                          refused={false}
                        />
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "pointer-events-none absolute inset-0 rounded-full border border-dashed border-hairline-strong transition-opacity duration-150",
                          chipStyle === "tag" && "rounded-2",
                          ready && target ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </span>
                    <span className="sr-only">{item.name}</span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className={cn(
                    "-mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </div>

              <div className="flex shrink-0 flex-col gap-2 px-4 pb-2">
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3"
                  />
                  <input
                    type="text"
                    role="combobox"
                    aria-label="Search Fernworks projects"
                    aria-expanded={searching}
                    aria-controls={`${uid}-results`}
                    aria-autocomplete="list"
                    aria-activedescendant={
                      searching && activeResultId
                        ? `${uid}-r-${activeResultId}`
                        : undefined
                    }
                    value={query}
                    placeholder="Search Fernworks projects"
                    onChange={(event) => {
                      const text = event.currentTarget.value;
                      setQuery(text);
                      setActiveResult(0);
                      setHover(null);
                    }}
                    onKeyDown={onSearchKey}
                    className="h-9 w-full rounded-2 border border-input bg-surface-0 pr-2 pl-8 text-[13px] text-foreground placeholder:text-ink-3 focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid"
                  />
                </div>
                {recentFolders.length > 0 && !searching ? (
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      Recent
                    </span>
                    <div
                      role="group"
                      aria-label="Recent destinations"
                      className="flex min-w-0 flex-1 [scrollbar-width:none] gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]"
                    >
                      {recentFolders.map((e) => (
                        <button
                          key={e.folder.id}
                          type="button"
                          data-recent={e.folder.id}
                          aria-pressed={selected === e.folder.id}
                          title={e.path.join(" / ")}
                          onClick={() => {
                            choose(e.folder.id);
                            // Reveal it in the tree, opening its parents.
                            const chain: string[] = [];
                            let p = index.get(e.folder.id)?.parent ?? null;
                            while (p) {
                              chain.push(p);
                              p = index.get(p)?.parent ?? null;
                            }
                            setExpanded((s) => {
                              const n = new Set(s);
                              for (const c of chain) n.add(c);
                              return n;
                            });
                          }}
                          onPointerEnter={() =>
                            setHover({ id: e.folder.id, where: "recent" })
                          }
                          onPointerLeave={() =>
                            setHover((h) =>
                              h?.id === e.folder.id && h.where === "recent"
                                ? null
                                : h,
                            )
                          }
                          className={cn(
                            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
                            FOCUS_IN,
                            selected === e.folder.id
                              ? "border-[var(--dp-accent)] text-foreground"
                              : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
                          )}
                        >
                          <Folder aria-hidden className="size-3.5 shrink-0" />
                          {e.folder.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div
                ref={scrollerRef}
                className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-y border-hairline"
              >
                <div className="py-1">
                  {status === "loading" ? (
                    <div
                      aria-busy="true"
                      className="flex flex-col gap-2 px-3 py-2"
                    >
                      <p className="sr-only">Loading projects.</p>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          aria-hidden
                          className="h-6 rounded-2 bg-surface-2"
                          style={{
                            width: `${70 - i * 8}%`,
                            marginLeft: (i % 3) * 16,
                          }}
                        />
                      ))}
                    </div>
                  ) : status === "error" ? (
                    <div className="flex flex-col items-start gap-2 px-4 py-4">
                      <p className="flex items-center gap-1.5 text-[13px] text-foreground">
                        <TriangleAlert
                          aria-hidden
                          className="size-4 shrink-0 text-danger"
                        />
                        Projects did not load.
                      </p>
                      {onRetry ? (
                        <button
                          type="button"
                          onClick={onRetry}
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-input px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-2",
                            FOCUS,
                          )}
                        >
                          <RotateCcw aria-hidden className="size-3.5" />
                          Try again
                        </button>
                      ) : null}
                    </div>
                  ) : searching ? (
                    results.length > 0 ? (
                      <ul
                        id={`${uid}-results`}
                        role="listbox"
                        aria-label="Matching folders"
                        className="flex flex-col"
                      >
                        {results.map((e, i) => {
                          const reason = reasonOf(e.folder);
                          const isActive = i === activeIndex;
                          return (
                            <li
                              key={e.folder.id}
                              id={`${uid}-r-${e.folder.id}`}
                              data-result={e.folder.id}
                              role="option"
                              aria-selected={isActive}
                              aria-disabled={reason ? true : undefined}
                              onPointerDown={(ev) => ev.preventDefault()}
                              onPointerEnter={() => setActiveResult(i)}
                              onClick={() => {
                                choose(e.folder.id);
                                commitMove(e.folder.id);
                              }}
                              className={cn(
                                "mx-1 flex cursor-default items-center gap-2 rounded-2 py-1.5 pr-2 pl-3",
                                isActive &&
                                  "bg-[color-mix(in_oklab,var(--dp-accent)_12%,transparent)]",
                              )}
                            >
                              <span
                                data-glyph=""
                                className="inline-flex shrink-0 text-ink-2"
                              >
                                {reason ? (
                                  <Ban
                                    aria-hidden
                                    className="size-4 text-ink-3"
                                  />
                                ) : (
                                  <Folder aria-hidden className="size-4" />
                                )}
                              </span>
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-[13px] leading-5 text-foreground">
                                  {e.folder.name}
                                </span>
                                <span className="truncate text-[11px] leading-4 text-ink-3">
                                  {reason ??
                                    e.path.slice(0, -1).join(" / ") ??
                                    ""}
                                </span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="px-4 py-6 text-center text-[12px] text-ink-3">
                        No folder called “{query.trim()}”.
                      </p>
                    )
                  ) : (
                    <div
                      role="tree"
                      aria-label="Fernworks projects"
                      aria-describedby={`${uid}-hint`}
                    >
                      <AnimatePresence initial={false}>
                        {rows.map((row) => renderRow(row))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-2 px-4 py-3">
                {moveError || createError ? (
                  <p
                    role="alert"
                    id={`${uid}-create-error`}
                    className="flex items-start gap-1.5 text-[11px] leading-4 text-danger"
                  >
                    <TriangleAlert
                      aria-hidden
                      className="mt-px size-3.5 shrink-0"
                    />
                    {moveError || createError}
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={startFolder}
                    aria-disabled={disabled || !selectedEntry || undefined}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-2 px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    <FolderPlus aria-hidden className="size-4" />
                    New folder
                  </button>
                  <button
                    type="button"
                    onClick={() => commitMove(selected)}
                    aria-disabled={
                      disabled ||
                      !selectedEntry ||
                      Boolean(selectedReason) ||
                      moving ||
                      undefined
                    }
                    aria-busy={moving || undefined}
                    aria-describedby={
                      selectedReason ? `${uid}-reason` : undefined
                    }
                    className={cn(
                      "inline-flex h-9 min-w-0 items-center gap-1.5 rounded-2 px-4 text-[13px] font-medium transition-colors",
                      FOCUS,
                      selectedEntry && !selectedReason && !disabled
                        ? "bg-[var(--dp-accent)] [color:var(--dp-on-accent)] hover:opacity-90"
                        : "border border-input text-ink-3",
                    )}
                  >
                    {moving ? (
                      <LoaderCircle
                        aria-hidden
                        className={cn(
                          "size-4 shrink-0",
                          motionSafe && "animate-spin",
                        )}
                      />
                    ) : null}
                    <span className="truncate">
                      {moving
                        ? "Moving…"
                        : selectedEntry
                          ? `Move to ${selectedEntry.folder.name}`
                          : "Choose a folder"}
                    </span>
                  </button>
                </div>
              </div>

              {/* The riding chip: one shape for the whole dialog, above it all. */}
              <motion.div
                ref={chipRef}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 z-30"
                style={{
                  x,
                  y,
                  scale,
                  opacity: ready ? opacity : 0,
                }}
              >
                <motion.div style={{ x: shakeX }}>
                  <ChipFace
                    item={item}
                    chipStyle={chipStyle}
                    refused={refused}
                  />
                </motion.div>
              </motion.div>

              <p id={`${uid}-hint`} className="sr-only">
                Arrow keys move between folders, Right opens and Left closes,
                letters jump, Enter moves the file.
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
