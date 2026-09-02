"use client";

import * as React from "react";

import { FileCheck2, KeyRound, ServerCog } from "lucide-react";

import { NavGlassRail } from "@/registry/blocks/nav-glass-rail/nav-glass-rail";
import { HeroBalanceDesk } from "@/registry/blocks/hero-balance-desk/hero-balance-desk";
import { LogoSegmentShelf } from "@/registry/blocks/logo-segment-shelf/logo-segment-shelf";
import { FeaturesProofStrip } from "@/registry/blocks/features-proof-strip/features-proof-strip";
import { TrustVaultBrief } from "@/registry/blocks/trust-vault-brief/trust-vault-brief";
import { PricingWhereItGoes } from "@/registry/blocks/pricing-where-it-goes/pricing-where-it-goes";
import { ProofLiveFloor } from "@/registry/blocks/proof-live-floor/proof-live-floor";
import { FaqLastWord } from "@/registry/blocks/faq-last-word/faq-last-word";
import { CtaLedgerClose } from "@/registry/blocks/cta-ledger-close/cta-ledger-close";
import { FooterDriftMark } from "@/registry/blocks/footer-drift-mark/footer-drift-mark";
import { cn } from "@/registry/lib/utils";

export type TemplateColdbrookProps = {
  /**
   * One product name for the whole page. Nav, hero, and footer all read
   * from it — a template whose logo and copy disagree is not one site.
   */
  brand?: string;
  className?: string;
};

/**
 * The argument for holding your own keys, built as one page: a hero where a
 * real balance card settles a real transfer while the reader watches, the
 * networks a vault can reach, three claims proven by working controls, the
 * custody safeguards stated in full, where the price actually goes, a live
 * floor of vaults settling right now, and the five questions a buyer of
 * self-custody actually asks. The hero is not a screenshot of a wallet — the
 * settlement row still pending when the page loads finishes settling in
 * front of the reader, so the pitch for holding your own keys arrives as a
 * fact instead of a claim. Ten shipped sections and no page-local markup;
 * replace the narrative rather than the layout. Reduced motion is left to
 * each section, which already carries its own fallback.
 */
export function TemplateColdbrook({
  brand = "Coldbrook",
  className,
}: TemplateColdbrookProps) {
  return (
    <div className={cn("bg-surface-0", className)}>
      <NavGlassRail
        brand={
          <span className="text-lg font-semibold tracking-tight">{brand}</span>
        }
        links={[
          { label: "Vaults", href: "#vaults" },
          { label: "Networks", href: "#networks" },
          { label: "Custody", href: "#custody" },
          { label: "Pricing", href: "#pricing" },
        ]}
        cta="Open a vault"
      />
      <main>
        <HeroBalanceDesk
          brand={brand}
          eyebrow={`${brand} · vault`}
          headline={["Own the keys.", "Own the balance."]}
          copy={`${brand} holds nothing on your behalf — every unit settles from keys only you carry, moving across Tideway and Northwater on a ledger you can read as plainly as a desk drawer.`}
          cta="Open a vault"
          secondary="Read the custody note"
        />

        <LogoSegmentShelf
          unitLabel="vaults"
          eyebrow={`${brand} · the networks`}
          headline="Four networks, four hundred and eleven vaults."
          copy="The named ones agreed to be named. The counts are everyone, including the vaults that would rather not appear on a marketing page."
          segments={[
            {
              id: "n1",
              name: "Tideway",
              count: 118,
              marks: [
                "GRANITE ROW",
                "FARSIGHT CUSTODY",
                "PALE CEDAR",
                "NORTH REACH",
              ],
            },
            {
              id: "n2",
              name: "Northwater",
              count: 96,
              marks: ["QUIET HARBOR", "STONEWELL", "DRIFTWOOD SIGNERS"],
            },
            {
              id: "n3",
              name: "Saltmarsh",
              count: 142,
              marks: [
                "HOLDFAST",
                "ANCHORPOINT",
                "SLATE AND VINE",
                "LOW WATER TRUST",
              ],
            },
            {
              id: "n4",
              name: "Farline",
              count: 55,
              marks: ["COLD REACH", "BASALT KEY"],
            },
          ]}
        />

        <FeaturesProofStrip
          eyebrow={`${brand} · felt, not claimed`}
          headline="Three claims, proven at the desk."
          copy="Below are the real controls, wired the way they ship in a vault: a guard you can flip, a settlement count that rolls, and a presence pip that only breathes when the network actually does."
        />

        <TrustVaultBrief
          eyebrow={`${brand} · custody`}
          headline="Custody stated plainly, then checked."
          copy="Custody is a set of checkable claims. Here are ours, with who verifies them and how often."
          marks={[
            { id: "soc2", label: "SOC 2 Type II", state: "audited annually" },
            { id: "iso", label: "ISO 27001", state: "certified" },
            {
              id: "insured",
              label: "Custody insurance",
              state: "coverage published",
            },
            { id: "pentest", label: "Pen test", state: "twice yearly" },
          ]}
          safeguards={[
            {
              id: "keys",
              icon: <KeyRound className="size-4" aria-hidden />,
              title: "Keys split, never pooled",
              copy: "The signing key for each vault is sharded across independent devices — no single machine, in our custody or yours, holds enough to move a unit alone.",
            },
            {
              id: "cold",
              icon: <ServerCog className="size-4" aria-hidden />,
              title: "Cold by default",
              copy: "Signing hardware sits offline until a request needs it, then returns to that state — nothing waits online for a raid that never comes.",
            },
            {
              id: "paper",
              icon: <FileCheck2 className="size-4" aria-hidden />,
              title: "Every signature, a paper trail",
              copy: "Support can see that a vault moved, never the keys that moved it, and every look is logged where the vault owner can see it.",
            },
          ]}
        />

        <PricingWhereItGoes
          eyebrow={`${brand} · the arithmetic`}
          headline="Where the fee actually goes."
          copy="We would rather show the split than defend the number. These are rounded, and they move by a point or two each quarter."
          price={12}
          currency=""
          period="units / vault / month"
          slices={[
            {
              id: "c1",
              label: "Custody insurance",
              share: 34,
              detail:
                "Coverage on every vault, underwritten and renewed the same day it lapses, never after.",
            },
            {
              id: "c2",
              label: "Signing infrastructure",
              share: 29,
              detail:
                "The hardware that holds a shard of your key offline, replicated across sites so no single room can lose it.",
            },
            {
              id: "c3",
              label: "People who answer",
              share: 22,
              detail:
                "Support who can read a stuck settlement and explain it in one message, on shift around the clock for every network.",
            },
            {
              id: "c4",
              label: "The rest",
              share: 15,
              detail:
                "Servers, audits, and the second region that exists purely so an outage is boring.",
            },
          ]}
          footnote="Rounded to whole points, so the column may read a point off the price. Updated each quarter from the same ledger our auditors use."
        />

        <ProofLiveFloor
          eyebrow={`${brand} · the floor, now`}
          headline="Right now, a vault is settling."
          copy="Every line below is a real shape of event from a live vault. Names never appear — the argument is the volume and the ordinariness of it."
          events={[
            {
              id: "e1",
              line: "A vault cleared its morning sweep before the desk opened",
              place: "Tideway",
            },
            {
              id: "e2",
              line: "A signing request cleared without a phone call",
              place: "Northwater",
            },
            {
              id: "e3",
              line: "A guard hold propagated to every linked vault",
              place: "Saltmarsh",
            },
            {
              id: "e4",
              line: "A settlement closed itself into the ledger",
              place: "Farline",
            },
            {
              id: "e5",
              line: "An owner overrode the guard and said why",
              place: "Tideway",
            },
            {
              id: "e6",
              line: "A new vault signed its first settlement",
              place: "Northwater",
            },
            {
              id: "e7",
              line: "An audit was answered from exports alone",
              place: "Saltmarsh",
            },
            {
              id: "e8",
              line: "A handover note was signed at the desk",
              place: "Farline",
            },
          ]}
          counts={[
            { id: "c1", label: "vaults on the record", value: 411 },
            { id: "c2", label: "settlements this week", value: 2860 },
            { id: "c3", label: "signings live right now", value: 24 },
          ]}
        />

        <FaqLastWord
          eyebrow={`${brand} · plainly`}
          headline="The last five questions, answered whole."
          copy="No drawers, no search. These are the ones people actually ask before they move a balance."
          entries={[
            {
              id: "q1",
              question: "What are you actually selling?",
              answer: `A way to hold the keys yourself without holding all the risk alone. ${brand} is the software; the custody is still entirely yours.`,
            },
            {
              id: "q2",
              question: "What happens if I lose my device?",
              answer:
                "Nothing moves without the shard on it, and a lost device is a replacement, not a loss — your key is split across enough places that one going dark does not strand the rest.",
            },
            {
              id: "q3",
              question: `Can ${brand} move my balance without me?`,
              answer:
                "No. Every signature needs your own key, present and asked. We can freeze a vault you report stolen; we cannot spend from one.",
            },
            {
              id: "q4",
              question: "What breaks if I stop paying?",
              answer:
                "Nothing retroactively. Your vault stays readable and exportable, and the free tier keeps one vault open. Leaving is a workflow, not a hostage exchange.",
            },
            {
              id: "q5",
              question: `What is ${brand} bad at?`,
              answer: `Speed for its own sake. ${brand} adds a deliberate pause to anything that moves a balance, and that is the wrong tool for someone chasing a fast trade.`,
            },
          ]}
        />

        <CtaLedgerClose
          headline={["The ledger is already", "settling without the argument."]}
          copy="Every count on this line settled today. Tomorrow has room on it too."
          counts={[
            { value: 411, label: "vaults settling today" },
            { value: 2860, suffix: "+", label: "settlements this week" },
            { value: 6, suffix: "s", label: "average time to sign" },
          ]}
          primaryCta="Open a vault"
          secondaryCta="Talk to custody support"
        />
      </main>
      <FooterDriftMark
        mark={brand.toUpperCase()}
        headline="Keep the keys. Keep the balance."
        cta="Open a vault"
        fineprint={`© 2026 ${brand}`}
      />
    </div>
  );
}
