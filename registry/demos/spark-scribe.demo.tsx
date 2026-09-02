"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { SparkScribe } from "@/registry/ui/spark-scribe";
import { StatusSeal } from "@/registry/ui/status-seal";

const LOTS = [
  { id: "FW-114", stock: "Vine maple", state: "ready" },
  { id: "FW-129", stock: "Serviceberry", state: "hardening" },
  { id: "FW-142", stock: "Red osier dogwood", state: "sold" },
] as const;

/** A nursery ledger under glass. Drag across the card and a sign-off writes
 * itself in sparks — the lot list underneath never moves. */
export function SparkScribeDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <SparkScribe className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">
              Fernworks · propagation ledger
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Sign off a lot without touching the paper.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Three lots are waiting on a hand to clear them. Drag across the
              card and the sign-off writes itself in sparks, cooling out before
              it ever reaches the list below.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {LOTS.map((lot) => (
              <li
                key={lot.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-mono text-xs text-ink-2">{lot.id}</span>
                <span className="flex-1 font-medium text-ink">{lot.stock}</span>
                <StatusSeal
                  variant={
                    lot.state === "ready"
                      ? "success"
                      : lot.state === "hardening"
                        ? "warn"
                        : "info"
                  }
                >
                  {lot.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Clear lot 114</PressureButton>
            <PressureButton variant="outline">Hold the batch</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              bed 6 · 61°F
            </span>
          </div>
        </div>
      </SparkScribe>
      <p className="font-mono text-[11px] text-ink-3">write in sparks</p>
    </div>
  );
}
