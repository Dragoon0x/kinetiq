"use client";

import * as React from "react";

import { Coverflow } from "@/registry/ui/coverflow";
import { cn } from "@/registry/lib/utils";

/** Fixed record-archive palette — indexed by position, never random. */
const RECORDS = [
  { title: "Ceramic Vane", accent: "oklch(0.84 0.16 162)", hue: 162 },
  { title: "Copper Coil", accent: "oklch(0.78 0.15 52)", hue: 52 },
  { title: "Cobalt Lattice", accent: "oklch(0.72 0.15 258)", hue: 258 },
  { title: "Magenta Rotor", accent: "oklch(0.74 0.19 350)", hue: 350 },
  { title: "Amber Bearing", accent: "oklch(0.83 0.16 86)", hue: 86 },
  { title: "Jade Manifold", accent: "oklch(0.80 0.14 178)", hue: 178 },
] as const;

export function CoverflowDemo() {
  const [active, setActive] = React.useState(0);
  const current = RECORDS[active] ?? RECORDS[0];

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4">
      <p className="self-start text-label text-ink-3">
        Specimen Archive{" "}
        <span className="text-ink-2 tabular-nums">
          &middot; {String(RECORDS.length).padStart(2, "0")} volumes
        </span>
      </p>

      {/* The plate provides the overflow frame; the flow sits centered on it. */}
      <div className="flex h-72 w-full items-center justify-center overflow-hidden rounded-4 border border-hairline bg-surface-1">
        <Coverflow
          aria-label="Specimen archive"
          defaultIndex={0}
          onIndexChange={setActive}
          className="h-full"
        >
          {RECORDS.map((record, i) => (
            <Sleeve key={record.title} record={record} volume={i + 1} />
          ))}
        </Coverflow>
      </div>

      <p
        role="status"
        className="w-full border-t border-border pt-3 text-center text-label text-ink-3"
      >
        Now Facing &middot;{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {current?.title ?? "—"}
        </span>
      </p>
    </div>
  );
}

type Record = (typeof RECORDS)[number];

function Sleeve({ record, volume }: { record: Record; volume: number }) {
  const tag = String(volume).padStart(2, "0");
  return (
    <article
      className={cn(
        "relative flex h-56 w-44 flex-col justify-between overflow-hidden rounded-3 border border-hairline bg-surface-2 p-4 shadow-[var(--shadow-raised)]",
      )}
    >
      {/* Deterministic OKLCH wash + label band, keyed to this volume's hue. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(150deg, oklch(0.32 0.05 ${record.hue}) 0%, oklch(0.20 0.03 ${record.hue}) 55%, oklch(0.16 0.02 ${record.hue}) 100%)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(120% 80% at 80% 8%, ${record.accent}, transparent 62%)`,
        }}
      />

      <div className="relative flex items-start justify-between">
        <span className="text-label text-ink-2 tabular-nums">VOL. {tag}</span>
        <span
          aria-hidden
          className="size-6 rounded-full ring-1 ring-white/15"
          style={{ background: record.accent }}
        />
      </div>

      <div className="relative">
        <div
          aria-hidden
          className="mb-2 h-0.5 w-8 rounded-full"
          style={{ background: record.accent }}
        />
        <h3 className="text-base leading-tight font-medium text-white">
          {record.title}
        </h3>
        <p className="mt-1 font-mono text-[10px] tracking-wide text-ink-3">
          ARCHIVE &middot; {tag}0-K
        </p>
      </div>
    </article>
  );
}
