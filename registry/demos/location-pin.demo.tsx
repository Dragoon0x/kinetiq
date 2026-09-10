"use client";

import * as React from "react";

import { LocationPin, type LocationPlace } from "@/registry/ui/location-pin";

const PLACES: LocationPlace[] = [
  {
    id: "p1",
    from: "peer",
    name: "Coldbrook depot, gate 4",
    address: "Basin Wharf Road",
    seed: 3311,
    metres: 420,
    time: "08:14",
  },
  {
    id: "p2",
    from: "me",
    name: "Yard office",
    address: "12 Fernwork Lane",
    seed: 6042,
    metres: 1640,
    time: "08:16",
    delivery: "delivered",
  },
];

const ZOOM = 1.9;

const metres = (value: number) =>
  value < 1000
    ? `${value} m`
    : `${(Math.round(value / 100) / 10).toFixed(1)} km`;

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function LocationPinDemo() {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [handed, setHanded] = React.useState<string | null>(null);

  const open = PLACES.find((place) => place.id === openId);
  const nearest = PLACES.reduce(
    (best, place) => (place.metres < best ? place.metres : best),
    Number.POSITIVE_INFINITY,
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <LocationPin
        label="Coldbrook depot places"
        peerName="Rui"
        places={PLACES}
        zoom={ZOOM}
        openId={openId}
        onOpenChange={setOpenId}
        onOpenPlace={setHanded}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={chip}
          disabled={openId === null}
          onClick={() => setOpenId(null)}
        >
          Collapse both
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {open ? (
          <>
            {open.name} ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              expanded
            </span>{" "}
            · {metres(open.metres)} · zoom {ZOOM}×
          </>
        ) : (
          <>
            {PLACES.length} places ·{" "}
            <span className="text-[var(--signal,var(--primary))]">
              collapsed
            </span>{" "}
            · nearest {metres(nearest)}
          </>
        )}
        {handed ? " · handed off" : null}
      </p>
    </div>
  );
}
