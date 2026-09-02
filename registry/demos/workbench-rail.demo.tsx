"use client";

import {
  type RailWorkspace,
  WorkbenchRail,
} from "@/registry/ui/workbench-rail";

const WORKSPACES: RailWorkspace[] = [
  { id: "north", label: "North Basin Ops", hint: "12 live" },
  { id: "kettle", label: "Kettle Point", hint: "4 live" },
  { id: "relay", label: "Relay Floor", hint: "9 live" },
];

export function WorkbenchRailDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-10">
      <div className="flex w-full justify-center">
        <WorkbenchRail className="h-96" />
      </div>

      <div className="flex w-full flex-col items-center gap-3">
        <p className="text-label text-ink-3">
          Searchable, with a workspace switcher
        </p>
        <WorkbenchRail className="h-96" searchable workspaces={WORKSPACES} />
      </div>
    </div>
  );
}
