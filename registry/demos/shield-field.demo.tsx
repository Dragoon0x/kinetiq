"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { ShieldField } from "@/registry/ui/shield-field";
import { StatusSeal } from "@/registry/ui/status-seal";

const GATES = [
  {
    name: "North gate",
    detail: "Perimeter camera 4, motion armed",
    state: "sealed",
  },
  {
    name: "Loading dock",
    detail: "Badge readers online",
    state: "sealed",
  },
  {
    name: "East stairwell",
    detail: "Door sensor drifting, re-poll queued",
    state: "watch",
  },
  {
    name: "Server room",
    detail: "Two-factor lock, no exceptions",
    state: "sealed",
  },
] as const;

/** A perimeter status card behind Waylight's field. Click anywhere on the card and a ring goes out from the impact point, lighting the hex lattice as it crosses and bending the card a touch under the front. */
export function ShieldFieldDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <ShieldField className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Waylight · perimeter status</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Four gates, one quiet watch.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The field over this card is a resting lattice, thin enough to
              ignore. Tap it and a ring goes out to prove every gate below is
              still listening.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {GATES.map((gate) => (
              <li
                key={gate.name}
                className="flex items-center justify-between gap-3 rounded-2 border border-hairline px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {gate.name}
                  </p>
                  <p className="truncate text-xs text-ink-3">{gate.detail}</p>
                </div>
                <StatusSeal
                  variant={gate.state === "sealed" ? "success" : "warn"}
                >
                  {gate.state}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Ping the field</PressureButton>
            <PressureButton variant="outline">Log a walkthrough</PressureButton>
            <span className="ml-auto font-mono text-[11px] text-ink-3">
              04 gates · 1 watching
            </span>
          </div>
        </div>
      </ShieldField>
      <p className="font-mono text-[11px] text-ink-3">
        click to ping the field
      </p>
    </div>
  );
}
