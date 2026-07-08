"use client";

import { CheckboxGroup } from "@/registry/ui/checkbox";

export function CheckboxDemo() {
  return (
    <div className="w-full max-w-80">
      <CheckboxGroup
        legend="Sample prep"
        selectAll
        selectAllLabel="All prep stages"
        defaultValue={["load-specimen"]}
        items={[
          {
            id: "degauss",
            label: "Degauss chamber",
            description: "Coil sweep, 40 Hz for 30 s.",
          },
          { id: "zero-caliper", label: "Zero the caliper" },
          {
            id: "load-specimen",
            label: "Load specimen",
            description: "Stage B, notch facing out.",
          },
          { id: "seal-housing", label: "Seal housing" },
        ]}
      />
    </div>
  );
}
