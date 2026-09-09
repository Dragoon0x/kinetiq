"use client";

import * as React from "react";

import { RatingPair, type RatingPick } from "@/registry/ui/rating-pair";

const MODEL_A = "Fernworks Model 3";
const MODEL_B = "Gaugeworks Reasoner";

const PAIRS = [
  {
    prompt:
      "A parcel arrived eleven days late. Can the customer still claim a refund?",
    left: "Yes. Waylight refunds shipping on any parcel later than seven days, and the claim window stays open for thirty days after delivery. Open a claim from the order page and it settles in two working days.",
    right:
      "They can. The late-delivery rule refunds the shipping fee when a parcel is more than seven days past its promised date, as long as the claim is raised within thirty days of arrival.",
  },
  {
    prompt: "Which plan should a shop sending forty parcels a month be on?",
    left: "The Fieldline plan. Its rate drops at thirty parcels a month, and at forty the saving covers the plan fee with a margin left over.",
    right:
      "Probably Fieldline, though at forty parcels the saving over the basic plan is small, so it depends on whether they expect to grow.",
  },
  {
    prompt: "Can a label be reprinted after the parcel has been scanned in?",
    left: "No. Once a parcel is scanned in, the label is locked to that scan. A new label needs a new order.",
    right:
      "Not after the first scan. The label is bound to the scan record, so a reprint would create a duplicate; raise a support ticket instead and the depot can re-label it.",
  },
] as const;

export function RatingPairDemo() {
  const [index, setIndex] = React.useState(0);
  const [picks, setPicks] = React.useState<Record<number, RatingPick>>({});

  const pair = PAIRS[index] ?? PAIRS[0];
  const pick = picks[index] ?? null;

  const chosen =
    pick === "tie"
      ? "rated the same"
      : pick === "left"
        ? `preferred ${MODEL_A}`
        : pick === "right"
          ? `preferred ${MODEL_B}`
          : "no pick";

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <RatingPair
        key={index}
        label={`Support answer pair ${index + 1}`}
        prompt={pair.prompt}
        answers={[
          { id: "a", model: MODEL_A, text: pair.left },
          { id: "b", model: MODEL_B, text: pair.right },
        ]}
        value={pick}
        onValueChange={(next) =>
          setPicks((prev) => ({ ...prev, [index]: next }))
        }
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIndex((prev) => (prev + 1) % PAIRS.length)}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Next pair
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Pair {index + 1} of {PAIRS.length} ·{" "}
        <span className="text-[var(--signal,var(--primary))]">{chosen}</span>
      </p>
    </div>
  );
}
