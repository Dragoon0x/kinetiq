"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ChevronRight,
  LoaderCircle,
  RotateCcw,
  TriangleAlert,
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

export type NestedTickNode = {
  id: string;
  label: string;
  /** A short note beside the label, e.g. a role. */
  meta?: string;
  children?: NestedTickNode[];
  /** The children arrive through `onLoadChildren` on first open. */
  lazy?: boolean;
  /** How many leaves an unloaded lazy branch holds, for counts before it loads. */
  count?: number;
};

export type NestedTickStyle = "check" | "ring" | "gauge";
export type NestedTickAccent = "cobalt" | "signal" | "amber" | "graphite";
export type NestedTickStatus = "ready" | "loading" | "error";

export type NestedTicksProps = {
  /** Pixels of indent per level; narrow containers indent at 60%. @default 18 */
  indent?: number;
  /** The tick: a square with a drawn check, a ring with a dot, or a slim gauge that fills. Partial parents fill halfway in each. @default "check" */
  tickStyle?: NestedTickStyle;
  /** Tick and ripple colour: a named token, or any CSS colour. @default "cobalt" */
  accent?: NestedTickAccent | (string & {});
  /** The tree. @default defaultNestedTickNodes */
  nodes?: NestedTickNode[];
  /** Controlled ticked leaves (an unloaded lazy branch counts as a leaf). */
  value?: string[];
  /** Initial ticked leaves when uncontrolled. @default defaultNestedTickValue */
  defaultValue?: string[];
  /** Fires from the press or key that changed the ticks, with the leaf set in tree order. */
  onChange?: (leaves: string[]) => void;
  /** Controlled open branches. */
  expanded?: string[];
  /** Initial open branches when uncontrolled. @default defaultNestedTickExpanded */
  defaultExpanded?: string[];
  /** Fires when a branch opens or closes, with every open branch. */
  onExpandedChange?: (expanded: string[]) => void;
  /** Loads a lazy branch's children on its first open; a rejection offers Retry. */
  onLoadChildren?: (node: NestedTickNode) => Promise<NestedTickNode[]>;
  /** Milliseconds between ticks in a ripple; capped so a ripple stays under 600 ms. @default cascade */
  stagger?: number;
  /** How long typed letters keep finding and dimming, ms. @default 900 */
  typeaheadMs?: number;
  /** What one leaf is called. @default { one: "person", other: "people" } */
  noun?: { one: string; other: string };
  /** The heading. @default "Field crews" */
  title?: string;
  /** Whether the tree has arrived. @default "ready" */
  status?: NestedTickStatus;
  /** "Try again" was pressed after the tree failed to load. */
  onRetry?: () => void;
  /** The tree's accessible name. @default the title */
  label?: string;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const person = (id: string, label: string, meta: string): NestedTickNode => ({
  id,
  label,
  meta,
});

export const defaultNestedTickNodes: NestedTickNode[] = [
  {
    id: "north",
    label: "North",
    children: [
      {
        id: "coldbrook",
        label: "Coldbrook crew",
        children: [
          person("ines", "Ines Marlow", "Lead"),
          person("tomas", "Tomas Reed", "Fitter"),
          person("ada", "Ada Kerr", "Fitter"),
          person("jon", "Jon Pell", "Driver"),
          person("mira", "Mira Osei", "Surveyor"),
        ],
      },
      {
        id: "larkspire",
        label: "Larkspire crew",
        children: [
          person("ravi", "Ravi Doran", "Lead"),
          person("lena", "Lena Voss", "Welder"),
          person("cal", "Cal Brandt", "Fitter"),
        ],
      },
      { id: "night", label: "Night crew", lazy: true, count: 4 },
    ],
  },
  {
    id: "basin",
    label: "Basin",
    children: [
      {
        id: "basinworks",
        label: "Basinworks crew",
        children: [
          person("rae", "Rae Okafor", "Lead"),
          person("dev", "Dev Malik", "Fitter"),
          person("nell", "Nell Ashby", "Surveyor"),
          person("theo", "Theo Grant", "Driver"),
          person("uma", "Uma Solis", "Welder"),
          person("finn", "Finn Carro", "Fitter"),
        ],
      },
      {
        id: "quayside",
        label: "Quayside crew",
        children: [
          person("bea", "Bea Lorne", "Lead"),
          person("gus", "Gus Hollis", "Driver"),
          person("ivy", "Ivy Marsh", "Fitter"),
          person("max", "Max Tully", "Welder"),
        ],
      },
    ],
  },
  {
    id: "coast",
    label: "Coast",
    children: [
      {
        id: "saltreach",
        label: "Saltreach crew",
        children: [
          person("ezra", "Ezra Vane", "Lead"),
          person("lia", "Lia Brook", "Surveyor"),
          person("noor", "Noor Haddad", "Fitter"),
        ],
      },
      { id: "relief", label: "Relief crew", lazy: true, count: 3 },
    ],
  },
];

/** The people behind the two lazy crews, for a host's `onLoadChildren`. */
export const defaultNestedTickLazyChildren: Record<string, NestedTickNode[]> = {
  night: [
    person("oren", "Oren Hale", "Lead"),
    person("pia", "Pia Lund", "Fitter"),
    person("sol", "Sol Arden", "Driver"),
    person("kit", "Kit Moreau", "Welder"),
  ],
  relief: [
    person("ash", "Ash Penn", "Lead"),
    person("rio", "Rio Calder", "Driver"),
    person("vic", "Vic Amory", "Fitter"),
  ],
};

export const defaultNestedTickValue = [
  "ines",
  "tomas",
  "ada",
  "jon",
  "mira",
  "rae",
  "dev",
];

export const defaultNestedTickExpanded = [
  "north",
  "coldbrook",
  "basin",
  "basinworks",
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ACCENTS: Record<NestedTickAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  amber: "var(--warn)",
  graphite: "var(--ink-2)",
};

const ROW_H = 36;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const ROW_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const r3 = (v: number) => Number(v.toFixed(3));

type Tick = boolean | "mixed";

type Row =
  | {
      kind: "node";
      id: string;
      node: NestedTickNode;
      level: number;
      parentId: string | null;
      pos: number;
      size: number;
    }
  | {
      kind: "loading" | "error" | "empty";
      id: string;
      node: NestedTickNode;
      level: number;
      parentId: string;
      pos: number;
      size: number;
    };

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
      {/* Gives the row a text baseline, so a noun beside it lines up. */}
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
/*                                   Tick                                   */
/* ----------------------------------------------------------------------- */

function TickMark({
  state,
  style,
  delay,
  motionSafe,
}: {
  state: Tick;
  style: NestedTickStyle;
  delay: number;
  motionSafe: boolean;
}) {
  const level = state === true ? 1 : state === "mixed" ? 0.5 : 0;
  const fill = motionSafe ? { ...springs.snap, delay } : { duration: 0 };
  const shape =
    style === "ring"
      ? "size-4 rounded-full"
      : style === "gauge"
        ? "h-4 w-2 rounded-full"
        : "size-4 rounded-1";
  return (
    <span
      aria-hidden
      className={cn(
        "relative shrink-0 overflow-hidden border transition-colors duration-200",
        shape,
        state === false
          ? "border-hairline-strong bg-surface-1"
          : "border-(--nt-accent)",
      )}
    >
      {/* The level: empty, halfway for a partial parent, full when ticked. */}
      <motion.span
        className="absolute inset-0 bg-(--nt-accent)"
        style={{ originY: 1 }}
        initial={false}
        animate={{ scaleY: level, opacity: motionSafe ? 1 : level > 0 ? 1 : 0 }}
        transition={motionSafe ? fill : { duration: durations.fast, delay: 0 }}
      />
      {style === "check" && state === true ? (
        <svg viewBox="0 0 16 16" className="absolute inset-0 size-full">
          <motion.path
            d="M4 8.2 6.8 11 12 5"
            fill="none"
            stroke="var(--bg-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={
              motionSafe
                ? { ...springs.flick, delay: r3(delay + 0.08) }
                : { duration: 0 }
            }
          />
        </svg>
      ) : null}
      {style === "ring" && state === true ? (
        <motion.span
          className="absolute top-1/2 left-1/2 size-1.5 rounded-full bg-(--bg-1)"
          style={{ translate: "-50% -50%" }}
          initial={motionSafe ? { scale: 0 } : false}
          animate={{ scale: 1 }}
          transition={
            motionSafe
              ? { ...springs.snap, delay: r3(delay + 0.06) }
              : { duration: 0 }
          }
        />
      ) : null}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A filter tree of regions, crews and people with tri-state ticks and a
 * summary that says the choice in words: "All of Coldbrook crew, 2 of
 * Basinworks crew". Ticking a parent sends a ripple down its open branch —
 * each child's tick lands on `springs.snap` a `cascade()` step after the one
 * above, its check drawing on `springs.flick`, with a faint wash passing
 * through each row — so the choice visibly travels to everyone it covers. A
 * partial parent fills its tick halfway, like a level, rather than showing a
 * dash.
 *
 * Branches open on `springs.glide`, rows arriving a step apart; lazy branches
 * show a loading row and offer Retry when they fail. Typing letters with focus
 * in the tree jumps to the next match and dims every row that does not match.
 *
 * It is an APG tree (`aria-multiselectable`, `aria-checked` true/false/mixed)
 * with one roving tab stop: Up/Down move, Right opens or steps in, Left
 * closes or steps out, Space ticks, Enter ticks a person or opens a branch,
 * `*` opens every sibling, letters type ahead and Escape clears them. Under
 * reduced motion the ticks change together with a short fade and branches
 * open without travel; ticks, counts and the summary still change.
 */
export function NestedTicks({
  indent = 18,
  tickStyle = "check",
  accent = "cobalt",
  nodes = defaultNestedTickNodes,
  value,
  defaultValue = defaultNestedTickValue,
  onChange,
  expanded,
  defaultExpanded = defaultNestedTickExpanded,
  onExpandedChange,
  onLoadChildren,
  stagger,
  typeaheadMs = 900,
  noun = { one: "person", other: "people" },
  title = "Field crews",
  status = "ready",
  onRetry,
  label,
  disabled = false,
  className,
}: NestedTicksProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const color =
    accent in ACCENTS ? ACCENTS[accent as NestedTickAccent] : accent;

  const [own, setOwn] = React.useState<string[]>(defaultValue);
  const ticked = new Set(value ?? own);
  const [ownOpen, setOwnOpen] = React.useState<string[]>(defaultExpanded);
  const open = new Set(expanded ?? ownOpen);
  const [loaded, setLoaded] = React.useState<Record<string, NestedTickNode[]>>(
    {},
  );
  const [loadState, setLoadState] = React.useState<
    Record<string, "loading" | "error">
  >({});
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [ripple, setRipple] = React.useState<{
    seq: number;
    delays: Record<string, number>;
  } | null>(null);
  const [typed, setTyped] = React.useState("");
  const [announcement, setAnnouncement] = React.useState("");

  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  // The ticks as last rendered, for a branch that finishes loading later.
  const tickedRef = React.useRef(ticked);
  React.useEffect(() => {
    tickedRef.current = ticked;
  });
  const typeTimer = React.useRef<number | null>(null);
  const typedRef = React.useRef("");

  React.useEffect(
    () => () => {
      if (typeTimer.current !== null) window.clearTimeout(typeTimer.current);
    },
    [],
  );

  /* -------------------------------- tree ------------------------------- */

  const kidsOf = (
    node: NestedTickNode,
    extra?: Record<string, NestedTickNode[]>,
  ): NestedTickNode[] | undefined =>
    node.children ?? extra?.[node.id] ?? loaded[node.id];

  const isBranch = (node: NestedTickNode) =>
    !!node.lazy || (node.children?.length ?? 0) > 0;

  /** The ids a branch stands for: its leaves, or itself while unloaded. */
  const leavesOf = (node: NestedTickNode): string[] => {
    const kids = kidsOf(node);
    if (kids === undefined) return node.lazy || !node.children ? [node.id] : [];
    return kids.flatMap(leavesOf);
  };

  /** How many leaves a branch holds, counting an unloaded branch by `count`. */
  const sizeOf = (node: NestedTickNode): number => {
    const kids = kidsOf(node);
    if (kids === undefined) return node.lazy ? (node.count ?? 1) : 1;
    return kids.reduce((n, k) => n + sizeOf(k), 0);
  };

  const pickedIn = (node: NestedTickNode): number => {
    const kids = kidsOf(node);
    if (kids === undefined) return ticked.has(node.id) ? sizeOf(node) : 0;
    return kids.reduce((n, k) => n + pickedIn(k), 0);
  };

  const tickOf = (node: NestedTickNode): Tick => {
    const leaves = leavesOf(node);
    if (leaves.length === 0) return false;
    const k = leaves.filter((id) => ticked.has(id)).length;
    return k === 0 ? false : k === leaves.length ? true : "mixed";
  };

  const parentOf = new Map<string, NestedTickNode | null>();
  const byId = new Map<string, NestedTickNode>();
  const index = (list: NestedTickNode[], parent: NestedTickNode | null) => {
    for (const node of list) {
      parentOf.set(node.id, parent);
      byId.set(node.id, node);
      const kids = kidsOf(node);
      if (kids) index(kids, node);
    }
  };
  index(nodes, null);

  const total = nodes.reduce((n, node) => n + sizeOf(node), 0);
  const picked = nodes.reduce((n, node) => n + pickedIn(node), 0);

  const rows: Row[] = [];
  const walk = (
    list: NestedTickNode[],
    level: number,
    parentId: string | null,
  ) => {
    list.forEach((node, i) => {
      rows.push({
        kind: "node",
        id: node.id,
        node,
        level,
        parentId,
        pos: i + 1,
        size: list.length,
      });
      if (!isBranch(node) || !open.has(node.id)) return;
      const kids = kidsOf(node);
      if (kids) {
        if (kids.length === 0) {
          rows.push({
            kind: "empty",
            id: `${node.id}::empty`,
            node,
            level: level + 1,
            parentId: node.id,
            pos: 1,
            size: 1,
          });
        }
        walk(kids, level + 1, node.id);
      } else {
        rows.push({
          kind: loadState[node.id] === "error" ? "error" : "loading",
          id: `${node.id}::${loadState[node.id] === "error" ? "error" : "loading"}`,
          node,
          level: level + 1,
          parentId: node.id,
          pos: 1,
          size: 1,
        });
      }
    });
  };
  walk(nodes, 1, null);

  const focusable = rows.filter((r) => r.kind === "node" || r.kind === "error");
  const activeId =
    focusId && focusable.some((r) => r.id === focusId)
      ? focusId
      : (focusable[0]?.id ?? null);

  /* ------------------------------ summary ------------------------------ */

  const phrases: string[] = [];
  const describe = (list: NestedTickNode[]) => {
    for (const node of list) {
      const t = tickOf(node);
      if (t === false) continue;
      if (t === true) {
        phrases.push(isBranch(node) ? `All of ${node.label}` : node.label);
        continue;
      }
      const kids = kidsOf(node) ?? [];
      if (kids.every((k) => !isBranch(k))) {
        const k = kids.filter((c) => ticked.has(c.id));
        phrases.push(
          k.length === 1 && k[0]
            ? `${k[0].label} of ${node.label}`
            : `${k.length} of ${node.label}`,
        );
      } else describe(kids);
    }
  };
  describe(nodes);
  const summary =
    picked === 0
      ? `Nobody yet — tick a crew, or just some of its ${noun.other}`
      : picked === total && total > 0
        ? `Everyone, all ${total} ${noun.other}`
        : phrases.length > 3
          ? `${phrases.slice(0, 2).join(", ")} and ${phrases.length - 2} more groups`
          : phrases.join(", ");

  /* ------------------------------ changes ------------------------------ */

  const ordered = (
    set: Set<string>,
    extra?: Record<string, NestedTickNode[]>,
  ) => {
    const out: string[] = [];
    const add = (list: NestedTickNode[]) => {
      for (const node of list) {
        const kids = kidsOf(node, extra);
        if (kids === undefined) {
          if (set.has(node.id)) out.push(node.id);
        } else add(kids);
      }
    };
    add(nodes);
    return out;
  };

  const commit = (next: Set<string>, said: string) => {
    const leaves = ordered(next);
    if (value === undefined) setOwn(leaves);
    onChange?.(leaves);
    setAnnouncement(said);
  };

  const toggle = (node: NestedTickNode) => {
    if (inert) return;
    const leaves = leavesOf(node);
    if (leaves.length === 0) return;
    const all = leaves.every((id) => ticked.has(id));
    const next = new Set(ticked);
    for (const id of leaves) {
      if (all) next.delete(id);
      else next.add(id);
    }
    // The ripple runs down the open part of the branch, in reading order.
    const start = rows.findIndex((r) => r.id === node.id);
    const below: string[] = [];
    if (start >= 0) {
      const level = rows[start]?.level ?? 0;
      for (let i = start + 1; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row || row.level <= level) break;
        // Only rows whose tick actually changes carry the ripple, so it
        // never waits on rows that were already where it is going.
        if (row.kind === "node" && tickOf(row.node) !== !all) {
          below.push(row.id);
        }
      }
    }
    const step =
      stagger !== undefined
        ? Math.min(stagger / 1000, 0.6 / Math.max(1, below.length))
        : cascade(below.length + 1);
    const delays: Record<string, number> = {};
    below.forEach((id, i) => {
      delays[id] = r3((i + 1) * step);
    });
    setRipple((r) => ({ seq: (r?.seq ?? 0) + 1, delays }));
    const n = leaves.reduce(
      (acc, id) =>
        acc + (byId.get(id) ? sizeOf(byId.get(id) as NestedTickNode) : 1),
      0,
    );
    commit(
      next,
      `${node.label} ${all ? "unticked" : "ticked"}${isBranch(node) ? `, ${n} ${n === 1 ? noun.one : noun.other}` : ""}.`,
    );
  };

  const setOpen = (ids: string[], to: boolean) => {
    const next = new Set(open);
    for (const id of ids) {
      if (to) next.add(id);
      else next.delete(id);
    }
    const list = [...next];
    if (expanded === undefined) setOwnOpen(list);
    onExpandedChange?.(list);
    if (to) {
      for (const id of ids) {
        const node = byId.get(id);
        if (node?.lazy && !kidsOf(node) && loadState[id] !== "loading") {
          load(node);
        }
      }
    }
  };

  const load = (node: NestedTickNode) => {
    if (!onLoadChildren) {
      setLoaded((l) => ({ ...l, [node.id]: [] }));
      return;
    }
    setLoadState((s) => ({ ...s, [node.id]: "loading" }));
    onLoadChildren(node).then(
      (kids) => {
        setLoaded((l) => ({ ...l, [node.id]: kids }));
        setLoadState((s) => {
          const rest = { ...s };
          delete rest[node.id];
          return rest;
        });
        setAnnouncement(
          `${node.label} loaded, ${kids.length} ${kids.length === 1 ? noun.one : noun.other}.`,
        );
        // A branch ticked while unloaded stood for all of its leaves.
        const latest = tickedRef.current;
        if (latest.has(node.id)) {
          const next = new Set(latest);
          next.delete(node.id);
          for (const kid of kids) next.add(kid.id);
          const leaves = ordered(next, { [node.id]: kids });
          if (value === undefined) setOwn(leaves);
          onChange?.(leaves);
        }
      },
      () => {
        setLoadState((s) => ({ ...s, [node.id]: "error" }));
        setAnnouncement(`Couldn't load ${node.label}.`);
      },
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setFocusId(id);
    rowNodes.current.get(id)?.focus();
  };

  const typeAhead = (key: string, fromIndex: number) => {
    const text = typedRef.current + key.toLowerCase();
    typedRef.current = text;
    setTyped(text);
    if (typeTimer.current !== null) window.clearTimeout(typeTimer.current);
    typeTimer.current = window.setTimeout(() => {
      typeTimer.current = null;
      typedRef.current = "";
      setTyped("");
    }, typeaheadMs);
    const candidates = rows.filter((r) => r.kind === "node");
    const begin = text.length > 1 ? fromIndex : fromIndex + 1;
    // A word that starts with the letters wins over letters mid-word.
    const tests = [
      (label: string) => label.split(/\s+/).some((w) => w.startsWith(text)),
      (label: string) => label.includes(text),
    ];
    for (const test of tests) {
      for (let i = 0; i < candidates.length; i += 1) {
        const row = candidates[(begin + i) % candidates.length];
        if (row && test(row.node.label.toLowerCase())) {
          focusRow(row.id);
          return;
        }
      }
    }
  };

  const onRowKey = (event: React.KeyboardEvent, row: Row) => {
    const i = focusable.findIndex((r) => r.id === row.id);
    const node = row.node;
    const branch = row.kind === "node" && isBranch(node);
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRow(focusable[Math.min(focusable.length - 1, i + 1)]?.id);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusRow(focusable[Math.max(0, i - 1)]?.id);
        return;
      case "Home":
        event.preventDefault();
        focusRow(focusable[0]?.id);
        return;
      case "End":
        event.preventDefault();
        focusRow(focusable[focusable.length - 1]?.id);
        return;
      case "ArrowRight":
        event.preventDefault();
        if (!branch) return;
        if (!open.has(node.id)) setOpen([node.id], true);
        else focusRow(focusable[i + 1]?.id);
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (branch && open.has(node.id)) setOpen([node.id], false);
        else if (row.parentId) focusRow(row.parentId);
        return;
      case " ":
        event.preventDefault();
        if (row.kind === "error") load(node);
        else toggle(node);
        return;
      case "Enter":
        event.preventDefault();
        if (row.kind === "error") load(node);
        else if (branch) setOpen([node.id], !open.has(node.id));
        else toggle(node);
        return;
      case "*": {
        event.preventDefault();
        const siblings = (
          row.parentId
            ? (kidsOf(byId.get(row.parentId) as NestedTickNode) ?? [])
            : nodes
        ).filter(isBranch);
        setOpen(
          siblings.map((s) => s.id),
          true,
        );
        return;
      }
      case "Escape":
        if (!typedRef.current) return;
        // Only an active type-ahead is ours; otherwise the stage may close.
        event.preventDefault();
        if (typeTimer.current !== null) window.clearTimeout(typeTimer.current);
        typeTimer.current = null;
        typedRef.current = "";
        setTyped("");
        return;
      default:
        if (
          event.key.length === 1 &&
          /\S/.test(event.key) &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          const all = rows.filter((r) => r.kind === "node");
          typeAhead(
            event.key,
            all.findIndex((r) => r.id === row.id),
          );
        }
    }
  };

  /* ------------------------------- render ------------------------------ */

  const matches = typed
    ? new Set(
        rows
          .filter(
            (r) =>
              r.kind === "node" && r.node.label.toLowerCase().includes(typed),
          )
          .map((r) => r.id),
      )
    : null;
  const matchAncestors = new Set<string>();
  if (matches) {
    for (const id of matches) {
      let p = parentOf.get(id);
      while (p) {
        matchAncestors.add(p.id);
        p = parentOf.get(p.id) ?? null;
      }
    }
  }

  const rowTransition = (delay: number) =>
    motionSafe
      ? {
          height: springs.glide,
          opacity: { duration: durations.base, ease: easings.enter, delay },
          y: { ...springs.glide, delay },
        }
      : { duration: durations.fast };

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
      style={{
        ["--nt-accent" as string]: color,
        ["--nt-wide" as string]: `${Math.max(4, Math.round(indent))}px`,
        ["--nt-narrow" as string]: `${Math.max(4, Math.round(indent * 0.6))}px`,
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move. Right opens a branch, Left closes it. Space ticks.
        Asterisk opens every sibling. Type letters to find a name.
      </p>

      <header className="flex shrink-0 flex-col gap-1.5 border-b border-hairline px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {ready ? (
              <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
                <span className="sr-only">
                  {picked} of {total} {noun.other} ticked
                </span>
                <Roll
                  value={picked}
                  motionSafe={motionSafe}
                  className="font-mono text-[13px] text-foreground"
                />
                <span aria-hidden>of {total}</span>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (inert || picked === 0) return;
                setRipple(null);
                commit(new Set(), "Cleared.");
              }}
              aria-disabled={inert || picked === 0 || undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
                !inert && picked > 0
                  ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                  : "cursor-default text-ink-3",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3.5" />
              Clear
            </button>
          </div>
        </div>
        <div className="grid text-[12px] leading-snug text-ink-2">
          <AnimatePresence initial={false}>
            <motion.p
              key={ready ? summary : status}
              className="col-start-1 row-start-1"
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {ready
                ? summary
                : status === "loading"
                  ? "Loading crews…"
                  : "The crews didn't load."}
            </motion.p>
          </AnimatePresence>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col overflow-hidden">
        <AnimatePresence>
          {typed ? (
            <motion.p
              key="find"
              aria-hidden
              className="pointer-events-none absolute top-2 right-3 z-10 inline-flex h-6 items-center gap-1 rounded-full border border-hairline-strong bg-popover px-2.5 font-mono text-[11px] text-ink-2"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast, ease: easings.enter }}
            >
              Find “{typed}” · {matches?.size ?? 0}
            </motion.p>
          ) : null}
        </AnimatePresence>
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 [--nt-indent:var(--nt-narrow)] @min-[19rem]:[--nt-indent:var(--nt-wide)]">
          {status === "error" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The crews didn&apos;t load.
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
                  Try again
                </button>
              ) : null}
            </div>
          ) : status === "loading" ? (
            <div aria-hidden className="flex flex-col gap-1 px-2">
              {Array.from({ length: 9 }, (_, i) => (
                <span
                  key={i}
                  className="flex h-9 items-center gap-2"
                  style={{ paddingLeft: `calc(var(--nt-indent) * ${i % 3})` }}
                >
                  <span className="size-4 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                  <span
                    className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      width: `${38 + ((i * 31) % 40)}%`,
                      animationDelay: `${i * 80}ms`,
                    }}
                  />
                </span>
              ))}
            </div>
          ) : (
            <div
              role="tree"
              aria-labelledby={label ? undefined : titleId}
              aria-label={label}
              aria-describedby={hintId}
              aria-multiselectable
              aria-disabled={disabled || undefined}
              className="relative"
            >
              <AnimatePresence initial={false}>
                {rows.map((row) => {
                  const node = row.node;
                  const isNode = row.kind === "node";
                  const branch = isNode && isBranch(node);
                  const isOpen = branch && open.has(node.id);
                  const state = isNode ? tickOf(node) : false;
                  const delay =
                    isNode && ripple ? (ripple.delays[row.id] ?? 0) : 0;
                  const dim =
                    matches && isNode && !matches.has(row.id)
                      ? matchAncestors.has(row.id)
                        ? 0.7
                        : 0.35
                      : 1;
                  const count = branch
                    ? `${pickedIn(node)}/${sizeOf(node)}`
                    : null;
                  const arrive = motionSafe
                    ? r3(Math.min(8, Math.max(0, row.pos - 1)) * 0.03)
                    : 0;
                  return (
                    <motion.div
                      key={row.id}
                      className="relative overflow-hidden"
                      initial={{
                        height: 0,
                        opacity: 0,
                        y: motionSafe ? -distances.nudge : 0,
                      }}
                      animate={{ height: ROW_H, opacity: dim, y: 0 }}
                      exit={{
                        height: 0,
                        opacity: 0,
                        transition: exitFor(durations.base),
                      }}
                      transition={rowTransition(arrive)}
                    >
                      {/* Guides: one hairline per ancestor level. */}
                      {Array.from({ length: row.level - 1 }, (_, l) => (
                        <span
                          key={l}
                          aria-hidden
                          className="absolute inset-y-0 w-px bg-hairline"
                          style={{
                            left: `calc(var(--nt-indent) * ${l} + 15px)`,
                          }}
                        />
                      ))}
                      {isNode &&
                      ripple &&
                      row.id in ripple.delays &&
                      motionSafe ? (
                        <motion.span
                          key={ripple.seq}
                          aria-hidden
                          className="pointer-events-none absolute inset-0 rounded-2 bg-(--nt-accent)"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: [0, 0.14, 0] }}
                          transition={{
                            duration: 0.5,
                            times: [0, 0.3, 1],
                            ease: easings.move,
                            delay,
                          }}
                        />
                      ) : null}
                      {row.kind === "loading" ? (
                        <div
                          className="flex h-9 items-center gap-2 text-[12px] text-ink-3"
                          style={{
                            paddingLeft: `calc(var(--nt-indent) * ${row.level - 1} + 8px)`,
                          }}
                        >
                          <LoaderCircle
                            aria-hidden
                            className="size-3.5 motion-safe:animate-spin"
                          />
                          <span role="status">
                            Loading {node.label.toLowerCase()}…
                          </span>
                        </div>
                      ) : row.kind === "empty" ? (
                        <div
                          className="flex h-9 items-center text-[12px] text-ink-3"
                          style={{
                            paddingLeft: `calc(var(--nt-indent) * ${row.level - 1} + 30px)`,
                          }}
                        >
                          No {noun.other} here yet.
                        </div>
                      ) : (
                        <div
                          ref={(el) => {
                            if (el) rowNodes.current.set(row.id, el);
                            else rowNodes.current.delete(row.id);
                          }}
                          // A checkbox tree carries aria-checked, not
                          // aria-selected: ARIA 1.2 requires neither on a
                          // treeitem, and both would read as two choices.
                          // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
                          role="treeitem"
                          tabIndex={row.id === activeId ? 0 : -1}
                          aria-level={row.level}
                          aria-setsize={row.size}
                          aria-posinset={row.pos}
                          aria-expanded={branch ? isOpen : undefined}
                          aria-checked={
                            row.kind === "error"
                              ? undefined
                              : state === "mixed"
                                ? "mixed"
                                : state
                          }
                          aria-label={
                            row.kind === "error"
                              ? `Couldn't load ${node.label}. Press Enter to retry.`
                              : `${node.label}${node.meta ? `, ${node.meta}` : ""}${branch ? `, ${pickedIn(node)} of ${sizeOf(node)} ticked` : ""}`
                          }
                          aria-disabled={inert || undefined}
                          onFocus={() => setFocusId(row.id)}
                          onKeyDown={(event) => onRowKey(event, row)}
                          onClick={() => {
                            setFocusId(row.id);
                            if (row.kind === "error") load(node);
                            else toggle(node);
                          }}
                          className={cn(
                            "relative flex h-9 cursor-pointer items-center gap-2 rounded-2 pr-2 transition-colors select-none hover:bg-surface-2",
                            ROW_RING,
                          )}
                          style={{
                            paddingLeft: `calc(var(--nt-indent) * ${row.level - 1} + 8px)`,
                          }}
                        >
                          {row.kind === "error" ? (
                            <>
                              <TriangleAlert
                                aria-hidden
                                className="size-3.5 shrink-0 text-danger"
                              />
                              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                                Couldn&apos;t load {node.label.toLowerCase()}
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-cobalt-bright">
                                <RotateCcw aria-hidden className="size-3" />
                                Retry
                              </span>
                            </>
                          ) : (
                            <>
                              {branch ? (
                                <motion.span
                                  aria-hidden
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setFocusId(row.id);
                                    setOpen([node.id], !isOpen);
                                  }}
                                  className="-m-1 flex size-5 shrink-0 items-center justify-center rounded-1 p-1 text-ink-3 hover:text-foreground"
                                  initial={false}
                                  animate={{ rotate: isOpen ? 90 : 0 }}
                                  transition={
                                    motionSafe ? springs.snap : { duration: 0 }
                                  }
                                >
                                  <ChevronRight className="size-3.5" />
                                </motion.span>
                              ) : (
                                <span aria-hidden className="size-3 shrink-0" />
                              )}
                              <TickMark
                                state={state}
                                style={tickStyle}
                                delay={delay}
                                motionSafe={motionSafe}
                              />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate",
                                  row.level === 1
                                    ? "text-[13px] font-semibold"
                                    : branch
                                      ? "text-[13px] font-medium"
                                      : "text-[13px]",
                                )}
                              >
                                {node.label}
                              </span>
                              {count ? (
                                <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                                  {count}
                                </span>
                              ) : node.meta ? (
                                <span className="hidden shrink-0 text-[11px] text-ink-3 @min-[19rem]:inline">
                                  {node.meta}
                                </span>
                              ) : null}
                            </>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
