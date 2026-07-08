"use client";

import { MapPin } from "lucide-react";

import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHandle,
  BottomSheetTitle,
  BottomSheetTrigger,
} from "@/registry/ui/bottom-sheet";

const RESULTS = [
  { name: "North annex bench", distance: "120 m", status: "FREE" },
  { name: "Optics rig B", distance: "240 m", status: "FREE" },
  { name: "Vibration table", distance: "310 m", status: "BUSY" },
  { name: "Clean cell 2", distance: "460 m", status: "FREE" },
  { name: "Materials bay", distance: "610 m", status: "BUSY" },
] as const;

export function BottomSheetDemo() {
  return (
    <div className="border-border bg-background bg-grid relative h-[420px] w-full max-w-md overflow-hidden rounded-3 border">
      {/* map-ish surface */}
      <div className="text-muted-foreground flex items-center gap-1.5 p-4 font-mono text-[11px] tracking-wide uppercase">
        <MapPin aria-hidden className="size-3.5" />
        Sector map · K2
      </div>

      <BottomSheet portal={false} defaultOpen snapPoints={[0.4, 0.88]}>
        <BottomSheetTrigger className="border-input bg-card hover:bg-accent absolute top-3 right-3 rounded-2 border px-2.5 py-1.5 text-xs font-medium transition-colors">
          Nearby benches
        </BottomSheetTrigger>
        <BottomSheetContent>
          <BottomSheetHandle />
          <BottomSheetTitle>Nearby benches</BottomSheetTitle>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Drag · fling · arrow keys on the handle
          </p>
          <ul className="mt-3 space-y-1 overflow-y-auto">
            {RESULTS.map((result) => (
              <li
                key={result.name}
                className="border-border flex items-baseline justify-between border-b py-2 last:border-0"
              >
                <span className="text-sm font-medium">{result.name}</span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {result.distance} ·{" "}
                  <span
                    className={
                      result.status === "FREE"
                        ? "text-[var(--success,var(--primary))]"
                        : ""
                    }
                  >
                    {result.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </BottomSheetContent>
      </BottomSheet>
    </div>
  );
}
