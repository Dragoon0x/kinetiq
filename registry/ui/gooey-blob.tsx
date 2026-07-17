"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const MAX_DT = 1 / 30;
const STIFF = 60;
const DAMP_BASE = 0.0006;
const ATTRACT = 128;

const djb2 = (a: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export type GooeyBlobProps = {
  /** Blob count including the pointer follower. @default 5 — clamped to [3, 7]. */
  count?: number;
  /** px stage height when standalone. @default 300 */
  height?: number;
  className?: string;
  children?: React.ReactNode;
};

/**
 * A cluster of metaballs that behave like one gooey mass. The lead blob chases
 * the pointer; the others hold a loose ring and get drawn in when it passes,
 * necks stretching between them and snapping as they part — merge and split
 * with no seams. The union is drawn as a single filled path of circles bridged
 * by tangent-matched bezier necks; the physics is a lightly damped spring.
 *
 * Full canvas discipline: DPR-capped at 2 and sized by a ResizeObserver; one
 * rAF loop paused while hidden or offscreen; the accent colour resolves from a
 * CSS variable and re-resolves on theme flips; the pointer lives in a ref, never
 * React state; seeding is deterministic. Under reduced motion it paints one
 * settled arrangement and never animates.
 */
export function GooeyBlob({
  count = 5,
  height = 300,
  className,
  children,
}: GooeyBlobProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = Math.round(clamp(count, 3, 7));

    let fill = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const value = style.getPropertyValue("--accent").trim();
      fill = value === "" ? "oklch(0.62 0.2 262)" : value;
    };
    resolveColors();

    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    const vxs = new Float64Array(n);
    const vys = new Float64Array(n);
    const rs = new Float64Array(n);
    const homeX = new Float64Array(n);
    const homeY = new Float64Array(n);

    let width = 0;
    let stageH = 0;
    let seeded = false;

    const seed = () => {
      if (width <= 0 || stageH <= 0) return;
      const cx = width / 2;
      const cy = stageH / 2;
      const ring = Math.min(width, stageH) * 0.26;
      for (let i = 0; i < n; i += 1) {
        if (i === 0) {
          rs[i] = Math.min(width, stageH) * 0.16;
          homeX[i] = cx;
          homeY[i] = cy;
        } else {
          const a = ((i - 1) / (n - 1)) * TAU;
          rs[i] = Math.min(width, stageH) * (0.1 + djb2(i, 7) * 0.04);
          homeX[i] = cx + Math.cos(a) * ring;
          homeY[i] = cy + Math.sin(a) * ring;
        }
        if (!seeded) {
          xs[i] = homeX[i] ?? cx;
          ys[i] = homeY[i] ?? cy;
          vxs[i] = 0;
          vys[i] = 0;
        }
      }
      seeded = true;
    };

    const pointer = { x: 0, y: 0, active: false };

    const step = (dt: number) => {
      const damp = Math.pow(DAMP_BASE, dt);
      const fx = xs[0] ?? 0;
      const fy = ys[0] ?? 0;
      for (let i = 0; i < n; i += 1) {
        let tx: number;
        let ty: number;
        if (i === 0) {
          tx = pointer.active ? pointer.x : (homeX[0] ?? 0);
          ty = pointer.active ? pointer.y : (homeY[0] ?? 0);
        } else {
          tx = homeX[i] ?? 0;
          ty = homeY[i] ?? 0;
          const dxf = fx - (xs[i] ?? 0);
          const dyf = fy - (ys[i] ?? 0);
          const df = Math.hypot(dxf, dyf);
          if (df < ATTRACT) {
            const t = (1 - df / ATTRACT) * 0.6;
            tx += (fx - tx) * t;
            ty += (fy - ty) * t;
          }
        }
        let vx = vxs[i] ?? 0;
        let vy = vys[i] ?? 0;
        vx = (vx + (tx - (xs[i] ?? 0)) * STIFF * dt) * damp;
        vy = (vy + (ty - (ys[i] ?? 0)) * STIFF * dt) * damp;
        let x = (xs[i] ?? 0) + vx * dt;
        let y = (ys[i] ?? 0) + vy * dt;
        const r = rs[i] ?? 0;
        if (x < r) {
          x = r;
          vx *= -0.3;
        } else if (x > width - r) {
          x = width - r;
          vx *= -0.3;
        }
        if (y < r) {
          y = r;
          vy *= -0.3;
        } else if (y > stageH - r) {
          y = stageH - r;
          vy *= -0.3;
        }
        xs[i] = x;
        ys[i] = y;
        vxs[i] = vx;
        vys[i] = vy;
      }
    };

    // Tangent-matched neck between two circles (canonical vector metaball).
    const neck = (i: number, j: number) => {
      const x1 = xs[i] ?? 0;
      const y1 = ys[i] ?? 0;
      const r1 = rs[i] ?? 0;
      const x2 = xs[j] ?? 0;
      const y2 = ys[j] ?? 0;
      const r2 = rs[j] ?? 0;
      const d = Math.hypot(x2 - x1, y2 - y1);
      if (d === 0 || d > (r1 + r2) * 1.7) return;
      let u1 = 0;
      let u2 = 0;
      if (d < r1 + r2) {
        u1 = Math.acos(clamp((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d), -1, 1));
        u2 = Math.acos(clamp((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d), -1, 1));
      }
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const maxSpread = Math.acos(clamp((r1 - r2) / d, -1, 1));
      const v = 0.5;
      const a1 = angle + u1 + (maxSpread - u1) * v;
      const a2 = angle - u1 - (maxSpread - u1) * v;
      const a3 = angle + Math.PI - u2 - (Math.PI - u2 - maxSpread) * v;
      const a4 = angle - Math.PI + u2 + (Math.PI - u2 - maxSpread) * v;
      const p1x = x1 + Math.cos(a1) * r1;
      const p1y = y1 + Math.sin(a1) * r1;
      const p2x = x1 + Math.cos(a2) * r1;
      const p2y = y1 + Math.sin(a2) * r1;
      const p3x = x2 + Math.cos(a3) * r2;
      const p3y = y2 + Math.sin(a3) * r2;
      const p4x = x2 + Math.cos(a4) * r2;
      const p4y = y2 + Math.sin(a4) * r2;
      const total = r1 + r2;
      const d2 = Math.min(
        v * 2.4,
        Math.hypot(p1x - p3x, p1y - p3y) / total,
      );
      const h1 = r1 * d2;
      const h2 = r2 * d2;
      ctx.moveTo(p1x, p1y);
      ctx.bezierCurveTo(
        p1x - Math.cos(a1 - HALF_PI) * h1,
        p1y - Math.sin(a1 - HALF_PI) * h1,
        p3x + Math.cos(a3 + HALF_PI) * h2,
        p3y + Math.sin(a3 + HALF_PI) * h2,
        p3x,
        p3y,
      );
      ctx.lineTo(p4x, p4y);
      ctx.bezierCurveTo(
        p4x - Math.cos(a4 - HALF_PI) * h2,
        p4y - Math.sin(a4 - HALF_PI) * h2,
        p2x + Math.cos(a2 + HALF_PI) * h1,
        p2y + Math.sin(a2 + HALF_PI) * h1,
        p2x,
        p2y,
      );
      ctx.closePath();
    };

    const drawFrame = () => {
      if (width <= 0 || stageH <= 0) return;
      ctx.clearRect(0, 0, width, stageH);
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        ctx.moveTo((xs[i] ?? 0) + (rs[i] ?? 0), ys[i] ?? 0);
        ctx.arc(xs[i] ?? 0, ys[i] ?? 0, rs[i] ?? 0, 0, TAU);
      }
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) neck(i, j);
      }
      ctx.fill("nonzero");
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };

    let raf = 0;
    let last: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (last === null) last = now;
      const dt = Math.min(MAX_DT, (now - last) / 1000);
      last = now;
      step(dt);
      drawFrame();
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        last = null;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const settleStatic = () => {
      if (width <= 0 || stageH <= 0) return;
      for (let s = 0; s < 80; s += 1) step(1 / 60);
      drawFrame();
    };

    const measure = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      stageH = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      if (!motionSafe) settleStatic();
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawFrame();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    if (motionSafe) {
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerleave", onPointerLeave);
      intersection = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [count, motionSafe]);

  return (
    <div ref={containerRef} className={cn("relative", className)} style={{ height }}>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {children != null && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
}
