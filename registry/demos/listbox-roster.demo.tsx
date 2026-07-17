"use client";

import * as React from "react";

import { ListboxRoster, type ListOption } from "@/registry/ui/listbox-roster";

const PASSES: ListOption[] = [
  { id: "bore", label: "Bore", hint: "4.6 mm nominal" },
  { id: "face", label: "Face", hint: "flatten to a tenth" },
  { id: "cure", label: "Cure", hint: "20 minute hold" },
  { id: "seal", label: "Seal", hint: "two-stage" },
  { id: "mark", label: "Mark", hint: "serial + date" },
  { id: "ship", label: "Ship", hint: "crate and log" },
];

export function ListboxRosterDemo() {
  const [picks, setPicks] = React.useState<string[]>(["bore", "cure"]);

  return (
    <div className="w-full max-w-sm">
      <ListboxRoster
        label="Passes to run"
        options={PASSES}
        value={picks}
        onValueChange={setPicks}
      />
    </div>
  );
}
