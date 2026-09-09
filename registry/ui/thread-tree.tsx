"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  type Transition,
  type Variants,
} from "motion/react";

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

export type ThreadNode = {
  id: string;
  /** `null` for the root; exactly one node is the root. */
  parentId: string | null;
  role: "user" | "assistant";
  text: string;
};

export type ThreadTreeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Every turn in the thread, in any order. */
  nodes: ThreadNode[];
  /** Controlled selected turn. */
  value?: string;
  /** Initial selection for uncontrolled usage; defaults to the first leaf. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Names the tree. */
  label: string;
  className?: string;
};

type Laid = ThreadNode & {
  depth: number;
  /** Percent of the tree's inner box; rounded so the server and browser agree. */
  x: number;
  y: number;
  children: string[];
};

type Tree = {
  rootId: string | null;
  order: Laid[];
  byId: Map<string, Laid>;
  leaves: string[];
  maxDepth: number;
};

type Slide = { dir: number; delay: number };

const round3 = (value: number) => Number(value.toFixed(3));
/** Vertical pitch between levels and a node's own size, in px. */
const LEVEL = 30;
const NODE = 24;

/**
 * A tidy layout: leaves take columns in reading order and each parent sits
 * over the mean of its children, so a fork always opens symmetrically.
 */
function layoutTree(nodes: ThreadNode[]): Tree {
  const byNode = new Map(nodes.map((node) => [node.id, node]));
  const kids = new Map<string, string[]>();
  let rootId: string | null = null;
  for (const node of nodes) {
    if (node.parentId !== null && byNode.has(node.parentId)) {
      const list = kids.get(node.parentId) ?? [];
      list.push(node.id);
      kids.set(node.parentId, list);
    } else rootId ??= node.id;
  }
  const order: Laid[] = [];
  const leaves: string[] = [];
  let column = 0;
  let maxDepth = 0;
  const visit = (id: string, depth: number): number => {
    const node = byNode.get(id);
    if (!node || depth > nodes.length) return 0;
    const children = kids.get(id) ?? [];
    maxDepth = Math.max(maxDepth, depth);
    const laid: Laid = { ...node, depth, x: 0, y: 0, children };
    order.push(laid);
    if (children.length === 0) {
      leaves.push(id);
      laid.x = column++;
    } else {
      const xs = children.map((child) => visit(child, depth + 1));
      laid.x = xs.reduce((sum, x) => sum + x, 0) / xs.length;
    }
    return laid.x;
  };
  if (rootId) visit(rootId, 0);
  const cols = Math.max(column, 1);
  for (const laid of order) {
    laid.x = round3(((laid.x + 0.5) / cols) * 100);
    laid.y = round3(maxDepth === 0 ? 50 : (laid.depth / maxDepth) * 100);
  }
  const byId = new Map(order.map((laid) => [laid.id, laid]));
  return { rootId, order, byId, leaves, maxDepth };
}

/** Root to `id`, inclusive. */
function pathTo(tree: Tree, id: string): Laid[] {
  const path: Laid[] = [];
  let node = tree.byId.get(id);
  while (node && path.length <= tree.order.length) {
    path.unshift(node);
    node = node.parentId === null ? undefined : tree.byId.get(node.parentId);
  }
  return path;
}

/** One box dimension from a ResizeObserver, by border box, in whole px. */
function useMeasured(
  ref: React.RefObject<HTMLDivElement | null>,
  axis: "width" | "height",
) {
  const [size, setSize] = React.useState<number | null>(null);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const box = entry.borderBoxSize?.[0];
      const rect = entry.target.getBoundingClientRect();
      setSize(
        Math.round(
          axis === "height"
            ? box
              ? box.blockSize
              : rect.height
            : box
              ? box.inlineSize
              : rect.width,
        ),
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, axis]);
  return size;
}

/** The light reaches each level one cascade step after its parent. */
const lightUp = (delay: number): Transition => ({
  pathLength: { ...springs.flick, delay },
  opacity: { duration: durations.blink, delay },
});

/** Unlighting fades first and resets the draw while invisible, so an edge never un-draws on screen. */
const LIGHT_OUT: Transition = {
  opacity: { duration: durations.fast, ease: easings.exit },
  pathLength: { duration: 0, delay: durations.fast },
};

/**
 * A conversation drawn as the tree it actually is, above the turns it
 * produced. Every node is a turn, placed by rounded percentages; the edges
 * are Beziers in an SVG whose viewBox is the measured pixel size of its box,
 * so the tree fits any width and strokes stay true. The path from the root to
 * the chosen turn lights: each lit edge draws with `pathLength` on `flick`,
 * one `cascade` step later per level, so the light travels down from the
 * root, and the nodes it reaches fill cobalt on a colour tween timed to meet
 * it.
 *
 * Choosing another turn slides the messages. Turns shared with the previous
 * path keep their keys and stay; the turns past the fork leave toward the old
 * branch's side on the exit ease while the new ones arrive from the chosen
 * side, `distances.shift` away on `snap`, in a cascade. The pane's height is
 * measured by a ResizeObserver and glides.
 *
 * The tree is a `role="tree"` of treeitem buttons with a roving tabindex:
 * Down follows the lit path (else the first child), Up goes to the parent,
 * Left and Right step between siblings, Home is the root, End is the chosen
 * turn, and Enter or Space chooses. Under reduced motion edges light by
 * opacity, nodes recolour at once, and messages cross-fade in place.
 */
export function ThreadTree({
  ref,
  nodes,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
}: ThreadTreeProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const tree = React.useMemo(() => layoutTree(nodes), [nodes]);
  const [own, setOwn] = React.useState<string | undefined>(defaultValue);
  const current = value ?? own ?? tree.leaves[0] ?? tree.rootId ?? "";
  const path = React.useMemo(() => pathTo(tree, current), [tree, current]);
  const onPath = new Set(path.map((node) => node.id));

  // The slide direction and the fork index are decided from the committed
  // selection, so a controlled change from outside slides the same way a
  // click does.
  const [track, setTrack] = React.useState({
    value: current,
    dir: 0,
    shared: path.length,
  });
  const [focused, setFocused] = React.useState(current);
  if (track.value !== current) {
    const previous = pathTo(tree, track.value);
    const from = tree.byId.get(track.value);
    const to = tree.byId.get(current);
    let shared = 0;
    while (shared < path.length && previous[shared]?.id === path[shared]?.id) {
      shared += 1;
    }
    const dir = from && to ? Math.sign(to.x - from.x) : 0;
    setTrack({ value: current, dir, shared });
    setFocused(current);
  }

  const select = (id: string) => {
    setFocused(id);
    if (id === current) return;
    if (value === undefined) setOwn(id);
    onValueChange?.(id);
  };

  const parentOf = (node: Laid) =>
    node.parentId === null ? undefined : tree.byId.get(node.parentId);

  const handleKeyDown = (
    event: React.KeyboardEvent,
    node: Laid,
    siblings: string[],
  ) => {
    const index = siblings.indexOf(node.id);
    const targets: Record<string, string | undefined> = {
      ArrowDown:
        path.find((step) => step.parentId === node.id)?.id ?? node.children[0],
      ArrowUp: parentOf(node)?.id,
      ArrowLeft: siblings[index - 1],
      ArrowRight: siblings[index + 1],
      Home: tree.rootId ?? undefined,
      End: current,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = targets[event.key];
    if (!next) return;
    setFocused(next);
    document.getElementById(`${baseId}-${next}`)?.focus();
  };

  const boxRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const width = useMeasured(boxRef, "width") ?? 0;
  const height = useMeasured(innerRef, "height");
  const innerHeight = Math.max(1, tree.maxDepth * LEVEL);
  const px = (node: Laid) => ({
    x: round3((node.x / 100) * width),
    y: round3((node.y / 100) * innerHeight),
  });

  const stagger = cascade(tree.maxDepth + 1);
  const fresh = cascade(Math.max(1, path.length - track.shared));
  const variants: Variants = {
    enter: ({ dir }: Slide) =>
      motionSafe ? { opacity: 0, x: dir * distances.shift } : { opacity: 0 },
    show: ({ delay }: Slide) =>
      motionSafe
        ? {
            opacity: 1,
            x: 0,
            transition: {
              ...springs.snap,
              delay,
              opacity: { duration: durations.base, ease: easings.enter, delay },
            },
          }
        : { opacity: 1, transition: { duration: durations.fast, delay } },
    exit: ({ dir }: Slide) =>
      motionSafe
        ? { opacity: 0, x: -dir * distances.shift, transition: exitFor() }
        : { opacity: 0, transition: exitFor(durations.fast) },
  };

  const branch =
    tree.leaves.findIndex((leaf) =>
      pathTo(tree, leaf).some((step) => step.id === current),
    ) + 1;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="rounded-3 border border-hairline bg-surface-1 px-4 py-3">
        <div className="flex h-6 items-center">
          <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
            {label}
          </span>
        </div>
        <div
          role="tree"
          aria-labelledby={labelId}
          className="relative mt-2"
          style={{ height: `${tree.maxDepth * LEVEL + NODE}px` }}
        >
          <div ref={boxRef} className="absolute inset-x-3 inset-y-3">
            <svg
              viewBox={`0 0 ${Math.max(1, width)} ${innerHeight}`}
              aria-hidden
              className="absolute inset-0 size-full overflow-visible"
            >
              {width > 0 &&
                tree.order.map((node) => {
                  const parent = parentOf(node);
                  if (!parent) return null;
                  const from = px(parent);
                  const to = px(node);
                  const mid = round3((from.y + to.y) / 2);
                  const d = `M${from.x} ${from.y}C${from.x} ${mid} ${to.x} ${mid} ${to.x} ${to.y}`;
                  const lit = onPath.has(node.id);
                  return (
                    <React.Fragment key={node.id}>
                      <path
                        d={d}
                        fill="none"
                        strokeWidth={1.5}
                        className="stroke-hairline-strong"
                      />
                      <motion.path
                        d={d}
                        fill="none"
                        strokeWidth={2}
                        strokeLinecap="round"
                        className="stroke-cobalt-bright"
                        initial={false}
                        animate={{
                          pathLength: lit || !motionSafe ? 1 : 0,
                          opacity: lit ? 1 : 0,
                        }}
                        transition={
                          !motionSafe
                            ? { duration: durations.fast }
                            : lit
                              ? lightUp((node.depth - 1) * stagger)
                              : LIGHT_OUT
                        }
                      />
                    </React.Fragment>
                  );
                })}
            </svg>
            {tree.order.map((node) => {
              const lit = onPath.has(node.id);
              const user = node.role === "user";
              const siblings = parentOf(node)?.children ?? [node.id];
              return (
                <button
                  key={node.id}
                  id={`${baseId}-${node.id}`}
                  type="button"
                  role="treeitem"
                  aria-level={node.depth + 1}
                  aria-setsize={siblings.length}
                  aria-posinset={siblings.indexOf(node.id) + 1}
                  aria-selected={node.id === current}
                  aria-label={`${node.role}: ${node.text}`}
                  tabIndex={node.id === focused ? 0 : -1}
                  onClick={() => select(node.id)}
                  onKeyDown={(event) => handleKeyDown(event, node, siblings)}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    // The node fills as the light reaches it, not before.
                    transitionDelay:
                      lit && motionSafe
                        ? `${round3(node.depth * stagger)}s`
                        : "0s",
                  }}
                  className={cn(
                    "absolute size-6 -translate-x-1/2 -translate-y-1/2 border transition-colors outline-none",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    user ? "rounded-full" : "rounded-2",
                    lit
                      ? "border-cobalt-bright bg-cobalt-bright"
                      : "border-hairline-strong bg-surface-0 hover:border-ink-3",
                    node.id === current && "ring-[3px] ring-cobalt-wash",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 left-1/2 block size-1.5 -translate-x-1/2 -translate-y-1/2 transition-colors",
                      user ? "rounded-full" : "rounded-1",
                      lit ? "bg-primary-foreground" : "bg-ink-3",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <motion.div
        initial={false}
        animate={{ height: height ?? "auto" }}
        transition={
          motionSafe
            ? springs.glide
            : { duration: durations.fast, ease: easings.move }
        }
        className="overflow-hidden"
      >
        <div ref={innerRef}>
          <ol className="relative flex flex-col gap-2">
            <AnimatePresence
              initial={false}
              mode="popLayout"
              custom={{ dir: track.dir, delay: 0 }}
            >
              {path.map((node, index) => (
                <motion.li
                  key={node.id}
                  layout={motionSafe}
                  custom={{
                    dir: track.dir,
                    delay: Math.max(0, index - track.shared) * fresh,
                  }}
                  variants={variants}
                  initial="enter"
                  animate="show"
                  exit="exit"
                  transition={{ layout: springs.glide }}
                  className={cn(
                    "flex flex-col gap-1 rounded-2 border px-3 py-2",
                    node.role === "user"
                      ? "border-transparent bg-cobalt-wash"
                      : "border-hairline bg-surface-2",
                  )}
                >
                  <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {node.role === "user" ? "You" : "Assistant"}
                  </span>
                  <span className="text-xs leading-relaxed text-foreground">
                    {node.text}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      </motion.div>

      <span role="status" className="sr-only">
        {`Branch ${branch} of ${tree.leaves.length}, ${path.length} turns`}
      </span>
    </div>
  );
}
