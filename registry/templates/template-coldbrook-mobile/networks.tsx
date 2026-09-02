"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { IntegrationsOrbitHub } from "@/registry/blocks/integrations-orbit-hub/integrations-orbit-hub";
import { LogoSegmentShelf } from "@/registry/blocks/logo-segment-shelf/logo-segment-shelf";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type ColdbrookNetworksProps = {
  brand?: string;
  className?: string;
};

/**
 * The four networks Coldbrook moves units across, picked apart one at a
 * time rather than logoed in a row. A short standfirst sets up the idea of
 * one balance over four rails, the orbit hub lets a visitor select a
 * network to see what the wallet can do there and how long it takes to
 * settle, and the shelf beneath it shows what already runs on each one.
 */
export function ColdbrookNetworks({
  brand = "Coldbrook",
  className,
}: ColdbrookNetworksProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavGlassRail
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
        links={[
          { label: "Home", href: "/" },
          { label: "Networks", href: "/networks" },
          { label: "Security", href: "/security" },
          { label: "Download", href: "/download" },
        ]}
        activeHref="/networks"
        cta="Get the app"
      />
      <main>
        <section className="mx-auto w-full max-w-3xl px-6 pt-20 pb-4 sm:pt-24">
          <p className="text-label text-ink-3">{brand} · networks</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Four networks. One balance, one app.
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-ink-2">
            {brand} does not make you pick a network before you can spend. Pick
            a person or a merchant instead, and the wallet works out which
            network gets the units there fastest and cheapest.
          </p>
        </section>

        <IntegrationsOrbitHub
          eyebrow={`${brand} · networks`}
          headline="Pick a network. See exactly what it settles."
          deck="Every node here is a real network the wallet can reach, not a logo. Select one to see what the wallet can do on it and how long a send takes to settle."
          apps={[
            {
              id: "tideway",
              label: "Tideway",
              direction: "both",
              cadence: "~40 seconds",
              note: "The everyday network — sends and receives clear fast enough to pay while someone waits at the counter.",
            },
            {
              id: "northwater",
              label: "Northwater",
              direction: "both",
              cadence: "~2 minutes",
              note: "Built for larger transfers. Slower by design, so a bigger send gets a second confirmation window before it is final.",
            },
            {
              id: "saltmarsh",
              label: "Saltmarsh",
              direction: "write",
              cadence: "batched every 5 minutes",
              note: "The low-fee lane. Sends queue and clear in a batch rather than instantly, which is what keeps the fee near zero.",
            },
            {
              id: "reedline",
              label: "Reedline",
              direction: "read",
              cadence: "refreshes every 90 seconds",
              note: `Where ${brand} watches balances held on outside wallets you have linked — read-only until you choose to move them in.`,
            },
          ]}
        />

        <LogoSegmentShelf
          unitLabel="vaults"
          eyebrow={`${brand} · coverage`}
          headline="Every network carries its own tab already."
          copy="These are the merchants and services people actually pay on each network today, not a wishlist of who might show up."
          segments={[
            {
              id: "tideway",
              name: "Tideway",
              count: 86,
              marks: ["QUAYPAY", "FLOWDESK", "DOCKMARKET", "SETTLR"],
            },
            {
              id: "northwater",
              name: "Northwater",
              count: 54,
              marks: ["NORTH VAULT", "LONGREACH", "STONEBRIDGE"],
            },
            {
              id: "saltmarsh",
              name: "Saltmarsh",
              count: 120,
              marks: ["PENNYLANE", "TALLYBOARD", "QUICKTAB"],
            },
            {
              id: "reedline",
              name: "Reedline",
              count: 19,
              marks: ["LINKWATCH", "CROSSVIEW"],
            },
          ]}
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        links={[
          { label: "Home", href: "/" },
          { label: "Security", href: "/security" },
          { label: "Download", href: "/download" },
          { label: "Contact", href: "#contact" },
        ]}
        signoff="Built by people who hold their own units in it every day."
        fineprint={`© 2026 ${brand} Custody`}
      />
    </div>
  );
}
