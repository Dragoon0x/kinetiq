"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type TrailInkProps = {
  /** Panel height in px. @default 260 */
  height?: number;
  /** Seconds a stroke takes to dry and fade. @default 1.4 */
  fade?: number;
  className?: string;
  "aria-label"?: string;
};

type InkPoint = { x: number; y: number; born: number; width: number };

/**
 * A brush that lays wet ink under the pointer and lets it dry away. Each sample
 * is stamped with a birth time; the loop advances a clock, tapers every segment
 * by how fast you were moving, and fades it out as it ages, so a fast flick
 * leaves a thin quick line and a slow drag a heavier one — then the whole stroke
 * dries to nothing.
 *
 * It is a proper canvas citizen: capped to 2x pixel density, resized by a
 * ResizeObserver, and gated by an IntersectionObserver and the tab's visibility
 * so the loop never runs off-screen or in the background — and it idle-stops the
 * moment the last stroke has dried, waking only when you draw again. Colours are
 * read from the theme and re-resolved on a light/dark flip. Under reduced motion
 * there is no drying loop at all: the pointer leaves a still mark and moves on.
 */
export function TrailInk({
  height = 260,
  fade = 1.4,
  className,
  "aria-label": ariaLabel = "Ink trail",
}: TrailInkProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let heightPx = 0;
    let dpr = 1;
    const points: InkPoint[] = [];
    let ink = "oklch(0.6 0.13 258)";

    const resolveInk = () => {
      const styles = getComputedStyle(container);
      ink = styles.getPropertyValue("--primary").trim() || ink;
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      heightPx = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(heightPx * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // A rebasable clock: accumulated seconds that pauses with the loop.
    let clock = 0;
    let last = 0;
    let raf = 0;
    let running = false;
    let inView = true;
    let lastX = 0;
    let lastY = 0;
    let hasLast = false;

    const paint = () => {
      ctx.clearRect(0, 0, width, heightPx);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1];
        const b = points[i];
        if (!a || !b) continue;
        const age = clock - b.born;
        const alpha = 1 - age / fade;
        if (alpha <= 0) continue;
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = ink;
        ctx.lineWidth = b.width * alpha;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      clock += dt;
      // Drop dried points from the front.
      while (points.length > 0 && clock - (points[0]?.born ?? 0) > fade) {
        points.shift();
      }
      paint();
      if (points.length > 1) {
        raf = requestAnimationFrame(frame);
      } else {
        running = false;
        points.length = 0;
        hasLast = false;
      }
    };

    const wake = () => {
      if (running || !inView || document.hidden || !motionSafe) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const addPoint = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const dist = hasLast ? Math.hypot(x - lastX, y - lastY) : 0;
      // Fast strokes run thin, slow ones heavy — a calligraphic taper.
      const strokeWidth = Math.max(1.5, 7 - dist * 0.35);
      lastX = x;
      lastY = y;
      hasLast = true;

      if (!motionSafe) {
        // No drying loop under reduced motion: lay a still mark and stop.
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = ink;
        ctx.lineCap = "round";
        ctx.lineWidth = strokeWidth;
        if (points.length > 0) {
          const prev = points[points.length - 1];
          if (prev) {
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        points.push({ x, y, born: 0, width: strokeWidth });
        return;
      }

      points.push({ x, y, born: clock, width: strokeWidth });
      wake();
    };

    const onPointerMove = (event: PointerEvent) =>
      addPoint(event.clientX, event.clientY);
    const onPointerLeave = () => {
      hasLast = false;
    };

    resize();
    resolveInk();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      if (!motionSafe) {
        ctx.clearRect(0, 0, width, heightPx);
        points.length = 0;
      }
    });
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
        if (inView) wake();
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container);

    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const themeObserver = new MutationObserver(resolveInk);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [motionSafe, fade]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      style={{ height }}
      className={cn(
        "border-hairline bg-surface-0 relative w-full overflow-hidden rounded-3 border",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full touch-none"
      />
      <p className="text-ink-3 pointer-events-none absolute inset-x-0 bottom-3 text-center font-mono text-[10px] tracking-[0.08em] uppercase">
        Draw across the panel
      </p>
    </div>
  );
}
