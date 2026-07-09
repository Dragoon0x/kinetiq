"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Perception radius (px). Doubles as the spatial-hash cell size. */
const PERCEPTION = 48;
/** Neighbours closer than this push apart (separation kicks in). */
const SEPARATION = 22;
/** Pointer repels boids within this radius; the tint band matches it. */
const FLEE_RADIUS = 120;
const MIN_SPEED = 26;
const MAX_SPEED = 78;
/** Max steering force applied per rule, per second — keeps turns smooth. */
const MAX_FORCE = 90;
/** Boid triangle half-length along the heading, in px. */
const BOID_LEN = 5;
/** Clamp the frame dt so a long paused/background gap can't teleport boids. */
const MAX_DT = 1 / 30;
/** Stride of the boid buffer: x, y, vx, vy. */
const STRIDE = 4;

/**
 * djb2 over a small integer tuple, folded to [0, 1), finished with a
 * two-round avalanche so sequential indices decorrelate. All initial boid
 * positions and headings derive from this — deterministic and SSR-safe, no
 * Math.random anywhere near seeding.
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

export type SwarmFieldProps = {
  /** Boid count. @default 80 — clamped to [10, 100]. */
  count?: number;
  className?: string;
  /** px stage height when standalone (no sizing parent). @default 320 */
  height?: number;
  /** Overlay content, rendered above the canvas. */
  children?: React.ReactNode;
};

/**
 * A flock of boids drawn on canvas — classic Reynolds murmuration
 * (separation · alignment · cohesion) plus a flee force that scatters the
 * flock away from the pointer, then lets it regroup. Neighbour queries run
 * through a spatial hash (cell = perception radius) so the flock stays ~O(n);
 * the hash is a linked-list-in-arrays rebuilt in place each frame, so the hot
 * loop allocates nothing. Boids draw as small triangles pointing along their
 * velocity in `--ink-2`; those inside the flee radius tint toward `--signal`.
 *
 * Mirrors the canvas discipline of Wavefield: DPR-aware (capped at 2) and
 * sized by a ResizeObserver; one rAF loop paused while the document is hidden
 * or the field is offscreen; colors resolve from CSS variables once per mount
 * and again when the html class flips theme. The pointer lives in a ref and
 * is updated by a listener — never React state.
 *
 * Perf: budget ≤3ms/frame at ~800×500 with up to 100 boids. Each boid visits
 * the 9 cells around it rather than all n peers, and every buffer (boids,
 * hash heads, hash next-links) is sized on resize and reused thereafter.
 *
 * Reduced motion: exactly one static frame — a single settled, deterministic
 * arrangement of boids. The loop never starts and no observers watch it.
 */
export function SwarmField({
  count = 80,
  className,
  height = 320,
  children,
}: SwarmFieldProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // All canvas work lives here: sizing, theming, the sim, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = Math.round(clamp(count, 10, 100));

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let boidColor = "";
    let signal = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      // Body of the flock in ink-2; the flee band tints toward signal.
      boidColor = read("--ink-2", "#8a8f9b");
      signal = read("--signal", "#37d39b");
    };
    resolveColors();

    // --- buffers: boids + spatial hash, allocated here, reused per frame --
    // Boid state, stride 4: x, y, vx, vy.
    const boids = new Float32Array(n * STRIDE);
    let width = 0;
    let height2 = 0;

    // Spatial hash as a linked list in typed arrays (zero per-frame alloc):
    // cellHead[cell] = index of first boid in that cell (or -1); boidNext[i]
    // = next boid in the same cell. Rebuilt in place each frame.
    let gridCols = 0;
    let gridRows = 0;
    let cellHead = new Int32Array(0);
    const boidNext = new Int32Array(n);

    /**
     * Seed boids into the current stage: deterministic djb2 positions, and
     * headings on a hash-derived angle at a mid-range speed. Called on every
     * resize, but only actually scatters boids the first time we have a real
     * stage — afterwards it just clamps any boid the shrink left outside.
     */
    let seeded = false;
    const seed = () => {
      if (width <= 0 || height2 <= 0) return;
      if (!seeded) {
        for (let i = 0; i < n; i++) {
          const base = i * STRIDE;
          const angle = djb2(i, 1, 17) * TAU;
          const speed = MIN_SPEED + djb2(i, 2, 17) * (MAX_SPEED - MIN_SPEED);
          boids[base] = djb2(i, 3, 17) * width;
          boids[base + 1] = djb2(i, 4, 17) * height2;
          boids[base + 2] = Math.cos(angle) * speed;
          boids[base + 3] = Math.sin(angle) * speed;
        }
        seeded = true;
      } else {
        // Keep boids on the new stage after a resize without re-scattering.
        for (let i = 0; i < n; i++) {
          const base = i * STRIDE;
          boids[base] = clamp(boids[base] ?? 0, 0, width);
          boids[base + 1] = clamp(boids[base + 1] ?? 0, 0, height2);
        }
      }
    };

    const rebuildGrid = () => {
      gridCols = Math.max(1, Math.ceil(width / PERCEPTION));
      gridRows = Math.max(1, Math.ceil(height2 / PERCEPTION));
      const cells = gridCols * gridRows;
      if (cellHead.length < cells) cellHead = new Int32Array(cells);
    };

    const cellOf = (x: number, y: number) => {
      const cx = clamp(Math.floor(x / PERCEPTION), 0, gridCols - 1);
      const cy = clamp(Math.floor(y / PERCEPTION), 0, gridRows - 1);
      return cy * gridCols + cx;
    };

    // --- one imperative simulation step -----------------------------------
    const perceptionSq = PERCEPTION * PERCEPTION;
    const separationSq = SEPARATION * SEPARATION;
    const fleeRadiusSq = FLEE_RADIUS * FLEE_RADIUS;
    const margin = PERCEPTION; // edge turn-back band

    // Limit a raw force vector to MAX_FORCE (scaled by dt at the call site).
    const step = (dt: number) => {
      // Rebuild the hash in place from current positions.
      const cells = gridCols * gridRows;
      for (let c = 0; c < cells; c++) cellHead[c] = -1;
      for (let i = 0; i < n; i++) {
        const cell = cellOf(boids[i * STRIDE] ?? 0, boids[i * STRIDE + 1] ?? 0);
        boidNext[i] = cellHead[cell] ?? -1;
        cellHead[cell] = i;
      }

      const ptr = pointer.active ? pointer : null;

      for (let i = 0; i < n; i++) {
        const base = i * STRIDE;
        const x = boids[base] ?? 0;
        const y = boids[base + 1] ?? 0;
        const vx = boids[base + 2] ?? 0;
        const vy = boids[base + 3] ?? 0;

        // Accumulators for the three Reynolds rules.
        let sepX = 0;
        let sepY = 0;
        let aliX = 0;
        let aliY = 0;
        let cohX = 0;
        let cohY = 0;
        let neighbours = 0;

        // Visit the 3×3 block of cells around this boid only.
        const cx = clamp(Math.floor(x / PERCEPTION), 0, gridCols - 1);
        const cy = clamp(Math.floor(y / PERCEPTION), 0, gridRows - 1);
        for (let gy = cy - 1; gy <= cy + 1; gy++) {
          if (gy < 0 || gy >= gridRows) continue;
          for (let gx = cx - 1; gx <= cx + 1; gx++) {
            if (gx < 0 || gx >= gridCols) continue;
            let j = cellHead[gy * gridCols + gx] ?? -1;
            while (j !== -1) {
              if (j !== i) {
                const jb = j * STRIDE;
                const dx = x - (boids[jb] ?? 0);
                const dy = y - (boids[jb + 1] ?? 0);
                const d2 = dx * dx + dy * dy;
                if (d2 < perceptionSq && d2 > 0) {
                  neighbours++;
                  aliX += boids[jb + 2] ?? 0;
                  aliY += boids[jb + 3] ?? 0;
                  cohX += boids[jb] ?? 0;
                  cohY += boids[jb + 1] ?? 0;
                  if (d2 < separationSq) {
                    // Push away, weighted by 1/distance so closer boids shove
                    // harder: (unit vector away) / distance = delta / d2.
                    sepX += dx / d2;
                    sepY += dy / d2;
                  }
                }
              }
              j = boidNext[j] ?? -1;
            }
          }
        }

        // Steering force this frame (pre-dt). Each rule yields a "desired
        // minus current velocity" vector, individually clamped to MAX_FORCE,
        // then weighted into the total.
        let fx = 0;
        let fy = 0;

        if (neighbours > 0) {
          const inv = 1 / neighbours;
          // Alignment: match the neighbours' mean heading.
          {
            const f = limit(aliX * inv - vx, aliY * inv - vy, MAX_FORCE);
            fx += f.x * 0.7;
            fy += f.y * 0.7;
          }
          // Cohesion: steer toward the neighbours' centre of mass.
          {
            const f = limit(cohX * inv - x - vx, cohY * inv - y - vy, MAX_FORCE);
            fx += f.x * 0.55;
            fy += f.y * 0.55;
          }
        }
        // Separation: steer away from close neighbours.
        if (sepX !== 0 || sepY !== 0) {
          const f = limit(
            sepX * MAX_SPEED - vx,
            sepY * MAX_SPEED - vy,
            MAX_FORCE,
          );
          fx += f.x * 1.6;
          fy += f.y * 1.6;
        }

        // Flee: a strong steer away from the pointer inside the flee radius.
        if (ptr) {
          const dx = x - ptr.x;
          const dy = y - ptr.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < fleeRadiusSq && d2 > 0) {
            const d = Math.sqrt(d2);
            // Falloff: hardest at the pointer, zero at the radius edge.
            const strength = (1 - d / FLEE_RADIUS) * MAX_SPEED * 2.4;
            const f = limit((dx / d) * strength - vx, (dy / d) * strength - vy, MAX_FORCE * 3);
            fx += f.x;
            fy += f.y;
          }
        }

        // Soft edge turn-back: nudge the heading inward near the walls so the
        // flock stays on stage without a hard bounce.
        if (x < margin) fx += (MAX_FORCE * 0.9 * (margin - x)) / margin;
        else if (x > width - margin)
          fx -= (MAX_FORCE * 0.9 * (x - (width - margin))) / margin;
        if (y < margin) fy += (MAX_FORCE * 0.9 * (margin - y)) / margin;
        else if (y > height2 - margin)
          fy -= (MAX_FORCE * 0.9 * (y - (height2 - margin))) / margin;

        // Integrate velocity, clamp speed to [min, max].
        let nvx = vx + fx * dt;
        let nvy = vy + fy * dt;
        const speed = Math.hypot(nvx, nvy);
        if (speed > MAX_SPEED) {
          nvx = (nvx / speed) * MAX_SPEED;
          nvy = (nvy / speed) * MAX_SPEED;
        } else if (speed < MIN_SPEED && speed > 0) {
          nvx = (nvx / speed) * MIN_SPEED;
          nvy = (nvy / speed) * MIN_SPEED;
        }

        // Integrate position; a gentle wrap catches any boid the turn-back
        // did not fully contain, so nothing ever escapes for good.
        let nx = x + nvx * dt;
        let ny = y + nvy * dt;
        if (nx < -margin) nx += width + margin * 2;
        else if (nx > width + margin) nx -= width + margin * 2;
        if (ny < -margin) ny += height2 + margin * 2;
        else if (ny > height2 + margin) ny -= height2 + margin * 2;

        boids[base] = nx;
        boids[base + 1] = ny;
        boids[base + 2] = nvx;
        boids[base + 3] = nvy;
      }
    };

    // Reused scratch for limit() so the hot loop allocates nothing. Returns
    // the same object each call — read .x/.y immediately, don't hold it.
    const forceScratch = { x: 0, y: 0 };
    function limit(fx: number, fy: number, max: number) {
      const m = Math.hypot(fx, fy);
      if (m > max && m > 0) {
        forceScratch.x = (fx / m) * max;
        forceScratch.y = (fy / m) * max;
      } else {
        forceScratch.x = fx;
        forceScratch.y = fy;
      }
      return forceScratch;
    }

    // --- draw the flock ----------------------------------------------------
    const drawFrame = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      const ptr = pointer.active ? pointer : null;

      for (let i = 0; i < n; i++) {
        const base = i * STRIDE;
        const x = boids[base] ?? 0;
        const y = boids[base + 1] ?? 0;
        const vx = boids[base + 2] ?? 0;
        const vy = boids[base + 3] ?? 0;
        const angle = Math.atan2(vy, vx);

        // Tint toward signal inside the flee band; falloff sets the mix/alpha.
        let color = boidColor;
        let alpha = 0.72;
        if (ptr) {
          const dx = x - ptr.x;
          const dy = y - ptr.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < fleeRadiusSq) {
            const t = 1 - Math.sqrt(d2) / FLEE_RADIUS;
            color = signal;
            alpha = 0.72 + t * 0.28;
          }
        }

        // Small triangle pointing along the velocity.
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const tipX = x + cos * BOID_LEN;
        const tipY = y + sin * BOID_LEN;
        // Two tail corners, splayed off the heading by ~140°.
        const back = BOID_LEN * 0.8;
        const spread = BOID_LEN * 0.62;
        const nx = -sin;
        const ny = cos;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(x - cos * back + nx * spread, y - sin * back + ny * spread);
        ctx.lineTo(x - cos * back - nx * spread, y - sin * back - ny * spread);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // --- pointer: tracked in a plain object, updated by a listener --------
    const pointer = { x: 0, y: 0, active: false };
    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
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
        // Drop the accumulated gap so the flock resumes rather than jumps.
        last = null;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    /**
     * Settle boids into a calm, deterministic arrangement for the static
     * (reduced-motion) frame — no loop, no pointer. A handful of fixed sim
     * steps with the pointer inactive lets the flock relax off its seed.
     */
    const settleStatic = () => {
      if (width <= 0 || height2 <= 0) return;
      for (let s = 0; s < 90; s++) step(1 / 60);
      drawFrame();
    };

    // Sizing — DPR-aware (capped at 2). Geometry + seeding live here only.
    const measure = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      height2 = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // setTransform, not scale — idempotent across repeated measures.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuildGrid();
      seed();
      // Reduced motion redraws its single settled frame; the live loop just
      // picks the new size up on its next frame.
      if (!motionSafe) settleStatic();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawFrame();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts — no gates, no pointer.
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
    <div
      ref={containerRef}
      className={cn("relative", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      {children != null && (
        <div className="relative z-10 h-full">{children}</div>
      )}
    </div>
  );
}
