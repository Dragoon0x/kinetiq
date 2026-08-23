"use client";

import { TrustIncidentLog } from "@/registry/blocks/trust-incident-log/trust-incident-log";

/** The section at its own scale — full width, default narrative. */
export function TrustIncidentLogDemo() {
  return (
    <div className="w-full">
      <TrustIncidentLog />
    </div>
  );
}
