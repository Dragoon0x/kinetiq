"use client";

import { HowCardDeck } from "@/registry/blocks/how-card-deck/how-card-deck";

/** The section at its own scale — full width, default narrative. */
export function HowCardDeckDemo() {
  return (
    <div className="w-full">
      <HowCardDeck />
    </div>
  );
}
