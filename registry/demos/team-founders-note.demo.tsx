"use client";

import { TeamFoundersNote } from "@/registry/blocks/team-founders-note/team-founders-note";

/** The section at its own scale — full width, default narrative. */
export function TeamFoundersNoteDemo() {
  return (
    <div className="w-full">
      <TeamFoundersNote />
    </div>
  );
}
