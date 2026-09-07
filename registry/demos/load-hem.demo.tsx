"use client";

import * as React from "react";

import { LoadHem } from "@/registry/ui/load-hem";

type Listing = { id: string; name: string; area: string; rent: number };

const PLACES = [
  "Basin",
  "Weir",
  "Lock",
  "Quay",
  "Tide",
  "Culvert",
  "Sluice",
  "Draft",
];
const KINDS = ["Yard", "Works", "Berth", "Shed"];
const PER_PAGE = 8;
const LAST_PAGE = 2;

/** Seeded from the row's index, so the server and the client draw one list. */
const pageItems = (page: number): Listing[] =>
  Array.from({ length: PER_PAGE }, (_, index) => {
    const n = page * PER_PAGE + index;
    return {
      id: `basinworks-${n}`,
      name: `${PLACES[n % PLACES.length]} ${KINDS[(n * 3) % KINDS.length]}`,
      area: `${120 + ((n * 37) % 90)} m²`,
      rent: 1800 + ((n * 137) % 900),
    };
  });

export function LoadHemDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const timers = React.useRef<number[]>([]);
  const failedOnce = React.useRef(false);
  const [seen, setSeen] = React.useState({ pages: 1, count: PER_PAGE });

  React.useEffect(
    () => () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    },
    [],
  );

  const loadMore = (page: number) =>
    new Promise<{ items: Listing[]; hasMore: boolean }>((resolve, reject) => {
      timers.current.push(
        window.setTimeout(() => {
          // The second page fails once, so the hem's Retry has something real
          // to recover from.
          if (page === 1 && !failedOnce.current) {
            failedOnce.current = true;
            reject(new Error("Basinworks index unreachable"));
            return;
          }
          setSeen({ pages: page + 1, count: (page + 1) * PER_PAGE });
          resolve({ items: pageItems(page), hasMore: page < LAST_PAGE });
        }, 500),
      );
    });

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div
        ref={frame}
        className="h-[260px] overflow-y-auto rounded-3 border border-border bg-card"
      >
        <LoadHem<Listing>
          initial={pageItems(0)}
          onLoadMore={loadMore}
          container={frame}
          label="Basinworks listings"
          renderItem={(item) => (
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {item.name}
                </span>
                <span className="text-[11px] text-ink-3">{item.area}</span>
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums">
                £{item.rent}
              </span>
            </div>
          )}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Page{" "}
        <span className="text-signal tabular-nums">
          {seen.pages} of {LAST_PAGE + 1}
        </span>{" "}
        · <span className="tabular-nums">{seen.count}</span> listings
      </p>
    </div>
  );
}
