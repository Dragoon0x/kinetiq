"use client";

import * as React from "react";

import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type PathTypeProps = {
  /** The one-sentence statement that rides the wave. */
  text: string;
  /** Scroll-stage height in px. @default 260 */
  height?: number;
  /** Wave height in px, midline to crest. @default 26 */
  amplitude?: number;
  /** Fires as the ride advances, deduped to 0.01 progress steps. */
  onProgress?: (progress: number) => void;
  className?: string;
  /** Label for the focusable scroll region. @default "Path statement" */
  "aria-label"?: string;
};

/** Scroll track height as a multiple of the stage — sets the scrub gearing. */
const TRACK_RATIO = 4;
/** Full sine periods the wave makes across the stage. */
const PERIODS = 2.5;
/** Points sampled along the sine before quadratic smoothing. */
const SAMPLES = 24;
/** Horizontal inset keeping stroke caps and glyph entry on-canvas, px. */
const INSET = 12;
/** Where the sentence rests at scroll 0, in % of path length. */
const RIDE_START = 4;
/** Right margin: at scroll 1 the sentence tail parks at 96%. */
const RIDE_MARGIN = 96;
/** How far the accent tick leads the first glyph, % of path length. */
const TICK_LEAD = 2;
/** Fixed reduced-motion offset, % of path length. */
const STATIC_OFFSET = 12;
/** Baseline lift so glyphs surf above the ribbon instead of striking it, px. */
const TYPE_LIFT = -6;
/** The type dims to this in the wave troughs. */
const DIP_OPACITY = 0.85;
/** How far the cast-shadow copy of the ribbon drops, px. */
const SHADOW_DROP = 10;

/**
 * Deterministic wave: two-and-a-half sine periods left to right across the
 * measured stage at the given amplitude. The sine is sampled at SAMPLES
 * points, then smoothed into quadratic segments — each sample becomes the
 * control point of a curve ending at the midpoint to the next sample — so the
 * same box always yields the same ribbon, with no randomness anywhere.
 */
function wavePathD(width: number, height: number, amplitude: number): string {
  const innerW = Math.max(width - INSET * 2, 1);
  const midY = height / 2;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const u = i / (SAMPLES - 1);
    pts.push({
      x: INSET + u * innerW,
      y: midY - amplitude * Math.sin(Math.PI * 2 * PERIODS * u),
    });
  }
  const head = pts[0];
  if (!head) return "";
  let d = `M ${head.x.toFixed(2)} ${head.y.toFixed(2)}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const ctrl = pts[i];
    const next = pts[i + 1];
    if (!ctrl || !next) break;
    const last = i === pts.length - 2;
    const ex = last ? next.x : (ctrl.x + next.x) / 2;
    const ey = last ? next.y : (ctrl.y + next.y) / 2;
    d += ` Q ${ctrl.x.toFixed(2)} ${ctrl.y.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }
  return d;
}

/**
 * Type set along an undulating path, drawn on by scroll. An internal track
 * (four stages tall) scrubs progress P into a motion value; the sticky stage
 * holds an SVG wave whose ribbon strokes in via strokeDashoffset =
 * (1 − P) × pathLength over an accent under-glow, while the sentence rides
 * the same path on a textPath — startOffset slides from 4% toward
 * 96% − textLength%, so short sentences surf left to right and longer ones
 * ride through the wave ticker-style until the tail parks at 96%. A leading
 * accent tick runs just ahead of the first glyph, a faint copy of the ribbon
 * dropped 10px reads as its cast shadow, and the type dims slightly in the
 * troughs. Everything derives 1:1 from scroll position — springless,
 * reversible, no free-running loops. Screen readers get the sentence as one
 * sr-only paragraph (the SVG is aria-hidden), the region is focusable and
 * natively key-scrollable, and onProgress reports the ride in 0.01 steps.
 * Under reduced motion the ribbon renders fully drawn with the type resting
 * at a fixed 12% — the region still scrolls and the readout still tracks,
 * but nothing rides.
 */
export function PathType({
  text,
  height = 260,
  amplitude = 26,
  onProgress,
  className,
  "aria-label": ariaLabel = "Path statement",
}: PathTypeProps) {
  const motionSafe = useMotionSafe();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const pathRef = React.useRef<SVGPathElement>(null);
  const textRef = React.useRef<SVGTextElement>(null);
  const uid = React.useId();
  const waveId = `${uid}-wave`;

  // Scroll progress 0..1 as a motion value — every visual binding derives
  // from it, so the scrub stays springless and reversible.
  const progress = useMotionValue(0);

  // ResizeObserver-fed stage box, deduped so observer chatter never loops.
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  // Measured ribbon length (getTotalLength) and the sentence's share of it
  // in percent (getComputedTextLength / pathLength), both deduped.
  const [pathLen, setPathLen] = React.useState(0);
  const [textPct, setTextPct] = React.useState(0);
  // Readout percent, stepped with the same dedupe that gates onProgress.
  const [ridePct, setRidePct] = React.useState(0);
  const reportedRef = React.useRef(0);

  // Crests must clear the stage: cap the wave at half the height minus
  // headroom for the lifted glyphs and the dropped shadow.
  const amp = clamp(amplitude, 0, Math.max(box.h / 2 - 24, 0));
  const d = box.w > 0 && box.h > 0 ? wavePathD(box.w, box.h, amp) : "";

  // Measure the sticky stage; re-measure on any size change. The box write
  // is deduped, and progress is refreshed so every derived binding recomputes
  // against the new geometry.
  React.useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      const max = container.scrollHeight - container.clientHeight;
      progress.set(max > 0 ? container.scrollTop / max : 0);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    measure();
    return () => observer.disconnect();
  }, [progress]);

  // Measure the drawn ribbon and the set type after mount and every re-path.
  // Deduped measurement writes only; a late webfont swap re-measures once.
  React.useEffect(() => {
    if (d === "") return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const path = pathRef.current;
      if (!path) return;
      const len = path.getTotalLength();
      const glyphs = textRef.current?.getComputedTextLength() ?? 0;
      const pct = len > 0 ? (glyphs / len) * 100 : 0;
      setPathLen((prev) => (Math.abs(prev - len) < 0.5 ? prev : len));
      setTextPct((prev) => (Math.abs(prev - pct) < 0.25 ? prev : pct));
    };
    measure();
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(measure).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [d, text]);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    progress.set(max > 0 ? el.scrollTop / max : 0);
  };

  // The ride in % of path length. mapRange tolerates an inverted output
  // range, so a sentence longer than the wave slides through it instead.
  const rideAt = (p: number): number =>
    mapRange(clamp(p, 0, 1), 0, 1, RIDE_START, RIDE_MARGIN - textPct);

  // Dash draw: offset (1 − P) × pathLength strokes the ribbon in with scroll.
  const dashOffset = useTransform(
    progress,
    (p) => (1 - clamp(p, 0, 1)) * pathLen,
  );
  const typeOffset = useTransform(progress, (p) => `${rideAt(p).toFixed(3)}%`);
  const tickOffset = useTransform(
    progress,
    (p) => `${(rideAt(p) - TICK_LEAD).toFixed(3)}%`,
  );

  /**
   * Trough dip. The wave is y(u) = mid − A·sin(2π·PERIODS·u) with u the
   * fraction of the ride (arc length ≈ x for this gentle wave), so the type
   * sits in a trough when sin = −1. Taking m as the sentence midpoint
   * (start + half its length), trough depth t = (1 + cos(2π·PERIODS·m + π/2)) / 2
   * — the cos term equals −sin, so t is 1 in troughs and 0 on crests — and
   * opacity slides 1 → DIP_OPACITY with t.
   */
  const typeOpacity = useTransform(progress, (p) => {
    const m = (rideAt(p) + textPct / 2) / 100;
    const t = (1 + Math.cos(Math.PI * 2 * PERIODS * m + Math.PI / 2)) / 2;
    return 1 - (1 - DIP_OPACITY) * t;
  });

  // Report the ride deduped to 0.01 steps; the readout mirrors the same value.
  useMotionValueEvent(progress, "change", (value) => {
    const stepped = Math.round(clamp(value, 0, 1) * 100) / 100;
    if (stepped === reportedRef.current) return;
    reportedRef.current = stepped;
    setRidePct(Math.round(stepped * 100));
    onProgress?.(stepped);
  });

  const measured = pathLen > 0;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        tabIndex={0}
        role="region"
        aria-label={ariaLabel}
        style={{ height }}
        className="border-hairline bg-surface-0 focus-visible:ring-cobalt-bright/40 overflow-y-auto rounded-3 border outline-none focus-visible:ring-2"
      >
        {/* AT reads the sentence whole; the wave below is decorative. */}
        <p className="sr-only">{text}</p>

        <div
          aria-hidden
          style={{ height: height * TRACK_RATIO }}
          className="pointer-events-none select-none"
        >
          <div
            ref={stageRef}
            className="sticky top-0 overflow-hidden"
            style={{ height }}
          >
            {d !== "" && (
              <svg
                aria-hidden
                viewBox={`0 0 ${box.w} ${box.h}`}
                className="absolute inset-0 size-full"
              >
                {/* Hidden until lengths land, so the ribbon never flashes
                    fully drawn on the frame before measurement. */}
                <g opacity={measured ? 1 : 0}>
                  {/* Depth cue: the same wave dropped 10px, faint and
                      blur-free — it reads as the ribbon's cast shadow and
                      draws in step with it. */}
                  <g transform={`translate(0 ${SHADOW_DROP})`}>
                    <motion.path
                      d={d}
                      fill="none"
                      stroke="var(--hairline)"
                      strokeWidth={1.5}
                      opacity={0.25}
                      strokeDasharray={
                        motionSafe && measured ? pathLen : undefined
                      }
                      strokeDashoffset={
                        motionSafe && measured ? dashOffset : undefined
                      }
                    />
                  </g>
                  {/* Accent under-glow beneath the ribbon stroke. */}
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="var(--accent-wash)"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray={
                      motionSafe && measured ? pathLen : undefined
                    }
                    strokeDashoffset={
                      motionSafe && measured ? dashOffset : undefined
                    }
                  />
                  {/* The ribbon — also the rail both textPaths ride. */}
                  <motion.path
                    id={waveId}
                    ref={pathRef}
                    d={d}
                    fill="none"
                    stroke="var(--hairline-strong)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeDasharray={
                      motionSafe && measured ? pathLen : undefined
                    }
                    strokeDashoffset={
                      motionSafe && measured ? dashOffset : undefined
                    }
                  />
                  {/* Leading accent tick, one gap ahead of the first glyph. */}
                  <text fontSize={13} fill="var(--accent-bright)">
                    <motion.textPath
                      href={`#${waveId}`}
                      startOffset={
                        motionSafe
                          ? tickOffset
                          : `${STATIC_OFFSET - TICK_LEAD}%`
                      }
                    >
                      <tspan dy={TYPE_LIFT}>▍</tspan>
                    </motion.textPath>
                  </text>
                  {/* The type riding the wave, lifted clear of the stroke. */}
                  <motion.text
                    ref={textRef}
                    className="font-mono"
                    fontSize={13}
                    letterSpacing="0.08em"
                    fill="var(--ink)"
                    opacity={motionSafe ? typeOpacity : 1}
                  >
                    <motion.textPath
                      href={`#${waveId}`}
                      startOffset={
                        motionSafe ? typeOffset : `${STATIC_OFFSET}%`
                      }
                    >
                      <tspan dy={TYPE_LIFT}>{text}</tspan>
                    </motion.textPath>
                  </motion.text>
                </g>
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Bench readout: the ride mirrored under the stage. */}
      <p className="text-label text-ink-3 mt-2 px-1">
        RIDE &middot;{" "}
        <span className="text-ink-2 tabular-nums">
          {String(ridePct).padStart(2, "0")}%
        </span>
      </p>
    </div>
  );
}
