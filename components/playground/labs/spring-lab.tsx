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
import { springs, type SpringName } from "@/registry/lib/motion";

const PRESETS = ["flick", "snap", "glide", "drift", "recoil"] as const;

type Params = { stiffness: number; damping: number; mass: number };

/** Closed-form-ish damped spring simulation for the scope traces. */
function simulate({ stiffness, damping, mass }: Params) {
  const dt = 1 / 120;
  const seconds = 2;
  const position: number[] = [];
  const velocity: number[] = [];
  let x = 0;
  let v = 0;
  for (let i = 0; i < seconds * 120; i++) {
    const springForce = -stiffness * (x - 1);
    const dampingForce = -damping * v;
    const a = (springForce + dampingForce) / mass;
    v += a * dt;
    x += v * dt;
    position.push(x);
    velocity.push(v);
  }
  // Settle time: last moment the position leaves the 2% band.
  let settleIndex = 0;
  for (let i = 0; i < position.length; i++) {
    const p = position[i];
    if (p !== undefined && Math.abs(p - 1) > 0.02) settleIndex = i;
  }
  const overshoot = Math.max(...position) - 1;
  return {
    position,
    velocity,
    settleMs: Math.round(((settleIndex + 1) / 120) * 1000),
    overshoot: Math.max(0, overshoot),
  };
}

const zetaOf = ({ stiffness, damping, mass }: Params) =>
  damping / (2 * Math.sqrt(stiffness * mass));

const omegaOf = ({ stiffness, mass }: Params) => Math.sqrt(stiffness / mass);

/** Nearest calibration in (ζ, ln ω₀) space, with a similarity score. */
function nearestCalibration(params: Params): { name: SpringName; pct: number } {
  let best: { name: SpringName; dist: number } = {
    name: "snap",
    dist: Infinity,
  };
  for (const name of PRESETS) {
    const preset = springs[name];
    const presetParams = {
      stiffness: preset.stiffness,
      damping: preset.damping,
      mass: preset.mass,
    };
    const dZeta = (zetaOf(params) - zetaOf(presetParams)) / 0.5;
    const dOmega =
      Math.log(omegaOf(params) / omegaOf(presetParams)) / Math.log(2.5);
    const dist = Math.hypot(dZeta, dOmega);
    if (dist < best.dist) best = { name, dist };
  }
  return { name: best.name, pct: Math.round(100 * Math.exp(-best.dist)) };
}

export function SpringLab() {
  const motionSafe = useMotionSafe();
  const [params, setParams] = useState<Params>({
    stiffness: 640,
    damping: 42,
    mass: 1,
  });
  const [preset, setPreset] = useState<SpringName | null>("snap");
  const [run, setRun] = useState(0);

  const sim = useMemo(() => simulate(params), [params]);
  const zeta = zetaOf(params);
  const match = nearestCalibration(params);

  const set = (patch: Partial<Params>) => {
    setParams((p) => ({ ...p, ...patch }));
    setPreset(null);
    setRun((r) => r + 1);
  };

  const applyPreset = (name: SpringName) => {
    const s = springs[name];
    setParams({ stiffness: s.stiffness, damping: s.damping, mass: s.mass });
    setPreset(name);
    setRun((r) => r + 1);
  };

  // Scope geometry: position trace scaled so target=1 sits at 1/3 height.
  const W = 560;
  const H = 180;
  const posY = (p: number) => H - 30 - p * 90;
  const velMax = Math.max(1, ...sim.velocity.map((v) => Math.abs(v)));
  const velY = (v: number) => H / 2 - (v / velMax) * 60;

  const positionPath = sim.position
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${((i / (sim.position.length - 1)) * W).toFixed(1)},${posY(p).toFixed(1)}`,
    )
    .join(" ");
  const velocityPath = sim.velocity
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${((i / (sim.velocity.length - 1)) * W).toFixed(1)},${velY(v).toFixed(1)}`,
    )
    .join(" ");

  const code = `import { motion } from "motion/react";

<motion.div
  animate={{ x: 240 }}
  transition={{
    type: "spring",
    stiffness: ${params.stiffness},
    damping: ${params.damping},
    mass: ${params.mass},
  }}
/>

// ζ ${zeta.toFixed(2)} · settles ~${sim.settleMs}ms
// closest calibration: springs.${match.name} (${match.pct}%)`;

  return (
    <LabBody
      controls={
        <>
          <LabChips
            label="Calibrations"
            options={PRESETS}
            value={preset}
            onChange={applyPreset}
          />
          <LabSlider
            label="Stiffness"
            value={params.stiffness}
            min={20}
            max={1500}
            step={10}
            onChange={(v) => set({ stiffness: v })}
            hint="Pull toward the target. Higher = faster, snappier."
          />
          <LabSlider
            label="Damping"
            value={params.damping}
            min={2}
            max={90}
            onChange={(v) => set({ damping: v })}
            hint="Friction. Lower = more bounce and overshoot."
          />
          <LabSlider
            label="Mass"
            value={params.mass}
            min={0.2}
            max={3}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => set({ mass: v })}
            hint="Weight. Heavier = slower, more sluggish."
          />
          <div className="border-hairline rounded-2 border p-3">
            <p className="text-label text-ink-3">READING</p>
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-3">ζ damping ratio</dt>
                <dd className="text-ink tabular-nums">{zeta.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">settles</dt>
                <dd className="text-ink tabular-nums">~{sim.settleMs}ms</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">overshoot</dt>
                <dd className="text-ink tabular-nums">
                  {(sim.overshoot * 100).toFixed(0)}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">closest</dt>
                <dd className="text-cobalt-bright">
                  {match.name} · {match.pct}%
                </dd>
              </div>
            </dl>
          </div>
        </>
      }
      stage={
        <LabStage
          label="KL-01 · SCOPE"
          onReplay={() => setRun((r) => r + 1)}
          className="flex-col gap-6"
          minHeight={340}
        >
          {/* the specimen: a puck springing between anchors */}
          <div className="relative h-14 w-full max-w-[560px]">
            <span className="text-label text-ink-3 absolute -bottom-5 left-0">
              START
            </span>
            <span className="text-label text-ink-3 absolute right-0 -bottom-5">
              TARGET
            </span>
            <span className="bg-hairline absolute top-1/2 right-0 left-0 h-px" />
            <motion.div
              key={run}
              initial={{ left: "0%" }}
              animate={{ left: "calc(100% - 40px)" }}
              transition={
                motionSafe ? { type: "spring", ...params } : { duration: 0 }
              }
              className="absolute top-1/2 -mt-5 size-10"
            >
              <div className="bg-cobalt size-10 rounded-2 shadow-[0_0_16px_var(--accent-wash)]" />
            </motion.div>
          </div>

          {/* the oscilloscope */}
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full max-w-[560px]"
            role="img"
            aria-label={`Position and velocity traces. Damping ratio ${zeta.toFixed(2)}, settles in about ${sim.settleMs} milliseconds.`}
          >
            {/* graticule */}
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                x1={0}
                x2={W}
                y1={H * f}
                y2={H * f}
                stroke="var(--hairline)"
              />
            ))}
            {[0.25, 0.5, 0.75].map((f) => (
              <line
                key={f}
                y1={0}
                y2={H}
                x1={W * f}
                x2={W * f}
                stroke="var(--hairline)"
              />
            ))}
            {/* target line */}
            <line
              x1={0}
              x2={W}
              y1={posY(1)}
              y2={posY(1)}
              stroke="var(--hairline-strong)"
              strokeDasharray="4 4"
            />
            {/* settle marker */}
            <line
              x1={(sim.settleMs / 2000) * W}
              x2={(sim.settleMs / 2000) * W}
              y1={12}
              y2={H - 12}
              stroke="var(--accent-wash)"
            />
            <motion.path
              key={`pos-${run}`}
              d={positionPath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5}
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: motionSafe ? 0.9 : 0, ease: "linear" }}
            />
            <motion.path
              key={`vel-${run}`}
              d={velocityPath}
              fill="none"
              stroke="var(--signal)"
              strokeWidth={1}
              opacity={0.7}
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={{ duration: motionSafe ? 0.9 : 0, ease: "linear" }}
            />
            <text
              x={8}
              y={16}
              className="fill-[var(--accent)] font-mono"
              fontSize={9}
            >
              POSITION
            </text>
            <text
              x={78}
              y={16}
              className="fill-[var(--signal)] font-mono"
              fontSize={9}
            >
              VELOCITY
            </text>
            <text
              x={Math.min((sim.settleMs / 2000) * W + 6, W - 90)}
              y={H - 18}
              fill="var(--ink-3)"
              className="font-mono"
              fontSize={9}
            >
              SETTLE {sim.settleMs}ms
            </text>
          </svg>
        </LabStage>
      }
      code={
        <LiveCode
          code={code}
          values={[
            String(params.stiffness),
            String(params.damping),
            String(params.mass),
            `springs.${match.name}`,
          ]}
        />
      }
    />
  );
}
