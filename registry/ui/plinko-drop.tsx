"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
const MAX_DT = 1 / 30;
const GRAVITY = 900;
const RESTITUTION = 0.62;
const NUDGE = 70;
const DROP_EVERY = 0.22;
const MAX_BALLS = 90;
const PEG_R = 3.5;
const BALL_R = 4;

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

type Ball = { x: number; y: number; vx: number; vy: number; id: number };

export type PlinkoDropProps = {
  /** Peg rows. @default 8 — clamped to [5, 12]. */
  rows?: number;
  /** px stage height when standalone. @default 300 */
  height?: number;
  className?: string;
  children?: React.ReactNode;
};

/**
 * A Galton board. Balls drip from the top, glance off a lattice of pegs with a
 * deterministic left-or-right nudge at each hit, and drop into the bins below —
 * where the tally settles into a bell curve. Click the board to drop one where
 * you point. Each ball's path is seeded from its drop index, so the whole run is
 * reproducible with no Math.random.
 *
 * Full canvas discipline: DPR-capped at 2, ResizeObserver-sized, one rAF loop
 * gated on visibility and intersection, colours resolved from CSS variables and
 * re-resolved on theme flips, bins decaying so the curve keeps breathing. Under
 * reduced motion it paints one settled board with a filled histogram.
 */
export function PlinkoDrop({
  rows = 8,
  height = 300,
  className,
  children,
}: PlinkoDropProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rowCount = Math.round(clamp(rows, 5, 12));
    const pegsPerRow = rowCount;
    const bins = pegsPerRow + 1;

    let accent = "";
    let pegColor = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      accent = read("--accent", "oklch(0.62 0.2 262)");
      pegColor = read("--ink-3", "#8a8f9b");
    };
    resolveColors();

    let width = 0;
    let stageH = 0;
    let binTop = 0;
    let fieldTop = 0;
    let sx = 0;
    let sy = 0;
    const pegX = new Float64Array(rowCount * pegsPerRow);
    const pegY = new Float64Array(rowCount * pegsPerRow);
    const counts = new Float64Array(bins);
    const balls: Ball[] = [];
    let dropId = 0;
    let dropTimer = 0;

    const layout = () => {
      const binH = 46;
      binTop = stageH - binH;
      fieldTop = 34;
      sx = width / (pegsPerRow + 1);
      sy = (binTop - fieldTop - 10) / rowCount;
      for (let r = 0; r < rowCount; r += 1) {
        const offset = r % 2 === 0 ? 0 : sx / 2;
        for (let c = 0; c < pegsPerRow; c += 1) {
          const idx = r * pegsPerRow + c;
          pegX[idx] = sx * (c + 1) + offset;
          pegY[idx] = fieldTop + r * sy;
        }
      }
    };

    const spawn = (x: number) => {
      if (balls.length >= MAX_BALLS) return;
      const jitter = (djb2(dropId, 3, 11) - 0.5) * sx * 0.4;
      balls.push({
        x: clamp(x + jitter, BALL_R, width - BALL_R),
        y: fieldTop - 14,
        vx: (djb2(dropId, 5, 11) - 0.5) * 30,
        vy: 40,
        id: dropId,
      });
      dropId += 1;
    };

    const settleInto = (ball: Ball) => {
      const bin = clamp(Math.floor(ball.x / (width / bins)), 0, bins - 1);
      counts[bin] = (counts[bin] ?? 0) + 1;
    };

    const step = (dt: number) => {
      const decay = Math.pow(0.72, dt);
      for (let b = 0; b < bins; b += 1) counts[b] = (counts[b] ?? 0) * decay;

      dropTimer += dt;
      if (dropTimer >= DROP_EVERY) {
        dropTimer = 0;
        spawn(width / 2);
      }

      let w = 0;
      for (let i = 0; i < balls.length; i += 1) {
        const ball = balls[i];
        if (!ball) continue;
        ball.vy += GRAVITY * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;

        // Collide with the nearest overlapping peg.
        for (let p = 0; p < pegX.length; p += 1) {
          const dx = ball.x - (pegX[p] ?? 0);
          const dy = ball.y - (pegY[p] ?? 0);
          const min = PEG_R + BALL_R;
          if (dx * dx + dy * dy < min * min) {
            const d = Math.hypot(dx, dy) || 0.001;
            const nx = dx / d;
            const ny = dy / d;
            ball.x = (pegX[p] ?? 0) + nx * min;
            ball.y = (pegY[p] ?? 0) + ny * min;
            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx = (ball.vx - 2 * dot * nx) * RESTITUTION;
            ball.vy = (ball.vy - 2 * dot * ny) * RESTITUTION;
            const dir = djb2(ball.id, p, 29) < 0.5 ? -1 : 1;
            ball.vx += dir * NUDGE;
            break;
          }
        }

        if (ball.x < BALL_R) {
          ball.x = BALL_R;
          ball.vx *= -RESTITUTION;
        } else if (ball.x > width - BALL_R) {
          ball.x = width - BALL_R;
          ball.vx *= -RESTITUTION;
        }

        if (ball.y >= binTop - BALL_R) {
          settleInto(ball);
          continue;
        }
        balls[w] = ball;
        w += 1;
      }
      balls.length = w;
    };

    const drawFrame = () => {
      if (width <= 0 || stageH <= 0) return;
      ctx.clearRect(0, 0, width, stageH);

      // Bins.
      let maxCount = 1;
      for (let b = 0; b < bins; b += 1) maxCount = Math.max(maxCount, counts[b] ?? 0);
      const binW = width / bins;
      const binH = stageH - binTop;
      ctx.fillStyle = accent;
      for (let b = 0; b < bins; b += 1) {
        const h = ((counts[b] ?? 0) / maxCount) * (binH - 4);
        ctx.globalAlpha = 0.18 + 0.32 * ((counts[b] ?? 0) / maxCount);
        ctx.fillRect(b * binW + 1, stageH - h, binW - 2, h);
      }
      ctx.globalAlpha = 1;

      // Pegs.
      ctx.fillStyle = pegColor;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (let p = 0; p < pegX.length; p += 1) {
        ctx.moveTo((pegX[p] ?? 0) + PEG_R, pegY[p] ?? 0);
        ctx.arc(pegX[p] ?? 0, pegY[p] ?? 0, PEG_R, 0, TAU);
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      // Balls.
      ctx.fillStyle = accent;
      ctx.beginPath();
      for (let i = 0; i < balls.length; i += 1) {
        const ball = balls[i];
        if (!ball) continue;
        ctx.moveTo(ball.x + BALL_R, ball.y);
        ctx.arc(ball.x, ball.y, BALL_R, 0, TAU);
      }
      ctx.fill();
    };

    const onPointerDown = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      spawn(clamp(e.clientX - rect.left, BALL_R, width - BALL_R));
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

    // A deterministic bell curve for the static (reduced-motion) frame.
    const settleStatic = () => {
      if (width <= 0 || stageH <= 0) return;
      for (let b = 0; b < bins; b += 1) counts[b] = 0;
      for (let d = 0; d < 240; d += 1) {
        let pos = (pegsPerRow + 1) / 2;
        for (let r = 0; r < rowCount; r += 1) {
          pos += djb2(d, r, 29) < 0.5 ? -0.5 : 0.5;
        }
        const bin = clamp(Math.round(pos), 0, bins - 1);
        counts[bin] = (counts[bin] ?? 0) + 1;
      }
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
      layout();
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
    container.addEventListener("pointerdown", onPointerDown);
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
      container.removeEventListener("pointerdown", onPointerDown);
    };
  }, [rows, motionSafe]);

  return (
    <div
      ref={containerRef}
      className={cn("relative cursor-pointer", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full"
      />
      {children != null && <div className="relative z-10 h-full">{children}</div>}
    </div>
  );
}
