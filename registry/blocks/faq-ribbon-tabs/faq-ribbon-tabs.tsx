"use client";

import * as React from "react";

import {
  DrawerAccordion,
  DrawerAccordionContent,
  DrawerAccordionItem,
  DrawerAccordionTrigger,
} from "@/registry/ui/drawer-accordion";
import {
  GantryTabs,
  GantryTabsContent,
  GantryTabsList,
  GantryTabsTrigger,
} from "@/registry/ui/gantry-tabs";
import { cn } from "@/registry/lib/utils";

export type RibbonEntry = { id: string; question: string; answer: string };
export type RibbonGroup = { value: string; label: string; entries: RibbonEntry[] };

export type FaqRibbonTabsProps = {
  eyebrow?: string;
  headline?: string;
  groups?: RibbonGroup[];
  className?: string;
};

const DEFAULT_GROUPS: RibbonGroup[] = [
  {
    value: "getting-in",
    label: "Getting in",
    entries: [
      {
        id: "g1",
        question: "How long does a rollout actually take?",
        answer:
          "A single yard: an afternoon. A region: about two weeks, most of it agreeing on slot names — the software part is the afternoon.",
      },
      {
        id: "g2",
        question: "Can we import the spreadsheet era?",
        answer:
          "Yes. Imports land as first-class rows with their dates intact, marked imported so nobody mistakes them for born-digital records.",
      },
    ],
  },
  {
    value: "day-to-day",
    label: "Day to day",
    entries: [
      {
        id: "d1",
        question: "What happens when the network drops at the gate?",
        answer:
          "The board keeps working from the morning's plan and queues changes locally. Reconnection replays them in order and flags any that now conflict.",
      },
      {
        id: "d2",
        question: "Can two yards share a crane?",
        answer:
          "Shared assets live on both boards with one truth between them — booking it on one yard shows the hold on the other before anyone double-commits.",
      },
    ],
  },
  {
    value: "the-record",
    label: "The record",
    entries: [
      {
        id: "r1",
        question: "Who can edit history?",
        answer:
          "Nobody. Corrections are new rows that point at the old ones — the record grows, it never rewrites.",
      },
      {
        id: "r2",
        question: "What leaves with us if we go?",
        answer:
          "Everything, in plain files with lineage attached. Leaving is a supported workflow, not a negotiation.",
      },
    ],
  },
];

/**
 * A FAQ on a ribbon: topic tabs ride the gantry — its indicator gliding
 * between groups — and each panel is a drawer accordion. Two instruments,
 * one seam: the tabs answer which conversation you are in; the drawers
 * answer the question. For question sets too wide for one column and too
 * shallow for a sidebar registry.
 */
export function FaqRibbonTabs({
  eyebrow = "Waylight · questions",
  headline = "Pick the conversation.",
  groups = DEFAULT_GROUPS,
  className,
}: FaqRibbonTabsProps) {
  const headingId = React.useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
        </div>

        <div className="mt-10">
          <GantryTabs defaultValue={groups[0]?.value} variant="underline">
            <GantryTabsList className="justify-center">
              {groups.map((group) => (
                <GantryTabsTrigger key={group.value} value={group.value}>
                  {group.label}
                </GantryTabsTrigger>
              ))}
            </GantryTabsList>
            {groups.map((group) => (
              <GantryTabsContent
                key={group.value}
                value={group.value}
                className="pt-6"
              >
                <DrawerAccordion>
                  {group.entries.map((entry) => (
                    <DrawerAccordionItem key={entry.id} value={entry.id}>
                      <DrawerAccordionTrigger>
                        {entry.question}
                      </DrawerAccordionTrigger>
                      <DrawerAccordionContent className="text-ink-2">
                        {entry.answer}
                      </DrawerAccordionContent>
                    </DrawerAccordionItem>
                  ))}
                </DrawerAccordion>
              </GantryTabsContent>
            ))}
          </GantryTabs>
        </div>
      </div>
    </section>
  );
}
