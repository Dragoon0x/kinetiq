"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CabinetMenu, type CabinetDrawer } from "@/registry/ui/cabinet-menu";

export const tweaks = defineTweaks({
  depth: {
    kind: "range",
    label: "Depth",
    default: 3,
    min: 2,
    max: 3,
    step: 1,
  },
  runners: {
    kind: "range",
    label: "Runners",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  finish: {
    kind: "choice",
    label: "Finish",
    default: "steel",
    options: ["steel", "oak", "mint"],
    names: { steel: "Steel", oak: "Oak", mint: "Mint" },
  },
});

const RECORDS: CabinetDrawer[] = [
  {
    id: "accounts",
    label: "Accounts",
    folders: [
      {
        id: "current",
        label: "Current",
        items: [
          { id: "harbour-cafe", label: "Harbour Café", meta: "0142" },
          { id: "mill-lane", label: "Mill Lane Bakery", meta: "0187" },
          { id: "basin-joinery", label: "Basin Joinery", meta: "0203" },
        ],
      },
      {
        id: "savings",
        label: "Savings",
        items: [
          { id: "easy-access", label: "Easy access", meta: "3.1%" },
          { id: "fixed-12", label: "Fixed, 12 months", meta: "4.2%" },
        ],
      },
      {
        id: "closed",
        label: "Closed",
        items: [
          { id: "closed-2025", label: "Closed in 2025", meta: "38" },
          { id: "closed-2024", label: "Closed in 2024", meta: "51" },
        ],
      },
    ],
  },
  {
    id: "loans",
    label: "Loans",
    folders: [
      {
        id: "harbour-st",
        label: "Harbour St",
        items: [
          { id: "valuation", label: "Valuation", meta: "Mar 04" },
          { id: "offer", label: "Offer letter", meta: "Mar 19" },
          { id: "deeds", label: "Deeds", meta: "Apr 02" },
        ],
      },
      {
        id: "quarry-row",
        label: "Quarry Row",
        items: [
          { id: "survey", label: "Survey", meta: "Jan 22" },
          { id: "insurance", label: "Buildings cover", meta: "Feb 01" },
        ],
      },
      {
        id: "fernhill",
        label: "Fernhill Rd",
        items: [
          { id: "application", label: "Application", meta: "May 11" },
          { id: "id-check", label: "ID check", meta: "May 12" },
        ],
      },
      {
        id: "business",
        label: "Business",
        items: [
          { id: "ovens", label: "Bakery ovens", meta: "£18k" },
          { id: "van", label: "Delivery van", meta: "£24k" },
        ],
      },
    ],
  },
  {
    id: "statements",
    label: "Statements",
    folders: [
      {
        id: "y2026",
        label: "2026",
        items: [
          { id: "q1-2026", label: "First quarter", meta: "Q1" },
          { id: "q2-2026", label: "Second quarter", meta: "Q2" },
          { id: "q3-2026", label: "Third quarter", meta: "Q3" },
        ],
      },
      {
        id: "y2025",
        label: "2025",
        items: [
          { id: "q3-2025", label: "Third quarter", meta: "Q3" },
          { id: "q4-2025", label: "Fourth quarter", meta: "Q4" },
        ],
      },
      {
        id: "tax",
        label: "Tax letters",
        items: [{ id: "interest-2025", label: "Interest, 2025", meta: "PDF" }],
      },
    ],
  },
  {
    id: "cards",
    label: "Cards",
    folders: [
      {
        id: "debit",
        label: "Debit",
        items: [
          { id: "renewals", label: "Renewals due", meta: "12" },
          { id: "pins", label: "PIN letters", meta: "4" },
        ],
      },
      {
        id: "credit",
        label: "Credit",
        items: [
          { id: "limits", label: "Limit reviews", meta: "7" },
          { id: "disputes", label: "Disputes", meta: "2" },
        ],
      },
      {
        id: "stopped",
        label: "Stopped cards",
        items: [{ id: "lost", label: "Reported lost", meta: "3" }],
      },
    ],
  },
];

/**
 * The records room at Coldbrook Bank: four drawers of folders, and a sheet
 * to find in one of them.
 */
export function CabinetMenuDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [chosen, setChosen] = React.useState<string[] | null>(null);
  const [out, setOut] = React.useState<string | null>(null);
  const drawer = RECORDS.find((d) => d.id === out);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <CabinetMenu
        label="Coldbrook Bank records"
        drawers={RECORDS}
        onValueChange={(_, path) => setChosen(path)}
        onOpenChange={setOut}
        sound={sound}
        className="self-center"
        {...values}
      />
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {drawer ? (
            <>
              <span className="text-signal">{drawer.label} drawer out</span> ·{" "}
              {drawer.folders.length} folders
            </>
          ) : chosen ? (
            <span className="text-signal">{chosen.join(" › ")}</span>
          ) : (
            <>
              <span className="text-signal">{RECORDS.length} drawers</span> ·
              pull one
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
