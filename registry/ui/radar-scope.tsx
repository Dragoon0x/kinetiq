"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, mapRange, wrapAngle } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
/** Range rings drawn from center to rim. */
const RINGS = 4;
/** Bearing spokes, every 30°. */
const SPOKE_STEP = 30;
/** Afterglow decay window after the beam sweeps a contact, seconds. */
const AFTERGLOW_S = 1.2;
/** Blip dot radius, px, at rest / at full flare. */
const BLIP_R = 3;
const BLIP_R_FLARE = 5.5;
/** Hit-test radius around a blip's screen position, px. */
const HIT_R = 14;
/** Reduced motion: every blip painted at this steady brightness (0..1). */
const RM_BRIGHTNESS = 0.55;

const rad = (deg: number): number => (deg * Math.PI) / 180;
const pad2 = (n: number): string => String(Math.round(n) % 360).padStart(2, "0");

export type Blip = {
  id: string;
  label: string;
  /** Bearing, degrees 0..360 clockwise from north/up. */
  bearing: number;
  /** Range, 0 (center) .. 1 (rim). */
  range: number;
  detail?: string;
};

export type RadarScopeProps = {
  blips: Blip[];
  /** Fires the inspected contact id, or null on clear — deduped. */
  onInspect?: (id: string | null) => void;
  /** Seconds per full sweep rotation. @default 4 */
  sweepPeriod?: number;
  /** px stage height; the scope draws square within it. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/**
 * A polar radar scope drawn on canvas: range rings and bearing spokes over a
 * faint grid, with a bright SWEEP BEAM — leading edge plus a trailing
 * gradient wedge — rotating once per `sweepPeriod`. Each contact sits at its
 * own (bearing, range); the moment the beam's leading edge crosses a
 * contact's bearing it FLARES to full brightness, then fades over an
 * afterglow window tracked per-blip from the accumulated sweep clock (never
 * `Date.now`), so a contact just swept always reads brighter than one about
 * to be swept.
 *
 * Clicking a contact (canvas hit-test) or its paired a11y button pins a
 * highlight ring and a callout, and fires `onInspect(id)`; clicking empty
 * scope space or the demo's Clear control fires `onInspect(null)`. Both
 * paths are deduped against the currently inspected id. The HUD reads
 * `CONTACT · <label>` while inspected, else a live `SCANNING · NN°` bearing
 * readout — the sweep text is written straight to a ref-backed DOM node from
 * the rAF loop, never a per-frame `setState`; only the inspected contact
 * (an event-driven value) lives in React state.
 *
 * Mirrors the house canvas discipline: the canvas is DPR-aware (capped at 2)
 * and sized by a ResizeObserver via setTransform; colors resolve from
 * `--muted`, `--card`, `--ink-3`, `--primary`, `--border`, `--signal` read
 * off the container and re-resolve on a MutationObserver watching the
 * document class/theme; the one rAF loop pauses (with a clock rebase so the
 * sweep never jumps) while the scope is offscreen or the tab is hidden.
 * Under reduced motion the loop never starts at all — one static frame draws
 * the grid and every contact at a steady medium brightness, and inspecting
 * still works through clicks and the button list.
 *
 * The `<canvas>` itself is `aria-hidden` and unfocusable; a real list of
 * `<button>`s — one per contact — carries keyboard access, and a polite live
 * region announces what got inspected.
 */
export function RadarScope({
  blips,
  onInspect,
  sweepPeriod = 4,
  height = 300,
  className,
  "aria-label": ariaLabel = "Radar scope",
}: RadarScopeProps) {
  const motionSafe = useMotionSafe();

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const hudRef = React.useRef<HTMLSpanElement | null>(null);
  /** Assigned by the setup effect so an event-driven inspect (from the a11y
   *  button list) can repaint the current frame without re-running setup. */
  const redrawRef = React.useRef<(() => void) | null>(null);

  const [inspectedId, setInspectedId] = React.useState<string | null>(null);
  const [announced, setAnnounced] = React.useState("");

  // The click handler and the rAF loop both need the live blip list and the
  // live inspected id without retriggering the canvas-setup effect, so both
  // are mirrored into refs every commit (a bodyless effect, matching the
  // house pattern — never read during render, only from handlers/rAF).
  const blipsRef = React.useRef(blips);
  const inspectedRef = React.useRef(inspectedId);
  React.useEffect(() => {
    blipsRef.current = blips;
    inspectedRef.current = inspectedId;
  });

  const inspect = (id: string | null) => {
    setInspectedId((current) => {
      if (current === id) return current;
      onInspect?.(id);
      const found = id === null ? null : blipsRef.current.find((b) => b.id === id);
      setAnnounced(
        id === null
          ? "Inspection cleared"
          : `Inspecting contact ${found?.label ?? id}`,
      );
      return id;
    });
  };

  // All canvas work lives here: sizing, theming, geometry, hit-test, the one
  // rAF loop. Re-runs only when the sweep period or reduced-motion changes —
  // the blip list and inspected id are read live through the refs above.
  React.useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const period = sweepPeriod > 0 ? sweepPeriod : 4;

    // --- colors: resolved off the container, re-resolved on theme flips ---
    let muted = "";
    let card = "";
    let ink3 = "";
    let primary = "";
    let border = "";
    let signal = "";
    const resolveColors = () => {
      const style = getComputedStyle(container);
      const read = (name: string, fallback: string) => {
        const value = style.getPropertyValue(name).trim();
        return value === "" ? fallback : value;
      };
      muted = read("--muted", "#8a8f9b");
      card = read("--card", "#101218");
      ink3 = read("--ink-3", "#8a8f9b");
      primary = read("--primary", "#6478f0");
      border = read("--border", "rgba(127,127,127,0.3)");
      signal = read("--signal", primary);
    };
    resolveColors();

    // --- geometry: rebuilt only in the ResizeObserver callback ------------
    let width = 0;
    let stageH = 0;
    let cx = 0;
    let cy = 0;
    let rimR = 0;

    const rebuild = () => {
      cx = width / 2;
      cy = stageH / 2;
      rimR = Math.max(0, Math.min(width, stageH) / 2 - 10);
    };

    // Per-blip afterglow: the clock time each contact was last swept, so
    // afterglow decays from the accumulated sweep clock — never Date.now.
    let sweptAt = new Float32Array(0);
    const ensureSweptAt = () => {
      const list = blipsRef.current;
      if (sweptAt.length !== list.length) {
        const next = new Float32Array(list.length).fill(-Infinity);
        sweptAt = next;
      }
    };

    /** Screen position of a blip, given the current geometry. */
    const blipPos = (b: Blip) => {
      const a = rad(wrapAngle(b.bearing) - 90); // 0° = up
      const r = clamp(b.range, 0, 1) * rimR;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    };

    // --- static grid: card wash, rings + spokes, center hub — every frame -
    const drawGrid = () => {
      ctx.fillStyle = card;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, rimR, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = border;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      for (let i = 1; i <= RINGS; i++) {
        const r = (rimR * i) / RINGS;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();
      }
      for (let deg = 0; deg < 360; deg += SPOKE_STEP) {
        const a = rad(deg - 90);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * rimR, cy + Math.sin(a) * rimR);
        ctx.stroke();
      }

      // Range-ring fraction labels along the north spoke.
      ctx.fillStyle = ink3;
      ctx.globalAlpha = 0.7;
      ctx.font = "9px var(--font-mono, monospace)";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let i = 1; i <= RINGS; i++) {
        const r = (rimR * i) / RINGS;
        ctx.fillText(`${Math.round((i / RINGS) * 100)}`, cx + 3, cy - r);
      }

      // Faint center hub.
      ctx.fillStyle = muted;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    /** One contact: afterglow-lit dot, brighter/larger the more recent its sweep. */
    const drawBlip = (b: Blip, brightness: number) => {
      const { x, y } = blipPos(b);
      const r = mapRange(brightness, 0, 1, BLIP_R, BLIP_R_FLARE);
      ctx.fillStyle = signal;
      ctx.globalAlpha = 0.22 + brightness * 0.78;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      if (brightness > 0.5) {
        ctx.globalAlpha = (brightness - 0.5) * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, r + 4, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawPinRing = (b: Blip) => {
      const { x, y } = blipPos(b);
      ctx.strokeStyle = primary;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, BLIP_R_FLARE + 5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const drawSweep = (bearingDeg: number) => {
      const a = rad(bearingDeg - 90);
      const grad = ctx.createConicGradient(a - TAU * 0.16, cx, cy);
      // Trailing wedge fades from transparent, through signal, to the bright
      // leading edge — a conic gradient painted as one filled disc.
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.84, "transparent");
      grad.addColorStop(0.97, signal);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, rimR, 0, TAU);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // Leading edge line, crisp and bright.
      ctx.strokeStyle = signal;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * rimR, cy + Math.sin(a) * rimR);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    /**
     * Paint one full frame. `clockS` is the accumulated sweep clock (seconds,
     * rebasable) — `null` under reduced motion, where every contact holds a
     * steady brightness and no beam is drawn.
     */
    const drawFrame = (clockS: number | null) => {
      if (width <= 0 || stageH <= 0) return;
      ensureSweptAt();
      ctx.clearRect(0, 0, width, stageH);
      drawGrid();

      const list = blipsRef.current;
      const pinnedId = inspectedRef.current;

      if (clockS === null) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (!b) continue;
          drawBlip(b, RM_BRIGHTNESS);
        }
      } else {
        const bearingDeg = wrapAngle((clockS / period) * 360);
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (!b) continue;
          // The beam just swept this contact when its bearing sits inside a
          // thin arc behind the leading edge — stamp the sweep time once per
          // pass rather than every frame the beam overlaps it.
          const delta = wrapAngle(bearingDeg - wrapAngle(b.bearing));
          if (delta <= 2.5 && clockS - (sweptAt[i] ?? -Infinity) > 0.05) {
            sweptAt[i] = clockS;
          }
          const age = clockS - (sweptAt[i] ?? -Infinity);
          const brightness =
            age < 0 || !Number.isFinite(age)
              ? 0.15
              : mapRange(age, 0, AFTERGLOW_S, 1, 0.15);
          drawBlip(b, clamp(brightness, 0.15, 1));
        }
        drawSweep(bearingDeg);
        if (hudRef.current) {
          hudRef.current.textContent = `SCANNING · ${pad2(bearingDeg)}°`;
        }
      }

      if (pinnedId !== null) {
        const pinned = list.find((b) => b.id === pinnedId);
        if (pinned) drawPinRing(pinned);
      }
    };

    // --- the one rAF loop: gated on visibility, intersection, reduced motion.
    let raf = 0;
    let started: number | null = null;
    let pausedAt: number | null = null;
    let clock = 0;
    let lastT: number | null = null;
    let inView = false;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (started === null) started = now;
      const t = (now - started) / 1000;
      if (lastT === null) lastT = t;
      clock += t - lastT;
      lastT = t;
      drawFrame(clock);
    };

    const syncLoop = () => {
      const shouldRun = motionSafe && inView && !document.hidden;
      if (shouldRun && raf === 0) {
        // Rebase over the pause so the sweep resumes exactly, never jumps.
        if (started !== null && pausedAt !== null) {
          started += performance.now() - pausedAt;
        }
        lastT = null;
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
      // Reduced motion redraws its single static frame; the live loop simply
      // picks the new size up on its next frame.
      if (!motionSafe) drawFrame(null);
    };
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    // Event-driven repaint hook: an inspect from the a11y button list (not a
    // canvas click) needs the pin ring redrawn without waiting on the loop —
    // under RM there is no loop at all, so this is the only path. Under live
    // motion the running loop repaints next frame regardless; this just also
    // repaints immediately, which is harmless.
    redrawRef.current = () => {
      if (!motionSafe) drawFrame(null);
      else drawFrame(clock);
    };

    // Theme flips re-resolve colors (and repaint the static frame under RM).
    const themeObserver = new MutationObserver(() => {
      resolveColors();
      if (!motionSafe) drawFrame(null);
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    // Canvas hit-test: click empty space clears, click near a contact pins it.
    const onClick = (event: MouseEvent) => {
      const box = canvas.getBoundingClientRect();
      const px = event.clientX - box.left;
      const py = event.clientY - box.top;
      const list = blipsRef.current;
      let hitId: string | null = null;
      let hitDist = HIT_R;
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (!b) continue;
        const { x, y } = blipPos(b);
        const dist = Math.hypot(px - x, py - y);
        if (dist <= hitDist) {
          hitDist = dist;
          hitId = b.id;
        }
      }
      inspect(hitId);
    };
    canvas.addEventListener("click", onClick);

    // Under reduced motion the loop never starts — no gates to watch, and
    // measure() above already painted the one designed static frame.
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
      canvas.removeEventListener("click", onClick);
      redrawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- blips/inspectedId are read live via refs.
  }, [sweepPeriod, motionSafe]);

  // An inspect from the a11y button list (not a canvas click) still needs
  // the pin ring/callout redrawn — poke the setup effect's redraw hook. This
  // is a no-op read of a ref in an effect body, never a setState, so it
  // can't loop; under RM it is the only path back to canvas after a button
  // click, since there is no rAF loop to pick the change up on its own.
  React.useEffect(() => {
    redrawRef.current?.();
  }, [inspectedId]);

  const inspected = blips.find((b) => b.id === inspectedId) ?? null;
  const list = blips.slice(0, 24);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        ref={containerRef}
        className="border-hairline bg-card relative mx-auto w-full overflow-hidden rounded-3 border"
        style={{ maxWidth: height, aspectRatio: "1 / 1" }}
      >
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
      </div>

      <div className="flex items-center justify-center font-mono text-xs tabular-nums">
        {inspected ? (
          <span className="text-ink">
            CONTACT · <span className="text-cobalt-bright">{inspected.label}</span>
          </span>
        ) : (
          <span ref={hudRef} className="text-ink-3">
            SCANNING · 00°
          </span>
        )}
      </div>

      {/* A11y layer: one real button per contact — canvas is aria-hidden. */}
      <div role="group" aria-label={ariaLabel} className="sr-only">
        {list.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => inspect(inspectedId === b.id ? null : b.id)}
            aria-pressed={inspectedId === b.id}
          >
            {`Inspect contact ${b.label}, bearing ${Math.round(wrapAngle(b.bearing))} degrees${
              b.detail ? `, ${b.detail}` : ""
            }`}
          </button>
        ))}
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announced}
      </span>
    </div>
  );
}
