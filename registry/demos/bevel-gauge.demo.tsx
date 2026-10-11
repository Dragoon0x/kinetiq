"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BevelGauge } from "@/registry/ui/bevel-gauge";

export const tweaks = defineTweaks({
  snapAngle: {
    kind: "range",
    label: "Snap",
    default: 15,
    min: 0,
    max: 45,
    step: 5,
    unit: "°",
  },
  scale: {
    kind: "choice",
    label: "Scale",
    default: "degrees",
    options: ["degrees", "pitch", "radians", "grads"],
    names: {
      degrees: "Degrees",
      pitch: "Pitch",
      radians: "Radians",
      grads: "Gradians",
    },
  },
  ink: {
    kind: "choice",
    label: "Ink",
    default: "cobalt",
    options: ["cobalt", "graphite", "carmine", "signal"],
    names: {
      cobalt: "Cobalt",
      graphite: "Graphite",
      carmine: "Carmine",
      signal: "Signal",
    },
  },
});

const pitchOf = (deg: number) => {
  const a = Math.min(deg, 180 - deg);
  return a >= 89.95
    ? "plumb"
    : `${(12 * Math.tan((a * Math.PI) / 180)).toFixed(1)} in 12`;
};

type Story =
  | { kind: "idle" }
  | { kind: "measuring"; deg: number }
  | { kind: "measured"; deg: number };

/**
 * A Gaugeworks truss sheet: a Fink roof truss drawn in hairlines, its heel at
 * the gauge's resting place, so the dimension already on the sheet is the
 * roof's pitch — and any other joint is a press and a drag away.
 */
function Truss() {
  return (
    <div className="@container absolute inset-0">
      <svg
        aria-hidden
        viewBox="0 0 260 75"
        className="absolute top-[72%] left-[30%] h-auto -translate-y-full overflow-visible text-ink-3"
        style={{ width: "min(260px, 62cqw)" }}
      >
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
        >
          <path
            d="M -16 84.2 L 130 0 L 276 84.2"
            vectorEffect="non-scaling-stroke"
          />
          <path d="M 0 75 L 260 75" vectorEffect="non-scaling-stroke" />
          <path
            d="M 65 37.5 L 86.7 75 L 130 0 L 173.3 75 L 195 37.5"
            strokeOpacity={0.7}
            vectorEffect="non-scaling-stroke"
          />
        </g>
        <g className="fill-card" stroke="currentColor" strokeWidth={1}>
          {[
            [0, 75],
            [130, 0],
            [260, 75],
            [65, 37.5],
            [195, 37.5],
            [86.7, 75],
            [173.3, 75],
          ].map(([x = 0, y = 0]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={2.2}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <text
          x={130}
          y={60}
          textAnchor="middle"
          className="fill-current font-mono text-[8px] tracking-[0.08em] uppercase"
        >
          T-04
        </text>
      </svg>
    </div>
  );
}

export function BevelGaugeDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [story, setStory] = React.useState<Story>({ kind: "idle" });

  const gauge = (
    <BevelGauge
      label="Truss angle"
      defaultValue={30}
      pivot={[0.3, 0.72]}
      onValueChange={(deg) => setStory({ kind: "measuring", deg })}
      onMeasure={(deg) => setStory({ kind: "measured", deg })}
      sound={sound}
      className="h-52 w-full rounded-3 border border-hairline bg-card"
      {...values}
    >
      <Truss />
    </BevelGauge>
  );

  if (!chrome) return <div className="flex w-full">{gauge}</div>;

  const snap = values.snapAngle ?? 15;
  const snapped =
    story.kind !== "idle" &&
    snap > 0 &&
    Math.abs(story.deg / snap - Math.round(story.deg / snap)) < 1e-6;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks · Truss T-04
        </p>
        <p className="text-base font-medium text-foreground">
          Check the pitch before you cut.
        </p>
      </div>
      {gauge}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {story.kind === "idle" ? (
          <>
            <span className="text-signal">drag from a joint</span> · the heel
            reads 30.0° · {pitchOf(30)}
          </>
        ) : (
          <>
            <span className="text-signal">
              {story.kind === "measuring"
                ? snapped
                  ? "snapped"
                  : "measuring"
                : "measured"}
            </span>{" "}
            · {story.deg.toFixed(1)}° · {pitchOf(story.deg)}
          </>
        )}
      </p>
    </div>
  );
}
