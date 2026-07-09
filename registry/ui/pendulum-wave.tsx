"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** count is clamped here; every downstream size derives from the clamped value. */
const COUNT_MIN = 4;
const COUNT_MAX = 20;

/** SVG stage is laid out in this fixed user space, then scaled to fit the box. */
const VIEW_W = 100;
/** Fraction of the stage height reserved above the longest bob's rest point. */
const TOP_PAD = 0.14;
/** Horizontal inset so the outermost pivots don't kiss the frame edge. */
const SIDE_PAD = 0.5;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/**
 * Per-pendulum invariants, resolved once from the props (never per frame):
 * pivot x, period Tᵢ and the rest-length Lᵢ ∝ Tᵢ² (longer = slower), plus the
 * two colors so the ensemble reads as a spectrum sweep across the row.
 */
type Bob = {
  pivotX: number;
  period: number;
  length: number;
  hue: number;
};

/**
 * Geometry that depends on the measured box. The physics (`bobs`) is fixed for
 * a given prop set; only the pixel-space `scale`, `topY` and `viewH` change on
 * resize, so a resize never rebuilds the closed-form model — it just remaps it.
 */
type Layout = {
  viewH: number;
  scale: number;
  topY: number;
  bobs: Bob[];
};

/**
 * Build the analytic model. Pendulum i completes `base + i` oscillations over
 * `cycleSeconds`, so Tᵢ = cycleSeconds / (base + i): the longest (i=0) is
 * slowest, and after exactly `cycleSeconds` every pendulum has done a whole
 * number of swings — the whole row snaps back into its released fan. Lengths
 * are normalized to the slowest so the longest fills the stage.
 */
function buildBobs(count: number, cycleSeconds: number, base: number): Bob[] {
  const bobs: Bob[] = [];
  const usableW = VIEW_W - SIDE_PAD * 2;
  const gap = count > 1 ? usableW / (count - 1) : 0;
  // T₀² is the largest period² — divide by it so the longest length maps to 1.
  const longest = cycleSeconds / base;
  const longestSq = longest * longest;
  for (let i = 0; i < count; i++) {
    const period = cycleSeconds / (base + i);
    bobs.push({
      pivotX: count > 1 ? SIDE_PAD + i * gap : VIEW_W / 2,
      period,
      length: (period * period) / longestSq,
      hue: count > 1 ? i / (count - 1) : 0,
    });
  }
  return bobs;
}

export type PendulumWaveProps = {
  /** Pendulums in the row. Clamped to [4, 20]. @default 12 */
  count?: number;
  /** Peak swing angle in degrees, measured from vertical. @default 26 */
  amplitude?: number;
  /** Seconds for the ensemble to drift out and realign into one fan. @default 30 */
  cycleSeconds?: number;
  /** Swings the longest (slowest) pendulum completes each cycle. @default 20 */
  baseOscillations?: number;
  className?: string;
  "aria-label"?: string;
  /** Stage height in px. @default 260 */
  height?: number;
};

/**
 * A row of pendulums whose periods step by one oscillation apiece, released
 * together from the same angle. Because the periods differ, they drift out of
 * phase into a traveling wave, break into shimmer, then — after exactly
 * `cycleSeconds` — snap back into a single fan and begin again. The motion is
 * closed-form, not integrated: θᵢ(t) = A·cos(2π·t / Tᵢ), evaluated per frame
 * from an rAF-timestamp clock and written straight onto each thread/bob via
 * setAttribute, so there are no per-frame React renders. Lengths track Tᵢ² for
 * the classic long-slow / short-fast look and a color sweep runs across the row.
 *
 * The one rAF loop pauses while the stage is offscreen (IntersectionObserver)
 * or the tab is hidden (visibilitychange), rebasing its clock over the pause so
 * the wave resumes rather than jumps; a ResizeObserver re-maps the model to the
 * new box without rebuilding it. Restart re-zeros the clock (re-aligns the fan);
 * a play/pause toggle parks the ensemble.
 *
 * Reduced motion: no loop — one static frame at t=0, every bob at peak
 * amplitude, so the row reads as a crisp released arc.
 */
export function PendulumWave({
  count = 12,
  amplitude = 26,
  cycleSeconds = 30,
  baseOscillations = 20,
  className,
  "aria-label": ariaLabel = "Pendulum wave",
  height = 260,
}: PendulumWaveProps) {
  const motionSafe = useMotionSafe();

  const safeCount = clamp(Math.round(count), COUNT_MIN, COUNT_MAX);
  const safeCycle = Math.max(1, cycleSeconds);
  const safeBase = Math.max(1, Math.round(baseOscillations));
  const ampRad = Math.max(0, amplitude) * DEG;

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const threadRefs = React.useRef<(SVGLineElement | null)[]>([]);
  const bobRefs = React.useRef<(SVGCircleElement | null)[]>([]);
  const progressRef = React.useRef<SVGLineElement | null>(null);

  // Discrete UI state only — never touched per frame.
  const [running, setRunning] = React.useState(true);
  const [restartNonce, setRestartNonce] = React.useState(0);

  // The analytic model. Independent of the box, so resize doesn't rebuild it.
  const bobs = React.useMemo(
    () => buildBobs(safeCount, safeCycle, safeBase),
    [safeCount, safeCycle, safeBase],
  );

  // Everything imperative — sizing, the clock, the one rAF loop, the gates.
  React.useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    if (!container || !svg) return;

    // --- box-dependent geometry, rebuilt only on resize -------------------
    const layout: Layout = { viewH: 0, scale: 1, topY: 0, bobs };
    const remap = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      // Fit the fixed 100-wide user space into the measured box.
      layout.scale = w / VIEW_W;
      layout.viewH = h / layout.scale;
      // Longest bob at full extension must clear the bottom; pivots sit at topY.
      const maxReach = TOP_PAD * layout.viewH + 1; // 1 = normalized longest length
      const usableH = layout.viewH - maxReach;
      layout.topY = TOP_PAD * layout.viewH;
      svg.setAttribute("viewBox", `0 0 ${VIEW_W} ${layout.viewH}`);
      layout.bobs = bobs.map((b) => ({ ...b, length: usableH * b.length }));
    };

    // --- write one frame at model time t (seconds) ------------------------
    const draw = (t: number) => {
      const list = layout.bobs;
      for (let i = 0; i < list.length; i++) {
        const bob = list[i];
        const thread = threadRefs.current[i];
        const dot = bobRefs.current[i];
        if (!bob || !thread || !dot) continue;
        // Closed-form swing; +cos so t=0 is peak amplitude (released fan).
        const theta = ampRad * Math.cos((TAU * t) / bob.period);
        const bx = bob.pivotX + bob.length * Math.sin(theta);
        const by = layout.topY + bob.length * Math.cos(theta);
        thread.setAttribute("x2", bx.toFixed(3));
        thread.setAttribute("y2", by.toFixed(3));
        dot.setAttribute("cx", bx.toFixed(3));
        dot.setAttribute("cy", by.toFixed(3));
      }
      const progress = progressRef.current;
      if (progress) {
        // Cycle phase 0→1 as a hairline sweeping the stage width.
        const phase = ((t % safeCycle) + safeCycle) % safeCycle;
        progress.setAttribute(
          "x2",
          (SIDE_PAD + (phase / safeCycle) * (VIEW_W - SIDE_PAD * 2)).toFixed(3),
        );
      }
    };

    remap();

    // Reduced motion: exactly one static frame at t=0, no loop, no gates.
    if (!motionSafe) {
      draw(0);
      const ro = new ResizeObserver(() => {
        remap();
        draw(0);
      });
      ro.observe(container);
      return () => ro.disconnect();
    }

    // --- the one rAF loop, clock accumulated from timestamp deltas --------
    let raf = 0;
    let last: number | null = null;
    let elapsed = 0; // model seconds; the restart nonce reset it to 0 on mount
    let inView = false;

    const frame = (now: number) => {
      if (last !== null) elapsed += (now - last) / 1000;
      last = now;
      draw(elapsed);
      raf = requestAnimationFrame(frame);
    };

    const shouldRun = () => running && inView && !document.hidden;
    const syncLoop = () => {
      if (shouldRun() && raf === 0) {
        last = null; // drop the paused span so the wave resumes, not jumps
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun() && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      remap();
      // Repaint immediately so a resize while paused still reflects the box.
      if (raf === 0) draw(elapsed);
    });
    resizeObserver.observe(container);

    const intersection = new IntersectionObserver((entries) => {
      const latest = entries[entries.length - 1];
      if (latest) inView = latest.isIntersecting;
      syncLoop();
    });
    intersection.observe(container);

    const onVisibility = () => syncLoop();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // restartNonce re-runs the effect, which re-zeros `elapsed` → realignment.
  }, [bobs, ampRad, safeCycle, motionSafe, running, restartNonce]);

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "border-hairline bg-surface-1 flex flex-col gap-2 rounded-3 border p-3",
        className,
      )}
    >
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden"
        style={{ height }}
      >
        <svg
          ref={svgRef}
          aria-hidden
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          {/* Rail the pivots hang from, plus a cycle-phase progress hairline. */}
          <line
            x1={SIDE_PAD}
            y1={TOP_PAD * 100 - 4}
            x2={VIEW_W - SIDE_PAD}
            y2={TOP_PAD * 100 - 4}
            stroke="var(--hairline-strong)"
            strokeWidth={0.4}
            vectorEffect="non-scaling-stroke"
          />
          {bobs.map((bob, i) => (
            <g key={i}>
              <circle
                cx={bob.pivotX}
                cy={TOP_PAD * 100 - 4}
                r={0.5}
                fill="var(--ink-3)"
              />
              <line
                ref={(node) => {
                  threadRefs.current[i] = node;
                }}
                x1={bob.pivotX}
                y1={TOP_PAD * 100 - 4}
                x2={bob.pivotX}
                y2={TOP_PAD * 100}
                stroke="var(--hairline-strong)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <circle
                ref={(node) => {
                  bobRefs.current[i] = node;
                }}
                cx={bob.pivotX}
                cy={TOP_PAD * 100}
                r={4}
                // Cobalt→signal sweep across the row keeps the wave legible.
                fill={`color-mix(in oklch, var(--signal) ${Math.round(
                  bob.hue * 100,
                )}%, var(--cobalt-bright))`}
              />
            </g>
          ))}
          <line
            ref={progressRef}
            x1={SIDE_PAD}
            y1={TOP_PAD * 100 - 4}
            x2={SIDE_PAD}
            y2={TOP_PAD * 100 - 4}
            stroke="var(--signal)"
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-label text-ink-3 tabular-nums">
          {safeCount} BOBS · {safeCycle}S CYCLE
        </span>
        <div className="flex items-center gap-1.5">
          {motionSafe && (
            <button
              type="button"
              aria-pressed={!running}
              onClick={() => setRunning((r) => !r)}
              className="border-input text-ink-2 hover:bg-cobalt-wash hover:text-ink h-7 rounded-2 border px-2.5 text-xs font-medium transition-colors"
            >
              {running ? "Pause" : "Play"}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setRunning(true);
              setRestartNonce((n) => n + 1);
            }}
            className="border-input text-ink-2 hover:bg-cobalt-wash hover:text-ink h-7 rounded-2 border px-2.5 text-xs font-medium transition-colors"
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}
