"use client";

import * as React from "react";

import {
  MorphDialog,
  MorphDialogContent,
  MorphDialogTrigger,
} from "@/registry/ui/morph-dialog";

const SPECS = [
  { label: "Mass", value: "412 g" },
  { label: "Ingress", value: "IP67 sealed" },
  { label: "Calibrated", value: "2026-05-30 · bench 4" },
] as const;

export function MorphDialogDemo() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border-border bg-background relative h-[340px] w-full max-w-md overflow-hidden rounded-3 border">
      <div className="flex h-full items-center justify-center p-6">
        <MorphDialog open={open} onOpenChange={setOpen} size="sm" portal={false}>
          <MorphDialogTrigger className="w-60">
            <span className="text-muted-foreground font-mono text-[11px] tracking-[0.08em] uppercase">
              KQ-017 · Specimen
            </span>
            <span className="text-sm font-semibold">Field Kit MK-II</span>
            <span className="text-muted-foreground font-mono text-xs">
              MASS 412 g · IP67
            </span>
            <span className="text-muted-foreground font-mono text-xs">
              CAL 2026-05-30
            </span>
            <span className="text-primary mt-1 text-xs font-medium">
              Open dossier →
            </span>
          </MorphDialogTrigger>

          <MorphDialogContent
            title="Field Kit MK-II"
            description="Portable calibration rig, bench-verified for field telemetry work."
          >
            <dl className="mt-4 flex flex-col">
              {SPECS.map((spec) => (
                <div
                  key={spec.label}
                  className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0"
                >
                  <dt className="text-muted-foreground text-xs font-medium">
                    {spec.label}
                  </dt>
                  <dd className="font-mono text-xs">{spec.value}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 mt-4 h-8 self-end rounded-2 px-3 text-xs font-medium"
            >
              Close dossier
            </button>
          </MorphDialogContent>
        </MorphDialog>
      </div>
    </div>
  );
}
