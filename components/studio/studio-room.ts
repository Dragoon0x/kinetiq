import type { Room } from "@/components/tactile/room";
import { STUDIO_SETS } from "@/content/studio";

import { STUDIO_DEMOS } from "./studio-demos";

export const STUDIO_ROOM: Room = {
  id: "studio",
  path: "/studio",
  name: "Studio",
  param: "set",
  filterLabel: "Filter by set",
  chipsOwnRow: true,
  groups: STUDIO_SETS.map(({ slug, label }) => ({ slug, label })),
  demos: STUDIO_DEMOS,
};
