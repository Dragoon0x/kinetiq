"use client";

import * as React from "react";

import { RoomGallery } from "@/components/tactile/gallery";
import type { TactileItem } from "@/components/tactile/tactile-card";

import { CANVAS_ROOM } from "./canvas-room";

/**
 * The Canvas wall: the shared room gallery with Canvas's demos. Canvas grows
 * set by set, so its filter chips list only the sets that hold a piece.
 */
export function CanvasGallery({ items }: { items: TactileItem[] }) {
  const room = React.useMemo(() => {
    const present = new Set(items.map((item) => item.group));
    return {
      ...CANVAS_ROOM,
      groups: CANVAS_ROOM.groups.filter((group) => present.has(group.slug)),
    };
  }, [items]);
  return <RoomGallery room={room} items={items} />;
}
