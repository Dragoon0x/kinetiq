import type { Room } from "@/components/tactile/room";
import { CANVAS_SETS } from "@/content/canvas";

import { CANVAS_DEMOS } from "./canvas-demos";

export const CANVAS_ROOM: Room = {
  id: "canvas",
  path: "/canvas",
  name: "Canvas",
  param: "set",
  filterLabel: "Filter by set",
  chipsOwnRow: true,
  groups: CANVAS_SETS.map(({ slug, label }) => ({ slug, label })),
  demos: CANVAS_DEMOS,
};
