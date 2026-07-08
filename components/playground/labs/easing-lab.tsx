"use client";

import { useMemo, useState } from "react";

import { motion } from "motion/react";

import {
  LabBody,
  LabChips,
  LabSlider,
  LabStage,
  LiveCode,
} from "@/components/playground/lab-primitives";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings } from "@/registry/lib/motion";

type Bezier = [number, number, number, number];

const PRESET_NAMES = [
  "enter",
  "exit",
  "move",
  "linear",
  "ease-in-out",
  "custom",
] as const;

type PresetName = (typeof PRESET_NAMES)[number];

const PRESET_CURVES: Record<Exclude<PresetName, "custom">, Bezier> = {
  enter: [...easings.enter],
  exit: [...easings.exit],
  move: [...easings.move],
  linear: [...easings.linear],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

const SAMPLES = 64;

/** One axis of a CSS-style cubic bezier (endpoints pinned to 0 and 1). */
const bezAxis = (c1: number, c2: number, t: number) =>
  3 * (1 - t) * (1 - t) * t * c1 + 3 * (1 - t) * t * t * c2 + t * t * t;

/** Solve x(t) = x by bisection — safe because x1, x2 ∈ [0, 1] keeps x(t) monotone. */
function solveT(x: number, x1: number, x2: number) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (bezAxis(x1, x2, mid) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Sample y at even x-spacing, then differentiate numerically: velocity = dy/dx. */
function analyze([x1, y1, x2, y2]: Bezier) {
  const ys: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    ys.push(bezAxis(y1, y2, solveT(i / SAMPLES, x1, x2)));
  }
  const deriv: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(SAMPLES, i + 1);
    deriv.push(((ys[hi] ?? 1) - (ys[lo] ?? 0)) / ((hi - lo) / SAMPLES));
  }
  return {
    deriv,
    peak: Math.max(...deriv),
    start: deriv[0] ?? 0,
    end: deriv[SAMPLES] ?? 0,
  };
}

/** "1.00" → "1", "0.36" → "0.36" — CSS-flavored bezier numbers. */
const fmtN = (n: number) => {
  const s = n
    .toFixed(2)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
  return s === "-0" ? "0" : s;
};

// Editor geometry: x ∈ [0, 1] across, y ∈ [-0.5, 1.5] up.
const EW = 360;
const EH = 240;
const PAD = 20;
const ex = (x: number) => PAD + x * (EW - 2 * PAD);
const ey = (y: number) => EH - PAD - ((y + 0.5) / 2) * (EH - 2 * PAD);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const round2 = (v: number) => Math.round(v * 100) / 100;

export function EasingLab() {
  const motionSafe = useMotionSafe();
  const [bezier, setBezier] = useState<Bezier>([...PRESET_CURVES.enter]);
  const [preset, setPreset] = useState<PresetName>("enter");
  const [duration, setDuration] = useState(0.6);
  const [run, setRun] = useState(0);

  const { deriv, peak, start, end } = useMemo(() => analyze(bezier), [bezier]);
  const [x1, y1, x2, y2] = bezier;

  const applyPreset = (name: PresetName) => {
    if (name !== "custom") setBezier([...PRESET_CURVES[name]]);
    setPreset(name);
    setRun((r) => r + 1);
  };

  const pointFromEvent = (
    event: React.PointerEvent<SVGGElement>,
  ): { x: number; y: number } | null => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * EW;
    const py = ((event.clientY - rect.top) / rect.height) * EH;
    return {
      x: round2(clamp((px - PAD) / (EW - 2 * PAD), 0, 1)),
      y: round2(clamp(((EH - PAD - py) / (EH - 2 * PAD)) * 2 - 0.5, -0.5, 1.5)),
    };
  };

  // Drag state lives in the pointer capture itself — no refs, no re-renders.
  const dragHandlers = (handle: 0 | 1) => ({
    onPointerDown: (event: React.PointerEvent<SVGGElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<SVGGElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const p = pointFromEvent(event);
      if (!p) return;
      setBezier((prev) =>
        handle === 0
          ? [p.x, p.y, prev[2], prev[3]]
          : [prev[0], prev[1], p.x, p.y],
      );
      setPreset("custom");
    },
    onPointerUp: (event: React.PointerEvent<SVGGElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      setRun((r) => r + 1);
    },
  });

  // The curve, drawn exactly (SVG cubics are bezier cubics).
  const curvePath = `M${ex(0)},${ey(0)} C${ex(x1).toFixed(1)},${ey(y1).toFixed(1)} ${ex(x2).toFixed(1)},${ey(y2).toFixed(1)} ${ex(1)},${ey(1)}`;

  // The derivative trace, normalized to the space above/below progress 0.
  const maxUp = Math.max(0.01, ...deriv);
  const maxDown = Math.max(0.01, ...deriv.map((v) => -v));
  const vScale = Math.min(140 / maxUp, 44 / maxDown);
  const velocityPath = deriv
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${ex(i / SAMPLES).toFixed(1)},${(ey(0) - v * vScale).toFixed(1)}`,
    )
    .join(" ");

  const arr = `[${bezier.map(fmtN).join(", ")}]`;
  const dur = duration.toFixed(2);
  const named = preset !== "custom" && preset !== "ease-in-out";

  const code = named
    ? `import { motion } from "motion/react";
import { easings } from "@/registry/lib/motion";

<motion.div
  animate={{ x: 240 }}
  transition={{ duration: ${dur}, ease: easings.${preset} }}
/>

// easings.${preset} = ${arr}
// peak ×${peak.toFixed(1)} · arrives at ×${end.toFixed(1)}`
    : `import { motion } from "motion/react";

<motion.div
  animate={{ x: 240 }}
  transition={{ duration: ${dur}, ease: ${arr} }}
/>

// cubic-bezier${arr.replace("[", "(").replace("]", ")")}
// peak ×${peak.toFixed(1)} · arrives at ×${end.toFixed(1)}`;

  return (
    <LabBody
      controls={
        <>
          <LabChips
            label="Easing"
            options={PRESET_NAMES}
            value={preset}
            onChange={applyPreset}
          />
          <LabSlider
            label="Duration"
            value={duration}
            min={0.2}
            max={2}
            step={0.05}
            format={(v) => `${v.toFixed(2)}s`}
            onChange={(v) => {
              setDuration(v);
              setRun((r) => r + 1);
            }}
            hint="Both racers share it — only the curve differs."
          />
          <div className="border-hairline rounded-2 border p-3">
            <p className="text-label text-ink-3">READING</p>
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-3">peak velocity</dt>
                <dd className="text-ink tabular-nums">×{peak.toFixed(1)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">starts at</dt>
                <dd className="text-ink tabular-nums">×{start.toFixed(1)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">arrives at</dt>
                <dd className="text-cobalt-bright tabular-nums">
                  ×{end.toFixed(1)}
                </dd>
              </div>
            </dl>
            <p className="text-ink-3 mt-2 text-xs">
              ×1.0 is linear pace. The endpoint velocities are what the eye
              reads as snappiness.
            </p>
          </div>
        </>
      }
      stage={
        <LabStage
          label="KL-02 · BENCH"
          onReplay={() => setRun((r) => r + 1)}
          className="flex-col gap-8"
          minHeight={440}
        >
          {/* (a) the bezier editor */}
          <div className="w-full max-w-[380px]">
            <p className="text-label text-ink-3 mb-2">
              BEZIER EDITOR · DRAG THE HANDLES
            </p>
            <svg
              viewBox={`0 0 ${EW} ${EH}`}
              className="w-full touch-none select-none"
              role="img"
              aria-label={`Cubic bezier editor. Control points ${arr}. Peak velocity ${peak.toFixed(1)} times linear pace, arrival velocity ${end.toFixed(1)} times.`}
            >
              {/* graticule */}
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={`v${f}`}
                  x1={ex(f)}
                  x2={ex(f)}
                  y1={ey(1.5)}
                  y2={ey(-0.5)}
                  stroke="var(--hairline)"
                />
              ))}
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={`h${f}`}
                  x1={ex(0)}
                  x2={ex(1)}
                  y1={ey(f)}
                  y2={ey(f)}
                  stroke="var(--hairline)"
                />
              ))}
              {/* progress 0 and 1 bounds */}
              <line
                x1={ex(0)}
                x2={ex(1)}
                y1={ey(0)}
                y2={ey(0)}
                stroke="var(--hairline-strong)"
              />
              <line
                x1={ex(0)}
                x2={ex(1)}
                y1={ey(1)}
                y2={ey(1)}
                stroke="var(--hairline-strong)"
                strokeDasharray="4 4"
              />
              {/* derivative (velocity) trace — always drawn static */}
              <path
                d={velocityPath}
                fill="none"
                stroke="var(--signal)"
                strokeWidth={1}
                opacity={0.55}
              />
              {/* handle stems */}
              <line
                x1={ex(0)}
                y1={ey(0)}
                x2={ex(x1)}
                y2={ey(y1)}
                stroke="var(--hairline-strong)"
              />
              <line
                x1={ex(1)}
                y1={ey(1)}
                x2={ex(x2)}
                y2={ey(y2)}
                stroke="var(--hairline-strong)"
              />
              {/* the curve itself */}
              <path
                d={curvePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
              />
              {/* anchors */}
              <circle cx={ex(0)} cy={ey(0)} r={3} fill="var(--ink-3)" />
              <circle cx={ex(1)} cy={ey(1)} r={3} fill="var(--ink-3)" />
              {/* draggable control points */}
              <g
                {...dragHandlers(0)}
                className="cursor-grab active:cursor-grabbing"
              >
                <circle cx={ex(x1)} cy={ey(y1)} r={14} fill="transparent" />
                <circle
                  cx={ex(x1)}
                  cy={ey(y1)}
                  r={5}
                  fill="var(--accent-bright)"
                />
              </g>
              <g
                {...dragHandlers(1)}
                className="cursor-grab active:cursor-grabbing"
              >
                <circle cx={ex(x2)} cy={ey(y2)} r={14} fill="transparent" />
                <circle
                  cx={ex(x2)}
                  cy={ey(y2)}
                  r={5}
                  fill="var(--accent-bright)"
                />
              </g>
              {/* legend */}
              <text
                x={8}
                y={14}
                fill="var(--accent)"
                fontSize={9}
                className="font-mono"
              >
                CURVE
              </text>
              <text
                x={52}
                y={14}
                fill="var(--signal)"
                fontSize={9}
                className="font-mono"
              >
                VELOCITY dy/dx
              </text>
            </svg>
          </div>

          {/* (b) the race */}
          <div className="w-full max-w-[560px]">
            <p className="text-label text-ink-3 mb-3">
              THE RACE · SAME DURATION, SAME DISTANCE
            </p>
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-label text-ink-3 w-14 shrink-0 text-right">
                  YOURS
                </span>
                <div className="relative h-8 flex-1">
                  <span
                    aria-hidden
                    className="bg-hairline absolute top-1/2 right-0 left-0 h-px"
                  />
                  <motion.span
                    key={`yours-${run}`}
                    initial={{ left: "0%" }}
                    animate={{ left: "calc(100% - 24px)" }}
                    transition={
                      motionSafe ? { duration, ease: bezier } : { duration: 0 }
                    }
                    className="bg-cobalt rounded-2 absolute top-1/2 -mt-3 block size-6 shadow-[0_0_12px_var(--accent-wash)]"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-label text-ink-3 w-14 shrink-0 text-right">
                  LINEAR
                </span>
                <div className="relative h-8 flex-1">
                  <span
                    aria-hidden
                    className="bg-hairline absolute top-1/2 right-0 left-0 h-px"
                  />
                  <motion.span
                    key={`linear-${run}`}
                    initial={{ left: "0%" }}
                    animate={{ left: "calc(100% - 24px)" }}
                    transition={
                      motionSafe ? { duration, ease: "linear" } : { duration: 0 }
                    }
                    className="bg-surface-2 border-hairline rounded-2 absolute top-1/2 -mt-3 block size-6 border"
                  />
                </div>
              </div>
            </div>
          </div>
        </LabStage>
      }
      code={
        <LiveCode
          code={code}
          values={named ? [arr, `easings.${preset}`, dur] : [arr, dur]}
        />
      }
    />
  );
}
