"use client";

import * as React from "react";

import { AccessPanel } from "@/registry/blocks/access-panel/access-panel";

export function AccessPanelDemo() {
  const [status, setStatus] = React.useState<string | null>(null);

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <AccessPanel
        expectedCode="246810"
        onComplete={() => setStatus("Session open · Operator")}
      />
      <p className="font-mono text-[10px] tracking-[0.08em] uppercase">
        {status ? (
          <span className="text-[var(--signal,var(--primary))]">{status}</span>
        ) : (
          <span className="text-muted-foreground">Demo code · 246810</span>
        )}
      </p>
    </div>
  );
}
