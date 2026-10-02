"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  BundleBuilder,
  bundleTotals,
  defaultBundleProducts,
} from "@/registry/ui/bundle-builder";

export const tweaks = defineTweaks({
  slots: {
    kind: "range",
    label: "Slots",
    default: 3,
    min: 2,
    max: 5,
    step: 1,
  },
  fly: {
    kind: "choice",
    label: "Fly",
    default: "arc",
    options: ["arc", "direct", "drop"],
    names: { arc: "Arc", direct: "Direct", drop: "Drop" },
  },
  savings: {
    kind: "choice",
    label: "Savings",
    default: "flat",
    options: ["flat", "tiered", "free"],
    names: { flat: "Flat 15%", tiered: "Tiered", free: "Cheapest free" },
  },
});

const dollars = (n: number) => `$${n.toFixed(2)}`;

/**
 * Fernworks Roasters' tasting box: eight single origins, pick three and save
 * 15%. Adding the box to the cart takes a moment.
 */
export function BundleBuilderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [ids, setIds] = React.useState<string[]>([]);
  const [added, setAdded] = React.useState(0);

  const builder = (
    <BundleBuilder
      value={ids}
      onValueChange={setIds}
      onSubmit={() =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setAdded((n) => n + 1);
            resolve();
          }, 900);
        })
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{builder}</div>;

  const slots = values.slots ?? 3;
  const t = bundleTotals(defaultBundleProducts, ids, {
    slots,
    savings: values.savings,
  });
  const lastName = defaultBundleProducts
    .find((p) => p.id === ids[ids.length - 1])
    ?.name.toLowerCase();

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {builder}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={ids.length === 0}
          onClick={() => setIds([])}
          className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors outline-none hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {ids.length === 0 ? (
          <>
            <span className="text-signal">box empty</span> · pick {slots}
            {added ? ` · ${added} in the cart` : ""}
          </>
        ) : t.full ? (
          <>
            <span className="text-signal">box full</span> · you save{" "}
            {dollars(t.discount)} · total {dollars(t.total)}
          </>
        ) : (
          <>
            <span className="text-signal">
              box {ids.length} of {slots}
            </span>{" "}
            · {lastName} · total {dollars(t.total)}
          </>
        )}
      </p>
    </div>
  );
}
