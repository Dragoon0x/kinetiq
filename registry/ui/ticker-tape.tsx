"use client";

import * as React from "react";

import { Pause, Play } from "lucide-react";
import { motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

/** Release velocity is clamped to a believable throw. */
const MAX_FLING = 2000;
/** Hover friction: velocity eases toward its target over ~0.3s. */
const FRICTION_TAU = 0.1;
/** Post-fling momentum bleeds off slower, like a heavy reel. */
const MOMENTUM_TAU = 0.45;
/** Below this deviation from duty, a fling counts as settled. */
const SETTLED = 8;

const EDGE_MASK =
  "linear-gradient(to right, transparent, black 10%, black 90%, transparent)";

export type TickerTapeProps = {
  /** Duty cruising speed in px/s. */
  speed?: number;
  direction?: "left" | "right";
  /** Gap in px between items and between loop copies. */
  gap?: number;
  /** Ease down to 30% duty speed while hovered — drag, not a hard stop. */
  pauseOnHover?: boolean;
  className?: string;
  children: React.ReactNode;
};

/**
 * A marquee with friction. One rAF loop integrates the tape's velocity:
 * hover applies drag (easing toward 30% duty), grabbing tracks the pointer
 * 1:1, and release carries momentum that decays exponentially back to duty —
 * flung backward, it runs backward and recovers. A pause button surfaces on
 * hover or keyboard focus. Reduced motion renders a static wrapped grid.
 */
export function TickerTape({
  speed = 60,
  direction = "left",
  gap = 24,
  pauseOnHover = true,
  className,
  children,
}: TickerTapeProps) {
  const motionSafe = useMotionSafe();
  const [copies, setCopies] = React.useState(2);
  const [paused, setPaused] = React.useState(false);
  const [grabbing, setGrabbing] = React.useState(false);

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const sequenceRef = React.useRef<HTMLDivElement | null>(null);

  const x = useMotionValue(0);
  /** Accumulated travel in px; positive drags the tape rightward. */
  const position = React.useRef(0);
  /** One sequence width + gap — the wrap modulus. */
  const loopWidth = React.useRef(0);
  /** Current velocity in px/s; positive moves the tape left. */
  const velocity = React.useRef(0);
  const momentum = React.useRef(false);
  const hovered = React.useRef(false);
  const dragging = React.useRef(false);
  const pausedRef = React.useRef(false);
  const pointer = React.useRef({ x: 0, t: 0, v: 0 });

  const applyX = React.useCallback(() => {
    const w = loopWidth.current;
    if (w <= 0) return;
    // Wrap into (-w, 0] so the leading copy always covers the left edge.
    x.set(((position.current % w) - w) % w);
  }, [x]);

  // Measure the first sequence and duplicate it to fill 2× the viewport.
  React.useEffect(() => {
    if (!motionSafe) return;
    const viewport = viewportRef.current;
    const sequence = sequenceRef.current;
    if (!viewport || !sequence) return;
    const measure = () => {
      const w = sequence.offsetWidth + gap;
      loopWidth.current = w;
      setCopies(Math.max(2, Math.ceil((viewport.offsetWidth * 2) / Math.max(w, 1))));
      applyX();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(sequence);
    return () => observer.disconnect();
  }, [motionSafe, gap, applyX]);

  // The single rAF loop — paused entirely while the document is hidden.
  React.useEffect(() => {
    if (!motionSafe) return;
    let raf = 0;
    let last: number | null = null;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (last === null) {
        last = now;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      if (dragging.current) return;
      const duty = direction === "left" ? speed : -speed;
      const target = pausedRef.current
        ? 0
        : hovered.current && pauseOnHover
          ? duty * 0.3
          : duty;
      // Exponential approach: friction toward target, framerate-independent.
      const tau = momentum.current ? MOMENTUM_TAU : FRICTION_TAU;
      velocity.current += (target - velocity.current) * (1 - Math.exp(-dt / tau));
      if (momentum.current && Math.abs(velocity.current - target) < SETTLED) {
        momentum.current = false;
      }
      position.current -= velocity.current * dt;
      applyX();
    };

    const start = () => {
      if (raf) return;
      last = null;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionSafe, speed, direction, pauseOnHover, applyX]);

  const togglePaused = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    momentum.current = false;
    setPaused(next);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging.current = true;
    momentum.current = false;
    pointer.current = { x: event.clientX, t: event.timeStamp, v: 0 };
    setGrabbing(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current) {
      const dx = event.clientX - pointer.current.x;
      const dt = (event.timeStamp - pointer.current.t) / 1000;
      if (dt > 0) {
        // Smooth the instantaneous pointer velocity so the fling reads intent.
        const instant = dx / dt;
        pointer.current.v = pointer.current.v * 0.4 + instant * 0.6;
      }
      pointer.current.x = event.clientX;
      pointer.current.t = event.timeStamp;
      position.current += dx;
      applyX();
    }
  };

  const handlePointerEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setGrabbing(false);
    // Pointer moving right (+v) keeps the tape moving right (−loop velocity).
    velocity.current = Math.max(
      -MAX_FLING,
      Math.min(MAX_FLING, -pointer.current.v),
    );
    momentum.current = true;
  };

  // Reduced motion: no marquee — each unique child once, wrapped statically.
  if (!motionSafe) {
    return (
      <div
        className={cn("flex w-full flex-wrap items-center", className)}
        style={{ gap }}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={cn("group relative w-full", className)}>
      <div
        ref={viewportRef}
        className={cn(
          "w-full overflow-hidden select-none",
          grabbing ? "cursor-grabbing" : "cursor-grab",
        )}
        style={{
          maskImage: EDGE_MASK,
          WebkitMaskImage: EDGE_MASK,
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerEnter={() => (hovered.current = true)}
        onPointerLeave={() => (hovered.current = false)}
      >
        <motion.div className="flex w-max items-center" style={{ x, gap }}>
          {Array.from({ length: copies }, (_, index) => (
            <div
              key={index}
              ref={index === 0 ? sequenceRef : undefined}
              aria-hidden={index > 0 || undefined}
              className="flex shrink-0 items-center"
              style={{ gap }}
            >
              {children}
            </div>
          ))}
        </motion.div>
      </div>
      <button
        type="button"
        aria-pressed={paused}
        aria-label="Pause ticker"
        onClick={togglePaused}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          "border-border bg-background/90 text-muted-foreground absolute top-1 right-1 z-10 inline-flex size-6 items-center justify-center rounded-1 border backdrop-blur-sm",
          "hover:text-foreground pointer-events-none opacity-0 transition-opacity duration-150",
          "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "focus-visible:pointer-events-auto focus-visible:opacity-100",
        )}
      >
        {paused ? (
          <Play className="size-3" aria-hidden />
        ) : (
          <Pause className="size-3" aria-hidden />
        )}
      </button>
    </div>
  );
}
