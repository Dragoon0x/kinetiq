"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  FileDown,
  Images,
  RotateCcw,
  Send,
  TriangleAlert,
  X,
  Zap,
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

export type ErrandIcon =
  "export" | "photos" | "invoices" | "archive" | "generic";

/** One kind of background job the toolbar can start. */
export type Errand = {
  id: string;
  /** The toolbar button and the toast's name, e.g. "Export report". */
  label: string;
  /** Which glyph the button and a running toast carry. @default "generic" */
  icon?: ErrandIcon;
  /** The toast's line while it runs, e.g. "Exporting 1,284 rows". */
  running: string;
  /** The toast's line once it is done, e.g. "Report exported". */
  done: string;
  /** How long the default simulator takes, in ms. @default 3200 */
  duration?: number;
  /** The default simulator fails the first attempt with this message; a retry succeeds. */
  flaky?: string;
};

export type ErrandToastState = "running" | "done" | "failed";

/** One toast in the rail. The array is in start order: the last one is the newest. */
export type ErrandToast = {
  id: string;
  /** The errand it runs. */
  errandId: string;
  state: ErrandToastState;
  /** 0 to 1. */
  progress: number;
  /** How many times it has been started. @default 1 */
  attempt?: number;
  /** Why it failed, shown on the toast. */
  error?: string;
  /** The host sets `progress` and `state` itself; the surface does not run it. @default false */
  driven?: boolean;
  /** When it was started, in ms; the recent list prints how long it took. */
  startedAt?: number;
};

/** What a runner is handed: where to resume from, which attempt, a way to report and a way to stop. */
export type ErrandRun = {
  /** The progress to resume from, 0 to 1. */
  from: number;
  /** 1 on the first run, 2 on the first retry. */
  attempt: number;
  /** Aborts when the toast is dismissed or the surface unmounts. */
  signal: AbortSignal;
  /** Reports progress, 0 to 1. */
  report: (progress: number) => void;
};

/** Resolves when the errand is done; rejects with the failure to show. */
export type ErrandRunner = (errand: Errand, run: ErrandRun) => Promise<void>;

export type ErrandToastChange = {
  kind: "start" | "progress" | "done" | "fail" | "retry" | "dismiss";
  id: string;
};

export type ErrandCorner = "bottom-right" | "bottom-left" | "top-right";
export type ErrandStackStyle = "stack" | "list";
export type ErrandStatus = "ready" | "loading" | "error";

export type ErrandToastsProps = {
  /** Which corner of the stage the rail sits in. @default "bottom-right" */
  corner?: ErrandCorner;
  /** Older toasts compress behind the newest until the rail is hovered or focused, or every toast stands in a column. @default "stack" */
  stackStyle?: ErrandStackStyle;
  /** How long a finished toast holds before it leaves, in seconds; the bar drains to show it. @default 4 */
  holdSeconds?: number;
  /** The errands the toolbar can start. @default defaultErrands */
  errands?: Errand[];
  /** Controlled toasts, in start order. */
  toasts?: ErrandToast[];
  /** Initial toasts when uncontrolled. @default defaultErrandToasts */
  defaultToasts?: ErrandToast[];
  /** Fires with the whole rail after every change: a start, each progress tick, a finish, a failure, a retry or a dismissal. */
  onChange?: (toasts: ErrandToast[], change: ErrandToastChange) => void;
  /** Runs one errand; the toast follows its reports and its promise. @default simulateErrand */
  run?: ErrandRunner;
  /** An errand was started from the toolbar; its toast is already in the rail. */
  onStart?: (errand: Errand, toast: ErrandToast) => void;
  /** A toast finished or failed. */
  onSettle?: (toast: ErrandToast, errand: Errand | undefined) => void;
  /** Most toasts the rail shows before the rest fold into a pill. @default 3 */
  maxVisible?: number;
  /** The key that, with Alt, moves focus to the rail; null for none. @default "t" */
  shortcut?: string | null;
  /** Whether the errand list has arrived. @default "ready" */
  status?: ErrandStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Errands" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the rail lives inside it. @default 300 */
  height?: number;
  /** Read only: nothing can be started, retried or dismissed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Basinworks' four background errands. Sending invoices fails once, then succeeds. */
export const defaultErrands: Errand[] = [
  {
    id: "export",
    label: "Export report",
    icon: "export",
    running: "Exporting 1,284 rows",
    done: "Report exported",
    duration: 3600,
  },
  {
    id: "photos",
    label: "Sync photos",
    icon: "photos",
    running: "Uploading 36 site photos",
    done: "Photos synced",
    duration: 4800,
  },
  {
    id: "invoices",
    label: "Send invoices",
    icon: "invoices",
    running: "Sending 12 invoices",
    done: "Invoices sent",
    duration: 3000,
    flaky: "Mail relay timed out",
  },
  {
    id: "archive",
    label: "Archive",
    icon: "archive",
    running: "Archiving 8 closed jobs",
    done: "8 jobs archived",
    duration: 2400,
  },
];

/** A photo sync more than half done, over an invoice run that has already failed. */
export const defaultErrandToasts: ErrandToast[] = [
  {
    id: "invoices-1",
    errandId: "invoices",
    state: "failed",
    progress: 0.46,
    attempt: 1,
    error: "Mail relay timed out",
  },
  {
    id: "photos-1",
    errandId: "photos",
    state: "running",
    progress: 0.58,
    attempt: 1,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

/** A toast's height before it has been measured. */
const GUESS_H = 56;
/** Gap between toasts in a column. */
const GAP = 8;
/** How far each compressed toast peeks out behind the one in front. */
const PEEK = 8;
/** How many compressed edges show behind the newest toast. */
const PEEKS = 2;
const MIN_HOLD_MS = 300;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

/** The wall clock, read only from handlers, timers and promises — never render. */
const clock = () => Date.now();

const noopSubscribe = () => () => {};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashOf = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * The default runner: a seeded walk to 1 in uneven ticks, with the odd stall
 * the way a real upload hangs on one file. A `flaky` errand fails its first
 * attempt partway with its message; every later attempt succeeds. Stops
 * ticking the moment it is aborted.
 */
export const simulateErrand: ErrandRunner = (errand, run) =>
  new Promise<void>((resolve, reject) => {
    const total = Math.max(MIN_HOLD_MS, errand.duration ?? 3200);
    const rand = mulberry32(hashOf(errand.id) + run.attempt * 7919);
    const failAt =
      errand.flaky && run.attempt === 1 ? 0.3 + rand() * 0.35 : Infinity;
    let p = clamp(run.from, 0, 1);
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      reject(new Error("aborted"));
    };
    if (run.signal.aborted) {
      stop();
      return;
    }
    run.signal.addEventListener("abort", stop, { once: true });
    const tick = () => {
      timer = null;
      if (run.signal.aborted) return;
      const wait = 70 + rand() * 90;
      p = Math.min(1, p + (wait / total) * (0.5 + rand()));
      if (p >= failAt) {
        run.signal.removeEventListener("abort", stop);
        reject(new Error(errand.flaky));
        return;
      }
      run.report(p);
      if (p >= 1) {
        run.signal.removeEventListener("abort", stop);
        resolve();
        return;
      }
      timer = setTimeout(tick, rand() < 0.08 ? 420 : wait);
    };
    timer = setTimeout(tick, 120);
  });

/** How many toasts are running, failed and done, for hosts that show a total elsewhere. */
export const countErrandToasts = (toasts: ErrandToast[]) => {
  let running = 0;
  let failed = 0;
  let done = 0;
  for (const t of toasts) {
    if (t.state === "running") running += 1;
    else if (t.state === "failed") failed += 1;
    else done += 1;
  }
  return { running, failed, done };
};

const ICONS: Record<ErrandIcon, React.ComponentType<{ className?: string }>> = {
  export: FileDown,
  photos: Images,
  invoices: Send,
  archive: Archive,
  generic: Zap,
};

const CORNER: Record<ErrandCorner, { rail: string; recent: string }> = {
  "bottom-right": { rail: "right-3 bottom-3", recent: "top-3 left-3" },
  "bottom-left": { rail: "bottom-3 left-3", recent: "top-3 right-3" },
  "top-right": { rail: "top-3 right-3", recent: "bottom-3 left-3" },
};

const STATE_WORD: Record<ErrandToastState, string> = {
  running: "running",
  done: "done",
  failed: "failed",
};

/** A finished toast's wait before it leaves: a deadline while the clock runs, a remainder while paused. */
type Hold = { until: number; at: number } | { left: number };

type Recent = {
  id: string;
  label: string;
  outcome: "done" | "failed";
  tookMs: number | null;
};

type Slot = { offset: number; scale: number; visible: boolean };

const took = (ms: number | null) =>
  ms === null
    ? null
    : ms < 950
      ? `${Math.round(ms)} ms`
      : `${r3(ms / 1000).toFixed(1)} s`;

/* ----------------------------------------------------------------------- */
/*                                   Toast                                  */
/* ----------------------------------------------------------------------- */

type ToastCardProps = {
  toast: ErrandToast;
  errand: Errand | undefined;
  index: number;
  count: number;
  slot: Slot;
  edge: "top" | "bottom";
  hold: Hold | undefined;
  holdMs: number;
  motionSafe: boolean;
  /** Drops in on mount: a toast started after the page was up. */
  enter: boolean;
  tabIndex: number;
  disabled: boolean;
  hintId: string;
  /** Hands the parent the node for focus, and null when it leaves. Stable. */
  register: (id: string, node: HTMLLIElement | null) => void;
  /** Reports the card's height whenever it changes. Stable. */
  onMeasure: (id: string, height: number) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onPress: () => void;
  onDismiss: () => void;
  onRetry: () => void;
};

function ToastCard({
  toast,
  errand,
  index,
  count,
  slot,
  edge,
  hold,
  holdMs,
  motionSafe,
  enter,
  tabIndex,
  disabled,
  hintId,
  register,
  onMeasure,
  onFocus,
  onKeyDown,
  onPress,
  onDismiss,
  onRetry,
}: ToastCardProps) {
  const [fresh, setFresh] = React.useState(enter);
  const ref = React.useRef<HTMLLIElement | null>(null);
  const id = toast.id;

  // One observer per card: a failed toast grows its Retry row, and the rail
  // places every card from its measured height.
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    register(id, node);
    if (typeof ResizeObserver === "undefined") {
      onMeasure(id, Math.ceil(node.offsetHeight));
      return () => register(id, null);
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const h = Math.ceil(entry.contentRect.height);
      if (h > 0) onMeasure(id, h);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      register(id, null);
    };
  }, [id, register, onMeasure]);

  const dir = edge === "bottom" ? -1 : 1;
  const y = dir * slot.offset;
  const failed = toast.state === "failed";
  const done = toast.state === "done";
  const running = toast.state === "running";
  const pct = Math.round(clamp(toast.progress, 0, 1) * 100);
  const Icon = ICONS[errand?.icon ?? "generic"] ?? Zap;
  const name = errand?.label ?? toast.errandId;
  const line = failed
    ? (toast.error ?? "Something went wrong")
    : done
      ? (errand?.done ?? "Done")
      : (errand?.running ?? "Running");

  // The bar fills with progress, then drains over the hold, and sits still
  // while the hold is paused. A failure leaves it where it stopped.
  let fill = clamp(toast.progress, 0, 1);
  let fillTransition: React.ComponentProps<typeof motion.div>["transition"] =
    motionSafe ? springs.glide : { duration: durations.fast };
  if (done) {
    if (hold && "until" in hold) {
      fill = 0;
      fillTransition = {
        duration: Math.max(0, hold.until - hold.at) / 1000,
        ease: "linear",
      };
    } else if (hold) {
      fill = clamp(hold.left / Math.max(1, holdMs), 0, 1);
      fillTransition = { duration: 0 };
    } else {
      fill = 1;
    }
  }

  const description = failed
    ? `${name}, failed, ${line}. Enter retries.`
    : done
      ? `${name}, done. ${line}.`
      : `${name}, running, ${pct} percent. ${line}.`;

  return (
    <motion.li
      ref={ref}
      data-id={toast.id}
      tabIndex={slot.visible ? tabIndex : -1}
      aria-label={description}
      aria-describedby={hintId}
      aria-roledescription="toast"
      aria-hidden={!slot.visible || undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // Buttons inside the toast handle themselves; the card fans the stack.
        if ((event.target as HTMLElement).closest("button")) return;
        onPress();
      }}
      initial={
        enter
          ? {
              opacity: 0,
              y: motionSafe ? y - distances.shift : y,
              scale: 1,
            }
          : false
      }
      animate={{
        opacity: slot.visible ? 1 : 0,
        y,
        scale: slot.scale,
      }}
      exit={{
        opacity: 0,
        y: motionSafe ? y - dir * distances.step : y,
        transition: exitFor(durations.base),
      }}
      onAnimationComplete={() => {
        if (fresh) setFresh(false);
      }}
      transition={
        motionSafe
          ? {
              y: fresh ? springs.recoil : springs.glide,
              scale: fresh ? springs.recoil : springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : {
              y: { duration: 0 },
              scale: { duration: 0 },
              opacity: { duration: durations.fast },
            }
      }
      style={{
        [edge]: 0,
        zIndex: count - index,
        transformOrigin: edge === "bottom" ? "bottom center" : "top center",
        pointerEvents: slot.visible ? undefined : "none",
      }}
      className={cn(
        "absolute inset-x-0 list-none rounded-3",
        disabled ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-3 border bg-popover shadow-[0_10px_28px_-14px_color-mix(in_oklab,black_45%,transparent)] transition-colors duration-300",
          failed
            ? "border-[color-mix(in_oklab,var(--danger)_45%,var(--hairline-strong))] bg-[color-mix(in_oklab,var(--danger)_9%,var(--bg-1))]"
            : "border-hairline-strong",
        )}
      >
        <div className="flex items-start gap-2.5 pt-2.5 pr-2 pb-3 pl-3">
          <span
            className={cn(
              "mt-px flex size-4 shrink-0 items-center justify-center rounded-full",
              done &&
                "bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success",
              failed && "text-danger",
              running && "text-cobalt-bright",
            )}
          >
            {done ? (
              <svg aria-hidden viewBox="0 0 16 16" className="size-3">
                <motion.path
                  d="M3.5 8.5 6.6 11.5 12.5 4.8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
            ) : failed ? (
              <TriangleAlert aria-hidden className="size-3.5" />
            ) : (
              <Icon aria-hidden className="size-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[12px] font-medium">{name}</span>
              <span
                className={cn(
                  "shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase tabular-nums",
                  failed ? "text-danger" : done ? "text-success" : "text-ink-3",
                )}
              >
                {running ? `${pct}%` : STATE_WORD[toast.state]}
              </span>
            </div>
            <p
              className={cn(
                "mt-0.5 truncate text-[11px]",
                failed ? "text-ink-2" : "text-ink-3",
              )}
            >
              {line}
            </p>
            {failed ? (
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-disabled={disabled || undefined}
                  onClick={onRetry}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-2 border border-hairline-strong bg-card px-2 text-[11px] text-foreground transition-colors hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3" />
                  Retry
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-disabled={disabled || undefined}
                  onClick={onDismiss}
                  className={cn(
                    "inline-flex h-6 items-center rounded-2 px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
          {failed ? null : (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`Dismiss ${name}`}
              aria-disabled={disabled || undefined}
              onClick={onDismiss}
              className={cn(
                "-mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 bg-hairline"
        >
          <motion.div
            className={cn(
              "h-full w-full origin-left",
              failed ? "bg-danger" : done ? "bg-success" : "bg-cobalt-bright",
            )}
            initial={false}
            animate={{ scaleX: fill }}
            transition={fillTransition}
          />
        </div>
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A stage for background errands. A toolbar starts them — export a report,
 * sync photos, send invoices, archive — and each one drops a toast into the
 * rail in the corner on `springs.recoil`: a glyph, the errand's running line
 * and a bar that fills on `springs.glide` as the errand reports. Newer toasts
 * land in front; the older ones compress behind them, scaled and offset on
 * glide. A finished toast ticks on `springs.flick`, holds while its bar
 * drains, then leaves on the exit ease as the rest re-stack on glide. A
 * failed one turns red, offers Retry and stays until it is dismissed.
 *
 * Hovering or focusing the rail fans the stack into a column and pauses
 * every hold, so nothing leaves while it is being read; more than
 * `maxVisible` toasts fold the rest into a pill that opens on press. A toast
 * the host adds while running is adopted and run by the surface unless it is
 * marked `driven`, in which case its progress is the host's to set.
 *
 * Alt+T moves focus to the rail (Escape returns it). The toasts are one
 * list: Up/Down move through them, Enter retries a failed one, Delete
 * dismisses, and the toolbar is its own roving group. Under reduced motion
 * nothing drops, scales or slides — toasts appear, fade and re-place at once,
 * and every change is still announced.
 */
export function ErrandToasts({
  corner = "bottom-right",
  stackStyle = "stack",
  holdSeconds = 4,
  errands = defaultErrands,
  toasts,
  defaultToasts = defaultErrandToasts,
  onChange,
  run = simulateErrand,
  onStart,
  onSettle,
  maxVisible = 3,
  shortcut = "t",
  status = "ready",
  onRetry,
  title = "Errands",
  label,
  height = 300,
  disabled = false,
  className,
}: ErrandToastsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const railId = `${uid}-rail`;

  const [own, setOwn] = React.useState<ErrandToast[]>(defaultToasts);
  const controlled = toasts !== undefined;
  const current = toasts ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const holdMs = Math.max(MIN_HOLD_MS, holdSeconds * 1000);

  const [holds, setHolds] = React.useState<Record<string, Hold>>({});
  const [recent, setRecent] = React.useState<Recent[]>([]);
  const [heights, setHeights] = React.useState<Record<string, number>>({});
  const [pinned, setPinned] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [activeTool, setActiveTool] = React.useState<string | null>(null);
  const [activeToast, setActiveToast] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState<{
    target: string;
    seq: number;
  } | null>(null);
  // False for the server render and hydration, so toasts already in the rail
  // never drop in; true for toasts that arrive later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  // The toasts the surface mounted with never drop in or bounce on their
  // first re-stack; only toasts that arrive later do.
  const [initialIds] = React.useState(() => new Set(current.map((t) => t.id)));

  const latest = React.useRef(current);
  const holdsRef = React.useRef<Record<string, Hold>>({});
  const pausedRef = React.useRef(false);
  const hoveredRef = React.useRef(false);
  const focusedRef = React.useRef(false);
  const runs = React.useRef(new Map<string, AbortController>());
  const timers = React.useRef(new Map<string, number>());
  const toastNodes = React.useRef(new Map<string, HTMLLIElement>());
  const toolNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const pillRef = React.useRef<HTMLButtonElement | null>(null);
  const quietRef = React.useRef<HTMLDivElement | null>(null);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const seq = React.useRef(0);

  /* -------------------------------- data ------------------------------- */

  const byErrand = new Map(errands.map((e) => [e.id, e]));
  const byId = new Map(current.map((t) => [t.id, t]));
  const order = [...current].reverse();
  const counts = countErrandToasts(current);
  const edge: "top" | "bottom" = corner.startsWith("top") ? "top" : "bottom";
  const expanded = stackStyle === "list" || pinned || paused;
  const shownCount = pinned ? order.length : Math.min(order.length, maxVisible);
  const hiddenCount = order.length - shownCount;

  // Every toast's place from the corner: a column of measured heights when
  // the rail is fanned, a few peeking edges when it is stacked.
  const slots: Slot[] = [];
  let column = 0;
  for (let i = 0; i < order.length; i += 1) {
    const t = order[i];
    const h = (t && heights[t.id]) ?? GUESS_H;
    const inShown = i < shownCount;
    if (expanded) {
      slots.push({ offset: column, scale: 1, visible: inShown });
      if (inShown) column += h + GAP;
    } else {
      const k = Math.min(i, PEEKS);
      slots.push({
        offset: k * PEEK,
        scale: 1 - k * 0.05,
        visible: inShown && i <= PEEKS,
      });
    }
  }
  const topId = order[0]?.id;
  const railHeight = expanded
    ? Math.max(0, column - GAP)
    : (topId !== undefined ? (heights[topId] ?? GUESS_H) : 0) +
      Math.min(Math.max(order.length - 1, 0), PEEKS) * PEEK;

  const toastNav = order.filter((_, i) => slots[i]?.visible).map((t) => t.id);
  const navKeys = hiddenCount > 0 || pinned ? [...toastNav, "pill"] : toastNav;
  const activeKey =
    activeToast && navKeys.includes(activeToast)
      ? activeToast
      : (navKeys[0] ?? null);
  const activeErrand =
    activeTool && byErrand.has(activeTool)
      ? activeTool
      : (errands[0]?.id ?? null);

  /* ------------------------------- commits ----------------------------- */

  const commit = (
    fn: (toasts: ErrandToast[]) => ErrandToast[],
    change: ErrandToastChange,
  ) => {
    const next = fn(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    if (!controlled) setOwn(next);
    onChange?.(next, change);
  };

  // What an errand's promise needs when it lands, read live so a runner
  // started on one render never calls a stale onChange or onSettle.
  const self = React.useRef({ commit, onSettle, byErrand, holdMs });
  React.useEffect(() => {
    latest.current = current;
    self.current = { commit, onSettle, byErrand, holdMs };
  });

  const clearTimer = (id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) window.clearTimeout(t);
    timers.current.delete(id);
  };

  const writeHolds = (next: Record<string, Hold>) => {
    holdsRef.current = next;
    setHolds(next);
  };

  const dismiss = (id: string, reason: "timer" | "press") => {
    runs.current.get(id)?.abort();
    runs.current.delete(id);
    clearTimer(id);
    if (holdsRef.current[id]) {
      const rest = { ...holdsRef.current };
      delete rest[id];
      writeHolds(rest);
    }
    const toast = latest.current.find((t) => t.id === id);
    self.current.commit((ts) => ts.filter((t) => t.id !== id), {
      kind: "dismiss",
      id,
    });
    if (!toast) return;
    const name =
      self.current.byErrand.get(toast.errandId)?.label ?? toast.errandId;
    if (reason === "press") {
      setAnnouncement(`${name} dismissed.`);
    }
  };

  const arm = (id: string, ms: number) => {
    clearTimer(id);
    timers.current.set(
      id,
      window.setTimeout(
        () => {
          timers.current.delete(id);
          dismiss(id, "timer");
        },
        Math.max(0, ms),
      ),
    );
  };

  const startHold = (id: string) => {
    const ms = self.current.holdMs;
    if (pausedRef.current) {
      writeHolds({ ...holdsRef.current, [id]: { left: ms } });
    } else {
      const now = clock();
      writeHolds({ ...holdsRef.current, [id]: { until: now + ms, at: now } });
      arm(id, ms);
    }
  };

  const syncPause = () => {
    const next = hoveredRef.current || focusedRef.current;
    if (pausedRef.current === next) return;
    pausedRef.current = next;
    setPaused(next);
    const now = clock();
    const out: Record<string, Hold> = {};
    for (const [id, hold] of Object.entries(holdsRef.current)) {
      if (next) {
        clearTimer(id);
        out[id] =
          "until" in hold ? { left: Math.max(0, hold.until - now) } : hold;
      } else if ("left" in hold) {
        out[id] = { until: now + hold.left, at: now };
        arm(id, hold.left);
      } else {
        out[id] = hold;
      }
    }
    writeHolds(out);
  };

  const startRun = (toast: ErrandToast) => {
    const errand = self.current.byErrand.get(toast.errandId);
    const id = toast.id;
    const ctl = new AbortController();
    runs.current.set(id, ctl);
    const attempt = toast.attempt ?? 1;
    const startedAt = toast.startedAt ?? clock();
    const name = errand?.label ?? toast.errandId;
    const fallback: Errand = errand ?? {
      id: toast.errandId,
      label: toast.errandId,
      running: "Running",
      done: "Done",
    };
    run(fallback, {
      from: clamp(toast.progress, 0, 1),
      attempt,
      signal: ctl.signal,
      report: (progress) => {
        if (ctl.signal.aborted) return;
        const p = clamp(progress, 0, 1);
        self.current.commit(
          (ts) =>
            ts.map((t) =>
              t.id === id && t.state === "running" ? { ...t, progress: p } : t,
            ),
          { kind: "progress", id },
        );
      },
    })
      .then(() => {
        if (ctl.signal.aborted) return;
        runs.current.delete(id);
        let settled: ErrandToast | undefined;
        self.current.commit(
          (ts) =>
            ts.map((t) => {
              if (t.id !== id) return t;
              settled = { ...t, state: "done", progress: 1, error: undefined };
              return settled;
            }),
          { kind: "done", id },
        );
        if (!settled) return;
        setAnnouncement(`${name} done. ${fallback.done}.`);
        setRecent((r) =>
          [
            {
              id: `${id}-${attempt}`,
              label: fallback.done,
              outcome: "done" as const,
              tookMs: clock() - startedAt,
            },
            ...r,
          ].slice(0, 4),
        );
        self.current.onSettle?.(settled, errand);
        startHold(id);
      })
      .catch((err: unknown) => {
        if (ctl.signal.aborted) return;
        runs.current.delete(id);
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong";
        let settled: ErrandToast | undefined;
        self.current.commit(
          (ts) =>
            ts.map((t) => {
              if (t.id !== id) return t;
              settled = { ...t, state: "failed", error: message };
              return settled;
            }),
          { kind: "fail", id },
        );
        if (!settled) return;
        setAnnouncement(`${name} failed: ${message}. Retry is available.`);
        setRecent((r) =>
          [
            {
              id: `${id}-${attempt}`,
              label: `${name} failed`,
              outcome: "failed" as const,
              tookMs: null,
            },
            ...r,
          ].slice(0, 4),
        );
        self.current.onSettle?.(settled, errand);
      });
  };

  const start = (errand: Errand) => {
    if (inert) return;
    seq.current += 1;
    const toast: ErrandToast = {
      id: `${errand.id}-${uid}-${seq.current}`,
      errandId: errand.id,
      state: "running",
      progress: 0,
      attempt: 1,
      startedAt: clock(),
    };
    commit((ts) => [...ts, toast], { kind: "start", id: toast.id });
    setAnnouncement(`${errand.label} started.`);
    onStart?.(errand, toast);
  };

  const retry = (id: string) => {
    if (inert) return;
    const toast = latest.current.find((t) => t.id === id);
    if (!toast || toast.state !== "failed") return;
    const name = byErrand.get(toast.errandId)?.label ?? toast.errandId;
    commit(
      (ts) =>
        ts.map((t) =>
          t.id === id
            ? {
                ...t,
                state: "running" as const,
                progress: 0,
                error: undefined,
                attempt: (t.attempt ?? 1) + 1,
                startedAt: clock(),
              }
            : t,
        ),
      { kind: "retry", id },
    );
    setAnnouncement(`${name} retrying.`);
  };

  /* ------------------------------ reconcile ---------------------------- */

  // Runs every running toast that nobody is running (one the toolbar
  // started, or one the host added), starts the hold on any toast that is
  // done without one (a host-driven finish), and drops runs and holds for
  // toasts that have gone.
  React.useEffect(() => {
    for (const [id, ctl] of runs.current) {
      const t = byId.get(id);
      if (!t || t.state !== "running") {
        ctl.abort();
        runs.current.delete(id);
      }
    }
    let next: Record<string, Hold> | null = null;
    for (const id of Object.keys(holdsRef.current)) {
      const t = byId.get(id);
      if (!t || t.state !== "done") {
        clearTimer(id);
        next = next ?? { ...holdsRef.current };
        delete next[id];
      }
    }
    if (next) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      writeHolds(next);
    }
    for (const t of current) {
      if (t.state === "running" && !t.driven && !runs.current.has(t.id)) {
        startRun(t);
      } else if (t.state === "done" && !holdsRef.current[t.id]) {
        startHold(t.id);
      }
    }
    // Reconciles against the rail only; the runner and the helpers it needs
    // are read through `self` so a new runner never restarts an errand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // Everything in flight stops with the surface.
  React.useEffect(
    () => () => {
      for (const ctl of runs.current.values()) ctl.abort();
      runs.current.clear();
      for (const t of timers.current.values()) window.clearTimeout(t);
      timers.current.clear();
      holdsRef.current = {};
    },
    [],
  );

  /* ----------------------------- measuring ----------------------------- */

  // Both are stable, so a card observes itself once and never re-subscribes
  // on a progress tick.
  const register = React.useCallback(
    (id: string, node: HTMLLIElement | null) => {
      if (node) toastNodes.current.set(id, node);
      else toastNodes.current.delete(id);
    },
    [],
  );
  const measure = React.useCallback((id: string, h: number) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  /* ------------------------------- focus ------------------------------- */

  const nodeOf = (key: string) =>
    key === "pill" ? pillRef.current : (toastNodes.current.get(key) ?? null);

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      focusReq.target === "tool"
        ? (toolNodes.current.get(activeErrand ?? "") ?? null)
        : focusReq.target === "quiet"
          ? quietRef.current
          : nodeOf(focusReq.target);
    node?.focus({ preventScroll: true });
    // Runs once per request; the targets are read live from their refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq]);

  const requestFocus = (target: string) =>
    setFocusReq((f) => ({ target, seq: (f?.seq ?? 0) + 1 }));

  const goToRail = () => {
    const active =
      typeof document !== "undefined" ? document.activeElement : null;
    returnTo.current = active instanceof HTMLElement ? active : null;
    if (activeKey) requestFocus(activeKey);
    else requestFocus("quiet");
    setAnnouncement(
      order.length === 0
        ? "Errand rail. Nothing running."
        : `Errand rail. ${order.length} ${order.length === 1 ? "toast" : "toasts"}.`,
    );
  };

  const leaveRail = () => {
    const back = returnTo.current;
    returnTo.current = null;
    if (back && back.isConnected && typeof back.focus === "function") {
      back.focus({ preventScroll: true });
      return;
    }
    requestFocus("tool");
  };

  React.useEffect(() => {
    if (!shortcut || !ready) return;
    const key = shortcut.toLowerCase();
    const code = `Key${shortcut.toUpperCase()}`;
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      // Alt+letter types a symbol on some keyboards, so the code is checked too.
      if (event.key.toLowerCase() !== key && event.code !== code) return;
      event.preventDefault();
      goToRail();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // goToRail reads the rail's current order; rebinding per render is cheap
    // and keeps the announcement honest.
  });

  const onToastKey = (event: React.KeyboardEvent, key: string) => {
    const i = navKeys.indexOf(key);
    // Up and Down follow the column on screen: in a bottom corner the older
    // toasts sit above the newest, in a top corner below it.
    const older = edge === "bottom" ? "ArrowUp" : "ArrowDown";
    const newer = edge === "bottom" ? "ArrowDown" : "ArrowUp";
    let to = -1;
    if (event.key === older || event.key === "ArrowRight") to = i + 1;
    else if (event.key === newer || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = navKeys.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      leaveRail();
      return;
    } else if (key !== "pill" && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      const toast = byId.get(key);
      if (toast?.state === "failed") retry(key);
      else if (stackStyle === "stack") togglePinned();
      return;
    } else if (
      key !== "pill" &&
      (event.key === "Delete" || event.key === "Backspace")
    ) {
      event.preventDefault();
      if (inert) return;
      const after = navKeys[i + 1] ?? navKeys[i - 1] ?? null;
      dismiss(key, "press");
      if (after && after !== "pill") {
        setActiveToast(after);
        requestFocus(after);
      } else if (after === "pill") requestFocus("pill");
      else if (order.length <= 1) requestFocus("quiet");
      return;
    } else return;
    event.preventDefault();
    const target = navKeys[clamp(to, 0, navKeys.length - 1)];
    if (target) {
      if (target !== "pill") setActiveToast(target);
      nodeOf(target)?.focus();
    }
  };

  const onToolKey = (event: React.KeyboardEvent, id: string) => {
    const keys = errands.map((e) => e.id);
    const i = keys.indexOf(id);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = keys.length - 1;
    else return;
    event.preventDefault();
    const target = keys[clamp(to, 0, keys.length - 1)];
    if (target) {
      setActiveTool(target);
      toolNodes.current.get(target)?.focus();
    }
  };

  const togglePinned = () => {
    const next = !pinned;
    setPinned(next);
    setAnnouncement(
      next
        ? `Showing all ${order.length} ${order.length === 1 ? "toast" : "toasts"}.`
        : `Showing ${Math.min(order.length, maxVisible)} of ${order.length}.`,
    );
  };

  /* ------------------------------- render ------------------------------ */

  const pillText = (() => {
    if (pinned) return "Show fewer";
    const parts: string[] = [];
    if (counts.running) parts.push(`${counts.running} running`);
    if (counts.failed) parts.push(`${counts.failed} failed`);
    if (counts.done) parts.push(`${counts.done} done`);
    return parts.join(" · ") || `${order.length} toasts`;
  })();

  const headerCount = (() => {
    if (!ready) return status === "loading" ? "loading" : "unavailable";
    const parts: string[] = [];
    if (counts.running) parts.push(`${counts.running} running`);
    if (counts.failed) parts.push(`${counts.failed} failed`);
    return parts.join(" · ") || "quiet";
  })();

  const runningByErrand = new Map<string, number>();
  for (const t of current) {
    if (t.state === "running") {
      runningByErrand.set(
        t.errandId,
        (runningByErrand.get(t.errandId) ?? 0) + 1,
      );
    }
  }

  const toolStep = cascade(errands.length);
  const recentStep = cascade(recent.length);
  const placement = CORNER[corner] ?? CORNER["bottom-right"];

  const pill =
    hiddenCount > 0 || pinned ? (
      <motion.button
        key="pill"
        ref={pillRef}
        type="button"
        tabIndex={activeKey === "pill" ? 0 : -1}
        aria-expanded={pinned}
        aria-controls={railId}
        onFocus={() => setActiveToast("pill")}
        onClick={togglePinned}
        onKeyDown={(event) => onToastKey(event, "pill")}
        initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={
          motionSafe
            ? { ...springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1 self-end rounded-full border border-hairline-strong bg-popover px-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase shadow-[0_6px_18px_-10px_color-mix(in_oklab,black_45%,transparent)] transition-colors hover:bg-surface-2 hover:text-foreground",
          corner === "bottom-left" && "self-start",
          FOCUS_RING,
        )}
      >
        {counts.running > 0 && !pinned ? (
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-cobalt-bright motion-safe:animate-pulse"
          />
        ) : null}
        {pillText}
        {pinned ? (
          edge === "bottom" ? (
            <ChevronDown aria-hidden className="size-3" />
          ) : (
            <ChevronUp aria-hidden className="size-3" />
          )
        ) : edge === "bottom" ? (
          <ChevronUp aria-hidden className="size-3" />
        ) : (
          <ChevronDown aria-hidden className="size-3" />
        )}
      </motion.button>
    ) : null;

  const rail = (
    <div
      className={cn(
        // Scrolls when pinned open with more than fits; the padding keeps
        // focus rings inside the scroll box.
        "absolute z-10 -m-1 flex max-h-[calc(100%-1rem)] w-[min(18.5rem,calc(100cqw-1rem))] flex-col gap-2 overflow-y-auto overscroll-contain p-1",
        placement.rail,
        edge === "top" && "flex-col-reverse",
      )}
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        hoveredRef.current = true;
        syncPause();
      }}
      onPointerLeave={() => {
        hoveredRef.current = false;
        syncPause();
      }}
      onFocus={() => {
        focusedRef.current = true;
        syncPause();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && event.currentTarget.contains(next)) return;
        focusedRef.current = false;
        syncPause();
      }}
    >
      <AnimatePresence initial={false}>{pill}</AnimatePresence>
      {order.length === 0 ? (
        <div
          ref={quietRef}
          tabIndex={-1}
          aria-label="Nothing running"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              leaveRail();
            }
          }}
          className={cn(
            "flex items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-3 py-2.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
            FOCUS_RING,
          )}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-hairline-strong"
          />
          Quiet · nothing running
        </div>
      ) : (
        <motion.ul
          id={railId}
          role="list"
          aria-label={`${title} rail`}
          className="relative shrink-0 overflow-visible"
          initial={false}
          animate={{ height: railHeight }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <AnimatePresence initial={false}>
            {order.map((toast, i) => (
              <ToastCard
                key={toast.id}
                toast={toast}
                errand={byErrand.get(toast.errandId)}
                index={i}
                count={order.length}
                slot={slots[i] ?? { offset: 0, scale: 1, visible: true }}
                edge={edge}
                hold={holds[toast.id]}
                holdMs={holdMs}
                motionSafe={motionSafe}
                enter={live && !initialIds.has(toast.id)}
                tabIndex={activeKey === toast.id ? 0 : -1}
                disabled={inert}
                hintId={hintId}
                register={register}
                onMeasure={measure}
                onFocus={() => setActiveToast(toast.id)}
                onKeyDown={(event) => onToastKey(event, toast.id)}
                onPress={() => {
                  if (stackStyle === "stack") togglePinned();
                }}
                onDismiss={() => {
                  if (inert) return;
                  dismiss(toast.id, "press");
                }}
                onRetry={() => retry(toast.id)}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
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
        {shortcut
          ? `Alt and ${shortcut.toUpperCase()} moves to the rail. `
          : ""}
        Up and Down move through the toasts, Enter retries a failed one, Delete
        dismisses, Escape returns.
      </p>

      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase">
            <motion.span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                counts.running
                  ? "bg-cobalt-bright"
                  : counts.failed
                    ? "bg-danger"
                    : "bg-hairline-strong",
              )}
              initial={false}
              animate={{ scale: counts.running ? 1 : 0.8 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
            {headerCount}
          </p>
        </div>

        {status === "loading" ? (
          <div aria-hidden className="ml-auto flex items-center gap-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="h-7 w-8 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[36rem]:w-24"
                style={{ animationDelay: `${i * 70}ms` }}
              />
            ))}
          </div>
        ) : status === "error" ? null : errands.length === 0 ? (
          <p className="ml-auto text-[11px] text-ink-3">No errands to run</p>
        ) : (
          <div
            role="toolbar"
            aria-label="Start an errand"
            className="ml-auto flex items-center gap-1.5"
          >
            {errands.map((errand, i) => {
              const Icon = ICONS[errand.icon ?? "generic"] ?? Zap;
              const running = runningByErrand.get(errand.id) ?? 0;
              return (
                <motion.button
                  key={errand.id}
                  ref={(node) => {
                    if (node) toolNodes.current.set(errand.id, node);
                    else toolNodes.current.delete(errand.id);
                  }}
                  type="button"
                  tabIndex={activeErrand === errand.id ? 0 : -1}
                  aria-label={`Start ${errand.label}${running ? `, ${running} running` : ""}`}
                  title={errand.label}
                  aria-disabled={inert || undefined}
                  onFocus={() => setActiveTool(errand.id)}
                  onClick={() => start(errand)}
                  onKeyDown={(event) => onToolKey(event, errand.id)}
                  initial={
                    live
                      ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                      : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    y: motionSafe
                      ? { ...springs.glide, delay: r3(i * toolStep) }
                      : { duration: 0 },
                    opacity: {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: motionSafe ? r3(i * toolStep) : 0,
                    },
                  }}
                  whileTap={inert || !motionSafe ? undefined : { scale: 0.96 }}
                  className={cn(
                    "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2 text-xs transition-colors @min-[36rem]:px-2.5",
                    inert
                      ? "cursor-not-allowed text-ink-3"
                      : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  <span className="hidden @min-[36rem]:inline">
                    {errand.label}
                  </span>
                  <AnimatePresence>
                    {running > 0 ? (
                      <motion.span
                        key="dot"
                        aria-hidden
                        className="absolute -top-0.5 -right-0.5 size-2 rounded-full border-2 border-card bg-cobalt-bright"
                        initial={{ scale: motionSafe ? 0 : 1, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? springs.snap
                            : { duration: durations.fast }
                        }
                      />
                    ) : null}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        )}
      </header>

      <div
        className={cn(
          "relative min-h-0 flex-1 border-t border-hairline bg-surface-0",
          "bg-[radial-gradient(color-mix(in_oklab,var(--ink-3)_28%,transparent)_1px,transparent_1px)] bg-[size:14px_14px]",
        )}
      >
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The errands didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(BUTTON, "bg-card text-foreground", FOCUS_RING)}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div
            aria-hidden
            className={cn(
              "absolute w-[min(18rem,calc(100cqw-1.5rem))]",
              placement.rail,
            )}
          >
            <span className="block h-14 rounded-3 border border-hairline bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              {recent.length > 0 ? (
                <motion.div
                  key="recent"
                  aria-label="Recent errands"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                  className={cn(
                    "absolute hidden max-w-[16rem] flex-col gap-1 @min-[40rem]:flex",
                    placement.recent,
                  )}
                >
                  <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    Recent
                  </p>
                  <ul role="list" className="flex flex-col gap-0.5">
                    <AnimatePresence initial={false}>
                      {recent.map((r, i) => (
                        <motion.li
                          key={r.id}
                          layout={motionSafe ? "position" : false}
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
                            layout: springs.glide,
                            y: motionSafe
                              ? { ...springs.glide, delay: r3(i * recentStep) }
                              : { duration: 0 },
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }}
                          className="flex items-center gap-1.5 text-[11px] text-ink-3"
                        >
                          <span
                            aria-hidden
                            className={cn(
                              "size-1.5 shrink-0 rounded-full",
                              r.outcome === "done" ? "bg-success" : "bg-danger",
                            )}
                          />
                          <span className="truncate">{r.label}</span>
                          {r.tookMs !== null ? (
                            <span className="shrink-0 font-mono text-[10px] tabular-nums">
                              {took(r.tookMs)}
                            </span>
                          ) : null}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </motion.div>
              ) : null}
            </AnimatePresence>
            {rail}
          </>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
