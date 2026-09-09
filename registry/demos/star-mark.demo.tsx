"use client";

import * as React from "react";

import { StarMark, type StarMessage } from "@/registry/ui/star-mark";

const THREAD: StarMessage[] = [
  {
    id: "paperwork",
    author: "Rui Baptista",
    text: "Basinworks want the yard paperwork signed before the pallets move.",
    time: "14:46",
  },
  {
    id: "reference",
    author: "Ines Moreau",
    text: "Waylight Pay reference for the fee is 4471-CB — put it on the sheet.",
    time: "15:02",
  },
  {
    id: "cover",
    author: "Marta Ferreira",
    text: "I can cover Friday's run if dock three is free before ten.",
    time: "15:11",
  },
];

export function StarMarkDemo() {
  const [saved, setSaved] = React.useState<string[]>(["paperwork"]);

  const last = THREAD.find((message) => message.id === saved[0]);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <StarMark
        label="Coldbrook handover"
        savedLabel="Saved"
        messages={THREAD}
        value={saved}
        onValueChange={setSaved}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saved.includes("cover")}
          onClick={() => setSaved((prev) => ["cover", ...prev])}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Save Marta&apos;s line
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {saved.length === 0 ? "nothing saved" : `${saved.length} saved`}
        </span>
        {last ? ` · last ${last.author.split(" ")[0]} ${last.time}` : ""}
      </p>
    </div>
  );
}
