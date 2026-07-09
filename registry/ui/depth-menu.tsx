"use client";

import * as React from "react";

import { ChevronRight } from "lucide-react";

import { AnimatePresence, motion, useIsPresent } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Upward lift per depth step, as a fraction of depthGap — 28px at the default 80. */
const LIFT_RATIO = 0.35;
/** Ink kept per depth step: 1 → 0.5 → 0.25 → 0.125 down the trail. */
const DIM_STEP = 0.5;
/** Ancestors visible behind the front level; anything deeper fades out fully. */
const TRAIL_CAP = 3;
/** Incoming levels arrive from slightly forward of the stage plane. */
const ENTER_SCALE = 1.06;
/** How long the accent flash holds on a chosen leaf before fading back out. */
const FLASH_MS = 260;
/** Headroom above the stage (px) that the recession trail rises into. */
const TRAIL_HEADROOM = 32;

export type DepthMenuNode = {
  /** Stable id — becomes the path segment reported to onSelect. */
  id: string;
  /** Row label. */
  label: string;
  /** Optional mono annotation, right-aligned and dim. */
  hint?: string;
  /** Present (and non-empty) makes this a branch that opens a deeper level. */
  children?: DepthMenuNode[];
};

export type DepthMenuProps = {
  /** Root level of the tree. */
  items: DepthMenuNode[];
  /** Fires when a leaf is chosen; path is the ancestor ids, root first. */
  onSelect?: (id: string, path: string[]) => void;
  /** Px-equivalent recession per depth level. Default 80. */
  depthGap?: number;
  className?: string;
  /** Required accessible name for the menu — also names the root level. */
  "aria-label": string;
};

/** A branch is a node with at least one child; everything else is a leaf. */
const isBranch = (node: DepthMenuNode): boolean =>
  node.children !== undefined && node.children.length > 0;

const rowKey = (levelKey: string, id: string): string => `${levelKey}::${id}`;

type LevelEntry = {
  /** Stable identity for this level — "root", "root/a", "root/a/b", … */
  key: string;
  /** Name used in live announcements (root uses the menu's aria-label). */
  label: string;
  /** Chip text on the breadcrumb rail (root reads "ROOT"). */
  chipLabel: string;
  /** Ancestor ids above this level's nodes. */
  prefix: string[];
  nodes: DepthMenuNode[];
};

type Chain = { levels: LevelEntry[]; active: LevelEntry };

/**
 * An inline navigation panel where submenus cascade at successive depths on a
 * perspective stage. Entering a branch pushes the current level back — scale
 * `P/(P + depthGap·d)` (≈0.91 one step at the defaults, the true
 * translateZ(−depthGap·d) read under `perspective(perspectives.base)`), ink
 * halved per step, a 0.35·depthGap upward drift — while the child arrives from
 * slightly forward (1.06 → 1) on `glide`. Every transform is scale/translate
 * on an independent element, so there is no preserve-3d and the stage stays
 * Safari-safe. Up to three ancestors hang faintly in space behind the front
 * level; a breadcrumb rail above the stage carries one chip per level
 * (ROOT · … · current, current accented), and clicking an earlier chip pops
 * any number of levels in one move. Exiting levels fly forward and fade on
 * `exitFor`; chips arrive on `snap` with a nudge of y. Choosing a leaf fires
 * `onSelect(id, ancestorIds)` and flashes an accent border on the row
 * (opacity tween, timer cleaned on unmount).
 *
 * Semantics: the WAI-ARIA menu pattern, inline. The stage is a `role="menu"`
 * (aria-label required); the active level's rows are `role="menuitem"` with
 * roving tabindex, branch rows carry aria-haspopup/aria-expanded. Pushed-back
 * levels are aria-hidden + inert (and exiting levels mark themselves inert
 * via `useIsPresent`, so a mid-fade level can never be clicked or read).
 * ArrowUp/Down move focus with wrap, Home/End jump the ends, ArrowRight or
 * Enter descends into a branch (focus lands on its first item), ArrowLeft or
 * Escape pops one level, and a focus-return map restores focus to the row you
 * originally descended through. Focus that must land after an enter/pop
 * commit is scheduled from the event handler via a single requestAnimationFrame
 * (stored in a ref, cancelled on re-schedule and on unmount) — chosen over
 * ref-callback focusing because pop targets are already mounted, merely inert,
 * so mount callbacks never re-fire for them. An sr-only polite region
 * announces "<label> menu, N items" on level changes and "<label> selected"
 * on selection.
 *
 * Reduced motion: no perspective, no trail — ancestors are not rendered at
 * all and the breadcrumb carries the context; levels swap as duration-fast
 * opacity fades with identical semantics and focus management.
 */
export function DepthMenu({
  items,
  onSelect,
  depthGap = 80,
  className,
  "aria-label": ariaLabel,
}: DepthMenuProps) {
  const motionSafe = useMotionSafe();

  const [path, setPath] = React.useState<string[]>([]);
  const [roving, setRoving] = React.useState<string | null>(
    () => items[0]?.id ?? null,
  );
  const [flashId, setFlashId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());
  /** Level key → id of the row we descended through, for focus return. */
  const focusReturnRef = React.useRef(new Map<string, string>());
  const focusRafRef = React.useRef(0);
  const flashTimerRef = React.useRef(0);

  const gap = Math.max(0, depthGap);

  // Resolve the path into a chain of levels, truncating at any stale segment
  // so an items change can never strand the menu on a nonexistent level.
  const { levels, active } = React.useMemo<Chain>(() => {
    const root: LevelEntry = {
      key: "root",
      label: ariaLabel,
      chipLabel: "ROOT",
      prefix: [],
      nodes: items,
    };
    const chain: LevelEntry[] = [root];
    let cursor = root;
    for (const segment of path) {
      const node = cursor.nodes.find((candidate) => candidate.id === segment);
      if (!node || !isBranch(node)) break;
      cursor = {
        key: `${cursor.key}/${node.id}`,
        label: node.label,
        chipLabel: node.label,
        prefix: [...cursor.prefix, node.id],
        nodes: node.children ?? [],
      };
      chain.push(cursor);
    }
    return { levels: chain, active: cursor };
  }, [items, path, ariaLabel]);

  const rovingId = active.nodes.some((node) => node.id === roving)
    ? roving
    : (active.nodes[0]?.id ?? null);

  /**
   * Focus a row after the enter/pop render commits. One rAF, scheduled only
   * from event handlers; re-scheduling cancels the pending frame and unmount
   * cancels whatever is left (see the cleanup effect below).
   */
  const scheduleFocus = (levelKey: string, id: string) => {
    cancelAnimationFrame(focusRafRef.current);
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = 0;
      rowRefs.current.get(rowKey(levelKey, id))?.focus();
    });
  };

  /** Move focus within the active level — element is live, no rAF needed. */
  const focusRowNow = (id: string) => {
    setRoving(id);
    rowRefs.current.get(rowKey(active.key, id))?.focus();
  };

  const announceLevel = (entry: Pick<LevelEntry, "label">, count: number) => {
    setAnnouncement(
      `${entry.label} menu, ${count} ${count === 1 ? "item" : "items"}`,
    );
  };

  const enterBranch = (node: DepthMenuNode) => {
    const children = node.children ?? [];
    const first = children[0];
    if (!first) return;
    // Remember the row we descended through so popping can restore focus.
    focusReturnRef.current.set(active.key, node.id);
    const nextPrefix = [...active.prefix, node.id];
    setPath(nextPrefix);
    setRoving(first.id);
    announceLevel(node, children.length);
    scheduleFocus(`root/${nextPrefix.join("/")}`, first.id);
  };

  const popTo = (targetIndex: number) => {
    const target = levels[targetIndex];
    if (!target || targetIndex >= levels.length - 1) return;
    const descended = levels[targetIndex + 1]?.prefix;
    const cameFrom =
      focusReturnRef.current.get(target.key) ??
      descended?.[descended.length - 1];
    const focusId =
      (cameFrom !== undefined &&
      target.nodes.some((node) => node.id === cameFrom)
        ? cameFrom
        : undefined) ?? target.nodes[0]?.id;
    setPath([...target.prefix]);
    announceLevel(target, target.nodes.length);
    if (focusId !== undefined) {
      setRoving(focusId);
      scheduleFocus(target.key, focusId);
    }
  };

  const selectLeaf = (node: DepthMenuNode) => {
    onSelect?.(node.id, [...active.prefix]);
    setRoving(node.id);
    setAnnouncement(`${node.label} selected`);
    setFlashId(node.id);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashId(null), FLASH_MS);
  };

  /** Click, Enter, and Space all land here via the row button's onClick. */
  const activateRow = (node: DepthMenuNode) => {
    if (isBranch(node)) enterBranch(node);
    else selectLeaf(node);
  };

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    node: DepthMenuNode,
  ) => {
    const nodes = active.nodes;
    const index = nodes.findIndex((candidate) => candidate.id === node.id);
    if (index === -1) return;
    const wrapped = (target: number): DepthMenuNode | undefined =>
      nodes[(target + nodes.length) % nodes.length];

    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = wrapped(index + 1);
        if (next) focusRowNow(next.id);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const previous = wrapped(index - 1);
        if (previous) focusRowNow(previous.id);
        break;
      }
      case "Home": {
        event.preventDefault();
        const first = nodes[0];
        if (first) focusRowNow(first.id);
        break;
      }
      case "End": {
        event.preventDefault();
        const last = nodes[nodes.length - 1];
        if (last) focusRowNow(last.id);
        break;
      }
      case "ArrowRight": {
        if (!isBranch(node)) break;
        event.preventDefault();
        enterBranch(node);
        break;
      }
      case "ArrowLeft": {
        if (levels.length < 2) break;
        event.preventDefault();
        popTo(levels.length - 2);
        break;
      }
      case "Escape": {
        // Only consume Escape when there is a level to pop.
        if (levels.length < 2) break;
        event.preventDefault();
        event.stopPropagation();
        popTo(levels.length - 2);
        break;
      }
    }
  };

  // Unmount cleanup only — no state is set here.
  React.useEffect(
    () => () => {
      cancelAnimationFrame(focusRafRef.current);
      window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const rendered = motionSafe ? levels : [active];

  return (
    <div className={cn("w-full", className)}>
      {/* Breadcrumb rail — ahead of the menu in the tab order, above it in z. */}
      <div className="relative z-40 mb-2 flex flex-wrap items-center gap-1">
        <AnimatePresence initial={false}>
          {levels.map((level, index) => (
            <TrailChip
              key={level.key}
              label={level.chipLabel}
              current={index === levels.length - 1}
              withSeparator={index > 0}
              motionSafe={motionSafe}
              onPop={() => popTo(index)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div
        role="menu"
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className="relative grid w-full"
        style={
          motionSafe
            ? { perspective: perspectives.base, paddingTop: TRAIL_HEADROOM }
            : undefined
        }
      >
        <AnimatePresence initial={false}>
          {rendered.map((level, index) => (
            <MenuLevel
              key={level.key}
              level={level}
              distance={rendered.length - 1 - index}
              active={level.key === active.key}
              motionSafe={motionSafe}
              depthGap={gap}
              expandedId={
                rendered[index + 1]?.prefix[level.prefix.length]
              }
              rovingId={level.key === active.key ? rovingId : null}
              flashId={flashId}
              onActivate={activateRow}
              onRowKeyDown={handleRowKeyDown}
              onRowFocus={setRoving}
              onRegisterRow={(id, element) => {
                const key = rowKey(level.key, id);
                if (element) rowRefs.current.set(key, element);
                else rowRefs.current.delete(key);
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

type MenuLevelProps = {
  level: LevelEntry;
  /** 0 = front; each step back recedes, dims, and lifts. */
  distance: number;
  active: boolean;
  motionSafe: boolean;
  depthGap: number;
  /** Id of the branch row this level is currently opened through. */
  expandedId: string | undefined;
  /** Resolved roving-tabindex row id — null on non-active levels. */
  rovingId: string | null;
  flashId: string | null;
  onActivate: (node: DepthMenuNode) => void;
  onRowKeyDown: (
    event: React.KeyboardEvent<HTMLButtonElement>,
    node: DepthMenuNode,
  ) => void;
  onRowFocus: (id: string) => void;
  onRegisterRow: (id: string, element: HTMLButtonElement | null) => void;
};

function MenuLevel({
  level,
  distance,
  active,
  motionSafe,
  depthGap,
  expandedId,
  rovingId,
  flashId,
  onActivate,
  onRowKeyDown,
  onRowFocus,
  onRegisterRow,
}: MenuLevelProps) {
  // While this level animates out it must already be inert — AnimatePresence
  // would otherwise keep it clickable and readable with its last-render props.
  const isPresent = useIsPresent();
  const hidden = !active || !isPresent;

  // The translateZ(−depthGap·distance) read, faked flat: scale from the house
  // perspective, ink halved per step, a 0.35·depthGap rise into the headroom.
  const scale =
    perspectives.base / (perspectives.base + depthGap * distance);
  const lift = -depthGap * LIFT_RATIO * distance;
  const dim = distance > TRAIL_CAP ? 0 : DIM_STEP ** distance;

  return (
    <motion.div
      role="presentation"
      aria-hidden={hidden || undefined}
      inert={hidden}
      initial={
        motionSafe ? { opacity: 0, scale: ENTER_SCALE, y: 0 } : { opacity: 0 }
      }
      animate={
        motionSafe ? { opacity: dim, scale, y: lift } : { opacity: 1 }
      }
      exit={
        motionSafe
          ? {
              opacity: 0,
              scale: ENTER_SCALE,
              y: 0,
              transition: exitFor(durations.base),
            }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={
        motionSafe
          ? {
              scale: springs.glide,
              y: springs.glide,
              opacity: { duration: durations.base },
            }
          : { duration: durations.fast }
      }
      style={{ zIndex: 30 - distance, transformOrigin: "top center" }}
      className={cn(
        "col-start-1 row-start-1 flex w-full flex-col gap-0.5 self-start",
        "rounded-3 border border-hairline bg-surface-0/60 p-1.5",
        hidden && "pointer-events-none",
      )}
    >
      {level.nodes.map((node) => {
        const branch = isBranch(node);
        return (
          <button
            key={node.id}
            ref={(element) => onRegisterRow(node.id, element)}
            type="button"
            role="menuitem"
            aria-haspopup={branch ? "menu" : undefined}
            aria-expanded={branch ? node.id === expandedId : undefined}
            tabIndex={!hidden && node.id === rovingId ? 0 : -1}
            onClick={() => onActivate(node)}
            onKeyDown={(event) => onRowKeyDown(event, node)}
            onFocus={() => onRowFocus(node.id)}
            className={cn(
              "relative flex w-full cursor-pointer items-center gap-3 rounded-2 px-3 py-2.5 text-left",
              "outline-none transition-colors hover:bg-surface-1",
              "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
            )}
          >
            {!branch && (
              <motion.span
                aria-hidden
                initial={false}
                animate={{ opacity: flashId === node.id ? 1 : 0 }}
                transition={{
                  duration:
                    flashId === node.id ? durations.blink : durations.base,
                }}
                className="pointer-events-none absolute inset-0 rounded-2 border border-cobalt bg-cobalt-wash"
              />
            )}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
              {node.label}
            </span>
            {node.hint && (
              <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
                {node.hint}
              </span>
            )}
            {branch && (
              <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
            )}
          </button>
        );
      })}
      {level.nodes.length === 0 && (
        <p className="m-0 px-3 py-4 text-center text-label text-ink-3">
          No entries
        </p>
      )}
    </motion.div>
  );
}

type TrailChipProps = {
  label: string;
  current: boolean;
  withSeparator: boolean;
  motionSafe: boolean;
  onPop: () => void;
};

function TrailChip({
  label,
  current,
  withSeparator,
  motionSafe,
  onPop,
}: TrailChipProps) {
  // Exiting chips drop out of the tab order and pointer reach immediately.
  const isPresent = useIsPresent();

  return (
    <motion.span
      initial={
        motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
      }
      animate={motionSafe ? { opacity: 1, y: 0 } : { opacity: 1 }}
      exit={
        motionSafe
          ? {
              opacity: 0,
              y: distances.nudge,
              transition: exitFor(durations.fast),
            }
          : { opacity: 0, transition: { duration: durations.fast } }
      }
      transition={
        motionSafe
          ? { y: springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
      className={cn(
        "flex items-center gap-1",
        !isPresent && "pointer-events-none",
      )}
    >
      {withSeparator && (
        <span aria-hidden className="text-ink-3">
          &middot;
        </span>
      )}
      <button
        type="button"
        aria-current={current ? "true" : undefined}
        aria-hidden={!isPresent || undefined}
        tabIndex={isPresent ? 0 : -1}
        onClick={onPop}
        className={cn(
          "text-label rounded-2 border px-2 py-1 outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-ring/60",
          current
            ? "cursor-default border-cobalt/40 bg-cobalt-wash text-cobalt-bright"
            : "cursor-pointer border-transparent text-ink-3 hover:bg-surface-1 hover:text-ink-2",
        )}
      >
        {label}
      </button>
    </motion.span>
  );
}
