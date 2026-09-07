"use client";

import * as React from "react";

import { CouponSlot, type CouponResult } from "@/registry/ui/coupon-slot";

const SUBTOTAL = 128;

/** The component prints nothing this does not return. */
const money = (value: number) => value.toFixed(2);

const validate = (code: string): CouponResult | null =>
  code.trim().toUpperCase() === "WAYLIGHT10"
    ? { label: "Ten percent off", amount: Math.round(SUBTOTAL * 10) / 100 }
    : null;

export function CouponSlotDemo() {
  const [discount, setDiscount] = React.useState<CouponResult | null>(null);
  const total = SUBTOTAL - (discount?.amount ?? 0);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            Waylight checkout
          </p>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Try WAYLIGHT10
          </span>
        </div>

        <CouponSlot
          subtotal={SUBTOTAL}
          format={money}
          onApply={validate}
          onDiscountChange={setDiscount}
          label="Coupon code"
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Total <span className="text-signal">{money(total)}</span>
        {discount ? ` · ${discount.label}` : " · no coupon"}
      </p>
    </div>
  );
}
