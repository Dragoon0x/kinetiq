"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  LoopLift,
  type LoopLiftRegion,
  type LoopLiftValue,
} from "@/registry/ui/loop-lift";

export const tweaks = defineTweaks({
  smoothing: {
    kind: "range",
    label: "Smoothing",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  lift: {
    kind: "range",
    label: "Lift",
    default: 12,
    min: 0,
    max: 24,
    step: 2,
    unit: "px",
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  dim: {
    kind: "range",
    label: "Dim",
    default: 0.5,
    min: 0,
    max: 0.8,
    step: 0.05,
  },
});

const REGIONS: LoopLiftRegion[] = [
  { id: "plant", label: "Plant", x: 0.07, y: 0.2, width: 0.24, height: 0.55 },
  {
    id: "teapot",
    label: "Teapot",
    x: 0.35,
    y: 0.44,
    width: 0.29,
    height: 0.32,
  },
  { id: "cup", label: "Cup", x: 0.655, y: 0.52, width: 0.13, height: 0.24 },
  { id: "lamp", label: "Lamp", x: 0.8, y: 0.19, width: 0.16, height: 0.57 },
];

// The product shot is drawn from the theme's own colours, so it reads on a
// light stage and a dark one alike.
const WALL = "var(--bg-2)";
const LIGHT = "color-mix(in oklab, var(--warn) 14%, var(--bg-2))";
const WOOD = "color-mix(in oklab, var(--warn) 36%, var(--bg-1))";
const WOOD_EDGE = "color-mix(in oklab, var(--warn) 52%, var(--bg-1))";
const WOOD_FRONT = "color-mix(in oklab, var(--warn) 24%, var(--bg-0))";
const LEAF = "var(--success)";
const LEAF_DARK = "color-mix(in oklab, var(--success) 68%, black)";
const POT = "color-mix(in oklab, var(--danger) 58%, var(--warn))";
const POT_RIM = "color-mix(in oklab, var(--danger) 44%, var(--warn))";
const PORCELAIN = "var(--accent)";
const PORCELAIN_DARK = "color-mix(in oklab, var(--accent) 72%, black)";
const CUP = "var(--warn)";
const COFFEE = "color-mix(in oklab, var(--warn) 34%, black)";
const METAL = "var(--ink-2)";
const SHADE = "color-mix(in oklab, var(--warn) 50%, var(--bg-1))";
const STEAM = "var(--ink-3)";

/** A shelf still life for the Fernworks Studio listing editor. */
function StillLife() {
  return (
    <svg
      viewBox="0 0 320 200"
      role="img"
      aria-label="A plant, a teapot, a cup and a lamp on a wooden shelf"
      className="block h-auto w-full"
    >
      <rect width={320} height={200} style={{ fill: WALL }} />
      <circle cx={282} cy={72} r={70} style={{ fill: LIGHT }} />
      <rect y={150} width={320} height={50} style={{ fill: WOOD }} />
      <rect y={157} width={320} height={43} style={{ fill: WOOD_FRONT }} />
      <rect y={149} width={320} height={2} style={{ fill: WOOD_EDGE }} />

      <g>
        <ellipse
          cx={36}
          cy={94}
          rx={5}
          ry={17}
          transform="rotate(-52 36 94)"
          style={{ fill: LEAF_DARK }}
        />
        <ellipse
          cx={86}
          cy={94}
          rx={5}
          ry={17}
          transform="rotate(52 86 94)"
          style={{ fill: LEAF_DARK }}
        />
        <ellipse
          cx={47}
          cy={78}
          rx={6}
          ry={25}
          transform="rotate(-26 47 78)"
          style={{ fill: LEAF }}
        />
        <ellipse
          cx={75}
          cy={78}
          rx={6}
          ry={25}
          transform="rotate(26 75 78)"
          style={{ fill: LEAF }}
        />
        <ellipse cx={61} cy={72} rx={7} ry={30} style={{ fill: LEAF_DARK }} />
        <path
          d="M61 46 L61 104"
          strokeWidth={1}
          style={{ stroke: LEAF, opacity: 0.6 }}
        />
        <path d="M38 112 L84 112 L78 150 L44 150 Z" style={{ fill: POT }} />
        <rect
          x={35}
          y={105}
          width={52}
          height={9}
          rx={2}
          style={{ fill: POT_RIM }}
        />
      </g>

      <g>
        <path
          d="M190 110 C209 108 209 141 187 140"
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          style={{ stroke: PORCELAIN_DARK }}
        />
        <path
          d="M128 126 Q112 120 114 101 L121 99 Q122 116 134 117 Z"
          style={{ fill: PORCELAIN_DARK }}
        />
        <ellipse
          cx={158}
          cy={126}
          rx={34}
          ry={24}
          style={{ fill: PORCELAIN }}
        />
        <rect
          x={134}
          y={144}
          width={48}
          height={6}
          rx={2}
          style={{ fill: PORCELAIN_DARK }}
        />
        <ellipse
          cx={158}
          cy={103}
          rx={18}
          ry={5}
          style={{ fill: PORCELAIN_DARK }}
        />
        <circle cx={158} cy={96} r={4} style={{ fill: PORCELAIN_DARK }} />
        <ellipse
          cx={145}
          cy={116}
          rx={10}
          ry={5}
          fill="white"
          fillOpacity={0.24}
        />
      </g>

      <g>
        <path
          d="M224 116 C220 112 228 108 224 104 M232 116 C228 112 236 108 232 104"
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{ stroke: STEAM, opacity: 0.6 }}
        />
        <ellipse cx={228} cy={148} rx={21} ry={4} style={{ fill: METAL }} />
        <path
          d="M241 127 C252 127 252 140 239 140"
          fill="none"
          strokeWidth={3}
          style={{ stroke: CUP }}
        />
        <path d="M214 121 L242 121 L238 146 L218 146 Z" style={{ fill: CUP }} />
        <ellipse cx={228} cy={121} rx={14} ry={3} style={{ fill: COFFEE }} />
      </g>

      <g>
        <ellipse cx={282} cy={147} rx={18} ry={4} style={{ fill: METAL }} />
        <rect x={280} y={70} width={4} height={77} style={{ fill: METAL }} />
        <ellipse
          cx={282}
          cy={73}
          rx={17}
          ry={3}
          style={{ fill: CUP, opacity: 0.7 }}
        />
        <path d="M262 72 L302 72 L292 40 L272 40 Z" style={{ fill: SHADE }} />
      </g>
    </svg>
  );
}

const nameOf = (v: LoopLiftValue) => {
  const names = REGIONS.filter((r) => v.regions.includes(r.id)).map((r) =>
    r.label.toLowerCase(),
  );
  if (names.length === 0) return "selection";
  if (names.length <= 2) return names.join(" and ");
  return `${names.length} items`;
};

/**
 * Fernworks Studio's listing editor: a product shot of a shelf. Circle an
 * item to lift it onto a new listing; Escape or a tap puts it back.
 */
export function LoopLiftDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<LoopLiftValue | null>(null);
  const [dropped, setDropped] = React.useState(false);

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <LoopLift
        label="Items in the product shot"
        regions={REGIONS}
        value={value}
        onValueChange={(next) => {
          setValue(next);
          setDropped(next === null);
        }}
        sound={sound}
        {...values}
      >
        <StillLife />
      </LoopLift>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {value ? (
            <>
              <span className="text-signal">lifted {nameOf(value)}</span> ·{" "}
              {Math.max(1, Math.round(value.area * 100))}% of frame
            </>
          ) : dropped ? (
            <>
              <span className="text-signal">dropped</span> · circle another
            </>
          ) : (
            <>
              <span className="text-signal">{REGIONS.length} items</span> ·
              circle one or press enter
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
