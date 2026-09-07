"use client";

import * as React from "react";

import { TypeaheadField } from "@/registry/ui/typeahead-field";

const DESTINATIONS = [
  "Ashcombe",
  "Barrowfield",
  "Bellhaven",
  "Brightwater",
  "Calder Mills",
  "Cinderport",
  "Clearwater Bend",
  "Draymoor",
  "Elmsgate",
  "Fallowmere",
  "Foxglade",
  "Granholm",
  "Harrowdean",
  "Havenlock",
  "Ironbay",
  "Kettleridge",
  "Larkspur",
  "Marrowdale",
  "Millvane",
  "Northreach",
  "Oakhollow",
  "Pinewick",
  "Quarrytown",
  "Redferry",
  "Saltmarch",
  "Seatide",
  "Stonewell",
  "Thornbury",
  "Weatherby",
  "Westmarrow",
  "Willowford",
];

export function TypeaheadFieldDemo() {
  const [destination, setDestination] = React.useState("");
  const [accepted, setAccepted] = React.useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Fieldline dispatch — type a letter or two, then Tab to take the
        completion.
      </p>

      <TypeaheadField
        label="Destination"
        suggestions={DESTINATIONS}
        value={destination}
        onValueChange={(next) => {
          setDestination(next);
          if (next !== accepted) setAccepted("");
        }}
        onAccept={setAccepted}
        placeholder="Where to"
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Routing to{" "}
        <span className="text-signal">{accepted || "no destination yet"}</span>
      </p>
    </div>
  );
}
