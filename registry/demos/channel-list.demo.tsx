"use client";

import * as React from "react";

import { ChannelList, type Channel } from "@/registry/ui/channel-list";

const room = (
  id: string,
  name: string,
  preview: string,
  unread: number,
  activity: number,
  muted = false,
): Channel => ({ id, name, preview, unread, activity, muted });

const ROOMS: Channel[] = [
  room("yard", "Coldbrook yard", "Dock three is free from nine.", 2, 60),
  room("dock", "Basinworks dock", "Two pallets, both labelled.", 0, 58),
  room("pay", "Waylight Pay ops", "Yard fee is 4471-CB.", 5, 55, true),
  room("returns", "Fernworks returns", "Three crates back Friday.", 0, 52),
  room("night", "Night shift", "Loader booked until half past.", 1, 48, true),
  room("notices", "Announcements", "Depot closes Thursday at noon.", 0, 40),
];

/** A seeded script, walked by index — no clock, no randomness. */
const SCRIPT = [
  { id: "returns", preview: "Marta: two crates are short a label." },
  { id: "notices", preview: "Ines: yard gate stays shut until eleven." },
  { id: "dock", preview: "Rui: loader is free after the morning run." },
  { id: "night", preview: "Marta: handover sheet is on the desk." },
  { id: "yard", preview: "Rui: pallet 4471 is still held at the gate." },
  { id: "pay", preview: "Ines: the yard fee cleared this morning." },
];

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ChannelListDemo() {
  const [rooms, setRooms] = React.useState<Channel[]>(ROOMS);
  const [open, setOpen] = React.useState("yard");
  const [step, setStep] = React.useState(0);

  const deliver = () => {
    const line = SCRIPT[step % SCRIPT.length];
    if (!line) return;
    setStep(step + 1);
    setRooms((prev) => {
      const top = prev.reduce((max, room) => Math.max(max, room.activity), 0);
      return prev.map((room) =>
        room.id === line.id
          ? {
              ...room,
              preview: line.preview,
              unread: room.unread + 1,
              activity: top + 1,
            }
          : room,
      );
    });
  };

  const markRead = () =>
    setRooms((prev) =>
      prev.map((room) => (room.id === open ? { ...room, unread: 0 } : room)),
    );

  const current = rooms.find((room) => room.id === open);
  const unread = rooms.reduce((sum, room) => sum + room.unread, 0);
  const muted = rooms.filter((room) => room.muted).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ChannelList
        label="Coldbrook Logistics rooms"
        channels={rooms}
        maxHeight={320}
        value={open}
        onValueChange={setOpen}
        onMuteToggle={(id, next) =>
          setRooms((prev) =>
            prev.map((room) =>
              room.id === id ? { ...room, muted: next } : room,
            ),
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={deliver} className={chip}>
          Deliver a message
        </button>
        <button
          type="button"
          onClick={markRead}
          disabled={(current?.unread ?? 0) === 0}
          className={chip}
        >
          Mark this room read
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{current?.name ?? "no room"}</span>
        {` · ${unread} unread · ${muted} muted`}
      </p>
    </div>
  );
}
