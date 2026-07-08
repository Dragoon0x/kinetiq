"use client";

import * as React from "react";

import {
  SignalCenter,
  type Signal,
} from "@/registry/blocks/signal-center/signal-center";
import { PressureButton } from "@/registry/ui/pressure-button";

const SEED: Signal[] = [
  { id: "ci-224", source: "CI", title: "Run #224 passed", time: "2m" },
  {
    id: "ci-223",
    source: "CI",
    title: "Run #223 flaky, retried",
    time: "18m",
    read: true,
  },
  {
    id: "billing-1042",
    source: "Billing",
    title: "Invoice #1042 settled",
    time: "1h",
  },
  {
    id: "mention-bench",
    source: "Mentions",
    title: "@you in bench-notes",
    detail: "“check the damping table”",
    time: "3h",
  },
  {
    id: "system-nightly",
    source: "System",
    title: "Nightly calibration complete",
    time: "6h",
    read: true,
  },
];

const INCOMING_POOL: Omit<Signal, "id" | "time">[] = [
  { source: "CI", title: "Run #225 queued" },
  { source: "System", title: "Sensor drift within tolerance" },
  { source: "Billing", title: "Card on file expires soon" },
  {
    source: "Mentions",
    title: "@you in release-notes",
    detail: "“tag the beta build”",
  },
];

export function SignalCenterDemo() {
  const [signals, setSignals] = React.useState<Signal[]>(SEED);
  // An incrementing counter keeps injection deterministic across renders.
  const counterRef = React.useRef(0);

  const inject = () => {
    const template = INCOMING_POOL[counterRef.current % INCOMING_POOL.length];
    if (!template) return;
    const id = `incoming-${counterRef.current}`;
    counterRef.current += 1;
    setSignals((prev) => [{ ...template, id, time: "now" }, ...prev]);
  };

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <SignalCenter signals={signals} onSignalsChange={setSignals} />
      <PressureButton variant="outline" size="sm" onClick={inject}>
        Simulate incoming
      </PressureButton>
      <p className="text-muted-foreground font-mono text-[10px] font-medium tracking-[0.08em] uppercase">
        Swipe a row to archive
      </p>
    </div>
  );
}
