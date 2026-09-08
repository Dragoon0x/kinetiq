"use client";

import * as React from "react";

import { HardwareNudge, type NudgeStatus } from "@/registry/ui/hardware-nudge";

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

const WORDS: Record<NudgeStatus, string> = {
  idle: "idle",
  waiting: "waiting",
  confirmed: "confirmed",
  expired: "timed out",
};

export function HardwareNudgeDemo() {
  const [status, setStatus] = React.useState<NudgeStatus>("idle");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <HardwareNudge
        status={status}
        onStatusChange={setStatus}
        deviceName="Fieldline Signer"
        units={240}
        symbol="BSN"
        amount={1842.6}
        to="bsn1q7f4c2m8xk3vd9puew5t0lrn6ha2js4c"
        timeoutMs={9000}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={status === "waiting"}
          onClick={() => setStatus("waiting")}
        >
          Send request
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={status !== "waiting"}
          onClick={() => setStatus("confirmed")}
        >
          Confirm on device
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={status === "idle"}
          onClick={() => setStatus("idle")}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Device <span className="text-signal">Fieldline Signer</span> · State{" "}
        <span className="text-signal">{WORDS[status]}</span>
      </p>
    </div>
  );
}
