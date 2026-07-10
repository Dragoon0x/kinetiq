"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { djb2, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type FrostWipeProps = {
  /** The content under the glass — real DOM, always accessible to AT. */
  children: React.ReactNode;
  /** Wipe brush radius in px. @default 26 */
  brush?: number;
  /** Idle delay before the pane refrosts, in ms. @default 1600 */
  refrostDelay?: number;
  /** Stage height in px. @default 220 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** Per-frame alpha while the frost regrows. */
const REGROW_ALPHA = 0.045;

/**
 * A frosted pane over live content — wipe it clear with the pointer and the
 * frost regrows after a moment of stillness. The frost is painted once from
 * theme-resolved tones with seeded speckle (deterministic per instance);
 * wiping erases with destination-out strokes, and the regrow loop runs only
 * while there is frost to regrow, pausing offscreen and in hidden tabs.
 * Chip buttons wipe and refrost for the keyboard. Under reduced motion the
 * refrost is instant rather than gradual.
 */
export function FrostWipe({
  children,
  brush = 26,
  refrostDelay = 1600,
  height = 220,
  className,
  "aria-label": ariaLabel = "Frosted pane",
}: FrostWipeProps) {
  const motionSafe = useMotionSafe();
  const id = React.useId();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const stateRef = React.useRef({
    frost: 1, // 0 clear .. 1 fully frosted (estimate)
    raf: 0,
    idleTimer: 0,
    visible: true,
    onscreen: true,
    last: null as { x: number; y: number } | null,
    colors: { frost: "rgb(148 163 184)", speckle: "rgb(255 255 255)" },
  });
  const [status, setStatus] = React.useState("Frosted");

  /** Paint the full frost layer at the given alpha (1 = from scratch). */
  const paintFrost = React.useCallback(
    (alpha: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const s = stateRef.current;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.colors.frost;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // seeded speckle — the grain that makes it read as frost
      const rand = seeded(djb2(id));
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = s.colors.speckle;
      ctx.lineWidth = 1;
      const count = Math.round((canvas.width * canvas.height) / 6000);
      for (let i = 0; i < count; i += 1) {
        const x = rand() * canvas.width;
        const y = rand() * canvas.height;
        const len = 2 + rand() * 6;
        const a = rand() * Math.PI;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        ctx.stroke();
      }
      ctx.restore();
    },
    [id],
  );

  const stopLoop = React.useCallback(() => {
    const s = stateRef.current;
    if (s.raf) {
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    }
  }, []);

  // The loop re-schedules itself through a ref so the callback never has to
  // reference its own binding before declaration.
  const tickRef = React.useRef<() => void>(() => {});
  const regrowTick = React.useCallback(() => {
    const s = stateRef.current;
    s.raf = 0;
    if (!s.visible || !s.onscreen) return; // resumes via observers
    if (s.frost >= 1) {
      s.frost = 1;
      return;
    }
    paintFrost(REGROW_ALPHA);
    s.frost = Math.min(1, s.frost + REGROW_ALPHA * 0.9);
    s.raf = requestAnimationFrame(() => tickRef.current());
  }, [paintFrost]);
  React.useEffect(() => {
    tickRef.current = regrowTick;
  }, [regrowTick]);

  const scheduleRegrow = React.useCallback(() => {
    const s = stateRef.current;
    window.clearTimeout(s.idleTimer);
    s.idleTimer = window.setTimeout(() => {
      if (motionSafe) {
        stopLoop();
        s.raf = requestAnimationFrame(regrowTick);
      } else {
        paintFrost(1);
        s.frost = 1;
      }
      setStatus("Frosted");
    }, refrostDelay);
  }, [motionSafe, refrostDelay, regrowTick, paintFrost, stopLoop]);

  // Size, colors, observers, initial frost — the canvas-discipline block.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    const s = stateRef.current;

    const resolveColors = () => {
      // Raw vars that actually exist: --muted (surface tone) and --ink-3.
      const styles = getComputedStyle(wrap);
      const surface = styles.getPropertyValue("--muted").trim();
      const ink = styles.getPropertyValue("--ink-3").trim();
      if (surface) s.colors.frost = surface;
      if (ink) s.colors.speckle = ink;
    };

    const size = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      resolveColors();
      paintFrost(1);
      s.frost = 1;
    };

    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);

    const io = new IntersectionObserver((entries) => {
      s.onscreen = entries[0]?.isIntersecting ?? true;
      if (s.onscreen && s.frost < 1 && motionSafe && !s.raf) {
        s.raf = requestAnimationFrame(regrowTick);
      }
    });
    io.observe(wrap);

    const onVisibility = () => {
      s.visible = document.visibilityState === "visible";
      if (s.visible && s.frost < 1 && motionSafe && !s.raf) {
        s.raf = requestAnimationFrame(regrowTick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const html = document.documentElement;
    const mo = new MutationObserver(() => {
      resolveColors();
      if (s.frost > 0.5) paintFrost(1);
    });
    mo.observe(html, { attributes: true, attributeFilter: ["class"] });

    return () => {
      ro.disconnect();
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(s.idleTimer);
      if (s.raf) cancelAnimationFrame(s.raf);
    };
  }, [paintFrost, regrowTick, motionSafe]);

  const wipeAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;
    const s = stateRef.current;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const x = (clientX - rect.left) * dpr;
    const y = (clientY - rect.top) * dpr;
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgb(0 0 0)";
    const stroke = (fx: number, fy: number) => {
      ctx.beginPath();
      ctx.arc(fx, fy, brush * dpr, 0, Math.PI * 2);
      ctx.fill();
    };
    if (s.last) {
      const steps = Math.max(
        1,
        Math.round(Math.hypot(x - s.last.x, y - s.last.y) / (brush * dpr * 0.5)),
      );
      for (let i = 1; i <= steps; i += 1) {
        stroke(
          s.last.x + ((x - s.last.x) * i) / steps,
          s.last.y + ((y - s.last.y) * i) / steps,
        );
      }
    } else {
      stroke(x, y);
    }
    ctx.restore();
    s.last = { x, y };
    s.frost = Math.max(0, s.frost - 0.01);
    stopLoop();
    scheduleRegrow();
    setStatus("Wiping");
  };

  const wipeAll = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stateRef.current.frost = 0;
    stopLoop();
    scheduleRegrow();
    setStatus("Clear");
  };

  const refrostNow = () => {
    window.clearTimeout(stateRef.current.idleTimer);
    stopLoop();
    paintFrost(1);
    stateRef.current.frost = 1;
    setStatus("Frosted");
  };

  return (
    <div className={cn("w-full", className)}>
      <div role="group" aria-label="Frost controls" className="mb-2 flex gap-1.5">
        <button
          type="button"
          onClick={wipeAll}
          className="border-hairline text-ink-3 hover:text-ink hover:border-hairline-strong focus-visible:ring-cobalt-bright/50 rounded-full border px-2.5 py-0.5 font-mono text-[10px] outline-none focus-visible:ring-2"
        >
          WIPE CLEAR
        </button>
        <button
          type="button"
          onClick={refrostNow}
          className="border-hairline text-ink-3 hover:text-ink hover:border-hairline-strong focus-visible:ring-cobalt-bright/50 rounded-full border px-2.5 py-0.5 font-mono text-[10px] outline-none focus-visible:ring-2"
        >
          REFROST
        </button>
      </div>

      <div
        ref={wrapRef}
        role="img"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 relative touch-none overflow-hidden rounded-3 border select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          stateRef.current.last = null;
          wipeAt(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          wipeAt(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          stateRef.current.last = null;
        }}
        onPointerCancel={() => {
          stateRef.current.last = null;
        }}
      >
        <div className="absolute inset-0">{children}</div>
        <canvas
          ref={canvasRef}
          aria-hidden
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <span className="sr-only" aria-live="polite" role="status">
        {status}
      </span>
    </div>
  );
}
