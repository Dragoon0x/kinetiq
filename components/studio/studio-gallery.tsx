"use client";

import { RoomGallery } from "@/components/tactile/gallery";
import type { TactileItem } from "@/components/tactile/tactile-card";

import { STUDIO_ROOM } from "./studio-room";

/** The Studio wall: the shared room gallery with Studio's sets and demos. */
export function StudioGallery({ items }: { items: TactileItem[] }) {
  return <RoomGallery room={STUDIO_ROOM} items={items} />;
}
