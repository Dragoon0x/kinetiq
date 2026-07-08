"use client";

import { CheckoutReceipt } from "@/registry/blocks/checkout-receipt/checkout-receipt";

export function CheckoutReceiptDemo() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4">
      <CheckoutReceipt />
      <p className="text-muted-foreground text-center font-mono text-[10px] tracking-[0.14em] uppercase">
        Hold the button — the receipt prints itself.
      </p>
    </div>
  );
}
