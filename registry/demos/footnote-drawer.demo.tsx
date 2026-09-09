"use client";

import * as React from "react";

import {
  FootnoteDrawer,
  type FootnoteEntry,
} from "@/registry/ui/footnote-drawer";

/** Fernworks Model 3, asked what changed in Coldbrook's savings rates. */
const TEXT =
  "The Easy saver headline rate rose to 3.9% in May, the first change since the range launched.[1] " +
  "Coldbrook's own letter puts most of the quarter's deposit growth on that change.[2]" +
  "\n\n" +
  "Branch staff say new savers now ask for the rate by name, which had not happened before the rise.[3] " +
  "Fixed-term rates were left where they were.[1]";

const NOTES: FootnoteEntry[] = [
  {
    id: "rates",
    text: "Easy saver 3.9% from 12 May; one-year fixed unchanged at 4.1%.",
    source: { label: "Savings rates", domain: "coldbrook.example" },
  },
  {
    id: "letter",
    text: "Deposits up 4.2% on the quarter, led by the Easy saver range after the May repricing.",
    source: {
      label: "Basinworks quarterly letter",
      domain: "basinworks.example",
    },
  },
  {
    id: "survey",
    text: "Eleven of fourteen branches report customers naming the rate at the counter.",
    source: { label: "Branch survey", domain: "fieldline.example" },
  },
];

export function FootnoteDrawerDemo() {
  const [open, setOpen] = React.useState<string | null>(null);

  const index = NOTES.findIndex((note) => note.id === open);
  const note = index >= 0 ? NOTES[index] : undefined;
  const status = note
    ? `Note ${index + 1} · ${note.source.label}`
    : "Drawer lowered";

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <FootnoteDrawer
        label="Savings rate change"
        text={TEXT}
        notes={NOTES}
        value={open}
        onValueChange={setOpen}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
