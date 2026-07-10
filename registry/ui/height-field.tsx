"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Target grid cell in CSS px — the grid scales with the element, capped 64×40. */
const CELL_PX = 12;
/** Simulation runs on a fixed 60Hz step so melt tempo matches every display. */
const STEP = 1 / 60;
const MAX_SUBSTEPS = 4;
/** Peak height added under the brush centre per simulation frame while held. */
const SCULPT_RATE = 0.1;
/** Per-frame blend of each cell toward its 4-neighbour average. */
const DIFFUSE = 0.08;
/** Mean |field − base| per point below which the surface counts as settled. */
const SETTLE_EPS_PER_POINT = 5e-5;
/** Resting floor under the seeded bumps, so the lowest isoline always draws. */
const BASE_FLOOR = 0.04;

/**
 * Marching-squares lookup. For each 4-bit corner code (tl 8 · tr 4 · br 2 ·
 * bl 1), the pairs of edges (0 top, 1 right, 2 bottom, 3 left) the iso-line
 * crosses. Ambiguous saddles (5, 10) emit both segments.
 */
const CONTOUR_SEGMENTS: readonly (readonly number[])[] = [
  [],
  [3, 2],
  [2, 1],
  [3, 1],
  [0, 1],
  [0, 1, 3, 2],
  [0, 2],
  [0, 3],
  [0, 3],
  [0, 2],
  [0, 3, 2, 1],
  [0, 1],
  [3, 1],
  [2, 1],
  [3, 2],
  [],
];

type SculptMode = "raise" | "carve";

const MODES: readonly SculptMode[] = ["raise", "carve"];

export type HeightFieldProps = {
  /** Isoline count — evenly spaced thresholds across the 0..1 height range. @default 5 */
  levels?: number;
  /** Brush radius in px. @default 42 */
  brush?: number;
  /** Per-frame retention of the sculpted deviation — closer to 1 melts slower. @default 0.985 */
  relax?: number;
  /** px stage height. @default 240 */
  height?: number;
  className?: string;
  /** Accessible name for the field. @default "Sculptable height field" */
  "aria-label"?: string;
};

/**
 * A canvas surface you sculpt by pointer: press and drag to RAISE the ground
 * under a gaussian brush (Alt or the right button CARVES instead, as does the
 * chip pair above the stage), and survey isolines — marching squares over the
 * height grid — redraw live as the terrain settles. Unlike RippleSurface,
 * where taps spend transient wave energy, the sculpt here is PERSISTENT
 * material: every frame it diffuses toward its 4-neighbour average and relaxes
 * back toward a low seeded base terrain, so a raised ridge slowly melts into
 * the resting relief rather than propagating away.
 *
 * Mirrors the canvas discipline of Wavefield: the canvas is DPR-aware (capped
 * at 2) and sized by a ResizeObserver via setTransform; colors resolve from
 * CSS variables once per mount and re-resolve when the html class flips theme;
 * the one rAF loop pauses (with clock rebase) while the document is hidden or
 * the stage is offscreen. On top of that it idle-stops: once the total
 * deviation from base drops under epsilon with no pointer down, the field
 * snaps to base, draws one final frame, and cancels the loop until the next
 * pointerdown — a settled surface costs nothing.
 *
 * Perf: budget ≤3ms/frame at 800×500. The grid caps at 64×40 points, so a
 * simulation step is ~2.5k cells of arithmetic, and rendering is `levels`
 * marching passes over ≤63×39 cells batched into one beginPath/stroke per
 * level (hairlines for most, ONE accent level in --accent-bright, plus a
 * faint wash filling cells below the lowest threshold). The hot loop
 * allocates nothing — buffers are grown only on resize.
 *
 * Determinism: the base terrain is a few gentle gaussian bumps drawn from
 * seeded(djb2(useId())) in normalized coordinates — identical on every visit
 * and at every size. No Math.random or Date.now anywhere; performance.now()
 * only stamps the loop clock.
 *
 * Reduced motion: exactly one static frame of the seeded terrain — no loop,
 * no pointer wiring, chips disabled — and the sr-only description says so.
 */
export function HeightField({
  levels = 5,
  brush = 42,
  relax = 0.985,
  height = 240,
  className,
  "aria-label": ariaLabel = "Sculptable height field",
}: HeightFieldProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const descId = `${uid}desc`;
  const [mode, setMode] = React.useState<SculptMode>("raise");

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  // Chip mode mirrored into a ref by the click handler so the loop reads it
  // without retriggering the canvas effect. +1 raises, −1 carves.
  const modeRef = React.useRef<1 | -1>(1);
  // Live pointer state — refs only, never React state, so dragging at 120Hz
  // renders nothing. `sign` is resolved per event (Alt/right button carve).
  const pointerRef = React.useRef({ down: false, x: 0, y: 0, sign: 1 });

  const selectMode = (next: SculptMode) => {
    setMode(next);
    modeRef.current = next === "carve" ? -1 : 1;
  };

  // All canvas work lives here: sizing, theming, the grid, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const lvls = Math.round(clamp(levels, 1, 12));
    const accentAt = Math.floor(lvls / 2);
    const brushR = clamp(brush, 8, 160);
    const retention = clamp(relax, 0.5, 0.999);

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let line = "";
    let bright = "";
    let wash = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      line = read("--hairline-strong", read("--border", "rgba(127,127,127,0.3)"));
      bright = read("--accent-bright", read("--primary", "#6478f0"));
      wash = read("--accent-wash", "oklch(0.6 0.2 262 / 0.12)");
    };
    resolveColors();

    // --- the seeded base terrain -------------------------------------------
    // A few gentle bumps in normalized coordinates, drawn once per instance
    // from the house PRNG — resize re-rasterizes the SAME relief, and the
    // t=0 / reduced-motion frame is identical on every visit.
    const rng = seeded(djb2(uid));
    const bumpCount = 3 + Math.floor(rng() * 3);
    const bumps: { u: number; v: number; amp: number; rad: number }[] = [];
    for (let i = 0; i < bumpCount; i++) {
      bumps.push({
        u: 0.12 + rng() * 0.76,
        v: 0.12 + rng() * 0.76,
        amp: 0.18 + rng() * 0.16,
        rad: 0.18 + rng() * 0.16,
      });
    }

    // --- geometry: grown only in the ResizeObserver callback ---------------
    let width = 0;
    let stageH = 0;
    let pointsX = 0;
    let pointsY = 0;
    let count = 0;
    let cellW = 0;
    let cellH = 0;
    let eps = 0;
    let field = new Float32Array(0);
    let scratch = new Float32Array(0);
    let base = new Float32Array(0);

    const rebuild = () => {
      pointsX = Math.max(16, Math.min(64, Math.round(width / CELL_PX) + 1));
      pointsY = Math.max(10, Math.min(40, Math.round(stageH / CELL_PX) + 1));
      count = pointsX * pointsY;
      cellW = width / (pointsX - 1);
      cellH = stageH / (pointsY - 1);
      eps = count * SETTLE_EPS_PER_POINT;
      if (field.length < count) {
        field = new Float32Array(count);
        scratch = new Float32Array(count);
        base = new Float32Array(count);
      }
      // Rasterize the bumps at the current size; a resize resets any live
      // sculpt to the base relief (the loop then settles and idles cleanly).
      for (let r = 0; r < pointsY; r++) {
        const y = r / (pointsY - 1);
        for (let c = 0; c < pointsX; c++) {
          const x = c / (pointsX - 1);
          let h = BASE_FLOOR;
          for (const bump of bumps) {
            const dx = (x - bump.u) * width;
            const dy = (y - bump.v) * stageH;
            const sigma = bump.rad * Math.min(width, stageH);
            h += bump.amp * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          }
          const i = r * pointsX + c;
          const v = Math.min(0.62, h);
          base[i] = v;
          field[i] = v;
        }
      }
    };

    // --- simulation: one fixed 60Hz step ------------------------------------
    // Sculpt (gaussian add under the brush), then diffuse each cell 8% toward
    // its 4-neighbour average and relax the remainder toward base. Returns the
    // total |field − base| so the loop can idle-stop once the melt completes.
    const simStep = (): number => {
      const p = pointerRef.current;
      if (p.down) {
        const sigma = brushR * 0.55;
        const inv = 1 / (2 * sigma * sigma);
        const reach = brushR * 1.6;
        const c0 = Math.max(0, Math.floor((p.x - reach) / cellW));
        const c1 = Math.min(pointsX - 1, Math.ceil((p.x + reach) / cellW));
        const r0 = Math.max(0, Math.floor((p.y - reach) / cellH));
        const r1 = Math.min(pointsY - 1, Math.ceil((p.y + reach) / cellH));
        for (let r = r0; r <= r1; r++) {
          const dy = r * cellH - p.y;
          for (let c = c0; c <= c1; c++) {
            const dx = c * cellW - p.x;
            const w = Math.exp(-(dx * dx + dy * dy) * inv);
            const i = r * pointsX + c;
            const next = (field[i] ?? 0) + SCULPT_RATE * p.sign * w;
            field[i] = next < 0 ? 0 : next > 1 ? 1 : next;
          }
        }
      }
      let delta = 0;
      for (let r = 0; r < pointsY; r++) {
        const up = (r > 0 ? r - 1 : r) * pointsX;
        const dn = (r < pointsY - 1 ? r + 1 : r) * pointsX;
        const row = r * pointsX;
        for (let c = 0; c < pointsX; c++) {
          const i = row + c;
          const v = field[i] ?? 0;
          const lf = field[row + (c > 0 ? c - 1 : c)] ?? 0;
          const rt = field[row + (c < pointsX - 1 ? c + 1 : c)] ?? 0;
          const smoothed =
            v +
            ((lf + rt + (field[up + c] ?? 0) + (field[dn + c] ?? 0)) * 0.25 -
              v) *
              DIFFUSE;
          const b = base[i] ?? 0;
          const settled = b + (smoothed - b) * retention;
          scratch[i] = settled;
          delta += Math.abs(settled - b);
        }
      }
      const swap = field;
      field = scratch;
      scratch = swap;
      return delta;
    };

    // Scratch for edgePoint, so the marching loop allocates nothing.
    let edgeX = 0;
    let edgeY = 0;
    const cut = (from: number, to: number, iso: number) => {
      const span = to - from;
      return span === 0 ? 0.5 : Math.min(1, Math.max(0, (iso - from) / span));
    };
    const edgePoint = (
      edge: number,
      x0: number,
      y0: number,
      a: number,
      b: number,
      c: number,
      d: number,
      iso: number,
    ) => {
      if (edge === 0) {
        edgeX = x0 + cut(a, b, iso) * cellW;
        edgeY = y0;
      } else if (edge === 1) {
        edgeX = x0 + cellW;
        edgeY = y0 + cut(b, c, iso) * cellH;
      } else if (edge === 2) {
        edgeX = x0 + cut(d, c, iso) * cellW;
        edgeY = y0 + cellH;
      } else {
        edgeX = x0;
        edgeY = y0 + cut(a, d, iso) * cellH;
      }
    };

    // --- render: wash below the lowest level, then one batched path per level.
    const drawField = () => {
      if (width <= 0 || stageH <= 0) return;
      ctx.clearRect(0, 0, width, stageH);
      const stride = pointsX;
      const iso0 = 0.5 / lvls;

      // Faint tint where the ground sits below the lowest survey line — the
      // basin reads as a water table under the relief. One fillStyle, cells
      // overdrawn by 0.5px so no hairline seams appear between them.
      ctx.fillStyle = wash;
      ctx.globalAlpha = 0.5;
      for (let r = 0; r < pointsY - 1; r++) {
        const y0 = r * cellH;
        for (let c = 0; c < pointsX - 1; c++) {
          if (
            (field[r * stride + c] ?? 0) < iso0 &&
            (field[r * stride + c + 1] ?? 0) < iso0 &&
            (field[(r + 1) * stride + c + 1] ?? 0) < iso0 &&
            (field[(r + 1) * stride + c] ?? 0) < iso0
          ) {
            ctx.fillRect(c * cellW, y0, cellW + 0.5, cellH + 0.5);
          }
        }
      }
      ctx.globalAlpha = 1;

      ctx.lineWidth = 1;
      for (let l = 0; l < lvls; l++) {
        const iso = (l + 0.5) / lvls;
        const accent = l === accentAt;
        ctx.strokeStyle = accent ? bright : line;
        ctx.globalAlpha = accent ? 0.9 : 1;
        ctx.beginPath();
        for (let r = 0; r < pointsY - 1; r++) {
          const y0 = r * cellH;
          for (let c = 0; c < pointsX - 1; c++) {
            const a = field[r * stride + c] ?? 0;
            const b = field[r * stride + c + 1] ?? 0;
            const cc = field[(r + 1) * stride + c + 1] ?? 0;
            const d = field[(r + 1) * stride + c] ?? 0;
            const code =
              (a > iso ? 8 : 0) |
              (b > iso ? 4 : 0) |
              (cc > iso ? 2 : 0) |
              (d > iso ? 1 : 0);
            if (code === 0 || code === 15) continue;
            const segments = CONTOUR_SEGMENTS[code];
            if (!segments) continue;
            const x0 = c * cellW;
            for (let s = 0; s + 1 < segments.length; s += 2) {
              const from = segments[s];
              const to = segments[s + 1];
              if (from === undefined || to === undefined) continue;
              edgePoint(from, x0, y0, a, b, cc, d, iso);
              ctx.moveTo(edgeX, edgeY);
              edgePoint(to, x0, y0, a, b, cc, d, iso);
              ctx.lineTo(edgeX, edgeY);
            }
          }
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop: gated on visibility, intersection, and dirtiness.
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let lastT: number | null = null;
    let acc = 0;
    let inView = false;
    // The field opens AT base — nothing to settle until the first sculpt.
    let dirty = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      if (lastT === null) lastT = t;
      acc = Math.min(acc + (t - lastT), STEP * MAX_SUBSTEPS);
      lastT = t;
      let delta = -1;
      while (acc >= STEP) {
        delta = simStep();
        acc -= STEP;
      }
      if (delta < 0) return; // 120Hz frame between sim steps — nothing new.
      if (delta < eps && !pointerRef.current.down) {
        // Settled: snap exactly to base, paint the resting relief once, and
        // stop the loop. The next pointerdown marks it dirty and rewakes it.
        for (let i = 0; i < count; i++) field[i] = base[i] ?? 0;
        drawField();
        dirty = false;
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
        return;
      }
      drawField();
    };

    const syncLoop = () => {
      const shouldRun = dirty && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so the melt resumes, not jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        pausedAt = null;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
        pausedAt = performance.now();
      }
    };

    // Sizing — DPR-aware (capped at 2); geometry rebuilds live here only.
    const measure = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      stageH = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // setTransform, not scale — idempotent across repeated measures.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
      // Paint directly: the loop may be idle (settled) or absent (reduced
      // motion), and a running loop just repaints on its next step anyway.
      drawField();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors and repaint whatever frame is current.
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      drawField();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // --- pointer wiring: sculpt input lives entirely in refs ---------------
    const signFor = (alt: boolean, right: boolean) =>
      alt || right ? -1 : modeRef.current;
    const onPointerDown = (event: PointerEvent) => {
      const box = container.getBoundingClientRect();
      const p = pointerRef.current;
      p.down = true;
      p.x = event.clientX - box.left;
      p.y = event.clientY - box.top;
      p.sign = signFor(event.altKey, event.button === 2);
      container.setPointerCapture(event.pointerId);
      dirty = true;
      syncLoop();
    };
    const onPointerMove = (event: PointerEvent) => {
      const p = pointerRef.current;
      if (!p.down) return;
      if (event.buttons === 0) {
        p.down = false;
        return;
      }
      const box = container.getBoundingClientRect();
      p.x = event.clientX - box.left;
      p.y = event.clientY - box.top;
      p.sign = signFor(event.altKey, (event.buttons & 2) !== 0);
    };
    const onPointerEnd = () => {
      pointerRef.current.down = false;
    };
    // Right-button drag carves — keep the context menu out of the stage.
    const onContextMenu = (event: Event) => event.preventDefault();

    // Under reduced motion the loop never starts and the surface is inert —
    // no gates and no pointer wiring to watch; measure() painted the seeded
    // terrain as the single static frame.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
      container.addEventListener("pointerdown", onPointerDown);
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerup", onPointerEnd);
      container.addEventListener("pointercancel", onPointerEnd);
      container.addEventListener("contextmenu", onContextMenu);
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerEnd);
      container.removeEventListener("pointercancel", onPointerEnd);
      container.removeEventListener("contextmenu", onContextMenu);
    };
  }, [motionSafe, uid, levels, brush, relax]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <div role="group" aria-label="Sculpt mode" className="flex items-center gap-1.5">
          {MODES.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!motionSafe}
              aria-pressed={mode === option}
              onClick={() => selectMode(option)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-cobalt-bright/50 disabled:pointer-events-none disabled:opacity-40",
                mode === option
                  ? "border-[var(--accent-bright)] bg-cobalt-wash text-ink"
                  : "border-hairline text-ink-3 hover:border-hairline-strong hover:text-ink",
              )}
            >
              {option === "raise" ? "RAISE" : "CARVE"}
            </button>
          ))}
        </div>
        {motionSafe && (
          <span aria-hidden className="text-label text-ink-3">
            ALT DRAG · CARVE
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        aria-describedby={descId}
        style={{ height }}
        className={cn(
          "border-hairline bg-surface-0 relative touch-none overflow-hidden rounded-3 border select-none",
          motionSafe && "cursor-crosshair",
        )}
      >
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 size-full"
        />
      </div>

      <p id={descId} className="sr-only">
        {motionSafe
          ? "Press and drag on the surface to raise the terrain under the brush. Hold Alt, use the right button, or pick the carve chip to lower it instead. Survey contour lines redraw as the ground slowly settles back to its resting relief."
          : "A static seeded terrain rendered as survey contour lines. Sculpting is disabled while reduced motion is on."}
      </p>
    </div>
  );
}
