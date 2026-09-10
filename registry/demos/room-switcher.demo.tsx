"use client";

import * as React from "react";

import { RoomSwitcher, type SwitcherRoom } from "@/registry/ui/room-switcher";

/** Seed rows: id | name | topic | last line | who wrote it | unread. */
const ROWS = [
  "dispatch|dispatch|Morning run, gate B|Gate B is loaded, sixteen pallets.|Ines Corta|2",
  "returns|returns|Damaged crates from Basinworks|Two came back split along the base.|Marta Vey|1",
  "pay|waylight-pay|Payouts for week 36|Waylight Pay cleared the batch.|Rui Alcan|0",
  "basinworks|basinworks|Contract copy for the yard|Signed and filed this morning.|Rui Alcan|0",
  "gate|gate-b|Scale and barrier|Scale reads forty kilos light.|Ines Corta|0",
  "night|night-shift|Rota for the week|Two on tonight, not three.|Marta Vey|0",
  "safety|yard-safety|Hi-vis and lane markings|Lane four is taped off.|Ines Corta|0",
  "rota|rota|Who is on next week|Rui takes the Thursday run.|Marta Vey|0",
  "general|coldbrook-general|Anything that is not a run|Kettle in the office is back.|Rui Alcan|0",
  "dm-ines|Ines Corta|Direct|Can you take gate B at six?|Ines Corta|1",
  "dm-marta|Marta Vey|Direct|The Basinworks photos are up.|Marta Vey|0",
  "dm-rui|Rui Alcan|Direct|Week 36 is queued for Friday.|Rui Alcan|0",
];

const ROOMS: SwitcherRoom[] = ROWS.map((row) => {
  const [id, name, topic, last, by, unread] = row.split("|");
  return {
    id: id ?? "",
    name: name ?? "",
    topic: topic ?? "",
    last: last ?? "",
    by: by ?? "",
    unread: Number(unread ?? "0"),
    direct: (id ?? "").startsWith("dm-"),
  };
});

export function RoomSwitcherDemo() {
  const [current, setCurrent] = React.useState("dispatch");
  const [open, setOpen] = React.useState(false);
  const [probe, setProbe] = React.useState<{ q: string; n: number } | null>(
    null,
  );

  const room = ROOMS.find((item) => item.id === current);
  const shown = room ? (room.direct ? room.name : `#${room.name}`) : "";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <RoomSwitcher
        label="Jump to a room"
        rooms={ROOMS}
        value={current}
        onValueChange={setCurrent}
        open={open}
        onOpenChange={setOpen}
        onQueryChange={(q, n) => setProbe(q === "" ? null : { q, n })}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        In {shown} ·{" "}
        {probe ? `${probe.n} matched "${probe.q}"` : `${ROOMS.length} rooms`} ·{" "}
        <span className="text-signal">
          {open ? "switcher up" : "press Ctrl K"}
        </span>
      </p>
    </div>
  );
}
