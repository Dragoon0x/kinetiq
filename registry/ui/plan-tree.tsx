"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

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

export type PlanStatus = "planned" | "running" | "done" | "failed";

export type PlanNode = {
  id: string;
  label: string;
  /** Printed after the label in a lighter ink. */
  detail?: string;
  /** @default "planned" */
  status?: PlanStatus;
  /** Sub-steps. A node with an array here is a branch, even while it is empty. */
  children?: PlanNode[];
  /** The branch's revision. Bump it with new children to re-plan. @default 0 */
  plan?: number;
};

export type PlanTreeProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The plan, root steps in order. Append to unfold it. */
  nodes: PlanNode[];
  /** Controlled ids of open branches. */
  expanded?: string[];
  /** Initial open branches. Omitted, every branch starts open. */
  defaultExpanded?: string[];
  /** Fires from a row press or an arrow key with every open branch id. */
  onExpandedChange?: (ids: string[]) => void;
  /** Names the tree. */
  label: string;
  className?: string;
};

type TreeContextValue = {
  motionSafe: boolean;
  tabId: string | null;
  isOpen: (id: string) => boolean;
  toggle: (id: string, open?: boolean) => void;
  register: (id: string, node: HTMLLIElement | null) => void;
  focus: (id: string) => void;
  onKeyDown: (
    event: React.KeyboardEvent,
    node: PlanNode,
    parentId: string | null,
  ) => void;
};

const TreeContext = React.createContext<TreeContextValue | null>(null);

const isBranch = (node: PlanNode) => Array.isArray(node.children);

function branchIds(nodes: PlanNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (isBranch(node)) {
      out.push(node.id);
      branchIds(node.children ?? [], out);
    }
  }
  return out;
}

/** The rows a reader can reach, in reading order, honouring folded branches. */
function visibleIds(
  nodes: PlanNode[],
  isOpen: (id: string) => boolean,
  out: string[] = [],
): string[] {
  for (const node of nodes) {
    out.push(node.id);
    if (isBranch(node) && isOpen(node.id)) {
      visibleIds(node.children ?? [], isOpen, out);
    }
  }
  return out;
}

function walk(
  nodes: PlanNode[],
  visit: (node: PlanNode, trail: PlanNode[]) => void,
  trail: PlanNode[] = [],
) {
  for (const node of nodes) {
    visit(node, trail);
    walk(node.children ?? [], visit, [...trail, node]);
  }
}

const NODE_TONE: Record<PlanStatus, string> = {
  planned: "border-hairline-strong",
  running: "border-cobalt-bright",
  done: "border-success",
  failed: "border-danger",
};

const LABEL_TONE: Record<PlanStatus, string> = {
  planned: "text-foreground",
  running: "font-medium text-cobalt-bright",
  done: "text-ink-2",
  failed: "text-danger",
};

const WORD: Record<PlanStatus, string> = {
  planned: "Planned",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

/** The node beside a step: fills on `flick`, ticks on `flick`, breathes while running. */
function Mark({
  status,
  motionSafe,
}: {
  status: PlanStatus;
  motionSafe: boolean;
}) {
  const done = status === "done";
  const failed = status === "failed";
  const running = status === "running";
  const draw = motionSafe ? springs.flick : { duration: 0 };
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid size-4 shrink-0 place-items-center rounded-full border bg-surface-1 transition-colors duration-300",
        NODE_TONE[status],
      )}
    >
      <motion.span
        className={cn(
          "absolute inset-0 rounded-full",
          failed ? "bg-danger" : "bg-success",
        )}
        initial={false}
        animate={{ scale: done || failed ? 1 : 0 }}
        transition={draw}
      />
      {/* The pulse is opacity only, so a running step reads as alive without
          anything travelling; reduced motion holds it at mid opacity. */}
      <motion.span
        className="absolute size-1.5 rounded-full bg-cobalt-bright"
        initial={false}
        animate={{ opacity: running ? (motionSafe ? [1, 0.3] : 0.7) : 0 }}
        transition={
          running && motionSafe
            ? {
                duration: 0.8,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "reverse",
              }
            : { duration: durations.fast }
        }
      />
      <svg
        viewBox="0 0 16 16"
        className="relative size-2.5 text-background"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <motion.path
          d={
            failed ? "m4.5 4.5 7 7M11.5 4.5l-7 7" : "M3.5 8.5 6.5 11.5 12.5 4.5"
          }
          pathLength={1}
          initial={false}
          animate={{
            pathLength: done || failed ? 1 : 0,
            opacity: done || failed ? 1 : 0,
          }}
          transition={draw}
        />
      </svg>
    </span>
  );
}

/** A branch's group, measured so it grows as steps are planned and folds by its true height. */
function Branch({
  open,
  motionSafe,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  const innerRef = React.useRef<HTMLUListElement | null>(null);
  const [measured, setMeasured] = React.useState(0);
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setMeasured(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      className="overflow-hidden"
      initial={{ height: 0, opacity: 0 }}
      // Unmeasured is "auto", so a branch that is present at first paint
      // stands at its height instead of growing from nothing.
      animate={{ height: open ? measured || "auto" : 0, opacity: open ? 1 : 0 }}
      // A folding branch accelerates away; a growing one glides. Never a bounce
      // on a surface that holds other rows.
      exit={{ height: 0, opacity: 0, transition: exitFor(durations.slow) }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast, ease: easings.move }
      }
      aria-hidden={!open}
      inert={!open}
    >
      <ul ref={innerRef} role="group" className="flex flex-col pt-0.5 pl-5">
        {children}
      </ul>
    </motion.div>
  );
}

function Item({
  node,
  level,
  parentId,
  index,
  count,
  revision,
}: {
  node: PlanNode;
  level: number;
  parentId: string | null;
  index: number;
  count: number;
  revision: number;
}) {
  const ctx = React.useContext(TreeContext);
  if (!ctx) return null;
  const { motionSafe } = ctx;
  const status = node.status ?? "planned";
  const branch = isBranch(node);
  const open = branch && ctx.isOpen(node.id);
  const children = node.children ?? [];
  const plan = node.plan ?? 0;
  const running = status === "running";
  const failed = status === "failed";
  // Rows of a regrown branch arrive in a cascade; a row appended while
  // planning arrives at once, because waiting its turn would read as lag.
  const delay = revision > 0 ? Number((index * cascade(count)).toFixed(3)) : 0;

  return (
    <motion.li
      ref={(el) => ctx.register(node.id, el)}
      role="treeitem"
      aria-level={level}
      aria-expanded={branch ? open : undefined}
      tabIndex={ctx.tabId === node.id ? 0 : -1}
      onFocus={(event) => {
        event.stopPropagation();
        ctx.focus(node.id);
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (branch) ctx.toggle(node.id);
      }}
      onKeyDown={(event) => ctx.onKeyDown(event, node, parentId)}
      initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor() }}
      transition={{
        ...(motionSafe ? springs.glide : { duration: durations.fast }),
        opacity: { duration: durations.base, ease: easings.enter, delay },
        delay,
      }}
      className="group/item flex flex-col outline-none"
    >
      <div
        className={cn(
          "flex h-7 items-center gap-2 rounded-2 pr-1.5 transition-colors",
          branch && "cursor-pointer hover:bg-accent",
          "group-focus-visible/item:outline-2 group-focus-visible/item:outline-offset-2 group-focus-visible/item:outline-ring",
        )}
      >
        <span
          aria-hidden
          className="grid size-3 shrink-0 place-items-center text-ink-3"
        >
          {branch ? (
            <motion.svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3"
              initial={false}
              animate={{ rotate: open ? 90 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </motion.svg>
          ) : null}
        </span>
        <Mark status={status} motionSafe={motionSafe} />
        <span
          className={cn(
            "min-w-0 truncate text-sm transition-colors",
            LABEL_TONE[status],
          )}
          title={node.label}
        >
          {node.label}
        </span>
        {node.detail ? (
          <span
            className="min-w-0 flex-1 truncate text-xs text-ink-3"
            title={node.detail}
          >
            {node.detail}
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto shrink-0 text-[11px] font-medium",
            failed ? "text-danger" : running ? "text-cobalt-bright" : "sr-only",
          )}
        >
          {WORD[status]}
        </span>
      </div>

      {/* Keyed by revision so a re-plan is a new branch: the old one folds
          away first (mode="wait"), then the new one regrows from nothing. */}
      <AnimatePresence mode="wait" initial={false}>
        {branch ? (
          <Branch
            key={`${node.id}:${plan}`}
            open={open}
            motionSafe={motionSafe}
          >
            {/* A regrown branch's rows cascade in; a first plan's rows that
                are already present when it mounts stay still. */}
            <AnimatePresence initial={plan > 0}>
              {children.map((child, childIndex) => (
                <Item
                  key={child.id}
                  node={child}
                  level={level + 1}
                  parentId={node.id}
                  index={childIndex}
                  count={children.length}
                  revision={plan}
                />
              ))}
            </AnimatePresence>
          </Branch>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/**
 * A tree of steps that unfolds while an agent plans. Rows arrive from
 * `distances.nudge` on the enter ease; a branch's group is measured by a
 * ResizeObserver and grows on `glide` as its sub-steps are planned. A running
 * node breathes (opacity only), a done node fills and ticks on `flick`, a
 * failed one crosses in danger. Bumping a branch's `plan` with new children
 * re-plans it: the old group folds on the exit ease, then the new one regrows
 * on `glide` with its rows in a `cascade()`.
 *
 * It is a `role="tree"` with a roving tabindex: arrows move, Right opens or
 * enters a branch, Left folds or leaves it, Home and End jump, Enter and Space
 * toggle, and a row press does the same. The live region speaks the running
 * step's path, a failure, a re-plan, and completion — once per change. Under
 * reduced motion rows and groups swap on tweens and the marks are drawn whole.
 */
export function PlanTree({
  ref,
  nodes,
  expanded,
  defaultExpanded,
  onExpandedChange,
  label,
  className,
}: PlanTreeProps) {
  const motionSafe = useMotionSafe();
  const labelId = React.useId();
  const itemRefs = React.useRef(new Map<string, HTMLLIElement | null>());

  // Uncontrolled state is a set of overrides over "open unless listed closed",
  // so a branch planned later starts open without the host naming it.
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const isControlled = expanded !== undefined;

  const isOpen = React.useCallback(
    (id: string): boolean => {
      if (isControlled) return expanded.includes(id);
      const override = overrides[id];
      if (override !== undefined) return override;
      return defaultExpanded ? defaultExpanded.includes(id) : true;
    },
    [isControlled, expanded, overrides, defaultExpanded],
  );

  const toggle = (id: string, next?: boolean) => {
    const open = next ?? !isOpen(id);
    if (open === isOpen(id)) return;
    if (!isControlled) setOverrides((prev) => ({ ...prev, [id]: open }));
    onExpandedChange?.(
      branchIds(nodes).filter((branch) =>
        branch === id ? open : isOpen(branch),
      ),
    );
  };

  const order = visibleIds(nodes, isOpen);
  const tabId =
    focusedId && order.includes(focusedId) ? focusedId : (order[0] ?? null);

  const focus = (id: string) => {
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  };

  const onKeyDown = (
    event: React.KeyboardEvent,
    node: PlanNode,
    parentId: string | null,
  ) => {
    const at = order.indexOf(node.id);
    const branch = isBranch(node);
    const open = branch && isOpen(node.id);
    const first = node.children?.[0];
    let handled = true;
    switch (event.key) {
      case "ArrowDown": {
        const next = order[Math.min(order.length - 1, at + 1)];
        if (next) focus(next);
        break;
      }
      case "ArrowUp": {
        const prev = order[Math.max(0, at - 1)];
        if (prev) focus(prev);
        break;
      }
      case "ArrowRight":
        if (branch && !open) toggle(node.id, true);
        else if (open && first) focus(first.id);
        break;
      case "ArrowLeft":
        if (open) toggle(node.id, false);
        else if (parentId) focus(parentId);
        break;
      case "Home": {
        const head = order[0];
        if (head) focus(head);
        break;
      }
      case "End": {
        const tail = order[order.length - 1];
        if (tail) focus(tail);
        break;
      }
      case "Enter":
      case " ":
        if (branch) toggle(node.id);
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const context: TreeContextValue = {
    motionSafe,
    tabId,
    isOpen,
    toggle,
    register: (id, el) => {
      itemRefs.current.set(id, el);
    },
    focus,
    onKeyDown,
  };

  // The live sentence is derived from the plan, so it changes only when the
  // plan's state does — a failure, the running path, a re-plan, completion.
  const found = {
    total: 0,
    done: 0,
    failed: null as string | null,
    path: null as string[] | null,
    replan: null as PlanNode | null,
  };
  walk(nodes, (node, trail) => {
    found.total += 1;
    const status = node.status ?? "planned";
    if (status === "done") found.done += 1;
    if (status === "failed" && !found.failed) found.failed = node.label;
    if (status === "running" && !isBranch(node) && !found.path) {
      found.path = [...trail.map((step) => step.label), node.label];
    }
    const revision = node.plan ?? 0;
    if (revision > 0 && revision > (found.replan?.plan ?? 0)) {
      found.replan = node;
    }
  });
  const { total, done: doneCount, failed, path, replan } = found;
  const complete = total > 0 && doneCount === total;
  const announcement = failed
    ? `${failed} failed`
    : path
      ? `Running: ${path.join(", ")}`
      : complete
        ? `Plan complete, ${total} ${total === 1 ? "step" : "steps"}`
        : replan
          ? `${replan.label} re-planned, ${replan.children?.length ?? 0} steps`
          : "";

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex h-6 items-center justify-between gap-3">
        <span id={labelId} className="min-w-0 truncate text-sm font-semibold">
          {label}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {doneCount} / {total}
        </span>
      </div>

      {nodes.length === 0 ? (
        <p className="text-xs text-ink-3">No plan yet.</p>
      ) : (
        <TreeContext.Provider value={context}>
          <ul role="tree" aria-labelledby={labelId} className="flex flex-col">
            <AnimatePresence initial={false}>
              {nodes.map((node, index) => (
                <Item
                  key={node.id}
                  node={node}
                  level={1}
                  parentId={null}
                  index={index}
                  count={nodes.length}
                  revision={0}
                />
              ))}
            </AnimatePresence>
          </ul>
        </TreeContext.Provider>
      )}

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
