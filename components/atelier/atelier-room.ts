import type { Room } from "@/components/tactile/room";
import { ATELIER_SETS } from "@/content/atelier";

import { ATELIER_DEMOS } from "./atelier-demos";

export const ATELIER_ROOM: Room = {
  id: "atelier",
  path: "/atelier",
  name: "Atelier",
  param: "set",
  filterLabel: "Filter by set",
  // Ten set names with their glyphs and counts run past a thousand pixels:
  // more than the row has once search, sort and sound sit beside them.
  chipsOwnRow: true,
  groups: ATELIER_SETS.map(({ slug, label }) => ({ slug, label })),
  demos: ATELIER_DEMOS,
};
