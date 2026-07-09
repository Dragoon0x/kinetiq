"use client";

import * as React from "react";

import { ChevronRight } from "lucide-react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import {
  clamp,
  liftShadowCss,
  mapRange,
  perspectives,
} from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Scale shed per step of depth — the translateZ(−90px · depth) equivalent. */
const SCALE_STEP = 0.045;
/** Deepest scale the rack may reach, whatever the sheet count. */
const SCALE_FLOOR = 0.8;
/** px each sheet beyond the first closed one pulls toward the open sheet. */
const COMPRESS = 10;
/** Ink floor at the deepest rack position. */
const DIM_FLOOR = 0.6;
/** Depth at which the dim ramp bottoms out (5 sheets → max depth 4). */
const DIM_SPAN = 4;

/** The open sheet rides at altitude 0.35 off the stage. */
const SHADOW_LIFT = liftShadowCss(0.35);
/** Same string template at zero size and alpha, so the lift tweens cleanly. */
const SHADOW_REST =
  "0 0px 0px 0px color-mix(in oklab, oklch(0.05 0.02 258) 0%, transparent)";

const FOCUS_MOVES: Record<string, "next" | "prev" | "first" | "last"> = {
  ArrowDown: "next",
  ArrowUp: "prev",
  Home: "first",
  End: "last",
};

export type ZAccordionItem = {
  /** Stable id — becomes the open/defaultOpen handle and the ARIA wiring. */
  id: string;
  /** Header label, shown beside the mono section index. */
  title: string;
  /** Panel content, revealed when this sheet holds the front. */
  content: React.ReactNode;
};

export type ZAccordionProps = {
  /** Sheets in rack order — 3 to 5 read best. */
  items: ZAccordionItem[];
  /** Initially open sheet id when uncontrolled. Defaults to the first sheet. */
  defaultOpen?: string;
  /** Controlled open sheet id. */
  open?: string;
  /** Fires when a different sheet takes the front. */
  onOpenChange?: (id: string) => void;
  className?: string;
};

/**
 * An accordion that trades the stack-down for a step-back: sheets are flat
 * instrument cards on a shallow perspective stage, and opening one glides it
 * to the front — scale 1, full ink, `liftShadowCss(0.35)` — while every
 * closed sheet recedes in Z. Recession is scale-based (0.045 shed per step of
 * depth, the translateZ(−90px · depth) read), so each sheet transforms
 * independently, no preserve-3d needed, and the stage's
 * `perspective(perspectives.base)` stays Safari-safe. Composition: sheets
 * before the open one rack above it, sheets after rack below — document
 * order never lies — and each closed run compresses 10px per step toward the
 * open sheet so headers peek as a stepped stack that can never reach the
 * open content (10px of pull vs a full header pitch of clearance per step;
 * deeper sheets sit behind via z-index). Ink dims with depth on `mapRange`.
 *
 * The whole regroup is one coordinated move: scale and y share a single
 * `glide` spring with a per-depth stagger of `cascade(n) / 2`, the open
 * panel's height rides the same `glide` (measure-free `height: "auto"`)
 * inside a clipping div ON the sheet, and content ink fades on
 * `durations.base`. The chevron snaps 90° when its sheet fronts.
 *
 * Semantics: the WAI-ARIA accordion pattern. h3-wrapped header buttons carry
 * aria-expanded/aria-controls; panels are role="region" aria-labelledby.
 * Exactly one sheet is open at a time — activating the open header is a
 * no-op, never a collapse-to-none. ArrowUp/ArrowDown move header focus
 * (wrapping), Home/End jump to the ends, Enter/Space open. Closed panels
 * stay rendered: `hidden` on the flat path; on the spatial path they hold
 * height 0 with aria-hidden + inert so the collapse can animate.
 *
 * Reduced motion: a flat accordion — no scale, recession, stagger, or height
 * animation; sections sit in plain document flow, panels toggle instantly,
 * and content appears with a duration-fast fade. Same semantics throughout.
 */
export function ZAccordion({
  items,
  defaultOpen,
  open,
  onOpenChange,
  className,
}: ZAccordionProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);

  const [uncontrolledOpen, setUncontrolledOpen] = React.useState<string>(
    () => defaultOpen ?? items[0]?.id ?? "",
  );
  const openId = open !== undefined ? open : uncontrolledOpen;
  const openIndex = items.findIndex((item) => item.id === openId);

  const requestOpen = (id: string) => {
    // Exactly one sheet holds the front — reopening it is a no-op.
    if (id === openId) return;
    if (open === undefined) setUncontrolledOpen(id);
    onOpenChange?.(id);
  };

  const focusMove = (
    current: HTMLButtonElement,
    to: "next" | "prev" | "first" | "last",
  ) => {
    const root = rootRef.current;
    if (!root) return;
    const headers = Array.from(
      root.querySelectorAll<HTMLButtonElement>("[data-z-accordion-header]"),
    );
    if (headers.length === 0) return;
    let target: HTMLButtonElement | undefined;
    if (to === "first") target = headers[0];
    else if (to === "last") target = headers[headers.length - 1];
    else {
      const index = headers.indexOf(current);
      if (index === -1) return;
      const offset = to === "next" ? 1 : -1;
      target = headers[(index + offset + headers.length) % headers.length];
    }
    target?.focus();
  };

  const handleHeaderKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const to = FOCUS_MOVES[event.key];
    if (!to) return;
    event.preventDefault();
    focusMove(event.currentTarget, to);
  };

  /** Per-depth stagger — half the cascade interval keeps it one move. */
  const lag = cascade(items.length) / 2;

  return (
    <div
      ref={rootRef}
      className={cn("flex w-full flex-col gap-2", className)}
      style={motionSafe ? { perspective: perspectives.base } : undefined}
    >
      {items.map((item, index) => {
        const isOpen = item.id === openId;
        const depth = openIndex === -1 ? index + 1 : Math.abs(index - openIndex);
        // Sheets before the open one compress downward toward it; after, upward.
        const side = index < openIndex ? 1 : -1;
        const y =
          motionSafe && depth > 1 ? side * (depth - 1) * COMPRESS : 0;
        const scale = motionSafe
          ? clamp(1 - depth * SCALE_STEP, SCALE_FLOOR, 1)
          : 1;
        const dim = motionSafe ? mapRange(depth, 0, DIM_SPAN, 1, DIM_FLOOR) : 1;
        const delay = depth * lag;
        const headerId = `${uid}-header-${item.id}`;
        const panelId = `${uid}-panel-${item.id}`;

        return (
          <motion.div
            key={item.id}
            initial={false}
            animate={{
              scale,
              y,
              opacity: dim,
              boxShadow: isOpen ? SHADOW_LIFT : SHADOW_REST,
            }}
            transition={
              motionSafe
                ? {
                    scale: { ...springs.glide, delay },
                    y: { ...springs.glide, delay },
                    opacity: { duration: durations.base, delay },
                    boxShadow: { duration: durations.base, delay },
                  }
                : { duration: 0 }
            }
            style={{ zIndex: items.length - depth }}
            className={cn(
              "relative rounded-3 border border-hairline transition-colors",
              isOpen ? "bg-surface-2" : "bg-surface-1",
            )}
          >
            {/* Accent hairline on the open sheet's left edge. */}
            <motion.span
              aria-hidden
              initial={false}
              animate={{ opacity: isOpen ? 1 : 0 }}
              transition={{
                duration: motionSafe ? durations.base : durations.fast,
              }}
              className="pointer-events-none absolute inset-y-2 left-0 w-0.5 rounded-full bg-cobalt"
            />

            <h3 className="m-0">
              <button
                type="button"
                id={headerId}
                data-z-accordion-header=""
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => requestOpen(item.id)}
                onKeyDown={handleHeaderKeyDown}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 rounded-3 px-4 py-3 text-left",
                  "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                )}
              >
                <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-medium",
                    isOpen ? "text-ink" : "text-ink-2",
                  )}
                >
                  {item.title}
                </span>
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                  className="shrink-0 text-ink-3"
                >
                  <ChevronRight className="size-4" />
                </motion.span>
              </button>
            </h3>

            {/* Clipping div lives ON the sheet — the card itself stays flat. */}
            <motion.div
              role="region"
              id={panelId}
              aria-labelledby={headerId}
              hidden={!motionSafe && !isOpen}
              aria-hidden={motionSafe ? !isOpen : undefined}
              inert={motionSafe ? !isOpen : undefined}
              initial={false}
              animate={{ height: motionSafe ? (isOpen ? "auto" : 0) : "auto" }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
              className="overflow-hidden"
            >
              <motion.div
                initial={false}
                animate={{ opacity: isOpen ? 1 : 0 }}
                transition={{
                  duration: motionSafe ? durations.base : durations.fast,
                }}
                className="border-t border-hairline px-4 pt-3 pb-4 text-sm text-ink-2"
              >
                {item.content}
              </motion.div>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
