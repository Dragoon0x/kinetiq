"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultProduct,
  ProductDetail,
  type ProductSelection,
} from "@/registry/ui/product-detail";

export const tweaks = defineTweaks({
  lens: {
    kind: "range",
    label: "Lens",
    default: 2.5,
    min: 1.5,
    max: 4,
    step: 0.5,
    unit: "×",
  },
  variants: {
    kind: "choice",
    label: "Variants",
    default: "swatches",
    options: ["swatches", "tiles", "chips"],
    names: { swatches: "Swatches", tiles: "Tiles", chips: "Chips" },
  },
  sticky: { kind: "toggle", label: "Sticky", default: true },
});

const START: ProductSelection = { colour: "ember", size: "12oz" };

const nameOf = (s: ProductSelection) => {
  const c = defaultProduct.colours.find((x) => x.id === s.colour);
  const z = defaultProduct.sizes.find((x) => x.id === s.size);
  return `${c?.name ?? s.colour} · ${z?.label ?? s.size}`.toLowerCase();
};

/**
 * The Field Mug on the Fernworks Studio Pottery shop: pick a glaze and a
 * size, look at the speckle, put it in the bag. Adding answers after 450 ms.
 */
export function ProductDetailDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [sel, setSel] = React.useState<ProductSelection>(START);
  const [bag, setBag] = React.useState<Record<string, number>>({});
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const key = `${sel.colour}:${sel.size}`;
  const total = Object.values(bag).reduce((a, b) => a + b, 0);

  const detail = (
    <ProductDetail
      key={round}
      value={sel}
      onValueChange={(next) => {
        setSel(next);
        setNote(null);
      }}
      quantity={bag[key] ?? 0}
      onQuantityChange={(q, s) => {
        setBag((b) => ({ ...b, [`${s.colour}:${s.size}`]: q }));
        setNote(null);
      }}
      onAdd={() =>
        new Promise<void>((resolve) => window.setTimeout(resolve, 450))
      }
      onNotify={(s) => setNote(`notify me · ${nameOf(s)}`)}
      onEstimate={(postcode, est) =>
        setNote(
          est
            ? `delivery to ${postcode.toLowerCase()} · ${est.label.toLowerCase()}`
            : `no delivery to ${postcode.toLowerCase()}`,
        )
      }
      sound={sound}
      className={chrome ? "max-h-[560px]" : "max-h-[588px]"}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{detail}</div>;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {detail}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : total > 0 ? (
            <>
              <span className="text-signal">in bag</span> · {total} × field mug
              · {nameOf(sel)}
            </>
          ) : (
            <>
              <span className="text-signal">{nameOf(sel)}</span> · look closer,
              then add it
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setSel(START);
            setBag({});
            setNote(null);
            setRound((r) => r + 1);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
