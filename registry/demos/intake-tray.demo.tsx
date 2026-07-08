"use client";

import * as React from "react";

import {
  IntakeTray,
  type IntakeTrayHandle,
} from "@/registry/blocks/intake-tray/intake-tray";
import { PressureButton } from "@/registry/ui/pressure-button";

/** "spectra_late.parquet" hashes to a rejection; the other two pass. */
const SAMPLE_NAMES = ["assay_007.csv", "spectra_late.parquet", "notes.txt"];

export function IntakeTrayDemo() {
  const trayRef = React.useRef<IntakeTrayHandle>(null);

  const dropSamples = () => {
    trayRef.current?.addFiles(
      SAMPLE_NAMES.map(
        (name) => new File(["sample"], name, { type: "text/plain" }),
      ),
    );
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <IntakeTray ref={trayRef} accept=".csv,.parquet,.txt" />
      <PressureButton variant="outline" size="sm" onClick={dropSamples}>
        Drop sample set
      </PressureButton>
      <p className="text-muted-foreground text-center font-mono text-[10px] tracking-[0.14em] uppercase">
        Drag files anywhere onto the plate
      </p>
    </div>
  );
}
