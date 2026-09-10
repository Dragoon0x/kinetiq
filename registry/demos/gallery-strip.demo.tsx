"use client";

import * as React from "react";

import { GalleryStrip, type GalleryPhoto } from "@/registry/ui/gallery-strip";

/** Rui's survey run along the quay; the seeds draw the pictures. */
const SURVEY: GalleryPhoto[] = [
  { id: "g1", seed: 12, caption: "Crane bay" },
  { id: "g2", seed: 27, caption: "Pallet run" },
  { id: "g3", seed: 41, caption: "Dock four" },
  { id: "g4", seed: 58, caption: "Rail spur" },
  { id: "g5", seed: 73, caption: "Cold store" },
  { id: "g6", seed: 96, caption: "Gate house" },
];

export function GalleryStripDemo() {
  const [open, setOpen] = React.useState<string | null>(null);
  const [active, setActive] = React.useState("g1");

  const index = SURVEY.findIndex((photo) => photo.id === (open ?? active));
  const shown = SURVEY[index === -1 ? 0 : index];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GalleryStrip
        label="Quay thread with Rui"
        peerName="Rui"
        text="Survey run, quay four."
        time="8:15"
        photos={SURVEY}
        openId={open}
        onOpenChange={setOpen}
        onActiveChange={setActive}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open === null
          ? `${SURVEY.length} pictures`
          : `viewer ${index + 1} of ${SURVEY.length}`}{" "}
        · <span className="text-signal">{shown?.caption ?? "none"}</span>
      </p>
    </div>
  );
}
