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
import {
  Ban,
  Check,
  ChevronRight,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SpringFoldersAccent = "cobalt" | "plum" | "mint" | "ink";
export type SpringRingStyle = "circle" | "outline" | "fill";
export type SpringFoldersStatus = "ready" | "loading" | "error";
export type SpringDocType = "pdf" | "doc" | "sheet" | "image";

export type SpringFolder = {
  id: string;
  name: string;
  /** Documents already filed here. */
  count: number;
  children?: SpringFolder[];
  /** The types it takes: a list, or "none" for a read-only folder. @default every type */
  accepts?: SpringDocType[] | "none";
};

export type SpringDoc = {
  id: string;
  name: string;
  type: SpringDocType;
  /** Size in bytes. */
  size: number;
};

export type SpringFoldersHandle = {
  /** Plays the gesture once without a hand: a document glides over a folder, its ring closes, it springs open, and everything goes back. */
  hint: (docId?: string, folderId?: string) => void;
};

export type SpringFoldersProps = {
  ref?: React.Ref<SpringFoldersHandle>;
  /** Controlled folder tree. */
  folders?: SpringFolder[];
  /** Initial tree when uncontrolled. @default defaultSpringFolders */
  defaultFolders?: SpringFolder[];
  /** Controlled unfiled documents. */
  docs?: SpringDoc[];
  /** Initial documents when uncontrolled. @default defaultSpringDocs */
  defaultDocs?: SpringDoc[];
  /** Documents were filed into a folder, by a drop or Move to. */
  onDrop?: (docIds: string[], folderId: string) => void;
  /** A folder opened: sprung by a held drag, pressed, or by a key. */
  onOpen?: (folderId: string, via: "spring" | "click" | "key") => void;
  /** New folder was pressed; in uncontrolled mode the folder is added as shown. */
  onCreateFolder?: (parentId: string, folder: SpringFolder) => void;
  /** Folders open at the start. @default ["suppliers"] */
  defaultExpanded?: string[];
  /** How long a held drag takes to spring a folder open, in ms. @default 700 */
  springDelay?: number;
  /** The spring-loading ring: round the folder icon, an outline round the row, or the row filling. @default "circle" */
  ringStyle?: SpringRingStyle;
  /** Ring, selection and drop targets. A name or any CSS colour. @default "cobalt" */
  accent?: SpringFoldersAccent | (string & {});
  /** Whether the tree has arrived. @default "ready" */
  status?: SpringFoldersStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The tree's heading. @default "Basinworks contracts" */
  title?: string;
  /** The page's heading. @default "Unfiled" */
  pageTitle?: string;
  /** The frame's height in px. @default 520 */
  frameHeight?: number;
  /** Read only: nothing can be moved or created. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** The Basinworks contract archive. */
export const defaultSpringFolders: SpringFolder[] = [
  {
    id: "suppliers",
    name: "Suppliers",
    count: 12,
    children: [
      {
        id: "harbour",
        name: "Harbour Freight",
        count: 5,
        children: [
          { id: "hf-2025", name: "2025", count: 3 },
          { id: "hf-2026", name: "2026", count: 2 },
        ],
      },
      { id: "millrace", name: "Millrace Steel", count: 4 },
    ],
  },
  {
    id: "customers",
    name: "Customers",
    count: 9,
    children: [
      { id: "tidewater", name: "Tidewater Foods", count: 6 },
      { id: "kestrel", name: "Kestrel Labs", count: 3 },
    ],
  },
  { id: "signed", name: "Signed", count: 23, accepts: ["pdf"] },
  { id: "templates", name: "Templates", count: 7, accepts: ["doc"] },
  { id: "archive", name: "Archive 2024", count: 41, accepts: "none" },
];

export const defaultSpringDocs: SpringDoc[] = [
  {
    id: "msa",
    name: "Harbour Freight MSA renewal.pdf",
    type: "pdf",
    size: 2_516_582,
  },
  { id: "nda", name: "Millrace NDA draft.docx", type: "doc", size: 184_320 },
  { id: "rates", name: "Q4 rate card.xlsx", type: "sheet", size: 96_256 },
  { id: "sow", name: "Kestrel SOW v2.pdf", type: "pdf", size: 1_153_434 },
  {
    id: "photos",
    name: "Dock 4 site photo.jpg",
    type: "image",
    size: 4_718_592,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<SpringFoldersAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const TYPES: Record<
  SpringDocType,
  { label: string; plural: string; icon: typeof FileText; tint: string }
> = {
  pdf: {
    label: "PDF",
    plural: "PDFs",
    icon: FileText,
    tint: "oklch(0.6 0.15 28)",
  },
  doc: {
    label: "Word",
    plural: "Word documents",
    icon: FileText,
    tint: "oklch(0.58 0.14 262)",
  },
  sheet: {
    label: "Sheet",
    plural: "spreadsheets",
    icon: FileSpreadsheet,
    tint: "oklch(0.6 0.12 155)",
  },
  image: {
    label: "Image",
    plural: "images",
    icon: FileImage,
    tint: "oklch(0.6 0.13 320)",
  },
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const ROW_H = 32;
const INDENT = 14;
const HANDLE_H = 44;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const sizeLabel = (bytes: number) =>
  bytes >= 1_048_576
    ? `${Math.round((bytes / 1_048_576) * 10) / 10} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

type Flat = {
  folder: SpringFolder;
  level: number;
  parent: string | null;
  /** Ancestor ids, root first. */
  path: string[];
  index: number;
  siblings: number;
};

const flatten = (folders: SpringFolder[]): Map<string, Flat> => {
  const out = new Map<string, Flat>();
  const walk = (
    list: SpringFolder[],
    level: number,
    parent: string | null,
    path: string[],
  ) => {
    list.forEach((folder, index) => {
      out.set(folder.id, {
        folder,
        level,
        parent,
        path,
        index,
        siblings: list.length,
      });
      if (folder.children)
        walk(folder.children, level + 1, folder.id, [...path, folder.id]);
    });
  };
  walk(folders, 1, null, []);
  return out;
};

/** The ids a person can see now, in reading order. */
const visibleIds = (folders: SpringFolder[], expanded: Set<string>) => {
  const out: string[] = [];
  const walk = (list: SpringFolder[]) => {
    for (const f of list) {
      out.push(f.id);
      if (f.children && expanded.has(f.id)) walk(f.children);
    }
  };
  walk(folders);
  return out;
};

/** Why a folder refuses these types, or null when it takes them. */
const refusal = (folder: SpringFolder, types: SpringDocType[]) => {
  const a = folder.accepts;
  if (a === undefined || types.length === 0) return null;
  if (a === "none") return `${folder.name} is read-only.`;
  const bad = types.find((t) => !a.includes(t));
  if (!bad) return null;
  const takes = a.map((t) => TYPES[t].plural).join(" and ");
  return `${folder.name} takes ${takes} only.`;
};

const mapFolders = (
  list: SpringFolder[],
  fn: (f: SpringFolder) => SpringFolder,
): SpringFolder[] =>
  list.map((f) => {
    const next = fn(f);
    return next.children
      ? { ...next, children: mapFolders(next.children, fn) }
      : next;
  });

/* ----------------------------------------------------------------------- */
/*                                Folder row                                */
/* ----------------------------------------------------------------------- */

type RowState = "idle" | "ok" | "refuse" | "dim";

function FolderRow({
  flat,
  variant,
  expanded,
  selected,
  tabbable,
  state,
  armed,
  springDelay,
  ringStyle,
  motionSafe,
  disabledReason,
  bump,
  onSpring,
  onPress,
  onKey,
  onFocusRow,
}: {
  flat: Flat;
  variant: "side" | "sheet" | "dialog";
  expanded: boolean;
  selected: boolean;
  tabbable: boolean;
  state: RowState;
  armed: boolean;
  springDelay: number;
  ringStyle: SpringRingStyle;
  motionSafe: boolean;
  disabledReason: string | null;
  bump: number;
  onSpring: (id: string) => void;
  onPress: (id: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onFocusRow: (id: string) => void;
}) {
  const { folder, level } = flat;
  const hasKids = (folder.children?.length ?? 0) > 0;
  const charge = useMotionValue(0);
  const ringO = useMotionValue(0);
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState({ w: 200, h: ROW_H });

  // The ring is a timer you can read: linear over springDelay while armed,
  // gone in 120ms when the drag moves on. When it closes it flashes and the
  // folder springs open.
  React.useEffect(() => {
    const running: AnimationPlaybackControls[] = [];
    if (armed) {
      const node = rowRef.current;
      if (node) {
        const r = node.getBoundingClientRect();
        if (r.width > 0)
          window.setTimeout(
            () => setBox({ w: r2(r.width), h: r2(r.height) }),
            0,
          );
      }
      ringO.set(1);
      const left = Math.max(0.05, (springDelay / 1000) * (1 - charge.get()));
      running.push(
        animate(charge.get(), 1, {
          duration: left,
          ease: easings.linear,
          onUpdate: (v) => charge.set(r3(v)),
          onComplete: () => {
            onSpring(folder.id);
            running.push(
              animate(1, 0, {
                duration: motionSafe ? 0.32 : durations.fast,
                ease: easings.enter,
                onUpdate: (v) => ringO.set(r3(v)),
              }),
            );
          },
        }),
      );
    } else if (charge.get() > 0) {
      running.push(
        animate(charge.get(), 0, {
          duration: 0.12,
          ease: easings.exit,
          onUpdate: (v) => charge.set(r3(v)),
        }),
      );
    }
    return () => {
      for (const c of running) c.stop();
    };
    // The ring keys on being armed; the callback identity may change freely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, springDelay, motionSafe]);

  // A filed document bumps the count on recoil.
  const badge = useMotionValue(1);
  const seenBump = React.useRef(bump);
  React.useEffect(() => {
    if (bump === seenBump.current) return;
    seenBump.current = bump;
    if (!motionSafe) return;
    badge.jump(1.35);
    const ctrl = animate(1.35, 1, {
      ...springs.recoil,
      onUpdate: (v) => badge.set(r3(v)),
    });
    return () => ctrl.stop();
  }, [bump, motionSafe, badge]);

  const ok = state === "ok";
  const refuse = state === "refuse";
  const Icon = ok || (expanded && hasKids) ? FolderOpen : Folder;
  const label = `${folder.name}, ${plural(folder.count, "document")}${disabledReason ? `. ${disabledReason}` : ""}`;
  const perimeter = r2(2 * (box.w - 2 + box.h - 2));
  const outlineOffset = useDashOffset(charge, perimeter);
  const circleOffset = useDashOffset(charge, 69.12);

  return (
    <div
      ref={rowRef}
      role="treeitem"
      data-sf-folder={folder.id}
      data-sf-tree={variant}
      aria-level={level}
      aria-posinset={flat.index + 1}
      aria-setsize={flat.siblings}
      aria-expanded={hasKids ? expanded : undefined}
      aria-selected={selected}
      aria-disabled={disabledReason ? true : undefined}
      aria-label={label}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onPress(folder.id)}
      onKeyDown={(event) => onKey(event, folder.id)}
      onFocus={() => onFocusRow(folder.id)}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-2 pr-2 text-[13px] transition-[background-color,opacity] duration-150 select-none",
        ok
          ? "bg-[color-mix(in_oklab,var(--sf-ink)_14%,transparent)] text-foreground"
          : refuse
            ? "cursor-not-allowed bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-ink-2"
            : selected
              ? "bg-[var(--sf-wash)] text-foreground"
              : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
        state === "dim" && "opacity-45",
        disabledReason && variant === "dialog" && "text-ink-3",
        FOCUS_IN,
      )}
      style={{ height: ROW_H, paddingLeft: 4 + (level - 1) * INDENT }}
    >
      {ringStyle === "fill" ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 origin-left rounded-2 bg-[color-mix(in_oklab,var(--sf-ink)_22%,transparent)]"
          style={{ scaleX: charge, opacity: ringO }}
        />
      ) : ringStyle === "outline" ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={box.w}
          height={box.h}
        >
          <motion.rect
            x={1}
            y={1}
            width={Math.max(0, box.w - 2)}
            height={Math.max(0, box.h - 2)}
            rx={7}
            fill="none"
            strokeWidth={1.5}
            className="stroke-[var(--sf-ink)]"
            style={{
              opacity: ringO,
              strokeDasharray: `${perimeter} ${perimeter}`,
              strokeDashoffset: outlineOffset,
            }}
          />
        </svg>
      ) : null}
      <span
        aria-hidden
        className={cn(
          "relative inline-flex size-4 shrink-0 items-center justify-center text-ink-3",
          !hasKids && "invisible",
        )}
      >
        <motion.span
          className="inline-flex"
          initial={false}
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        >
          <ChevronRight className="size-3.5" />
        </motion.span>
      </span>
      <span
        aria-hidden
        className="relative inline-flex size-6 shrink-0 items-center justify-center"
      >
        {ringStyle === "circle" ? (
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            className="absolute inset-0 -rotate-90 overflow-visible"
          >
            <motion.circle
              cx={12}
              cy={12}
              r={11}
              fill="none"
              strokeWidth={1.75}
              strokeLinecap="round"
              className="stroke-[var(--sf-ink)]"
              style={{
                opacity: ringO,
                strokeDasharray: "69.12 69.12",
                strokeDashoffset: circleOffset,
              }}
            />
          </svg>
        ) : null}
        <Icon
          className={cn(
            "size-4",
            ok || selected ? "text-[var(--sf-ink)]" : "text-ink-3",
          )}
        />
      </span>
      <span className="relative min-w-0 flex-1 truncate" title={folder.name}>
        {folder.name}
      </span>
      {refuse || (variant === "dialog" && disabledReason) ? (
        <Ban aria-hidden className="relative size-3.5 shrink-0 text-danger" />
      ) : (
        <motion.span
          aria-hidden
          className="relative grid shrink-0 font-mono text-[11px] text-ink-3 tabular-nums"
          style={{ scale: badge }}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={folder.count}
              className="text-right [grid-area:1/1]"
              initial={{ opacity: 0, y: motionSafe ? 6 : 0 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: motionSafe ? springs.snap : { duration: 0 },
              }}
              exit={{
                opacity: 0,
                y: motionSafe ? -6 : 0,
                transition: exitFor(durations.fast),
              }}
            >
              {folder.count}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      )}
    </div>
  );
}

/** A dash offset that empties as `charge` fills: 1 is a closed ring. */
function useDashOffset(charge: MotionValue<number>, length: number) {
  const offset = useMotionValue(r2(length));
  React.useEffect(() => {
    offset.set(r2(length * (1 - charge.get())));
    return charge.on("change", (v) => offset.set(r2(length * (1 - v))));
  }, [charge, length, offset]);
  return offset;
}

/* ----------------------------------------------------------------------- */
/*                                   Tree                                   */
/* ----------------------------------------------------------------------- */

type TreeProps = {
  variant: "side" | "sheet" | "dialog";
  folders: SpringFolder[];
  flat: Map<string, Flat>;
  expanded: Set<string>;
  selected: string | null;
  active: string | null;
  hover: { id: string; ok: boolean } | null;
  dragTypes: SpringDocType[] | null;
  springDelay: number;
  ringStyle: SpringRingStyle;
  motionSafe: boolean;
  bumps: Record<string, number>;
  label: string;
  onSpring: (id: string) => void;
  onPress: (id: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onFocusRow: (id: string) => void;
};

function Tree(props: TreeProps) {
  const { folders, label } = props;
  return (
    <div role="tree" aria-label={label} className="flex flex-col gap-px">
      <Branch {...props} list={folders} depth={0} />
    </div>
  );
}

function Branch({
  list,
  depth,
  ...p
}: TreeProps & { list: SpringFolder[]; depth: number }) {
  const step = cascade(list.length);
  return (
    <>
      {list.map((folder, i) => {
        const flat = p.flat.get(folder.id);
        if (!flat) return null;
        const open = p.expanded.has(folder.id);
        const kids = folder.children ?? [];
        const why = p.dragTypes ? refusal(folder, p.dragTypes) : null;
        const isHover = p.hover?.id === folder.id;
        const state: RowState = isHover
          ? p.hover?.ok
            ? "ok"
            : "refuse"
          : p.dragTypes && why && p.variant !== "dialog"
            ? "dim"
            : "idle";
        return (
          <div key={folder.id} role="none" className="flex flex-col gap-px">
            <motion.div
              role="none"
              initial={
                depth > 0 && p.motionSafe ? { opacity: 0, y: -4 } : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: depth > 0 ? i * step : 0,
                },
                y: { ...springs.glide, delay: depth > 0 ? i * step : 0 },
              }}
            >
              <FolderRow
                flat={flat}
                variant={p.variant}
                expanded={open}
                selected={p.selected === folder.id}
                tabbable={p.active === folder.id}
                state={state}
                armed={
                  isHover &&
                  !!p.hover?.ok &&
                  kids.length > 0 &&
                  !open &&
                  p.variant !== "dialog"
                }
                springDelay={p.springDelay}
                ringStyle={p.ringStyle}
                motionSafe={p.motionSafe}
                disabledReason={p.variant === "dialog" ? why : null}
                bump={p.bumps[folder.id] ?? 0}
                onSpring={p.onSpring}
                onPress={p.onPress}
                onKey={p.onKey}
                onFocusRow={p.onFocusRow}
              />
            </motion.div>
            <AnimatePresence initial={false}>
              {open && kids.length > 0 ? (
                <motion.div
                  key="kids"
                  role="none"
                  className="flex flex-col gap-px overflow-hidden"
                  initial={{ height: 0, opacity: p.motionSafe ? 1 : 0 }}
                  animate={{
                    height: "auto",
                    opacity: 1,
                    transition: p.motionSafe
                      ? springs.glide
                      : { duration: durations.fast },
                  }}
                  exit={{
                    height: 0,
                    opacity: p.motionSafe ? 1 : 0,
                    transition: exitFor(durations.base),
                  }}
                >
                  <Branch {...p} list={kids} depth={depth + 1} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Ghost = {
  ids: string[];
  name: string;
  type: SpringDocType;
  /** Where it goes home to, relative to the frame. */
  home: { x: number; y: number };
};

/**
 * A folder sidebar that works as a drop target. Dragging documents from the
 * page lifts a ghost that follows the pointer 1:1; holding it over a closed
 * folder starts a ring that closes over `springDelay` ms (a linear timer you
 * can read), then flashes as the folder springs open on `snap`, its
 * subfolders unfolding on `glide` — so you keep descending without letting
 * go. Dropping files the documents: the ghost shrinks into the folder, the
 * count rolls and bumps on `recoil`, the cards fold out of the page on glide,
 * and folders sprung open on the way that are not on the path fold shut.
 *
 * Folders that refuse a type tint and show a ban glyph. Every card has Move
 * to (M), which opens the same tree in a dialog; under 300px the tree is a
 * sheet that rises when a drag starts. Under reduced motion the ghost still
 * follows the pointer and the ring still fills, but folders open at once and
 * the drop fades instead of flying.
 */
export function SpringFolders({
  ref,
  folders: foldersProp,
  defaultFolders = defaultSpringFolders,
  docs: docsProp,
  defaultDocs = defaultSpringDocs,
  onDrop,
  onOpen,
  onCreateFolder,
  defaultExpanded = ["suppliers"],
  springDelay = 700,
  ringStyle = "circle",
  accent = "cobalt",
  status = "ready",
  onRetry,
  title = "Basinworks contracts",
  pageTitle = "Unfiled",
  frameHeight = 520,
  disabled = false,
  className,
}: SpringFoldersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const dialogTitleId = `${uid}-dlg`;
  const hintId = `${uid}-hint`;

  const [ownFolders, setOwnFolders] = React.useState(defaultFolders);
  const folders = foldersProp ?? ownFolders;
  const [ownDocs, setOwnDocs] = React.useState(defaultDocs);
  const docs = docsProp ?? ownDocs;
  const flat = React.useMemo(() => flatten(folders), [folders]);

  const [expanded, setExpanded] = React.useState(
    () => new Set(defaultExpanded),
  );
  const [selectedFolder, setSelectedFolder] = React.useState<string | null>(
    null,
  );
  const [activeFolder, setActiveFolder] = React.useState<string | null>(
    folders[0]?.id ?? null,
  );
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set());
  const [activeDoc, setActiveDoc] = React.useState<string | null>(
    docs[0]?.id ?? null,
  );
  const [bumps, setBumps] = React.useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = React.useState("");
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [created, setCreated] = React.useState(0);

  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const sideScroll = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
    };
  }, []);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /* -------------------------------- ghost -------------------------------- */

  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gs = useMotionValue(1);
  const go = useMotionValue(0);
  const gr = useMotionValue(0);
  const ghostAnims = React.useRef<AnimationPlaybackControls[]>([]);
  const [ghost, setGhost] = React.useState<Ghost | null>(null);
  const [dragIds, setDragIds] = React.useState<string[] | null>(null);
  const [hover, setHover] = React.useState<{ id: string; ok: boolean } | null>(
    null,
  );
  /** Folders sprung open during this drag, to fold back afterwards. */
  const sprung = React.useRef<Set<string>>(new Set());

  const stopGhost = () => {
    for (const c of ghostAnims.current) c.stop();
    ghostAnims.current = [];
  };

  const frameRect = () => frameRef.current?.getBoundingClientRect() ?? null;

  /** A point inside the frame for an element's centre (or top-left). */
  const pointOf = (el: Element | null | undefined, corner = false) => {
    const f = frameRect();
    const r = el?.getBoundingClientRect();
    if (!f || !r || r.width === 0) return null;
    return corner
      ? { x: r2(r.left - f.left), y: r2(r.top - f.top) }
      : {
          x: r2(r.left - f.left + r.width / 2),
          y: r2(r.top - f.top + r.height / 2),
        };
  };

  const cardEl = (id: string) =>
    frameRef.current?.querySelector<HTMLElement>(
      `[data-sf-card="${CSS.escape(id)}"]`,
    ) ?? null;

  /** The folder row to aim at: the folder itself if shown, else its nearest shown ancestor, else the sheet handle. */
  const targetEl = (folderId: string) => {
    const f = flat.get(folderId);
    const chain = f ? [folderId, ...[...f.path].reverse()] : [folderId];
    for (const id of chain) {
      for (const el of frameRef.current?.querySelectorAll<HTMLElement>(
        `[data-sf-folder="${CSS.escape(id)}"]`,
      ) ?? []) {
        if (el.dataset.sfTree === "dialog") continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
      }
    }
    return frameRef.current?.querySelector<HTMLElement>("[data-sf-handle]");
  };

  /* -------------------------------- filing ------------------------------- */

  const fileInto = (
    ids: string[],
    folderId: string,
    from: "ghost" | "card",
  ) => {
    const folder = flat.get(folderId)?.folder;
    if (!folder || ids.length === 0) return;
    const moving = docs.filter((d) => ids.includes(d.id));
    if (moving.length === 0) return;
    const aim = pointOf(targetEl(folderId) ?? null);
    const first = moving[0];

    // The ghost: already in the air after a drag, or lifted off the card.
    if (from === "card" && first) {
      const start = pointOf(cardEl(first.id), true);
      if (start) {
        stopGhost();
        gx.jump(start.x);
        gy.jump(start.y);
        gs.jump(1);
        go.jump(1);
        gr.jump(0);
        setGhost({
          ids,
          name: first.name,
          type: first.type,
          home: start,
        });
      }
    }
    if (aim) {
      stopGhost();
      const tx = aim.x - 18;
      const ty = aim.y - 18;
      if (motionSafe) {
        ghostAnims.current = [
          animate(gx.get(), tx, {
            ...springs.glide,
            velocity: gx.getVelocity(),
            onUpdate: (v) => gx.set(r2(v)),
          }),
          animate(gy.get(), ty, {
            ...springs.glide,
            velocity: gy.getVelocity(),
            onUpdate: (v) => gy.set(r2(v)),
          }),
          animate(gs.get(), 0.3, {
            duration: 0.34,
            ease: easings.enter,
            onUpdate: (v) => gs.set(r3(v)),
          }),
          animate(go.get(), 0, {
            duration: 0.34,
            ease: easings.exit,
            onUpdate: (v) => go.set(r3(v)),
            onComplete: () => setGhost(null),
          }),
        ];
      } else {
        ghostAnims.current = [
          animate(go.get(), 0, {
            duration: durations.fast,
            onUpdate: (v) => go.set(r3(v)),
            onComplete: () => setGhost(null),
          }),
        ];
      }
    } else {
      setGhost(null);
    }

    // The cards fold out now; the count bumps as the ghost arrives.
    const left = docs.filter((d) => !ids.includes(d.id));
    if (docsProp === undefined) setOwnDocs(left);
    setPicked(new Set());
    if (activeDoc && ids.includes(activeDoc)) setActiveDoc(left[0]?.id ?? null);
    onDrop?.(ids, folderId);
    const f = flat.get(folderId);
    const where = [...(f?.path ?? []), folderId]
      .slice(-2)
      .map((id) => flat.get(id)?.folder.name ?? "")
      .join(" / ");
    setAnnouncement(`Filed ${plural(ids.length, "document")} in ${where}.`);
    later(motionSafe ? 300 : 0, () => {
      if (foldersProp === undefined) {
        setOwnFolders((list) =>
          mapFolders(list, (x) =>
            x.id === folderId ? { ...x, count: x.count + ids.length } : x,
          ),
        );
      }
      setBumps((b) => ({ ...b, [folderId]: (b[folderId] ?? 0) + 1 }));
    });
    // Folders sprung open on the way, but not on the path, fold back.
    const keep = new Set([...(f?.path ?? []), folderId]);
    const fold = [...sprung.current].filter((id) => !keep.has(id));
    sprung.current = new Set();
    if (fold.length) {
      later(520, () =>
        setExpanded((cur) => {
          const next = new Set(cur);
          for (const id of fold) next.delete(id);
          return next;
        }),
      );
    }
    later(700, () => setSheetOpen(false));
  };

  const sendHome = () => {
    const g = ghost;
    setHover(null);
    if (!g) {
      setDragIds(null);
      return;
    }
    stopGhost();
    const done = () => {
      setGhost(null);
      setDragIds(null);
    };
    if (motionSafe) {
      ghostAnims.current = [
        animate(gx.get(), g.home.x, {
          ...springs.glide,
          velocity: gx.getVelocity(),
          onUpdate: (v) => gx.set(r2(v)),
        }),
        animate(gy.get(), g.home.y, {
          ...springs.glide,
          velocity: gy.getVelocity(),
          onUpdate: (v) => gy.set(r2(v)),
          onComplete: () => {
            ghostAnims.current.push(
              animate(go.get(), 0, {
                duration: durations.fast,
                ease: easings.exit,
                onUpdate: (v) => go.set(r3(v)),
                onComplete: done,
              }),
            );
          },
        }),
        animate(gr.get(), 0, {
          ...springs.flick,
          onUpdate: (v) => gr.set(r2(v)),
        }),
      ];
    } else {
      ghostAnims.current = [
        animate(go.get(), 0, {
          duration: durations.fast,
          onUpdate: (v) => go.set(r3(v)),
          onComplete: done,
        }),
      ];
    }
    // Sprung folders fold back when nothing was filed.
    const fold = [...sprung.current];
    sprung.current = new Set();
    if (fold.length) {
      later(420, () =>
        setExpanded((cur) => {
          const next = new Set(cur);
          for (const id of fold) next.delete(id);
          return next;
        }),
      );
    }
    later(500, () => setSheetOpen(false));
  };

  /* ------------------------------ spring open ---------------------------- */

  const springOpen = (id: string) => {
    if (expanded.has(id)) return;
    sprung.current.add(id);
    setExpanded((cur) => new Set(cur).add(id));
    onOpen?.(id, "spring");
    const name = flat.get(id)?.folder.name ?? "Folder";
    setAnnouncement(`${name} opened.`);
  };

  /* --------------------------------- drag -------------------------------- */

  const grab = React.useRef<{
    id: string;
    ids: string[];
    offset: { x: number; y: number };
    live: boolean;
    cancelled: boolean;
  } | null>(null);
  const lastHover = React.useRef<string | null>(null);
  /** A drag's release is followed by a click on the card; it must not pick. */
  const dragged = React.useRef(false);

  const typesOf = (ids: string[]) => [
    ...new Set(docs.filter((d) => ids.includes(d.id)).map((d) => d.type)),
  ];

  const hitFolder = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest<HTMLElement>("[data-sf-folder]");
    if (!row || !frameRef.current?.contains(row)) return null;
    if (row.dataset.sfTree === "dialog") return null;
    return row.dataset.sfFolder ?? null;
  };

  const drag = useDrag({
    threshold: 4,
    disabled: disabled || status !== "ready",
    onStart: ({ point }) => {
      const g = grab.current;
      const f = frameRect();
      if (!g || !f) return;
      g.live = true;
      const doc = docs.find((d) => d.id === g.id);
      if (!doc) return;
      const card = pointOf(cardEl(g.id), true) ?? {
        x: point.x - f.left,
        y: point.y - f.top,
      };
      stopGhost();
      gx.jump(r2(point.x - f.left - g.offset.x));
      gy.jump(r2(point.y - f.top - g.offset.y));
      gs.jump(motionSafe ? 0.94 : 1);
      go.jump(1);
      gr.jump(0);
      if (motionSafe) {
        ghostAnims.current = [
          animate(0.94, 1, {
            ...springs.flick,
            onUpdate: (v) => gs.set(r3(v)),
          }),
          animate(0, -2, { ...springs.flick, onUpdate: (v) => gr.set(r2(v)) }),
        ];
      }
      setGhost({
        ids: g.ids,
        name: doc.name,
        type: doc.type,
        home: card,
      });
      setDragIds(g.ids);
      setSheetOpen(true);
      sprung.current = new Set();
      lastHover.current = null;
    },
    onMove: ({ point }) => {
      const g = grab.current;
      const f = frameRect();
      if (!g?.live || g.cancelled || !f) return;
      gx.set(r2(point.x - f.left - g.offset.x));
      gy.set(r2(point.y - f.top - g.offset.y));
      // The tree scrolls when the ghost rests near its edge.
      const sc = sideScroll.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (point.x >= r.left && point.x <= r.right) {
          if (point.y < r.top + 28) sc.scrollTop -= 6;
          else if (point.y > r.bottom - 28) sc.scrollTop += 6;
        }
      }
      const id = hitFolder(point.x, point.y);
      if (id === lastHover.current) return;
      lastHover.current = id;
      if (!id) {
        setHover(null);
        return;
      }
      const folder = flat.get(id)?.folder;
      const why = folder ? refusal(folder, typesOf(g.ids)) : null;
      setHover({ id, ok: !why });
    },
    onEnd: () => {
      const g = grab.current;
      grab.current = null;
      if (g?.live) dragged.current = true;
      if (!g?.live || g.cancelled) return;
      const h = hover;
      setHover(null);
      if (h?.ok) {
        setDragIds(null);
        fileInto(g.ids, h.id, "ghost");
      } else {
        if (h) {
          const folder = flat.get(h.id)?.folder;
          const why = folder ? refusal(folder, typesOf(g.ids)) : null;
          if (why) setAnnouncement(why);
        } else setAnnouncement("Not filed.");
        sendHome();
      }
    },
    onCancel: () => {
      const g = grab.current;
      grab.current = null;
      if (g?.live) dragged.current = true;
      if (g?.live && !g.cancelled) sendHome();
    },
  });

  const sendHomeRef = React.useRef(sendHome);
  React.useEffect(() => {
    sendHomeRef.current = sendHome;
  });

  // Escape drops a live drag where it began.
  React.useEffect(() => {
    if (!dragIds) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const g = grab.current;
      if (!g?.live) return;
      event.preventDefault();
      g.cancelled = true;
      setAnnouncement("Move cancelled.");
      sendHomeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dragIds]);

  /* ------------------------------ tree keys ------------------------------ */

  const toggle = (id: string, via: "click" | "key") => {
    const f = flat.get(id)?.folder;
    if (!f?.children?.length) return;
    const opening = !expanded.has(id);
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (opening) onOpen?.(id, via);
  };

  const focusFolder = (scope: HTMLElement | null, id: string | undefined) => {
    if (!id || !scope) return;
    setActiveFolder(id);
    scope
      .querySelector<HTMLElement>(`[data-sf-folder="${CSS.escape(id)}"]`)
      ?.focus({ preventScroll: true });
  };

  const onTreeKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
    onChoose: (id: string) => void,
  ) => {
    if (disabled) return;
    const scope = event.currentTarget.closest<HTMLElement>('[role="tree"]');
    const order = visibleIds(folders, expanded);
    const i = order.indexOf(id);
    const f = flat.get(id);
    const kids = f?.folder.children ?? [];
    let to: string | undefined;
    if (event.key === "ArrowDown")
      to = order[Math.min(order.length - 1, i + 1)];
    else if (event.key === "ArrowUp") to = order[Math.max(0, i - 1)];
    else if (event.key === "Home") to = order[0];
    else if (event.key === "End") to = order[order.length - 1];
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (kids.length && !expanded.has(id)) toggle(id, "key");
      else if (kids[0]) focusFolder(scope, kids[0].id);
      return;
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (kids.length && expanded.has(id)) toggle(id, "key");
      else if (f?.parent) focusFolder(scope, f.parent);
      return;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onChoose(id);
      return;
    }
    if (to) {
      event.preventDefault();
      focusFolder(scope, to);
    }
  };

  /* --------------------------------- cards ------------------------------- */

  const togglePick = (id: string) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [moveFor, setMoveFor] = React.useState<string[] | null>(null);
  const moveOrigin = React.useRef<HTMLElement | null>(null);

  const openMove = (id: string) => {
    if (disabled || status !== "ready") return;
    const ids = picked.has(id) ? [...picked] : [id];
    const active = document.activeElement;
    moveOrigin.current = active instanceof HTMLElement ? active : null;
    setMoveFor(ids);
    setSheetOpen(false);
  };

  const closeMove = (restore: boolean) => {
    setMoveFor(null);
    if (!restore) return;
    const back = moveOrigin.current;
    window.requestAnimationFrame(() => {
      if (back?.isConnected) back.focus({ preventScroll: true });
      else
        frameRef.current
          ?.querySelector<HTMLElement>("[data-sf-page-title]")
          ?.focus({ preventScroll: true });
    });
  };

  const onCardKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (disabled) return;
    const i = docs.findIndex((d) => d.id === id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      to = Math.min(docs.length - 1, i + 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      to = Math.max(0, i - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = docs.length - 1;
    if (to >= 0) {
      event.preventDefault();
      const next = docs[to];
      if (next) {
        setActiveDoc(next.id);
        cardEl(next.id)
          ?.querySelector<HTMLElement>("[data-sf-main]")
          ?.focus({ preventScroll: true });
      }
      return;
    }
    if (
      (event.key === "m" || event.key === "M") &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      openMove(id);
    }
  };

  /* ------------------------------ new folder ----------------------------- */

  const createFolder = (parentId: string | null) => {
    if (disabled) return;
    const parent = parentId ?? folders[0]?.id ?? null;
    if (!parent) return;
    const siblings = flat.get(parent)?.folder.children ?? [];
    let name = "New folder";
    let n = 2;
    while (siblings.some((s) => s.name === name)) name = `New folder ${n++}`;
    const folder: SpringFolder = {
      id: `${uid}-nf-${created + 1}`,
      name,
      count: 0,
    };
    setCreated((c) => c + 1);
    if (foldersProp === undefined) {
      setOwnFolders((list) =>
        mapFolders(list, (x) =>
          x.id === parent
            ? { ...x, children: [...(x.children ?? []), folder] }
            : x,
        ),
      );
    }
    setExpanded((cur) => new Set(cur).add(parent));
    setActiveFolder(folder.id);
    onCreateFolder?.(parent, folder);
    setAnnouncement(
      `${name} added in ${flat.get(parent)?.folder.name ?? "the tree"}.`,
    );
  };

  /* --------------------------------- hint -------------------------------- */

  React.useImperativeHandle(ref, () => ({
    hint: (docId, folderId) => {
      const doc = docs.find((d) => d.id === docId) ?? docs[0];
      const target =
        flat.get(folderId ?? "")?.folder ??
        folders.find(
          (f) => (f.children?.length ?? 0) > 0 && !expanded.has(f.id),
        ) ??
        null;
      if (!doc || !target || ghost || dragIds) return;
      const start = pointOf(cardEl(doc.id), true);
      const aim = pointOf(targetEl(target.id) ?? null);
      if (!start || !aim) return;
      stopGhost();
      gx.jump(start.x);
      gy.jump(start.y);
      gs.jump(1);
      go.jump(motionSafe ? 1 : 0);
      gr.jump(0);
      setGhost({ ids: [doc.id], name: doc.name, type: doc.type, home: start });
      setDragIds([doc.id]);
      const tx = aim.x - 6;
      const ty = aim.y + 6;
      if (motionSafe) {
        ghostAnims.current = [
          animate(start.x, tx, {
            ...springs.drift,
            onUpdate: (v) => gx.set(r2(v)),
          }),
          animate(start.y, ty, {
            ...springs.drift,
            onUpdate: (v) => gy.set(r2(v)),
          }),
          animate(0, -2, { ...springs.flick, onUpdate: (v) => gr.set(r2(v)) }),
        ];
      } else {
        gx.jump(tx);
        gy.jump(ty);
        ghostAnims.current = [
          animate(0, 1, {
            duration: durations.base,
            onUpdate: (v) => go.set(r3(v)),
          }),
        ];
      }
      later(motionSafe ? 650 : 200, () =>
        setHover({ id: target.id, ok: !refusal(target, [doc.type]) }),
      );
      // Held, sprung, then everything goes home.
      later((motionSafe ? 650 : 200) + springDelay + 900, () => {
        setHover(null);
        sendHomeRef.current();
      });
    },
  }));

  /* -------------------------------- render ------------------------------- */

  const accentInk = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as SpringFoldersAccent]
    : accent;
  const dragTypes = dragIds ? typesOf(dragIds) : null;
  const tabbableFolder =
    activeFolder && flat.has(activeFolder)
      ? activeFolder
      : (folders[0]?.id ?? null);
  const tabbableDoc =
    activeDoc && docs.some((d) => d.id === activeDoc)
      ? activeDoc
      : (docs[0]?.id ?? null);
  const sheetH = Math.round(frameHeight * 0.66);
  const moveDocs = moveFor ? docs.filter((d) => moveFor.includes(d.id)) : [];
  const moveTypes = [...new Set(moveDocs.map((d) => d.type))];

  const treeProps = {
    folders,
    flat,
    expanded,
    selected: selectedFolder,
    active: tabbableFolder,
    hover,
    dragTypes,
    springDelay,
    ringStyle,
    motionSafe,
    bumps,
    onSpring: springOpen,
    onFocusRow: setActiveFolder,
  };

  const pressSide = (id: string) => {
    if (disabled) return;
    setActiveFolder(id);
    setSelectedFolder(id);
    toggle(id, "click");
  };

  const treeBody =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-1 px-2 py-1">
        <span className="sr-only">Loading folders</span>
        {[60, 72, 48, 64, 40].map((w, i) => (
          <span
            key={i}
            aria-hidden
            className="flex items-center gap-2 px-2"
            style={{ height: ROW_H, paddingLeft: 8 + (i % 2) * INDENT }}
          >
            <span className="size-4 shrink-0 rounded-1 bg-surface-2" />
            <span
              className="h-2.5 rounded-full bg-surface-2"
              style={{ width: `${w}%` }}
            />
          </span>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-start gap-2 px-3 py-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
          Couldn’t load folders
        </span>
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
            Retry
          </button>
        ) : null}
      </div>
    ) : null;

  const page = (
    <section
      aria-labelledby={`${uid}-page`}
      className="flex min-w-0 flex-1 flex-col overflow-hidden @[300px]:flex-none @[300px]:border-t @[300px]:border-hairline @[34rem]:flex-1 @[34rem]:border-t-0"
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-hairline px-3.5 @[300px]:h-10 @[300px]:border-b-0 @[34rem]:h-12 @[34rem]:border-b">
        <h3
          id={`${uid}-page`}
          tabIndex={-1}
          data-sf-page-title=""
          className="flex min-w-0 items-baseline gap-1.5 text-[14px] font-semibold outline-none"
        >
          <span className="truncate">{pageTitle}</span>
          <span className="font-mono text-[11px] font-normal text-ink-3 tabular-nums">
            {docs.length}
          </span>
        </h3>
        <span className="truncate font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
          {picked.size > 0 ? `${picked.size} picked` : "Drag to file"}
        </span>
      </div>
      {/* A list on a phone, a tray to pull up from at card width, a grid
          beside the tree when there is room. */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-2.5 pb-14 @[300px]:flex-none @[300px]:overflow-x-auto @[300px]:overflow-y-hidden @[300px]:[mask-image:linear-gradient(to_right,black_88%,transparent)] @[300px]:pt-0 @[300px]:pb-2.5 @[34rem]:flex-1 @[34rem]:overflow-x-hidden @[34rem]:overflow-y-auto @[34rem]:[mask-image:none] @[34rem]:pt-2.5">
        {docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <span
              aria-hidden
              className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--sf-wash)] text-[var(--sf-ink)]"
            >
              <Check className="size-5" />
            </span>
            <p className="text-[13px] font-medium">Everything is filed</p>
            <p className="text-[12px] text-ink-3">
              New contracts land here first.
            </p>
          </div>
        ) : (
          <ul
            role="list"
            aria-describedby={hintId}
            className="relative grid grid-cols-1 gap-2 @[300px]:flex @[300px]:w-max @[34rem]:grid @[34rem]:w-auto @[40rem]:grid-cols-2"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {docs.map((d) => {
                const t = TYPES[d.type];
                const Icon = t.icon;
                const isPicked = picked.has(d.id);
                const lifted = !!dragIds?.includes(d.id);
                return (
                  <motion.li
                    key={d.id}
                    layout={motionSafe ? "position" : false}
                    data-sf-card={d.id}
                    className="relative @[300px]:w-[150px] @[34rem]:w-auto"
                    initial={false}
                    animate={{ opacity: lifted ? 0.38 : 1, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: motionSafe ? 0.92 : 1,
                      transition: exitFor(durations.base),
                    }}
                    transition={{
                      layout: springs.glide,
                      opacity: { duration: durations.fast },
                    }}
                  >
                    <button
                      type="button"
                      data-sf-main=""
                      aria-pressed={isPicked}
                      aria-label={`${d.name}, ${t.label}, ${sizeLabel(d.size)}`}
                      aria-keyshortcuts="M"
                      tabIndex={d.id === tabbableDoc ? 0 : -1}
                      disabled={disabled}
                      onPointerDown={(event) => {
                        dragged.current = false;
                        grab.current = {
                          id: d.id,
                          ids: picked.has(d.id) ? [...picked] : [d.id],
                          // The ghost rides below-right of the pointer, so
                          // the folder under it and its ring stay in view.
                          offset: { x: -14, y: -12 },
                          live: false,
                          cancelled: false,
                        };
                        drag.onPointerDown(event);
                      }}
                      onPointerMove={drag.onPointerMove}
                      onPointerUp={drag.onPointerUp}
                      onPointerCancel={drag.onPointerCancel}
                      onLostPointerCapture={drag.onLostPointerCapture}
                      onClick={() => {
                        if (dragged.current) {
                          dragged.current = false;
                          return;
                        }
                        setActiveDoc(d.id);
                        togglePick(d.id);
                      }}
                      onFocus={() => setActiveDoc(d.id)}
                      onKeyDown={(event) => onCardKey(event, d.id)}
                      className={cn(
                        "flex w-full touch-pan-y items-center gap-2.5 rounded-3 border bg-card py-2 pr-11 pl-2.5 text-left transition-[border-color,box-shadow] duration-150 select-none",
                        "@[300px]:h-[104px] @[300px]:touch-pan-x @[300px]:flex-col @[300px]:items-start @[300px]:gap-1.5 @[300px]:pr-2.5",
                        "@[34rem]:h-auto @[34rem]:touch-pan-y @[34rem]:flex-row @[34rem]:items-center @[34rem]:gap-2.5 @[34rem]:pr-11",
                        isPicked
                          ? "border-[var(--sf-ink)] shadow-[0_0_0_1px_var(--sf-ink)]"
                          : "border-hairline hover:border-hairline-strong",
                        "cursor-grab active:cursor-grabbing",
                        FOCUS,
                      )}
                    >
                      <span
                        aria-hidden
                        className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-2 @[300px]:size-7 @[34rem]:size-9"
                        style={{
                          backgroundColor: `color-mix(in oklab, ${t.tint} 14%, transparent)`,
                          color: t.tint,
                        }}
                      >
                        <Icon className="size-[18px]" />
                        {isPicked ? (
                          <span className="absolute -top-1 -left-1 inline-flex size-4 items-center justify-center rounded-full border-2 border-card bg-[var(--sf-ink)] text-background">
                            <Check className="size-2.5" strokeWidth={3} />
                          </span>
                        ) : null}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span
                          className="line-clamp-2 text-[12.5px] leading-snug font-medium text-foreground"
                          title={d.name}
                        >
                          {d.name}
                        </span>
                        <span className="font-mono text-[10.5px] text-ink-3">
                          {`${t.label} · ${sizeLabel(d.size)}`}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${d.name} to a folder`}
                      title="Move to… (M)"
                      tabIndex={d.id === tabbableDoc ? 0 : -1}
                      disabled={disabled}
                      onClick={() => openMove(d.id)}
                      className={cn(
                        "absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground",
                        "@[300px]:top-1 @[300px]:right-1 @[300px]:translate-y-0 @[34rem]:top-1/2 @[34rem]:right-2 @[34rem]:-translate-y-1/2",
                        FOCUS,
                      )}
                    >
                      <FolderInput aria-hidden className="size-4" />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </section>
  );

  return (
    <div
      ref={frameRef}
      className={cn(
        "@container relative w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={
        {
          height: frameHeight,
          "--sf-ink": accentInk,
          "--sf-wash": "color-mix(in oklab, var(--sf-ink) 12%, transparent)",
        } as React.CSSProperties
      }
    >
      <p id={hintId} className="sr-only">
        Space picks a document, M moves it to a folder. Arrow keys move between
        documents.
      </p>

      {/* A container query never sees its own box: the direction lives
          one level in. */}
      <div className="flex h-full w-full flex-col @[34rem]:flex-row">
        {/* The tree: above the tray from 300px, beside the page from 34rem. */}
        <nav
          aria-label={title}
          className="hidden flex-col overflow-hidden bg-surface-1 @[300px]:flex @[300px]:flex-1 @[34rem]:w-[236px] @[34rem]:flex-none @[34rem]:border-r @[34rem]:border-hairline"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline pr-2 pl-3.5">
            <p className="min-w-0 flex-1 truncate text-[13px] leading-tight font-semibold">
              {title}
            </p>
            <button
              type="button"
              disabled={disabled || status !== "ready"}
              aria-label="New folder"
              title="New folder"
              onClick={() => createFolder(selectedFolder ?? activeFolder)}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
                FOCUS,
              )}
            >
              <FolderPlus aria-hidden className="size-4" />
            </button>
          </div>
          <div
            ref={sideScroll}
            className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-1.5"
          >
            {treeBody ?? (
              <Tree
                {...treeProps}
                variant="side"
                label={title}
                onPress={pressSide}
                onKey={(event, id) => onTreeKey(event, id, pressSide)}
              />
            )}
          </div>
        </nav>

        {page}
      </div>

      {/* Under 300px the tree is a sheet; a drag raises it. */}
      <motion.div
        className="absolute inset-x-0 bottom-0 z-[4] flex flex-col overflow-hidden rounded-t-4 border-t border-hairline bg-surface-1 shadow-[0_-10px_30px_-12px_color-mix(in_oklab,var(--foreground)_30%,transparent)] @[300px]:hidden"
        style={{ height: sheetH }}
        initial={false}
        animate={{ y: sheetOpen ? 0 : sheetH - HANDLE_H }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        <button
          type="button"
          data-sf-handle=""
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((o) => !o)}
          className={cn(
            "flex shrink-0 flex-col items-center gap-1 pt-1.5",
            FOCUS_IN,
          )}
          style={{ height: HANDLE_H }}
        >
          <span
            aria-hidden
            className="h-1 w-8 rounded-full bg-hairline-strong"
          />
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
            <Folder aria-hidden className="size-3.5 text-ink-3" />
            Folders
            <span className="font-mono text-[11px] font-normal text-ink-3">
              {flat.size}
            </span>
          </span>
        </button>
        <div className="flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2">
          {treeBody ?? (
            <Tree
              {...treeProps}
              variant="sheet"
              label={`${title}, sheet`}
              onPress={pressSide}
              onKey={(event, id) => onTreeKey(event, id, pressSide)}
            />
          )}
        </div>
      </motion.div>

      {/* The ghost: what you are carrying. */}
      {ghost ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-[6] flex max-w-[190px] items-center gap-2 rounded-3 border border-hairline-strong bg-popover py-1.5 pr-3 pl-1.5 shadow-[0_12px_28px_-8px_color-mix(in_oklab,var(--foreground)_38%,transparent)]"
          style={{ x: gx, y: gy, scale: gs, opacity: go, rotate: gr }}
        >
          <span
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-2"
            style={{
              backgroundColor: `color-mix(in oklab, ${TYPES[ghost.type].tint} 16%, transparent)`,
              color: TYPES[ghost.type].tint,
            }}
          >
            {React.createElement(TYPES[ghost.type].icon, {
              className: "size-4",
            })}
          </span>
          <span className="min-w-0 truncate text-[12px] font-medium">
            {ghost.name}
          </span>
          {ghost.ids.length > 1 ? (
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[var(--sf-ink)] px-1.5 font-mono text-[10px] text-background tabular-nums">
              {ghost.ids.length}
            </span>
          ) : null}
        </motion.div>
      ) : null}

      {/* Move to: the same tree, for the keyboard. */}
      <AnimatePresence>
        {moveFor ? (
          <motion.div
            key="move"
            className="absolute inset-0 z-[8] flex items-end justify-center p-2 @[300px]:items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: durations.fast } }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
          >
            <div
              aria-hidden
              className="absolute inset-0 bg-[color-mix(in_oklab,var(--foreground)_20%,transparent)]"
              onClick={() => closeMove(true)}
            />
            <MoveDialog
              titleId={dialogTitleId}
              docs={moveDocs}
              types={moveTypes}
              treeProps={treeProps}
              title={title}
              motionSafe={motionSafe}
              onTreeKey={onTreeKey}
              onFocusFolder={setActiveFolder}
              onCreate={(parent) => createFolder(parent)}
              onChoose={(id) => {
                const folder = flat.get(id)?.folder;
                if (!folder) return;
                const why = refusal(folder, moveTypes);
                if (why) {
                  setAnnouncement(why);
                  return;
                }
                const ids = moveFor;
                closeMove(false);
                // Focus goes to the next card, or the page heading.
                const left = docs.filter((d) => !ids.includes(d.id));
                window.requestAnimationFrame(() => {
                  fileInto(ids, id, "card");
                  window.requestAnimationFrame(() => {
                    const next = left[0];
                    const el = next
                      ? cardEl(next.id)?.querySelector<HTMLElement>(
                          "[data-sf-main]",
                        )
                      : frameRef.current?.querySelector<HTMLElement>(
                          "[data-sf-page-title]",
                        );
                    el?.focus({ preventScroll: true });
                  });
                });
              }}
              onClose={() => closeMove(true)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Move dialog                               */
/* ----------------------------------------------------------------------- */

function MoveDialog({
  titleId,
  docs,
  types,
  treeProps,
  title,
  motionSafe,
  onTreeKey,
  onFocusFolder,
  onCreate,
  onChoose,
  onClose,
}: {
  titleId: string;
  docs: SpringDoc[];
  types: SpringDocType[];
  treeProps: Omit<TreeProps, "variant" | "label" | "onPress" | "onKey">;
  title: string;
  motionSafe: boolean;
  onTreeKey: (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
    onChoose: (id: string) => void,
  ) => void;
  onFocusFolder: (id: string) => void;
  onCreate: (parent: string | null) => void;
  onChoose: (id: string) => void;
  onClose: () => void;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);

  // Focus moves in when the dialog arrives: the first folder that takes
  // these documents.
  React.useEffect(() => {
    if (!node) return;
    const rows = [...node.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    const first =
      rows.find((r) => r.getAttribute("aria-disabled") !== "true") ?? rows[0];
    first?.focus({ preventScroll: true });
  }, [node]);

  const name =
    docs.length === 1
      ? `“${docs[0]?.name ?? ""}”`
      : plural(docs.length, "document");

  return (
    <motion.div
      ref={setNode}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="relative flex max-h-[86%] w-full max-w-[320px] flex-col overflow-hidden rounded-4 border border-hairline-strong bg-popover shadow-[0_18px_40px_-12px_color-mix(in_oklab,var(--foreground)_40%,transparent)]"
      initial={{ y: motionSafe ? distances.step : 0, opacity: 0 }}
      animate={{
        y: 0,
        opacity: 1,
        transition: motionSafe ? springs.snap : { duration: durations.fast },
      }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        if (event.key === "Tab") {
          // Focus stays in the dialog until it closes.
          const focusables = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [role="treeitem"][tabindex="0"]',
            ),
          ];
          const at = focusables.indexOf(document.activeElement as HTMLElement);
          const n = focusables.length;
          if (n === 0) return;
          event.preventDefault();
          focusables[(at + (event.shiftKey ? -1 : 1) + n) % n]?.focus({
            preventScroll: true,
          });
        }
      }}
    >
      <div className="flex flex-col gap-0.5 border-b border-hairline px-4 pt-3.5 pb-3">
        <h3 id={titleId} className="truncate text-[13.5px] font-semibold">
          {`Move ${name} to…`}
        </h3>
        <p className="truncate text-[11.5px] text-ink-3">
          {`${title} · ${types.map((t) => TYPES[t].label).join(", ")}`}
        </p>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain p-1.5">
        <Tree
          {...treeProps}
          dragTypes={types}
          hover={null}
          variant="dialog"
          label="Folders"
          onPress={(id) => {
            onFocusFolder(id);
            onChoose(id);
          }}
          onKey={(event, id) => onTreeKey(event, id, onChoose)}
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-hairline px-2 py-2">
        <button
          type="button"
          onClick={() => onCreate(treeProps.active)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <FolderPlus aria-hidden className="size-3.5" />
          New folder
        </button>
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
