"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const MAX_DT = 1 / 30;
const TRAIL = 8;
const SPEED = 48;
const MARGIN = 20;
const FIELD_SCALE = 0.006;

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

export type FlowFieldProps = {
  /** Particle count. @default 110 — clamped to [40, 240]. */
  count?: number;
  /** px stage height when standalone. @default 300 */
  height?: number;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Streaks combed by an invisible current. Each particle reads a smooth,
 * slowly-evolving angle field and drifts along it, trailing a fading tail; when
 * one runs off the edge or ages out it respawns elsewhere, so the field keeps
 * flowing. The field is a closed-form sum of sines — deterministic, no noise
 * tables and no Math.random.
 *
 * Full canvas discipline: DPR-capped at 2, ResizeObserver-sized, one rAF loop
 * gated on visibility and intersection, the accent colour resolved from a CSS
 * variable and re-resolved on theme flips, a sim-time clock that only advances
 * while running, and deterministic seeding. Under reduced motion it paints one
 * settled comb of trails.
 */
export function FlowField({
  count = 110,
  height = 300,
  className,
  children,
}: FlowFieldProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = Math.round(clamp(count, 40, 240));

    let stroke = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const value = style.getPropertyValue("--accent").trim();
      stroke = value === "" ? "oklch(0.62 0.2 262)" : value;
    };
    resolveColors();

    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const life = new Float32Array(n);
    const lifespan = new Float32Array(n);
    const respawns = new Int32Array(n);
    const trail = new Float32Array(n * TRAIL * 2);
    let head = 0;
    let clock = 0;
    let width = 0;
    let stageH = 0;
    let seeded = false;

    const field = (x: number, y: number, t: number): number =>
      (Math.sin(x * FIELD_SCALE + t * 0.15) +
        Math.cos(y * FIELD_SCALE * 1.3 - t * 0.12) +
        Math.sin((x + y) * FIELD_SCALE * 0.7 + t * 0.05)) *
      1.2;

    const placeTrail = (i: number, x: number, y: number) => {
      for (let s = 0; s < TRAIL; s += 1) {
        const b = (i * TRAIL + s) * 2;
        trail[b] = x;
        trail[b + 1] = y;
      }
    };

    const seed = () => {
      if (width <= 0 || stageH <= 0) return;
      if (!seeded) {
        for (let i = 0; i < n; i += 1) {
          const x = djb2(i, 1, 41) * width;
          const y = djb2(i, 2, 41) * stageH;
          px[i] = x;
          py[i] = y;
          lifespan[i] = 3.5 + djb2(i, 3, 41) * 3;
          life[i] = djb2(i, 4, 41) * (lifespan[i] ?? 4);
          respawns[i] = 0;
          placeTrail(i, x, y);
        }
        seeded = true;
      }
    };

    const step = (dt: number) => {
      clock += dt;
      for (let i = 0; i < n; i += 1) {
        let x = px[i] ?? 0;
        let y = py[i] ?? 0;
        const angle = field(x, y, clock);
        x += Math.cos(angle) * SPEED * dt;
        y += Math.sin(angle) * SPEED * dt;
        life[i] = (life[i] ?? 0) + dt;
        if (
          x < -MARGIN ||
          x > width + MARGIN ||
          y < -MARGIN ||
          y > stageH + MARGIN ||
          (life[i] ?? 0) > (lifespan[i] ?? 4)
        ) {
          respawns[i] = (respawns[i] ?? 0) + 1;
          const r = respawns[i] ?? 1;
          x = djb2(i, r, 53) * width;
          y = djb2(i, r + 101, 53) * stageH;
          life[i] = 0;
          placeTrail(i, x, y);
        }
        px[i] = x;
        py[i] = y;
      }
      head = (head + 1) % TRAIL;
      for (let i = 0; i < n; i += 1) {
        const b = (i * TRAIL + head) * 2;
        trail[b] = px[i] ?? 0;
        trail[b + 1] = py[i] ?? 0;
      }
    };

    const drawFrame = () => {
      if (width <= 0 || stageH <= 0) return;
      ctx.clearRect(0, 0, width, stageH);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.4;
      ctx.lineCap = "round";
      for (let i = 0; i < n; i += 1) {
        const firstSlot = (head + 1) % TRAIL;
        let prevX = trail[(i * TRAIL + firstSlot) * 2] ?? 0;
        let prevY = trail[(i * TRAIL + firstSlot) * 2 + 1] ?? 0;
        for (let k = 2; k <= TRAIL; k += 1) {
          const slot = (head + k) % TRAIL;
          const x = trail[(i * TRAIL + slot) * 2] ?? 0;
          const y = trail[(i * TRAIL + slot) * 2 + 1] ?? 0;
          ctx.globalAlpha = ((k - 1) / (TRAIL - 1)) * 0.7;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
          prevX = x;
          prevY = y;
        }
      }
      ctx.globalAlpha = 1;
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
      for (let s = 0; s < 40; s += 1) step(1 / 60);
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
