"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SeatMap, seatMapId } from "@/registry/ui/seat-map";

export const tweaks = defineTweaks({
  rows: { kind: "range", label: "Rows", default: 5, min: 3, max: 8, step: 1 },
  aisles: {
    kind: "range",
    label: "Aisles",
    default: 2,
    min: 0,
    max: 3,
    step: 1,
  },
  tiers: { kind: "toggle", label: "Price tiers", default: true },
  maxPicks: {
    kind: "range",
    label: "Max seats",
    default: 4,
    min: 1,
    max: 8,
    step: 1,
  },
});

const COLUMNS = 12;

/** FNV-1a, unsigned: the same seats are sold on every load. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return h >>> 0;
}

/** About a quarter of the house is sold, the front centre a little busier. */
const SOLD: string[] = [];
for (let r = 0; r < 8; r += 1) {
  for (let n = 1; n <= COLUMNS; n += 1) {
    const id = seatMapId(r, n);
    const middle = n > 3 && n <= COLUMNS - 3;
    const odds = r < 2 && middle ? 0.42 : 0.22;
    if ((hash(`basinworks-hall-${id}`) % 1000) / 1000 < odds) SOLD.push(id);
  }
}

/**
 * Basinworks Hall, Friday at 19:30: pick seats for your party. A quarter of
 * the house is already sold; once you have a seat, the free ones beside it
 * light up so the party can sit together.
 */
export function SeatMapDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [seats, setSeats] = React.useState<string[]>([]);
  const most = values.maxPicks ?? 4;
  // Fewer rows can leave a chosen seat off the map; the map drops it, and so
  // does the line under it.
  const rows = values.rows ?? 5;
  const here = new Set<string>();
  for (let r = 0; r < rows; r += 1) {
    for (let n = 1; n <= COLUMNS; n += 1) here.add(seatMapId(r, n));
  }
  const chosen = seats.filter((id) => here.has(id));

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <SeatMap
        label="Basinworks Hall seats"
        columns={COLUMNS}
        taken={SOLD}
        value={seats}
        onValueChange={setSeats}
        sound={sound}
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {chosen.length === 0 ? (
            <>
              <span className="text-signal">basinworks hall</span> · fri 19:30 ·
              pick up to {most}
            </>
          ) : (
            <>
              <span className="text-signal">
                {chosen.length} of {most} {most === 1 ? "seat" : "seats"}
              </span>{" "}
              · {chosen.join(" ")}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
