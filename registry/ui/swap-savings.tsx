"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Columns2,
  RotateCcw,
  Scale,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SwapGhostStyle = "dashed" | "shade" | "cap";
export type SwapSavingsAccentName = "cobalt" | "plum" | "mint" | "ink";
export type SwapSavingsStatus = "ready" | "loading" | "insufficient" | "error";

export type SwapModel = {
  id: string;
  name: string;
  /** A short name for tight labels: "Pro". @default the last word of the name */
  short?: string;
  /** Price per million input tokens. */
  inputPrice: number;
  /** Price per million output tokens. */
  outputPrice: number;
};

export type SwapTask = { id: string; label: string };

/** A month of one task's traffic on one model. */
export type SwapUsage = {
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Share of each task's from-model traffic moved to the to-model, 0 to 1. */
export type SwapMix = Record<string, number>;

export type SwapTaskProjection = {
  task: SwapTask;
  /** Cost per model id today. */
  today: Record<string, number>;
  /** Cost per model id with the mix applied. */
  projected: Record<string, number>;
};

export type SwapProjection = {
  from: string;
  to: string;
  tasks: SwapTaskProjection[];
  todayTotal: number;
  projectedTotal: number;
  /** Positive when the mix saves money. */
  savings: number;
  /** Quality of the moved traffic before and after, or null when nothing moves. */
  qualityBefore: number | null;
  qualityAfter: number | null;
};

export type SwapSavingsProps = {
  /** The models on the bill. @default defaultSwapModels */
  models?: SwapModel[];
  /** What the traffic is for, in chart order. @default defaultSwapTasks */
  tasks?: SwapTask[];
  /** This month's tokens per task and model. @default defaultSwapUsage */
  usage?: SwapUsage[];
  /** Quality per model and task, 0–100, from your evals. @default defaultSwapQuality */
  quality?: Record<string, Record<string, number>>;
  /** The model traffic moves away from; Flip swaps the pair. @default the first model */
  fromModel?: string;
  /** The model traffic moves to. @default the second model */
  toModel?: string;
  /** Controlled shares moved, per task id. */
  mix?: SwapMix;
  /** Initial shares when uncontrolled. @default {} */
  defaultMix?: SwapMix;
  /** Fires from the slider, key or Reset that changed a share, with the whole mix. */
  onMixChange?: (mix: SwapMix) => void;
  /** Apply mix was pressed. */
  onApplyMix?: (mix: SwapMix, projection: SwapProjection) => void;
  /** Reset (or R) put every share back to today's. */
  onReset?: () => void;
  /** Compare was pressed. Omit it and the button is not drawn. */
  onCompare?: (projection: SwapProjection) => void;
  /** Usage is ready, loading, too thin to project from, or failed. @default "ready" */
  status?: SwapSavingsStatus;
  /** Days of traffic collected so far, for the not-enough-data state. @default 30 */
  daysOfData?: number;
  /** Days a projection needs. @default 14 */
  daysNeeded?: number;
  /** Try again was pressed after usage failed to load. */
  onRetry?: () => void;
  /** How far one arrow key moves a share. @default 0.05 */
  step?: number;
  /** A drop in quality past this many points is flagged. @default 3 */
  qualityFloor?: number;
  /** The panel's heading. @default "October spend by model" */
  title?: string;
  /** How money is printed. @default "$1,240" by hand */
  formatMoney?: (amount: number) => string;
  /** How today's heights are kept while the bars move: a dashed outline, a faint shade, or a cap line. @default "dashed" */
  ghostStyle?: SwapGhostStyle;
  /** Bar thickness, px. @default 32 */
  barWidth?: number;
  /** The to-model's bars, the sliders and the savings: a named pigment or any CSS colour. @default "cobalt" */
  accent?: SwapSavingsAccentName | (string & {});
  /** Read only: shares cannot move. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultSwapModels: SwapModel[] = [
  {
    id: "pro",
    name: "Waylight Pro",
    short: "Pro",
    inputPrice: 6,
    outputPrice: 24,
  },
  {
    id: "lite",
    name: "Waylight Lite",
    short: "Lite",
    inputPrice: 0.8,
    outputPrice: 3.2,
  },
];

export const defaultSwapTasks: SwapTask[] = [
  { id: "replies", label: "Support replies" },
  { id: "summaries", label: "Summaries" },
  { id: "extraction", label: "Extraction" },
  { id: "review", label: "Code review" },
];

const M = 1_000_000;

/** Coldbrook's support assistant, October: most of it still on Pro. */
export const defaultSwapUsage: SwapUsage[] = [
  { task: "replies", model: "pro", inputTokens: 180 * M, outputTokens: 36 * M },
  { task: "replies", model: "lite", inputTokens: 20 * M, outputTokens: 4 * M },
  {
    task: "summaries",
    model: "pro",
    inputTokens: 140 * M,
    outputTokens: 14 * M,
  },
  {
    task: "summaries",
    model: "lite",
    inputTokens: 30 * M,
    outputTokens: 3 * M,
  },
  {
    task: "extraction",
    model: "pro",
    inputTokens: 60 * M,
    outputTokens: 6 * M,
  },
  {
    task: "extraction",
    model: "lite",
    inputTokens: 90 * M,
    outputTokens: 9 * M,
  },
  { task: "review", model: "pro", inputTokens: 50 * M, outputTokens: 10 * M },
];

/** Eval scores per model and task, 0–100. */
export const defaultSwapQuality: Record<string, Record<string, number>> = {
  pro: { replies: 92, summaries: 91, extraction: 95, review: 90 },
  lite: { replies: 84, summaries: 88, extraction: 93, review: 71 },
};

/* ----------------------------------------------------------------------- */
/*                                Projection                                */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

/**
 * What the month would cost with `mix` of each task's `from` traffic sent
 * to `to`: the moved tokens are re-priced at the new model's rates, and the
 * moved traffic's quality is weighed by the tokens moved.
 */
export function projectSwap(
  models: SwapModel[],
  tasks: SwapTask[],
  usage: SwapUsage[],
  quality: Record<string, Record<string, number>>,
  mix: SwapMix,
  from: string,
  to: string,
): SwapProjection {
  const price = new Map(models.map((m) => [m.id, m]));
  const cost = (model: string, input: number, output: number) => {
    const p = price.get(model);
    return p ? (input / M) * p.inputPrice + (output / M) * p.outputPrice : 0;
  };
  let todayTotal = 0;
  let projectedTotal = 0;
  let weight = 0;
  let qBefore = 0;
  let qAfter = 0;
  const rows: SwapTaskProjection[] = tasks.map((task) => {
    const today: Record<string, number> = {};
    const projected: Record<string, number> = {};
    for (const m of models) {
      today[m.id] = 0;
      projected[m.id] = 0;
    }
    const share = clamp(mix[task.id] ?? 0, 0, 1);
    for (const u of usage) {
      if (u.task !== task.id) continue;
      const c = cost(u.model, u.inputTokens, u.outputTokens);
      today[u.model] = (today[u.model] ?? 0) + c;
      if (u.model === from && from !== to && share > 0) {
        const movedIn = u.inputTokens * share;
        const movedOut = u.outputTokens * share;
        projected[u.model] = (projected[u.model] ?? 0) + c * (1 - share);
        projected[to] = (projected[to] ?? 0) + cost(to, movedIn, movedOut);
        const w = movedIn + movedOut;
        weight += w;
        qBefore += w * (quality[from]?.[task.id] ?? 0);
        qAfter += w * (quality[to]?.[task.id] ?? 0);
      } else {
        projected[u.model] = (projected[u.model] ?? 0) + c;
      }
    }
    for (const m of models) {
      todayTotal += today[m.id] ?? 0;
      projectedTotal += projected[m.id] ?? 0;
    }
    return { task, today, projected };
  });
  return {
    from,
    to,
    tasks: rows,
    todayTotal,
    projectedTotal,
    savings: todayTotal - projectedTotal,
    qualityBefore: weight > 0 ? qBefore / weight : null,
    qualityAfter: weight > 0 ? qAfter / weight : null,
  };
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

/** Money by hand: the same string in Node and every browser. */
const dollars = (amount: number): string => {
  const whole = String(Math.round(Math.abs(amount))).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  return `${amount < 0 ? "−" : ""}$${whole}`;
};

const shortOf = (m: SwapModel | undefined) =>
  m?.short ?? m?.name.split(" ").pop() ?? "";

const ACCENTS: Record<SwapSavingsAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

/** Bars are pigment, at one lightness in both themes. */
const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--ss-ink": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as SwapSavingsAccentName]
      : accent,
    "--ss-to":
      accent === "ink"
        ? "oklch(from var(--ink-2) 0.5 0.012 h)"
        : "oklch(from var(--ss-ink) 0.66 0.13 h)",
    "--ss-from": "oklch(from var(--ink-3) 0.72 0.012 h)",
    "--ss-wash": "color-mix(in oklab, var(--ss-ink) 12%, transparent)",
    "--ss-soft": "color-mix(in oklab, var(--ss-ink) 30%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/* ----------------------------------------------------------------------- */
/*                               Rolling text                               */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  format,
  motionSafe,
  className,
}: {
  value: number;
  format: (v: number) => string;
  motionSafe: boolean;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const [first] = React.useState(() => format(value));
  const shown = React.useRef(value);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const from = shown.current;
    if (!motionSafe || from === value) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const ctrl = animate(from, value, {
      ...springs.snap,
      onUpdate: (v) => {
        shown.current = v;
        node.textContent = format(v);
      },
      onComplete: () => {
        shown.current = value;
        node.textContent = format(value);
      },
    });
    return () => ctrl.stop();
  }, [value, format, motionSafe]);
  return (
    <span ref={ref} className={className}>
      {first}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Bars                                   */
/* ----------------------------------------------------------------------- */

const GHOST: Record<SwapGhostStyle, string> = {
  dashed: "border border-dashed border-ink-3/70",
  shade: "bg-ink-3/15",
  cap: "border-t-2 border-ink-2 @max-[36rem]:border-t-0 @max-[36rem]:border-r-2",
};

/**
 * One bar and the ghost of today's. The bar's size is a CSS variable driven
 * by a motion value on `glide`, so the same element stands up in a column
 * and lies down in a row; the ghost never moves.
 */
function Bar({
  value,
  ghost,
  tone,
  ghostStyle,
  motionSafe,
  label,
  amount,
  thickness,
}: {
  value: number;
  ghost: number;
  tone: "from" | "to" | "rest";
  ghostStyle: SwapGhostStyle;
  motionSafe: boolean;
  label: string;
  /** The printed value that rides on top of the column. */
  amount: string;
  thickness: number;
}) {
  const v = useMotionValue(r3(value));
  React.useEffect(() => {
    const ctrl = animate(
      v,
      r3(value),
      motionSafe ? springs.glide : { duration: 0 },
    );
    return () => ctrl.stop();
  }, [v, value, motionSafe]);
  const showGhost = Math.abs(ghost - value) > 0.002;
  return (
    <div
      className="relative h-2.5 w-full shrink-0 @[36rem]:h-full @[36rem]:w-[var(--ss-bw)]"
      style={{ "--ss-bw": `${thickness}px` } as React.CSSProperties}
    >
      <motion.div
        aria-hidden
        className={cn(
          "absolute bottom-0 left-0 h-full w-[calc(var(--ss-v)*100%)] rounded-full @[36rem]:h-[calc(var(--ss-v)*100%)] @[36rem]:w-full @[36rem]:rounded-1 @[36rem]:rounded-t-2",
        )}
        style={
          {
            "--ss-v": v,
            backgroundColor:
              tone === "to"
                ? "var(--ss-to)"
                : tone === "from"
                  ? "var(--ss-from)"
                  : "var(--ss-from)",
          } as unknown as React.CSSProperties
        }
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bottom-0 left-0 h-full w-[calc(var(--ss-g)*100%)] rounded-full transition-opacity duration-200 @[36rem]:h-[calc(var(--ss-g)*100%)] @[36rem]:w-full @[36rem]:rounded-1 @[36rem]:rounded-t-2",
          ghostStyle === "cap" && "rounded-none @[36rem]:rounded-none",
          GHOST[ghostStyle],
        )}
        style={
          {
            "--ss-g": r3(ghost),
            opacity: showGhost ? 1 : 0,
          } as React.CSSProperties
        }
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute bottom-[calc(var(--ss-v)*100%+4px)] left-1/2 hidden -translate-x-1/2 font-mono text-[10px] leading-3 whitespace-nowrap text-ink-2 tabular-nums @[36rem]:block"
        style={{ "--ss-v": v } as unknown as React.CSSProperties}
      >
        {amount}
      </motion.span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Slider                                  */
/* ----------------------------------------------------------------------- */

function ShareSlider({
  value,
  step,
  label,
  valueText,
  disabled,
  motionSafe,
  onChange,
  onCommit,
}: {
  value: number;
  step: number;
  label: string;
  valueText: string;
  disabled: boolean;
  motionSafe: boolean;
  onChange: (share: number) => void;
  onCommit: (share: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const pos = useMotionValue(value);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  const dragging = React.useRef(false);
  const startPos = React.useRef(0);
  const lastSent = React.useRef(value);

  const quantise = React.useCallback(
    (p: number) => clamp(Math.round(p / step) * step, 0, 1),
    [step],
  );

  // A share set from outside (Reset, a key, the host) carries the thumb there.
  React.useEffect(() => {
    lastSent.current = value;
    if (dragging.current) return;
    running.current?.stop();
    running.current = animate(
      pos,
      value,
      motionSafe ? springs.snap : { duration: 0 },
    );
    return () => running.current?.stop();
  }, [value, pos, motionSafe]);

  const width = () => trackRef.current?.getBoundingClientRect().width || 1;

  const send = (p: number) => {
    const q = r3(quantise(p));
    if (q !== lastSent.current) {
      lastSent.current = q;
      onChange(q);
    }
    return q;
  };

  const land = (target: number, velocity = 0) => {
    running.current?.stop();
    running.current = animate(
      pos,
      target,
      motionSafe ? { ...springs.snap, velocity } : { duration: 0 },
    );
    send(target);
    onCommit(target);
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      running.current?.stop();
      startPos.current = pos.get();
    },
    onMove: ({ offset }) => {
      // 1:1 under the finger; the bars follow the stepped share on their spring.
      const p = clamp(startPos.current + offset.x / width(), 0, 1);
      pos.set(r3(p));
      send(p);
    },
    onEnd: ({ velocity }) => {
      dragging.current = false;
      const w = width();
      const landing = project(pos.get() * w, velocity.x, 0.99) / w;
      land(r3(quantise(landing)), velocity.x / w);
    },
    onCancel: () => {
      dragging.current = false;
      land(r3(quantise(pos.get())));
    },
    onTap: (event) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      land(r3(quantise((event.clientX - rect.left) / rect.width)));
      trackRef.current
        ?.querySelector<HTMLElement>("[role=slider]")
        ?.focus({ preventScroll: true });
    },
  });

  // The thumb travels inside the track, so at 0% and 100% it never hangs
  // past the ends into a neighbouring group.
  const left = useTransform(
    pos,
    (p) => `calc(${clamp(p, 0, 1).toFixed(3)} * (100% - 16px) + 8px)`,
  );

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp")
      next = value + step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
      next = value - step;
    else if (event.key === "PageUp") next = value + 0.25;
    else if (event.key === "PageDown") next = value - 0.25;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    land(r3(quantise(next)));
  };

  return (
    <div
      ref={trackRef}
      {...drag}
      className={cn(
        "relative h-6 w-full touch-pan-y select-none",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2"
      />
      <motion.span
        aria-hidden
        className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-[var(--ss-to)]"
        style={{ width: left }}
      />
      <motion.div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKey}
        className={cn(
          "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--ss-to)] bg-card shadow-sm",
          FOCUS,
        )}
        style={{ left }}
      />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

const EMPTY_MIX: SwapMix = {};

/**
 * This month's assistant spend by task and model, with a what-if mode: move
 * a share of each task's traffic from one model to another and watch the
 * bill re-form before you commit. The moment it is built for: as a share
 * slides, the from-model's bar drops and the to-model's bar rises to their
 * projected heights on `glide` — chasing the slider, so they arrive just
 * behind your hand — over ghost outlines that hold today's heights, while
 * the savings figure rolls on `snap` beside a note on what happens to the
 * quality of the moved traffic, which turns warn past `qualityFloor`.
 *
 * Each share is a real `role="slider"`: the thumb follows the finger 1:1,
 * lands on its step on `snap` with the release velocity, and takes arrows,
 * Page Up and Down, Home and End. R resets every share, Flip reverses the
 * pair. Below a 36rem container the chart turns horizontal, a row per task.
 * Under reduced motion the bars and the thumb jump to their values and the
 * figure updates without rolling.
 */
export function SwapSavings({
  models = defaultSwapModels,
  tasks = defaultSwapTasks,
  usage = defaultSwapUsage,
  quality = defaultSwapQuality,
  fromModel,
  toModel,
  mix: mixProp,
  defaultMix = EMPTY_MIX,
  onMixChange,
  onApplyMix,
  onReset,
  onCompare,
  status = "ready",
  daysOfData = 30,
  daysNeeded = 14,
  onRetry,
  step = 0.05,
  qualityFloor = 3,
  title = "October spend by model",
  formatMoney = dollars,
  ghostStyle = "dashed",
  barWidth = 32,
  accent = "cobalt",
  disabled = false,
  className,
}: SwapSavingsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [pair, setPair] = React.useState<[string, string]>(() => [
    fromModel ?? models[0]?.id ?? "",
    toModel ?? models[1]?.id ?? models[0]?.id ?? "",
  ]);
  const [from, to] = pair;
  const [ownMix, setOwnMix] = React.useState<SwapMix>(defaultMix);
  const mix = mixProp ?? ownMix;
  const [announcement, setAnnouncement] = React.useState("");
  const [applied, setApplied] = React.useState(false);

  const fromM = models.find((m) => m.id === from);
  const toM = models.find((m) => m.id === to);
  const stepSize = clamp(step, 0.01, 0.5);
  const thickness = clamp(barWidth, 8, 72);

  const projection = React.useMemo(
    () => projectSwap(models, tasks, usage, quality, mix, from, to),
    [models, tasks, usage, quality, mix, from, to],
  );

  /** One scale for the whole month, wide enough for every share at 100% either way. */
  const scaleMax = React.useMemo(() => {
    const all: SwapMix = Object.fromEntries(tasks.map((t) => [t.id, 1]));
    const a = projectSwap(models, tasks, usage, quality, all, from, to);
    const b = projectSwap(models, tasks, usage, quality, all, to, from);
    let m = 0;
    for (const p of [a, b])
      for (const row of p.tasks)
        for (const v of [
          ...Object.values(row.today),
          ...Object.values(row.projected),
        ])
          m = Math.max(m, v);
    return m * 1.12 || 1;
  }, [models, tasks, usage, quality, from, to]);

  const changes = tasks.filter((t) => (mix[t.id] ?? 0) > 0).length;
  const qb = projection.qualityBefore;
  const qa = projection.qualityAfter;
  const qDrop = qb !== null && qa !== null ? qb - qa : 0;
  const pct =
    projection.todayTotal > 0
      ? Math.round((projection.savings / projection.todayTotal) * 100)
      : 0;

  /* ---------------------------- interactions ---------------------------- */

  const setMix = (next: SwapMix) => {
    if (mixProp === undefined) setOwnMix(next);
    onMixChange?.(next);
    setApplied(false);
  };

  const sentence = (p: SwapProjection, task?: SwapTask, share?: number) => {
    const q =
      p.qualityBefore !== null && p.qualityAfter !== null
        ? ` Quality on moved traffic ${Math.round(p.qualityBefore)} to ${Math.round(p.qualityAfter)}.`
        : "";
    const head = task
      ? `${Math.round((share ?? 0) * 100)}% of ${task.label.toLowerCase()} to ${toM?.name ?? to}.`
      : "";
    const money =
      Math.abs(p.savings) < 0.5
        ? "No change to the bill."
        : p.savings > 0
          ? `Saves ${formatMoney(p.savings)} a month.`
          : `Costs ${formatMoney(-p.savings)} more a month.`;
    return `${head} ${money}${q}`.trim();
  };

  const commit = (task: SwapTask, share: number) => {
    const next = { ...mix, [task.id]: share };
    const p = projectSwap(models, tasks, usage, quality, next, from, to);
    setAnnouncement(sentence(p, task, share));
  };

  const reset = () => {
    if (disabled || changes === 0) return;
    setMix({});
    onReset?.();
    setAnnouncement("Shares reset to today’s mix.");
  };

  const flip = () => {
    if (disabled) return;
    setPair([to, from]);
    setMix({});
    const nextTo = models.find((m) => m.id === from);
    setAnnouncement(`Moving traffic to ${nextTo?.name ?? from} instead.`);
  };

  /* ------------------------------- header ------------------------------- */

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pt-3">
      <span
        aria-hidden
        className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--ss-wash)] text-[var(--ss-ink)] @[30rem]:inline-flex"
      >
        <Scale className="size-4" />
      </span>
      <div className="min-w-[10rem] flex-1">
        <p
          id={titleId}
          title={title}
          className="truncate text-[14px] leading-5 font-semibold"
        >
          {title}
        </p>
        <p className="flex items-center gap-1 truncate text-[11.5px] leading-4 text-ink-3">
          <span className="truncate">{fromM?.name ?? from}</span>
          <ArrowRight aria-hidden className="size-3 shrink-0" />
          <span className="truncate text-[var(--ss-ink)]">
            {toM?.name ?? to}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <motion.span
          key={changes > 0 ? "what-if" : "today"}
          initial={motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            scale: motionSafe ? springs.snap : { duration: 0 },
            opacity: { duration: durations.fast },
          }}
          className={cn(
            "inline-flex h-7 items-center rounded-full border px-2.5 font-mono text-[10.5px] tracking-[0.04em] whitespace-nowrap uppercase",
            changes > 0
              ? "border-[var(--ss-soft)] bg-[var(--ss-wash)] text-[var(--ss-ink)]"
              : "border-hairline text-ink-3",
          )}
        >
          {changes > 0 ? `What-if · ${changes}` : "Today"}
        </motion.span>
        {models.length > 1 ? (
          <button
            type="button"
            onClick={flip}
            disabled={disabled}
            aria-label={`Flip: move traffic from ${toM?.name ?? to} to ${fromM?.name ?? from}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
              FOCUS,
            )}
          >
            <ArrowLeftRight aria-hidden className="size-3.5" />
            <span className="hidden @[30rem]:inline">Flip</span>
          </button>
        ) : null}
      </div>
    </div>
  );

  /* ------------------------------- summary ------------------------------ */

  const saving = projection.savings;
  const summary = (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-3">
      <div className="flex flex-col">
        <span className="text-[11.5px] text-ink-3">
          {changes > 0 ? "Projected" : "This month"}
        </span>
        <span className="flex items-baseline gap-1.5 font-mono tabular-nums">
          <Roll
            value={projection.projectedTotal}
            format={formatMoney}
            motionSafe={motionSafe}
            className="text-[20px] leading-6 font-medium tracking-tight"
          />
          {changes > 0 ? (
            <span className="text-[11.5px] text-ink-3 line-through decoration-ink-3/60">
              {formatMoney(projection.todayTotal)}
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-[11.5px] text-ink-3">
          {saving >= -0.5 ? "Saves a month" : "Costs more a month"}
        </span>
        <span
          className={cn(
            "flex items-baseline gap-1.5 font-mono tabular-nums",
            saving > 0.5
              ? "text-[var(--ss-ink)]"
              : saving < -0.5
                ? "text-warn"
                : "text-ink-2",
          )}
        >
          <Roll
            value={Math.abs(saving)}
            format={formatMoney}
            motionSafe={motionSafe}
            className="text-[20px] leading-6 font-medium tracking-tight"
          />
          <span className="text-[11.5px]">{`${Math.abs(pct)}%`}</span>
        </span>
      </div>
      <p
        className={cn(
          "min-w-0 flex-1 basis-48 text-[12px] leading-5 transition-colors",
          qDrop > qualityFloor ? "text-warn" : "text-ink-3",
        )}
      >
        {qb !== null && qa !== null ? (
          <>
            {"Quality on moved traffic "}
            <span className="font-mono tabular-nums">{`${Math.round(qb)} → ${Math.round(qa)}`}</span>
            {qDrop > qualityFloor
              ? " · past your floor"
              : qDrop > 0.5
                ? " · within your floor"
                : " · unchanged"}
          </>
        ) : (
          `Move a share of a task to see the bill and the quality ${toM ? `on ${shortOf(toM)}` : ""}.`
        )}
      </p>
    </div>
  );

  /* -------------------------------- chart ------------------------------- */

  const groups = projection.tasks.map((row) => {
    const share = mix[row.task.id] ?? 0;
    const fromToday = row.today[from] ?? 0;
    const toToday = row.today[to] ?? 0;
    const fromNow = row.projected[from] ?? 0;
    const toNow = row.projected[to] ?? 0;
    const delta = fromToday + toToday - (fromNow + toNow);
    const hasTraffic = fromToday > 0;
    const bars = [
      {
        id: from,
        model: fromM,
        now: fromNow,
        today: fromToday,
        tone: "from" as const,
      },
      { id: to, model: toM, now: toNow, today: toToday, tone: "to" as const },
    ];
    const valueText = `${Math.round(share * 100)}% of ${row.task.label.toLowerCase()} moved to ${toM?.name ?? to}`;
    return (
      <div
        key={row.task.id}
        className="flex min-w-0 flex-col gap-1.5 @[36rem]:flex-1 @[36rem]:items-center"
      >
        <p className="flex items-baseline gap-2 @[36rem]:hidden">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
            {row.task.label}
          </span>
          <span
            className={cn(
              "font-mono text-[11px] tabular-nums",
              delta > 0.5
                ? "text-[var(--ss-ink)]"
                : delta < -0.5
                  ? "text-warn"
                  : "text-ink-3",
            )}
          >
            {Math.abs(delta) < 0.5
              ? "—"
              : `${delta > 0 ? "−" : "+"}${formatMoney(Math.abs(delta))}`}
          </span>
        </p>
        <div
          className="flex flex-col gap-1 @[36rem]:h-[150px] @[36rem]:flex-row @[36rem]:items-end @[36rem]:justify-center @[36rem]:gap-[var(--ss-gap)]"
          style={
            {
              // Labels ride on the bars: keep their columns apart at any width.
              "--ss-gap": `${Math.max(6, 44 - thickness)}px`,
            } as React.CSSProperties
          }
        >
          {bars.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 @[36rem]:h-full @[36rem]:flex-col-reverse @[36rem]:items-center @[36rem]:gap-1"
            >
              <span className="w-8 shrink-0 font-mono text-[10px] text-ink-3 uppercase @[36rem]:w-auto">
                {shortOf(b.model)}
              </span>
              <div className="relative flex min-w-0 flex-1 items-center @[36rem]:h-full @[36rem]:w-auto @[36rem]:items-end">
                <Bar
                  value={b.now / scaleMax}
                  ghost={b.today / scaleMax}
                  tone={b.tone}
                  ghostStyle={ghostStyle}
                  motionSafe={motionSafe}
                  thickness={thickness}
                  label={`${b.model?.name ?? b.id}, ${row.task.label}: ${formatMoney(b.today)} today, ${formatMoney(b.now)} projected`}
                  amount={formatMoney(b.now)}
                />
              </div>
              <span
                aria-hidden
                className="w-12 shrink-0 text-right font-mono text-[10.5px] text-ink-2 tabular-nums @[36rem]:hidden"
              >
                {formatMoney(b.now)}
              </span>
            </div>
          ))}
        </div>
        <p className="hidden truncate text-[12px] font-medium @[36rem]:block">
          {row.task.label}
        </p>
        <div className="flex w-full items-center gap-2">
          <div className="min-w-0 flex-1">
            <ShareSlider
              value={share}
              step={stepSize}
              label={`Share of ${row.task.label.toLowerCase()} moved to ${toM?.name ?? to}`}
              valueText={valueText}
              disabled={disabled || !hasTraffic}
              motionSafe={motionSafe}
              onChange={(s) => setMix({ ...mix, [row.task.id]: s })}
              onCommit={(s) => commit(row.task, s)}
            />
          </div>
          <span className="w-9 shrink-0 text-right font-mono text-[10.5px] text-ink-2 tabular-nums">
            {`${Math.round(share * 100)}%`}
          </span>
        </div>
      </div>
    );
  });

  /* -------------------------------- body -------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-hidden
        className="flex h-48 items-end justify-around gap-4 px-6 pb-4"
      >
        {[0.7, 0.2, 0.55, 0.25, 0.3, 0.45, 0.4, 0.1].map((h, i) => (
          <span
            key={i}
            className="w-6 rounded-t-2 bg-surface-2"
            style={{ height: `${h * 100}%` }}
          />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 px-3 py-6">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-danger">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          Usage couldn’t load.
        </p>
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
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (status === "insufficient") {
    const f = daysNeeded > 0 ? clamp(daysOfData / daysNeeded, 0, 1) : 0;
    body = (
      <div className="flex flex-col gap-2 px-3 py-6">
        <p className="text-[13px] font-medium">Not enough data yet</p>
        <p className="text-[12px] text-ink-3">
          {`Projections need ${daysNeeded} days of traffic; ${daysOfData} so far. Check back in ${Math.max(0, daysNeeded - daysOfData)} ${daysNeeded - daysOfData === 1 ? "day" : "days"}.`}
        </p>
        <div
          role="progressbar"
          aria-label="Days of traffic collected"
          aria-valuemin={0}
          aria-valuemax={daysNeeded}
          aria-valuenow={Math.min(daysOfData, daysNeeded)}
          className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-2"
        >
          <motion.span
            className="block h-full w-full rounded-full bg-[var(--ss-to)]"
            initial={false}
            animate={{ scaleX: r3(f) }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
            style={{ originX: 0 }}
          />
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4 px-3 @[36rem]:flex-row @[36rem]:gap-5">
        {groups}
      </div>
    );
  }

  const ready = status === "ready";
  const footer = ready ? (
    <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-3 py-2.5">
      <p className="mr-auto hidden text-[11.5px] text-ink-3 @[30rem]:block">
        Arrows move a share · R resets
      </p>
      <button
        type="button"
        onClick={reset}
        aria-disabled={changes === 0 || disabled || undefined}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
          changes === 0 && "opacity-50 hover:bg-transparent hover:text-ink-2",
          FOCUS,
        )}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Reset
      </button>
      {onCompare ? (
        <button
          type="button"
          onClick={() => onCompare(projection)}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <Columns2 aria-hidden className="size-3.5" />
          Compare
        </button>
      ) : null}
      <motion.button
        type="button"
        aria-disabled={changes === 0 || disabled || undefined}
        whileTap={motionSafe && changes > 0 ? { scale: 0.97 } : undefined}
        transition={springs.flick}
        onClick={() => {
          if (changes === 0 || disabled) return;
          onApplyMix?.(mix, projection);
          setApplied(true);
          setAnnouncement(`Mix applied. ${sentence(projection)}`);
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border px-3 text-[12px] font-medium transition-colors",
          changes > 0
            ? "border-[var(--ss-soft)] bg-[var(--ss-wash)] text-[var(--ss-ink)]"
            : "border-hairline text-ink-3 opacity-60",
          FOCUS,
        )}
      >
        <Check aria-hidden className="size-3.5" />
        {applied ? "Applied" : "Apply mix"}
      </motion.button>
    </div>
  ) : null;

  return (
    <section
      aria-labelledby={titleId}
      aria-describedby={hintId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container flex max-h-[36rem] w-full [scrollbar-width:thin] flex-col gap-4 overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
      onKeyDown={(event) => {
        if (
          (event.key === "r" || event.key === "R") &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          ready
        ) {
          event.preventDefault();
          reset();
        }
      }}
    >
      {header}
      {ready ? summary : null}
      {body}
      {footer}
      <p id={hintId} className="sr-only">
        Each share is a slider: arrows move it, Page Up and Page Down by a
        quarter, R resets every share.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
