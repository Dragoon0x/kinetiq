"use client";

import { useEffect, useRef, useState } from "react";

import { motion } from "motion/react";

import {
  LabBody,
  LabChips,
  LabSlider,
  LabStage,
  LiveCode,
} from "@/components/playground/lab-primitives";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const MODES = ["auto (cascade)", "fixed"] as const;
type Mode = (typeof MODES)[number];

const ORIGINS = ["first", "center", "last", "clicked"] as const;
type Origin = (typeof ORIGINS)[number];

const DIRECTIONS = ["rise", "drop", "scale"] as const;
type Direction = (typeof DIRECTIONS)[number];

const ENTER_FROM = {
  rise: { opacity: 0, y: 12 },
  drop: { opacity: 0, y: -12 },
  scale: { opacity: 0, scale: 0.96 },
} as const;

const ENTER_CODE: Record<Direction, string> = {
  rise: "{ opacity: 0, y: 12 }",
  drop: "{ opacity: 0, y: -12 }",
  scale: "{ opacity: 0, scale: 0.96 }",
};

const CELL = 40; // min cell edge (px) — matches the auto-fill track
const GAP = 8;
const SETTLE_MS = 450; // springs.glide settles ~450ms
const BUDGET_MS = 600;
const GANTT_MAX = 24;

export function CascadeLab() {
  const motionSafe = useMotionSafe();
  const [count, setCount] = useState(24);
  const [mode, setMode] = useState<Mode>("auto (cascade)");
  const [fixedMs, setFixedMs] = useState(80);
  const [origin, setOrigin] = useState<Origin>("first");
  const [direction, setDirection] = useState<Direction>("rise");
  const [clickedIdx, setClickedIdx] = useState(0);
  const [cols, setCols] = useState(8);
  const [run, setRun] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Track how many auto-fill columns the grid actually resolved to,
  // so distances use real rows/cols.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      setCols(Math.max(1, Math.floor((el.clientWidth + GAP) / (CELL + GAP))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rerun = () => setRun((r) => r + 1);

  const auto = mode === "auto (cascade)";
  const intervalS = auto ? cascade(count) : fixedMs / 1000;
  const intervalMs = Math.round(intervalS * 1000);

  const originIdx =
    origin === "first"
      ? 0
      : origin === "center"
        ? Math.floor((count - 1) / 2)
        : origin === "last"
          ? count - 1
          : Math.min(clickedIdx, count - 1);

  // Per-cell delay: Euclidean row/col distance from the origin × interval.
  const oRow = Math.floor(originIdx / cols);
  const oCol = originIdx % cols;
  const delayFor = (i: number) =>
    Math.hypot(Math.floor(i / cols) - oRow, (i % cols) - oCol) * intervalS;

  let lastDelayS = 0;
  for (let i = 0; i < count; i++) lastDelayS = Math.max(lastDelayS, delayFor(i));
  const lastMs = Math.round(lastDelayS * 1000);
  const totalMs = lastMs + SETTLE_MS;
  const inside = lastMs <= BUDGET_MS;
  const verdict = inside ? "INSIDE BUDGET" : "READS AS LAG";

  // Gantt geometry.
  const shown = Math.min(count, GANTT_MAX);
  const GW = 560;
  const ROW_H = 5;
  const TOP = 16;
  const BOTTOM = 16;
  const GH = TOP + shown * ROW_H + BOTTOM;
  const domainMs = Math.max(1000, totalMs + 100);
  const tx = (ms: number) => (ms / domainMs) * GW;

  const delayExpr = auto ? `cascade(${count}) * i` : `${fixedMs / 1000} * i`;
  const code = `import { motion } from "motion/react";
import { ${auto ? "cascade, springs" : "springs"} } from "@/registry/lib/motion";

{items.map((item, i) => (
  <motion.div
    key={item.id}
    initial={${ENTER_CODE[direction]}}
    animate={{ opacity: 1${direction === "scale" ? ", scale: 1" : ", y: 0"} }}
    transition={{
      ...springs.glide,
      delay: ${delayExpr}, // ${intervalMs}ms steps
    }}
  />
))}

// ${count} items · last starts ${lastMs}ms · settled ~${totalMs}ms
// 600ms budget — ${verdict}`;

  return (
    <LabBody
      controls={
        <>
          <LabSlider
            label="Items"
            value={count}
            min={4}
            max={48}
            onChange={(v) => {
              setCount(v);
              rerun();
            }}
            hint="cascade() tightens the interval as the count grows."
          />
          <LabChips
            label="Interval"
            options={MODES}
            value={mode}
            onChange={(v) => {
              setMode(v);
              rerun();
            }}
          />
          {mode === "fixed" ? (
            <LabSlider
              label="Fixed interval"
              value={fixedMs}
              min={10}
              max={120}
              step={5}
              format={(v) => `${v}ms`}
              onChange={(v) => {
                setFixedMs(v);
                rerun();
              }}
              hint="Constant spacing, whatever the count."
            />
          ) : null}
          <div>
            <LabChips
              label="Origin"
              options={ORIGINS}
              value={origin}
              onChange={(v) => {
                setOrigin(v);
                rerun();
              }}
            />
            {origin === "clicked" ? (
              <p className="text-ink-3 mt-1.5 text-xs">
                Click any cell on the stage to cascade from it.
              </p>
            ) : null}
          </div>
          <LabChips
            label="Enter"
            options={DIRECTIONS}
            value={direction}
            onChange={(v) => {
              setDirection(v);
              rerun();
            }}
          />
          <div className="border-hairline rounded-2 border p-3">
            <p className="text-label text-ink-3">READING</p>
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <dt className="text-ink-3">interval</dt>
                <dd className="text-ink tabular-nums">{intervalMs}ms</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">last starts</dt>
                <dd className="text-ink tabular-nums">{lastMs}ms</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">total ≈</dt>
                <dd className="text-ink tabular-nums">{totalMs}ms</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-3">verdict</dt>
                <dd className={inside ? "text-success" : "text-danger"}>
                  {verdict}
                </dd>
              </div>
            </dl>
          </div>
        </>
      }
      stage={
        <LabStage
          label="KL-03 · CHOREOGRAPHY"
          onReplay={rerun}
          className="flex-col gap-6"
          minHeight={400}
        >
          {/* the grid — stays mounted; cells re-key per run */}
          <div
            ref={gridRef}
            className="grid w-full max-w-[560px] gap-2"
            style={{
              gridTemplateColumns: `repeat(auto-fill, minmax(${CELL}px, 1fr))`,
            }}
          >
            {Array.from({ length: count }, (_, i) => (
              <motion.button
                key={`${run}-${i}`}
                type="button"
                onClick={() => {
                  if (origin !== "clicked") return;
                  setClickedIdx(i);
                  rerun();
                }}
                initial={ENTER_FROM[direction]}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={
                  motionSafe
                    ? { ...springs.glide, delay: delayFor(i) }
                    : { duration: 0 }
                }
                aria-label={
                  origin === "clicked"
                    ? `Cascade from cell ${i + 1}`
                    : `Cell ${i + 1}`
                }
                className={cn(
                  "bg-surface-2 border-hairline rounded-2 aspect-square border",
                  origin === "clicked"
                    ? "hover:border-cobalt cursor-pointer"
                    : "cursor-default",
                  i === originIdx && "border-cobalt bg-cobalt-wash",
                )}
              />
            ))}
          </div>

          {/* the gantt strip — always drawn static */}
          <div className="w-full max-w-[560px]">
            <p className="text-label text-ink-3 mb-2">
              DELAY GANTT · BAR = START + GLIDE SETTLE
            </p>
            <svg
              viewBox={`0 0 ${GW} ${GH}`}
              className="w-full"
              role="img"
              aria-label={`Delay timeline. Last cell starts at ${lastMs} milliseconds against a 600 millisecond budget. Verdict: ${verdict.toLowerCase()}.`}
            >
              {Array.from({ length: shown }, (_, i) => {
                const d = delayFor(i) * 1000;
                const y = TOP + i * ROW_H;
                return (
                  <g key={i}>
                    <rect
                      x={tx(d)}
                      y={y}
                      width={Math.max(2, tx(SETTLE_MS))}
                      height={3}
                      rx={1}
                      fill="var(--accent)"
                      opacity={0.22}
                    />
                    <rect
                      x={tx(d)}
                      y={y}
                      width={2.5}
                      height={3}
                      fill="var(--accent-bright)"
                    />
                  </g>
                );
              })}
              {/* the 600ms budget line */}
              <line
                x1={tx(BUDGET_MS)}
                x2={tx(BUDGET_MS)}
                y1={5}
                y2={GH - BOTTOM + 4}
                stroke="var(--danger)"
              />
              <text
                x={tx(BUDGET_MS) + 5}
                y={12}
                fill="var(--danger)"
                fontSize={9}
                className="font-mono"
              >
                BUDGET 600MS
              </text>
              {/* axis */}
              <text
                x={0}
                y={GH - 4}
                fill="var(--ink-3)"
                fontSize={9}
                className="font-mono"
              >
                0MS
              </text>
              {count > shown ? (
                <text
                  x={GW / 2}
                  y={GH - 4}
                  textAnchor="middle"
                  fill="var(--ink-3)"
                  fontSize={9}
                  className="font-mono"
                >
                  +{count - shown} MORE
                </text>
              ) : null}
              <text
                x={GW}
                y={GH - 4}
                textAnchor="end"
                fill="var(--ink-3)"
                fontSize={9}
                className="font-mono"
              >
                {domainMs}MS
              </text>
            </svg>
          </div>
        </LabStage>
      }
      code={
        <LiveCode
          code={code}
          values={[
            delayExpr,
            `${count} items`,
            `${intervalMs}ms`,
            `${lastMs}ms`,
            `~${totalMs}ms`,
            verdict,
          ]}
        />
      }
    />
  );
}
