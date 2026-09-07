"use client";

import * as React from "react";

import { SelectBar, type SelectAction } from "@/registry/ui/select-bar";

const NAMES: Record<SelectAction, string> = {
  bold: "bold",
  italic: "italic",
  link: "link",
  code: "code",
};

export function SelectBarDemo() {
  const [last, setLast] = React.useState<SelectAction | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <SelectBar
        label="Gaugeworks release note"
        actions={["bold", "italic", "link"]}
        onAction={setLast}
      >
        <p>
          Gaugeworks 3.1 moves calibration off the handset and onto the rig, so
          a technician can sign a sensor off without waiting for the bench.
          Select any words in this paragraph to raise the format bar.
        </p>
      </SelectBar>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            Applied <span className="text-signal">{NAMES[last]}</span>
          </>
        ) : (
          "Select words to raise the bar"
        )}
      </p>
    </div>
  );
}
