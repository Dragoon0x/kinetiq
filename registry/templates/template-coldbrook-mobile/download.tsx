"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { HeroHandsetStage } from "@/registry/blocks/hero-handset-stage/hero-handset-stage";
import { CtaSplitDoors } from "@/registry/blocks/cta-split-doors/cta-split-doors";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type ColdbrookDownloadProps = {
  brand?: string;
  className?: string;
};

/**
 * The last route of the four, and the one built to close: a handset stage
 * pitched at someone who has already decided, with the store row doing the
 * remaining work, followed by the same two honest doors as the front page —
 * self-serve or guided — for whoever still wants a hand.
 */
export function ColdbrookDownload({
  brand = "Coldbrook",
  className,
}: ColdbrookDownloadProps) {
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
        activeHref="/download"
        cta="Get the app"
      />
      <main>
        <HeroHandsetStage
          eyebrow={`${brand} · get the app`}
          headline={[`${brand},`, "on your phone tonight."]}
          copy="One download, one recovery phrase written down once, and your units move under your own keys from the first tap — no exchange account, no waitlist."
          cta="Get the app"
          secondary="See what is inside"
          appName={brand}
          cards={[
            {
              id: "setup",
              title: "Set up",
              line: "Face or passcode, then a phrase",
              stat: "2 min",
            },
            {
              id: "create",
              title: "Create or import",
              line: "New wallet, or bring your own phrase",
              stat: "your call",
            },
            {
              id: "first-send",
              title: "First send",
              line: "5.00 units to try it · Tideway",
              stat: "~40s",
            },
          ]}
          proofs={[
            { value: 4.9, label: "store rating", decimals: 1 },
            { value: 100, label: "keys held by you", suffix: "%" },
          ]}
        />

        <CtaSplitDoors
          headline="Two ways to hold your first units."
          doors={[
            {
              id: "self",
              kicker: "SELF-SERVE",
              title: "Install and set up",
              copy: "Two minutes from the store to a funded wallet. Create a new one or bring a phrase you already hold.",
              cta: "Get the app",
              details: [
                "No account, no waitlist",
                "Works with an existing phrase",
                "Nothing to sync elsewhere",
              ],
              primary: true,
            },
            {
              id: "guided",
              kicker: "GUIDED",
              title: "Bring someone along",
              copy: "Fifteen minutes with someone from the team while you set up, so the first real send is not also the first one you are unsure about.",
              cta: "Book a custody walkthrough",
              details: [
                "A person, not a script",
                "Your device, your pace",
                "No follow-up sequence",
              ],
            },
          ]}
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        links={[
          { label: "Home", href: "/" },
          { label: "Networks", href: "/networks" },
          { label: "Security", href: "/security" },
          { label: "Contact", href: "#contact" },
        ]}
        signoff="Built by people who hold their own units in it every day."
        fineprint={`© 2026 ${brand} Custody`}
      />
    </div>
  );
}
