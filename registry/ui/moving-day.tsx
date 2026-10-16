"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  ArrowRight,
  FileText,
  FolderKanban,
  LoaderCircle,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
  Users,
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

export type MovingDayIcon = "projects" | "people" | "files" | "comments";

export type MovingDayCategory = {
  /** Unique; the key into each source's `counts`. */
  id: string;
  /** "Projects". */
  label: string;
  /** What one and many are called in sentences: { one: "file", other: "files" }. */
  unit: { one: string; other: string };
  /** The glyph, and how the preview draws arrivals (people land as avatars). @default "projects" */
  icon?: MovingDayIcon;
  /** A few real names from the old tool, drawn settling into the preview. */
  samples: string[];
};

export type MovingDayBlocked = {
  id: string;
  /** The category it belongs to. */
  categoryId: string;
  /** The item, as the old tool names it. */
  name: string;
  /** Why it could not move, in a few words. */
  reason: string;
  /** A retry can move it (a timeout, a lock); otherwise it stays with its reason. @default false */
  retryable?: boolean;
};

export type MovingDaySource = {
  id: string;
  /** The old tool or workspace: "Coldbrook Tasks". */
  name: string;
  /** One line under the name: "Harbour team · since 2022". */
  detail?: string;
  /** How many of each category it holds, by category id. */
  counts: Record<string, number>;
  /** The items that cannot move, and why. */
  blocked?: MovingDayBlocked[];
};

export type MovingDayBoxStyle = "carton" | "crate" | "tote";
export type MovingDayDensity = "compact" | "cozy" | "roomy";
export type MovingDayTone = "kraft" | "slate" | "cobalt" | "mint";
export type MovingDayStatus = "ready" | "loading" | "error";
export type MovingDaySummary = { moved: number; stayed: string[] };

export type MovingDayProps = {
  /** The old tools to import from, each with its counts and what cannot move. @default defaultMovingDaySources */
  sources?: MovingDaySource[];
  /** What moves, one box each, in the order the boxes open. @default defaultMovingDayCategories */
  categories?: MovingDayCategory[];
  /** Controlled: the chosen source's id. */
  source?: string;
  /** Initial source when uncontrolled. @default the first source */
  defaultSource?: string;
  /** Fires from the radio or arrow key that changed the source (only before the import starts). */
  onSourceChange?: (id: string) => void;
  /** The new workspace's name, in the preview and the copy. @default "Fieldline" */
  workspace?: string;
  /** Start was pressed. */
  onStart?: (sourceId: string) => void;
  /** Pause was pressed. */
  onPause?: (sourceId: string) => void;
  /** Resume was pressed. */
  onResume?: (sourceId: string) => void;
  /** Retry was pressed, with the ids of the items it tries again. */
  onRetry?: (ids: string[]) => void;
  /** Every box has finished, background ones included. */
  onDone?: (summary: MovingDaySummary) => void;
  /** The open-workspace button was pressed. */
  onOpenWorkspace?: () => void;
  /** Items per second the simulated import moves; each box takes 0.9–2.4 s. @default 2400 */
  pace?: number;
  /** A category with more items than this moves in the background, with a toast. @default 5000 */
  backgroundAbove?: number;
  /** The boxes: a kraft carton whose flaps swing open, a slatted crate whose lid lifts, or a tote whose lid slides back. @default "carton" */
  boxStyle?: MovingDayBoxStyle;
  /** Box size, row heights and spacing. @default "cozy" */
  density?: MovingDayDensity;
  /** The boxes' pigment, at a fixed lightness so it reads in both themes. @default "kraft" */
  tone?: MovingDayTone;
  /** Whether the old tool's counts have arrived. @default "ready" */
  status?: MovingDayStatus;
  /** "Try again" was pressed after the counts failed to load. */
  onReload?: () => void;
  /** The tallest the step grows before its body scrolls, px. @default 560 */
  maxHeight?: number;
  /** Nothing can be started or chosen. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultMovingDayCategories: MovingDayCategory[] = [
  {
    id: "projects",
    label: "Projects",
    unit: { one: "project", other: "projects" },
    icon: "projects",
    samples: ["Harbour refit", "Pier 9 lighting", "Dock 4 valves"],
  },
  {
    id: "people",
    label: "People",
    unit: { one: "person", other: "people" },
    icon: "people",
    samples: [
      "Mara Lind",
      "Tomas Ferrer",
      "Ines Okafor",
      "Kenji Arai",
      "Priya Nair",
      "Sade Bello",
    ],
  },
  {
    id: "files",
    label: "Files",
    unit: { one: "file", other: "files" },
    icon: "files",
    samples: ["berth-plan.pdf", "crane-checks.xlsx", "site-photos.zip"],
  },
  {
    id: "comments",
    label: "Comments",
    unit: { one: "comment", other: "comments" },
    icon: "comments",
    samples: ["Valve parts land Thursday", "Crew B on Pier 9 from 07:00"],
  },
];

export const defaultMovingDaySources: MovingDaySource[] = [
  {
    id: "coldbrook",
    name: "Coldbrook Tasks",
    detail: "Harbour team · since 2022",
    counts: { projects: 38, people: 24, files: 1286, comments: 14902 },
    blocked: [
      {
        id: "b-night",
        categoryId: "projects",
        name: "Night shift notes",
        reason: "Private to someone who left",
      },
      {
        id: "b-tides",
        categoryId: "files",
        name: "tide-tables.xlsx",
        reason: "Locked while someone was editing it",
        retryable: true,
      },
      {
        id: "b-thread",
        categoryId: "comments",
        name: "Thread on Pier 9 lighting",
        reason: "Timed out while copying",
        retryable: true,
      },
    ],
  },
  {
    id: "gaugeworks",
    name: "Gaugeworks Boards",
    detail: "Field ops · since 2024",
    counts: { projects: 12, people: 9, files: 214, comments: 1630 },
    blocked: [
      {
        id: "b-quote",
        categoryId: "files",
        name: "quote-template.docx",
        reason: "Timed out while copying",
        retryable: true,
      },
    ],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const EMPTY_BLOCKED: MovingDayBlocked[] = [];

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Grouped by hand: a locale lookup in render would not survive hydration. */
const fmt = (n: number) =>
  String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const count = (n: number, unit: { one: string; other: string }) =>
  `${fmt(n)} ${n === 1 ? unit.one : unit.other}`;
const things = (n: number) => `${n} ${n === 1 ? "thing" : "things"}`;

const ICON = {
  projects: FolderKanban,
  people: Users,
  files: FileText,
  comments: MessageSquare,
} as const;

/** Each tone is pigment: a hue at a fixed lightness, shaded toward black in oklab. */
const TONE: Record<MovingDayTone, string> = {
  kraft: "oklch(from var(--warn) 0.76 0.08 h)",
  slate: "oklch(from var(--ink-3) 0.66 0.025 h)",
  cobalt: "oklch(from var(--accent-bright) 0.66 0.13 h)",
  mint: "oklch(from var(--signal) 0.76 0.09 h)",
};

const DENSITY: Record<
  MovingDayDensity,
  {
    glyph: number;
    glyphSm: number;
    cell: string;
    row: string;
    gap: string;
    pad: string;
  }
> = {
  compact: {
    glyph: 52,
    glyphSm: 32,
    cell: "gap-1.5 px-2.5 py-1.5 @min-[40rem]/moving-day:py-2.5",
    row: "h-6 text-[12px]",
    gap: "gap-2",
    pad: "p-3",
  },
  cozy: {
    glyph: 66,
    glyphSm: 38,
    cell: "gap-2 px-3 py-2 @min-[40rem]/moving-day:py-3",
    row: "h-7 text-[13px]",
    gap: "gap-3",
    pad: "p-4",
  },
  roomy: {
    glyph: 80,
    glyphSm: 44,
    cell: "gap-2.5 px-4 py-2.5 @min-[40rem]/moving-day:py-4",
    row: "h-8 text-[13px]",
    gap: "gap-4",
    pad: "p-5",
  },
};

/** How many samples of a kind the preview draws before it says "+n more". */
const shownOf = (c: MovingDayCategory) =>
  Math.min(c.samples.length, c.icon === "people" ? 6 : 3);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/** In view and the tab showing: the only time the import may run. */
function useLive(node: Element | null): boolean {
  const [live, setLive] = React.useState(false);
  React.useEffect(() => {
    if (!node) return;
    let seen = false;
    let shown = !document.hidden;
    const update = () => setLive(seen && shown);
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) seen = entry.isIntersecting;
      update();
    });
    io.observe(node);
    const onVisibility = () => {
      shown = !document.hidden;
      update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [node]);
  return live;
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

type BoxState = "waiting" | "open" | "background" | "done";

/**
 * A box, drawn. Opening is the lid: a carton's two flaps swing out about
 * their outer hinges, a crate's lid lifts and tilts about its back edge, a
 * tote's lid slides back — all on snap, the spring for a thing that toggles.
 */
function BoxGlyph({
  boxStyle,
  state,
  pigment,
  motionSafe,
}: {
  boxStyle: MovingDayBoxStyle;
  state: BoxState;
  pigment: string;
  motionSafe: boolean;
}) {
  const open = state === "open" || state === "background";
  const spring = motionSafe ? springs.snap : { duration: durations.fast };
  const face = pigment;
  const shade = `color-mix(in oklab, ${pigment} 78%, black)`;
  const edge = `color-mix(in oklab, ${pigment} 55%, black)`;
  const inside = `color-mix(in oklab, ${pigment} 52%, black)`;

  if (boxStyle === "crate") {
    return (
      <svg aria-hidden viewBox="0 0 64 56" className="block h-auto w-full">
        <rect x={9} y={20} width={46} height={7} fill={inside} />
        <rect
          x={8}
          y={24}
          width={48}
          height={28}
          rx={2}
          fill={face}
          stroke={edge}
          strokeWidth={1.2}
        />
        {[31, 38, 45].map((y) => (
          <line
            key={y}
            x1={8.6}
            x2={55.4}
            y1={y}
            y2={y}
            stroke={edge}
            strokeWidth={1}
            opacity={0.6}
          />
        ))}
        <rect x={12} y={28} width={3} height={20} rx={1} fill={shade} />
        <rect x={49} y={28} width={3} height={20} rx={1} fill={shade} />
        <motion.rect
          x={6}
          y={19}
          width={52}
          height={5}
          rx={1.5}
          fill={shade}
          stroke={edge}
          strokeWidth={1}
          style={{ originX: 0, originY: 1 }}
          initial={false}
          animate={open ? { y: -9, rotate: -16 } : { y: 0, rotate: 0 }}
          transition={spring}
        />
      </svg>
    );
  }

  if (boxStyle === "tote") {
    return (
      <svg aria-hidden viewBox="0 0 64 56" className="block h-auto w-full">
        <path
          d="M10 22 H54 L52 50 Q51.5 53 48.5 53 H15.5 Q12.5 53 12 50 Z"
          fill={face}
        />
        <path
          d="M10 22 H54 L52 50 Q51.5 53 48.5 53 H15.5 Q12.5 53 12 50 Z"
          fill="none"
          stroke={edge}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        <rect x={27} y={28} width={10} height={3.5} rx={1.75} fill={inside} />
        <line
          x1={13}
          x2={51}
          y1={40}
          y2={40}
          stroke={edge}
          strokeWidth={1}
          opacity={0.4}
        />
        <motion.g
          initial={false}
          animate={
            open ? { x: 14, y: -4, opacity: 0.9 } : { x: 0, y: 0, opacity: 1 }
          }
          transition={spring}
        >
          <rect
            x={7}
            y={16}
            width={50}
            height={7}
            rx={3}
            fill={shade}
            stroke={edge}
            strokeWidth={1}
          />
        </motion.g>
      </svg>
    );
  }

  // The carton: a front face, a dark mouth, and two flaps that meet in the
  // middle when it is shut.
  return (
    <svg aria-hidden viewBox="0 0 64 56" className="block h-auto w-full">
      <motion.rect
        x={9}
        y={20}
        width={46}
        height={4}
        fill={inside}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: durations.fast }}
      />
      <rect
        x={8}
        y={22}
        width={48}
        height={30}
        rx={1.5}
        fill={face}
        stroke={edge}
        strokeWidth={1.2}
      />
      <rect x={28} y={22} width={8} height={12} fill={shade} opacity={0.55} />
      <line
        x1={8.6}
        x2={55.4}
        y1={27}
        y2={27}
        stroke={edge}
        strokeWidth={0.8}
        opacity={0.35}
      />
      <motion.rect
        x={8}
        y={20}
        width={24}
        height={3}
        rx={1}
        fill={shade}
        stroke={edge}
        strokeWidth={0.8}
        style={{ originX: 0, originY: 0.5 }}
        initial={false}
        animate={{ rotate: open ? -128 : 0 }}
        transition={spring}
      />
      <motion.rect
        x={32}
        y={20}
        width={24}
        height={3}
        rx={1}
        fill={shade}
        stroke={edge}
        strokeWidth={0.8}
        style={{ originX: 1, originY: 0.5 }}
        initial={false}
        animate={{ rotate: open ? 128 : 0 }}
        transition={motionSafe ? { ...springs.snap, delay: 0.04 } : spring}
      />
    </svg>
  );
}

/** A count written straight from its motion value, in reserved tabular width. */
function CountText({
  value,
  width,
  className,
}: {
  value: MotionValue<number>;
  width: number;
  className?: string;
}) {
  const text = useTransform(value, (v) => fmt(v));
  return (
    <motion.span
      aria-hidden
      className={cn("inline-block text-right tabular-nums", className)}
      style={{ minWidth: `${width}ch` }}
    >
      {text}
    </motion.span>
  );
}

/**
 * One thing arriving in the new workspace. It is born where its box is —
 * the offset measured before the first paint — and travels to its own slot
 * on glide while its scale lands on recoil.
 */
function Arrival({
  from,
  motionSafe,
  delay = 0,
  className,
  children,
}: {
  from: () => HTMLElement | null;
  motionSafe: boolean;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(motionSafe ? 1 : 0);
  const offset = React.useRef<{ x: number; y: number } | null>(null);
  const fromRef = React.useRef(from);
  React.useEffect(() => {
    fromRef.current = from;
  });

  React.useLayoutEffect(() => {
    if (!node || !motionSafe || offset.current) return;
    const box = fromRef.current();
    if (!box) return;
    const a = box.getBoundingClientRect();
    const b = node.getBoundingClientRect();
    const dx = r1(a.left + a.width / 2 - (b.left + b.width / 2));
    const dy = r1(a.top + a.height / 3 - (b.top + b.height / 2));
    offset.current = { x: dx, y: dy };
    x.jump(dx);
    y.jump(dy);
    scale.jump(0.6);
  }, [node, motionSafe, x, y, scale]);

  React.useEffect(() => {
    if (!node) return;
    // Plain numbers into the values: the node has only just mounted.
    if (!motionSafe) {
      const c = animate(opacity.get(), 1, {
        duration: durations.base,
        ease: easings.enter,
        delay,
        onUpdate: (v) => opacity.set(r2(v)),
      });
      return () => c.stop();
    }
    const runs = [
      animate(x.get(), 0, {
        ...springs.glide,
        delay,
        onUpdate: (v) => x.set(r1(v)),
      }),
      animate(y.get(), 0, {
        ...springs.glide,
        delay,
        onUpdate: (v) => y.set(r1(v)),
      }),
      animate(scale.get(), 1, {
        ...springs.recoil,
        delay: delay + 0.08,
        onUpdate: (v) => scale.set(r2(v)),
      }),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
  }, [node, motionSafe, delay, x, y, scale, opacity]);

  return (
    <motion.li
      ref={setNode}
      className={cn("relative", className)}
      style={{ x, y, scale, opacity, zIndex: 5 }}
    >
      {children}
    </motion.li>
  );
}

/** A box whose height follows its content on glide, measured. */
function Measured({
  glide,
  children,
}: {
  glide: boolean;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: height ?? "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 6 }}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The step                                */
/* ----------------------------------------------------------------------- */

type Phase = "idle" | "running" | "paused" | "done";
type Toast = { cat: string; done: boolean; n: number };

/**
 * The import step of moving into a new workspace. Each category the old tool
 * holds is a box with its count; beside them sits the new workspace, empty.
 * Start opens the boxes in turn: the lid swings open on snap, the count rolls
 * up in tabular digits straight from a motion value, and the box's things
 * leave it one by one and settle into the workspace — each born at the box,
 * travelling to its slot on glide and landing on recoil. A finished box shuts
 * and takes a tick drawn on flick. A category too big to wait for keeps
 * counting in the background behind a thin bar while the next box opens, and
 * a toast says so. What cannot move is listed with its reason; Retry moves
 * the ones a second try can.
 *
 * Start, Pause, Resume, Retry and Open are real buttons, the primary one
 * keeping its focus as its label changes; the source is a radiogroup that
 * arrows move through. Box starts, finishes and pauses are announced once
 * each. Under reduced motion lids cross-fade and things fade in where they
 * belong; the counts still count. The simulated import runs only while the
 * step is on screen and the tab is visible.
 */
export function MovingDay({
  sources = defaultMovingDaySources,
  categories = defaultMovingDayCategories,
  source,
  defaultSource,
  onSourceChange,
  workspace = "Fieldline",
  onStart,
  onPause,
  onResume,
  onRetry,
  onDone,
  onOpenWorkspace,
  pace = 2400,
  backgroundAbove = 5000,
  boxStyle = "carton",
  density = "cozy",
  tone = "kraft",
  status = "ready",
  onReload,
  maxHeight = 560,
  disabled = false,
  className,
}: MovingDayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const pigment = TONE[tone] ?? TONE.kraft;
  const ready = status === "ready";

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const live = useLive(root);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const boxNodes = React.useRef(new Map<string, HTMLElement>());
  const timers = React.useRef(new Set<number>());

  const [ownSource, setOwnSource] = React.useState(
    () => defaultSource ?? sources[0]?.id ?? "",
  );
  const sourceId = source ?? ownSource;
  const src = sources.find((s) => s.id === sourceId) ?? sources[0];
  const blocked = src?.blocked ?? EMPTY_BLOCKED;
  const order = categories;
  const n = order.length;

  const totalOf = React.useCallback(
    (c: MovingDayCategory) => Math.max(0, Math.round(src?.counts[c.id] ?? 0)),
    [src],
  );
  const blockedIn = React.useCallback(
    (c: MovingDayCategory) =>
      blocked.filter((b) => b.categoryId === c.id).length,
    [blocked],
  );
  const grand = order.reduce((t, c) => t + totalOf(c), 0);

  /* -------------------------------- state ------------------------------- */

  const [phase, setPhase] = React.useState<Phase>("idle");
  const [at, setAt] = React.useState(0);
  const [boxes, setBoxes] = React.useState<Record<string, BoxState>>({});
  const [arrived, setArrived] = React.useState<Record<string, number>>({});
  const [stayed, setStayed] = React.useState<string[]>(() =>
    blocked.map((b) => b.id),
  );
  const [rescued, setRescued] = React.useState<MovingDayBlocked[]>([]);
  const [retrying, setRetrying] = React.useState(false);
  const [toast, setToast] = React.useState<Toast | null>(null);
  const [toastHidden, setToastHidden] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // One motion value per category: the count on its box and in the preview.
  const [values] = React.useState(() => new Map<string, MotionValue<number>>());
  const valueOf = (id: string) => {
    let v = values.get(id);
    if (!v) {
      v = motionValue(0);
      values.set(id, v);
    }
    return v;
  };
  const arrivedRef = React.useRef<Record<string, number>>({});
  const rolls = React.useRef(new Set<AnimationPlaybackControls>());
  const bgFrom = React.useRef(new Map<string, number>());

  // A new source (or new counts) is a fresh, unstarted move.
  const sourceKey = `${src?.id ?? ""}:${order
    .map((c) => `${c.id}=${totalOf(c)}`)
    .join(",")}:${blocked.map((b) => b.id).join(",")}`;
  const [seenKey, setSeenKey] = React.useState(sourceKey);
  if (seenKey !== sourceKey) {
    setSeenKey(sourceKey);
    setPhase("idle");
    setAt(0);
    setBoxes({});
    setArrived({});
    setStayed(blocked.map((b) => b.id));
    setRescued([]);
    setRetrying(false);
    setToast(null);
  }
  React.useEffect(() => {
    for (const v of values.values()) v.jump(0);
    arrivedRef.current = {};
    bgFrom.current.clear();
  }, [sourceKey, values]);

  React.useEffect(() => {
    const pending = timers.current;
    const running = rolls.current;
    return () => {
      for (const t of pending) window.clearTimeout(t);
      pending.clear();
      for (const r of running) r.stop();
      running.clear();
    };
  }, []);
  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /* ----------------------------- the driver ----------------------------- */

  const isBig = (c: MovingDayCategory) => totalOf(c) > backgroundAbove;
  const rescuedIn = (c: MovingDayCategory) =>
    rescued.filter((r) => r.categoryId === c.id).length;
  const movedOf = (c: MovingDayCategory) =>
    Math.max(0, totalOf(c) - blockedIn(c));
  const fgTargetOf = (c: MovingDayCategory) =>
    isBig(c) ? Math.round(movedOf(c) * 0.2) : movedOf(c);
  const rate = Math.max(1, pace);
  const fgSeconds = (c: MovingDayCategory) =>
    clamp(fgTargetOf(c) / rate, 0.9, 2.4);
  const bgSeconds = (c: MovingDayCategory) =>
    clamp((movedOf(c) - fgTargetOf(c)) / rate, 3, 8);

  const passDone = phase !== "idle" && at >= n;
  const bgIds = order.filter((c) => boxes[c.id] === "background");
  const bgKey = bgIds.map((c) => c.id).join("|");

  const finishAll = (stayedIds: string[]) => {
    setPhase("done");
    const moved = order.reduce((t, c) => t + movedOf(c), 0) + rescued.length;
    say(
      `Moved ${fmt(moved)} items from ${src?.name ?? "the old tool"}.${
        stayedIds.length ? ` ${things(stayedIds.length)} stayed behind.` : ""
      }`,
    );
    onDone?.({ moved, stayed: stayedIds });
  };

  const arrive = (c: MovingDayCategory, v: number, target: number) => {
    const k = shownOf(c);
    const have = arrivedRef.current[c.id] ?? 0;
    if (have >= k || target <= 0) return;
    // Things leave the box as its count passes each share of the total.
    const due = Math.min(k, Math.floor((v / target) * (k + 1)));
    if (due > have) {
      arrivedRef.current[c.id] = due;
      setArrived((a) => ({ ...a, [c.id]: due }));
    }
  };

  const finishFg = (c: MovingDayCategory, index: number) => {
    const next = order[index + 1];
    const big = isBig(c);
    const k = shownOf(c);
    arrivedRef.current[c.id] = k;
    setArrived((a) => ({ ...a, [c.id]: k }));
    if (big) {
      bgFrom.current.set(c.id, valueOf(c.id).get());
      setToast((t) => ({ cat: c.id, done: false, n: (t?.n ?? 0) + 1 }));
      setToastHidden(false);
    }
    setBoxes((b) => ({
      ...b,
      [c.id]: big ? "background" : "done",
      ...(next ? { [next.id]: "open" } : {}),
    }));
    setAt(index + 1);
    const stillBg = order.some(
      (o) => o.id !== c.id && boxes[o.id] === "background",
    );
    if (!next) {
      if (!big && !stillBg) {
        finishAll(stayed);
      } else if (stayed.length > 0) {
        say(
          `${big ? `${c.label} keep moving in the background. ` : ""}${things(stayed.length)} stayed behind.`,
        );
      }
    } else {
      say(
        big
          ? `${c.label} keep moving in the background. Opening ${next.label.toLowerCase()}.`
          : `${c.label} moved: ${fmt(movedOf(c))} of ${fmt(totalOf(c))}. Opening ${next.label.toLowerCase()}.`,
      );
    }
  };

  const finishBg = (c: MovingDayCategory) => {
    setBoxes((b) => ({ ...b, [c.id]: "done" }));
    setToast((t) => ({ cat: c.id, done: true, n: (t?.n ?? 0) + 1 }));
    later(
      () => setToast((t) => (t && t.cat === c.id && t.done ? null : t)),
      2400,
    );
    const stillBg = order.some(
      (o) => o.id !== c.id && boxes[o.id] === "background",
    );
    if (at >= n && !stillBg) finishAll(stayed);
    else say(`All ${count(movedOf(c) + rescuedIn(c), c.unit)} are here.`);
  };

  const api = React.useRef({ arrive, finishFg, finishBg });
  React.useEffect(() => {
    api.current = { arrive, finishFg, finishBg };
  });

  const runningNow = phase === "running" && live && ready && !disabled;
  React.useEffect(() => {
    if (!runningNow) return;
    const runs: AnimationPlaybackControls[] = [];
    const fg = order[at];
    if (fg) {
      const v = valueOf(fg.id);
      const target = fgTargetOf(fg);
      const from = Math.min(v.get(), target);
      const left = target > 0 ? (target - from) / target : 0;
      // Linear, so a pause and a resume take exactly the time that was left.
      runs.push(
        animate(from, target, {
          duration: Math.max(0.05, fgSeconds(fg) * left),
          ease: "linear",
          onUpdate: (x) => {
            v.set(Math.round(x));
            api.current.arrive(fg, x, target);
          },
          onComplete: () => api.current.finishFg(fg, at),
        }),
      );
    }
    for (const c of bgIds) {
      const v = valueOf(c.id);
      const target = movedOf(c);
      const start = bgFrom.current.get(c.id) ?? 0;
      const from = Math.min(v.get(), target);
      const span = Math.max(1, target - start);
      runs.push(
        animate(from, target, {
          duration: Math.max(0.05, bgSeconds(c) * ((target - from) / span)),
          ease: "linear",
          onUpdate: (x) => v.set(Math.round(x)),
          onComplete: () => api.current.finishBg(c),
        }),
      );
    }
    return () => {
      for (const r of runs) r.stop();
    };
    // The driver restarts only when the run, the open box or the set of
    // background boxes changes; everything else is read as it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningNow, at, bgKey, sourceKey]);

  // The list of what stayed behind slides into view when it opens.
  const [scrollAsk, setScrollAsk] = React.useState(0);
  React.useEffect(() => {
    if (scrollAsk === 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      const target = Math.max(0, el.scrollHeight - el.clientHeight);
      if (!motionSafe || Math.abs(target - el.scrollTop) < 2) {
        el.scrollTop = target;
        return;
      }
      animate(el.scrollTop, target, {
        ...springs.glide,
        onUpdate: (v) => {
          el.scrollTop = Math.round(v);
        },
      });
    }, 320);
    return () => window.clearTimeout(t);
  }, [scrollAsk, motionSafe]);
  const passDoneSeen = React.useRef(false);
  React.useEffect(() => {
    if (passDone && !passDoneSeen.current && stayed.length > 0) {
      passDoneSeen.current = true;
      setScrollAsk((s) => s + 1);
    }
    if (!passDone) passDoneSeen.current = false;
  }, [passDone, stayed.length]);

  /* ------------------------------- actions ------------------------------ */

  const start = () => {
    if (!src || disabled || !ready || n === 0) return;
    for (const v of values.values()) v.jump(0);
    arrivedRef.current = {};
    bgFrom.current.clear();
    const first = order[0];
    setBoxes(first ? { [first.id]: "open" } : {});
    setArrived({});
    setAt(0);
    setStayed(blocked.map((b) => b.id));
    setRescued([]);
    setToast(null);
    setPhase("running");
    onStart?.(src.id);
    say(
      `Moving ${fmt(grand)} items from ${src.name}. Opening ${first?.label.toLowerCase() ?? "the first box"}.`,
    );
  };

  const pause = () => {
    if (!src) return;
    setPhase("paused");
    onPause?.(src.id);
    const c = order[at];
    say(c ? `Paused at ${c.label.toLowerCase()}.` : "Paused.");
  };

  const resume = () => {
    if (!src) return;
    setPhase("running");
    onResume?.(src.id);
    say("Moving again.");
  };

  const retry = () => {
    if (retrying || disabled) return;
    const list = blocked.filter((b) => stayed.includes(b.id));
    if (list.length === 0) return;
    setRetrying(true);
    onRetry?.(list.map((b) => b.id));
    say(`Trying ${things(list.length)} again.`);
    later(() => {
      const moved = list.filter((b) => b.retryable);
      const left = list.filter((b) => !b.retryable).map((b) => b.id);
      setRetrying(false);
      setStayed(left);
      setRescued((r) => [...r, ...moved]);
      for (const b of moved) {
        const v = valueOf(b.categoryId);
        const to = v.get() + 1;
        if (motionSafe) {
          const roll = animate(v.get(), to, {
            duration: durations.slow,
            ease: easings.enter,
            onUpdate: (x) => v.set(Math.round(x)),
            onComplete: () => rolls.current.delete(roll),
          });
          rolls.current.add(roll);
        } else v.set(to);
      }
      say(
        moved.length === 0
          ? `Nothing more could move. ${things(left.length)} stayed behind.`
          : `${things(moved.length)} moved on the second try.${
              left.length ? ` ${things(left.length)} stayed behind.` : ""
            }`,
      );
    }, 900);
  };

  const pickSource = (id: string) => {
    if (disabled || phase !== "idle" || id === sourceId) return;
    if (source === undefined) setOwnSource(id);
    onSourceChange?.(id);
  };

  const radioNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const onRadioKey = (event: React.KeyboardEvent, index: number) => {
    const last = sources.length - 1;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (to === -1) return;
    event.preventDefault();
    const next = sources[to];
    if (!next) return;
    radioNodes.current.get(next.id)?.focus();
    pickSource(next.id);
  };

  /* ------------------------------- render ------------------------------- */

  const stayedList = blocked.filter((b) => stayed.includes(b.id));
  const canRetry = passDone && stayedList.some((b) => b.retryable) && !retrying;
  const movedSoFar = order.reduce((t, c) => t + movedOf(c), 0) + rescued.length;
  const current = order[at];
  const summary = !ready
    ? status === "loading"
      ? `Counting what ${src?.name ?? "the old tool"} holds`
      : "The counts did not load"
    : phase === "idle"
      ? `${fmt(grand)} items in ${n} ${n === 1 ? "box" : "boxes"}`
      : phase === "paused"
        ? `Paused at ${current?.label.toLowerCase() ?? "the last box"}`
        : phase === "done"
          ? `Moved ${fmt(movedSoFar)} items${
              stayedList.length ? ` · ${stayedList.length} stayed behind` : ""
            }`
          : passDone
            ? `${bgIds.map((c) => c.label).join(", ")} moving in the background`
            : `Moving ${current?.label.toLowerCase() ?? "everything"}`;

  const primaryKind: "start" | "resume" | "open" | "pause" =
    phase === "idle"
      ? "start"
      : phase === "paused"
        ? "resume"
        : passDone
          ? "open"
          : "pause";
  const primary = {
    start: { label: "Start import", icon: Play },
    resume: { label: "Resume", icon: Play },
    open: { label: `Open ${workspace}`, icon: ArrowRight },
    pause: { label: "Pause", icon: Pause },
  }[primaryKind];
  const primaryOff =
    disabled || (primaryKind === "start" && (!ready || !src || n === 0));
  const runPrimary = () => {
    if (primaryOff) return;
    if (primaryKind === "start") start();
    else if (primaryKind === "resume") resume();
    else if (primaryKind === "pause") pause();
    else onOpenWorkspace?.();
  };
  const PrimaryIcon = primary.icon;
  const toastCat = toast ? order.find((c) => c.id === toast.cat) : undefined;

  const boxList = (
    <ul
      role="list"
      aria-label="Boxes"
      className={cn(
        "grid grid-cols-1 content-start gap-2 @min-[40rem]/moving-day:grid-cols-2",
        density === "roomy"
          ? "@min-[40rem]/moving-day:gap-4"
          : density === "cozy"
            ? "@min-[40rem]/moving-day:gap-3"
            : "",
      )}
    >
      {order.map((c) => {
        const state: BoxState = boxes[c.id] ?? "waiting";
        const total = totalOf(c);
        const moved = movedOf(c);
        const lost = blocked.filter(
          (b) => b.categoryId === c.id && stayed.includes(b.id),
        ).length;
        const Icon = ICON[c.icon ?? "projects"];
        const sentence =
          state === "open"
            ? `${c.label}, moving, ${count(total, c.unit)} in all`
            : state === "background"
              ? `${c.label}, moving in the background`
              : state === "done"
                ? `${c.label}, ${fmt(moved + rescued.filter((r) => r.categoryId === c.id).length)} of ${fmt(total)} moved${lost ? `, ${lost} stayed behind` : ""}`
                : `${c.label}, ${count(total, c.unit)} to move`;
        return (
          <li
            key={c.id}
            aria-label={sentence}
            className={cn(
              "relative flex items-center rounded-3 border text-left transition-colors duration-200",
              "@min-[40rem]/moving-day:flex-col @min-[40rem]/moving-day:text-center",
              d.cell,
              state === "open" || state === "background"
                ? "border-hairline-strong bg-surface-2"
                : "border-hairline bg-surface-1",
              state === "done" && "opacity-80",
            )}
          >
            <div
              ref={(node) => {
                if (node) boxNodes.current.set(c.id, node);
                else boxNodes.current.delete(c.id);
              }}
              className="relative w-(--md-glyph-sm) shrink-0 @min-[40rem]/moving-day:w-(--md-glyph)"
              style={{
                ["--md-glyph-sm" as string]: `${d.glyphSm}px`,
                ["--md-glyph" as string]: `${d.glyph}px`,
              }}
            >
              <div className="w-full">
                {ready ? (
                  <BoxGlyph
                    boxStyle={boxStyle}
                    state={state}
                    pigment={pigment}
                    motionSafe={motionSafe}
                  />
                ) : (
                  <span className="block aspect-[64/56] w-full rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                )}
              </div>
            </div>
            <div className="ml-3 min-w-0 flex-1 @min-[40rem]/moving-day:ml-0 @min-[40rem]/moving-day:w-full @min-[40rem]/moving-day:flex-none">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-foreground @min-[40rem]/moving-day:justify-center">
                <Icon aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                <span className="truncate">{c.label}</span>
              </p>
              <p className="mt-0.5 font-mono text-[12px] text-ink-2">
                {ready ? (
                  <>
                    <CountText
                      value={valueOf(c.id)}
                      width={fmt(total).length}
                      className="text-foreground"
                    />
                    <span className="text-ink-3"> / {fmt(total)}</span>
                  </>
                ) : (
                  <span className="inline-block h-3 w-16 rounded-full bg-surface-2 align-middle" />
                )}
              </p>
              {state === "background" ? (
                <BackgroundBar
                  value={valueOf(c.id)}
                  target={moved}
                  pigment={pigment}
                />
              ) : null}
            </div>
            <AnimatePresence initial={false}>
              {state === "done" ? (
                <motion.span
                  key="tick"
                  aria-hidden
                  className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-success/15 text-success"
                  initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          scale: springs.snap,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  <svg viewBox="0 0 16 16" className="size-3">
                    <motion.path
                      d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: motionSafe ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={
                        motionSafe
                          ? { ...springs.flick, delay: 0.08 }
                          : { duration: 0 }
                      }
                    />
                  </svg>
                </motion.span>
              ) : null}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );

  const preview = (
    <aside
      aria-label={`${workspace} preview`}
      className="relative flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3"
    >
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-2 bg-primary text-[10px] text-primary-foreground"
        >
          {workspace.charAt(0)}
        </span>
        <span className="truncate">{workspace}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] font-normal tracking-[0.08em] text-ink-3 uppercase">
          New
        </span>
      </p>
      {order.map((c) => {
        const k = arrived[c.id] ?? 0;
        const extra = rescued.filter((r) => r.categoryId === c.id);
        const Icon = ICON[c.icon ?? "projects"];
        const people = c.icon === "people";
        const from = () => boxNodes.current.get(c.id) ?? null;
        const shown = c.samples.slice(0, k);
        const done = boxes[c.id] === "done";
        const rest = movedOf(c) - shown.length;
        return (
          <div key={c.id} className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {c.label}
              <CountText
                value={valueOf(c.id)}
                width={1}
                className="ml-auto text-left"
              />
            </p>
            {k === 0 && extra.length === 0 ? (
              <p className={cn("flex items-center text-ink-3", d.row)}>
                Nothing here yet
              </p>
            ) : (
              <ul
                role="list"
                className={cn(
                  people ? "flex flex-wrap gap-1" : "flex flex-col",
                )}
              >
                {extra.map((b) => (
                  <Arrival
                    key={b.id}
                    from={from}
                    motionSafe={motionSafe}
                    className={cn("flex items-center gap-2", d.row)}
                  >
                    <Icon
                      aria-hidden
                      className="size-3.5 shrink-0 text-success"
                    />
                    <span className="truncate">{b.name}</span>
                  </Arrival>
                ))}
                {shown.map((name) =>
                  people ? (
                    <Arrival
                      key={name}
                      from={from}
                      motionSafe={motionSafe}
                      className="flex"
                    >
                      <span
                        title={name}
                        className="flex size-6 items-center justify-center rounded-full bg-cobalt-wash text-[10px] font-semibold text-cobalt-bright"
                      >
                        {initials(name)}
                      </span>
                      <span className="sr-only">{name}</span>
                    </Arrival>
                  ) : (
                    <Arrival
                      key={name}
                      from={from}
                      motionSafe={motionSafe}
                      className={cn("flex items-center gap-2", d.row)}
                    >
                      <Icon
                        aria-hidden
                        className="size-3.5 shrink-0 text-ink-3"
                      />
                      <span
                        className={cn(
                          "truncate",
                          c.icon === "comments" && "text-ink-2 italic",
                        )}
                      >
                        {name}
                      </span>
                    </Arrival>
                  ),
                )}
                {done && rest > 0 ? (
                  <motion.li
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: durations.base }}
                    className={cn(
                      "flex items-center text-[11px] text-ink-3",
                      people ? "h-6 px-1" : "h-5",
                    )}
                  >
                    +{fmt(rest)} more
                  </motion.li>
                ) : null}
              </ul>
            )}
          </div>
        );
      })}
    </aside>
  );

  const behind =
    passDone && stayedList.length > 0 ? (
      <div className="mt-1 rounded-3 border border-hairline bg-surface-1 p-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-warn" />
          {things(stayedList.length)} stayed behind
        </p>
        <ul role="list" className="mt-2 flex flex-col gap-1.5">
          <AnimatePresence initial={false}>
            {stayedList.map((b) => {
              const c = order.find((o) => o.id === b.categoryId);
              const Icon = ICON[c?.icon ?? "projects"];
              return (
                <motion.li
                  key={b.id}
                  className="flex items-start gap-2 text-[13px]"
                  initial={false}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: motionSafe ? distances.shift : 0,
                    transition: exitFor(),
                  }}
                >
                  <Icon
                    aria-hidden
                    className="mt-0.5 size-3.5 shrink-0 text-ink-3"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">
                      {b.name}
                    </span>
                    <span className="block text-[11px] text-ink-2">
                      {b.reason}
                      {b.retryable ? " · can be retried" : ""}
                    </span>
                  </span>
                  {retrying && b.retryable ? (
                    <LoaderCircle
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-ink-3 motion-safe:animate-spin"
                    />
                  ) : null}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      </div>
    ) : null;

  let body: React.ReactNode;
  if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">
          We could not count what {src?.name ?? "the old tool"} holds.
        </p>
        {onReload ? (
          <button
            type="button"
            onClick={onReload}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div
        className={cn(
          "flex flex-col transition-[padding] duration-200",
          d.gap,
          d.pad,
          toast && !toastHidden && "pb-24",
        )}
      >
        <div
          className={cn(
            "grid grid-cols-1 @min-[40rem]/moving-day:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]",
            d.gap,
          )}
        >
          {boxList}
          {preview}
        </div>
        <Measured glide={motionSafe}>{behind}</Measured>
      </div>
    );
  }

  return (
    <section
      ref={setRoot}
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/moving-day relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ maxHeight }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            Bring everything over
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            From {src?.name ?? "your old tool"} to {workspace}
            {src?.detail ? ` · ${src.detail}` : ""}
          </p>
        </div>
        {sources.length > 1 ? (
          <div
            role="radiogroup"
            aria-label="Import from"
            aria-disabled={phase !== "idle" || disabled || undefined}
            className="grid w-full [grid-auto-columns:minmax(0,1fr)] grid-flow-col items-center gap-1 rounded-full border border-hairline bg-surface-1 p-0.5 @min-[40rem]/moving-day:w-auto @min-[40rem]/moving-day:[grid-auto-columns:auto]"
          >
            {sources.map((s, i) => {
              const on = s.id === sourceId;
              return (
                <button
                  key={s.id}
                  ref={(node) => {
                    if (node) radioNodes.current.set(s.id, node);
                    else radioNodes.current.delete(s.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  aria-disabled={phase !== "idle" || disabled || undefined}
                  onClick={() => pickSource(s.id)}
                  onKeyDown={(e) => onRadioKey(e, i)}
                  title={s.detail ? `${s.name} · ${s.detail}` : s.name}
                  className={cn(
                    "inline-flex h-7 min-w-0 items-center justify-center rounded-full border px-2 text-[11px] transition-colors duration-200 @min-[40rem]/moving-day:px-3 @min-[40rem]/moving-day:text-xs",
                    on
                      ? "border-hairline-strong bg-card text-foreground shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent)]"
                      : "border-transparent text-ink-2 hover:text-foreground",
                    phase !== "idle" && !on && "opacity-50",
                    FOCUS,
                  )}
                >
                  <span className="truncate">{s.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
      >
        {body}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        <p className="mr-auto min-w-0 truncate text-[12px] text-ink-2 tabular-nums">
          {summary}
        </p>
        {canRetry || retrying ? (
          <button
            type="button"
            onClick={retry}
            aria-disabled={retrying || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            {retrying ? (
              <LoaderCircle
                aria-hidden
                className="size-3.5 motion-safe:animate-spin"
              />
            ) : (
              <RotateCcw aria-hidden className="size-3.5" />
            )}
            {retrying
              ? "Retrying"
              : `Retry ${stayedList.filter((b) => b.retryable).length}`}
          </button>
        ) : null}
        <button
          type="button"
          onClick={runPrimary}
          aria-disabled={primaryOff || undefined}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity aria-disabled:opacity-50",
            FOCUS,
          )}
        >
          <PrimaryIcon aria-hidden className="size-3.5" />
          {primary.label}
        </button>
      </footer>

      <AnimatePresence>
        {toast && toastCat && !toastHidden ? (
          <motion.div
            key="toast"
            className="absolute inset-x-3 bottom-16 z-20 flex items-start gap-2.5 rounded-3 border border-hairline-strong bg-popover px-3 py-2.5 shadow-[0_10px_28px_color-mix(in_oklab,black_20%,transparent)]"
            initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: motionSafe ? distances.step : 0,
              transition: exitFor(),
            }}
            transition={
              motionSafe
                ? { y: springs.recoil, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            <span
              aria-hidden
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: `color-mix(in oklab, ${pigment} 26%, transparent)`,
              }}
            >
              {toast.done ? (
                <svg viewBox="0 0 16 16" className="size-3 text-success">
                  <path
                    d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <LoaderCircle className="size-3 text-ink-2 motion-safe:animate-spin" />
              )}
            </span>
            <p className="min-w-0 flex-1 text-[12px] leading-5 text-foreground">
              {toast.done ? (
                <>
                  All{" "}
                  {count(
                    movedOf(toastCat) + rescuedIn(toastCat),
                    toastCat.unit,
                  )}{" "}
                  are here.
                </>
              ) : (
                <>
                  {fmt(movedOf(toastCat))} {toastCat.unit.other} keep moving in
                  the background.{" "}
                  <span className="text-ink-2">
                    You can start using {workspace} now.
                  </span>
                </>
              )}
            </p>
            <button
              type="button"
              aria-label="Hide"
              onClick={() => setToastHidden(true)}
              className={cn(
                "-my-1 -mr-1 inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS,
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}

/** The slow tail of a big box: a thin bar under its count. */
function BackgroundBar({
  value,
  target,
  pigment,
}: {
  value: MotionValue<number>;
  target: number;
  pigment: string;
}) {
  const scaleX = useTransform(value, (v) =>
    Number(clamp(target > 0 ? v / target : 1, 0, 1).toFixed(3)),
  );
  return (
    <span
      aria-hidden
      className="mt-1.5 block h-1 w-full overflow-clip rounded-full bg-hairline @min-[40rem]/moving-day:mx-auto @min-[40rem]/moving-day:w-24"
    >
      <motion.span
        className="block h-full w-full rounded-full"
        style={{ scaleX, originX: 0, backgroundColor: pigment }}
      />
    </span>
  );
}
