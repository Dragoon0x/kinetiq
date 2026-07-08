"use client";

import * as React from "react";

import {
  Archive,
  BellOff,
  Flag,
  Forward,
  Reply,
  Star,
  Trash2,
} from "lucide-react";

import { OverflowRail } from "@/registry/blocks/overflow-rail/overflow-rail";

export function OverflowRailDemo() {
  const [event, setEvent] = React.useState("READY");

  const act = (label: string) => () => setEvent(label.toUpperCase());

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="border-border bg-card flex items-center justify-between gap-3 rounded-3 border p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Mira Voss</p>
          <p className="text-muted-foreground truncate text-xs">
            Damping table looks off in bay 4 — can you re-run the sweep?
          </p>
        </div>
        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
          09:41
        </span>
      </div>

      <div className="flex justify-center">
        <OverflowRail
          label="Message actions"
          primary={[
            { id: "reply", icon: <Reply />, label: "Reply", onSelect: act("Reply") },
            {
              id: "forward",
              icon: <Forward />,
              label: "Forward",
              onSelect: act("Forward"),
            },
            { id: "star", icon: <Star />, label: "Star", onSelect: act("Star") },
          ]}
          secondary={[
            {
              id: "archive",
              icon: <Archive />,
              label: "Archive",
              onSelect: act("Archive"),
            },
            { id: "mute", icon: <BellOff />, label: "Mute", onSelect: act("Mute") },
            { id: "report", icon: <Flag />, label: "Report", onSelect: act("Report") },
            {
              id: "delete",
              icon: <Trash2 />,
              label: "Delete",
              onSelect: act("Delete"),
              destructive: true,
            },
          ]}
        />
      </div>

      <p
        role="status"
        className="text-muted-foreground text-center font-mono text-xs tracking-wide"
      >
        LAST ACTION · {event}
      </p>
      <p className="text-muted-foreground text-center text-xs">
        Escape collapses
      </p>
    </div>
  );
}
