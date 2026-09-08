"use client";

import * as React from "react";

import { AddressChip } from "@/registry/ui/address-chip";

const ADDRESS = "bsn1q9f4k2mx7v3ptl8ha6ze0rj5cwyd";

export function AddressChipDemo() {
  const [open, setOpen] = React.useState(false);
  const [copy, setCopy] = React.useState<"none" | "copied" | "blocked">("none");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">Deposit BSN</span>
          <span className="flex h-6 shrink-0 items-center rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
            Basin network
          </span>
        </div>

        <AddressChip
          address={ADDRESS}
          label="Basin deposit address"
          onExpandedChange={setOpen}
          onCopy={(_, ok) => setCopy(ok ? "copied" : "blocked")}
        />

        <p className="text-[11px] text-ink-3">
          Only send BSN on the Basin network. Anything else arrives nowhere.
        </p>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Address{" "}
        <span className="text-signal">{open ? "expanded" : "collapsed"}</span> ·{" "}
        <span className="text-signal">
          {copy === "none" ? "not copied" : copy}
        </span>
      </p>
    </div>
  );
}
