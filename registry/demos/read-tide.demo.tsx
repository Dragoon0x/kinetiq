"use client";

import { PressureButton } from "@/registry/ui/pressure-button";
import { ReadTide } from "@/registry/ui/read-tide";
import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";

const ROWS = [
  { batch: "F-114", variety: "Maidenhair", potted: "Feb 03", status: "rooted" },
  {
    batch: "F-115",
    variety: "Boston fern",
    potted: "Feb 05",
    status: "rooted",
  },
  { batch: "F-118", variety: "Staghorn", potted: "Feb 09", status: "holding" },
  { batch: "F-119", variety: "Birds nest", potted: "Feb 11", status: "rooted" },
  {
    batch: "F-121",
    variety: "Kangaroo paw fern",
    potted: "Feb 14",
    status: "pending",
  },
  {
    batch: "F-122",
    variety: "Rabbits foot",
    potted: "Feb 15",
    status: "rooted",
  },
  {
    batch: "F-124",
    variety: "Asparagus fern",
    potted: "Feb 18",
    status: "holding",
  },
  { batch: "F-126", variety: "Tree fern", potted: "Feb 21", status: "pending" },
] as const;

/** A propagation log, tall enough for the reading line to cross real rows as
 * the page scrolls. The wash above the line marks what has been checked;
 * below it sits untouched, same as an unread batch. */
export function ReadTideDemo() {
  return (
    <div className="flex w-full flex-col items-center gap-4">
      <ReadTide className="w-full max-w-2xl rounded-4 border border-hairline bg-surface-1">
        <div className="flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <p className="text-label text-ink-3">Fernworks · propagation log</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              Eight weeks of cuttings, one long scroll to check on them.
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              Every batch below started as a cutting off the mother plants in
              the west house. Scroll down and the wash keeps pace with you —
              everything already passed carries a faint tint, and the line
              marking today&apos;s read sits right where your eye does.
            </p>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-2">
              The list runs oldest first, so the earliest rooted stock is the
              first thing the wash covers; the newest arrivals sit near the
              bottom, blank page until the scroll finally reaches them.
            </p>
          </div>
          <ul className="flex flex-col text-sm">
            {ROWS.map((row, index) => (
              <li
                key={row.batch}
                className={
                  index < ROWS.length - 1
                    ? "flex items-center justify-between gap-3 border-b border-hairline py-2.5"
                    : "flex items-center justify-between gap-3 py-2.5"
                }
              >
                <span className="w-14 shrink-0 font-mono text-xs text-ink-3">
                  {row.batch}
                </span>
                <span className="flex-1 font-medium text-ink">
                  {row.variety}
                </span>
                <span className="font-mono text-xs text-ink-2">
                  {row.potted}
                </span>
                <StatusSeal
                  variant={
                    row.status === "rooted"
                      ? "success"
                      : row.status === "holding"
                        ? "warn"
                        : "info"
                  }
                >
                  {row.status}
                </StatusSeal>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-hairline pt-4">
            <span className="text-sm text-ink-2">Rooted this week</span>
            <Readout value={34} size="md" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PressureButton variant="solid">Log a new batch</PressureButton>
            <PressureButton variant="outline">
              Flag for repotting
            </PressureButton>
          </div>
        </div>
      </ReadTide>
      <p className="font-mono text-[11px] text-ink-3">
        as far as you have read
      </p>
    </div>
  );
}
