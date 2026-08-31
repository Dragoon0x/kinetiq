"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { AnnounceShipNote } from "@/registry/blocks/announce-ship-note/announce-ship-note";
import { NewsletterLedgerNote } from "@/registry/blocks/newsletter-ledger-note/newsletter-ledger-note";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type CausewayChangelogProps = {
  brand?: string;
  className?: string;
};

/**
 * The record of change, one route deep: a short page header, then the last
 * three ship notes stacked newest first, each in the same voice as the
 * features — because a changelog written differently from the marketing is
 * an admission. Dates are pre-formatted strings; the page never reads a
 * clock.
 */
export function CausewayChangelog({
  brand = "Basinworks",
  className,
}: CausewayChangelogProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavGlassRail
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
        links={[
          { label: "Product", href: "/" },
          { label: "Changelog", href: "/changelog" },
          { label: "Pricing", href: "/pricing" },
        ]}
        activeHref="/changelog"
        cta="Open the ledger"
      />
      <main>
        <header className="mx-auto w-full max-w-3xl px-6 pt-20 pb-4 sm:pt-24">
          <p className="text-label text-ink-3">{brand} · the record</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            What changed, in the same voice we sell in.
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-ink-2">
            Every release, fixes included. If a week moved nothing worth
            printing, the week is not here.
          </p>
        </header>

        <AnnounceShipNote
          version="r3.2"
          date="12 April"
          headline="The tide table learned to argue back."
          lines={[
            {
              id: "l1",
              kind: "added",
              text: "Berth holds now show the reasoning that placed them, inline.",
            },
            {
              id: "l2",
              kind: "fixed",
              text: "Linesmen acknowledgements no longer double-count on reconnect.",
            },
            {
              id: "l3",
              kind: "changed",
              text: "The ledger export carries the tide snapshot it was cut against.",
            },
          ]}
          linkLabel="Read the full note"
          href="#r3-2"
        />
        <AnnounceShipNote
          version="r3.1"
          date="29 March"
          headline="Quieter mornings for the gate crew."
          lines={[
            {
              id: "l1",
              kind: "added",
              text: "A gate view that strips the board to the next two hours.",
            },
            {
              id: "l2",
              kind: "fixed",
              text: "Crane windows crossing midnight no longer split in two.",
            },
            {
              id: "l3",
              kind: "changed",
              text: "Overrides ask for a reason in one line, not a form.",
            },
          ]}
          linkLabel="Read the full note"
          href="#r3-1"
        />
        <AnnounceShipNote
          version="r3.0"
          date="14 March"
          headline="The ledger went multi-harbour."
          lines={[
            {
              id: "l1",
              kind: "added",
              text: "Shared gear modelled once, boards cut for every basin.",
            },
            {
              id: "l2",
              kind: "changed",
              text: "One record under every site; audits answer from exports alone.",
            },
            {
              id: "l3",
              kind: "fixed",
              text: "Rounding on berth lengths — centimetres, not feet, everywhere.",
            },
          ]}
          linkLabel="Read the full note"
          href="#r3-0"
        />

        <NewsletterLedgerNote
          headline="The harbour notes, monthly."
          copy="One email when the record above grows. No launches, no lifestyle."
          readers={1240}
          readersLabel="skippers and harbourmasters"
          cta="Add me to the list"
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        links={[
          { label: "Product", href: "/" },
          { label: "Pricing", href: "/pricing" },
          { label: "Contact", href: "#contact" },
        ]}
        fineprint={`© 2026 ${brand} Harbour Systems`}
      />
    </div>
  );
}
