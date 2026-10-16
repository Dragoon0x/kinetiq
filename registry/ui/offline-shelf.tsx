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
  ClipboardCheck,
  Clock3,
  CloudOff,
  ListChecks,
  RotateCw,
  StickyNote,
  type LucideIcon,
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

export type OfflineShelfKind = "inspection" | "photo" | "checklist" | "note";

export type OfflineShelfItem = {
  id: string;
  title: string;
  /** Where it belongs: a site, a yard, a room. */
  place?: string;
  /** Picks the row's icon. @default "inspection" */
  kind?: OfflineShelfKind;
  /** When it was last edited, in ms. */
  updatedAt: number;
};

export type OfflineShelfError = { message: string; code?: string };
export type OfflineShelfStatus = "offline" | "online";
export type OfflineShelfRetryStyle = "ring" | "bar" | "ticks";
export type OfflineShelfStampStyle = "stamp" | "tag" | "dim";
export type OfflineShelfTone = "quiet" | "amber" | "cobalt";
export type OfflineShelfRetryCause = "auto" | "manual";

export type OfflineShelfProps = {
  /** What the device kept from the last time the list loaded. @default defaultOfflineShelfCached */
  cachedItems?: OfflineShelfItem[];
  /** What the server sent once it answered. New ids slide in above the cached rows; known ids take the fresh copy. @default the cached items, re-verified */
  freshItems?: OfflineShelfItem[];
  /** Whether the server can be reached. @default "offline" */
  status?: OfflineShelfStatus;
  /** Why the list did not load: shown as it is, with its code in mono. @default a 30-second timeout */
  error?: string | OfflineShelfError;
  /** When the cache was written, in ms. @default two hours before `now` */
  cachedAt?: number;
  /** The moment ages count from, in ms — never read from the clock. @default defaultOfflineShelfNow */
  now?: number;
  /** Seconds to wait before each automatic attempt; the last one repeats. @default [5, 10, 20, 40, 60] */
  retryDelays?: number[];
  /** An attempt starts. Resolve once the server answered (then set `status` to "online"); reject, or return nothing, and the next wait is longer. */
  onRetry?: (
    cause: OfflineShelfRetryCause,
    attempt: number,
  ) => void | Promise<unknown>;
  /** A cached row was opened (Enter or a press) while offline. */
  onOpenCached?: (item: OfflineShelfItem) => void;
  /** A row was opened while online. */
  onOpen?: (item: OfflineShelfItem) => void;
  /** Hold the countdown where it is. @default false */
  paused?: boolean;
  /** How the wait is drawn: a ring that drains, a bar along the banner, or ten ticks going out. @default "ring" */
  retryStyle?: OfflineShelfRetryStyle;
  /** How a cached row is marked: a rubber stamp, a quiet tag, or a dimmed row. @default "stamp" */
  stampStyle?: OfflineShelfStampStyle;
  /** The banner's colour: ink, amber or cobalt. @default "quiet" */
  tone?: OfflineShelfTone;
  /** The list's name. @default "Inspections" */
  title?: string;
  /** What cannot be reached, in the copy. @default "Fieldline" */
  source?: string;
  /** Tallest the surface grows before its list scrolls, px. @default 540 */
  maxHeight?: number;
  /** Nothing can be retried or opened, and the countdown holds. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Monday 12 October 2026, 14:05 UTC — the afternoon the yard lost signal. */
export const defaultOfflineShelfNow = Date.UTC(2026, 9, 12, 14, 5);
const N = defaultOfflineShelfNow;

/** Six North Yard inspections the tablet kept from this morning's sync. */
export const defaultOfflineShelfCached: OfflineShelfItem[] = [
  {
    id: "ins-pump3",
    title: "Pump house 3 valve check",
    place: "North yard",
    kind: "inspection",
    updatedAt: N - 3 * HOUR,
  },
  {
    id: "ins-gateb",
    title: "Gate B camera mast",
    place: "North yard",
    kind: "photo",
    updatedAt: N - 5 * HOUR,
  },
  {
    id: "ins-fuel",
    title: "Fuel bay daily checklist",
    place: "Fuel bay",
    kind: "checklist",
    updatedAt: N - 6 * HOUR,
  },
  {
    id: "ins-crane2",
    title: "Crane 2 load test",
    place: "Quay 4",
    kind: "inspection",
    updatedAt: N - 26 * HOUR,
  },
  {
    id: "ins-drain",
    title: "Drainage after the storm",
    place: "North yard",
    kind: "note",
    updatedAt: N - 29 * HOUR,
  },
  {
    id: "ins-fire",
    title: "Fire point audit",
    place: "Workshop",
    kind: "checklist",
    updatedAt: N - 50 * HOUR,
  },
];

/** What the server sends once it answers: two new inspections and a sign-off. */
export const defaultOfflineShelfFresh: OfflineShelfItem[] = [
  {
    id: "ins-berth7",
    title: "Berth 7 fender damage",
    place: "Quay 4",
    kind: "photo",
    updatedAt: N - 20 * MIN,
  },
  {
    id: "ins-fork12",
    title: "Forklift 12 pre-shift check",
    place: "Workshop",
    kind: "checklist",
    updatedAt: N - 45 * MIN,
  },
  {
    id: "ins-pump3",
    title: "Pump house 3 valve check, signed off",
    place: "North yard",
    kind: "inspection",
    updatedAt: N - 1 * HOUR,
  },
  ...defaultOfflineShelfCached.slice(1),
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const KIND: Record<OfflineShelfKind, LucideIcon> = {
  inspection: ClipboardCheck,
  photo: Camera,
  checklist: ListChecks,
  note: StickyNote,
};

/** Ink for quiet, the warn pigment for amber, the accent for cobalt: rule, icon and wait. */
const TONE: Record<
  OfflineShelfTone,
  { ink: string; wash: string; icon: string }
> = {
  quiet: {
    ink: "var(--ink-2)",
    wash: "var(--bg-2)",
    icon: "text-ink-2",
  },
  amber: {
    ink: "oklch(from var(--warn) 0.72 0.14 h)",
    wash: "color-mix(in oklab, oklch(from var(--warn) 0.8 0.13 h) 10%, var(--bg-1))",
    icon: "text-warn",
  },
  cobalt: {
    ink: "var(--accent-bright)",
    wash: "color-mix(in oklab, var(--accent-bright) 8%, var(--bg-1))",
    icon: "text-cobalt-bright",
  },
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const r3 = (v: number) => Number(v.toFixed(3));
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** "just now", "20 min ago", "3 h ago", "2 d ago" — a fixed formatter, so both renders agree. */
const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};
/** The stamp's short age: "3h", "2d". */
const short = (ms: number) => {
  const m = Math.max(0, Math.round(ms / MIN));
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

/** In view and the tab showing: the only time the countdown may run. */
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
/*                                The wait                                  */
/* ----------------------------------------------------------------------- */

function Tick({ fill, index }: { fill: MotionValue<number>; index: number }) {
  const opacity = useTransform(fill, (p) =>
    p > (index + 0.5) / 10 ? 1 : 0.18,
  );
  return (
    <motion.span
      className="h-3 w-[3px] rounded-full bg-(--os-ink)"
      style={{ opacity }}
    />
  );
}

/**
 * The countdown ring: one stroke drawn round from the top whose length is the
 * share of the wait still to go. While an attempt is in flight it becomes a
 * quarter arc that turns — only while on screen — or a still dotted ring.
 */
function WaitRing({
  fill,
  seconds,
  checking,
  spin,
  motionSafe,
}: {
  fill: MotionValue<number>;
  seconds: MotionValue<string>;
  checking: boolean;
  spin: MotionValue<number>;
  motionSafe: boolean;
}) {
  const offset = useTransform(fill, (p) => r3(1 - p));
  return (
    <span aria-hidden className="relative flex size-[30px] shrink-0">
      <svg viewBox="0 0 30 30" className="absolute inset-0 size-full">
        <circle
          cx={15}
          cy={15}
          r={12.5}
          fill="none"
          strokeWidth={2}
          className="stroke-hairline-strong"
        />
        {checking ? (
          <motion.circle
            cx={15}
            cy={15}
            r={12.5}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={motionSafe ? "0.26 0.74" : "0.02 0.08"}
            className="stroke-(--os-ink)"
            style={{ rotate: spin, originX: 0.5, originY: 0.5 }}
          />
        ) : (
          <g transform="rotate(-90 15 15)">
            <motion.circle
              cx={15}
              cy={15}
              r={12.5}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              className="stroke-(--os-ink)"
              style={{ strokeDashoffset: offset }}
            />
          </g>
        )}
      </svg>
      <motion.span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-[10px] leading-none text-foreground tabular-nums transition-opacity",
          checking && "opacity-0",
        )}
      >
        {seconds}
      </motion.span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The marks                                 */
/* ----------------------------------------------------------------------- */

function CachedMark({
  style,
  age,
  index,
  step,
  motionSafe,
}: {
  style: OfflineShelfStampStyle;
  age: string;
  index: number;
  step: number;
  motionSafe: boolean;
}) {
  const delay = index * step;
  if (style === "tag") {
    return (
      <motion.span
        aria-hidden
        className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-hairline-strong px-2 font-mono text-[10px] text-ink-3"
        initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{
          opacity: 0,
          y: motionSafe ? -distances.step : 0,
          transition: { ...exitFor(durations.base), delay },
        }}
        transition={{
          opacity: { duration: durations.base, ease: easings.enter, delay },
          y: motionSafe ? { ...springs.snap, delay } : { duration: 0 },
        }}
      >
        Cached · {age}
      </motion.span>
    );
  }
  if (style === "dim") {
    return (
      <motion.span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center text-ink-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { ...exitFor(), delay } }}
        transition={{ duration: durations.base, ease: easings.enter, delay }}
      >
        <Clock3 className="size-3.5" />
      </motion.span>
    );
  }
  // A rubber stamp: pressed on with recoil, lifted off on the exit ease —
  // up a little, a little larger and turning, the way a stamp leaves paper.
  // Two nested rules with a clear gap make the double border.
  return (
    <motion.span
      aria-hidden
      className="flex shrink-0 rounded-1 border-[1.5px] border-(--os-stamp) p-[1.5px] text-(--os-stamp)"
      initial={
        motionSafe
          ? { opacity: 0, scale: 1.3, rotate: -12 }
          : { opacity: 0, scale: 1, rotate: -7 }
      }
      animate={{ opacity: 0.88, scale: 1, rotate: -7 }}
      exit={
        motionSafe
          ? {
              opacity: 0,
              y: -6,
              scale: 1.12,
              rotate: -1,
              transition: { duration: 0.26, ease: easings.exit, delay },
            }
          : { opacity: 0, transition: { ...exitFor(), delay } }
      }
      transition={
        motionSafe
          ? {
              opacity: { duration: durations.fast, delay },
              scale: { ...springs.recoil, delay },
              rotate: { ...springs.recoil, delay },
            }
          : { duration: durations.fast, delay }
      }
    >
      <span className="flex flex-col items-center rounded-[1px] border border-(--os-stamp) px-1.5 pt-[3px] pb-[2px] font-mono leading-none">
        <span className="text-[8.5px] font-semibold tracking-[0.14em] uppercase">
          Cached
        </span>
        <span className="mt-[2px] text-[8px] tracking-[0.08em] uppercase opacity-80">
          {age}
        </span>
      </span>
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The shelf                                */
/* ----------------------------------------------------------------------- */

type Stage = "counting" | "checking" | "refill";
type Said = { n: number; text: string };
type Row = {
  item: OfflineShelfItem;
  cached: boolean;
  fresh: boolean;
  updated: boolean;
};

/**
 * A list that failed to load, shown honestly: a banner that says the server
 * cannot be reached and why, a countdown to the next automatic attempt, and
 * under it what the device kept, each row wearing a Cached mark. The wait is
 * one motion value running down at the rate of time; when it runs out the
 * shelf asks `onRetry`, and an attempt that fails refills the wait to the
 * next, longer delay on `springs.glide`.
 *
 * Back online, the banner folds away, the Cached marks lift off down the list
 * on `cascade()` — a stamp rises, grows and turns as it fades on the exit
 * ease — and the fresh rows slide in above the cached ones, their height
 * growing on `springs.glide`. Going offline again presses the stamps back on
 * with `springs.recoil`. R retries now from anywhere inside; the rows are one
 * tab stop with the arrow keys moving between them and Enter opening. Under
 * reduced motion the wait steps per second and marks and rows cross-fade.
 */
export function OfflineShelf({
  cachedItems = defaultOfflineShelfCached,
  freshItems,
  status = "offline",
  error = {
    message: "The request timed out after 30 seconds.",
    code: "ETIMEDOUT",
  },
  cachedAt,
  now = defaultOfflineShelfNow,
  retryDelays = [5, 10, 20, 40, 60],
  onRetry,
  onOpenCached,
  onOpen,
  paused = false,
  retryStyle = "ring",
  stampStyle = "stamp",
  tone = "quiet",
  title = "Inspections",
  source = "Fieldline",
  maxHeight = 540,
  disabled = false,
  className,
}: OfflineShelfProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const online = status === "online";
  const err: OfflineShelfError =
    typeof error === "string" ? { message: error } : error;
  const delays = retryDelays.length > 0 ? retryDelays : [5];
  const delayFor = (attempt: number) =>
    Math.max(1, Math.round(delays[Math.min(attempt, delays.length - 1)] ?? 5));
  const savedAt = cachedAt ?? now - 2 * HOUR;
  const tones = TONE[tone] ?? TONE.quiet;

  /* ------------------------------- rows --------------------------------- */

  const rows: Row[] = React.useMemo(() => {
    if (!online) {
      return cachedItems.map((item) => ({
        item,
        cached: true,
        fresh: false,
        updated: false,
      }));
    }
    const list = freshItems ?? cachedItems;
    const known = new Map(cachedItems.map((c) => [c.id, c]));
    const byId = new Map(list.map((f) => [f.id, f]));
    const arrivals = list
      .filter((f) => !known.has(f.id))
      .map((item) => ({ item, cached: false, fresh: true, updated: false }));
    const kept = cachedItems.map((c) => {
      const f = byId.get(c.id);
      return {
        item: f ?? c,
        cached: false,
        fresh: false,
        updated: !!f && (f.title !== c.title || f.updatedAt !== c.updatedAt),
      };
    });
    return [...arrivals, ...kept];
  }, [online, freshItems, cachedItems]);
  const arrivals = rows.filter((r) => r.fresh).length;
  const updates = rows.filter((r) => r.updated).length;

  /* ------------------------------- state -------------------------------- */

  const [attempt, setAttempt] = React.useState(0);
  const [stage, setStage] = React.useState<Stage>("counting");
  const [total, setTotal] = React.useState(() => delayFor(0));
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [flips, setFlips] = React.useState(0);

  // The connection changing is decided in render, so the new round starts
  // with the render that shows it: a fresh first wait, from the top.
  const [seenOnline, setSeenOnline] = React.useState(online);
  if (seenOnline !== online) {
    setSeenOnline(online);
    setFlips((f) => f + 1);
    setAttempt(0);
    setTotal(delayFor(0));
    setStage(online ? "counting" : "refill");
    setSaid((s) => ({
      n: s.n + 1,
      text: online
        ? `Back online. ${
            arrivals > 0 ? `${plural(arrivals, "new item")}` : "Nothing new"
          }${updates > 0 ? `, ${updates} updated` : ""}.`
        : `${source} can't be reached. Showing ${plural(cachedItems.length, "saved item")}.`,
    }));
  }

  const left = useMotionValue(delayFor(0));
  const spin = useMotionValue(0);
  const fill = useTransform(left, (v) =>
    clamp01(motionSafe ? v / total : Math.ceil(v - 0.001) / total),
  );
  const seconds = useTransform(left, (v) =>
    String(Math.max(0, Math.ceil(v - 0.001))),
  );
  const barScale = useTransform(fill, (p) => r3(p));

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const live = useLive(root);
  const active = live && !paused && !disabled;

  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* ------------------------------ attempts ------------------------------ */

  const fire = (cause: OfflineShelfRetryCause) => {
    if (online || disabled || stage === "checking") return;
    const n = attempt + 1;
    setStage("checking");
    if (cause === "manual") say(`Checking ${source} now.`);
    const failed = () => {
      if (!alive.current) return;
      const wait = delayFor(n);
      setAttempt(n);
      setTotal(wait);
      left.jump(0);
      setStage("refill");
      say(`Attempt ${n} didn't reach ${source}. Next try in ${wait} seconds.`);
    };
    let result: void | Promise<unknown>;
    try {
      result = onRetry?.(cause, n);
    } catch (e) {
      result = Promise.reject(e);
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(() => {
        // Answered: the host turns the status online. If it does not, the
        // same wait runs again rather than a longer one.
        if (!alive.current) return;
        left.jump(0);
        setStage("refill");
      }, failed);
    } else {
      failed();
    }
  };
  const fireRef = React.useRef(fire);
  React.useEffect(() => {
    fireRef.current = fire;
  });

  // A fresh wait fills the ring up to its length on glide before it runs.
  React.useEffect(() => {
    if (online || stage !== "refill") return;
    let on = true;
    const done = () => {
      if (on) setStage("counting");
    };
    if (!motionSafe || !active) {
      left.jump(total);
      const id = window.setTimeout(done, 0);
      return () => {
        on = false;
        window.clearTimeout(id);
      };
    }
    const c = animate(left, total, springs.glide);
    void c.then(done);
    return () => {
      on = false;
      c.stop();
    };
  }, [online, stage, total, motionSafe, active, left]);

  // The wait itself: a linear run down to zero, only while it can be seen.
  React.useEffect(() => {
    if (online || stage !== "counting" || !active) return;
    let on = true;
    const remaining = left.get();
    const c = animate(left, 0, {
      duration: Math.max(0.05, remaining),
      ease: "linear",
    });
    void c.then(() => {
      if (on) fireRef.current("auto");
    });
    return () => {
      on = false;
      c.stop();
    };
  }, [online, stage, active, left]);

  // The checking arc turns only while an attempt is out and on screen.
  React.useEffect(() => {
    if (stage !== "checking" || !live || !motionSafe) return;
    const c = animate(spin, spin.get() + 360, {
      duration: 1,
      ease: "linear",
      repeat: Infinity,
    });
    return () => c.stop();
  }, [stage, live, motionSafe, spin]);

  /* ------------------------------ keyboard ------------------------------ */

  const rowButtons = React.useRef(new Map<string, HTMLButtonElement>());

  // A fade at the foot of the list while there is more below it.
  const listFade = useMotionValue(0);
  const [list, setList] = React.useState<HTMLUListElement | null>(null);
  const measureList = React.useCallback(() => {
    if (!list) return;
    const rest = list.scrollHeight - list.clientHeight - list.scrollTop;
    listFade.set(r3(clamp01(rest / 24)));
  }, [list, listFade]);
  React.useEffect(() => {
    if (!list) return;
    measureList();
    const ro = new ResizeObserver(measureList);
    ro.observe(list);
    for (const child of Array.from(list.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [list, measureList, rows.length]);
  const current =
    activeId && rows.some((r) => r.item.id === activeId)
      ? activeId
      : (rows[0]?.item.id ?? null);

  const open = (row: Row) => {
    if (disabled) return;
    if (row.cached) onOpenCached?.(row.item);
    else onOpen?.(row.item);
  };

  const onRowKey = (event: React.KeyboardEvent, index: number) => {
    let to = -1;
    if (event.key === "ArrowDown") to = Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowUp") to = Math.max(0, index - 1);
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = rows.length - 1;
    else return;
    event.preventDefault();
    const id = rows[to]?.item.id;
    if (!id) return;
    setActiveId(id);
    rowButtons.current.get(id)?.focus();
  };

  const onRootKey = (event: React.KeyboardEvent) => {
    if (event.key !== "r" && event.key !== "R") return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const t = event.target as HTMLElement;
    if (
      t.isContentEditable ||
      t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT"
    ) {
      return;
    }
    if (online) return;
    event.preventDefault();
    fire("manual");
  };

  /* ------------------------------- render ------------------------------- */

  const step = cascade(Math.max(1, rows.length));
  const liftTime = motionSafe ? Math.min(0.3, rows.length * step) : 0;
  const checking = stage === "checking";
  const failedOnce = attempt > 0;
  const savedAge = ago(now - savedAt);

  const retryButton = (
    <button
      type="button"
      onClick={() => fire("manual")}
      aria-label={checking ? `Checking ${source}` : "Retry now"}
      aria-keyshortcuts="R"
      aria-disabled={disabled || checking || undefined}
      aria-busy={checking || undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-2 border border-hairline-strong bg-card px-3 text-xs font-medium text-foreground transition-colors",
        disabled || checking ? "cursor-default" : "hover:bg-surface-2",
        FOCUS_RING,
      )}
    >
      <RotateCw aria-hidden className="size-3.5 shrink-0" />
      {checking ? (
        "Checking…"
      ) : (
        <>
          Retry
          <span className="hidden @min-[26rem]/offline-shelf:inline"> now</span>
        </>
      )}
      <kbd className="hidden h-4 min-w-4 items-center justify-center rounded-1 border border-hairline px-1 font-mono text-[9px] leading-none text-ink-3 @min-[26rem]/offline-shelf:inline-flex">
        R
      </kbd>
    </button>
  );

  const waitLine = (
    <p className="text-[12px] leading-snug text-ink-2">
      {checking ? (
        <>Checking {source}…</>
      ) : (
        <>
          {failedOnce ? "Still no answer. " : ""}Next try in{" "}
          <motion.span className="font-mono text-foreground tabular-nums">
            {seconds}
          </motion.span>{" "}
          s
        </>
      )}
    </p>
  );

  return (
    <section
      ref={setRoot}
      aria-labelledby={titleId}
      onKeyDown={onRootKey}
      className={cn(
        "@container/offline-shelf flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          maxHeight,
          "--os-ink": tones.ink,
          "--os-stamp": tone === "quiet" ? "var(--ink-3)" : tones.ink,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {online
              ? `${source} · up to date`
              : `${source} · ${plural(cachedItems.length, "item")} saved on this device`}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2.5 text-[11px] transition-colors",
            online ? "text-success" : "text-ink-2",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full transition-colors",
              online ? "bg-success" : "bg-(--os-ink)",
            )}
          />
          {online
            ? "Online"
            : attempt > 0
              ? `Offline · ${plural(attempt, "try", "tries")}`
              : "Offline"}
        </span>
      </header>

      <AnimatePresence initial={false}>
        {online ? (
          <motion.p
            key="synced"
            className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-hairline px-4 text-[12px] text-ink-2"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 36, opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={{
              height: motionSafe
                ? { ...springs.glide, delay: liftTime }
                : { duration: 0 },
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                delay: liftTime,
              },
            }}
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-success"
            />
            <span className="truncate">
              Back online · synced {ago(0)}
              {arrivals > 0 ? ` · ${arrivals} new` : ""}
              {updates > 0 ? `, ${updates} updated` : ""}
            </span>
          </motion.p>
        ) : (
          <motion.div
            key="banner"
            className="relative shrink-0 overflow-hidden border-b border-hairline"
            style={{ backgroundColor: tones.wash }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={{
              height: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
          >
            <span
              aria-hidden
              className="absolute inset-y-0 left-0 w-[3px] bg-(--os-ink)"
            />
            <div className="flex flex-col gap-3 px-4 py-3.5 @min-[34rem]/offline-shelf:flex-row @min-[34rem]/offline-shelf:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <CloudOff
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0", tones.icon)}
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    We can&apos;t reach {source}.
                  </p>
                  <p className="text-[12px] leading-snug text-ink-2">
                    {err.message}
                    {cachedItems.length > 0
                      ? ` Showing what this device saved ${savedAge}.`
                      : ""}
                    {err.code ? " " : null}
                    {err.code ? (
                      <span className="inline-flex h-4 items-center rounded-1 bg-surface-2 px-1 align-[1px] font-mono text-[10px] text-ink-3">
                        {err.code}
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 @min-[26rem]/offline-shelf:pl-7 @min-[34rem]/offline-shelf:pl-0">
                {retryStyle === "ring" ? (
                  <WaitRing
                    fill={fill}
                    seconds={seconds}
                    checking={checking}
                    spin={spin}
                    motionSafe={motionSafe}
                  />
                ) : retryStyle === "ticks" ? (
                  <span
                    aria-hidden
                    className={cn(
                      "flex shrink-0 items-center gap-[3px] transition-opacity",
                      checking && "opacity-40",
                    )}
                  >
                    {Array.from({ length: 10 }, (_, i) => (
                      <Tick key={i} fill={fill} index={i} />
                    ))}
                  </span>
                ) : null}
                <div className="min-w-0 flex-1 @min-[34rem]/offline-shelf:w-40 @min-[34rem]/offline-shelf:flex-none">
                  {waitLine}
                </div>
                {retryButton}
              </div>
            </div>
            {retryStyle === "bar" ? (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[2px] bg-hairline"
              >
                <motion.span
                  className={cn(
                    "absolute inset-0 bg-(--os-ink)",
                    checking && "opacity-40",
                  )}
                  style={{ scaleX: barScale, originX: "0%" }}
                />
              </span>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <p id={hintId} className="sr-only">
        Up and Down move between rows, Enter opens one. R retries now.
      </p>

      {rows.length === 0 ? (
        <p className="px-4 py-5 text-[13px] text-ink-2">
          {online
            ? `No ${title.toLowerCase()} yet.`
            : `Nothing from ${title} was saved on this device. We'll keep trying.`}
        </p>
      ) : (
        <div className="relative flex flex-1 flex-col overflow-hidden">
          <ul
            ref={setList}
            onScroll={measureList}
            aria-label={online ? title : `${title} saved on this device`}
            className="flex-1 overflow-y-auto overscroll-contain py-1"
          >
            <AnimatePresence initial={false}>
              {rows.map((row, i) => {
                const { item } = row;
                const Icon = KIND[item.kind ?? "inspection"] ?? ClipboardCheck;
                const enterDelay = liftTime + i * step;
                const label = `${item.title}${item.place ? `, ${item.place}` : ""}, ${
                  row.cached
                    ? `cached ${savedAge}`
                    : row.fresh
                      ? `new, edited ${ago(now - item.updatedAt)}`
                      : `edited ${ago(now - item.updatedAt)}`
                }`;
                return (
                  <motion.li
                    key={item.id}
                    className="relative overflow-hidden"
                    initial={
                      motionSafe
                        ? { height: 0, opacity: 0, y: -distances.step }
                        : { height: "auto", opacity: 0, y: 0 }
                    }
                    animate={{ height: "auto", opacity: 1, y: 0 }}
                    exit={{ height: 0, opacity: 0, transition: exitFor() }}
                    transition={{
                      height: motionSafe
                        ? { ...springs.glide, delay: enterDelay }
                        : { duration: 0 },
                      y: motionSafe
                        ? { ...springs.glide, delay: enterDelay }
                        : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: enterDelay,
                      },
                    }}
                  >
                    {row.updated && flips > 0 ? (
                      <motion.span
                        key={`wash-${flips}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,oklch(from_var(--success)_0.72_0.14_h)_16%,transparent)]"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0 }}
                        transition={{
                          duration: 1.2,
                          ease: easings.enter,
                          delay: liftTime,
                        }}
                      />
                    ) : null}
                    <button
                      ref={(node) => {
                        if (node) rowButtons.current.set(item.id, node);
                        else rowButtons.current.delete(item.id);
                      }}
                      type="button"
                      tabIndex={current === item.id ? 0 : -1}
                      aria-label={label}
                      aria-describedby={hintId}
                      aria-disabled={disabled || undefined}
                      onFocus={() => setActiveId(item.id)}
                      onKeyDown={(event) => onRowKey(event, i)}
                      onClick={() => open(row)}
                      className={cn(
                        "group/offline-shelf-row relative flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        !disabled && "hover:bg-surface-2",
                        FOCUS_IN,
                      )}
                    >
                      <span
                        aria-hidden
                        className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2 @min-[22rem]/offline-shelf:flex"
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span
                          title={item.title}
                          className={cn(
                            "truncate text-[13px] font-medium transition-colors duration-300",
                            row.cached && stampStyle === "dim"
                              ? "text-ink-2"
                              : "text-foreground",
                          )}
                        >
                          {item.title}
                        </span>
                        <span className="truncate text-[11px] text-ink-3">
                          {item.place ? `${item.place} · ` : ""}edited{" "}
                          {ago(now - item.updatedAt)}
                        </span>
                      </span>
                      {row.fresh ? (
                        <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--accent-bright)_12%,transparent)] px-2 text-[10px] font-medium text-cobalt-bright">
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full bg-cobalt-bright"
                          />
                          New
                        </span>
                      ) : null}
                      <AnimatePresence initial={false}>
                        {row.cached ? (
                          <CachedMark
                            key="mark"
                            style={stampStyle}
                            age={short(now - savedAt)}
                            index={i}
                            step={step}
                            motionSafe={motionSafe}
                          />
                        ) : null}
                      </AnimatePresence>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-card to-transparent"
            style={{ opacity: listFade }}
          />
        </div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
