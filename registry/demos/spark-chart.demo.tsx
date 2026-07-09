"use client";

import { SparkChart } from "@/registry/ui/spark-chart";

// 24 hourly samples of p95 request latency (ms) — a quiet night, a morning
// ramp, a midday spike, then recovery. Hand-tuned, fully deterministic.
const LATENCY = [
  42, 39, 41, 38, 40, 44, 52, 68, 91, 110, 128, 141, 137, 124, 133, 156, 149,
  132, 118, 104, 88, 71, 58, 47,
] as const;

// 24 hourly samples of throughput (req/s) — inverse-ish shape, peaking midday.
const THROUGHPUT = [
  180, 172, 165, 161, 168, 190, 240, 360, 520, 610, 688, 742, 770, 758, 712,
  640, 668, 620, 540, 470, 388, 300, 244, 205,
] as const;

export function SparkChartDemo() {
  return (
    <div className="flex w-full max-w-md flex-col gap-7">
      <figure className="flex flex-col gap-2">
        <figcaption className="text-label text-ink-3">
          p95 latency · 24h
        </figcaption>
        <SparkChart
          data={[...LATENCY]}
          variant="line"
          label="p95 request latency over the last 24 hours"
          format={(y) => `${y} ms`}
        />
        <p className="text-muted-foreground text-xs">
          Hover or arrow-key to scrub.
        </p>
      </figure>

      <figure className="flex flex-col gap-2">
        <figcaption className="text-label text-ink-3">
          throughput · 24h
        </figcaption>
        <SparkChart
          data={[...THROUGHPUT]}
          variant="area"
          label="request throughput over the last 24 hours"
          format={(y) => `${y} req/s`}
        />
        <p className="text-muted-foreground text-xs">
          Hover or arrow-key to scrub.
        </p>
      </figure>
    </div>
  );
}
