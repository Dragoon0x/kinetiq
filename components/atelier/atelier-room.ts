import type { Room } from "@/components/tactile/room";
import { ATELIER_SETS } from "@/content/atelier";

import { ATELIER_DEMOS } from "./atelier-demos";

export const ATELIER_ROOM: Room = {
  id: "atelier",
  path: "/atelier",
  name: "Atelier",
  param: "set",
  filterLabel: "Filter by set",
  groups: ATELIER_SETS.map(({ slug, label }) => ({ slug, label })),
  demos: ATELIER_DEMOS,
};
