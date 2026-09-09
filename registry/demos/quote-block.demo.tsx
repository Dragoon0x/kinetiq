"use client";

import * as React from "react";

import { QuoteBlock, type QuoteMessage } from "@/registry/ui/quote-block";

const THREAD: QuoteMessage[] = [
  {
    id: "m1",
    from: "Marta",
    time: "07:12",
    text: "Gate B is clear from eight. Two pallets go on the Basinworks run, the loose crate never got a label, and Waylight Pay wants the whole lot signed for by ten.",
  },
  {
    id: "m2",
    from: "Rui",
    time: "07:20",
    text: "Docket says 41 kilos, written on the back page.",
  },
  {
    id: "m3",
    from: "Ines",
    time: "07:26",
    text: "Then it rides on the second pallet, not the first.",
    quote: { sourceId: "m1", text: "the loose crate never got a label" },
  },
  {
    id: "m4",
    from: "me",
    time: "07:31",
    text: "I will write the label at the gate and take the signature there.",
    quote: { sourceId: "m2", text: "41 kilos, written on the back page" },
  },
];

const control =
  "border-hairline-strong flex h-8 items-center rounded-2 border px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2";

export function QuoteBlockDemo() {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [showing, setShowing] = React.useState<string | null>(null);

  const source = THREAD.find((message) => message.id === showing);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <QuoteBlock
        label="Coldbrook depot, gate B"
        messages={THREAD}
        expandedId={expandedId}
        onExpandedChange={setExpandedId}
        onShowSource={setShowing}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={control}
          onClick={() => setExpandedId(expandedId === "m3" ? null : "m3")}
        >
          {expandedId === "m3" ? "Fold Ines's quote" : "Unfold Ines's quote"}
        </button>
        <button
          type="button"
          className={control}
          onClick={() => {
            setExpandedId(null);
            setShowing(null);
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {expandedId === null ? "quote folded" : "quote open"}
        {" · "}
        {source ? (
          <span className="text-signal">{`showing ${source.from} ${source.time ?? ""}`}</span>
        ) : (
          "no jump yet"
        )}
      </p>
    </div>
  );
}
