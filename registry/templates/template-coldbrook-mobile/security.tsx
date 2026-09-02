"use client";

import * as React from "react";

import { Fingerprint, FileCheck2, KeyRound } from "lucide-react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { TrustVaultBrief } from "@/registry/blocks/trust-vault-brief/trust-vault-brief";
import { TrustDataResidency } from "@/registry/blocks/trust-data-residency/trust-data-residency";
import { FaqLastWord } from "@/registry/blocks/faq-last-word/faq-last-word";
import { FooterQuietClose } from "@/registry/blocks/footer-quiet-close/footer-quiet-close";
import { cn } from "@/registry/lib/utils";

export type ColdbrookSecurityProps = {
  brand?: string;
  className?: string;
};

/**
 * Custody, explained before anyone has to ask. A standfirst sets the
 * question, the vault brief states the safeguards that keep a key on the
 * phone and nowhere else, the residency table says exactly what the wallet
 * stores and who can see it, and the FAQ closes on the one question most
 * security pages avoid — what this cannot protect against.
 */
export function ColdbrookSecurity({
  brand = "Coldbrook",
  className,
}: ColdbrookSecurityProps) {
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
        activeHref="/security"
        cta="Get the app"
      />
      <main>
        <section className="mx-auto w-full max-w-3xl px-6 pt-20 pb-4 sm:pt-24">
          <p className="text-label text-ink-3">{brand} · security</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Custody, explained before you need it.
          </h1>
          <p className="mt-4 max-w-xl leading-relaxed text-ink-2">
            Self-custody is a claim you can check, not a promise you take on
            faith. Here is what {brand} actually holds, what it never can, and
            where every row of your data sits.
          </p>
        </section>

        <TrustVaultBrief
          eyebrow={`${brand} · custody`}
          headline="Custody, stated plainly, in writing."
          copy="Security here is a set of checkable claims about a key that never leaves your device. These are ours, with who verifies them and how often."
          marks={[
            { id: "pentest", label: "Pen test", state: "twice yearly" },
            { id: "bounty", label: "Bug bounty", state: "ongoing" },
            {
              id: "audit",
              label: "Signing audit",
              state: "third-party, yearly",
            },
            {
              id: "opensource",
              label: "Client source",
              state: "publicly auditable",
            },
          ]}
          safeguards={[
            {
              id: "device-keys",
              icon: <KeyRound className="size-4" aria-hidden />,
              title: "Keys generated and held on-device",
              copy: "A signing key is created inside the secure storage on your phone and never transmitted anywhere, including to us, in any form.",
            },
            {
              id: "phrase",
              icon: <FileCheck2 className="size-4" aria-hidden />,
              title: "A recovery phrase you write down once",
              copy: "Shown a single time at setup, stored nowhere by us. It is the only backup for your keys, and it stays entirely yours to keep.",
            },
            {
              id: "lock",
              icon: <Fingerprint className="size-4" aria-hidden />,
              title: "A passcode or biometric lock, every open",
              copy: "Every app open and every send asks for your face, your fingerprint, or your passcode again — no session stays open behind you.",
            },
          ]}
        />

        <TrustDataResidency
          eyebrow={`${brand} · where it sits`}
          headline={`What ${brand} stores, and who can see it.`}
          copy="One row per thing we hold. Your keys are not on this list, because they are not on our servers to list."
          rows={[
            {
              id: "r1",
              kind: "Recovery phrase and private keys",
              where: "On your device only",
              kept: "Until you reset or reinstall",
              seenBy: "Nobody",
            },
            {
              id: "r2",
              kind: "Address book and labels",
              where: "Dublin (eu-west)",
              kept: "12 months after last use",
              seenBy: "Nobody",
            },
            {
              id: "r3",
              kind: "Support attachments",
              where: "Dublin (eu-west)",
              kept: "90 days",
              seenBy: "Support, on your ticket",
            },
            {
              id: "r4",
              kind: "Billing records",
              where: "Dublin (eu-west)",
              kept: "7 years, by law",
              seenBy: "Payment processor",
            },
            {
              id: "r5",
              kind: "Crash and error traces",
              where: "Dublin (eu-west)",
              kept: "30 days",
              seenBy: "On-call engineer",
            },
          ]}
          subprocessors={[
            {
              id: "s1",
              name: "Push notifications",
              purpose: "Send and receive alerts",
              region: "EU",
            },
            {
              id: "s2",
              name: "Crash reporting",
              purpose: "Stability monitoring",
              region: "EU",
            },
            {
              id: "s3",
              name: "Payment processor",
              purpose: "Store billing only",
              region: "EU / US",
            },
            {
              id: "s4",
              name: "Price feed provider",
              purpose: "Exchange-rate display",
              region: "EU",
            },
          ]}
          subprocessorTitle="Everyone we hand data to"
          noticeLine="Thirty days of notice before anything joins this list, by email, whether or not it affects you."
        />

        <FaqLastWord
          eyebrow={`${brand} · custody questions`}
          headline="The four questions people ask before they move funds."
          copy="No drawers, no search. These are the ones people actually ask before they trust a wallet with real units."
          entries={[
            {
              id: "q1",
              question: "What happens if I lose my phone?",
              answer:
                "Your recovery phrase restores the wallet on a new device. Without that phrase, nobody, including us, can move the units back — that trade is the whole point of self-custody.",
            },
            {
              id: "q2",
              question: `Can ${brand} freeze or reverse a send?`,
              answer:
                "No. We never hold the key that would let us. Once a send is signed on your device and confirmed on the network, it is final, the same as it would be with any wallet you controlled alone.",
            },
            {
              id: "q3",
              question: `What happens if ${brand} shuts down?`,
              answer:
                "Your units stay exactly where the network already put them. The app disappears; the phrase in your handwriting still opens any compatible wallet, that day or years later.",
            },
            {
              id: "q4",
              question: "What is this bad at?",
              answer:
                "Recovering funds if you lose your phone and your recovery phrase together. Self-custody means the responsibility is yours, and we cannot undo that trade even when we would like to help.",
            },
          ]}
        />
      </main>
      <FooterQuietClose
        brand={<span className="font-semibold tracking-tight">{brand}</span>}
        links={[
          { label: "Home", href: "/" },
          { label: "Networks", href: "/networks" },
          { label: "Download", href: "/download" },
          { label: "Contact", href: "#contact" },
        ]}
        signoff="Built by people who hold their own units in it every day."
        fineprint={`© 2026 ${brand} Custody`}
      />
    </div>
  );
}
