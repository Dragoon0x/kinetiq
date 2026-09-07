"use client";

import * as React from "react";

import { AvatarPick } from "@/registry/ui/avatar-pick";

const AVATARS = [
  { id: "kestrel", initials: "KE", label: "Kestrel", tint: "var(--accent)" },
  { id: "fern", initials: "FE", label: "Fern", tint: "var(--success)" },
  { id: "ember", initials: "EM", label: "Ember", tint: "var(--warn)" },
  { id: "basalt", initials: "BA", label: "Basalt", tint: "var(--danger)" },
  {
    id: "marsh",
    initials: "MA",
    label: "Marsh",
    tint: "color-mix(in oklab, var(--accent), var(--success))",
  },
  {
    id: "quarry",
    initials: "QU",
    label: "Quarry",
    tint: "color-mix(in oklab, var(--warn), var(--danger))",
  },
  {
    id: "beacon",
    initials: "BE",
    label: "Beacon",
    tint: "color-mix(in oklab, var(--accent), var(--danger))",
  },
  {
    id: "thistle",
    initials: "TH",
    label: "Thistle",
    tint: "color-mix(in oklab, var(--success), var(--warn))",
  },
];

export function AvatarPickDemo() {
  const [face, setFace] = React.useState("kestrel");
  const chosen = AVATARS.find((avatar) => avatar.id === face);

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <AvatarPick
        label="Choose a face"
        options={AVATARS}
        value={face}
        onValueChange={setFace}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Waylight profile ·{" "}
        <span className="text-signal">
          {chosen ? chosen.label : "Your photo"}
        </span>
      </p>
    </div>
  );
}
