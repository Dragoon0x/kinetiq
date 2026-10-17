"use client";

import * as React from "react";

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Check, Plus, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type GoalBloomStatus =
  "todo" | "active" | "done" | "blocked" | "planning";

export type GoalBloomNode = {
  id: string;
  /** The node this one serves, or null for a sub-goal of the goal itself. */
  parent: string | null;
  title: string;
  /** A short label for the bloom's pills (about ten characters). @default the title */
  short?: string;
  /** A node with children takes its status from them; a leaf says its own. @default "todo" */
  status?: GoalBloomStatus;
  owner?: string;
  /** One line of context, shown in the detail panel. */
  note?: string;
};

export type GoalBloomGoal = {
  title: string;
  /** What the centre disc says. @default the title */
  short?: string;
  note?: string;
};

export type GoalBloomPetalShape = "leaf" | "round" | "wedge";
export type GoalBloomPlanStatus = "ready" | "planning" | "blocked" | "loading";

export type GoalBloomProps = {
  /** The goal at the centre. @default defaultGoalBloomGoal */
  goal?: GoalBloomGoal;
  /** Sub-goals and steps as one flat list linked by `parent`. @default defaultGoalBloomNodes */
  nodes?: GoalBloomNode[];
  /** How many rings to draw, 1 to 3. @default 2 */
  depth?: number;
  /** The plan as a whole: ready, still being planned, blocked, or loading. @default "ready" */
  status?: GoalBloomPlanStatus;
  /** Controlled selected node id; null is the goal. */
  selected?: string | null;
  /** Initial selection when uncontrolled. @default null */
  defaultSelected?: string | null;
  /** Fires from the click or key that moved the selection, with the node id (null for the goal). */
  onSelectNode?: (id: string | null) => void;
  /** "Add a step" was pressed under a node (null: a new sub-goal of the goal). */
  onAddSubgoal?: (parentId: string | null) => void;
  /** "Approve plan" was pressed. */
  onApprove?: () => void;
  /** Every petal, outline and fill: a pointed leaf, a blunt round petal, or a wedge. @default "leaf" */
  petalShape?: GoalBloomPetalShape;
  /** Units between rings, 40 to 76 (the bloom is 400 units across). @default 64 */
  ringGap?: number;
  /** Petals, active nodes and Approve — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Bloom out of the centre the first time the plan is seen. @default true */
  intro?: boolean;
  /** The plan's name. @default "Store opening plan" */
  title?: string;
  /** Who it is for, shown above the title. @default "Coldbrook · Larch Street" */
  product?: string;
  /** The tree's accessible name. @default the title */
  label?: string;
  /** Read only: nothing can be added or approved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultGoalBloomGoal: GoalBloomGoal = {
  title: "Open Coldbrook on Larch Street",
  short: "Larch St. opening",
  note: "Doors open Saturday 1 November at 7:00.",
};

/** Coldbrook's Larch Street opening, as the agent planned it. */
export const defaultGoalBloomNodes: GoalBloomNode[] = [
  {
    id: "permits",
    parent: null,
    title: "Permits and inspections",
    short: "Permits",
    owner: "Ines",
  },
  {
    id: "signage",
    parent: "permits",
    title: "File the signage permit",
    status: "done",
    owner: "Agent",
  },
  {
    id: "fire",
    parent: "permits",
    title: "Pass the fire inspection",
    status: "done",
    owner: "Ines",
  },
  {
    id: "health",
    parent: "permits",
    title: "Get the health certificate",
    status: "done",
    owner: "Ines",
  },
  {
    id: "fitout",
    parent: null,
    title: "Fit-out",
    short: "Fit-out",
    owner: "Tomas",
  },
  {
    id: "bar",
    parent: "fitout",
    title: "Install the espresso bar",
    status: "done",
    owner: "Tomas",
  },
  {
    id: "office",
    parent: "fitout",
    title: "Wire the back office",
    status: "active",
    owner: "Tomas",
    note: "The electrician is on site Tuesday.",
  },
  {
    id: "paint",
    parent: "fitout",
    title: "Paint and hang the sign",
    status: "todo",
    owner: "Tomas",
  },
  {
    id: "hiring",
    parent: null,
    title: "Hiring and training",
    short: "Hiring",
    owner: "Mara",
  },
  {
    id: "lead",
    parent: "hiring",
    title: "Hire a shift lead",
    status: "done",
    owner: "Mara",
  },
  {
    id: "baristas",
    parent: "hiring",
    title: "Hire two baristas",
    status: "active",
    owner: "Mara",
  },
  {
    id: "training",
    parent: "hiring",
    title: "Run training week",
    status: "todo",
    owner: "Mara",
  },
  {
    id: "stock",
    parent: null,
    title: "Stock and suppliers",
    short: "Stock",
    owner: "Joel",
  },
  {
    id: "roaster",
    parent: "stock",
    title: "Sign the roaster contract",
    status: "blocked",
    owner: "Joel",
    note: "Waiting on a revised price sheet.",
  },
  {
    id: "order",
    parent: "stock",
    title: "Order opening stock",
    status: "todo",
    owner: "Agent",
  },
  {
    id: "launch",
    parent: null,
    title: "Launch week",
    short: "Launch",
    owner: "Priya",
  },
  {
    id: "soft",
    parent: "launch",
    title: "Plan the soft opening",
    status: "todo",
    owner: "Priya",
  },
  {
    id: "neighbours",
    parent: "launch",
    title: "Invite the neighbours",
    status: "todo",
    owner: "Agent",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Geometry                                 */
/* ----------------------------------------------------------------------- */

/** The bloom is drawn in a 400-unit square; everything scales with its box. */
const S = 400;
const C = S / 2;
const R0 = 48;
const TAU = Math.PI * 2;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pct = (u: number) => `${r3((u / S) * 100)}%`;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Radii = { r1: number; r2: number; r3: number; fold: number; tip: number };

function radiiFor(gap: number, depth: number): Radii {
  const g = clamp(gap, 40, 76);
  const raw1 = R0 + g;
  const raw2 = raw1 + g * 0.9;
  const raw3 = raw2 + g * 0.72;
  const deepest = depth >= 3 ? raw3 : depth === 2 ? raw2 : raw1 + g * 0.5;
  const maxR = C - 20;
  const k = deepest > maxR ? (maxR - R0) / (deepest - R0) : 1;
  const r1 = R0 + (raw1 - R0) * k;
  const rr2 = R0 + (raw2 - R0) * k;
  const rr3 = R0 + (raw3 - R0) * k;
  const tip = r1 + g * 0.42 * k;
  return { r1, r2: rr2, r3: rr3, tip, fold: R0 + 4 + (tip - R0 - 4) * 0.5 };
}

/** Where an angle sits on the clock face from twelve, 0 to TAU, safe from float dust. */
const clockOf = (a: number) => (((a + Math.PI / 2 + 1e-6) % TAU) + TAU) % TAU;

/** Local petal coordinates (u along the ray, v across it) to the page. */
const at = (a: number, u: number, v: number) =>
  `${r2(C + u * Math.cos(a) - v * Math.sin(a))} ${r2(C + u * Math.sin(a) + v * Math.cos(a))}`;
const polar = (a: number, r: number) =>
  `${r2(C + r * Math.cos(a))} ${r2(C + r * Math.sin(a))}`;

/** One petal on the ray `a`, grown to `t` of its length (0 is a seed, 1 full). */
function petalPath(
  shape: GoalBloomPetalShape,
  a: number,
  t: number,
  sector: number,
  tip: number,
): string {
  const u0 = R0 + 4;
  const full = Math.max(8, tip - u0);
  const grow = Math.max(0, t);
  if (grow < 0.005) return "";
  const L = full * grow;
  const half = (sector / 2) * 0.8;
  if (shape === "wedge") {
    const phi = half * (0.55 + 0.45 * Math.min(1, grow));
    const outer = u0 + L;
    const large = 0;
    return [
      `M ${polar(a - phi, u0)}`,
      `L ${polar(a - phi, outer)}`,
      `A ${r2(outer)} ${r2(outer)} 0 ${large} 1 ${polar(a + phi, outer)}`,
      `L ${polar(a + phi, u0)}`,
      `A ${r2(u0)} ${r2(u0)} 0 ${large} 0 ${polar(a - phi, u0)}`,
      "Z",
    ].join(" ");
  }
  const mid = u0 + full * 0.55;
  const hw =
    Math.min(full * 0.46, mid * Math.sin(Math.min(half, 1.2)) * 0.92) *
    (0.35 + 0.65 * Math.min(1, grow));
  if (shape === "round") {
    return [
      `M ${at(a, u0, 0)}`,
      `C ${at(a, u0 + L * 0.16, hw)} ${at(a, u0 + L * 0.5, hw)} ${at(a, u0 + L * 0.78, hw * 0.9)}`,
      `C ${at(a, u0 + L * 1.03, hw * 0.72)} ${at(a, u0 + L * 1.03, -hw * 0.72)} ${at(a, u0 + L * 0.78, -hw * 0.9)}`,
      `C ${at(a, u0 + L * 0.5, -hw)} ${at(a, u0 + L * 0.16, -hw)} ${at(a, u0, 0)}`,
      "Z",
    ].join(" ");
  }
  return [
    `M ${at(a, u0, 0)}`,
    `C ${at(a, u0 + L * 0.18, hw * 0.95)} ${at(a, u0 + L * 0.6, hw * 1.08)} ${at(a, u0 + L, 0)}`,
    `C ${at(a, u0 + L * 0.6, -hw * 1.08)} ${at(a, u0 + L * 0.18, -hw * 0.95)} ${at(a, u0, 0)}`,
    "Z",
  ].join(" ");
}

/** The goal's progress ring: an arc from twelve o'clock, `p` of the way round. */
function arcPath(p: number, r: number): string {
  const f = clamp(p, 0, 1);
  if (f <= 0.001) return "";
  if (f >= 0.999) {
    return `M ${polar(-Math.PI / 2, r)} A ${r} ${r} 0 1 1 ${polar(Math.PI / 2, r)} A ${r} ${r} 0 1 1 ${polar(-Math.PI / 2, r)}`;
  }
  const end = -Math.PI / 2 + f * TAU;
  return `M ${polar(-Math.PI / 2, r)} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${polar(end, r)}`;
}

/* ----------------------------------------------------------------------- */
/*                                  Layout                                  */
/* ----------------------------------------------------------------------- */

type Placed = {
  node: GoalBloomNode;
  depth: number;
  status: GoalBloomStatus;
  /** Target angle and radius, and the parent's (where the connector starts). */
  a: number;
  r: number;
  o: number;
  pa: number;
  pr: number;
  /** A finished sub-goal, folded into its petal. */
  folded: boolean;
  /** Folded away inside a finished branch: drawn at zero opacity, not focusable. */
  hidden: boolean;
  children: string[];
  /** Position among its siblings, for aria-setsize and aria-posinset. */
  pos: number;
  siblings: number;
  /** Index of its sub-goal, for the bloom's cascade. */
  branch: number;
  sector: number;
};

function derivedStatus(
  id: string,
  byId: Map<string, GoalBloomNode>,
  kids: Map<string | null, GoalBloomNode[]>,
): GoalBloomStatus {
  const node = byId.get(id);
  if (!node) return "todo";
  if (node.status === "planning") return "planning";
  const children = kids.get(id) ?? [];
  if (children.length === 0) return node.status ?? "todo";
  const states = children.map((c) => derivedStatus(c.id, byId, kids));
  if (states.every((s) => s === "done")) return "done";
  if (states.some((s) => s === "blocked")) return "blocked";
  if (states.some((s) => s === "active" || s === "done")) return "active";
  if (states.some((s) => s === "planning")) return "planning";
  return node.status ?? "todo";
}

function layoutBloom(
  nodes: GoalBloomNode[],
  depth: number,
  radii: Radii,
): Map<string, Placed> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map<string | null, GoalBloomNode[]>();
  for (const n of nodes) {
    const key = n.parent !== null && byId.has(n.parent) ? n.parent : null;
    const list = kids.get(key) ?? [];
    list.push(n);
    kids.set(key, list);
  }
  const out = new Map<string, Placed>();
  const ring1 = kids.get(null) ?? [];
  const sector = ring1.length ? TAU / ring1.length : TAU;
  const radius = [0, radii.r1, radii.r2, radii.r3];

  const place = (
    node: GoalBloomNode,
    d: number,
    a: number,
    span: number,
    parent: Placed | null,
    pos: number,
    siblings: number,
    branch: number,
  ) => {
    const status = derivedStatus(node.id, byId, kids);
    const children = (kids.get(node.id) ?? []).filter(() => d < depth);
    const folded = d === 1 && status === "done" && children.length > 0;
    const insideFold = parent !== null && (parent.folded || parent.hidden);
    const r = folded ? radii.fold : (radius[d] ?? radii.r2);
    const placed: Placed = {
      node,
      depth: d,
      status,
      a: insideFold ? parent.a : a,
      r: insideFold ? parent.r : r,
      o: insideFold ? 0 : 1,
      pa: parent ? parent.a : a,
      pr: parent ? parent.r : R0,
      folded,
      hidden: insideFold,
      children: children.map((c) => c.id),
      pos,
      siblings,
      branch,
      sector,
    };
    out.set(node.id, placed);
    const m = children.length;
    const step =
      m > 1 ? Math.min((span * 0.82) / (m - 1), d === 1 ? 0.42 : 0.2) : 0;
    children.forEach((child, j) => {
      place(
        child,
        d + 1,
        a + (j - (m - 1) / 2) * step,
        Math.max(step, 0.16),
        placed,
        j + 1,
        m,
        branch,
      );
    });
  };

  ring1.forEach((n, i) =>
    place(
      n,
      1,
      -Math.PI / 2 + i * sector,
      sector,
      null,
      i + 1,
      ring1.length,
      i,
    ),
  );
  return out;
}

/* ----------------------------------------------------------------------- */
/*                               Tables, tokens                             */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const STATUS_WORD: Record<GoalBloomStatus, string> = {
  todo: "To do",
  active: "In progress",
  done: "Done",
  blocked: "Blocked",
  planning: "Planning",
};

const STATUS_INK: Record<GoalBloomStatus, string> = {
  todo: "text-ink-2",
  active: "text-(--gb-accent)",
  done: "text-success",
  blocked: "text-danger",
  planning: "text-ink-3",
};

/* ----------------------------------------------------------------------- */
/*                                  Petal                                   */
/* ----------------------------------------------------------------------- */

function Petal({
  a,
  sector,
  tip,
  filled,
  status,
  shape,
  from,
  motionSafe,
}: {
  a: number;
  sector: number;
  tip: number;
  filled: boolean;
  status: GoalBloomStatus;
  shape: GoalBloomPetalShape;
  from: { a: number; t: number };
  motionSafe: boolean;
}) {
  const angle = useMotionValue(from.a);
  const fill = useMotionValue(from.t);
  const reach = useMotionValue(tip);

  React.useEffect(() => {
    if (!motionSafe) {
      angle.jump(a);
      reach.jump(tip);
      return;
    }
    const x = animate(angle, a, springs.glide);
    const y = animate(reach, tip, springs.glide);
    return () => {
      x.stop();
      y.stop();
    };
  }, [a, tip, motionSafe, angle, reach]);

  // The petal fills like a landing — two small bounces as it reaches its
  // full length — and empties on the exit ease, never springing back.
  React.useEffect(() => {
    if (!motionSafe) {
      fill.jump(filled ? 1 : 0);
      return;
    }
    const z = filled
      ? animate(fill, 1, { ...springs.recoil, delay: 0.24 })
      : animate(fill, 0, { duration: durations.base, ease: easings.exit });
    return () => z.stop();
  }, [filled, motionSafe, fill]);

  const outline = useTransform(
    [angle, reach] as MotionValue<number>[],
    ([v, t]) => petalPath(shape, v as number, 1, sector, t as number),
  );
  const body = useTransform(
    [angle, fill, reach] as MotionValue<number>[],
    ([v, f, t]) =>
      petalPath(shape, v as number, f as number, sector, t as number),
  );

  return (
    <>
      <motion.path
        d={outline}
        strokeWidth={1}
        strokeDasharray={
          status === "planning" || status === "blocked" ? "3 3" : undefined
        }
        className={cn(
          "fill-(--gb-bud) transition-colors duration-300",
          status === "blocked"
            ? "stroke-[color-mix(in_oklab,var(--danger)_60%,transparent)]"
            : status === "active"
              ? "stroke-(--gb-line)"
              : "stroke-hairline-strong",
        )}
      />
      <motion.path d={body} className="fill-(--gb-petal)" />
    </>
  );
}

function ProgressArc({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const p = useMotionValue(value);
  React.useEffect(() => {
    if (!motionSafe) {
      p.jump(value);
      return;
    }
    const x = animate(p, value, springs.glide);
    return () => x.stop();
  }, [value, motionSafe, p]);
  const d = useTransform(p, (v) => arcPath(v, R0 + 3));
  return (
    <motion.path
      d={d}
      fill="none"
      strokeWidth={2.5}
      strokeLinecap="round"
      className="stroke-(--gb-accent)"
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Node                                   */
/* ----------------------------------------------------------------------- */

type NodeViewProps = {
  p: Placed;
  from: { a: number; r: number; o: number; pa: number; pr: number };
  delay: number;
  parentDelay: number;
  selected: boolean;
  tabbable: boolean;
  motionSafe: boolean;
  register: (id: string, node: HTMLDivElement | null) => void;
  onPick: () => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  done: number;
  total: number;
};

/**
 * One node and the connector to its parent. Both ends of the connector are
 * this node's own motion values — a copy of the parent's on the same spring
 * from the same place — so a re-spacing sweeps round the ring in polar
 * coordinates instead of cutting across it, and nothing is shared.
 */
function NodeView({
  p,
  from,
  delay,
  parentDelay,
  selected,
  tabbable,
  motionSafe,
  register,
  onPick,
  onKey,
  done,
  total,
}: NodeViewProps) {
  const a = useMotionValue(from.a);
  const r = useMotionValue(from.r);
  const o = useMotionValue(from.o);
  const pa = useMotionValue(from.pa);
  const pr = useMotionValue(from.pr);
  const id = p.node.id;
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => register(id, node),
    [register, id],
  );

  React.useEffect(() => {
    const spring = (d: number) =>
      motionSafe ? { ...springs.glide, delay: d } : { duration: 0 };
    const runs = [
      animate(a, p.a, spring(delay)),
      animate(r, p.r, spring(delay)),
      animate(pa, p.pa, spring(parentDelay)),
      animate(pr, p.pr, spring(parentDelay)),
      animate(o, p.o, {
        duration: motionSafe ? durations.base : durations.fast,
        ease: easings.enter,
        delay: motionSafe ? delay : 0,
      }),
    ];
    return () => runs.forEach((run) => run.stop());
  }, [
    p.a,
    p.r,
    p.o,
    p.pa,
    p.pr,
    delay,
    parentDelay,
    motionSafe,
    a,
    r,
    o,
    pa,
    pr,
  ]);

  const left = useTransform([a, r] as MotionValue<number>[], ([v, d]) =>
    pct(C + (d as number) * Math.cos(v as number)),
  );
  const top = useTransform([a, r] as MotionValue<number>[], ([v, d]) =>
    pct(C + (d as number) * Math.sin(v as number)),
  );
  const lineLeft = useTransform([pa, pr] as MotionValue<number>[], ([v, d]) =>
    pct(C + (d as number) * Math.cos(v as number)),
  );
  const lineTop = useTransform([pa, pr] as MotionValue<number>[], ([v, d]) =>
    pct(C + (d as number) * Math.sin(v as number)),
  );
  const geometry = (vals: number[]) => {
    const [va = 0, vr = 0, vpa = 0, vpr = 0] = vals;
    const dx = vr * Math.cos(va) - vpr * Math.cos(vpa);
    const dy = vr * Math.sin(va) - vpr * Math.sin(vpa);
    return {
      len: Math.hypot(dx, dy),
      deg: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
  };
  const lineWidth = useTransform(
    [a, r, pa, pr] as MotionValue<number>[],
    (vals) => pct(geometry(vals as number[]).len),
  );
  const lineRotate = useTransform(
    [a, r, pa, pr] as MotionValue<number>[],
    (vals) => r2(geometry(vals as number[]).deg),
  );
  const lineOpacity = useTransform(o, (v) => r3(v * 0.9));

  const status = p.status;
  const leaf = p.depth >= 2;
  const name = `${p.node.title}, ${p.depth === 1 ? "sub-goal" : "step"}, ${STATUS_WORD[status].toLowerCase()}${
    p.children.length || p.folded ? `, ${done} of ${total} steps done` : ""
  }${p.node.owner ? `, ${p.node.owner}` : ""}`;

  return (
    <>
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute z-[1] h-0 origin-left border-t transition-colors duration-300",
          status === "planning" ? "border-dashed" : "border-solid",
          status === "blocked"
            ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
            : status === "active" || status === "done"
              ? "border-(--gb-line)"
              : "border-hairline-strong",
        )}
        style={{
          left: lineLeft,
          top: lineTop,
          width: lineWidth,
          rotate: lineRotate,
          opacity: lineOpacity,
        }}
      />
      <motion.div
        ref={ref}
        role="treeitem"
        aria-level={p.depth + 1}
        aria-setsize={p.siblings}
        aria-posinset={p.pos}
        aria-expanded={p.children.length ? !p.folded : undefined}
        aria-selected={selected}
        aria-label={name}
        tabIndex={p.hidden ? -1 : tabbable ? 0 : -1}
        aria-hidden={p.hidden || undefined}
        onClick={onPick}
        onKeyDown={onKey}
        data-gb-node={id}
        className={cn(
          "group/goal-bloom-node absolute z-[3] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full select-none",
          p.hidden && "pointer-events-none",
          FOCUS,
        )}
        style={{ left, top, opacity: o }}
      >
        {leaf ? (
          <span
            title={p.node.title}
            className="relative flex size-6 items-center justify-center rounded-full"
          >
            <motion.span
              aria-hidden
              className={cn(
                "block size-3 rounded-full border-2 transition-[color,background-color,border-color,scale] duration-300 group-hover/goal-bloom-node:scale-125",
                status === "done"
                  ? "border-transparent bg-(--gb-solid)"
                  : status === "active"
                    ? "border-(--gb-accent) bg-card"
                    : status === "blocked"
                      ? "border-transparent bg-danger"
                      : status === "planning"
                        ? "border-dashed border-ink-3 bg-card"
                        : "border-hairline-strong bg-card",
              )}
              initial={false}
              animate={{ scale: selected && motionSafe ? 1.35 : 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </span>
        ) : (
          <motion.span
            className={cn(
              "flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap shadow-raised transition-colors duration-300 group-hover/goal-bloom-node:border-(--gb-accent)",
              p.folded
                ? "border-transparent bg-(--gb-solid) text-(--gb-on)"
                : status === "blocked"
                  ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-card text-danger"
                  : status === "planning"
                    ? "border-dashed border-hairline-strong bg-card text-ink-3"
                    : status === "active"
                      ? "border-(--gb-line) bg-card text-foreground"
                      : "border-hairline-strong bg-card text-foreground",
              selected && !p.folded && "border-(--gb-accent)",
            )}
            initial={false}
            animate={{ scale: selected && motionSafe ? 1.06 : 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          >
            {p.folded ? (
              <Check aria-hidden className="size-3" strokeWidth={3} />
            ) : null}
            {status === "blocked" && !p.folded ? (
              <TriangleAlert aria-hidden className="size-3" />
            ) : null}
            {p.node.short ?? p.node.title}
            {status === "planning" ? <span aria-hidden>…</span> : null}
          </motion.span>
        )}
      </motion.div>
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

/**
 * A radial plan: the goal in a disc at the centre, its sub-goals as pills on
 * the first ring, their steps as nodes on the second (a third with `depth`).
 * Each sub-goal owns a sector and a petal; its steps spread inside it.
 *
 * As the agent plans, every new node blooms out of its parent along its own
 * angle on `springs.glide`, and its siblings re-space round the ring on the
 * same spring, so the flower re-balances as it grows. When a branch finishes,
 * its steps fold back into the sub-goal, the sub-goal moves in toward the
 * centre, and its petal fills from the centre on `springs.recoil` — progress
 * reads as the flower closing. The goal's own ring fills on glide.
 *
 * It is a tree: Left and Right (or Up and Down) move to the neighbour on the
 * same ring, Enter steps out to the next ring, Escape steps back in, Home and
 * End jump to the ring's ends. Under 32rem the bloom becomes an indented list
 * with the same states and keys. Under reduced motion nodes appear in place
 * and petals appear filled.
 */
export function GoalBloom({
  goal = defaultGoalBloomGoal,
  nodes = defaultGoalBloomNodes,
  depth = 2,
  status = "ready",
  selected: selectedProp,
  defaultSelected = null,
  onSelectNode,
  onAddSubgoal,
  onApprove,
  petalShape = "leaf",
  ringGap = 64,
  accent = "var(--accent-bright)",
  intro = true,
  title = "Store opening plan",
  product = "Coldbrook · Larch Street",
  label,
  disabled = false,
  className,
}: GoalBloomProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const rings = clamp(Math.round(depth), 1, 3);
  const radii = radiiFor(ringGap, rings);
  // Twenty-odd nodes: laid out fresh each render, nothing to memoise.
  const placed = layoutBloom(nodes, rings, radii);
  const loading = status === "loading";

  /* ------------------------------- intro -------------------------------- */

  const bloomRef = React.useRef<HTMLDivElement | null>(null);
  const seen = useInView(bloomRef, { once: true, amount: 0.3 });
  const [firstIds] = React.useState(() => new Set(nodes.map((n) => n.id)));
  const closedAtStart = intro && motionSafe;
  const bloomed = !closedAtStart || seen;
  // Delays belong to the first bloom only; a node planned later arrives at once.
  const [introOver, setIntroOver] = React.useState(false);
  React.useEffect(() => {
    if (!seen || introOver) return;
    const t = window.setTimeout(() => setIntroOver(true), 1100);
    return () => window.clearTimeout(t);
  }, [seen, introOver]);

  /* ------------------------------ counting ------------------------------ */

  const stepsUnder = (id: string): Placed[] => {
    const p = placed.get(id);
    if (!p) return [];
    const out: Placed[] = [];
    for (const c of p.children) {
      const child = placed.get(c);
      if (!child) continue;
      if (child.children.length) out.push(...stepsUnder(c));
      else out.push(child);
    }
    return out;
  };
  const leaves = [...placed.values()].filter(
    (p) => p.children.length === 0 && p.depth > 1,
  );
  const allLeaves = leaves.length ? leaves : [...placed.values()];
  const doneLeaves = allLeaves.filter((p) => p.status === "done").length;
  const ring1 = [...placed.values()].filter((p) => p.depth === 1);
  const foldedCount = ring1.filter((p) => p.folded).length;
  const blockedCount = [...placed.values()].filter(
    (p) => p.status === "blocked" && p.children.length === 0,
  ).length;
  const planning = status === "planning";
  const blocked = status === "blocked" || blockedCount > 0;

  /* ----------------------------- selection ------------------------------ */

  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultSelected,
  );
  const selectedRaw = selectedProp === undefined ? ownSelected : selectedProp;
  const selectedId =
    selectedRaw && placed.has(selectedRaw) && !placed.get(selectedRaw)?.hidden
      ? selectedRaw
      : null;
  const selectedNode = selectedId ? placed.get(selectedId) : undefined;

  const bloomRefs = React.useRef(new Map<string, HTMLDivElement | null>());
  const listRefs = React.useRef(new Map<string, HTMLDivElement | null>());
  const registerBloom = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      bloomRefs.current.set(id, node);
    },
    [],
  );
  const registerList = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      listRefs.current.set(id, node);
    },
    [],
  );

  const [moves, setMoves] = React.useState(0);
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const select = (id: string | null, focus: boolean) => {
    if (id !== selectedId) setMoves((n) => n + 1);
    if (selectedProp === undefined) setOwnSelected(id);
    if (id !== selectedId) onSelectNode?.(id);
    if (focus)
      setFocusAsk((f) => ({ key: id ?? "__goal", n: (f?.n ?? 0) + 1 }));
  };
  // Focus moves after the commit that made the node tabbable, onto whichever
  // view is on screen (the other is display: none).
  React.useEffect(() => {
    if (!focusAsk) return;
    const candidates = [
      bloomRefs.current.get(focusAsk.key),
      listRefs.current.get(focusAsk.key),
    ];
    candidates.find((el) => el && el.getClientRects().length > 0)?.focus();
  }, [focusAsk]);

  const visible = (p: Placed | undefined) => p && !p.hidden;
  const ringOf = (d: number) =>
    [...placed.values()]
      .filter((p) => p.depth === d && !p.hidden)
      .sort((x, y) => clockOf(x.a) - clockOf(y.a));
  const parentOf = (id: string): string | null => {
    const parent = placed.get(id)?.node.parent ?? null;
    return parent && placed.has(parent) ? parent : null;
  };

  const [announcement, setAnnouncement] = React.useState("");

  /** Bloom keys: round the ring, out a ring, back in a ring. */
  const onBloomKey = (
    event: React.KeyboardEvent<HTMLElement>,
    id: string | null,
  ) => {
    const here = id ? placed.get(id) : undefined;
    const ring = here ? ringOf(here.depth) : [];
    const at = here ? ring.findIndex((p) => p.node.id === id) : -1;
    const go = (p: Placed | undefined) => {
      if (!p) return;
      event.preventDefault();
      select(p.node.id, true);
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        if (!here) return go(ringOf(1)[0]);
        return go(ring[(at + 1) % ring.length]);
      case "ArrowLeft":
      case "ArrowUp":
        if (!here) return go(ringOf(1)[0]);
        return go(ring[(at - 1 + ring.length) % ring.length]);
      case "Home":
        return go(here ? ring[0] : ringOf(1)[0]);
      case "End":
        return go(
          here ? ring[ring.length - 1] : ringOf(1)[ringOf(1).length - 1],
        );
      case "Enter": {
        event.preventDefault();
        const next = here
          ? here.children.map((c) => placed.get(c)).find(visible)
          : ringOf(1)[0];
        if (next) select(next.node.id, true);
        else if (here)
          setAnnouncement(
            here.folded
              ? `${here.node.title} is finished; its steps are folded into the petal.`
              : `${here.node.title} has no steps under it.`,
          );
        return;
      }
      case "Escape": {
        if (!here) return;
        event.preventDefault();
        select(parentOf(here.node.id), true);
        return;
      }
      default:
        return;
    }
  };

  /* ------------------------------ the list ------------------------------ */

  const listOrder: string[] = [];
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const p = placed.get(id);
      if (!p || p.hidden) continue;
      listOrder.push(id);
      if (!p.folded) walk(p.children);
    }
  };
  walk(ring1.map((p) => p.node.id));

  const onListKey = (
    event: React.KeyboardEvent<HTMLElement>,
    id: string | null,
  ) => {
    const order = ["__goal", ...listOrder];
    const at = order.indexOf(id ?? "__goal");
    const go = (key: string | undefined) => {
      if (key === undefined) return;
      event.preventDefault();
      select(key === "__goal" ? null : key, true);
    };
    const here = id ? placed.get(id) : undefined;
    switch (event.key) {
      case "ArrowDown":
        return go(order[Math.min(order.length - 1, at + 1)]);
      case "ArrowUp":
        return go(order[Math.max(0, at - 1)]);
      case "Home":
        return go(order[0]);
      case "End":
        return go(order[order.length - 1]);
      case "ArrowRight":
      case "Enter": {
        const next = here
          ? here.children.map((c) => placed.get(c)).find(visible)
          : ring1[0];
        if (next) go(next.node.id);
        else event.preventDefault();
        return;
      }
      case "ArrowLeft":
      case "Escape":
        if (!here) return;
        return go(parentOf(here.node.id) ?? "__goal");
      default:
        return;
    }
  };

  /* --------------------------- announcements ---------------------------- */

  const idsKey = nodes.map((n) => n.id).join("|");
  const foldKey = ring1
    .filter((p) => p.folded)
    .map((p) => p.node.id)
    .join("|");
  const [prev, setPrev] = React.useState({ ids: idsKey, folds: foldKey });
  if (prev.ids !== idsKey || prev.folds !== foldKey) {
    const oldIds = new Set(prev.ids.split("|"));
    const oldFolds = new Set(prev.folds.split("|"));
    const added = nodes.filter((n) => !oldIds.has(n.id)).map((n) => n.title);
    const finished = ring1
      .filter((p) => p.folded && !oldFolds.has(p.node.id))
      .map((p) => p.node.title);
    const parts: string[] = [];
    if (added.length) parts.push(`Planned: ${added.join(", ")}.`);
    if (finished.length) parts.push(`${finished.join(" and ")} finished.`);
    setPrev({ ids: idsKey, folds: foldKey });
    if (parts.length) setAnnouncement(parts.join(" "));
  }

  /* ------------------------------ approve ------------------------------- */

  const [approvedAt, setApprovedAt] = React.useState<string | null>(null);
  const approved = approvedAt === idsKey && !planning;
  const approve = () => {
    if (disabled || planning || loading || nodes.length === 0) {
      setAnnouncement(
        nodes.length === 0
          ? "There is no plan to approve yet."
          : planning
            ? "The agent is still planning."
            : "",
      );
      return;
    }
    onApprove?.();
    setApprovedAt(idsKey);
    setAnnouncement("Plan approved.");
  };

  /* ------------------------------- styles ------------------------------- */

  const vars = {
    "--gb-accent": accent,
    "--gb-line": `color-mix(in oklab, ${accent} 50%, transparent)`,
    "--gb-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
    // Petals are pigment: the accent's hue at a fixed lightness, so a
    // filled petal reads the same on a light page and a dark one.
    "--gb-petal": `oklch(from ${accent} 0.7 calc(c * 0.85) h / 0.42)`,
    "--gb-bud": `color-mix(in oklab, ${accent} 6%, transparent)`,
    "--gb-solid": `oklch(from ${accent} 0.56 c h)`,
    "--gb-on": "oklch(0.99 0.004 262)",
  } as React.CSSProperties;

  const empty = nodes.length === 0;
  const chip = loading
    ? { text: "Loading", ink: "text-ink-3", dot: "bg-ink-3" }
    : empty
      ? { text: "Not planned yet", ink: "text-ink-2", dot: "bg-ink-3" }
      : planning
        ? {
            text: "Planning…",
            ink: "text-(--gb-accent)",
            dot: "bg-(--gb-accent)",
          }
        : blocked
          ? {
              text: `Blocked on ${blockedCount || 1} ${blockedCount === 1 || !blockedCount ? "step" : "steps"}`,
              ink: "text-danger",
              dot: "bg-danger",
            }
          : {
              text: `${foldedCount} of ${ring1.length} done`,
              ink: "text-ink-2",
              dot: "bg-success",
            };

  const fromOf = (p: Placed) => {
    const isNew = !firstIds.has(p.node.id);
    const collapsed = !bloomed || isNew;
    if (!collapsed) return { a: p.a, r: p.r, o: p.o, pa: p.pa, pr: p.pr };
    // A node that has not bloomed yet sits on its parent, unseen.
    return { a: p.pa, r: p.pr, o: 0, pa: p.pa, pr: p.pr };
  };
  const targetOf = (p: Placed): Placed =>
    bloomed ? p : { ...p, a: p.pa, r: Math.max(R0 * 0.7, p.pr - 4), o: 0 };
  const total1 = Math.max(1, ring1.length);
  const delayOf = (p: Placed) => {
    if (!bloomed || introOver || !motionSafe) return 0;
    const step = cascade(total1);
    return r3(p.branch * step + (p.depth - 1) * 0.16 + (p.pos - 1) * 0.03);
  };
  const parentDelayOf = (p: Placed) => {
    const parent = p.node.parent ? placed.get(p.node.parent) : undefined;
    return parent ? delayOf(parent) : 0;
  };

  /* ------------------------------- panel -------------------------------- */

  const panelSteps = selectedId ? stepsUnder(selectedId) : allLeaves;
  const panelDone = panelSteps.filter((p) => p.status === "done").length;
  const canAdd =
    !disabled && !loading && (!selectedNode || selectedNode.depth < rings);

  const panel = (
    <div className="flex flex-col gap-2.5 rounded-3 border border-hairline bg-surface-1 p-3">
      <motion.div
        key={selectedId ?? "__goal"}
        className="flex flex-col gap-1.5"
        initial={
          moves === 0
            ? false
            : motionSafe
              ? { opacity: 0, y: 4 }
              : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.base, ease: easings.enter }}
      >
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {selectedNode
            ? `${selectedNode.depth === 1 ? "Sub-goal" : "Step"} · `
            : "Goal · "}
          <span
            className={
              STATUS_INK[
                selectedNode?.status ?? (planning ? "planning" : "active")
              ]
            }
          >
            {selectedNode
              ? STATUS_WORD[selectedNode.status]
              : loading
                ? "Loading"
                : nodes.length === 0
                  ? "Not planned yet"
                  : planning
                    ? "Planning"
                    : `${doneLeaves} of ${allLeaves.length} done`}
          </span>
        </p>
        <p className="text-[13.5px] leading-snug font-semibold text-foreground">
          {selectedNode ? selectedNode.node.title : goal.title}
        </p>
        {selectedNode?.node.owner ? (
          <p className="text-[12px] text-ink-2">
            {`${selectedNode.node.owner}${
              selectedNode.children.length || selectedNode.folded
                ? ` · ${panelDone} of ${panelSteps.length} steps done`
                : ""
            }`}
          </p>
        ) : null}
        {!selectedNode && !loading && nodes.length === 0 ? (
          <p className="text-[12px] leading-4 text-ink-2">
            No sub-goals yet. Add one, or let the agent plan around the goal.
          </p>
        ) : null}
        {(selectedNode ? selectedNode.node.note : goal.note) ? (
          <p className="text-[12px] leading-4 text-ink-2">
            {selectedNode ? selectedNode.node.note : goal.note}
          </p>
        ) : null}
      </motion.div>
      {canAdd ? (
        <button
          type="button"
          onClick={() => {
            onAddSubgoal?.(selectedId);
            setAnnouncement(
              `Asked the agent to plan a ${selectedNode ? "step" : "sub-goal"} under ${selectedNode ? selectedNode.node.title : goal.title}.`,
            );
          }}
          className={cn(
            "inline-flex h-7 w-fit items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2",
            FOCUS,
          )}
        >
          <Plus aria-hidden className="size-3.5" />
          {selectedNode ? "Add a step" : "Add a sub-goal"}
        </button>
      ) : null}
    </div>
  );

  /* -------------------------------- bloom ------------------------------- */

  const goalFocusable = selectedId === null;
  const selectedTarget =
    selectedNode && selectedNode.depth >= 2 ? selectedNode : null;

  const bloom = (
    <div
      ref={bloomRef}
      className="relative aspect-square w-full max-w-[440px] shrink-0 self-center"
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${S} ${S}`}
        className="absolute inset-0 size-full overflow-visible"
      >
        {[
          radii.r1,
          ...(rings >= 2 ? [radii.r2] : []),
          ...(rings >= 3 ? [radii.r3] : []),
        ].map((rad, i) => (
          <motion.circle
            key={i}
            cx={C}
            cy={C}
            fill="none"
            strokeDasharray="2 5"
            className="stroke-hairline"
            initial={false}
            animate={{ r: r2(rad) }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          />
        ))}
        {loading
          ? [0, 1, 2, 3, 4].map((i) => (
              <path
                key={i}
                d={petalPath(
                  petalShape,
                  -Math.PI / 2 + (i * TAU) / 5,
                  1,
                  TAU / 5,
                  radii.tip,
                )}
                strokeWidth={1}
                strokeDasharray="3 3"
                className="fill-none stroke-hairline-strong"
              />
            ))
          : null}
        {(loading ? [] : ring1).map((p) => (
          <Petal
            key={p.node.id}
            a={p.a}
            sector={p.sector}
            tip={radii.tip}
            filled={p.folded && bloomed}
            status={p.status}
            shape={petalShape}
            from={{
              a: p.a,
              t: p.folded && firstIds.has(p.node.id) && !closedAtStart ? 1 : 0,
            }}
            motionSafe={motionSafe}
          />
        ))}
        <circle
          cx={C}
          cy={C}
          r={R0 + 3}
          fill="none"
          strokeWidth={2.5}
          className="stroke-hairline"
        />
        <ProgressArc
          value={
            loading ? 0 : allLeaves.length ? doneLeaves / allLeaves.length : 0
          }
          motionSafe={motionSafe}
        />
      </svg>

      {nodes.length === 0 && !loading ? (
        <span
          aria-hidden
          className="absolute inset-[22%] rounded-full border border-dashed border-hairline-strong"
        />
      ) : null}

      <div
        role="tree"
        aria-labelledby={label ? undefined : titleId}
        aria-label={label}
        aria-describedby={hintId}
        aria-busy={loading || undefined}
        className="absolute inset-0"
      >
        <div
          ref={(node) => {
            bloomRefs.current.set("__goal", node);
          }}
          role="treeitem"
          aria-level={1}
          aria-setsize={1}
          aria-posinset={1}
          aria-expanded={ring1.length > 0}
          aria-selected={goalFocusable}
          aria-label={`${goal.title}, goal, ${loading ? "loading" : `${doneLeaves} of ${allLeaves.length} steps done`}`}
          tabIndex={goalFocusable ? 0 : -1}
          onClick={() => select(null, false)}
          onKeyDown={(event) => onBloomKey(event, null)}
          className={cn(
            "absolute top-1/2 left-1/2 z-[4] flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center justify-center rounded-full border bg-surface-1 px-2 text-center transition-colors",
            goalFocusable
              ? "border-(--gb-line)"
              : "border-hairline hover:border-(--gb-line)",
            FOCUS,
          )}
          style={{ width: pct(R0 * 2 - 4), height: pct(R0 * 2 - 4) }}
        >
          <span className="line-clamp-2 text-[11.5px] leading-tight font-semibold text-foreground">
            {goal.short ?? goal.title}
          </span>
          <span className="mt-0.5 font-mono text-[10px] text-ink-3 tabular-nums">
            {loading ? "…" : `${doneLeaves}/${allLeaves.length}`}
          </span>
        </div>

        {!loading
          ? [...placed.values()].map((p) => {
              const steps =
                p.children.length || p.folded ? stepsUnder(p.node.id) : [];
              return (
                <NodeView
                  key={p.node.id}
                  p={targetOf(p)}
                  from={fromOf(p)}
                  delay={delayOf(p)}
                  parentDelay={parentDelayOf(p)}
                  selected={p.node.id === selectedId}
                  tabbable={p.node.id === selectedId}
                  motionSafe={motionSafe}
                  register={registerBloom}
                  onPick={() => select(p.node.id, false)}
                  onKey={(event) => onBloomKey(event, p.node.id)}
                  done={steps.filter((s) => s.status === "done").length}
                  total={steps.length}
                />
              );
            })
          : null}
      </div>

      {selectedTarget && bloomed ? (
        <motion.span
          key={selectedTarget.node.id}
          aria-hidden
          className="pointer-events-none absolute z-[5] max-w-[150px] -translate-x-1/2 truncate rounded-1 border border-hairline bg-popover px-1.5 py-0.5 text-[11px] text-foreground shadow-raised"
          style={{
            left: pct(
              clamp(
                C + selectedTarget.r * Math.cos(selectedTarget.a),
                S * 0.22,
                S * 0.78,
              ),
            ),
            top: pct(C + selectedTarget.r * Math.sin(selectedTarget.a) - 26),
          }}
          initial={
            moves === 0
              ? false
              : motionSafe
                ? { opacity: 0, y: 4 }
                : { opacity: 0 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: durations.base,
            ease: easings.enter,
            delay: 0.1,
          }}
        >
          {selectedTarget.node.title}
        </motion.span>
      ) : null}
    </div>
  );

  /* -------------------------------- list -------------------------------- */

  const list = (
    <div
      role="tree"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-describedby={hintId}
      aria-busy={loading || undefined}
      className="flex flex-col"
    >
      <div
        ref={(node) => {
          listRefs.current.set("__goal", node);
        }}
        role="treeitem"
        aria-level={1}
        aria-setsize={1}
        aria-posinset={1}
        aria-expanded={ring1.length > 0}
        aria-selected={goalFocusable}
        aria-label={`${goal.title}, goal, ${loading ? "loading" : `${doneLeaves} of ${allLeaves.length} steps done`}`}
        tabIndex={goalFocusable ? 0 : -1}
        onClick={() => select(null, false)}
        onKeyDown={(event) => onListKey(event, null)}
        className={cn(
          "flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2 text-[13px] font-semibold",
          goalFocusable ? "bg-(--gb-wash)" : "hover:bg-surface-2",
          FOCUS_IN,
        )}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0">
          <circle
            cx="8"
            cy="8"
            r="6"
            fill="none"
            strokeWidth="1.5"
            className="stroke-hairline-strong"
          />
          <path
            d={arcPathSmall(
              allLeaves.length ? doneLeaves / allLeaves.length : 0,
            )}
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            className="stroke-(--gb-accent)"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate" title={goal.title}>
          {goal.title}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] font-normal text-ink-3 tabular-nums">
          {loading ? "…" : `${doneLeaves}/${allLeaves.length}`}
        </span>
      </div>
      {loading
        ? [0.6, 0.45, 0.7, 0.5].map((w, i) => (
            <span
              key={i}
              aria-hidden
              className="flex h-[26px] items-center gap-2 pl-4"
            >
              <span className="size-3 rounded-full bg-surface-2" />
              <span
                className="h-2 rounded-full bg-surface-2"
                style={{ width: `${Math.round(w * 100)}%` }}
              />
            </span>
          ))
        : null}
      {(loading ? [] : listOrder).map((id) => {
        const p = placed.get(id);
        if (!p) return null;
        const steps = p.children.length || p.folded ? stepsUnder(id) : [];
        const doneHere = steps.filter((s) => s.status === "done").length;
        const isSel = id === selectedId;
        return (
          <ListRow
            key={id}
            p={p}
            selected={isSel}
            register={registerList}
            onPick={() => select(id, false)}
            onKey={(event) => onListKey(event, id)}
            done={doneHere}
            total={steps.length}
            shape={petalShape}
            motionSafe={motionSafe}
            fresh={!firstIds.has(id)}
          />
        );
      })}
      {nodes.length === 0 && !loading ? (
        <p className="px-2 py-3 text-[12.5px] text-ink-2">No sub-goals yet.</p>
      ) : null}
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container/goal-bloom w-full overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={vars}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
            {product}
          </p>
          <p id={titleId} className="text-[15px] leading-tight font-semibold">
            {title}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] font-medium transition-colors",
              chip.ink,
            )}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", chip.dot)}
            />
            {chip.text}
          </span>
          <button
            type="button"
            onClick={approve}
            aria-disabled={
              disabled || planning || loading || nodes.length === 0 || undefined
            }
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 px-2.5 text-[12px] font-medium transition-[background-color,color,opacity]",
              planning || loading || nodes.length === 0
                ? "bg-surface-2 text-ink-3"
                : "bg-(--gb-solid) text-(--gb-on) hover:bg-[color-mix(in_oklab,var(--gb-solid)_88%,black)]",
              disabled && "opacity-60",
              FOCUS,
            )}
          >
            {approved ? <Check aria-hidden className="size-3.5" /> : null}
            {approved ? "Approved" : planning ? "Planning…" : "Approve plan"}
          </button>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Left and Right move round a ring, Enter steps out to the next ring,
        Escape steps back in. In the list, Up and Down move, Right steps out,
        Left steps in.
      </p>

      <div className="hidden gap-4 p-3 @min-[32rem]/goal-bloom:flex @min-[32rem]/goal-bloom:flex-col @min-[44rem]/goal-bloom:flex-row @min-[44rem]/goal-bloom:items-start">
        {bloom}
        <div className="w-full @min-[44rem]/goal-bloom:w-[200px] @min-[44rem]/goal-bloom:shrink-0">
          {panel}
        </div>
      </div>
      <div className="p-2 @min-[32rem]/goal-bloom:hidden">{list}</div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/** The goal's ring in the list, drawn at 16px. */
function arcPathSmall(p: number): string {
  const f = clamp(p, 0, 1);
  if (f <= 0.001) return "";
  const c = 8;
  const r = 6;
  if (f >= 0.999)
    return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`;
  const end = -Math.PI / 2 + f * TAU;
  return `M ${c} ${c - r} A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${r2(c + r * Math.cos(end))} ${r2(c + r * Math.sin(end))}`;
}

/** A small petal glyph for the list, in the same shape as the bloom's. */
function PetalGlyph({
  shape,
  status,
  folded,
}: {
  shape: GoalBloomPetalShape;
  status: GoalBloomStatus;
  folded: boolean;
}) {
  const d =
    shape === "wedge"
      ? "M3 13 L3 4 A9 9 0 0 1 12 13 Z"
      : shape === "round"
        ? "M3 13 C3 8 5 3 10 3 C13 3 13 6 13 7 C13 11 8 13 3 13 Z"
        : "M3 13 C3 8 6 3 13 3 C13 9 9 13 3 13 Z";
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0">
      <path
        d={d}
        strokeWidth={1.2}
        strokeDasharray={
          status === "planning" || status === "blocked" ? "2 2" : undefined
        }
        className={cn(
          folded
            ? "fill-(--gb-solid) stroke-(--gb-solid)"
            : status === "blocked"
              ? "fill-none stroke-danger"
              : status === "active"
                ? "fill-(--gb-wash) stroke-(--gb-accent)"
                : "fill-none stroke-ink-3",
        )}
      />
    </svg>
  );
}

function ListRow({
  p,
  selected,
  register,
  onPick,
  onKey,
  done,
  total,
  shape,
  motionSafe,
  fresh,
}: {
  p: Placed;
  fresh: boolean;
  selected: boolean;
  register: (id: string, node: HTMLDivElement | null) => void;
  onPick: () => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  done: number;
  total: number;
  shape: GoalBloomPetalShape;
  motionSafe: boolean;
}) {
  const id = p.node.id;
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => register(id, node),
    [register, id],
  );
  const status = p.status;
  const name = `${p.node.title}, ${p.depth === 1 ? "sub-goal" : "step"}, ${STATUS_WORD[status].toLowerCase()}${
    total ? `, ${done} of ${total} steps done` : ""
  }${p.node.owner ? `, ${p.node.owner}` : ""}`;
  return (
    <motion.div
      ref={ref}
      role="treeitem"
      aria-level={p.depth + 1}
      aria-setsize={p.siblings}
      aria-posinset={p.pos}
      aria-expanded={p.children.length ? !p.folded : undefined}
      aria-selected={selected}
      aria-label={name}
      tabIndex={selected ? 0 : -1}
      onClick={onPick}
      onKeyDown={onKey}
      className={cn(
        "flex h-[26px] cursor-pointer items-center gap-2 rounded-2 pr-2 text-[12.5px]",
        p.depth === 1 ? "pl-4" : p.depth === 2 ? "pl-10" : "pl-14",
        selected ? "bg-(--gb-wash)" : "hover:bg-surface-2",
        FOCUS_IN,
      )}
      initial={fresh && motionSafe ? { opacity: 0, x: -6 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      {p.depth === 1 ? (
        <PetalGlyph shape={shape} status={status} folded={p.folded} />
      ) : (
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full border-[1.5px]",
            status === "done"
              ? "border-transparent bg-(--gb-solid)"
              : status === "active"
                ? "border-(--gb-accent) bg-card"
                : status === "blocked"
                  ? "border-transparent bg-danger"
                  : status === "planning"
                    ? "border-dashed border-ink-3"
                    : "border-hairline-strong",
          )}
        />
      )}
      <span
        title={p.node.title}
        className={cn(
          "min-w-0 flex-1 truncate",
          p.depth === 1 ? "font-medium text-foreground" : "text-ink-2",
          status === "done" && p.depth > 1 && "text-ink-3",
        )}
      >
        {p.node.title}
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[10px] tabular-nums",
          STATUS_INK[status],
        )}
      >
        {p.folded || total ? `${done}/${total}` : STATUS_WORD[status]}
      </span>
    </motion.div>
  );
}
