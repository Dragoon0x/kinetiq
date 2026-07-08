"use client";

import * as React from "react";

import { ToastProvider, useToast } from "@/registry/ui/telemetry-toast";

export function TelemetryToastDemo() {
  return (
    <div className="border-border bg-background relative h-[340px] w-full max-w-xl overflow-hidden rounded-3 border">
      <ToastProvider portal={false} position="bottom-right">
        <PipelineMonitor />
      </ToastProvider>
    </div>
  );
}

const BUTTON_CLASSES =
  "border-input hover:bg-accent h-8 rounded-2 border bg-transparent px-3 text-xs font-medium";

function PipelineMonitor() {
  const { toast } = useToast();

  return (
    <div className="flex flex-col gap-3 p-5">
      <div>
        <h3 className="text-sm font-semibold">Pipeline monitor</h3>
        <p className="text-muted-foreground font-mono text-xs">
          ci · kinetiq/registry · main
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON_CLASSES}
          onClick={() =>
            toast({
              variant: "success",
              title: "RUN #224 · PASSED",
              description: "142 assertions in 3.1s",
            })
          }
        >
          Run passed
        </button>
        <button
          type="button"
          className={BUTTON_CLASSES}
          onClick={() =>
            toast({
              variant: "warn",
              title: "RUN #225 · FLAKY",
              description: "caliper-slider spec retried 2×",
              action: { label: "Quarantine", onClick: () => {} },
            })
          }
        >
          Flaky test
        </button>
        <button
          type="button"
          className={BUTTON_CLASSES}
          onClick={() =>
            toast({
              variant: "danger",
              title: "RUN #226 · FAILED",
              description: "Type error in caliper-slider.tsx:88",
            })
          }
        >
          Build failed
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        Fire a few in a row — the stack recedes, hover pauses the timers.
      </p>
    </div>
  );
}
