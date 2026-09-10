"use client";

import * as React from "react";

import {
  LatencyHist,
  type BucketReading,
  type LatencyBucket,
  type Percentile,
  type PercentileMarks,
} from "@/registry/ui/latency-hist";

/** Bucket floors in ms; the last bucket runs open-ended. */
const EDGES = [
  0, 10, 20, 30, 40, 55, 70, 90, 110, 140, 180, 230, 300, 400, 520, 700,
] as const;

/** Coldbrook / ledger-api, three seeded windows — no clock is ever read. */
const WINDOWS = [
  {
    id: "15m",
    chip: "15 min",
    label: "last 15 min",
    counts: [
      12, 148, 612, 980, 742, 604, 428, 268, 186, 96, 52, 28, 14, 6, 3, 1,
    ],
  },
  {
    id: "1h",
    chip: "1 hour",
    label: "last hour",
    counts: [
      40, 520, 2310, 3980, 3120, 2460, 1620, 980, 640, 380, 210, 120, 62, 30,
      14, 6,
    ],
  },
  {
    id: "24h",
    chip: "24 hours",
    label: "last 24 hours",
    counts: [
      180, 1450, 6200, 9800, 8600, 7400, 6100, 4800, 3900, 2800, 1900, 1250,
      820, 460, 240, 130,
    ],
  },
] as const;

const build = (counts: readonly number[]): LatencyBucket[] =>
  counts.map((count, index) => {
    const from = EDGES[index] ?? 0;
    const to = EDGES[index + 1];
    return to === undefined ? { from, count } : { from, to, count };
  });

const requests = (count: number) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? "request" : "requests"}`;

const chip =
  "flex h-8 min-w-0 flex-1 items-center justify-center rounded-2 border border-hairline-strong px-2 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function LatencyHistDemo() {
  const [windowId, setWindowId] = React.useState<string>("15m");
  const [pinned, setPinned] = React.useState<Percentile | null>(null);
  const [marks, setMarks] = React.useState<PercentileMarks | null>(null);
  const [bucket, setBucket] = React.useState<BucketReading | null>(null);

  const active = WINDOWS.find((entry) => entry.id === windowId) ?? WINDOWS[0];
  const buckets = React.useMemo(() => build(active.counts), [active.counts]);
  const total = active.counts.reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LatencyHist
        label="ledger-api"
        windowLabel={active.label}
        buckets={buckets}
        pinned={pinned}
        onPinnedChange={setPinned}
        onPercentilesChange={setMarks}
        onBucketChange={setBucket}
      />

      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === windowId}
            onClick={() => setWindowId(entry.id)}
            className={
              entry.id === windowId
                ? `${chip} bg-accent text-ink`
                : `${chip} text-ink`
            }
          >
            {entry.chip}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {bucket
            ? `${bucket.from}${bucket.to === null ? "+" : `–${bucket.to}`} ms`
            : `p95 ${marks?.p95 ?? 0} ms`}
        </span>
        {bucket
          ? ` · ${requests(bucket.count)}`
          : ` · ${active.chip} · ${requests(total)}`}
        {pinned ? ` · pinned ${pinned}` : ""}
      </p>
    </div>
  );
}
