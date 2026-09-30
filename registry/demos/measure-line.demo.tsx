"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  MeasureLine,
  formatMeasure,
  measureLength,
  type MeasureLinePoint,
  type MeasureLineSegment,
} from "@/registry/ui/measure-line";

export const tweaks = defineTweaks({
  units: {
    kind: "choice",
    label: "Units",
    default: "m",
    options: ["m", "cm", "ft"],
    names: { m: "Metres", cm: "Centimetres", ft: "Feet" },
  },
  snap: { kind: "toggle", label: "Snap", default: true },
  scale: {
    kind: "range",
    label: "Scale (1:n)",
    default: 50,
    min: 20,
    max: 100,
    step: 5,
  },
  keep: { kind: "toggle", label: "Keep", default: true },
});

/** The sheet, in millimetres on paper: 240 × 100, a 12 × 5 m flat at 1:50. */
const SHEET = { width: 240, height: 100 };

/** Wall corners and door jambs, where a measuring end wants to land. */
const CORNERS: MeasureLinePoint[] = [
  [8, 8],
  [100, 8],
  [166, 8],
  [232, 8],
  [100, 62],
  [100, 78],
  [166, 56],
  [186, 56],
  [202, 56],
  [232, 56],
  [166, 66],
  [166, 82],
  [8, 92],
  [100, 92],
  [166, 92],
  [196, 92],
  [214, 92],
  [232, 92],
];

const WALL = "color-mix(in oklab, var(--ink-3) 72%, var(--bg-1))";
const FLOOR = "color-mix(in oklab, var(--accent) 4%, var(--bg-1))";
const FURNITURE = "var(--hairline)";
const FURNITURE_EDGE = "var(--hairline-strong)";
const MARK = "var(--ink-3)";

/** Flat 4B: living room, bedroom, kitchen and hall, drawn in sheet units. */
function Plan() {
  return (
    <g>
      <rect x={8} y={8} width={224} height={84} style={{ fill: FLOOR }} />
      <g style={{ fill: FURNITURE, stroke: FURNITURE_EDGE }} strokeWidth={0.6}>
        <rect x={18} y={70} width={42} height={14} rx={2} />
        <circle cx={58} cy={34} r={9} />
        <rect x={112} y={16} width={34} height={40} rx={2} />
        <rect x={115} y={18} width={12} height={7} rx={1.5} />
        <rect x={131} y={18} width={12} height={7} rx={1.5} />
        <rect x={218} y={12} width={10} height={40} rx={1} />
        <circle cx={223} cy={22} r={3} />
        <circle cx={223} cy={32} r={3} />
      </g>
      <g
        fill="none"
        strokeWidth={0.6}
        style={{ stroke: MARK }}
        strokeDasharray="1.5 1.5"
      >
        <path d="M100 62 A16 16 0 0 0 84 78" />
        <path d="M166 66 A16 16 0 0 0 150 82" />
        <path d="M202 56 A16 16 0 0 1 186 72" />
        <path d="M196 92 A18 18 0 0 1 214 74" />
      </g>
      <g strokeWidth={0.8} style={{ stroke: MARK }}>
        <path d="M100 78 L84 78" />
        <path d="M166 82 L150 82" />
        <path d="M186 56 L186 72" />
        <path d="M214 92 L214 74" />
      </g>
      <path
        d="M8 8 H232 V92 H214 M196 92 H8 V8 M100 8 V62 M100 78 V92 M166 8 V66 M166 82 V92 M166 56 H186 M202 56 H232"
        fill="none"
        strokeWidth={3}
        strokeLinecap="square"
        style={{ stroke: WALL }}
      />
      <g style={{ fill: "var(--bg-1)", stroke: MARK }} strokeWidth={0.5}>
        <rect x={30} y={6.5} width={40} height={3} />
        <rect x={116} y={6.5} width={32} height={3} />
        <rect x={180} y={6.5} width={28} height={3} />
        <rect x={6.5} y={36} width={3} height={24} />
      </g>
      <g
        className="font-mono"
        fontSize={4.2}
        letterSpacing={0.5}
        textAnchor="middle"
        style={{ fill: MARK }}
      >
        <text x={54} y={56}>
          LIVING
        </text>
        <text x={133} y={72}>
          BEDROOM
        </text>
        <text x={194} y={34}>
          KITCHEN
        </text>
        <text x={186} y={86}>
          HALL
        </text>
      </g>
    </g>
  );
}

/**
 * Basinworks Homes' listing for flat 4B at 1:50: drag between walls to
 * measure rooms, keep a few lines, and read the totals underneath.
 */
export function MeasureLineDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [lines, setLines] = React.useState<MeasureLineSegment[]>([]);
  const scale = values.scale ?? tweaks.scale.default;
  const units = values.units ?? tweaks.units.default;
  const last = lines[lines.length - 1];
  const total = lines.reduce((sum, l) => sum + measureLength(l, scale), 0);

  return (
    <div className="flex w-full max-w-[34rem] flex-col gap-3">
      <MeasureLine
        {...SHEET}
        corners={CORNERS}
        label="Flat 4B floor plan"
        value={lines}
        onValueChange={setLines}
        sound={sound}
        {...values}
      >
        <Plan />
      </MeasureLine>
      {chrome ? (
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {last ? (
              <>
                <span className="text-signal">
                  {lines.length} {lines.length === 1 ? "line" : "lines"}
                </span>{" "}
                · last {formatMeasure(measureLength(last, scale), units)}
                {lines.length > 1
                  ? ` · total ${formatMeasure(total, units)}`
                  : null}
              </>
            ) : (
              <>
                <span className="text-signal">flat 4b · 1:{scale}</span> · drag
                across the plan to measure
              </>
            )}
          </p>
          <button
            type="button"
            disabled={lines.length === 0}
            onClick={() => setLines([])}
            className="inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}
