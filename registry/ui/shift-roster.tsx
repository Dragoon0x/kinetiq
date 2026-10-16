"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowLeftRight,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag, type DragInfo } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type RosterArea = "plants" | "tills" | "cafe" | "yard";

export type RosterStaff = {
  id: string;
  name: string;
  /** Where they usually work. */
  area: RosterArea;
  /** Contracted hours a week. */
  contract: number;
};

export type RosterShift = {
  id: string;
  /** Who works it; `null` is an open shift nobody has yet. */
  staff: string | null;
  /** 0 is Monday, 6 is Sunday. */
  day: number;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
  area: RosterArea;
};

export type RosterBlockStyle = "soft" | "solid" | "outline";
export type RosterPalette = "garden" | "cool" | "mono";
export type RosterStatus = "ready" | "loading" | "error";

export type ShiftRosterProps = {
  /** How a shift block is drawn: a tinted fill with a coloured edge, a pigment fill, or an outline. @default "soft" */
  blockStyle?: RosterBlockStyle;
  /** Height of each person's row, px; blocks grow with it. @default 48 */
  rowHeight?: number;
  /** The area colours: moss, amber, terracotta and sky; cobalt, teal, violet and slate; or ink shades. @default "garden" */
  palette?: RosterPalette;
  /** The people down the side. @default defaultRosterStaff */
  staff?: RosterStaff[];
  /** Controlled shifts. */
  shifts?: RosterShift[];
  /** Initial shifts when uncontrolled. @default defaultRosterShifts */
  defaultShifts?: RosterShift[];
  /** Fires from the drop or key that moved a shift, and from Discard, with every shift. */
  onShiftsChange?: (shifts: RosterShift[]) => void;
  /** The last published rota; changes are counted against it. @default the initial shifts */
  published?: RosterShift[];
  /** Target hours per day, Monday to Sunday. @default defaultRosterCoverage */
  coverage?: number[];
  /** The Monday the week starts, ms. @default defaultRosterWeek */
  weekStart?: number;
  /** The current time, ms; today's column is ringed. Never read from the clock. @default defaultRosterNow */
  now?: number;
  /** A shift was moved onto a person's day (`null`: back to open). */
  onAssign?: (shift: RosterShift, staffId: string | null, day: number) => void;
  /** Two shifts swapped places. */
  onSwap?: (a: RosterShift, b: RosterShift) => void;
  /** Publish was pressed with every shift. */
  onPublish?: (shifts: RosterShift[]) => void;
  /** Discard was pressed: the rota went back to the published one. */
  onDiscard?: () => void;
  /** Whether the rota has arrived. @default "ready" */
  status?: RosterStatus;
  /** "Try again" was pressed after the rota failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Fernworks rota" */
  title?: string;
  /** Height of the surface, px; the board scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be moved or published. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

/** Monday 19 October 2026. */
export const defaultRosterWeek = Date.UTC(2026, 9, 19);
/** Wednesday 21 October, 10:00. */
export const defaultRosterNow = Date.UTC(2026, 9, 21, 9, 0);

export const defaultRosterStaff: RosterStaff[] = [
  { id: "ines", name: "Ines Moreau", area: "plants", contract: 37.5 },
  { id: "theo", name: "Theo Park", area: "tills", contract: 30 },
  { id: "priya", name: "Priya Nair", area: "cafe", contract: 24 },
  { id: "sam", name: "Sam Okoro", area: "yard", contract: 40 },
  { id: "lena", name: "Lena Fisch", area: "tills", contract: 20 },
  { id: "ivo", name: "Ivo Brandt", area: "plants", contract: 30 },
];

/** Target hours, Monday to Sunday: the weekend is when the garden centre fills. */
export const defaultRosterCoverage = [30, 28, 24, 28, 30, 34, 24];

const H = 60;
const sh = (
  id: string,
  staff: string | null,
  day: number,
  start: number,
  end: number,
  area: RosterArea,
): RosterShift => ({ id, staff, day, start: start * H, end: end * H, area });

/**
 * The garden centre's week: Friday, Saturday and Sunday each short of their
 * target by exactly one open shift, Tuesday an hour short, and Priya
 * double-booked on Thursday between the café and the tills.
 */
export const defaultRosterShifts: RosterShift[] = [
  sh("s1", "ines", 0, 8, 16, "plants"),
  sh("s2", "ines", 1, 8, 16, "plants"),
  sh("s3", "ines", 2, 8, 16, "plants"),
  sh("s4", "ines", 5, 8, 16, "plants"),
  sh("s5", "ines", 6, 10, 16, "plants"),
  sh("s6", "theo", 0, 9, 17, "tills"),
  sh("s7", "theo", 2, 9, 17, "tills"),
  sh("s8", "theo", 3, 9, 17, "tills"),
  sh("s9", "theo", 5, 9, 15, "tills"),
  sh("s10", "priya", 1, 10, 16, "cafe"),
  sh("s11", "priya", 3, 8, 14, "cafe"),
  sh("s12", "priya", 3, 12, 18, "tills"),
  sh("s13", "priya", 5, 10, 16, "cafe"),
  sh("s14", "sam", 0, 7, 15, "yard"),
  sh("s15", "sam", 1, 7, 15, "yard"),
  sh("s16", "sam", 2, 7, 15, "yard"),
  sh("s17", "sam", 3, 7, 15, "yard"),
  sh("s18", "sam", 4, 7, 15, "yard"),
  sh("s19", "lena", 1, 9, 14, "tills"),
  sh("s20", "lena", 4, 12, 18, "tills"),
  sh("s21", "lena", 6, 11, 17, "tills"),
  sh("s22", "ivo", 0, 12, 18, "plants"),
  sh("s23", "ivo", 4, 9, 17, "plants"),
  sh("s24", "ivo", 5, 10, 18, "plants"),
  sh("s25", "ivo", 6, 10, 16, "plants"),
  sh("o1", null, 4, 7, 15, "yard"),
  sh("o2", null, 5, 12, 18, "tills"),
  sh("o3", null, 6, 10, 16, "cafe"),
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";
const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const AREAS: Record<RosterArea, string> = {
  plants: "Plants",
  tills: "Tills",
  cafe: "Café",
  yard: "Yard",
};

/** Filled shapes are pigment: each hue at a fixed lightness, so blocks read in both themes. */
const PALETTES: Record<RosterPalette, Record<RosterArea, string>> = {
  garden: {
    plants: "oklch(from var(--success) 0.8 0.11 h)",
    tills: "oklch(from var(--warn) 0.84 0.11 h)",
    cafe: "oklch(from var(--danger) 0.8 0.09 45)",
    yard: "oklch(from var(--accent-bright) 0.8 0.08 230)",
  },
  cool: {
    plants: "oklch(from var(--accent-bright) 0.78 0.11 h)",
    tills: "oklch(from var(--signal) 0.82 0.09 195)",
    cafe: "oklch(from var(--accent-bright) 0.78 0.1 305)",
    yard: "oklch(from var(--ink-3) 0.76 0.03 250)",
  },
  mono: {
    plants: "oklch(from var(--ink-3) 0.86 0.01 h)",
    tills: "oklch(from var(--ink-3) 0.8 0.01 h)",
    cafe: "oklch(from var(--ink-3) 0.74 0.01 h)",
    yard: "oklch(from var(--ink-3) 0.68 0.01 h)",
  },
};
const CLASH = "oklch(from var(--warn) 0.76 0.16 h)";
const ON_PIGMENT = "oklch(0.25 0.02 258)";

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const r2 = (v: number) => Math.round(v * 100) / 100;
const hoursOf = (s: RosterShift) => (s.end - s.start) / 60;
const short = (m: number) =>
  m % 60 === 0
    ? String(m / 60).padStart(2, "0")
    : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const long = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hoursText = (h: number) =>
  Number.isInteger(h) ? String(h) : h.toFixed(1);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

const sameOwner = (a: RosterShift, b: RosterShift) =>
  a.staff === b.staff && a.day === b.day;

/** Shifts of one person that overlap on a day. */
function clashesOf(list: RosterShift[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const a of list) {
    if (a.staff === null) continue;
    for (const b of list) {
      if (a.id === b.id || !sameOwner(a, b)) continue;
      if (a.start < b.end && b.start < a.end) {
        out.set(a.id, [...(out.get(a.id) ?? []), b.id]);
      }
    }
  }
  return out;
}

/** Shifts that differ from the published rota: a new owner, a new day, new or gone. */
function changesOf(now: RosterShift[], base: RosterShift[]): number {
  const before = new Map(base.map((s) => [s.id, s]));
  let n = 0;
  for (const s of now) {
    const b = before.get(s.id);
    if (!b || b.staff !== s.staff || b.day !== s.day) n += 1;
    before.delete(s.id);
  }
  return n + before.size;
}

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/**
 * A day's coverage as a hammock: the fill rises to scheduled/target and,
 * short of the target, its top edge sags in proportion to the shortfall. A
 * rise springs up on recoil — a rope pulled taut — and a fall sinks on glide.
 */
function CoverageBar({
  ratio,
  motionSafe,
  tall = false,
}: {
  ratio: number;
  motionSafe: boolean;
  tall?: boolean;
}) {
  const level = useMotionValue(ratio);
  const seen = React.useRef(ratio);
  React.useEffect(() => {
    if (seen.current === ratio) return;
    const rising = ratio > seen.current;
    seen.current = ratio;
    const controls = animate(
      level,
      ratio,
      motionSafe ? (rising ? springs.recoil : springs.glide) : { duration: 0 },
    );
    return () => controls.stop();
  }, [ratio, level, motionSafe]);

  const BOX = tall ? 44 : 34;
  const TARGET = 8;
  const d = useTransform(level, (v) => {
    const l = Math.max(0, Math.min(1.25, v));
    const y = r2(BOX - l * (BOX - TARGET));
    // A small shortfall still shows: the sag grows with its square root.
    const sag = Math.sqrt(Math.max(0, Math.min(1, 1 - l)));
    const dip = r2(y + 2 * sag * 12);
    return `M 0 ${BOX} L 0 ${y} Q 50 ${dip} 100 ${y} L 100 ${BOX} Z`;
  });
  const tone =
    ratio >= 1.15
      ? "fill-[oklch(from_var(--accent-bright)_0.74_0.12_h)]"
      : ratio >= 1
        ? "fill-[oklch(from_var(--success)_0.76_0.13_h)]"
        : "fill-[oklch(from_var(--warn)_0.8_0.14_h)]";
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-1 bg-surface-2"
      style={{ height: BOX }}
    >
      <svg
        viewBox={`0 0 100 ${BOX}`}
        preserveAspectRatio="none"
        className="absolute inset-0 block size-full"
      >
        <motion.path
          d={d}
          className={cn("transition-[fill] duration-300", tone)}
        />
      </svg>
      <span
        className="absolute inset-x-0 border-t border-dashed border-ink-3/70"
        style={{ top: TARGET }}
      />
    </div>
  );
}

/** Scheduled hours, rolling toward the way they moved on snap. */
function Hours({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [seen, setSeen] = React.useState({ value, dir: 1 });
  let dir = seen.dir;
  if (seen.value !== value) {
    dir = value > seen.value ? 1 : -1;
    setSeen({ value, dir });
  }
  const text = hoursText(value);
  return (
    <span className="relative inline-flex h-4 overflow-clip tabular-nums">
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block leading-4"
          variants={{
            enter: (d: number) => ({ opacity: 0, y: motionSafe ? d * 8 : 0 }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * 8 : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

type BlockEvents = {
  onGrab: (id: string, info: DragInfo) => void;
  onHold: (id: string, info: DragInfo) => void;
  onDrop: (id: string, info: DragInfo) => void;
  onLose: (id: string) => void;
};

/** One shift. Its own component: it owns a drag. */
function ShiftBlock({
  shift,
  layout,
  blockStyle,
  pigment,
  clash,
  held,
  dragging,
  swapTarget,
  disabled,
  events,
  register,
}: {
  shift: RosterShift;
  layout: "week" | "day";
  blockStyle: RosterBlockStyle;
  pigment: string;
  clash: boolean;
  held: boolean;
  dragging: boolean;
  swapTarget: boolean;
  disabled: boolean;
  events: BlockEvents;
  register: (key: string, node: HTMLDivElement | null) => void;
}) {
  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: (info) => events.onGrab(shift.id, info),
    onMove: (info) => events.onHold(shift.id, info),
    onEnd: (info) => events.onDrop(shift.id, info),
    onCancel: () => events.onLose(shift.id),
  });
  const open = shift.staff === null;
  const surface = open
    ? "border-[1.5px] border-dashed border-[color-mix(in_oklab,var(--sr-pig)_80%,var(--ink-3))] bg-transparent text-ink-2"
    : blockStyle === "solid"
      ? "border border-transparent bg-(--sr-pig) text-[oklch(0.25_0.02_258)]"
      : blockStyle === "outline"
        ? "border-[1.5px] border-(--sr-pig) bg-transparent text-foreground"
        : "border border-[color-mix(in_oklab,var(--sr-pig)_60%,transparent)] border-l-[3px] border-l-(--sr-pig) bg-[color-mix(in_oklab,var(--sr-pig)_30%,var(--card))] text-foreground";
  return (
    <div
      ref={(node) => register(`${layout}:${shift.id}`, node)}
      data-sr-shift={shift.id}
      {...drag}
      className={cn(
        "relative flex min-w-0 flex-1 touch-none items-center gap-1 overflow-hidden rounded-2 px-1.5 select-none",
        "transition-[box-shadow,opacity] duration-150",
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        surface,
        (held || dragging) &&
          "z-20 shadow-[0_10px_24px_-8px_color-mix(in_oklab,black_40%,transparent)]",
        swapTarget && "opacity-60",
      )}
      style={{
        ["--sr-pig" as string]: pigment,
        boxShadow: clash
          ? `0 0 0 2px ${CLASH}`
          : swapTarget
            ? "0 0 0 2px var(--ring)"
            : undefined,
      }}
    >
      {clash ? (
        <TriangleAlert
          aria-hidden
          className="size-3 shrink-0"
          style={{ color: `oklch(from ${CLASH} 0.55 0.15 h)` }}
        />
      ) : null}
      {swapTarget ? (
        <ArrowLeftRight aria-hidden className="size-3 shrink-0" />
      ) : null}
      <span className="truncate font-mono text-[11px] leading-none tabular-nums">
        <span className="@min-[64rem]:hidden">
          {short(shift.start)}–{short(shift.end)}
        </span>
        <span className="hidden @min-[64rem]:inline">
          {long(shift.start)}–{long(shift.end)}
        </span>
      </span>
      <span
        className={cn(
          "truncate text-[11px] leading-none opacity-75",
          layout === "week" && "hidden @min-[64rem]:inline",
        )}
      >
        {AREAS[shift.area]}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The roster                                */
/* ----------------------------------------------------------------------- */

type Cell = { row: string; day: number };
type Hover = { row: string; day: number; swap: string | null };
type Said = { n: number; text: string };

/**
 * A week's rota: people down the side, days across the top, an Open row of
 * shifts nobody has yet and, under every day, its coverage as a hammock that
 * sags below the target line when the day is short. A shift follows the
 * pointer 1:1 over the board, the cell beneath it outlined; released on a
 * cell it moves there, on another shift the two swap, anywhere else it flies
 * home — and lands with a FLIP from where it was let go on snap, carrying the
 * release velocity. The day that gains it springs up on recoil; the day that
 * lost it sinks on glide. Two shifts of one person that overlap ring each
 * other in amber.
 *
 * The board is a grid with one roving cell: arrows move, Space picks the
 * cell's shift up, arrows carry it (each step a glide), Space or Enter drops
 * — onto a shift, a swap — and Escape puts it back. Unpublished changes are
 * counted in a save bar with Discard and Publish. Narrow, the board shows one
 * day at a time. Under reduced motion nothing travels; levels, counts and
 * outlines still change.
 */
export function ShiftRoster({
  blockStyle = "soft",
  rowHeight = 48,
  palette = "garden",
  staff = defaultRosterStaff,
  shifts,
  defaultShifts,
  onShiftsChange,
  published,
  coverage = defaultRosterCoverage,
  weekStart = defaultRosterWeek,
  now = defaultRosterNow,
  onAssign,
  onSwap,
  onPublish,
  onDiscard,
  status = "ready",
  onRetry,
  title = "Fernworks rota",
  height = 540,
  disabled = false,
  className,
}: ShiftRosterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const rowH = Math.round(Math.min(72, Math.max(36, rowHeight)));
  const colors = PALETTES[palette] ?? PALETTES.garden;

  const [own, setOwn] = React.useState<RosterShift[]>(
    () => defaultShifts ?? defaultRosterShifts,
  );
  const list = shifts ?? own;
  const [baseOwn, setBaseOwn] = React.useState<RosterShift[]>(
    () => published ?? shifts ?? defaultShifts ?? defaultRosterShifts,
  );
  const base = published ?? baseOwn;
  const changes = changesOf(list, base);

  const rows = ["open", ...staff.map((p) => p.id)];
  const staffById = React.useMemo(
    () => new Map(staff.map((p) => [p.id, p])),
    [staff],
  );
  const nameOf = (id: string | null) =>
    id === null ? "Open" : (staffById.get(id)?.name ?? id);

  /* ------------------------------ derived -------------------------------- */

  const [active, setActive] = React.useState<Cell>({ row: "open", day: 0 });
  const [held, setHeld] = React.useState<{ id: string; at: Cell } | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [hover, setHover] = React.useState<Hover | null>(null);
  const [view, setView] = React.useState(() => {
    const d = Math.floor((now - weekStart) / 86_400_000);
    return d >= 0 && d < 7 ? d : 0;
  });
  const [publishedFlash, setPublishedFlash] = React.useState(0);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // A held shift is drawn where the keys have carried it; the rota itself
  // only changes when it is dropped.
  const shown = React.useMemo(
    () =>
      held
        ? list.map((s) =>
            s.id === held.id
              ? {
                  ...s,
                  staff: held.at.row === "open" ? null : held.at.row,
                  day: held.at.day,
                }
              : s,
          )
        : list,
    [list, held],
  );
  const clashes = React.useMemo(() => clashesOf(shown), [shown]);
  const scheduled = Array.from({ length: 7 }, (_, d) =>
    list
      .filter((s) => s.day === d && s.staff !== null)
      .reduce((t, s) => t + hoursOf(s), 0),
  );
  const ratioOf = (d: number) => {
    const target = coverage[d] ?? 0;
    return target > 0 ? r2((scheduled[d] ?? 0) / target) : 1;
  };
  const weekHours = (id: string) =>
    list.filter((s) => s.staff === id).reduce((t, s) => t + hoursOf(s), 0);
  const cellShifts = (row: string, day: number) =>
    shown
      .filter(
        (s) =>
          s.day === day &&
          (row === "open" ? s.staff === null : s.staff === row),
      )
      .sort((a, b) => a.start - b.start);

  const todayIndex = Math.floor((now - weekStart) / 86_400_000);
  const dateOf = (d: number) =>
    new Date(weekStart + d * 86_400_000).getUTCDate();

  /* ------------------------------- FLIP --------------------------------- */

  const nodes = React.useRef(new Map<string, HTMLDivElement>());
  const register = React.useCallback(
    (key: string, node: HTMLDivElement | null) => {
      if (node) nodes.current.set(key, node);
    },
    [],
  );
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  /** The layout on screen: the week, or one day on a narrow container. */
  const layoutNow = (): "week" | "day" => {
    const week = rootRef.current?.querySelector<HTMLElement>(
      "[data-sr-layout=week]",
    );
    return week && week.getBoundingClientRect().width > 0 ? "week" : "day";
  };
  const blockNode = (id: string) => {
    const node = nodes.current.get(`${layoutNow()}:${id}`);
    return node?.isConnected ? node : undefined;
  };
  const flip = React.useRef<{
    rects: Map<string, DOMRect>;
    spring: typeof springs.snap | typeof springs.glide;
    velocity: { id: string; x: number; y: number } | null;
  } | null>(null);
  const [flipTick, setFlipTick] = React.useState(0);

  /** Remembers where every shift is drawn, before a change moves any. */
  const snapshot = (
    spring: typeof springs.snap | typeof springs.glide,
    velocity: { id: string; x: number; y: number } | null = null,
  ) => {
    const rects = new Map<string, DOMRect>();
    for (const s of list) {
      const node = blockNode(s.id);
      if (node) rects.set(s.id, node.getBoundingClientRect());
    }
    flip.current = { rects, spring, velocity };
    setFlipTick((t) => t + 1);
  };

  React.useLayoutEffect(() => {
    const f = flip.current;
    if (!f) return;
    const running: AnimationPlaybackControls[] = [];
    for (const [id, old] of f.rects) {
      const node = blockNode(id);
      if (!node) continue;
      node.style.transform = "";
      node.style.zIndex = "";
      node.style.pointerEvents = "";
      const rect = node.getBoundingClientRect();
      const dx = r2(old.left - rect.left);
      const dy = r2(old.top - rect.top);
      if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !motionSafe) continue;
      const v = f.velocity?.id === id ? f.velocity : null;
      node.style.zIndex = "20";
      running.push(
        animate(
          node,
          { x: [dx, 0], y: [dy, 0] },
          {
            x: { ...f.spring, velocity: v?.x ?? 0 },
            y: { ...f.spring, velocity: v?.y ?? 0 },
          },
        ),
      );
    }
    // Finished, never frozen: a re-run (StrictMode) measures again from the
    // same snapshot and plays the move from the start.
    return () => {
      for (const c of running) c.complete();
      for (const id of f.rects.keys()) {
        const node = blockNode(id);
        if (node) node.style.zIndex = "";
      }
    };
    // One FLIP per snapshot; the layout is read inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipTick]);

  /* ------------------------------ commits -------------------------------- */

  const write = (next: RosterShift[]) => {
    if (shifts === undefined) setOwn(next);
    onShiftsChange?.(next);
  };

  const dayWord = (d: number) => DAY_LONG[d] ?? "";

  const coverageSentence = (d: number, next: RosterShift[]) => {
    const h = next
      .filter((s) => s.day === d && s.staff !== null)
      .reduce((t, s) => t + hoursOf(s), 0);
    return `${dayWord(d)} ${hoursText(h)} of ${hoursText(coverage[d] ?? 0)} hours.`;
  };

  /** Moves a shift onto a cell, or swaps it with the cell's shift. Returns the sentence said. */
  const place = (id: string, at: Cell, swapWith: string | null) => {
    const a = list.find((s) => s.id === id);
    if (!a) return;
    const staffId = at.row === "open" ? null : at.row;
    if (swapWith && swapWith !== id) {
      const b = list.find((s) => s.id === swapWith);
      if (b) {
        const next = list.map((s) =>
          s.id === a.id
            ? { ...s, staff: b.staff, day: b.day }
            : s.id === b.id
              ? { ...s, staff: a.staff, day: a.day }
              : s,
        );
        write(next);
        say(
          `Swapped: ${nameOf(a.staff)} takes ${dayWord(b.day)}, ${nameOf(b.staff)} takes ${dayWord(a.day)}. ${coverageSentence(a.day, next)}`,
        );
        onSwap?.(
          { ...a, staff: b.staff, day: b.day },
          { ...b, staff: a.staff, day: a.day },
        );
        return;
      }
    }
    if (a.staff === staffId && a.day === at.day) {
      say("Put back.");
      return;
    }
    const moved = { ...a, staff: staffId, day: at.day };
    const next = list.map((s) => (s.id === id ? moved : s));
    write(next);
    say(
      `Moved ${AREAS[a.area]} ${long(a.start)} to ${long(a.end)} to ${nameOf(staffId)}, ${dayWord(at.day)}. ${coverageSentence(at.day, next)}`,
    );
    onAssign?.(moved, staffId, at.day);
  };

  /* ------------------------------ pointer -------------------------------- */

  const grip = React.useRef<{ id: string; node: HTMLElement } | null>(null);

  const targetAt = (x: number, y: number) => {
    const hit = document.elementFromPoint(x, y);
    const cell = hit?.closest<HTMLElement>("[data-sr-cell]");
    if (!cell || !rootRef.current?.contains(cell)) return null;
    const [row = "", day = "0"] = (cell.dataset.srCell ?? "").split("|");
    const over = hit?.closest<HTMLElement>("[data-sr-shift]");
    const swap =
      over && over.dataset.srShift !== grip.current?.id
        ? (over.dataset.srShift ?? null)
        : null;
    return { row, day: Number(day), swap };
  };

  const events: BlockEvents = {
    onGrab: (id) => {
      if (held || disabled || !ready) return;
      const node = blockNode(id);
      if (!node) return;
      grip.current = { id, node };
      node.style.zIndex = "30";
      node.style.pointerEvents = "none";
      setDragId(id);
    },
    onHold: (id, info) => {
      const g = grip.current;
      if (!g || g.id !== id) return;
      g.node.style.transform = `translate(${r2(info.offset.x)}px, ${r2(info.offset.y)}px) scale(1.03)`;
      const t = targetAt(info.point.x, info.point.y);
      setHover((h) =>
        t === null
          ? null
          : h && h.row === t.row && h.day === t.day && h.swap === t.swap
            ? h
            : t,
      );
    },
    onDrop: (id, info) => {
      const g = grip.current;
      grip.current = null;
      setDragId(null);
      setHover(null);
      if (!g || g.id !== id) return;
      const t = targetAt(info.point.x, info.point.y);
      snapshot(springs.snap, { id, x: info.velocity.x, y: info.velocity.y });
      if (t) {
        place(id, { row: t.row, day: t.day }, t.swap);
        setActive({ row: t.row, day: t.day });
      } else {
        say("Put back.");
      }
    },
    onLose: (id) => {
      const g = grip.current;
      grip.current = null;
      setDragId(null);
      setHover(null);
      if (!g || g.id !== id) return;
      snapshot(springs.snap);
    },
  };

  /* ------------------------------ keyboard ------------------------------- */

  const cellRefs = React.useRef(new Map<string, HTMLDivElement>());
  const focusCell = (c: Cell) => {
    setActive(c);
    const key = `${layoutNow()}:${c.row}|${c.day}`;
    // The cell may only exist after the day view follows: focus once drawn.
    focusReq.current = key;
    setFocusTick((t) => t + 1);
  };
  const focusReq = React.useRef<string | null>(null);
  const [focusTick, setFocusTick] = React.useState(0);
  React.useEffect(() => {
    const key = focusReq.current;
    if (!key) return;
    const node = cellRefs.current.get(key);
    if (node?.isConnected) {
      focusReq.current = null;
      node.focus({ preventScroll: false });
    }
  }, [focusTick, view]);

  const onCellKey = (event: React.KeyboardEvent<HTMLDivElement>, c: Cell) => {
    if (!ready) return;
    const r = rows.indexOf(c.row);
    const moveTo = (row: number, day: number) => {
      const nr = Math.max(0, Math.min(rows.length - 1, row));
      const nd = Math.max(0, Math.min(6, day));
      const next = { row: rows[nr] ?? "open", day: nd };
      if (nd !== view) setView(nd);
      if (held) {
        snapshot(springs.glide);
        setHeld({ id: held.id, at: next });
        const occupant = cellShifts(next.row, next.day).find(
          (s) => s.id !== held.id,
        );
        say(
          `${nameOf(next.row === "open" ? null : next.row)}, ${dayWord(nd)}${occupant ? `, swaps with ${AREAS[occupant.area]} ${long(occupant.start)} to ${long(occupant.end)}` : ""}.`,
        );
      }
      focusCell(next);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveTo(r + 1, c.day);
        return;
      case "ArrowUp":
        event.preventDefault();
        moveTo(r - 1, c.day);
        return;
      case "ArrowRight":
        event.preventDefault();
        moveTo(r, c.day + 1);
        return;
      case "ArrowLeft":
        event.preventDefault();
        moveTo(r, c.day - 1);
        return;
      case "Home":
        event.preventDefault();
        moveTo(r, 0);
        return;
      case "End":
        event.preventDefault();
        moveTo(r, 6);
        return;
      case " ":
      case "Enter": {
        event.preventDefault();
        if (disabled) return;
        if (held) {
          const occupant = list.find(
            (s) =>
              s.id !== held.id &&
              s.day === held.at.day &&
              (held.at.row === "open"
                ? s.staff === null
                : s.staff === held.at.row),
          );
          snapshot(springs.snap);
          const id = held.id;
          setHeld(null);
          place(id, held.at, occupant?.id ?? null);
          return;
        }
        if (event.key === "Enter") return;
        const first = cellShifts(c.row, c.day)[0];
        if (!first) {
          say("Nothing to pick up here.");
          return;
        }
        setHeld({ id: first.id, at: c });
        say(
          `Picked up ${AREAS[first.area]} ${long(first.start)} to ${long(first.end)}. Arrows move it, Space drops, Escape puts it back.`,
        );
        return;
      }
      case "Escape":
        if (!held) return;
        event.preventDefault();
        event.stopPropagation();
        snapshot(springs.snap);
        {
          const s = list.find((x) => x.id === held.id);
          setHeld(null);
          if (s) focusCell({ row: s.staff ?? "open", day: s.day });
        }
        say("Put back.");
        return;
      default:
        return;
    }
  };

  /* ------------------------------- publish ------------------------------- */

  const publish = () => {
    if (disabled || changes === 0) return;
    if (published === undefined) setBaseOwn(list);
    setPublishedFlash((n) => n + 1);
    say(`Published ${changes === 1 ? "1 change" : `${changes} changes`}.`);
    onPublish?.(list);
  };
  const discard = () => {
    if (disabled || changes === 0) return;
    snapshot(springs.glide);
    write(base);
    say("Changes discarded.");
    onDiscard?.();
  };
  const [flashShown, setFlashShown] = React.useState(0);
  React.useEffect(() => {
    if (publishedFlash === 0) return;
    const t = window.setTimeout(() => setFlashShown(publishedFlash), 1600);
    return () => window.clearTimeout(t);
  }, [publishedFlash]);
  const flashing = publishedFlash > 0 && flashShown !== publishedFlash;

  /* -------------------------------- render ------------------------------- */

  const cellLabel = (row: string, day: number) => {
    const list2 = cellShifts(row, day);
    const who = row === "open" ? "Open shifts" : nameOf(row);
    const what =
      list2.length === 0
        ? "no shift"
        : list2
            .map((s) => {
              const clash = clashes.get(s.id);
              const other = clash
                ? list.find((x) => x.id === clash[0])
                : undefined;
              return `${AREAS[s.area]} ${long(s.start)} to ${long(s.end)}${other ? `, clashes with ${AREAS[other.area]} ${long(other.start)} to ${long(other.end)}` : ""}${held?.id === s.id ? ", picked up" : ""}`;
            })
            .join("; ");
    return `${who}, ${dayWord(day)}: ${what}`;
  };

  const renderCell = (row: string, day: number, layout: "week" | "day") => {
    const items = cellShifts(row, day);
    const isActive = active.row === row && active.day === day;
    const isHover = hover?.row === row && hover.day === day;
    const key = `${row}|${day}`;
    return (
      <div
        key={key}
        ref={(node) => {
          if (node) cellRefs.current.set(`${layout}:${key}`, node);
        }}
        role="gridcell"
        data-sr-cell={key}
        aria-label={cellLabel(row, day)}
        aria-describedby={hintId}
        tabIndex={isActive ? 0 : -1}
        onFocus={(event) => {
          if (event.target === event.currentTarget && !isActive)
            setActive({ row, day });
        }}
        onKeyDown={(event) => onCellKey(event, { row, day })}
        className={cn(
          "relative flex min-w-0 gap-1 border-b border-l border-hairline p-1",
          layout === "day" ? "flex-row" : "flex-col",
          day === todayIndex &&
            layout === "week" &&
            "bg-[color-mix(in_oklab,var(--accent-bright)_4%,transparent)]",
          FOCUS_IN,
        )}
        style={{ height: rowH }}
      >
        {isHover && !hover?.swap ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0.5 rounded-2 border-[1.5px] border-dashed border-ring"
          />
        ) : null}
        {items.map((s) => (
          <ShiftBlock
            key={s.id}
            shift={s}
            layout={layout}
            blockStyle={blockStyle}
            pigment={colors[s.area]}
            clash={clashes.has(s.id)}
            held={held?.id === s.id}
            dragging={dragId === s.id}
            swapTarget={hover?.swap === s.id}
            disabled={disabled || !ready || held !== null}
            events={events}
            register={register}
          />
        ))}
      </div>
    );
  };

  const nameCell = (row: string) => {
    if (row === "open") {
      const n = list.filter((s) => s.staff === null).length;
      return (
        <div
          role="rowheader"
          className="sticky left-0 z-[3] flex min-w-0 items-center gap-2 border-b border-hairline bg-card px-3"
          style={{ height: rowH }}
        >
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-full border border-dashed border-hairline-strong font-mono text-[10px] text-ink-3 tabular-nums"
          >
            {n}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12px] font-medium">Open</p>
            <p className="truncate text-[11px] text-ink-3">
              {n === 1 ? "1 shift to fill" : `${n} shifts to fill`}
            </p>
          </div>
        </div>
      );
    }
    const p = staffById.get(row);
    if (!p) return null;
    const hours = weekHours(p.id);
    return (
      <div
        role="rowheader"
        className="sticky left-0 z-[3] flex min-w-0 items-center gap-2 border-b border-hairline bg-card px-3"
        style={{ height: rowH }}
      >
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] leading-none font-semibold"
          style={{ backgroundColor: colors[p.area], color: ON_PIGMENT }}
        >
          {initials(p.name)}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[12px] font-medium" title={p.name}>
            {p.name}
          </p>
          <p
            className={cn(
              "flex items-center gap-0.5 font-mono text-[10px] tabular-nums",
              hours > p.contract ? "text-warn" : "text-ink-3",
            )}
          >
            <Hours value={hours} motionSafe={motionSafe} />/
            {hoursText(p.contract)} h
          </p>
        </div>
      </div>
    );
  };

  const week = (
    <div data-sr-layout="week" className="hidden @min-[40rem]:block">
      <div
        role="grid"
        aria-labelledby={titleId}
        aria-rowcount={rows.length + 1}
        aria-colcount={8}
        className="grid"
        style={{
          gridTemplateColumns: "var(--sr-name) repeat(7, minmax(0, 1fr))",
        }}
      >
        <div role="row" className="contents">
          <div
            role="columnheader"
            className="sticky left-0 z-[3] flex items-end border-b border-hairline bg-card px-3 pb-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase"
            style={{ height: 34 }}
          >
            Week of {dateOf(0)}
          </div>
          {DAY_SHORT.map((d, i) => (
            <div
              key={d}
              role="columnheader"
              className={cn(
                "flex items-end justify-between gap-1 border-b border-l border-hairline px-1.5 pb-1.5 text-[11px]",
                i === todayIndex ? "text-foreground" : "text-ink-2",
              )}
              style={{ height: 34 }}
            >
              <span className="truncate font-medium">
                {d}{" "}
                <span
                  className={cn(
                    "tabular-nums",
                    i === todayIndex
                      ? "rounded-full bg-primary px-1 text-primary-foreground"
                      : "text-ink-3",
                  )}
                >
                  {dateOf(i)}
                </span>
              </span>
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row} role="row" className="contents">
            {nameCell(row)}
            {Array.from({ length: 7 }, (_, d) => renderCell(row, d, "week"))}
          </div>
        ))}
      </div>
      <div
        role="group"
        aria-label="Coverage"
        className="grid"
        style={{
          gridTemplateColumns: "var(--sr-name) repeat(7, minmax(0, 1fr))",
        }}
      >
        <div className="sticky left-0 z-[3] flex flex-col justify-center bg-card px-3 leading-tight">
          <p className="text-[12px] font-medium">Coverage</p>
          <p className="text-[11px] text-ink-3">hours of target</p>
        </div>
        {DAY_SHORT.map((d, i) => {
          const ratio = ratioOf(i);
          return (
            <div
              key={d}
              className="border-l border-hairline px-1.5 pt-2 pb-1.5"
            >
              <CoverageBar ratio={ratio} motionSafe={motionSafe} />
              <p
                className={cn(
                  "mt-1 flex items-center justify-center gap-0.5 font-mono text-[10px] tabular-nums",
                  ratio < 1 ? "text-warn" : "text-ink-3",
                )}
              >
                <Hours value={scheduled[i] ?? 0} motionSafe={motionSafe} />/
                {hoursText(coverage[i] ?? 0)}
                <span className="sr-only">{` hours, ${DAY_LONG[i]}`}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );

  const dayView = (
    <div data-sr-layout="day" className="@min-[40rem]:hidden">
      <div className="flex items-center gap-1 px-3 pt-3">
        <button
          type="button"
          aria-label="Previous day"
          onClick={() => setView((v) => Math.max(0, v - 1))}
          aria-disabled={view === 0 || undefined}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 aria-disabled:opacity-40",
            FOCUS_RING,
          )}
        >
          <ChevronLeft aria-hidden className="size-4" />
        </button>
        <div
          role="tablist"
          aria-label="Day"
          className="flex min-w-0 flex-1 justify-between gap-0.5"
        >
          {DAY_SHORT.map((d, i) => {
            const on = i === view;
            return (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`${uid}-day-panel`}
                tabIndex={on ? 0 : -1}
                onClick={() => setView(i)}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const next = Math.max(0, Math.min(6, i + step));
                  setView(next);
                  const tabs =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    );
                  tabs?.[next]?.focus();
                }}
                className={cn(
                  "relative flex h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2 text-[11px] transition-colors",
                  on
                    ? "text-primary-foreground"
                    : "text-ink-2 hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-day`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 bg-primary"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative font-medium">{d.charAt(0)}</span>
                <span
                  aria-hidden
                  className={cn(
                    "relative size-1.5 rounded-full",
                    ratioOf(i) < 1
                      ? "bg-warn"
                      : on
                        ? "bg-primary-foreground"
                        : "bg-success",
                  )}
                />
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Next day"
          onClick={() => setView((v) => Math.min(6, v + 1))}
          aria-disabled={view === 6 || undefined}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 hover:bg-surface-2 aria-disabled:opacity-40",
            FOCUS_RING,
          )}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      </div>
      <div id={`${uid}-day-panel`} role="tabpanel" aria-label={DAY_LONG[view]}>
        <div className="px-4 pt-3 pb-2">
          <div className="mb-1 flex items-baseline justify-between text-[12px]">
            <span className="font-medium">
              {DAY_LONG[view]} {dateOf(view)}
            </span>
            <span
              className={cn(
                "flex items-center gap-0.5 font-mono text-[11px] tabular-nums",
                ratioOf(view) < 1 ? "text-warn" : "text-ink-3",
              )}
            >
              <Hours value={scheduled[view] ?? 0} motionSafe={motionSafe} />/
              {hoursText(coverage[view] ?? 0)} h
            </span>
          </div>
          <CoverageBar ratio={ratioOf(view)} motionSafe={motionSafe} tall />
        </div>
        <div
          role="grid"
          aria-labelledby={titleId}
          className="grid"
          style={{ gridTemplateColumns: "8.5rem minmax(0, 1fr)" }}
        >
          {rows.map((row) => (
            <div key={row} role="row" className="contents">
              {nameCell(row)}
              {renderCell(row, view, "day")}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const loading = (
    <div aria-busy="true" className="flex flex-col gap-2 p-4">
      <p className="sr-only">Loading the rota.</p>
      {staff.map((p, i) => (
        <div
          key={p.id}
          className="flex items-center gap-3"
          style={{ height: rowH - 8 }}
        >
          <span className="size-7 shrink-0 rounded-full bg-surface-2" />
          <span className="h-2.5 w-24 shrink-0 rounded-full bg-surface-2" />
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: 7 }, (_, d) => (
              <span
                key={d}
                className="h-7 flex-1 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ opacity: (i * 7 + d) % 3 === 0 ? 0.4 : 1 }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const openCount = list.filter((s) => s.staff === null).length;
  const shortDays = Array.from({ length: 7 }, (_, d) => d).filter(
    (d) => ratioOf(d) < 1,
  ).length;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative grid w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
        <div className="min-w-0 flex-1 basis-40">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3 tabular-nums">
            {ready
              ? `${openCount === 1 ? "1 open shift" : `${openCount} open shifts`} · ${shortDays === 1 ? "1 day short" : `${shortDays} days short`} · ${clashes.size > 0 ? `${clashes.size / 2 === 1 ? "1 clash" : `${clashes.size / 2} clashes`}` : "no clashes"}`
              : "Loading"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          {(Object.keys(AREAS) as RosterArea[]).map((a) => (
            <span key={a} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: colors[a] }}
              />
              {AREAS[a]}
            </span>
          ))}
        </div>
      </header>
      <p id={hintId} className="sr-only">
        Arrow keys move between cells. Space picks up the cell&apos;s shift;
        arrows carry it; Space drops it, onto another shift to swap; Escape puts
        it back.
      </p>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The rota did not load.</p>
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
        <div className="overflow-y-auto">{loading}</div>
      ) : (
        <div className="[scrollbar-width:thin] overflow-auto overscroll-contain [--sr-name:8.5rem] @min-[64rem]:[--sr-name:11rem]">
          {week}
          {dayView}
        </div>
      )}

      <div className="relative">
        <AnimatePresence initial={false}>
          {ready && (changes > 0 || flashing) ? (
            <motion.div
              key="save"
              role="region"
              aria-label="Unpublished changes"
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline bg-surface-1 px-4 py-2.5"
              initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                y: motionSafe ? distances.step : 0,
                transition: exitFor(),
              }}
              transition={
                motionSafe
                  ? {
                      y: springs.snap,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
            >
              <p className="flex min-w-0 items-center gap-1.5 text-[12px]">
                {changes > 0 ? (
                  <>
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[11px] text-primary-foreground tabular-nums">
                      {changes}
                    </span>
                    <span className="truncate">
                      unpublished {changes === 1 ? "change" : "changes"}
                    </span>
                  </>
                ) : (
                  <>
                    <Check
                      aria-hidden
                      className="size-4 text-success"
                      strokeWidth={2.5}
                    />
                    <span className="truncate">Published to the team</span>
                  </>
                )}
              </p>
              {changes > 0 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={discard}
                    aria-disabled={disabled || undefined}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <Undo2 aria-hidden className="size-3.5" />
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={publish}
                    aria-disabled={disabled || undefined}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                      FOCUS_RING,
                    )}
                  >
                    Publish
                  </button>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
