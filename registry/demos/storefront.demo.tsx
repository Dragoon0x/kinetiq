"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { type CartLine } from "@/registry/ui/cart-drawer";
import { Storefront, type StoreScreen } from "@/registry/ui/storefront";

export const tweaks = defineTweaks({
  rails: {
    kind: "range",
    label: "Rails",
    default: 2,
    min: 1,
    max: 3,
    step: 1,
  },
  hero: {
    kind: "choice",
    label: "Hero",
    default: "banner",
    options: ["banner", "split", "off"],
    names: { banner: "Banner", split: "Split", off: "Off" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
});

const euros = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

const where = (s: StoreScreen) =>
  s === "home"
    ? "home"
    : s === "product"
      ? "field mug"
      : s.slice(s.indexOf(":") + 1).replace(/-/g, " ");

/**
 * Fernworks Supply's home on Friday 2 October: new-season pieces and
 * bestsellers in rails, the Field Mug in the hero, and a bag that settles a
 * checkout after a short wait.
 */
export function StorefrontDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [items, setItems] = React.useState<CartLine[]>([]);
  const [screen, setScreen] = React.useState<StoreScreen>("home");
  const [told, setTold] = React.useState<string | null>(null);

  const store = (
    <Storefront
      sound={sound}
      {...values}
      items={items}
      onItemsChange={setItems}
      screen={screen}
      onScreenChange={(s) => {
        setScreen(s);
        setTold(null);
      }}
      onAdd={(line) =>
        setTold(
          `added ${line.name.toLowerCase()}${line.variant ? ` · ${line.variant.toLowerCase()}` : ""}`,
        )
      }
      onCheckout={() =>
        new Promise<void>((resolve) => {
          window.setTimeout(() => {
            setTold("order placed");
            setItems([]);
            resolve();
          }, 900);
        })
      }
    />
  );

  if (!chrome) return <div className="w-full">{store}</div>;

  const count = items.reduce((n, l) => n + l.quantity, 0);
  const total = items.reduce((n, l) => n + l.price * l.quantity, 0);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {store}
      <p
        role="status"
        className="truncate border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {told ? (
          <>
            <span className="text-signal">{told}</span> · bag {count}{" "}
            {count === 1 ? "item" : "items"} · {euros.format(total)}
          </>
        ) : (
          <>
            <span className="text-signal">{where(screen)}</span> · bag {count}{" "}
            {count === 1 ? "item" : "items"}
            {count ? ` · ${euros.format(total)}` : ""}
          </>
        )}
      </p>
    </div>
  );
}
