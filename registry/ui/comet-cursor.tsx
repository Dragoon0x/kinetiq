"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Ring stride: x, y, speed (px/s, smoothed) per stored sample. */
const STRIDE = 3;
/** Deterministic spark count trailing the head — cheap flair, no allocation. */
const SPARKS = 3;

/**
 * djb2 over a small integer tuple, folded to [0, 1). Every per-spark constant
 * derives from this — deterministic and SSR-safe, so there is no Math.random
 * anywhere near render.
 */
const djb2 = (a: number, b: number, seed = 0): number => {
  let h = 5381 + seed;
  h = (Math.imul(h, 33) ^ a) >>> 0;
  h = (Math.imul(h, 33) ^ b) >>> 0;
  // Bare djb2 stays nearly affine in sequential inputs — finish with a full
  // two-round avalanche so neighbouring indices decorrelate.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

export type CometCursorProps = {
  /** Trail sample count. @default 28, clamped to [8, 64]. */
  trail?: number;
  className?: string;
  /** px stage height. @default 320 */
  height?: number;
  /** Overlay content, rendered in a layer above the canvas. */
  children?: React.ReactNode;
};

/**
 * A contained luminous comet: the pointer drags a bright `--signal` head with
 * a tapering tail that follows and thickens with pointer speed — a fast flick
 * throws a long fat streak, a slow drift a short thin one. When the pointer
 * goes still or leaves, the loop keeps integrating so the tail collapses into
 * the head and dims out gracefully rather than snapping away. It is scoped to
 * its own canvas region (never a global site cursor); `children` render above.
 *
 * Mirrors the canvas discipline of IronFilings/Wavefield: the canvas is
 * DPR-aware (capped at 2) and sized by a ResizeObserver; colors resolve from
 * CSS variables once per mount and re-resolve when the html class flips theme;
 * the single rAF loop pauses while the document is hidden or the stage is
 * offscreen (clock rebased on resume); the pointer lives in a ref updated by
 * listeners — never React state.
 *
 * Perf: budget ≤3ms/frame at ~800×500. The trail is a fixed-size ring buffer
 * (`trail` samples, stride 3), allocated once — the hot loop draws one quad
 * strip plus a head glow and a few sparks and allocates nothing per frame.
 *
 * Reduced motion: exactly one static frame — a calm resting comet glyph at
 * centre; the loop never starts and no pointer is wired.
 */
export function CometCursor({
  trail = 28,
  className,
  height = 320,
  children,
}: CometCursorProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Raw pointer in canvas space; `active` is false until it enters / after it
  // leaves, which lets the tail collapse into the head.
  const pointerRef = React.useRef({ x: 0, y: 0, active: false });

  // All canvas work lives here: sizing, theming, the ring, the one rAF loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const samples = clamp(Math.round(trail), 8, 64);
    const pointer = pointerRef.current;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let signal = "";
    let signalRgb: [number, number, number] = [120, 240, 190];
    let tail = "";
    let tailRgb: [number, number, number] = [138, 143, 155];
    // A detached <canvas> is the cheapest way to normalise any CSS color
    // (oklch, hex, rgb) into rgb channels for building rgba() with per-vertex
    // alpha — done only on mount and theme flips, never in the frame loop.
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const probeCtx = probe.getContext("2d", { willReadFrequently: true });
    const toRgb = (color: string, fallback: [number, number, number]) => {
      if (!probeCtx) return fallback;
      probeCtx.clearRect(0, 0, 1, 1);
      probeCtx.fillStyle = "#000";
      probeCtx.fillStyle = color;
      probeCtx.fillRect(0, 0, 1, 1);
      const d = probeCtx.getImageData(0, 0, 1, 1).data;
      return [d[0] ?? fallback[0], d[1] ?? fallback[1], d[2] ?? fallback[2]] as [
        number,
        number,
        number,
      ];
    };
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      signal = read("--signal", read("--primary", "#6478f0"));
      // Tail blends toward the dim ink-3, fading to transparent at its end.
      tail = read("--ink-3", read("--hairline-strong", "#8a8f9b"));
      signalRgb = toRgb(signal, signalRgb);
      tailRgb = toRgb(tail, tailRgb);
    };
    resolveColors();

    // --- the ring: allocated once, reused every frame ---------------------
    const ring = new Float32Array(samples * STRIDE);
    // `count` grows to `samples` as the trail fills; `write` is the head slot.
    let count = 0;
    let write = 0;
    // Eased head position (lags the raw pointer so the head feels attached).
    let headX = 0;
    let headY = 0;
    // Smoothed pointer speed in px/s, integrated toward zero when idle.
    let speed = 0;
    let seeded = false;

    let width = 0;
    let stageH = 0;

    const seedAt = (x: number, y: number) => {
      headX = x;
      headY = y;
      speed = 0;
      count = 1;
      write = 0;
      ring[0] = x;
      ring[1] = y;
      ring[2] = 0;
      seeded = true;
    };

    /** Sample index `age` steps behind the head (0 = head, count-1 = tail). */
    const at = (age: number) => {
      const slot = ((write - age) % samples + samples) % samples;
      return slot * STRIDE;
    };

    const drawFrame = (dt: number) => {
      if (width <= 0 || stageH <= 0) return;
      ctx.clearRect(0, 0, width, stageH);
      if (!seeded) seedAt(width / 2, stageH / 2);

      const px = pointer.active ? pointer.x : headX;
      const py = pointer.active ? pointer.y : headY;

      // Head chases the raw pointer; the follow constant is framerate-
      // independent so the trail reads the same at 60 and 120Hz.
      const follow = 1 - Math.exp(-dt / 0.045);
      const nx = headX + (px - headX) * follow;
      const ny = headY + (py - headY) * follow;

      // Instantaneous head speed, smoothed like ticker-tape's pointer velocity
      // so a flick reads as intent and jitter doesn't thrash the width.
      const moved = Math.hypot(nx - headX, ny - headY);
      const instant = dt > 0 ? moved / dt : 0;
      // When idle the head stops moving, so speed bleeds toward zero on its
      // own — the tail thins and catches up, exactly the collapse we want.
      speed = speed * 0.78 + instant * 0.22;
      headX = nx;
      headY = ny;

      // Push the new head into the ring (advance even when idle so the tail
      // keeps marching inward and the streak fades instead of freezing).
      write = (write + 1) % samples;
      ring[write * STRIDE] = headX;
      ring[write * STRIDE + 1] = headY;
      ring[write * STRIDE + 2] = speed;
      if (count < samples) count += 1;

      // Speed → width: a slow drift is a thin filament, a fast flick a fat
      // streak. Normalised against a believable flick and eased.
      const drive = clamp(speed / 900, 0, 1);
      const headWidth = 2.2 + drive * drive * 15;

      if (count >= 2) {
        // Build the tapering ribbon as one filled polygon: walk head→tail
        // down one side, then tail→head back up the other. Width tapers to 0
        // at the tail and alpha fades along the length, so the streak reads
        // as liquid. Colour lerps signal→tail head→tail.
        ctx.lineJoin = "round";
        const last = count - 1;
        // One pass to draw the body in a mid-trail tint (cheap: a single fill
        // whose alpha is the average glow), then the bright head on top.
        ctx.beginPath();
        // Down the "left" edge, head → tail.
        for (let age = 0; age < count; age++) {
          const i = at(age);
          const cx = ring[i] ?? headX;
          const cy = ring[i + 1] ?? headY;
          const niInner = at(Math.min(age + 1, last));
          const njOuter = at(Math.max(age - 1, 0));
          // Tangent from neighbours; normal is its perpendicular.
          const ax = ring[njOuter] ?? cx;
          const ay = ring[njOuter + 1] ?? cy;
          const bx = ring[niInner] ?? cx;
          const by = ring[niInner + 1] ?? cy;
          let tx = ax - bx;
          let ty = ay - by;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          const nrmX = -ty;
          const nrmY = tx;
          const taper = 1 - age / last;
          const localDrive = clamp((ring[i + 2] ?? 0) / 900, 0, 1);
          const w =
            (1.2 + (2.2 + localDrive * localDrive * 15) * 0.5) * taper * taper;
          if (age === 0) {
            ctx.moveTo(cx + nrmX * w, cy + nrmY * w);
          } else {
            ctx.lineTo(cx + nrmX * w, cy + nrmY * w);
          }
        }
        // Back up the "right" edge, tail → head.
        for (let age = count - 1; age >= 0; age--) {
          const i = at(age);
          const cx = ring[i] ?? headX;
          const cy = ring[i + 1] ?? headY;
          const niInner = at(Math.min(age + 1, last));
          const njOuter = at(Math.max(age - 1, 0));
          const ax = ring[njOuter] ?? cx;
          const ay = ring[njOuter + 1] ?? cy;
          const bx = ring[niInner] ?? cx;
          const by = ring[niInner + 1] ?? cy;
          let tx = ax - bx;
          let ty = ay - by;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          const nrmX = -ty;
          const nrmY = tx;
          const taper = 1 - age / last;
          const localDrive = clamp((ring[i + 2] ?? 0) / 900, 0, 1);
          const w =
            (1.2 + (2.2 + localDrive * localDrive * 15) * 0.5) * taper * taper;
          ctx.lineTo(cx - nrmX * w, cy - nrmY * w);
        }
        ctx.closePath();
        // Gradient head→tail: signal at the head, ink-3 fading out at the tail.
        const tailI = at(last);
        const grad = ctx.createLinearGradient(
          headX,
          headY,
          ring[tailI] ?? headX,
          ring[tailI + 1] ?? headY,
        );
        const [sr, sg, sb] = signalRgb;
        const [tr, tg, tb] = tailRgb;
        grad.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.9)`);
        grad.addColorStop(0.4, `rgba(${sr}, ${sg}, ${sb}, 0.42)`);
        grad.addColorStop(1, `rgba(${tr}, ${tg}, ${tb}, 0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Deterministic sparks: a few dim signal motes riding just behind the
      // head, offset along the normal — cheap flair, no per-frame allocation.
      if (count >= 3) {
        const [sr, sg, sb] = signalRgb;
        for (let s = 0; s < SPARKS; s++) {
          const age = 2 + s * 2;
          if (age >= count) break;
          const i = at(age);
          const cx = ring[i] ?? headX;
          const cy = ring[i + 1] ?? headY;
          const jitter = (djb2(s, write % 97, 21) - 0.5) * 6 * drive;
          const alpha = 0.5 * (1 - age / count) * (0.3 + drive);
          ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(cx + jitter, cy - jitter, 0.9 + drive * 1.2, 0, TAU);
          ctx.fill();
        }
      }

      // The head: a bright core with a soft radial glow that swells with speed.
      const [sr, sg, sb] = signalRgb;
      const glowR = headWidth * 2.4;
      const glow = ctx.createRadialGradient(
        headX,
        headY,
        0,
        headX,
        headY,
        glowR,
      );
      glow.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.55)`);
      glow.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(headX, headY, glowR, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, 0.95)`;
      ctx.beginPath();
      ctx.arc(headX, headY, headWidth * 0.5 + 1.4, 0, TAU);
      ctx.fill();
    };

    // A calm resting comet glyph at centre — the single reduced-motion frame.
    const drawStatic = () => {
      if (width <= 0 || stageH <= 0) return;
      ctx.clearRect(0, 0, width, stageH);
      const cx = width / 2;
      const cy = stageH / 2;
      const [sr, sg, sb] = signalRgb;
      const [tr, tg, tb] = tailRgb;
      // A short, still tail to the left so the glyph reads as a comet at rest.
      const len = Math.min(120, width * 0.22);
      const grad = ctx.createLinearGradient(cx, cy, cx - len, cy);
      grad.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.6)`);
      grad.addColorStop(1, `rgba(${tr}, ${tg}, ${tb}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx, cy + 4);
      ctx.lineTo(cx - len, cy);
      ctx.closePath();
      ctx.fill();
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 18);
      glow.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0.5)`);
      glow.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(${sr}, ${sg}, ${sb}, 0.95)`;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, TAU);
      ctx.fill();
    };

    // --- the one rAF loop, gated on visibility and intersection -----------
    let raf = 0;
    let last: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (last === null) {
        last = now;
        return;
      }
      // Clamp dt so a long pause (rebased below) can't throw a huge step.
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      drawFrame(dt);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase the clock so the head resumes from where it paused, not jumps.
        last = null;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // Sizing — DPR-aware (capped at 2). Reseed at centre when the stage size
    // changes so the ring never trails a stale off-stage coordinate.
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
      seeded = false;
      if (!motionSafe) drawStatic();
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawStatic();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Under reduced motion the loop never starts and no pointer is wired.
    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();
    const onPointerMove = (event: PointerEvent) => {
      const box = container.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      pointer.active = true;
    };
    const onPointerEnter = (event: PointerEvent) => {
      const box = container.getBoundingClientRect();
      pointer.x = event.clientX - box.left;
      pointer.y = event.clientY - box.top;
      pointer.active = true;
      // Snap the whole trail to the entry point so it doesn't sweep in from
      // wherever the head last idled.
      seedAt(pointer.x, pointer.y);
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };

    if (motionSafe) {
      intersection = new IntersectionObserver((entries) => {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) inView = lastEntry.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerenter", onPointerEnter);
      container.addEventListener("pointerleave", onPointerLeave);
    } else {
      // One resting frame; measure() may have run before colors settled.
      drawStatic();
    }

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      intersection?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerenter", onPointerEnter);
      container.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [trail, motionSafe]);

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
