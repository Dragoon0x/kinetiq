"use client";

import * as React from "react";

import { PressureButton } from "@/registry/ui/pressure-button";

export function PressureButtonDemo() {
  const [status, setStatus] = React.useState("Environment: staging-04 · idle");

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <PressureButton onClick={() => setStatus("Promoted to production.")}>
          Promote to production
        </PressureButton>
        <PressureButton
          variant="danger"
          holdToConfirm={1200}
          onConfirm={() => setStatus("Environment destroyed.")}
        >
          Destroy environment
        </PressureButton>
      </div>
      <p
        role="status"
        className="text-muted-foreground font-mono text-xs tabular-nums"
      >
        {status}
      </p>
    </div>
  );
}
