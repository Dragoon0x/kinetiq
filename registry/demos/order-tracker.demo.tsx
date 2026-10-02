"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultOrderScans,
  defaultOrderStages,
  defaultOrderTrackerNow,
  defaultOrderWindows,
  OrderTracker,
  type OrderScan,
  type OrderWindow,
} from "@/registry/ui/order-tracker";

export const tweaks = defineTweaks({
  path: {
    kind: "choice",
    label: "Path",
    default: "road",
    options: ["rail", "road", "arc"],
    names: { rail: "Rail", road: "Road", arc: "Arc" },
  },
  eta: {
    kind: "choice",
    label: "ETA",
    default: "window",
    options: ["window", "countdown", "day"],
    names: { window: "Window", countdown: "Countdown", day: "Day" },
  },
  map: {
    kind: "choice",
    label: "Map",
    default: "streets",
    options: ["streets", "dots", "none"],
    names: { streets: "Streets", dots: "Dots", none: "None" },
  },
});

/** Four minutes of the afternoon pass every three seconds. */
const TICK_MS = 3000;
const TICK = 4 * 60_000;
/** The van reaches the door 22 minutes into the window. */
const AFTER_OPEN = 22 * 60_000;

const FIRST: OrderWindow = defaultOrderWindows[0] ?? {
  start: defaultOrderTrackerNow + 95 * 60_000,
  end: defaultOrderTrackerNow + 185 * 60_000,
};

const clock = (ms: number) => {
  const d = new Date(ms);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

/**
 * Fernworks Home order FW-20417 — a pour-over set, a kettle and filters —
 * out for delivery with Fieldline Freight to 14 Larch Row, Coldbrook. The
 * afternoon runs on (paused while the tab is hidden) until the van arrives.
 */
export function OrderTrackerDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [now, setNow] = React.useState(defaultOrderTrackerNow);
  const [delivery, setDelivery] = React.useState<OrderWindow>(FIRST);
  const [viewing, setViewing] = React.useState<string | null>(null);

  const deliveredAt = delivery.start + AFTER_OPEN;
  const delivered = now >= deliveredAt;

  const stages = React.useMemo(
    () =>
      defaultOrderStages.map((s) =>
        s.id === "delivered"
          ? {
              ...s,
              at: delivered
                ? deliveredAt
                : Math.round((delivery.start + delivery.end) / 2),
              reached: delivered,
            }
          : s,
      ),
    [delivered, deliveredAt, delivery],
  );
  const scans = React.useMemo<OrderScan[]>(
    () =>
      delivered
        ? [
            ...defaultOrderScans,
            {
              id: "s9",
              at: deliveredAt,
              text: "Delivered, left at the front door",
              stage: "delivered",
              place: "14 Larch Row",
            },
          ]
        : defaultOrderScans,
    [delivered, deliveredAt],
  );

  // The clock stops at the door, and while nobody can see it.
  React.useEffect(() => {
    if (delivered) return;
    let id = 0;
    const start = () => {
      if (id) return;
      id = window.setInterval(() => setNow((t) => t + TICK), TICK_MS);
    };
    const stop = () => {
      window.clearInterval(id);
      id = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [delivered]);

  const tracker = (
    <OrderTracker
      now={now}
      stages={stages}
      scans={scans}
      delivery={delivery}
      onDeliveryChange={setDelivery}
      onScanSelect={setViewing}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{tracker}</div>;

  const later = defaultOrderWindows.find((w) => w.start > delivery.start);
  const seen = scans.find((s) => s.id === viewing);
  const button =
    "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {tracker}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          onClick={() => {
            setNow(defaultOrderTrackerNow);
            setDelivery(FIRST);
            setViewing(null);
          }}
        >
          Replay
        </button>
        <button
          type="button"
          className={button}
          disabled={delivered || !later}
          onClick={() => {
            if (later) setDelivery(later);
          }}
        >
          Run late
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {seen ? (
          <>
            <span className="text-signal">viewing {clock(seen.at)}</span> ·{" "}
            {seen.text}
          </>
        ) : delivered ? (
          <>
            <span className="text-signal">delivered {clock(deliveredAt)}</span>{" "}
            · left at the front door
          </>
        ) : (
          <>
            <span className="text-signal">out for delivery</span> · window{" "}
            {clock(delivery.start)}–{clock(delivery.end)}
          </>
        )}
      </p>
    </div>
  );
}
