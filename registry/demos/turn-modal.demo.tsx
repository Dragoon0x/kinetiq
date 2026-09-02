"use client";

import * as React from "react";

import { TurnModal } from "@/registry/ui/turn-modal";

const SCHEDULE = [
  { slot: "18:00–21:00", vessel: "Kestrel Tide", status: "Departed" },
  { slot: "21:00–06:00", vessel: "Open hold", status: "Reserved" },
  { slot: "06:00–09:00", vessel: "Fair Reach", status: "Booked" },
] as const;

export function TurnModalDemo() {
  const [berthOpen, setBerthOpen] = React.useState(false);

  return (
    <div className="flex w-full flex-wrap items-start justify-center gap-4">
      <TurnModal
        title="Berth 4 · tonight"
        open={berthOpen}
        onOpenChange={setBerthOpen}
        className="w-64"
        front={
          <>
            <span className="font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
              Basinworks · Berth 4
            </span>
            <span className="text-sm font-semibold text-ink">
              Tonight · 21:00
            </span>
            <span className="font-mono text-xs text-ink-3">
              Draft 6.2m · Diesel available
            </span>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-hairline text-ink-3">
                <th className="py-1.5 text-left font-medium">Slot</th>
                <th className="py-1.5 text-left font-medium">Vessel</th>
                <th className="py-1.5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {SCHEDULE.map((row) => (
                <tr
                  key={row.slot}
                  className="border-b border-hairline last:border-b-0"
                >
                  <td className="py-1.5 text-ink">{row.slot}</td>
                  <td className="py-1.5 text-ink-2">{row.vessel}</td>
                  <td
                    className={
                      row.status === "Reserved"
                        ? "py-1.5 text-right text-primary"
                        : "py-1.5 text-right text-ink-3"
                    }
                  >
                    {row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-3">
            Berths are held for twenty minutes past the slot start.
          </p>
          <button
            type="button"
            onClick={() => setBerthOpen(false)}
            className="self-end rounded-2 bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-raised transition-[filter] hover:brightness-110 active:brightness-95"
          >
            Confirm berth
          </button>
        </div>
      </TurnModal>

      <TurnModal
        title="Berth 7 · tomorrow"
        className="w-48"
        front={
          <>
            <span className="font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
              Basinworks · Berth 7
            </span>
            <span className="text-sm font-semibold text-ink">
              Tomorrow · 07:30
            </span>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p>
            Berth 7 sits on the north quay, sheltered from the evening chop.
          </p>
          <p className="font-mono text-xs text-ink-3">
            Draft 4.8m · No fuel on this berth
          </p>
        </div>
      </TurnModal>

      <TurnModal
        title="Fuel dock · open"
        className="w-48"
        front={
          <>
            <span className="font-mono text-[10px] tracking-[0.14em] text-ink-3 uppercase">
              Basinworks · Fuel dock
            </span>
            <span className="text-sm font-semibold text-ink">Open now</span>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p>Diesel and fresh water, self-serve from 05:00 to 23:00.</p>
          <p className="font-mono text-xs text-ink-3">
            Card payment only · no cash on site
          </p>
        </div>
      </TurnModal>
    </div>
  );
}
