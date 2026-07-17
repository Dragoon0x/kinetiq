"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
const STRIDE = 4;
const MAX_DT = 1 / 30;
const LINK = 104;
const ATTRACT = 140;
const FORCE = 70;
const MIN_SPEED = 6;
const MAX_SPEED = 26;

const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export type ParticleNetworkProps = {
  /** Node count. @default 54 — clamped to [20, 90]. */
  count?: number;
  /** px stage height when standalone. @default 300 */
  height?: number;
  className?: string;
  children?: React.ReactNode;
};

/**
 * A drifting mesh of nodes that link up when they come close — the nearer two
 * nodes, the brighter the thread between them. The pointer draws the nearest
 * nodes toward it, tightening the web, then lets them wander off. Links run an
 * O(n²) pass each frame over a small node set, so it stays cheap.
 *
 * Full canvas discipline: DPR-capped at 2, ResizeObserver-sized, one rAF loop
 * gated on visibility and intersection, colours resolved from CSS variables and
 * re-resolved on theme flips, the pointer in a ref rather than React state, and
 * deterministic seeding. Under reduced motion it paints one settled web.
 */
export function ParticleNetwork({
  count = 54,
  height = 300,
  className,
  children,
}: ParticleNetworkProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = Math.round(clamp(count, 20, 90));

    let nodeColor = "";
    let linkColor = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      nodeColor = read("--accent", "oklch(0.62 0.2 262)");
      linkColor = read("--ink-3", "#8a8f9b");
    };
    resolveColors();

    const nodes = new Float32Array(n * STRIDE);
    let width = 0;
    let stageH = 0;
    let seeded = false;

    const seed = () => {
      if (width <= 0 || stageH <= 0) return;
      if (!seeded) {
        for (let i = 0; i < n; i += 1) {
          const base = i * STRIDE;
          const angle = djb2(i, 1, 23) * TAU;
          const speed = MIN_SPEED + djb2(i, 2, 23) * (MAX_SPEED - MIN_SPEED);
          nodes[base] = djb2(i, 3, 23) * width;
          nodes[base + 1] = djb2(i, 4, 23) * stageH;
          nodes[base + 2] = Math.cos(angle) * speed;
          nodes[base + 3] = Math.sin(angle) * speed;
        }
        seeded = true;
      } else {
        for (let i = 0; i < n; i += 1) {
          const base = i * STRIDE;
          nodes[base] = clamp(nodes[base] ?? 0, 0, width);
          nodes[base + 1] = clamp(nodes[base + 1] ?? 0, 0, stageH);
        }
      }
    };

    const pointer = { x: 0, y: 0, active: false };

    const step = (dt: number) => {
      for (let i = 0; i < n; i += 1) {
        const base = i * STRIDE;
        let x = nodes[base] ?? 0;
        let y = nodes[base + 1] ?? 0;
        let vx = nodes[base + 2] ?? 0;
        let vy = nodes[base + 3] ?? 0;

        if (pointer.active) {
          const dx = pointer.x - x;
          const dy = pointer.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < ATTRACT * ATTRACT && d2 > 1) {
            const d = Math.sqrt(d2);
            const pull = (1 - d / ATTRACT) * FORCE * dt;
            vx += (dx / d) * pull;
            vy += (dy / d) * pull;
          }
        }

        const speed = Math.hypot(vx, vy);
        if (speed > MAX_SPEED) {
          vx = (vx / speed) * MAX_SPEED;
          vy = (vy / speed) * MAX_SPEED;
        } else if (speed < MIN_SPEED && speed > 0) {
          vx = (vx / speed) * MIN_SPEED;
          vy = (vy / speed) * MIN_SPEED;
        }

        x += vx * dt;
        y += vy * dt;
        if (x < 0) x += width;
        else if (x > width) x -= width;
        if (y < 0) y += stageH;
        else if (y > stageH) y -= stageH;

        nodes[base] = x;
        nodes[base + 1] = y;
        nodes[base + 2] = vx;
        nodes[base + 3] = vy;
      }
    };

    const drawFrame = () => {
      if (width <= 0 || stageH <= 0) return;
      ctx.clearRect(0, 0, width, stageH);

      // Links.
      ctx.strokeStyle = linkColor;
      ctx.lineWidth = 1;
      for (let i = 0; i < n; i += 1) {
        const ax = nodes[i * STRIDE] ?? 0;
        const ay = nodes[i * STRIDE + 1] ?? 0;
        for (let j = i + 1; j < n; j += 1) {
          const bx = nodes[j * STRIDE] ?? 0;
          const by = nodes[j * STRIDE + 1] ?? 0;
          const dx = ax - bx;
          const dy = ay - by;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            ctx.globalAlpha = (1 - Math.sqrt(d2) / LINK) * 0.5;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
          }
        }
      }

      // Nodes.
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = nodeColor;
      ctx.beginPath();
      for (let i = 0; i < n; i += 1) {
        const x = nodes[i * STRIDE] ?? 0;
        const y = nodes[i * STRIDE + 1] ?? 0;
        ctx.moveTo(x + 1.8, y);
        ctx.arc(x, y, 1.8, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
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
      for (let s = 0; s < 60; s += 1) step(1 / 60);
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
