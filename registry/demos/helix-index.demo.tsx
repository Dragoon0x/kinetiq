"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { HelixIndex, type HelixItem } from "@/registry/ui/helix-index";

/** Fixed ledger roster — eight records wound on the spiral, never shuffled. */
const RECORDS: HelixItem[] = [
  { id: "coil-drawings", label: "COIL DRAWINGS", hint: "Flat file, bay 2" },
  { id: "spring-charts", label: "SPRING CHARTS" },
  { id: "damper-logs", label: "DAMPER LOGS", hint: "Ledger 1962-71" },
  { id: "rail-surveys", label: "RAIL SURVEYS" },
  { id: "lens-files", label: "LENS FILES" },
  { id: "seal-records", label: "SEAL RECORDS" },
  { id: "mast-notes", label: "MAST NOTES" },
  { id: "vault-keys", label: "VAULT KEYS", hint: "Keeper sign-out" },
];

/**
 * HelixIndex as a bench instrument: the spiral ledger on a bezel plate with
 * corner registration ticks and the KQ-110 spec header. Wind the coil by
 * drag, wheel, or arrows — the status line mirrors whichever record Enter
 * (or a click on the front chip) pulls, and clears when it is pulled again.
 */
export function HelixIndexDemo() {
  const [pulled, setPulled] = React.useState<string | null>(null);

  // onSelect fires on every front activation; the mirror toggles like the coil.
  const handleSelect = (id: string) => {
    setPulled((prev) => (prev === id ? null : id));
  };

  const current = RECORDS.find((record) => record.id === pulled) ?? null;

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-0 p-4">
        {/* Corner registration ticks — the lab-instrument frame. */}
        {(
          [
            "left-2 top-2 border-l border-t",
            "right-2 top-2 border-r border-t",
            "bottom-2 left-2 border-b border-l",
            "bottom-2 right-2 border-b border-r",
          ] as const
        ).map((corner) => (
          <span
            key={corner}
            aria-hidden
            className={cn("absolute size-2.5 border-hairline-strong", corner)}
          />
        ))}

        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">
            Spiral Ledger &middot; 08 Records
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-110</span>
        </div>

        <HelixIndex
          items={RECORDS}
          onSelect={handleSelect}
          aria-label="Spiral ledger"
        />

        <p
          role="status"
          className="mt-3 border-t border-border pt-3 text-center text-label text-ink-3"
        >
          PULLED &middot;{" "}
          <span
            className={current ? "text-[var(--accent-bright)]" : "text-ink-2"}
          >
            {current ? current.label : "NONE"}
          </span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Wind the spiral - Enter pulls the front record.
      </p>
    </div>
  );
}
