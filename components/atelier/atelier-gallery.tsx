"use client";

import { RoomGallery } from "@/components/tactile/gallery";
import type { TactileItem } from "@/components/tactile/tactile-card";

import { ATELIER_ROOM } from "./atelier-room";

/** The Atelier wall: the shared room gallery with Atelier's sets and demos. */
export function AtelierGallery({ items }: { items: TactileItem[] }) {
  return <RoomGallery room={ATELIER_ROOM} items={items} />;
}
