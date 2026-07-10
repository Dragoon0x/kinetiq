"use client";

import * as React from "react";

import { ComboDials } from "@/registry/ui/combo-dials";
import { cn } from "@/registry/lib/utils";

/** The vault setting, printed right on the tag — a playground, not a puzzle. */
const SECRET = "047";

/** "047" reads as 0-4-7 on the tag and the readout. */
const spaced = (code: string): string => code.split("").join("-");

/**
 * ComboDials dressed as the KQ-157 vault plate: three cylinder dials, the
 * setting printed on a mono tag beside them, and a seal readout that flips to
 * OPEN the moment all three settle on the mark. Turning any dial off the
 * setting shuts the seal again — the bolt only holds while they agree.
 */
export function ComboDialsDemo() {
  // KQ-157 boots at 000; the seal mirrors the settled combination.
  const [code, setCode] = React.useState("000");
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <div className="relative rounded-4 border border-hairline bg-surface-1 p-4">
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
            className={cn("border-hairline-strong absolute size-2.5", corner)}
          />
        ))}

        <div className="mb-4 flex items-center justify-between px-1">
          <span className="text-label text-ink-2">Vault Setting</span>
          <span className="text-label text-ink-3 tabular-nums">KQ-157</span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
          <ComboDials
            length={3}
            defaultValue="000"
            secret={SECRET}
            onUnlock={() => setOpen(true)}
            onValueChange={(next) => {
              setCode(next);
              // Re-lock detection: any settle off the mark shuts the seal.
              if (next !== SECRET) setOpen(false);
            }}
            aria-label="Vault combination"
          />

          {/* The setting tag — set combination, live dials, seal state. */}
          <div className="flex w-32 flex-col gap-2.5 rounded-3 border border-hairline bg-surface-0 p-3">
            <p className="text-label text-ink-3">
              Set &middot;{" "}
              <span className="text-ink tabular-nums">{spaced(SECRET)}</span>
            </p>
            <p className="border-t border-hairline pt-2.5 text-label text-ink-3">
              Now &middot;{" "}
              <span className="text-ink-2 tabular-nums">{spaced(code)}</span>
            </p>
            <p
              role="status"
              className="border-t border-hairline pt-2.5 text-label text-ink-3"
            >
              Seal &middot;{" "}
              <span className={open ? "text-signal" : "text-ink-2"}>
                {open ? "Open" : "Locked"}
              </span>
            </p>
          </div>
        </div>

        <p className="mt-5 border-t border-hairline pt-3 font-mono text-[10px] tracking-[0.15em] text-ink-3 uppercase">
          KQ-157 &middot; Combo Dials &middot; 36&deg; / digit &middot; &zeta;
          0.83
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Spin each dial to its mark - the bolt slides when they agree.
      </p>
    </div>
  );
}
