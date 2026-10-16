"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  ChevronLeft,
  Flag,
  RotateCcw,
  TriangleAlert,
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

export type ForkWizardOption = {
  value: string;
  label: string;
  /** One line under the label. */
  hint?: string;
  /** The step this choice leads to. */
  next: string;
};

export type ForkWizardField = {
  label: string;
  placeholder?: string;
  /** Printed after the field, e.g. "%". */
  suffix?: string;
  required?: boolean;
  /** Return a sentence saying what is wrong, or null. */
  validate?: (text: string) => string | null;
};

export type ForkWizardStep = {
  id: string;
  /** The step's question or heading. */
  title: string;
  /** Its name on the map and in the review. */
  short: string;
  /** One line of guidance under the title. */
  body?: string;
  /** A fork, a single field, or the review that finishes. */
  kind: "choice" | "field" | "end";
  options?: ForkWizardOption[];
  field?: ForkWizardField;
  /** Where a field step goes next. */
  next?: string;
};

export type ForkWizardGraph = { start: string; steps: ForkWizardStep[] };

/** Step id → the chosen option's value, or the field's text. */
export type ForkWizardAnswers = Record<string, string>;

export type ForkWizardMapPosition = "corner" | "top" | "side";
export type ForkWizardDensity = "compact" | "regular" | "roomy";
export type ForkWizardStatus = "ready" | "loading" | "error";

export type ForkWizardProps = {
  /** The steps and where each choice leads. @default defaultForkWizardGraph */
  graph?: ForkWizardGraph;
  /** Controlled answers. */
  value?: ForkWizardAnswers;
  /** Initial answers when uncontrolled; answers off the path are kept. @default defaultForkWizardAnswers */
  defaultValue?: ForkWizardAnswers;
  /** Fires from the choice, keystroke or field that changed an answer. */
  onValueChange?: (answers: ForkWizardAnswers) => void;
  /** Controlled step id. */
  step?: string;
  /** The step to open on when uncontrolled. @default the first unanswered step on the path */
  defaultStep?: string;
  /** Fires from Next, Back or the map with the step asked for. */
  onStepChange?: (stepId: string) => void;
  /** Fires when an option is chosen, with the step, the option and every answer. */
  onChoose?: (
    stepId: string,
    value: string,
    answers: ForkWizardAnswers,
  ) => void;
  /** Fires when the visitor goes back, from Back or the map. */
  onBack?: (fromId: string, toId: string) => void;
  /** Fires from Finish with the answers on the path and the path's ids. */
  onFinish?: (answers: ForkWizardAnswers, path: string[]) => void;
  /** Where the map sits: a card in the corner, a band on top, or a column at the side. @default "corner" */
  mapPosition?: ForkWizardMapPosition;
  /** Padding, gaps and type size. @default "regular" */
  density?: ForkWizardDensity;
  /** The lit branch, the dot, rings and the primary button — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long the dot takes along a branch, in ms; 0 rides the glide spring. @default 0 */
  travelDuration?: number;
  /** The wizard's heading. @default "Add a sensor" */
  title?: string;
  /** One line under the heading. @default "Gaugeworks · Pump house 3" */
  subtitle?: string;
  /** Whether the steps have arrived. @default "ready" */
  status?: ForkWizardStatus;
  /** "Try again" was pressed after the steps failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px; the panel scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be chosen or finished. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Adding a level sensor to a Gaugeworks pump house: mains or battery, wired or not. */
export const defaultForkWizardGraph: ForkWizardGraph = {
  start: "power",
  steps: [
    {
      id: "power",
      short: "Power",
      title: "How is the sensor powered?",
      body: "It decides how it connects and how often it can report.",
      kind: "choice",
      options: [
        {
          value: "mains",
          label: "Mains",
          hint: "A socket within two metres",
          next: "link",
        },
        {
          value: "battery",
          label: "Battery",
          hint: "Two AA cells, no cables",
          next: "interval",
        },
      ],
    },
    {
      id: "link",
      short: "Connection",
      title: "How will it connect?",
      kind: "choice",
      options: [
        {
          value: "wired",
          label: "Ethernet",
          hint: "Any spare port; it finds the hub itself",
          next: "name",
        },
        {
          value: "wifi",
          label: "Wi-Fi",
          hint: "The site network, 2.4 GHz",
          next: "network",
        },
      ],
    },
    {
      id: "network",
      short: "Network",
      title: "Which network should it join?",
      body: "The password is sent from the hub, not typed here.",
      kind: "field",
      field: {
        label: "Network name",
        placeholder: "e.g. pumphouse-ops",
        required: true,
      },
      next: "name",
    },
    {
      id: "interval",
      short: "Reporting",
      title: "How often should it report?",
      kind: "choice",
      options: [
        {
          value: "5m",
          label: "Every 5 minutes",
          hint: "Batteries last about four months",
          next: "low",
        },
        {
          value: "1h",
          label: "Every hour",
          hint: "Batteries last about a year",
          next: "low",
        },
      ],
    },
    {
      id: "low",
      short: "Battery alert",
      title: "When should we warn you about the battery?",
      kind: "field",
      field: {
        label: "Warn below",
        placeholder: "20",
        suffix: "%",
        required: true,
        validate: (text) => {
          const n = Number(text);
          return Number.isFinite(n) && n >= 5 && n <= 50
            ? null
            : "Choose a level from 5 to 50 percent.";
        },
      },
      next: "name",
    },
    {
      id: "name",
      short: "Name",
      title: "What should we call it?",
      body: "This is how it appears on the pump house dashboard.",
      kind: "field",
      field: {
        label: "Sensor name",
        placeholder: "e.g. Wet well level",
        required: true,
      },
      next: "review",
    },
    {
      id: "review",
      short: "Review",
      title: "Check and add the sensor",
      kind: "end",
    },
  ],
};

/** Mains chosen; the connection is next. */
export const defaultForkWizardAnswers: ForkWizardAnswers = { power: "mains" };

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Number(v.toFixed(3));
const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const DENSITY: Record<
  ForkWizardDensity,
  { px: string; py: string; gap: string; card: string; body: string }
> = {
  compact: {
    px: "px-3",
    py: "py-2.5",
    gap: "gap-1.5",
    card: "px-2.5 py-2",
    body: "text-[12px] leading-[18px]",
  },
  regular: {
    px: "px-4",
    py: "py-3",
    gap: "gap-2",
    card: "px-3 py-2.5",
    body: "text-[13px] leading-5",
  },
  roomy: {
    px: "px-5",
    py: "py-4",
    gap: "gap-3",
    card: "px-3.5 py-3.5",
    body: "text-sm leading-6",
  },
};

type StepMap = Map<string, ForkWizardStep>;

/** Where a step leads, given an answer (a choice's option, a field's next). */
function nextOf(step: ForkWizardStep, answer: string | undefined) {
  if (step.kind === "end") return null;
  if (step.kind === "field") return step.next ?? null;
  if (answer === undefined) return undefined;
  return step.options?.find((o) => o.value === answer)?.next ?? null;
}

/** Each edge once, even when two options of a fork lead to the same step. */
function edgesOf(steps: ForkWizardStep[]): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string) => {
    const key = `${from}>${to}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from, to });
  };
  for (const s of steps) {
    if (s.kind === "choice") for (const o of s.options ?? []) add(s.id, o.next);
    else if (s.kind === "field" && s.next) add(s.id, s.next);
  }
  return out;
}

/** The path as answered: from the start, following each answer, to the first unanswered step or the end. */
function walk(map: StepMap, start: string, answers: ForkWizardAnswers) {
  const path: string[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = start;
  while (id && !seen.has(id)) {
    const step = map.get(id);
    if (!step) break;
    seen.add(id);
    path.push(id);
    if (step.kind === "field" && !(answers[id] ?? "").trim()) break;
    const next = nextOf(step, answers[id]);
    if (next === undefined || next === null) break;
    id = next;
  }
  return path;
}

/** Fewest and most steps left after `from` (counting the end), forks still open. */
function remaining(
  map: StepMap,
  from: string,
  answers: ForkWizardAnswers,
  stack = new Set<string>(),
): [number, number] {
  const step = map.get(from);
  if (!step || step.kind === "end" || stack.has(from)) return [0, 0];
  stack.add(from);
  let targets: string[] = [];
  if (step.kind === "field") targets = step.next ? [step.next] : [];
  else {
    const chosen = nextOf(step, answers[from]);
    targets = chosen ? [chosen] : (step.options ?? []).map((o) => o.next);
  }
  let lo = Infinity;
  let hi = 0;
  for (const t of targets) {
    const [a, b] = remaining(map, t, answers, stack);
    lo = Math.min(lo, a + 1);
    hi = Math.max(hi, b + 1);
  }
  stack.delete(from);
  return targets.length ? [lo, hi] : [0, 0];
}

/** Every step reachable from `from` along any edge. */
function reachable(map: StepMap, from: string): Set<string> {
  const out = new Set<string>();
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    if (!id || out.has(id)) continue;
    out.add(id);
    const s = map.get(id);
    if (!s) continue;
    if (s.kind === "choice")
      for (const o of s.options ?? []) queue.push(o.next);
    else if (s.kind === "field" && s.next) queue.push(s.next);
  }
  return out;
}

type Point = { x: number; y: number };
type Layout = {
  width: number;
  height: number;
  pos: Map<string, Point>;
  /** Each step's column, so neighbouring labels can alternate sides. */
  depth: Map<string, number>;
  vertical: boolean;
};

/**
 * Columns by depth (the longest way in from the start), lanes in the order
 * a walk through the options meets them, each column spread evenly over the
 * tallest one, so forks open symmetrically and merges close.
 */
function layoutGraph(
  graph: ForkWizardGraph,
  map: StepMap,
  vertical: boolean,
  gaps: { depth: number; lane: number; pad: number },
): Layout {
  const depth = new Map<string, number>();
  const order: string[] = [];
  const visit = (id: string, d: number, stack: Set<string>) => {
    if (stack.has(id)) return;
    if ((depth.get(id) ?? -1) >= d) return;
    if (!depth.has(id)) order.push(id);
    depth.set(id, d);
    const s = map.get(id);
    if (!s) return;
    stack.add(id);
    const outs =
      s.kind === "choice"
        ? (s.options ?? []).map((o) => o.next)
        : s.kind === "field" && s.next
          ? [s.next]
          : [];
    for (const t of outs) visit(t, d + 1, stack);
    stack.delete(id);
  };
  visit(graph.start, 0, new Set());
  const columns = new Map<number, string[]>();
  for (const id of order) {
    const d = depth.get(id) ?? 0;
    columns.set(d, [...(columns.get(d) ?? []), id]);
  }
  const maxDepth = Math.max(0, ...columns.keys());
  const tallest = Math.max(1, ...[...columns.values()].map((c) => c.length));
  const pos = new Map<string, Point>();
  for (const [d, ids] of columns) {
    ids.forEach((id, k) => {
      const along = gaps.pad + d * gaps.depth;
      const across = gaps.pad + ((k + 0.5) / ids.length) * tallest * gaps.lane;
      pos.set(
        id,
        vertical
          ? { x: r3(across), y: r3(along) }
          : { x: r3(along), y: r3(across) },
      );
    });
  }
  const long = gaps.pad * 2 + maxDepth * gaps.depth;
  const wide = gaps.pad * 2 + tallest * gaps.lane;
  return {
    width: vertical ? wide : long,
    height: vertical ? long : wide,
    pos,
    depth,
    vertical,
  };
}

type Curve = [Point, Point, Point, Point];

function curveOf(a: Point, b: Point, vertical: boolean): Curve {
  if (vertical) {
    const m = (b.y - a.y) / 2;
    return [a, { x: a.x, y: a.y + m }, { x: b.x, y: b.y - m }, b];
  }
  const m = (b.x - a.x) / 2;
  return [a, { x: a.x + m, y: a.y }, { x: b.x - m, y: b.y }, b];
}

const pathD = ([a, c1, c2, b]: Curve) =>
  `M ${r3(a.x)} ${r3(a.y)} C ${r3(c1.x)} ${r3(c1.y)} ${r3(c2.x)} ${r3(c2.y)} ${r3(b.x)} ${r3(b.y)}`;

function along([a, c1, c2, b]: Curve, t: number): Point {
  const u = 1 - t;
  return {
    x: r3(
      u * u * u * a.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t * t * t * b.x,
    ),
    y: r3(
      u * u * u * a.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t * t * t * b.y,
    ),
  };
}

/** An answer as words: the option's label, or the field's text with its suffix. */
function answerText(step: ForkWizardStep, answer: string | undefined) {
  if (step.kind === "choice")
    return step.options?.find((o) => o.value === answer)?.label;
  const text = answer?.trim();
  return text ? `${text}${step.field?.suffix ?? ""}` : undefined;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
const leftText = ([lo, hi]: [number, number]) =>
  hi === 0
    ? "Last step"
    : lo === hi
      ? `${plural(lo, "step", "steps")} left`
      : `${lo}–${hi} steps left`;

/* ----------------------------------------------------------------------- */
/*                                  The map                                 */
/* ----------------------------------------------------------------------- */

type NodeState = "done" | "here" | "ahead" | "open" | "out";

type MapModel = {
  graph: ForkWizardGraph;
  map: StepMap;
  edges: { from: string; to: string }[];
  path: string[];
  cursor: string;
  state: (id: string) => NodeState;
  edgeState: (from: string, to: string) => "lit" | "open" | "out";
  travel: { from: string; to: string; n: number } | null;
  navigable: string[];
  answers: ForkWizardAnswers;
};

/** The travelling dot and the stroke it draws behind it, both derived from one value. */
function Travel({ curve, t }: { curve: Curve; t: MotionValue<number> }) {
  const cx = useTransform(
    t,
    (v) => along(curve, Math.min(1, Math.max(0, v))).x,
  );
  const cy = useTransform(
    t,
    (v) => along(curve, Math.min(1, Math.max(0, v))).y,
  );
  const shown = useTransform(t, (v) => (v > 0.001 && v < 0.999 ? 1 : 0));
  return (
    <>
      <motion.path
        d={pathD(curve)}
        fill="none"
        className="stroke-(--fw-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ pathLength: t }}
      />
      <motion.circle
        r={3.5}
        cx={cx}
        cy={cy}
        className="fill-(--fw-accent)"
        style={{ opacity: shown }}
      />
    </>
  );
}

function StepMapView({
  model,
  layout,
  labels,
  motionSafe,
  armed,
  t,
  onGo,
  uid,
  disabled,
}: {
  model: MapModel;
  layout: Layout;
  /** Name every step, or only the steps on the path. */
  labels: "all" | "path";
  motionSafe: boolean;
  armed: boolean;
  t: MotionValue<number>;
  onGo: (id: string) => void;
  uid: string;
  disabled: boolean;
}) {
  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const { pos } = layout;
  const travelling = model.travel;

  const onKeyDown = (event: React.KeyboardEvent, id: string) => {
    const list = model.navigable;
    const at = list.indexOf(id);
    const map: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowDown: at + 1,
      ArrowLeft: at - 1,
      ArrowUp: at - 1,
      Home: 0,
      End: list.length - 1,
    };
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = list[Math.min(list.length - 1, Math.max(0, to))];
    if (next) refs.current.get(next)?.focus();
  };

  return (
    <div
      className="relative mx-auto max-w-full"
      style={{ width: layout.width }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="block h-auto w-full overflow-visible"
      >
        {model.edges.map(({ from, to }) => {
          const a = pos.get(from);
          const b = pos.get(to);
          if (!a || !b) return null;
          const st = model.edgeState(from, to);
          const isTravel =
            st === "lit" &&
            travelling !== null &&
            travelling.from === from &&
            travelling.to === to;
          const curve = curveOf(a, b, layout.vertical);
          return (
            <g key={`${from}>${to}`}>
              <path
                d={pathD(curve)}
                fill="none"
                strokeWidth={st === "lit" ? 2 : 1.25}
                strokeLinecap="round"
                strokeDasharray={st === "out" ? "2 3" : undefined}
                className={cn(
                  "transition-[opacity,stroke] duration-300",
                  st === "lit" && !isTravel
                    ? "stroke-(--fw-accent)"
                    : "stroke-hairline-strong",
                  st === "out" && "opacity-50",
                )}
              />
              {isTravel ? <Travel curve={curve} t={t} /> : null}
            </g>
          );
        })}
        {[...pos.entries()].map(([id, p]) => {
          const st = model.state(id);
          const step = model.map.get(id);
          const end = step?.kind === "end";
          const size = st === "here" ? 5 : 4.5;
          return (
            <g
              key={id}
              className={cn(
                "transition-opacity duration-300",
                st === "out" && "opacity-35",
              )}
            >
              {st === "here" ? (
                <motion.circle
                  key={`ring-${model.cursor}`}
                  cx={p.x}
                  cy={p.y}
                  fill="none"
                  strokeWidth={1.5}
                  className="stroke-(--fw-accent)"
                  initial={armed && motionSafe ? { r: 2, opacity: 0 } : false}
                  animate={{ r: 9, opacity: 0.55 }}
                  transition={
                    motionSafe
                      ? {
                          r: springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: 0 }
                  }
                />
              ) : null}
              {end ? (
                <rect
                  x={r3(p.x - size)}
                  y={r3(p.y - size)}
                  width={size * 2}
                  height={size * 2}
                  rx={2}
                  strokeWidth={1.25}
                  strokeDasharray={st === "out" ? "2 2" : undefined}
                  className={cn(
                    "transition-[fill,stroke] duration-300",
                    st === "done" || st === "here"
                      ? "fill-(--fw-accent) stroke-(--fw-accent)"
                      : st === "ahead"
                        ? "fill-card stroke-(--fw-accent)"
                        : "fill-card stroke-hairline-strong",
                  )}
                />
              ) : (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={size}
                  strokeWidth={1.25}
                  strokeDasharray={st === "out" ? "2 2" : undefined}
                  className={cn(
                    "transition-[fill,stroke] duration-300",
                    st === "done" || st === "here"
                      ? "fill-(--fw-accent) stroke-(--fw-accent)"
                      : st === "ahead"
                        ? "fill-card stroke-(--fw-accent)"
                        : "fill-card stroke-[color-mix(in_oklab,var(--foreground)_35%,transparent)]",
                  )}
                />
              )}
              {labels === "all" ||
              st === "done" ||
              st === "here" ||
              st === "ahead" ? (
                <text
                  x={p.x}
                  y={
                    layout.vertical
                      ? p.y + 3
                      : (layout.depth.get(id) ?? 0) % 2 === 1
                        ? p.y - 11
                        : p.y + 17
                  }
                  dx={layout.vertical ? 12 : 0}
                  textAnchor={layout.vertical ? "start" : "middle"}
                  className={cn(
                    "font-mono text-[8.5px] tracking-[0.04em]",
                    st === "here"
                      ? "fill-foreground font-medium"
                      : st === "out"
                        ? "fill-ink-3"
                        : "fill-ink-2",
                  )}
                >
                  {step?.short ?? id}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <ol aria-label="Steps you can go to" className="contents">
        {model.navigable.map((id) => {
          const p = pos.get(id);
          const step = model.map.get(id);
          if (!p || !step) return null;
          const here = id === model.cursor;
          const answer = model.answers[id];
          const said =
            step.kind === "choice"
              ? step.options?.find((o) => o.value === answer)?.label
              : answer?.trim() || undefined;
          return (
            <li key={id}>
              <button
                ref={(el) => {
                  refs.current.set(id, el);
                }}
                id={`${uid}-node-${id}`}
                type="button"
                tabIndex={here ? 0 : -1}
                aria-current={here ? "step" : undefined}
                aria-disabled={disabled || undefined}
                aria-label={`${step.short}${said ? `: ${said}` : ""}${here ? ", current step" : ""}`}
                title={step.short}
                onClick={() => {
                  if (!disabled) onGo(id);
                }}
                onKeyDown={(event) => onKeyDown(event, id)}
                className={cn(
                  "absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full",
                  FOCUS,
                )}
                style={{
                  left: `${r3((p.x / layout.width) * 100)}%`,
                  top: `${r3((p.y / layout.height) * 100)}%`,
                }}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The narrow map: the path as a line of dots, with a mark where another branch leaves. */
function ProgressLine({
  model,
  left,
  beyond,
  onGo,
  disabled,
}: {
  model: MapModel;
  left: [number, number];
  /** The fewest steps still unseen past the end of the answered path. */
  beyond: number;
  onGo: (id: string) => void;
  disabled: boolean;
}) {
  const at = model.path.indexOf(model.cursor);
  const total = model.path.length + beyond;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <ol
        aria-label="Steps you can go to"
        className="flex min-w-0 flex-1 items-center"
      >
        {model.path.map((id, i) => {
          const step = model.map.get(id);
          const here = id === model.cursor;
          const fork = step?.kind === "choice";
          const can = model.navigable.includes(id);
          const dot = (
            <span className="relative flex size-4 items-center justify-center">
              {fork ? (
                <svg
                  aria-hidden
                  viewBox="0 0 8 8"
                  className="absolute -top-1.5 -right-1.5 size-2 stroke-ink-3"
                  fill="none"
                  strokeWidth={1.2}
                  strokeLinecap="round"
                >
                  <path d="M0.8 7.2 L6.4 1.6" />
                  <circle cx="6.6" cy="1.4" r="1" className="fill-ink-3" />
                </svg>
              ) : null}
              <span
                className={cn(
                  "block rounded-full transition-colors",
                  here
                    ? "size-3 border-2 border-(--fw-accent) bg-card"
                    : i < at
                      ? "size-2 bg-(--fw-accent)"
                      : "size-2 border border-(--fw-accent) bg-card",
                )}
              />
            </span>
          );
          return (
            <li
              key={id}
              className={cn(
                "flex min-w-0 items-center",
                i < total - 1 ? "flex-1" : "flex-none",
              )}
            >
              {can && !here ? (
                <button
                  type="button"
                  aria-label={`Go to ${step?.short ?? id}`}
                  aria-disabled={disabled || undefined}
                  onClick={() => {
                    if (!disabled) onGo(id);
                  }}
                  className={cn("rounded-full", FOCUS)}
                >
                  {dot}
                </button>
              ) : (
                <span aria-current={here ? "step" : undefined}>
                  <span className="sr-only">{`${step?.short ?? id}${here ? ", current step" : ""}`}</span>
                  <span aria-hidden>{dot}</span>
                </span>
              )}
              {i < total - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-0.5 h-px min-w-1.5 flex-1",
                    i < at ? "bg-(--fw-accent)" : "bg-hairline-strong",
                  )}
                />
              ) : null}
            </li>
          );
        })}
        {Array.from({ length: beyond }, (_, k) => (
          <li
            key={`more-${k}`}
            aria-hidden
            className={cn(
              "flex min-w-0 items-center",
              k < beyond - 1 ? "flex-1" : "flex-none",
            )}
          >
            <span className="flex size-4 items-center justify-center">
              <span className="block size-2 rounded-full border border-dashed border-ink-3" />
            </span>
            {k < beyond - 1 ? (
              <span className="mx-0.5 h-px min-w-1.5 flex-1 border-t border-dashed border-hairline-strong" />
            ) : null}
          </li>
        ))}
      </ol>
      <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
        {leftText(left)}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors";
const PRIMARY =
  "bg-(--fw-solid) text-primary-foreground hover:bg-(--fw-solid)/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-(--fw-solid)";
const QUIET =
  "border border-input bg-surface-1 text-foreground hover:bg-surface-2";

/** True from the frame after the first commit: what arrives later animates in. */
function useCommitted(): boolean {
  const [committed, setCommitted] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setCommitted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return committed;
}

/**
 * A branching wizard with a map of every step. The map lays the graph out
 * by depth, forks opening and merges closing, and choosing an option lights
 * its branch: a dot travels the curve to the next step on `springs.glide`
 * while the lit stroke draws behind it, every step the choice rules out
 * fades to a dashed ghost, and the count of steps left updates — a range
 * while later forks are still open. The arriving step's ring lands on
 * `recoil`. The map doubles as navigation: reached steps are buttons with
 * roving focus, and answers are kept, so going back and forward costs
 * nothing until a choice changes.
 *
 * Choice steps are radio cards (arrows move and select, Home and End jump),
 * each saying how many steps it leads to; field steps are labelled inputs
 * validated on Next. In a narrow container the map becomes a progress line
 * with a mark at each fork. Under reduced motion the branch lights at once,
 * ruled-out steps dim at once and panels cross-fade.
 */
export function ForkWizard({
  graph = defaultForkWizardGraph,
  value,
  defaultValue = defaultForkWizardAnswers,
  onValueChange,
  step,
  defaultStep,
  onStepChange,
  onChoose,
  onBack,
  onFinish,
  mapPosition = "corner",
  density = "regular",
  accent = "var(--accent-bright)",
  travelDuration = 0,
  title = "Add a sensor",
  subtitle = "Gaugeworks · Pump house 3",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: ForkWizardProps) {
  const motionSafe = useMotionSafe();
  const armed = useCommitted();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;

  const map = React.useMemo(
    () => new Map(graph.steps.map((s) => [s.id, s])),
    [graph.steps],
  );
  const edges = React.useMemo(() => edgesOf(graph.steps), [graph.steps]);

  const [own, setOwn] = React.useState<ForkWizardAnswers>(defaultValue);
  const answers = value ?? own;
  const path = walk(map, graph.start, answers);
  const frontier = path[path.length - 1] ?? graph.start;
  const [ownCursor, setOwnCursor] = React.useState<string>(
    () =>
      defaultStep ??
      walk(map, graph.start, value ?? defaultValue).slice(-1)[0] ??
      graph.start,
  );
  const wanted = step ?? ownCursor;
  // A cursor the path no longer reaches falls back to the frontier.
  const cursor = path.includes(wanted) ? wanted : frontier;
  const cursorStep = map.get(cursor);
  const at = path.indexOf(cursor);

  const [shown, setShown] = React.useState({ id: cursor, dir: 1 });
  if (shown.id !== cursor) {
    const before = path.indexOf(shown.id);
    setShown({ id: cursor, dir: before === -1 || at >= before ? 1 : -1 });
  }
  const [travel, setTravel] = React.useState<{
    from: string;
    to: string;
    n: number;
  } | null>(null);
  const [attempted, setAttempted] = React.useState<string | null>(null);
  const [finished, setFinished] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const wantFocus = React.useRef(false);
  const t = useMotionValue(1);
  const travelCtl = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => travelCtl.current?.stop(), []);

  const say = (text: string) => setAnnouncement(text);
  // Until the steps arrive there is no map to show and nowhere to go.
  const ready = status === "ready";

  /* ------------------------------ derived ------------------------------- */

  const open = reachable(map, frontier);
  const onPath = new Set(path);
  const stateOf = (id: string): NodeState => {
    if (id === cursor) return "here";
    const i = path.indexOf(id);
    if (i !== -1) return i < at ? "done" : "ahead";
    return open.has(id) ? "open" : "out";
  };
  const edgeState = (from: string, to: string): "lit" | "open" | "out" => {
    const s = map.get(from);
    if (!s) return "out";
    if (onPath.has(from)) {
      const chosen = nextOf(s, answers[from]);
      if (chosen === to && onPath.has(to)) return "lit";
      if (chosen === undefined && from === frontier) return "open";
      if (chosen && chosen !== to) return "out";
      if (from === frontier) return "open";
    }
    return open.has(from) && open.has(to) ? "open" : "out";
  };
  const left = remaining(map, cursor, answers);
  const model: MapModel = {
    graph,
    map,
    edges,
    path,
    cursor,
    state: stateOf,
    edgeState,
    travel,
    navigable: path,
    answers,
  };

  /* ------------------------------ handlers ------------------------------ */

  const goTo = (id: string, why: "next" | "back" | "map") => {
    if (id === cursor) return;
    const target = map.get(id);
    if (!target) return;
    wantFocus.current = why !== "map";
    if (step === undefined) setOwnCursor(id);
    setAttempted(null);
    onStepChange?.(id);
    if (path.indexOf(id) < at) onBack?.(cursor, id);
    say(`${target.short}. ${leftText(remaining(map, id, answers))}.`);
  };

  const choose = (option: ForkWizardOption) => {
    if (disabled || finished || !cursorStep) return;
    if (answers[cursor] === option.value) return;
    const next = { ...answers, [cursor]: option.value };
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    onChoose?.(cursor, option.value, next);
    const n = (travel?.n ?? 0) + 1;
    setTravel({ from: cursor, to: option.next, n });
    travelCtl.current?.stop();
    if (motionSafe) {
      t.jump(0);
      travelCtl.current = animate(
        t,
        1,
        travelDuration > 0
          ? { duration: travelDuration / 1000, ease: easings.move }
          : springs.glide,
      );
    } else t.jump(1);
    const target = map.get(option.next);
    say(
      `${option.label}. Leads to ${target?.short ?? "the next step"}; ${leftText(
        remaining(map, cursor, next),
      ).toLowerCase()}.`,
    );
  };

  const writeField = (text: string) => {
    if (disabled || finished) return;
    const next = { ...answers, [cursor]: text };
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const problemOf = (s: ForkWizardStep | undefined): string | null => {
    if (!s) return null;
    if (s.kind === "choice")
      return answers[s.id] === undefined
        ? "Choose one to see where it leads."
        : null;
    if (s.kind === "field") {
      const text = (answers[s.id] ?? "").trim();
      if (!text)
        return s.field?.required
          ? `Enter the ${s.field.label.toLowerCase()}.`
          : null;
      return s.field?.validate?.(text) ?? null;
    }
    return null;
  };

  const next = () => {
    if (disabled || !ready || !cursorStep) return;
    if (cursorStep.kind === "end") {
      if (finished) return;
      setFinished(true);
      say(`${title}: done. ${path.length} steps.`);
      const kept: ForkWizardAnswers = {};
      for (const id of path)
        if (answers[id] !== undefined) kept[id] = answers[id] ?? "";
      onFinish?.(kept, path);
      return;
    }
    const problem = problemOf(cursorStep);
    if (problem) {
      setAttempted(cursor);
      say(problem);
      return;
    }
    const to = nextOf(cursorStep, answers[cursor]);
    if (to) goTo(to, "next");
  };

  const back = () => {
    if (disabled || !ready) return;
    const prev = path[at - 1];
    if (prev) goTo(prev, "back");
  };

  const headingRef = React.useCallback((node: HTMLHeadingElement | null) => {
    if (node && wantFocus.current) {
      wantFocus.current = false;
      node.focus({ preventScroll: true });
    }
  }, []);

  /* ------------------------------ the panel ----------------------------- */

  const optionRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const optionKeys = (event: React.KeyboardEvent, index: number) => {
    const options = cursorStep?.options ?? [];
    const n = options.length;
    const map2: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowRight: index + 1,
      ArrowUp: index - 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: n - 1,
    };
    const to = map2[event.key];
    if (to === undefined || n === 0) return;
    event.preventDefault();
    const option = options[((to % n) + n) % n];
    if (!option) return;
    optionRefs.current.get(option.value)?.focus();
    choose(option);
  };

  const problem = attempted === cursor ? problemOf(cursorStep) : null;
  const problemId = `${uid}-problem`;

  const choiceStep = cursorStep?.kind === "choice" ? cursorStep : null;
  const chosenHere = choiceStep ? answers[choiceStep.id] : undefined;
  const tabbableHere = chosenHere ?? choiceStep?.options?.[0]?.value;
  const choicePanel = choiceStep ? (
    <div
      role="radiogroup"
      aria-labelledby={`${uid}-h-${choiceStep.id}`}
      aria-describedby={problem ? problemId : undefined}
      className={cn("grid @min-[30rem]/fork-wizard:grid-cols-2", d.gap)}
    >
      {(choiceStep.options ?? []).map((o, i) => {
        const checked = o.value === chosenHere;
        const leads = remaining(map, choiceStep.id, {
          ...answers,
          [choiceStep.id]: o.value,
        });
        return (
          <button
            key={o.value}
            ref={(el) => {
              optionRefs.current.set(o.value, el);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled || finished || undefined}
            tabIndex={o.value === tabbableHere ? 0 : -1}
            onClick={() => choose(o)}
            onKeyDown={(event) => optionKeys(event, i)}
            className={cn(
              "relative flex w-full items-start gap-3 rounded-3 border text-left transition-colors",
              d.card,
              FOCUS,
              checked
                ? "border-transparent bg-(--fw-wash)"
                : "border-hairline bg-surface-1 hover:border-hairline-strong hover:bg-surface-2",
            )}
          >
            {checked ? (
              <motion.span
                layoutId={`${uid}-${choiceStep.id}-ring`}
                aria-hidden
                className="pointer-events-none absolute -inset-px rounded-3 border-2 border-(--fw-accent)"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                checked ? "border-(--fw-accent)" : "border-hairline-strong",
              )}
            >
              {checked ? (
                <motion.span
                  className="size-2 rounded-full bg-(--fw-accent)"
                  initial={motionSafe ? { scale: 0.3 } : false}
                  animate={{ scale: 1 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
            </span>
            <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium text-foreground">{o.label}</span>
              {o.hint ? (
                <span className="text-[11px] leading-4 text-ink-3">
                  {o.hint}
                </span>
              ) : null}
              <span className="mt-1 font-mono text-[10px] tracking-[0.04em] text-ink-3">
                → {map.get(o.next)?.short ?? o.next} ·{" "}
                {leftText(leads).toLowerCase()}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  ) : null;

  const fieldStep = cursorStep?.kind === "field" ? cursorStep : null;
  const fieldPanel = fieldStep ? (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={`${uid}-f-${fieldStep.id}`}
        className="text-[12px] font-medium text-ink-2"
      >
        {fieldStep.field?.label ?? fieldStep.short}
      </label>
      <div className="flex max-w-xs items-center gap-2">
        <input
          id={`${uid}-f-${fieldStep.id}`}
          value={answers[fieldStep.id] ?? ""}
          placeholder={fieldStep.field?.placeholder}
          readOnly={disabled || finished}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          onChange={(event) => {
            const text = event.currentTarget.value;
            writeField(text);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              next();
            }
          }}
          className={cn(
            "h-9 min-w-0 flex-1 rounded-2 border bg-surface-0 px-3 text-foreground placeholder:text-ink-3",
            "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
            problem ? "border-danger" : "border-input",
          )}
        />
        {fieldStep.field?.suffix ? (
          <span className="text-ink-2">{fieldStep.field.suffix}</span>
        ) : null}
      </div>
    </div>
  ) : null;

  const endPanel = (
    <div className="flex flex-col gap-3">
      <dl className="flex flex-col divide-y divide-hairline rounded-3 border border-hairline">
        {path
          .filter((id) => map.get(id)?.kind !== "end")
          .map((id) => {
            const s = map.get(id);
            if (!s) return null;
            const a = answers[id];
            const said =
              s.kind === "choice"
                ? (s.options?.find((o) => o.value === a)?.label ?? "—")
                : a?.trim()
                  ? `${a.trim()}${s.field?.suffix ?? ""}`
                  : "—";
            return (
              <div key={id} className="flex items-center gap-3 px-3 py-2">
                <dt className="w-24 shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                  {s.short}
                </dt>
                <dd className="min-w-0 flex-1 truncate text-foreground">
                  {said}
                </dd>
                <button
                  type="button"
                  onClick={() => {
                    if (!finished) goTo(id, "back");
                  }}
                  aria-label={`Change ${s.short.toLowerCase()}`}
                  aria-disabled={finished || disabled || undefined}
                  className={cn(
                    "-my-1 inline-flex h-7 shrink-0 items-center rounded-2 px-2 text-[12px] font-medium text-(--fw-accent) transition-colors hover:bg-(--fw-wash) aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
                    FOCUS,
                  )}
                >
                  Change
                </button>
              </div>
            );
          })}
      </dl>
      {finished ? (
        <p className="flex items-center gap-2 text-[12px] text-foreground">
          <motion.span
            aria-hidden
            className="inline-flex size-5 items-center justify-center rounded-full bg-(--fw-wash) text-(--fw-accent)"
            initial={motionSafe ? { scale: 0.4 } : false}
            animate={{ scale: 1 }}
            transition={motionSafe ? springs.recoil : { duration: 0 }}
          >
            <Check className="size-3" />
          </motion.span>
          Added to {subtitle.split("·").slice(-1)[0]?.trim() || "the site"} ·{" "}
          {path.length} steps on this path
        </p>
      ) : (
        <p className="text-[12px] text-ink-3">
          {path.length - 1} answers on this path. Nothing is added until you
          finish.
        </p>
      )}
    </div>
  );

  // The answers behind you, each a way back.
  const soFar =
    at > 0 && cursorStep?.kind !== "end" ? (
      <div className="flex flex-col gap-1.5 border-t border-hairline pt-3">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          So far
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {path.slice(0, at).map((id) => {
            const s = map.get(id);
            if (!s) return null;
            const said = answerText(s, answers[id]) ?? "—";
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    if (!disabled) goTo(id, "back");
                  }}
                  aria-label={`Back to ${s.short.toLowerCase()}: ${said}`}
                  aria-disabled={disabled || undefined}
                  className={cn(
                    "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 text-[12px] transition-colors hover:border-(--fw-accent) hover:bg-(--fw-wash)",
                    FOCUS,
                  )}
                >
                  <span className="shrink-0 text-ink-3">{s.short}</span>
                  <span className="truncate text-foreground">{said}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  const body =
    status === "loading" ? (
      <div aria-busy="true" className={cn("flex flex-col gap-2", d.px, d.py)}>
        <p className="sr-only">Loading the steps.</p>
        {[0, 1, 2].map((i) => (
          <span key={i} aria-hidden className="h-14 rounded-3 bg-surface-2" />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The steps did not load.</p>
        <p className="max-w-xs text-[12px] text-ink-3">
          Your answers are kept. Try again in a moment.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(BUTTON, QUIET, FOCUS)}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : cursorStep ? (
      <AnimatePresence initial={false} mode="popLayout" custom={shown.dir}>
        <motion.section
          key={cursor}
          custom={shown.dir}
          aria-labelledby={`${uid}-h-${cursor}`}
          variants={{
            enter: (dir: number) => ({
              opacity: 0,
              x: motionSafe ? dir * distances.shift : 0,
            }),
            shown: { opacity: 1, x: 0 },
            leave: (dir: number) => ({
              opacity: 0,
              x: motionSafe ? -dir * distances.shift : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? {
                  x: springs.glide,
                  opacity: { duration: durations.base, ease: easings.enter },
                }
              : { duration: durations.fast }
          }
          className={cn("flex w-full flex-col gap-3", d.px, d.py)}
        >
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {cursorStep.kind === "end" ? (
                <Flag aria-hidden className="size-3" />
              ) : null}
              Step {at + 1}
            </span>
            <h3
              ref={headingRef}
              id={`${uid}-h-${cursor}`}
              tabIndex={-1}
              className="rounded-1 text-[15px] leading-6 font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              {cursorStep.title}
            </h3>
            {cursorStep.body ? (
              <p className="text-[12px] leading-4 text-ink-3">
                {cursorStep.body}
              </p>
            ) : null}
          </div>
          {cursorStep.kind === "choice"
            ? choicePanel
            : cursorStep.kind === "field"
              ? fieldPanel
              : endPanel}
          {soFar}
        </motion.section>
      </AnimatePresence>
    ) : null;

  /* ------------------------------ the maps ------------------------------ */

  const layouts = React.useMemo(
    () => ({
      corner: layoutGraph(graph, map, false, { depth: 50, lane: 32, pad: 18 }),
      top: layoutGraph(graph, map, false, { depth: 92, lane: 20, pad: 16 }),
      side: layoutGraph(graph, map, true, { depth: 50, lane: 30, pad: 16 }),
    }),
    [graph, map],
  );
  const mapView = (where: ForkWizardMapPosition) => (
    <StepMapView
      model={model}
      layout={layouts[where]}
      labels={where === "top" ? "all" : "path"}
      motionSafe={motionSafe}
      armed={armed}
      t={t}
      onGo={(id) => goTo(id, "map")}
      uid={`${uid}-${where}`}
      disabled={disabled}
    />
  );

  const nextLabel =
    cursorStep?.kind === "end"
      ? finished
        ? "Added"
        : "Add sensor"
      : cursorStep?.kind === "choice" && answers[cursor] !== undefined
        ? `Next: ${map.get(nextOf(cursorStep, answers[cursor]) ?? "")?.short ?? "Next"}`
        : "Next";

  const wide = "hidden @min-[34rem]/fork-wizard:flex";

  return (
    <div
      role="region"
      aria-label={title}
      className={cn(
        "@container/fork-wizard flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        d.body,
        className,
      )}
      style={
        {
          height,
          "--fw-accent": accent,
          "--fw-wash": `color-mix(in oklab, ${accent} 11%, transparent)`,
          "--fw-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline py-3",
          d.px,
        )}
      >
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-ink-3">{subtitle}</p>
        </div>
        <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums @min-[34rem]/fork-wizard:inline">
          {!ready ? "" : finished ? "Finished" : leftText(left)}
        </span>
      </header>

      {/* Narrow: the map becomes a line of the path with marks at its forks. */}
      {ready ? (
        <nav
          aria-label="Steps map"
          className={cn(
            "shrink-0 border-b border-hairline py-2.5 @min-[34rem]/fork-wizard:hidden",
            d.px,
          )}
        >
          <ProgressLine
            model={model}
            left={left}
            beyond={remaining(map, frontier, answers)[0]}
            onGo={(id) => goTo(id, "map")}
            disabled={disabled}
          />
        </nav>
      ) : null}

      {ready && mapPosition === "top" ? (
        <nav
          aria-label="Steps map"
          className={cn(
            "shrink-0 justify-center border-b border-hairline bg-surface-1 py-2",
            wide,
            d.px,
          )}
        >
          {mapView("top")}
        </nav>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        {ready && mapPosition === "side" ? (
          <nav
            aria-label="Steps map"
            className={cn(
              "w-[10.5rem] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-hairline bg-surface-1 py-3",
              wide,
            )}
          >
            {mapView("side")}
          </nav>
        ) : null}
        <div className="relative flex flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          <div className="relative min-w-0 flex-1">{body}</div>
          {ready && mapPosition === "corner" ? (
            <nav
              aria-label="Steps map"
              className={cn(
                "sticky top-0 mt-3 mr-3 w-[16rem] shrink-0 flex-col gap-1.5 self-start rounded-3 border border-hairline bg-surface-1 px-2 pt-2 pb-2.5",
                wide,
              )}
            >
              {mapView("corner")}
              <p className="px-1 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                <span className="text-foreground">
                  {`${at + 1 + left[0]}${left[1] !== left[0] ? `–${at + 1 + left[1]}` : ""}`}{" "}
                  steps
                </span>{" "}
                on this path
              </p>
            </nav>
          ) : null}
        </div>
      </div>

      <footer
        className={cn(
          "flex shrink-0 flex-col gap-2 border-t border-hairline py-3",
          d.px,
        )}
      >
        {problem ? (
          <p
            id={problemId}
            className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-danger"
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            <span className="min-w-0">{problem}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={back}
            aria-disabled={disabled || !ready || at <= 0 || undefined}
            className={cn(
              BUTTON,
              "px-2 text-ink-2 hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-3.5" />
            Back
          </button>
          <button
            type="button"
            onClick={next}
            aria-disabled={
              disabled ||
              !ready ||
              (cursorStep?.kind === "end" && finished) ||
              undefined
            }
            aria-describedby={problem ? problemId : undefined}
            className={cn(BUTTON, PRIMARY, FOCUS)}
          >
            {cursorStep?.kind === "end" ? (
              finished ? (
                <Check aria-hidden className="size-3.5" />
              ) : (
                <Flag aria-hidden className="size-3.5" />
              )
            ) : null}
            {nextLabel}
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
