"use client";

import * as React from "react";

import { SlotGrid } from "@/registry/ui/slot-grid";

const DAYS = [
  { id: "tue", label: "Tue 14" },
  { id: "wed", label: "Wed 15" },
  { id: "thu", label: "Thu 16" },
];

const TIMES = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00"];

const TAKEN = [
  "tue:10:00",
  "tue:14:00",
  "wed:09:00",
  "wed:13:00",
  "thu:11:00",
  "thu:15:00",
];

export function SlotGridDemo() {
  const [slot, setSlot] = React.useState("");
  const day = DAYS.find((entry) => slot.startsWith(`${entry.id}:`));
  const time = slot.slice(slot.indexOf(":") + 1);

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <SlotGrid
        label="Basinworks viewings"
        days={DAYS}
        times={TIMES}
        taken={TAKEN}
        value={slot}
        onValueChange={setSlot}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {day ? (
          <>
            Viewing{" "}
            <span className="text-signal tabular-nums">
              {day.label} · {time}
            </span>
          </>
        ) : (
          "Pick a viewing slot"
        )}
      </p>
    </div>
  );
}
