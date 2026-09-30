"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { EdgePeek } from "@/registry/ui/edge-peek";

export const tweaks = defineTweaks({
  reach: {
    kind: "range",
    label: "Reach",
    default: 160,
    min: 80,
    max: 240,
    step: 20,
    unit: "px",
  },
  lean: {
    kind: "range",
    label: "Lean",
    default: 24,
    min: 8,
    max: 48,
    step: 4,
    unit: "px",
  },
  side: {
    kind: "choice",
    label: "Side",
    default: "right",
    options: ["left", "right"],
    names: { left: "Left", right: "Right" },
  },
  pull: {
    kind: "choice",
    label: "Pull",
    default: "soft",
    options: ["soft", "firm"],
    names: { soft: "Soft", firm: "Firm" },
  },
});

type Layer = "trails" | "water" | "shelters";

const LAYERS: { id: Layer; label: string; meta: string }[] = [
  { id: "trails", label: "Trails", meta: "12 km" },
  { id: "water", label: "Water", meta: "2 lakes" },
  { id: "shelters", label: "Shelters", meta: "3 huts" },
];

// Procedural contour rings for two hills, pre-computed and rounded so the
// server and the browser draw the same map.
const CONTOURS = [
  "M182.9 112.9C179.6 117.5 166.6 120.3 157.8 121.7C148.9 123.2 136.5 124.7 129.9 121.9C123.2 119.1 118.1 110.6 117.8 105C117.6 99.4 122 91.7 128.3 88.2C134.6 84.7 147.3 82.9 155.6 83.9C163.8 84.9 173.2 89.5 177.7 94.4C182.3 99.2 186.3 108.4 182.9 112.9Z",
  "M210.8 120.5C204.7 128.9 180.7 134 164.3 136.8C148 139.5 125.2 142.1 112.9 137C100.6 131.8 91.1 116.2 90.6 105.9C90.1 95.5 98.3 81.4 109.9 74.9C121.5 68.4 145.1 65 160.3 66.9C175.5 68.8 192.8 77.3 201.2 86.2C209.6 95.1 217 112 210.8 120.5Z",
  "M241.2 128.7C232 141.3 196 149 171.5 153.1C147 157.3 112.7 161.2 94.3 153.5C75.9 145.8 61.6 122.3 60.9 106.8C60.2 91.3 72.4 70 89.9 60.3C107.3 50.5 142.6 45.5 165.4 48.3C188.3 51.2 214.1 63.9 226.8 77.3C239.4 90.7 250.4 116.1 241.2 128.7Z",
  "M274.2 137.6C261.6 154.8 212.6 165.3 179.3 170.9C145.9 176.5 99.3 181.9 74.2 171.3C49.1 160.8 29.7 128.9 28.7 107.8C27.7 86.7 44.4 57.8 68.1 44.5C91.8 31.2 140 24.4 171 28.2C202.1 32.1 237.3 49.4 254.5 67.7C271.7 85.9 286.7 120.4 274.2 137.6Z",
  "M326.8 70.3C320.7 72.4 310.6 73.6 305.6 71.5C300.6 69.3 296.5 61.8 296.9 57.2C297.2 52.6 302.5 45.6 307.8 43.8C313.1 42 323 43.8 328.7 46.3C334.4 48.9 342.5 54.9 342.2 58.9C341.9 62.9 332.9 68.2 326.8 70.3Z",
  "M335.6 82.5C323.5 86.7 303.3 89.3 293.3 84.9C283.3 80.6 275 65.6 275.8 56.4C276.5 47.2 287 33.2 297.6 29.6C308.2 26 328 29.6 339.4 34.7C350.9 39.7 367 51.8 366.3 59.8C365.7 67.8 347.8 78.4 335.6 82.5Z",
  "M345.4 96.2C326.5 102.7 295.1 106.7 279.5 99.9C264 93.1 251.2 69.9 252.3 55.5C253.4 41.2 269.8 19.5 286.3 13.8C302.8 8.2 333.5 13.9 351.3 21.7C369.1 29.5 394.2 48.4 393.2 60.8C392.2 73.2 364.4 89.7 345.4 96.2Z",
];
const LAKE =
  "M344.2 164.2C342.1 168.7 322.6 172.9 310.6 174.7C298.5 176.5 279.6 177.9 271.8 174.9C263.9 171.9 261 162.1 263.5 156.5C266.1 151 277 143.3 286.9 141.8C296.9 140.4 313.5 144.1 323 147.8C332.6 151.6 346.3 159.7 344.2 164.2Z";
const HUTS = [
  [118, 150],
  [232, 108],
  [338, 40],
] as const;

function TrailMap({ shown }: { shown: Record<Layer, boolean> }) {
  const layer = (on: boolean) =>
    cn("transition-opacity duration-200", on ? "opacity-100" : "opacity-0");
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 208"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <g fill="none" strokeWidth={1} className="stroke-hairline-strong">
        {CONTOURS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className={layer(shown.water)}>
        <path d={LAKE} className="fill-cobalt-wash stroke-cobalt/40" />
        <path
          d="M344 164C362 170 382 178 404 184"
          fill="none"
          strokeWidth={1.5}
          className="stroke-cobalt/40"
        />
      </g>
      <path
        d="M18 196C60 180 90 168 118 150S190 118 232 108S300 70 338 40"
        fill="none"
        strokeWidth={1.5}
        strokeDasharray="4 4"
        strokeLinecap="round"
        className={cn("stroke-ink-2", layer(shown.trails))}
      />
      <g className={layer(shown.shelters)}>
        {HUTS.map(([x, y]) => (
          <path
            key={`${x}-${y}`}
            d={`M${x - 5} ${y + 4}V${y - 1}L${x} ${y - 6}L${x + 5} ${y - 1}V${y + 4}Z`}
            strokeWidth={1.25}
            strokeLinejoin="round"
            className="fill-surface-0 stroke-ink-2"
          />
        ))}
      </g>
    </svg>
  );
}

/**
 * A Fieldline trail map with its Layers panel tucked into the edge. The
 * checkboxes in the panel really show and hide the map's layers.
 */
export function EdgePeekDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [shown, setShown] = React.useState<Record<Layer, boolean>>({
    trails: true,
    water: true,
    shelters: true,
  });
  const count = LAYERS.filter((l) => shown[l.id]).length;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <EdgePeek
        label="Layers"
        open={open}
        onOpenChange={setOpen}
        sound={sound}
        {...values}
        className="h-52 w-full rounded-3 border border-hairline bg-surface-1"
        panel={
          <ul className="flex flex-col gap-1">
            {LAYERS.map((l) => (
              <li key={l.id}>
                <label className="flex h-8 cursor-pointer items-center gap-2 rounded-2 px-2 text-sm text-foreground transition-colors hover:bg-surface-2">
                  <input
                    type="checkbox"
                    checked={shown[l.id]}
                    onChange={(event) => {
                      const on = event.currentTarget.checked;
                      setShown((prev) => ({ ...prev, [l.id]: on }));
                    }}
                    className="size-4 shrink-0 accent-cobalt"
                  />
                  <span className="min-w-0 flex-1">{l.label}</span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                    {l.meta}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        }
      >
        <TrailMap shown={shown} />
        <p className="absolute top-3 left-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Fieldline · Coldbrook Ridge
        </p>
      </EdgePeek>
      {chrome ? (
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          <span className="text-signal">
            {open ? "layers open" : "layers tucked"}
          </span>
          {` · ${count} of ${LAYERS.length} shown`}
        </p>
      ) : null}
    </div>
  );
}
