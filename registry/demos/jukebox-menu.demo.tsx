"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  JukeboxMenu,
  jukeboxCodes,
  type JukeboxRecord,
} from "@/registry/ui/jukebox-menu";

export const tweaks = defineTweaks({
  pages: {
    kind: "range",
    label: "Pages",
    default: 2,
    min: 2,
    max: 4,
    step: 1,
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "gold",
    options: ["gold", "silver", "candy"],
    names: { gold: "Gold", silver: "Silver", candy: "Candy" },
  },
  arm: { kind: "toggle", label: "Arm", default: true },
});

const RECORDS: JukeboxRecord[] = [
  { id: "harbourlight", title: "Harbourlight Shuffle", artist: "Mara Kell" },
  {
    id: "lanterns",
    title: "Lanterns on the Weir",
    artist: "The Coldbrook Five",
  },
  { id: "kettle", title: "Copper Kettle Blues", artist: "Jonah Reyes Trio" },
  { id: "salt", title: "Salt and Static", artist: "Wren Adair" },
  { id: "rooms", title: "Two Rooms Over", artist: "The Fieldline Sisters" },
  { id: "tin-roof", title: "Tin Roof Waltz", artist: "Dex Ormond" },
  { id: "tram", title: "Last Tram to Fernhill", artist: "Ines Varga" },
  { id: "orchard", title: "Orchard Radio", artist: "Tallow & Pine" },
  { id: "signal-lamp", title: "Signal Lamp Serenade", artist: "Cato Moss" },
  { id: "enamel", title: "Blue Enamel", artist: "The Gaugeworks Quartet" },
  { id: "needle", title: "Dust on the Needle", artist: "Rosa Linden" },
  { id: "late-shift", title: "Late Shift Cha-Cha", artist: "Mara Kell" },
  {
    id: "streetlight",
    title: "Streetlight Sway",
    artist: "The Coldbrook Five",
  },
  { id: "awning", title: "Rain on the Awning", artist: "Odile Brand" },
  { id: "pier", title: "Pier Lights at Four", artist: "Jonah Reyes Trio" },
  { id: "goodnight", title: "Goodnight, Waylight", artist: "The House Band" },
];

/**
 * The jukebox in the corner of the Waylight Lounge: sixteen records, and
 * whatever is on the platter is what the room hears.
 */
export function JukeboxMenuDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const showChrome = chrome;
  const [playing, setPlaying] = React.useState<string | null>("lanterns");
  const codes = jukeboxCodes(RECORDS, values.pages ?? 2);
  const record = RECORDS.find((r) => r.id === playing);

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <JukeboxMenu
        label="Waylight Lounge records"
        records={RECORDS}
        value={playing}
        onValueChange={setPlaying}
        sound={sound}
        className="self-center"
        {...values}
      />
      {showChrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {record ? (
            <>
              <span className="text-signal">
                now playing {codes[record.id]}
              </span>{" "}
              · {record.title} · {record.artist}
            </>
          ) : (
            <span className="text-signal">pick a record</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
