"use client";

import * as React from "react";

import { SizeTiles, type SizeTile } from "@/registry/ui/size-tiles";

const SIZES: SizeTile[] = [
  {
    value: "xs",
    label: "XS",
    available: true,
    note: "Trim through the chest. Size up over knitwear.",
  },
  { value: "s", label: "S", available: false },
  {
    value: "m",
    label: "M",
    available: true,
    note: "True to size, hits at the hip.",
  },
  { value: "l", label: "L", available: true, note: "Room for a mid-layer." },
  { value: "xl", label: "XL", available: false },
  {
    value: "xxl",
    label: "XXL",
    available: true,
    note: "Long in the body and the sleeve.",
  },
];

export function SizeTilesDemo() {
  const [size, setSize] = React.useState("m");

  const chosen = SIZES.find((entry) => entry.value === size);
  const stock = SIZES.filter((entry) => !entry.available).length;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <SizeTiles
        label="Fernworks field jacket"
        sizes={SIZES}
        value={size}
        onValueChange={setSize}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Size {chosen?.label ?? "—"} · {stock} of {SIZES.length} out of stock
      </p>
    </div>
  );
}
