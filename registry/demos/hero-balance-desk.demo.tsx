"use client";

import { HeroBalanceDesk } from "@/registry/blocks/hero-balance-desk/hero-balance-desk";

/** The section at its own scale — full width, default narrative. */
export function HeroBalanceDeskDemo() {
  return (
    <div className="w-full">
      <HeroBalanceDesk />
    </div>
  );
}
