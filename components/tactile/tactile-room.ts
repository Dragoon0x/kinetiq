import { TACTILE_VERBS } from "@/content/tactile";

import type { Room } from "./room";
import { TACTILE_DEMOS } from "./tactile-demos";

export const TACTILE_ROOM: Room = {
  id: "tactile",
  path: "/tactile",
  name: "Tactile",
  param: "verb",
  filterLabel: "Filter by what you do",
  groups: TACTILE_VERBS.map(({ slug, label }) => ({ slug, label })),
  demos: TACTILE_DEMOS,
};
