"use client";

import { TeamBenchRoster } from "@/registry/blocks/team-bench-roster/team-bench-roster";

/** The section at its own scale — full width, default narrative. */
export function TeamBenchRosterDemo() {
  return (
    <div className="w-full">
      <TeamBenchRoster />
    </div>
  );
}
