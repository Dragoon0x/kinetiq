"use client";

import * as React from "react";

import { PullShelf, type ShelfBook } from "@/registry/ui/pull-shelf";

type PageColumn = {
  heading: string;
  lines: [string, string];
};

/** One opened spread: two short mono columns, one per page. */
function SpreadPages({ left, right }: { left: PageColumn; right: PageColumn }) {
  return (
    <div className="grid grid-cols-2 gap-x-7">
      <SpreadColumn column={left} />
      <SpreadColumn column={right} />
    </div>
  );
}

function SpreadColumn({ column }: { column: PageColumn }) {
  return (
    <div className="min-w-0">
      <h4 className="font-mono text-[10px] tracking-[0.14em] text-ink">
        {column.heading}
      </h4>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-ink-3">
        {column.lines[0]}
      </p>
      <p className="mt-1 font-mono text-[10px] leading-relaxed text-ink-3">
        {column.lines[1]}
      </p>
    </div>
  );
}

/** The bench library — fixed rank, deterministic spines, invented field copy. */
const BOOKS: ShelfBook[] = [
  {
    id: "spring-tables",
    title: "SPRING TABLES",
    spread: (
      <SpreadPages
        left={{
          heading: "RATE CARD",
          lines: ["Five springs, one voice.", "Snap lands by 300 ms."],
        }}
        right={{
          heading: "DAMPING",
          lines: ["Zeta at one settles clean.", "Under one it overshoots."],
        }}
      />
    ),
  },
  {
    id: "lens-atlas",
    title: "LENS ATLAS",
    spread: (
      <SpreadPages
        left={{
          heading: "OPTICS",
          lines: ["Nine lenses, one bench.", "Each plate maps a focal run."],
        }}
        right={{
          heading: "COATINGS",
          lines: ["Blue cast marks new stock.", "Amber cast marks spares."],
        }}
      />
    ),
  },
  {
    id: "rail-survey",
    title: "RAIL SURVEY",
    spread: (
      <SpreadPages
        left={{
          heading: "GAUGE",
          lines: ["Forty detents per meter.", "Zero sits at the south stop."],
        }}
        right={{
          heading: "WEAR",
          lines: ["Grease weekly, shim yearly.", "Log every skipped detent."],
        }}
      />
    ),
  },
  {
    id: "seal-ledger",
    title: "SEAL LEDGER",
    spread: (
      <SpreadPages
        left={{
          heading: "STAMPS",
          lines: ["Twelve seals cleared today.", "Two wait at the press."],
        }}
        right={{
          heading: "INKS",
          lines: ["Iron black for records.", "Signal red for recalls."],
        }}
      />
    ),
  },
  {
    id: "mast-notes",
    title: "MAST NOTES",
    spread: (
      <SpreadPages
        left={{
          heading: "RIGGING",
          lines: ["Three stays hold the crown.", "Tension reads forty even."],
        }}
        right={{
          heading: "WATCH",
          lines: ["Check the vane at dawn.", "Log drift past two degrees."],
        }}
      />
    ),
  },
  {
    id: "dial-charts",
    title: "DIAL CHARTS",
    spread: (
      <SpreadPages
        left={{
          heading: "SWEEP",
          lines: ["Needles rest at nine.", "Full sweep spans 270."],
        }}
        right={{
          heading: "MARKS",
          lines: ["Major ticks every thirty.", "Hairline minors between."],
        }}
      />
    ),
  },
];

export function PullShelfDemo() {
  const [readingId, setReadingId] = React.useState<string | null>(null);
  const reading = BOOKS.find((book) => book.id === readingId) ?? null;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <p className="text-label tracking-[0.08em] text-ink-3">
        BENCH LIBRARY{" "}
        <span className="text-ink-2 tabular-nums">
          &middot; {String(BOOKS.length).padStart(2, "0")} spines
        </span>
      </p>

      {/* The bezel plate: shelf above, serial rail below. */}
      <div className="w-full rounded-4 border border-hairline bg-surface-1 p-4 pb-3">
        <PullShelf
          books={BOOKS}
          onOpenChange={setReadingId}
          aria-label="Bench library shelf"
        />
        <div className="mt-3 flex items-center justify-between border-t border-hairline pt-2 font-mono text-[9px] tracking-[0.14em] text-ink-3">
          <span>PULL SHELF</span>
          <span className="tabular-nums">KQ-129</span>
        </div>
      </div>

      <p
        role="status"
        className="w-full border-t border-border pt-3 text-center text-label text-ink-3"
      >
        {reading !== null ? (
          <>
            READING &middot;{" "}
            <span style={{ color: "var(--accent-bright)" }}>
              {reading.title}
            </span>
          </>
        ) : (
          "SHELVED"
        )}
      </p>

      <p className="text-center text-label text-ink-3">
        Pull a spine - it tips, flies forward, and opens.
      </p>
    </div>
  );
}
