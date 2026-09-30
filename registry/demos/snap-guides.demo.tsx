"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  SnapGuides,
  type SnapGuidesChange,
  type SnapGuidesLayer,
  type SnapGuidesValue,
} from "@/registry/ui/snap-guides";

export const tweaks = defineTweaks({
  snap: {
    kind: "range",
    label: "Snap",
    default: 6,
    min: 2,
    max: 16,
    step: 2,
    unit: "px",
  },
  guides: {
    kind: "choice",
    label: "Guides",
    default: "both",
    options: ["edges", "centres", "both"],
    names: { edges: "Edges", centres: "Centres", both: "Both" },
  },
  distances: { kind: "toggle", label: "Distances", default: true },
  grid: { kind: "toggle", label: "Grid", default: false },
});

/** The Fernworks autumn launch banner: a photo, a headline, a button, the mark. */
const LAYERS: SnapGuidesLayer[] = [
  {
    id: "photo",
    label: "Photo",
    width: 144,
    height: 108,
    content: (
      <svg viewBox="0 0 144 108" className="block size-full">
        <rect width={144} height={108} rx={4} className="fill-cobalt-wash" />
        <circle cx={104} cy={34} r={13} className="fill-warn" opacity={0.75} />
        <path
          d="M0 78C30 56 52 58 76 74S120 70 144 60V104Q144 108 140 108H4Q0 108 0 104Z"
          className="fill-success"
          opacity={0.4}
        />
        <path
          d="M0 92C34 76 70 80 98 92S132 94 144 88V104Q144 108 140 108H4Q0 108 0 104Z"
          className="fill-success"
          opacity={0.75}
        />
      </svg>
    ),
  },
  {
    id: "headline",
    label: "Headline",
    width: 172,
    height: 48,
    content: (
      <svg viewBox="0 0 172 48" className="block size-full">
        <text
          x={0}
          y={19}
          fontSize={19}
          fontWeight={600}
          className="fill-foreground"
        >
          The autumn
        </text>
        <text
          x={0}
          y={43}
          fontSize={19}
          fontWeight={600}
          className="fill-foreground"
        >
          field kit
        </text>
      </svg>
    ),
  },
  {
    id: "button",
    label: "Button",
    width: 104,
    height: 28,
    content: (
      <svg viewBox="0 0 104 28" className="block size-full">
        <rect width={104} height={28} rx={14} className="fill-primary" />
        <text
          x={52}
          y={18}
          fontSize={11}
          fontWeight={500}
          textAnchor="middle"
          className="fill-primary-foreground"
        >
          Shop the kit
        </text>
      </svg>
    ),
  },
  {
    id: "logo",
    label: "Logo",
    width: 84,
    height: 20,
    content: (
      <svg viewBox="0 0 84 20" className="block size-full">
        <path
          d="M3 16C3 8 8 3 16 3C16 11 11 16 3 16Z"
          className="fill-success"
        />
        <path
          d="M5 14L11 8"
          fill="none"
          strokeWidth={1.4}
          strokeLinecap="round"
          className="stroke-card"
        />
        <text
          x={21}
          y={14}
          fontSize={11}
          fontWeight={500}
          className="fill-ink-2"
        >
          Fernworks
        </text>
      </svg>
    ),
  },
];

// The headline starts 6 px below the photo's top, so the first drag finds it.
const START: SnapGuidesValue = {
  photo: { x: 24, y: 24 },
  headline: { x: 192, y: 30 },
  button: { x: 192, y: 104 },
  logo: { x: 292, y: 156 },
};

/**
 * The Fernworks autumn launch banner on a 400 × 200 artboard. Drag a layer
 * (or tab to one and use the arrows) and its edges find the others.
 */
export function SnapGuidesDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [positions, setPositions] = React.useState<SnapGuidesValue>(START);
  const [last, setLast] = React.useState<SnapGuidesChange | null>(null);
  const moved = last ? LAYERS.find((l) => l.id === last.id) : undefined;

  return (
    <div className="flex w-full max-w-104 flex-col gap-3">
      <SnapGuides
        label="Autumn launch banner"
        layers={LAYERS}
        value={positions}
        onValueChange={(next, change) => {
          setPositions(next);
          setLast(change);
        }}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {last && moved ? (
            <>
              <span className="text-signal">{moved.label.toLowerCase()}</span>
              {` · ${last.x}, ${last.y} · `}
              {last.alignedWith.length
                ? `in line with ${last.alignedWith.join(", ").toLowerCase()}`
                : "free"}
            </>
          ) : (
            <>
              <span className="text-signal">4 layers</span> · drag one, or tab
              to it and use the arrows
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
