"use client";

import * as React from "react";

import {
  MerchantCluster,
  type MerchantSpend,
  type MerchantTx,
} from "@/registry/ui/merchant-cluster";

/** Amounts are held in cents so a month's total cannot drift the way floats do. */
const tx = (day: number, label: string, cents: number): MerchantTx => ({
  id: `${day}-${label}`,
  day: `${day} Nov`,
  label,
  amount: cents / 100,
});

const sum = (rows: MerchantTx[]) =>
  rows.reduce((all, row) => all + row.amount, 0);

const of = (id: string, name: string, rows: MerchantTx[]): MerchantSpend => ({
  id,
  name,
  amount: sum(rows),
  transactions: rows,
});

const MERCHANTS: MerchantSpend[] = [
  of("ferngate", "Ferngate Market", [
    tx(4, "Weekly shop", 8620),
    tx(11, "Weekly shop", 9240),
    tx(18, "Weekly shop", 7415),
    tx(25, "Weekly shop", 10965),
  ]),
  of("marrow", "Marrow & Vine", [
    tx(7, "Dinner, two", 5800),
    tx(15, "Table of six", 9650),
    tx(22, "Lunch", 6130),
  ]),
  of("basin", "Basin Transit", [
    tx(2, "Monthly pass", 6400),
    tx(12, "Late fare", 640),
    tx(23, "Airport line", 4600),
  ]),
  of("tallow", "Tallow Hardware", [
    tx(6, "Shelving", 12890),
    tx(19, "Paint, two litres", 4235),
  ]),
  of("lantern", "Lantern Books", [
    tx(8, "Two paperbacks", 2400),
    tx(21, "Atlas", 3850),
  ]),
  of("halyard", "Halyard Coffee", [
    tx(3, "Beans, 500g", 1260),
    tx(9, "Flat white", 540),
    tx(16, "Beans, 500g", 1120),
    tx(24, "Cortado", 480),
  ]),
];

const TOTAL = MERCHANTS.reduce((all, merchant) => all + merchant.amount, 0);

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function MerchantClusterDemo() {
  const [openId, setOpenId] = React.useState<string | null>(null);

  const open = MERCHANTS.find((merchant) => merchant.id === openId) ?? null;
  const share = open ? Math.round((open.amount / TOTAL) * 100) : 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MerchantCluster
        label="Waylight Pay · card spend, November"
        merchants={MERCHANTS}
        format={(value) => money.format(value)}
        value={openId}
        onValueChange={setOpenId}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Nov spend{" "}
        <span className="text-signal tabular-nums">{money.format(TOTAL)}</span>{" "}
        · <span className="tabular-nums">{MERCHANTS.length}</span> merchants ·
        reading{" "}
        {open ? (
          <span className="tabular-nums">
            {open.name} {share}%
          </span>
        ) : (
          <span>&mdash;</span>
        )}
      </p>
    </div>
  );
}
