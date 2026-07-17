"use client";

import * as React from "react";

import { Copy, Download, Pin, Share2, Star, Trash2 } from "lucide-react";

import { ContextMenu, type ContextMenuItem } from "@/registry/ui/context-menu";

export function ContextMenuDemo() {
  const [last, setLast] = React.useState("—");

  const items: ContextMenuItem[] = [
    {
      id: "copy",
      label: "Copy",
      icon: <Copy />,
      shortcut: "⌘C",
      onSelect: () => setLast("Copy"),
    },
    { id: "pin", label: "Pin", icon: <Pin />, onSelect: () => setLast("Pin") },
    {
      id: "share",
      label: "Share",
      icon: <Share2 />,
      items: [
        {
          id: "share-link",
          label: "Copy link",
          onSelect: () => setLast("Share · Copy link"),
        },
        {
          id: "share-mail",
          label: "Email",
          onSelect: () => setLast("Share · Email"),
        },
        {
          id: "share-more",
          label: "More apps",
          items: [
            {
              id: "share-elsewhere",
              label: "Elsewhere",
              onSelect: () => setLast("Share · Elsewhere"),
            },
          ],
        },
      ],
    },
    { id: "sep-1", separator: true },
    {
      id: "star",
      label: "Add to favourites",
      icon: <Star />,
      onSelect: () => setLast("Favourite"),
    },
    {
      id: "download",
      label: "Download",
      icon: <Download />,
      shortcut: "⌘S",
      onSelect: () => setLast("Download"),
    },
    { id: "sep-2", separator: true },
    { id: "delete", label: "Delete", icon: <Trash2 />, disabled: true },
  ];

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <ContextMenu items={items} label="Card actions">
        <div className="border-hairline-strong bg-surface-1 text-ink-3 grid h-28 place-items-center rounded-3 border border-dashed text-sm">
          Right-click, or press the menu key
        </div>
      </ContextMenu>

      <p
        role="status"
        className="text-muted-foreground border-border border-t pt-3 font-mono text-[10px] tracking-[0.08em] uppercase"
      >
        Action{" "}
        <span className="text-[var(--signal,var(--primary))]">{last}</span>
      </p>
    </div>
  );
}
