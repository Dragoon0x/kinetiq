"use client";

import * as React from "react";

import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type CalloutSide = "top" | "right" | "bottom" | "left";
type CalloutAlign = "start" | "center" | "end";

type SideConfig = {
  container: string;
  align: Record<CalloutAlign, string>;
  /** Whether the leader line renders before the card in flow order. */
  leaderFirst: boolean;
  /** Elbow polyline, drawn from the anchor edge toward the card. */
  points: string;
};

const SIDES: Record<CalloutSide, SideConfig> = {
  top: {
    container: "bottom-full flex-col",
    align: {
      start: "left-0 items-start",
      center: "left-1/2 -translate-x-1/2 items-center",
      end: "right-0 items-end",
    },
    leaderFirst: false,
    points: "8,16 13,11 13,1",
  },
  bottom: {
    container: "top-full flex-col",
    align: {
      start: "left-0 items-start",
      center: "left-1/2 -translate-x-1/2 items-center",
      end: "right-0 items-end",
    },
    leaderFirst: true,
    points: "8,0 13,5 13,15",
  },
  right: {
    container: "left-full flex-row",
    align: {
      start: "top-0 items-start",
      center: "top-1/2 -translate-y-1/2 items-center",
      end: "bottom-0 items-end",
    },
    leaderFirst: true,
    points: "0,8 5,13 15,13",
  },
  left: {
    container: "right-full flex-row",
    align: {
      start: "top-0 items-start",
      center: "top-1/2 -translate-y-1/2 items-center",
      end: "bottom-0 items-end",
    },
    leaderFirst: false,
    points: "16,8 11,13 1,13",
  },
};

const CURSOR_OFFSETS: Record<CalloutSide, string> = {
  top: "translate(-50%, calc(-100% - 12px))",
  bottom: "translate(-50%, 12px)",
  right: "translate(12px, -50%)",
  left: "translate(calc(-100% - 12px), -50%)",
};

function originFor(side: CalloutSide, align: CalloutAlign): string {
  const cross = align === "start" ? "0%" : align === "end" ? "100%" : "50%";
  switch (side) {
    case "top":
      return `${cross} 100%`;
    case "bottom":
      return `${cross} 0%`;
    case "left":
      return `100% ${cross}`;
    case "right":
      return `0% ${cross}`;
  }
}

export type CalloutProps = Omit<
  React.ComponentPropsWithoutRef<"span">,
  "content"
> & {
  ref?: React.Ref<HTMLSpanElement>;
  /** Label content. Text only — the card is never interactive or focusable. */
  content: React.ReactNode;
  side?: CalloutSide;
  align?: CalloutAlign;
  /** Hover open delay in ms. Keyboard focus always opens immediately. @default 150 */
  delay?: number;
  /** Label trails the pointer on a drift-damped spring; the leader line is omitted. */
  followCursor?: boolean;
  disabled?: boolean;
  /** Extra classes for the floating card, not the trigger wrapper. */
  className?: string;
  children: React.ReactNode;
};

/**
 * A label with a leader line. On open, the card pops from the anchor origin
 * on `flick` while a 45°-elbow leader line draws itself from the anchor edge
 * like a schematic annotation; closing fades and retracts the line.
 * `followCursor` trades the leader for a drift-damped pointer trail.
 *
 * Purely descriptive: never put interactive content inside. The card renders
 * without a portal (absolutely positioned inside an inline-block wrapper), so
 * ancestors with `overflow: hidden` or stacking contexts can clip it. Extra
 * wrapper props (`tabIndex`, `aria-label`, …) pass through to the trigger
 * span so plain content can become a focusable, described target.
 */
export function Callout({
  ref,
  content,
  side = "top",
  align = "center",
  delay = 150,
  followCursor = false,
  disabled = false,
  className,
  children,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  onFocus,
  onBlur,
  ...rest
}: CalloutProps) {
  const motionSafe = useMotionSafe();
  const tooltipId = React.useId();
  const [hoverOpen, setHoverOpen] = React.useState(false);
  const [focusOpen, setFocusOpen] = React.useState(false);
  const open = !disabled && (hoverOpen || focusOpen);

  // With reduced motion, followCursor pins to the anchor like a plain callout.
  const cursorMode = followCursor && motionSafe;

  const hoverTimer = React.useRef<number | null>(null);
  const clearHoverTimer = React.useCallback(() => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }, []);
  React.useEffect(() => clearHoverTimer, [clearHoverTimer]);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const { stiffness, damping, mass } = springs.drift;
  const followX = useSpring(pointerX, { stiffness, damping, mass });
  const followY = useSpring(pointerY, { stiffness, damping, mass });

  const trackPointer = (
    event: React.PointerEvent<HTMLSpanElement>,
    jump: boolean,
  ) => {
    if (!cursorMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (jump) {
      pointerX.jump(x);
      pointerY.jump(y);
    } else {
      pointerX.set(x);
      pointerY.set(y);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      clearHoverTimer();
      setHoverOpen(false);
      setFocusOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, clearHoverTimer]);

  const sideConfig = SIDES[side];
  const showLeader = !followCursor;

  const card = (
    <motion.div
      role="tooltip"
      id={tooltipId}
      style={{
        transformOrigin: originFor(side, cursorMode ? "center" : align),
      }}
      initial={motionSafe ? { scale: 0.96, opacity: 0 } : { opacity: 0 }}
      animate={
        motionSafe
          ? {
              scale: 1,
              opacity: 1,
              transition: {
                scale: springs.flick,
                opacity: { duration: durations.fast, ease: easings.enter },
              },
            }
          : { opacity: 1, transition: { duration: durations.fast } }
      }
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      className={cn(
        "bg-popover text-popover-foreground border-border max-w-56 rounded-2 border px-2.5 py-1.5 text-xs shadow-sm",
        className,
      )}
    >
      {content}
    </motion.div>
  );

  const leader = showLeader ? (
    <svg
      aria-hidden
      width={16}
      height={16}
      viewBox="0 0 16 16"
      className="shrink-0"
    >
      <motion.polyline
        points={sideConfig.points}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.4}
        strokeWidth={1}
        initial={motionSafe ? { pathLength: 0 } : { opacity: 0 }}
        animate={
          motionSafe
            ? {
                pathLength: 1,
                transition: { duration: durations.blink, ease: easings.enter },
              }
            : { opacity: 1, transition: { duration: durations.fast } }
        }
        exit={
          motionSafe
            ? { pathLength: 0, transition: exitFor(durations.fast) }
            : { opacity: 0, transition: exitFor(durations.fast) }
        }
      />
    </svg>
  ) : null;

  return (
    <span
      {...rest}
      ref={ref}
      className="relative inline-block"
      aria-describedby={open ? tooltipId : undefined}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (disabled) return;
        trackPointer(event, true);
        clearHoverTimer();
        hoverTimer.current = window.setTimeout(
          () => setHoverOpen(true),
          delay,
        );
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (!disabled) trackPointer(event, false);
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        clearHoverTimer();
        setHoverOpen(false);
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (disabled) return;
        if (cursorMode && !hoverOpen) {
          // Keyboard focus has no pointer — pin the trail to the anchor.
          const rect = event.currentTarget.getBoundingClientRect();
          pointerX.jump(rect.width / 2);
          pointerY.jump(rect.height / 2);
        }
        setFocusOpen(true);
      }}
      onBlur={(event) => {
        onBlur?.(event);
        setFocusOpen(false);
      }}
    >
      {children}
      <AnimatePresence>
        {open &&
          (cursorMode ? (
            <motion.span
              key="callout-cursor"
              className="pointer-events-none absolute top-0 left-0 z-50 block"
              style={{ x: followX, y: followY }}
            >
              <span
                className="block"
                style={{ transform: CURSOR_OFFSETS[side] }}
              >
                {card}
              </span>
            </motion.span>
          ) : (
            <span
              key="callout"
              className={cn(
                "pointer-events-none absolute z-50 flex",
                sideConfig.container,
                sideConfig.align[align],
              )}
            >
              {sideConfig.leaderFirst ? leader : card}
              {sideConfig.leaderFirst ? card : leader}
            </span>
          ))}
      </AnimatePresence>
    </span>
  );
}
