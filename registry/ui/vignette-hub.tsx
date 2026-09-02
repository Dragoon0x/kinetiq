"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HubNode = { id: string; label: string };

export type VignetteHubProps = {
  /** The centre node. */
  core?: string;
  nodes?: HubNode[];
  /** Pixel radius of the ring the nodes sit on. @default 96 */
  radius?: number;
  /** Ring draws core links only; mesh also joins each node to its neighbours. @default "ring" */
  layout?: "ring" | "mesh";
  /** Rings this node and pulses its link to the core; independent of onNodeSelect. */
  activeId?: string;
  /** Renders each node as a real, selectable button instead of a decorative label. */
  onNodeSelect?: (id: string) => void;
  className?: string;
};

const DEFAULT_NODES: HubNode[] = [
  { id: "n1", label: "Rosters" },
  { id: "n2", label: "Cranes" },
  { id: "n3", label: "Tides" },
  { id: "n4", label: "Stores" },
  { id: "n5", label: "Payroll" },
  { id: "n6", label: "Exports" },
];

/**
 * A centre node with its services arranged on a ring, links drawn from each
 * to the core and a pulse travelling every line in turn — the integration
 * scene, for heroes about products that sit in the middle of other tools.
 * Positions are computed from index and count, so the layout is identical on
 * server and client, and the pulse order is fixed. One image to assistive
 * tech, labelled with the whole roster. Passing onNodeSelect turns every node
 * into a real button, and activeId then rings the matching node while its
 * link to the core pulses.
 *
 * Reduced motion: links draw complete and pulses hold as lit dots at rest.
 */
export function VignetteHub({
  core = "Waylight",
  nodes = DEFAULT_NODES,
  radius = 96,
  layout = "ring",
  activeId,
  onNodeSelect,
  className,
}: VignetteHubProps) {
  const motionSafe = useMotionSafe();
  const size = radius * 2 + 72;
  const centre = size / 2;
  const interactive = typeof onNodeSelect === "function";

  const placed = nodes.map((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: centre + Math.cos(angle) * radius,
      y: centre + Math.sin(angle) * radius,
    };
  });

  return (
    <div
      role={interactive ? undefined : "img"}
      aria-label={
        interactive
          ? undefined
          : `${core} connected to ${nodes.map((n) => n.label).join(", ")}`
      }
      className={cn("w-full max-w-sm", className)}
    >
      <div
        aria-hidden={interactive ? undefined : true}
        className="relative mx-auto"
        style={{ width: size, height: size }}
      >
        <svg
          aria-hidden={interactive ? true : undefined}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 size-full overflow-visible"
        >
          {/* Mesh: each node also joined to its next neighbour, fainter than
              the spokes so the core still reads as the centre. */}
          {layout === "mesh" &&
            placed.map((node, index) => {
              const next = placed[(index + 1) % placed.length]!;
              return (
                <motion.line
                  key={`mesh-${node.id}`}
                  x1={node.x}
                  y1={node.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="var(--hairline)"
                  strokeWidth={1}
                  initial={{ pathLength: motionSafe ? 0 : 1 }}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.slow,
                          ease: easings.enter,
                          delay: 0.3 + index * 0.06,
                        }
                      : { duration: 0 }
                  }
                />
              );
            })}
          {placed.map((node, index) => {
            const isActive = node.id === activeId;
            return (
              <g key={node.id}>
                <motion.line
                  x1={centre}
                  y1={centre}
                  x2={node.x}
                  y2={node.y}
                  stroke="var(--hairline-strong)"
                  strokeWidth={1}
                  initial={{ pathLength: motionSafe ? 0 : 1 }}
                  animate={
                    isActive && motionSafe
                      ? {
                          pathLength: 1,
                          opacity: [1, 0.4, 1],
                          strokeWidth: [1, 2.25, 1],
                        }
                      : { pathLength: 1 }
                  }
                  transition={
                    motionSafe
                      ? isActive
                        ? {
                            pathLength: {
                              duration: durations.slow,
                              ease: easings.enter,
                              delay: index * 0.08,
                            },
                            opacity: {
                              duration: 1.2,
                              ease: "easeInOut",
                              repeat: Infinity,
                            },
                            strokeWidth: {
                              duration: 1.2,
                              ease: "easeInOut",
                              repeat: Infinity,
                            },
                          }
                        : {
                            duration: durations.slow,
                            ease: easings.enter,
                            delay: index * 0.08,
                          }
                      : { duration: 0 }
                  }
                />
                {/* The pulse: one dot per link, travelling core → node in turn. */}
                <motion.circle
                  r={2.5}
                  fill="var(--primary)"
                  initial={false}
                  animate={
                    motionSafe
                      ? {
                          cx: [centre, node.x],
                          cy: [centre, node.y],
                          opacity: [0, 1, 0],
                        }
                      : { cx: node.x, cy: node.y, opacity: 0.5 }
                  }
                  transition={
                    motionSafe
                      ? {
                          duration: 1.4,
                          ease: "easeInOut",
                          repeat: Infinity,
                          repeatDelay: (nodes.length - 1) * 1.4,
                          delay: index * 1.4,
                        }
                      : { duration: 0 }
                  }
                />
              </g>
            );
          })}
        </svg>

        {/* The service nodes. */}
        {placed.map((node, index) => {
          const isActive = node.id === activeId;
          const nodeClassName = cn(
            "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-hairline bg-surface-1 px-2.5 py-1 text-[11px] text-ink-2 shadow-raised",
            isActive && "ring-1 ring-hairline-strong",
          );
          const nodeStyle = { left: node.x, top: node.y };
          const nodeInitial = {
            opacity: motionSafe ? 0 : 1,
            scale: motionSafe ? 0.85 : 1,
          };
          const nodeAnimate = { opacity: 1, scale: 1 };
          const nodeTransition = motionSafe
            ? {
                duration: durations.base,
                ease: easings.enter,
                delay: 0.2 + index * 0.07,
              }
            : { duration: 0 };

          if (interactive) {
            return (
              <motion.button
                key={node.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => onNodeSelect?.(node.id)}
                className={cn(
                  nodeClassName,
                  "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
                )}
                style={nodeStyle}
                initial={nodeInitial}
                animate={nodeAnimate}
                transition={nodeTransition}
              >
                {node.label}
              </motion.button>
            );
          }

          return (
            <motion.span
              key={node.id}
              className={nodeClassName}
              style={nodeStyle}
              initial={nodeInitial}
              animate={nodeAnimate}
              transition={nodeTransition}
            >
              {node.label}
            </motion.span>
          );
        })}

        {/* The core. */}
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-hairline-strong bg-surface-0 px-3.5 py-1.5 text-sm font-semibold text-ink shadow-raised">
          {core}
        </span>
      </div>
    </div>
  );
}
