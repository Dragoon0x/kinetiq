"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FoldSidebarItem = {
  id: string;
  label: string;
  /** A key from the built-in set: gauge, grid, bell, users, card, gear, dot. */
  icon: string;
};

export type FoldSidebarGroup = {
  label: string;
  items: FoldSidebarItem[];
};

export type FoldSidebarProps = {
  /** Sections and their items, top to bottom. */
  groups: FoldSidebarGroup[];
  /** Controlled active item id. */
  value?: string;
  /** Initial active item id for uncontrolled usage. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Controlled rail mode. */
  collapsed?: boolean;
  /** Initial rail mode for uncontrolled usage. */
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** Accessible name for the nav. @default "Main" */
  label?: string;
  className?: string;
};

/** Open and rail widths. The item's 10px inset puts every icon's centre at
 *  28px from the edge — half the rail — so folding never moves an icon. */
const OPEN_WIDTH = 224;
const RAIL_WIDTH = 56;

const ICONS: Record<string, string> = {
  gauge: "M4.5 16.5a7.5 7.5 0 1 1 15 0M12 16.5l3.6-5",
  grid: "M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z",
  bell: "M7 10.2a5 5 0 0 1 10 0c0 3.4 1 4.6 1.7 5.3a.6.6 0 0 1-.4 1H5.7a.6.6 0 0 1-.4-1c.7-.7 1.7-1.9 1.7-5.3zM10.2 19.3a2 2 0 0 0 3.6 0",
  users:
    "M9.2 11.4a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM3.6 19.3a5.6 5.6 0 0 1 11.2 0M15.4 5.5a3.2 3.2 0 0 1 0 5.6M16.8 13.6a5.6 5.6 0 0 1 3.6 5.7",
  card: "M3.5 7.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2zM3.5 10.5h17",
  gear: "M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM12 4.2v1.8M12 18v1.8M4.2 12h1.8M18 12h1.8M6.5 6.5l1.3 1.3M16.2 16.2l1.3 1.3M17.5 6.5l-1.3 1.3M7.8 16.2l-1.3 1.3",
  dot: "M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z",
};

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function NavIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0">
      <path d={ICONS[name] ?? ICONS.dot} {...STROKE} />
    </svg>
  );
}

type TipAnchor = { label: string; top: number } | null;

type GroupProps = {
  group: FoldSidebarGroup;
  collapsed: boolean;
  first: boolean;
  current: string;
  pillId: string;
  motionSafe: boolean;
  onSelect: (id: string) => void;
  onTip: (label: string | null, element: HTMLElement | null) => void;
};

function FoldGroup({
  group,
  collapsed,
  first,
  current,
  pillId,
  motionSafe,
  onSelect,
  onTip,
}: GroupProps) {
  const panelId = `${React.useId()}-panel`;
  const [open, setOpen] = React.useState(true);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);

  // Measured, never reserved: a ResizeObserver fires once on observe, so the
  // first paint already knows the real height.
  React.useEffect(() => {
    const node = innerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setHeight(node.getBoundingClientRect().height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // A rail has no room for a header, so its groups always show their items:
  // a group closed while open could otherwise never be reopened.
  const expanded = collapsed || open;

  return (
    <div className="flex flex-col">
      {collapsed ? (
        first ? null : (
          <span
            aria-hidden
            className="mx-2.5 my-1 block border-t border-hairline"
          />
        )
      ) : (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            "mt-1 flex h-6 w-full cursor-pointer items-center gap-2.5 rounded-2 px-2.5 text-ink-3 transition-colors outline-none hover:text-ink-2",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <span className="flex size-5 shrink-0 items-center justify-center">
            <svg viewBox="0 0 24 24" aria-hidden className="size-3">
              <motion.path
                d="M8 5l7 7-7 7"
                animate={{ rotate: open ? 90 : 0 }}
                transition={motionSafe ? springs.snap : { duration: 0 }}
                style={{ originX: 0.5, originY: 0.5 }}
                {...STROKE}
                strokeWidth={2.4}
              />
            </svg>
          </span>
          <span className="truncate text-label">{group.label}</span>
        </button>
      )}

      <motion.div
        id={panelId}
        initial={false}
        animate={{ height: expanded ? (height ?? "auto") : 0 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
        className="overflow-hidden"
      >
        {/* A closed group is inert, not merely short: nothing inside it can be
            tabbed into or read out from behind a zero height. */}
        <div
          ref={innerRef}
          inert={!expanded}
          className="flex flex-col gap-0.5 pt-0.5"
        >
          {group.items.map((item) => {
            const isActive = item.id === current;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect(item.id)}
                onPointerEnter={(event) =>
                  onTip(item.label, event.currentTarget)
                }
                onPointerLeave={() => onTip(null, null)}
                onFocus={(event) => onTip(item.label, event.currentTarget)}
                onBlur={() => onTip(null, null)}
                className={cn(
                  "relative flex h-9 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-2 px-2.5 transition-colors outline-none",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isActive
                    ? "text-cobalt-bright"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {isActive ? (
                  motionSafe ? (
                    <motion.span
                      aria-hidden
                      layoutId={pillId}
                      transition={springs.glide}
                      className="absolute inset-0 rounded-2 bg-cobalt-wash"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-2 bg-cobalt-wash"
                    />
                  )
                ) : null}
                <span className="relative flex shrink-0">
                  <NavIcon name={item.icon} />
                </span>
                {/* Clipped by the row, so folding reads as the panel
                    narrowing rather than its contents rearranging. */}
                <motion.span
                  className="relative truncate text-sm font-medium whitespace-nowrap"
                  animate={{ opacity: collapsed ? 0 : 1 }}
                  transition={{
                    duration: collapsed ? durations.blink : durations.fast,
                    ease: easings.enter,
                  }}
                >
                  {item.label}
                </motion.span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * An app sidebar that folds to a rail. The width travels between 224px and
 * 56px on `glide` — a layout move, so the layout spring — while each label
 * fades and is clipped by its own row; every icon sits 28px from the edge,
 * half the rail, so nothing shifts sideways as the panel narrows. The active
 * pill travels between items through a shared `layoutId`, group panels animate
 * to a measured height rather than a reserved one, and the fold control's
 * double chevron turns over on `snap`.
 *
 * In rail mode a hovered or focused item names itself in a tooltip beside the
 * rail and group headers step aside, so every item stays reachable. Items are
 * buttons inside a nav, the active one carrying `aria-current="page"`; headers
 * are `aria-expanded` toggles over the panel they own. Under reduced motion
 * the widths and heights swap instantly and the labels still fade.
 */
export function FoldSidebar({
  groups,
  value,
  defaultValue,
  onValueChange,
  collapsed,
  defaultCollapsed = false,
  onCollapsedChange,
  label = "Main",
  className,
}: FoldSidebarProps) {
  const motionSafe = useMotionSafe();
  const pillId = `${React.useId()}-pill`;

  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? groups[0]?.items[0]?.id ?? "",
  );
  const current = value !== undefined ? value : uncontrolledValue;

  const [uncontrolledFold, setUncontrolledFold] =
    React.useState(defaultCollapsed);
  const isRail = collapsed !== undefined ? collapsed : uncontrolledFold;

  const navRef = React.useRef<HTMLElement | null>(null);
  const [tip, setTip] = React.useState<TipAnchor>(null);

  const select = (id: string) => {
    if (id === current) return;
    if (value === undefined) setUncontrolledValue(id);
    onValueChange?.(id);
  };

  const toggleFold = () => {
    const next = !isRail;
    if (collapsed === undefined) setUncontrolledFold(next);
    onCollapsedChange?.(next);
    setTip(null);
  };

  // The tooltip is anchored from the nav, not from the scrolling list, so it
  // is never clipped by the list's own overflow.
  const handleTip = (tipLabel: string | null, element: HTMLElement | null) => {
    const nav = navRef.current;
    if (!tipLabel || !element || !nav) {
      setTip(null);
      return;
    }
    const itemRect = element.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    setTip({
      label: tipLabel,
      top: itemRect.top - navRect.top + itemRect.height / 2,
    });
  };

  return (
    <motion.nav
      ref={navRef}
      aria-label={label}
      initial={false}
      animate={{ width: isRail ? RAIL_WIDTH : OPEN_WIDTH }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
      className={cn(
        "relative flex h-full shrink-0 flex-col border-r border-hairline bg-surface-1",
        className,
      )}
    >
      <div
        onScroll={() => setTip(null)}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2"
      >
        {groups.map((group, index) => (
          <FoldGroup
            key={group.label}
            group={group}
            first={index === 0}
            collapsed={isRail}
            current={current}
            pillId={pillId}
            motionSafe={motionSafe}
            onSelect={select}
            onTip={handleTip}
          />
        ))}
      </div>

      <div className="border-t border-hairline p-2">
        <button
          type="button"
          aria-expanded={!isRail}
          aria-label={isRail ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleFold}
          onPointerEnter={(event) =>
            handleTip(isRail ? "Expand" : null, event.currentTarget)
          }
          onPointerLeave={() => setTip(null)}
          onFocus={(event) =>
            handleTip(isRail ? "Expand" : null, event.currentTarget)
          }
          onBlur={() => setTip(null)}
          className={cn(
            "flex h-9 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-2 px-2.5 text-ink-3 transition-colors outline-none hover:bg-surface-2 hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-5 shrink-0">
            {/* One pair turning over rather than two icons swapping: the
                control keeps its identity through the fold. */}
            <motion.g
              animate={{ rotate: isRail ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              style={{ originX: 0.5, originY: 0.5 }}
            >
              <path
                d="M13.5 7.5 9 12l4.5 4.5M18 7.5 13.5 12l4.5 4.5"
                {...STROKE}
              />
            </motion.g>
          </svg>
          <motion.span
            aria-hidden
            className="truncate text-sm font-medium whitespace-nowrap"
            animate={{ opacity: isRail ? 0 : 1 }}
            transition={{
              duration: isRail ? durations.blink : durations.fast,
              ease: easings.enter,
            }}
          >
            Collapse
          </motion.span>
        </button>
      </div>

      <AnimatePresence>
        {isRail && tip ? (
          <motion.span
            aria-hidden
            style={{ top: tip.top }}
            // y stays in the animation, not in a Tailwind translate: motion
            // owns the inline transform and would overwrite the utility.
            initial={{
              opacity: 0,
              x: motionSafe ? -distances.nudge : 0,
              y: "-50%",
            }}
            animate={{ opacity: 1, x: 0, y: "-50%" }}
            exit={{
              opacity: 0,
              y: "-50%",
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe ? springs.flick : { duration: durations.blink }
            }
            className="pointer-events-none absolute left-full z-20 ml-2 rounded-2 border border-hairline-strong bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-raised"
          >
            {tip.label}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.nav>
  );
}
