"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

type SlipstreamContextValue = {
  registerItem: (element: HTMLElement) => () => void;
  targetItem: (element: HTMLElement) => void;
};

const SlipstreamContext = React.createContext<SlipstreamContextValue | null>(
  null,
);

function useSlipstream(component: string): SlipstreamContextValue {
  const context = React.useContext(SlipstreamContext);
  if (!context) {
    throw new Error(`<${component}> must be rendered inside <Slipstream>.`);
  }
  return context;
}

type PillRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
};

export type SlipstreamProps = React.ComponentPropsWithoutRef<"div"> & {
  /** Pill corner radius in px. */
  radius?: number;
  /** Px the pill tucks inside each item's rect (negative bleeds outside). */
  inset?: number;
  /** Parks the pill and ignores hover and focus. */
  disabled?: boolean;
};

/**
 * A highlight that rides in your wake. One accent pill sits behind a group of
 * links or buttons and chases whichever item is hovered or holds focus — the
 * two-edge gantry stretch generalized to 2D. On each move the edge pair on
 * the axis that moved most staggers: the leading edge sets off on `glide`
 * while the trailing edge follows 60ms later, so the pill stretches toward
 * its target and contracts to fit; the cross-axis edges glide without delay.
 * First entry fades in at `durations.fast` already in place; leaving the
 * whole group fades out via `exitFor`. The pill is pure decoration
 * (`aria-hidden`, `z-0`) behind `z-10` items and imposes no roles on
 * children. Reduced motion teleports it between rects with the same fast
 * fades and no trailing stretch.
 */
export function Slipstream({
  radius = 8,
  inset = 0,
  disabled = false,
  className,
  children,
  onPointerLeave,
  onFocus,
  onBlur,
  ...props
}: SlipstreamProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const itemsRef = React.useRef(new Set<HTMLElement>());
  const observerRef = React.useRef<ResizeObserver | null>(null);
  const hoverRef = React.useRef<HTMLElement | null>(null);
  const focusRef = React.useRef<HTMLElement | null>(null);
  const preferRef = React.useRef<"hover" | "focus">("hover");
  const activeRef = React.useRef<HTMLElement | null>(null);
  const visibleRef = React.useRef(false);
  const lastRef = React.useRef<PillRect | null>(null);

  // Four edges as insets from the container, à la gantry-tabs, plus opacity.
  const left = useMotionValue(0);
  const top = useMotionValue(0);
  const right = useMotionValue(0);
  const bottom = useMotionValue(0);
  const opacity = useMotionValue(0);

  const show = (element: HTMLElement, animated: boolean) => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const target: PillRect = {
      left: rect.left - containerRect.left + inset,
      top: rect.top - containerRect.top + inset,
      right: containerRect.right - rect.right + inset,
      bottom: containerRect.bottom - rect.bottom + inset,
      cx: rect.left + rect.width / 2,
      cy: rect.top + rect.height / 2,
    };
    const previous = lastRef.current;
    const wasVisible = visibleRef.current;
    activeRef.current = element;
    lastRef.current = target;
    visibleRef.current = true;

    if (!wasVisible || previous === null) {
      // First entry: land at the target rect instantly, then fade in.
      left.jump(target.left);
      top.jump(target.top);
      right.jump(target.right);
      bottom.jump(target.bottom);
      animate(opacity, 1, { duration: durations.fast, ease: easings.enter });
      return;
    }
    if (
      previous.left === target.left &&
      previous.top === target.top &&
      previous.right === target.right &&
      previous.bottom === target.bottom
    ) {
      return;
    }
    if (!animated || !motionSafe) {
      // Reduced motion (and resize corrections): teleport, no stretch.
      left.jump(target.left);
      top.jump(target.top);
      right.jump(target.right);
      bottom.jump(target.bottom);
      return;
    }
    // Two-edge glide in 2D: the axis with the dominant delta staggers — the
    // edge facing the move leads, its opposite trails 60ms — so the pill
    // stretches toward the target, then contracts to fit.
    const trailing = { ...springs.glide, delay: 0.06 };
    const dx = target.cx - previous.cx;
    const dy = target.cy - previous.cy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      const forward = dx >= 0;
      animate(forward ? right : left, forward ? target.right : target.left, {
        ...springs.glide,
      });
      animate(
        forward ? left : right,
        forward ? target.left : target.right,
        trailing,
      );
      animate(top, target.top, { ...springs.glide });
      animate(bottom, target.bottom, { ...springs.glide });
    } else {
      const forward = dy >= 0;
      animate(forward ? bottom : top, forward ? target.bottom : target.top, {
        ...springs.glide,
      });
      animate(
        forward ? top : bottom,
        forward ? target.top : target.bottom,
        trailing,
      );
      animate(left, target.left, { ...springs.glide });
      animate(right, target.right, { ...springs.glide });
    }
  };

  const hide = () => {
    if (!visibleRef.current) return;
    visibleRef.current = false;
    activeRef.current = null;
    lastRef.current = null;
    animate(opacity, 0, exitFor(durations.fast));
  };

  const retarget = (animated: boolean) => {
    if (disabled) {
      hide();
      return;
    }
    const hovered = hoverRef.current;
    const focused = focusRef.current;
    const next =
      preferRef.current === "focus"
        ? (focused ?? hovered)
        : (hovered ?? focused);
    if (next && next.isConnected) show(next, animated);
    else hide();
  };

  // Latest-ref engine so stable callbacks and observers see fresh props.
  const engine = { retarget, hide };
  const engineRef = React.useRef(engine);
  React.useEffect(() => {
    engineRef.current = engine;
  });

  const registerItem = React.useCallback((element: HTMLElement) => {
    itemsRef.current.add(element);
    observerRef.current?.observe(element);
    return () => {
      itemsRef.current.delete(element);
      observerRef.current?.unobserve(element);
      if (hoverRef.current === element) hoverRef.current = null;
      if (focusRef.current === element) focusRef.current = null;
      if (activeRef.current === element) engineRef.current.retarget(false);
    };
  }, []);

  const targetItem = React.useCallback((element: HTMLElement) => {
    hoverRef.current = element;
    preferRef.current = "hover";
    engineRef.current.retarget(true);
  }, []);

  // Layout shifts re-measure the resting pill without re-animating it.
  React.useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => engineRef.current.retarget(false));
    observerRef.current = observer;
    const container = containerRef.current;
    if (container) observer.observe(container);
    for (const item of itemsRef.current) observer.observe(item);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!disabled) return;
    hoverRef.current = null;
    focusRef.current = null;
    engineRef.current.hide();
  }, [disabled]);

  const findItem = (node: EventTarget | null): HTMLElement | null => {
    if (!(node instanceof HTMLElement)) return null;
    const wrapper = node.closest<HTMLElement>("[data-slipstream-item]");
    return wrapper && itemsRef.current.has(wrapper) ? wrapper : null;
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    hoverRef.current = null;
    engineRef.current.retarget(true);
  };

  // focusin/focusout (React's bubbling onFocus/onBlur) give keyboard users
  // the exact same targeting as hover.
  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    onFocus?.(event);
    focusRef.current = findItem(event.target);
    preferRef.current = "focus";
    engineRef.current.retarget(true);
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    onBlur?.(event);
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    focusRef.current = null;
    engineRef.current.retarget(true);
  };

  const contextValue = React.useMemo<SlipstreamContextValue>(
    () => ({ registerItem, targetItem }),
    [registerItem, targetItem],
  );

  return (
    <div
      {...props}
      ref={containerRef}
      className={cn("relative isolate", className)}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <motion.div
        aria-hidden
        className="bg-accent pointer-events-none absolute z-0"
        style={{ left, top, right, bottom, opacity, borderRadius: radius }}
      />
      <SlipstreamContext.Provider value={contextValue}>
        {children}
      </SlipstreamContext.Provider>
    </div>
  );
}

export type SlipstreamItemProps = React.ComponentPropsWithoutRef<"div">;

/**
 * Registers a hover/focus target for the pill. Renders a real div wrapper —
 * `display: contents` would break rect measurement — positioned `z-10` so
 * children ride above the pill; pass className to control its sizing.
 */
export function SlipstreamItem({
  className,
  children,
  onPointerEnter,
  ...props
}: SlipstreamItemProps) {
  const { registerItem, targetItem } = useSlipstream("SlipstreamItem");
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return registerItem(element);
  }, [registerItem]);

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerEnter?.(event);
    targetItem(event.currentTarget);
  };

  return (
    <div
      {...props}
      ref={ref}
      data-slipstream-item=""
      className={cn("relative z-10", className)}
      onPointerEnter={handlePointerEnter}
    >
      {children}
    </div>
  );
}
