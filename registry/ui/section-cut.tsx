"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { clamp, mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

export type Stratum = {
  id: string;
  label: string;
  /** Relative band height — thicker strata claim more of the block. @default 1 */
  thickness?: number;
  /** Fill shade, 0 (pale) .. 1 (deep). @default 0.5 */
  tone?: number;
  node?: React.ReactNode;
};

export type SectionCutProps = {
  strata: Stratum[];
  /** Fires with the stratum id at the cut face, or null when the plane sits above the top. Deduped. */
  onCut?: (id: string | null) => void;
  /** Block height in px. @default 300 */
  height?: number;
  className?: string;
  "aria-label"?: string;
};

/** Oblique core-sample skew — enough to read as depth, never enough to distort labels. */
const SKEW_DEG = -6;
/** Keyboard step per Arrow press, in depth percent. */
const ARROW_STEP = 2;
/** Two dusk tone stops (both themes legible) that `tone` interpolates between. */
const TONE_PALE = { l: 0.62, c: 0.05 };
const TONE_DEEP = { l: 0.32, c: 0.07 };
const TONE_HUE = 258;

type Band = {
  stratum: Stratum;
  /** Cumulative top/bottom in percent of the block, 0..100. */
  top: number;
  bottom: number;
};

/** Cumulative top/bottom offsets from relative thicknesses — a plain loop, no closure-mutated .map. */
function layoutBands(strata: Stratum[]): Band[] {
  let total = 0;
  for (const s of strata) total += s.thickness && s.thickness > 0 ? s.thickness : 1;
  if (total <= 0) total = 1;

  const bands: Band[] = [];
  let cursor = 0;
  for (const stratum of strata) {
    const weight = stratum.thickness && stratum.thickness > 0 ? stratum.thickness : 1;
    const top = (cursor / total) * 100;
    cursor += weight;
    const bottom = (cursor / total) * 100;
    bands.push({ stratum, top, bottom });
  }
  return bands;
}

/** Solid fill for a band at the given tone, 0..1. */
function toneFill(tone: number | undefined): string {
  const t = clamp(tone ?? 0.5, 0, 1);
  const l = mapRange(t, 0, 1, TONE_PALE.l, TONE_DEEP.l);
  const c = mapRange(t, 0, 1, TONE_PALE.c, TONE_DEEP.c);
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${TONE_HUE})`;
}

/** Legible ink for a band's label — dark text on pale bands, light text on deep ones. */
function toneInk(tone: number | undefined): string {
  const t = clamp(tone ?? 0.5, 0, 1);
  return t > 0.55 ? "oklch(0.95 0.01 258)" : "oklch(0.16 0.02 258)";
}

/** Brighter hatch tint for the exposed cut face — reads as freshly sectioned rock. */
function hatchFill(tone: number | undefined): string {
  const t = clamp(tone ?? 0.5, 0, 1);
  const l = clamp(mapRange(t, 0, 1, TONE_PALE.l, TONE_DEEP.l) + 0.14, 0, 0.96);
  const c = mapRange(t, 0, 1, TONE_PALE.c, TONE_DEEP.c);
  const base = `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${TONE_HUE})`;
  const line = `oklch(${clamp(l - 0.22, 0, 1).toFixed(3)} ${c.toFixed(3)} ${TONE_HUE} / 0.55)`;
  return `repeating-linear-gradient(45deg, ${line} 0px, ${line} 1.5px, transparent 1.5px, transparent 7px), ${base}`;
}

/** The band index (and its Band) whose [top, bottom) contains `depth`; last band wins at 100. */
function bandAtDepth(bands: Band[], depth: number): { index: number; band: Band } | null {
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    if (!band) continue;
    const isLast = i === bands.length - 1;
    if (depth >= band.top && (depth < band.bottom || (isLast && depth <= band.bottom))) {
      return { index: i, band };
    }
  }
  return null;
}

/** Every stratum boundary line, 0..100 — N bands give N+1 lines (top of first through bottom of last). */
function boundaryLines(bands: Band[]): number[] {
  const lines: number[] = [0];
  for (const band of bands) lines.push(band.bottom);
  return lines;
}

/** The nearest boundary strictly above/below `depth`, for a whole-stratum Page jump. */
function nextBoundary(bands: Band[], depth: number, direction: 1 | -1): number {
  const lines = boundaryLines(bands);
  if (direction > 0) {
    for (const line of lines) if (line > depth) return line;
    return 100;
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line !== undefined && line < depth) return line;
  }
  return 0;
}

/**
 * A layered solid rendered as a core sample, cut open by a draggable
 * horizontal plane. Everything above the plane is clipped away, so the drag
 * reads as excavation: the block shortens from the top and the newly exposed
 * interior shows a hatched cross-section face tinted to whichever stratum
 * the plane currently intersects. The handle is a real slider — pointer drag
 * tracks 1:1, arrow keys step by a couple of percent, Page keys jump a whole
 * stratum boundary, and Home/End snap to grade and bedrock. Keyboard moves
 * ease on a `glide` spring; a raw drag never springs, since a decisive cut
 * position always wins.
 *
 * The stratum sitting at the cut face fires `onCut` (deduped — no repeats
 * while the plane wanders within one band), and a mono `DEPTH · NN%` readout
 * derives straight from the plane's motion value via `useTransform`, so nothing
 * sets state on every frame of a drag.
 *
 * Reduced motion drops the keyboard glide: the plane jumps to its target
 * instantly, strata clip without a tween, and every callback and
 * announcement still fires identically.
 */
export function SectionCut({
  strata,
  onCut,
  height = 300,
  className,
  "aria-label": ariaLabel = "Core sample section cut",
}: SectionCutProps) {
  const motionSafe = useMotionSafe();
  const stageRef = React.useRef<HTMLDivElement>(null);
  const plane = useMotionValue(0);
  const controlsRef = React.useRef<ReturnType<typeof animate> | null>(null);
  const [announced, setAnnounced] = React.useState(0);
  const lastCutRef = React.useRef<string | null | undefined>(undefined);

  const onCutRef = React.useRef(onCut);
  React.useEffect(() => {
    onCutRef.current = onCut;
  });

  const bands = layoutBands(strata);

  // Stop any in-flight glide on unmount so it never writes to a gone motion value.
  React.useEffect(() => {
    const controls = controlsRef;
    return () => controls.current?.stop();
  }, []);

  const emitCut = (depth: number) => {
    const hit = depth <= 0 ? null : (bandAtDepth(bands, depth)?.band.stratum.id ?? null);
    if (lastCutRef.current === hit) return;
    lastCutRef.current = hit;
    onCutRef.current?.(hit);
  };

  useMotionValueEvent(plane, "change", (v) => {
    const rounded = Math.round(clamp(v, 0, 100));
    setAnnounced(rounded);
    emitCut(v);
  });

  /** Sets the plane immediately (drag, RM, or the settled end of a keyboard glide). */
  const commit = (next: number) => {
    controlsRef.current?.stop();
    plane.set(clamp(next, 0, 100));
  };

  /** Moves the plane toward `next` — a glide spring at full motion, an instant jump under RM. */
  const settle = (next: number) => {
    controlsRef.current?.stop();
    const target = clamp(next, 0, 100);
    if (!motionSafe) {
      plane.set(target);
      return;
    }
    controlsRef.current = animate(plane, target, springs.glide);
  };

  const moveTo = (clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.height === 0) return;
    commit(((clientY - rect.top) / rect.height) * 100);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    controlsRef.current?.stop();
    moveTo(event.clientY);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    moveTo(event.clientY);
  };
  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = plane.get();
    if (event.key === "ArrowUp") {
      event.preventDefault();
      settle(current - ARROW_STEP);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      settle(current + ARROW_STEP);
    } else if (event.key === "PageUp") {
      event.preventDefault();
      settle(nextBoundary(bands, current, -1));
    } else if (event.key === "PageDown") {
      event.preventDefault();
      settle(nextBoundary(bands, current, 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      settle(0);
    } else if (event.key === "End") {
      event.preventDefault();
      settle(100);
    }
  };

  const clipHeight = useTransform(plane, (p) => `${100 - p}%`);
  const depthLabel = useTransform(plane, (p) => `DEPTH · ${Math.round(clamp(p, 0, 100))}%`);
  const planeTop = useTransform(plane, (p) => `${p}%`);
  const cutOpacity = useTransform(plane, (p) => (p > 0 ? 1 : 0));

  const activeHit = bandAtDepth(bands, announced);
  const activeStratum = announced <= 0 ? null : (activeHit?.band.stratum ?? null);
  const valueText = activeStratum
    ? `${activeStratum.label} at ${announced}%`
    : `Above grade at ${announced}%`;

  const summary = `${ariaLabel}: a ${strata.length}-stratum core, top to bottom ${strata
    .map((s) => s.label)
    .join(", ")}.`;

  return (
    <div className={cn("w-full", className)}>
      <div ref={stageRef} style={{ height }} className="relative touch-none select-none">
        <div
          style={{ transform: `skewY(${SKEW_DEG}deg)`, transformOrigin: "top center" }}
          className="border-hairline-strong bg-surface-0 relative h-full overflow-hidden rounded-2 border"
        >
          {/* the solid: every band, always laid out full-height so the clip below is what excavates it */}
          {bands.map(({ stratum, top, bottom }) => (
            <div
              key={stratum.id}
              aria-hidden
              style={{
                position: "absolute",
                top: `${top}%`,
                height: `${bottom - top}%`,
                left: 0,
                right: 0,
                background: toneFill(stratum.tone),
              }}
              className="border-hairline/60 flex items-center justify-between border-t px-3 first:border-t-0"
            >
              <span
                style={{ color: toneInk(stratum.tone) }}
                className="font-mono text-[10px] tracking-wide"
              >
                {stratum.label}
              </span>
              {stratum.node}
            </div>
          ))}

          {/* removed overburden: clipped away above the plane, revealing the interior below it */}
          <motion.div
            aria-hidden
            style={{ height: clipHeight }}
            className="bg-surface-0 absolute inset-x-0 top-0"
          />

          {/* the cut face: a hatched band sitting right at the plane, tinted to the intersected stratum */}
          <motion.div
            aria-hidden
            style={{
              top: planeTop,
              opacity: cutOpacity,
              background: hatchFill(activeStratum?.tone),
            }}
            className="border-cobalt-bright absolute inset-x-0 h-3 -translate-y-1/2 border-y"
          />

          {/* cutting-plane line + handle */}
          <motion.div
            style={{ top: planeTop }}
            className="absolute inset-x-0 z-10 h-0 -translate-y-1/2"
          >
            <span aria-hidden className="bg-cobalt-bright absolute inset-x-0 -top-px h-0.5" />
            <div
              role="slider"
              tabIndex={0}
              aria-label={ariaLabel}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={announced}
              aria-valuetext={valueText}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={handleKeyDown}
              className="border-hairline-strong bg-surface-2 text-ink-2 focus-visible:ring-cobalt-bright/50 absolute top-1/2 left-1/2 flex h-5 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize items-center justify-center rounded-2 border font-mono text-[9px] outline-none focus-visible:ring-2"
            >
              <span aria-hidden>=</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* depth readout, derived from the plane motion value — never a per-frame setState */}
      <motion.p
        aria-hidden
        className="text-ink-3 mt-2 font-mono text-[10px] tracking-wide"
      >
        {depthLabel}
      </motion.p>

      <p className="sr-only">{summary}</p>
    </div>
  );
}
