"use client";

import * as React from "react";

import { Copy, Crop, MessageSquare, Share2, Trash2 } from "lucide-react";

import { IrisMenu } from "@/registry/blocks/iris-menu/iris-menu";

export function IrisMenuDemo() {
  const [event, setEvent] = React.useState("READY");

  const items = [
    { id: "crop", icon: <Crop />, label: "Crop", onSelect: () => setEvent("CROP") },
    {
      id: "comment",
      icon: <MessageSquare />,
      label: "Comment",
      onSelect: () => setEvent("COMMENT"),
    },
    {
      id: "duplicate",
      icon: <Copy />,
      label: "Duplicate",
      onSelect: () => setEvent("DUPLICATE"),
    },
    {
      id: "share",
      icon: <Share2 />,
      label: "Share",
      onSelect: () => setEvent("SHARE"),
    },
    {
      id: "delete",
      icon: <Trash2 />,
      label: "Delete",
      onSelect: () => setEvent("DELETE"),
      destructive: true,
    },
  ];

  return (
    <div className="w-full max-w-sm">
      <div className="border-border from-primary/20 via-background to-background relative h-56 overflow-hidden rounded-3 border bg-gradient-to-br">
        <p className="text-muted-foreground absolute top-3 left-3 font-mono text-[10px] tracking-wide uppercase">
          PLATE 22 · f/2.8 · 1/250s
        </p>
        <div className="absolute right-5 bottom-5">
          <IrisMenu items={items} label="Annotate plate" />
        </div>
      </div>
      <p
        role="status"
        className="text-muted-foreground mt-3 text-center font-mono text-xs tracking-wide"
      >
        LAST ACTION · {event}
      </p>
      <p className="text-muted-foreground mt-1 text-center text-xs">
        Arrow keys rotate the ring
      </p>
    </div>
  );
}
