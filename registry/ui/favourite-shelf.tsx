"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  BookOpen,
  ChartColumn,
  FileText,
  Flag,
  Folder,
  GripVertical,
  Inbox,
  LayoutGrid,
  LifeBuoy,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Smartphone,
  Star,
  TriangleAlert,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import {
  rubberClamp,
  useDrag,
  type DragInfo,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type FavouriteShelfAccent = "cobalt" | "plum" | "mint" | "ink";
export type FavouriteShelfStyle = "tray" | "ruled" | "card";
export type FavouriteShelfStatus = "ready" | "loading" | "error";
export type ShelfIcon =
  | "inbox"
  | "doc"
  | "board"
  | "chart"
  | "map"
  | "book"
  | "flag"
  | "folder"
  | "phone"
  | "team"
  | "help";

export type ShelfSection = { id: string; label: string };

export type ShelfItem = {
  id: string;
  label: string;
  /** The section it lives in. */
  section: string;
  icon: ShelfIcon;
  /** A count shown at the row's end, e.g. unread items. */
  count?: number;
};

export type FavouriteShelfProps = {
  /** How the shelf is drawn: an inset tray, hairline rules, or a raised card. @default "tray" */
  shelfStyle?: FavouriteShelfStyle;
  /** Every row's height, in px. @default 32 */
  rowHeight?: number;
  /** Accent for the current page, the landing pad and the star. A name or any CSS colour. @default "cobalt" */
  accent?: FavouriteShelfAccent | (string & {});
  /** The sections under the shelf, in order. @default defaultShelfSections */
  sections?: ShelfSection[];
  /** Every row, in order within its section. @default defaultShelfItems */
  items?: ShelfItem[];
  /** Controlled favourites: item ids in shelf order. */
  favourites?: string[];
  /** Initial favourites when uncontrolled. @default defaultShelfFavourites */
  defaultFavourites?: string[];
  /** Fires with the whole new shelf after any add, remove or reorder. */
  onFavouritesChange?: (ids: string[]) => void;
  /** An item landed on the shelf, at this index. */
  onFavourite?: (id: string, index: number) => void;
  /** An item left the shelf. */
  onUnfavourite?: (id: string) => void;
  /** The shelf's order changed (a drag or Alt with an arrow). */
  onReorderFavourites?: (ids: string[]) => void;
  /** The most the shelf holds. @default 5 */
  limit?: number;
  /** Controlled current page id. */
  current?: string;
  /** Initial current page when uncontrolled. @default "roadmap" */
  defaultCurrent?: string;
  /** A row was opened. */
  onNavigate?: (id: string) => void;
  /** Controlled folded state: the sidebar as a 60px rail. */
  folded?: boolean;
  /** Initial folded state when uncontrolled. @default false */
  defaultFolded?: boolean;
  /** Fires from the button that folded or opened the sidebar. */
  onFoldedChange?: (folded: boolean) => void;
  /** The workspace's name in the header. @default "Basinworks" */
  workspace?: string;
  /** Whether the sidebar's data has arrived. @default "ready" */
  status?: FavouriteShelfStatus;
  /** Try again after an error. */
  onRetry?: () => void;
  /** The navigation's accessible name. @default "<workspace> sidebar" */
  label?: string;
  className?: string;
};

export const defaultShelfSections: ShelfSection[] = [
  { id: "pages", label: "Pages" },
  { id: "projects", label: "Projects" },
  { id: "teams", label: "Teams" },
];

export const defaultShelfItems: ShelfItem[] = [
  { id: "inbox", label: "Inbox", section: "pages", icon: "inbox", count: 4 },
  { id: "roadmap", label: "Roadmap", section: "pages", icon: "map" },
  { id: "notes", label: "Weekly notes", section: "pages", icon: "doc" },
  { id: "pricing", label: "Pricing research", section: "pages", icon: "chart" },
  {
    id: "q4-launch",
    label: "Q4 launch",
    section: "projects",
    icon: "flag",
    count: 12,
  },
  {
    id: "tidewater",
    label: "Tidewater redesign",
    section: "projects",
    icon: "board",
  },
  { id: "field-app", label: "Field app", section: "projects", icon: "phone" },
  { id: "design", label: "Design", section: "teams", icon: "team" },
  { id: "platform", label: "Platform", section: "teams", icon: "folder" },
  { id: "support", label: "Support", section: "teams", icon: "help", count: 2 },
];

export const defaultShelfFavourites: string[] = ["roadmap", "q4-launch"];

const ICONS: Record<ShelfIcon, typeof Inbox> = {
  inbox: Inbox,
  doc: FileText,
  board: LayoutGrid,
  chart: ChartColumn,
  map: MapIcon,
  book: BookOpen,
  flag: Flag,
  folder: Folder,
  phone: Smartphone,
  team: Users,
  help: LifeBuoy,
};

const ACCENTS: Record<FavouriteShelfAccent, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const SHELF: Record<FavouriteShelfStyle, string> = {
  tray: "rounded-3 bg-surface-2/70 p-1 shadow-[inset_0_1px_2px_color-mix(in_oklab,black_9%,transparent)]",
  ruled: "border-y border-hairline p-1",
  card: "rounded-3 border border-hairline border-t-2 border-t-[var(--fs-ink)] bg-card p-1 shadow-[0_2px_8px_color-mix(in_oklab,black_7%,transparent)]",
};

const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const RAIL = 60;
const WIDE = 288;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Zone = "shelf" | "sec";
type Rect = { x: number; y: number; w: number; h: number };

type Grip = {
  id: string;
  zone: Zone;
  el: HTMLElement;
  origin: Rect;
  room: { w: number; h: number };
  /** The shelf's list box when the drag began; it only grows downward. */
  shelf: Rect | null;
  /** Rows on the shelf while this drag is in the air (itself excluded). */
  count: number;
  full: boolean;
};

type Copy = {
  id: string;
  zone: Zone;
  w: number;
  h: number;
  /** Still under the pointer; false once it is flying on its own. */
  live: boolean;
};

/* ---------------------------------- rows --------------------------------- */

type RowProps = {
  item: ShelfItem;
  zone: Zone;
  rowKey: string;
  tabbable: boolean;
  current: boolean;
  starred: boolean;
  folded: boolean;
  ghost: boolean;
  hidden: boolean;
  disabled: boolean;
  pill?: React.ReactNode;
  extra?: React.ComponentProps<"button">;
  register: (key: string, node: HTMLButtonElement | null) => void;
  onPress: (item: ShelfItem) => void;
  onKey: (e: React.KeyboardEvent<HTMLButtonElement>, key: string) => void;
  onFocusRow: (key: string) => void;
  onGrab: (
    info: DragInfo,
    item: ShelfItem,
    zone: Zone,
    el: HTMLElement,
  ) => void;
  onDragMove: (info: DragInfo) => void;
  onDrop: (info: DragInfo) => void;
  onDragCancel: () => void;
};

function Row({
  item,
  zone,
  rowKey,
  tabbable,
  current,
  starred,
  folded,
  ghost,
  hidden,
  disabled,
  pill,
  extra,
  register,
  onPress,
  onKey,
  onFocusRow,
  onGrab,
  onDragMove,
  onDrop,
  onDragCancel,
}: RowProps) {
  const node = React.useRef<HTMLButtonElement | null>(null);
  const handlers = useDrag({
    threshold: 4,
    disabled,
    onStart: (info) => {
      if (node.current) onGrab(info, item, zone, node.current);
    },
    onMove: onDragMove,
    onEnd: onDrop,
    onCancel: onDragCancel,
    // A press without travel opens the row; a drag never does.
    onTap: () => onPress(item),
  });
  // Until the drag takes the pointer, its moves go to whatever is under it:
  // a quick pull leaves a 32px row before the threshold. The window passes
  // those on, and a release out there ends the press without a tap.
  const detach = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => detach.current?.(), []);
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    handlers.onPointerDown(e);
    detach.current?.();
    const el = e.currentTarget;
    const id = e.pointerId;
    const away = (ev: PointerEvent) =>
      ev.pointerId === id &&
      !(ev.target instanceof Node && el.contains(ev.target));
    const move = (ev: PointerEvent) => {
      if (away(ev)) handlers.onPointerMove(ev as unknown as React.PointerEvent);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (away(ev))
        handlers.onPointerCancel(ev as unknown as React.PointerEvent);
      off();
    };
    const off = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      detach.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    detach.current = off;
  };
  const Icon = ICONS[item.icon] ?? FileText;
  return (
    <button
      ref={(n) => {
        node.current = n;
        register(rowKey, n);
      }}
      type="button"
      data-fs-row={rowKey}
      tabIndex={tabbable ? 0 : -1}
      aria-current={current ? "page" : undefined}
      title={folded ? item.label : undefined}
      onFocus={() => onFocusRow(rowKey)}
      onKeyDown={(e) => onKey(e, rowKey)}
      onClick={(e) => {
        // Pointer presses arrive through the drag's tap; a click with no
        // pointer behind it is a key or assistive technology.
        if (e.detail === 0) onPress(item);
      }}
      {...handlers}
      onPointerDown={onPointerDown}
      {...extra}
      className={cn(
        "group/fs-row relative flex h-[var(--fs-row)] w-full touch-pan-y items-center gap-2.5 rounded-2 pr-1.5 text-left text-[13px] transition-[color,background-color,opacity] select-none",
        zone === "shelf" ? "pl-2.5" : "pl-3.5",
        current
          ? "font-medium text-foreground"
          : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        FOCUS_IN,
        // After the focus ring, so its outline-none cannot erase the ghost's.
        ghost &&
          "bg-transparent opacity-45 outline-1 outline-offset-[-1px] outline-hairline-strong outline-dashed",
        hidden && "opacity-0",
      )}
    >
      {pill}
      <Icon
        aria-hidden
        className={cn(
          "relative size-4 shrink-0",
          current ? "text-[var(--fs-ink)]" : "text-ink-3",
        )}
      />
      <span
        className={cn(
          "relative min-w-0 flex-1 truncate transition-opacity duration-200",
          folded && "opacity-0",
        )}
      >
        {item.label}
      </span>
      {!folded && zone === "sec" && starred ? (
        <Star
          aria-hidden
          className="relative size-3 shrink-0 fill-[var(--fs-ink)] text-[var(--fs-ink)]"
        />
      ) : null}
      {!folded && typeof item.count === "number" ? (
        <span className="relative shrink-0 font-mono text-[11px] text-ink-3 tabular-nums group-hover/fs-row:hidden group-focus-visible/fs-row:hidden">
          {item.count}
        </span>
      ) : null}
      {!folded && !disabled ? (
        <span
          aria-hidden
          className="relative hidden shrink-0 touch-none text-ink-3 group-hover/fs-row:inline-flex group-focus-visible/fs-row:inline-flex pointer-coarse:inline-flex"
        >
          <GripVertical className="size-3.5" />
        </span>
      ) : null}
    </button>
  );
}

/* --------------------------------- sidebar -------------------------------- */

/**
 * A workspace sidebar with a Favourites shelf at its top, filled by dragging
 * any row up into it. The grabbed row lifts into a layer above the sidebar
 * on `flick` and follows the pointer 1:1, leaving a dashed ghost where it
 * was; over the shelf, the favourites part on `glide` to open a gap that
 * follows the pointer while the shelf's height glides open by one row. Let
 * go over the gap and the row glides in with the release velocity, then
 * lands with a short squash — a spring on `recoil` kicked by the landing,
 * not a keyframe — and the real row takes its place. Let go anywhere else
 * and it glides home to its ghost; drag a favourite out below the shelf and
 * it is taken off. A full shelf opens no gap and says so.
 *
 * Every row is one roving list: Up and Down walk it, Enter opens, Alt+F
 * adds the focused row to the shelf (or takes a favourite off) with the
 * same flight, Alt with Up or Down reorders a favourite, Delete removes
 * one. The fold button narrows the sidebar to a 60px rail on glide, where
 * the shelf becomes a strip of icons. Under reduced motion the copy still
 * follows the pointer, but lifts, flights and squashes become instant.
 */
export function FavouriteShelf({
  shelfStyle = "tray",
  rowHeight = 32,
  accent = "cobalt",
  sections = defaultShelfSections,
  items = defaultShelfItems,
  favourites,
  defaultFavourites = defaultShelfFavourites,
  onFavouritesChange,
  onFavourite,
  onUnfavourite,
  onReorderFavourites,
  limit = 5,
  current,
  defaultCurrent = "roadmap",
  onNavigate,
  folded,
  defaultFolded = false,
  onFoldedChange,
  workspace = "Basinworks",
  status = "ready",
  onRetry,
  label,
  className,
}: FavouriteShelfProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const shelfLabelId = `${uid}-shelf`;
  const hintId = `${uid}-hint`;
  const rowH = clamp(Math.round(rowHeight), 24, 56);
  const cap = Math.max(1, Math.round(limit));

  const [ownFavs, setOwnFavs] = React.useState(defaultFavourites);
  const favs = favourites ?? ownFavs;
  const [ownCurrent, setOwnCurrent] = React.useState(defaultCurrent);
  const currentId = current ?? ownCurrent;
  const [ownFolded, setOwnFolded] = React.useState(defaultFolded);
  const isFolded = folded ?? ownFolded;

  const byId = React.useMemo(
    () => new Map(items.map((it) => [it.id, it])),
    [items],
  );
  const shelfIds = favs.filter((id) => byId.has(id));

  /* --------------------------------- state -------------------------------- */

  const rootRef = React.useRef<HTMLElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const grip = React.useRef<Grip | null>(null);
  const gapRef = React.useRef<number | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);

  const [copy, setCopy] = React.useState<Copy | null>(null);
  const [gap, setGap] = React.useState<number | null>(null);
  const [landing, setLanding] = React.useState<string | null>(null);
  const [overFull, setOverFull] = React.useState(false);
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const copyX = useMotionValue(0);
  const copyY = useMotionValue(0);
  const copyW = useMotionValue(0);
  const copyScale = useMotionValue(1);
  const copyScaleX = useMotionValue(1);
  const copyScaleY = useMotionValue(1);
  const copyOpacity = useMotionValue(1);

  const register = React.useCallback(
    (key: string, node: HTMLButtonElement | null) => {
      if (node) rowRefs.current.set(key, node);
      else rowRefs.current.delete(key);
    },
    [],
  );

  const halt = React.useCallback(() => {
    for (const c of running.current) c.stop();
    running.current = [];
  }, []);

  /** Ends any flight at once: a new grab or key never waits for the last one. */
  const settleNow = React.useCallback(() => {
    halt();
    copyScale.jump(1);
    copyScaleX.jump(1);
    copyScaleY.jump(1);
    copyOpacity.jump(1);
    setCopy(null);
    setLanding(null);
  }, [copyOpacity, copyScale, copyScaleX, copyScaleY, halt]);

  const fullTimer = React.useRef(0);
  React.useEffect(
    () => () => {
      halt();
      window.clearTimeout(fullTimer.current);
    },
    [halt],
  );

  const commit = (next: string[]) => {
    if (favourites === undefined) setOwnFavs(next);
    onFavouritesChange?.(next);
  };

  const rectIn = (el: Element): Rect | null => {
    const root = rootRef.current;
    if (!root) return null;
    const r = root.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    return {
      x: r2(e.left - r.left),
      y: r2(e.top - r.top),
      w: r2(e.width),
      h: r2(e.height),
    };
  };

  /* -------------------------------- flights ------------------------------- */

  /** The landing: glide into the slot with the throw, then a squash on recoil. */
  const flyIn = (to: Rect, velocity: { x: number; y: number }, id: string) => {
    halt();
    if (!motionSafe) {
      settleNow();
      return;
    }
    setLanding(id);
    const glide = { ...springs.glide };
    running.current = [
      animate(copyX, to.x, { ...glide, velocity: velocity.x }),
      animate(copyW, to.w, glide),
      animate(copyScale, 1, glide),
      animate(copyY, to.y, {
        ...glide,
        velocity: velocity.y,
        onComplete: () => {
          // The impact: a recoil spring kicked downward squashes the row and
          // lets it bounce back twice, no keyframes involved.
          copyScaleX.jump(1);
          copyScaleY.jump(1);
          running.current = [
            animate(copyScaleX, 1, { ...springs.recoil, velocity: 1.6 }),
            animate(copyScaleY, 1, {
              ...springs.recoil,
              velocity: -2.4,
              onComplete: () => {
                setCopy(null);
                setLanding(null);
              },
            }),
          ];
        },
      }),
    ];
  };

  const flyHome = (to: Rect | null, velocity: { x: number; y: number }) => {
    halt();
    if (!motionSafe || !to) {
      settleNow();
      return;
    }
    running.current = [
      animate(copyX, to.x, { ...springs.glide, velocity: velocity.x }),
      animate(copyScale, 1, springs.glide),
      animate(copyY, to.y, {
        ...springs.glide,
        velocity: velocity.y,
        onComplete: () => setCopy(null),
      }),
    ];
  };

  const fadeAway = () => {
    halt();
    if (!motionSafe) {
      settleNow();
      return;
    }
    const exit = exitFor(durations.base);
    running.current = [
      animate(copyScale, 0.96, exit),
      animate(copyOpacity, 0, {
        ...exit,
        onComplete: () => {
          copyOpacity.jump(1);
          setCopy(null);
        },
      }),
    ];
  };

  const showCopyAt = (item: ShelfItem, zone: Zone, at: Rect, live = false) => {
    settleNow();
    copyX.jump(at.x);
    copyY.jump(at.y);
    copyW.jump(at.w);
    copyScale.jump(1);
    copyScaleX.jump(1);
    copyScaleY.jump(1);
    copyOpacity.jump(1);
    setCopy({ id: item.id, zone, w: at.w, h: at.h, live });
  };

  /* ---------------------------------- drag --------------------------------- */

  const onGrab = (
    info: DragInfo,
    item: ShelfItem,
    zone: Zone,
    el: HTMLElement,
  ) => {
    const root = rootRef.current;
    const origin = rectIn(el);
    if (!root || !origin) return;
    const list = listRef.current ? rectIn(listRef.current) : null;
    const isFav = shelfIds.includes(item.id);
    grip.current = {
      id: item.id,
      zone,
      el,
      origin,
      room: { w: root.clientWidth, h: root.clientHeight },
      shelf: list,
      count: shelfIds.length - (isFav ? 1 : 0),
      full: !isFav && shelfIds.length >= cap,
    };
    showCopyAt(item, zone, origin, true);
    if (motionSafe) running.current = [animate(copyScale, 1.03, springs.flick)];
    onDragMove(info);
  };

  const onDragMove = (info: DragInfo) => {
    const g = grip.current;
    if (!g) return;
    // Sideways the sidebar is barely wider than the row: the copy follows
    // 1:1 inside it and resists hard at its edges rather than leaving it.
    const x = rubberClamp(
      g.origin.x + info.offset.x,
      0,
      Math.max(0, g.room.w - g.origin.w),
      16,
    );
    const y = rubberClamp(
      g.origin.y + info.offset.y,
      0,
      Math.max(0, g.room.h - g.origin.h),
      g.origin.h,
    );
    copyX.set(r2(x));
    copyY.set(r2(y));
    let next: number | null = null;
    let full = false;
    const s = g.shelf;
    if (s) {
      const mid = y + g.origin.h / 2;
      const top = s.y - rowH * 0.6;
      const bottom = s.y + (g.count + 1) * rowH + rowH * 0.4;
      if (mid >= top && mid <= bottom) {
        if (g.full) full = true;
        else
          next = clamp(Math.round((mid - s.y - rowH / 2) / rowH), 0, g.count);
      }
    }
    if (gapRef.current !== next) {
      gapRef.current = next;
      setGap(next);
    }
    setOverFull((was) => (was === full ? was : full));
  };

  const endGrip = () => {
    grip.current = null;
    setCopy((c) => (c ? { ...c, live: false } : c));
    gapRef.current = null;
    setGap(null);
    setOverFull(false);
  };

  const onDrop = (info: DragInfo) => {
    const g = grip.current;
    const at = gapRef.current;
    endGrip();
    if (!g) return;
    const item = byId.get(g.id);
    if (!item) {
      settleNow();
      return;
    }
    if (at !== null && g.shelf) {
      const without = shelfIds.filter((id) => id !== g.id);
      const next = [...without.slice(0, at), g.id, ...without.slice(at)];
      const was = shelfIds.indexOf(g.id);
      // Dropped back where it was: nothing to report.
      if (was !== at) commit(next);
      if (was === -1) {
        onFavourite?.(g.id, at);
        say(`${item.label} added to favourites, ${next.length} of ${cap}.`);
      } else if (was !== at) {
        onReorderFavourites?.(next);
        say(`${item.label} moved to ${at + 1} of ${next.length}.`);
      }
      flyIn(
        { x: g.shelf.x, y: r2(g.shelf.y + at * rowH), w: g.shelf.w, h: rowH },
        info.velocity,
        g.id,
      );
      return;
    }
    if (g.zone === "shelf") {
      // A favourite let go outside the shelf comes off it.
      const next = shelfIds.filter((id) => id !== g.id);
      commit(next);
      onUnfavourite?.(g.id);
      say(`${item.label} removed from favourites.`);
      fadeAway();
      return;
    }
    if (g.full) say(`The shelf is full, ${cap} of ${cap}. Remove one first.`);
    flyHome(g.el.isConnected ? rectIn(g.el) : null, info.velocity);
  };

  const onDragCancel = () => {
    const g = grip.current;
    endGrip();
    flyHome(g?.el.isConnected ? rectIn(g.el) : null, { x: 0, y: 0 });
  };

  /* -------------------------------- keyboard ------------------------------- */

  const order = [
    ...shelfIds.map((id) => `shelf:${id}`),
    ...sections.flatMap((s) =>
      items.filter((it) => it.section === s.id).map((it) => `sec:${it.id}`),
    ),
  ];
  const tabKey =
    focusKey && order.includes(focusKey)
      ? focusKey
      : (order.find((k) => k === `sec:${currentId}`) ?? order[0] ?? null);

  const focusReq = React.useRef<string | null>(null);
  React.useEffect(() => {
    const want = focusReq.current;
    if (!want) return;
    const node = rowRefs.current.get(want);
    if (!node) return;
    focusReq.current = null;
    node.focus({ preventScroll: false });
  });

  const toggleFavourite = (id: string, from: string) => {
    const item = byId.get(id);
    if (!item) return;
    const el = rowRefs.current.get(from);
    const at = el ? rectIn(el) : null;
    if (shelfIds.includes(id)) {
      const next = shelfIds.filter((f) => f !== id);
      if (at && from.startsWith("shelf:")) {
        showCopyAt(item, "shelf", at);
        fadeAway();
      }
      commit(next);
      onUnfavourite?.(id);
      say(`${item.label} removed from favourites.`);
      if (from.startsWith("shelf:")) {
        const i = order.indexOf(from);
        focusReq.current = order[i + 1] ?? order[i - 1] ?? null;
      }
      return;
    }
    if (shelfIds.length >= cap) {
      setOverFull(true);
      window.clearTimeout(fullTimer.current);
      fullTimer.current = window.setTimeout(() => setOverFull(false), 1200);
      say(`The shelf is full, ${cap} of ${cap}. Remove one first.`);
      return;
    }
    const next = [...shelfIds, id];
    const list = listRef.current ? rectIn(listRef.current) : null;
    commit(next);
    onFavourite?.(id, shelfIds.length);
    say(`${item.label} added to favourites, ${next.length} of ${cap}.`);
    if (at && list) {
      showCopyAt(item, "sec", at);
      flyIn(
        {
          x: list.x,
          y: r2(list.y + shelfIds.length * rowH),
          w: list.w,
          h: rowH,
        },
        { x: 0, y: 0 },
        id,
      );
    }
  };

  const reorder = (id: string, by: number) => {
    const i = shelfIds.indexOf(id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= shelfIds.length) return;
    const next = [...shelfIds];
    next.splice(i, 1);
    next.splice(j, 0, id);
    commit(next);
    onReorderFavourites?.(next);
    say(`${byId.get(id)?.label ?? id} moved to ${j + 1} of ${next.length}.`);
    focusReq.current = `shelf:${id}`;
  };

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, key: string) => {
    const [zone, id = ""] = key.split(/:(.*)/s) as [string, string?];
    const i = order.indexOf(key);
    const go = (k: string | undefined) => {
      if (!k) return;
      setFocusKey(k);
      rowRefs.current.get(k)?.focus();
    };
    if (e.altKey && !e.metaKey && !e.ctrlKey) {
      if (e.code === "KeyF") {
        e.preventDefault();
        toggleFavourite(id, key);
        return;
      }
      if (zone === "shelf" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        reorder(id, e.key === "ArrowUp" ? -1 : 1);
        return;
      }
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(order[Math.min(order.length - 1, i + 1)]);
        break;
      case "ArrowUp":
        e.preventDefault();
        go(order[Math.max(0, i - 1)]);
        break;
      case "Home":
        e.preventDefault();
        go(order[0]);
        break;
      case "End":
        e.preventDefault();
        go(order[order.length - 1]);
        break;
      case "Delete":
      case "Backspace":
        if (zone === "shelf") {
          e.preventDefault();
          toggleFavourite(id, key);
        }
        break;
      default:
        break;
    }
  };

  const press = (item: ShelfItem) => {
    if (current === undefined) setOwnCurrent(item.id);
    onNavigate?.(item.id);
  };

  const toggleFold = () => {
    const next = !isFolded;
    if (folded === undefined) setOwnFolded(next);
    onFoldedChange?.(next);
    say(next ? "Sidebar folded to a rail." : "Sidebar opened.");
  };

  /* --------------------------------- render -------------------------------- */

  const ready = status === "ready";
  const dragging = copy?.live === true;
  const draggedFav = copy?.live && shelfIds.includes(copy.id) ? copy.id : null;
  const displayIds = draggedFav
    ? shelfIds.filter((id) => id !== draggedFav)
    : shelfIds;
  const slots = displayIds.length + (gap !== null ? 1 : 0);
  const listH = Math.max(1, slots) * rowH;
  const empty = displayIds.length === 0 && gap === null;
  const name = label ?? `${workspace} sidebar`;
  // Rows stay in one DOM order (the items' order) so a reorder never moves a
  // node; the shelf's visual order and position are given to each row.
  // The grabbed favourite stays mounted (invisible, in its old slot): it holds
  // the pointer capture, and unmounting it would drop the drag.
  const shelfRows = items.filter((it) => shelfIds.includes(it.id));
  const copyItem = copy ? byId.get(copy.id) : undefined;
  const glide = motionSafe ? springs.glide : { duration: 0 };

  const rowCommon = {
    folded: isFolded,
    disabled: !ready,
    register,
    onPress: press,
    onKey,
    onFocusRow: setFocusKey,
    onGrab,
    onDragMove,
    onDrop,
    onDragCancel,
  };

  const shelf = (
    <div className="flex flex-col gap-1.5 px-2 pt-1 pb-3">
      <div
        className={cn(
          "flex h-6 items-center justify-between gap-2 px-1.5",
          isFolded && "justify-center px-0",
        )}
      >
        <p
          id={shelfLabelId}
          className={cn(
            "flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
            isFolded && "sr-only",
          )}
        >
          <Star aria-hidden className="size-3" />
          Favourites
        </p>
        <span
          className={cn(
            "font-mono text-[10px] tabular-nums transition-colors",
            overFull ? "text-warn" : "text-ink-3",
          )}
        >
          {overFull && !isFolded ? "Shelf full" : `${shelfIds.length}/${cap}`}
        </span>
      </div>
      <div className={cn("relative", SHELF[shelfStyle] ?? SHELF.tray)}>
        <motion.div
          aria-hidden={!empty}
          className={cn(
            "pointer-events-none absolute inset-1 flex items-center justify-center gap-1.5 rounded-2 border border-dashed border-hairline-strong px-2 text-center text-[11.5px] leading-tight text-ink-3",
            isFolded && "px-0",
          )}
          initial={false}
          animate={{ opacity: empty ? 1 : 0 }}
          transition={{ duration: durations.fast }}
        >
          {isFolded ? (
            <>
              <Star aria-hidden className="size-3.5" />
              <span className="sr-only">No favourites yet</span>
            </>
          ) : (
            <span className="truncate">Drag a page here, or press Alt F</span>
          )}
        </motion.div>
        <motion.div
          ref={listRef}
          role="list"
          aria-labelledby={shelfLabelId}
          className="relative"
          initial={false}
          animate={{ height: listH }}
          transition={glide}
        >
          {gap !== null ? (
            <motion.div
              aria-hidden
              className="absolute inset-x-0 top-0 rounded-2 border border-dashed border-[var(--fs-soft)] bg-[var(--fs-wash)]"
              style={{ height: rowH }}
              initial={false}
              animate={{ y: gap * rowH }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          ) : null}
          {shelfRows.map((item) => {
            const lifted = item.id === draggedFav;
            const index = lifted
              ? shelfIds.indexOf(item.id)
              : displayIds.indexOf(item.id);
            const slot = lifted
              ? index
              : index + (gap !== null && index >= gap ? 1 : 0);
            const key = `shelf:${item.id}`;
            return (
              <motion.div
                key={item.id}
                role="listitem"
                aria-posinset={index + 1}
                aria-setsize={lifted ? shelfIds.length : displayIds.length}
                className="absolute inset-x-0 top-0"
                initial={false}
                animate={{ y: slot * rowH }}
                transition={glide}
              >
                <Row
                  {...rowCommon}
                  item={item}
                  zone="shelf"
                  rowKey={key}
                  tabbable={key === tabKey}
                  current={item.id === currentId}
                  starred
                  ghost={false}
                  hidden={landing === item.id || lifted}
                  pill={
                    item.id === currentId ? (
                      <span
                        aria-hidden
                        className="absolute inset-0 rounded-2 bg-[var(--fs-wash)]"
                      />
                    ) : null
                  }
                  extra={{
                    "aria-label": `${item.label}, favourite ${index + 1} of ${lifted ? shelfIds.length : displayIds.length}`,
                    "aria-describedby": hintId,
                  }}
                />
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );

  const sectionList = (
    <div className="flex flex-col gap-3 px-2 pb-3">
      {sections.map((section) => {
        const rows = items.filter((it) => it.section === section.id);
        if (rows.length === 0) return null;
        return (
          <div key={section.id} className="flex flex-col">
            <p
              className={cn(
                "flex h-7 items-center px-3.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
                isFolded && "justify-center px-0",
              )}
            >
              {isFolded ? (
                <span aria-hidden className="h-px w-5 bg-hairline-strong" />
              ) : null}
              <span className={cn(isFolded && "sr-only")}>{section.label}</span>
            </p>
            <ul className="flex flex-col gap-px">
              {rows.map((item) => {
                const key = `sec:${item.id}`;
                const isCurrent = item.id === currentId;
                const starred = shelfIds.includes(item.id);
                return (
                  <li key={item.id}>
                    <Row
                      {...rowCommon}
                      item={item}
                      zone="sec"
                      rowKey={key}
                      tabbable={key === tabKey}
                      current={isCurrent}
                      starred={starred}
                      ghost={
                        dragging && copy?.id === item.id && copy.zone === "sec"
                      }
                      hidden={false}
                      pill={
                        isCurrent ? (
                          <motion.span
                            layoutId={`${uid}-current`}
                            aria-hidden
                            className="absolute inset-0 rounded-2 bg-[var(--fs-wash)]"
                            transition={glide}
                          />
                        ) : null
                      }
                      extra={{
                        "aria-label": `${item.label}${starred ? ", favourite" : ""}${typeof item.count === "number" ? `, ${item.count}` : ""}`,
                        "aria-describedby": hintId,
                      }}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2 px-3 py-2">
        <p className="sr-only">Loading the sidebar.</p>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2 bg-surface-2"
            style={{ height: rowH - 8 }}
          />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center-safe justify-center-safe gap-3 px-3 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        {!isFolded ? (
          <p className="text-[13px] text-foreground">
            The sidebar didn’t load.
          </p>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Try again"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {!isFolded ? "Try again" : null}
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <>
        {shelf}
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {sectionList}
        </div>
      </>
    );
  }

  return (
    <div
      className={cn("flex w-full justify-center", className)}
      style={
        {
          "--fs-ink": ACCENTS[accent as FavouriteShelfAccent] ?? accent,
          "--fs-wash": "color-mix(in oklab, var(--fs-ink) 13%, transparent)",
          "--fs-soft": "color-mix(in oklab, var(--fs-ink) 45%, transparent)",
          "--fs-row": `${rowH}px`,
        } as React.CSSProperties
      }
    >
      <motion.nav
        ref={rootRef}
        aria-label={name}
        className="relative flex max-h-[34rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
        initial={false}
        animate={{ maxWidth: isFolded ? RAIL : WIDE }}
        transition={glide}
      >
        <header className="flex h-14 shrink-0 items-center gap-2 px-3.5">
          <button
            type="button"
            onClick={toggleFold}
            aria-pressed={isFolded}
            aria-label={isFolded ? "Open the sidebar" : "Fold the sidebar"}
            title={isFolded ? "Open the sidebar" : "Fold to a rail"}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <motion.span
              className="inline-flex"
              initial={false}
              animate={{ rotate: isFolded ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {isFolded ? (
                <PanelLeftOpen aria-hidden className="size-4" />
              ) : (
                <PanelLeftClose aria-hidden className="size-4" />
              )}
            </motion.span>
          </button>
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col transition-opacity duration-200",
              isFolded && "pointer-events-none opacity-0",
            )}
          >
            <span className="truncate text-sm leading-5 font-semibold">
              {workspace}
            </span>
            <span className="truncate text-[11px] leading-4 text-ink-3">
              Workspace
            </span>
          </div>
        </header>

        {body}

        <footer
          className={cn(
            "flex h-10 shrink-0 items-center gap-2 border-t border-hairline px-4 font-mono text-[10.5px] text-ink-3",
            isFolded && "justify-center px-0",
          )}
        >
          <span aria-hidden className="flex shrink-0 gap-0.5">
            {Array.from({ length: Math.min(cap, 8) }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "h-2.5 w-1 rounded-full transition-colors duration-300",
                  i < shelfIds.length
                    ? overFull
                      ? "bg-warn"
                      : "bg-[var(--fs-ink)]"
                    : "bg-hairline-strong",
                  isFolded && i >= 3 && "hidden",
                )}
              />
            ))}
          </span>
          <span className={cn("truncate", isFolded && "sr-only")}>
            {`${shelfIds.length} of ${cap} on the shelf`}
          </span>
        </footer>

        {/* The lifted copy flies above everything, inside the sidebar's own box. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
          {copy && copyItem ? (
            <motion.div
              className="absolute top-0 left-0 flex items-center gap-2.5 rounded-2 border border-hairline-strong bg-popover pr-2 pl-2.5 text-[13px] text-foreground shadow-[0_10px_26px_color-mix(in_oklab,black_20%,transparent)]"
              style={{
                x: copyX,
                y: copyY,
                width: copyW,
                height: copy.h,
                scale: copyScale,
                scaleX: copyScaleX,
                scaleY: copyScaleY,
                opacity: copyOpacity,
                originY: 1,
              }}
            >
              {React.createElement(ICONS[copyItem.icon] ?? FileText, {
                className: "size-4 shrink-0 text-[var(--fs-ink)]",
              })}
              {!isFolded ? (
                <span className="min-w-0 flex-1 truncate">
                  {copyItem.label}
                </span>
              ) : null}
            </motion.div>
          ) : null}
        </div>

        <p id={hintId} className="sr-only">
          Alt F adds or removes a favourite, Alt with Up or Down reorders one,
          Delete removes one.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </motion.nav>
    </div>
  );
}
