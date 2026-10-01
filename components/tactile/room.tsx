"use client";

import * as React from "react";

import type { TactileModule } from "./demo-module";

/** One filter group on a room's wall: a verb on Tactile, a set on Atelier. */
export type RoomGroup = { slug: string; label: string };

/**
 * A gallery room: the page it lives on, how its wall is filtered, and the
 * code-split demo for every piece in it. Tactile and Atelier are both rooms;
 * the gallery, its cards, the stage and the docs preview read the room they
 * are in from context, so neither room ships the other's demos.
 */
export type Room = {
  id: "tactile" | "atelier";
  /** The room's page, e.g. "/tactile". */
  path: string;
  name: string;
  /** The URL key that carries the group filter, e.g. "verb". */
  param: string;
  /** The accessible name of the filter chips. */
  filterLabel: string;
  /**
   * The group chips always take a row of their own, above search and sort.
   * For a room whose group names are too long to share one row with them.
   */
  chipsOwnRow?: boolean;
  groups: RoomGroup[];
  demos: Record<string, () => Promise<TactileModule>>;
};

const RoomContext = React.createContext<Room | null>(null);

export function RoomProvider({
  room,
  children,
}: {
  room: Room;
  children: React.ReactNode;
}) {
  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}

export function useRoom(): Room {
  const room = React.useContext(RoomContext);
  if (!room) throw new Error("useRoom must be used inside a RoomProvider.");
  return room;
}
