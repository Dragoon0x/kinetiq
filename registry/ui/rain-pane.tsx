"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Total streaks across both depths, split ~40/60 far/near. Capped for cost. */
const DEFAULT_COUNT = 70;
const MAX_COUNT = 120;
/** Splash pool — a burst of taps recycles the oldest ring rather than growing. */
const MAX_SPLASHES = 10;
/** Droplet ticks drawn per splash. */
const TICKS_PER_SPLASH = 4;
/** Seconds a splash lives before it fully fades. */
const SPLASH_LIFE = 0.6;

const TAU = Math.PI * 2;

export type RainPaneProps = {
  /** Total streaks across both depths. @default 70 */
  count?: number;
  onSplash?: (at: { x: number; y: number }) => void;
  /** px stage height. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * Rain streaks fall at two depths on a glass pane — FAR (slower, shorter,
 * fainter, thin) and NEAR (faster, longer, brighter, thicker) — each seeded
 * off djb2/seeded so starting positions and speeds are deterministic and
 * SSR-stable. A streak reaching the bottom respawns at the top, its seed
 * advanced by one step (no Math.random anywhere). A faint sheen/vignette
 * sells the glass. Tapping (or dragging across) the pane splashes at the
 * touch point: an expanding feathered ring plus a few short droplet ticks,
 * fading over ~0.6s on a rebasable clock, pooled and capped so a burst of
 * taps stays cheap. `onSplash` fires per tap/drag-sample with pane-local
 * coordinates; a polite live region announces each drop for screen readers.
 *
 * Canvas discipline mirrors RippleSurface: DPR-aware (capped at 2) sizing
 * via ResizeObserver + setTransform, a single rAF loop gated by
 * IntersectionObserver and visibilitychange with a rebased clock, colors
 * resolved from CSS variables once and re-resolved on theme flips via a
 * MutationObserver on <html class>, full teardown on unmount.
 *
 * Reduced motion: one static frame — a handful of still streaks frozen
 * mid-pane, no rAF. A tap still draws exactly one static splash ring (no
 * animation) and fires onSplash; calm throughout.
 */
export function RainPane({
  count = DEFAULT_COUNT,
  onSplash,
  height = 300,
  className,
  "aria-label": ariaLabel = "Rain on a glass pane",
}: RainPaneProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [announcement, setAnnouncement] = React.useState("LISTENING");

  // Latest-ref pattern: onSplash may be a fresh closure every render, but the
  // effect below only runs on [motionSafe, streakTotal] — read the current
  // callback through a ref written in an effect, never during render.
  const onSplashRef = React.useRef(onSplash);
  React.useEffect(() => {
    onSplashRef.current = onSplash;
  });

  const streakTotal = Math.max(0, Math.min(MAX_COUNT, Math.floor(count)));

  // All canvas work lives here: sizing, theming, streaks, splash pool, loop.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- colors: resolved once per mount, re-resolved on theme flips ------
    let ink2 = "";
    let ink3 = "";
    let signal = "";
    let accentBright = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      ink2 = read("--ink-2", "#c4c9d4");
      ink3 = read("--ink-3", read("--hairline-strong", "#8a8f9b"));
      signal = read("--signal", read("--primary", "#6478f0"));
      accentBright = read("--accent-bright", signal);
    };
    resolveColors();

    // --- streaks: struct-of-arrays, two depth bands, seeded ----------------
    const farCount = Math.round(streakTotal * 0.4);
    const nearCount = streakTotal - farCount;
    const total = farCount + nearCount;

    const sx = new Float32Array(total); // normalized x, 0..1
    const sy = new Float32Array(total); // normalized y, 0..1 (falls 0->1)
    const speed = new Float32Array(total); // normalized units / second
    const len = new Float32Array(total); // px streak length
    const isNear = new Uint8Array(total); // 1 = near band
    const seedState = new Uint32Array(total); // rolling seed for respawn

    const baseSeed = djb2("rain-pane");

    const initStreak = (i: number, near: boolean, slot: number) => {
      const bandSeed = (baseSeed + slot * 7919 + (near ? 104729 : 0)) >>> 0;
      const rand = seeded(bandSeed);
      sx[i] = rand();
      sy[i] = rand();
      if (near) {
        speed[i] = 0.62 + rand() * 0.3;
        len[i] = 16 + rand() * 12;
      } else {
        speed[i] = 0.24 + rand() * 0.16;
        len[i] = 7 + rand() * 6;
      }
      isNear[i] = near ? 1 : 0;
      seedState[i] = (bandSeed + 0x9e3779b9) >>> 0;
    };

    for (let i = 0; i < farCount; i++) initStreak(i, false, i);
    for (let i = 0; i < nearCount; i++) initStreak(farCount + i, true, i);

    // Respawn at the top with the seed advanced one step — deterministic,
    // never repeats the same x twice in a row.
    const respawn = (i: number) => {
      const rand = seeded(seedState[i] ?? 0);
      sx[i] = rand();
      sy[i] = 0;
      seedState[i] = ((seedState[i] ?? 0) + 0x9e3779b9) >>> 0;
    };

    // --- splash pool: struct-of-arrays, fixed size, round-robin -----------
    const splash = {
      x: new Float32Array(MAX_SPLASHES),
      y: new Float32Array(MAX_SPLASHES),
      born: new Float32Array(MAX_SPLASHES),
      active: new Uint8Array(MAX_SPLASHES),
      // Per-splash droplet tick angles, laid out flat (MAX_SPLASHES * TICKS_PER_SPLASH).
      tickAngle: new Float32Array(MAX_SPLASHES * TICKS_PER_SPLASH),
      cursor: 0,
      // Latest clock the loop has drawn — read by the pointer handler so a
      // spawned splash is birthed on the same clock the loop draws against.
      clock: 0,
    };
    let splashSeedTick = 0;

    const spawnSplash = (x: number, y: number) => {
      const i = splash.cursor;
      splash.x[i] = x;
      splash.y[i] = y;
      splash.born[i] = splash.clock;
      splash.active[i] = 1;
      splashSeedTick += 1;
      const rand = seeded((baseSeed + splashSeedTick * 104729) >>> 0);
      for (let t = 0; t < TICKS_PER_SPLASH; t++) {
        splash.tickAngle[i * TICKS_PER_SPLASH + t] = rand() * TAU;
      }
      splash.cursor = (i + 1) % MAX_SPLASHES;
      onSplashRef.current?.({ x, y });
      setAnnouncement(`LAST DROP · ${Math.round(x)},${Math.round(y)}`);
    };

    // --- geometry: recomputed on resize ------------------------------------
    let width = 0;
    let height2 = 0;

    const drawSheen = () => {
      // A faint diagonal glass sheen plus a soft vignette — cheap, static per
      // frame (no gradient object retained across frames to avoid leaks).
      const grad = ctx.createLinearGradient(0, 0, width, height2);
      grad.addColorStop(0, "rgba(255,255,255,0.05)");
      grad.addColorStop(0.35, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255,0.03)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height2);

      const vign = ctx.createRadialGradient(
        width / 2,
        height2 / 2,
        Math.min(width, height2) * 0.2,
        width / 2,
        height2 / 2,
        Math.max(width, height2) * 0.75,
      );
      vign.addColorStop(0, "rgba(0,0,0,0)");
      vign.addColorStop(1, "rgba(0,0,0,0.14)");
      ctx.fillStyle = vign;
      ctx.fillRect(0, 0, width, height2);
    };

    const drawStreak = (i: number) => {
      const px = (sx[i] ?? 0) * width;
      const py = (sy[i] ?? 0) * height2;
      const l = len[i] ?? 0;
      const near = isNear[i] === 1;
      ctx.strokeStyle = near ? ink2 : ink3;
      ctx.globalAlpha = near ? 0.55 : 0.28;
      ctx.lineWidth = near ? 1.6 : 0.9;
      ctx.beginPath();
      ctx.moveTo(px, py - l);
      ctx.lineTo(px, py);
      ctx.stroke();
    };

    const drawSplash = (i: number, clock: number) => {
      const age = clock - (splash.born[i] ?? 0);
      if (age < 0 || age > SPLASH_LIFE) {
        splash.active[i] = 0;
        return;
      }
      const cx = splash.x[i] ?? 0;
      const cy = splash.y[i] ?? 0;
      const t = age / SPLASH_LIFE;
      const life = 1 - t;
      // Expanding feathered ring.
      const radius = 4 + t * 30;
      ctx.strokeStyle = accentBright;
      ctx.globalAlpha = life * 0.6;
      ctx.lineWidth = 1.5 * life + 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.stroke();
      // Short droplet ticks radiating outward, fading with the ring.
      const tickRadius = radius * 0.55;
      const tickLen = 5 * life;
      ctx.globalAlpha = life * 0.45;
      ctx.lineWidth = 1;
      for (let k = 0; k < TICKS_PER_SPLASH; k++) {
        const a = splash.tickAngle[i * TICKS_PER_SPLASH + k] ?? 0;
        const ox = Math.cos(a);
        const oy = Math.sin(a);
        const startX = cx + ox * tickRadius;
        const startY = cy + oy * tickRadius;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + ox * tickLen, startY + oy * tickLen);
        ctx.stroke();
      }
    };

    // Reduced-motion motif: a handful of still streaks frozen mid-pane, plus
    // the glass sheen — no loop, no pool draw.
    const drawStatic = () => {
      if (width <= 0 || height2 <= 0) return;
      ctx.clearRect(0, 0, width, height2);
      drawSheen();
      for (let i = 0; i < total; i++) drawStreak(i);
      ctx.globalAlpha = 1;
    };

    const drawFrame = (t: number, dt: number) => {
      if (width <= 0 || height2 <= 0) return;
      splash.clock = t;
      ctx.clearRect(0, 0, width, height2);
      drawSheen();

      for (let i = 0; i < total; i++) {
        sy[i] = (sy[i] ?? 0) + (speed[i] ?? 0) * dt;
        if ((sy[i] ?? 0) > 1.05) respawn(i);
        drawStreak(i);
      }

      for (let i = 0; i < MAX_SPLASHES; i++) {
        if (splash.active[i]) drawSplash(i, t);
      }
      ctx.globalAlpha = 1;
    };

    // --- the one rAF loop, gated on visibility and intersection ------------
    let raf = 0;
    let started: number | null = null;
    let lastT = 0;
    let pausedAt: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      const dt = Math.min(0.05, Math.max(0, t - lastT));
      lastT = t;
      drawFrame(t, dt);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase over the pause so streaks resume, never jump.
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

    // Sizing — DPR-aware (capped at 2); streak normalized coords are
    // resolution-independent, so resize never needs to rebuild the streaks.
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
      ctx.lineCap = "round";
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

    const pointToLocal = (clientX: number, clientY: number) => {
      const box = container.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    let intersection: IntersectionObserver | null = null;
    const onVisibility = () => syncLoop();

    if (motionSafe) {
      const onPointerDown = (event: PointerEvent) => {
        const { x, y } = pointToLocal(event.clientX, event.clientY);
        spawnSplash(x, y);
      };
      const onPointerMove = (event: PointerEvent) => {
        // Drag support: only while the primary button/touch is held.
        if (event.buttons !== 1) return;
        const { x, y } = pointToLocal(event.clientX, event.clientY);
        spawnSplash(x, y);
      };

      intersection = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) inView = last.isIntersecting;
        syncLoop();
      });
      intersection.observe(container);
      document.addEventListener("visibilitychange", onVisibility);
      container.addEventListener("pointerdown", onPointerDown);
      container.addEventListener("pointermove", onPointerMove);

      return () => {
        cancelAnimationFrame(raf);
        resizeObserver.disconnect();
        themeObserver.disconnect();
        intersection?.disconnect();
        document.removeEventListener("visibilitychange", onVisibility);
        container.removeEventListener("pointerdown", onPointerDown);
        container.removeEventListener("pointermove", onPointerMove);
      };
    }

    // Reduced motion: one static frame; a tap draws exactly one static ring
    // (no rAF, no pool timing) and still fires onSplash.
    measure();
    drawStatic();
    const onStaticTap = (event: PointerEvent) => {
      const { x, y } = pointToLocal(event.clientX, event.clientY);
      drawStatic();
      ctx.strokeStyle = accentBright;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      onSplashRef.current?.({ x, y });
      setAnnouncement(`LAST DROP · ${Math.round(x)},${Math.round(y)}`);
    };
    container.addEventListener("pointerdown", onStaticTap);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      container.removeEventListener("pointerdown", onStaticTap);
    };
  }, [motionSafe, streakTotal]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      className={cn("relative touch-none overflow-hidden", className)}
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="absolute inset-0 size-full"
      />
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
