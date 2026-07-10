"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Reduced motion paints exactly one frame, fog thin/mostly parted. */
const STATIC_ALPHA = 0.16;
/** Live layer alpha ceiling — three layers compose short of opaque. */
const LAYER_ALPHA = 0.34;
/** Base clearing radius around the pointer, in CSS px. */
const CLEAR_RADIUS = 68;
/** Breathing amplitude on the clearing radius. */
const CLEAR_BREATH = 10;

type Bank = {
  /** Blob centers/radii/phase, seeded per layer — stride 4: x0, y0, r, phase. */
  blobs: Float32Array;
  count: number;
  /** Drift speed in px/s (far banks slower — parallax). */
  speed: number;
  /** Drift heading, radians. */
  heading: number;
};

/** Builds one fog bank's blob field deterministically from a seed string. */
const buildBank = (seed: string, count: number, speed: number, heading: number): Bank => {
  const rand = seeded(djb2(seed));
  const blobs = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const base = i * 4;
    blobs[base] = rand(); // x0, normalized 0..1
    blobs[base + 1] = rand(); // y0, normalized 0..1
    blobs[base + 2] = 0.32 + rand() * 0.4; // radius, normalized to min(w,h)
    blobs[base + 3] = rand() * TAU; // phase for a slow size breathe
  }
  return { blobs, count, speed, heading };
};

const wrapUnit = (v: number) => ((v % 1) + 1) % 1;

export type DepthFogProps = {
  /** The content revealed behind the fog — real DOM, always in the a11y tree. */
  children?: React.ReactNode;
  /** Fires on pointer enter (true) / leave (false) of the parting area, deduped. */
  onClear?: (clearing: boolean) => void;
  /** Stage height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** Default seeded field of faint marker glyphs when no children are given. */
function DefaultBed() {
  const rand = seeded(djb2("depth-fog-bed"));
  const glyphs = ["+", "·", "×", "◇"] as const;
  const marks: { left: string; top: string; glyph: string }[] = [];
  for (let i = 0; i < 14; i += 1) {
    const gi = Math.floor(rand() * glyphs.length);
    marks.push({
      left: `${(6 + rand() * 88).toFixed(1)}%`,
      top: `${(8 + rand() * 84).toFixed(1)}%`,
      glyph: glyphs[gi] ?? "·",
    });
  }
  return (
    <div className="bg-surface-1 relative size-full overflow-hidden">
      {marks.map((m, i) => (
        <span
          key={i}
          aria-hidden
          className="text-ink-3 absolute font-mono text-xs"
          style={{ left: m.left, top: m.top }}
        >
          {m.glyph}
        </span>
      ))}
      <p className="text-ink-3 absolute inset-x-0 bottom-3 text-center font-mono text-[10px]">
        NO SURVEY DATA LOADED
      </p>
    </div>
  );
}

/**
 * Real content sits at the base layer, fully in the DOM; a canvas overlay
 * paints two–three parallax fog banks (seeded, so identical every render)
 * drifting and wrapping independently, and composites a feathered
 * destination-out clearing at the pointer each frame. Because the fog is
 * repainted from scratch every frame, the clearing only exists where the
 * pointer currently is — unlike a wipe, it closes back in the instant the
 * pointer moves on. The rAF loop rebases its clock across IntersectionObserver
 * / visibilitychange pauses so drift never jumps; colors resolve from
 * --muted/--card/--ink-3/--border/--signal and re-resolve on theme flips.
 * Reduced motion paints a single thin, mostly-parted frame — no rAF, no
 * drift — while onClear keeps firing on enter/leave.
 */
export function DepthFog({
  children,
  onClear,
  height = 300,
  className,
  "aria-label": ariaLabel = "Fogged survey panel",
}: DepthFogProps) {
  const motionSafe = useMotionSafe();
  const id = React.useId();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const onClearRef = React.useRef(onClear);
  const [status, setStatus] = React.useState<"open" | "fogged">("fogged");

  React.useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    // A soft neutral haze in both themes: --muted (far, flattest), --ink-3
    // (mid, the most legible gray), --border (near, a faint hairline wash).
    let fogA = "";
    let fogB = "";
    let fogC = "";
    const resolveColors = () => {
      const style = getComputedStyle(document.documentElement);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      fogA = read("--muted", "#9aa1ad");
      fogB = read("--ink-3", "#8a8f9b");
      fogC = read("--border", "rgba(127,127,127,0.4)");
    };
    resolveColors();

    // --- geometry: rebuilt only on resize ----------------------------------
    let width = 0;
    let height2 = 0;
    const banks: Bank[] = [
      buildBank(`${id}-far`, 3, 4, 0.6),
      buildBank(`${id}-mid`, 3, 9, 3.6),
      buildBank(`${id}-near`, 2, 15, 5.1),
    ];

    // --- pointer state: plain closure vars, no re-render on move ----------
    let pointerActive = false;
    let pointerX = 0;
    let pointerY = 0;
    let wasClearing = false;

    const fireClear = (clearing: boolean) => {
      if (wasClearing === clearing) return;
      wasClearing = clearing;
      onClearRef.current?.(clearing);
      setStatus(clearing ? "open" : "fogged");
    };

    const bankColor = (i: number) => (i === 0 ? fogA : i === 1 ? fogB : fogC);

    /** One blob, optionally offset by a full canvas width/height so drift
     * across an edge wraps without popping (only the offsets that land near
     * the visible rect actually get painted — see the loop below). */
    const paintBlob = (
      color: string,
      cx: number,
      cy: number,
      radius: number,
      alpha: number,
    ) => {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "transparent");
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    const paintBanks = (t: number, alphaScale: number) => {
      ctx.clearRect(0, 0, width, height2);
      ctx.globalCompositeOperation = "source-over";
      const reach = Math.min(width, height2);
      for (let li = 0; li < banks.length; li += 1) {
        const bank = banks[li];
        if (!bank) continue;
        const dx = Math.cos(bank.heading) * bank.speed * t;
        const dy = Math.sin(bank.heading) * bank.speed * t;
        const color = bankColor(li);
        const alpha = LAYER_ALPHA * alphaScale;
        for (let bi = 0; bi < bank.count; bi += 1) {
          const base = bi * 4;
          const x0 = bank.blobs[base] ?? 0;
          const y0 = bank.blobs[base + 1] ?? 0;
          const rNorm = bank.blobs[base + 2] ?? 0.4;
          const phase = bank.blobs[base + 3] ?? 0;
          const cx = wrapUnit(x0 + dx / width) * width;
          const cy = wrapUnit(y0 + dy / height2) * height2;
          const breathe = 1 + 0.08 * Math.sin(t * 0.35 + phase);
          const radius = rNorm * reach * breathe;
          // Paint the primary copy plus wrapped copies for any edge the
          // blob's radius currently overlaps, so drift never pops at a seam.
          const xOffsets = [
            0,
            cx - radius < 0 ? width : null,
            cx + radius > width ? -width : null,
          ];
          const yOffsets = [
            0,
            cy - radius < 0 ? height2 : null,
            cy + radius > height2 ? -height2 : null,
          ];
          for (const ox of xOffsets) {
            if (ox === null) continue;
            for (const oy of yOffsets) {
              if (oy === null) continue;
              paintBlob(color, cx + ox, cy + oy, radius, alpha);
            }
          }
        }
      }
    };

    const partAt = (x: number, y: number, t: number) => {
      const breathe = CLEAR_RADIUS + Math.sin(t * 1.6) * CLEAR_BREATH;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const grad = ctx.createRadialGradient(x, y, 0, x, y, breathe);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.6, "rgba(0,0,0,0.85)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, breathe, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    const drawFrame = (t: number) => {
      if (width <= 0 || height2 <= 0) return;
      paintBanks(t, 1);
      if (pointerActive) partAt(pointerX, pointerY, t);
    };

    const drawStatic = () => {
      if (width <= 0 || height2 <= 0) return;
      paintBanks(0, STATIC_ALPHA / LAYER_ALPHA);
      // Mostly-parted: a broad, faint static clearing at center so content
      // reads plainly; a live pointer opens it further without animating.
      const cx = pointerActive ? pointerX : width / 2;
      const cy = pointerActive ? pointerY : height2 / 2;
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const radius = pointerActive
        ? CLEAR_RADIUS * 1.3
        : Math.min(width, height2) * 0.42;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, "rgba(0,0,0,0.9)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    };

    // --- the one rAF loop, gated on visibility and intersection ------------
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      drawFrame((now - started) / 1000);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock over the pause so drift resumes, not jumps.
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

    // --- sizing: DPR-aware (capped at 2) -----------------------------------
    const measure = () => {
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = cssW;
      height2 = cssH;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!motionSafe) drawStatic();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);
    measure();

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawStatic();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    // --- pointer tracking: parts the fog, drives onClear -------------------
    const localPoint = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const onPointerEnter = (e: PointerEvent) => {
      const p = localPoint(e.clientX, e.clientY);
      pointerActive = true;
      pointerX = p.x;
      pointerY = p.y;
      fireClear(true);
      if (!motionSafe) drawStatic();
    };
    const onPointerMoveEvt = (e: PointerEvent) => {
      const p = localPoint(e.clientX, e.clientY);
      pointerActive = true;
      pointerX = p.x;
      pointerY = p.y;
      fireClear(true);
      if (!motionSafe) drawStatic();
    };
    const onPointerLeave = () => {
      pointerActive = false;
      fireClear(false);
      if (!motionSafe) drawStatic();
    };

    container.addEventListener("pointerenter", onPointerEnter);
    container.addEventListener("pointermove", onPointerMoveEvt);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("pointercancel", onPointerLeave);

    // Under reduced motion the loop never starts — no gates to watch.
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
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointerenter", onPointerEnter);
      container.removeEventListener("pointermove", onPointerMoveEvt);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("pointercancel", onPointerLeave);
    };
  }, [id, motionSafe]);

  return (
    <div className={cn("w-full", className)}>
      <div
        ref={containerRef}
        role="group"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 relative touch-none overflow-hidden rounded-3 border select-none"
      >
        {/* Real DOM, always in the a11y tree — the fog is a visual overlay only. */}
        <div className="absolute inset-0">{children ?? <DefaultBed />}</div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />
      </div>
      <span className="sr-only" aria-live="polite" role="status">
        {status === "open" ? "Visibility open" : "Visibility fogged"}
      </span>
    </div>
  );
}
