"use client";

import { RoomGallery } from "./gallery";
import type { TactileItem } from "./tactile-card";
import { TACTILE_ROOM } from "./tactile-room";

/** The Tactile wall: the shared room gallery with Tactile's verbs and demos. */
export function TactileGallery({ items }: { items: TactileItem[] }) {
  return <RoomGallery room={TACTILE_ROOM} items={items} />;
}
