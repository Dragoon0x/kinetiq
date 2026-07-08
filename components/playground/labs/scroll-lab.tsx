"use client";

import { useRef, useState } from "react";

import {
  motion,
  useInView,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

import {
  LabBody,
  LabChips,
  LabSlider,
  LabStage,
  LiveCode,
} from "@/components/playground/lab-primitives";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";

const MODES = ["linked", "triggered"] as const;
const SMOOTHING = ["raw", "smoothed"] as const;

type Mode = (typeof MODES)[number];
type Smoothing = (typeof SMOOTHING)[number];

export function ScrollLab() {
  const motionSafe = useMotionSafe();
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);

  const [mode, setMode] = useState<Mode>("linked");
  const [offStart, setOffStart] = useState(0.9);
  const [offEnd, setOffEnd] = useState(0.35);
  const [smoothing, setSmoothing] = useState<Smoothing>("raw");
  const [pct, setPct] = useState(0);

  // Section progress within the offset window (drives the badge + dial).
  const { scrollYProgress: sectionProgress } = useScroll({
    container: containerRef,
    target: targetRef,
    offset: [`start ${offStart}`, `start ${offEnd}`],
  });
  const smoothed = useSpring(sectionProgress, {
    stiffness: springs.glide.stiffness,
    damping: springs.glide.damping,
  });
  const progress = smoothing === "smoothed" ? smoothed : sectionProgress;

  // Whole-page progress (drives the viewport window in the track diagram).
  const { scrollYProgress: pageProgress } = useScroll({
    container: containerRef,
  });

  const badgeRotate = useTransform(progress, [0, 1], [0, 180]);
  const badgeX = useTransform(progress, [0, 1], [0, 80]);
  const windowY = useTransform(pageProgress, [0, 1], [0, 150]);
  const dialLength = progress;

  useMotionValueEvent(progress, "change", (value) => {
    const next = Math.round(value * 100);
    setPct((prev) => (prev === next ? prev : next));
  });

  // Triggered mode: entering fires the committed keyframe animation once;
  // leaving re-arms it. The keyframes play to completion regardless of
  // scrubbing — that is the difference being taught.
  const inView = useInView(targetRef, {
    root: containerRef,
    amount: 0.5,
  });

  const linked = mode === "linked";
  const code = linked
    ? `const { scrollYProgress } = useScroll({
  container,
  target,
  offset: ["start ${offStart.toFixed(2)}", "start ${offEnd.toFixed(2)}"],
});
const rotate = useTransform(scrollYProgress, [0, 1], [0, 180]);
// scrub back — it reverses. Linked motion is a mapping, not an event.`
    : `const inView = useInView(target, { root: container, amount: 0.5 });
// fires ONCE per entry: a committed 600ms animation, re-armed on exit
<motion.div animate={inView ? { scale: 1, rotate: 180 } : {}} />`;

  return (
    <LabBody
      controls={
        <>
          <LabChips label="Mode" options={MODES} value={mode} onChange={setMode} />
          <LabSlider
            label="Offset · start"
            value={offStart}
            min={0.5}
            max={1}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={setOffStart}
            hint="Where in the viewport progress begins (1 = bottom edge)."
          />
          <LabSlider
            label="Offset · end"
            value={offEnd}
            min={0}
            max={0.5}
            step={0.05}
            format={(v) => v.toFixed(2)}
            onChange={setOffEnd}
            hint="Where progress completes (0 = top edge)."
          />
          <LabChips
            label="Progress signal"
            options={SMOOTHING}
            value={smoothing}
            onChange={setSmoothing}
          />
          <div className="border-hairline rounded-2 border p-3">
            <p className="text-label text-ink-3">READING</p>
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-3">progress</dt>
                <dd className="text-signal tabular-nums">{pct}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">mode</dt>
                <dd className="text-cobalt-bright">{mode}</dd>
              </div>
            </dl>
            <p className="text-ink-3 mt-2 font-mono text-[10px] tracking-wide uppercase">
              LINKED = REVERSIBLE · TRIGGERED = COMMITTED
            </p>
          </div>
        </>
      }
      stage={
        <LabStage label="KL-07 · SCROLL RIG" className="p-4" minHeight={380}>
          <div className="grid w-full gap-4 md:grid-cols-[1fr_150px]">
            {/* the miniature page */}
            <div
              ref={containerRef}
              tabIndex={0}
              aria-label="Demo page, scrollable"
              className="border-hairline bg-surface-0 h-[330px] overflow-y-auto rounded-2 border p-4 focus-visible:outline-2"
            >
              <div className="text-ink-3 flex h-24 items-center justify-center font-mono text-[11px] tracking-wide uppercase">
                Scroll down ↓
              </div>
              <div className="bg-surface-1 border-hairline mb-4 h-28 rounded-2 border" />
              <div
                ref={targetRef}
                className="bg-surface-2 border-hairline-strong relative overflow-hidden rounded-2 border p-4"
              >
                <p className="text-label text-ink-3">TARGET SECTION</p>
                <div className="flex h-24 items-center">
                  {linked ? (
                    <motion.div
                      style={
                        motionSafe
                          ? { rotate: badgeRotate, x: badgeX }
                          : { rotate: 180, x: 80 }
                      }
                      className="bg-cobalt flex size-12 items-center justify-center rounded-2 font-mono text-xs font-bold text-white"
                    >
                      KQ
                    </motion.div>
                  ) : (
                    <motion.div
                      animate={
                        inView
                          ? motionSafe
                            ? { scale: [0.8, 1.08, 1], rotate: 180, opacity: 1 }
                            : { opacity: 1, rotate: 180 }
                          : { opacity: 0.35, rotate: 0, scale: 1 }
                      }
                      transition={motionSafe ? springs.snap : { duration: 0.15 }}
                      className="bg-cobalt flex size-12 items-center justify-center rounded-2 font-mono text-xs font-bold text-white"
                    >
                      KQ
                    </motion.div>
                  )}
                </div>
                <span className="text-signal absolute right-3 bottom-2 font-mono text-[10px] tabular-nums">
                  {pct}%
                </span>
              </div>
              <div className="bg-surface-1 border-hairline mt-4 h-40 rounded-2 border" />
              <div className="bg-surface-1 border-hairline mt-4 h-40 rounded-2 border" />
            </div>

            {/* the track diagram */}
            <div aria-hidden className="hidden flex-col items-center gap-3 md:flex">
              <svg
                viewBox="0 0 60 200"
                className="border-hairline bg-surface-0 h-[240px] rounded-2 border"
              >
                {/* page rail */}
                <rect x={26} y={8} width={8} height={184} rx={2} fill="var(--hairline)" />
                {/* target band (approximate position on the rail) */}
                <rect x={26} y={78} width={8} height={34} rx={2} fill="var(--accent-wash)" />
                <rect x={26} y={78} width={8} height={34} rx={2} fill="none" stroke="var(--accent)" strokeWidth={0.75} />
                {/* offset trigger lines */}
                <line x1={10} x2={50} y1={78 + 34 * (1 - offStart) + 20} y2={78 + 34 * (1 - offStart) + 20} stroke="var(--hairline-strong)" strokeDasharray="3 3" />
                <line x1={10} x2={50} y1={78 - 34 * offEnd} y2={78 - 34 * offEnd} stroke="var(--hairline-strong)" strokeDasharray="3 3" />
                {/* viewport window */}
                <motion.rect
                  x={20}
                  width={20}
                  height={42}
                  rx={3}
                  style={{ y: windowY }}
                  fill="none"
                  stroke="var(--signal)"
                  strokeWidth={1.25}
                />
              </svg>
              {/* progress dial */}
              <svg viewBox="0 0 48 48" className="size-16">
                <circle cx={24} cy={24} r={19} fill="none" stroke="var(--hairline)" strokeWidth={3} />
                <motion.circle
                  cx={24}
                  cy={24}
                  r={19}
                  fill="none"
                  stroke="var(--signal)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  transform="rotate(-90 24 24)"
                  style={{ pathLength: dialLength }}
                />
                <text x={24} y={28} textAnchor="middle" fontSize={10} fill="var(--ink-2)" className="font-mono">
                  {pct}
                </text>
              </svg>
              <span className="text-label text-ink-3">TRACK</span>
            </div>
          </div>
          <span role="status" className="sr-only">
            Section progress {pct} percent
          </span>
        </LabStage>
      }
      code={
        <LiveCode
          code={code}
          values={[offStart.toFixed(2), offEnd.toFixed(2)]}
        />
      }
    />
  );
}
