"use client";

import * as React from "react";

import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TreeNode = {
  id: string;
  label: React.ReactNode;
  children?: TreeNode[];
};

export type ExpanderTreeProps = {
  nodes: TreeNode[];
  /** Ids expanded on first render. */
  defaultExpanded?: string[];
  className?: string;
  "aria-label"?: string;
};

/**
 * A nested disclosure that opens with a little procession. Expanding a node
 * glides its panel to height while a guide line draws down the indent and the
 * children arrive one after another, so the hierarchy reads as it unfolds rather
 * than snapping open. Collapsing rewinds it.
 *
 * Each parent is a real disclosure button carrying `aria-expanded` over the
 * region it controls, so the tree is walked and toggled with Tab and Space and
 * every branch state is announced. Reduced motion opens and closes the panels
 * instantly with no draw or cascade.
 */
export function ExpanderTree({
  nodes,
  defaultExpanded = [],
  className,
  "aria-label": ariaLabel,
}: ExpanderTreeProps) {
  const motionSafe = useMotionSafe();
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(defaultExpanded),
  );

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <ul aria-label={ariaLabel} className={cn("flex flex-col", className)}>
      {nodes.map((node) => (
        <Branch
          key={node.id}
          node={node}
          expanded={expanded}
          onToggle={toggle}
          motionSafe={motionSafe}
        />
      ))}
    </ul>
  );
}

function Branch({
  node,
  expanded,
  onToggle,
  motionSafe,
}: {
  node: TreeNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  motionSafe: boolean;
}) {
  const baseId = React.useId();
  const panelId = `${baseId}-panel`;
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isOpen = expanded.has(node.id);
  const step = cascade(node.children?.length ?? 1);

  return (
    <li>
      {hasChildren ? (
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => onToggle(node.id)}
          className="text-ink hover:bg-surface-1 flex w-full items-center gap-1.5 rounded-2 px-1.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        >
          <motion.span
            aria-hidden
            className="text-ink-3 shrink-0"
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <ChevronRight className="size-4" />
          </motion.span>
          {node.label}
        </button>
      ) : (
        <div className="text-ink-2 flex items-center gap-1.5 px-1.5 py-1.5 text-sm">
          <span aria-hidden className="ml-1 size-1 rounded-full bg-[var(--border)]" />
          {node.label}
        </div>
      )}

      {hasChildren && (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="panel"
              id={panelId}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: { duration: motionSafe ? durations.fast : 0 },
              }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
              className="overflow-hidden"
            >
              <div className="relative ml-3.5 pl-3.5">
                <motion.span
                  aria-hidden
                  className="absolute top-0 bottom-1.5 left-0 w-px origin-top bg-[var(--hairline-strong)]"
                  initial={{ scaleY: motionSafe ? 0 : 1 }}
                  animate={{ scaleY: 1 }}
                  transition={
                    motionSafe
                      ? { duration: durations.base, ease: easings.enter }
                      : { duration: 0 }
                  }
                />
                <ul className="flex flex-col">
                  {node.children?.map((child, index) => (
                    <motion.div
                      key={child.id}
                      initial={{
                        opacity: motionSafe ? 0 : 1,
                        x: motionSafe ? -distances.step : 0,
                      }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={
                        motionSafe
                          ? {
                              duration: durations.base,
                              ease: easings.enter,
                              delay: index * step,
                            }
                          : { duration: 0 }
                      }
                    >
                      <Branch
                        node={child}
                        expanded={expanded}
                        onToggle={onToggle}
                        motionSafe={motionSafe}
                      />
                    </motion.div>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </li>
  );
}
