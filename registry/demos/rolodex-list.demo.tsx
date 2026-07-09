"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import { RolodexList, type RolodexItem } from "@/registry/ui/rolodex-list";

/** Fixed operator roster — call-signs, designations, accents indexed, never random. */
const OPERATORS = [
  {
    id: "op-01",
    callSign: "KQ/OP-01",
    designation: "Vesper Kade",
    role: "RIGGER",
    accent: "oklch(0.84 0.16 162)",
  },
  {
    id: "op-02",
    callSign: "KQ/OP-02",
    designation: "Ilo Marek",
    role: "PLOTTER",
    accent: "oklch(0.78 0.15 52)",
  },
  {
    id: "op-03",
    callSign: "KQ/OP-03",
    designation: "Sable Finch",
    role: "COURIER",
    accent: "oklch(0.72 0.15 258)",
  },
  {
    id: "op-04",
    callSign: "KQ/OP-04",
    designation: "Juno Vale",
    role: "CIPHER",
    accent: "oklch(0.74 0.19 350)",
  },
  {
    id: "op-05",
    callSign: "KQ/OP-05",
    designation: "Orrin Slate",
    role: "SURVEYOR",
    accent: "oklch(0.83 0.16 86)",
  },
  {
    id: "op-06",
    callSign: "KQ/OP-06",
    designation: "Mara Quill",
    role: "ARCHIVIST",
    accent: "oklch(0.8 0.14 178)",
  },
  {
    id: "op-07",
    callSign: "KQ/OP-07",
    designation: "Tavi Onde",
    role: "SIGNALER",
    accent: "oklch(0.7 0.14 300)",
  },
  {
    id: "op-08",
    callSign: "KQ/OP-08",
    designation: "Bram Holt",
    role: "WARDEN",
    accent: "oklch(0.68 0.14 30)",
  },
] as const;

type Operator = (typeof OPERATORS)[number];

/** One record face — call-sign, designation, role, indexed accent chip. */
function OperatorRecord({ operator }: { operator: Operator }) {
  return (
    <div className="flex h-full items-center justify-between gap-3 px-4">
      <div className="min-w-0">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 tabular-nums">
          {operator.callSign}
        </p>
        <p className="truncate text-sm font-medium text-ink">
          {operator.designation}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-label text-ink-2">{operator.role}</span>
        <span
          aria-hidden
          className="size-2 rounded-full ring-1 ring-hairline-strong"
          style={{ background: operator.accent }}
        />
      </div>
    </div>
  );
}

const ITEMS: RolodexItem[] = OPERATORS.map((operator) => ({
  id: operator.id,
  label: `${operator.callSign} ${operator.designation}`,
  content: <OperatorRecord operator={operator} />,
}));

/**
 * RolodexList as a bench instrument: the operator index on a vertical record
 * wheel, framed by a bezel plate with corner ticks and the KQ-076 spec header.
 * The status line reads whichever record Enter (or a tap on the front card)
 * pulls from the wheel.
 */
export function RolodexListDemo() {
  const [pulled, setPulled] = React.useState<string | null>(null);

  const handleSelect = (id: string) => {
    const operator = OPERATORS.find((entry) => entry.id === id);
    if (operator) setPulled(operator.callSign);
  };

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
            Operator Index &middot; 8 Records
          </span>
          <span className="text-label text-ink-3 tabular-nums">KQ-076</span>
        </div>

        <RolodexList
          aria-label="Operator index"
          items={ITEMS}
          defaultIndex={0}
          onSelect={handleSelect}
        />

        <p
          role="status"
          className="mt-3 border-t border-hairline pt-3 text-center text-label text-ink-2"
        >
          Selected &middot;{" "}
          <span className="text-signal tabular-nums">{pulled ?? "—"}</span>
        </p>
      </div>

      <p className="text-center text-label text-ink-3">
        Drag, scroll, or arrow through the wheel - Enter pulls a record.
      </p>
    </div>
  );
}
