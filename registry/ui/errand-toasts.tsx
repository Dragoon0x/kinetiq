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
  Archive,
  Check,
  ChevronDown,
  FileDown,
  FileUp,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  Upload,
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
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type ErrandKind = "export" | "upload" | "import" | "sync" | "backup";
export type ErrandState = "running" | "done" | "failed";
export type ErrandAction = { id: string; label: string };

export type ErrandTask = {
  id: string;
  /** Picks the glyph. */
  kind: ErrandKind;
  /** What is happening: "Exporting readings". */
  title: string;
  /** A second line while it runs: "31 of 50 MB". */
  detail?: string;
  /** 0 to 1, or null while the size of the job is unknown. */
  progress?: number | null;
  state: ErrandState;
  /** What a finished task turns into: its title, a line, and one action. */
  result?: { title: string; detail?: string; action?: ErrandAction };
  /** Why a failed task stopped. */
  error?: string;
};

export type ErrandCorner =
  "bottom-right" | "bottom-left" | "top-right" | "top-center";
export type ErrandBorderStyle = "line" | "band" | "dotted";

export type ErrandToastsProps = {
  /** The errands, in the order they started; the newest is drawn on top. @default defaultErrandTasks */
  tasks?: ErrandTask[];
  /** Toasts shown before older ones fold into a count. @default 3 */
  max?: number;
  /** Where the stack sits in its container, and the side toasts enter from. @default "bottom-right" */
  corner?: ErrandCorner;
  /** How progress runs round the border: a fine line, a 3px band, or a trail of dots. @default "line" */
  borderStyle?: ErrandBorderStyle;
  /** The progress line, its seal and the percentage. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** "overlay" pins the stack to a corner of the nearest positioned ancestor; "inline" keeps it in flow. @default "overlay" */
  layout?: "overlay" | "inline";
  /** Toast width in px; under 30rem of container they span it. @default 360 */
  width?: number;
  /** Finished toasts dismiss themselves after this long, paused while hovered or focused; 0 keeps them. @default 8000 */
  doneTimeout?: number;
  /** Controlled dismissed task ids. */
  dismissed?: string[];
  /** Initial dismissed ids when uncontrolled. @default [] */
  defaultDismissed?: string[];
  /** A toast was dismissed (its ×, Escape, Delete, or its own timeout). */
  onDismiss?: (taskId: string) => void;
  /** A finished toast's action was pressed. */
  onAction?: (taskId: string, actionId: string) => void;
  /** Retry was pressed on a failed toast. */
  onRetry?: (taskId: string) => void;
  /** The folded count was opened or closed. */
  onExpandChange?: (expanded: boolean) => void;
  /** The key that moves focus to the toasts and back. @default "F6" */
  hotkey?: string;
  /** The region's name. @default "Background tasks" */
  label?: string;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** A Gaugeworks console with five errands in flight or just finished. */
export const defaultErrandTasks: ErrandTask[] = [
  {
    id: "backup",
    kind: "backup",
    title: "Backing up readings",
    state: "done",
    progress: 1,
    result: {
      title: "Nightly backup finished",
      detail: "2.1 GB · kept for 30 days",
      action: { id: "view", label: "View" },
    },
  },
  {
    id: "photos",
    kind: "upload",
    title: "Uploading site photos",
    detail: "Pier 4 · 18 photos",
    state: "failed",
    progress: 0.62,
    error: "The connection dropped at 62%.",
  },
  {
    id: "sensors",
    kind: "import",
    title: "Importing sensors.csv",
    detail: "Reading the file",
    state: "running",
    progress: null,
  },
  {
    id: "readings",
    kind: "export",
    title: "Exporting readings",
    detail: "31 of 50 MB · about 20 s left",
    state: "running",
    progress: 0.62,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const KIND_ICON: Record<ErrandKind, typeof FileDown> = {
  export: FileDown,
  upload: Upload,
  import: FileUp,
  sync: RefreshCw,
  backup: Archive,
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** The toast's corner radius, px: the border path is drawn on it. */
const RADIUS = 12;
const STROKE: Record<ErrandBorderStyle, number> = {
  line: 2,
  band: 3.5,
  dotted: 2.6,
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The toast's outline as one path, starting just after the top-left corner
 * and running clockwise, inset by half the stroke so the line sits on the
 * border. Measured in pixels: the SVG is never stretched.
 */
function outline(w: number, h: number, sw: number) {
  const o = sw / 2;
  const r = Math.max(0, Math.min(RADIUS - o, (w - sw) / 2, (h - sw) / 2));
  const x0 = r2(o);
  const y0 = r2(o);
  const x1 = r2(w - o);
  const y1 = r2(h - o);
  const rr = r2(r);
  const d = [
    `M${r2(x0 + r)} ${y0}`,
    `H${r2(x1 - r)}`,
    `A${rr} ${rr} 0 0 1 ${x1} ${r2(y0 + r)}`,
    `V${r2(y1 - r)}`,
    `A${rr} ${rr} 0 0 1 ${r2(x1 - r)} ${y1}`,
    `H${r2(x0 + r)}`,
    `A${rr} ${rr} 0 0 1 ${x0} ${r2(y1 - r)}`,
    `V${r2(y0 + r)}`,
    `A${rr} ${rr} 0 0 1 ${r2(x0 + r)} ${y0}`,
    "Z",
  ].join(" ");
  const length = r2(2 * (x1 - x0 + (y1 - y0)) - 8 * r + 2 * Math.PI * r);
  return { d, length };
}

/** Page visibility, for loops that must not run in a hidden tab. */
const subscribeVisibility = (cb: () => void) => {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
};
const getHidden = () => document.hidden;
const getServerHidden = () => false;

/* ----------------------------------------------------------------------- */
/*                                The border                                */
/* ----------------------------------------------------------------------- */

/**
 * Progress as a line running round the toast's border. Determinate progress
 * chases each report on glide; unknown progress sends a 22% segment round on
 * a linear loop, only while the stack is in view and the page is visible.
 * Finishing closes the lap and seals it: the outline thickens once and fades
 * into the hairline. A failure stops the line and turns the whole outline a
 * muted red.
 */
function TraceBorder({
  width,
  height,
  progress,
  state,
  style,
  live,
  motionSafe,
}: {
  width: number;
  height: number;
  progress: number | null;
  state: ErrandState;
  style: ErrandBorderStyle;
  live: boolean;
  motionSafe: boolean;
}) {
  const raw = React.useId();
  const maskId = `et${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const sw = STROKE[style] ?? STROKE.line;
  const { d, length } = outline(width, height, sw);
  const unknown = progress === null && state === "running";
  const target =
    state === "done" ? length : r2(clamp01(progress ?? 0) * length);

  const drawn = useMotionValue(target);
  const offset = useMotionValue(0);
  const seal = useMotionValue(state === "done" ? 0 : 1);
  const thick = useMotionValue(sw);
  const dash = useMotionValue(`${target} ${r2(length + 1)}`);
  // The dash is rebuilt from the drawn length; a resize changes the gap too.
  React.useEffect(() => {
    const write = (v: number) => dash.set(`${r2(v)} ${r2(length + 1)}`);
    write(drawn.get());
    return drawn.on("change", write);
  }, [drawn, dash, length]);
  const segment = r2(length * 0.22);

  // Determinate: chase the reported length.
  React.useEffect(() => {
    if (unknown) return;
    if (!motionSafe) {
      drawn.jump(target);
      return;
    }
    const c = animate(drawn, target, springs.glide);
    return () => c.stop();
  }, [target, unknown, motionSafe, drawn]);

  // Unknown: a segment laps the border, only while anyone can see it.
  React.useEffect(() => {
    if (!unknown || !live || !motionSafe) {
      offset.jump(0);
      return;
    }
    const c = animate(offset, [0, -length], {
      duration: 1.6,
      ease: "linear",
      repeat: Infinity,
    });
    return () => c.stop();
  }, [unknown, live, motionSafe, length, offset]);

  // Done: the lap closes, the outline swells once, then fades out.
  const [sealed, setSealed] = React.useState(state === "done" ? 1 : 0);
  const [lastState, setLastState] = React.useState(state);
  if (lastState !== state) {
    setLastState(state);
    if (state === "done") setSealed((n) => n + 1);
  }
  React.useEffect(() => {
    if (sealed === 0) {
      seal.jump(1);
      return;
    }
    if (!motionSafe) {
      const c = animate(seal, 0, { duration: durations.slow, delay: 0.3 });
      return () => c.complete();
    }
    const runs: AnimationPlaybackControls[] = [
      animate(thick, [sw, sw + 1.6, sw], {
        duration: 0.5,
        ease: easings.move,
        delay: 0.25,
      }),
      animate(seal, 0, { duration: 0.6, ease: easings.enter, delay: 0.7 }),
    ];
    return () => {
      for (const r of runs) r.complete();
    };
  }, [sealed, motionSafe, seal, thick, sw]);

  if (width <= 0 || height <= 0) return null;
  const failed = state === "failed";
  const strokeClass = failed
    ? "stroke-[color-mix(in_oklab,var(--danger)_72%,var(--ink-3))]"
    : "stroke-(--et-accent)";

  return (
    <svg
      aria-hidden
      width={width}
      height={height}
      className="pointer-events-none absolute -inset-px overflow-visible"
    >
      {style === "dotted" ? (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <motion.path
              d={d}
              fill="none"
              stroke="white"
              strokeWidth={sw + 6}
              strokeDasharray={
                unknown ? `${segment} ${r2(length - segment)}` : dash
              }
              strokeDashoffset={offset}
            />
          </mask>
        </defs>
      ) : null}
      {failed ? (
        <path
          d={d}
          fill="none"
          className="stroke-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
          strokeWidth={1}
        />
      ) : null}
      <motion.g style={{ opacity: seal }}>
        {style === "dotted" ? (
          <path
            d={d}
            fill="none"
            className={cn("transition-[stroke] duration-300", strokeClass)}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray="0 6"
            mask={`url(#${maskId})`}
          />
        ) : (
          <motion.path
            d={d}
            fill="none"
            className={cn("transition-[stroke] duration-300", strokeClass)}
            strokeLinecap="round"
            style={{ strokeWidth: thick }}
            strokeDasharray={
              unknown ? `${segment} ${r2(length - segment)}` : dash
            }
            strokeDashoffset={offset}
          />
        )}
      </motion.g>
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 One toast                                */
/* ----------------------------------------------------------------------- */

type ToastProps = {
  task: ErrandTask;
  style: ErrandBorderStyle;
  live: boolean;
  motionSafe: boolean;
  doneTimeout: number;
  register: (id: string, node: HTMLElement | null) => void;
  onDismiss: (id: string, viaKeyboard: boolean) => void;
  onAction?: (taskId: string, actionId: string) => void;
  onRetry?: (taskId: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLElement>, id: string) => void;
};

function Toast({
  task,
  style,
  live,
  motionSafe,
  doneTimeout,
  register,
  onDismiss,
  onAction,
  onRetry,
  onKey,
}: ToastProps) {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    if (!node) return;
    const measure = () => setBox({ w: node.offsetWidth, h: node.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  const bind = React.useCallback(
    (el: HTMLElement | null) => {
      setNode(el);
      register(task.id, el);
    },
    [register, task.id],
  );

  // A finished toast lands with a small recoil, decided in the render that
  // sees it finish.
  const [landed, setLanded] = React.useState(0);
  const [seen, setSeen] = React.useState(task.state);
  if (seen !== task.state) {
    setSeen(task.state);
    if (task.state === "done") setLanded((n) => n + 1);
  }
  React.useEffect(() => {
    if (!node || landed === 0 || !motionSafe) return;
    const c = animate(node, { scale: [0.97, 1] }, springs.recoil);
    return () => c.complete();
  }, [landed, node, motionSafe]);

  // Finished toasts leave by themselves, unless someone is with them.
  const [held, setHeld] = React.useState(false);
  const dismissRef = React.useRef(onDismiss);
  React.useEffect(() => {
    dismissRef.current = onDismiss;
  });
  React.useEffect(() => {
    if (task.state !== "done" || doneTimeout <= 0 || held) return;
    const t = window.setTimeout(
      () => dismissRef.current(task.id, false),
      doneTimeout,
    );
    return () => window.clearTimeout(t);
  }, [task.state, task.id, doneTimeout, held]);

  const Icon =
    task.state === "done"
      ? Check
      : task.state === "failed"
        ? TriangleAlert
        : (KIND_ICON[task.kind] ?? FileDown);
  const pct =
    task.progress === null || task.progress === undefined
      ? null
      : Math.round(clamp01(task.progress) * 100);
  const title =
    task.state === "done" ? (task.result?.title ?? task.title) : task.title;
  const detail =
    task.state === "done"
      ? task.result?.detail
      : task.state === "failed"
        ? (task.error ?? "It stopped before it finished.")
        : (task.detail ?? (pct === null ? "Working" : undefined));
  const name = `${title}${
    task.state === "running"
      ? pct === null
        ? ", in progress"
        : `, ${pct} percent`
      : task.state === "failed"
        ? ", failed"
        : ", done"
  }`;
  const tween = { duration: durations.base, ease: easings.enter };

  return (
    <article
      ref={bind}
      tabIndex={-1}
      data-toast={task.id}
      aria-label={name}
      onKeyDown={(event) => onKey(event, task.id)}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHeld(true);
      }}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(event) => {
        const to = event.relatedTarget;
        if (!(to instanceof Node && event.currentTarget.contains(to))) {
          setHeld(false);
        }
      }}
      className={cn(
        "relative w-full rounded-[12px] border bg-popover text-foreground shadow-[0_10px_28px_-8px_color-mix(in_oklab,black_28%,transparent)] transition-colors duration-300",
        task.state === "failed"
          ? "border-[color-mix(in_oklab,var(--danger)_40%,var(--hairline))]"
          : "border-hairline-strong",
        FOCUS_RING,
      )}
    >
      <TraceBorder
        width={box.w}
        height={box.h}
        progress={
          task.state === "running"
            ? task.progress === undefined
              ? null
              : task.progress
            : (task.progress ?? (task.state === "done" ? 1 : 0))
        }
        state={task.state}
        style={style}
        live={live}
        motionSafe={motionSafe}
      />
      <div className="flex items-center gap-2.5 py-2.5 pr-1.5 pl-2.5 @min-[30rem]/errand-toasts:gap-3 @min-[30rem]/errand-toasts:pl-3">
        <span
          aria-hidden
          className={cn(
            "relative flex size-7 shrink-0 items-center justify-center rounded-[9px] transition-colors duration-300 @min-[30rem]/errand-toasts:size-8",
            task.state === "done"
              ? "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success"
              : task.state === "failed"
                ? "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger"
                : "bg-[color-mix(in_oklab,var(--et-accent)_13%,transparent)] text-(--et-accent)",
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={task.state === "running" ? task.kind : task.state}
              className="inline-flex"
              initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.5 : 1,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      scale: springs.flick,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              <Icon className="size-4" />
            </motion.span>
          </AnimatePresence>
        </span>

        <div className="grid min-w-0 flex-1">
          <AnimatePresence initial={false}>
            <motion.div
              key={task.state}
              className="flex min-w-0 flex-col [grid-area:1/1]"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={tween}
            >
              <p
                className="truncate text-[13px] leading-5 font-medium"
                title={title}
              >
                {title}
              </p>
              {detail ? (
                <p
                  className={cn(
                    "truncate text-[12px] leading-4",
                    task.state === "failed" ? "text-danger" : "text-ink-3",
                  )}
                  title={detail}
                >
                  {detail}
                </p>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="grid shrink-0 justify-items-end">
          <AnimatePresence initial={false}>
            <motion.div
              key={task.state}
              className="flex items-center [grid-area:1/1]"
              initial={{ opacity: 0, x: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                ...tween,
                delay: task.state === "running" ? 0 : 0.2,
              }}
            >
              {task.state === "running" ? (
                <span className="px-1.5 font-mono text-[12px] text-(--et-accent) tabular-nums">
                  {pct === null ? "…" : `${pct}%`}
                </span>
              ) : task.state === "done" && task.result?.action ? (
                <button
                  type="button"
                  onClick={() => {
                    const a = task.result?.action;
                    if (a) onAction?.(task.id, a.id);
                  }}
                  className={cn(
                    "inline-flex h-7 items-center rounded-2 px-2.5 text-[12px] font-medium text-(--et-accent) transition-colors hover:bg-surface-2",
                    FOCUS_IN,
                  )}
                >
                  {task.result.action.label}
                </button>
              ) : task.state === "failed" ? (
                <button
                  type="button"
                  aria-label={`Retry ${task.title.toLowerCase()}`}
                  onClick={() => onRetry?.(task.id)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-2 px-2 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2 @min-[30rem]/errand-toasts:px-2.5",
                    FOCUS_IN,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  <span className="hidden @min-[30rem]/errand-toasts:inline">
                    Retry
                  </span>
                </button>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          aria-label={`Dismiss ${title}`}
          onClick={(event) => onDismiss(task.id, event.detail === 0)}
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_IN,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
    </article>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The stack                                 */
/* ----------------------------------------------------------------------- */

const PLACE: Record<ErrandCorner, string> = {
  "bottom-right": "bottom-0 right-0",
  "bottom-left": "bottom-0 left-0",
  "top-right": "top-0 right-0",
  "top-center": "top-0 left-1/2 -translate-x-1/2",
};
const ALIGN: Record<ErrandCorner, string> = {
  "bottom-right": "items-end",
  "bottom-left": "items-start",
  "top-right": "items-end",
  "top-center": "items-center",
};

/**
 * Toasts for long-running work. Each toast's border is its progress bar: a
 * line traced round its rounded outline, measured in pixels, that chases each
 * report on glide — or, while the size of the job is unknown, a segment that
 * laps it. Finishing closes the lap and seals it (the outline swells once and
 * fades), the glyph turns to a check on flick, title and line cross-fade into
 * the result with its action, and the toast lands on recoil. A failure stops
 * the line and turns the outline a muted red with Retry.
 *
 * Toasts stack newest on top, enter from their corner's side on recoil while
 * the rest make room on glide, and fold into a "+2 more" count past `max`.
 * The stack is a labelled region with one polite status that speaks each
 * change once; F6 brings focus to the newest toast and F6 again returns it,
 * Up and Down move between toasts and Escape or Delete dismisses one. Under
 * reduced motion nothing travels or loops: the line steps, the unknown state
 * is a still dashed outline, and every state still changes.
 */
export function ErrandToasts({
  tasks = defaultErrandTasks,
  max = 3,
  corner = "bottom-right",
  borderStyle = "line",
  accent = "var(--accent-bright)",
  layout = "overlay",
  width = 360,
  doneTimeout = 8000,
  dismissed,
  defaultDismissed,
  onDismiss,
  onAction,
  onRetry,
  onExpandChange,
  hotkey = "F6",
  label = "Background tasks",
  className,
}: ErrandToastsProps) {
  const motionSafe = useMotionSafe();
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    getHidden,
    getServerHidden,
  );
  const [ownDismissed, setOwnDismissed] = React.useState<string[]>(
    () => defaultDismissed ?? [],
  );
  const gone = dismissed ?? ownDismissed;
  const shown = React.useMemo(
    () => [...tasks].reverse().filter((t) => !gone.includes(t.id)),
    [tasks, gone],
  );
  const limit = Math.max(1, Math.round(max));
  const [open, setOpen] = React.useState(false);
  const folded = Math.max(0, shown.length - limit);
  const expanded = open && folded > 0;
  const visible = expanded ? shown : shown.slice(0, limit);

  /* --------------------------- announcements ---------------------------- */

  const signature = tasks.map((t) => `${t.id}:${t.state}`).join("|");
  const [seenSig, setSeenSig] = React.useState(signature);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  if (seenSig !== signature) {
    const before = new Map(
      seenSig
        .split("|")
        .filter(Boolean)
        .map((p) => {
          const at = p.lastIndexOf(":");
          return [p.slice(0, at), p.slice(at + 1)] as const;
        }),
    );
    const lines: string[] = [];
    for (const t of tasks) {
      const was = before.get(t.id);
      if (was === t.state) continue;
      if (t.state === "running") lines.push(`${t.title} started.`);
      else if (t.state === "done") {
        const r = t.result;
        lines.push(
          `${r?.title ?? t.title}.${r?.action ? ` ${r.action.label}.` : ""}`,
        );
      } else lines.push(`${t.title} failed: ${t.error ?? "it stopped"}`);
    }
    setSeenSig(signature);
    if (lines.length > 0) {
      setSaid((s) => ({ n: s.n + 1, text: lines.join(" ") }));
    }
  }

  /* ------------------------------ in view ------------------------------- */

  const [region, setRegion] = React.useState<HTMLElement | null>(null);
  const [inView, setInView] = React.useState(false);
  React.useEffect(() => {
    if (!region) return;
    const io = new IntersectionObserver((entries) => {
      setInView(entries.some((e) => e.isIntersecting));
    });
    io.observe(region);
    return () => io.disconnect();
  }, [region]);
  const live = inView && !hidden;

  /* -------------------------------- focus ------------------------------- */

  const nodes = React.useRef(new Map<string, HTMLElement>());
  const register = React.useCallback((id: string, node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  }, []);
  const returnTo = React.useRef<HTMLElement | null>(null);
  const [focusAsk, setFocusAsk] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  React.useEffect(() => {
    if (!focusAsk) return;
    nodes.current.get(focusAsk.id)?.focus();
  }, [focusAsk]);

  const latest = React.useRef({ visible, region, live });
  React.useEffect(() => {
    latest.current = { visible, region, live };
  });

  // F6 reaches the toasts from anywhere on the page, and goes back again.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== hotkey || event.defaultPrevented) return;
      const { visible: list, region: r, live: seen } = latest.current;
      if (!r) return;
      const active = document.activeElement;
      if (active instanceof Node && r.contains(active)) {
        event.preventDefault();
        const back = returnTo.current;
        returnTo.current = null;
        if (back && back.isConnected) back.focus();
        else (active as HTMLElement).blur?.();
        return;
      }
      if (event.shiftKey || !seen || list.length === 0) return;
      const first = list[0];
      if (!first) return;
      event.preventDefault();
      returnTo.current = active instanceof HTMLElement ? active : null;
      nodes.current.get(first.id)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [hotkey]);

  /* ------------------------------- actions ------------------------------ */

  const dismiss = (id: string, viaKeyboard: boolean) => {
    const at = visible.findIndex((t) => t.id === id);
    if (viaKeyboard) {
      const next = visible[at + 1] ?? visible[at - 1];
      if (next) setFocusAsk((f) => ({ id: next.id, n: (f?.n ?? 0) + 1 }));
      else {
        const back = returnTo.current;
        returnTo.current = null;
        if (back && back.isConnected) back.focus();
      }
    }
    if (dismissed === undefined) setOwnDismissed((d) => [...d, id]);
    onDismiss?.(id);
  };

  const onToastKey = (event: React.KeyboardEvent<HTMLElement>, id: string) => {
    const at = visible.findIndex((t) => t.id === id);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const to = visible[at + (event.key === "ArrowDown" ? 1 : -1)];
      if (to) nodes.current.get(to.id)?.focus();
      return;
    }
    const onToast = event.target === event.currentTarget;
    if (event.key === "Escape" || (onToast && event.key === "Delete")) {
      // Ours: the stage behind must not close on it.
      event.preventDefault();
      event.stopPropagation();
      dismiss(id, true);
    }
  };

  const toggleFold = () => {
    const next = !expanded;
    setOpen(next);
    onExpandChange?.(next);
  };

  /* ------------------------------- render ------------------------------- */

  const fromSide =
    corner === "bottom-left" ? -1 : corner === "top-center" ? 0 : 1;
  const enter = {
    opacity: 0,
    x: motionSafe ? fromSide * distances.shift : 0,
    y: motionSafe && fromSide === 0 ? -distances.shift : 0,
    scale: motionSafe ? 0.96 : 1,
  };

  const stack = (
    <section
      ref={setRegion}
      aria-label={`${label}, ${hotkey}`}
      className={cn(
        "pointer-events-auto flex w-full flex-col gap-2",
        layout === "overlay" ? ALIGN[corner] : "items-stretch",
      )}
      style={
        {
          maxWidth: width,
          "--et-accent": accent,
        } as React.CSSProperties
      }
    >
      <ol
        role="list"
        className={cn(
          "flex w-full flex-col gap-2",
          expanded &&
            "max-h-[min(60vh,28rem)] [scrollbar-width:thin] overflow-y-auto overscroll-contain p-1",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((task) => (
            <motion.li
              key={task.id}
              layout={motionSafe ? "position" : false}
              initial={enter}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{
                opacity: 0,
                x: motionSafe ? fromSide * distances.shift : 0,
                y: motionSafe && fromSide === 0 ? -distances.step : 0,
                transition: exitFor(),
              }}
              transition={
                motionSafe
                  ? {
                      layout: springs.glide,
                      x: springs.recoil,
                      y: springs.recoil,
                      scale: springs.recoil,
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }
                  : { duration: durations.fast }
              }
              className="w-full"
            >
              <Toast
                task={task}
                style={borderStyle}
                live={live}
                motionSafe={motionSafe}
                doneTimeout={doneTimeout}
                register={register}
                onDismiss={dismiss}
                onAction={onAction}
                onRetry={onRetry}
                onKey={onToastKey}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      <AnimatePresence initial={false}>
        {folded > 0 ? (
          <motion.button
            key="fold"
            type="button"
            aria-expanded={expanded}
            onClick={toggleFold}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline-strong bg-popover px-3 text-[12px] font-medium text-ink-2 shadow-[0_6px_16px_-6px_color-mix(in_oklab,black_24%,transparent)] transition-colors hover:text-foreground",
              FOCUS_RING,
            )}
          >
            {expanded ? "Show fewer" : `+${folded} more`}
            <motion.span
              aria-hidden
              className="inline-flex"
              initial={false}
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
          </motion.button>
        ) : null}
      </AnimatePresence>
      <p role="status" aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );

  if (layout === "inline") {
    return (
      <div className={cn("@container/errand-toasts w-full", className)}>
        {stack}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "@container/errand-toasts pointer-events-none absolute inset-0",
        className,
      )}
    >
      <div
        className={cn(
          "absolute flex w-full p-3 @min-[30rem]/errand-toasts:w-auto",
          PLACE[corner],
        )}
        style={{ maxWidth: "100%" }}
      >
        <div
          className="w-full @min-[30rem]/errand-toasts:w-(--et-w)"
          style={{ "--et-w": `${width}px` } as React.CSSProperties}
        >
          {stack}
        </div>
      </div>
    </div>
  );
}
