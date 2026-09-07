"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GrabPanProps = {
  /** Board width, px. */
  width: number;
  /** Board height, px. */
  height: number;
  /** What sits on the board. */
  children: React.ReactNode;
  /** Show the minimap. @default true */
  minimap?: boolean;
  /** Height of the viewport the board is seen through, px. @default 280 */
  viewportHeight?: number;
  /** Fires with the whole-pixel offset whenever it changes. */
  onOffsetChange?: (offset: { x: number; y: number }) => void;
  /** Names the pannable region. @default "Board" */
  label?: string;
  /** Label of the re-centre control. @default "Reset" */
  resetLabel?: string;
  className?: string;
};

/** Travel before a press becomes a pan — under this, a click is still a click. */
const CAPTURE = 4;
/** Give past an edge: the board follows a third of the pointer out there. */
const RUBBER = 0.35;
/** Momentum kept per 60fps frame while the throw is inside the bounds. */
const FRICTION = 0.94;
/** Below this speed (px/ms) the throw is over and the board settles. */
const MIN_SPEED = 0.02;
/** A frame longer than this (a background tab, a stall) must not teleport it. */
const MAX_FRAME = 64;
/** Arrow keys pan by this fraction of the viewport, never less than 40px. */
const KEY_STEP = 0.2;

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/**
 * A board you grab and throw. The drag is one-to-one with the pointer, so the
 * surface stays under the finger; past an edge it follows at a third of the
 * travel, which is how the end of the board is felt rather than announced.
 * Release hands the offset to a requestAnimationFrame loop that decays the
 * release velocity against elapsed time, so a slow frame slows the throw
 * instead of jumping it, and the moment it touches a bound it hands over to
 * `glide` for the last few pixels back.
 *
 * Pointer capture waits for 4px, so a click on the board is never swallowed,
 * and every gesture has a keyboard equal: the viewport is focusable, arrows pan
 * a fifth of the view on `glide`, Home re-centres, and Reset does the same with
 * the mouse. The minimap dot reads the two motion values the board is drawn
 * from, so it cannot drift out of agreement with it. Under reduced motion
 * nothing is thrown and nothing rubber-bands: the board tracks the pointer,
 * stops at the edges, and jumps to its steps.
 */
export function GrabPan({
  width,
  height,
  children,
  minimap = true,
  viewportHeight = 280,
  onOffsetChange,
  label = "Board",
  resetLabel = "Reset",
  className,
}: GrabPanProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const dotLeft = useMotionValue(50);
  const dotTop = useMotionValue(50);
  const dotX = useMotionTemplate`${dotLeft}%`;
  const dotY = useMotionTemplate`${dotTop}%`;

  const [view, setView] = React.useState({ w: 0, h: 0 });
  const [grabbing, setGrabbing] = React.useState(false);

  const minX = Math.min(0, view.w - width);
  const minY = Math.min(0, view.h - height);
  // Opening on the middle of the board is what Reset returns to, so the control
  // always goes somewhere the reader has already been.
  const homeX = clamp((view.w - width) / 2, minX, 0);
  const homeY = clamp((view.h - height) / 2, minY, 0);

  const drag = React.useRef<{
    px: number;
    py: number;
    baseX: number;
    baseY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    vx: number;
    vy: number;
    captured: boolean;
  } | null>(null);
  const frame = React.useRef(0);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const seeded = React.useRef(false);

  const stopAll = React.useCallback(() => {
    if (frame.current) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    running.current.forEach((controls) => controls.stop());
    running.current = [];
  }, []);

  React.useEffect(() => stopAll, [stopAll]);

  const offsetCallback = React.useRef(onOffsetChange);
  React.useEffect(() => {
    offsetCallback.current = onOffsetChange;
  }, [onOffsetChange]);

  // ResizeObserver fires once on observe, so the viewport is measured without
  // setting state inside the effect body.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      const next = { w: viewport.clientWidth, h: viewport.clientHeight };
      setView((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  // One subscription feeds both the minimap and the caller: the dot is derived
  // from the same values the board is drawn from, never from a second copy.
  React.useEffect(() => {
    if (view.w === 0 || view.h === 0) return;
    if (!seeded.current) {
      seeded.current = true;
      x.set(homeX);
      y.set(homeY);
    }
    let lastX = Number.NaN;
    let lastY = Number.NaN;
    const apply = () => {
      const px = x.get();
      const py = y.get();
      dotLeft.set(clamp(((-px + view.w / 2) / width) * 100, 0, 100));
      dotTop.set(clamp(((-py + view.h / 2) / height) * 100, 0, 100));
      const rx = Math.round(px);
      const ry = Math.round(py);
      if (rx === lastX && ry === lastY) return;
      lastX = rx;
      lastY = ry;
      offsetCallback.current?.({ x: rx, y: ry });
    };
    apply();
    const unwatchX = x.on("change", apply);
    const unwatchY = y.on("change", apply);
    return () => {
      unwatchX();
      unwatchY();
    };
  }, [view, width, height, homeX, homeY, x, y, dotLeft, dotTop]);

  const glideTo = (nx: number, ny: number) => {
    stopAll();
    const cx = clamp(nx, minX, 0);
    const cy = clamp(ny, minY, 0);
    if (!motionSafe) {
      x.set(cx);
      y.set(cy);
      return;
    }
    running.current = [
      animate(x, cx, springs.glide),
      animate(y, cy, springs.glide),
    ];
  };

  const throwBoard = (vx: number, vy: number) => {
    stopAll();
    if (!motionSafe) {
      glideTo(x.get(), y.get());
      return;
    }
    let velocityX = vx;
    let velocityY = vy;
    let previous = 0;
    const step = (now: number) => {
      const elapsed = previous === 0 ? 16 : Math.min(MAX_FRAME, now - previous);
      previous = now;
      const decay = FRICTION ** (elapsed / 16.667);
      velocityX *= decay;
      velocityY *= decay;
      const nx = x.get() + velocityX * elapsed;
      const ny = y.get() + velocityY * elapsed;
      x.set(nx);
      y.set(ny);
      const out = nx > 0 || nx < minX || ny > 0 || ny < minY;
      const slow = Math.abs(velocityX) + Math.abs(velocityY) < MIN_SPEED;
      // Touching a bound ends the throw: the spring takes the last pixels, so
      // the board arrives rather than stopping dead against the edge.
      if (out || slow) {
        frame.current = 0;
        glideTo(nx, ny);
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    stopAll();
    drag.current = {
      px: event.clientX,
      py: event.clientY,
      baseX: x.get(),
      baseY: y.get(),
      lastX: x.get(),
      lastY: y.get(),
      lastT: event.timeStamp,
      vx: 0,
      vy: 0,
      captured: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    const dx = event.clientX - state.px;
    const dy = event.clientY - state.py;
    if (!state.captured) {
      if (Math.abs(dx) < CAPTURE && Math.abs(dy) < CAPTURE) return;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // A synthetic sweep can retire the pointer before capture is asked
        // for; the pan works without it, so it is never worth throwing over.
      }
      state.captured = true;
      setGrabbing(true);
    }

    const resist = (value: number, min: number, max: number) => {
      if (!motionSafe) return clamp(value, min, max);
      if (value > max) return max + (value - max) * RUBBER;
      if (value < min) return min + (value - min) * RUBBER;
      return value;
    };
    const nx = resist(state.baseX + dx, minX, 0);
    const ny = resist(state.baseY + dy, minY, 0);

    const elapsed = event.timeStamp - state.lastT;
    if (elapsed > 0) {
      // Smoothed, or a single stuttering frame at release throws the board.
      state.vx = 0.7 * ((nx - state.lastX) / elapsed) + 0.3 * state.vx;
      state.vy = 0.7 * ((ny - state.lastY) / elapsed) + 0.3 * state.vy;
      state.lastX = nx;
      state.lastY = ny;
      state.lastT = event.timeStamp;
    }
    x.set(nx);
    y.set(ny);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    if (state.captured) {
      setGrabbing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      throwBoard(state.vx, state.vy);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Home") {
      event.preventDefault();
      glideTo(homeX, homeY);
      return;
    }
    const stepX = Math.max(40, view.w * KEY_STEP);
    const stepY = Math.max(40, view.h * KEY_STEP);
    // The view moves the way the key points, so the board moves the other way.
    const steps: Record<string, [number, number]> = {
      ArrowRight: [-stepX, 0],
      ArrowLeft: [stepX, 0],
      ArrowDown: [0, -stepY],
      ArrowUp: [0, stepY],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    glideTo(x.get() + step[0], y.get() + step[1]);
  };

  // Wheel is a native listener so it can decline the page's scroll only when
  // the board actually has somewhere left to go on that axis.
  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const onWheel = (event: WheelEvent) => {
      const nx = clamp(x.get() - event.deltaX, minX, 0);
      const ny = clamp(y.get() - event.deltaY, minY, 0);
      if (nx === x.get() && ny === y.get()) return;
      event.preventDefault();
      stopAll();
      x.set(nx);
      y.set(ny);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [minX, minY, x, y, stopAll]);

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div
        ref={viewportRef}
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        style={{ height: viewportHeight }}
        className={cn(
          "relative w-full touch-none overflow-hidden rounded-3 border border-hairline-strong bg-surface-1 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <motion.div
          style={{ x, y, width, height }}
          className="absolute top-0 left-0"
        >
          {children}
        </motion.div>

        {minimap ? (
          <div
            aria-hidden
            className="pointer-events-none absolute right-2 bottom-2 w-16 overflow-hidden rounded-1 border border-hairline-strong bg-surface-0/85"
            style={{ aspectRatio: `${width} / ${height}` }}
          >
            <motion.span
              style={{ left: dotX, top: dotY, x: "-50%", y: "-50%" }}
              className="absolute block size-1.5 rounded-full bg-signal"
            />
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => glideTo(homeX, homeY)}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline-strong bg-surface-1 px-3 text-xs font-medium text-ink transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 shrink-0 fill-none stroke-current"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 8.5v7M8.5 12h7M4.5 12a7.5 7.5 0 1 0 15 0 7.5 7.5 0 1 0-15 0" />
          </svg>
          {resetLabel}
        </button>
        <p id={hintId} className="min-w-0 text-xs text-muted-foreground">
          Drag to pan, or use the arrow keys.
        </p>
      </div>
    </div>
  );
}
