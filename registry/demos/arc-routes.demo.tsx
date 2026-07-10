"use client";

import * as React from "react";

import { ArcRoutes, type Route, type RoutePin } from "@/registry/ui/arc-routes";

// Six ports spread across a flat mercator-ish panel, normalized 0..1. Fixed
// so the map renders identically on every visit.
const PINS: RoutePin[] = [
  { id: "sfo", label: "SFO", x: 0.1, y: 0.42 },
  { id: "hkx", label: "HKX", x: 0.86, y: 0.3 },
  { id: "lnd", label: "LND", x: 0.46, y: 0.14 },
  { id: "syd", label: "SYD", x: 0.82, y: 0.86 },
  { id: "dxb", label: "DXB", x: 0.58, y: 0.5 },
  { id: "gru", label: "GRU", x: 0.28, y: 0.82 },
];

// Five hops of varying span — short regional legs and long transcontinental
// ones — so the lift proportional to distance reads clearly.
const ROUTES: Route[] = [
  { id: "r1", from: "sfo", to: "hkx", label: "SFO-HKX" },
  { id: "r2", from: "lnd", to: "dxb", label: "LND-DXB" },
  { id: "r3", from: "hkx", to: "syd", label: "HKX-SYD" },
  { id: "r4", from: "gru", to: "lnd", label: "GRU-LND" },
  { id: "r5", from: "dxb", to: "syd", label: "DXB-SYD" },
];

export function ArcRoutesDemo() {
  const [routeId, setRouteId] = React.useState<string | null>(null);
  const route = ROUTES.find((r) => r.id === routeId) ?? null;

  return (
    <div className="w-full max-w-lg">
      <div className="border-hairline bg-surface-1 relative rounded-4 border p-4">
        <span
          aria-hidden
          className="border-hairline absolute top-2 left-2 size-2 border-t border-l"
        />
        <span
          aria-hidden
          className="border-hairline absolute top-2 right-2 size-2 border-t border-r"
        />
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-label text-ink-3">FLIGHT MAP &middot; 05 ROUTES</p>
          <p className="text-label text-ink-3">KQ-143</p>
        </div>

        <ArcRoutes
          pins={PINS}
          routes={ROUTES}
          height={280}
          aria-label="Flight route map across six ports"
          onRide={setRouteId}
        />

        <p
          role="status"
          className="border-hairline text-label text-ink-3 mt-3 border-t pt-3"
        >
          RIDING &middot;{" "}
          <span className="text-cobalt-bright">
            {route ? route.label : "NONE"}
          </span>
        </p>
        <p className="text-ink-3 mt-2 text-center text-xs">
          Hover a route to ride the arc between its ports.
        </p>
      </div>
    </div>
  );
}
