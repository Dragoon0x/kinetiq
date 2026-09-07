"use client";

import * as React from "react";

import { UptimeStrip, type UptimeDay } from "@/registry/ui/uptime-strip";

const DAYS = 90;
const DAY_MS = 86_400_000;
/** A fixed anchor: the history has to hydrate identically to the server's. */
const ANCHOR = Date.UTC(2026, 5, 30);
const MINUTES_IN_WINDOW = DAYS * 24 * 60;

const dayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** A 32-bit LCG — seeded, so every render draws the same ninety days. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const NOTES = [
  "Elevated read latency",
  "Region failover",
  "Ingest queue backlog",
  "Certificate rotation",
];

type Service = { label: string; days: UptimeDay[]; uptime: number };

function buildService(label: string, seed: number): Service {
  const next = seeded(seed);
  let lostMinutes = 0;

  const days = Array.from({ length: DAYS }, (_, index): UptimeDay => {
    const roll = next();
    const size = next();
    const date = dayLabel.format(
      new Date(ANCHOR - (DAYS - 1 - index) * DAY_MS),
    );
    if (roll > 0.985) {
      const minutes = Math.round(24 + size * 190);
      lostMinutes += minutes;
      return {
        date,
        status: "down",
        note: `${NOTES[index % NOTES.length]}, ${minutes} min down`,
      };
    }
    if (roll > 0.945) {
      const minutes = Math.round(12 + size * 90);
      lostMinutes += minutes / 2;
      return {
        date,
        status: "degraded",
        note: `${NOTES[index % NOTES.length]}, ${minutes} min`,
      };
    }
    return { date, status: "up" };
  });

  return {
    label,
    days,
    uptime: 100 * (1 - lostMinutes / MINUTES_IN_WINDOW),
  };
}

const SERVICES = [
  buildService("Gaugeworks API", 20260630),
  buildService("Gaugeworks Webhooks", 8814523),
  buildService("Gaugeworks Dashboard", 4471209),
];

export function UptimeStripDemo() {
  const [reading, setReading] = React.useState<string | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      {SERVICES.map((service) => (
        <UptimeStrip
          key={service.label}
          label={service.label}
          days={service.days}
          uptime={service.uptime}
          onReadChange={(day) =>
            setReading(
              day ? `${service.label} · ${day.date} · ${day.status}` : null,
            )
          }
        />
      ))}

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {reading ?? "Hover or focus a strip to read a day"}
      </p>
    </div>
  );
}
