"use client";

import * as React from "react";

import { ArrowUpRight, Copy, Pin, Share2, Trash2 } from "lucide-react";

import { PopoverMenu, type PopoverMenuItem } from "@/registry/ui/popover-menu";

export function PopoverMenuDemo() {
  const [last, setLast] = React.useState("—");

  const items: PopoverMenuItem[] = [
    {
      id: "open",
      label: "Open in new tab",
      icon: <ArrowUpRight />,
      onSelect: () => setLast("Open in new tab"),
    },
    {
      id: "copy",
      label: "Copy link",
      icon: <Copy />,
      onSelect: () => setLast("Copy link"),
    },
    {
      id: "pin",
      label: "Pin to top",
      icon: <Pin />,
      onSelect: () => setLast("Pin to top"),
    },
    {
      id: "share",
      label: "Share",
      icon: <Share2 />,
      children: [
        {
          id: "share-link",
          label: "Copy share link",
          onSelect: () => setLast("Copy share link"),
        },
        {
          id: "share-crew",
          label: "Send to the crew",
          onSelect: () => setLast("Send to the crew"),
        },
        {
          id: "share-export",
          label: "Attach to an export",
          onSelect: () => setLast("Attach to an export"),
        },
      ],
    },
    {
      id: "remove",
      label: "Remove",
      icon: <Trash2 />,
      disabled: true,
      onSelect: () => setLast("Remove"),
    },
  ];

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <PopoverMenu items={items} label="Row actions">
        Actions
      </PopoverMenu>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Chose{" "}
        <span className="text-[var(--signal,var(--primary))]">{last}</span>
      </p>
    </div>
  );
}
