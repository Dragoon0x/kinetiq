"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  CloudOff,
  FileText,
  Inbox,
  Map as MapIcon,
  RotateCcw,
  Send,
  TriangleAlert,
  Wifi,
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

export type ShelfKind = "sheet" | "map";

/** One thing the field app can hold on the device: a job sheet or a map tile set. */
export type ShelfItem = {
  id: string;
  /** Reference, e.g. "JS-4120" or "MAP-07". */
  ref: string;
  title: string;
  kind: ShelfKind;
  /** Where the job is, or a map's scale. */
  site: string;
  /** How much room it takes once cached, in bytes. */
  bytes: number;
  /** When it was last cached, in ms. Absent and the item is not on the device. */
  cachedAt?: number;
};

/** An edit made on the device that has not reached the server yet. */
export type OutboxItem = {
  id: string;
  /** The item it belongs to, by id. */
  itemId: string;
  /** What was edited, e.g. "Note". */
  field: string;
  text: string;
  /** When it was queued, in ms. */
  queuedAt: number;
  /** Set when someone else changed the same field meanwhile; the sync stops at this row and asks. */
  conflict?: { author: string; theirs: string };
};

export type ShelfChoice = "mine" | "theirs";
export type ShelfPinChange = { id: string; pinned: boolean };
export type ShelfPosition = "foot" | "side";
export type ShelfDensity = "compact" | "cozy" | "roomy";
export type ShelfAccent = "cobalt" | "success" | "ink";
export type ShelfStatus = "ready" | "loading" | "error";

export type OfflineShelfProps = {
  /** Every item the list shows, in order. @default defaultShelfItems */
  items?: ShelfItem[];
  /** Whether the device can reach the server. Driven by the host. @default true */
  online?: boolean;
  /** Controlled outbox: edits waiting to be sent. */
  outbox?: OutboxItem[];
  /** Initial outbox when uncontrolled. @default defaultShelfOutbox */
  defaultOutbox?: OutboxItem[];
  /** Fires with the whole outbox after a note is queued, sent or resolved. */
  onOutboxChange?: (outbox: OutboxItem[]) => void;
  /** An edit reached the server. It has already left the outbox. */
  onSync?: (item: OutboxItem) => void;
  /** A conflict was settled with Keep mine or Take theirs. */
  onResolveConflict?: (item: OutboxItem, choice: ShelfChoice) => void;
  /** Controlled: ids of the items kept on the device. */
  pinned?: string[];
  /** Initial pins when uncontrolled. @default defaultShelfPinned */
  defaultPinned?: string[];
  /** Fires from the switch or key that pinned or unpinned an item. */
  onPinChange?: (pinned: string[], change: ShelfPinChange) => void;
  /** An item was opened with Enter or a press. */
  onOpenItem?: (item: ShelfItem) => void;
  /** Room the device gives the cache, in bytes. A pin that would exceed it is refused. @default 64 MiB */
  budgetBytes?: number;
  /** The moment ages count from and new timestamps take, in ms — never read from the clock. @default defaultShelfNow */
  now?: number;
  /** Where the shelf comes from: up from the foot of the list, or in from its side on wide containers. @default "foot" */
  shelfPosition?: ShelfPosition;
  /** Row heights and type size. @default "cozy" */
  density?: ShelfDensity;
  /** The colour pins, the shelf and the meter are drawn in: cobalt, green or ink. @default "cobalt" */
  accent?: ShelfAccent;
  /** Whether the list has arrived. @default "ready" */
  status?: ShelfStatus;
  /** Retry was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Today's jobs" */
  title?: string;
  /** The line under it. @default "Fieldline Field · Coldbrook run" */
  subtitle?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the list, the shelf and the outbox scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be pinned, queued or resolved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MB = 1_048_576;

/** Monday 12 October 2026, 09:30 UTC — the crew is on site, out of signal. */
export const defaultShelfNow = Date.UTC(2026, 9, 12, 9, 30);

const mb = (n: number) => Math.round(n * MB);

/** Twelve items on a Coldbrook run: seven cached (five sheets, two maps), five not. */
export const defaultShelfItems: ShelfItem[] = [
  {
    id: "js-4120",
    ref: "JS-4120",
    title: "Replace meter bank",
    kind: "sheet",
    site: "Coldbrook depot",
    bytes: mb(2.4),
    cachedAt: defaultShelfNow - 20 * MIN,
  },
  {
    id: "js-4123",
    ref: "JS-4123",
    title: "Valve chamber survey",
    kind: "sheet",
    site: "Fernmoor",
    bytes: mb(3.1),
    cachedAt: defaultShelfNow - 2 * HOUR,
  },
  {
    id: "js-4127",
    ref: "JS-4127",
    title: "Cable joint repair",
    kind: "sheet",
    site: "Basin Road",
    bytes: mb(1.8),
    cachedAt: defaultShelfNow - 2 * HOUR,
  },
  {
    id: "map-07",
    ref: "MAP-07",
    title: "Coldbrook district",
    kind: "map",
    site: "1:5000",
    bytes: mb(18.4),
    cachedAt: defaultShelfNow - 26 * HOUR,
  },
  {
    id: "js-4131",
    ref: "JS-4131",
    title: "Riser swap",
    kind: "sheet",
    site: "Harrow Lane",
    bytes: mb(2.2),
    cachedAt: defaultShelfNow - 3 * HOUR,
  },
  {
    id: "js-4138",
    ref: "JS-4138",
    title: "Trench backfill",
    kind: "sheet",
    site: "Fernmoor",
    bytes: mb(2.0),
  },
  {
    id: "js-4134",
    ref: "JS-4134",
    title: "Pump house wiring",
    kind: "sheet",
    site: "Coldbrook",
    bytes: mb(4.6),
    cachedAt: defaultShelfNow - 3 * DAY,
  },
  {
    id: "map-11",
    ref: "MAP-11",
    title: "Fernmoor north",
    kind: "map",
    site: "1:5000",
    bytes: mb(14.9),
    cachedAt: defaultShelfNow - 6 * DAY,
  },
  {
    id: "js-4140",
    ref: "JS-4140",
    title: "Hydrant service",
    kind: "sheet",
    site: "Basin Road",
    bytes: mb(1.6),
  },
  {
    id: "js-4142",
    ref: "JS-4142",
    title: "Duct clearance",
    kind: "sheet",
    site: "Harrow Lane",
    bytes: mb(2.9),
  },
  {
    id: "map-12",
    ref: "MAP-12",
    title: "Basin Road corridor",
    kind: "map",
    site: "1:2500",
    bytes: mb(21.3),
  },
  {
    id: "js-4145",
    ref: "JS-4145",
    title: "Main tie-in",
    kind: "sheet",
    site: "Coldbrook depot",
    bytes: mb(3.4),
  },
];

/** The seven items already on the device. */
export const defaultShelfPinned: string[] = defaultShelfItems
  .filter((item) => item.cachedAt !== undefined)
  .map((item) => item.id);

/** Two notes written out of signal; the second collides with one Mara left. */
export const defaultShelfOutbox: OutboxItem[] = [
  {
    id: "o-1",
    itemId: "js-4120",
    field: "Note",
    text: "Cabinet needs a second key; the depot holds one.",
    queuedAt: defaultShelfNow - 35 * MIN,
  },
  {
    id: "o-2",
    itemId: "js-4123",
    field: "Note",
    text: "Chamber lid cracked, needs replacing before winter.",
    queuedAt: defaultShelfNow - 12 * MIN,
    conflict: {
      author: "Mara Lind",
      theirs: "Lid replaced on Friday; the survey can go ahead.",
    },
  },
];

export const defaultShelfBudget = 64 * MB;

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<ShelfAccent, string> = {
  cobalt: "var(--accent-bright)",
  success: "var(--success)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  ShelfDensity,
  { row: string; text: string; sub: string; pad: string; outbox: string }
> = {
  compact: {
    row: "min-h-8 py-1",
    text: "text-[12px] leading-4",
    sub: "text-[10px]",
    pad: "py-1",
    outbox: "py-1.5",
  },
  cozy: {
    row: "min-h-10 py-1.5",
    text: "text-[13px] leading-[18px]",
    sub: "text-[11px]",
    pad: "py-1.5",
    outbox: "py-2",
  },
  roomy: {
    row: "min-h-12 py-2",
    text: "text-[13px] leading-5",
    sub: "text-[11px]",
    pad: "py-2",
    outbox: "py-2.5",
  },
};

/** The drain's beats, in ms: a breath before a row starts, its fill, its tick. */
const START_MS = 240;
const FILL_MS = 900;
const TICK_MS = 560;
/** How long a pin waits for its bytes once the connection is back. */
const FETCH_MS = 720;
const FLASH_MS = 900;
const WIDE_PX = 640;
/** Where a conflicting row's bar stops. */
const CONFLICT_AT = 0.62;

/** A push pin, drawn as one stroke so its outline can be traced in. */
const PIN_PATH =
  "M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

/** "2.4 MB", "640 KB". */
export const formatBytes = (bytes: number): string => {
  if (bytes >= MB) {
    const n = bytes / MB;
    return `${n >= 100 ? Math.round(n) : n.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

/** "just now", "20 min ago", "2 h ago", "3 d ago". */
export const formatAge = (at: number, now: number): string => {
  const diff = Math.max(0, now - at);
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.round(diff / MIN)} min ago`;
  if (diff < DAY) return `${Math.round(diff / HOUR)} h ago`;
  return `${Math.round(diff / DAY)} d ago`;
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** Which row an arrow or Home/End asks for, or null for any other key. */
const navTarget = (key: string, i: number, n: number): number | null => {
  const to =
    key === "ArrowDown"
      ? i + 1
      : key === "ArrowUp"
        ? i - 1
        : key === "Home"
          ? 0
          : key === "End"
            ? n - 1
            : null;
  return to === null ? null : clamp(to, 0, n - 1);
};

type Syncing = { id: string; phase: "fill" | "tick" };

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Pin                                    */
/* ----------------------------------------------------------------------- */

/** A push pin whose outline draws in on flick when it is set. */
function PinGlyph({
  on,
  waiting,
  motionSafe,
}: {
  on: boolean;
  waiting: boolean;
  motionSafe: boolean;
}) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-3.5">
      <motion.path
        d={PIN_PATH}
        fill={on && !waiting ? "currentColor" : "none"}
        fillOpacity={0.22}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={on ? undefined : "2.5 2.5"}
        initial={false}
        animate={{ pathLength: 1, opacity: on ? 1 : 0.55 }}
        transition={
          motionSafe
            ? {
                pathLength: springs.flick,
                opacity: { duration: durations.fast },
              }
            : { duration: 0 }
        }
        style={{ pathLength: 1 }}
      />
      {on ? (
        <motion.path
          key="draw"
          d={PIN_PATH}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={motionSafe ? { pathLength: 0, opacity: 1 } : false}
          animate={{ pathLength: 1, opacity: 0 }}
          transition={
            motionSafe
              ? {
                  pathLength: springs.flick,
                  opacity: { duration: durations.base, delay: durations.fast },
                }
              : { duration: 0 }
          }
        />
      ) : null}
    </svg>
  );
}

type PinSwitchProps = {
  on: boolean;
  waiting: boolean;
  itemLabel: string;
  tabIndex: number;
  disabled: boolean;
  motionSafe: boolean;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function PinSwitch({
  on,
  waiting,
  itemLabel,
  tabIndex,
  disabled,
  motionSafe,
  nodeRef,
  onToggle,
  onNav,
}: PinSwitchProps) {
  return (
    <button
      ref={nodeRef}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Keep ${itemLabel} offline${waiting ? ", fetching when online" : ""}`}
      aria-disabled={disabled || undefined}
      tabIndex={tabIndex}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
          return;
        }
        onNav(event);
      }}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-2 transition-colors",
        on ? "text-(--os-accent)" : "text-ink-3 hover:text-ink-2",
        !disabled && "hover:bg-surface-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <PinGlyph on={on} waiting={waiting} motionSafe={motionSafe} />
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Tick                                    */
/* ----------------------------------------------------------------------- */

function Tick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5">
      <motion.circle
        cx={7}
        cy={7}
        r={6}
        fill="var(--os-accent)"
        initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
        style={{ transformOrigin: "7px 7px" }}
      />
      <motion.path
        d="M4 7.3 6.2 9.5 10 5.2"
        fill="none"
        stroke="var(--bg-0)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={
          motionSafe ? { ...springs.flick, delay: 0.05 } : { duration: 0 }
        }
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * The offline state of a field app. A connection banner runs along the top;
 * losing the connection slides the offline band down on `springs.snap`, dims
 * every row of the job list that is not on the device, and brings up a shelf
 * of what is — each item with its cached-at age and size — from the foot of
 * the list (or its side) on `springs.glide`. A note written meanwhile joins
 * the outbox, its count rolling on snap. When the connection returns the
 * outbox drains one row at a time: the row's bar fills on glide, a tick draws
 * on `springs.flick`, and the row leaves on an exit tween while the rest
 * glide up. A row someone else also edited stops short and stays, offering
 * Keep mine or Take theirs.
 *
 * A storage meter holds the cached bytes against the device's budget; a pin
 * switch on every row keeps it or lets it go, the pin drawing on flick, and a
 * pin that would not fit is refused with the overage in words. Pinned out of
 * signal, an item waits on the shelf and fetches once the connection is back.
 *
 * The list and the shelf are listboxes (arrows, Home/End, Enter opens, Space
 * pins, Delete unpins on the shelf), the pin is a switch, the conflict choice
 * is a radio group and the banner is a status region. Under reduced motion
 * the band and the shelf cross-fade in place, bars and ticks appear at once,
 * and every change is still announced.
 */
export function OfflineShelf({
  items = defaultShelfItems,
  online = true,
  outbox,
  defaultOutbox = defaultShelfOutbox,
  onOutboxChange,
  onSync,
  onResolveConflict,
  pinned,
  defaultPinned = defaultShelfPinned,
  onPinChange,
  onOpenItem,
  budgetBytes = defaultShelfBudget,
  now = defaultShelfNow,
  shelfPosition = "foot",
  density = "cozy",
  accent = "cobalt",
  status = "ready",
  onRetry,
  title = "Today's jobs",
  subtitle = "Fieldline Field · Coldbrook run",
  label,
  height = 540,
  disabled = false,
  className,
}: OfflineShelfProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const shelfId = `${uid}-shelf`;
  const meterId = `${uid}-meter`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownOutbox, setOwnOutbox] = React.useState<OutboxItem[]>(defaultOutbox);
  const queue = outbox ?? ownOutbox;
  const [ownPinned, setOwnPinned] = React.useState<string[]>(defaultPinned);
  const pins = pinned ?? ownPinned;
  /** Per item: a cached-at stamp set here, or null once it was let go. */
  const [cache, setCache] = React.useState<Record<string, number | null>>({});
  const [syncing, setSyncing] = React.useState<Syncing | null>(null);
  /** Rows whose sync stopped on a conflict. */
  const [parked, setParked] = React.useState<string[]>([]);
  const [choice, setChoice] = React.useState<Record<string, ShelfChoice>>({});
  const [draft, setDraft] = React.useState("");
  const [activeItem, setActiveItem] = React.useState<string | null>(null);
  const [activeShelf, setActiveShelf] = React.useState<string | null>(null);
  const [shelfOpen, setShelfOpen] = React.useState(false);
  const [wide, setWide] = React.useState(false);
  /** Counts refused pins; above zero the meter flashes, and an effect clears it. */
  const [overFlash, setOverFlash] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState<{
    where: "list" | "shelf" | "pin" | "toggle";
    id: string;
    seq: number;
  } | null>(null);
  // False for the server render and hydration, so the drain's first beat
  // and the shelf's first placement never animate from nowhere.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const listNodes = React.useRef(new Map<string, HTMLElement>());
  const pinNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const shelfNodes = React.useRef(new Map<string, HTMLElement>());
  const toggleRef = React.useRef<HTMLButtonElement | null>(null);
  const counter = React.useRef(0);

  const ready = status === "ready";
  const inert = disabled || !ready;

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(items.map((item) => [item.id, item]));
  const cachedAtOf = (item: ShelfItem): number | undefined => {
    const c = cache[item.id];
    return c === null ? undefined : (c ?? item.cachedAt);
  };
  // The shelf keeps the list's order, so an item sits where the eye expects it.
  const pinnedItems = items.filter((item) => pins.includes(item.id));
  const cachedItems = pinnedItems.filter((i) => cachedAtOf(i) !== undefined);
  const waitingItems = pinnedItems.filter((i) => cachedAtOf(i) === undefined);
  const usedBytes = cachedItems.reduce((a, i) => a + i.bytes, 0);
  const waitingBytes = waitingItems.reduce((a, i) => a + i.bytes, 0);
  const isPinned = (id: string) => pins.includes(id);
  const available = (item: ShelfItem) =>
    isPinned(item.id) && cachedAtOf(item) !== undefined;
  const dimmed = (item: ShelfItem) => !online && !available(item);

  const listIds = items.map((i) => i.id);
  const activeId =
    activeItem && byId.has(activeItem) ? activeItem : (listIds[0] ?? null);
  const activeRecord = activeId ? byId.get(activeId) : undefined;
  const shelfIds = pinnedItems.map((i) => i.id);
  const activeShelfId =
    activeShelf && shelfIds.includes(activeShelf)
      ? activeShelf
      : (shelfIds[0] ?? null);

  const shelfUp = ready && (!online || shelfOpen);
  const sideShelf = shelfPosition === "side" && wide;
  const pending = queue.filter((o) => !parked.includes(o.id));
  const conflicts = queue.filter((o) => parked.includes(o.id));
  const draining = online && !inert && syncing !== null;

  /* ------------------------------- commits ----------------------------- */

  const commitQueue = (next: OutboxItem[]) => {
    if (outbox === undefined) setOwnOutbox(next);
    onOutboxChange?.(next);
  };
  const commitPins = (next: string[], change: ShelfPinChange) => {
    if (pinned === undefined) setOwnPinned(next);
    onPinChange?.(next, change);
  };
  const announce = (text: string) => setAnnouncement(text);
  const refOf = (itemId: string) => byId.get(itemId)?.ref ?? itemId;

  /* -------------------------------- drain ------------------------------ */

  const begin = (id: string) => setSyncing({ id, phase: "fill" });

  const advance = (s: Syncing) => {
    const item = queue.find((o) => o.id === s.id);
    if (!item) {
      setSyncing(null);
      return;
    }
    if (s.phase === "fill") {
      if (item.conflict) {
        setParked((p) => (p.includes(item.id) ? p : [...p, item.id]));
        setSyncing(null);
        announce(
          `Conflict on ${refOf(item.itemId)}: ${item.conflict.author} also changed this ${item.field.toLowerCase()}. Keep mine or take theirs.`,
        );
      } else {
        setSyncing({ id: item.id, phase: "tick" });
      }
      return;
    }
    const next = queue.filter((o) => o.id !== item.id);
    commitQueue(next);
    onSync?.(item);
    setSyncing(null);
    const left = next.length;
    announce(
      `Sent ${item.field.toLowerCase()} on ${refOf(item.itemId)}. ${left === 0 ? "Outbox empty." : `${left} left.`}`,
    );
  };

  const fetchWaiting = (ids: string[]) => {
    setCache((c) => {
      const next = { ...c };
      for (const id of ids) next[id] = now;
      return next;
    });
    announce(
      `Fetched ${plural(ids.length, "pinned item", "pinned items")} for the shelf.`,
    );
  };

  // The latest closures, read from timers so a beat never fires stale.
  const step = React.useRef({ begin, advance, fetchWaiting });
  React.useEffect(() => {
    step.current = { begin, advance, fetchWaiting };
  });

  // Losing the connection (or the data) stops a row mid-fill; it tries again
  // from the start once the connection is back.
  React.useEffect(() => {
    if (online && !inert) return;
    const t = window.setTimeout(() => setSyncing(null), 0);
    return () => window.clearTimeout(t);
  }, [online, inert]);

  const pendingKey = pending.map((o) => o.id).join(",");
  React.useEffect(() => {
    if (!online || inert || syncing !== null) return;
    const nextId = pendingKey.split(",").find((id) => id !== "");
    if (!nextId) return;
    const t = window.setTimeout(() => step.current.begin(nextId), START_MS);
    return () => window.clearTimeout(t);
  }, [online, inert, syncing, pendingKey]);

  React.useEffect(() => {
    if (!syncing || !online || inert) return;
    const t = window.setTimeout(
      () => step.current.advance(syncing),
      syncing.phase === "fill" ? FILL_MS : TICK_MS,
    );
    return () => window.clearTimeout(t);
  }, [syncing, online, inert]);

  const waitingKey = waitingItems.map((i) => i.id).join(",");
  React.useEffect(() => {
    if (!online || inert || waitingKey === "") return;
    const ids = waitingKey.split(",");
    const t = window.setTimeout(() => step.current.fetchWaiting(ids), FETCH_MS);
    return () => window.clearTimeout(t);
  }, [online, inert, waitingKey]);

  /* ------------------------------ measuring ---------------------------- */

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? root.clientWidth;
      setWide(w >= WIDE_PX);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // A refused pin flashes the meter; another refusal restarts the flash.
  React.useEffect(() => {
    if (overFlash === 0) return;
    const t = window.setTimeout(() => setOverFlash(0), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [overFlash]);

  // Focus follows an action to where its result lives — bound after the DOM
  // settled, so an unpinned row's neighbour is there to take it.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      focusReq.where === "list"
        ? listNodes.current.get(focusReq.id)
        : focusReq.where === "shelf"
          ? shelfNodes.current.get(focusReq.id)
          : focusReq.where === "pin"
            ? pinNodes.current.get(focusReq.id)
            : toggleRef.current;
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  const requestFocus = (
    where: "list" | "shelf" | "pin" | "toggle",
    id: string,
  ) => setFocusReq((f) => ({ where, id, seq: (f?.seq ?? 0) + 1 }));

  /* ------------------------------- actions ----------------------------- */

  const togglePin = (id: string, from: "list" | "shelf" | "pin") => {
    if (inert) return;
    const item = byId.get(id);
    if (!item) return;
    if (isPinned(id)) {
      const i = shelfIds.indexOf(id);
      const neighbour = shelfIds[i + 1] ?? shelfIds[i - 1];
      const next = pins.filter((p) => p !== id);
      commitPins(next, { id, pinned: false });
      setCache((c) => ({ ...c, [id]: null }));
      const freed = cachedAtOf(item) !== undefined ? item.bytes : 0;
      announce(
        `${item.ref} unpinned. ${formatBytes(usedBytes - freed)} of ${formatBytes(budgetBytes)} used.`,
      );
      if (from === "shelf") {
        if (neighbour) requestFocus("shelf", neighbour);
        else requestFocus("toggle", id);
      }
      return;
    }
    if (usedBytes + waitingBytes + item.bytes > budgetBytes) {
      const over = usedBytes + waitingBytes + item.bytes - budgetBytes;
      announce(
        `Not enough room for ${item.ref}: ${formatBytes(over)} over the budget. Unpin something first.`,
      );
      setOverFlash((n) => n + 1);
      return;
    }
    const next = [...pins, id];
    commitPins(next, { id, pinned: true });
    if (online) {
      setCache((c) => ({ ...c, [id]: now }));
      announce(
        `${item.ref} pinned. ${formatBytes(usedBytes + item.bytes)} of ${formatBytes(budgetBytes)} used.`,
      );
    } else {
      setCache((c) => ({ ...c, [id]: null }));
      announce(`${item.ref} pinned. It fetches when the connection returns.`);
    }
  };

  const open = (item: ShelfItem) => {
    if (inert) return;
    if (dimmed(item)) {
      announce(`${item.ref} is not on the device. Pin it to keep it offline.`);
      return;
    }
    onOpenItem?.(item);
  };

  const queueNote = () => {
    const text = draft.trim();
    if (inert || !activeRecord || text === "") return;
    counter.current += 1;
    const item: OutboxItem = {
      id: `${uid}-o${counter.current}`,
      itemId: activeRecord.id,
      field: "Note",
      text,
      queuedAt: now,
    };
    const next = [...queue, item];
    commitQueue(next);
    setDraft("");
    announce(
      `Note on ${activeRecord.ref} ${online ? "sending" : "queued"}. ${plural(next.length, "edit", "edits")} in the outbox.`,
    );
  };

  const resolve = (id: string) => {
    if (inert) return;
    const item = queue.find((o) => o.id === id);
    if (!item?.conflict) return;
    const pick = choice[id] ?? "mine";
    if (pick === "theirs") {
      commitQueue(queue.filter((o) => o.id !== id));
      announce(
        `Took ${item.conflict.author}'s ${item.field.toLowerCase()} on ${refOf(item.itemId)}.`,
      );
    } else {
      commitQueue(
        queue.map((o) => (o.id === id ? { ...o, conflict: undefined } : o)),
      );
      announce(
        `Keeping your ${item.field.toLowerCase()} on ${refOf(item.itemId)}; sending.`,
      );
    }
    setParked((p) => p.filter((x) => x !== id));
    onResolveConflict?.(item, pick);
  };

  const closeShelf = () => {
    if (!online) return;
    setShelfOpen(false);
    requestFocus("toggle", "");
  };

  /* ------------------------------- render ------------------------------ */

  const accentColor = ACCENTS[accent] ?? ACCENTS.cobalt;
  const fill = budgetBytes > 0 ? clamp(usedBytes / budgetBytes, 0, 1) : 0;
  const reserve =
    budgetBytes > 0 ? clamp((usedBytes + waitingBytes) / budgetBytes, 0, 1) : 0;
  const tight = fill > 0.9;
  const flashing = overFlash > 0;
  const shelfBytes = formatBytes(usedBytes);
  const step1 = cascade(Math.min(items.length, 10));

  const shelfEnter = motionSafe
    ? sideShelf
      ? { x: "100%", y: 0, opacity: 1 }
      : { x: 0, y: "100%", opacity: 1 }
    : { x: 0, y: 0, opacity: 0 };
  const shelfExit = motionSafe
    ? sideShelf
      ? { x: "100%", transition: exitFor(durations.slow) }
      : { y: "100%", transition: exitFor(durations.slow) }
    : { opacity: 0, transition: exitFor(durations.fast) };

  const renderMain = () => {
    if (status === "error") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The job list didn&apos;t load.
          </p>
          <p className="max-w-[26ch] text-[12px] text-ink-3">
            {online
              ? "Fieldline didn't answer."
              : "There is no connection; what is on the shelf still opens."}
          </p>
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
              Retry
            </button>
          ) : null}
        </div>
      );
    }
    if (status === "loading") {
      return (
        <div aria-hidden className="flex flex-col gap-1.5 px-3 py-2">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-1"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="size-4 shrink-0 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              <span
                className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${34 + ((i * 29) % 40)}%` }}
              />
              <span className="ml-auto h-3 w-10 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-ink-2">No jobs on this run.</p>
        </div>
      );
    }
    return (
      <ul
        role="listbox"
        aria-label={title}
        aria-describedby={hintId}
        className={cn(
          "flex flex-col px-2 py-1.5",
          shelfUp && !sideShelf && "pb-28",
        )}
      >
        {items.map((item, i) => {
          const on = isPinned(item.id);
          const waiting = on && cachedAtOf(item) === undefined;
          const dim = dimmed(item);
          const active = item.id === activeId;
          const Icon = item.kind === "map" ? MapIcon : FileText;
          return (
            <motion.li
              key={item.id}
              id={`${uid}-item-${item.id}`}
              role="option"
              aria-selected={active}
              aria-disabled={dim || undefined}
              aria-label={`${item.ref}, ${item.title}, ${item.site}, ${formatBytes(item.bytes)}${on ? (waiting ? ", pinned, fetching when online" : ", on the device") : ""}${dim ? ", not available offline" : ""}`}
              tabIndex={active ? 0 : -1}
              ref={(node) => {
                if (node) listNodes.current.set(item.id, node);
                else listNodes.current.delete(item.id);
              }}
              onFocus={() => setActiveItem(item.id)}
              onClick={() => {
                setActiveItem(item.id);
                open(item);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  open(item);
                  return;
                }
                if (
                  event.key === " " ||
                  event.key === "p" ||
                  event.key === "P"
                ) {
                  event.preventDefault();
                  togglePin(item.id, "list");
                  return;
                }
                const to = navTarget(event.key, i, items.length);
                if (to === null) return;
                event.preventDefault();
                const target = items[to];
                if (target) listNodes.current.get(target.id)?.focus();
              }}
              initial={
                live && motionSafe ? { opacity: 0, y: distances.nudge } : false
              }
              animate={{ opacity: dim ? 0.42 : 1, y: 0 }}
              transition={{
                opacity: { duration: durations.base, ease: easings.enter },
                y: motionSafe
                  ? { ...springs.glide, delay: r3(Math.min(i, 10) * step1) }
                  : { duration: 0 },
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-2 px-2 transition-colors",
                d.row,
                active && "bg-surface-1",
                !inert && "hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <Icon
                aria-hidden
                className={cn(
                  "size-4 shrink-0",
                  on && !waiting ? "text-(--os-accent)" : "text-ink-3",
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn("flex items-baseline gap-2", d.text)}>
                  <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                    {item.ref}
                  </span>
                  <span className="truncate text-foreground">{item.title}</span>
                </span>
                <span className={cn("truncate text-ink-3", d.sub)}>
                  {item.site}
                  <span aria-hidden> · </span>
                  {formatBytes(item.bytes)}
                  {waiting ? (
                    <>
                      <span aria-hidden> · </span>
                      <span className="text-warn">fetches when online</span>
                    </>
                  ) : null}
                </span>
              </span>
              <PinSwitch
                on={on}
                waiting={waiting}
                itemLabel={item.ref}
                tabIndex={active ? 0 : -1}
                disabled={inert}
                motionSafe={motionSafe}
                nodeRef={(node) => {
                  if (node) pinNodes.current.set(item.id, node);
                  else pinNodes.current.delete(item.id);
                }}
                onToggle={() => togglePin(item.id, "pin")}
                onNav={(event) => {
                  const to = navTarget(event.key, i, items.length);
                  if (to === null) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const target = items[to];
                  if (target) {
                    setActiveItem(target.id);
                    pinNodes.current.get(target.id)?.focus();
                  }
                }}
              />
            </motion.li>
          );
        })}
      </ul>
    );
  };

  // The shelf's rows are built here, at the top of the component, so the
  // closures that register their nodes are created in render proper rather
  // than inside the shelf's helper below.
  const shelfRows = pinnedItems.map((item, i) => {
    const at = cachedAtOf(item);
    const active = item.id === activeShelfId;
    const Icon = item.kind === "map" ? MapIcon : FileText;
    return (
      <motion.li
        key={item.id}
        id={`${uid}-shelf-${item.id}`}
        role="option"
        aria-selected={active}
        aria-label={`${item.ref}, ${item.title}, ${at === undefined ? "fetches when online" : `cached ${formatAge(at, now)}`}, ${formatBytes(item.bytes)}`}
        tabIndex={active ? 0 : -1}
        ref={(node) => {
          if (node) shelfNodes.current.set(item.id, node);
          else shelfNodes.current.delete(item.id);
        }}
        layout={motionSafe ? "position" : false}
        initial={{
          opacity: 0,
          y: motionSafe ? distances.nudge : 0,
        }}
        animate={{ opacity: at === undefined ? 0.6 : 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{
          layout: springs.glide,
          y: motionSafe ? springs.glide : { duration: 0 },
          opacity: {
            duration: durations.base,
            ease: easings.enter,
          },
        }}
        onFocus={() => setActiveShelf(item.id)}
        onClick={() => {
          setActiveShelf(item.id);
          open(item);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            open(item);
            return;
          }
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            togglePin(item.id, "shelf");
            return;
          }
          const to = navTarget(event.key, i, pinnedItems.length);
          if (to === null) return;
          event.preventDefault();
          const target = pinnedItems[to];
          if (target) shelfNodes.current.get(target.id)?.focus();
        }}
        className={cn(
          "flex cursor-pointer items-center gap-2.5 rounded-2 px-2 transition-colors",
          d.row,
          active && "bg-surface-1",
          !inert && "hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        <Icon aria-hidden className="size-4 shrink-0 text-(--os-accent)" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("flex items-baseline gap-2", d.text)}>
            <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {item.ref}
            </span>
            <span className="truncate">{item.title}</span>
          </span>
          <span className={cn("truncate text-ink-3", d.sub)}>
            {at === undefined ? (
              <span className="text-warn">fetches when online</span>
            ) : (
              `cached ${formatAge(at, now)}`
            )}
            <span aria-hidden> · </span>
            {formatBytes(item.bytes)}
          </span>
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Unpin ${item.ref}`}
          aria-disabled={inert || undefined}
          onClick={(event) => {
            event.stopPropagation();
            togglePin(item.id, "shelf");
          }}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <X aria-hidden className="size-3" />
        </button>
      </motion.li>
    );
  });

  const renderShelf = () => {
    return (
      <motion.section
        key="shelf"
        id={shelfId}
        aria-labelledby={`${shelfId}-title`}
        initial={live ? shelfEnter : false}
        animate={{ x: 0, y: 0, opacity: 1 }}
        exit={shelfExit}
        transition={
          motionSafe
            ? { ...springs.glide, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
        onKeyDown={(event) => {
          if (event.key === "Escape" && online) {
            event.preventDefault();
            closeShelf();
          }
        }}
        className={cn(
          "absolute z-10 flex flex-col overflow-hidden bg-card",
          sideShelf
            ? "inset-y-0 right-0 w-[16.5rem] border-l border-hairline-strong"
            : "inset-x-0 bottom-0 max-h-[62%] rounded-t-3 border-t border-hairline-strong shadow-[0_-14px_34px_-18px_color-mix(in_oklab,black_55%,transparent)]",
        )}
      >
        <header className="flex shrink-0 items-center gap-2 border-b border-hairline px-3 py-2">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-(--os-accent)"
          />
          <p
            id={`${shelfId}-title`}
            className="min-w-0 flex-1 truncate text-[12px] font-semibold"
          >
            On the shelf
            <span className="ml-1.5 font-mono text-[10px] font-normal text-ink-3 tabular-nums">
              {pinnedItems.length}
              <span aria-hidden> · </span>
              {shelfBytes}
            </span>
          </p>
          {online ? (
            <button
              type="button"
              onClick={closeShelf}
              aria-label="Hide the shelf"
              className={cn(
                "flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          ) : (
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              offline
            </span>
          )}
        </header>
        {pinnedItems.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-6 text-center">
            <span className="text-(--os-accent)">
              <PinGlyph on={false} waiting={false} motionSafe={false} />
            </span>
            <p className="text-[13px] text-ink-2">Nothing cached yet.</p>
            <p className="text-[11px] text-ink-3">Pin an item to keep it.</p>
          </div>
        ) : (
          <ul
            role="listbox"
            aria-label="Available offline"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 py-1.5"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {shelfRows}
            </AnimatePresence>
          </ul>
        )}
      </motion.section>
    );
  };

  const renderOutbox = () => {
    if (status === "loading") {
      return (
        <div aria-hidden className="flex flex-col gap-2 px-3 py-2.5">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span className="h-2.5 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-3 w-full rounded-1 bg-surface-2 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") {
      return (
        <p className="px-3 py-3 text-[11px] text-ink-3">
          The outbox is kept on the device; it sends once the list is back.
        </p>
      );
    }
    if (queue.length === 0) {
      return (
        <p className="px-3 py-3 text-[11px] text-ink-3">
          Nothing waiting. A note written out of signal lands here.
        </p>
      );
    }
    return (
      <ul role="list" aria-label="Outbox" className="flex flex-col px-2 py-1">
        <AnimatePresence initial={false} mode="popLayout">
          {queue.map((o) => {
            const isSyncing = draining && syncing?.id === o.id;
            const phase = isSyncing ? syncing.phase : null;
            const conflict = parked.includes(o.id) && o.conflict;
            const pick = choice[o.id] ?? "mine";
            const progress = conflict
              ? CONFLICT_AT
              : phase === "fill" || phase === "tick"
                ? 1
                : 0;
            const state = conflict
              ? "conflict"
              : phase === "tick"
                ? "sent"
                : phase === "fill"
                  ? "sending"
                  : online
                    ? "waiting"
                    : "queued";
            return (
              <motion.li
                key={o.id}
                layout={motionSafe ? "position" : false}
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  x: motionSafe ? distances.shift : 0,
                  transition: exitFor(durations.base),
                }}
                transition={{
                  layout: springs.glide,
                  y: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-2 px-2",
                  d.outbox,
                  conflict &&
                    "bg-[color-mix(in_oklab,var(--warn)_9%,transparent)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {phase === "tick" ? (
                      <Tick motionSafe={motionSafe} />
                    ) : conflict ? (
                      <TriangleAlert
                        aria-hidden
                        className="size-3.5 text-warn"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 rounded-full",
                          phase === "fill" ? "bg-(--os-accent)" : "bg-ink-3",
                        )}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12px]">
                    <span className="text-foreground">{o.field}</span>
                    <span aria-hidden className="text-ink-3">
                      {" "}
                      ·{" "}
                    </span>
                    <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                      {refOf(o.itemId)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase",
                      state === "conflict"
                        ? "text-warn"
                        : state === "sent" || state === "sending"
                          ? "text-(--os-accent)"
                          : "text-ink-3",
                    )}
                  >
                    {state === "queued" ? formatAge(o.queuedAt, now) : state}
                  </span>
                </div>
                <p className="truncate pl-[22px] text-[12px] text-ink-2">
                  {o.text}
                </p>
                <span
                  aria-hidden
                  className="ml-[22px] block h-0.5 overflow-hidden rounded-full bg-surface-2"
                >
                  <motion.span
                    className={cn(
                      "block h-full w-full",
                      conflict ? "bg-warn" : "bg-(--os-accent)",
                    )}
                    style={{ originX: 0 }}
                    initial={false}
                    animate={{ scaleX: progress }}
                    transition={
                      // Fills on glide; a bar going back to zero (the
                      // connection dropped mid-row) just resets.
                      motionSafe && progress > 0
                        ? springs.glide
                        : { duration: 0 }
                    }
                  />
                </span>
                {conflict ? (
                  <div className="mt-1 flex flex-col gap-1.5 pl-[22px]">
                    <p className="text-[11px] text-ink-3">
                      {o.conflict?.author} also wrote:{" "}
                      <span className="text-ink-2">
                        &ldquo;{o.conflict?.theirs}&rdquo;
                      </span>
                    </p>
                    <div
                      role="radiogroup"
                      aria-label={`Resolve the ${o.field.toLowerCase()} on ${refOf(o.itemId)}`}
                      className="flex flex-wrap items-center gap-1.5"
                    >
                      {(
                        [
                          ["mine", "Keep mine"],
                          ["theirs", "Take theirs"],
                        ] as const
                      ).map(([value, text]) => {
                        const checked = pick === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            tabIndex={checked ? 0 : -1}
                            aria-disabled={inert || undefined}
                            onClick={() =>
                              setChoice((c) => ({ ...c, [o.id]: value }))
                            }
                            onKeyDown={(event) => {
                              if (
                                event.key === "ArrowLeft" ||
                                event.key === "ArrowRight" ||
                                event.key === "ArrowUp" ||
                                event.key === "ArrowDown"
                              ) {
                                event.preventDefault();
                                const next: ShelfChoice =
                                  value === "mine" ? "theirs" : "mine";
                                setChoice((c) => ({ ...c, [o.id]: next }));
                                const sibling =
                                  event.currentTarget.parentElement?.querySelector<HTMLElement>(
                                    `[data-choice="${next}"]`,
                                  );
                                sibling?.focus();
                              } else if (event.key === "Enter") {
                                event.preventDefault();
                                resolve(o.id);
                              }
                            }}
                            data-choice={value}
                            className={cn(
                              "relative inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] transition-colors",
                              checked
                                ? "border-[color-mix(in_oklab,var(--os-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--os-accent)_12%,transparent)] text-foreground"
                                : "border-hairline-strong text-ink-2 hover:bg-surface-2",
                              FOCUS_RING,
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "flex size-2.5 items-center justify-center rounded-full border",
                                checked
                                  ? "border-(--os-accent)"
                                  : "border-hairline-strong",
                              )}
                            >
                              <motion.span
                                className="block size-1.5 rounded-full bg-(--os-accent)"
                                initial={false}
                                animate={{ scale: checked ? 1 : 0 }}
                                transition={
                                  motionSafe ? springs.snap : { duration: 0 }
                                }
                              />
                            </span>
                            {text}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => resolve(o.id)}
                        aria-disabled={inert || undefined}
                        className={cn(
                          "ml-auto inline-flex h-6 items-center rounded-2 bg-primary px-2 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
                          FOCUS_RING,
                        )}
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                ) : null}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--os-accent" as string]: accentColor,
      }}
    >
      <p id={hintId} className="sr-only">
        Arrows move, Enter opens, Space pins or unpins. On the shelf, Delete
        unpins.
      </p>

      {/* ------------------------------ banner ----------------------------- */}
      <div
        role="status"
        aria-live="polite"
        className="relative h-8 shrink-0 overflow-hidden border-b border-hairline"
      >
        <div
          className={cn(
            "flex h-8 items-center gap-2 px-3 font-mono text-[10px] tracking-[0.08em] uppercase",
            online ? "text-ink-3" : "text-transparent",
          )}
        >
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full bg-success"
          />
          {online ? (
            <>
              <span>Online</span>
              <span aria-hidden>·</span>
              <span className="truncate text-ink-3">
                {draining
                  ? `sending ${plural(pending.length, "edit", "edits")}`
                  : conflicts.length > 0
                    ? `${plural(conflicts.length, "conflict", "conflicts")} to settle`
                    : waitingItems.length > 0
                      ? "fetching pins"
                      : "all synced"}
              </span>
            </>
          ) : null}
        </div>
        <AnimatePresence initial={false}>
          {!online ? (
            <motion.div
              key="offline"
              initial={motionSafe ? { y: "-100%" } : { opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={
                motionSafe
                  ? { y: "-100%", transition: exitFor(durations.base) }
                  : { opacity: 0, transition: exitFor(durations.fast) }
              }
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
              className="absolute inset-0 flex items-center gap-2 bg-[color-mix(in_oklab,var(--warn)_16%,var(--bg-1))] px-3 text-[12px] text-foreground"
            >
              <CloudOff aria-hidden className="size-3.5 shrink-0 text-warn" />
              <span className="min-w-0 truncate">
                <span className="font-medium">Offline</span>
                <span className="text-ink-2">
                  <span aria-hidden> · </span>
                  showing what is on the shelf
                </span>
              </span>
              {queue.length > 0 ? (
                <span className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
                  {plural(queue.length, "edit", "edits")} waiting
                </span>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* ------------------------------ header ----------------------------- */}
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {subtitle}
          </p>
        </div>
        {ready ? (
          <p className="shrink-0 text-right text-[11px] text-ink-3">
            <span className="font-mono text-foreground tabular-nums">
              {cachedItems.length}
            </span>{" "}
            of {items.length} on the device
          </p>
        ) : null}
      </header>

      {/* ------------------------------- body ------------------------------ */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-hairline @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_16rem]">
        {/* main column */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden @min-[40rem]:border-r @min-[40rem]:border-hairline">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {renderMain()}
          </div>
          {ready && online ? (
            <button
              ref={toggleRef}
              type="button"
              aria-expanded={shelfUp}
              aria-controls={shelfUp ? shelfId : undefined}
              onClick={() => setShelfOpen((o) => !o)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2 border-t border-hairline px-3 text-left text-[11px] text-ink-2 transition-colors hover:bg-surface-1 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-(--os-accent)"
              />
              <span className="min-w-0 flex-1 truncate">
                Shelf
                <span aria-hidden> · </span>
                {plural(pinnedItems.length, "item", "items")}
                <span aria-hidden> · </span>
                {shelfBytes}
              </span>
              {shelfUp ? (
                <ChevronDown aria-hidden className="size-3.5 text-ink-3" />
              ) : (
                <ChevronUp aria-hidden className="size-3.5 text-ink-3" />
              )}
            </button>
          ) : null}
          <AnimatePresence initial={false}>
            {shelfUp ? renderShelf() : null}
          </AnimatePresence>
        </div>

        {/* side column */}
        <div className="flex max-h-[46%] shrink-0 flex-col border-t border-hairline @min-[40rem]:max-h-none @min-[40rem]:min-h-0 @min-[40rem]:border-t-0">
          <div className="flex shrink-0 items-center gap-2 px-3 pt-2 pb-1">
            <Send aria-hidden className="size-3.5 text-ink-3" />
            <p className="text-[12px] font-semibold">Outbox</p>
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-[11px] transition-colors",
                queue.length > 0
                  ? "bg-[color-mix(in_oklab,var(--os-accent)_14%,transparent)] text-(--os-accent)"
                  : "bg-surface-2 text-ink-3",
              )}
            >
              <span className="sr-only">
                {plural(queue.length, "edit", "edits")} queued
              </span>
              <Roll value={queue.length} motionSafe={motionSafe} />
            </span>
            {!online && (
              <span className="ml-auto flex items-center gap-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                <Wifi aria-hidden className="size-3 opacity-50" />
                holds
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {renderOutbox()}
          </div>

          {/* composer */}
          <form
            className="flex shrink-0 items-center gap-1.5 border-t border-hairline px-2 py-2"
            onSubmit={(event) => {
              event.preventDefault();
              queueNote();
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={inert || !activeRecord}
              placeholder={
                activeRecord ? `Note on ${activeRecord.ref}` : "Pick a job"
              }
              aria-label={activeRecord ? `Note on ${activeRecord.ref}` : "Note"}
              className={cn(
                "h-7 min-w-0 flex-1 rounded-2 border border-hairline bg-surface-0 px-2 text-[12px] text-foreground placeholder:text-ink-3 disabled:opacity-60",
                FOCUS_RING,
              )}
            />
            <button
              type="submit"
              aria-disabled={
                inert || !activeRecord || draft.trim() === "" || undefined
              }
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border border-hairline px-2 text-[11px] transition-colors",
                !inert && activeRecord && draft.trim() !== ""
                  ? "text-foreground hover:bg-surface-2"
                  : "cursor-default text-ink-3",
                FOCUS_RING,
              )}
            >
              {online ? "Send" : "Queue"}
            </button>
          </form>

          {/* storage meter */}
          <div className="flex shrink-0 flex-col gap-1.5 border-t border-hairline px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p
                id={meterId}
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                Storage
              </p>
              <p className="font-mono text-[11px] text-ink-2 tabular-nums">
                <span
                  className={cn(
                    tight && "text-warn",
                    flashing && "text-danger",
                  )}
                >
                  {shelfBytes}
                </span>{" "}
                of {formatBytes(budgetBytes)}
              </p>
            </div>
            <div
              role="meter"
              aria-labelledby={meterId}
              aria-valuemin={0}
              aria-valuemax={budgetBytes}
              aria-valuenow={usedBytes}
              aria-valuetext={`${shelfBytes} of ${formatBytes(budgetBytes)} used${waitingBytes > 0 ? `, ${formatBytes(waitingBytes)} waiting to fetch` : ""}`}
              className={cn(
                "relative h-1.5 overflow-hidden rounded-full bg-surface-2 transition-shadow",
                flashing &&
                  "shadow-[0_0_0_2px_color-mix(in_oklab,var(--danger)_45%,transparent)]",
              )}
            >
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0 w-full bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--os-accent)_40%,transparent)_0_3px,transparent_3px_6px)]"
                style={{ originX: 0 }}
                initial={false}
                animate={{ scaleX: reserve }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
              <motion.span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 w-full",
                  flashing
                    ? "bg-danger"
                    : tight
                      ? "bg-warn"
                      : "bg-(--os-accent)",
                )}
                style={{ originX: 0 }}
                initial={false}
                animate={{ scaleX: fill }}
                transition={motionSafe ? springs.glide : { duration: 0 }}
              />
            </div>
            <p className="text-[11px] text-ink-3">
              {flashing ? (
                <span className="text-danger">Not enough room</span>
              ) : waitingBytes > 0 ? (
                `${formatBytes(waitingBytes)} waiting to fetch`
              ) : (
                `${formatBytes(Math.max(0, budgetBytes - usedBytes))} free`
              )}
            </p>
          </div>
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
