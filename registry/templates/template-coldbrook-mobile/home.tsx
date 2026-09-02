"use client";

import * as React from "react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { HeroHandsetStage } from "@/registry/blocks/hero-handset-stage/hero-handset-stage";
import { LogoSegmentShelf } from "@/registry/blocks/logo-segment-shelf/logo-segment-shelf";
import { HowStationLine } from "@/registry/blocks/how-station-line/how-station-line";
import { CtaSplitDoors } from "@/registry/blocks/cta-split-doors/cta-split-doors";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type ColdbrookHomeProps = {
  brand?: string;
  className?: string;
};

/**
 * The front door of the four-route Coldbrook site, and the mobile-first
 * edition of it — built for a phone held in one hand, not a desk browser.
 * A handset stage opens on the three things the wallet actually does —
 * route, sign, settle — then the page moves out through the four networks
 * it settles across, to a download or a guided custody walkthrough. All
 * four routes here — home, networks, security, download — share this one
 * nav, with real hrefs between them.
 */
export function ColdbrookHome({
  brand = "Coldbrook",
  className,
}: ColdbrookHomeProps) {
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
        activeHref="/"
        cta="Get the app"
      />
      <main>
        <HeroHandsetStage
          eyebrow={`${brand} · self-custody wallet`}
          headline={["Your keys,", "already in your pocket."]}
          copy={`${brand} routes, signs, and settles from the phone you already carry. No exchange holds your units between taps — the wallet does, and only you hold the keys.`}
          cta="Get the app"
          secondary="See how it works"
          appName={brand}
          cards={[
            {
              id: "route",
              title: "Route",
              line: "Picks Tideway for speed, Saltmarsh for the fee",
              stat: "auto",
            },
            {
              id: "send",
              title: "Send",
              line: "140.00 units to Nadia · Northwater",
              stat: "sent",
            },
            {
              id: "risk",
              title: "Risk check",
              line: "New address, first transfer flagged",
              stat: "held",
            },
          ]}
          proofs={[
            { value: 4.9, label: "store rating", decimals: 1 },
            { value: 100, label: "keys held by you", suffix: "%" },
          ]}
        />

        <LogoSegmentShelf
          unitLabel="vaults"
          eyebrow={`${brand} · four networks`}
          headline="Four networks, one wallet."
          copy="Move where the units already are. No bridging tab, no separate app for the network that happens to be cheaper today."
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

        <HowStationLine
          eyebrow={`${brand} · how it works`}
          headline="Three steps between a tap and a settled send."
          copy="Walk the line. Every stop shows what the wallet is doing with your send at that moment, not what a server somewhere claims it did."
          stations={[
            {
              id: "route",
              label: "Route",
              title: "Every send picks its own network",
              copy: `${brand} checks the fee and the wait on all four networks and proposes the one that fits — you can always override it.`,
              artifacts: [
                { name: "Tideway lane", state: "picked" },
                { name: "Fee estimate", state: "under 0.01" },
                { name: "Saltmarsh fallback", state: "ready" },
              ],
            },
            {
              id: "sign",
              label: "Sign",
              title: "Nothing moves without your signature",
              copy: `The signature happens on-device, behind your passcode or your face. ${brand} never holds a key that could sign without you.`,
              artifacts: [
                { name: "Passcode check", state: "passed" },
                { name: "Signing request", state: "on-device" },
                { name: "Broadcast", state: "queued" },
              ],
            },
            {
              id: "settle",
              label: "Settle",
              title: "Settlement confirms on the screen in front of you",
              copy: "No email, and no push notice you have to trust blind — the balance updates in the app the moment the network confirms it.",
              artifacts: [
                { name: "Northwater confirm", state: "final" },
                { name: "Balance", state: "updated" },
                { name: "Receipt", state: "filed" },
              ],
            },
          ]}
        />

        <CtaSplitDoors
          headline="Two ways to start. Both real."
          doors={[
            {
              id: "self",
              kicker: "SELF-SERVE",
              title: "Download now",
              copy: "Install, set a passcode, and create or import a wallet. Most people are holding their first units in under five minutes.",
              cta: "Get the app",
              details: [
                "No account, no waitlist",
                "Create or import a phrase",
                "Leave with your keys, always",
              ],
              primary: true,
            },
            {
              id: "guided",
              kicker: "GUIDED",
              title: "Walk through custody first",
              copy: "Fifteen minutes with someone from the team, on a test wallet, before a single real unit moves.",
              cta: "Book a custody walkthrough",
              details: [
                "A person, not a script",
                "Test units, not real ones",
                "No follow-up sequence",
              ],
            },
          ]}
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        links={[
          { label: "Networks", href: "/networks" },
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
