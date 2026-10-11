"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CorePlane } from "@/registry/ui/core-plane";

export const tweaks = defineTweaks({
  cores: {
    kind: "range",
    label: "Cores",
    default: 10,
    min: 6,
    max: 16,
    step: 1,
    unit: "px",
  },
  flicker: {
    kind: "range",
    label: "Flicker",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  wire: {
    kind: "choice",
    label: "Wire",
    default: "copper",
    options: ["copper", "brass", "silver"],
    names: { copper: "Copper", brass: "Brass", silver: "Silver" },
  },
});

/**
 * The Gaugeworks Core Store: a museum bench where a plane of ferrite cores
 * takes whatever you type, a byte to a row.
 */
export function CorePlaneDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [text, setText] = React.useState("Gauge");
  const last = Array.from(text).pop();
  const bytes = last ? Array.from(new TextEncoder().encode(last)) : [];
  const lead = bytes[0] ?? 0;
  const set = bytes.reduce(
    (n, b) => n + b.toString(2).split("1").length - 1,
    0,
  );

  const plane = (
    <CorePlane
      label="Write to the core store"
      value={text}
      onValueChange={setText}
      height={chrome ? 200 : 176}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="flex w-full max-w-sm">{plane}</div>;

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Gaugeworks Core Store
        </p>
        <p className="text-base font-medium text-foreground">
          Type to write, a byte to a row
        </p>
      </div>
      {plane}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            <span className="text-signal normal-case">
              {last === " " ? "space" : last}
            </span>{" "}
            · 0x{lead.toString(16).padStart(2, "0")} ·{" "}
            {lead.toString(2).padStart(8, "0")} · {set}{" "}
            {set === 1 ? "bit" : "bits"} set
          </>
        ) : (
          <>
            <span className="text-signal">empty</span> · every core reads 0
          </>
        )}
      </p>
    </div>
  );
}
