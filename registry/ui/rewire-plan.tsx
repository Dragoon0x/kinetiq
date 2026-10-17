"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  CornerDownRight,
  GripVertical,
  Plus,
  RotateCcw,
  TriangleAlert,
  Wand2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type RewireArrowStyle = "curve" | "elbow" | "metro";
export type RewireCardStyle = "card" | "row" | "ticket";
export type RewireAccentName = "cobalt" | "plum" | "mint" | "ink";
export type RewireStatus = "ready" | "drafting" | "empty" | "error";

export type PlanStep = {
  id: string;
  title: string;
  /** Estimate in minutes. */
  minutes: number;
  /** Who runs it: a person's name, or "agent". */
  owner: string;
};

export type PlanDependency = {
  /** The step that has to run first. */
  from: string;
  /** The step that needs it. */
  to: string;
  /** Why, in a sentence: shown when the order breaks it. */
  note?: string;
};

type Async = void | Promise<unknown>;

export type RewirePlanProps = {
  /** The steps the agent proposes. @default defaultPlanSteps (a Waylight migration) */
  steps?: PlanStep[];
  /** Which steps need which. @default defaultPlanDependencies */
  dependencies?: PlanDependency[];
  /** Controlled order of step ids. */
  order?: string[];
  /** Initial order when uncontrolled. @default the steps' own order */
  defaultOrder?: string[];
  /** Fires from the drag, key or Fix order that changed it, with the new order and the step moved (null for Fix order). */
  onReorder?: (order: string[], movedId: string | null) => void;
  /** A step's title or estimate was edited. */
  onEditStep?: (step: PlanStep) => void;
  /** Add step created a step at the end; it opens for editing. */
  onAddStep?: (step: PlanStep) => void;
  /** Approve plan was pressed with the order. A promise holds the stamp until it resolves. */
  onApprove?: (order: string[]) => Async;
  /** Whether the plan exists yet. @default "ready" */
  status?: RewireStatus;
  /** Try again was pressed after the plan failed to load. */
  onRetry?: () => void;
  /** The plan's name. @default "Move orders to the new cluster" */
  title?: string;
  /** Who proposes it. @default "Waylight migration agent" */
  agent?: string;
  /** When the agent proposed the plan, in ms. @default Oct 17 2026, 13:57 UTC */
  proposedAt?: number;
  /** The moment the plan's age is counted from, in ms. @default Oct 17 2026, 14:00 UTC */
  now?: number;
  /** How dependency arrows are routed: one curve, orthogonal elbows, or metro lines with 45° turns. @default "curve" */
  arrowStyle?: RewireArrowStyle;
  /** How steps are drawn: bordered cards, flat rows, or tickets with a numbered stub. @default "card" */
  cardStyle?: RewireCardStyle;
  /** Arrows of the focused step, numbers and Approve: a named pigment or any CSS colour. @default "cobalt" */
  accent?: RewireAccentName | (string & {});
  /** Tallest the surface grows before the plan scrolls, in px. @default 560 */
  height?: number;
  /** Read only. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14, 0);
const AGENT = "agent";

export const defaultPlanSteps: PlanStep[] = [
  {
    id: "snapshot",
    title: "Snapshot the orders database",
    minutes: 15,
    owner: AGENT,
  },
  {
    id: "provision",
    title: "Provision the new cluster",
    minutes: 20,
    owner: "Ines Moreau",
  },
  {
    id: "schema",
    title: "Create the schema on the new cluster",
    minutes: 10,
    owner: AGENT,
  },
  {
    id: "copy",
    title: "Copy data with logical replication",
    minutes: 90,
    owner: AGENT,
  },
  {
    id: "verify",
    title: "Verify row counts and checksums",
    minutes: 25,
    owner: AGENT,
  },
  {
    id: "reads",
    title: "Switch read traffic",
    minutes: 10,
    owner: "Tomas Reyes",
  },
  {
    id: "writes",
    title: "Switch write traffic",
    minutes: 15,
    owner: "Tomas Reyes",
  },
  {
    id: "retire",
    title: "Retire the old cluster after 7 days",
    minutes: 10,
    owner: AGENT,
  },
];

export const defaultPlanDependencies: PlanDependency[] = [
  {
    from: "provision",
    to: "schema",
    note: "The schema needs a cluster to live on.",
  },
  {
    from: "snapshot",
    to: "copy",
    note: "Replication starts from the snapshot.",
  },
  {
    from: "schema",
    to: "copy",
    note: "The copy writes into the tables the schema makes.",
  },
  {
    from: "copy",
    to: "verify",
    note: "There is nothing to verify until the copy is done.",
  },
  {
    from: "verify",
    to: "reads",
    note: "Reads move only once the data checks out.",
  },
  {
    from: "reads",
    to: "writes",
    note: "Writes follow reads, so a rollback stays cheap.",
  },
  {
    from: "writes",
    to: "retire",
    note: "The old cluster stays until writes have settled.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const NO_STEPS: PlanStep[] = [];
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};
const depKey = (d: PlanDependency) => `${d.from}>${d.to}`;
const isAgent = (owner: string) => owner.toLowerCase() === AGENT;
const ownerName = (owner: string) => (isAgent(owner) ? "Agent" : owner);

/** The order with `id` moved to `index`. */
const moveTo = (order: string[], id: string, index: number) => {
  const rest = order.filter((x) => x !== id);
  rest.splice(clamp(index, 0, rest.length), 0, id);
  return rest;
};

/**
 * A legal order that moves as little as possible: repeatedly take the
 * earliest step (in the current order) whose prerequisites have all been
 * taken.
 */
export function fixPlanOrder(order: string[], deps: PlanDependency[]) {
  const need = new Map<string, Set<string>>();
  for (const id of order) need.set(id, new Set());
  for (const d of deps) {
    if (need.has(d.from) && need.has(d.to)) need.get(d.to)?.add(d.from);
  }
  const done = new Set<string>();
  const out: string[] = [];
  while (out.length < order.length) {
    const next =
      order.find(
        (id) =>
          !done.has(id) && [...(need.get(id) ?? [])].every((x) => done.has(x)),
      ) ?? order.find((id) => !done.has(id));
    if (!next) break;
    done.add(next);
    out.push(next);
  }
  return out;
}

/** Packs arrows into lanes: shorter spans nearest the cards, no two overlapping spans in one lane. */
function packLanes(deps: PlanDependency[], slot: Map<string, number>) {
  const spans = deps
    .map((d) => {
      const a = slot.get(d.from) ?? 0;
      const b = slot.get(d.to) ?? 0;
      return { key: depKey(d), lo: Math.min(a, b), hi: Math.max(a, b) };
    })
    .sort((x, y) => x.hi - x.lo - (y.hi - y.lo) || x.lo - y.lo);
  const lanes: { lo: number; hi: number }[][] = [];
  const out = new Map<string, number>();
  for (const s of spans) {
    let lane = lanes.findIndex((l) =>
      l.every((o) => s.hi <= o.lo || s.lo >= o.hi),
    );
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane]?.push(s);
    out.set(s.key, lane);
  }
  return { lanes: out, count: lanes.length };
}

const ACCENTS: Record<RewireAccentName, Record<string, string>> = {
  cobalt: {
    "--rp-accent": "var(--accent-bright)",
    "--rp-pigment": "oklch(from var(--accent-bright) 0.62 c h)",
    "--rp-button": "var(--primary)",
    "--rp-on": "var(--primary-foreground)",
  },
  plum: {
    "--rp-accent": "oklch(from var(--accent-bright) l c 320)",
    "--rp-pigment": "oklch(from var(--accent-bright) 0.6 c 320)",
    "--rp-button": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--rp-on": "var(--primary-foreground)",
  },
  mint: {
    "--rp-accent": "var(--success)",
    "--rp-pigment": "oklch(from var(--success) 0.7 c h)",
    "--rp-button": "oklch(from var(--success) 0.68 c h)",
    "--rp-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--rp-accent": "var(--ink-2)",
    "--rp-pigment": "oklch(from var(--ink-2) 0.5 0.02 h)",
    "--rp-button": "var(--foreground)",
    "--rp-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    ...(ACCENTS[accent as RewireAccentName] ?? {
      "--rp-accent": accent,
      "--rp-pigment": accent,
      "--rp-button": accent,
      "--rp-on": "var(--primary-foreground)",
    }),
    "--rp-wash": "color-mix(in oklab, var(--rp-accent) 12%, transparent)",
  }) as React.CSSProperties;

const CARD_H: Record<RewireCardStyle, number> = {
  card: 58,
  row: 52,
  ticket: 58,
};
const GAP: Record<RewireCardStyle, number> = { card: 8, row: 0, ticket: 8 };
const LINE_H = 18;
const NARROW = 448;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/** Motion values by key, created the first time a key is asked for. */
class ValuePool {
  private values = new Map<string, MotionValue<number>>();
  get(key: string, initial: number) {
    let v = this.values.get(key);
    if (!v) {
      v = motionValue(initial);
      this.values.set(key, v);
    }
    return v;
  }
}

/* ----------------------------------------------------------------------- */
/*                                  Arrows                                  */
/* ----------------------------------------------------------------------- */

function arrowPath(
  style: RewireArrowStyle,
  g: number,
  ys: number,
  ye: number,
  lane: number,
) {
  const f = (v: number) => r2(v);
  const head = `M ${f(g - 5.5)} ${f(ye - 3.5)} L ${f(g - 0.5)} ${f(ye)} L ${f(g - 5.5)} ${f(ye + 3.5)}`;
  const s = ye >= ys ? 1 : -1;
  const span = Math.abs(ye - ys);
  if (style === "curve") {
    // Both handles out at the lane put the curve's far point on it.
    const cx = g - ((g - lane) * 4) / 3;
    return `M ${f(g)} ${f(ys)} C ${f(cx)} ${f(ys)} ${f(cx)} ${f(ye)} ${f(g)} ${f(ye)} ${head}`;
  }
  if (style === "elbow") {
    const r = Math.min(6, span / 2);
    return [
      `M ${f(g)} ${f(ys)}`,
      `H ${f(lane + r)}`,
      `Q ${f(lane)} ${f(ys)} ${f(lane)} ${f(ys + s * r)}`,
      `V ${f(ye - s * r)}`,
      `Q ${f(lane)} ${f(ye)} ${f(lane + r)} ${f(ye)}`,
      `H ${f(g)}`,
      head,
    ].join(" ");
  }
  const c = Math.min(8, span / 2, (g - lane) * 0.8);
  return [
    `M ${f(g)} ${f(ys)}`,
    `H ${f(lane + c)}`,
    `L ${f(lane)} ${f(ys + s * c)}`,
    `V ${f(ye - s * c)}`,
    `L ${f(lane + c)} ${f(ye)}`,
    `H ${f(g)}`,
    head,
  ].join(" ");
}

function Arrow({
  from,
  to,
  lane,
  gutter,
  outAt,
  inAt,
  style,
  tone,
}: {
  from: MotionValue<number>;
  to: MotionValue<number>;
  lane: MotionValue<number>;
  gutter: number;
  outAt: number;
  inAt: number;
  style: RewireArrowStyle;
  tone: "rest" | "hot" | "back";
}) {
  const d = useTransform(
    [from, to, lane] as MotionValue<number>[],
    ([a = 0, b = 0, l = 0]: number[]) =>
      arrowPath(style, gutter, a + outAt, b + inAt, l),
  );
  const dotY = useTransform(from, (a) => r2(a + outAt));
  return (
    <g>
      <motion.path
        d={d}
        fill="none"
        strokeWidth={tone === "rest" ? 1.25 : 1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={tone === "back" ? "4 3" : undefined}
        className={cn(
          "transition-[stroke] duration-200",
          tone === "back"
            ? "stroke-danger"
            : tone === "hot"
              ? "stroke-(--rp-accent)"
              : "stroke-[color-mix(in_oklab,var(--foreground)_30%,transparent)]",
        )}
      />
      {style === "metro" ? (
        <motion.circle
          cx={gutter - 1}
          cy={dotY}
          r={2.75}
          className={cn(
            "transition-[fill] duration-200",
            tone === "back"
              ? "fill-danger"
              : tone === "hot"
                ? "fill-(--rp-accent)"
                : "fill-[color-mix(in_oklab,var(--foreground)_38%,transparent)]",
          )}
        />
      ) : null}
    </g>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Step card                                 */
/* ----------------------------------------------------------------------- */

type StepCardProps = {
  step: PlanStep;
  index: number;
  count: number;
  y: MotionValue<number>;
  lift: MotionValue<number>;
  height: number;
  left: number;
  cardStyle: RewireCardStyle;
  needs: { dep: PlanDependency; index: number; title: string; back: boolean }[];
  narrow: boolean;
  focusable: boolean;
  dragging: boolean;
  editing: boolean;
  locked: boolean;
  hintId: string;
  onFocus: () => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (vy: number) => void;
  onDragCancel: () => void;
  onTap: () => void;
  onSave: (title: string, minutes: number) => void;
  onCancelEdit: () => void;
  bindCard: (node: HTMLDivElement | null) => void;
};

function StepCard({
  step,
  index,
  count,
  y,
  lift,
  height,
  left,
  cardStyle,
  needs,
  narrow,
  focusable,
  dragging,
  editing,
  locked,
  hintId,
  onFocus,
  onKey,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  onTap,
  onSave,
  onCancelEdit,
  bindCard,
}: StepCardProps) {
  const [title, setTitle] = React.useState(step.title);
  const [minutes, setMinutes] = React.useState(String(step.minutes));
  const [seen, setSeen] = React.useState(editing);
  if (seen !== editing) {
    setSeen(editing);
    if (editing) {
      setTitle(step.title);
      setMinutes(String(step.minutes));
    }
  }
  const back = needs.filter((n) => n.back);
  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: locked || editing,
    onStart: () => onDragStart(),
    onMove: ({ offset }) => onDragMove(offset.y),
    onEnd: ({ velocity }) => onDragEnd(velocity.y),
    onCancel: onDragCancel,
    onTap: () => onTap(),
  });
  const bindTitle = React.useCallback((node: HTMLInputElement | null) => {
    if (!node) return;
    node.focus({ preventScroll: true });
    node.select();
  }, []);

  const number = (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-mono text-[11px] tabular-nums",
        cardStyle === "ticket"
          ? "h-full w-9 border-r border-dashed border-hairline-strong bg-(--rp-wash) text-(--rp-accent)"
          : "size-6 rounded-full bg-surface-2 text-ink-2",
        back.length > 0 &&
          cardStyle !== "ticket" &&
          "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
      )}
    >
      {index + 1}
    </span>
  );

  const words = `Step ${index + 1} of ${count}, ${step.title}, ${duration(step.minutes)}, ${ownerName(step.owner)}.${
    needs.length
      ? ` Needs ${needs.map((n) => `step ${n.index + 1}, ${n.title}`).join(" and ")}.`
      : ""
  }${back.length ? ` Out of order: ${back.map((n) => n.title).join(" and ")} now runs later.` : ""}`;

  return (
    <motion.li
      className="absolute top-0 right-0"
      style={{ y, left, height, zIndex: dragging ? 10 : 1 }}
      aria-posinset={index + 1}
      aria-setsize={count}
    >
      <motion.div
        ref={bindCard}
        role={editing ? undefined : "button"}
        tabIndex={editing ? -1 : focusable ? 0 : -1}
        aria-label={editing ? undefined : words}
        aria-describedby={editing ? undefined : hintId}
        aria-disabled={locked || undefined}
        onFocus={onFocus}
        onKeyDown={editing ? undefined : onKey}
        {...(editing ? {} : drag)}
        style={{ scale: lift }}
        className={cn(
          "group/rewire-plan-card relative flex h-full w-full touch-pan-y items-stretch overflow-hidden text-left select-none",
          cardStyle === "card" &&
            "rounded-3 border border-hairline bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_6%,transparent)]",
          cardStyle === "row" && "border-b border-hairline bg-card",
          cardStyle === "ticket" && "rounded-2 border border-hairline bg-card",
          back.length > 0 &&
            "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]",
          dragging &&
            "shadow-[0_14px_30px_color-mix(in_oklab,black_20%,transparent)]",
          !locked && !editing && (dragging ? "cursor-grabbing" : "cursor-grab"),
          FOCUS,
          "focus-visible:outline-offset-1",
        )}
      >
        {back.length > 0 ? (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px] bg-[oklch(from_var(--danger)_0.62_0.19_h)]"
          />
        ) : null}
        {cardStyle === "ticket" ? number : null}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col justify-center gap-1 px-3",
            narrow && needs.length ? "py-2" : "",
          )}
        >
          {editing ? (
            <form
              className="flex min-w-0 items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const n = Math.round(Number(minutes));
                onSave(
                  title.trim() || step.title,
                  Number.isFinite(n) && n > 0 ? n : step.minutes,
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  onCancelEdit();
                }
              }}
            >
              <input
                ref={bindTitle}
                aria-label="Step title"
                value={title}
                onChange={(event) => {
                  const t = event.currentTarget.value;
                  setTitle(t);
                }}
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-2 border border-(--rp-accent) bg-background px-2 text-[13px] text-foreground",
                  FOCUS,
                  "focus-visible:outline-offset-0",
                )}
              />
              <input
                aria-label="Estimate in minutes"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => {
                  const t = event.currentTarget.value.replace(/[^0-9]/g, "");
                  setMinutes(t);
                }}
                className={cn(
                  "h-8 w-12 shrink-0 rounded-2 border border-input bg-background px-2 text-right font-mono text-[12px] text-foreground tabular-nums",
                  FOCUS,
                  "focus-visible:outline-offset-0",
                )}
              />
              <span className="shrink-0 text-[11px] text-ink-3">min</span>
              <button
                type="submit"
                className={cn(
                  "inline-flex h-8 shrink-0 items-center rounded-2 bg-(--rp-button) px-2.5 text-[12px] font-medium text-(--rp-on)",
                  FOCUS,
                )}
              >
                Save
              </button>
            </form>
          ) : (
            <>
              <span className="flex min-w-0 items-center gap-2.5">
                {cardStyle !== "ticket" ? number : null}
                <span
                  className="min-w-0 flex-1 truncate text-[13px] leading-4 font-medium text-foreground"
                  title={step.title}
                >
                  {step.title}
                </span>
                {/* On touch the card scrolls the plan; the grip is the handle,
                    so it alone stops the browser from panning. */}
                <span
                  aria-hidden
                  className="-my-2 -mr-2 flex size-8 shrink-0 touch-none items-center justify-center"
                >
                  <GripVertical className="size-3.5 text-ink-3 opacity-50 transition-opacity group-hover/rewire-plan-card:opacity-100" />
                </span>
              </span>
              <span
                className={cn(
                  "flex min-w-0 items-center gap-1.5 text-[11px] leading-4",
                  cardStyle !== "ticket" && "pl-[34px]",
                )}
              >
                {back.length > 0 && !narrow ? (
                  <span className="flex min-w-0 items-center gap-1 text-danger">
                    <TriangleAlert aria-hidden className="size-3 shrink-0" />
                    <span className="truncate">
                      Needs{" "}
                      {back.map((n) => n.title.toLowerCase()).join(" and ")}{" "}
                      first
                    </span>
                  </span>
                ) : (
                  <>
                    <span className="shrink-0 font-mono text-ink-2 tabular-nums">
                      {duration(step.minutes)}
                    </span>
                    <span aria-hidden className="text-ink-3">
                      ·
                    </span>
                    <span
                      className={cn(
                        "inline-flex min-w-0 items-center gap-1",
                        isAgent(step.owner)
                          ? "text-(--rp-accent)"
                          : "text-ink-3",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-3.5 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold",
                          isAgent(step.owner)
                            ? "bg-(--rp-wash)"
                            : "bg-surface-2 text-ink-2",
                        )}
                      >
                        {ownerName(step.owner).charAt(0)}
                      </span>
                      <span className="truncate">{ownerName(step.owner)}</span>
                    </span>
                  </>
                )}
              </span>
              {narrow && needs.length > 0 ? (
                <span className="flex flex-col pl-[34px]">
                  {needs.map((n) => (
                    <span
                      key={depKey(n.dep)}
                      className={cn(
                        "flex min-w-0 items-center gap-1 text-[11px] leading-[18px]",
                        n.back ? "text-danger" : "text-ink-3",
                      )}
                    >
                      <CornerDownRight
                        aria-hidden
                        className="size-3 shrink-0"
                      />
                      <span className="truncate">
                        Needs {n.index + 1} · {n.title}
                        {n.back ? " — runs later" : ""}
                      </span>
                    </span>
                  ))}
                </span>
              ) : null}
            </>
          )}
        </div>
      </motion.div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Drag = { id: string; from: number };

/**
 * A plan an agent proposes before it starts, laid out as numbered step
 * cards in execution order with their dependency arrows in a gutter to the
 * left: each arrow leaves the step that has to run first, runs out to a lane
 * and comes back into the step that needs it. Lanes are packed so arrows
 * whose spans overlap never share one.
 *
 * The signature is the rewire. A dragged card follows the pointer 1:1,
 * lifted on `springs.flick`; the others glide out of its way on
 * `springs.glide`; every arrow touching it is rebuilt each frame from the
 * cards' motion values and the lanes re-pack on glide as the order changes.
 * An arrow that would now point backwards turns red and dashed with its
 * arrowhead climbing, and the card that needs it says why. The card lands on
 * glide with the release velocity; Approve holds until the order is legal,
 * and "Fix order" finds the legal order that moves least.
 *
 * The plan is a list of roving stops: Up and Down move, Alt with Up or Down
 * moves the step, Enter edits its title and estimate. Below 28rem the gutter
 * gives way to indented "needs" lines under each card. Under reduced motion
 * cards and lanes jump, a drag still follows the finger, and the red arrows
 * and notes still change.
 */
export function RewirePlan({
  steps: stepsProp = defaultPlanSteps,
  dependencies = defaultPlanDependencies,
  order: orderProp,
  defaultOrder,
  onReorder,
  onEditStep,
  onAddStep,
  onApprove,
  status = "ready",
  onRetry,
  title = "Move orders to the new cluster",
  agent = "Waylight migration agent",
  proposedAt = DEFAULT_NOW - 3 * MIN,
  now = DEFAULT_NOW,
  arrowStyle = "curve",
  cardStyle = "card",
  accent = "cobalt",
  height = 560,
  disabled = false,
  className,
}: RewirePlanProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const routing: RewireArrowStyle =
    arrowStyle === "elbow" || arrowStyle === "metro" ? arrowStyle : "curve";
  const look: RewireCardStyle =
    cardStyle === "row" || cardStyle === "ticket" ? cardStyle : "card";

  /* -------------------------------- steps -------------------------------- */

  const [added, setAdded] = React.useState<PlanStep[]>(NO_STEPS);
  const [edits, setEdits] = React.useState<Record<string, Partial<PlanStep>>>(
    {},
  );
  const steps = React.useMemo(
    () =>
      [...stepsProp, ...added].map((s) => ({ ...s, ...(edits[s.id] ?? {}) })),
    [stepsProp, added, edits],
  );
  const byId = React.useMemo(
    () => new Map(steps.map((s) => [s.id, s])),
    [steps],
  );

  const [ownOrder, setOwnOrder] = React.useState<string[]>(
    () => defaultOrder ?? stepsProp.map((s) => s.id),
  );
  const rawOrder = orderProp ?? ownOrder;
  // Every step appears once: unknown ids drop out, new steps join the end.
  const order = React.useMemo(() => {
    const known = rawOrder.filter(
      (id, i) => byId.has(id) && rawOrder.indexOf(id) === i,
    );
    for (const s of steps) if (!known.includes(s.id)) known.push(s.id);
    return known;
  }, [rawOrder, byId, steps]);

  const [preview, setPreview] = React.useState<string[] | null>(null);
  const shown = preview ?? order;
  const slot = React.useMemo(
    () => new Map(shown.map((id, i) => [id, i])),
    [shown],
  );
  const deps = React.useMemo(
    () => dependencies.filter((d) => byId.has(d.from) && byId.has(d.to)),
    [dependencies, byId],
  );
  const committedBackward = deps.filter(
    (d) => order.indexOf(d.to) < order.indexOf(d.from),
  );

  const [phase, setPhase] = React.useState<"plan" | "approving" | "approved">(
    "plan",
  );
  const [active, setActive] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (t: string) => setSaid((s) => ({ n: s.n + 1, text: t }));

  const ready = status === "ready" && steps.length > 0;
  const locked = disabled || !ready || phase !== "plan";
  const total = steps.reduce((a, s) => a + s.minutes, 0);

  /* ------------------------------- layout -------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => setNarrow(root.getBoundingClientRect().width < NARROW);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const H = CARD_H[look];
  const gap = GAP[look];
  const needsOf = (id: string, inOrder: string[]) =>
    deps
      .filter((d) => d.to === id)
      .map((d) => {
        const at = inOrder.indexOf(d.from);
        return {
          dep: d,
          index: at,
          title: byId.get(d.from)?.title ?? d.from,
          back: inOrder.indexOf(d.to) < at,
        };
      });
  const heightOf = (id: string) =>
    narrow ? H + deps.filter((d) => d.to === id).length * LINE_H : H;
  const topsFor = (inOrder: string[]) => {
    const tops = new Map<string, number>();
    let y = 0;
    for (const id of inOrder) {
      tops.set(id, y);
      y += heightOf(id) + gap;
    }
    return { tops, end: Math.max(0, y - gap) };
  };
  const layout = topsFor(shown);

  const { lanes, count: laneCount } = packLanes(deps, slot);
  const gutter = narrow ? 0 : clamp(26 + laneCount * 12, 46, 96);
  const laneX = (lane: number) => gutter - 14 - lane * 12;

  /* ---------------------------- motion values ---------------------------- */

  // One motion value per card position, lift and arrow lane, made on first
  // ask and kept for the component's life: a keyed pool, not React state.
  const [pool] = React.useState(() => new ValuePool());
  const running = React.useRef(new Map<string, AnimationPlaybackControls>());
  const yOf = (id: string) => pool.get(`y:${id}`, layout.tops.get(id) ?? 0);
  const liftOf = (id: string) => pool.get(`s:${id}`, 1);
  const laneOf = (key: string) =>
    pool.get(`l:${key}`, laneX(lanes.get(key) ?? 0));

  const run = (key: string, controls: AnimationPlaybackControls) => {
    running.current.get(key)?.stop();
    running.current.set(key, controls);
  };

  // Cards and lanes go where the order puts them; the dragged card stays
  // under the finger. A layout change (narrow, card style) jumps instead.
  const layoutKey = `${narrow}|${look}`;
  const seenLayout = React.useRef(layoutKey);
  const topsKey = shown.map((id) => `${id}:${layout.tops.get(id)}`).join("|");
  const lanesKey = deps
    .map((d) => `${depKey(d)}:${lanes.get(depKey(d))}`)
    .join("|");
  React.useEffect(() => {
    const jump = seenLayout.current !== layoutKey || !motionSafe;
    seenLayout.current = layoutKey;
    for (const id of shown) {
      if (drag?.id === id) continue;
      const v = yOf(id);
      const to = layout.tops.get(id) ?? 0;
      if (Math.abs(v.get() - to) < 0.5) continue;
      if (jump) {
        running.current.get(`y:${id}`)?.stop();
        v.jump(to);
      } else {
        run(`y:${id}`, animate(v, to, springs.glide));
      }
    }
    for (const d of deps) {
      const key = depKey(d);
      const v = laneOf(key);
      const to = laneX(lanes.get(key) ?? 0);
      if (Math.abs(v.get() - to) < 0.5) continue;
      if (jump) {
        running.current.get(`l:${key}`)?.stop();
        v.jump(to);
      } else {
        run(`l:${key}`, animate(v, to, springs.glide));
      }
    }
    // The keys carry every position the effect reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topsKey, lanesKey, layoutKey, gutter, motionSafe]);

  React.useEffect(() => {
    const map = running.current;
    return () => {
      for (const c of map.values()) c.stop();
      map.clear();
    };
  }, []);

  /* -------------------------------- moves -------------------------------- */

  const commitOrder = (next: string[], moved: string | null) => {
    if (orderProp === undefined) setOwnOrder(next);
    onReorder?.(next, moved);
    const back = deps.filter((d) => next.indexOf(d.to) < next.indexOf(d.from));
    const step = moved ? byId.get(moved) : null;
    say(
      `${step ? `${step.title} moved to ${next.indexOf(moved ?? "") + 1}.` : "Order fixed."} ${
        back.length === 0
          ? "Every dependency runs forwards."
          : `${plural(back.length, "dependency", "dependencies")} now ${back.length === 1 ? "runs" : "run"} backwards.`
      }`,
    );
  };

  const cardRefs = React.useRef(new Map<string, HTMLDivElement>());
  const focusReq = React.useRef<string | null>(null);
  React.useEffect(() => {
    const id = focusReq.current;
    if (!id) return;
    const node = cardRefs.current.get(id);
    if (!node) return;
    focusReq.current = null;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  });

  const dragStart = React.useRef(0);
  const onDragStart = (id: string) => {
    if (locked) return;
    running.current.get(`y:${id}`)?.stop();
    dragStart.current = yOf(id).get();
    setDrag({ id, from: order.indexOf(id) });
    setActive(id);
    run(`s:${id}`, animate(liftOf(id), motionSafe ? 1.02 : 1, springs.flick));
  };

  const onDragMove = (id: string, dy: number) => {
    const max = layout.end - heightOf(id);
    const raw = dragStart.current + dy;
    const v =
      raw < 0
        ? rubberband(raw, 80)
        : raw > max
          ? max + rubberband(raw - max, 80)
          : raw;
    yOf(id).set(r2(v));
    // The slot whose top is nearest the card's top is where it would land.
    let best = shown.indexOf(id);
    let bestD = Infinity;
    for (let k = 0; k < shown.length; k += 1) {
      const t = topsFor(moveTo(shown, id, k)).tops.get(id) ?? 0;
      const dd = Math.abs(t - v);
      if (dd < bestD) {
        bestD = dd;
        best = k;
      }
    }
    if (shown.indexOf(id) !== best) setPreview(moveTo(shown, id, best));
  };

  const onDragEnd = (id: string, vy: number) => {
    const next = preview ?? order;
    const v = yOf(id);
    const landing = project(v.get(), vy, 0.99);
    // A throw can carry one slot further than the finger.
    let target = next;
    const here = next.indexOf(id);
    const t = topsFor(next).tops.get(id) ?? 0;
    if (Math.abs(landing - t) > (H + gap) * 0.75) {
      target = moveTo(next, id, here + Math.sign(landing - t));
    }
    const to = topsFor(target).tops.get(id) ?? 0;
    run(
      `y:${id}`,
      animate(
        v,
        to,
        motionSafe ? { ...springs.glide, velocity: vy } : { duration: 0 },
      ),
    );
    run(`s:${id}`, animate(liftOf(id), 1, springs.flick));
    setDrag(null);
    setPreview(null);
    if (target.join("|") !== order.join("|")) commitOrder(target, id);
  };

  const onDragCancel = (id: string) => {
    setDrag(null);
    setPreview(null);
    run(`s:${id}`, animate(liftOf(id), 1, springs.flick));
    run(
      `y:${id}`,
      animate(yOf(id), topsFor(order).tops.get(id) ?? 0, springs.glide),
    );
  };

  const onCardKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    const at = order.indexOf(id);
    const go = (i: number) => {
      const target = order[clamp(i, 0, order.length - 1)];
      if (!target) return;
      setActive(target);
      cardRefs.current.get(target)?.focus({ preventScroll: true });
      cardRefs.current.get(target)?.scrollIntoView({ block: "nearest" });
    };
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      if (locked) return;
      const to = clamp(
        at + (event.key === "ArrowUp" ? -1 : 1),
        0,
        order.length - 1,
      );
      if (to === at) return;
      commitOrder(moveTo(order, id, to), id);
      focusReq.current = id;
      return;
    }
    switch (event.key) {
      case "Enter":
      case " ":
        event.preventDefault();
        startEdit(id);
        return;
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(at - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(order.length - 1);
        return;
      default:
    }
  };

  const startEdit = (id: string) => {
    if (locked) return;
    setEditing(id);
  };

  const saveEdit = (id: string, newTitle: string, minutes: number) => {
    const step = byId.get(id);
    setEditing(null);
    focusReq.current = id;
    if (!step) return;
    if (step.title === newTitle && step.minutes === minutes) return;
    setEdits((e) => ({ ...e, [id]: { title: newTitle, minutes } }));
    onEditStep?.({ ...step, title: newTitle, minutes });
    say(`Saved: ${newTitle}, ${duration(minutes)}.`);
  };

  const addStep = () => {
    if (locked) return;
    let n = added.length + 1;
    while (byId.has(`${uid}-new-${n}`)) n += 1;
    const step: PlanStep = {
      id: `${uid}-new-${n}`,
      title: "New step",
      minutes: 15,
      owner: AGENT,
    };
    setAdded((a) => [...a, step]);
    if (orderProp === undefined) setOwnOrder((o) => [...o, step.id]);
    onAddStep?.(step);
    setEditing(step.id);
    setActive(step.id);
    say("New step added at the end. Name it and press Enter.");
  };

  const fixOrder = () => {
    if (locked) return;
    const fixed = fixPlanOrder(order, deps);
    commitOrder(fixed, null);
  };

  // A decision removes the button that made it; focus waits on the region
  // rather than falling to the page.
  const parkFocus = () => {
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };

  const approve = () => {
    if (locked) return;
    if (committedBackward.length > 0) {
      say(
        `Fix the order first: ${plural(committedBackward.length, "dependency", "dependencies")} run backwards.`,
      );
      return;
    }
    setError(null);
    const result = onApprove?.(order);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPhase("approving");
      (result as Promise<unknown>).then(
        () => {
          parkFocus();
          setPhase("approved");
          say(`Plan approved: ${plural(order.length, "step")}.`);
        },
        (why: unknown) => {
          setPhase("plan");
          setError(
            why instanceof Error && why.message
              ? why.message
              : "The plan was not approved.",
          );
        },
      );
    } else {
      parkFocus();
      setPhase("approved");
      say(`Plan approved: ${plural(order.length, "step")}.`);
    }
  };

  /* -------------------------------- render ------------------------------- */

  const button = cn(
    "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium whitespace-nowrap transition-[background-color,color,opacity]",
    FOCUS,
  );
  const quiet = cn(
    button,
    "border border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
  );

  const activeId = active && byId.has(active) ? active : order[0];
  const hotId = drag?.id ?? activeId;
  const invalid = committedBackward.length > 0;

  const pill =
    phase === "approved"
      ? { text: "Approved", dot: "bg-success" }
      : invalid
        ? { text: "Out of order", dot: "bg-danger" }
        : { text: "Draft", dot: "bg-warn" };

  const ago = Math.max(0, Math.round((now - proposedAt) / MIN));

  const plan = (
    <div className="relative px-4 py-4" style={{ height: layout.end + 32 }}>
      {!narrow ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute top-4 left-4 overflow-visible"
          width={gutter}
          height={Math.max(1, layout.end)}
        >
          {deps.map((d) => {
            const key = depKey(d);
            const back = (slot.get(d.to) ?? 0) < (slot.get(d.from) ?? 0);
            const hot = hotId === d.from || hotId === d.to;
            return (
              <Arrow
                key={key}
                from={yOf(d.from)}
                to={yOf(d.to)}
                lane={laneOf(key)}
                gutter={gutter}
                outAt={Math.round(H * 0.64)}
                inAt={Math.round(H * 0.36)}
                style={routing}
                tone={back ? "back" : hot ? "hot" : "rest"}
              />
            );
          })}
        </svg>
      ) : null}
      <ol
        aria-labelledby={titleId}
        className="absolute inset-x-4 top-4"
        style={{ height: layout.end }}
      >
        {shown.map((id, index) => {
          const step = byId.get(id);
          if (!step) return null;
          return (
            <StepCard
              key={id}
              step={step}
              index={index}
              count={shown.length}
              y={yOf(id)}
              lift={liftOf(id)}
              height={heightOf(id)}
              left={gutter}
              cardStyle={look}
              needs={needsOf(id, shown)}
              narrow={narrow}
              focusable={id === activeId}
              dragging={drag?.id === id}
              editing={editing === id}
              locked={locked}
              hintId={hintId}
              onFocus={() => setActive(id)}
              onKey={(event) => onCardKey(event, id)}
              onDragStart={() => onDragStart(id)}
              onDragMove={(dy) => onDragMove(id, dy)}
              onDragEnd={(vy) => onDragEnd(id, vy)}
              onDragCancel={() => onDragCancel(id)}
              onTap={() => startEdit(id)}
              onSave={(t, m) => saveEdit(id, t, m)}
              onCancelEdit={() => {
                setEditing(null);
                focusReq.current = id;
              }}
              bindCard={(node) => {
                if (node) cardRefs.current.set(id, node);
                else cardRefs.current.delete(id);
              }}
            />
          );
        })}
      </ol>
    </div>
  );

  const skeleton = (
    <div aria-busy="true" className="flex flex-col gap-2 px-4 py-4">
      <p className="text-[12px] text-ink-3">Drafting the plan…</p>
      {[72, 54, 80, 62, 48].map((w, i) => (
        <div key={i} aria-hidden className="flex items-center gap-3">
          <span className="h-10 w-8 shrink-0 rounded-full border-l-2 border-dashed border-hairline-strong" />
          <span className="flex h-12 flex-1 items-center gap-3 rounded-3 border border-hairline px-3 motion-safe:animate-pulse">
            <span className="size-6 shrink-0 rounded-full bg-surface-2" />
            <span
              className="h-2.5 rounded-full bg-surface-2"
              style={{ width: `${w}%` }}
            />
          </span>
        </div>
      ))}
    </div>
  );

  const stateView =
    status === "drafting" ? (
      skeleton
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px]">The plan did not load.</p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className={quiet}>
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-1 px-6 py-12 text-center">
        <p className="text-[13px] text-ink-2">No plan yet.</p>
        <p className="text-[12px] text-ink-3">
          The agent proposes one before it starts.
        </p>
      </div>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      tabIndex={-1}
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-surface-1 text-foreground outline-none",
        disabled && "opacity-80",
        className,
      )}
      style={{ maxHeight: height, ...accentVars(accent) }}
    >
      <header className="relative flex shrink-0 flex-wrap items-start gap-x-3 gap-y-1.5 border-b border-hairline bg-card px-4 py-3">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--rp-wash) text-[12px] font-semibold text-(--rp-accent)"
        >
          {agent.charAt(0)}
        </span>
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <h2 id={titleId} className="text-[14px] leading-5 font-semibold">
            {title}
          </h2>
          <p className="truncate text-[11px] leading-4 text-ink-3">
            {agent} · proposed {ago} min ago
            {ready
              ? ` · ${plural(steps.length, "step")} · ${duration(total)}`
              : ""}
          </p>
        </div>
        {ready ? (
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 text-[11px] text-ink-2">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", pill.dot)}
            />
            {pill.text}
          </span>
        ) : null}
        <AnimatePresence>
          {phase === "approved" ? (
            <motion.span
              key="stamp"
              aria-hidden
              className="pointer-events-none absolute top-2.5 right-24 rounded-2 border-2 border-(--rp-accent) bg-[color-mix(in_oklab,var(--card)_86%,transparent)] px-2.5 py-1 font-mono text-[12px] font-semibold tracking-[0.12em] text-(--rp-accent) uppercase @max-[28rem]:top-12 @max-[28rem]:right-4"
              initial={
                motionSafe
                  ? { opacity: 0, scale: 1.3, rotate: -10 }
                  : { opacity: 0, rotate: -6 }
              }
              animate={{ opacity: 1, scale: 1, rotate: -6 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={
                motionSafe
                  ? {
                      scale: springs.recoil,
                      rotate: springs.recoil,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.base }
              }
            >
              Approved
            </motion.span>
          ) : null}
        </AnimatePresence>
      </header>

      <AnimatePresence initial={false}>
        {ready && invalid && phase === "plan" ? (
          <motion.div
            key="problems"
            className="shrink-0 overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: exitFor() }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.base },
                  }
                : { duration: 0 }
            }
          >
            <div
              role="alert"
              className="flex flex-wrap items-start gap-x-3 gap-y-2 border-b border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_6%,transparent)] px-4 py-2.5"
            >
              <div className="flex min-w-0 flex-1 basis-60 items-start gap-2">
                <TriangleAlert
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-danger"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-[12px] leading-4 font-medium">
                    {plural(committedBackward.length, "step")}{" "}
                    {committedBackward.length === 1 ? "runs" : "run"} before
                    what{" "}
                    {committedBackward.length === 1 ? "it needs" : "they need"}.
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {committedBackward.map((d) => (
                      <li
                        key={depKey(d)}
                        className="text-[11px] leading-4 text-ink-2"
                      >
                        {`${byId.get(d.to)?.title ?? d.to} runs before ${(byId.get(d.from)?.title ?? d.from).toLowerCase()}.`}
                        {d.note ? (
                          <span className="text-ink-3">{` ${d.note}`}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                type="button"
                onClick={fixOrder}
                aria-disabled={locked || undefined}
                className={cn(quiet, "h-7 bg-card px-2.5 text-[11px]")}
              >
                <Wand2 aria-hidden className="size-3" />
                Fix order
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {ready ? plan : stateView}
      </div>

      {ready ? (
        <footer className="flex shrink-0 flex-col border-t border-hairline bg-card">
          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 px-4 pt-3 text-[12px] leading-4 text-danger"
            >
              <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <button
              type="button"
              onClick={addStep}
              aria-disabled={locked || undefined}
              className={quiet}
            >
              <Plus aria-hidden className="size-3.5" />
              Add step
            </button>
            <span className="hidden font-mono text-[11px] text-ink-3 tabular-nums @min-[28rem]:inline">
              {duration(total)} in all
            </span>
            {phase === "approved" ? (
              <span className="ml-auto text-[12px] text-ink-2">
                Approved. The agent starts with step 1.
              </span>
            ) : (
              <button
                type="button"
                onClick={approve}
                aria-disabled={locked || invalid || undefined}
                aria-busy={phase === "approving" || undefined}
                aria-describedby={invalid ? `${uid}-why` : undefined}
                className={cn(
                  button,
                  "ml-auto bg-(--rp-button) text-(--rp-on)",
                  locked || invalid
                    ? "cursor-not-allowed opacity-50"
                    : "hover:opacity-90",
                )}
              >
                {phase === "approving" ? "Approving…" : "Approve plan"}
              </button>
            )}
            {invalid ? (
              <span id={`${uid}-why`} className="sr-only">
                The order breaks{" "}
                {plural(committedBackward.length, "dependency", "dependencies")}
                .
              </span>
            ) : null}
          </div>
        </footer>
      ) : null}

      <p id={hintId} className="sr-only">
        Up and Down move between steps. Alt with Up or Down moves the step.
        Enter edits it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
